# Changelog

本项目所有值得注意的变更都会记录在这里。格式遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，
版本号遵循 [Semantic Versioning](https://semver.org/lang/zh-CN/)。

## [Unreleased]

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
