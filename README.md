# star · 划词收藏（Firefox 扩展）

[![CI](https://github.com/nothingness0db/star/actions/workflows/ci.yml/badge.svg)](https://github.com/nothingness0db/star/actions/workflows/ci.yml)
[![AMO](https://img.shields.io/amo/v/6657-star?label=AMO)](https://addons.mozilla.org/firefox/addon/6657-star/)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

在任意网页上**划选文字 → 右键「收藏这句」**，句子就存进本地句子库。
之后打开句子库，可以搜索、复制、删除、导出备份，并随时跳回原文来源。

还可以把收藏与 **6657 烂梗库**做匹配：和梗库一致的句子会显示梗 id、热度与标签；
在 `sb6657.cn` 上授权后，每条梗旁边会出现一个星标，点一下即可收藏。

- 纯本地：收藏与梗库缓存都只存在 `browser.storage.local`，不收集、不上传、不需要账号。
- 可选的 GitHub Gist 手动备份：由你主动导出/恢复，只上传收藏 JSON；token 只保存在本机。
- 可选的 WebDAV（坚果云）手动备份：先拉取远端合并、再上传合并结果，避免多设备互相覆盖；账号与应用密码只保存在本机。
- 零构建：没有依赖、没有打包步骤，源码即扩展。
- Manifest V3，Firefox 140+。

### Added

- 快捷键 `Alt+Shift+S` 收藏当前选中文字（可在 about:addons 修改）。
- 条目标签、备注、置顶，以及站点/标签筛选与四种排序；筛选与置顶等状态持久化。
- 设置面板：主题、保存反馈、梗库自动更新、站内授权、GitHub Gist 备份、WebDAV（坚果云）备份、数据统计、备份导入导出与清空。
- 首次安装显示三步引导，关闭后不再自动弹出。

## 安装

从 [AMO 商店页面](https://addons.mozilla.org/firefox/addon/6657-star/) 安装最新版本：

1. 打开 AMO 商店页面，点击「添加到 Firefox」。
2. 在 Firefox 弹出的安装提示中确认；工具栏出现橙色引号图标即安装完成。
3. 首次打开句子库会显示三步引导。

AMO 商店版由 Mozilla 签名，不需要打开 `xpinstall.signatures.required`。

### 从自托管 1.1.5 / 1.1.6 迁移

1.1.5 / 1.1.6 的 `manifest.json` 带 `update_url`，Firefox 只会按它去 GitHub 检查更新，
**不会自动切回 AMO 商店**。需要手动覆盖安装一次 1.1.7：

1. 先导出一份备份（句子库 → 导出备份），以防万一。
2. 打开 [AMO 商店页面](https://addons.mozilla.org/firefox/addon/6657-star/) 安装 1.1.7。
   同一个 ID（`star@nothingness0db`）且版本更高，会直接覆盖旧版，`storage.local` 里的收藏与设置保留。
3. 1.1.7 的 manifest 不再包含 `update_url`，之后 Firefox 会按 AMO 商店检查更新。

其他仍在 1.1.5 / 1.1.6 的用户也需要各自手动安装一次 1.1.7，才会回到商店更新链路。

### 临时加载（开发）

1. 在 Firefox 地址栏打开 `about:debugging`。
2. 左侧选择「**此 Firefox**」。
3. 点击「**临时载入附加组件…**」，进入本目录，选择 `manifest.json`。
4. 工具栏会出现橙色的引号图标。首次加载时右键菜单已自动注册。

> 临时载入的扩展在关闭 Firefox 后会失效，重新打开后按上面步骤再载入一次即可。
> 但要注意：**临时附加组件被卸载时，Firefox 默认会一并清掉它的 `storage.local` 数据**
> （重启浏览器、或在 about:debugging 点「重新载入」都算一次卸载）。如果希望收藏跨重启保留，
> 请按下面「让数据跨重启保留」处理，或直接按上面的「安装」永久安装签名 XPI。

清单里的 `data_collection_permissions` 是 AMO 要求的字段（Firefox 140 起支持），
扩展本身声明为不收集任何数据。`optional_host_permissions` 需要 Firefox 128 起支持，
因此这里建议并使用 Firefox 140+。

### 让数据跨重启保留

临时安装场景下，可在 `about:config` 中把下面两项设为 `true`，再临时载入扩展：

```
extensions.webextensions.keepStorageOnUninstall = true
extensions.webextensions.keepUuidOnUninstall = true
```

这是 Mozilla 官方用于测试重启行为的做法，设置后即使关闭浏览器或用「重新载入」更新扩展，
句子库的数据也会保留。日常长期使用请直接按上面的「安装」永久安装签名 XPI；
永久安装的扩展及其 `storage.local` 会随浏览器重启正常保留。

## 自动更新

- 1.1.7 起从 AMO 商店分发：`manifest.json` 不声明 `update_url`，由 Firefox 在 `about:addons` 中
  按 AMO 商店检查更新，默认大约每 24 小时一次。已装 1.1.7 的用户会按此链路收到 1.2.0（含 WebDAV）。
- 也可以在 `about:addons` 点击扩展的齿轮菜单 →「检查更新」，或打开
  [AMO 商店页面](https://addons.mozilla.org/firefox/addon/6657-star/) 查看最新版本。
- 想更快验证自动更新，可在 `about:config` 把 `extensions.update.interval`（秒）改为 `120`，
  重启 Firefox 后等待检查。
- 自动更新不会静默替换正在运行的 XPI：Firefox 下载新版本后会触发更新可用事件，
  下次启动时自动应用。
- 同 ID 覆盖升级不会清空 `storage.local`：收藏、设置、Gist token 与 WebDAV 凭据都会保留。
  升级后可在「设置 → 数据」确认条目数，并在 WebDAV 分区确认账号仍在。
- 仍在使用自托管 1.1.5 / 1.1.6 的用户不会自动回到商店更新，需要手动安装一次 1.1.7 或更高版本，
  见上面的「从自托管 1.1.5 / 1.1.6 迁移」。

> 设置面板只显示当前版本与 AMO 商店链接；「检查更新」统一交给 Firefox 的 `about:addons`。

## 首次使用

首次安装（`onInstalled` 的 `install` 事件）时，打开句子库会看到欢迎区块，介绍划词右键、快捷键和 6657 授权三步；关闭后不再自动出现，升级也不会弹出。随时可在「设置 → 查看引导」重新打开。

## 使用

### 收藏

在网页中选中文字（可多行），在选区上右键，选择「收藏这句 (S)」，或直接按 `Alt+Shift+S`。
保存成功后工具栏图标上会出现橙色 ✓ 角标，约 2 秒后消失；失败显示红色 !。

- 会自动去掉选中文字首尾的空白，保留中间的换行。
- 同时记录页面标题、页面 URL 和收藏时间。
- 没有选中文字时，右键菜单项不会出现；按快捷键会在页面顶部轻提示「先选中文字」，不会误存。
- 快捷键可在 `about:addons` → 齿轮 → 管理扩展快捷键 里修改。
- 如果已启用 6657 站内收藏，也可以直接点梗条目旁的星标保存（见下文）。

### 句子库

点击工具栏图标，在新标签页打开句子库（`library.html`）。

- **筛选与排序**：可按来源站点、自定义标签筛选，支持时间新→旧 / 旧→新 / 站点 / 标题排序；置顶条目始终在最前。筛选状态会记住。
- **标签 / 备注 / 置顶**：条目上可回车添加标签、× 删除，折叠备注自动保存，📌 切换置顶。
- **搜索**：顶部搜索框也会匹配标签与备注，输入即过滤，
  右侧显示结果数。按 `/` 可快速聚焦搜索框。
- **展开/收起**：正文默认最多显示 4 行，超出时出现「展开」。
- **复制**：点击「复制」写入剪贴板，并短暂提示「已复制」。
- **删除**：删除后底部会弹出「撤销」，几秒内可恢复。
- **清空全部**：需要二次确认。
- **导出**：导出 JSON（完整备份，可再导入）或 Markdown（方便阅读/粘贴到笔记）。
- **导入 JSON**：与现有收藏合并，按 id、以及「正文 + 网址」去重；标签、备注、置顶会一并导入，旧格式 JSON 仍可导入。
- **来源**：点击标题或域名，在新标签页打开原网页。

### GitHub Gist 备份（手动）

在「设置 → GitHub Gist 备份」里可以手动把收藏备份到自己的 Gist，或从 Gist 恢复：

1. 到 GitHub → Settings → Developer settings → Personal access tokens → Tokens (classic)，生成只勾选 **gist** scope 的 token。
2. 在设置里填入 token 并点「保存配置」。token **只保存在本机** `browser.storage.local`，不会写入 `settings`、备份文件或日志。
3. 点「导出到 Gist」：Gist ID 为空时新建一个 **secret Gist**，文件名为 `star-backup.json`；已填 ID 时更新该 Gist 的同一文件。
4. 点「从 Gist 恢复」：读取 Gist 里的 JSON，沿用「导入 JSON」的合并逻辑，按 id 与「正文 + 网址」去重，并显示新增/跳过条数。

第一版只做手动导出/恢复，不做定时或实时同步。备份内容与「导出 JSON」完全一致，只有收藏条目（`app` / `version` / `exportedAt` / `count` / `entries`）；
梗库缓存、设置、token 和 Gist ID 都不会上传。token 只用于 `https://api.github.com/gists` 及 `https://api.github.com/gists/{id}`，请求失败时只显示可读提示，不回显 token。

> 请勿把 token 提交到仓库或贴到截图/日志里。泄露后立即在 GitHub 撤销该 token。

### WebDAV 备份（坚果云，手动）

在「设置 → WebDAV 备份（坚果云）」里可以手动把句子库备份到坚果云或其它 HTTPS WebDAV，
也可以从远端合并恢复。默认服务器是 `https://dav.jianguoyun.com/dav/`，默认远程文件是
`6657star/star-backup.json`（目录名 `6657star` 可改）。

1. 坚果云网页端 → 账户信息 → 安全选项 → **第三方应用管理** → 添加应用，生成一个**应用密码**。
   这里要用应用密码，不是坚果云登录密码。
2. 在设置里填写服务器 URL、账号（邮箱）、应用密码、远程路径，点「保存配置」。第一次会弹出该
   HTTPS 域的权限请求；拒绝授权就不会保存，也不会发起任何网络请求。
3. 点「合并并备份」：扩展先 GET 远端 JSON，与本地按 id 和「正文 + 网址」合并，保存本地后再把
   合并结果 PUT 回远端。任何情况下都不会跳过 GET 直接用本地覆盖远端。
4. 点「从 WebDAV 合并恢复」：只 GET 远端并合并到本地，不上传。

合并规则：

- 相同 id：`text` / `title` / `url` 取 `updatedAt` 较新的一方（相同取本地），标签取并集，
  备注和梗优先非空、都有取较新，置顶取 OR，未知字段保留。
- 不同 id 但「正文 + 网址」相同：视为同一条，保留已有条目并合并标签/备注/梗/置顶，不新增重复。
- 两边各自独有的条目都会保留：远端有本地没有的新增到本地，本地有远端没有的保留并上传。
- 同步是幂等的：同一份数据重复同步不会重复新增或反复改写。
- **删除不会同步**：v1 不做墓碑记录。删一条需要本地和远端都删，否则下次合并它会被另一边带回来。

只做手动同步，不做后台定时或实时同步。账号和应用密码只保存在本机 `browser.storage.local`
的独立 `webdav` 键里，不写入 `settings`、导出 JSON、Gist 备份或日志；密码留空表示不修改。
「清除凭据」会清掉账号和应用密码，保留服务器地址与远程路径。远端 JSON 无效或不是 star 备份时
会报错并停止，不写本地、也不上传。

#### 真实账号手动验收清单

1. 在坚果云建一个测试目录，把远程路径改成 `6657star-test/star-backup.json`，保存配置并授权。
2. 设备 A 本地新增一条独有句子，点「合并并备份」，确认状态行显示新增/更新/补全/总数，远端出现文件。
3. 设备 B（或清空后的另一个配置文件）本地新增另一条独有句子，点「从 WebDAV 合并恢复」，
   确认 A 的句子出现在 B，B 原有句子仍在。
4. 在 B 点「合并并备份」，再回 A「从 WebDAV 合并恢复」，确认两边句子都存在且没有重复条目。
5. 重复点一次同步，确认新增/更新/补全都变成 0（幂等）；再手动删除 A 的一条后同步，确认它会从
   远端回来（符合「删除不会同步」的预期）。
6. 故意把远端文件改成无效内容，点同步，确认报错且本地条目数量不变；恢复文件后再同步。
7. 点「清除凭据」，确认远端请求不再发出，且 `storage.local` 的 `webdav` 键里没有账号和应用密码。

### 梗库

句子库顶部有一条**梗库**状态栏：

- 首次打开会自动下载 6657 烂梗库（约 2.5 万条），显示「梗库下载中… 已拉 N 页」；
  下载完成后显示「梗库 25,6xx 条 · 3 天前更新」。
- 「更新梗库」按钮可手动重拉；缓存超过 7 天时打开库页面会自动更新。
- 更新失败时沿用旧缓存，并在状态栏提示；首次下载失败会显示可读的错误。
- 梗库数据只用于本地匹配，不会上传。

保存句子时（右键菜单或站内星标）会自动匹配：

1. 先把整段文字归一化（去首尾空白、全角转半角、去标点、压缩连续空白）；
2. 整段与某条梗完全一致 → `exact`；
3. 否则看选中文字是否**包含**某条梗，只接受长度 ≥ 6 的梗，取最长命中 → `contains`；
4. 命中后条目写入 `meme: { id, text, tags, cnt, matchType }`。

命中的收藏会在正文上方显示「梗 #12345 · 热度 19」和标签；顶部可以切换「只看梗」，
搜索框也会匹配梗 id、梗原文和标签。未命中的句子完全不显示梗 UI。

同一条「正文 + 网址」重复收藏时不会新增，会提示「已收藏过」，并把旧条目缺失的
`meme` 字段补齐。

### 在 sb6657.cn 启用站内收藏（可选）

Firefox MV3 不会自动授予站点权限，所以默认**不会**在 6657 注入任何脚本。
打开句子库 →「设置」→「在 6657 启用站内收藏」，在浏览器弹窗里同意
`https://sb6657.cn/*` 后，刷新 6657 页面即可。

启用后：

- 在 `/lifecycle`、`/memes/AllBarrage`、`/stale`、`/home`、`/arena`、`/hotwall`
  等有梗文本的列表里，每条梗右侧会出现一个低调的星标；
- 星标是绝对定位的固定列，不改变行高和文本换行，悬停/聚焦提亮，收藏后变为实心；
- 点击星标按该条文本保存，并带上页面能提供的梗 id；已收藏过的条目加载时即为实心；
- 兼容 Vue SPA：路由切换、分页、滚动加载的新条目会被 MutationObserver 追上；
- 星标只拦截自身点击，不会触发站点原有的复制、展开、投票或跳转；
- 在设置里「关闭站内收藏」可随时收回权限；未授权或站点改版都不影响其它收藏功能。

### 数据

`browser.storage.local` 中的结构：

```json
{
  "settings": { "theme": "system", "feedback": { "toast": true, "badge": true }, "autoUpdateMemes": true, "welcomeSeen": false },
  "entries": [
    {
      "id": "crypto.randomUUID() 生成",
      "text": "选中的文字，保留换行",
      "title": "页面标题",
      "url": "页面地址",
      "createdAt": 1732060800000,
      "updatedAt": 1732060800000,
      "source": "contextmenu",
      "tags": ["标签"],
      "note": "备注",
      "pinned": false,
      "meme": {
        "id": 25751,
        "text": "梗库里的原文",
        "tags": "05,18,22",
        "cnt": 23,
        "matchType": "exact"
      }
    }
  ],
  "memes": {
    "fetchedAt": 1732060800000,
    "count": 25697,
    "items": [{ "id": 25751, "text": "…", "cnt": 23, "tags": "05,18,22" }]
  }
}
```

`createdAt` 是毫秒时间戳，默认列表按它倒序排列；置顶条目始终排在最前。`updatedAt` 用于
WebDAV 合并时判断字段新旧，旧数据缺失时默认等于 `createdAt`，新增/编辑/恢复时会刷新。
`source` 标记句子的来源（`contextmenu` 为右键菜单，`site` 为 6657 站内星标）。
条目结构是可扩展的：除上述字段外附加的字段会原样保留，不会在读写、导入导出时被丢弃。

旧数据加载时会做兼容：缺失字段补默认值、时间字符串转时间戳、旧字段名
（`sentence` / `content` / `pageTitle` / `pageUrl` / `time` 等）收敛到规范字段、
无效条目跳过，并把整理后的结果写回存储。

## 设置

点击工具栏图标打开句子库，再点右上角「设置」：

- **主题**：跟随系统 / 浅色 / 深色，立即生效并记住。
- **保存反馈**：工具栏角标、库页面轻提示可分别开关；快捷键无选中时的页面提示始终显示。
- **梗库自动更新**：默认开启，缓存超过 7 天时自动拉取；关闭后只在手动点「更新梗库」时联网，并显示缓存大小。
- **站内增强**：沿用 6657 的授权/撤销流程，只作用于 sb6657.cn，站点改版可能失效。
- **GitHub Gist 备份**：填写仅 gist scope 的 token 与 Gist ID，手动导出到 secret Gist 或从中恢复；token 只存本机。
- **WebDAV 备份（坚果云）**：填写服务器 URL、账号、第三方应用密码与远程路径（默认 `6657star/star-backup.json`），手动「合并并备份」或「从 WebDAV 合并恢复」；凭据只存本机，可清除。
- **更新**：显示当前版本，并给出 AMO 商店页面；更新由 Firefox 在 `about:addons` 中检查。
- **数据**：显示条目数、梗命中数、站点数与占用字节，可导出备份、导入、二次确认清空。

## 权限说明

| 权限 | 用途 |
| --- | --- |
| `storage` | 保存句子库与梗库缓存 |
| `menus` | 添加「收藏这句」右键菜单 |
| `activeTab` + `scripting` | 快捷键读取当前页选中文字，并在无选中时显示页面轻提示 |
| `optional_host_permissions: https://sb6657.cn/*` | 可选：在 6657 页面注入星标、读取梗文本；默认不申请，需在设置里手动开启 |
| `optional_host_permissions: https://*/*` | 可选：WebDAV 备份时按用户填写的 HTTPS 服务器 origin 单独申请；不授权就不发请求 |
| `host_permissions: https://api.github.com/*` | 手动备份/恢复时访问 GitHub Gist API，仅访问 gists 相关路径 |

扩展本身不收集数据；Gist 与 WebDAV 备份都由你手动触发。Gist token、WebDAV 账号与应用密码只存
`storage.local` 独立键，不进入 `settings`、备份内容、日志或任何远端。

没有内容脚本会默认运行：`content/sb6657.js` 只在用户通过「设置」授予
`https://sb6657.cn/*` 后才会被 Firefox 注入。不使用 `notifications`，不收集数据。

## 目录结构

```
manifest.json    扩展清单（MV3）
background.js    右键菜单、保存、梗匹配、角标反馈、梗库刷新、消息处理
content/         6657 站内星标（仅在授权后注入）
  sb6657.js
library.html     句子库页面
library.css      样式（浅色/深色、响应式）
library.js       句子库交互、梗库状态与授权设置
lib/store.js     共享存储与导入导出模块
lib/memes.js     梗库下载、编码解码、缓存与匹配
lib/gist.js      GitHub Gist 手动备份/恢复、token 仅存 storage.local
lib/webdav.js    HTTPS WebDAV 合并备份/恢复、凭据仅存 storage.local
icons/           16/32/48/96 图标
updates.json     1.1.5 / 1.1.6 自托管时期的旧更新清单，1.1.7 起不再更新
scripts/         发版辅助脚本与合并单元测试（不打包进扩展）
```

## 截图

> 待补充：句子库列表、梗库匹配状态栏、6657 站内星标的截图将在此展示。

## 已知限制

- **只存文字与 URL，不做网页快照。** 来源页面被删除、需要登录、或在信息流里被刷走之后，
  原 URL 可能已经对应不到那条内容；此时点击来源只会打开该地址，扩展不会报错，也不做全文抓取。
- 动态页面（如 Twitter/X、部分信息流）刷新后内容会变化，收藏的是当时的文字，
  与 URL 当前显示的内容可能不一致。
- Gist 备份为手动快照，不做实时同步或自动定时；恢复按现有导入规则去重，不会覆盖本地更新的同 id 条目。
- WebDAV 也是手动合并式同步，不做后台定时；删除不做墓碑同步，必须两边都删，否则下次合并会被带回来。
  v1 只支持 HTTPS WebDAV + Basic auth（坚果云第三方应用密码），不支持 HTTP、Digest 或非 HTTPS 服务器。
- 只支持 http/https 页面；`about:`、扩展页等浏览器内部页面不会出现收藏菜单。
- 选中文字若被网页脚本拦截（极少数站点），右键菜单可能拿不到文本；此时会提示失败。
- 收藏量非常大（数万条）时，页面一次性渲染会变慢；日常使用规模没有影响。
- 梗库下载需要访问 `api.hguofichp.cn`；接口被站点限流时会重试一次，仍失败则沿用旧缓存。
  为减少请求数，扩展按每页 1000 条串行拉取（接口支持），并以 `lastPage` 作为终止条件，
  不使用 `total` 硬算页数。
- 站内星标依赖 sb6657.cn 的页面结构（`.meme-text` / `.barrage-text` / `.pk-text` /
  `.rank-text` 等）；如果站点改版，星标可能暂时不出现，但不影响右键收藏、搜索和梗匹配。
- 少数很长的首行在窄窗口下，星标会贴在文字右缘（日志见「开发」中的自检方法）；
  星标不会改变行高或文本换行。
- 临时载入的扩展在 Firefox 重启后需要重新载入；按 Firefox 默认设置，临时附加组件被卸载时
  `storage.local` 会被清空。跨重启保留数据请见上文「让数据跨重启保留」，或永久安装。

## 开发

改完源码后，在 `about:debugging` 里点「重新载入」即可生效。
没有构建命令；JS 为无模块的传统脚本，`lib/store.js` 通过
`globalThis.SentenceStore` 暴露接口，`lib/memes.js` 通过 `globalThis.MemeLib`
暴露梗库能力，`lib/webdav.js` 通过 `globalThis.WebDAVBackup` 暴露 WebDAV 备份，
background 与句子库页面共用同一份实现。

合并逻辑的单元测试用 Node 内置测试运行器：`npm test`；语法检查用 `npm run check`，
web-ext 检查用 `npm run lint`。

站内星标的布局自检可以在 1400 / 800 / 640 三种宽度下逐页检查：星标数量应等于
可见梗条目数；对比隐藏星标前后的条目高度应完全一致；星标不应与文字行、右侧按钮
或热度数字重叠；星标中心 x 在同一列表内应保持一致（`/lifecycle` 的四个阶段面板
各有一条竖线）。

签名、自托管发版与自动更新流程见 [docs/publishing.md](docs/publishing.md)；参与开发见 [CONTRIBUTING.md](CONTRIBUTING.md)。
