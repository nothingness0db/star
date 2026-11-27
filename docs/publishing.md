# AMO 商店分发与发版

从 1.1.7 起，扩展通过 **AMO listed** 商店分发。打 `v*` tag 时，GitHub Actions 构建 unsigned zip，
再用 AMO API 以 `listed` 渠道提交新版本。Firefox 依据 AMO 商店检查更新，`manifest.json` 不再声明
`update_url`，也不再生成 `updates.json`。

源码仍是零构建的 Firefox MV3 扩展：没有 npm 依赖，CI 只全局安装 `web-ext`。

## 1. 分发方式

- 固定使用 ID `star@nothingness0db`，AMO 商店页为
  <https://addons.mozilla.org/firefox/addon/6657-star/>。
- 1.1.7 起不再做 unlisted 签名，也不再把 GitHub Release 当作更新源。
- 1.1.5 / 1.1.6 的 `manifest.json` 带 `update_url`，这些用户不会自动切回商店；他们需要手动安装一次
  1.1.7（同 ID、更高版本，会覆盖旧版并保留 `storage.local` 数据），之后由 AMO 自动更新。
- AMO 上已有的 1.1.4 listed 条目继续使用，不删除、不换 ID。

## 2. 一次性配置 AMO API keys

1. 登录 [addons.mozilla.org](https://addons.mozilla.org/)（AMO），进入
   「Tools → Manage My Add-ons → Developer Hub」。
2. 在账号资料页（[AMO API keys](https://addons.mozilla.org/en-US/developers/addon/api/key/)）生成一组 API key：
   - **JWT issuer** → 仓库 Secret `AMO_JWT_ISSUER`
   - **JWT secret** → 仓库 Secret `AMO_JWT_SECRET`
3. 在 GitHub 仓库 **Settings → Secrets and variables → Actions → New repository secret** 分别添加。
   Secret 保存后无法在页面查看，只能改；不要写进代码、issue、PR 或日志。

> 漏配时 release workflow 会在「Check AMO API keys」步明确失败，不会静默成功。

## 3. 发版

1. 同步修改 `manifest.json`、`package.json` 的 `version`（例如 `1.1.7`），并在 `CHANGELOG.md`
   里把 `Unreleased` 内容移到新版本段。确认 `manifest.json` **没有** `update_url`。
2. 本地校验：

   ```sh
   npm i -g web-ext
   npm run lint
   npm run check
   npm run build
   ```

3. 提交后打 tag 并推送：

   ```sh
   git tag v1.1.7
   git push origin v1.1.7
   ```

   tag 必须形如 `v*`；`v` 后面的部分要与 `manifest.json` 和 `package.json` 的 `version` 完全一致，
   否则 workflow 会报错并指出三者的值。

4. `.github/workflows/release.yml` 自动完成剩余工作，不需要手动点 workflow。

## 4. 流水线做了什么

1. checkout → setup-node（Node 20，npm cache）→ `npm i -g web-ext`。
2. **Check AMO API keys**：两个 Secret 任一缺失即失败并给出明确提示。
3. **Validate tag version**：`vX.Y.Z` == `manifest.version` == `package.json.version`，
   并确认 manifest 没有 `update_url`。
4. **Build unsigned zip**：`web-ext build`，产物为 `star-<version>.zip`。
5. **Verify build output**：检查 zip 内 manifest 版本为 `<version>`、没有 `update_url`，
   且不含 `scripts/`、`docs/`、`.github/`、`updates.json`、`package.json`、README/CHANGELOG 等文件。
6. **Submit to AMO (listed)**：`scripts/submit-amo.mjs` 用 AMO API 上传 zip、等待校验通过，
   再创建 `listed` 版本。成功后立即返回，不等待人工审核。
7. **Upload unsigned zip for manual fallback**：无论成功失败都保留 unsigned zip（artifact，7 天）。
   如果 API 提交失败，zip 可用于手动上传 AMO Developer Hub；不要拿 unsigned zip 冒充商店签名版。

## 5. 审核状态

- AMO 返回版本状态为 `public`：已上架，报告 AMO 版本页与 XPI 下载链接。
- 状态为 `unreviewed`（或其他非终态）：**已提交，待 AMO 审核**。这是成功状态，版本留在 AMO 队列，
  不要伪造已发布。
- 状态为 `disabled` / `rejected` 或 API 调用失败：workflow 失败并报告错误；不重试换 ID。
- 人工处理入口：<https://addons.mozilla.org/en-US/developers/addon/6657-star/versions/>。

## 6. 自动更新

- `manifest.json` 不声明 `update_url`，Firefox 通过 AMO 商店检查更新，默认约每 24 小时一次。
- 验证时可把 `about:config` 的 `extensions.update.interval`（秒）临时改为 `120`，重启 Firefox 观察。
- 扩展设置面板只显示当前版本与 AMO 商店链接，不再提供手动「检查更新 / 下载 XPI」按钮。

## 7. 排错

| 现象 | 原因 / 处理 |
| --- | --- |
| 「请在 Settings → Secrets 配置 AMO API keys」 | 两个 Secret 没配或名字拼错；到 Settings → Secrets and variables → Actions 重新添加。 |
| tag 版本不匹配 | 改 `manifest.json` 与 `package.json` 的 `version` 到 tag 号，再重新打 tag（`git tag -f` + `git push -f`）。 |
| AMO 上传校验失败 | 查看 workflow 日志里的 validation 详情；修好源码后递增版本重试，不要覆盖已存在的版本号。 |
| AMO 提交 401 / 403 | API key 或 secret 错误、过期；先核对 Secret，仍失败就停止并报告，不要换 ID。 |
| 版本已存在 | AMO 不允许重复版本号；递增版本并重新打 tag。 |
| 提交成功但无 XPI 下载 | listed 版本还需审核；到 AMO 版本页查看状态，审核通过后 AMO 会生成签名 XPI。 |

本地只跑 lint / build（真实提交需要 AMO 凭据）：

```sh
npm i -g web-ext
web-ext lint --source-dir .
web-ext build --source-dir . --overwrite-dest
```
