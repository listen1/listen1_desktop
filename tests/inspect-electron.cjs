/**
 * 文件职责：采集 Electron 启动、页面、游客搜索和可选播放证据，将结果写入独立维护目录。
 *
 * 文件级定义：
 * - fs：从 node:fs 引入，用于文件读写与目录操作。
 * - path：从 node:path 引入，用于路径解析和拼接。
 * - _electron：从 playwright 引入，用于通过 Playwright 启动和控制 Electron。
 * - root：由脚本目录解析出的项目根目录。
 * - run：由环境变量或默认值指定的审查批次名称。
 * - output：本次维护或测试结果的输出目录。
 * - report：收集本轮测量或测试结果的可序列化报告对象。
 * - safe：移除文本中的 URL 并截断到 350 个字符，限制诊断输出范围。
 * - main：采集 Electron 启动、页面、游客搜索和可选播放证据，将结果写入独立维护目录。异步步骤失败时向外拒绝，由入口统一设置退出状态。
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
 * run：由环境变量或默认值指定的审查批次名称；类型为 string。
 * @type {string}
 */
const run = process.env.LISTEN1_AUDIT_RUN || "baseline";
/**
 * output：本次维护或测试结果的输出目录；类型为 string。
 * @type {string}
 */
const output = path.join(root, "dist/maintenance", run);
/**
 * report：收集本轮测量或测试结果的可序列化报告对象；类型为 Object。
 * @type {Object}
 */
const report = {
  run,
  date: new Date().toISOString(),
  errors: [],
  platforms: [],
  playback: [],
  network: [],
};
/**
 * 移除文本中的 URL 并截断到 350 个字符，限制诊断输出范围。
 * @param value 待检查或转换的输入值。
 * @returns {*} String().replace().slice 的调用结果。
 */
const safe = (value) =>
  String(value)
    .replace(/https?:\/\/[^\s"']+/g, "[URL]")
    .slice(0, 350);

/**
 * 采集 Electron 启动、页面、游客搜索和可选播放证据，将结果写入独立维护目录。异步步骤失败时向外拒绝，由入口统一设置退出状态。
 * 无参数。
 * @returns {Promise<void>} 异步完成后无返回值；拒绝由调用链处理。
 */
async function main() {
  fs.mkdirSync(output, { recursive: true });
  const start = Date.now();
  const app = await _electron.launch({
    executablePath: path.join(root, "node_modules/electron/dist/electron.exe"),
    args: [path.join(__dirname, "electron-entry.cjs")],
    env: {
      ...process.env,
      NODE_PATH: path.join(root, "app/node_modules"),
      LISTEN1_TEST_USER_DATA: path.join(output, "profile"),
      ELECTRON_ENABLE_LOGGING: "1",
    },
    timeout: 25000,
  });
  try {
    const page = await app.firstWindow();
    page.on(
      "pageerror",
      /**
       * 响应 "pageerror" 事件，执行 report.errors.push。
       * @param error 被捕获或传入的异常；使用 stack 字段。
       * @returns {number} 追加后的数组长度。
       */
      (error) => report.errors.push(safe(error.stack))
    );
    page.on(
      "response",
      /**
       * 响应 "response" 事件，更新 entry.code、entry.message，执行 response.url。
       * @param response 异步请求返回的响应对象；使用 url、status、headers、json 字段。
       * @returns {Promise<void>} 异步完成后无返回值；拒绝由调用链处理。
       */
      async (response) => {
        try {
          const url = new URL(response.url());
          if (
            !/163\.com|qq\.com|kugou\.com|kuwo\.cn|bilibili\.com|migu\.cn/.test(
              url.hostname
            )
          )
            return;
          if (
            !/search|musicu|playurl|playUrl|enhance|resource|SongInfo/i.test(
              url.pathname
            )
          )
            return;
          const entry = {
            host: url.hostname,
            path: url.pathname,
            status: response.status(),
          };
          if (!/audio|video/.test(response.headers()["content-type"] || "")) {
            const body = await response.json().catch(
              /**
               * 异步操作失败后，取得 null。
               * 无参数。
               * @returns {null} null。
               */
              () => null
            );
            if (body) {
              entry.code =
                body.code ??
                body.status ??
                body.req?.code ??
                body.req_0?.code ??
                body.req_1?.code;
              entry.message = safe(
                body.message ?? body.msg ?? body.errmsg ?? ""
              );
            }
          }
          report.network.push(entry);
        } catch {}
      }
    );
    await page.waitForLoadState("domcontentloaded");
    await page.waitForFunction(
      /**
       * 检查页面是否达到所需状态，执行 angular.element().injector；由外层轮询及超时控制重试。
       * 无参数。
       * @returns {*} typeof angular 是否不等于 "undefined" 且 对 对 window.l1Player 取反的布尔值 取反的布尔值 且 对 对 angular.element().injector 的调用结果 取反的布尔值 取反的布尔值 且 threadPlayer.mode 是否严格等于 "front"。
       */
      () =>
        typeof angular !== "undefined" &&
        !!window.l1Player &&
        !!angular.element(document.body).injector() &&
        threadPlayer.mode === "front",
      null,
      { timeout: 15000, polling: 100 }
    );
    report.startupMs = Date.now() - start;
    report.runtime = await app.evaluate(
      /**
       * 在目标页面或 Electron 上下文中执行 app.getPath（"userData"）；跨上下文参数由测试框架序列化传入。
       * @param options 解构参数，包含 app（Electron 应用生命周期入口）；使用 getPath 字段。
       * @returns {Object} 包含 versions、platform、userData 的对象。
       */
      ({ app }) => ({
        versions: process.versions,
        platform: process.platform,
        userData: app.getPath("userData"),
      })
    );
    report.window = await page.evaluate(
      /**
       * 在目标页面或 Electron 上下文中执行 isElectron；跨上下文参数由测试框架序列化传入。
       * 无参数。
       * @returns {Object} 包含 title、width、height、electron、angular 的对象。
       */
      () => ({
        title: document.title,
        width: innerWidth,
        height: innerHeight,
        electron: !!isElectron(),
        angular: angular.version.full,
      })
    );
    if (process.env.LISTEN1_AUDIT_SCREENSHOT === "1")
      await page.screenshot({
        path: path.join(output, "startup.png"),
        timeout: 10000,
      });
    console.log(
      JSON.stringify({
        run,
        startupMs: report.startupMs,
        runtime: report.runtime.versions.electron,
      })
    );
    if (process.env.LISTEN1_AUDIT_ONLINE !== "0") {
      await page.evaluate(
        /**
         * 在目标页面或 Electron 上下文中更新 window.__auditEvents，执行 addPlayerListener（"front"）；跨上下文参数由测试框架序列化传入。
         * 无参数。
         * @returns {void} 无返回值。
         */
        () => {
          window.__auditEvents = [];
          addPlayerListener(
            "front",
            /**
             * 测试替身：执行 /FAIL|RETRIEVE_URL/.test，供用例观察调用与状态。
             * @param event 触发当前处理器的事件对象；使用 type、data 字段。
             * @returns {void} 无返回值。
             */
            (event) => {
              if (/FAIL|RETRIEVE_URL/.test(event.type))
                window.__auditEvents.push({
                  type: event.type,
                  id: event.data?.id,
                  code: event.data?.error?.code,
                  platform: event.data?.platform,
                });
            }
          );
        }
      );
      for (const source of [
        "netease",
        "qq",
        "kugou",
        "kuwo",
        "bilibili",
        "migu",
      ]) {
        const result = await page.evaluate(
          /**
           * 在目标页面或 Electron 上下文中执行 performance.now；跨上下文参数由测试框架序列化传入。
           * @param source 音乐来源名称。
           * @returns {Promise<Promise>} 异步完成后得到 新建的 Promise 实例。
           */
          async (source) => {
            const started = performance.now();
            return new Promise(
              /**
               * 启动当前异步操作，执行 setTimeout，由 resolve／reject 决定 Promise 的结果。
               * @param resolve 用于兑现当前 Promise 的函数。
               * @returns {void} 无返回值。
               */
              (resolve) => {
                let done = false;
                /**
                 * 仅接受首个查询结果，清理超时计时器并补入来源与耗时。
                 * @param data 本次处理或转发的业务数据。
                 * @returns {void} 无返回值。
                 */
                const finish = (data) => {
                  if (!done) {
                    done = true;
                    clearTimeout(timer);
                    resolve({
                      source,
                      elapsedMs: Math.round(performance.now() - started),
                      ...data,
                    });
                  }
                };
                const timer = setTimeout(
                  /**
                   * 在定时器或动画帧触发时，执行 finish。
                   * 无参数。
                   * @returns {*} finish 的调用结果。
                   */
                  () => finish({ status: "timeout" }),
                  18000
                );
                try {
                  const task = MediaService.search(source, {
                    keywords: "夜空中最亮的星",
                    curpage: 1,
                    type: 0,
                  });
                  task.success(
                    /**
                     * 测试替身：更新 window.__auditResults、window.__auditResults[source]，执行 finish，供用例观察调用与状态。
                     * @param data 本次处理或转发的业务数据；使用 result、total 字段。
                     * @returns {void} 无返回值。
                     */
                    (data) => {
                      window.__auditResults ||= {};
                      window.__auditResults[source] = data.result;
                      finish({
                        status: "response",
                        count: data.result.length,
                        total: data.total,
                        samples: data.result.slice(0, 2).map(
                          /**
                           * 转换 data.result.slice() 中的条目，包含 id、title、artist、source 的对象。
                           * @param t 来自 data.result.slice() 的当前条目；使用 id、title、artist、source 字段。
                           * @returns {Object} 包含 id、title、artist、source 的对象。
                           */
                          (t) => ({
                            id: t.id,
                            title: t.title,
                            artist: t.artist,
                            source: t.source,
                          })
                        ),
                      });
                    }
                  );
                  if (task.error)
                    task.error(
                      /**
                       * 测试替身：执行 finish，供用例观察调用与状态。
                       * @param error 被捕获或传入的异常；使用 code、message 字段。
                       * @returns {*} finish 的调用结果。
                       */
                      (error) =>
                        finish({
                          status: "error",
                          code: error.code,
                          message: error.message,
                        })
                    );
                } catch (error) {
                  finish({ status: "exception", message: error.message });
                }
              }
            );
          },
          source
        );
        report.platforms.push(result);
        fs.writeFileSync(
          path.join(output, "report.json"),
          JSON.stringify(report, null, 2)
        );
        console.log(JSON.stringify(result));
      }
      if (process.env.LISTEN1_AUDIT_PLAY === "1") {
        await page.evaluate(
          /**
           * 在目标页面或 Electron 上下文中执行 localStorage.setObject（"enable_auto_choose_source"）；跨上下文参数由测试框架序列化传入。
           * 无参数。
           * @returns {*} localStorage.setObject 的调用结果。
           */
          () => localStorage.setObject("enable_auto_choose_source", false)
        );
        for (const platform of report.platforms) {
          for (const sample of platform.samples || []) {
            const started = Date.now();
            const item = {
              source: platform.source,
              id: sample.id,
              title: sample.title,
            };
            try {
              await page.evaluate(
                /**
                 * 在目标页面或 Electron 上下文中更新 window.__auditEvents，执行 l1Player.setNewPlaylist；跨上下文参数由测试框架序列化传入。
                 * @param options 解构参数，包含 source（音乐来源名称）、id（目标条目的唯一标识）。
                 * @returns {void} 无返回值。
                 */
                ({ source, id }) => {
                  window.__auditEvents = [];
                  const track = window.__auditResults[source].find(
                    /**
                     * 筛选检查 window.__auditResults[source] 中的条目，t.id 是否严格等于 id。
                     * @param t 来自 window.__auditResults[source] 的当前条目；使用 id 字段。
                     * @returns {boolean} t.id 是否严格等于 id。
                     */
                    (t) => t.id === id
                  );
                  l1Player.setNewPlaylist([track]);
                  l1Player.setVolume(30);
                  l1Player.unmute();
                  l1Player.playById(id);
                },
                { source: platform.source, id: sample.id }
              );
              await page.waitForFunction(
                /**
                 * 检查页面是否达到所需状态，执行 window.threadPlayer.currentHowl.seek；由外层轮询及超时控制重试。
                 * 无参数。
                 * @returns {*} window.threadPlayer.playing 且 Number 的调用结果 是否大于 0.2。
                 */
                () =>
                  window.threadPlayer.playing &&
                  Number(window.threadPlayer.currentHowl.seek()) > 0.2,
                null,
                { timeout: 18000, polling: 100 }
              );
              item.firstSoundMs = Date.now() - started;
              item.audible = await app.evaluate(
                /**
                 * 在目标页面或 Electron 上下文中执行 BrowserWindow.getAllWindows().some；跨上下文参数由测试框架序列化传入。
                 * @param options 解构参数，包含 BrowserWindow（创建或检查 Electron 窗口）；使用 getAllWindows 字段。
                 * @returns {boolean} 是否存在满足条件的条目。
                 */
                ({ BrowserWindow }) =>
                  BrowserWindow.getAllWindows().some(
                    /**
                     * 筛选检查 BrowserWindow.getAllWindows() 中的条目，w.webContents.isCurrentlyAudible 的调用结果。
                     * @param w 来自 BrowserWindow.getAllWindows() 的当前条目；使用 webContents 字段。
                     * @returns {*} w.webContents.isCurrentlyAudible 的调用结果。
                     */
                    (w) => w.webContents.isCurrentlyAudible()
                  )
              );
              await page.waitForFunction(
                /**
                 * 检查页面是否达到所需状态，执行 threadPlayer.currentHowl.seek；由外层轮询及超时控制重试。
                 * 无参数。
                 * @returns {boolean} Number 的调用结果 是否不小于 5。
                 */
                () => Number(threadPlayer.currentHowl?.seek()) >= 5,
                null,
                { timeout: 10000, polling: 100 }
              );
              item.audible =
                item.audible ||
                (await app.evaluate(
                  /**
                   * 在目标页面或 Electron 上下文中执行 BrowserWindow.getAllWindows().some；跨上下文参数由测试框架序列化传入。
                   * @param options 解构参数，包含 BrowserWindow（创建或检查 Electron 窗口）；使用 getAllWindows 字段。
                   * @returns {boolean} 是否存在满足条件的条目。
                   */
                  ({ BrowserWindow }) =>
                    BrowserWindow.getAllWindows().some(
                      /**
                       * 筛选检查 BrowserWindow.getAllWindows() 中的条目，w.webContents.isCurrentlyAudible 的调用结果。
                       * @param w 来自 BrowserWindow.getAllWindows() 的当前条目；使用 webContents 字段。
                       * @returns {*} w.webContents.isCurrentlyAudible 的调用结果。
                       */
                      (w) => w.webContents.isCurrentlyAudible()
                    )
                ));
              await page.waitForFunction(
                /**
                 * 检查页面是否达到所需状态，执行 window.threadPlayer.currentHowl.seek；由外层轮询及超时控制重试。
                 * 无参数。
                 * @returns {boolean} Number 的调用结果 是否不小于 30。
                 */
                () => Number(window.threadPlayer.currentHowl?.seek()) >= 30,
                null,
                { timeout: 38000, polling: 100 }
              );
              item.state = await page.evaluate(
                /**
                 * 在目标页面或 Electron 上下文中执行 threadPlayer.currentHowl.seek；跨上下文参数由测试框架序列化传入。
                 * 无参数。
                 * @returns {Object} 包含 position、duration、platform、playing 的对象。
                 */
                () => ({
                  position: threadPlayer.currentHowl.seek(),
                  duration: threadPlayer.currentHowl.duration(),
                  platform: threadPlayer.currentAudio.platform,
                  playing: threadPlayer.playing,
                })
              );
              await page.evaluate(
                /**
                 * 在目标页面或 Electron 上下文中执行 l1Player.pause；跨上下文参数由测试框架序列化传入。
                 * 无参数。
                 * @returns {*} l1Player.pause 的调用结果。
                 */
                () => l1Player.pause()
              );
              item.paused = await page.evaluate(
                /**
                 * 在目标页面或 Electron 上下文中取得 对 threadPlayer.playing 取反的布尔值；跨上下文参数由测试框架序列化传入。
                 * 无参数。
                 * @returns {boolean} 对 threadPlayer.playing 取反的布尔值。
                 */
                () => !threadPlayer.playing
              );
              await page.evaluate(
                /**
                 * 在目标页面或 Electron 上下文中执行 l1Player.seek；跨上下文参数由测试框架序列化传入。
                 * 无参数。
                 * @returns {void} 无返回值。
                 */
                () => {
                  l1Player.seek(0.5);
                  l1Player.play();
                }
              );
              await page.waitForFunction(
                /**
                 * 检查页面是否达到所需状态，执行 threadPlayer.currentHowl.seek；由外层轮询及超时控制重试。
                 * 无参数。
                 * @returns {*} threadPlayer.playing 且 threadPlayer.currentHowl.seek 的调用结果 是否不小于 threadPlayer.currentHowl.duration 的调用结果 乘以 0.48。
                 */
                () =>
                  threadPlayer.playing &&
                  threadPlayer.currentHowl.seek() >=
                    threadPlayer.currentHowl.duration() * 0.48,
                null,
                { timeout: 5000, polling: 100 }
              );
              item.status = item.audible
                ? "audio-output-and-controls-confirmed"
                : "progress-only-audio-unverified";
            } catch (error) {
              item.status = "failed-or-unverified";
              item.error = safe(error.message);
            }
            item.events = await page.evaluate(
              /**
               * 在目标页面或 Electron 上下文中取得 window.__auditEvents；跨上下文参数由测试框架序列化传入。
               * 无参数。
               * @returns {*} window.__auditEvents。
               */
              () => window.__auditEvents
            );
            item.finalState = await page.evaluate(
              /**
               * 在目标页面或 Electron 上下文中执行 threadPlayer.currentHowl.seek；跨上下文参数由测试框架序列化传入。
               * 无参数。
               * @returns {Object} 包含 playing、position、duration、muted 的对象。
               */
              () => ({
                playing: threadPlayer.playing,
                position: threadPlayer.currentHowl?.seek(),
                duration: threadPlayer.currentHowl?.duration(),
                muted: threadPlayer.currentHowl?._sounds?.[0]?._node?.muted,
              })
            );
            await page
              .evaluate(
                /**
                 * 在目标页面或 Electron 上下文中执行 l1Player.pause；跨上下文参数由测试框架序列化传入。
                 * 无参数。
                 * @returns {*} l1Player.pause 的调用结果。
                 */
                () => l1Player.pause()
              )
              .catch(
                /**
                 * 测试替身：接受此处调用但不执行操作。
                 * 无参数。
                 * @returns {void} 无返回值。
                 */
                () => {}
              );
            report.playback.push(item);
            fs.writeFileSync(
              path.join(output, "report.json"),
              JSON.stringify(report, null, 2)
            );
            console.log(JSON.stringify(item));
          }
        }
      }
    }
  } finally {
    fs.writeFileSync(
      path.join(output, "report.json"),
      JSON.stringify(report, null, 2)
    );
    await app.close();
  }
}
main().catch(
  /**
   * 异步操作失败后，更新 report.error、process.exitCode，执行 safe。
   * @param error 被捕获或传入的异常；使用 stack 字段。
   * @returns {void} 无返回值。
   */
  (error) => {
    report.error = safe(error.stack);
    fs.mkdirSync(output, { recursive: true });
    fs.writeFileSync(
      path.join(output, "report.json"),
      JSON.stringify(report, null, 2)
    );
    console.error(report.error);
    process.exitCode = 1;
  }
);
