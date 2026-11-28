#!/usr/bin/env node
// 用 AMO API 把 unsigned zip 以指定渠道提交为新版本。
// 用法：AMO_JWT_ISSUER=... AMO_JWT_SECRET=... \
//   node scripts/submit-amo.mjs --xpi web-ext-artifacts/star-1.1.7.zip --version 1.1.7 --channel listed
//
// 只负责上传与提交。提交成功后立即返回；listed 渠道通常还需要 AMO 人工审核，
// 因此 pending review 是正常状态，不等待审核完成。
import { appendFile, readFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { makeJwt } from "./amo-jwt.mjs";

const API_ROOT = "https://addons.mozilla.org/api/v5";
const DEFAULT_ADDON_ID = "star@nothingness0db";
const DEFAULT_ADDON_SLUG = "6657-star";
const REQUEST_TIMEOUT_MS = 60 * 1000;
const VALIDATION_TIMEOUT_MS = 7 * 60 * 1000;
const VALIDATION_INTERVAL_MS = 5 * 1000;
const STATUS_POLLS = 6;
const STATUS_INTERVAL_MS = 10 * 1000;

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const raw = argv[index];
    if (!raw.startsWith("--")) continue;
    const body = raw.slice(2);
    if (body.includes("=")) {
      const splitAt = body.indexOf("=");
      options[body.slice(0, splitAt)] = body.slice(splitAt + 1);
    } else {
      options[body] = argv[index + 1];
      index += 1;
    }
  }
  return options;
}

function fail(message) {
  console.error(`submit-amo: ${message}`);
  process.exit(1);
}

function sleep(ms) {
  return new Promise(function (resolveSleep) {
    setTimeout(resolveSleep, ms);
  });
}

function describeResponse(response, text) {
  return `HTTP ${response.status} ${response.statusText}: ${String(text || "").slice(0, 2000)}`;
}

const options = parseArgs(process.argv.slice(2));
const version = String(options.version || "").trim();
if (!version) fail("缺少 --version");
const xpiPath = String(options.xpi || "").trim();
if (!xpiPath) fail("缺少 --xpi（unsigned zip 路径）");
const channel = String(options.channel || "listed").trim();
if (!["listed", "unlisted", "enterprise"].includes(channel)) {
  fail(`无效的 --channel：${channel}`);
}
const addonId = String(options["addon-id"] || DEFAULT_ADDON_ID).trim();
const addonSlug = String(options["addon-slug"] || DEFAULT_ADDON_SLUG).trim();

const issuer = String(process.env.AMO_JWT_ISSUER || "").trim();
const secret = String(process.env.AMO_JWT_SECRET || "").trim();
if (!issuer || !secret) {
  fail("缺少 AMO_JWT_ISSUER / AMO_JWT_SECRET");
}

const apiBase = String(options["api-root"] || API_ROOT).replace(/\/+$/, "");

async function api(path, init) {
  const request = init || {};
  // 每次请求都重新签发 JWT：上传校验最多等 7 分钟，而 AMO token 只有 5 分钟，
  // 复用同一个 token 会在校验较慢时让后续创建版本/查询状态请求 401。
  const headers = Object.assign({}, request.headers, {
    Authorization: `JWT ${makeJwt(issuer, secret)}`
  });
  let response;
  try {
    response = await fetch(`${apiBase}/${path.replace(/^\/+/, "")}`, Object.assign({}, request, {
      headers,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
    }));
  } catch (error) {
    const reason = error && error.name === "TimeoutError"
      ? `请求超时（${REQUEST_TIMEOUT_MS / 1000} 秒）`
      : String((error && error.message) || error);
    throw new Error(`AMO 请求失败（${path}）：${reason}`);
  }
  const text = await response.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch (error) {
      data = null;
    }
  }
  return { response, text, data };
}

function validationMessages(upload) {
  const validation = upload && upload.validation;
  if (!validation) return "";
  const parts = [];
  for (const key of ["errors", "warnings", "messages"]) {
    if (Array.isArray(validation[key]) && validation[key].length) {
      parts.push(`${key}: ${validation[key].map(function (item) {
        return item && (item.message || item.description || JSON.stringify(item));
      }).join("; ")}`);
    }
  }
  return parts.join(" | ");
}

async function main() {
  const xpi = await readFile(resolve(xpiPath)).catch(function (error) {
    fail(`无法读取 ${xpiPath}：${error.message}`);
  });
  const filename = basename(xpiPath);
  console.log(`上传 ${filename}（${xpi.length} 字节）到 AMO ${channel} 渠道…`);

  const form = new FormData();
  form.append("channel", channel);
  form.append("upload", new Blob([xpi], { type: "application/zip" }), filename);
  let result = await api("addons/upload/", { method: "POST", body: form });
  if (!result.response.ok) {
    fail(`上传失败，${describeResponse(result.response, result.text)}`);
  }
  const uploadUuid = result.data && result.data.uuid;
  if (!uploadUuid) fail("上传响应中没有 uuid");
  console.log(`upload uuid: ${uploadUuid}，等待 AMO 校验…`);

  let upload = result.data;
  const deadline = Date.now() + VALIDATION_TIMEOUT_MS;
  while (!upload.processed && Date.now() < deadline) {
    await sleep(VALIDATION_INTERVAL_MS);
    result = await api(`addons/upload/${encodeURIComponent(uploadUuid)}/`);
    if (!result.response.ok) {
      fail(`查询上传校验状态失败，${describeResponse(result.response, result.text)}`);
    }
    upload = result.data;
    console.log(`校验：processed=${Boolean(upload.processed)} valid=${upload.valid}`);
  }
  if (!upload.processed) fail("AMO 上传校验在 7 分钟内未完成");
  if (!upload.valid) {
    const detail = validationMessages(upload);
    fail(`AMO 校验未通过${detail ? `：${detail}` : ""}`);
  }
  if (upload.version && String(upload.version) !== version) {
    fail(`AMO 从 manifest 读到的版本是 ${upload.version}，与期望的 ${version} 不一致`);
  }

  result = await api(`addons/addon/${encodeURIComponent(addonId)}/versions/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ upload: uploadUuid })
  });
  if (!result.response.ok) {
    fail(`创建 ${channel} 版本失败，${describeResponse(result.response, result.text)}`);
  }
  let versionData = result.data || {};
  const versionId = versionData.id;
  if (!versionId) fail("创建版本的响应中没有 version id");

  let status = String((versionData.file && versionData.file.status) || versionData.status || "unknown");
  let downloadUrl = (versionData.file && versionData.file.url) || "";

  for (let index = 0; index < STATUS_POLLS; index += 1) {
    if (status === "public") break;
    await sleep(STATUS_INTERVAL_MS);
    try {
      const current = await api(`addons/addon/${encodeURIComponent(addonId)}/versions/${encodeURIComponent(versionId)}/`);
      if (current.response.ok && current.data) {
        versionData = current.data;
        status = String((versionData.file && versionData.file.status) || versionData.status || status);
        downloadUrl = (versionData.file && versionData.file.url) || downloadUrl;
      }
    } catch (error) {
      console.warn(`查询版本状态失败（提交已完成，继续按待审核报告）：${error.message}`);
      break;
    }
  }

  const state = status === "public" ? "published" : ["disabled", "rejected"].includes(status) ? "failed" : "pending_review";
  const versionPage = `https://addons.mozilla.org/en-US/developers/addon/${addonSlug}/versions/${versionId}`;
  const summary = {
    state,
    status,
    version,
    channel,
    versionId,
    versionPage,
    downloadUrl: downloadUrl || null
  };
  console.log(JSON.stringify(summary, null, 2));
  console.log(`AMO_SUBMISSION_STATE=${state}`);
  console.log(`AMO_STATUS=${status}`);
  console.log(`AMO_VERSION_PAGE=${versionPage}`);
  if (downloadUrl) console.log(`AMO_XPI_DOWNLOAD=${downloadUrl}`);

  const stepSummary = process.env.GITHUB_STEP_SUMMARY;
  if (stepSummary) {
    const lines = [
      `### AMO ${channel} 提交：${version}`,
      "",
      `- 状态：${state} (${status})`,
      `- 版本页：${versionPage}`,
      downloadUrl ? `- XPI：${downloadUrl}` : "- XPI：审核通过后由 AMO 提供",
      ""
    ];
    await appendFile(stepSummary, lines.join("\n"), "utf8");
  }

  if (state === "failed") {
    fail(`AMO 返回的版本状态为 ${status}`);
  }
}

await main();
