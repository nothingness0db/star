(function (global) {
  "use strict";

  // token 只放在 storage.local 的独立键里；不进 settings、不进日志、不进备份。
  const CREDENTIALS_KEY = "githubGist";
  const API_ROOT = "https://api.github.com";
  const FILE_NAME = "star-backup.json";
  const GIST_DESCRIPTION = "star (sentence-saver) JSON backup — private";

  async function getCredentials() {
    const data = await browser.storage.local.get(CREDENTIALS_KEY);
    const saved = (data && data[CREDENTIALS_KEY]) || {};
    return { token: String(saved.token || ""), gistId: String(saved.gistId || "") };
  }

  async function saveCredentials(patch) {
    const current = await getCredentials();
    const next = {
      token: patch.token === undefined ? current.token : String(patch.token || "").trim(),
      gistId: patch.gistId === undefined ? current.gistId : String(patch.gistId || "").trim()
    };
    await browser.storage.local.set({ [CREDENTIALS_KEY]: next });
    return { gistId: next.gistId, hasToken: Boolean(next.token) };
  }

  function cleanGistId(raw) {
    const value = String(raw || "").trim();
    if (!value) return "";
    // 接受完整 Gist URL，也接受裸 id。
    const match = value.match(/github\.com\/[^/]+\/([0-9a-f]{5,})(?:#.*)?$/i);
    const id = match ? match[1] : value.replace(/^#/, "");
    return /^[0-9a-f]+$/i.test(id) ? id : "";
  }

  function safeError(response) {
    const status = response && response.status;
    if (status === 401 || status === 403) return "GitHub 拒绝了请求：请检查 token 是否有效、是否只授权 gist scope";
    if (status === 404) return "找不到该 Gist，请检查 Gist ID";
    if (status === 422) return "Gist 内容不被接受，请重试";
    if (status >= 500) return "GitHub 服务暂时不可用，请稍后重试";
    return "GitHub 请求失败（HTTP " + (status || "未知") + "）";
  }

  async function request(path, options) {
    const credentials = await getCredentials();
    const headers = {
      "Accept": "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28"
    };
    if (credentials.token) headers.Authorization = "token " + credentials.token;
    Object.assign(headers, (options && options.headers) || {});

    let response;
    try {
      response = await fetch(API_ROOT + path, {
        method: (options && options.method) || "GET",
        headers: headers,
        body: (options && options.body) || undefined,
        cache: "no-store"
      });
    } catch (error) {
      throw new Error("网络错误，无法连接 GitHub API");
    }
    if (!response.ok) {
      // 不读取/转述响应正文，也不把 request 对象或 error 对象带出去，避免泄露 token。
      throw new Error(safeError(response));
    }
    let payload;
    try {
      payload = await response.json();
    } catch (error) {
      throw new Error("GitHub 返回的数据格式异常");
    }
    return payload;
  }

  async function exportToGist() {
    const credentials = await getCredentials();
    if (!credentials.token) throw new Error("请先填写 GitHub token（仅 gist scope）");

    const entries = await global.SentenceStore.getAll();
    const payload = global.SentenceStore.toExportPayload(entries);
    const content = JSON.stringify(payload, null, 2);
    const files = {};
    files[FILE_NAME] = { content: content };

    const gistId = cleanGistId(credentials.gistId);
    let result;
    if (gistId) {
      result = await request("/gists/" + encodeURIComponent(gistId), {
        method: "PATCH",
        body: JSON.stringify({ description: GIST_DESCRIPTION, public: false, files: files })
      });
    } else {
      result = await request("/gists", {
        method: "POST",
        body: JSON.stringify({ description: GIST_DESCRIPTION, public: false, files: files })
      });
    }
    const id = result && result.id ? String(result.id) : gistId;
    if (id && id !== credentials.gistId) await saveCredentials({ gistId: id });
    return { ok: true, gistId: id, count: entries.length, created: !gistId };
  }

  function extractContent(gist) {
    if (!gist || !gist.files || typeof gist.files !== "object") return null;
    const file = gist.files[FILE_NAME];
    if (file && typeof file.content === "string") return file.content;
    // 兼容手工改名后的备份文件：只认 .json，避免把无关文件当备份。
    for (const key of Object.keys(gist.files)) {
      const item = gist.files[key];
      if (/\.json$/i.test(key) && item && typeof item.content === "string") return item.content;
    }
    return null;
  }

  async function importFromGist() {
    const credentials = await getCredentials();
    const gistId = cleanGistId(credentials.gistId);
    if (!gistId) throw new Error("请先填写 Gist ID");
    const gist = await request("/gists/" + encodeURIComponent(gistId));
    const content = extractContent(gist);
    if (!content) throw new Error("这个 Gist 里没有 star 的 JSON 备份文件");
    let payload;
    try {
      payload = JSON.parse(content);
    } catch (error) {
      throw new Error("Gist 备份不是有效的 JSON");
    }
    const result = await global.SentenceStore.importMerge(payload);
    return { ok: true, added: result.added, skipped: result.skipped, invalid: result.invalid, filled: result.filled };
  }

  global.GistBackup = {
    saveCredentials: saveCredentials,
    exportToGist: exportToGist,
    importFromGist: importFromGist,
    FILE_NAME: FILE_NAME
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
