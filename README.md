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

![Listen 1 界面](http://i.imgur.com/Ae6ItmA.png)

- 保留 Windows x64/arm64、macOS 和 Linux 配置。本轮实际验证为 Windows 11 x64，其他环境不据此宣称通过。

# 安装方式

访问 github 主页下载安装包安装

网址：https://listen1.github.io/listen1

## 生成完整代码

项目中包含了 listen1_chrome_extension 的引用，在 checkout 后需要把引用库初始化

    git submodule update --init --recursive

## 运行

需要 Node.js 24.21.0 和 npm 12.0.2，安装依赖后启动：

    npm ci
    npm ci --prefix app/listen1_chrome_extension
    npm run start

普通启动直接加载已提交的静态界面。只有维护 vendor 时才在子模块运行 `npm run vendor:build`。完整架构、接口和维护约束见 [AGENTS.md](AGENTS.md)，当前修复、依赖取舍与验证边界见[维护报告](docs/maintenance/REPORT.md)。

Electron 44 配置要求 Windows 10 及以上、macOS 13 及以上；32 位 Windows/Linux 和 Linux armv7l 目标已移除。Linux 的发行版/桌面环境及 arm64 需单独验证。

## 验证

    npm test
    npm run lint --prefix app/listen1_chrome_extension
    npm run vendor:check --prefix app/listen1_chrome_extension
    npm run test:electron

在线链路另运行 `npm run test:online`，使用独立游客数据和 5% 音量。测试命令、输出及音频验收边界见 [tests/README.md](tests/README.md)。

## 生成安装包

当前宿主的默认目标（不自动发布）

    npm run dist

Windows 安装包

    npm run dist:win

仅 Windows x64 测试包，输出到 `dist/windows-test`：

    npm run dist:win:test

Mac 安装包

    npm run dist:mac

Linux 安装包

    npm run dist:linux64
    npm run dist:linuxArm64

打包目标存在不代表任意宿主均能构建或运行该目标。安装、升级和卸载验证须使用可丢弃数据的独立环境；NSIS 仍保留原有卸载时删除应用数据的配置。本地构建脚本不提交、不推送、不发布。
