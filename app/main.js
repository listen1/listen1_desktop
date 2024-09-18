const electron = require("electron");
const {
  app,
  BrowserWindow,
  globalShortcut,
  ipcMain,
  Menu,
  session,
  screen,
  Tray
} = electron;
const Store = require("electron-store");
const { autoUpdater } = require("electron-updater");
const { join, extname } = require("path");
const fs = require("fs");
const nodeid3 = require("node-id3");
const { writeFlacTagsSync } = require("flac-tagger");

const http = require("http");
const https = require("https");
const { console } = require("inspector");

const store = new Store();
const iconPath = join(__dirname, "/listen1_chrome_extension/images/logo.png");

autoUpdater.checkForUpdatesAndNotify();

let floatingWindowCssKey = undefined,
  appIcon = null,
  willQuitApp = false,
  transparent = false,
  trayIconPath;
/** @type {electron.BrowserWindow} */
let mainWindow;
/** @type {electron.BrowserWindow} */
let floatingWindow;
/** @type {electron.Tray} */
let appTray;
//platform-specific
switch (process.platform) {
  case "darwin":
    trayIconPath = join(__dirname, "/resources/logo_16.png");
    transparent = true;
    break;
  case "linux":
    trayIconPath = join(__dirname, "/resources/logo_32.png");
    // fix transparent window not working in linux bug
    app.disableHardwareAcceleration();
    break;
  case "win32":
    trayIconPath = join(__dirname, "/resources/logo_32.png");
    break;
  default:
    break;
}
// Keep a global reference of the window object, if you don't, the window will
// be closed automatically when the JavaScript object is garbage collected.
/** @type {{ width: number; height: number; maximized: boolean; zoomLevel: number}} */
const windowState = store.get("windowState") || {
  width: 1000,
  height: 670,
  maximized: false,
  zoomLevel: 0,
};
/** @type {electron.Config} */
let proxyConfig = store.get("proxyConfig") || {
  mode: "system",
};

const globalShortcutMapping = {
  "CmdOrCtrl+Alt+Left": "left",
  "CmdOrCtrl+Alt+Right": "right",
  "CmdOrCtrl+Alt+Space": "space",
  MediaNextTrack: "right",
  MediaPreviousTrack: "left",
  MediaPlayPause: "space",
};
/**
 * @param {electron.BrowserWindow} mainWindow
 * @param {{ title: string; artist: string; }} [track]
 */
function initialTray(mainWindow, track) {
  track ||= {
    title: "暂无歌曲",
    artist: "  ",
  };

  let nowPlayingTitle = `${track.title}`;
  let nowPlayingArtist = `歌手: ${track.artist}`;

  function toggleVisiable() {
    mainWindow.isVisible() ? mainWindow.hide() : mainWindow.show();
  }
  const menuTemplate = [
    {
      label: nowPlayingTitle,
      click() {
        mainWindow.show();
      },
    },
    {
      label: nowPlayingArtist,
      click() {
        mainWindow.show();
      },
    },
    { type: "separator" },
    {
      label: "播放/暂停",
      click() {
        mainWindow.webContents.send("globalShortcut", "space");
      },
    },
    {
      label: "上一首",
      click() {
        mainWindow.webContents.send("globalShortcut", "left");
      },
    },
    {
      label: "下一首",
      click() {
        mainWindow.webContents.send("globalShortcut", "right");
      },
    },
    {
      label: "显示/隐藏窗口",
      click() {
        toggleVisiable();
      },
    },
    {
      label: "退出",
      click() {
        app.quit();
      },
    },
  ];

  const contextMenu = Menu.buildFromTemplate(menuTemplate);

  if (appTray?.destroy != undefined) {
    // appTray had create, just refresh tray menu here
    appTray?.setContextMenu(contextMenu);
    return;
  }

  appTray = new Tray(trayIconPath);
  appTray.setContextMenu(contextMenu);
  appTray.on("click", () => {
    toggleVisiable();
  });
}

/**
 * @param {string | electron.Accelerator} key
 * @param {string} message
 */
function setKeyMapping(key, message) {
  globalShortcut.register(key, () => {
    mainWindow.webContents.send("globalShortcut", message);
  });
}

function enableGlobalShortcuts() {
  // initial global shortcuts
  for (const [key, value] of Object.entries(globalShortcutMapping)) {
    setKeyMapping(key, value);
  }
}

function disableGlobalShortcuts() {
  globalShortcut.unregisterAll();
}
/**
 * @param {string} cssStyle
 */
async function updateFloatingWindow(cssStyle) {
  if (cssStyle === undefined) {
    return;
  }
  try {
    const newCssKey = await floatingWindow.webContents.insertCSS(cssStyle, {
      cssOrigin: "author",
    });
    if (floatingWindowCssKey !== undefined) {
      await floatingWindow.webContents.removeInsertedCSS(floatingWindowCssKey);
    }
    floatingWindowCssKey = newCssKey;
  } catch (err) {
    console.log(err);
  }
}
/**
 * @param {electron.Config} params
 */
async function updateProxyConfig(params) {
  proxyConfig = params;

  await mainWindow.webContents.session.setProxy(params);
  await mainWindow.webContents.session.forceReloadProxyConfig();
}
/**
 * @param {string} cssStyle
 */
function createFloatingWindow(cssStyle) {
  const display = screen.getPrimaryDisplay();
  if (process.platform === "linux") {
    // fix transparent window not working in linux bug
    floatingWindow?.destroy();
    floatingWindow = null;
  }
  if (!floatingWindow) {
    /** @type {Electron.Rectangle} */
    const winBounds = store.get("floatingWindowBounds");

    floatingWindow = new BrowserWindow({
      width: 1000,
      minWidth: 640,
      maxWidth: 1920,
      height: 70,
      titleBarStyle: "hidden",
      transparent: true,
      frame: false,
      resizable: true,
      hasShadow: false,
      alwaysOnTop: true,
      webPreferences: {
        sandbox: true,
        preload: join(__dirname, "preload.js"),
      },
      ...winBounds,
    });

    if (winBounds === undefined) {
      floatingWindow.setPosition(
        floatingWindow.getPosition()[0],
        display.bounds.height - 150
      );
    }
    floatingWindow.setVisibleOnAllWorkspaces(true);
    floatingWindow.setSkipTaskbar(true);
    floatingWindow.loadURL(`file://${__dirname}/floatingWindow.html`);
    floatingWindow.setAlwaysOnTop(true, "floating");
    floatingWindow.setIgnoreMouseEvents(false);
    // NOTICE: setResizable should be set, otherwise mouseleave event won't trigger in windows environment
    floatingWindow.webContents.on("did-finish-load", async () => {
      await updateFloatingWindow(cssStyle);
    });
    floatingWindow.on("closed", () => {
      floatingWindow = null;
    });

    // floatingWindow.webContents.openDevTools();
  }
  floatingWindow.showInactive();
}

const previousButton = {
  tooltip: "Previous",
  icon: join(__dirname, "/resources/prev-song.png"),
  click() {
    mainWindow.webContents.send("globalShortcut", "left");
  },
};
const nextButton = {
  tooltip: "Next",
  icon: join(__dirname, "/resources/next-song.png"),
  click() {
    mainWindow.webContents.send("globalShortcut", "right");
  },
};
const playButton = {
  tooltip: "Play",
  icon: join(__dirname, "/resources/play-song.png"),
  click() {
    mainWindow.webContents.send("globalShortcut", "space");
  },
};
const pauseButton = {
  tooltip: "Pause",
  icon: join(__dirname, "/resources/pause-song.png"),
  click() {
    mainWindow.webContents.send("globalShortcut", "space");
  },
};
const setThumbarPause = () => {
  mainWindow?.setThumbarButtons([previousButton, playButton, nextButton]);
};
const setThumbbarPlay = () => {
  mainWindow?.setThumbarButtons([previousButton, pauseButton, nextButton]);
};

function createWindow() {
  const filter = {
    urls: [
      "*://*.music.163.com/*",
      "*://music.163.com/*",
      "*://*.xiami.com/*",
      "*://i.y.qq.com/*",
      "*://c.y.qq.com/*",
      "*://*.kugou.com/*",
      "*://*.kuwo.cn/*",
      "*://*.bilibili.com/*",
      "*://*.bilivideo.com/*",
      "*://*.bilivideo.cn/*",
      "*://*.migu.cn/*",
      "*://*.githubusercontent.com/*",
      "https://listen1.github.io/listen1/callback.html?code=*",
    ],
  };

  session.defaultSession.webRequest.onBeforeSendHeaders(
    filter,
    (details, callback) => {
      if (
        details.url.startsWith(
          "https://listen1.github.io/listen1/callback.html?code="
        )
      ) {
        const { url } = details;
        const code = url.split("=")[1];
        mainWindow.webContents.executeJavaScript(
          'GithubClient.github.handleCallback("' + code + '");'
        );
      } else {
        hack_referer_header(details);
      }
      callback({ cancel: false, requestHeaders: details.requestHeaders });
    }
  );
  // Create the browser window.
  mainWindow = new BrowserWindow({
    width: windowState.width,
    height: windowState.height,
    minHeight: 300,
    minWidth: 600,
    webPreferences: {
      nodeIntegration: true,
      enableRemoteModule: true,
      contextIsolation: false,
    },
    icon: iconPath,
    titleBarStyle: "hiddenInset",
    transparent: transparent,
    vibrancy: "light",
    frame: false,
    hasShadow: true,
  });

  mainWindow.on("ready-to-show", () => {
    if (windowState.maximized) {
      mainWindow.maximize();
    }
    mainWindow.webContents.send("setZoomLevel", windowState.zoomLevel);
  });

  mainWindow.on("resized", () => {
    if (!mainWindow.isMaximized() && !mainWindow.isFullScreen()) {
      const [width, height] = mainWindow.getSize();
      windowState.width = width;
      windowState.height = height;
    }
  });
  mainWindow.on("close", (e) => {
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
  const ua =
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_14_2) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/72.0.3626.119 Safari/537.36";

  mainWindow.webContents.session.setProxy(proxyConfig).then(() => {
    mainWindow.loadURL(
      `file://${__dirname}/listen1_chrome_extension/listen1.html`,
      { userAgent: ua }
    );
  });

  setThumbarPause();
  // Emitted when the window is closed.
  mainWindow.on("closed", () => {
    // Dereference the window object, usually you would store windows
    // in an array if your app supports multi windows, this is the time
    // when you should delete the corresponding element.
    mainWindow = null;
  });

  // define global menu content, also add support for cmd+c and cmd+v shortcuts
  const template = [
    {
      label: "Application",
      submenu: [
        {
          label: "Zoom Out",
          accelerator: "CmdOrCtrl+=",
          click() {
            if (windowState.zoomLevel <= 2.5) {
              windowState.zoomLevel += 0.5;
              mainWindow.webContents.send(
                "setZoomLevel",
                windowState.zoomLevel
              );
            }
          },
        },
        {
          label: "Zoom in",
          accelerator: "CmdOrCtrl+-",
          click() {
            if (windowState.zoomLevel >= -1) {
              windowState.zoomLevel -= 0.5;
              mainWindow.webContents.send(
                "setZoomLevel",
                windowState.zoomLevel
              );
            }
          },
        },
        {
          label: "Toggle Developer Tools",
          accelerator: "F12",
          click() {
            mainWindow.webContents.toggleDevTools();
          },
        },
        {
          label: "About Application",
          selector: "orderFrontStandardAboutPanel:",
        },
        { type: "separator" },
        {
          label: "Close Window",
          accelerator: "CmdOrCtrl+W",
          click() {
            mainWindow.close();
          },
        },
        {
          label: "Quit",
          accelerator: "Command+Q",
          click() {
            app.quit();
          },
        },
      ],
    },
    {
      label: "Edit",
      submenu: [
        { label: "Undo", accelerator: "CmdOrCtrl+Z", selector: "undo:" },
        { label: "Redo", accelerator: "Shift+CmdOrCtrl+Z", selector: "redo:" },
        { type: "separator" },
        { label: "Cut", accelerator: "CmdOrCtrl+X", selector: "cut:" },
        { label: "Copy", accelerator: "CmdOrCtrl+C", selector: "copy:" },
        { label: "Paste", accelerator: "CmdOrCtrl+V", selector: "paste:" },
        {
          label: "Select All",
          accelerator: "CmdOrCtrl+A",
          selector: "selectAll:",
        },
      ],
    },
  ];

  mainWindow.setMenu(null);

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));

  initialTray(mainWindow);
}

const MOBILE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 14_3 like Mac OS X) AppleWebKit/534.30 (KHTML, like Gecko) Version/4.0 Mobile Safari/534.30";

/**
 * @param {electron.OnBeforeSendHeadersListenerDetails} details
 */
function hack_referer_header(details) {
  let replace_referer = true;
  let replace_origin = true;
  let add_referer = true;
  let add_origin = true;
  let referer_value = "";
  let origin_value = "";
  let ua_value = "";

  if (details.url.includes("://music.163.com/")) {
    referer_value = "http://music.163.com/";
  }
  if (details.url.includes("://interface3.music.163.com/")) {
    referer_value = "http://music.163.com/";
  }
  if (details.url.includes("://gist.githubusercontent.com/")) {
    referer_value = "https://gist.githubusercontent.com/";
  }

  if (details.url.includes(".xiami.com/")) {
    add_origin = false;
    referer_value = "https://www.xiami.com/";
  }
  if (details.url.includes("www.xiami.com/api/search/searchSongs")) {
    const key = /key%22:%22(.*?)%22/.exec(details.url)[1];
    add_origin = false;
    referer_value = `https://www.xiami.com/search?key=${key}`;
  }
  if (details.url.includes("c.y.qq.com/")) {
    referer_value = "https://y.qq.com/";
    origin_value = "https://y.qq.com";
  }
  if (
    details.url.includes("y.qq.com/") ||
    details.url.includes("qqmusic.qq.com/") ||
    details.url.includes("music.qq.com/") ||
    details.url.includes("imgcache.qq.com/")
  ) {
    referer_value = "http://y.qq.com/";
  }
  if (details.url.includes(".kugou.com/")) {
    referer_value = "https://www.kugou.com/";
    ua_value = MOBILE_UA;
  }
  if (details.url.includes("m.kugou.com/")) {
    ua_value = MOBILE_UA;
  }
  if (details.url.includes(".kuwo.cn/")) {
    referer_value = "http://www.kuwo.cn/";
  }
  if (
    details.url.includes(".bilibili.com/") ||
    details.url.includes(".bilivideo.com/")
  ) {
    referer_value = "https://www.bilibili.com/";
    replace_origin = false;
    add_origin = false;
  }
  if (details.url.includes('.bilivideo.cn')) {
    referer_value = 'https://www.bilibili.com/';
    origin_value = 'https://www.bilibili.com/';
    add_referer = true;
    add_origin = true;
  }
  if (details.url.includes(".migu.cn")) {
    referer_value = "http://music.migu.cn/v3/music/player/audio?from=migu";
  }
  if (details.url.includes("m.music.migu.cn")) {
    referer_value = "https://m.music.migu.cn/";
  }
  if (origin_value == "") {
    origin_value = referer_value;
  }
  let isRefererSet = false;
  let isOriginSet = false;
  let isUASet = false;
  let headers = details.requestHeaders;

  for (let i = 0, l = headers.length; i < l; ++i) {
    if (
      replace_referer &&
      headers[i].name == "Referer" &&
      referer_value != ""
    ) {
      headers[i].value = referer_value;
      isRefererSet = true;
    }
    if (replace_origin && headers[i].name == "Origin" && referer_value != "") {
      headers[i].value = origin_value;
      isOriginSet = true;
    }
    if (headers[i].name === "User-Agent" && ua_value !== "") {
      headers[i].value = ua_value;
      isUASet = true;
    }
  }

  if (add_referer && !isRefererSet && referer_value != "") {
    headers["Referer"] = referer_value;
  }

  if (add_origin && !isOriginSet && referer_value != "") {
    headers["Origin"] = origin_value;
  }

  if (!isUASet && ua_value !== "") {
    headers["User-Agent"] = ua_value;
  }

  details.requestHeaders = headers;
}

ipcMain.on("currentLyric", (event, arg) => {
  if (floatingWindow && floatingWindow !== null) {
    if (typeof arg === "string") {
      floatingWindow.webContents.send("currentLyric", arg);
      floatingWindow.webContents.send("currentLyricTrans", "");
    } else {
      floatingWindow.webContents.send("currentLyric", arg.lyric);
      floatingWindow.webContents.send("currentLyricTrans", arg.tlyric);
    }
  }
});

ipcMain.on("trackPlayingNow", (event, track) => {
  if (mainWindow != null) {
    initialTray(mainWindow, track);
  }
});

ipcMain.on("isPlaying", (event, isPlaying) => {
  isPlaying ? setThumbbarPlay() : setThumbarPause();
});

ipcMain.on("control", async (event, arg, params) => {
  switch (arg) {
    case "enable_global_shortcut":
      enableGlobalShortcuts();
      break;

    case "disable_global_shortcut":
      disableGlobalShortcuts();
      break;

    case "enable_lyric_floating_window":
      createFloatingWindow(params);
      break;

    case "disable_lyric_floating_window":
      floatingWindow?.hide();
      break;

    case "window_min":
      mainWindow.minimize();
      break;

    case "window_max":
      windowState.maximized ? mainWindow.unmaximize() : mainWindow.maximize();
      windowState.maximized = !windowState.maximized;
      break;

    case "window_close":
      mainWindow.close();
      break;

    case "float_window_accept_mouse_event":
      floatingWindow.setIgnoreMouseEvents(false);
      break;

    case "float_window_ignore_mouse_event":
      floatingWindow.setIgnoreMouseEvents(true, { forward: true });
      break;

    case "float_window_close":
    case "float_window_font_small":
    case "float_window_font_large":
    case "float_window_background_light":
    case "float_window_background_dark":
    case "float_window_font_change_color":
      mainWindow.webContents.send("lyricWindow", arg);
      break;

    case "update_lyric_floating_window_css":
      await updateFloatingWindow(params);
      break;

    case "get_proxy_config":
      mainWindow.webContents.send("proxyConfig", proxyConfig);
      break;

    case "update_proxy_config":
      await updateProxyConfig(params);
      break;

    default:
      break;
  }
  // event.sender.send('asynchronous-reply', 'pong')
});

ipcMain.on("openUrl", (event, arg, params) => {
  const bWindow = new BrowserWindow({
    parent: mainWindow,
    height: 700,
    resizable: true,
    width: 985,
    frame: true,
    fullscreen: false,
    maximizable: true,
    minimizable: true,
    autoHideMenuBar: true,
    webPreferences: {
      // sandbox is necessary for website js to work
      // thanks to https://github.com/sunzongzheng/music
      sandbox: true,
    },
  });
  bWindow.loadURL(arg);
  bWindow.setMenu(null);
});

ipcMain.on("floatWindowMoving", (e, { mouseX, mouseY }) => {
  const { x, y } = screen.getCursorScreenPoint();
  floatingWindow?.setPosition(x - mouseX, y - mouseY);
});

function tryNextAfterDownload(cacheOnlyMode){
  if (cacheOnlyMode){
    mainWindow.webContents.send("globalShortcut", "right");
  }
}

function saveTags(music_path, tagData, image){
  if (music_path.endsWith(".mp3")){
    tags = {
      title: tagData.title,
      artist: tagData.artist,
      album: tagData.album
    };
    if (image){
      tags["image"] = {
        mime: image.mime,
        type: {
          id: nodeid3.TagConstants.AttachedPicture.PictureType.FRONT_COVER
        },
        imageBuffer: image.buffer
      }
    }
    nodeid3.write(tags, music_path, (err) => {console.error(err)});
  }else if(music_path.endsWith(".flac")) {
    const tagMap = {
      title: tagData.title,
      artist: [tagData.artist],
      album: tagData.album,
    };
    let tags = {tagMap};
    if (image && Buffer.byteLength(image.buffer) <= 16*1024*1024){
      tags["picture"] = {
        mime: image.mime,
        buffer: image.buffer
      }
    }
    try{
      writeFlacTagsSync(tags, music_path);
    }catch(e){
      console.error(e);
    }
    
  }
}

ipcMain.on("downloadMusic", (event, {data, musicCacheDir, cacheOnlyMode}) => {
  if (!data.url){
    return;
  }
  if (!data.artist){
    data.artist = "未知"
  }
  if (!data.album){
    data.album = "未知"
  }
  data.artist = data.artist.trim().replaceAll("/","|");
  data.album = data.album.trim().replaceAll("/","|");
  const music_dir = join(musicCacheDir, data.artist, data.album);
  if (!fs.existsSync(music_dir)){
    fs.mkdirSync(music_dir,{ recursive: true });
  }
  let files = fs.readdirSync(music_dir);
  files = files.filter(function (item) {
      return item.indexOf(".") !== 0;
  });
  if (files.length === 0){
    (data.url.startsWith("https://")?https:http).get(data.url,{responseType: "stream"},(response) => {
      console.debug(response.headers);
      let ext = extname(data.url.split("?")[0]);
      const headerLine = response.headers['content-disposition'];
      if (headerLine){
        const filename = headerLine.substring(headerLine.indexOf('"') + 1, headerLine.lastIndexOf('"'));
        ext = extname(filename)||ext;
      }
      const music_path = join(music_dir, data.title.trim().replaceAll("/","|") + ext);
      response.pipe(fs.createWriteStream(music_path)).on("close", () => {
        const tagData = {
          title: data.title,
          artist: data.artist,
          album: data.album
        };
        if(data.img_url){
          (data.img_url.startsWith("https://")?https:http).get(data.img_url,{responseType: "stream"}, (img_response) => {
            console.debug(img_response.headers);
            let buffers = [];
            img_response.on("data", buffer =>{
                buffers.push(buffer);
            });
            img_response.on("end", ()=>{
              let image = {
                buffer: Buffer.concat(buffers),
                mime: img_response.headers["content-type"]
              }
              saveTags(music_path, tagData, image);
              tryNextAfterDownload(cacheOnlyMode);
            });
          }).on("error", err=>{
            console.error(err);
            tryNextAfterDownload(cacheOnlyMode);
          });
        }else{
          saveTags(music_path, tagData);
          tryNextAfterDownload(cacheOnlyMode);
        }
      }).on("error", err => {
        console.error(err);
        tryNextAfterDownload(cacheOnlyMode);
      });
    }).on("error", err=>{
      console.error(err);
      tryNextAfterDownload(cacheOnlyMode);
    });
  }else{
    tryNextAfterDownload(cacheOnlyMode);
  }
});

const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on("second-instance", (event, commandLine, workingDirectory) => {
    // Someone tried to run a second instance, we should focus our window.
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
      // When start a new instance, show the main window and active in taskbar.
      mainWindow.show();
      mainWindow.setSkipTaskbar(false);
    }
  });

  // Create myWindow, load the rest of the app, etc...
  app.on("ready", () => {
    createWindow();
  });
}

// Quit when all windows are closed.
app.on("window-all-closed", () => {
  // On OS X it is common for applications and their menu bar
  // to stay active until the user quits explicitly with Cmd + Q
  if (process.platform !== "darwin") {
    app.quit();
  }
});

/* 'activate' is emitted when the user clicks the Dock icon (OS X) */
app.on("activate", () => mainWindow.show());

/* 'before-quit' is emitted when Electron receives
 * the signal to exit and wants to start closing windows */
app.on("before-quit", () => {
  if (mainWindow.webContents.isDevToolsOpened()) {
    mainWindow.webContents.closeDevTools();
  }
  if (floatingWindow) {
    store.set("floatingWindowBounds", floatingWindow.getBounds());
  }
  store.set("windowState", windowState);
  store.set("proxyConfig", proxyConfig);

  willQuitApp = true;
});

app.on("will-quit", () => {
  disableGlobalShortcuts();
});
