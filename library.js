(function () {
  "use strict";

  const store = globalThis.SentenceStore;

  const listEl = document.getElementById("list");
  const totalCountEl = document.getElementById("totalCount");
  const resultCountEl = document.getElementById("resultCount");
  const searchInput = document.getElementById("searchInput");
  const emptyStateEl = document.getElementById("emptyState");
  const noResultsEl = document.getElementById("noResults");
  const noResultsTextEl = document.getElementById("noResultsText");
  const toastEl = document.getElementById("toast");
  const cardTemplate = document.getElementById("cardTemplate");
  const importInput = document.getElementById("importInput");
  const importBtn = document.getElementById("importBtn");
  const exportJsonBtn = document.getElementById("exportJsonBtn");
  const exportMdBtn = document.getElementById("exportMdBtn");
  const clearBtn = document.getElementById("clearBtn");
  const confirmDialog = document.getElementById("confirmDialog");
  const confirmCountEl = document.getElementById("confirmCount");
  const confirmCancel = document.getElementById("confirmCancel");
  const confirmOk = document.getElementById("confirmOk");
  const memeInfoEl = document.getElementById("memeInfo");
  const memeBarEl = document.querySelector(".meme-bar");
  const onlyMemesBtn = document.getElementById("onlyMemesBtn");
  const refreshMemesBtn = document.getElementById("refreshMemesBtn");
  const settingsBtn = document.getElementById("settingsBtn");
  const settingsDialog = document.getElementById("settingsDialog");
  const settingsClose = document.getElementById("settingsClose");
  const sitePermStatus = document.getElementById("sitePermStatus");
  const sitePermBtn = document.getElementById("sitePermBtn");
  const sitePermRemoveBtn = document.getElementById("sitePermRemoveBtn");

  const SITE_ORIGIN = "https://sb6657.cn/*";

  let entries = [];
  let query = "";
  let onlyMemes = false;
  let toastTimer = null;
  const expanded = new Set();

  const memeState = { count: 0, fetchedAt: 0, refreshing: false, stale: true };
  let memeProgress = null;
  let memeError = "";
  let memeDoneSeen = false;

  function safeUrl(raw) {
    if (!raw) return "";
    try {
      const parsed = new URL(raw);
      if (parsed.protocol === "http:" || parsed.protocol === "https:") return parsed.href;
    } catch (error) {
      /* 无效 URL 就当没有来源 */
    }
    return "";
  }

  function domainOf(raw) {
    const valid = safeUrl(raw);
    if (!valid) return "";
    try {
      return new URL(valid).hostname.replace(/^www\./, "");
    } catch (error) {
      return "";
    }
  }

  function hasMeme(entry) {
    return Boolean(entry && entry.meme && entry.meme.id !== undefined && entry.meme.id !== null && entry.meme.id !== "");
  }

  function searchHaystack(entry) {
    let haystack = entry.text + "\n" + entry.title + "\n" + entry.url;
    if (hasMeme(entry)) {
      haystack += "\n梗 #" + entry.meme.id + "\n" + entry.meme.id +
        "\n" + (entry.meme.text || "") + "\n" + (entry.meme.tags || "");
    }
    return haystack.toLowerCase();
  }

  function showToast(message, action) {
    clearTimeout(toastTimer);
    toastEl.textContent = "";

    const text = document.createElement("span");
    text.textContent = message;
    toastEl.append(text);

    if (action) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "toast-action";
      button.textContent = action.label;
      button.addEventListener("click", function () {
        hideToast();
        action.onClick();
      }, { once: true });
      toastEl.append(button);
    }

    toastEl.classList.add("show");
    toastTimer = setTimeout(hideToast, action ? 6500 : 2600);
  }

  function hideToast() {
    clearTimeout(toastTimer);
    toastEl.classList.remove("show");
  }

  async function copyText(text) {
    if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
      try {
        await navigator.clipboard.writeText(text);
        return true;
      } catch (error) {
        /* 回退到 execCommand */
      }
    }
    const helper = document.createElement("textarea");
    helper.value = text;
    helper.setAttribute("readonly", "");
    helper.style.position = "fixed";
    helper.style.top = "-2000px";
    helper.style.opacity = "0";
    document.body.append(helper);
    helper.select();
    let ok = false;
    try {
      ok = document.execCommand("copy");
    } catch (error) {
      ok = false;
    }
    helper.remove();
    return ok;
  }

  function download(filename, content, mime) {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(function () {
      URL.revokeObjectURL(url);
    }, 4000);
  }

  function fileStamp() {
    const now = new Date();
    const pad = function (value) {
      return String(value).padStart(2, "0");
    };
    return now.getFullYear() + pad(now.getMonth() + 1) + pad(now.getDate()) +
      "-" + pad(now.getHours()) + pad(now.getMinutes());
  }

  function buildCard(entry) {
    const fragment = cardTemplate.content.cloneNode(true);
    const card = fragment.querySelector(".card");
    const titleEl = fragment.querySelector(".card-title");
    const domainEl = fragment.querySelector(".card-domain");
    const sourceEl = fragment.querySelector(".card-source");
    const timeEl = fragment.querySelector(".card-time");
    const textEl = fragment.querySelector(".card-text");
    const expandBtn = fragment.querySelector(".expand-btn");
    const copyBtn = fragment.querySelector(".copy-btn");
    const deleteBtn = fragment.querySelector(".delete-btn");

    const url = safeUrl(entry.url);
    const domain = domainOf(entry.url);
    const titleText = entry.title || domain || "（无标题）";

    if (url) {
      titleEl.href = url;
      titleEl.textContent = titleText;
      domainEl.href = url;
      domainEl.textContent = domain || "打开来源";
      domainEl.title = entry.url;
    } else {
      const plainTitle = document.createElement("span");
      plainTitle.className = "card-title no-link";
      plainTitle.textContent = titleText;
      titleEl.replaceWith(plainTitle);
      sourceEl.remove();
    }

    timeEl.textContent = store.formatDateTime(entry.createdAt);
    timeEl.title = new Date(entry.createdAt).toLocaleString("zh-CN");
    textEl.textContent = entry.text;

    if (hasMeme(entry)) {
      const memeEl = fragment.querySelector(".card-meme");
      const badgeEl = fragment.querySelector(".meme-badge");
      const hotEl = fragment.querySelector(".meme-hot");
      const tagsEl = fragment.querySelector(".meme-tags");
      memeEl.hidden = false;
      badgeEl.textContent = "梗 #" + entry.meme.id;
      badgeEl.title = entry.meme.matchType === "contains" ? "选中文本包含这条梗" : "整段命中这条梗";
      hotEl.textContent = "· 热度 " + (Number(entry.meme.cnt) || 0);
      String(entry.meme.tags || "").split(",").forEach(function (raw) {
        const tag = raw.trim();
        if (!tag) return;
        const chip = document.createElement("span");
        chip.className = "meme-tag";
        chip.textContent = tag;
        tagsEl.append(chip);
      });
    }

    if (expanded.has(entry.id)) {
      card.classList.add("expanded");
      expandBtn.hidden = false;
      expandBtn.textContent = "收起";
    }

    expandBtn.addEventListener("click", function () {
      const nowExpanded = !card.classList.contains("expanded");
      card.classList.toggle("expanded", nowExpanded);
      expandBtn.textContent = nowExpanded ? "收起" : "展开";
      if (nowExpanded) expanded.add(entry.id);
      else expanded.delete(entry.id);
    });

    copyBtn.addEventListener("click", async function () {
      const ok = await copyText(entry.text);
      if (!ok) {
        showToast("复制失败，请手动选中复制");
        return;
      }
      const label = copyBtn.querySelector(".label");
      if (label) {
        const original = label.textContent;
        label.textContent = "已复制";
        copyBtn.classList.add("copied");
        setTimeout(function () {
          label.textContent = original;
          copyBtn.classList.remove("copied");
        }, 1400);
      }
      showToast("已复制");
    });

    deleteBtn.addEventListener("click", function () {
      deleteEntry(entry);
    });

    listEl.append(card);

    if (!expanded.has(entry.id) && textEl.scrollHeight > textEl.clientHeight + 2) {
      expandBtn.hidden = false;
    }

    return card;
  }

  async function deleteEntry(entry) {
    try {
      await store.remove(entry.id);
    } catch (error) {
      console.error("[句子库] 删除失败", error);
      showToast("删除失败，请重试");
      return;
    }
    entries = entries.filter(function (item) {
      return item.id !== entry.id;
    });
    expanded.delete(entry.id);
    render();
    showToast("已删除", {
      label: "撤销",
      onClick: async function () {
        try {
          await store.restore(entry);
          entries = await store.getAll();
          render();
          showToast("已恢复");
        } catch (error) {
          console.error("[句子库] 撤销失败", error);
          showToast("撤销失败");
        }
      }
    });
  }

  function render() {
    const needle = query.trim().toLowerCase();
    let filtered = onlyMemes ? entries.filter(hasMeme) : entries;
    if (needle) {
      filtered = filtered.filter(function (entry) {
        return searchHaystack(entry).includes(needle);
      });
    }

    listEl.replaceChildren();
    filtered.forEach(buildCard);

    totalCountEl.textContent = "共 " + entries.length + " 条";
    let countText = "";
    if (needle) countText = filtered.length + " 条结果";
    if (onlyMemes) countText = (countText ? countText + " · " : "") + "只看梗";
    resultCountEl.textContent = countText;

    emptyStateEl.hidden = entries.length !== 0;
    noResultsEl.hidden = !(entries.length > 0 && filtered.length === 0);
    if (!noResultsEl.hidden) {
      if (onlyMemes && !needle) {
        noResultsTextEl.textContent = "还没有匹配到梗的收藏。保存与梗库一致的句子后会自动标记。";
      } else if (onlyMemes) {
        noResultsTextEl.textContent = "没有包含「" + query.trim() + "」的梗收藏，换个关键词试试。";
      } else {
        noResultsTextEl.textContent = "没有包含「" + query.trim() + "」的句子，换个关键词试试。";
      }
    }

    onlyMemesBtn.classList.toggle("active", onlyMemes);
    onlyMemesBtn.setAttribute("aria-pressed", onlyMemes ? "true" : "false");

    const empty = entries.length === 0;
    exportJsonBtn.disabled = empty;
    exportMdBtn.disabled = empty;
    clearBtn.disabled = empty;
  }

  async function reload() {
    entries = await store.getAll();
    render();
  }

  function renderMemeBar() {
    let text;
    const busy = memeState.refreshing || Boolean(memeProgress);
    if (memeProgress) {
      text = "梗库下载中… 已拉 " + (memeProgress.pages || 0) + " 页";
    } else if (memeState.refreshing) {
      text = "梗库更新中…";
    } else if (memeState.count > 0) {
      text = "梗库 " + memeState.count.toLocaleString("zh-CN") + " 条 · " +
        (MemeLib.ageText(memeState.fetchedAt) || "已缓存");
      if (memeError) text += "（更新失败，沿用旧缓存）";
    } else {
      text = memeError ? "梗库下载失败" : "梗库尚未下载";
    }
    memeInfoEl.textContent = text;
    memeInfoEl.title = memeError || "";
    memeBarEl.classList.toggle("has-error", Boolean(memeError));
    memeBarEl.classList.toggle("busy", busy);
    refreshMemesBtn.disabled = busy;
    refreshMemesBtn.textContent = busy ? "更新中…" : (memeState.count > 0 ? "更新梗库" : "下载梗库");
    refreshMemesBtn.title = "梗库约 2.5 万条，下载后会缓存在本地";
  }

  async function refreshMemeInfo() {
    try {
      const info = await browser.runtime.sendMessage({ type: "getMemeInfo" });
      if (info && info.ok) {
        memeState.count = info.count || 0;
        memeState.fetchedAt = info.fetchedAt || 0;
        memeState.stale = Boolean(info.stale);
        if (!memeProgress) memeState.refreshing = Boolean(info.refreshing);
      }
    } catch (error) {
      console.error("[句子库] 读取梗库状态失败", error);
    }
    renderMemeBar();
  }

  async function startMemeRefresh() {
    if (memeState.refreshing || memeProgress) return;
    memeError = "";
    memeDoneSeen = false;
    memeState.refreshing = true;
    memeProgress = { pages: 0 };
    renderMemeBar();
    try {
      const result = await browser.runtime.sendMessage({ type: "refreshMemes" });
      if (result && result.ok) {
        memeState.count = result.count || memeState.count;
        memeState.fetchedAt = result.fetchedAt || memeState.fetchedAt;
        memeState.stale = false;
      } else {
        memeError = (result && result.error) || "更新失败";
      }
    } catch (error) {
      memeError = "无法连接后台，请重新载入扩展后再试";
    } finally {
      memeState.refreshing = false;
      memeProgress = null;
      renderMemeBar();
      if (memeError && !memeDoneSeen) showToast(memeError);
    }
  }

  async function initMemes() {
    await refreshMemeInfo();
    if (!memeState.count || memeState.stale || memeState.refreshing) {
      startMemeRefresh();
    }
  }

  onlyMemesBtn.addEventListener("click", function () {
    onlyMemes = !onlyMemes;
    render();
  });

  refreshMemesBtn.addEventListener("click", function () {
    startMemeRefresh();
  });

  if (browser.runtime && browser.runtime.onMessage) {
    browser.runtime.onMessage.addListener(function (message) {
      if (!message || typeof message !== "object") return;
      if (message.type === "meme-refresh-progress") {
        if (message.phase === "fetching" || message.phase === "retry") {
          memeError = "";
          memeState.refreshing = true;
          memeProgress = { pages: message.pages || message.page || 0 };
          renderMemeBar();
        }
        return;
      }
      if (message.type === "meme-refresh-done") {
        memeDoneSeen = true;
        memeProgress = null;
        memeState.refreshing = false;
        if (message.ok) {
          memeState.count = message.count || 0;
          memeState.fetchedAt = message.fetchedAt || Date.now();
          memeState.stale = false;
          memeError = "";
          showToast("梗库已更新：" + memeState.count.toLocaleString("zh-CN") + " 条");
        } else {
          memeError = message.error || "更新失败";
          showToast(memeError);
        }
        renderMemeBar();
      }
    });
  }

  // ---- 设置：sb6657.cn 站内收藏授权 ----
  async function refreshPermissionUI() {
    let granted = false;
    try {
      granted = await browser.permissions.contains({ origins: [SITE_ORIGIN] });
    } catch (error) {
      granted = false;
    }
    sitePermStatus.textContent = granted
      ? "当前状态：已启用 · 刷新 sb6657.cn 页面后生效"
      : "当前状态：未启用";
    sitePermBtn.hidden = granted;
    sitePermRemoveBtn.hidden = !granted;
  }

  settingsBtn.addEventListener("click", function () {
    refreshPermissionUI();
    settingsDialog.showModal();
  });

  settingsClose.addEventListener("click", function () {
    settingsDialog.close();
  });

  sitePermBtn.addEventListener("click", async function () {
    try {
      const granted = await browser.permissions.request({ origins: [SITE_ORIGIN] });
      if (granted) showToast("已启用，刷新 sb6657.cn 页面后生效");
      else showToast("未授予权限，站内收藏保持关闭");
    } catch (error) {
      console.error("[句子库] 申请站点权限失败", error);
      showToast("启用失败，请重试");
    }
    refreshPermissionUI();
  });

  sitePermRemoveBtn.addEventListener("click", async function () {
    try {
      await browser.permissions.remove({ origins: [SITE_ORIGIN] });
      showToast("已关闭站内收藏");
    } catch (error) {
      console.error("[句子库] 回收站点权限失败", error);
      showToast("关闭失败，请重试");
    }
    refreshPermissionUI();
  });

  settingsDialog.addEventListener("click", function (event) {
    if (event.target !== settingsDialog) return;
    const rect = settingsDialog.getBoundingClientRect();
    const outside = event.clientX < rect.left || event.clientX > rect.right ||
      event.clientY < rect.top || event.clientY > rect.bottom;
    if (outside) settingsDialog.close();
  });

  if (browser.permissions) {
    if (browser.permissions.onAdded) browser.permissions.onAdded.addListener(refreshPermissionUI);
    if (browser.permissions.onRemoved) browser.permissions.onRemoved.addListener(refreshPermissionUI);
  }

  searchInput.addEventListener("input", function () {
    query = searchInput.value;
    render();
  });

  document.addEventListener("keydown", function (event) {
    if (event.key === "/" && document.activeElement !== searchInput &&
        !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.preventDefault();
      searchInput.focus();
    }
  });

  let resizeTimer = null;
  window.addEventListener("resize", function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () {
      document.querySelectorAll(".card").forEach(function (card) {
        if (card.classList.contains("expanded")) return;
        const text = card.querySelector(".card-text");
        const button = card.querySelector(".expand-btn");
        if (text && button) button.hidden = !(text.scrollHeight > text.clientHeight + 2);
      });
    }, 150);
  });

  exportJsonBtn.addEventListener("click", function () {
    if (entries.length === 0) return;
    const payload = store.toExportPayload(entries);
    download("句子库-" + fileStamp() + ".json", JSON.stringify(payload, null, 2), "application/json");
    showToast("已导出 JSON");
  });

  exportMdBtn.addEventListener("click", function () {
    if (entries.length === 0) return;
    download("句子库-" + fileStamp() + ".md", store.toMarkdown(entries), "text/markdown");
    showToast("已导出 Markdown");
  });

  importBtn.addEventListener("click", function () {
    importInput.click();
  });

  importInput.addEventListener("change", async function () {
    const file = importInput.files && importInput.files[0];
    importInput.value = "";
    if (!file) return;
    try {
      const raw = await file.text();
      const payload = JSON.parse(raw);
      const result = await store.importMerge(payload);
      await reload();
      if (result.added === 0) {
        showToast(result.skipped > 0 ? "没有新句子，跳过了 " + result.skipped + " 条重复" : "文件里没有可导入的句子");
      } else {
        let message = "已导入 " + result.added + " 条";
        if (result.skipped > 0) message += "，跳过 " + result.skipped + " 条重复";
        showToast(message);
      }
    } catch (error) {
      console.error("[句子库] 导入失败", error);
      showToast("导入失败：不是有效的句子库 JSON");
    }
  });

  clearBtn.addEventListener("click", function () {
    confirmCountEl.textContent = String(entries.length);
    confirmDialog.showModal();
  });

  confirmCancel.addEventListener("click", function () {
    confirmDialog.close();
  });

  confirmOk.addEventListener("click", async function () {
    confirmDialog.close();
    hideToast();
    try {
      await store.clear();
      entries = [];
      expanded.clear();
      render();
      showToast("已清空全部");
    } catch (error) {
      console.error("[句子库] 清空失败", error);
      showToast("清空失败，请重试");
    }
  });

  confirmDialog.addEventListener("click", function (event) {
    if (event.target !== confirmDialog) return;
    const rect = confirmDialog.getBoundingClientRect();
    const outside = event.clientX < rect.left || event.clientX > rect.right ||
      event.clientY < rect.top || event.clientY > rect.bottom;
    if (outside) confirmDialog.close();
  });

  if (browser.storage && browser.storage.onChanged) {
    browser.storage.onChanged.addListener(function (changes, area) {
      if (area !== "local") return;
      if (changes.entries) {
        reload().catch(function (error) {
          console.error("[句子库] 同步存储失败", error);
        });
      }
      if (changes.memes) {
        refreshMemeInfo();
      }
    });
  }

  reload().catch(function (error) {
    console.error("[句子库] 读取失败", error);
    showToast("读取句子库失败");
    render();
  });

  initMemes().catch(function (error) {
    console.error("[句子库] 初始化梗库失败", error);
    renderMemeBar();
  });

  refreshPermissionUI();
})();
