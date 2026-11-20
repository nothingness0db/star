/* global SentenceStore, MemeLib */

const MENU_ID = "save-sentence";
const BADGE_MS = 1800;
const ACCENT = "#ff6b35";
const DANGER = "#d64545";
const SETTINGS_KEY = "settings";
const DEFAULT_SETTINGS = { theme: "system", feedback: { toast: true, badge: true }, autoUpdateMemes: true, welcomeSeen: false };

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

browser.runtime.onInstalled.addListener(function (details) {
  createMenus();
  if (details && details.reason === "install") {
    browser.storage.local.set({ welcomeViewed: true }).catch(function () {});
  }
  scheduleStaleRefresh();
});
browser.runtime.onStartup.addListener(function () {
  createMenus();
  scheduleStaleRefresh();
});

async function getSettings() {
  const data = await browser.storage.local.get(SETTINGS_KEY);
  const saved = (data && data[SETTINGS_KEY]) || {};
  return {
    theme: saved.theme || DEFAULT_SETTINGS.theme,
    feedback: Object.assign({}, DEFAULT_SETTINGS.feedback, saved.feedback || {}),
    autoUpdateMemes: saved.autoUpdateMemes !== false,
    welcomeSeen: Boolean(saved.welcomeSeen)
  };
}

async function saveFeedback(text, tone) {
  const settings = await getSettings();
  if (settings.feedback.badge) flashBadge(text, tone);
  if (settings.feedback.toast) broadcast({ type: "show-toast", text: text, tone: tone });
}

async function pageHint(tabId, text) {
  try {
    await browser.scripting.executeScript({
      target: { tabId: tabId },
      func: function (message) {
        var old = document.getElementById("__sentence_hint__");
        if (old) old.remove();
        var box = document.createElement("div");
        box.id = "__sentence_hint__";
        box.textContent = message;
        box.style.cssText = "position:fixed;left:50%;top:18px;transform:translateX(-50%);z-index:2147483647;max-width:min(90vw,360px);padding:10px 16px;border-radius:999px;background:#262220;color:#fff;font:14px/1.5 system-ui,sans-serif;box-shadow:0 8px 24px rgba(0,0,0,.28);pointer-events:none";
        (document.body || document.documentElement).appendChild(box);
        setTimeout(function () { if (box.parentNode) box.parentNode.removeChild(box); }, 2200);
      },
      args: [text]
    });
  } catch (error) {
    // 页面不允许注入时退回角标。
    flashBadge("!", DANGER);
  }
}

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
  getSettings().then(function (settings) {
    if (!settings.autoUpdateMemes) return;
    MemeLib.getCache().then(function (cache) {
      if (cache && cache.items && cache.items.length && MemeLib.isStale(cache)) {
        setTimeout(function () {
          refreshMemes().catch(function () {});
        }, 4000);
      }
    }).catch(function () {});
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

  // 还没有梗库时，且用户未关闭自动更新，才在后台拉一份。
  getSettings().then(function (settings) {
    if (!settings.autoUpdateMemes) return;
    MemeLib.getCache().then(function (cache) {
      if (!cache || !cache.items || cache.items.length === 0 || MemeLib.isStale(cache)) {
        refreshMemes().catch(function () {});
      }
    }).catch(function () {});
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
    saveFeedback("没有选中文字", DANGER);
    return;
  }

  const pageUrl = (tab && tab.url) || info.pageUrl || "";
  const pageTitle = (tab && tab.title) || "";

  try {
    const result = await saveEntry({ text: text, title: pageTitle, url: pageUrl, source: "contextmenu" });
    saveFeedback(result.ok ? "已收藏" : "保存失败", result.ok ? ACCENT : DANGER);
  } catch (error) {
    console.error("[句子库] 保存失败", error);
    saveFeedback("保存失败", DANGER);
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

browser.commands.onCommand.addListener(async function (command) {
  if (command !== "save-selection") return;
  const tabs = await browser.tabs.query({ active: true, currentWindow: true });
  const tab = tabs[0];
  if (!tab || !tab.id) return;
  let selected = "";
  try {
    const results = await browser.scripting.executeScript({
      target: { tabId: tab.id },
      func: function () { return window.getSelection().toString(); }
    });
    selected = String(results && results[0] && results[0].result || "").trim();
  } catch (error) {
    flashBadge("!", DANGER);
    return;
  }
  if (!selected) {
    await pageHint(tab.id, "先选中文字");
    return;
  }
  try {
    const result = await saveEntry({
      text: selected,
      title: tab.title || "",
      url: tab.url || "",
      source: "shortcut"
    });
    await saveFeedback(result.ok ? "已收藏" : "保存失败", result.ok ? ACCENT : DANGER);
  } catch (error) {
    console.error("[句子库] 快捷键保存失败", error);
    saveFeedback("保存失败", DANGER);
  }
});

browser.action.onClicked.addListener(function () {
  browser.tabs.create({ url: browser.runtime.getURL("library.html") });
});
