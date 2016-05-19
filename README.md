Listen 1 音乐播放器（桌面版）
=========================

Listen 1可以搜索和播放来自网易云音乐，虾米，QQ音乐三个主流音乐网站的歌曲，让你的曲库更全面。并支持收藏功能，方便的创建自己的歌单。

[![imgur](http://i.imgur.com/Ae6ItmA.png)]()

* 支持Windows，Mac，Linux平台


生成完整代码
-----------
项目中包含了listen1_chrome_extension的引用，在checkout后需要把引用库初始化

    git submodule update --init --recursive

运行
----

    npm run start

生成安装包
---------
全平台安装包

    npm run dist

Windows安装包

    npm run dist:win32
    npm run dist:win64
    
Mac安装包

    npm run dist:mac
    
Linux安装包

    npm run dist:linux32
    npm run dist:linux64