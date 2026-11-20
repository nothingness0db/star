# Changelog

本项目所有值得注意的变更都会记录在这里。格式遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，
版本号遵循 [Semantic Versioning](https://semver.org/lang/zh-CN/)。

## [Unreleased]

### Added

- 快捷键 Alt+Shift+S、标签/备注/置顶、排序与筛选、设置面板、首次安装引导。

- CI：push(main) 与 PR 时跑 `web-ext lint`、`node --check`、manifest 版本一致性校验与 `web-ext build`，上传构建产物（保留 7 天）。
- 发版流水线：打 `v*` tag 自动 build、AMO 签名、生成 `SHA256SUMS.txt` 并创建 GitHub Release；支持 `workflow_dispatch` 选择 `listed` / `unlisted` 频道。
- 开源常用文件：CONTRIBUTING、issue/PR 模板、发布文档、编辑器与 Git 配置、badges。

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
