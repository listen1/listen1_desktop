'use strict';

const electron = require('electron'),
    app = electron.app,
    ListenApplication = require('./listen1Node/listen-app');
global.basePath = __dirname;
global.listen1App = 0;

app.on("ready", () => {
    global.listen1App = new ListenApplication();
    listen1App.registerShortcuts();
});

app.on('will-quit', () => {
    electron.globalShortcut.unregisterAll();
})

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', () => {
    if (listen1App != null && listen1App.window) {
        listen1App.browser.show();
    }
});

app.on('before-quit', () => {
});