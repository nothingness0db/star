(function () {
  "use strict";

  if (window.top !== window) return;
  if (window.__sentenceSaver6657Loaded) return;
  window.__sentenceSaver6657Loaded = true;

  const STAR_CLASS = "ss-6657-star";
  const STYLE_ID = "ss-6657-style";
  const TOAST_ID = "ss-6657-toast";
  const PUSH_CLASS = "ss-6657-star--push";
  const TIGHT_CLASS = "ss-6657-star--tight";
  const CORNER_CLASS = "ss-6657-star--corner";
  const SCAN_DEBOUNCE = 180;

  const records = new WeakMap();
  let savedPrints = new Set();
  let scanTimer = null;
  let toastTimer = null;
  let lastUrl = location.href;

  function fingerprint(text, url) {
    return String(text || "").trim().toLowerCase() + "\u0000" + String(url || "").trim().toLowerCase();
  }

  function injectStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = [
      "." + STAR_CLASS + "{appearance:none;-webkit-appearance:none;display:inline-flex;align-items:center;justify-content:center;flex:0 0 auto;width:15px;height:15px;min-width:15px;margin:0 2px;padding:0;border:0;border-radius:4px;background:transparent;color:inherit;opacity:.35;cursor:pointer;line-height:1;vertical-align:middle;transition:opacity .15s ease,color .15s ease,transform .15s ease;pointer-events:auto}",
      "." + STAR_CLASS + ":hover,." + STAR_CLASS + ":focus-visible{opacity:1;color:#e6a23c;outline:none}",
      "." + STAR_CLASS + ":active{transform:scale(.88)}",
      "." + STAR_CLASS + "[data-saving=\"1\"]{opacity:.6;cursor:progress}",
      "." + STAR_CLASS + "[data-saved=\"1\"]{opacity:1;color:#e6a23c}",
      "." + STAR_CLASS + " svg{display:block;width:11px;height:11px;pointer-events:none}",
      "." + STAR_CLASS + "[data-saved=\"1\"] svg{fill:currentColor;stroke:currentColor}",
      "." + PUSH_CLASS + "{margin-left:auto}",
      // 表格行里给文本留 2px 的净增量，按钮本体悬挂在单元格右侧内边距中，
      // 这样既贴着文本，又不会把长梗挤出新的一行（不改变行高）。
      "." + TIGHT_CLASS + "{margin-left:0;margin-right:-17px}",
      // 生命周期列表的右侧元信息栏没有多余行高，用绝对定位的小星标，
      // 只占元信息栏左上角，避免把整行撑高。
      "." + CORNER_CLASS + "{position:absolute;left:0;top:0;width:11px;height:11px;min-width:11px;margin:0}",
      "." + CORNER_CLASS + " svg{width:9px;height:9px}",
      "." + CORNER_CLASS + "::after{content:\"\";position:absolute;left:-4px;right:-6px;top:-4px;bottom:-4px}",
      "#" + TOAST_ID + "{position:fixed;left:50%;bottom:24px;z-index:2147483647;transform:translate(-50%,12px);opacity:0;pointer-events:none;background:rgba(32,30,27,.94);color:#f8f4ee;font:13px/1.4 -apple-system,BlinkMacSystemFont,\"Segoe UI\",\"Noto Sans SC\",\"PingFang SC\",\"Microsoft YaHei\",sans-serif;padding:9px 16px;border-radius:999px;box-shadow:0 12px 30px -10px rgba(0,0,0,.45);transition:opacity .18s ease,transform .18s ease;max-width:calc(100vw - 32px)}",
      "#" + TOAST_ID + "[data-show=\"1\"]{opacity:1;transform:translate(-50%,0)}"
    ].join("\n");
    (document.head || document.documentElement).append(style);
  }

  function showToast(text) {
    let el = document.getElementById(TOAST_ID);
    if (!el) {
      el = document.createElement("div");
      el.id = TOAST_ID;
      el.setAttribute("role", "status");
      el.setAttribute("aria-live", "polite");
      (document.body || document.documentElement).append(el);
    }
    el.textContent = text;
    el.dataset.show = "1";
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      if (el) el.dataset.show = "0";
    }, 1700);
  }

  function createStar(text) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = STAR_CLASS;
    button.dataset.text = text;
    button.dataset.saved = "0";
    button.dataset.saving = "";
    button.title = "收藏这句";
    button.setAttribute("aria-label", "收藏这句");
    button.setAttribute("aria-pressed", "false");

    const ns = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(ns, "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("focusable", "false");
    const path = document.createElementNS(ns, "path");
    path.setAttribute("d", "M12 3.6l2.6 5.27 5.82.85-4.21 4.1.99 5.79L12 16.87l-5.2 2.74.99-5.79-4.21-4.1 5.82-.85L12 3.6z");
    path.setAttribute("fill", "none");
    path.setAttribute("stroke", "currentColor");
    path.setAttribute("stroke-width", "1.7");
    path.setAttribute("stroke-linejoin", "round");
    svg.append(path);
    button.append(svg);

    const stop = function (event) {
      event.stopPropagation();
    };
    ["pointerdown", "mousedown", "touchstart", "touchend", "mouseup"].forEach(function (type) {
      button.addEventListener(type, stop, { passive: true });
    });
    button.addEventListener("click", onStarClick);
    return button;
  }

  async function onStarClick(event) {
    event.preventDefault();
    event.stopPropagation();

    const button = event.currentTarget;
    const text = button.dataset.text || "";
    if (!text) return;
    if (button.dataset.saving === "1") return;

    button.dataset.saving = "1";
    try {
      const response = await browser.runtime.sendMessage({
        type: "saveCandidate",
        text: text,
        url: location.href,
        title: document.title || "",
        source: "site",
        memeId: button.dataset.memeId || ""
      });
      if (!response || !response.ok) throw new Error((response && response.error) || "保存失败");
      savedPrints.add(fingerprint(text, location.href));
      setSaved(button, true);
      showToast(response.duplicate ? "已收藏过" : "已收藏");
    } catch (error) {
      console.error("[句子库] 站内收藏失败", error);
      showToast("收藏失败，请稍后重试");
    } finally {
      button.dataset.saving = "";
    }
  }

  function setSaved(button, saved) {
    button.dataset.saved = saved ? "1" : "0";
    button.setAttribute("aria-pressed", saved ? "true" : "false");
    button.title = saved ? "已收藏" : "收藏这句";
  }

  function updateStar(button, text) {
    setSaved(button, savedPrints.has(fingerprint(text, location.href)));
  }

  function refreshAllStars() {
    document.querySelectorAll("." + STAR_CLASS).forEach(function (button) {
      if (button.dataset.text) updateStar(button, button.dataset.text);
    });
  }

  function textOf(element) {
    if (element.matches(".barrage-text, .meme-text")) {
      return (element.textContent || "").trim();
    }
    const clone = element.cloneNode(true);
    clone.querySelectorAll("." + STAR_CLASS + ", .meme-meta, .tag-list, .submit-time, button, svg").forEach(function (node) {
      node.remove();
    });
    return (clone.textContent || "").trim();
  }

  function isUsable(element) {
    if (!element || !element.isConnected) return false;
    if (element.closest("." + STAR_CLASS)) return false;
    const text = textOf(element);
    if (!text) return false;
    if (element.getClientRects().length === 0 && element.offsetParent === null) return false;
    return true;
  }

  function pageMemeId(element) {
    const row = element.closest("tr");
    if (row) {
      const tag = row.querySelector("td:first-child .el-tag__content, td:first-child .el-tag");
      const found = tag && /^\s*#?\s*(\d{1,12})\s*$/.exec(tag.textContent || "");
      if (found) return found[1];
    }
    const holder = element.closest("[data-meme-id], [data-barrage-id], [data-id]");
    if (holder) {
      const value = holder.getAttribute("data-meme-id") || holder.getAttribute("data-barrage-id") || holder.getAttribute("data-id");
      if (value && /^\d+$/.test(value)) return value;
    }
    return "";
  }

  function collectTargets() {
    const targets = [];
    document.querySelectorAll(".barrage-text, .meme-text").forEach(function (element) {
      if (!isUsable(element)) return;
      targets.push(element);
    });
    document.querySelectorAll(".meme-item").forEach(function (element) {
      if (element.querySelector(".barrage-text, .meme-text")) return;
      if (!isUsable(element)) return;
      targets.push(element);
    });
    return targets;
  }

  function placeInMeta(meta, button) {
    const position = getComputedStyle(meta).position;
    if (position === "static") meta.style.position = "relative";
    button.classList.add(CORNER_CLASS);
    meta.append(button);
  }

  function insertStar(element, text) {
    const previous = records.get(element);
    if (previous && previous.text === text && previous.button.isConnected) {
      updateStar(previous.button, text);
      return;
    }
    if (previous && previous.button && previous.button.isConnected) {
      previous.button.remove();
    }

    const button = createStar(text);
    const id = pageMemeId(element);
    if (id) button.dataset.memeId = id;

    if (element.matches(".meme-item")) {
      const meta = element.querySelector(".meme-meta");
      if (meta) {
        placeInMeta(meta, button);
      } else {
        button.classList.add(PUSH_CLASS);
        element.append(button);
      }
    } else {
      const parent = element.parentNode;
      if (!parent) return;
      const meta = element.parentElement && element.parentElement.classList.contains("meme-item")
        ? element.parentElement.querySelector(".meme-meta")
        : null;
      if (meta) {
        placeInMeta(meta, button);
      } else if (element.parentElement && element.parentElement.classList.contains("meme-content")) {
        button.classList.add(TIGHT_CLASS);
        parent.insertBefore(button, element.nextSibling);
      } else {
        parent.insertBefore(button, element.nextSibling);
      }
    }

    records.set(element, { text: text, button: button });
    updateStar(button, text);
  }

  function scan() {
    scanTimer = null;
    if (!document.body) return;
    injectStyle();
    try {
      collectTargets().forEach(function (element) {
        insertStar(element, textOf(element));
      });
    } catch (error) {
      console.error("[句子库] 注入站内按钮失败", error);
    }
    refreshAllStars();
  }

  function scheduleScan(wait) {
    if (scanTimer) return;
    scanTimer = setTimeout(scan, typeof wait === "number" ? wait : SCAN_DEBOUNCE);
  }

  function isOwnNode(node) {
    if (!node || node.nodeType !== 1) return false;
    return node.classList.contains(STAR_CLASS) || node.id === TOAST_ID;
  }

  function startObserver() {
    if (typeof MutationObserver !== "function") return;
    const observer = new MutationObserver(function (mutations) {
      let relevant = false;
      for (const mutation of mutations) {
        if (mutation.type === "characterData") {
          relevant = true;
        } else if (mutation.type === "childList") {
          if (mutation.removedNodes.length > 0) {
            relevant = true;
          } else {
            mutation.addedNodes.forEach(function (node) {
              if (!isOwnNode(node)) relevant = true;
            });
          }
        }
        if (relevant) break;
      }
      if (relevant) scheduleScan();
    });
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      characterData: true
    });
  }

  async function loadSaved() {
    try {
      const data = await browser.storage.local.get("entries");
      const list = data && Array.isArray(data.entries) ? data.entries : [];
      savedPrints = new Set(list.map(function (entry) {
        return fingerprint(entry.text, entry.url);
      }));
    } catch (error) {
      savedPrints = new Set();
    }
    refreshAllStars();
  }

  function watchStorage() {
    if (!browser.storage || !browser.storage.onChanged) return;
    browser.storage.onChanged.addListener(function (changes, area) {
      if (area !== "local" || !changes.entries) return;
      const list = Array.isArray(changes.entries.newValue) ? changes.entries.newValue : [];
      savedPrints = new Set(list.map(function (entry) {
        return fingerprint(entry.text, entry.url);
      }));
      refreshAllStars();
    });
  }

  function watchRoute() {
    setInterval(function () {
      if (location.href === lastUrl) return;
      lastUrl = location.href;
      scheduleScan(60);
    }, 700);
    window.addEventListener("popstate", function () {
      scheduleScan(60);
    });
    window.addEventListener("hashchange", function () {
      scheduleScan(60);
    });
  }

  function init() {
    // 扩展重新载入后，页面里可能残留上一轮注入、但监听器已失效的按钮。
    document.querySelectorAll("." + STAR_CLASS).forEach(function (button) {
      button.remove();
    });
    injectStyle();
    scan();
    startObserver();
    watchStorage();
    watchRoute();
    loadSaved();
    window.addEventListener("load", function () {
      scheduleScan(120);
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
