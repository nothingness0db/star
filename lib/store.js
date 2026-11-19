(function (global) {
  "use strict";

  const KEY = "entries";

  function newId() {
    if (global.crypto && typeof global.crypto.randomUUID === "function") {
      return global.crypto.randomUUID();
    }
    return "e-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
  }

  function asString(value) {
    if (typeof value === "string") return value;
    if (value === null || value === undefined) return "";
    return String(value);
  }

  function toTimestamp(value) {
    if (typeof value === "number") return Number.isFinite(value) ? value : Date.now();
    if (value instanceof Date) {
      const time = value.getTime();
      return Number.isFinite(time) ? time : Date.now();
    }
    if (typeof value === "string") {
      const parsed = Date.parse(value);
      if (!Number.isNaN(parsed)) return parsed;
      const numeric = Number(value);
      if (Number.isFinite(numeric)) return numeric;
    }
    return Date.now();
  }

  function normalize(raw) {
    if (!raw || typeof raw !== "object") return null;
    const text = asString(raw.text !== undefined ? raw.text : raw.sentence !== undefined ? raw.sentence : raw.content).trim();
    if (!text) return null;
    const createdAt = raw.createdAt !== undefined ? raw.createdAt
      : raw.created_at !== undefined ? raw.created_at
      : raw.time !== undefined ? raw.time
      : raw.timestamp;

    // 保留未来版本可能附加的字段（如 meme、source），只把旧字段名收敛到规范字段。
    const entry = Object.assign({}, raw);
    delete entry.sentence;
    delete entry.content;
    delete entry.pageTitle;
    delete entry.pageUrl;
    delete entry.created_at;
    delete entry.time;
    delete entry.timestamp;

    entry.id = asString(raw.id).trim() || newId();
    entry.text = text;
    entry.title = asString(raw.title !== undefined ? raw.title : raw.pageTitle).trim();
    entry.url = asString(raw.url !== undefined ? raw.url : raw.pageUrl).trim();
    entry.createdAt = toTimestamp(createdAt);
    return entry;
  }

  function sortDesc(entries) {
    entries.sort(function (a, b) {
      return b.createdAt - a.createdAt;
    });
    return entries;
  }

  function fingerprint(entry) {
    return entry.text.toLowerCase() + "\u0000" + entry.url.toLowerCase();
  }

  function sameEntry(a, b) {
    const aKeys = Object.keys(a);
    const bKeys = Object.keys(b);
    if (aKeys.length !== bKeys.length) return false;
    for (const key of aKeys) {
      if (a[key] !== b[key]) return false;
    }
    return true;
  }

  async function readNormalized() {
    const data = await browser.storage.local.get(KEY);
    let list = data ? data[KEY] : null;
    let changed = false;

    if (list && !Array.isArray(list) && typeof list === "object") {
      list = Object.values(list);
      changed = true;
    }
    if (!Array.isArray(list)) {
      list = [];
      if (data && Object.prototype.hasOwnProperty.call(data, KEY)) changed = true;
    }

    const entries = [];
    const seen = new Set();
    for (const item of list) {
      const entry = normalize(item);
      if (!entry) {
        changed = true;
        continue;
      }
      if (seen.has(entry.id)) {
        entry.id = newId();
        changed = true;
      }
      seen.add(entry.id);
      if (!sameEntry(item, entry)) changed = true;
      entries.push(entry);
    }

    const sorted = sortDesc(entries);

    if (changed) await save(sorted);
    return sorted;
  }

  async function save(entries) {
    await browser.storage.local.set({ [KEY]: entries });
  }

  async function getAll() {
    return readNormalized();
  }

  async function add(input) {
    if (!input || typeof input !== "object") throw new Error("没有可保存的文字");
    const entry = normalize(Object.assign({}, input, {
      createdAt: input.createdAt !== undefined ? input.createdAt : Date.now()
    }));
    if (!entry) throw new Error("没有可保存的文字");
    const entries = await readNormalized();
    entries.push(entry);
    sortDesc(entries);
    await save(entries);
    return entry;
  }

  function hasMeme(entry) {
    return Boolean(entry && entry.meme && entry.meme.id !== undefined && entry.meme.id !== null && entry.meme.id !== "");
  }

  // 按「正文 + 网址」去重保存；重复时给旧条目补齐 meme 字段。
  async function addUnique(input) {
    if (!input || typeof input !== "object") throw new Error("没有可保存的文字");
    const entry = normalize(Object.assign({}, input, {
      createdAt: input.createdAt !== undefined ? input.createdAt : Date.now()
    }));
    if (!entry) throw new Error("没有可保存的文字");

    const entries = await readNormalized();
    const print = fingerprint(entry);
    const existing = entries.find(function (item) {
      return fingerprint(item) === print;
    });

    if (existing) {
      let filled = false;
      if (hasMeme(entry) && !hasMeme(existing)) {
        existing.meme = entry.meme;
        filled = true;
      }
      if (filled) await save(entries);
      return { entry: existing, added: false, duplicate: true, filled: filled };
    }

    entries.push(entry);
    sortDesc(entries);
    await save(entries);
    return { entry: entry, added: true, duplicate: false, filled: false };
  }

  // 给已有条目补 memes：map 为 id -> meme。
  async function setMemes(map) {
    if (!map || typeof map.size !== "number" || map.size === 0) return 0;
    const entries = await readNormalized();
    let changed = 0;
    for (const entry of entries) {
      if (hasMeme(entry)) continue;
      const meme = map.get(entry.id);
      if (!meme) continue;
      entry.meme = meme;
      changed += 1;
    }
    if (changed > 0) await save(entries);
    return changed;
  }

  async function restore(entry) {
    const restored = normalize(entry);
    if (!restored) return null;
    const entries = await readNormalized();
    if (entries.some(function (item) { return item.id === restored.id; })) return null;
    entries.push(restored);
    sortDesc(entries);
    await save(entries);
    return restored;
  }

  async function remove(id) {
    const entries = await readNormalized();
    const index = entries.findIndex(function (item) { return item.id === id; });
    if (index === -1) return null;
    const removed = entries.splice(index, 1)[0];
    await save(entries);
    return removed;
  }

  async function clear() {
    await browser.storage.local.remove(KEY);
  }

  function extractCandidates(payload) {
    if (Array.isArray(payload)) return payload;
    if (payload && typeof payload === "object" && Array.isArray(payload.entries)) return payload.entries;
    return null;
  }

  async function importMerge(payload) {
    const candidates = extractCandidates(payload);
    if (!candidates) throw new Error("文件格式不是句子库备份");
    const entries = await readNormalized();
    const ids = new Set(entries.map(function (item) { return item.id; }));
    const texts = new Set(entries.map(fingerprint));
    let added = 0;
    let skipped = 0;
    let invalid = 0;

    for (const raw of candidates) {
      const entry = normalize(raw);
      if (!entry || !entry.text) {
        invalid += 1;
        continue;
      }
      const print = fingerprint(entry);
      if (ids.has(entry.id) || texts.has(print)) {
        skipped += 1;
        continue;
      }
      ids.add(entry.id);
      texts.add(print);
      entries.push(entry);
      added += 1;
    }

    if (added > 0) {
      sortDesc(entries);
      await save(entries);
    }
    return { added: added, skipped: skipped, invalid: invalid };
  }

  function formatDateTime(timestamp) {
    try {
      return new Intl.DateTimeFormat("zh-CN", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit"
      }).format(new Date(timestamp));
    } catch (err) {
      return "";
    }
  }

  function toExportPayload(entries) {
    return {
      app: "sentence-saver",
      version: 1,
      exportedAt: new Date().toISOString(),
      count: entries.length,
      entries: entries
    };
  }

  function toMarkdown(entries) {
    const lines = [];
    lines.push("# 句子库");
    lines.push("");
    lines.push("> 共 " + entries.length + " 条 · 导出于 " + formatDateTime(Date.now()));
    lines.push("");
    entries.forEach(function (entry, index) {
      lines.push("## " + (index + 1) + ". " + (entry.title || "（无标题）"));
      lines.push("");
      if (entry.url) lines.push("- 来源：" + entry.url);
      lines.push("- 收藏时间：" + formatDateTime(entry.createdAt));
      if (entry.meme && entry.meme.id !== undefined && entry.meme.id !== null) {
        let memeLine = "- 梗：#" + entry.meme.id + "（热度 " + (entry.meme.cnt || 0) + "）";
        if (entry.meme.tags) memeLine += " · " + entry.meme.tags;
        lines.push(memeLine);
      }
      lines.push("");
      entry.text.split(/\r?\n/).forEach(function (line) {
        lines.push("> " + line);
      });
      lines.push("");
    });
    return lines.join("\n");
  }

  global.SentenceStore = {
    getAll: getAll,
    add: add,
    addUnique: addUnique,
    setMemes: setMemes,
    restore: restore,
    remove: remove,
    clear: clear,
    importMerge: importMerge,
    toExportPayload: toExportPayload,
    toMarkdown: toMarkdown,
    formatDateTime: formatDateTime,
    newId: newId
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
