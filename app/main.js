const electron = require('electron')
// Module to control application life.
const {app, globalShortcut} = require('electron')

const {ipcMain} = require('electron')

// Module to create native browser window.
const BrowserWindow = electron.BrowserWindow

var path = require('path')
var iconPath = path.join(__dirname, '/listen1_chrome_extension/images/logo.png');

// Keep a global reference of the window object, if you don't, the window will
// be closed automatically when the JavaScript object is garbage collected.
let mainWindow
let willQuitApp = false;
var windowState = { maximized: false }
app.allowRendererProcessReuse = false;
const globalShortcutMapping = {
  'CmdOrCtrl+Alt+Left':'left',
  'CmdOrCtrl+Alt+Right':'right',
  'CmdOrCtrl+Alt+Space':'space',
  'MediaNextTrack': 'right',
  'MediaPreviousTrack': 'left',
  'MediaPlayPause': 'space'
};

let appTray;

function initialTray(mainWindow, track) {
  const {app, Menu, Tray} = require('electron');
  if(track == null || track == undefined){
    track = {
      title:"暂无歌曲",
      artist: "  ",
    }
  }

  let nowPlayingTitle = `${track.title}`
  let nowPlayingArtist = `歌手: ${track.artist}`;

  function toggleVisiable() {
    var isVisible = mainWindow.isVisible();
    if (isVisible) {
      mainWindow.hide();
    } else {
      mainWindow.show();
    }
  }
  let menuTemplate = [
    {label: nowPlayingTitle,  click(){
      mainWindow.show();
    }},
    {label: nowPlayingArtist,  click(){
      mainWindow.show();
    }},
    {type: 'separator'
    },
    {label: '播放/暂停',  click(){
      mainWindow.webContents.send('globalShortcut', "space");
    }},
    {label: '上一首',  click(){
      mainWindow.webContents.send('globalShortcut', "left");
    }},
    {label: '下一首',  click(){
      mainWindow.webContents.send('globalShortcut', "right");
    }},
    {label: '显示/隐藏窗口',  click(){
      toggleVisiable();
    }},
    {label: '退出',  click() {
      app.quit();
    }},
  ];

  const contextMenu = Menu.buildFromTemplate(menuTemplate);

  if(appTray != null && appTray.destroy != undefined){
    // appTray had create, just refresh tray menu here
    appTray.setContextMenu(contextMenu);
    return
  }

  let appIcon = null;

  var trayIconPath = path.join(__dirname, '/resources/logo_16.png');
  appTray = new Tray(trayIconPath);
  appTray.setContextMenu(contextMenu);
  appTray.on('click', function handleClicked () {
    toggleVisiable();
  });
}

function setKeyMapping(key, message) {
    const ret = globalShortcut.register(key, () => {
      mainWindow.webContents.send('globalShortcut', message);
    });
}

function enableGlobalShortcuts() {
  // initial global shortcuts
  for (let key in globalShortcutMapping){
    setKeyMapping(key, globalShortcutMapping[key]);
  }
}

function disableGlobalShortcuts() {
  for (let key in globalShortcutMapping){
    globalShortcut.unregister(key);
  }

  globalShortcut.unregisterAll()
}

let floatingWindow;
const createFloatingWindow = function () {
  const electron = require('electron');
  const BrowserWindow = electron.BrowserWindow;
  const display = electron.screen.getPrimaryDisplay();
  if (!floatingWindow) {
    floatingWindow = new BrowserWindow({
      width: 1000,
      height: 80,
      titleBarStyle: 'hide',
      transparent: true,
      frame: false,
      resizable: false,
      hasShadow: false,
      alwaysOnTop:true,
      visibleOnAllWorkspaces: true,
      webPreferences: {
        nodeIntegration: true,
        enableRemoteModule: true,
      }
    });
    floatingWindow.setPosition(floatingWindow.getPosition()[0], display.bounds.height - 150);
    floatingWindow.setSkipTaskbar(true);
    floatingWindow.loadURL(`file://${__dirname}/floatingWindow.html`);
    floatingWindow.setAlwaysOnTop(true, 'floating');
    floatingWindow.on('closed', function () { floatingWindow = null })
  }
  floatingWindow.showInactive();
};

const previousButton = {
  tooltip: "Previous",
  icon: path.join(__dirname, "/resources/prev-song.png"),
  click() {
    mainWindow.webContents.send("globalShortcut", "left");
  },
};
const nextButton = {
  tooltip: "Next",
  icon: path.join(__dirname, "/resources/next-song.png"),
  click() {
    mainWindow.webContents.send("globalShortcut", "right");
  },
};
const playButton = {
  tooltip: "Play",
  icon: path.join(__dirname, "/resources/play-song.png"),
  click() {
    mainWindow.webContents.send("globalShortcut", "space");
  },
};
const pauseButton = {
  tooltip: "Pause",
  icon: path.join(__dirname, "/resources/pause-song.png"),
  click() {
    mainWindow.webContents.send("globalShortcut", "space");
  },
};
const setThumbarPause = () => {
  mainWindow.setThumbarButtons([previousButton, playButton, nextButton]);
};
const setThumbbarPlay = () => {
  mainWindow.setThumbarButtons([previousButton, pauseButton, nextButton]);
};


function createWindow() {

  const session = require('electron').session;

  const filter = {
    urls: ["*://music.163.com/*", "*://*.xiami.com/*", "*://i.y.qq.com/*", "*://c.y.qq.com/*", "*://*.kugou.com/*", "*://*.kuwo.cn/*", "*://*.bilibili.com/*", "*://*.bilivideo.com/*", "*://*.migu.cn/*", "*://*.githubusercontent.com/*",
      "https://listen1.github.io/listen1/callback.html?code=*"]
  };

  session.defaultSession.webRequest.onBeforeSendHeaders(filter, function(details, callback) {
    if(details.url.startsWith("https://listen1.github.io/listen1/callback.html?code=")){
      const url = details.url;
      const code = url.split('=')[1];
      mainWindow.webContents.executeJavaScript('Github.handleCallback("'+code+'");');
    }
    else {
      hack_referer_header(details);
    }
    callback({cancel: false, requestHeaders: details.requestHeaders});
  });

  var transparent = false;
  if (process.platform == 'darwin') {
    transparent = true;
  }
  // Create the browser window.
  mainWindow = new BrowserWindow({
    width: 1000,
    height: 670,
    webPreferences: {'nodeIntegration': true, enableRemoteModule: true},
    icon: iconPath,
    titleBarStyle: 'hiddenInset',
    transparent: transparent,
    vibrancy: 'light',
    frame: false,
    hasShadow: true
  });

  // mainWindow.webContents.openDevTools();

  mainWindow.on('close', (e) => {
    if (willQuitApp) {
      /* the user tried to quit the app */
      mainWindow = null;
    } else {
      /* the user only tried to close the window */
      //if (process.platform != 'linux') {
        e.preventDefault();
        mainWindow.hide();
        //mainWindow.minimize();
      //}

    }
  });


  // and load the index.html of the app.
  var ua = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_14_2) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/72.0.3626.119 Safari/537.36';
  mainWindow.loadURL(`file://${__dirname}/listen1_chrome_extension/listen1.html`, {userAgent: ua})

  // Open the DevTools.
  // mainWindow.webContents.openDevTools()
  setThumbarPause();
  // Emitted when the window is closed.
  mainWindow.on('closed', function () {
    // Dereference the window object, usually you would store windows
    // in an array if your app supports multi windows, this is the time
    // when you should delete the corresponding element.
    mainWindow = null
  })

  // define global menu content, also add support for cmd+c and cmd+v shortcuts
  var template = [{
      label: "Application",
      submenu: [
          { label: "About Application", selector: "orderFrontStandardAboutPanel:" },
          { type: "separator" },
          { label: "Quit", accelerator: "Command+Q", click: function() { app.quit(); }}
      ]}, {
      label: "Edit",
      submenu: [
          { label: "Undo", accelerator: "CmdOrCtrl+Z", selector: "undo:" },
          { label: "Redo", accelerator: "Shift+CmdOrCtrl+Z", selector: "redo:" },
          { type: "separator" },
          { label: "Cut", accelerator: "CmdOrCtrl+X", selector: "cut:" },
          { label: "Copy", accelerator: "CmdOrCtrl+C", selector: "copy:" },
          { label: "Paste", accelerator: "CmdOrCtrl+V", selector: "paste:" },
          { label: "Select All", accelerator: "CmdOrCtrl+A", selector: "selectAll:" }
      ]}
  ];

  mainWindow.setMenu(null);

  electron.Menu.setApplicationMenu(electron.Menu.buildFromTemplate(template));

  initialTray(mainWindow);
}

function hack_referer_header(details) {
    let replace_referer = true;
    let replace_origin = true;
    let add_referer = true;
    let add_origin = true;
    let referer_value = '';
    let origin_value = '';

    if (details.url.indexOf("://music.163.com/") != -1) {
        referer_value = "http://music.163.com/";
    }
    if (details.url.indexOf("://gist.githubusercontent.com/") != -1) {
        referer_value = "https://gist.githubusercontent.com/";
    }

    if (details.url.indexOf(".xiami.com/") != -1) {
        add_origin = false;
        referer_value = "https://www.xiami.com/";
    }  
    if (details.url.indexOf('www.xiami.com/api/search/searchSongs') !== -1) {
        const key = /key%22:%22(.*?)%22/.exec(details.url)[1];
        add_origin = false;
        referer_value = `https://www.xiami.com/search?key=${key}`;
    }
    if (details.url.indexOf('c.y.qq.com/') !== -1) {
        referer_value = 'https://y.qq.com/';
        origin_value = "https://y.qq.com";
    }
    if ((details.url.indexOf("y.qq.com/") != -1) ||
        (details.url.indexOf("qqmusic.qq.com/") != -1) ||
        (details.url.indexOf("music.qq.com/") != -1) ||
        (details.url.indexOf("imgcache.qq.com/") != -1)) {
        referer_value = "http://y.qq.com/";
    }
    if (details.url.indexOf(".kugou.com/") != -1) {
        referer_value = "http://www.kugou.com/";
    }
    if (details.url.indexOf(".kuwo.cn/") != -1) {
        referer_value = "http://www.kuwo.cn/";
    }
    if (details.url.indexOf(".bilibili.com/") != -1 || details.url.indexOf(".bilivideo.com/") != -1) {
        referer_value = "https://www.bilibili.com/";
        replace_origin = false;
        add_origin = false;
    }
    if (details.url.indexOf('.migu.cn') !== -1) {
        referer_value = 'http://music.migu.cn/v3/music/player/audio?from=migu';
    }
    if (details.url.indexOf('m.music.migu.cn') !== -1) {
      referer_value = 'https://m.music.migu.cn/';
    }
    if (origin_value == "") {
        origin_value = referer_value;
    }
    var isRefererSet = false;
    var isOriginSet = false;
    var headers = details.requestHeaders;

    for (var i = 0, l = headers.length; i < l; ++i) {
        if (replace_referer && (headers[i].name == 'Referer') && (referer_value != '')) {
            headers[i].value = referer_value;
            isRefererSet = true;
        }
        if (replace_origin && (headers[i].name == 'Origin') && (referer_value != '')) {
            headers[i].value = origin_value;
            isOriginSet = true;
        }
    }

    if (add_referer && (!isRefererSet) && (referer_value != '')) {
        headers["Referer"] = referer_value;
    }

    if (add_origin && (!isOriginSet) && (referer_value != '')) {
        headers["Origin"] = origin_value;
    }

    details.requestHeaders = headers;
};

ipcMain.on('currentLyric', (event, arg) => {
  if (floatingWindow && floatingWindow !== null) {
    if(typeof arg === 'string') {
      floatingWindow.webContents.send('currentLyric', arg);
      floatingWindow.webContents.send('currentLyricTrans', '');
    } else {
      floatingWindow.webContents.send('currentLyric', arg.lyric);
      floatingWindow.webContents.send('currentLyricTrans', arg.tlyric);
    }
  }
})

ipcMain.on('trackPlayingNow', (event, track) => {
  if(mainWindow != null){
    initialTray(mainWindow, track);
  }
})

ipcMain.on('isPlaying', (event, isPlaying) => {
  if (!isPlaying) {
    setThumbarPause();
  } else {
    setThumbbarPlay();
  }
})

ipcMain.on('control', (event, arg) => {
  // console.log(arg);
  if(arg == 'enable_global_shortcut') {
    enableGlobalShortcuts();
  }
  else if(arg == 'disable_global_shortcut') {
    disableGlobalShortcuts();
  }
  else if (arg == 'enable_lyric_floating_window') {
    createFloatingWindow();
  }
  else if (arg == 'disable_lyric_floating_window') {
    if (floatingWindow) {
      floatingWindow.hide();
    }
  }
  else if(arg == 'window_min') {
    mainWindow.minimize();
  }
  else if(arg == 'window_max') {
    if(windowState.maximized == true) {
        windowState.maximized = false;
        mainWindow.unmaximize();
      } else {
        windowState.maximized = true;
        mainWindow.maximize();
      }
  }
  else if(arg == 'window_close') {
    mainWindow.close();
  }
  // event.sender.send('asynchronous-reply', 'pong')
})


const gotTheLock = app.requestSingleInstanceLock()

if (!gotTheLock) {
  app.quit()
} else {
  app.on('second-instance', (event, commandLine, workingDirectory) => {
    // Someone tried to run a second instance, we should focus our window.
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
      // When start a new instance, show the main window and active in taskbar.
      mainWindow.show()
      mainWindow.setSkipTaskbar(false)
    }
  })

  // Create myWindow, load the rest of the app, etc...
  app.on('ready', () => {
    createWindow()
  })
}


// Quit when all windows are closed.
app.on('window-all-closed', function () {
  // On OS X it is common for applications and their menu bar
  // to stay active until the user quits explicitly with Cmd + Q
  if (process.platform !== 'darwin') {
    app.quit()
  }
})


/* 'activate' is emitted when the user clicks the Dock icon (OS X) */
app.on('activate', () => mainWindow.show());

/* 'before-quit' is emitted when Electron receives
 * the signal to exit and wants to start closing windows */
app.on('before-quit', () => willQuitApp = true);

app.on('will-quit', () => {
 disableGlobalShortcuts();
})
