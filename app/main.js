/**
 * 文件职责：管理 Electron 生命周期、主窗口、悬浮歌词、托盘、全局快捷键、代理和更新，连接经过校验的页面 IPC。
 *
 * 文件级定义：
 * - electron：从 electron 引入，用于Electron 桌面运行时模块。
 * - app：从 electron 引入，用于Electron 应用生命周期入口。
 * - BrowserWindow：从 electron 引入，用于创建或检查 Electron 窗口。
 * - globalShortcut：从 electron 引入，用于注册及清理系统快捷键。
 * - ipcMain：从 electron 引入，用于接收并注册主进程 IPC。
 * - Menu：从 electron 引入，用于构建应用或托盘菜单。
 * - session：从 electron 引入，用于管理会话、代理、请求头与 Cookie。
 * - screen：从 electron 引入，用于查询显示器工作区和鼠标位置。
 * - Tray：从 electron 引入，用于创建系统托盘。
 * - autoUpdater：从 electron-updater 引入，用于检查已打包应用更新。
 * - join：从 path 引入，用于拼接资源与脚本路径。
 * - createDesktopApi：从 ./desktop-api 引入，用于注册带来源检查的桌面 IPC。
 * - applyPlatformHeaders：从 ./request-headers 引入，用于按来源处理音乐平台请求头。
 * - store：异步初始化后的 electron-store 实例，保存窗口和代理设置。
 * - iconPath：主窗口应用图标的绝对路径。
 * - floatingWindowCssKey：最近插入歌词窗口的 CSS 键，用于替换样式时移除旧规则。
 * - appIcon：保留的应用图标状态，当前未参与后续处理。
 * - willQuitApp：是否正在明确退出应用，决定关闭事件是销毁还是隐藏。
 * - transparent：当前平台主窗口是否启用透明背景。
 * - trayIconPath：按操作系统选取的托盘图标绝对路径。
 * - mainWindow：当前主窗口引用，实际关闭后清空。
 * - floatingWindow：当前悬浮歌词窗口引用，销毁后清空。
 * - appTray：可复用的系统托盘实例。
 * - windowState：使用既有存储键恢复的宽高、最大化和缩放状态。
 * - proxyConfig：当前会话代理配置，退出时写回既有存储键。
 * - settingsReady：设置初始化完成的 Promise，主窗口创建前等待它完成。
 * - desktopApi：已注册桌面接口返回的来源与控制参数校验工具。
 * - （createDesktopApi）.getMainWindow：提供当前主窗口引用，供桌面 API 在每次消息到达时验证身份。
 * - （createDesktopApi）.getFloatingWindow：提供当前悬浮窗口引用，供歌词控制消息验证身份。
 * - FLOATING_WINDOW_DEFAULT_BOUNDS：悬浮歌词默认宽高，单位为像素。
 * - normalizeFloatingWindowBounds：将已存的悬浮窗坐标和尺寸限制在显示器工作区。
 * - globalShortcutMapping：系统快捷键到页面播放命令的映射表。
 * - initialTray：根据当前歌曲创建或刷新托盘菜单，绑定播放、切歌、显隐和退出操作。
 * - setKeyMapping：注册一个系统快捷键，触发后把映射命令发送给主窗口。
 * - enableGlobalShortcuts：注册表中的全部媒体键和全局组合键。
 * - disableGlobalShortcuts：注销本进程注册的全部全局快捷键。
 * - updateFloatingWindow：向歌词窗口插入新 CSS 后移除旧样式。
 * - updateProxyConfig：替换内存中的代理设置，等待会话应用并强制刷新代理配置。
 * - createFloatingWindow：创建或显示隔离的透明歌词窗口，恢复受工作区约束的位置并在页面加载后应用样式。
 * - previousButton：任务栏上一首按钮配置及点击处理器。
 * - previousButton.click：向播放器转发上一首快捷键命令。
 * - nextButton：任务栏下一首按钮配置及点击处理器。
 * - nextButton.click：向播放器转发下一首快捷键命令。
 * - playButton：任务栏播放按钮配置及点击处理器。
 * - playButton.click：向播放器转发播放／暂停切换命令。
 * - pauseButton：任务栏暂停按钮配置及点击处理器。
 * - pauseButton.click：向播放器转发播放／暂停切换命令。
 * - setThumbarPause：将任务栏中间按钮设置为播放图标，表示当前可恢复播放。
 * - setThumbbarPlay：将任务栏中间按钮设置为暂停图标，表示当前可暂停播放。
 * - createWindow：安装平台请求头处理，创建隔离主窗口并加载共享页面，绑定关闭隐藏、缩放菜单、托盘及导航限制。
 * - handleControl：校验桌面或歌词窗口的控制请求，再执行窗口、快捷键、歌词或代理操作。
 * - gotTheLock：是否取得单实例锁，未取得时退出新进程。
 */
/**
 * electron：从 electron 引入，用于Electron 桌面运行时模块；类型为 typeof import("electron")。
 * @type {typeof import("electron")}
 */
const electron = require("electron");
/**
 * app：从 electron 引入，用于Electron 应用生命周期入口；类型为 typeof import("electron").app。
 * BrowserWindow：从 electron 引入，用于创建或检查 Electron 窗口；类型为 typeof import("electron").BrowserWindow。
 * globalShortcut：从 electron 引入，用于注册及清理系统快捷键；类型为 typeof import("electron").globalShortcut。
 * ipcMain：从 electron 引入，用于接收并注册主进程 IPC；类型为 typeof import("electron").ipcMain。
 * Menu：从 electron 引入，用于构建应用或托盘菜单；类型为 typeof import("electron").Menu。
 * session：从 electron 引入，用于管理会话、代理、请求头与 Cookie；类型为 typeof import("electron").session。
 * screen：从 electron 引入，用于查询显示器工作区和鼠标位置；类型为 typeof import("electron").screen。
 * Tray：从 electron 引入，用于创建系统托盘；类型为 typeof import("electron").Tray。
 */
const {
  app,
  BrowserWindow,
  globalShortcut,
  ipcMain,
  Menu,
  session,
  screen,
  Tray,
} = electron;
/**
 * autoUpdater：从 electron-updater 引入，用于检查已打包应用更新；类型为 typeof import("electron-updater").autoUpdater。
 */
const { autoUpdater } = require("electron-updater");
/**
 * join：从 path 引入，用于拼接资源与脚本路径；类型为 typeof import("path").join。
 */
const { join } = require("path");
/**
 * createDesktopApi：从 ./desktop-api 引入，用于注册带来源检查的桌面 IPC；类型为 typeof import("./desktop-api").createDesktopApi。
 */
const { createDesktopApi } = require("./desktop-api");
/**
 * applyPlatformHeaders：从 ./request-headers 引入，用于按来源处理音乐平台请求头；类型为 typeof import("./request-headers").applyPlatformHeaders。
 */
const { applyPlatformHeaders } = require("./request-headers");

// 打包后的测试程序与源码测试共用可丢弃配置目录的隔离边界。
if (process.env.LISTEN1_TEST_USER_DATA) {
  const profile = require("node:path").resolve(
    process.env.LISTEN1_TEST_USER_DATA
  );
  require("node:fs").mkdirSync(profile, { recursive: true });
  app.setPath("userData", profile);
  app.setPath("sessionData", profile);
}

/**
 * store：异步初始化后的 electron-store 实例，保存窗口和代理设置；类型为 Object|undefined。
 * @type {Object|undefined}
 */
let store;
/**
 * iconPath：主窗口应用图标的绝对路径；类型为 string。
 * @type {string}
 */
const iconPath = join(__dirname, "/listen1_chrome_extension/images/logo.png");

autoUpdater.on(
  "error",
  /**
   * 响应 "error" 事件，执行 console.warn（"Update check failed:"）。
   * @param error 被捕获或传入的异常；使用 code 字段。
   * @returns {*} console.warn 的调用结果。
   */
  (error) => console.warn("Update check failed:", error.code || "UPDATE_ERROR")
);

/**
 * floatingWindowCssKey：最近插入歌词窗口的 CSS 键，用于替换样式时移除旧规则；类型为 string|undefined。
 * appIcon：保留的应用图标状态，当前未参与后续处理；类型为 null。
 * willQuitApp：是否正在明确退出应用，决定关闭事件是销毁还是隐藏；类型为 boolean。
 * transparent：当前平台主窗口是否启用透明背景；类型为 boolean。
 * trayIconPath：按操作系统选取的托盘图标绝对路径；类型为 string|undefined。
 */
let floatingWindowCssKey = undefined,
  appIcon = null,
  willQuitApp = false,
  transparent = false,
  trayIconPath;

/**
 * mainWindow：当前主窗口引用，实际关闭后清空；类型为 electron.BrowserWindow|null|undefined。
 * @type {electron.BrowserWindow}
 */
let mainWindow;

/**
 * floatingWindow：当前悬浮歌词窗口引用，销毁后清空；类型为 electron.BrowserWindow|null|undefined。
 * @type {electron.BrowserWindow}
 */
let floatingWindow;
let currentFloatingLyric = { lyric: "", tlyric: "" };

/**
 * appTray：可复用的系统托盘实例；类型为 electron.Tray|undefined。
 * @type {electron.Tray}
 */
let appTray;
// 按操作系统选择托盘资源与窗口透明设置。
switch (process.platform) {
  case "darwin":
    trayIconPath = join(__dirname, "/resources/logo_16.png");
    transparent = true;
    break;
  case "linux":
    trayIconPath = join(__dirname, "/resources/logo_32.png");
    // Linux 下关闭硬件加速或重建窗口，沿用透明窗口兼容处理。
    app.disableHardwareAcceleration();
    break;
  case "win32":
    trayIconPath = join(__dirname, "/resources/logo_32.png");
    break;
  default:
    break;
}
// 保留窗口的全局引用，避免对象被回收后窗口随之关闭。
// 窗口销毁时由对应事件释放引用。

/**
 * windowState：使用既有存储键恢复的宽高、最大化和缩放状态；类型为 Object。
 * @type {{ width: number; height: number; maximized: boolean; zoomLevel: number}}
 */
const windowState = {
  width: 1000,
  height: 670,
  maximized: false,
  zoomLevel: 0,
};

/**
 * proxyConfig：当前会话代理配置，退出时写回既有存储键；类型为 Object。
 * @type {electron.Config}
 */
let proxyConfig = {
  mode: "system",
};
/**
 * settingsReady：设置初始化完成的 Promise，主窗口创建前等待它完成；类型为 Promise<*>。
 * @type {Promise<*>}
 */
const settingsReady = import("electron-store").then(
  /**
   * 上一步异步操作完成后，更新 store、proxyConfig，执行 store.get（"windowState"）。
   * @param options 解构参数，包含 Store（动态导入的 electron-store 默认构造器）。
   * @returns {void} 无返回值。
   */
  ({ default: Store }) => {
    store = new Store();
    Object.assign(windowState, store.get("windowState") || {});
    proxyConfig = store.get("proxyConfig") || proxyConfig;
  }
);
/**
 * desktopApi：已注册桌面接口返回的来源与控制参数校验工具；类型为 Object。
 * @type {Object}
 */
const desktopApi = createDesktopApi({
  /**
   * 提供当前主窗口引用，供桌面 API 在每次消息到达时验证身份。
   * 无参数。
   * @returns {*} mainWindow。
   */
  getMainWindow: () => mainWindow,
  /**
   * 提供当前悬浮窗口引用，供歌词控制消息验证身份。
   * 无参数。
   * @returns {*} floatingWindow。
   */
  getFloatingWindow: () => floatingWindow,
});

/**
 * FLOATING_WINDOW_DEFAULT_BOUNDS：悬浮歌词默认宽高，单位为像素；类型为 Object。
 * @type {Object}
 */
const FLOATING_WINDOW_DEFAULT_BOUNDS = {
  width: 1000,
  height: 70,
};

/**
 * 将已存的悬浮窗坐标和尺寸限制在显示器工作区；固定高度，约束宽度，缺少边界时返回 undefined。
 * @param {Electron.Rectangle | undefined} bounds 已保存的窗口边界，坐标与尺寸均为像素；缺失时不恢复旧位置；使用 width、x、y 字段。
 * @param {Electron.Display} display 用于钳制窗口坐标和尺寸的目标显示器；使用 workAreaSize、workArea 字段。
 * @returns {Electron.Rectangle | undefined} 位于目标工作区内的窗口边界；未提供原边界时为 undefined。
 */
function normalizeFloatingWindowBounds(bounds, display) {
  if (bounds == null) {
    return undefined;
  }

  /**
   * 保留有限数值；遇到缺失值、无穷值或 NaN 时使用备用值。
   * @param value 待检查或转换的输入值。
   * @param fallback 输入不是有限数值时使用的回退值。
   * @returns {number} 有限输入值，或调用方提供的回退数值。
   */
  const getNumber = (value, fallback) =>
    Number.isFinite(value) ? value : fallback;
  const storedWidth = getNumber(
    bounds.width,
    FLOATING_WINDOW_DEFAULT_BOUNDS.width
  );
  const width = Math.min(
    Math.max(storedWidth, 640),
    Math.min(display.workAreaSize.width, 1200)
  );
  const height = FLOATING_WINDOW_DEFAULT_BOUNDS.height;
  const storedX = getNumber(bounds.x, display.workArea.x);
  const storedY = getNumber(bounds.y, display.workArea.y);
  const x = Math.min(
    Math.max(storedX, display.workArea.x),
    display.workArea.x + display.workArea.width - width
  );
  const y = Math.min(
    Math.max(storedY, display.workArea.y),
    display.workArea.y + display.workArea.height - height
  );

  return {
    x,
    y,
    width,
    height,
  };
}

/**
 * globalShortcutMapping：系统快捷键到页面播放命令的映射表；类型为 Object。
 * @type {Object}
 */
const globalShortcutMapping = {
  "CmdOrCtrl+Alt+Left": "left",
  "CmdOrCtrl+Alt+Right": "right",
  "CmdOrCtrl+Alt+Space": "space",
  MediaNextTrack: "right",
  MediaPreviousTrack: "left",
  MediaPlayPause: "space",
};
/* 停用代码，保留供历史对照：
 *
 * @param {electron.BrowserWindow} mainWindow
 * @param {{ title: string; artist: string; }} [track] */
/**
 * 根据当前歌曲创建或刷新托盘菜单，绑定播放、切歌、显隐和退出操作；已有托盘复用其对象。
 * @param mainWindow 托盘和快捷键操作对应的主窗口；使用 isVisible、hide、show、webContents 字段。
 * @param track 统一曲目对象，包含用于路由和查找的 ID；使用 title、artist 字段。
 * @returns {void} 无返回值。
 */
function initialTray(mainWindow, track) {
  track ||= {
    title: "暂无歌曲",
    artist: "  ",
  };

  let nowPlayingTitle = `${track.title}`;
  let nowPlayingArtist = `歌手: ${track.artist}`;

  /**
   * 根据主窗口当前可见状态在显示与隐藏之间切换。
   * 无参数。
   * @returns {void} 无返回值。
   */
  function toggleVisiable() {
    mainWindow.isVisible() ? mainWindow.hide() : mainWindow.show();
  }
  const menuTemplate = [
    {
      label: nowPlayingTitle,
      /**
       * 点击当前菜单或任务栏按钮时，执行 mainWindow.show。
       * 无参数。
       * @returns {void} 无返回值。
       */
      click() {
        mainWindow.show();
      },
    },
    {
      label: nowPlayingArtist,
      /**
       * 点击当前菜单或任务栏按钮时，执行 mainWindow.show。
       * 无参数。
       * @returns {void} 无返回值。
       */
      click() {
        mainWindow.show();
      },
    },
    { type: "separator" },
    {
      label: "播放/暂停",
      /**
       * 点击当前菜单或任务栏按钮时，执行 mainWindow.webContents.send（"globalShortcut"）。
       * 无参数。
       * @returns {void} 无返回值。
       */
      click() {
        mainWindow.webContents.send("globalShortcut", "space");
      },
    },
    {
      label: "上一首",
      /**
       * 点击当前菜单或任务栏按钮时，执行 mainWindow.webContents.send（"globalShortcut"）。
       * 无参数。
       * @returns {void} 无返回值。
       */
      click() {
        mainWindow.webContents.send("globalShortcut", "left");
      },
    },
    {
      label: "下一首",
      /**
       * 点击当前菜单或任务栏按钮时，执行 mainWindow.webContents.send（"globalShortcut"）。
       * 无参数。
       * @returns {void} 无返回值。
       */
      click() {
        mainWindow.webContents.send("globalShortcut", "right");
      },
    },
    {
      label: "显示/隐藏窗口",
      /**
       * 点击当前菜单或任务栏按钮时，执行 toggleVisiable。
       * 无参数。
       * @returns {void} 无返回值。
       */
      click() {
        toggleVisiable();
      },
    },
    {
      label: "退出",
      /**
       * 点击当前菜单或任务栏按钮时，执行 app.quit。
       * 无参数。
       * @returns {void} 无返回值。
       */
      click() {
        app.quit();
      },
    },
  ];

  const contextMenu = Menu.buildFromTemplate(menuTemplate);

  if (appTray?.destroy != undefined) {
    // 已有托盘时只刷新菜单。
    appTray?.setContextMenu(contextMenu);
    return;
  }

  appTray = new Tray(trayIconPath);
  appTray.setContextMenu(contextMenu);
  appTray.on(
    "click",
    /**
     * 响应 "click" 事件，执行 toggleVisiable。
     * 无参数。
     * @returns {void} 无返回值。
     */
    () => {
      toggleVisiable();
    }
  );
}

/**
 * 注册一个系统快捷键，触发后把映射命令发送给主窗口。
 * @param {string | electron.Accelerator} key 索引、配置或字段名称。
 * @param {string} message 待转发的消息或文本。
 * @returns {void} 无返回值。
 */
function setKeyMapping(key, message) {
  globalShortcut.register(
    key,
    /**
     * 进入此回调后，执行 mainWindow.webContents.send（"globalShortcut"）。
     * 无参数。
     * @returns {void} 无返回值。
     */
    () => {
      mainWindow.webContents.send("globalShortcut", message);
    }
  );
}

/**
 * 注册表中的全部媒体键和全局组合键。
 * 无参数。
 * @returns {void} 无返回值。
 */
function enableGlobalShortcuts() {
  // 按映射表初始化全部全局快捷键。
  for (const [key, value] of Object.entries(globalShortcutMapping)) {
    setKeyMapping(key, value);
  }
}

/**
 * 注销本进程注册的全部全局快捷键。
 * 无参数。
 * @returns {void} 无返回值。
 */
function disableGlobalShortcuts() {
  globalShortcut.unregisterAll();
}

/**
 * 向歌词窗口插入新 CSS 后移除旧样式；保存新的插入键，捕获并记录插入或移除失败。
 * @param {string} cssStyle 要插入悬浮歌词窗口的 CSS 文本。
 * @returns {Promise<void>} 异步完成后无返回值；拒绝由调用链处理。
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
 * 替换内存中的代理设置，等待会话应用并强制刷新代理配置；拒绝会沿 Promise 传给调用方。
 * @param {electron.Config} params 当前请求或操作参数。
 * @returns {Promise<void>} 异步完成后无返回值；拒绝由调用链处理。
 */
async function updateProxyConfig(params) {
  proxyConfig = params;

  await mainWindow.webContents.session.setProxy(params);
  await mainWindow.webContents.session.forceReloadProxyConfig();
}

/**
 * 创建或显示隔离的透明歌词窗口，恢复受工作区约束的位置并在页面加载后应用样式；Linux 分支重建窗口。
 * @param {string} cssStyle 要插入悬浮歌词窗口的 CSS 文本。
 * @returns {void} 无返回值。
 */
function createFloatingWindow(cssStyle) {
  const display = screen.getPrimaryDisplay();
  if (process.platform === "linux") {
    // Linux 下关闭硬件加速或重建窗口，沿用透明窗口兼容处理。
    floatingWindow?.destroy();
    floatingWindow = null;
  }
  if (!floatingWindow) {
    /** @type {Electron.Rectangle} */
    const winBounds = normalizeFloatingWindowBounds(
      store.get("floatingWindowBounds"),
      display
    );

    floatingWindow = new BrowserWindow({
      width: FLOATING_WINDOW_DEFAULT_BOUNDS.width,
      height: FLOATING_WINDOW_DEFAULT_BOUNDS.height,
      titleBarStyle: "hidden",
      transparent: true,
      frame: false,
      resizable: false,
      thickFrame: false,
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
    floatingWindow.webContents.on(
      "did-finish-load",
      /**
       * 响应 "did-finish-load" 事件，执行 updateFloatingWindow。
       * 无参数。
       * @returns {Promise<void>} 异步完成后无返回值；拒绝由调用链处理。
       */
      async () => {
        await updateFloatingWindow(cssStyle);
        if (floatingWindow && !floatingWindow.isDestroyed()) {
          floatingWindow.webContents.send(
            "currentLyric",
            currentFloatingLyric.lyric
          );
          floatingWindow.webContents.send(
            "currentLyricTrans",
            currentFloatingLyric.tlyric
          );
        }
      }
    );
    floatingWindow.on(
      "closed",
      /**
       * 响应 "closed" 事件，更新 floatingWindow。
       * 无参数。
       * @returns {void} 无返回值。
       */
      () => {
        floatingWindow = null;
      }
    );

    // 停用代码，保留供历史对照：
    // floatingWindow.webContents.openDevTools();
  }
  floatingWindow.showInactive();
}

/**
 * previousButton：任务栏上一首按钮配置及点击处理器；类型为 Object。
 * @type {Object}
 */
const previousButton = {
  tooltip: "Previous",
  icon: join(__dirname, "/resources/prev-song.png"),
  /**
   * 向播放器转发上一首快捷键命令。
   * 无参数。
   * @returns {void} 无返回值。
   */
  click() {
    mainWindow.webContents.send("globalShortcut", "left");
  },
};
/**
 * nextButton：任务栏下一首按钮配置及点击处理器；类型为 Object。
 * @type {Object}
 */
const nextButton = {
  tooltip: "Next",
  icon: join(__dirname, "/resources/next-song.png"),
  /**
   * 向播放器转发下一首快捷键命令。
   * 无参数。
   * @returns {void} 无返回值。
   */
  click() {
    mainWindow.webContents.send("globalShortcut", "right");
  },
};
/**
 * playButton：任务栏播放按钮配置及点击处理器；类型为 Object。
 * @type {Object}
 */
const playButton = {
  tooltip: "Play",
  icon: join(__dirname, "/resources/play-song.png"),
  /**
   * 向播放器转发播放／暂停切换命令。
   * 无参数。
   * @returns {void} 无返回值。
   */
  click() {
    mainWindow.webContents.send("globalShortcut", "space");
  },
};
/**
 * pauseButton：任务栏暂停按钮配置及点击处理器；类型为 Object。
 * @type {Object}
 */
const pauseButton = {
  tooltip: "Pause",
  icon: join(__dirname, "/resources/pause-song.png"),
  /**
   * 向播放器转发播放／暂停切换命令。
   * 无参数。
   * @returns {void} 无返回值。
   */
  click() {
    mainWindow.webContents.send("globalShortcut", "space");
  },
};
/**
 * 将任务栏中间按钮设置为播放图标，表示当前可恢复播放。
 * 无参数。
 * @returns {void} 无返回值。
 */
const setThumbarPause = () => {
  mainWindow?.setThumbarButtons([previousButton, playButton, nextButton]);
};
/**
 * 将任务栏中间按钮设置为暂停图标，表示当前可暂停播放。
 * 无参数。
 * @returns {void} 无返回值。
 */
const setThumbbarPlay = () => {
  mainWindow?.setThumbarButtons([previousButton, pauseButton, nextButton]);
};

/**
 * 安装平台请求头处理，创建隔离主窗口并加载共享页面，绑定关闭隐藏、缩放菜单、托盘及导航限制。
 * 无参数。
 * @returns {void} 无返回值。
 */
function createWindow() {
  const filter = {
    urls: [
      "*://*.music.163.com/*",
      "*://music.163.com/*",
      "*://*.xiami.com/*",
      "*://*.qq.com/*", // 覆盖 qq.com 子域名，包括授权页面。
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
    /**
     * 进入此回调后，调用 callback，依次传入 包含 cancel、requestHeaders 的对象。
     * @param details Electron 提供的请求详情，含 URL 和请求头；使用 url、requestHeaders 字段。
     * @param callback 完成当前操作后调用的回调。
     * @returns {void} 无返回值。
     */
    (details, callback) => {
      if (
        details.url.startsWith(
          "https://listen1.github.io/listen1/callback.html?code="
        )
      ) {
        const { url } = details;
        const code = new URL(url).searchParams.get("code");
        if (code && code.length < 1000)
          mainWindow.webContents.send("githubOAuthCode", code);
      } else {
        applyPlatformHeaders(details);
      }
      callback({ cancel: false, requestHeaders: details.requestHeaders });
    }
  );

  // 为选定平台缺少属性的响应 Cookie 补入 SameSite 和 Secure。
  session.defaultSession.webRequest.onHeadersReceived(
    filter,
    /**
     * 进入此回调后，更新 responseHeaders["set-cookie"]、responseHeaders["Set-Cookie"]，调用 callback，依次传入 包含 cancel、responseHeaders 的对象。
     * @param details Electron 提供的请求详情，含 URL 和请求头；使用 responseHeaders 字段。
     * @param callback 完成当前操作后调用的回调。
     * @returns {void} 无返回值。
     */
    (details, callback) => {
      let responseHeaders = details.responseHeaders;
      let cookies =
        responseHeaders["set-cookie"] || responseHeaders["Set-Cookie"];

      if (cookies) {
        // 遍历服务器发来的所有 Cookie
        const newCookies = cookies.map(
          /**
           * 转换 cookies 中的条目，更新 newCookie，执行 newCookie.toLowerCase().includes（"samesite"）。
           * @param cookie 来自 cookies 的当前条目。
           * @returns {*} newCookie。
           */
          (cookie) => {
            let newCookie = cookie;
            // 仅在缺少相应属性时补入 SameSite=None 与 Secure，沿用当前跨站 Cookie 处理。
            if (!newCookie.toLowerCase().includes("samesite")) {
              newCookie += "; SameSite=None";
            }
            if (!newCookie.toLowerCase().includes("secure")) {
              newCookie += "; Secure";
            }
            return newCookie;
          }
        );

        // 将处理后的 Cookie 列表写回原有响应头字段。
        if (responseHeaders["set-cookie"])
          responseHeaders["set-cookie"] = newCookies;
        if (responseHeaders["Set-Cookie"])
          responseHeaders["Set-Cookie"] = newCookies;
      }

      callback({ cancel: false, responseHeaders: responseHeaders });
    }
  );

  // 创建主浏览器窗口。
  mainWindow = new BrowserWindow({
    show: !process.env.LISTEN1_TEST_USER_DATA,
    width: windowState.width,
    height: windowState.height,
    minHeight: 300,
    minWidth: 600,
    webPreferences: {
      preload: join(__dirname, "desktop-preload.js"),
      backgroundThrottling: !process.env.LISTEN1_TEST_USER_DATA,
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
    icon: iconPath,
    titleBarStyle: "hiddenInset",
    transparent: transparent,
    vibrancy: "light",
    frame: false,
    hasShadow: true,
  });

  mainWindow.on(
    "ready-to-show",
    /**
     * 响应 "ready-to-show" 事件，执行 mainWindow.webContents.send（"setZoomLevel"）。
     * 无参数。
     * @returns {void} 无返回值。
     */
    () => {
      if (windowState.maximized) {
        mainWindow.maximize();
      }
      mainWindow.webContents.send("setZoomLevel", windowState.zoomLevel);
    }
  );

  mainWindow.on(
    "resized",
    /**
     * 响应 "resized" 事件，更新 windowState.width、windowState.height，执行 mainWindow.isMaximized。
     * 无参数。
     * @returns {void} 无返回值。
     */
    () => {
      if (!mainWindow.isMaximized() && !mainWindow.isFullScreen()) {
        const [width, height] = mainWindow.getSize();
        windowState.width = width;
        windowState.height = height;
      }
    }
  );
  mainWindow.on(
    "close",
    /**
     * 响应 "close" 事件，更新 mainWindow，执行 e.preventDefault。
     * @param e 当前鼠标或窗口事件；使用 preventDefault 字段。
     * @returns {void} 无返回值。
     */
    (e) => {
      if (willQuitApp) {
        /* 退出应用时允许窗口关闭。 */
        mainWindow = null;
      } else {
        /* 普通关闭操作只隐藏窗口。 */
        // 停用代码，保留供历史对照：
        // if (process.platform != 'linux') {
        e.preventDefault();
        mainWindow.hide();
        // 停用代码，保留供历史对照：
        // mainWindow.minimize();
        //}
      }
    }
  );

  // 代理初始化结束后加载共享播放器的 listen1.html。
  mainWindow.webContents.session
    .setProxy(proxyConfig)
    .then(
      /**
       * 上一步异步操作完成后，执行 mainWindow.loadFile。
       * 无参数。
       * @returns {void} 无返回值。
       */
      () => {
        mainWindow.loadFile(
          join(__dirname, "listen1_chrome_extension/listen1.html")
        );
      }
    )
    .catch(
      /**
       * 异步操作失败后，执行 console.error（"Proxy initialization failed:"）。
       * @param error 被捕获或传入的异常；使用 code 字段。
       * @returns {void} 无返回值。
       */
      (error) => {
        console.error(
          "Proxy initialization failed:",
          error.code || "PROXY_ERROR"
        );
        mainWindow.loadFile(
          join(__dirname, "listen1_chrome_extension/listen1.html")
        );
      }
    );
  mainWindow.webContents.on(
    "will-navigate",
    /**
     * 响应 "will-navigate" 事件，执行 event.preventDefault。
     * @param event 触发当前处理器的事件对象；使用 preventDefault 字段。
     * @returns {*} event.preventDefault 的调用结果。
     */
    (event) => event.preventDefault()
  );
  mainWindow.webContents.setWindowOpenHandler(
    /**
     * 进入此回调后，取得 包含 action 的对象。
     * 无参数。
     * @returns {Object} 包含 action 的对象。
     */
    () => ({ action: "deny" })
  );

  setThumbarPause();
  // 窗口实际关闭时释放引用。
  mainWindow.on(
    "closed",
    /**
     * 响应 "closed" 事件，更新 mainWindow。
     * 无参数。
     * @returns {void} 无返回值。
     */
    () => {
      // 清除已经销毁的主窗口引用。
      // 后续生命周期事件会据此判断是否仍有可用窗口。
      // 窗口引用不再保留已经销毁的对象。
      mainWindow = null;
    }
  );

  // 设置应用菜单，并提供复制、粘贴等系统编辑快捷键。
  const template = [
    {
      label: "Application",
      submenu: [
        {
          label: "Zoom Out",
          accelerator: "CmdOrCtrl+=",
          /**
           * 点击当前菜单或任务栏按钮时，更新 windowState.zoomLevel，执行 mainWindow.webContents.send（"setZoomLevel"）。
           * 无参数。
           * @returns {void} 无返回值。
           */
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
          /**
           * 点击当前菜单或任务栏按钮时，更新 windowState.zoomLevel，执行 mainWindow.webContents.send（"setZoomLevel"）。
           * 无参数。
           * @returns {void} 无返回值。
           */
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
          /**
           * 点击当前菜单或任务栏按钮时，执行 mainWindow.webContents.toggleDevTools。
           * 无参数。
           * @returns {void} 无返回值。
           */
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
          /**
           * 点击当前菜单或任务栏按钮时，执行 mainWindow.close。
           * 无参数。
           * @returns {void} 无返回值。
           */
          click() {
            mainWindow.close();
          },
        },
        {
          label: "Quit",
          accelerator: "Command+Q",
          /**
           * 点击当前菜单或任务栏按钮时，执行 app.quit。
           * 无参数。
           * @returns {void} 无返回值。
           */
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

ipcMain.on(
  "currentLyric",
  /**
   * 响应 "currentLyric" 事件，执行 floatingWindow.webContents.send（"currentLyric"）。
   * @param event 触发当前处理器的事件对象。
   * @param arg 传入页面条件函数的值或桌面控制操作名；使用 lyric、tlyric 字段。
   * @returns {void} 无返回值。
   */
  (event, arg) => {
    if (
      !desktopApi.isMain(event) ||
      !(
        typeof arg === "string" ||
        (arg && typeof arg.lyric === "string" && typeof arg.tlyric === "string")
      )
    )
      return;
    currentFloatingLyric =
      typeof arg === "string"
        ? { lyric: arg, tlyric: "" }
        : { lyric: arg.lyric, tlyric: arg.tlyric };
    if (floatingWindow && !floatingWindow.isDestroyed()) {
      floatingWindow.webContents.send(
        "currentLyric",
        currentFloatingLyric.lyric
      );
      floatingWindow.webContents.send(
        "currentLyricTrans",
        currentFloatingLyric.tlyric
      );
    }
  }
);

ipcMain.on(
  "trackPlayingNow",
  /**
   * 响应 "trackPlayingNow" 事件，执行 desktopApi.isMain。
   * @param event 触发当前处理器的事件对象。
   * @param track 统一曲目对象，包含用于路由和查找的 ID；使用 title 字段。
   * @returns {void} 无返回值。
   */
  (event, track) => {
    if (!desktopApi.isMain(event) || !track || typeof track.title !== "string")
      return;
    if (mainWindow != null) {
      initialTray(mainWindow, track);
    }
  }
);

ipcMain.on(
  "isPlaying",
  /**
   * 响应 "isPlaying" 事件，执行 desktopApi.isMain。
   * @param event 触发当前处理器的事件对象。
   * @param isPlaying 页面通知的当前播放状态。
   * @returns {void} 无返回值。
   */
  (event, isPlaying) => {
    if (!desktopApi.isMain(event) || typeof isPlaying !== "boolean") return;
    isPlaying ? setThumbbarPlay() : setThumbarPause();
  }
);

/**
 * 校验桌面或歌词窗口的控制请求，再执行窗口、快捷键、歌词或代理操作；不支持的请求抛出异常。
 * @param event 触发当前处理器的事件对象。
 * @param arg 传入页面条件函数的值或桌面控制操作名。
 * @param params 当前请求或操作参数。
 * @returns {Promise<void>} 异步完成后无返回值；拒绝由调用链处理。
 */
async function handleControl(event, arg, params) {
  if (!desktopApi.validControl(event, arg, params))
    throw new Error("Unsupported desktop control");
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
      floatingWindow?.setIgnoreMouseEvents(false);
      break;

    case "float_window_ignore_mouse_event":
      floatingWindow?.setIgnoreMouseEvents(true, { forward: true });
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
  // 停用代码，保留供历史对照：
  // event.sender.send('asynchronous-reply', 'pong')
}
ipcMain.handle("desktop:control", handleControl);
ipcMain.on(
  "control",
  /**
   * 响应 "control" 事件，执行 handleControl().catch。
   * @param event 触发当前处理器的事件对象。
   * @param arg 传入页面条件函数的值或桌面控制操作名。
   * @param params 当前请求或操作参数。
   * @returns {void} 无返回值。
   */
  (event, arg, params) => {
    handleControl(event, arg, params).catch(
      /**
       * 保留的空回调，此处无需继续处理或改变状态。
       * 无参数。
       * @returns {void} 无返回值。
       */
      () => {}
    );
  }
);

ipcMain.on(
  "floatWindowMoving",
  /**
   * 响应 "floatWindowMoving" 事件，执行 desktopApi.isFloating。
   * @param e 当前鼠标或窗口事件。
   * @param offsets 拖动起点相对窗口的鼠标偏移，单位为像素；使用 mouseX、mouseY 字段。
   * @returns {void} 无返回值。
   */
  (e, offsets) => {
    if (
      !desktopApi.isFloating(e) ||
      !offsets ||
      !Number.isFinite(offsets.mouseX) ||
      !Number.isFinite(offsets.mouseY)
    )
      return;
    const { mouseX, mouseY } = offsets;
    const { x, y } = screen.getCursorScreenPoint();
    if (!floatingWindow) {
      return;
    }

    const display = screen.getDisplayNearestPoint({ x, y });
    const width = Math.min(
      FLOATING_WINDOW_DEFAULT_BOUNDS.width,
      display.workArea.width
    );
    const height = FLOATING_WINDOW_DEFAULT_BOUNDS.height;
    const nextX = Math.min(
      Math.max(x - mouseX, display.workArea.x),
      display.workArea.x + display.workArea.width - width
    );
    const nextY = Math.min(
      Math.max(y - mouseY, display.workArea.y),
      display.workArea.y + display.workArea.height - height
    );

    floatingWindow.setBounds({ x: nextX, y: nextY, width, height });
  }
);

/**
 * gotTheLock：是否取得单实例锁，未取得时退出新进程；类型为 boolean。
 * @type {boolean}
 */
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on(
    "second-instance",
    /**
     * 响应 "second-instance" 事件，执行 mainWindow.isMinimized。
     * @param event 触发当前处理器的事件对象；当前函数体未使用，保留调用签名。
     * @param commandLine 第二实例启动时的命令行参数；当前函数体未使用，保留调用签名。
     * @param workingDirectory 第二实例启动时的工作目录；当前函数体未使用，保留调用签名。
     * @returns {void} 无返回值。
     */
    (event, commandLine, workingDirectory) => {
      // 第二个实例启动时聚焦既有窗口。
      if (mainWindow) {
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.focus();
        // 恢复主窗口显示及其任务栏入口。
        mainWindow.show();
        mainWindow.setSkipTaskbar(false);
      }
    }
  );

  // 等待应用和设置就绪，再创建主窗口。
  app
    .whenReady()
    .then(
      /**
       * 上一步异步操作完成后，取得 settingsReady。
       * 无参数。
       * @returns {*} settingsReady。
       */
      () => settingsReady
    )
    .then(
      /**
       * 上一步异步操作完成后，执行 createWindow。
       * 无参数。
       * @returns {void} 无返回值。
       */
      () => {
        createWindow();
        if (app.isPackaged && !process.env.LISTEN1_TEST_USER_DATA)
          autoUpdater.checkForUpdatesAndNotify().catch(
            /**
             * 保留的空回调，此处无需继续处理或改变状态。
             * 无参数。
             * @returns {void} 无返回值。
             */
            () => {}
          );
      }
    )
    .catch(
      /**
       * 异步操作失败后，执行 console.error（"Application initialization failed:"）。
       * @param error 被捕获或传入的异常；使用 code、message 字段。
       * @returns {void} 无返回值。
       */
      (error) => {
        console.error(
          "Application initialization failed:",
          error.code || error.message
        );
        app.quit();
      }
    );
}

// 所有窗口关闭时按平台约定处理退出。
app.on(
  "window-all-closed",
  /**
   * 响应 "window-all-closed" 事件，执行 app.quit。
   * 无参数。
   * @returns {void} 无返回值。
   */
  () => {
    // macOS 通常保留应用和菜单栏，
    // 直到用户明确执行退出操作。
    if (process.platform !== "darwin") {
      app.quit();
    }
  }
);

/* macOS 点击 Dock 图标时触发 activate。 */
app.on(
  "activate",
  /**
   * 响应 "activate" 事件，执行 mainWindow.show。
   * 无参数。
   * @returns {void} 无返回值。
   */
  () => {
    if (mainWindow) mainWindow.show();
  }
);

/* Electron 开始退出并准备关闭窗口时触发 before-quit。 */
app.on(
  "before-quit",
  /**
   * 响应 "before-quit" 事件，更新 willQuitApp，执行 mainWindow.webContents.closeDevTools。
   * 无参数。
   * @returns {void} 无返回值。
   */
  () => {
    if (
      mainWindow &&
      !mainWindow.isDestroyed() &&
      mainWindow.webContents.isDevToolsOpened()
    ) {
      mainWindow.webContents.closeDevTools();
    }
    if (floatingWindow && store) {
      store.set("floatingWindowBounds", floatingWindow.getBounds());
    }
    if (store) {
      store.set("windowState", windowState);
      store.set("proxyConfig", proxyConfig);
    }

    willQuitApp = true;
  }
);

app.on(
  "will-quit",
  /**
   * 响应 "will-quit" 事件，执行 disableGlobalShortcuts。
   * 无参数。
   * @returns {void} 无返回值。
   */
  () => {
    disableGlobalShortcuts();
  }
);
