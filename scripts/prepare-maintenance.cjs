/**
 * 文件职责：准备可重复的 Windows 维护环境，保存原始清单并校验、安装隔离的 Node 和 npm 工具链。
 *
 * 文件级定义：
 * - fs：从 node:fs 引入，用于文件读写与目录操作。
 * - path：从 node:path 引入，用于路径解析和拼接。
 * - cp：从 node:child_process 引入，用于启动外部维护命令。
 * - os：从 node:os 引入，用于识别操作系统与临时目录。
 * - crypto：从 node:crypto 引入，用于计算校验摘要及加密测试参考值。
 * - main：准备可重复的 Windows 维护环境，保存原始清单并校验、安装隔离的 Node 和 npm 工具链。异步步骤失败时向外拒绝，由入口统一设置退出状态。
 */
// 可选的 Windows 维护准备脚本；日常开发使用固定的 Node 和 npm 版本。
/**
 * fs：从 node:fs 引入，用于文件读写与目录操作；类型为 typeof import("node:fs")。
 * @type {typeof import("node:fs")}
 */
const fs = require("node:fs");
/**
 * path：从 node:path 引入，用于路径解析和拼接；类型为 typeof import("node:path")。
 * @type {typeof import("node:path")}
 */
const path = require("node:path");
/**
 * cp：从 node:child_process 引入，用于启动外部维护命令；类型为 typeof import("node:child_process")。
 * @type {typeof import("node:child_process")}
 */
const cp = require("node:child_process");
/**
 * os：从 node:os 引入，用于识别操作系统与临时目录；类型为 typeof import("node:os")。
 * @type {typeof import("node:os")}
 */
const os = require("node:os");
/**
 * crypto：从 node:crypto 引入，用于计算校验摘要及加密测试参考值；类型为 typeof import("node:crypto")。
 * @type {typeof import("node:crypto")}
 */
const crypto = require("node:crypto");

/**
 * 准备可重复的 Windows 维护环境，保存原始清单并校验、安装隔离的 Node 和 npm 工具链。异步步骤失败时向外拒绝，由入口统一设置退出状态。
 * 无参数。
 * @returns {Promise<void>} 异步完成后无返回值；拒绝由调用链处理。
 */
async function main() {
  if (process.platform !== "win32" || process.arch !== "x64")
    throw new Error("This audit bootstrap targets Windows x64");
  const root = path.resolve(__dirname, "..");
  process.chdir(root);
  const out = path.join(root, "dist/maintenance");
  fs.mkdirSync(out, { recursive: true });
  if (!fs.existsSync(path.join(out, "baseline.json"))) {
    const state = {
      date: new Date().toISOString(),
      os: os.release(),
      arch: os.arch(),
      cpu: os.cpus()[0].model,
      memoryGiB: Math.round(os.totalmem() / 2 ** 30),
      repos: [],
    };
    for (const directory of [".", "app/listen1_chrome_extension"]) {
      /**
       * 在工作区执行只读 Git 子命令并返回文本输出。
       * @param args 传递给包装函数的参数。
       * @returns {*} cp.execFileSync 的调用结果。
       */
      const git = (args) =>
        cp.execFileSync("git", ["-C", directory, ...args], {
          encoding: "utf8",
        });
      const files = git(["ls-files", "-z"]).split("\0").filter(Boolean);
      if (!files.includes("AGENTS.md")) files.push("AGENTS.md");
      for (const file of files) {
        const src = path.join(directory, file);
        if (!fs.existsSync(src) || !fs.statSync(src).isFile()) continue;
        const dest = path.join(out, "baseline", directory, file);
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        fs.copyFileSync(src, dest);
      }
      state.repos.push({
        root: directory,
        head: git(["rev-parse", "HEAD"]).trim(),
        status: git(["status", "--short"]),
      });
    }
    fs.writeFileSync(
      path.join(out, "baseline.json"),
      JSON.stringify(state, null, 2) + "\n"
    );
  }
  const tools = path.join(out, "tools");
  fs.mkdirSync(tools, { recursive: true });
  const version = "24.21.0";
  const base = `https://nodejs.org/dist/v${version}/`;
  const name = `node-v${version}-win-x64.zip`;
  const archive = path.join(tools, name);
  const sums = await fetch(base + "SHASUMS256.txt");
  if (!sums.ok)
    throw new Error(`Node checksum download failed: ${sums.status}`);
  const expected = (await sums.text())
    .split("\n")
    .find(
      /**
       * 筛选检查 await sums.text().split() 中的条目，line.endsWith 的调用结果。
       * @param line 来自 await sums.text().split() 的当前条目；使用 endsWith 字段。
       * @returns {*} line.endsWith 的调用结果。
       */
      (line) => line.endsWith("  " + name)
    )
    ?.split(" ")[0];
  if (!fs.existsSync(archive)) {
    const response = await fetch(base + name);
    if (!response.ok)
      throw new Error(`Node download failed: ${response.status}`);
    fs.writeFileSync(archive, Buffer.from(await response.arrayBuffer()));
  }
  if (
    crypto
      .createHash("sha256")
      .update(fs.readFileSync(archive))
      .digest("hex") !== expected
  )
    throw new Error("Node checksum mismatch");
  const runtime = path.join(tools, `node-v${version}-win-x64`);
  if (!fs.existsSync(path.join(runtime, "node.exe")))
    cp.execFileSync("tar.exe", ["-xf", archive, "-C", tools], {
      stdio: "inherit",
    });
  const npmPrefix = path.join(out, "npm12");
  cp.execFileSync(
    path.join(runtime, "node.exe"),
    [
      path.join(runtime, "node_modules/npm/bin/npm-cli.js"),
      "install",
      "--prefix",
      npmPrefix,
      "--cache",
      path.join(out, "npm-cache"),
      "--save-exact",
      "--ignore-scripts",
      "--no-audit",
      "--no-fund",
      "npm@12.0.2",
    ],
    { stdio: "inherit", windowsHide: true }
  );
  console.log(`Baseline: ${path.join(out, "baseline.json")}`);
  console.log(`Node: ${path.join(runtime, "node.exe")}`);
  console.log(
    `npm CLI: ${path.join(npmPrefix, "node_modules/npm/bin/npm-cli.js")}`
  );
}
main().catch(
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
