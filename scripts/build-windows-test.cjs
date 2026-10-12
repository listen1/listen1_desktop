/**
 * 文件职责：构建不发布的 Windows x64 测试安装包，将测试构建与日常分发输出隔离。
 *
 * 文件级定义：
 * - build：从 electron-builder 引入，用于执行 Electron 安装包构建。
 * - Platform：从 electron-builder 引入，用于选择构建目标系统。
 * - Arch：从 electron-builder 引入，用于选择构建目标架构。
 */
/**
 * build：从 electron-builder 引入，用于执行 Electron 安装包构建；类型为 typeof import("electron-builder").build。
 * Platform：从 electron-builder 引入，用于选择构建目标系统；类型为 typeof import("electron-builder").Platform。
 * Arch：从 electron-builder 引入，用于选择构建目标架构；类型为 typeof import("electron-builder").Arch。
 */
const { build, Platform, Arch } = require("electron-builder");

build({
  targets: Platform.WINDOWS.createTarget(["nsis", "7z"], Arch.x64),
  publish: "never",
  config: {
    directories: { output: "dist/windows-test" },
    win: {
      target: [
        { target: "nsis", arch: ["x64"] },
        { target: "7z", arch: ["x64"] },
      ],
    },
  },
}).catch(
  /**
   * 异步操作失败后，更新 process.exitCode，执行 console.error。
   * @param error 被捕获或传入的异常。
   * @returns {void} 无返回值。
   */
  (error) => {
    console.error(error);
    process.exitCode = 1;
  }
);
