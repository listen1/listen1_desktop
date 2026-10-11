/**
 * 文件职责：在隔离的 Electron 会话中比较 QQ 播放地址接口的文件名参数组合，记录游客可用性。
 *
 * 文件级定义：
 * - fs：从 node:fs 引入，用于文件读写与目录操作。
 * - path：从 node:path 引入，用于路径解析和拼接。
 * - _electron：从 playwright 引入，用于通过 Playwright 启动和控制 Electron。
 * - main：在隔离的 Electron 会话中比较 QQ 播放地址接口的文件名参数组合，记录游客可用性。异步步骤失败时向外拒绝，由入口统一设置退出状态。
 */
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
 * _electron：从 playwright 引入，用于通过 Playwright 启动和控制 Electron；类型为 typeof import("playwright")._electron。
 */
const { _electron } = require("playwright");
/**
 * 在隔离的 Electron 会话中比较 QQ 播放地址接口的文件名参数组合，记录游客可用性。异步步骤失败时向外拒绝，由入口统一设置退出状态。
 * 无参数。
 * @returns {Promise<void>} 异步完成后无返回值；拒绝由调用链处理。
 */
async function main() {
  const output = path.resolve(__dirname, "../dist/maintenance/qq-probe");
  fs.mkdirSync(output, { recursive: true });
  const app = await _electron.launch({
    executablePath: require("electron"),
    args: [path.join(__dirname, "electron-entry.cjs")],
    env: {
      ...process.env,
      LISTEN1_TEST_USER_DATA: path.join(output, "profile"),
    },
  });
  try {
    const page = await app.firstWindow();
    await page.waitForFunction(
      /**
       * 检查页面是否达到所需状态，取得 window.l1Player；由外层轮询及超时控制重试。
       * 无参数。
       * @returns {*} window.l1Player。
       */
      () => window.l1Player,
      null,
      { polling: 100 }
    );
    const results = await page.evaluate(
      /**
       * 在目标页面或 Electron 上下文中执行 axios.post（"https://u.y.qq.com/cgi-bin/musicu.fcg"）；跨上下文参数由测试框架序列化传入。
       * 无参数。
       * @returns {Promise<Array>} 异步完成后得到 results。
       */
      async () => {
        const results = [];
        for (const songmid of ["001NmPTG1fVsUw", "0044g6hb1mnYOV"]) {
          for (const variant of ["existing", "single-mid", "default"]) {
            const filename =
              variant === "existing"
                ? [`M500${songmid}${songmid}.mp3`]
                : variant === "single-mid"
                  ? [`M500${songmid}.mp3`]
                  : [];
            const response = await axios.post(
              "https://u.y.qq.com/cgi-bin/musicu.fcg",
              {
                req_1: {
                  module: "vkey.GetVkeyServer",
                  method: "CgiGetVkey",
                  param: {
                    filename,
                    guid: "10000",
                    songmid: [songmid],
                    songtype: [0],
                    uin: "0",
                    loginflag: 1,
                    platform: "20",
                  },
                },
                loginUin: "0",
                comm: { uin: "0", format: "json", ct: 24, cv: 0 },
              }
            );
            const data = response.data;
            results.push({
              songmid,
              variant,
              status: response.status,
              code: data.code,
              businessCode: data.req_1?.code,
              available: !!data.req_1?.data?.midurlinfo?.[0]?.purl,
            });
          }
        }
        return results;
      }
    );
    fs.writeFileSync(
      path.join(output, "report.json"),
      JSON.stringify(results, null, 2)
    );
    console.log(JSON.stringify(results));
  } finally {
    await app.close();
  }
}
main().catch(
  /**
   * 异步操作失败后，更新 process.exitCode，执行 console.error。
   * @param error 被捕获或传入的异常；使用 message 字段。
   * @returns {void} 无返回值。
   */
  (error) => {
    console.error(error.message);
    process.exitCode = 1;
  }
);
