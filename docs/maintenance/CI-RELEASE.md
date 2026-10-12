# CI 检查与草稿发布

2026-10-12，调整桌面仓库 `.github/workflows/release.yml`，保留 Node 24.21.0、npm 12.0.2、所有依赖版本和三份锁文件。开始时已有子模块指针差异 `f7c6ca2` → `dc43dbd`，本次不修改该差异或子模块文件。

## 失败原因

[原运行](https://github.com/MapleSugarCake/listen1_desktop/actions/runs/38195198184) 的三个系统均在根目录 `npm ci` 报 `EALLOWREMOTE`，测试和构建没有执行。npm 12 默认禁止任意远程 tarball URL；根锁文件的下载地址指向 npmmirror，而 CI registry 是官方 npm 源，地址未被识别为当前 registry 的下载。Windows 的 `EPERM` 是清理警告。

CI 统一设置 `npm_config_registry=https://registry.npmjs.org` 和 `npm_config_replace_registry_host=registry.npmmirror.com`，仅映射锁文件中的该镜像地址，保留版本和 integrity。该环境也传给根 postinstall 中的桌面运行依赖安装，不开启 `allow-remote=all`。规则依据 [npm 安装文档](https://docs.npmjs.com/cli/install/#allow-remote)。

本机另发现 Git 的 `core.autocrlf=true` 将已提交的 LF 转为 CRLF，导致 vendor 检查首先在 Angular 失败：工作区文件 177720 字节、352 个 CRLF，npm 原件 177368 字节、无 CRLF。临时检出保留 LF 后全部 vendor 校验通过。因此 CI 使用进程级 `GIT_CONFIG_COUNT=1`、`GIT_CONFIG_KEY_0=core.autocrlf`、`GIT_CONFIG_VALUE_0=false`，保持提交字节；原子模块和用户全局 Git 配置不改。环境变量约定见 [Git 配置文档](https://git-scm.com/docs/git-config#Documentation/git-config.txt-GITCONFIGCOUNT)。

## 生效流程

- 面向 `master` 的 PR：Windows、macOS、Ubuntu 安装依赖，运行行为测试、子模块 lint 和 vendor 校验，不打包或发布。
- `master` push：全部检查成功后运行既有 `dist:win`、`dist:mac`、`dist:linux`，后者显式包含 x64/arm64。普通开发分支 push 不触发。
- `v*` 标签：先验证标签等于 `v<根版本>` 且两个桌面包版本一致；全部检查通过后构建及上传产物，再由独立任务创建草稿。
- 安装包、生成的更新元数据及已有 blockmap 收集为 `listen1-win`、`listen1-mac`、`listen1-linux`，Actions artifact 保留 14 天。收集器要求既有各架构/格式产物及更新元数据齐全，排除解包目录和 builder 调试文件。Windows NSIS 同时保留合并安装器与分架构安装器，避免更新元数据引用的文件缺失。
- 仅草稿任务有 `contents: write` 权限。下载 artifact 时校验摘要；发布前再次检查所有平台的文件。新草稿使用 `gh release create --draft --verify-tag`，已有草稿可刷新附件；已有公开 Release 拒绝覆盖。人工确认附件和说明后公开草稿。CLI 行为见 [create](https://cli.github.com/manual/gh_release_create) 和 [upload](https://cli.github.com/manual/gh_release_upload)。

辅助脚本为 [release.cjs](../../scripts/release.cjs)，行为测试为 [release.test.cjs](../../tests/release.test.cjs)。现有 `npm test` 会自动纳入新增测试。发布任务不重建安装包，只上传本次 workflow 检查及构建通过的产物。新增 artifact action 使用官方 `upload-artifact@v7.0.2` 和 `download-artifact@v8.0.2`，未改应用或开发依赖。

## 验证及边界

最小冷缓存复现使用原锁中的 `yocto-queue@0.1.0` 与相同 integrity：默认官方 registry 配置报 `EALLOWREMOTE`；增加镜像域名映射后安装成功。临时文件留在被忽略的 `dist/ci-diagnosis-20261012`。

本轮在 Windows 使用固定 Node/npm 验证：

| 检查               | 结果与边界                                                                                                                                                                                             |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 三层锁文件安装     | 三个新建目录、各自冷缓存、官方 registry 映射及 `allow-remote=none`；`npm ci --ignore-scripts` 均通过，分别安装 287/49/140 个包。该检查不执行安装生命周期或下载 Electron 二进制。                       |
| 行为测试           | `npm test` 100 项通过，包含 6 项新增发布测试；GitHub CLI 写入由夹具替代。                                                                                                                              |
| 子模块 lint        | 通过，保留 8 条既有 unused-disable 警告。                                                                                                                                                              |
| vendor             | 普通 CRLF 工作区的初次检查失败；独立 LF 检出使用新安装的锁定依赖，全部 10 项 vendor 校验通过。                                                                                                         |
| 工作流静态检查     | 官方临时 actionlint 1.7.12 通过，未使用本机缺失的 ShellCheck/Pyflakes；下载 ZIP 的 SHA-256 为 `6e7241b51e6817ea6a047693d8e6fed13b31819c9a0dd6c5a726e1592d22f6e9`，与官方 Release API 摘要一致。        |
| JS/格式            | 两个新增 CJS 的 `node --check`、全部改动文件 Prettier 检查及差异空白检查通过。                                                                                                                         |
| Windows 构建及收集 | 既有 `dist:win --publish never` 构建 x64/arm64 成功；收集 3 个 NSIS 安装器、2 个 7z、3 个 blockmap 和 `latest.yml` 共 9 个文件。`latest.yml` 引用的全部安装包均存在。仅构建，未安装或运行 arm64 程序。 |
| 依赖与源码边界     | 构建后重新比对三个 package.json 和锁文件的 SHA-256，六份文件均未变化；原有子模块指针差异保留，子模块工作区无新修改。                                                                                   |

本机首轮构建受沙箱读取 `app/node_modules` 的权限限制；允许读取既有依赖后的构建重试通过。验证日志、临时工具、新安装目录、独立检出和产物留在被忽略的 `dist/ci-release-validation`。

未触发 GitHub Actions，未提交、推送、创建标签或 Release。macOS/Linux 构建及真实 artifact 上传/下载、草稿创建、安装升级和自动更新仍需各自环境验收；既有 macOS 目标仍为 DMG，未扩展 ZIP 或签名、公证配置。
