# 网易云搜索与账号链路维护记录

记录日期：2026-10-06。环境：Windows、本工作区开发版、Node 24.21.0、Electron 44.4.3、锁文件中的 Playwright。保留主仓库和共享子模块原有音量均衡等未提交工作；未升级依赖、迁移存储、提交、推送或发布。

## 问题与改动

调查时，网易单平台搜索“星球卑”第一页返回 20 条、16 个唯一曲目，重复 ID 导致 Angular `ngRepeat:dupes`，实际 DOM 为 0 行；聚合搜索已有去重。搜索边界现对当前页按 `source:id` 稳定去重，保留首条记录及顺序。下一页仍依据服务端总数、页大小及显式 `hasMore`；总数未知时依据去重前的响应长度。曲目 ID、两套模板的追踪键和既有请求代次保持不变。

网易账号、创建/收藏/推荐歌单新增业务码及必要结构校验，正常未登录、认证失败、网络失败与格式异常分别返回。推荐歌单统一为 RequestTask，保留 success 并提供 error/cancel/promise；不支持的来源返回 UNSUPPORTED。网易四类账号请求的取消信号传到 Axios。账号查询失败保留上一成功数据并标记状态未确认；确认游客、退出和换账号清理对应歌单。控制器在刷新、切分类及销毁时取消任务，并在异步更新时检查代次。

两套布局增加加载、错误、重试与空歌单状态，四个新增键同步六种语言。诊断使用固定字段白名单，不记录完整响应、凭据或回跳参数。隔离登录窗口、Cookie 配置及手动登录完成确认均保留。

## 验证证据

原始报告和截图位于忽略目录 `dist/maintenance`；下面名称是本机运行标识，报告不作为源码提交。

| 验证                              | 结果                                                                                                                                 | 证据                                                                   |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------- |
| Node 行为测试，含原有音量均衡回归 | 51/51 通过；新增 10 组网易服务和控制器回归                                                                                           | 固定 Node 执行根与子模块 `*.test.cjs`                                  |
| 新增行为覆盖                      | 歌曲/歌单重复、首次及顺序、跨来源同 ID、已知/未知总数、业务码/缺字段/游客/空数组、真实 Axios 取消/超时、旧请求隔离、其他平台推荐兼容 | `app/listen1_chrome_extension/test/netease-service.test.cjs`           |
| 离线 Electron 真实 DOM            | 四主题每页 20 条含 4 条重复，显示 16 行；歌曲第 1/2 页、歌单第 1 页及账号/歌单重试退出通过；无 dupes/pageerror；六语言新增键实际加载 | `netease-fixture-20261006-final/report.json`，16 项                    |
| 线上“星球卑”                      | 四主题歌曲第一页唯一/DOM 均 16，第二页均 20，歌单第一页均 20；无 dupes/pageerror                                                     | `netease-exact-fixed-20261006-01/report.json`，12 项                   |
| 网易游客原平台播放                | 禁用自动换源，5% 音量；两首各完成 30 秒、Chromium 音频输出检测、暂停/定位/恢复；不可用样本在 DOM 显示明确原因                        | `netease-final-playback-20261006-01/report.json`                       |
| 子模块 lint                       | 0 错误，8 个既有 unused-disable 警告（lastfm/myplaylist/xiami）                                                                      | 子模块 ESLint                                                          |
| 桌面冒烟回归                      | 通过；覆盖旧数据、本地播放、主题/语言、备份、断网收尾、歌词窗口、代理和第二实例                                                      | `netease-smoke-20261006-01`                                            |
| 语法与格式                        | 相关 JS/CJS 的 node --check 通过；JS/JSON/Markdown 及 common.css 的 Prettier 通过，新增 HTML/CSS 片段格式验证通过                    | common2.css 和 listen1.html 全文件存在既有格式问题，未扩展成整文件整理 |

播放通过样本：`netrack_3441905367`、`netrack_28411317`，实际来源均为 netease。`netrack_25706282` 不可用，播放器返回 RESOURCE_UNAVAILABLE，并结束失败流程。Chromium 音频检测证明渲染器输出音频，不代替扬声器或人耳验收。聚合搜索本次 QQ 返回 SERVICE_ERROR，其他平台的状态分别记录；本次网易结果不代表 QQ 服务已恢复。

## 真实账号与未验证范围

QQ 授权、网易扫码必须在分别独立的 profile 中由操作者完成官方授权，并点击 Listen1 的手动登录完成按钮。随后检查昵称识别、创建/收藏/推荐歌单、可访问歌单详情及重启后的相同账号识别。`tests/netease-login.cjs` 已提供这一流程；没有人工授权证据时不标记通过。空歌单数组属于合法成功，但所有分类都没有可访问歌单时，详情仍记为未验证。

操作者已分别确认完成 QQ 授权和网易扫码，并点击手动确认；自动检查使用两份独立 profile，以下结果均通过。昵称在重启后两套布局四主题中实际可见，报告只记录可见性布尔值。

| 登录方式     | 创建/收藏/推荐歌单数 | 详情与重启                             | 匿名证据                                     |
| ------------ | -------------------- | -------------------------------------- | -------------------------------------------- |
| 网易 QQ 授权 | 3 / 6 / 30           | 三类歌单详情均能打开；重启识别同一账号 | `netease-login-qq-20261006-01/report.json`   |
| 网易扫码     | 3 / 6 / 30           | 三类歌单详情均能打开；重启识别同一账号 | `netease-login-scan-20261006-01/report.json` |

本轮 Windows 开发环境中的搜索、分页、两种登录、账号歌单与网易原平台播放链路已完成验收。线上条数及可播放曲目随服务变化，仅记录本次样本结果。其他系统、打包程序及浏览器扩展未通过本次测试认证。

## 复现命令

使用锁定工具链执行以下命令；Windows 的临时 Node 位于 `dist/maintenance/tools/node-v24.21.0-win-x64/node.exe`，不要以 PATH 中的其他版本冒充固定工具链。

```powershell
node --test tests/*.test.cjs app/listen1_chrome_extension/test/*.test.cjs
npm run lint --prefix app/listen1_chrome_extension
$env:LISTEN1_NETEASE_RUN = 'netease-fixture-new-run'
node tests/netease-electron.cjs
$env:LISTEN1_NETEASE_ONLINE = '1'
$env:LISTEN1_NETEASE_RUN = 'netease-online-new-run'
node tests/netease-electron.cjs
Remove-Item Env:LISTEN1_NETEASE_ONLINE
$env:LISTEN1_NETEASE_LOGIN_METHOD = 'qq' # 下一独立运行改为 scan
$env:LISTEN1_NETEASE_LOGIN_RUN = 'netease-login-qq-new-run'
node tests/netease-login.cjs
```
