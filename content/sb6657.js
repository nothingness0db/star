(function () {
  "use strict";

  if (window.top !== window) return;
  if (window.__sentenceSaver6657Loaded) return;
  window.__sentenceSaver6657Loaded = true;

  const STAR_CLASS = "ss-6657-star";
  const STYLE_ID = "ss-6657-style";
  const TOAST_ID = "ss-6657-toast";
  const SCAN_DEBOUNCE = 180;
  const ICON_SIZE = 18;
  const HIT_SIZE = 32;

  const TEXT_SELECTOR = ".barrage-text, .meme-text, .pk-text, .rank-barrage, .rank-text";
  const CONTROL_SELECTOR = [
    ".meme-side",
    ".meme-meta",
    ".copy-btn",
    ".pk-votes",
    ".rank-votes",
    ".rank-daily",
    ".rank-count",
    ".stale-score",
    ".vote-btns"
  ].join(", ");
  const INTERACTIVE_SELECTOR = "button, .el-button, .copy-btn, .vote-btn, .vote-btns, .rank-count";

  const hostRecords = new WeakMap();
  const liveRecords = new Set();
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
      "." + STAR_CLASS + "{position:absolute;z-index:3;display:flex;align-items:center;justify-content:flex-end;width:" + HIT_SIZE + "px;height:" + HIT_SIZE + "px;min-width:0;margin:0;padding:0;border:0;border-radius:50%;background:transparent;color:inherit;opacity:.65;cursor:pointer;line-height:1;pointer-events:auto;transition:opacity .15s ease,color .15s ease,transform .15s ease}",
      "." + STAR_CLASS + "::before{content:\"\";position:absolute;right:-1px;top:50%;transform:translateY(-50%);width:20px;height:20px;border-radius:50%;background:rgba(128,128,128,.22);transition:background .15s ease}",
      "." + STAR_CLASS + ":hover,." + STAR_CLASS + ":focus-visible{opacity:1;color:#e6a23c;outline:none}",
      "." + STAR_CLASS + ":hover::before,." + STAR_CLASS + ":focus-visible::before{background:rgba(230,162,60,.2)}",
      "." + STAR_CLASS + ":active{transform:scale(.9)}",
      "." + STAR_CLASS + ":focus-visible{box-shadow:0 0 0 2px rgba(230,162,60,.75)}",
      "." + STAR_CLASS + "[data-saving=\"1\"]{opacity:.7;cursor:progress}",
      "." + STAR_CLASS + "[data-saved=\"1\"]{opacity:1;color:#e6a23c}",
      "." + STAR_CLASS + "[data-saved=\"1\"]::before{background:rgba(230,162,60,.16)}",
      "." + STAR_CLASS + " svg{position:relative;display:block;width:" + ICON_SIZE + "px;height:" + ICON_SIZE + "px;pointer-events:none}",
      "." + STAR_CLASS + " svg path{fill:none;stroke:currentColor}",
      "." + STAR_CLASS + "[data-saved=\"1\"] svg{fill:currentColor;stroke:currentColor}",
      "." + STAR_CLASS + "[data-saved=\"1\"] svg path{fill:currentColor;stroke:currentColor}",
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
    return (element.textContent || "").replace(/\u200b/g, "").trim();
  }

  function isUsableText(element) {
    if (!element || !element.isConnected) return false;
    if (element.closest("." + STAR_CLASS)) return false;
    if (!textOf(element)) return false;
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

  function resolveHost(element) {
    const td = element.closest("td");
    if (td) {
      const row = element.closest("tr");
      return { host: td, scope: row || td };
    }
    const fighter = element.closest(".pk-fighter");
    if (fighter) return { host: fighter, scope: fighter };
    const line = element.closest(".line-bottom");
    if (line) return { host: line, scope: line };
    const item = element.closest(".meme-item");
    if (item) return { host: item, scope: item };
    const rank = element.closest(".rank-item");
    if (rank) return { host: rank, scope: rank };
    const li = element.closest("li");
    if (li) return { host: li, scope: li };
    const parent = element.parentElement;
    return parent ? { host: parent, scope: parent } : null;
  }

  function lineRectsOf(element) {
    const range = document.createRange();
    range.selectNodeContents(element);
    const rects = Array.prototype.slice.call(range.getClientRects());
    const usable = rects.filter(function (rect) {
      return rect.width > 1 && rect.height > 1;
    });
    if (usable.length) return usable;
    const own = element.getBoundingClientRect();
    return own.width > 1 && own.height > 1 ? [own] : [];
  }

  function isVisibleRect(rect) {
    return rect && rect.width > 1 && rect.height > 1;
  }

  function textNodeRects(element) {
    const rects = [];
    const doc = element.ownerDocument;
    const walker = doc.createTreeWalker(element, NodeFilter.SHOW_TEXT, {
      acceptNode: function (node) {
        return node.nodeValue && node.nodeValue.trim()
          ? NodeFilter.FILTER_ACCEPT
          : NodeFilter.FILTER_REJECT;
      }
    });
    let node;
    while ((node = walker.nextNode())) {
      const range = doc.createRange();
      range.selectNodeContents(node);
      Array.prototype.slice.call(range.getClientRects()).forEach(function (rect) {
        if (isVisibleRect(rect)) rects.push(rect);
      });
    }
    return rects;
  }

  function controlRects(element, forColumn) {
    if (element.matches(INTERACTIVE_SELECTOR)) {
      const own = element.getBoundingClientRect();
      return isVisibleRect(own) ? [own] : [];
    }
    const rects = [];
    const interactive = Array.prototype.slice.call(element.querySelectorAll(INTERACTIVE_SELECTOR)).filter(function (child) {
      const rect = child.getBoundingClientRect();
      return isVisibleRect(rect);
    });
    if (interactive.length) {
      interactive.forEach(function (child) {
        rects.push(child.getBoundingClientRect());
      });
      if (forColumn) return rects;
    } else if (forColumn) {
      const nodes = textNodeRects(element);
      if (nodes.length) return nodes;
      const own = element.getBoundingClientRect();
      return isVisibleRect(own) ? [own] : [];
    }
    textNodeRects(element).forEach(function (rect) {
      rects.push(rect);
    });
    element.querySelectorAll("*").forEach(function (child) {
      if (child.closest("." + STAR_CLASS)) return;
      const rect = child.getBoundingClientRect();
      if (isVisibleRect(rect)) rects.push(rect);
    });
    return rects;
  }

  function findRightControl(scope, firstLine, hostRect) {
    if (!scope || !scope.querySelectorAll) return null;
    let best = null;
    scope.querySelectorAll(CONTROL_SELECTOR).forEach(function (control) {
      if (control.closest("." + STAR_CLASS)) return;
      const rects = controlRects(control, true);
      let left = Infinity;
      for (const rect of rects) {
        if (rect.left <= firstLine.left + 2) continue;
        if (rect.left < hostRect.left) continue;
        if (rect.bottom <= firstLine.top - 40) continue;
        if (rect.top >= firstLine.bottom + 60) continue;
        if (rect.left < left) left = rect.left;
      }
      if (left === Infinity) return;
      if (!best || left < best.left) best = { element: control, left: left };
    });
    return best;
  }

  function intersects(iconRect, rect) {
    return iconRect.right > rect.left + 0.5 &&
      iconRect.left < rect.right - 0.5 &&
      iconRect.bottom > rect.top + 0.5 &&
      iconRect.top < rect.bottom - 0.5;
  }

  function positionStar(record, targetCenterX) {
    const host = record.host;
    const button = record.button;
    const hostRect = host.getBoundingClientRect();
    if (hostRect.width < 8 || hostRect.height < 8) {
      button.hidden = true;
      return true;
    }
    const style = getComputedStyle(host);
    if (style.position === "static") host.style.position = "relative";

    const borderLeft = parseFloat(style.borderLeftWidth) || 0;
    const borderTop = parseFloat(style.borderTopWidth) || 0;
    const borderRight = parseFloat(style.borderRightWidth) || 0;
    const borderBottom = parseFloat(style.borderBottomWidth) || 0;

    const rects = lineRectsOf(record.textEl);
    if (!rects.length) {
      button.hidden = true;
      return true;
    }
    const first = rects[0];
    const control = findRightControl(record.scope, first, hostRect);
    const sameRow = control ? host.contains(control.element) : false;
    const textRect = record.textEl.getBoundingClientRect();

    let iconLeft;
    if (targetCenterX !== null && targetCenterX !== undefined) {
      iconLeft = targetCenterX - ICON_SIZE / 2;
    } else if (control && !sameRow) {
      // 右侧控件在另一列（表格、排行）：星标固定在控件左侧 8px，整列对齐。
      iconLeft = control.left - 8 - ICON_SIZE;
    } else {
      // 文本与右侧控件同处一行（梗卡片）：贴着文本块右边缘，避开文字。
      iconLeft = textRect.right;
    }

    const minLeft = hostRect.left + borderLeft + 2;
    const maxLeft = hostRect.right - borderRight - 2 - ICON_SIZE;
    if (maxLeft >= minLeft) iconLeft = Math.min(Math.max(iconLeft, minLeft), maxLeft);
    else iconLeft = minLeft;

    const padLeft = hostRect.left + borderLeft;
    const padTop = hostRect.top + borderTop;
    const padWidth = hostRect.width - borderLeft - borderRight;
    const padHeight = hostRect.height - borderTop - borderBottom;
    const hitOverhang = HIT_SIZE - ICON_SIZE;
    if (iconLeft - hitOverhang < padLeft) iconLeft = padLeft + hitOverhang;

    let centerY = first.top + first.height / 2;
    let iconRect = {
      left: iconLeft,
      right: iconLeft + ICON_SIZE,
      top: centerY - ICON_SIZE / 2,
      bottom: centerY + ICON_SIZE / 2
    };

    // 收集与星标同高度的障碍：文字行、同一行里的右侧控件。
    const obstacles = rects.slice();
    if (sameRow) {
      record.scope.querySelectorAll(CONTROL_SELECTOR).forEach(function (other) {
        if (other.closest("." + STAR_CLASS)) return;
        controlRects(other, false).forEach(function (rect) {
          obstacles.push(rect);
        });
      });
    }

    const collisions = obstacles.filter(function (rect) {
      return intersects(iconRect, rect);
    });
    if (collisions.length) {
      const topLimit = Math.min.apply(null, collisions.map(function (rect) {
        return rect.top;
      })) - 6;
      const aboveCenter = topLimit - ICON_SIZE / 2;
      const minCenter = hostRect.top + borderTop + 2 + ICON_SIZE / 2;
      if (aboveCenter >= minCenter) {
        centerY = aboveCenter;
        iconRect = {
          left: iconLeft,
          right: iconLeft + ICON_SIZE,
          top: centerY - ICON_SIZE / 2,
          bottom: centerY + ICON_SIZE / 2
        };
      }
    }

    const textCollision = rects.some(function (rect) {
      return intersects(iconRect, rect);
    });

    let boxLeft = iconLeft - hitOverhang;
    let boxTop = centerY - HIT_SIZE / 2;
    boxLeft = Math.min(Math.max(boxLeft, padLeft), padLeft + Math.max(0, padWidth - HIT_SIZE));
    boxTop = Math.min(Math.max(boxTop, padTop), padTop + Math.max(0, padHeight - HIT_SIZE));

    button.hidden = false;
    button.style.left = (boxLeft - padLeft) + "px";
    button.style.top = (boxTop - padTop) + "px";

    // 图标靠按钮右侧摆放；按钮被容器夹回来时，图标也跟着右移。
    const actualLeft = boxLeft + (HIT_SIZE - ICON_SIZE);
    record.centerX = actualLeft + ICON_SIZE / 2;
    if (targetCenterX === null || targetCenterX === undefined) {
      record.baseCenterX = record.centerX;
      record.baseCollides = textCollision;
    }
    return textCollision;
  }

  function columnGroupKey(record) {
    const host = record.host;
    if (host.classList.contains("pk-fighter")) {
      return host.classList.contains("pk-a") ? "pk-a" : "pk-b";
    }
    if (host.classList.contains("line-bottom")) return host;
    return host.closest("ul, tbody") || host.parentElement || host;
  }

  function normalizeColumns() {
    const groups = new Map();
    liveRecords.forEach(function (record) {
      if (!record.button.isConnected || record.button.hidden) return;
      if (typeof record.baseCenterX !== "number") return;
      const key = columnGroupKey(record);
      let list = groups.get(key);
      if (!list) {
        list = [];
        groups.set(key, list);
      }
      list.push(record);
    });

    groups.forEach(function (list) {
      if (list.length < 2) return;
      const counts = new Map();
      list.forEach(function (record) {
        const center = Math.round(record.baseCenterX);
        counts.set(center, (counts.get(center) || 0) + 1);
      });
      let target = null;
      let best = -1;
      counts.forEach(function (count, center) {
        if (count > best || (count === best && (target === null || center < target))) {
          best = count;
          target = center;
        }
      });
      if (target === null) return;
      list.forEach(function (record) {
        if (Math.abs(record.centerX - target) < 1) return;
        const collides = positionStar(record, target);
        if (collides && !record.baseCollides) positionStar(record, null);
      });
    });
  }

  function removeRecord(record) {
    record.button.remove();
    hostRecords.delete(record.host);
    liveRecords.delete(record);
  }

  function processTextElement(element) {
    if (!isUsableText(element)) return;
    const resolved = resolveHost(element);
    if (!resolved || !resolved.host) return;
    const text = textOf(element);
    if (!text) return;

    const host = resolved.host;
    let record = hostRecords.get(host);
    if (record) {
      if (record.textEl === element) {
        if (record.text !== text) {
          record.text = text;
          record.button.dataset.text = text;
          updateStar(record.button, text);
        }
        const id = pageMemeId(element);
        if (id) record.button.dataset.memeId = id;
        else delete record.button.dataset.memeId;
        positionStar(record);
        return;
      }
      // 同一个条目只保留一个星标；文本元素被 Vue 换掉时才重建。
      if (record.textEl.isConnected && textOf(record.textEl)) return;
      removeRecord(record);
      record = null;
    }

    const button = createStar(text);
    const id = pageMemeId(element);
    if (id) button.dataset.memeId = id;
    host.append(button);

    record = {
      host: host,
      scope: resolved.scope,
      textEl: element,
      text: text,
      button: button
    };
    hostRecords.set(host, record);
    liveRecords.add(record);
    updateStar(button, text);
    positionStar(record);
  }

  function scan() {
    scanTimer = null;
    if (!document.body) return;
    injectStyle();
    try {
      document.querySelectorAll(TEXT_SELECTOR).forEach(processTextElement);
    } catch (error) {
      console.error("[句子库] 注入站内按钮失败", error);
    }
    liveRecords.forEach(function (record) {
      if (!record.host.isConnected || !record.textEl.isConnected) removeRecord(record);
    });
    normalizeColumns();
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

  function isLiveStreamNode(node) {
    const element = node && (node.nodeType === 1 ? node : node.parentElement);
    return Boolean(element && element.closest && element.closest(".stream"));
  }

  function startObserver() {
    if (typeof MutationObserver !== "function") return;
    const observer = new MutationObserver(function (mutations) {
      let relevant = false;
      for (const mutation of mutations) {
        // 实时事件流每秒都在变，和梗条目无关，忽略以免反复重排星标。
        if (isLiveStreamNode(mutation.target)) continue;
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
    window.addEventListener("resize", function () {
      scheduleScan(120);
    });
    document.addEventListener("load", function () {
      scheduleScan(120);
    }, true);
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
