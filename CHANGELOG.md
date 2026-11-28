# Changelog

本项目所有值得注意的变更都会记录在这里。格式遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，
版本号遵循 [Semantic Versioning](https://semver.org/lang/zh-CN/)。

## [Unreleased]

## [1.2.1] - 2026-11-28

### Fixed

- 修复设置对话框内容超出窗口时无法滚动的问题：设置面板限制为视口高度以内并可纵向滚动，
  矮窗口下也能滚动到达「更新」「数据」和底部「关闭」按钮，不再被裁掉。
  滚动限制只加在设置对话框上，不影响其他短对话框。

## [1.2.0] - 2026-11-28

### Added

- 设置新增「WebDAV 备份（坚果云）」：手动「合并并备份」与「从 WebDAV 合并恢复」，默认远程路径
  `6657star/star-backup.json`，支持通用 HTTPS WebDAV + Basic auth。
- 同步固定为「先 GET 远端 → 按 id 与正文+网址合并 → 保存本地 → 最后 PUT 合并结果」，
  不会用本地数据直接覆盖远端；远端 JSON 无效或不是 star 备份时停止，不写本地也不上传。
- 条目新增 `updatedAt`：同 id 的正文/标题/网址取较新一方，标签取并集，备注/梗取较新或非空一方，
  置顶取 OR；旧数据缺省用 `createdAt`，加载时自动迁移。
- `lib/webdav.js`：逐段校验远程路径并创建目录、ETag 条件写入、412 冲突重新 GET 合并后重试一次、
  20 秒超时与中文错误提示。
- WebDAV 账号与应用密码只存 `storage.local` 独立键，支持「清除凭据」；申请权限时按用户配置的
  HTTPS origin 请求，拒绝则不发起网络请求。
- `scripts/test-merge.test.mjs` 与 `npm test`：覆盖新增、同 id 双向合并、标签并集、补全、
  fingerprint 去重、旧数据、幂等、无效远端不落盘与不删除；CI 运行 `npm test`。

### Changed

- 版本升至 1.2.0；`manifest.json` 的 `optional_host_permissions` 增加 `https://*/*`（可选，按原点申请），
  不新增必选 `host_permissions`。
- 在 1.1.7 的 AMO listed 更新链路之上发布：保留 `manifest.json` 无 `update_url`、设置里的 AMO 商店
  更新说明与 Release workflow 的 listed 提交流程，不恢复 GitHub Release / `updates.json` 自托管更新源，
  也不恢复设置里的「检查更新 / 下载签名 XPI」按钮。
- README 补充坚果云第三方应用密码、默认目录、合并/不删除规则与手动同步说明。

## [1.1.7] - 2026-11-28

### Changed

- 更新源从 GitHub 自托管切回 AMO **listed** 商店：移除 `manifest.json` 的
  `browser_specific_settings.gecko.update_url`，之后由 Firefox 在 `about:addons` 中通过 AMO 检查更新。
- 设置面板移除依赖 `update_url` 的「检查更新 / 应用更新 / 下载签名 XPI」按钮，改为静态说明与
  AMO 商店页面链接，避免无 `update_url` 时出现坏按钮。
- 发版流程改为打 `v*` tag 后用 AMO API 以 `listed` 渠道提交版本；不再做 unlisted 签名、不再生成
  或提交 `updates.json`、不再把 GitHub Release 当更新源。API 提交失败时保留 unsigned zip 供手动上传。
- 本次不含 WebDAV；WebDAV 备份在 1.2.0 合入。

## [1.1.6] - 2026-11-27

### Changed

- 自托管更新测试（无功能变更）：验证 1.1.5 安装后的 GitHub Release + `updates.json` 自动更新链路。

## [1.1.5] - 2026-11-27

### Changed

- 分发方式改为自托管：打 `v*` tag 时，GitHub Actions 用 AMO **unlisted** 渠道签名，把签名 XPI 与
  `SHA256SUMS.txt` 上传到 GitHub Release，不再向 AMO listed 渠道提交新版本。
- `manifest.json` 增加 `update_url`，指向 `https://raw.githubusercontent.com/nothingness0db/star/main/updates.json`；
  Firefox 通过 GitHub Release 自动更新，发版时由 CI 生成 `updates.json`（含 `update_hash`）并提交到 main。
- 设置面板新增「更新」：显示当前版本、手动「检查更新」，发现新版本后可「应用更新并重载」。
- `web-ext` 打包排除 `updates.json`、`docs/`、`scripts/`、`README.md` 与 AMO 上传缓存 `.amo-upload-uuid`。
- 文档改为自托管安装、迁移与发版说明。现有 AMO listed 1.1.4 用户需手动覆盖安装一次 1.1.5 签名 XPI，
  之后由 GitHub 更新；AMO listed 条目保留，是否停用由维护者手动决定。

### Added

- CI：push(main) 与 PR 时跑 `web-ext lint`、`node --check`、manifest 版本一致性校验与 `web-ext build`，
  上传构建产物（保留 7 天）。
- 开源常用文件：CONTRIBUTING、issue/PR 模板、发布文档、编辑器与 Git 配置、badges。

## [1.1.4] - 2026-11-25

### Changed

- 以新 ID \`star@nothingness0db\` 在 AMO 上架（listed 渠道）。旧 ID \`star-public@nothingness0db\` 已被
  自己分发（unlisted）的条目占用，AMO 的渠道在提交时即固定、不可切换。
- 这是最后一个从 AMO listed 渠道分发的版本；1.1.5 起改为自托管（unlisted 签名 + GitHub Release）。

## [1.1.0] - 2026-11-19

### Added

- 6657 烂梗库匹配：收藏时自动归一化文本，整段完全一致（`exact`）或包含长度 ≥ 6 的梗（`contains`）时显示梗 id、热度与标签。
- sb6657.cn 站内收藏：可选授权后，在梗列表条目旁显示星标，点击即可收藏；兼容 Vue SPA 的路由切换与滚动加载。
- 句子库新增「只看梗」筛选，搜索框支持梗 id、梗原文与标签。
- 梗库缓存 7 天自动更新，失败时沿用旧缓存并给出可读提示。

### Changed

- 条目结构可扩展：额外字段在读写、导入导出时原样保留。
- 旧数据兼容：缺失字段补默认值、时间字符串转时间戳、旧字段名收敛到规范字段、跳过无效条目。

## [1.0.0] - 2026-11-15

### Added

- 首个版本：任意网页划选文字 → 右键「收藏这句」，存入本地句子库。
- 句子库页面：搜索（正文/标题/URL，不区分大小写）、展开/收起、复制、删除与撤销、清空二次确认。
- 导出 JSON（完整备份）与 Markdown，导入 JSON 按 id 及「正文 + 网址」去重合并。
- 记录页面标题、URL 与收藏时间，点击来源在新标签页打开原网页。
- Firefox MV3，权限 `storage` / `menus` / `activeTab`，纯本地存储、不收集数据。
