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

方法一：国内可访问蓝奏云下载安装包进行安装

网址：https://yujiangqaq.lanzous.com/b0104q61e

密码: listen1

特别感谢 @yujiangqaq 维护国内镜像

方法二：访问 github 主页下载安装包安装

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

    npm run dist:win32
    npm run dist:win64

Mac 安装包

    npm run dist:mac

Linux 安装包

    npm run dist:linux32
    npm run dist:linux64
