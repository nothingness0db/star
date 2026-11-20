# 发布到 AMO 与自动签名发版

本仓库用 GitHub Actions 在打 tag 时自动 build、用 AMO API 签名，并创建 GitHub Release。
源码是零构建的 Firefox MV3 扩展；不需要 npm 依赖，CI 只全局安装 `web-ext`。

## 1. 获取 AMO API keys

1. 登录 [addons.mozilla.org](https://addons.mozilla.org/)（AMO），进入「Tools → Manage My Add-ons → Developer Hub」。
2. 在账号资料页（[AMO API keys](https://addons.mozilla.org/en-US/developers/addon/api/key/)）生成一组 API key：
   - **JWT issuer** → 对应本仓库的 Secret `AMO_JWT_ISSUER`
   - **JWT secret** → 对应本仓库的 Secret `AMO_JWT_SECRET`
3. 在 GitHub 仓库 **Settings → Secrets and variables → Actions → New repository secret** 分别添加上面两项。
   Secret 一旦保存就无法在页面查看，只能改；不要写进代码、issue、PR 或日志。

> 如果漏配，release workflow 会在「Check AMO API keys」步明确失败并输出
> 「请在 Settings → Secrets 配置 AMO API keys（AMO_JWT_ISSUER、AMO_JWT_SECRET）。」，不会静默成功。

## 2. listed 与 unlisted

| 频道 | 含义 | 审核 | 适用场景 |
| --- | --- | --- | --- |
| `unlisted`（默认） | 签名但不在 AMO 列表展示；可通过直链下载 | 通常自动、几分钟内 | 自用、内测、CI 打 tag 后立刻拿到 xpi |
| `listed` | 上架 AMO 搜索与列表 | **需要人工审核**，可能数天甚至更久 | 正式公开发布 |

首次 listed 上架还需在 Developer Hub 补齐人工资料，例如：扩展详细说明、隐私政策/数据收集声明、
分类与标签、支持网址、源码地址、图标/截图、以及审核问卷。本扩展在 `manifest.json` 中声明
`data_collection_permissions.required = ["none"]`，审核时如实说明「不收集数据」即可。
审核周期不可控：listed 频道下 Release 的 `.xpi` 可能延迟出现或尚未签名；急用请选 `unlisted`。

## 3. 触发发版

### 方式 A：打 tag（自动，unlisted）

```sh
# 先把 manifest.json 与 package.json 的 version 改成同一个版本号，再：
git tag v1.1.0
git push origin v1.1.0
```

tag 必须形如 `v*`；`v` 后面的部分要与 `manifest.json` 和 `package.json` 的 `version` 完全一致，
否则 workflow 会报错并指出三者的值。

### 方式 B：手动触发（可选 listed）

GitHub 仓库 **Actions → Release → Run workflow**，选择分支，并在 `channel` 输入里选 `listed` 或 `unlisted`。
手动触发不校验 tag 版本，但仍需要两个 secrets。若想用 listed 频道并且带 tag，同样先 push tag，再在 Actions 里选 listed 重跑。

## 4. 流水线做了什么

1. checkout → setup-node（Node 20，npm cache）→ `npm i -g web-ext`。
2. 校验 tag 版本 == `manifest.version` == `package.json.version`。
3. `web-ext build --source-dir . --overwrite-dest` 生成未签名 zip。
4. `web-ext sign --source-dir . --channel <channel> --api-key "$AMO_JWT_ISSUER" --api-secret "$AMO_JWT_SECRET"`。
5. 在 `web-ext-artifacts/` 生成 `SHA256SUMS.txt`。
6. `softprops/action-gh-release` 创建/更新 Release，附上 zip、xpi（若产生）与校验文件；正文含版本、安装说明和 listed 人工审核提醒。

## 5. 安装与校验

下载 Release 里的已签名 `.xpi`，在 Firefox 中打开 `about:addons` → 齿轮菜单 → 「从文件安装附加组件…」选择它。
校验完整性：下载 `SHA256SUMS.txt` 与 xpi/zip 放同一目录，运行 `sha256sum -c SHA256SUMS.txt`。
未签名 zip 可用于检查源码或在 `about:debugging` 里临时载入 `manifest.json`。

## 6. 排错

| 现象 | 原因 / 处理 |
| --- | --- |
| 「请在 Settings → Secrets 配置 AMO API keys」 | 两个 Secret 没配或名字拼错；到 Settings → Secrets 重新添加。 |
| tag 版本不匹配 | 改 `manifest.json` 与 `package.json` 的 `version` 到 tag 号，再重新打 tag（`git tag -f` + `git push -f`）。 |
| `web-ext lint` 有 error | 按报错改 manifest / 代码；warning（如 Firefox Android 最低版本提示）不阻塞。 |
| 签名失败 / 401 / 403 | API key 或 secret 错误、过期，或 AMO 账号权限不足；重新生成 Secret。 |
| 一直等不到 xpi（listed） | 人工审核排队，属正常现象；改用 unlisted 或等待审核。 |
| 版本已存在 | AMO 不允许重复版本号；递增 `version` 并重新打 tag。 |

本地想先试一遍（需要自己提供 key/secret 环境变量，别提交它们）：

```sh
npm i -g web-ext
web-ext lint --source-dir .
web-ext build --source-dir . --overwrite-dest
web-ext sign --source-dir . --channel unlisted --api-key "$AMO_JWT_ISSUER" --api-secret "$AMO_JWT_SECRET"
```
