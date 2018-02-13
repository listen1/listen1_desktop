module.exports = (function () {
    'use strict';

    const electron = require('electron'),
        BrowserWindow = electron.BrowserWindow,
        globalShortcut = electron.globalShortcut,
        ipcMain = electron.ipcMain,
        path = require('path');

    let listenDownload = 0;
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

        // 事件监听
        ipcMain.on('operate', (evt, args) => {
            switch (args.type) {
                case 'registerShortcut': {
                    app.registerShortcuts();
                    break;
                }
                case 'download': {
                    if (!listenDownload)
                        listenDownload = require('./listen-download');
                    listenDownload.download(args);
                    break;
                }
            }
        });
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

