(function (global) {
  "use strict";

  const KEY = "memes";
  const API = "https://api.hguofichp.cn/machine/Page";
  // 接口允许较大的 pageSize；用整千一页可以把 2.5 万条压到 26 个请求，
  // 既避免逐条分页时被站点 WAF 限流，也保留了 lastPage 的终止判断。
  const PAGE_SIZE = 1000;
  const MAX_PAGES = 400;
  const TTL = 7 * 24 * 60 * 60 * 1000;
  const MIN_CONTAINS = 6;
  const RETRY_DELAY = 1200;
  const THROTTLE_DELAY = 10000;

  let cacheMemo = null;
  let indexMemo = null;
  let refreshPromise = null;

  function asString(value) {
    if (typeof value === "string") return value;
    if (value === null || value === undefined) return "";
    return String(value);
  }

  function delay(ms) {
    return new Promise(function (resolve) {
      setTimeout(resolve, ms);
    });
  }

  function toHalfWidth(text) {
    return text
      .replace(/[\uFF01-\uFF5E]/g, function (ch) {
        return String.fromCharCode(ch.charCodeAt(0) - 0xfee0);
      })
      .replace(/\u3000/g, " ");
  }

  // 归一化：去首尾空白 → 全角转半角 → 去标点/符号 → 压缩连续空白。
  function normalize(raw) {
    const text = toHalfWidth(asString(raw));
    if (!text) return "";
    return text
      .replace(/[\p{P}\p{S}]/gu, " ")
      .replace(/\s+/gu, " ")
      .trim()
      .toLowerCase();
  }

  function decodeBuffer(buffer) {
    let text = "";
    try {
      // 当前接口实际返回 UTF-8，但按要求兼容 GB18030：
      // 先严格按 UTF-8 解，失败再回退 GB18030。
      text = new TextDecoder("utf-8", { fatal: true }).decode(buffer);
    } catch (error) {
      text = new TextDecoder("gb18030").decode(buffer);
    }
    if (!text) text = new TextDecoder("gb18030").decode(buffer);
    return text;
  }

  function toItem(raw) {
    if (!raw || typeof raw !== "object") return null;
    const id = Number(raw.id);
    if (!Number.isFinite(id)) return null;
    const text = asString(raw.barrage !== undefined ? raw.barrage : raw.content).trim();
    if (!text) return null;
    const cnt = Number(raw.cnt);
    return {
      id: id,
      text: text,
      cnt: Number.isFinite(cnt) ? cnt : 0,
      tags: asString(raw.tags).trim()
    };
  }

  async function fetchPage(pageNum) {
    const url = API + "?pageNum=" + pageNum + "&pageSize=" + PAGE_SIZE;
    const response = await fetch(url, { cache: "no-store", credentials: "omit" });
    if (!response.ok) {
      const error = new Error("接口返回 HTTP " + response.status);
      error.status = response.status;
      error.throttled = response.status === 429 || response.status === 567;
      throw error;
    }
    const contentType = response.headers.get("content-type") || "";
    const buffer = await response.arrayBuffer();
    if (contentType.indexOf("json") === -1 && buffer.byteLength > 0) {
      const probe = new TextDecoder("utf-8").decode(buffer.slice(0, 32));
      if (probe.trim().charAt(0) !== "{") {
        const error = new Error("接口被临时限流");
        error.status = response.status;
        error.throttled = true;
        throw error;
      }
    }
    let payload;
    try {
      payload = JSON.parse(decodeBuffer(buffer));
    } catch (error) {
      throw new Error("接口返回内容无法解析");
    }
    const data = payload && payload.data;
    if (!data || !Array.isArray(data.list)) throw new Error("接口返回格式异常");
    const items = [];
    for (const raw of data.list) {
      const item = toItem(raw);
      if (item) items.push(item);
    }
    return {
      items: items,
      lastPage: data.lastPage === true,
      total: Number(data.total) || 0
    };
  }

  async function fetchPageWithRetry(pageNum, options) {
    const onProgress = options && options.onProgress;
    try {
      return await fetchPage(pageNum);
    } catch (error) {
      if (onProgress) onProgress({ phase: "retry", page: pageNum, done: 0, total: 0 });
      await delay(error && error.throttled ? THROTTLE_DELAY : RETRY_DELAY);
      return fetchPage(pageNum);
    }
  }

  async function writeCache(items) {
    const seen = new Set();
    const unique = [];
    for (const item of items) {
      if (seen.has(item.id)) continue;
      seen.add(item.id);
      unique.push(item);
    }
    unique.sort(function (a, b) {
      return b.id - a.id;
    });
    const cache = {
      fetchedAt: Date.now(),
      count: unique.length,
      items: unique
    };
    await browser.storage.local.set({ [KEY]: cache });
    cacheMemo = cache;
    indexMemo = null;
    return cache;
  }

  async function doRefresh(options) {
    const onProgress = options && options.onProgress;
    const items = [];
    let page = 1;
    let pages = 0;
    let total = 0;
    let finished = false;

    while (!finished) {
      const result = await fetchPageWithRetry(page, options);
      pages += 1;
      total = result.total || total;
      for (const item of result.items) items.push(item);
      if (onProgress) {
        onProgress({
          phase: "fetching",
          page: page,
          pages: pages,
          done: items.length,
          total: total
        });
      }
      if (result.lastPage || result.items.length === 0) finished = true;
      else if (page >= MAX_PAGES) throw new Error("梗库页数异常，" + page + " 页仍未结束");
      else page += 1;
    }

    const cache = await writeCache(items);
    if (onProgress) {
      onProgress({ phase: "done", page: pages, pages: pages, done: cache.count, total: cache.count });
    }
    return cache;
  }

  function refresh(options) {
    if (refreshPromise) return refreshPromise;
    refreshPromise = doRefresh(options).finally(function () {
      refreshPromise = null;
    });
    return refreshPromise;
  }

  function isRefreshing() {
    return refreshPromise !== null;
  }

  async function getCache() {
    if (cacheMemo) return cacheMemo;
    const data = await browser.storage.local.get(KEY);
    cacheMemo = data ? data[KEY] || null : null;
    return cacheMemo;
  }

  function isStale(cache) {
    if (!cache || !cache.fetchedAt) return true;
    return Date.now() - cache.fetchedAt > TTL;
  }

  function buildIndex(cache) {
    if (indexMemo && indexMemo.fetchedAt === cache.fetchedAt) return indexMemo;
    const byText = new Map();
    const byFirst = new Map();
    const byId = new Map();

    for (const raw of cache.items) {
      const norm = normalize(raw.text);
      if (!norm) continue;
      const item = {
        id: raw.id,
        text: raw.text,
        cnt: Number(raw.cnt) || 0,
        tags: raw.tags || "",
        norm: norm
      };
      byId.set(String(raw.id), item);
      const previous = byText.get(norm);
      if (!previous || item.cnt > previous.cnt) byText.set(norm, item);
      const first = norm.charAt(0);
      let bucket = byFirst.get(first);
      if (!bucket) {
        bucket = [];
        byFirst.set(first, bucket);
      }
      bucket.push(item);
    }

    indexMemo = {
      fetchedAt: cache.fetchedAt,
      byText: byText,
      byFirst: byFirst,
      byId: byId
    };
    return indexMemo;
  }

  async function getIndex() {
    const cache = await getCache();
    if (!cache || !Array.isArray(cache.items) || cache.items.length === 0) return null;
    return buildIndex(cache);
  }

  function toMeme(item, matchType) {
    return {
      id: item.id,
      text: item.text,
      tags: item.tags,
      cnt: item.cnt,
      matchType: matchType
    };
  }

  async function match(text) {
    const index = await getIndex();
    if (!index) return null;
    const norm = normalize(text);
    if (!norm) return null;

    const exact = index.byText.get(norm);
    if (exact) return toMeme(exact, "exact");

    let best = null;
    const visited = new Set();
    const chars = new Set(norm);
    chars.forEach(function (ch) {
      const bucket = index.byFirst.get(ch);
      if (!bucket) return;
      for (const item of bucket) {
        if (visited.has(item.id)) continue;
        visited.add(item.id);
        if (item.norm.length < MIN_CONTAINS) continue;
        if (norm.indexOf(item.norm) === -1) continue;
        if (!best || item.norm.length > best.norm.length ||
            (item.norm.length === best.norm.length && item.cnt > best.cnt)) {
          best = item;
        }
      }
    });
    return best ? toMeme(best, "contains") : null;
  }

  async function findById(id) {
    const index = await getIndex();
    if (!index) return null;
    return index.byId.get(String(id)) || null;
  }

  function ageText(timestamp) {
    if (!timestamp) return "";
    const diff = Date.now() - timestamp;
    if (diff < 60 * 1000) return "刚刚更新";
    const minutes = Math.floor(diff / (60 * 1000));
    if (minutes < 60) return minutes + " 分钟前更新";
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return hours + " 小时前更新";
    const days = Math.floor(hours / 24);
    return days + " 天前更新";
  }

  global.MemeLib = {
    KEY: KEY,
    PAGE_SIZE: PAGE_SIZE,
    TTL: TTL,
    normalize: normalize,
    refresh: refresh,
    isRefreshing: isRefreshing,
    getCache: getCache,
    isStale: isStale,
    match: match,
    findById: findById,
    ageText: ageText
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
