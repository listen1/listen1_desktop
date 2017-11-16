module.exports = (function () {
    'use strict';

    const electron = require('electron'),
        BrowserWindow = electron.BrowserWindow,
        globalShortcut = electron.globalShortcut,
        ipcMain = electron.ipcMain,
        path = require('path');

    // 下载信息
    const downloadInfo = {
        downloading: false,
        event: 0,
        title: '',
        author: '',
        url: '',
        lrc: '',
        page: ''
    }

    class ListenApplication {
        constructor() {
            initElectron(this);
            let debug = process.argv.indexOf('--debug') > 0;

            var conf = {
                icon: path.join(basePath, 'listen1_chrome_extension/images/logo.png'),
                autoHideMenuBar: true,
                width: 1000,
                height: 600,
                webPreferences: {
                    nodeIntegration: true
                },
                show: true
            };

            if (process.platform == 'darwin')
                conf.titleBarStyle = 'hidden-inset';
            else
                conf.frame = false;

            this.browser = new BrowserWindow(conf);
            this.browser.listen1App = this;
            this.browser.on('closed', function () {
                this.browser = 0
            })

            this.browser.on('close', (e) => {
                this.browser = 0;
            });

            this.initialTray(this.browser);
            this.browser.loadURL('file://' + path.join(basePath, 'listen1Client/listen1.html'));
            if (debug) {
                this.browser.webContents.openDevTools();
            }
        }

        registerShortcuts() {
            globalShortcut.register('CommandOrControl + Alt +Shift + F12', () => {
                console.log('Control + Shift + F12')
                listen1App.browser.webContents.openDevTools();
            });
            globalShortcut.register('Alt + Q', () => {
                if (listen1App.browser.isVisible()) {
                    listen1App.browser.hide();
                } else {
                    listen1App.browser.show();
                }
            });
        }

        initialTray(listenbrowser) {
            const {app, Menu, Tray} = require('electron');

            var trayIconPath = path.resolve(basePath, 'listen1Node/src/logo_16.png');
            var appTray = new Tray(trayIconPath);

            function toggleVisiable() {
                var isVisible = listenbrowser.isVisible();
                if (isVisible) {
                    listenbrowser.hide();
                } else {
                    listenbrowser.show();
                }
            }

            const contextMenu = Menu.buildFromTemplate([
                {
                    label: 'Show/Hide Window', click() {
                    toggleVisiable();
                }
                },
                {
                    label: 'Quit', click() {
                    app.quit();
                }
                },
            ]);
            //appTray.setToolTip('This is my application.');
            appTray.setContextMenu(contextMenu);
            appTray.on('click', function handleClicked() {
                toggleVisiable();
            });
        }
    }

    // 初始化 electron
    function initElectron(app) {
        // 初始化基本信息
        electron.app.listen1App = app;
        electron.app.setName('Listen1');

        // 监听资源请求
        const filter = {urls: ["*://music.163.com/*", "*://*.xiami.com/*", "*://*.qq.com/*"]};
        electron.session.defaultSession.webRequest.onBeforeSendHeaders(filter,
            function (details, callback) {
                hack_referer_header(details);
                callback({cancel: false, requestHeaders: details.requestHeaders});
            });
        electron.session.defaultSession.on('will-download', (e, item) => {
            //获取文件的总大小
            const totalBytes = item.getTotalBytes();

            //设置文件的保存路径，此时默认弹出的 save dialog 将被覆盖
            const fileName = downloadInfo.title + ' - ' + downloadInfo.author + path.extname(item.getFilename());
            const filePath = path.join(electron.app.getPath('downloads'),'listen1', fileName);
            item.setSavePath(filePath);

            //监听下载过程，计算并设置进度条进度
            item.on('updated', () => {
                app.browser.setProgressBar(item.getReceivedBytes() / totalBytes);
                console.log('download', fileName, (item.getReceivedBytes() / totalBytes) * 100)
            });

            //监听下载结束事件
            item.on('done', (e, state) => {
                downloadInfo.downloading = false;
                downloadInfo.url = '';
                downloadInfo.title = '';
                downloadInfo.author = '';
                //如果窗口还在的话，去掉进度条
                if (!app.browser.isDestroyed()) {
                    listen1App.browser.setProgressBar(-1);
                }
                //下载被取消或中断了
                if (state === 'interrupted') {
                    electron.dialog.showErrorBox('下载失败', `文件 ${fileName} 因为某些原因被中断下载`);
                }
                //下载完成，让 dock 上的下载目录Q弹一下下
                // if (state === 'completed') {
                //     electron.app.dock.downloadFinished(filePath);
                // }
                if (downloadInfo.event && downloadInfo.event.sender)
                    downloadInfo.event.sender.send('tip', {type: 'finished', msg: `${fileName} 下载完成!`, filePath: filePath});
            });
        });

        // 事件监听
        ipcMain.on('operate', (evt, args) => {
            switch (args.type) {
                case 'registerShortcut': {
                    app.registerShortcuts();
                    break;
                }
                case 'download': {
                    download(evt,args);
                    break;
                }
            }
        });
    }

    // 下载音乐
    function download(evt,args) {
        if (!downloadInfo.downloading) {
            downloadInfo.downloading = true;
            downloadInfo.event = evt;
            downloadInfo.title = args.title;
            downloadInfo.url = args.url;
            downloadInfo.author = args.author;

            console.log('begin download', downloadInfo.url)
            listen1App.browser.webContents.downloadURL(downloadInfo.url);
        }
    }

    function hack_referer_header(details) {
        var refererValue = '';
        if (details.url.indexOf("://music.163.com/") != -1) {
            refererValue = "http://music.163.com/";
        }

        if (details.url.indexOf(".xiami.com/") != -1) {
            refererValue = "http://m.xiami.com/";
        }

        if ((details.url.indexOf("y.qq.com/") != -1) ||
            (details.url.indexOf("qqmusic.qq.com/") != -1) ||
            (details.url.indexOf("music.qq.com/") != -1) ||
            (details.url.indexOf("imgcache.qq.com/") != -1)) {
            refererValue = "http://y.qq.com/";
        }

        var isRefererSet = false;
        var headers = details.requestHeaders;

        for (var i = 0, l = headers.length; i < l; ++i) {
            if ((headers[i].name == 'Referer') && (refererValue != '')) {
                headers[i].value = refererValue;
                isRefererSet = true;
                break;
            }
        }

        if ((!isRefererSet) && (refererValue != '')) {
            headers["Referer"] = refererValue;
        }
        details.requestHeaders = headers;
    }

    return ListenApplication;
})();

