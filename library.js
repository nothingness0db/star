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
  const siteFilter = document.getElementById("siteFilter");
  const tagFilter = document.getElementById("tagFilter");
  const sortSelect = document.getElementById("sortSelect");
  const clearFilterBtn = document.getElementById("clearFilterBtn");
  const welcomeEl = document.getElementById("welcome");
  const welcomeClose = document.getElementById("welcomeClose");
  const themeSelect = document.getElementById("themeSelect");
  const fbToast = document.getElementById("fbToast");
  const fbBadge = document.getElementById("fbBadge");
  const autoUpdate = document.getElementById("autoUpdate");
  const memeCacheSize = document.getElementById("memeCacheSize");
  const dataStats = document.getElementById("dataStats");
  const exportBackupBtn = document.getElementById("exportBackupBtn");
  const settingsImportBtn = document.getElementById("settingsImportBtn");
  const settingsClearBtn = document.getElementById("settingsClearBtn");
  const settingsWelcome = document.getElementById("settingsWelcome");
  const gistToken = document.getElementById("gistToken");
  const gistId = document.getElementById("gistId");
  const gistStatus = document.getElementById("gistStatus");
  const gistSaveBtn = document.getElementById("gistSaveBtn");
  const gistExportBtn = document.getElementById("gistExportBtn");
  const gistImportBtn = document.getElementById("gistImportBtn");

  const SITE_ORIGIN = "https://sb6657.cn/*";

  let entries = [];
  let query = "";
  let onlyMemes = false;
  let siteFilterValue = "";
  let tagFilterValue = "";
  let sortValue = "new";
  let settings = null;
  const FILTER_KEY = "filters";
  const VIEW_KEY = "welcomeViewed";
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

  function hasMeme(entry) {
    return Boolean(entry && entry.meme && entry.meme.id !== undefined && entry.meme.id !== null && entry.meme.id !== "");
  }

  function searchHaystack(entry) {
    let haystack = entry.text + "\n" + entry.title + "\n" + entry.url +
      "\n" + (entry.tags || []).join(" ") + "\n" + (entry.note || "");
    if (hasMeme(entry)) {
      haystack += "\n梗 #" + entry.meme.id + "\n" + entry.meme.id +
        "\n" + (entry.meme.text || "") + "\n" + (entry.meme.tags || "");
    }
    return haystack.toLowerCase();
  }

  function showToast(message, action) {
    clearTimeout(toastTimer);
    if (settings && settings.feedback && settings.feedback.toast === false && !action) return;
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
    const pinBtn = fragment.querySelector(".pin-btn");
    const noteToggle = fragment.querySelector(".note-toggle");
    const noteEditor = fragment.querySelector(".note-editor");
    const noteInput = fragment.querySelector(".note-input");
    const tagList = fragment.querySelector(".tag-list");
    const tagInput = fragment.querySelector(".tag-input");

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

    if (entry.pinned) {
      card.classList.add("pinned");
      pinBtn.setAttribute("aria-pressed", "true");
      pinBtn.title = "取消置顶";
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

    renderNote(entry, noteToggle, noteEditor, noteInput);
    renderTags(entry, tagList, tagInput);

    pinBtn.addEventListener("click", async function () {
      await updateEntry(entry, { pinned: !entry.pinned });
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

  async function updateEntry(entry, patch, options) {
    try {
      const updated = await store.update(entry.id, patch);
      if (!updated) throw new Error("条目不存在");
      Object.assign(entry, updated);
      if (options && options.inPlace) {
        updateFilterOptions();
      } else {
        await reload();
      }
    } catch (error) {
      console.error("[句子库] 更新失败", error);
      showToast("更新失败，请重试");
    }
  }

  function renderNote(entry, toggle, editor, input) {
    const display = document.createElement("p");
    display.className = "note-display";
    if (entry.note) {
      display.textContent = entry.note;
      toggle.parentNode.insertBefore(display, toggle.nextSibling);
    }
    function setOpen(open) {
      editor.hidden = !open;
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
      toggle.textContent = open ? "收起备注" : (entry.note ? "编辑备注" : "＋ 添加备注");
      if (open) input.focus();
    }
    toggle.textContent = entry.note ? "编辑备注" : "＋ 添加备注";
    toggle.addEventListener("click", function () {
      setOpen(editor.hidden);
    });
    input.value = entry.note || "";
    let timer = null;
    input.addEventListener("input", function () {
      clearTimeout(timer);
      timer = setTimeout(async function () {
        await updateEntry(entry, { note: input.value }, { inPlace: true });
        display.textContent = input.value;
        if (!input.value && display.parentNode) display.remove();
        else if (input.value && !display.parentNode) toggle.parentNode.insertBefore(display, toggle.nextSibling);
        if (input.value && !display.parentNode) {
          toggle.parentNode.insertBefore(display, toggle.nextSibling);
        } else if (!input.value && display.parentNode) {
          display.remove();
        }
        toggle.textContent = input.value ? "编辑备注" : "＋ 添加备注";
      }, 450);
    });
  }

  function renderTags(entry, tagList, tagInput) {
    function draw() {
      tagList.replaceChildren();
      (entry.tags || []).forEach(function (tag) {
        const chip = document.createElement("span");
        chip.className = "tag-chip";
        const label = document.createElement("span");
        label.textContent = tag;
        const remove = document.createElement("button");
        remove.type = "button";
        remove.textContent = "×";
        remove.setAttribute("aria-label", "删除标签 " + tag);
        remove.addEventListener("click", async function () {
          await updateEntry(entry, { tags: entry.tags.filter(function (item) { return item !== tag; }) }, { inPlace: true });
        });
        chip.append(label, remove);
        tagList.append(chip);
      });
    }
    draw();
    tagInput.addEventListener("keydown", async function (event) {
      if (event.key !== "Enter") return;
      event.preventDefault();
      const tag = tagInput.value.trim();
      if (!tag) return;
      tagInput.value = "";
      const tags = (entry.tags || []).slice();
      if (!tags.includes(tag)) tags.push(tag);
      await updateEntry(entry, { tags: tags }, { inPlace: true });
    });
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

  function domainOf(raw) {
    try {
      return new URL(raw).hostname.replace(/^www\./, "");
    } catch (error) {
      return "";
    }
  }

  function updateFilterOptions() {
    const sites = new Set(entries.map(function (entry) { return domainOf(entry.url); }).filter(Boolean));
    const tags = new Set();
    entries.forEach(function (entry) { (entry.tags || []).forEach(function (tag) { tags.add(tag); }); });
    const siteCurrent = siteFilter.value;
    const tagCurrent = tagFilter.value;
    if (!sites.has(siteCurrent)) {
      siteFilterValue = "";
      siteFilter.value = "";
    }
    if (!tags.has(tagCurrent)) {
      tagFilterValue = "";
      tagFilter.value = "";
    }
  }

  function renderFilterOptions() {
    const sites = new Set();
    const tags = new Set();
    entries.forEach(function (entry) {
      const domain = domainOf(entry.url);
      if (domain) sites.add(domain);
      (entry.tags || []).forEach(function (tag) { tags.add(tag); });
    });
    function syncOptions(select, values, placeholder, currentValue) {
      const current = currentValue || "";
      const existing = new Set(Array.from(select.options).map(function (option) { return option.value; }));
      values.forEach(function (value) {
        if (existing.has(value)) return;
        select.append(new Option(value, value));
      });
      Array.from(select.options).forEach(function (option) {
        if (option.value && !values.has(option.value)) option.remove();
      });
      // 条目尚未加载时（entries 为空）保留已保存的筛选值，等 reload 后再应用。
      const next = values.has(current) ? current : (entries.length > 0 ? "" : current);
      select.value = values.has(next) ? next : "";
      if (select.options.length === 0) select.append(new Option(placeholder, ""));
      return next;
    }
    siteFilterValue = syncOptions(siteFilter, sites, "全部站点", siteFilterValue);
    tagFilterValue = syncOptions(tagFilter, tags, "全部标签", tagFilterValue);
  }

  function compareEntries(a, b) {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    if (sortValue === "old") return a.createdAt - b.createdAt;
    if (sortValue === "site") {
      const domainCompare = domainOf(a.url).localeCompare(domainOf(b.url));
      if (domainCompare !== 0) return domainCompare;
      return b.createdAt - a.createdAt;
    }
    if (sortValue === "title") {
      const titleCompare = (a.title || a.text).localeCompare(b.title || b.text);
      if (titleCompare !== 0) return titleCompare;
      return b.createdAt - a.createdAt;
    }
    return b.createdAt - a.createdAt;
  }

  function render() {
    const needle = query.trim().toLowerCase();
    let filtered = onlyMemes ? entries.filter(hasMeme) : entries.slice();
    if (siteFilterValue) filtered = filtered.filter(function (entry) { return domainOf(entry.url) === siteFilterValue; });
    if (tagFilterValue) filtered = filtered.filter(function (entry) { return (entry.tags || []).includes(tagFilterValue); });
    if (needle) {
      filtered = filtered.filter(function (entry) {
        return searchHaystack(entry).includes(needle);
      });
    }
    filtered.sort(compareEntries);

    renderFilterOptions();
    listEl.replaceChildren();
    filtered.forEach(buildCard);

    totalCountEl.textContent = "共 " + entries.length + " 条";
    const parts = [];
    if (needle || siteFilterValue || tagFilterValue || onlyMemes) parts.push(filtered.length + " 条结果");
    if (onlyMemes) parts.push("只看梗");
    if (siteFilterValue) parts.push(siteFilterValue);
    if (tagFilterValue) parts.push("#" + tagFilterValue);
    resultCountEl.textContent = parts.join(" · ");

    emptyStateEl.hidden = entries.length !== 0;
    noResultsEl.hidden = !(entries.length > 0 && filtered.length === 0);
    if (!noResultsEl.hidden) {
      noResultsTextEl.textContent = "没有符合当前筛选条件的句子，换个条件试试。";
    }

    onlyMemesBtn.classList.toggle("active", onlyMemes);
    onlyMemesBtn.setAttribute("aria-pressed", onlyMemes ? "true" : "false");

    const empty = entries.length === 0;
    exportJsonBtn.disabled = empty;
    exportMdBtn.disabled = empty;
    clearBtn.disabled = empty;
  }

  async function saveFilters() {
    try {
      await browser.storage.local.set({ [FILTER_KEY]: { site: siteFilterValue, tag: tagFilterValue, sort: sortValue } });
    } catch (error) {
      /* 筛选状态保存失败不影响使用 */
    }
  }

  async function loadFilters() {
    try {
      const data = await browser.storage.local.get(FILTER_KEY);
      const saved = data && data[FILTER_KEY];
      if (!saved) return;
      siteFilterValue = saved.site || "";
      tagFilterValue = saved.tag || "";
      sortValue = ["new", "old", "site", "title"].includes(saved.sort) ? saved.sort : "new";
    } catch (error) {
      /* 忽略 */
    }
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
    if (!settings.autoUpdateMemes) return;
    if (!memeState.count || memeState.stale || memeState.refreshing) {
      startMemeRefresh();
    }
  }

  onlyMemesBtn.addEventListener("click", function () {
    onlyMemes = !onlyMemes;
    render();
  });

  siteFilter.addEventListener("change", function () {
    siteFilterValue = siteFilter.value;
    saveFilters();
    render();
  });
  tagFilter.addEventListener("change", function () {
    tagFilterValue = tagFilter.value;
    saveFilters();
    render();
  });
  sortSelect.addEventListener("change", function () {
    sortValue = sortSelect.value;
    saveFilters();
    render();
  });
  clearFilterBtn.addEventListener("click", function () {
    siteFilterValue = "";
    tagFilterValue = "";
    onlyMemes = false;
    saveFilters();
    render();
  });

  refreshMemesBtn.addEventListener("click", function () {
    startMemeRefresh();
  });

  if (browser.runtime && browser.runtime.onMessage) {
    browser.runtime.onMessage.addListener(function (message) {
      if (!message || typeof message !== "object") return;
      if (message.type === "show-toast") {
        showToast(message.text);
        return;
      }
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

  function applyTheme() {
    if (!settings) return;
    document.documentElement.dataset.theme = settings.theme === "system" ? "" : settings.theme;
    if (!settings.theme || settings.theme === "system") delete document.documentElement.dataset.theme;
    themeSelect.value = settings.theme;
  }

  async function refreshSettingsUI() {
    settings = await store.getSettings();
    applyTheme();
    fbToast.checked = settings.feedback.toast !== false;
    fbBadge.checked = settings.feedback.badge !== false;
    autoUpdate.checked = settings.autoUpdateMemes !== false;
    const info = await browser.runtime.sendMessage({ type: "getMemeInfo" }).catch(function () { return null; });
    let bytes = 0;
    try {
      const raw = await browser.storage.local.get("memes");
      bytes = raw && raw.memes ? new TextEncoder().encode(JSON.stringify(raw.memes)).length : 0;
    } catch (error) { /* 忽略 */ }
    memeCacheSize.textContent = "缓存大小：约 " + (bytes / 1024).toFixed(0) + " KB（梗 " + (info ? info.count : 0) + " 条）";
    await refreshGistUI();
    const stats = await store.stats();
    dataStats.textContent = "条目 " + stats.entries + " 条 · 梗命中 " + stats.memes + " 条 · 站点 " + stats.sites +
      " 个 · 占用约 " + (stats.bytes / 1024).toFixed(1) + " KB";
  }

  // token 只通过消息交给 background 写入 storage.local；这里不留副本、不打印。
  async function refreshGistUI() {
    const data = await browser.storage.local.get("githubGist");
    const saved = (data && data.githubGist) || {};
    gistId.value = String(saved.gistId || "");
    gistToken.value = "";
    gistToken.placeholder = saved.token ? "已保存（留空则不修改）" : "仅勾选 gist scope";
    gistStatus.textContent = "状态：" + (saved.token ? "已保存 token" : "未保存 token") +
      " · " + (saved.gistId ? "已记录 Gist ID" : "尚未设置 Gist ID（导出时新建）");
  }

  function gistError(result) {
    return (result && result.error) || "未知错误";
  }

  function showWelcome() {
    welcomeEl.hidden = false;
    welcomeClose.focus();
  }

  async function dismissWelcome() {
    welcomeEl.hidden = true;
    try {
      settings = await store.saveSettings({ welcomeSeen: true });
    } catch (error) {
      /* 忽略 */
    }
  }

  settingsBtn.addEventListener("click", function () {
    refreshPermissionUI();
    refreshSettingsUI().catch(function (error) { console.error("[句子库] 设置读取失败", error); });
    settingsDialog.showModal();
  });

  welcomeClose.addEventListener("click", dismissWelcome);
  settingsWelcome.addEventListener("click", function () {
    settingsDialog.close();
    showWelcome();
  });

  themeSelect.addEventListener("change", async function () {
    settings = await store.saveSettings({ theme: themeSelect.value });
    applyTheme();
  });
  fbToast.addEventListener("change", async function () {
    settings = await store.saveSettings({ feedback: { toast: fbToast.checked } });
  });
  fbBadge.addEventListener("change", async function () {
    settings = await store.saveSettings({ feedback: { badge: fbBadge.checked } });
  });
  autoUpdate.addEventListener("change", async function () {
    settings = await store.saveSettings({ autoUpdateMemes: autoUpdate.checked });
  });
  gistSaveBtn.addEventListener("click", async function () {
    gistStatus.textContent = "状态：保存中…";
    try {
      const patch = { gistId: gistId.value.trim() };
      if (gistToken.value.trim()) patch.token = gistToken.value.trim();
      const result = await browser.runtime.sendMessage({ type: "gistSaveCredentials", token: patch.token, gistId: patch.gistId });
      if (!result || result.ok === false) {
        gistStatus.textContent = "状态：" + ((result && result.error) || "保存失败");
        return;
      }
      gistToken.value = "";
      await refreshGistUI();
      showToast("已保存 GitHub Gist 配置");
    } catch (error) {
      gistStatus.textContent = "状态：保存失败";
    }
  });

  gistExportBtn.addEventListener("click", async function () {
    gistStatus.textContent = "状态：导出中…";
    try {
      const result = await browser.runtime.sendMessage({ type: "gistExport" });
      if (!result || result.ok === false) {
        gistStatus.textContent = "状态：" + gistError(result);
        return;
      }
      await refreshGistUI();
      gistStatus.textContent = "状态：已" + (result.created ? "创建" : "更新") + " secret Gist，" + result.count + " 条";
      showToast("已导出 " + result.count + " 条到 Gist");
    } catch (error) {
      gistStatus.textContent = "状态：导出失败";
    }
  });

  gistImportBtn.addEventListener("click", async function () {
    gistStatus.textContent = "状态：恢复中…";
    try {
      const result = await browser.runtime.sendMessage({ type: "gistImport" });
      if (!result || result.ok === false) {
        gistStatus.textContent = "状态：" + gistError(result);
        return;
      }
      await reload();
      gistStatus.textContent = "状态：恢复完成，新增 " + result.added + " 条，跳过 " + result.skipped + " 条重复" +
        (result.invalid ? "，忽略 " + result.invalid + " 条无效数据" : "");
      showToast("已从 Gist 恢复 " + result.added + " 条");
    } catch (error) {
      gistStatus.textContent = "状态：恢复失败";
    }
  });

  exportBackupBtn.addEventListener("click", function () {
    exportJsonBtn.click();
  });
  settingsImportBtn.addEventListener("click", function () {
    importInput.click();
  });
  settingsClearBtn.addEventListener("click", function () {
    settingsDialog.close();
    clearBtn.click();
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

  // 初始化：设置、筛选持久化、主题、首次安装欢迎区块。
  (async function init() {
    settings = await store.getSettings();
    await loadFilters();
    sortSelect.value = sortValue;
    siteFilter.value = siteFilterValue;
    tagFilter.value = tagFilterValue;
    applyTheme();
    // 欢迎区块：仅在首次安装的 install 事件里打开，关闭后记住。
    const viewed = await browser.storage.local.get(VIEW_KEY).catch(function () { return {}; });
    const shouldWelcome = Boolean(viewed && viewed[VIEW_KEY]) && !settings.welcomeSeen;
    welcomeEl.hidden = !shouldWelcome;
    render();
  })().catch(function (error) {
    console.error("[句子库] 初始化失败", error);
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
