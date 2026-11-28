(function (global) {
  "use strict";

  // 账号与应用密码只放在 storage.local 的独立键里；不进 settings、不进导出、不进日志。
  const CREDENTIALS_KEY = "webdav";
  const DEFAULT_URL = "https://dav.jianguoyun.com/dav/";
  const DEFAULT_PATH = "6657star/star-backup.json";
  const TIMEOUT_MS = 20000;

  function asString(value) {
    if (typeof value === "string") return value;
    if (value === null || value === undefined) return "";
    return String(value);
  }

  async function getConfig() {
    const data = await browser.storage.local.get(CREDENTIALS_KEY);
    const saved = (data && data[CREDENTIALS_KEY]) || {};
    return {
      url: asString(saved.url).trim() || DEFAULT_URL,
      username: asString(saved.username),
      password: asString(saved.password),
      path: asString(saved.path).trim() || DEFAULT_PATH
    };
  }

  function normalizeServerUrl(raw) {
    const value = asString(raw).trim() || DEFAULT_URL;
    let parsed;
    try {
      parsed = new URL(value);
    } catch (error) {
      throw new Error("WebDAV 服务器地址不是有效网址");
    }
    if (parsed.protocol !== "https:") throw new Error("WebDAV 服务器地址必须使用 HTTPS");
    if (parsed.username || parsed.password) throw new Error("不要把账号或密码写进 WebDAV 地址");
    if (parsed.search || parsed.hash) throw new Error("WebDAV 服务器地址不要带查询参数或 # 片段");
    return parsed.href;
  }

  // 路径逐段校验：拒绝绝对路径、反斜杠、空段、. / .. 与控制字符。
  function validatePath(raw) {
    const value = asString(raw).trim() || DEFAULT_PATH;
    if (value.indexOf("\\") !== -1) throw new Error("远程路径不能包含反斜杠");
    if (/^[a-z][a-z0-9+.-]*:/i.test(value) || value.slice(0, 2) === "//") {
      throw new Error("远程路径必须是相对路径，不能是完整网址");
    }
    const trimmed = value.replace(/^\/+|\/+$/g, "");
    const parts = trimmed ? trimmed.split("/") : [];
    if (parts.length === 0) throw new Error("远程路径不能为空");
    const decodedParts = [];
    for (const part of parts) {
      let decoded;
      try {
        decoded = decodeURIComponent(part);
      } catch (error) {
        throw new Error("远程路径包含无效的转义字符");
      }
      if (!part || !decoded.trim() || decoded === "." || decoded === "..") {
        throw new Error("远程路径不能有空段、. 或 ..");
      }
      if (decoded.indexOf("/") !== -1 || decoded.indexOf("\\") !== -1) {
        throw new Error("远程路径的每一段都不能包含斜杠");
      }
      if (/[\u0000-\u001f\u007f]/.test(decoded)) throw new Error("远程路径包含控制字符");
      if (part.length > 200) throw new Error("远程路径的每一段都不能超过 200 个字符");
      decodedParts.push(decoded);
    }
    return decodedParts;
  }

  function baseUrl(serverUrl) {
    const base = new URL(normalizeServerUrl(serverUrl));
    if (!base.pathname.endsWith("/")) base.pathname += "/";
    return base;
  }

  function buildFileUrl(serverUrl, parts) {
    const base = baseUrl(serverUrl);
    const encoded = parts.map(function (part) { return encodeURIComponent(part); }).join("/");
    const target = new URL(encoded, base);
    const basePath = base.pathname.endsWith("/") ? base.pathname : base.pathname + "/";
    if (target.origin !== base.origin || !target.pathname.startsWith(basePath)) {
      throw new Error("远程路径超出了 WebDAV 服务器地址范围");
    }
    return target.href;
  }

  function buildDirectoryUrl(serverUrl, parts) {
    const url = new URL(buildFileUrl(serverUrl, parts));
    if (!url.pathname.endsWith("/")) url.pathname += "/";
    return url.href;
  }

  function utf8Base64(value) {
    const bytes = new TextEncoder().encode(value);
    let binary = "";
    const chunk = 0x8000;
    for (let index = 0; index < bytes.length; index += chunk) {
      binary += String.fromCharCode.apply(null, bytes.subarray(index, index + chunk));
    }
    return btoa(binary);
  }

  function statusMessage(status, phase) {
    if (status === 401 || status === 403) {
      return "WebDAV 拒绝了请求：请检查账号和应用密码；坚果云需要使用第三方应用密码，本扩展仅支持 Basic 认证";
    }
    if (status === 404) return "远端路径不存在，请检查服务器地址与远程路径";
    if (status === 409) return "远端目录冲突或不存在，请检查远程路径与目录权限";
    if (status === 412) return "远端文件已被其他设备修改，请稍后重试";
    if (status === 423) return "远端文件被锁定，请稍后再试";
    if (status === 507) return "WebDAV 空间不足，无法上传备份";
    if (status >= 500) return "WebDAV 服务暂时不可用，请稍后重试";
    if (phase === "MKCOL") return "创建远端目录失败（HTTP " + (status || "未知") + "）";
    if (phase === "PUT") return "上传备份失败（HTTP " + (status || "未知") + "）";
    return "WebDAV 请求失败（HTTP " + (status || "未知") + "）";
  }

  async function request(config, method, url, options) {
    const controller = new AbortController();
    const timer = setTimeout(function () { controller.abort(); }, TIMEOUT_MS);
    const headers = Object.assign({}, (options && options.headers) || {});
    if (config.username || config.password) {
      headers.Authorization = "Basic " + utf8Base64(config.username + ":" + config.password);
    }
    let response;
    try {
      response = await fetch(url, {
        method: method,
        headers: headers,
        body: options && options.body !== undefined ? options.body : undefined,
        cache: "no-store",
        signal: controller.signal
      });
    } catch (error) {
      if (error && error.name === "AbortError") {
        throw new Error("WebDAV 请求超时（20 秒），请检查网络或服务器");
      }
      throw new Error("网络错误，无法连接 WebDAV 服务器");
    } finally {
      clearTimeout(timer);
    }
    return response;
  }

  function parseRemoteText(text) {
    const content = asString(text).replace(/^\uFEFF/, "");
    if (!content.trim()) throw new Error("远端备份文件是空的，已停止以免覆盖");
    try {
      return JSON.parse(content);
    } catch (error) {
      throw new Error("远端备份不是有效的 JSON，已停止以免覆盖");
    }
  }

  async function fetchRemote(config, fileUrl) {
    const response = await request(config, "GET", fileUrl);
    if (response.status === 404) return { exists: false, payload: null, etag: "" };
    if (!response.ok) throw new Error(statusMessage(response.status, "GET"));
    let text;
    try {
      text = await response.text();
    } catch (error) {
      throw new Error("读取远端备份失败，请稍后重试");
    }
    return {
      exists: true,
      payload: parseRemoteText(text),
      etag: response.headers.get("ETag") || ""
    };
  }

  function mkcolAccepted(status) {
    return status === 200 || status === 201 || status === 204 || status === 405;
  }

  async function ensureDirectory(config, serverUrl, parts) {
    if (!parts.length) return;
    const dirUrl = buildDirectoryUrl(serverUrl, parts);
    const response = await request(config, "MKCOL", dirUrl);
    if (mkcolAccepted(response.status)) return;
    if (response.status === 409) {
      // 409 多为父目录还没建好：递归补齐父级后重试一次。
      await ensureDirectory(config, serverUrl, parts.slice(0, -1));
      const retry = await request(config, "MKCOL", dirUrl);
      if (mkcolAccepted(retry.status)) return;
      throw new Error(statusMessage(retry.status, "MKCOL"));
    }
    throw new Error(statusMessage(response.status, "MKCOL"));
  }

  async function putRemote(config, fileUrl, content, etag, isNew) {
    const headers = { "Content-Type": "application/json; charset=utf-8" };
    if (etag) headers["If-Match"] = etag;
    else if (isNew) headers["If-None-Match"] = "*";
    const response = await request(config, "PUT", fileUrl, { headers: headers, body: content });
    if (response.ok) return { etag: response.headers.get("ETag") || etag };
    if (response.status === 412) {
      const error = new Error(statusMessage(412, "PUT"));
      error.code = "conflict";
      throw error;
    }
    throw new Error(statusMessage(response.status, "PUT"));
  }

  function requireCredentials(config) {
    if (!config.username || !config.password) {
      throw new Error("请先保存 WebDAV 账号和应用密码（坚果云请使用第三方应用密码）");
    }
  }

  async function localPayload() {
    const entries = await global.SentenceStore.getAll();
    return {
      entries: entries,
      content: JSON.stringify(global.SentenceStore.toExportPayload(entries), null, 2)
    };
  }

  function mergeStats(result, total, extra) {
    return Object.assign({
      ok: true,
      added: result.added,
      updated: result.updated,
      filled: result.filled,
      invalid: result.invalid,
      total: total
    }, extra || {});
  }

  async function sync() {
    const config = await getConfig();
    requireCredentials(config);
    const parts = validatePath(config.path);
    const fileUrl = buildFileUrl(config.url, parts);

    // 固定顺序：GET 远端 → 合并并保存本地 → 只在最后 PUT 合并结果。
    const remote = await fetchRemote(config, fileUrl);
    const first = await global.SentenceStore.mergeFromRemote(remote.exists ? remote.payload : []);
    let local = await localPayload();
    if (!remote.exists) await ensureDirectory(config, config.url, parts.slice(0, -1));

    try {
      await putRemote(config, fileUrl, local.content, remote.etag, !remote.exists);
      return mergeStats(first, local.entries.length, { retried: false });
    } catch (error) {
      if (!error || error.code !== "conflict") throw error;

      // 412：重新 GET → 再合并 → 重试一次，仍然冲突就报错。
      const fresh = await fetchRemote(config, fileUrl);
      const second = await global.SentenceStore.mergeFromRemote(fresh.exists ? fresh.payload : []);
      local = await localPayload();
      if (!fresh.exists) await ensureDirectory(config, config.url, parts.slice(0, -1));
      await putRemote(config, fileUrl, local.content, fresh.etag, !fresh.exists);
      return mergeStats({
        added: first.added + second.added,
        updated: first.updated + second.updated,
        filled: first.filled + second.filled,
        invalid: 0
      }, local.entries.length, { retried: true });
    }
  }

  async function restore() {
    const config = await getConfig();
    requireCredentials(config);
    const parts = validatePath(config.path);
    const fileUrl = buildFileUrl(config.url, parts);

    // 恢复只 GET → 合并并保存本地，不 PUT。
    const remote = await fetchRemote(config, fileUrl);
    const result = await global.SentenceStore.mergeFromRemote(remote.exists ? remote.payload : []);
    const entries = await global.SentenceStore.getAll();
    return mergeStats(result, entries.length, { missing: !remote.exists });
  }

  async function saveCredentials(patch) {
    patch = patch || {};
    const current = await getConfig();
    const next = {
      url: patch.url === undefined ? current.url : normalizeServerUrl(patch.url),
      username: patch.username === undefined ? current.username : asString(patch.username).trim(),
      password: patch.password === undefined || asString(patch.password) === ""
        ? current.password
        : asString(patch.password),
      path: patch.path === undefined ? current.path : validatePath(patch.path).join("/")
    };
    await browser.storage.local.set({ [CREDENTIALS_KEY]: next });
    return {
      url: next.url,
      username: next.username,
      path: next.path,
      hasPassword: Boolean(next.password)
    };
  }

  async function clearCredentials() {
    const current = await getConfig();
    await browser.storage.local.set({
      [CREDENTIALS_KEY]: {
        url: current.url,
        username: "",
        password: "",
        path: current.path
      }
    });
    return { ok: true };
  }

  global.WebDAVBackup = {
    saveCredentials: saveCredentials,
    sync: sync,
    restore: restore,
    clearCredentials: clearCredentials,
    DEFAULT_URL: DEFAULT_URL,
    DEFAULT_PATH: DEFAULT_PATH
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
