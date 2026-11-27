# 贡献指南

欢迎提 issue 和 PR。本项目是零构建的 Firefox MV3 扩展：源码即扩展，没有打包步骤，也不需要安装 npm 依赖。

## 本地加载

1. 克隆仓库：`git clone https://github.com/nothingness0db/star.git`
2. 打开 Firefox，`about:debugging` → 「此 Firefox」→「临时载入附加组件…」
3. 选择仓库根目录的 `manifest.json`。

临时加载的扩展在 Firefox 关闭后失效；重新打开后按上面步骤再载入一次即可。
如果希望收藏跨重启保留，见 [README 的「让数据跨重启保留」](README.md#让数据跨重启保留)。

## 改代码

- `background.js`：右键菜单、保存、梗匹配、角标反馈、梗库刷新、消息处理
- `lib/store.js`：浏览器存储读写与导入导出（传统脚本，通过 `globalThis.SentenceStore` 暴露）
- `lib/memes.js`：梗库下载、编码解码、缓存与匹配（通过 `globalThis.MemeLib` 暴露）
- `content/sb6657.js`：6657 站内星标（仅在用户授权后注入）
- `library.html` / `library.css` / `library.js`：句子库页面与设置（含「检查更新」）

代码风格：UTF-8、LF、2 空格缩进（见 `.editorconfig`）。没有模块系统，不要用 `import` / `export`。
改完后在 `about:debugging` 里点「重新载入」。

## 跑 lint

先装 web-ext（需要 Node 20+）：

```sh
npm i -g web-ext
npm run lint        # web-ext lint --source-dir .
npm run check       # node --check 所有 JS
npm run build       # web-ext build --source-dir . --overwrite-dest
```

`web-ext lint` 的 error 会让 CI 失败；warning（例如 Firefox Android 的最低版本提示）会打印但不阻塞。
`manifest.json` 与 `package.json` 的 `version` 必须一致，CI 会校验。

打包会按 `web-ext-config.mjs` 的 `ignoreFiles` 排除 `updates.json`（1.1.5/1.1.6 旧清单）、`docs/`、
`scripts/`、README、CHANGELOG 等发版/说明文件，以及 AMO 上传缓存 `.amo-upload-uuid`。
新增同类文件时记得同步排除，避免被打进 XPI。

## 提 PR

1. fork 仓库，从 `main` 开一个分支。
2. 本地跑 `npm run lint` 和 `npm run check`，确认没有 error。
3. 提交时说明改了什么、为什么改；如果改变行为，更新 README 和 CHANGELOG 的 `Unreleased` 段。
4. 开 PR，填 PR 模板，等 CI 通过。review 通过后由维护者合并。

## 发版（维护者）

分发方式是 AMO **listed** 商店：打 `v*` tag 后构建 unsigned zip，并用 AMO API 以 `listed` 渠道提交。
不再做 unlisted 签名，不生成 `updates.json`，也不把 GitHub Release 当作更新源。

1. 更新 `manifest.json` 与 `package.json` 的 `version`，并在 CHANGELOG 里把 `Unreleased` 的内容移到新版本段。
   确认 `manifest.json` 没有 `update_url`。
2. 配置 GitHub Secrets（仓库 Settings → Secrets and variables → Actions）：
   - `AMO_JWT_ISSUER`：AMO API key（JWT issuer）
   - `AMO_JWT_SECRET`：AMO API secret
   获取方法见 [docs/publishing.md](docs/publishing.md)。
3. 本地跑 `npm run lint`、`npm run check`、`npm run build`。
4. 打 tag 并 push：`git tag v1.1.7 && git push origin v1.1.7`
   tag 名必须带 `v` 前缀，且 `v` 后面的版本号要与 `manifest.json` / `package.json` 完全一致，否则 workflow 会报错。
5. `.github/workflows/release.yml` 会自动：
   - 校验 tag 版本与 manifest 无 `update_url`；
   - `web-ext build` 并核验 zip 不含 `scripts/`、`docs/`、测试/发版文件；
   - 用 `scripts/submit-amo.mjs` 以 `listed` 渠道提交 AMO；
   - 保留 unsigned zip artifact 供手动上传兜底。
6. 若 secrets 没配置或 AMO 提交失败，release workflow 会明确失败并提示原因，不会静默成功。
   不要把 API key/secret 写进仓库或 PR。
7. AMO 返回 `public` 表示已上架；返回 `unreviewed` 等状态表示已提交、待审核，这也是成功状态，
   不要伪造已发布。

现有 1.1.5 / 1.1.6 自托管用户不会自动切回商店，需要手动安装一次 1.1.7；之后由 AMO 自动更新。
