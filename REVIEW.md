# 6657star 整体 Review

- 版本：manifest.json 1.1.0 / package.json 1.1.0（一致）
- Review 范围：#20（梗库匹配 + 6657 站内星标）、#24（CI/发版/仓库文件）、#25（快捷键/标签/设置/引导）
- Review 日期：2026-11-20
- 改动范围：`git status` 显示 9 个修改文件（.gitignore、README.md、background.js、content/sb6657.js、lib/store.js、library.css、library.html、library.js、manifest.json）与 13 个新增文件（.editorconfig、.gitattributes、.github/workflows/{ci,release}.yml、.github/ISSUE_TEMPLATE/*、.github/PULL_REQUEST_TEMPLATE.md、CHANGELOG.md、CONTRIBUTING.md、docs/publishing.md、package.json、package-lock.json）。无产物（zip/xpi/web-ext-artifacts）、无密钥文件；未 commit、未 push。

## 检查命令与结果

| 命令 | 结果 |
| --- | --- |
| `web-ext lint --source-dir . --output json --pretty`（web-ext 10.8.0） | exit 0；errors=0，warnings=1，notices=0。唯一 warning：Firefox Android 最低版本不支持 data_collection_permissions（非阻塞） |
| `node --check` × 5（background.js、library.js、lib/store.js、lib/memes.js、content/sb6657.js） | 全部 exit 0 |
| `npm run check` | exit 0（实际调用上述 5 个 node --check） |
| manifest.json / package.json JSON 解析 + 版本一致性 | 通过，均为 1.1.0 |
| PyYAML 解析 `.github/**/*.yml` | 通过（YAML OK） |
| HTML id 与 JS getElementById 引用 | 无缺失、无重复 id |
| `console.log` / `TODO` 扫描（JS 文件） | 无 |
| 无 secrets 模拟 | 见下方阻塞项 #1：修复前 release workflow 中 `${{ ... }}$` 多出尾随 `$`，会让 channel 校验与签名参数全部失败；已修复 |

说明：`web-ext` 在 review 环境中原先未安装，已在仓库外 `E:/tmp/webext-review` 临时安装 10.8.0 后执行；该目录不在工作区。

## 验收逐项结论

图例：✅ 通过（静态验证） / 🧪 需人工确认（本机无法验证真实 Firefox 行为/网络） / ⚠️ 不通过或有已知取舍

### #20 梗库匹配 + 站内星标

| 验收点 | 结论 | 依据 |
| --- | --- | --- |
| 1. about:debugging 加载无报错；库页显示条数/更新时间；更新完整拉取并缓存；断网沿用旧缓存 | 🧪 | 静态：lib/memes.js 用 `arrayBuffer` + UTF-8 严格解码失败回退 GB18030，`lastPage` 终止，MAX_PAGES=400，失败重试一次；缓存写 storage.local.memes，7 天 TTL；UI 有进度/更新时间/失败沿用提示。真机加载与真实网络需人工 |
| 2. 精确命中 / 包含长梗 / 普通句子无 UI；只看梗；按 id 搜索 | ✅（静态） | lib/memes.js normalize（全角/标点/空白）+ Map 精确 + byFirst 分桶的最长包含（>=6）；library.js searchHaystack 覆盖 id/原文/标签，onlyMemes 过滤 |
| 3. 未授权不注入；授权后 /lifecycle、/memes/AllBarrage 星标可点；同句不重复 | 🧪 | manifest 用 optional_host_permissions + static content_script；library 设置区 permissions.request；content/sb6657.js 按 text+url 去重并提示「已收藏过」。Firefox 在只声明 optional 权限时是否完全不注入静态脚本需人工确认 |
| 4. SPA 路由/分页后仍有星标；不遮挡原交互；125%/窄窗口不遮挡 | 🧪 | MutationObserver + 去抖 + WeakMap 去重 + 路由轮询；按钮绝对定位、只拦截自身事件。Alma 已在 Chromium 实站注入做过自检并发布截图 artifact，但 Firefox 真机需人工 |
| 5. 重启后收藏/梗库缓存/实心状态保留 | ✅（静态） | 全部写 storage.local；content script loadSaved 从 entries 读取 |
| 6. 通用路径（右键、搜索、复制、删除、导出）不回退 | ✅（静态） | background menus.onClicked 与 store.addUnique 保持；library 保留搜索/复制/删除撤销/导出；本次 review 未改这些路径 |
| 星标 18px 图标 / 28px 命中区 / 右侧对齐 | ✅（静态） | content/sb6657.js ICON_SIZE=18、HIT_SIZE=32（>=28），positionStar 固定在条目右侧并按列归一化，静息 opacity .65，已收藏实心。Alma 截图自检报告行高变化 0、间距 >=8px |

### #24 CI / 发版 / 仓库文件

| 验收点 | 结论 | 依据 |
| --- | --- | --- |
| CI：push(main)/PR、checkout@v4/setup-node@v4(node20,npm cache)、web-ext lint、node --check、版本校验、build、artifact 7 天 | ✅（静态） | .github/workflows/ci.yml 内容逐项对应；本机 lint/node --check/版本校验均实测通过 |
| Release：tag v* + workflow_dispatch(channel)、tag 版本校验、secrets 缺失明确报错、build/sign/SHA256SUMS、Release 附三类文件、contents: write | ✅（修复后） | 见阻塞项 #1：已去掉所有 `${{ ... }}$` 的尾随 `$`，channel 校验/签名参数/Release 正文恢复正常 |
| YAML 语法 | ✅ | PyYAML 解析 5 个 YAML 全通过；GitHub Actions 的 `on` 被 YAML 1.1 解释为布尔是工具特性，对 Actions 无影响 |
| 无 secrets 时清晰失败 | ✅（静态） | release.yml 第 73–77 行检查 AMO_JWT_ISSUER/AMO_JWT_SECRET，缺失时输出「请在 Settings → Secrets 配置 AMO API keys…」并 exit 1，不打印值 |
| 文档与实际 workflow 一致、可直接复制 | ✅（静态） | README/CONTRIBUTING/docs/publishing.md 引用 `--source-dir` 与真实 secrets 名；docs 中手动 sign 命令与本 workflow 一致 |
| 工作区无产物与密钥、未 commit/push | ✅ | `git status` + 目录扫描确认 |
| 真实 AMO 签名成功 | 🧪 | 需用户提供 secrets 并在 GitHub Actions 上实际跑 tag；本机不能验证 |

### #25 快捷键 / 标签 / 设置 / 引导

| 验收点 | 结论 | 依据 |
| --- | --- | --- |
| 1. Alt+Shift+S 保存；无选中提示不保存；可改键 | 🧪 | manifest commands.save-selection + scripting 权限；background onCommand 用 scripting 读 selection，无选中调用 pageHint 注入非 alert 提示。真机快捷键与 about:addons 改键需人工 |
| 2. 标签/备注/置顶/排序/筛选可用且刷新保持；置顶始终顶部 | ✅（修复后，静态） | store.normalize 保留 tags/note/pinned；compareEntries 优先 pinned；FILTER_KEY 持久化 site/tag/sort。修复前初始化块被误放进 onChanged(entries) 分支，导致 loadFilters/sortSelect/applyTheme/welcome 在普通打开时可能不执行；已移回顶层（见阻塞项 #2） |
| 3. 设置即时生效、重启保持；关闭自动更新后不拉取；导入导出覆盖新旧字段 | ✅（静态） | theme/feedback/autoUpdateMemes 写 storage.local.settings，getSettings 缺省兼容；background saveEntry/scheduleStaleRefresh 与 library initMemes 均检查 autoUpdateMemes；store.normalize 保留旧字段别名并导出 version 2 全字段 |
| 4. 首次安装欢迎区块、关闭后不再出现、升级不弹 | ✅（修复后，静态） | background onInstalled(reason==="install") 写 welcomeViewed；library 顶层 init 读取该标记与 settings.welcomeSeen 决定是否显示，dismissWelcome 写 welcomeSeen=true |
| 5. 深浅色/窄宽/键盘可达/控制台无报错 | 🧪 | CSS 有 prefers-color-scheme、data-theme dark、420/520/700px 断点；HTML 按钮有 aria-label/focus-visible；JS 无 console.log/TODO。真实渲染与控制台需人工 |
| 6. 原右键收藏/搜索/复制/删除撤销/6657 星标无回退 | ✅（静态） | 代码路径保留；本次 review 只改初始化位置与 workflow 文本 |

## 问题清单

| 严重度 | 位置 | 问题 | 状态 |
| --- | --- | --- | --- |
| 阻塞 | `.github/workflows/release.yml:40,71,72,85,86,88,104,106`（修复前） | 所有 GitHub 表达式写成 `${{ ... }}$`，末尾多一个字面量 `$`。结果：channel 变成 `unlisted$` 导致校验失败；secrets 值被追加 `$` 导致签名失败；Release 标题/正文出现多余 `$`。等价于 tag 发版 100% 失败 | 已修复：删除全部尾随 `$`；YAML 重新解析通过、lint 仍 0 error |
| 阻塞 | `library.js:903–928`（修复前） | 设置/筛选/主题/欢迎的初始化 IIFE 被误放进 `storage.onChanged` 的 `changes.entries` 分支，且 `reload()` 嵌套其中。普通打开库页面时 loadFilters/sortSelect/applyTheme/welcome 不执行；筛选持久化与主题/引导表现不稳定；存储变更时还会多触发一次 reload | 已修复：初始化 IIFE 移回顶层，onChanged 恢复为原有简单 reload；`node --check` 与 `npm run check` 通过 |
| 低 | `library.js:333–339` | `renderNote` 的 display 插入/删除 if-else 逻辑重复了一遍，第二块不会造成行为错误（条件互斥且幂等），但代码冗余 | 记录，未改（非阻塞） |
| 低 | `library.js:511–530` | `onlyMemes`（只看梗）未写入 FILTER_KEY，刷新后不保留；任务 #25 要求「筛选状态记住」但列举的存储字段只含 site/tag/sort | 记录，未改（非阻塞，避免扩大范围） |
| 低 | `content/sb6657.js` | /memes/AllBarrage 与 /arena 的 PK 长首行在窄窗口下星标会贴住行尾（Alma 自检已知取舍：绝对定位、不换行、不改行高） | 记录，未改（已知取舍） |
| 低 | `content/sb6657.js` | Firefox 在仅 optional_host_permissions 下对静态 content_scripts 的注入行为需真机确认；若 Firefox 仍注入但未获权限，需改为 scripting 动态注入 | 🧪 需人工确认 |

## 需人工确认项（本机不能证明）

1. Firefox about:debugging → 载入 manifest.json：无报错；库页面梗库条数/更新时间；下载进度；断网沿用缓存。
2. 保存完全一致文本 / 包含长梗 / 普通句子三种情况；「只看梗」与按梗 id 搜索；右键收藏、复制、删除撤销、导出/导入回归。
3. 站内授权后刷新 /lifecycle 与 /memes/AllBarrage：星标位置/尺寸/点击实心/不遮挡；SPA 路由与分页；125% 缩放与窄窗口。
4. Alt+Shift+S 保存与无选中提示；about:addons 改键；首次安装欢迎区块只出现一次；主题/反馈/自动更新设置即时生效并重启保持。
5. 在 GitHub 上配置 `AMO_JWT_ISSUER` / `AMO_JWT_SECRET` 后打 tag `v1.1.0`，确认 workflow 成功产出签名 xpi；真实 AMO 签名不可在本机验证。

## 安装与验证步骤

1. 打开 Firefox → `about:debugging` → 「此 Firefox」→「临时载入附加组件…」。
2. 选择仓库根目录的 `manifest.json`，确认无错误提示。
3. 点击工具栏扩展图标（或打开 `library.html`）进入句子库，按上面「需人工确认项」逐项验证。
4. 站内星标：先在设置区点「在 6657 启用站内收藏」并刷新 sb6657.cn 页面。
5. 发版：在仓库 Settings → Secrets and variables → Actions 添加两个 AMO secret，确认 manifest/package 版本后 `git tag v1.1.0 && git push origin v1.1.0`（默认 unlisted；listed 在 Actions 页手动触发选择）。

## 结论

两个阻塞问题（release workflow 尾随 `$`、library.js 初始化位置）已修复并复验：`web-ext lint` 0 error/1 warning，5 个 JS `node --check` 全过，`npm run check` 通过，YAML/JSON/版本一致性通过。其余验收项按可验证程度分别标为静态通过或需人工确认；未执行真实 Firefox 渲染与 AMO 签名，未谎报通过。
