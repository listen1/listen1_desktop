/**
 * 文件职责：对比 QQ 搜索的请求头、代理组合与官方页面结果，使用独立测试配置目录输出诊断记录。
 *
 * 文件级定义：
 * - fs：从 node:fs 引入，用于文件读写与目录操作。
 * - path：从 node:path 引入，用于路径解析和拼接。
 * - _electron：从 playwright 引入，用于通过 Playwright 启动和控制 Electron。
 * - root：由脚本目录解析出的项目根目录。
 * - output：本次维护或测试结果的输出目录。
 * - report：收集本轮测量或测试结果的可序列化报告对象。
 * - main：对比 QQ 搜索的请求头、代理组合与官方页面结果，使用独立测试配置目录输出诊断记录。异步步骤失败时向外拒绝，由入口统一设置退出状态。
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
 * root：由脚本目录解析出的项目根目录；类型为 string。
 * @type {string}
 */
const root = path.resolve(__dirname, "..");
/**
 * output：本次维护或测试结果的输出目录；类型为 string。
 * @type {string}
 */
const output = path.join(root, "dist/maintenance/qq-search-diagnostic");
/**
 * report：收集本轮测量或测试结果的可序列化报告对象；类型为 Object。
 * @type {Object}
 */
const report = {
  date: new Date().toISOString(),
  account: "guest",
  variants: [],
};
/**
 * 对比 QQ 搜索的请求头、代理组合与官方页面结果，使用独立测试配置目录输出诊断记录。异步步骤失败时向外拒绝，由入口统一设置退出状态。
 * 无参数。
 * @returns {Promise<string>} 代理解析结果以 DIRECT 开头时为 DIRECT，否则为 proxy。
 */
async function main() {
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
    report.proxy = await app.evaluate(
      /**
       * 在目标页面或 Electron 上下文中执行 await session.defaultSession.resolveProxy("https://u.y.qq.com").startsWith（"DIRECT"）；跨上下文参数由测试框架序列化传入。
       * @param options 解构参数，包含 session（Last.fm 返回的授权会话，包含请求签名所需的会话键）；使用 defaultSession 字段。
       * @returns {Promise<string>} 代理解析结果以 DIRECT 开头时为 DIRECT，否则为 proxy。
       */
      async ({ session }) =>
        (
          await session.defaultSession.resolveProxy("https://u.y.qq.com")
        ).startsWith("DIRECT")
          ? "DIRECT"
          : "proxy"
    );
    for (const variant of [
      "current",
      "legacy-origin",
      "legacy-UA",
      "direct",
      "current-repeat",
    ]) {
      await app.evaluate(
        /**
         * 在目标页面或 Electron 上下文中执行 session.defaultSession.setProxy；跨上下文参数由测试框架序列化传入。
         * @param options 解构参数，包含 session（Last.fm 返回的授权会话，包含请求签名所需的会话键）；使用 defaultSession 字段。
         * @param options1 解构参数，包含 variant（当前比较的请求头或代理方案名称）、code（供隔离 Electron 上下文执行的请求头处理源码）。
         * @returns {Promise<void>} 异步完成后无返回值；拒绝由调用链处理。
         */
        async ({ session }, { variant, code }) => {
          await session.defaultSession.setProxy({
            mode: variant === "direct" ? "direct" : "system",
          });
          const module = { exports: {} };
          new Function("module", code)(module);
          const { applyPlatformHeaders } = module.exports;
          session.defaultSession.webRequest.onBeforeSendHeaders(
            /**
             * 测试替身：更新 details.requestHeaders.Origin、details.requestHeaders["User-Agent"]，调用 callback，依次传入 包含 requestHeaders 的对象，供用例观察调用与状态。
             * @param details Electron 提供的请求详情，含 URL 和请求头；使用 url、requestHeaders 字段。
             * @param callback 完成当前操作后调用的回调。
             * @returns {void} 无返回值。
             */
            (details, callback) => {
              applyPlatformHeaders(details);
              if (details.url.startsWith("https://u.y.qq.com/")) {
                if (variant === "legacy-origin")
                  details.requestHeaders.Origin = "https://y.qq.com/";
                if (variant === "legacy-UA")
                  details.requestHeaders["User-Agent"] =
                    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_13_6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/72.0.3626.119 Safari/537.36";
              }
              callback({ requestHeaders: details.requestHeaders });
            }
          );
        },
        {
          variant,
          code: fs.readFileSync(
            path.join(root, "app/request-headers.js"),
            "utf8"
          ),
        }
      );
      const result = await page.evaluate(
        /**
         * 在目标页面或 Electron 上下文中执行 axios.post（"https://u.y.qq.com/cgi-bin/musicu.fcg"）；跨上下文参数由测试框架序列化传入。
         * 无参数。
         * @returns {Promise<Object>} 异步完成后得到 包含 status、code、businessCode、count、total 的对象；其他分支返回 包含 error、status 的对象。
         */
        async () => {
          try {
            const response = await axios.post(
              "https://u.y.qq.com/cgi-bin/musicu.fcg",
              {
                comm: { ct: "19", cv: "1859", uin: "0" },
                req: {
                  method: "DoSearchForQQMusicDesktop",
                  module: "music.search.SearchCgiService",
                  param: {
                    grp: 1,
                    num_per_page: 50,
                    page_num: 1,
                    query: "夜空中最亮的星",
                    search_type: 0,
                  },
                },
              }
            );
            const data = response.data;
            return {
              status: response.status,
              code: data.code,
              businessCode: data.req?.code,
              count: data.req?.data?.body?.song?.list?.length,
              total: data.req?.data?.meta?.sum,
            };
          } catch (error) {
            return { error: error.code, status: error.response?.status };
          }
        }
      );
      report.variants.push({ variant, ...result });
    }
    const officialPromise = app.waitForEvent("window");
    await app.evaluate(
      /**
       * 在目标页面或 Electron 上下文中执行 window.loadURL().catch；跨上下文参数由测试框架序列化传入。
       * @param options 解构参数，包含 BrowserWindow（创建或检查 Electron 窗口）。
       * @returns {void} 无返回值。
       */
      ({ BrowserWindow }) => {
        const window = new BrowserWindow({
          show: false,
          webPreferences: {
            sandbox: true,
            contextIsolation: true,
            nodeIntegration: false,
          },
        });
        window
          .loadURL(
            "https://y.qq.com/n/ryqq/search?w=%E5%A4%9C%E7%A9%BA%E4%B8%AD%E6%9C%80%E4%BA%AE%E7%9A%84%E6%98%9F&t=song"
          )
          .catch(
            /**
             * 测试替身：接受此处调用但不执行操作。
             * 无参数。
             * @returns {void} 无返回值。
             */
            () => {}
          );
      }
    );
    const official = await officialPromise;
    await official
      .waitForLoadState("domcontentloaded", { timeout: 20000 })
      .catch(
        /**
         * 测试替身：接受此处调用但不执行操作。
         * 无参数。
         * @returns {void} 无返回值。
         */
        () => {}
      );
    report.official = await official.evaluate(
      /**
       * 在目标页面或 Electron 上下文中执行 document.body.innerText.includes（"夜空中最亮的星"）；跨上下文参数由测试框架序列化传入。
       * 无参数。
       * @returns {Object} 包含 title、keywordPresent、loginPresent、visibleText 的对象。
       */
      () => ({
        title: document.title,
        keywordPresent: document.body.innerText.includes("夜空中最亮的星"),
        loginPresent: /登录/.test(document.body.innerText),
        visibleText: document.body.innerText.slice(0, 1000),
      })
    );
  } finally {
    fs.writeFileSync(
      path.join(output, "report.json"),
      JSON.stringify(report, null, 2)
    );
    await app.close();
    console.log(JSON.stringify(report));
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
