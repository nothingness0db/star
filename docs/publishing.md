# 自托管分发与发版

本扩展从 1.1.5 起改为自托管分发：打 `v*` tag 时，GitHub Actions 用 AMO API 以 **unlisted** 渠道签名，
把签名 XPI 上传 GitHub Release，并把 `updates.json` 提交回 `main`。Firefox 通过
`manifest.json` 里的 `update_url` 读取该清单，从 GitHub 自动更新。

源码仍是零构建的 Firefox MV3 扩展：没有 npm 依赖，CI 只全局安装 `web-ext`。

## 1. 分发方式

- 固定使用 ID `star@nothingness0db`，不再向 AMO 的 **listed** 渠道提交新版本。
- 每次发版都用同一 ID 的 **unlisted** 渠道签名；AMO 文档说明同一 add-on 可以同时有 listed 与
  unlisted 版本，API 提交时由 `channel` 字段决定。
- 不删除 AMO 上已有的 1.1.4 listed 条目：删除会软屏蔽所有版本。是否停用由维护者之后手动决定。
- 现有从 AMO 商店安装的 1.1.4 用户**不会**自动迁移到 GitHub 更新，需按 README 手动覆盖安装一次；
  之后才会走 `update_url`。

> 如果 AMO 拒绝同一 ID 的 unlisted 签名，停止并发报告，不要擅自换成旧 ID
> `star-public@nothingness0db` 或新 ID。

## 2. 一次性配置 AMO API keys

1. 登录 [addons.mozilla.org](https://addons.mozilla.org/)（AMO），进入
   「Tools → Manage My Add-ons → Developer Hub」。
2. 在账号资料页（[AMO API keys](https://addons.mozilla.org/en-US/developers/addon/api/key/)）生成一组 API key：
   - **JWT issuer** → 仓库 Secret `AMO_JWT_ISSUER`
   - **JWT secret** → 仓库 Secret `AMO_JWT_SECRET`
3. 在 GitHub 仓库 **Settings → Secrets and variables → Actions → New repository secret** 分别添加。
   Secret 保存后无法在页面查看，只能改；不要写进代码、issue、PR 或日志。

> 漏配时 release workflow 会在「Check AMO API keys」步明确失败并输出
> 「请在 Settings → Secrets and variables → Actions 配置 AMO API keys（AMO_JWT_ISSUER、AMO_JWT_SECRET）。」，
> 不会静默成功。签名失败同样会让 job 失败，不会产出假成功。

## 3. 发版

1. 同步修改 `manifest.json`、`package.json` 的 `version`（例如 `1.1.5`），并在 `CHANGELOG.md`
   里把 `Unreleased` 内容移到新版本段。
2. 本地校验：

   ```sh
   npm i -g web-ext
   npm run lint
   npm run check
   npm run build
   ```

3. 提交后打 tag 并推送：

   ```sh
   git tag v1.1.5
   git push origin v1.1.5
   ```

   tag 必须形如 `v*`；`v` 后面的部分要与 `manifest.json` 和 `package.json` 的 `version` 完全一致，
   否则 workflow 会报错并指出三者的值。

4. `.github/workflows/release.yml` 自动完成剩余工作，不需要手动点 workflow。

## 4. 流水线做了什么

1. checkout（含完整历史）→ setup-node（Node 20，npm cache）→ `npm i -g web-ext`。
2. **Check AMO API keys**：两个 Secret 任一缺失即失败并给出明确提示。
3. **Validate tag version**：`vX.Y.Z` == `manifest.version` == `package.json.version`。
4. **Build unsigned zip**：`web-ext build`，用于确认源码能正常打包。
5. **Sign with AMO (unlisted)**：
   `web-ext sign --channel unlisted --api-key "$AMO_JWT_ISSUER" --api-secret "$AMO_JWT_SECRET"`；
   签名失败或没有产出 `.xpi` 时 job 失败。
6. 把签名产物重命名为固定资产名 `star-<version>.xpi`，生成 `SHA256SUMS.txt` 并自检。
7. `softprops/action-gh-release` 创建/更新该 tag 的 Release，附上签名 XPI 与校验和。
8. 运行 `scripts/write-updates.mjs` 计算 XPI 的 SHA256，生成 `updates.json`，提交到 `main`，
   提交信息为 `chore: update updates.json for v<version> [skip ci]`。

更新清单格式（`main` 分支根目录的 `updates.json`）：

```json
{
  "addons": {
    "star@nothingness0db": {
      "updates": [
        {
          "version": "1.1.5",
          "update_link": "https://github.com/nothingness0db/star/releases/download/v1.1.5/star-1.1.5.xpi",
          "update_hash": "sha256:…"
        }
      ]
    }
  }
}
```

`update_link` 固定指向对应 tag 的 Release 资产；`update_hash` 由 CI 对签名后的 XPI 计算，不要手填。
清单只保留最新版本；Firefox 会把任何更旧的已安装版本升级到该版本。

> 仓库里预置的 `updates.json` 是首次发版前的引导版本：结构完整但不含 `update_hash`。
> 第一次打 tag 时，release workflow 会覆盖它并写入签名 XPI 的真实 SHA256。

## 5. 自动更新与手动检查

- `manifest.json` 声明：

  ```json
  "browser_specific_settings": {
    "gecko": {
      "id": "star@nothingness0db",
      "update_url": "https://raw.githubusercontent.com/nothingness0db/star/main/updates.json"
    }
  }
  ```

- Firefox 默认约每 24 小时检查一次更新，下载后由浏览器应用。
- 扩展「设置 → 更新」提供「检查更新」：优先调用 `runtime.requestUpdateCheck()`（如果浏览器实现）；
  由于 Firefox 目前尚未实现该 API，会回退到 GitHub Releases API 查询最新 Release。状态分为
  检查中 / 已是最新 / 发现更新 / 失败；发现更新后：
  - 如果 Firefox 已下载更新（`runtime.onUpdateAvailable`），显示「应用更新并重载」，调用 `runtime.reload()`；
  - 如果只是手动查到新版本、Firefox 还没下载，显示「下载签名 XPI」按钮，也可以等待自动更新。
  不尝试静默替换 XPI。
- 验证时可把 `about:config` 的 `extensions.update.interval`（秒）临时改为 `120`，重启 Firefox 观察。

## 6. 安装与校验

下载 Release 里的签名 `star-<version>.xpi`，在 Firefox 中打开 `about:addons` → 齿轮菜单 →
「从文件安装附加组件…」选择它。不需要关闭签名校验。

校验完整性：下载 `SHA256SUMS.txt` 与 XPI 放同一目录，运行：

```sh
sha256sum -c SHA256SUMS.txt
```

未签名 zip 只用于检查源码或在 `about:debugging` 里临时载入，不要当作安装包分发。

## 7. 排错

| 现象 | 原因 / 处理 |
| --- | --- |
| 「请在 Settings → Secrets 配置 AMO API keys」 | 两个 Secret 没配或名字拼错；到 Settings → Secrets and variables → Actions 重新添加。 |
| tag 版本不匹配 | 改 `manifest.json` 与 `package.json` 的 `version` 到 tag 号，再重新打 tag（`git tag -f` + `git push -f`）。 |
| AMO unlisted 签名失败 / 401 / 403 | API key 或 secret 错误、过期，或 AMO 不接受该 ID 的 unlisted 渠道；先核对 Secret，仍失败就停止并报告，不要换 ID。 |
| 签名成功但没有 `.xpi` | 查看 `web-ext sign` 输出与 `web-ext-artifacts/`；workflow 会明确失败。 |
| 版本已存在 | AMO 不允许重复版本号；递增 `manifest` / `package` 的 `version` 并重新打 tag。 |
| Release 没更新 | 同一 tag 重跑失败的 job 即可；`softprops/action-gh-release` 会更新现有 Release。 |
| Firefox 不检查更新 | 1.1.4 及更早的 listed 版本没有 `update_url`，需手动安装一次新 XPI；之后确认 `about:config` 的 `extensions.update.interval`，并检查 `updates.json` 可访问、哈希与 XPI 一致。 |
| `updates.json` 提交失败 | 检查 workflow 是否有 `contents: write` 权限、`main` 是否被保护；必要时手动把 CI 生成的 `updates.json` 提交到 main。 |

本地只跑 lint / build（真实签名需要 AMO 凭据，且本仓库约定不在本地签名）：

```sh
npm i -g web-ext
web-ext lint --source-dir . --self-hosted
web-ext build --source-dir . --overwrite-dest
```
