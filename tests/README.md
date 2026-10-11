# 维护验证

使用 Node 24.21.0、npm 12.0.2 和锁文件中的 Electron/Playwright。先在根目录 `npm ci`，再 `npm ci --prefix app/listen1_chrome_extension`。机器没有 npm 时可运行 `node scripts/prepare-maintenance.cjs`，在忽略目录内准备带官方 SHA 校验的 Windows x64 Node 工具链及 npm，不修改全局工具。该脚本也保存首次源码基线，不要用后续快照冒充更新前状态。

| 命令                                       | 覆盖                                                                                                      |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| `npm test`                                 | 请求乱序/取消/超时、队列生命周期、批量事件、URL 缓存重试、歌词容错、IPC 来源、本地并发、旧数据、加密向量  |
| `npm run test:electron`                    | 实际 Electron 页面、隔离 preload、本地播放、歌词、主题/语言、备份、断网收尾、代理和重启                   |
| `npm run test:online`                      | 六平台实际搜索输入/标签/分页/入队/地址/30 秒播放/暂停恢复；每平台尝试前六条直到两首可播放                 |
| `npm run test:lyrics`                      | 歌词搜索/预览/导入/替换/恢复、错误及重试、元数据/重复导入、暂停和悬浮译文、乱序、主题语言及重启           |
| `npm run test:lyrics:online`               | 七个可见来源的游客搜索与候选原歌词，分别应用到本地和网络目标；不播放远程音频                              |
| `npm run test:visual`                      | 四主题/两布局的详情、焦点、横向操作组、封面保存/回滚/重启、歌词来源、侧栏、六语言与宽窄截图               |
| `npm run test:visual:online`               | 上述回归加网易/QQ/酷我游客音频信息抽查；不播放远程音频                                                    |
| `node tests/netease-electron.cjs`          | 网易歌曲/歌单去重的真实 DOM、两布局四主题、账号/歌单失败重试、退出及六种语言；默认离线夹具                |
| `node tests/netease-login.cjs`             | 人工网易账号授权后读取三类歌单、详情并检查重启识别；每种方式强制使用全新隔离 profile                      |
| `node tests/loudness-electron.cjs`         | 当前完整资产 RMS、实际适配器输出及主音量／静音／跳转、两布局四主题六语言；需 FFmpeg                       |
| `node tests/loudness-control-electron.cjs` | 均衡实心图标、默认／启用颜色、两布局四主题、200ms 移出收起、原生模式选择、键盘焦点及音量控件；不需 FFmpeg |
| `node scripts/loudness-listening.cjs`      | 将已测 WAV 生成短 A/B 试听页，材料保存在忽略目录；不代替人工试听                                          |
| `node scripts/measure-queue.cjs`           | 同机更新前后核心队列与 JSON 序列化，五次样本；不包含 DOM 和磁盘                                           |
| `node scripts/dependency-inventory.cjs`    | 三层直接/传递依赖清单、官方 latest 核对、npm 官方审计                                                     |
| `npm run dist:win:test`                    | 仅 x64 的 NSIS 和 7z，不发布                                                                              |

Electron 测试将 `LISTEN1_TEST_USER_DATA` 指向 `dist/maintenance/<run>/profile`。源码测试通过 electron-entry 启动，打包测试直接启动 Listen1.exe。它们不会读取真实用户 profile。为复现测试，给每次运行设置新名称：

```powershell
$env:LISTEN1_SMOKE_RUN = 'smoke-new-run'
npm run test:electron
$env:LISTEN1_ONLINE_RUN = 'online-new-run'
npm run test:online
# 可选：仅复查某平台
$env:LISTEN1_SOURCES = 'qq'
npm run test:online
# 测试打包程序
$env:LISTEN1_TEST_EXE = (Resolve-Path 'dist/windows-test/win-unpacked/Listen1.exe').Path
$env:LISTEN1_SMOKE_RUN = 'packaged-new-run'
npm run test:electron
```

在线测试使用游客会话，禁用自动换源，每首播放前设 5% 音量并解除静音；可能实际出声。音频检查同时记录 Howler playing、播放进度、静音状态和 Chromium `isCurrentlyAudible()`。这是音频输出检测，不能验证扬声器接线或代替人耳听感；主动静音的样本标为音频未验证。日志只保留平台、公共曲目 ID、阶段、HTTP/业务码，不保存 Cookie、令牌或带签名播放 URL。

网易专项测试同时捕获 Angular `ngRepeat:dupes` 控制台错误和真实 DOM 行数；在线模式用“星球卑”，以当前唯一结果数为断言，不固定线上条数。人工登录测试须由操作者在官方窗口分别完成 QQ 授权和网易扫码，再点击 Listen1 的“我已经登录完成”；脚本不填写凭据、不记录账号和私人歌单内容。每次使用新运行名称，已存在 profile 时拒绝复用；登录期间的测试 profile 包含实际会话，应留在忽略目录且不要分享。结果只保存成功/失败、错误码、歌单/曲目数量和重启比对布尔结论。

```powershell
$env:LISTEN1_NETEASE_RUN = 'netease-fixture-new-run'
node tests/netease-electron.cjs
$env:LISTEN1_NETEASE_ONLINE = '1'
$env:LISTEN1_NETEASE_RUN = 'netease-online-new-run'
node tests/netease-electron.cjs
Remove-Item Env:LISTEN1_NETEASE_ONLINE
$env:LISTEN1_NETEASE_LOGIN_METHOD = 'qq' # 下一独立会话改为 scan
$env:LISTEN1_NETEASE_LOGIN_RUN = 'netease-login-qq-new-run'
node tests/netease-login.cjs
```

网易本轮修复及实际验收边界见 [网易维护记录](../docs/maintenance/NETEASE.md)。游客成功不能代替真实账号和两种授权路径通过。

页面测试通过 Playwright 操作 DOM 与播放器边界。本地测试使用合成 WAV/歌词，原生文件选择框返回值由测试替换，之后标签解析、IPC、歌单、Howler 和解码均走实际链路。原生文件框交互、系统托盘点击、真实全局按键及多显示器等未自动覆盖的场景必须另记。

歌词专项默认用离线 provider 夹具并阻断远程请求，保留真实 MediaService、桌面导入、严格 UTF-8 文件读取、同步解析、存储、播放和悬浮窗。每次使用新的 `LISTEN1_LYRICS_RUN`；已存在 profile 会拒绝运行，重启恢复仅由同一次脚本显式复用自己的 profile。在线模式以“夜曲”搜索，每平台最多检查前三个候选，成功后在本地及网络目标保存；无同步歌词额外记录返回类型、长度及解析行数，不记录正文或签名 URL。可用 `LISTEN1_LYRICS_SOURCES` 逗号列表缩小线上复查范围。

```powershell
$env:LISTEN1_LYRICS_RUN = 'lyrics-fixture-new-run'
npm run test:lyrics
$env:LISTEN1_LYRICS_RUN = 'lyrics-online-new-run'
npm run test:lyrics:online
# 可选：仅复查无歌词的平台；结束后移除筛选
$env:LISTEN1_LYRICS_SOURCES = 'bilibili,taihe'
$env:LISTEN1_LYRICS_RUN = 'lyrics-online-limited-new-run'
npm run test:lyrics:online
Remove-Item Env:LISTEN1_LYRICS_SOURCES
```

行为测试还验证 BOM/多时间戳/元数据、错误行/编码/大小与读中增长、同名不同 ID、损坏记录/存储失败、备份恢复、编辑快照回滚以及关闭/主题切换后的迟到响应。时间对齐覆盖旧记录、原歌词仅偏移记录、±60 秒边界、内容替换归零及存储失败。Electron 专项使用精简弹窗和独立搜索页面，覆盖真实鼠标拖入/拖出、行悬停图标、缓存筛选、主题重建、宽窄布局、暂停时双窗口原文/译文偏移、非当前目标、空歌词控件和偏移重启恢复。线上报告从平台状态读取搜索错误码，避免将聚合中的单平台失败记作正常空结果。本轮结果与未验范围见[歌词功能记录](../docs/maintenance/LYRICS.md)。搜索错误、候选无歌词和页面异常分别记录，不能把线上脚本退出成功等同于所有平台提供歌词。

界面专项 `tests/visual-electron.cjs` 使用真实 PNG/JPEG/WebP、合成音频及隔离 profile，文件选择返回值由夹具替换，后续解码、复制、IPC、存储和播放器走实际链路。网络离线夹具返回真实 WAV 的 Range 响应，另用行为测试覆盖非 Range、8 MiB 限制、尾部容器、资源变化、超时和取消。截图包含四主题在 1280×900、860×700 下的列表、详情、设置及现代收起侧栏；会检查元素边界、可复制长路径及不改变暂停/位置，仍需查看截图评估裁切、对比度和对齐。默认阻断外部请求，`--online` 只在重启后的会话抽查公共歌曲元数据，逐平台结果单独记录。

```powershell
$env:LISTEN1_VISUAL_RUN = 'visual-fixture-new-run'
npm run test:visual
$env:LISTEN1_VISUAL_RUN = 'visual-online-new-run'
npm run test:visual:online
```

每次界面专项均拒绝复用现有 profile，同次脚本显式重启除外；默认名称带当前时间。证据位于 `dist/maintenance/<run>/report.json` 和 PNG，报告不保存播放 URL、线上歌词正文或用户备份；生成的音频/歌词/图片夹具保留在忽略目录。源码行为测试还检查封面复制失败/存储回滚、旧歌词来源、实际换源身份和 Angular 更新排队后的乱序回调。界面美化本轮结果见[界面维护记录](../docs/maintenance/VISUALS.md)。原生文件选择器的系统操作、浏览器扩展、其他操作系统和账号流程须独立验证。

在线空结果和错误保存在 report.json，不以脚本 exit 0 代替平台通过；逐曲 status 才是依据。离线行为测试失败会返回非零。定时断言采用 100ms polling，防止隐藏窗口 requestAnimationFrame 停顿导致假超时。

诊断工具 `qq-search-diagnostic.cjs` 比较当前/旧请求头、系统代理/直连和官方页面；`qq-probe.cjs` 比较 QQ 不可用曲目的地址请求参数，均为可选在线诊断。`inspect-electron.cjs` 用于分组升级阶段记录，`audio-diagnostic.cjs` 的旧 Howler 对照需要首次基线快照。这些结果不能替代最终页面测试。

安装、升级、卸载必须在独立环境使用可丢弃数据，不运行真实用户安装程序来清理测试。测试用 profile、原始报告、截图和包都留在 dist，不加入源码版本管理；精简证据和环境边界保存在 docs/maintenance。
