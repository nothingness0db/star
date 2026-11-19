/* global SentenceStore, MemeLib */

const MENU_ID = "save-sentence";
const BADGE_MS = 1800;
const ACCENT = "#ff6b35";
const DANGER = "#d64545";

let badgeTimer = null;

function createMenus() {
  browser.menus.removeAll()
    .then(function () {
      return browser.menus.create({
        id: MENU_ID,
        title: "收藏这句 (S)",
        contexts: ["selection"]
      });
    })
    .catch(function (error) {
      console.error("[句子库] 创建右键菜单失败", error);
    });
}

browser.runtime.onInstalled.addListener(function () {
  createMenus();
  scheduleStaleRefresh();
});
browser.runtime.onStartup.addListener(function () {
  createMenus();
  scheduleStaleRefresh();
});

function flashBadge(text, color) {
  if (badgeTimer) {
    clearTimeout(badgeTimer);
    badgeTimer = null;
  }
  browser.action.setBadgeBackgroundColor({ color: color }).catch(function () {});
  browser.action.setBadgeText({ text: text }).catch(function () {});
  if (text) {
    badgeTimer = setTimeout(function () {
      badgeTimer = null;
      browser.action.setBadgeText({ text: "" }).catch(function () {});
    }, BADGE_MS);
  }
}

function broadcast(message) {
  try {
    const pending = browser.runtime.sendMessage(message);
    if (pending && typeof pending.catch === "function") pending.catch(function () {});
  } catch (error) {
    /* 没有打开的扩展页面时忽略 */
  }
}

function memeErrorMessage(error) {
  const message = String((error && error.message) || error || "");
  if (/限流|429|567/.test(message)) return "梗库接口被临时限流，请过几分钟再试";
  if (/HTTP/.test(message)) return message;
  if (/无法解析|格式异常|页数异常/.test(message)) return message;
  return "网络错误，无法下载梗库";
}

// 给尚未匹配梗的收藏补上 meme 字段（幂等，可重复调用）。
async function backfillMemes() {
  try {
    const cache = await MemeLib.getCache();
    if (!cache || !Array.isArray(cache.items) || cache.items.length === 0) return 0;
    const entries = await SentenceStore.getAll();
    const pending = entries.filter(function (entry) {
      return !entry.meme || entry.meme.id === undefined || entry.meme.id === null;
    });
    if (pending.length === 0) return 0;
    const map = new Map();
    for (const entry of pending) {
      const meme = await MemeLib.match(entry.text);
      if (meme) map.set(entry.id, meme);
    }
    return await SentenceStore.setMemes(map);
  } catch (error) {
    console.error("[句子库] 补齐梗信息失败", error);
    return 0;
  }
}

function refreshMemes() {
  const pending = MemeLib.refresh({
    onProgress: function (progress) {
      broadcast({
        type: "meme-refresh-progress",
        phase: progress.phase,
        page: progress.page,
        pages: progress.pages,
        done: progress.done,
        total: progress.total
      });
    }
  });
  pending.then(function (cache) {
    broadcast({ type: "meme-refresh-done", ok: true, count: cache.count, fetchedAt: cache.fetchedAt });
    backfillMemes();
  }).catch(function (error) {
    console.error("[句子库] 更新梗库失败", error);
    broadcast({ type: "meme-refresh-done", ok: false, error: memeErrorMessage(error) });
  });
  return pending;
}

function scheduleStaleRefresh() {
  MemeLib.getCache().then(function (cache) {
    if (cache && cache.items && cache.items.length && MemeLib.isStale(cache)) {
      setTimeout(function () {
        refreshMemes().catch(function () {});
      }, 4000);
    }
  }).catch(function () {});
}

async function resolveMeme(text, memeId) {
  if (memeId !== undefined && memeId !== null && String(memeId).trim() !== "") {
    const item = await MemeLib.findById(memeId);
    if (item) {
      const matchType = MemeLib.normalize(item.text) === MemeLib.normalize(text) ? "exact" : "contains";
      return { id: item.id, text: item.text, tags: item.tags, cnt: item.cnt, matchType: matchType };
    }
    const numeric = Number(memeId);
    if (Number.isFinite(numeric)) {
      return { id: numeric, text: text, tags: "", cnt: 0, matchType: "exact" };
    }
  }
  return MemeLib.match(text);
}

async function saveEntry(input) {
  const text = String((input && input.text) || "").trim();
  if (!text) return { ok: false, error: "没有可保存的文字" };

  const meme = await resolveMeme(text, input.memeId);
  const result = await SentenceStore.addUnique({
    text: text,
    title: String(input.title || "").trim(),
    url: String(input.url || "").trim(),
    source: input.source || "contextmenu",
    meme: meme || undefined
  });

  // 还没有梗库时，顺手在后台拉一份，拉完会自动补齐这条收藏。
  MemeLib.getCache().then(function (cache) {
    if (!cache || !cache.items || cache.items.length === 0 || MemeLib.isStale(cache)) {
      refreshMemes().catch(function () {});
    }
  }).catch(function () {});

  return {
    ok: true,
    added: result.added,
    duplicate: result.duplicate,
    filled: result.filled,
    entry: { id: result.entry.id, text: result.entry.text, meme: result.entry.meme || null }
  };
}

browser.menus.onClicked.addListener(async function (info, tab) {
  if (info.menuItemId !== MENU_ID) return;

  const text = (info.selectionText || "").trim();
  if (!text) {
    flashBadge("!", DANGER);
    return;
  }

  const pageUrl = (tab && tab.url) || info.pageUrl || "";
  const pageTitle = (tab && tab.title) || "";

  try {
    const result = await saveEntry({ text: text, title: pageTitle, url: pageUrl, source: "contextmenu" });
    flashBadge(result.ok ? "✓" : "!", result.ok ? ACCENT : DANGER);
  } catch (error) {
    console.error("[句子库] 保存失败", error);
    flashBadge("!", DANGER);
  }
});

async function getMemeInfo() {
  const cache = await MemeLib.getCache();
  const items = cache && Array.isArray(cache.items) ? cache.items : [];
  return {
    ok: true,
    count: cache && Number.isFinite(cache.count) ? cache.count : items.length,
    fetchedAt: (cache && cache.fetchedAt) || 0,
    refreshing: MemeLib.isRefreshing(),
    stale: !cache || !items.length || MemeLib.isStale(cache)
  };
}

browser.runtime.onMessage.addListener(function (message, sender) {
  if (!message || typeof message !== "object") return;

  if (message.type === "saveCandidate") {
    return saveEntry({
      text: message.text,
      title: (sender && sender.tab && sender.tab.title) || message.title,
      url: message.url || (sender && sender.tab && sender.tab.url),
      source: message.source || "site",
      memeId: message.memeId
    }).catch(function (error) {
      console.error("[句子库] 站内保存失败", error);
      return { ok: false, error: "保存失败" };
    });
  }

  if (message.type === "getMemeInfo") {
    return getMemeInfo();
  }

  if (message.type === "refreshMemes") {
    return refreshMemes().then(function (cache) {
      return { ok: true, count: cache.count, fetchedAt: cache.fetchedAt };
    }).catch(function (error) {
      return { ok: false, error: memeErrorMessage(error) };
    });
  }
});

browser.action.onClicked.addListener(function () {
  browser.tabs.create({ url: browser.runtime.getURL("library.html") });
});
