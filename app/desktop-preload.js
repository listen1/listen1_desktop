/**
 * 文件职责：在隔离的主窗口中暴露 window.listen1Desktop，以白名单 IPC 提供桌面能力并移除事件中的 Electron 内部对象。
 *
 * 文件级定义：
 * - contextBridge：从 electron 引入，用于向隔离页面暴露受限接口。
 * - ipcRenderer：从 electron 引入，用于在 preload 内与主进程通信。
 * - webFrame：从 electron 引入，用于调整当前渲染页面缩放。
 * - events：允许主窗口页面订阅的桌面事件集合。
 * - window.listen1Desktop.control：通过 desktop:control 请求执行白名单桌面操作，由主进程再次校验来源及参数。
 * - window.listen1Desktop.openExternal：请求主进程使用系统浏览器打开经过校验的 HTTP(S) 地址。
 * - window.listen1Desktop.openLogin：请求主进程创建平台登录窗口，页面不能自行放宽来源范围。
 * - window.listen1Desktop.cookieGet：请求读取允许的平台 Cookie，结果由主进程异步返回。
 * - window.listen1Desktop.cookieSet：请求写入经过字段、域名及有效期校验的平台 Cookie。
 * - window.listen1Desktop.cookieRemove：请求删除指定平台地址下的命名 Cookie。
 * - window.listen1Desktop.importLocalMusic：请求打开音频选择框并批量读取标签，返回取消状态、有效曲目和逐文件错误。
 * - window.listen1Desktop.localFileUrl：请求将旧 lmtrack_ 绝对路径 ID 还原为经过编码的文件 URL。
 * - window.listen1Desktop.setLyric：向主进程发送原文或包含 lyric、tlyric 的歌词对象，供悬浮窗口显示。
 * - window.listen1Desktop.setTrack：发送当前曲目信息以刷新系统托盘。
 * - window.listen1Desktop.setPlaying：发送播放状态以更新任务栏的播放／暂停按钮。
 * - window.listen1Desktop.setZoomLevel：只接受有限且在 -3 至 5 范围内的缩放级别，直接调整当前页面缩放。
 * - window.listen1Desktop.on：订阅白名单桌面事件，回调只收到业务参数。
 */
/**
 * contextBridge：从 electron 引入，用于向隔离页面暴露受限接口；类型为 typeof import("electron").contextBridge。
 * ipcRenderer：从 electron 引入，用于在 preload 内与主进程通信；类型为 typeof import("electron").ipcRenderer。
 * webFrame：从 electron 引入，用于调整当前渲染页面缩放；类型为 typeof import("electron").webFrame。
 */
const { contextBridge, ipcRenderer, webFrame } = require("electron");
/**
 * events：允许主窗口页面订阅的桌面事件集合；类型为 Set。
 * @type {Set}
 */
const events = new Set([
  "globalShortcut",
  "lyricWindow",
  "proxyConfig",
  "setZoomLevel",
  "githubOAuthCode",
]);
contextBridge.exposeInMainWorld("listen1Desktop", {
  version: 1,
  platform: process.platform,
  importLocalCover: () => ipcRenderer.invoke("desktop:importLocalCover"),
  localCoverUrl: (assetId) =>
    ipcRenderer.invoke("desktop:localCoverUrl", assetId),
  retainLocalCover: (assetId) =>
    ipcRenderer.invoke("desktop:retainLocalCover", assetId),
  releaseLocalCover: (assetId) =>
    ipcRenderer.invoke("desktop:releaseLocalCover", assetId),
  inspectAudioSource: (request) =>
    ipcRenderer.invoke("desktop:inspectAudioSource", request),
  cancelAudioInspection: (requestId) =>
    ipcRenderer.invoke("desktop:cancelAudioInspection", requestId),
  prepareAudioSource: (request) =>
    ipcRenderer.invoke("desktop:prepareAudioSource", request),
  readAudioSource: (request) =>
    ipcRenderer.invoke("desktop:readAudioSource", request),
  cancelAudioPreparation: (requestId) =>
    ipcRenderer.invoke("desktop:cancelAudioPreparation", requestId),
  releaseAudioSource: (assetId) =>
    ipcRenderer.invoke("desktop:releaseAudioSource", assetId),
  /**
   * 通过 desktop:control 请求执行白名单桌面操作，由主进程再次校验来源及参数。
   * @param operation 桌面控制白名单中的操作名。
   * @param params 当前请求或操作参数。
   * @returns {Promise<*>} 主进程处理 "desktop:control" 的 Promise。
   */
  control: (operation, params) =>
    ipcRenderer.invoke("desktop:control", operation, params),
  /**
   * 请求主进程使用系统浏览器打开经过校验的 HTTP(S) 地址。
   * @param url 待解析或请求的地址；来源适配器使用其中的查询参数。
   * @returns {Promise<*>} 主进程处理 "desktop:openExternal" 的 Promise。
   */
  openExternal: (url) => ipcRenderer.invoke("desktop:openExternal", url),
  /**
   * 请求主进程创建平台登录窗口，页面不能自行放宽来源范围。
   * @param url 待解析或请求的地址；来源适配器使用其中的查询参数。
   * @returns {Promise<*>} 主进程处理 "desktop:openLogin" 的 Promise。
   */
  openLogin: (url) => ipcRenderer.invoke("desktop:openLogin", url),
  /**
   * 请求读取允许的平台 Cookie，结果由主进程异步返回。
   * @param request 页面传入的业务请求。
   * @returns {Promise<*>} 主进程处理 "desktop:cookieGet" 的 Promise。
   */
  cookieGet: (request) => ipcRenderer.invoke("desktop:cookieGet", request),
  /**
   * 请求写入经过字段、域名及有效期校验的平台 Cookie。
   * @param request 页面传入的业务请求。
   * @returns {Promise<*>} 主进程处理 "desktop:cookieSet" 的 Promise。
   */
  cookieSet: (request) => ipcRenderer.invoke("desktop:cookieSet", request),
  /**
   * 请求删除指定平台地址下的命名 Cookie。
   * @param request 页面传入的业务请求。
   * @returns {Promise<*>} 主进程处理 "desktop:cookieRemove" 的 Promise。
   */
  cookieRemove: (request) =>
    ipcRenderer.invoke("desktop:cookieRemove", request),
  /**
   * 请求打开音频选择框并批量读取标签，返回取消状态、有效曲目和逐文件错误。
   * 无参数。
   * @returns {Promise<*>} 主进程处理 "desktop:importLocalMusic" 的 Promise。
   */
  importLocalMusic: () => ipcRenderer.invoke("desktop:importLocalMusic"),
  importLocalLyric: () => ipcRenderer.invoke("desktop:importLocalLyric"),
  /**
   * 请求将旧 lmtrack_ 绝对路径 ID 还原为经过编码的文件 URL。
   * @param trackId 目标曲目 ID。
   * @returns {Promise<*>} 主进程处理 "desktop:localFileUrl" 的 Promise。
   */
  localFileUrl: (trackId) =>
    ipcRenderer.invoke("desktop:localFileUrl", trackId),
  /**
   * 向主进程发送原文或包含 lyric、tlyric 的歌词对象，供悬浮窗口显示。
   * @param lyric 原文歌词文本或双语歌词对象。
   * @returns {*} ipcRenderer.send 的调用结果。
   */
  setLyric: (lyric) => ipcRenderer.send("currentLyric", lyric),
  /**
   * 发送当前曲目信息以刷新系统托盘。
   * @param track 统一曲目对象，包含用于路由和查找的 ID。
   * @returns {*} ipcRenderer.send 的调用结果。
   */
  setTrack: (track) => ipcRenderer.send("trackPlayingNow", track),
  /**
   * 发送播放状态以更新任务栏的播放／暂停按钮。
   * @param playing 当前是否处于播放状态。
   * @returns {*} ipcRenderer.send 的调用结果。
   */
  setPlaying: (playing) => ipcRenderer.send("isPlaying", playing),
  /**
   * 只接受有限且在 -3 至 5 范围内的缩放级别，直接调整当前页面缩放。
   * @param level 页面缩放级别。
   * @returns {void} 无返回值。
   */
  setZoomLevel: (level) => {
    if (Number.isFinite(level) && level >= -3 && level <= 5)
      webFrame.setZoomLevel(level);
  },
  /**
   * 订阅白名单桌面事件，回调只收到业务参数；调用返回的函数可移除对应监听。
   * @param channel 待注册或发送的消息通道。
   * @param callback 完成当前操作后调用的回调。
   * @returns {Function} 供后续调用的函数。
   */
  on: (channel, callback) => {
    if (!events.has(channel) || typeof callback !== "function")
      throw new Error("Unsupported desktop event");
    /**
     * 剥离 Electron 事件对象，仅把业务参数传给页面回调。
     * @param _event 被丢弃的 Electron 原始事件对象；当前函数体未使用，保留调用签名。
     * @param ...args 传递给包装函数的参数。
     * @returns {*} callback 回调的直接返回值。
     */
    const listener = (_event, ...args) => callback(...args);
    ipcRenderer.on(channel, listener);
    /**
     * 进入此回调后，执行 ipcRenderer.removeListener。
     * 无参数。
     * @returns {*} ipcRenderer.removeListener 的调用结果。
     */
    return () => ipcRenderer.removeListener(channel, listener);
  },
});
