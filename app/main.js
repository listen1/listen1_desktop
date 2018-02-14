const electron = require('electron')
// Module to control application life.
const app = electron.app

// Module to create native browser window.
const BrowserWindow = electron.BrowserWindow

var path = require('path')
var iconPath = path.join(__dirname, '/listen1_chrome_extension/images/logo.png');

// Keep a global reference of the window object, if you don't, the window will
// be closed automatically when the JavaScript object is garbage collected.
let mainWindow
let willQuitApp = false;

function initialTray(mainWindow) {
  const {app, Menu, Tray} = require('electron');

  let appIcon = null;

  var trayIconPath = path.join(__dirname, '/resources/logo_16.png');
  appTray = new Tray(trayIconPath);

  function toggleVisiable() {
    var isVisible = mainWindow.isVisible();
    if (isVisible) {
      mainWindow.hide();
    } else {
      mainWindow.show();
    }
  }
  const contextMenu = Menu.buildFromTemplate([
    {label: 'Show/Hide Window',  click(){
      toggleVisiable();
    }},
    {label: 'Quit',  click() {
      app.quit(); 
    }},
  ]);
  //appTray.setToolTip('This is my application.');
  appTray.setContextMenu(contextMenu);
  appTray.on('click', function handleClicked () {
    toggleVisiable();
  });
}

function createWindow () {

  const session = require('electron').session;

  const filter = {
    urls: ["*://music.163.com/*", "*://*.xiami.com/*", "*://*.qq.com/*"]
  };

  session.defaultSession.webRequest.onBeforeSendHeaders(filter, function(details, callback) {
    hack_referer_header(details);
    callback({cancel: false, requestHeaders: details.requestHeaders});
  });

  // Create the browser window.
  mainWindow = new BrowserWindow({
    width: 1024,
    height: 768,
    'webPreferences': {'nodeIntegration': false},
    icon: iconPath
  })

  const githubCallbackFilter = {urls: ["https://listen1.github.io/listen1/callback.html?code=*"]};
  session.defaultSession.webRequest.onBeforeSendHeaders(githubCallbackFilter, function(details, callback) {
    const url = details.url;
    const code = url.split('=')[1];
    mainWindow.webContents.executeJavaScript('Github.handleCallback("'+code+'");');
    callback({cancel: false, requestHeaders: details.requestHeaders});
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
  mainWindow.loadURL(`file://${__dirname}/listen1_chrome_extension/listen1.html`)

  // Open the DevTools.
  //mainWindow.webContents.openDevTools()

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

  electron.Menu.setApplicationMenu(electron.Menu.buildFromTemplate(template));

  initialTray(mainWindow);
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
      headers["Origin"] = refererValue;
      headers["Referer"] = refererValue;
    }
    details.requestHeaders = headers;
};



// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.on('ready', createWindow)

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


