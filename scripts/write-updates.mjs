#!/usr/bin/env node
// 生成 Firefox 自托管更新清单 updates.json。
// 用法：node scripts/write-updates.mjs --version 1.1.5 --xpi web-ext-artifacts/star-1.1.5.xpi
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const DEFAULT_REPO = "nothingness0db/star";
const DEFAULT_OUTPUT = "updates.json";

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
  console.error(`write-updates: ${message}`);
  process.exit(1);
}

const options = parseArgs(process.argv.slice(2));
const version = String(options.version || "").trim();
if (!/^\d+\.\d+\.\d+$/.test(version)) {
  fail("缺少或无效的 --version（应为 X.Y.Z）");
}

const xpiPath = String(options.xpi || "").trim();
if (!xpiPath) fail("缺少 --xpi 签名后的 XPI 路径");

const repo = String(options.repo || DEFAULT_REPO).trim();
const output = resolve(String(options.output || DEFAULT_OUTPUT).trim());
const xpi = await readFile(resolve(xpiPath)).catch(function (error) {
  fail(`无法读取 ${xpiPath}：${error.message}`);
});
const hash = createHash("sha256").update(xpi).digest("hex");

const manifest = {
  addons: {
    "star@nothingness0db": {
      updates: [
        {
          version: version,
          update_link: `https://github.com/${repo}/releases/download/v${version}/star-${version}.xpi`,
          update_hash: `sha256:${hash}`
        }
      ]
    }
  }
};

await writeFile(output, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
console.log(`wrote ${output} (version ${version}, sha256:${hash})`);
