# REVIEW-2：6657star 第二轮 Review

- 日期：2026-11-20
- 基线：`main` @ `c77d537`（工作区未提交改动全部纳入本次审查）
- 范围：#20（梗匹配 + 6657 星标）、#24（CI/发版/仓库文件）、#25（快捷键/标签/设置/引导）、#26（release.yml 与 library.js 初始化修复）、#27（FEATURES-GAP.md）
- 本轮只读为主；发现 3 个阻塞问题已就地修复（见「本轮修复」），**未 commit、未 push**，未执行真实 Firefox 渲染与 AMO 签名。

## 1. 工作区与变更范围

`git status --porcelain`：

- 修改 9 个：`.gitignore`、`README.md`、`background.js`、`content/sb6657.js`、`lib/store.js`、`library.css`、`library.html`、`library.js`、`manifest.json`。
- 新增 15 个文件（`git status` 显示 10 个未跟踪条目，其中 `.github/`、`docs/` 为目录）：`.editorconfig`、`.gitattributes`、`.github/`（6 个文件）、`CHANGELOG.md`、`CONTRIBUTING.md`、`FEATURES-GAP.md`、`REVIEW.md`、`docs/`、`package.json`、`package-lock.json`。本轮另新增本报告 `REVIEW-2.md`。
- `git diff --stat`：9 个修改文件，共 1275 insertions / 151 deletions（含本轮修复）。

工作区卫生：

| 检查 | 结果 |
| --- | --- |
| 产物（`*.zip`、`*.xpi`、`web-ext-artifacts/`、`web-ext-lint.json`） | 无 |
| 密钥文件 / 硬编码密钥（`*.pem`、`*.key`、`AMO_JWT_SECRET=...` 等） | 无；workflow 只引用 `${{ secrets.* }}` |
| `.eta/` | 存在但已在 `.gitignore`；`git status --ignored` 中仅为 `!! .eta/`，未被跟踪。内容只有 `MEMORY.md` |
| 换行 | `content/sb6657.js`、`manifest.json` 工作区为 CRLF；`.gitattributes` 的 `text=auto eol=lf` 会在提交时归一化，无功能影响 |

结论：没有产物或密钥被误加入；`.eta` 不会进入提交或打包。

## 2. 检查命令与实际结果

| 命令 | 实际结果 |
| --- | --- |
| `npm run check` | exit 0（5 个 JS 的 `node --check`） |
| `node --check`（background.js、library.js、lib/store.js、lib/memes.js、content/sb6657.js） | 全部 exit 0 |
| `npx web-ext lint --source-dir . --output json`（web-ext 10.8.0，Node 24.19.0） | exit 0；errors=0，warnings=1，notices=0 |
| 唯一 warning | `KEY_FIREFOX_ANDROID_UNSUPPORTED_BY_MIN_VERSION`：`strict_min_version 140.0` 低于 Android 支持 `data_collection_permissions` 的 142；桌面 Firefox 不受影响 |
| manifest / package / package-lock 版本 | 均为 `1.1.0`，三者一致 |
| YAML 解析（ci.yml、release.yml、3 个 issue 模板，js-yaml） | 5/5 通过 |
| `${{ ... }}$` 残留扫描 | `.github/`、`docs/`、`README.md` 均无匹配；release.yml 共 8 处表达式，均为正常结尾 |
| `web-ext build`（临时目录，不污染工作区） | 成功；zip 83,704 字节、26 个条目；不含 `.eta`/`.github`，包含 `manifest.json`；但包含 `REVIEW.md`、`REVIEW-2.md`、`FEATURES-GAP.md`、`docs/`、`package*.json`（见剩余问题「打包」） |
| `console.log` / `TODO` / `debugger` 扫描 | 无 |
| jsdom 集成走查（扩展页面 DOM + storage/runtime/permissions stub） | 通过；结果见第 4 节 |
| `lib/store.js`、`lib/memes.js` 纯逻辑脚本 | 通过：去重、补 `meme`、标签规范化、旧字段导入、删除/恢复、精确/包含匹配均符合预期 |

说明：`web-ext` 来自本机已有安装（10.8.0）；jsdom 只安装在系统临时目录用于测试，未写入仓库，也未成为扩展依赖。

## 3. #26 两处修复的复核

| 复核点 | 结果 |
| --- | --- |
| `release.yml` 表达式结尾 `$` | 已无残留。`channel`、两个 secrets、release 正文表达式均正常；YAML 解析与 `web-ext lint` 通过。未发现同类问题（其它 workflow/文档也无 `}}$`） |
| `library.js` 初始化 IIFE 位置 | 初始化 IIFE 已回到顶层（`library.js:906`），`storage.onChanged` 只负责 `entries`/`memes` 变更后的 reload/refresh；不再嵌在 `changes.entries` 分支内。但顶层初始化本身仍不完整：加载筛选后未回填 select、也未重绘，已在本轮一并修复（见 3.1） |

### 3.1 本轮修复（阻塞问题）

| 严重度 | 文件:行（修复后） | 问题 | 修复与复验 |
| --- | --- | --- | --- |
| 阻塞 | `lib/store.js:97-118` | `sameEntry` 用引用相等比较，而 `normalize()` 每次都新建 `tags` 数组，导致「带标签的条目每次读取都被判定为变化」→ `readNormalized()` 每次 `getAll()` 都写回 storage → 库页面 `storage.onChanged` 再次 `reload()`，形成无限读写/重渲染循环（jsdom 复现为进程不退出；Firefox 对同值 `set` 也可能触发 `onChanged`，见 MDN / bug 1833153） | 改为递归 `sameValue` 深比较；jsdom 下数据不变时 1.2s 内 `storage.set` 调用为 0；完整库路径通过 |
| 阻塞 | `library.html:125` | 卡片模板 `.card-note` 带 `hidden`，`library.js` 从未移除；`[hidden]{display:none!important}` 使「备注」入口完全不可见，与 #25 验收及 README「折叠备注自动保存」矛盾 | 移除 `hidden`；jsdom 验证 `.card-note` 可见、点击后编辑器展开、输入 450ms 后写入 `note` |
| 阻塞 | `library.js:430-455`、`library.js:906-917` | 已保存的站点/标签筛选没有回填到 select；`renderFilterOptions()` 又从 select 空值回写变量，刷新后筛选不生效（排序因单独赋值而正常） | `syncOptions` 改为使用传入的当前值，并在初始化末尾 `render()`；jsdom 验证刷新后 `siteFilter=a.com`、`tagFilter=x`、仅显示 1 条符合筛选的卡片 |

这三项都直接落在核心路径（库页加载、筛选、备注）上，属于必须修复项；`sameEntry` 的写回循环还会持续写 storage，严重时拖慢/卡住库页面。

另删除 `content/sb6657.js`、`manifest.json` 文件末尾多余空行（`git diff --check` 由 exit 2 变为 exit 0），无功能改动。

## 4. 核心路径静态走查结论

图例：✅ 静态/脚本验证通过；🛠 本轮修复后通过；🧪 需 Firefox 真机确认。

| 路径 | 结论 | 依据 |
| --- | --- | --- |
| 右键收藏 → 梗匹配 → 去重保存 | ✅ | `background.js:12-24` 菜单仅对选区显示；`saveEntry`/`resolveMeme`/`addUnique` 链路完整；纯逻辑脚本验证重复收藏不新增、缺 `meme` 时补齐 |
| 库页面渲染 / 搜索 | 🛠 | 无限写回循环已修；jsdom 在无筛选时渲染 2 条，搜索 `beta` 得 1 条 |
| 筛选 / 排序 / 置顶 | 🛠 | 站点+标签筛选刷新后仍生效；jsdom 中置顶后置顶条目排第一；四种排序逻辑见 `library.js:458-472` |
| 标签 / 备注 | 🛠 | 标签经 `storage.onChanged` reload 展示；备注入口修复后可见且自动保存（jsdom 写入 `my note` 成功） |
| 删除 → 撤销 | ✅ | jsdom：删除后 1 条、toast 出现「撤销」、点击恢复为 2 条；`store.restore` 逻辑脚本验证 |
| 导入 / 导出 | ✅ | 导入合并（id 与正文+URL 去重、补 `meme`、跳过无效项）脚本验证；jsdom 导出触发 JSON 与 Markdown 两个下载 |
| 设置（主题/反馈/自动更新/授权/统计） | ✅（静态） | `store.getSettings/saveSettings` 缺省兼容；设置项即时写入；jsdom 中设置成功加载；主题/开关写入路径静态检查 |
| 快捷键（无选中） | 🧪 | `manifest.json:17-24` + `background.js:276-308`：读取选区，空选区走 `pageHint`，不保存；真实按键与页面注入需真机 |
| 6657 授权 / 星标注入 / 去重 / 尺寸 | 🧪 | 授权用 `optional_host_permissions` + `permissions.request`（`library.js:679-792`）；星标按 text+URL 去重（`content/sb6657.js:36-38、152-160`）；图标 18px、命中区 32px（`:12-13`）；SPA/路由/分页逻辑见 `:469-529、600-618`。Firefox 对「仅 optional host 权限 + 静态 content_scripts」的注入行为仍需真机确认 |

## 5. #27 FEATURES-GAP.md 勘误与补注

总体评价：报告的缺口判断、P0/P1 划分、权限/零依赖边界基本成立；没有发现把「没有的能力」写成「已有」的条目，也没有建议引入新权限或第三方依赖。以下为逐条核对后需要修正/补注的地方。

| # | 位置 | 原报告说法 | 核对结果 | 处理建议 |
| --- | --- | --- | --- | --- |
| 1 | 4.2「备注」 | 已有；折叠编辑，450ms 自动保存 | JS 逻辑存在，但 `.card-note` 被 `hidden` 永久隐藏，报告发布时该能力实际不可用 | 本轮已修代码；报告结论在修复后成立，建议补注「原先 UI 不可见」 |
| 2 | 4.3「保存搜索」/现状快照 | 只持久化站点/标签/排序 | 值确实写入了 `filters`，但刷新后 select 未回填、变量被空值覆盖，筛选实际未恢复 | 本轮已修；建议把「持久化」改为「写入但未恢复」的历史事实 |
| 3 | 4.5「旧格式兼容与字段保留」 | 已有；加载时规范化并写回 | 能力成立，但 `sameEntry` 引用比较导致每次读取都写回，带标签条目会触发库页 reload 循环 | 本轮已修；报告未覆盖该稳定性风险，建议补注 |
| 4 | 4.1「保存反馈」 | 工具栏角标 + 库页 toast（成功/失败） | 右键/快捷键有角标与库页 toast；6657 站内保存的提示来自 content script 自己的 toast，不是库页 toast | 措辞改为「右键/快捷键：角标 + 库页 toast；站内：站点内 toast」 |
| 5 | 6.1 / 6.2 / 6.3 验收标准 | 10,000 条首屏 <300ms、批量失败条目不变、模拟配额错误等 | 均为目标/验收条件，没有实现或测量数据 | 保留为「验收目标」，不要写成已验证事实；批量写建议一次 `replaceAll` 保证原子性 |
| 6 | 4.7「站内星标」 | 不触发原页面行为 | 目前显式拦截 pointerdown/mousedown/touchstart/touchend/mouseup 与 click；未拦截 pointerup/pointercancel，理论上站点若监听这些事件仍可能响应 | 改为「静态检查未发现点击穿透；需真机确认」，或补齐事件拦截 |
| 7 | 6.5「梗详情跳转」 | 路由未核实前不写死 URL | 与代码一致（徽标是 `span`，无链接） | 保持；上线前不要凭猜测补 URL |
| 8 | 4.6「无障碍」 | 有 aria/title/focus-visible/reduced-motion，但无 skip link、删除后无焦点管理 | 与代码一致（`library.css:714、781、863`） | 保留 |

关于 P0/P1 与约束：

- 6.1–6.5 均可在现有 `storage` / `menus` / `activeTab` / `scripting` 权限内实现，没有要求 `downloads`、`notifications`、`unlimitedStorage`、全站 host 权限或云端服务。
- 自动备份写的是「提示后用户点击导出」，用的是现有 `<a download>`，不越过权限模型；回收站单独 key 的建议合理。
- 唯一需要警惕的是 6.3 的回收站会额外占用 `storage.local` 配额，报告已提示，但没有给出容量上限策略；实现时应同时处理写入失败。
- 「搜索升级」「标签治理」「回收站」「梗增强」的优先级排序合理；没有把 6657 特殊字段塞进核心条目模型的建议。

## 6. 剩余问题（按严重度）

| 严重度 | 位置 | 问题 | 建议 |
| --- | --- | --- | --- |
| 低 | `README.md:62` | 声称「升级也不会弹出」欢迎区块；实现只检查「曾安装」+`welcomeSeen`，若用户首次从未关闭引导，升级后仍可能再次出现 | 若要严格成立，升级时把 `welcomeViewed` 清掉或记录已提示版本；否则改文案 |
| 低 | `README.md:69` | 声称角标显示「橙色 ✓ / 红色 !」；代码实际设置角标文字为「已收藏」「保存失败」「!」（`background.js:49-90、228、303`） | 统一文案或改实现 |
| 低 | `library.js:309-343` | `renderNote` 的 display 插入/删除 if-else 重复一遍（REVIEW.md 已记录），当前幂等、无行为错误 | 后续清理 |
| 低 | `library.js:55、513-532、611-637` | 「只看梗」未写入 `FILTER_KEY`，刷新后不保留；站点/标签/排序已持久化 | 若要满足「筛选状态记住」，把 `onlyMemes` 一并存取 |
| 低 | `content/sb6657.js` | `/memes/AllBarrage`、`/arena` 超长首行在窄窗口下星标贴行尾（已知取舍，绝对定位不改行高） | 保留；真机确认不遮挡 |
| 低 | 打包 | `web-ext build` 会把 `REVIEW.md`、`REVIEW-2.md`、`FEATURES-GAP.md`、`docs/`、`package*.json` 打进 xpi（26 条目，约 82 KB） | 发布前用 `--ignore-files`/`.web-ext-config` 排除内部报告；或把报告移出源码目录 |
| 中（流程） | `manifest.json:4` / `package.json:3` / `CHANGELOG.md` | 版本仍为 `1.1.0`，但 CHANGELOG 有 `Unreleased`（#25 功能）；本机与远端均未看到 `v1.1.0` tag，版本与功能的对应关系已不清晰 | 发版前确定目标版本（建议 `1.2.0`），同步 manifest/package/lock/CHANGELOG 后再打 tag；若 AMO 已有同名版本，重复版本号会被拒绝 |
| 中（待验证） | `manifest.json:16、28-34` | 仅 `optional_host_permissions` + 静态 `content_scripts`：Firefox 是否在未授权时完全不注入、授权后是否自动注入，静态无法证明 | 真机分别验证「未授权刷新」「授权后刷新」「撤销权限后刷新」 |
| 中（待验证） | `release.yml` 全流程 | AMO 签名、listed 审核、SHA256SUMS、Release 附件均未真实执行 | 用测试 tag 跑一次 unlisted，再核验 xpi 安装 |
| 低 | `manifest.json:9` | `strict_min_version 140.0` 与 `data_collection_permissions` 在 Android 需 142，lint 已警告 | 若不支持 Android，忽略；若要支持，补 `gecko_android` 或提高最低版本 |

上一轮 `REVIEW.md` 的两处「静态通过」结论需要修正：备注入口当时实际不可见，站点/标签筛选当时刷新后不恢复；本轮已修并复验。另需记录：上一轮未发现 `store.js` 的重复写回循环。

## 7. 上线前需人工确认的清单

1. **Firefox 真机渲染与交互**：`about:debugging` 临时载入无报错；库页首屏、深/浅色、700/520/420px 窄屏、控制台无异常；右键收藏、无选中快捷键提示、标签/备注/置顶、筛选刷新保持、删除撤销、JSON/Markdown 导入导出全部走一遍。
2. **6657 授权与星标**：未授权时确认页面无星标/无脚本行为；授权后刷新 `/lifecycle`、`/memes/AllBarrage`、`/arena` 等，核对星标数量、18px 图标/32px 命中区、右侧对齐、实心状态、点击去重与 toast、SPA 路由/分页/125% 缩放；撤销权限后确认星标消失或不再新增。
3. **版本、打包与 AMO 签名**：先把 manifest/package 升到新版本并同步 CHANGELOG；排除内部报告/文档后再 build；配置 `AMO_JWT_ISSUER`/`AMO_JWT_SECRET`，用 unlisted 跑一次 release，下载签名 xpi 安装并核对 `SHA256SUMS.txt`；确认是否接受 Android lint warning。

## 8. 结论

- 修复后的核心路径没有再发现阻塞问题：`npm run check`、`web-ext lint`（0 error/1 warning）、YAML/JSON/版本一致性、`web-ext build` 均通过；jsdom 走查覆盖了渲染、筛选、备注、置顶、删除撤销与导出。
- 本轮修改了 5 个文件：`lib/store.js`、`library.js`、`library.html`（阻塞修复），以及 `content/sb6657.js`、`manifest.json`（仅删除文件末尾空行）；只修阻塞缺陷，未改产品行为；未 commit、未 push。
- **可以提交**；**不建议直接打 tag 发布**。提交前先确认上述 3 项人工验证，并把版本 bump 与内部报告排除做完。
