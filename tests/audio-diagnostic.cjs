/**
 * 文件职责：在独立 Electron 配置目录中对比两版 Howler，采样播放进度、原生音频状态和静音调用栈。
 *
 * 文件级定义：
 * - fs：从 node:fs 引入，用于文件读写与目录操作。
 * - path：从 node:path 引入，用于路径解析和拼接。
 * - _electron：从 playwright 引入，用于通过 Playwright 启动和控制 Electron。
 * - root：由脚本目录解析出的项目根目录。
 * - main：在独立 Electron 配置目录中对比两版 Howler，采样播放进度、原生音频状态和静音调用栈。异步步骤失败时向外拒绝，由入口统一设置退出状态。
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
 * 在独立 Electron 配置目录中对比两版 Howler，采样播放进度、原生音频状态和静音调用栈。异步步骤失败时向外拒绝，由入口统一设置退出状态。
 * 无参数。
 * @returns {Promise<void>} 异步完成后无返回值；拒绝由调用链处理。
 */
async function main() {
  const output = path.join(root, "dist/maintenance/audio-diagnostic");
  fs.mkdirSync(output, { recursive: true });
  const app = await _electron.launch({
    executablePath: require("electron"),
    args: [path.join(__dirname, "electron-entry.cjs")],
    env: {
      ...process.env,
      LISTEN1_TEST_USER_DATA: path.join(output, "profile"),
    },
  });
  const results = [];
  try {
    const page = await app.firstWindow();
    await page.waitForFunction(
      /**
       * 检查页面是否达到所需状态，执行 angular.element().injector；由外层轮询及超时控制重试。
       * 无参数。
       * @returns {*} window.l1Player 且 angular.element().injector 的调用结果。
       */
      () => window.l1Player && angular.element(document.body).injector(),
      null,
      { polling: 100 }
    );
    await page.evaluate(
      /**
       * 在目标页面或 Electron 上下文中更新 window.__muteTrace，执行 Object.getOwnPropertyDescriptor；跨上下文参数由测试框架序列化传入。
       * 无参数。
       * @returns {void} 无返回值。
       */
      () => {
        window.__muteTrace = [];
        const descriptor = Object.getOwnPropertyDescriptor(
          HTMLMediaElement.prototype,
          "muted"
        );
        Object.defineProperty(HTMLMediaElement.prototype, "muted", {
          ...descriptor,
          /**
           * 测试替身：执行 window.__muteTrace.push，供用例观察调用与状态。
           * @param value 待检查或转换的输入值。
           * @returns {void} 无返回值。
           */
          set(value) {
            if (value) window.__muteTrace.push(new Error("muted").stack);
            descriptor.set.call(this, value);
          },
        });
      }
    );
    for (const version of ["2.2.4", "2.2.3"]) {
      if (version === "2.2.3") {
        await page.evaluate(
          /**
           * 在目标页面或 Electron 上下文中执行 threadPlayer.clearPlaylist；跨上下文参数由测试框架序列化传入。
           * 无参数。
           * @returns {void} 无返回值。
           */
          () => {
            threadPlayer.clearPlaylist();
            Howler.unload();
          }
        );
        await page.addScriptTag({
          path: path.join(
            root,
            "dist/maintenance/baseline/app/listen1_chrome_extension/js/vendor/howler.core.min.js"
          ),
        });
      }
      await page.evaluate(
        /**
         * 在目标页面或 Electron 上下文中执行 localStorage.setObject（"enable_auto_choose_source"）；跨上下文参数由测试框架序列化传入。
         * 无参数。
         * @returns {void} 无返回值。
         */
        () => {
          localStorage.setObject("enable_auto_choose_source", false);
          l1Player.setNewPlaylist([
            {
              id: "kgtrack_33CA0759CA7738706894F08A8BE65CD7",
              title: "audio check",
              artist: "test",
              source: "kugou",
            },
          ]);
          l1Player.play();
        }
      );
      for (let elapsed = 0; elapsed < 12; elapsed += 1) {
        await new Promise(
          /**
           * 启动当前异步操作，执行 setTimeout，由 resolve／reject 决定 Promise 的结果。
           * @param resolve 用于兑现当前 Promise 的函数。
           * @returns {*} setTimeout 的调用结果。
           */
          (resolve) => setTimeout(resolve, 1000)
        );
        const state = await page.evaluate(
          /**
           * 在目标页面或 Electron 上下文中执行 howl.seek；跨上下文参数由测试框架序列化传入。
           * 无参数。
           * @returns {Object} 包含 playing、pos、duration、state、audio 的对象。
           */
          () => {
            const howl = threadPlayer.currentHowl,
              audio = howl?._sounds?.[0]?._node;
            return {
              playing: threadPlayer.playing,
              pos: howl?.seek(),
              duration: howl?.duration(),
              state: howl?.state(),
              audio: audio && {
                paused: audio.paused,
                time: audio.currentTime,
                ready: audio.readyState,
                network: audio.networkState,
                error: audio.error?.code,
                muted: audio.muted,
                volume: audio.volume,
              },
            };
          }
        );
        state.audible = await app.evaluate(
          /**
           * 在目标页面或 Electron 上下文中执行 BrowserWindow.getAllWindows()[0].webContents.isCurrentlyAudible；跨上下文参数由测试框架序列化传入。
           * @param options 解构参数，包含 BrowserWindow（创建或检查 Electron 窗口）；使用 getAllWindows 字段。
           * @returns {*} BrowserWindow.getAllWindows()[0].webContents.isCurrentlyAudible 的调用结果。
           */
          ({ BrowserWindow }) =>
            BrowserWindow.getAllWindows()[0].webContents.isCurrentlyAudible()
        );
        results.push({ version, elapsed, ...state });
      }
      console.log(
        JSON.stringify({
          version,
          states: results.filter(
            /**
             * 筛选检查 results 中的条目，r.version 是否严格等于 version。
             * @param r 来自 results 的当前条目；使用 version 字段。
             * @returns {boolean} r.version 是否严格等于 version。
             */
            (r) => r.version === version
          ),
          muteTrace: await page.evaluate(
            /**
             * 在目标页面或 Electron 上下文中取得 window.__muteTrace；跨上下文参数由测试框架序列化传入。
             * 无参数。
             * @returns {*} window.__muteTrace。
             */
            () => window.__muteTrace
          ),
        })
      );
    }
  } finally {
    fs.writeFileSync(
      path.join(output, "report.json"),
      JSON.stringify(results, null, 2)
    );
    await app.close();
  }
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
