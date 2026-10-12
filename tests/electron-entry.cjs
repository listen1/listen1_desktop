/**
 * 文件职责：为测试设置独立用户数据和会话目录，再加载桌面入口；未提供测试目录时立即拒绝启动。
 *
 * 文件级定义：
 * - app：从 electron 引入，用于Electron 应用生命周期入口。
 * - path：从 node:path 引入，用于路径解析和拼接。
 * - fs：从 node:fs 引入，用于文件读写与目录操作。
 * - profile：测试专用的可丢弃用户数据目录。
 * - application：测试实际加载的桌面应用目录。
 */
// 测试专用入口：必须使用独立配置目录。
/**
 * app：从 electron 引入，用于Electron 应用生命周期入口；类型为 typeof import("electron").app。
 */
const { app } = require("electron");
/**
 * path：从 node:path 引入，用于路径解析和拼接；类型为 typeof import("node:path")。
 * @type {typeof import("node:path")}
 */
const path = require("node:path");
/**
 * fs：从 node:fs 引入，用于文件读写与目录操作；类型为 typeof import("node:fs")。
 * @type {typeof import("node:fs")}
 */
const fs = require("node:fs");
/**
 * profile：测试专用的可丢弃用户数据目录；类型为 string|undefined。
 * @type {string|undefined}
 */
const profile = process.env.LISTEN1_TEST_USER_DATA;
if (!profile) throw new Error("LISTEN1_TEST_USER_DATA is required");
fs.mkdirSync(profile, { recursive: true });
app.setPath("userData", path.resolve(profile));
app.setPath("sessionData", path.resolve(profile));
/**
 * application：测试实际加载的桌面应用目录；类型为 string。
 * @type {string}
 */
const application = path.resolve(
  process.env.LISTEN1_TEST_APP || path.join(__dirname, "../app")
);
app.setAppPath(application);
app.commandLine.appendSwitch("autoplay-policy", "no-user-gesture-required");
require(path.join(application, "main.js"));
