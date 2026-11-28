# REVIEW-3：1.2.x（WebDAV 合并、设置弹窗、AMO listed 更新链路）

- 审查基线：`origin/main` `e5e6ebb`（Merge PR #6，版本 1.2.1）
- 审查范围：1.2.0 的 WebDAV 合并式备份、1.2.1 设置面板滚动修复、AMO listed 发布/更新链路
- 审查方式：逐行读代码 + 合并算法单测 + `npm run check/lint/build` + 检查构建产物；没有连接真实坚果云账号，网络层未做真机请求
- 结论：**未发现 P0**；确认并修复 3 个 P1（WebDAV 元数据被覆盖、时间戳导致合并不幂等、AMO JWT 可能在校验期间过期），其余为 P2/待真机验证项

## 1. 问题清单

### P1（已修复）

| 编号 | 问题 | 证据 | 复现/验证 | 状态 |
| --- | --- | --- | --- | --- |
| P1-1 | 同 id 合并时，远端 `updatedAt` 较新但 `title`/`url` 为空，会把本地已有标题和来源网址清空 | 修复前 `lib/store.js` 的 `mergeSameId()` 对 `text/title/url` 一视同仁赋值；现在 `lib/store.js:317-326` 仅在远端非空时覆盖 `title/url` | 新增单测「同 id：远端较新但标题/网址为空时保留本地来源信息」，构造本地有标题/网址、远端同 id 较新但标题/网址为空的备份，旧代码会断言失败 | 已修复，测试通过 |
| P1-2 | 远端条目缺 `createdAt/updatedAt` 或时间戳无效时，旧 `toTimestamp()` 回退到 `Date.now()`；每次同步都会得到“更新”的远端，`updatedAt` 不断漂移、`updated` 计数永不为 0，无效时间戳还会被当成最新条目覆盖本地正文/标题/网址 | 旧 `toTimestamp()` 在 `lib/store.js:26-39`；合并入口现在对远端使用稳定回退值 `normalize(raw, 0)`（`lib/store.js:354-357`），无效 `updatedAt` 回退到 `createdAt`（`lib/store.js:78-81`） | 新增单测「远端缺时间戳…重复合并不产生 updatedAt 漂移」与「远端 updatedAt 无效时不会伪装成最新…」；旧代码第二次合并 `updated > 0` 且会覆盖本地字段 | 已修复，测试通过 |
| P1-3 | AMO 提交脚本只在启动时签发一次 JWT（有效期 300 秒），但上传校验最多等 7 分钟；校验较慢时后续“创建版本/查询状态”请求会 401，发布失败且已上传的包需要人工重提 | 旧 `scripts/submit-amo.mjs` 单次 `const token = makeJwt(...)`；`VALIDATION_TIMEOUT_MS = 7 * 60 * 1000`。现在每次请求重新签发：`scripts/submit-amo.mjs:73-92`，JWT 生成拆到 `scripts/amo-jwt.mjs` | 新增 `scripts/test-amo-jwt.test.mjs` 校验 300 秒有效期、签名、每次调用新 `jti`；提交脚本另加 60 秒请求超时（`scripts/submit-amo.mjs:15,84`） | 已修复，测试通过 |

### P2（记录，未改或已顺手加固）

| 编号 | 问题 | 证据 | 影响/建议 |
| --- | --- | --- | --- |
| P2-1 | WebDAV 的 20 秒超时只覆盖到 `fetch()` 拿到响应头；`response.text()` 读正文没有超时 | `lib/webdav.js:120-145`、`lib/webdav.js:157-165` | 服务器发出响应头后卡住正文时仍可能长时间等待。建议后续把读正文也纳入 Abort 计时 |
| P2-2 | 远端 GET 没有 ETag 时，PUT 不带 `If-Match`，并发写只能最后写入者获胜 | `lib/webdav.js:193-197` | 标准 WebDAV 通常返回 ETag；坚果云实测需用户确认。可考虑无 ETag 时提示风险或使用 `If-Unmodified-Since` |
| P2-3 | `refreshWebdavUI()` 从 `storage.local` 读出整个 `webdav` 对象（含密码字段）到设置页内存，虽然不进 DOM/日志/导出，但注释“密码不进入页面状态”不严格属实 | `library.js:767-785` | 建议后续通过 background 只返回 `{url, username, path, hasPassword}`，页面不接触密码值 |
| P2-4 | 取消置顶、清空备注无法通过合并传播：`pinned` 取 OR，`note/meme` 两边都有值时取较新、否则取非空 | `lib/store.js:293-298`、`lib/store.js:327-330` | 这是文档声明的“不删除语义”，不是回归；用户需要知道“取消置顶/清空备注”不会同步到另一端 |
| P2-5 | 不同 id 但正文+网址相同的 fingerprint 合并只合并 tags/note/meme/pinned/未知字段，不会采用远端较新的 `title/url` | `lib/store.js:336-347` | 避免重复条目的取舍，符合当前文档；如希望来源标题也能更新，需要单独设计 |
| P2-6 | 远端任意一条无效就拒绝整份备份，同步完全停止 | `lib/store.js:364-365` | 不会污染/覆盖远端，安全优先；但一条坏数据会阻塞全部同步。可后续提供“跳过无效条目并显示明细” |
| P2-7 | 仓库仍保留 1.1.5/1.1.6 时代的 `updates.json` 和 `scripts/write-updates.mjs` | `updates.json`、`scripts/write-updates.mjs` | 运行时代码和 manifest 均未引用，构建已排除，文档标注为旧清单；可后续删除以免误用 |
| P2-8 | AMO API 没有对瞬时 5xx/网络错误重试；tag 重复触发会重复提交同版本 | `scripts/submit-amo.mjs:73-92`、`.github/workflows/release.yml` | 超时已加；建议保持人工确认后重跑，避免重复 POST 上传 |
| P2-9 | Release workflow 校验 tag 与版本一致，但没有校验 tag 提交是否在 main 上 | `.github/workflows/release.yml:60-82` | 人为从旁支打 tag 仍可发版；可加 `git merge-base --is-ancestor` 检查 |
| P2-10 | 设置弹窗用 `100vh` 而不是 `100dvh` | `library.css:425` | 桌面/窄窗口已验证可用；移动端动态地址栏下可能有几十像素差异。当前不是阻塞项 |
| P2-11 | `web-ext lint` 有 1 个既有 warning：Android 140 早于 `data_collection_permissions` 所需的 142 | `manifest.json:9`、`manifest.json:10-12` | 不影响 Firefox 桌面 listed 构建，保持现状 |

## 2. 逐项审查结论

### 2.1 合并算法

- `updatedAt` 迁移：缺 `updatedAt` 时使用 `createdAt`；缺 `createdAt` 时当前远端回退到 0，本地新条目仍由 `add/addUnique` 注入当前时间。见 `lib/store.js:55-87`。
- 同 id 字段级合并：`text/title/url` 取较新一方；标题/网址为空时保留本地的非空值；`tags` 并集（上限 30、单标签 40 字符）；`note/meme` 较新优先、非空补全；`pinned` OR；未知字段只补缺失，不覆盖本地；`updatedAt = max`。见 `lib/store.js:316-334`。
- fingerprint 去重：不同 id、同 `text+url` 只保留已有条目并合并附属字段；远端内部重复 fingerprint 也只会新增一条。见 `lib/store.js:336-347`、`lib/store.js:381-405`。
- 幂等：新增/更新/补全都基于字段是否真实变化计数；补了“远端缺时间戳”“无效时间戳”“远端内部重复 fingerprint”用例。
- 远端无效不落盘：先 `looksLikeStarBackup` + 逐条 `normalize`，任一条无效即抛错，之后才 `readNormalized()`/`save()`。见 `lib/store.js:349-365`。
- 不删除：只做本地与远端并集，没有删除远端或本地缺失条目的分支。单测「不删除」覆盖。
- 排序/统计：合并后 `sortDesc` 按 `createdAt` 降序；返回值 `added/updated/filled/invalid/total`，UI 直接展示。见 `lib/store.js:407-411`。
- 边界已覆盖：同 id 不同正文、空标题/网址、空 note/tags、重复 fingerprint、旧备份无 `updatedAt`、无效 `updatedAt`、超大 tags（`normalizeTags` 截断）均有实现依据；新增 4 个边界单测。

### 2.2 WebDAV 客户端

- URL：只允许 `https:`，拒绝 URL 内账号密码、查询串和 hash；路径拒绝反斜杠、完整 URL、空段、`.`/`..`、解码后斜杠、控制字符、超长段。见 `lib/webdav.js:27-70`。
- 同 origin：`buildFileUrl()` 校验 `target.origin === base.origin` 且路径在服务器基路径下。见 `lib/webdav.js:78-87`。
- 默认值：`https://dav.jianguoyun.com/dav/` 与 `6657star/star-backup.json` 一致。见 `lib/webdav.js:5-8`。
- MKCOL：新建目录，接受 200/201/204/405；409 时递归补父目录后重试一次。见 `lib/webdav.js:174-191`。
- 条件写入：有 ETag 用 `If-Match`；确认远端不存在时用 `If-None-Match: *`；412 重新 GET→合并→重试一次。见 `lib/webdav.js:193-205`、`lib/webdav.js:232-263`。
- 超时与错误映射：20 秒 Abort；401/403、404、409、412、423、507、5xx 都有中文提示。见 `lib/webdav.js:105-145`。
- Basic auth：`TextEncoder` + 分块 `btoa`，支持非 ASCII。见 `lib/webdav.js:95-103`。
- 凭据隔离：只存 `storage.local["webdav"]`；不进 `settings`、导出、Gist、统计和日志。见 `lib/webdav.js:5,16-24,278-309`、`lib/store.js:479-486,567-575`。
- 权限：保存/同步/恢复前请求精确 origin 的 HTTPS 权限，拒绝则不保存或请求。见 `library.js:756-764,921-1068`。
- 未连接真实坚果云，见第 5 节待验证项。

### 2.3 UI

- 设置弹窗滚动：`library.css:423-428` 给 `.settings-dialog` 单独设置 `max-height: calc(100vh - 32px)`、`overflow-y: auto`、`overscroll-behavior: contain`、`scrollbar-gutter: stable`；未改其他 `.dialog`。#112 已在真实 Firefox 161 的 900×607 内容区实测到底部按钮可达；本次静态复核未发现修复被回退。
- 窄/矮窗口：宽度 `min(520px, calc(100vw - 36px))` 加可滚动高度，按钮区在弹窗内容末尾，可滚动到。移动端动态视口差异记为 P2-10。
- 并发：新增 `webdavBusy` 与 `setWebdavBusy()`，保存/同步/恢复/清除四个按钮共用忙碌锁，双击不会发出第二个请求；失败或提前 return 时 `finally` 释放。见 `library.js:79,796-814,921-1053`。
- 密码留空语义：留空不覆盖已保存密码；清除凭据才清空账号和密码。见 `library.js:947`、`lib/webdav.js:278-309`。
- 同步/恢复后 `reload()` 刷新列表；权限拒绝只改状态文本、不发起请求。
- 未重新带回 1.1.7 已删的 GitHub 检查更新/下载签名 XPI：`library.js:825-826` 只显示当前版本和 AMO 说明；源码搜索不到 `update_url` 更新检查、`checkForUpdates`、`downloadUpdate` 等逻辑。

### 2.4 AMO 链路

- `manifest.json` 没有 `update_url`；`background.scripts` 含 `lib/webdav.js`；`optional_host_permissions` 保留 `https://*/*` 供 WebDAV 请求。见 `manifest.json:17,26-27`。
- Release workflow 只走 listed：`--channel listed`，不再做 unlisted 签名、不生成/提交 `updates.json`、不创建 GitHub Release 更新源。见 `.github/workflows/release.yml:143` 及文件头注释。
- tag/版本校验：tag 去掉 `v` 后必须等于 manifest/package 版本，并再次检查无 `update_url`。见 `.github/workflows/release.yml:60-82`。
- pending_review：`public` 记为 published，`disabled/rejected` 失败，其余（含 unreviewed/pending）记为 pending_review，不伪造已发布。见 `scripts/submit-amo.mjs:185-218`。
- JWT/超时：每次请求新 JWT + 60 秒 fetch 超时；secret 只从环境变量读，不打印 token、不拼 URL。见 `scripts/submit-amo.mjs:73-92`。
- 构建产物：本地 `npm run build` 后检查 `web-ext-artifacts/star.zip`，含 `manifest.json`、`background.js`、`library.*`、`lib/webdav.js` 等运行文件；不含 `scripts/`、`docs/`、`.github/`、`updates.json`、README/CHANGELOG/package 文件；manifest 版本 1.2.1、无 `update_url`。Release workflow 现在还会在构建前跑 `npm test` 并校验 `lib/webdav.js` 等必需文件。见 `.github/workflows/release.yml:40-41,110-133`。

### 2.5 数据安全

- 扩展升级不清 `storage.local`：`background.js:26-32` 的 `onInstalled` 只在首次 install 写 `welcomeViewed`，没有清空 entries/settings/凭据；卸载清空是 Firefox 默认行为，README 已说明。
- WebDAV 合并不删除：只有并集，没有删除分支；删除同步是文档声明的限制。
- 导出/Gist 只含句子条目；`toExportPayload()` 只写 `entries`，`stats()` 只统计 entries/memes/settings。见 `lib/store.js:479-486,567-575`。
- XPI/AMO 上传不含 secret：构建排除脚本、文档、`.git`、`web-ext-artifacts` 等；`scripts/` 目录本身也不在 zip 内。
- CI 日志不打印 secret：release 只检查 Secret 是否存在；`submit-amo.mjs` 不输出 JWT/secret，错误响应最多截 2000 字节。见 `.github/workflows/release.yml` “Check AMO API keys”、`scripts/submit-amo.mjs:97-101`。

### 2.6 测试与文档

- 测试从 11 个增至 18 个：新增 4 个合并边界用例、3 个 AMO JWT 用例；`npm test` 现在同时跑 `scripts/test-merge.test.mjs` 和 `scripts/test-amo-jwt.test.mjs`。CI 和 Release workflow 都执行 `npm test`。
- README / CONTRIBUTING / docs/publishing / CHANGELOG 与 AMO listed、无 `update_url`、WebDAV 合并/不删除、凭据隔离的描述一致；`updates.json` 和 `write-updates.mjs` 被明确标为旧自托管遗留，构建排除（P2-7）。
- 已确认没有过期的 GitHub 更新按钮/说明回流到设置面板。

## 3. 本次改动文件

- `lib/store.js`：时间戳回退、同 id 空标题/网址保护、远端合并稳定时间戳。
- `library.js`：WebDAV 操作忙碌锁。
- `scripts/amo-jwt.mjs`：JWT 生成模块（新增）。
- `scripts/submit-amo.mjs`：每请求新 JWT + 60 秒超时。
- `scripts/test-merge.test.mjs`：新增合并边界测试。
- `scripts/test-amo-jwt.test.mjs`：新增 JWT 测试（新增）。
- `package.json`：test/check 脚本纳入新文件。
- `.github/workflows/ci.yml`：加 optional host 权限和 `lib/webdav.js` 背景脚本校验。
- `.github/workflows/release.yml`：构建前跑测试，产物校验必需文件。
- `CHANGELOG.md`：`[Unreleased]` 记录修复。

## 4. 验证结果

```text
npm test      : 18/18 pass
npm run check : pass
npm run lint  : 0 error, 1 warning（既有 Android strict_min_version warning）
npm run build : pass，web-ext-artifacts/star.zip
```

构建产物抽查：版本 1.2.1、无 `update_url`、含 `lib/webdav.js`、不含 scripts/docs/tests/package/README/CHANGELOG。

## 5. 未验证项（需要用户真机）

1. 真实坚果云账号的完整同步：MKCOL、ETag/If-Match、412 重试、401/403/507 的真实返回；本次只用单测和静态检查。
2. 两台真实设备 A/B 的合并、重复同步幂等、远端 JSON 损坏时停止且不覆盖远端。
3. 用户 live Firefox profile 的 AMO 自动更新：1.1.7/1.2.0 → 新版本的实际升级路径（#112 已在临时 profile 实测 1.2.0→1.2.1）。
4. 矮/窄窗口下真实鼠标/触控滚动与按钮点击（#112 已在 Firefox 161 临时环境验证；本次未改 CSS）。
5. AMO API 真实提交一次“校验超过 5 分钟”的场景不容易构造；JWT 行为已用单测验证“每次新 token/300 秒 exp”。

## 6. 下一步 / 是否建议 1.2.2

- **建议发 1.2.2**：P1-1、P1-2 会影响已安装 1.2.x 用户的 WebDAV 合并结果（元数据被清空、每次同步都显示更新），值得尽快给用户；P1-3 影响下一次 AMO 发布可靠性。
- 本任务**未改版本号、未打 tag、未发版**。请确认后把 `manifest.json` / `package.json` 升到 1.2.2、更新 CHANGELOG 版本段，再按 `docs/publishing.md` 打 `v1.2.2` tag；Release workflow 会走 AMO listed。
- 如果只想先合入 review 修复而不立即发版，保持 1.2.1 也可以，但用户在下次发版前仍会受 P1-1/P1-2 影响。

## 7. PR

- 分支：`eta/task-113`，PR 链接见任务报告（不 merge、不 tag）。
