import test from "node:test";
import assert from "node:assert/strict";

const KEY = "entries";
const data = new Map();

function clone(value) {
  return value === undefined ? undefined : structuredClone(value);
}

const local = {
  async get(key) {
    if (typeof key === "string") {
      if (!data.has(key)) return {};
      return { [key]: clone(data.get(key)) };
    }
    if (Array.isArray(key)) {
      const result = {};
      for (const item of key) {
        if (data.has(item)) result[item] = clone(data.get(item));
      }
      return result;
    }
    return {};
  },
  async set(values) {
    for (const [key, value] of Object.entries(values || {})) {
      data.set(key, clone(value));
    }
  },
  async remove(key) {
    if (Array.isArray(key)) key.forEach(function (item) { data.delete(item); });
    else data.delete(key);
  }
};

globalThis.browser = { storage: { local } };
await import(new URL("../lib/store.js", import.meta.url).href);
const store = globalThis.SentenceStore;

function reset() {
  data.clear();
}

async function seed(entries) {
  await local.set({ [KEY]: entries });
}

async function storedEntries() {
  const result = await local.get(KEY);
  return result[KEY] || [];
}

function makeEntry(id, overrides) {
  return Object.assign({
    id: id,
    text: "句子 " + id,
    title: "标题 " + id,
    url: "https://example.com/" + id,
    createdAt: 1000,
    updatedAt: 1000,
    tags: [],
    note: "",
    pinned: false
  }, overrides || {});
}

function payload(entries) {
  return { app: "sentence-saver", version: 2, count: entries.length, entries: entries };
}

test("新增：远端有而本地没有的条目会加入", async function () {
  reset();
  await seed([]);
  const result = await store.mergeFromRemote(payload([makeEntry("r1", {
    text: "远端新增",
    url: "https://example.com/r1",
    tags: ["远端"]
  })]));
  assert.deepEqual(
    { added: result.added, updated: result.updated, filled: result.filled, total: result.total },
    { added: 1, updated: 0, filled: 0, total: 1 }
  );
  const entries = await store.getAll();
  assert.equal(entries.length, 1);
  assert.equal(entries[0].id, "r1");
  assert.deepEqual(entries[0].tags, ["远端"]);
});

test("同 id：远端较新时更新 text/title/url，并合并标签、备注、梗与置顶", async function () {
  reset();
  await seed([makeEntry("same", {
    text: "本地旧正文",
    title: "本地标题",
    url: "https://example.com/local",
    updatedAt: 1000,
    tags: ["本地"],
    note: "",
    meme: { id: 1, text: "旧梗" }
  })]);
  const result = await store.mergeFromRemote(payload([makeEntry("same", {
    text: "远端新正文",
    title: "远端标题",
    url: "https://example.com/remote",
    updatedAt: 2000,
    tags: ["远端", "本地"],
    note: "远端备注",
    pinned: true,
    meme: { id: 2, text: "新梗" }
  })]));
  const entry = (await store.getAll())[0];
  assert.equal(entry.text, "远端新正文");
  assert.equal(entry.title, "远端标题");
  assert.equal(entry.url, "https://example.com/remote");
  assert.deepEqual(entry.tags, ["本地", "远端"]);
  assert.equal(entry.note, "远端备注");
  assert.equal(entry.pinned, true);
  assert.equal(entry.meme.id, 2);
  assert.equal(entry.updatedAt, 2000);
  assert.equal(result.updated, 1);
  assert.equal(result.total, 1);
});

test("同 id：本地较新时保留本地字段，但仍取标签并集与非空备注/梗", async function () {
  reset();
  await seed([makeEntry("same", {
    text: "本地新正文",
    title: "本地标题",
    url: "https://example.com/local",
    updatedAt: 3000,
    tags: ["本地"],
    note: "本地备注",
    meme: { id: 1, text: "本地梗" }
  })]);
  const result = await store.mergeFromRemote(payload([makeEntry("same", {
    text: "远端旧正文",
    title: "远端标题",
    url: "https://example.com/remote",
    updatedAt: 2000,
    tags: ["远端"],
    note: "远端备注",
    meme: { id: 2, text: "远端梗" }
  })]));
  const entry = (await store.getAll())[0];
  assert.equal(entry.text, "本地新正文");
  assert.equal(entry.title, "本地标题");
  assert.equal(entry.url, "https://example.com/local");
  assert.deepEqual(entry.tags, ["本地", "远端"]);
  assert.equal(entry.note, "本地备注");
  assert.equal(entry.meme.id, 1);
  assert.equal(result.updated, 1);
});

test("补全：本地 note/meme 为空时，较旧的远端值也会补上", async function () {
  reset();
  await seed([makeEntry("same", {
    updatedAt: 5000,
    tags: ["本地"],
    note: "",
    pinned: false
  })]);
  const result = await store.mergeFromRemote(payload([makeEntry("same", {
    updatedAt: 1000,
    tags: [],
    note: "远端补全备注",
    pinned: true,
    meme: { id: 88, text: "远端梗" }
  })]));
  const entry = (await store.getAll())[0];
  assert.equal(entry.note, "远端补全备注");
  assert.equal(entry.meme.id, 88);
  assert.equal(entry.pinned, true);
  assert.deepEqual(entry.tags, ["本地"]);
  assert.equal(result.updated, 1);
});

test("fingerprint：不同 id 但正文+网址相同不新增，合并标签/备注/梗/置顶", async function () {
  reset();
  await seed([makeEntry("local-1", {
    text: "同一条句子",
    url: "https://example.com/post",
    updatedAt: 2000,
    tags: ["本地"],
    note: "本地备注"
  })]);
  const result = await store.mergeFromRemote(payload([makeEntry("remote-1", {
    text: "同一条句子",
    url: "https://example.com/post",
    updatedAt: 3000,
    tags: ["远端"],
    note: "远端备注",
    pinned: true,
    meme: { id: 9, text: "远端梗" }
  })]));
  const entries = await store.getAll();
  assert.equal(entries.length, 1);
  assert.equal(entries[0].id, "local-1");
  assert.deepEqual(entries[0].tags, ["本地", "远端"]);
  assert.equal(entries[0].note, "远端备注");
  assert.equal(entries[0].pinned, true);
  assert.equal(entries[0].meme.id, 9);
  assert.equal(result.added, 0);
  assert.equal(result.filled, 1);
  assert.equal(result.total, 1);
});

test("旧数据：缺 updatedAt 时用 createdAt 作为默认值", async function () {
  reset();
  await seed([{
    id: "old",
    text: "旧数据",
    title: "旧标题",
    url: "https://example.com/old",
    createdAt: 123456,
    tags: ["旧"]
  }]);
  const entry = (await store.getAll())[0];
  assert.equal(entry.updatedAt, 123456);
});

test("同 id 合并保留两边的未知字段", async function () {
  reset();
  await seed([makeEntry("same", {
    updatedAt: 1000,
    localOnly: "保留本地未知字段",
    shared: "本地值"
  })]);
  await store.mergeFromRemote(payload([makeEntry("same", {
    updatedAt: 2000,
    remoteOnly: "保留远端未知字段",
    shared: "远端值"
  })]));
  const entry = (await store.getAll())[0];
  assert.equal(entry.localOnly, "保留本地未知字段");
  assert.equal(entry.remoteOnly, "保留远端未知字段");
  assert.equal(entry.shared, "本地值");
});

test("幂等：同一份远端数据重复合并，第二次 added/updated/filled 都为 0", async function () {
  reset();
  await seed([makeEntry("local-1", {
    text: "本地",
    url: "https://example.com/local",
    updatedAt: 1000,
    tags: ["本地"]
  })]);
  const remote = payload([
    makeEntry("local-1", {
      text: "合并后",
      url: "https://example.com/local",
      updatedAt: 2000,
      tags: ["远端"],
      note: "备注"
    }),
    makeEntry("remote-2", {
      text: "远端新增",
      url: "https://example.com/remote-2"
    })
  ]);
  const first = await store.mergeFromRemote(remote);
  assert.equal(first.added, 1);
  assert.equal(first.total, 2);
  const before = JSON.stringify(await storedEntries());
  const second = await store.mergeFromRemote(remote);
  assert.deepEqual(
    { added: second.added, updated: second.updated, filled: second.filled },
    { added: 0, updated: 0, filled: 0 }
  );
  assert.equal(second.total, 2);
  assert.equal(JSON.stringify(await storedEntries()), before);
});

test("远端无效时不写本地", async function () {
  reset();
  await seed([makeEntry("keep")]);
  const before = JSON.stringify(await storedEntries());
  const invalidPayloads = [
    null,
    { foo: "bar" },
    { app: "other-app", entries: [makeEntry("x")] },
    { app: "sentence-saver", entries: [{ id: "no-text" }] },
    { app: "sentence-saver", entries: [makeEntry("ok"), { id: "bad" }] }
  ];
  for (const item of invalidPayloads) {
    await assert.rejects(function () { return store.mergeFromRemote(item); });
    assert.equal(JSON.stringify(await storedEntries()), before);
  }
});

test("不删除：本地有远端没有的保留，远端有本地没有的新增", async function () {
  reset();
  await seed([
    makeEntry("local-keep-1"),
    makeEntry("local-keep-2")
  ]);
  const result = await store.mergeFromRemote(payload([
    makeEntry("remote-new"),
    makeEntry("local-keep-1", { tags: ["远端"], updatedAt: 2000 })
  ]));
  const entries = await store.getAll();
  const ids = entries.map(function (entry) { return entry.id; }).sort();
  assert.deepEqual(ids, ["local-keep-1", "local-keep-2", "remote-new"]);
  assert.equal(result.added, 1);
  assert.equal(result.total, 3);
});

test("add/update/restore 会刷新 updatedAt", async function () {
  reset();
  const before = Date.now();
  const added = await store.add({ id: "a", text: "新增", url: "https://example.com/a" });
  assert.ok(added.updatedAt >= before);

  await seed([makeEntry("u", { updatedAt: 1000 })]);
  const updated = await store.update("u", { text: "更新后" });
  assert.equal(updated.text, "更新后");
  assert.ok(updated.updatedAt > 1000);

  await seed([makeEntry("r", { updatedAt: 1000 })]);
  await store.remove("r");
  const restored = await store.restore(makeEntry("r", { updatedAt: 1000 }));
  assert.ok(restored.updatedAt > 1000);
});
