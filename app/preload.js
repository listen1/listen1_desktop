/**
 * 文件职责：为沙箱中的悬浮歌词页提供窗口控制和歌词订阅，限制可发送的通道并隔离 Electron 事件对象。
 *
 * 文件级定义：
 * - contextBridge：从 electron 引入，用于向隔离页面暴露受限接口。
 * - ipcRenderer：从 electron 引入，用于在 preload 内与主进程通信。
 * - window.api.send：仅转发 control 和 floatWindowMoving 通道的歌词窗消息。
 * - window.api.onLyric：订阅原文歌词，移除 Electron 事件对象，并返回解除当前监听的函数。
 * - window.api.onTranslLyric：订阅译文歌词，移除 Electron 事件对象，并返回解除当前监听的函数。
 */
/**
 * contextBridge：从 electron 引入，用于向隔离页面暴露受限接口；类型为 typeof import("electron").contextBridge。
 * ipcRenderer：从 electron 引入，用于在 preload 内与主进程通信；类型为 typeof import("electron").ipcRenderer。
 */
const { contextBridge, ipcRenderer } = require("electron");

// 悬浮歌词窗口启用了 sandbox，只暴露必要的渲染进程 API。
// 回调进入页面脚本前会去掉 Electron event，避免泄露 sender 等内部对象。
contextBridge.exposeInMainWorld("api", {
  /**
   * 仅转发 control 和 floatWindowMoving 通道的歌词窗消息。
   * @param channel 待注册或发送的消息通道。
   * @param data control 通道的操作名，或 floatWindowMoving 通道的鼠标偏移对象。
   * @returns {void} 无返回值。
   */
  send: (channel, data) => {
    if (channel !== "control" && channel !== "floatWindowMoving") return;
    ipcRenderer.send(channel, data);
  },
  /**
   * 订阅原文歌词，移除 Electron 事件对象，并返回解除当前监听的函数。
   * @param fn 接收处理结果的回调函数。
   * @returns {Function} 供后续调用的函数。
   */
  onLyric: (fn) => {
    // event 中包含 sender 等内部对象，这里只传业务参数。
    /**
     * 将去掉 Electron 事件对象的歌词参数传给页面订阅者。
     * @param _event 被丢弃的 Electron 原始事件对象；当前函数体未使用，保留调用签名。
     * @param ...args 传递给包装函数的参数。
     * @returns {*} fn 回调的直接返回值。
     */
    const listener = (_event, ...args) => fn(...args);
    ipcRenderer.on("currentLyric", listener);
    /**
     * 进入此回调后，执行 ipcRenderer.removeListener（"currentLyric"）。
     * 无参数。
     * @returns {*} ipcRenderer.removeListener 的调用结果。
     */
    return () => ipcRenderer.removeListener("currentLyric", listener);
  },
  /**
   * 订阅译文歌词，移除 Electron 事件对象，并返回解除当前监听的函数。
   * @param fn 接收处理结果的回调函数。
   * @returns {Function} 供后续调用的函数。
   */
  onTranslLyric: (fn) => {
    // event 中包含 sender 等内部对象，这里只传业务参数。
    /**
     * 将去掉 Electron 事件对象的歌词参数传给页面订阅者。
     * @param _event 被丢弃的 Electron 原始事件对象；当前函数体未使用，保留调用签名。
     * @param ...args 传递给包装函数的参数。
     * @returns {*} fn 回调的直接返回值。
     */
    const listener = (_event, ...args) => fn(...args);
    ipcRenderer.on("currentLyricTrans", listener);
    /**
     * 进入此回调后，执行 ipcRenderer.removeListener（"currentLyricTrans"）。
     * 无参数。
     * @returns {*} ipcRenderer.removeListener 的调用结果。
     */
    return () => ipcRenderer.removeListener("currentLyricTrans", listener);
  },
});
