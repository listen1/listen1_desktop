# Listen 1 音乐播放器（桌面版）

Listen 1 可以搜索和播放来自多个主流音乐网站的歌曲，让你的曲库更全面。并支持收藏功能，方便的创建自己的歌单。

支持音乐平台

- 网易云音乐
- QQ 音乐
- 酷狗音乐
- 酷我音乐
- bilibili
- 咪咕音乐
- 千千音乐

[![imgur](http://i.imgur.com/Ae6ItmA.png)]()

- 支持 Windows，Mac，Linux 平台

# 安装方式

访问 github 主页下载安装包安装

网址：https://listen1.github.io/listen1

## 生成完整代码

项目中包含了 listen1_chrome_extension 的引用，在 checkout 后需要把引用库初始化

    git submodule update --init --recursive

## 运行

    npm run start

## 生成安装包

全平台安装包

    npm run dist

Windows 安装包

    npm run dist:win

Mac 安装包

    npm run dist:mac

Linux 安装包

    npm run dist:linux32
    npm run dist:linux64

# 开发说明

## 请求头改写（防盗链）

各音乐平台的接口会校验 `Referer` / `Origin` / `User-Agent`，缺失或错误就会被拒绝。
浏览器扩展里这件事由 declarativeNetRequest 规则表完成（子模块的 `rules_1.json`），
Electron 里没有这个能力，必须在主进程用 `session.webRequest.onBeforeSendHeaders` 自己做。

相关文件：

- [`app/headerRules.js`](app/headerRules.js) —— 规则表与改写引擎
- [`test/headerRules.test.js`](test/headerRules.test.js) —— 离线单元测试
- [`scripts/verify_providers.js`](scripts/verify_providers.js) —— 联网自检

**注意**：Electron 30+ 传给 `onBeforeSendHeaders` 的 `requestHeaders` 是**普通对象**
（`{ "Referer": "..." }`），不是老版 API 的 `[{ name, value }]` 数组。按数组遍历会静默失效，
改写规则一条都不会生效。

### 测试与自检

    npm test                  # 离线单元测试，校验各平台的头改写结果
    npm run verify:providers  # 联网自检，对每个平台发真实请求

自检脚本复用 `headerRules.js`，所以自检通过就等于 app 里也能通。支持只测某个平台：

    npm run verify:providers -- kuwo kugou

平台接口变动频繁，播放异常时先跑自检，可以立刻分清是「平台改了」还是「我们挂了」。
有失败项时脚本退出码为 1，可直接挂到 CI。

## 播放失败与自动换源

单曲取不到播放地址（版权受限、VIP 专享、已下架）时的链路：

1. provider 的 `bootstrap_track` 判定无可用地址后调用 `failure`；
2. `loweb.js` 的 `bootstrapTrack` 按 `auto_choose_source_list` 跨平台换源；
3. 全部失败 → `player_thread.js` 把该曲标记为 `disabled` 并 `skip('next')`，同时提示用户。

因此**版权受限自动播下一首**依赖的是各 provider 把 `failure` 调对：
接口出错、返回空 `url` 都必须走 `failure`，不能静默 `success`，否则播放会卡住。

# 修订记录

## v2.34.0（2026-09-10）：修复各平台接口失效

### 根因

`main.js` 的 `hack_referer_header` 把请求头当数组遍历，而 Electron 30+ 传的是对象，
循环体一次都没执行 —— 所有防盗链改写规则形同虚设（bilibili 的 Origin 该删没删、
QQ/网易的 Referer 该换没换）。此外该函数用一组全局布尔标志控制改写，
单条 URL 命中多条域名规则时会互相干扰。

### 主进程

- 新增 `app/headerRules.js`：规则表 + 对象式改写引擎，替代原 `hack_referer_header`
- 支持 `origin: false` 显式删除请求头，与「不处理」区分开
- 大小写不敏感写入，避免 `Referer` / `referer` 重复
- filter 白名单扩容：补 `*.qq.com`（原缺 `u.y.qq.com`）、`*.hdslb.com`、
  `*.taihe.com`、`*.gtimg.cn`
- 各平台规则按实测修正：
  - **网易云**：eapi/weapi 补 `Cookie: os=pc`（缺失会导致 `code:-110`、播放地址为 null）
  - **bilibili**：改为删除 `Origin`（带上会被 412 拦截）；音频 CDN 域名单独一条规则
  - **酷狗**：统一换移动端 UA（Web 接口已废弃）
  - **咪咕**：`channel` 由 `migu.js` 自行携带，主进程不再覆盖，保证两端行为一致
  - **虾米**：已关站，移除规则，仅保留链接可打开

### 扩展（子模块）

- **酷狗** —— 两个失效端点替换：
  - 封面：`www.kugou.com/yy/index.php?r=play/getdata` → `m.kugou.com/app/i/getSongInfo.php`
    （新接口 `imgUrl` 常为空，回退到 `album_img`）
  - 歌词：`wwwapi.kugou.com/.../play/getdata` → `krcs.kugou.com/search` +
    `lyrics.kugou.com/download`（content 为 base64）
- **bilibili** —— 修复无音轨视频崩溃：原先直接取 `data.data.dash.audio[0]`，
  视频没有音轨时抛异常，导致既不成功也不失败、播放卡死；现在改为安全取值并走 `failure`
- **kuwo** —— `kw_cookie_get` 失败时回调 `undefined`，`bootstrap_track` 直接解构会抛异常，
  改为安全取值
- **migu / taihe / kuwo** —— `bootstrap_track` 补上 `return`，让 rejected promise 能被上层接住
- **netease** —— eapi 接口补设 `appver` cookie（只带 `os=pc` 会返回 `code:-110`）
- **loweb.js** —— 换源流程加异常兜底，单个换源平台出错不再中断整轮换源
- **rules_1.json** —— 从 3 条扩到 9 条，补齐网易云、酷我、咪咕、千千；
  修正 `|` 锚定写法（原写法匹配不到任何请求）
- **新增 `scripts/build.js`** —— `npm run build` 打包，出包前校验 manifest 与 DNR 规则

### 新增

- `test/headerRules.test.js`：11 项离线单元测试
- `scripts/verify_providers.js`：13 项联网自检
- `npm test` / `npm run verify:providers` 脚本

### 已知问题

- 网易云 eapi 的开关是 Cookie 的值（`os=pc; appver=8.9.70`），
  而 DNR 的 `modifyHeaders` 不允许修改 Cookie，只能走 `cookies` 权限实现
- 酷狗 `songsearch_v2` 偶发返回被截断的 JSON，属平台侧不稳定，自检脚本会明确报出
- bilibili 音频区（`music-service-c/web/url`）已基本下线，相关曲目会走换源
