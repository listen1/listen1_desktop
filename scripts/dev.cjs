/**
 * 文件职责：跨平台启动开发用 Electron 子进程，设置开发环境并把退出状态传给命令行。
 *
 * 文件级定义：
 * - spawn：从 node:child_process 引入，用于启动子进程并接收退出状态。
 * - child：开发启动的 Electron 子进程，用于传递退出状态。
 */
/**
 * spawn：从 node:child_process 引入，用于启动子进程并接收退出状态；类型为 typeof import("node:child_process").spawn。
 */
const { spawn } = require("node:child_process");
/**
 * child：开发启动的 Electron 子进程，用于传递退出状态；类型为 import("node:child_process").ChildProcess。
 * @type {import("node:child_process").ChildProcess}
 */
const child = spawn(require("electron"), ["./app", "--enable-logging"], {
  stdio: "inherit",
  env: { ...process.env, NODE_ENV: "development" },
  windowsHide: true,
});
child.on(
  "exit",
  /**
   * 响应 "exit" 事件，更新 process.exitCode。
   * @param code 子进程退出码，信号终止时可能为 null。
   * @returns {void} 无返回值。
   */
  (code) => {
    process.exitCode = code ?? 1;
  }
);
child.on(
  "error",
  /**
   * 响应 "error" 事件，更新 process.exitCode，执行 console.error。
   * @param error 被捕获或传入的异常。
   * @returns {void} 无返回值。
   */
  (error) => {
    console.error(error);
    process.exitCode = 1;
  }
);
