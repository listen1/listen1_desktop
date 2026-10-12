/**
 * 文件职责：通过实际界面审查游客搜索、分页和低音量播放，记录各平台样本结果与网络业务状态。
 *
 * 文件级定义：
 * - fs：从 node:fs 引入，用于文件读写与目录操作。
 * - path：从 node:path 引入，用于路径解析和拼接。
 * - _electron：从 playwright 引入，用于通过 Playwright 启动和控制 Electron。
 * - root：由脚本目录解析出的项目根目录。
 * - output：本次维护或测试结果的输出目录。
 * - keyword：由环境变量或默认样本提供的游客搜索词。
 * - sources：本轮在线审查需要依次验证的来源名称数组。
 * - report：收集本轮测量或测试结果的可序列化报告对象。
 * - wait：以 100 毫秒轮询页面条件，等待搜索或播放状态成立。
 * - main：通过实际界面审查游客搜索、分页和低音量播放，记录各平台样本结果与网络业务状态。异步步骤失败时向外拒绝，由入口统一设置退出状态。
 */
// 主动运行的在线审查使用游客配置和低音量样本，报告不记录认证凭据。
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
const assert = require("node:assert/strict");
/**
 * root：由脚本目录解析出的项目根目录；类型为 string。
 * @type {string}
 */
const root = path.resolve(__dirname, "..");
/**
 * output：本次维护或测试结果的输出目录；类型为 string。
 * @type {string}
 */
const output = path.join(
  root,
  "dist/maintenance",
  process.env.LISTEN1_ONLINE_RUN || "online-ui"
);
/**
 * keyword：由环境变量或默认样本提供的游客搜索词；类型为 string。
 * @type {string}
 */
const keyword = process.env.LISTEN1_KEYWORD || "夜空中最亮的星";
/**
 * sources：本轮在线审查需要依次验证的来源名称数组；类型为 string[]。
 * @type {string[]}
 */
const sources = (
  process.env.LISTEN1_SOURCES || "netease,qq,kugou,kuwo,bilibili,migu"
).split(",");
/**
 * report：收集本轮测量或测试结果的可序列化报告对象；类型为 Object。
 * @type {Object}
 */
const report = {
  date: new Date().toISOString(),
  keyword,
  account: "guest",
  fallback: false,
  platforms: [],
  errors: [],
  network: [],
};
/**
 * 以 100 毫秒轮询页面条件，等待搜索或播放状态成立。
 * @param page 执行页面条件检查的 Playwright Page 对象；使用 waitForFunction 字段。
 * @param fn 在页面上下文内反复执行的条件判断函数。
 * @param [arg] 序列化后传给条件判断函数的参数；默认值为 null。
 * @param [timeout] 最长等待时间，单位为毫秒；默认值为 18000。
 * @returns {Promise<*>} page.waitForFunction 的调用结果。
 */
const wait = (page, fn, arg = null, timeout = 18000) =>
  page.waitForFunction(fn, arg, { polling: 100, timeout });
/**
 * 通过实际界面审查游客搜索、分页和低音量播放，记录各平台样本结果与网络业务状态。异步步骤失败时向外拒绝，由入口统一设置退出状态。
 * 无参数。
 * @returns {Promise<void>} 异步完成后无返回值；拒绝由调用链处理。
 */
async function main() {
  fs.mkdirSync(output, { recursive: true });
  const app = await _electron.launch({
    executablePath: process.env.LISTEN1_TEST_EXE || require("electron"),
    args: process.env.LISTEN1_TEST_EXE
      ? []
      : [path.join(__dirname, "electron-entry.cjs")],
    env: {
      ...process.env,
      LISTEN1_TEST_USER_DATA: path.join(output, "profile"),
    },
  });
  try {
    const page = await app.firstWindow();
    page.on("console", (message) => {
      if (
        message.type() === "error" &&
        message.text().includes("ngRepeat:dupes")
      )
        report.errors.push("ngRepeat:dupes");
    });
    page.on(
      "pageerror",
      /**
       * 响应 "pageerror" 事件，执行 report.errors.push。
       * @param error 被捕获或传入的异常；使用 message 字段。
       * @returns {number} 追加后的数组长度。
       */
      (error) =>
        report.errors.push(error.message.replace(/https?:\/\/\S+/g, "[URL]"))
    );
    page.on(
      "response",
      /**
       * 响应 "response" 事件，执行 response.url。
       * @param response 异步请求返回的响应对象；使用 url、json、status 字段。
       * @returns {Promise<void>} 异步完成后无返回值；拒绝由调用链处理。
       */
      async (response) => {
        const url = new URL(response.url());
        if (
          !/search|musicu|playurl|playUrl|enhance|SongInfo/i.test(url.pathname)
        )
          return;
        const body = await response.json().catch(
          /**
           * 异步操作失败后，取得 null。
           * 无参数。
           * @returns {null} null。
           */
          () => null
        );
        report.network.push({
          host: url.hostname,
          path: url.pathname,
          status: response.status(),
          code: body?.code,
          businessCode: body?.req?.code ?? body?.req_1?.code,
          message: String(body?.message ?? body?.msg ?? "").slice(0, 100),
        });
      }
    );
    await wait(
      page,
      /**
       * 检查页面是否达到所需状态，执行 angular.element().injector；由外层轮询及超时控制重试。
       * 无参数。
       * @returns {*} window.l1Player 且 angular.element().injector 的调用结果。
       */
      () => window.l1Player && angular.element(document.body).injector()
    );
    await page.evaluate(
      /**
       * 在目标页面或 Electron 上下文中更新 window.__playbackEvents，执行 localStorage.setObject（"enable_auto_choose_source"）；跨上下文参数由测试框架序列化传入。
       * 无参数。
       * @returns {void} 无返回值。
       */
      () => {
        localStorage.setObject("enable_auto_choose_source", false);
        l1Player.setVolume(5);
        window.__playbackEvents = [];
        addPlayerListener(
          "front",
          /**
           * 测试替身：执行 /FAIL|RETRIEVE_URL/.test，供用例观察调用与状态。
           * @param event 触发当前处理器的事件对象；使用 type、data 字段。
           * @returns {void} 无返回值。
           */
          (event) => {
            if (/FAIL|RETRIEVE_URL/.test(event.type))
              window.__playbackEvents.push({
                type: event.type,
                id: event.data?.id,
                code: event.data?.error?.code,
                platform: event.data?.platform,
              });
          }
        );
      }
    );
    report.runtime = await app.evaluate(
      /**
       * 在目标页面或 Electron 上下文中取得 process.versions；跨上下文参数由测试框架序列化传入。
       * 无参数。
       * @returns {*} process.versions。
       */
      () => process.versions
    );
    report.initialMetrics = await app.evaluate(
      /**
       * 在目标页面或 Electron 上下文中执行 app.getAppMetrics().map；跨上下文参数由测试框架序列化传入。
       * @param options 解构参数，包含 app（Electron 应用生命周期入口）；使用 getAppMetrics 字段。
       * @returns {Array} 逐项转换后的数组。
       */
      ({ app }) =>
        app.getAppMetrics().map(
          /**
           * 转换 app.getAppMetrics() 中的条目，包含 type、cpu、memory 的对象。
           * @param options 来自 app.getAppMetrics() 的当前条目；解构参数，包含 type（当前查询或操作类型）、cpu（Electron 进程 CPU 使用情况）、memory（Electron 进程内存统计）。
           * @returns {Object} 包含 type、cpu、memory 的对象。
           */
          ({ type, cpu, memory }) => ({ type, cpu, memory })
        )
    );
    const input = page.locator('input[ng-model="keywords"]');
    await input.fill(keyword);
    await wait(
      page,
      /**
       * 检查页面是否达到所需状态，执行 angular.element().scope；由外层轮询及超时控制重试。
       * @param keyword 本轮搜索使用的关键词。
       * @returns {*} scope.keywords 是否严格等于 keyword 且 对 scope.loading 取反的布尔值。
       */
      (keyword) => {
        const scope = angular
          .element(
            document.querySelector('[ng-controller="InstantSearchController"]')
          )
          .scope();
        return scope.keywords === keyword && !scope.loading;
      },
      keyword
    );
    for (const source of sources) {
      const result = { source, playback: [] };
      report.platforms.push(result);
      const tabs = page.locator('[ng-click="changeSourceTab(source.name)"]');
      const index = await tabs.evaluateAll(
        /**
         * 在目标页面或 Electron 上下文中执行 elements.findIndex；跨上下文参数由测试框架序列化传入。
         * @param elements 指令绑定的元素集合；使用 findIndex 字段。
         * @param source 音乐来源名称。
         * @returns {number} 匹配条目的索引，未匹配时为 -1。
         */
        (elements, source) =>
          elements.findIndex(
            /**
             * 筛选检查 elements 中的条目，angular.element().scope().source.name 是否严格等于 source。
             * @param element 来自 elements 的当前条目。
             * @returns {boolean} angular.element().scope().source.name 是否严格等于 source。
             */
            (element) => angular.element(element).scope().source.name === source
          ),
        source
      );
      const start = Date.now();
      await tabs.nth(index).click();
      await wait(
        page,
        /**
         * 检查页面是否达到所需状态，执行 angular.element().scope；由外层轮询及超时控制重试。
         * @param source 音乐来源名称。
         * @returns {*} scope.tab 是否严格等于 source 且 对 scope.loading 取反的布尔值。
         */
        (source) => {
          const scope = angular
            .element(
              document.querySelector(
                '[ng-controller="InstantSearchController"]'
              )
            )
            .scope();
          return scope.tab === source && !scope.loading;
        },
        source
      );
      result.search = await page.evaluate(
        /**
         * 在目标页面或 Electron 上下文中执行 angular.element().scope；跨上下文参数由测试框架序列化传入。
         * 无参数。
         * @returns {Object} 包含 count、error、hasMore、totalpage、samples 的对象。
         */
        () => {
          const scope = angular
            .element(
              document.querySelector(
                '[ng-controller="InstantSearchController"]'
              )
            )
            .scope();
          return {
            count: scope.result.length,
            uniqueCount: new Set(
              scope.result.map((item) => `${item.source}:${item.id}`)
            ).size,
            domCount: document.querySelectorAll(
              '.searchbox [ng-repeat^="song in result"]'
            ).length,
            error: scope.searchError,
            hasMore: scope.hasMore,
            totalpage: scope.totalpage,
            samples: scope.result.slice(0, 6).map(
              /**
               * 转换 scope.result.slice() 中的条目，包含 id、title、artist 的对象。
               * @param options 来自 scope.result.slice() 的当前条目；解构参数，包含 id（目标条目的唯一标识）、title（新的歌单标题）、artist（歌手名称）。
               * @returns {Object} 包含 id、title、artist 的对象。
               */
              ({ id, title, artist }) => ({ id, title, artist })
            ),
          };
        }
      );
      assert.equal(
        result.search.count,
        result.search.uniqueCount,
        "search identities must be unique"
      );
      assert.equal(
        result.search.domCount,
        result.search.count,
        "search results must render in the DOM"
      );
      assert.ok(
        !report.errors.includes("ngRepeat:dupes"),
        "Angular search rendering failed"
      );
      result.search.elapsedMs = Date.now() - start;
      let played = 0;
      for (const [position, sample] of result.search.samples.entries()) {
        if (played >= 2) break;
        const entry = { ...sample, audioChecks: [] };
        result.playback.push(entry);
        await page.evaluate(
          /**
           * 在目标页面或 Electron 上下文中更新 window.__playbackEvents，执行 l1Player.clearPlaylist；跨上下文参数由测试框架序列化传入。
           * 无参数。
           * @returns {void} 无返回值。
           */
          () => {
            l1Player.clearPlaylist();
            l1Player.setVolume(5);
            l1Player.unmute();
            window.__playbackEvents = [];
          }
        );
        const playStart = Date.now();
        await page
          .locator('.searchbox .detail-songlist [add-and-play="song"]')
          .nth(position)
          .click();
        try {
          await wait(
            page,
            /**
             * 检查页面是否达到所需状态，执行 threadPlayer.currentHowl.seek；由外层轮询及超时控制重试。
             * @param id 目标条目的唯一标识。
             * @returns {*} threadPlayer.currentAudio.id 是否严格等于 id 且 threadPlayer.playing 且 threadPlayer.currentHowl.seek 的调用结果 是否大于 0.2，为空或假值时使用 threadPlayer.currentAudio.disabled。
             */
            (id) =>
              threadPlayer.currentAudio?.id === id &&
              ((threadPlayer.playing &&
                threadPlayer.currentHowl.seek() > 0.2) ||
                threadPlayer.currentAudio.disabled),
            sample.id,
            32000
          );
          const unavailable = await page.evaluate(
            /**
             * 在目标页面或 Electron 上下文中取得 对 对 threadPlayer.currentAudio.disabled 取反的布尔值 取反的布尔值；跨上下文参数由测试框架序列化传入。
             * 无参数。
             * @returns {boolean} 对 对 threadPlayer.currentAudio.disabled 取反的布尔值 取反的布尔值。
             */
            () => !!threadPlayer.currentAudio.disabled
          );
          if (unavailable) {
            entry.status = "unavailable";
            await wait(
              page,
              () => {
                const failure = window.__playbackEvents.find(
                  (event) =>
                    event.type === "BG_PLAYER:RETRIEVE_URL_FAIL" && event.code
                );
                return (
                  failure &&
                  Array.from(document.querySelectorAll(".notyf__message")).some(
                    (element) =>
                      element.textContent.includes(
                        i18next.t(`_ERROR_${failure.code}`)
                      )
                  )
                );
              },
              null,
              3000
            );
            entry.reasonVisible = true;
          } else {
            entry.firstProgressMs = Date.now() - playStart;
            for (const seconds of [1, 5, 10, 20, 30]) {
              await wait(
                page,
                /**
                 * 检查页面是否达到所需状态，执行 threadPlayer.currentHowl.seek；由外层轮询及超时控制重试。
                 * @param seconds 以秒为单位的播放位置。
                 * @returns {boolean} threadPlayer.currentHowl.seek 的调用结果 是否不小于 seconds。
                 */
                (seconds) => threadPlayer.currentHowl?.seek() >= seconds,
                seconds,
                20000
              );
              const state = await page.evaluate(
                /**
                 * 在目标页面或 Electron 上下文中执行 threadPlayer.currentHowl.seek；跨上下文参数由测试框架序列化传入。
                 * 无参数。
                 * @returns {Object} 包含 position、playing、muted、actualSource 的对象。
                 */
                () => ({
                  position: threadPlayer.currentHowl.seek(),
                  playing: threadPlayer.playing,
                  muted: threadPlayer.muted,
                  actualSource: threadPlayer.currentAudio.platform,
                })
              );
              state.audible = await app.evaluate(
                /**
                 * 在目标页面或 Electron 上下文中执行 BrowserWindow.getAllWindows().find().webContents.isCurrentlyAudible；跨上下文参数由测试框架序列化传入。
                 * @param options 解构参数，包含 BrowserWindow（创建或检查 Electron 窗口）；使用 getAllWindows 字段。
                 * @returns {*} BrowserWindow.getAllWindows().find().webContents.isCurrentlyAudible 的调用结果。
                 */
                ({ BrowserWindow }) =>
                  BrowserWindow.getAllWindows()
                    .find(
                      /**
                       * 筛选检查 BrowserWindow.getAllWindows() 中的条目，window.webContents.getURL().includes 的布尔判断结果。
                       * @param window 来自 BrowserWindow.getAllWindows() 的当前条目；使用 webContents 字段。
                       * @returns {boolean} window.webContents.getURL().includes 的布尔判断结果。
                       */
                      (window) =>
                        window.webContents.getURL().includes("listen1.html")
                    )
                    .webContents.isCurrentlyAudible()
              );
              entry.audioChecks.push(state);
            }
            // 连续播放采样后操作实际底栏按钮，验证暂停、跳转和恢复。
            await page.locator("[play-pause-toggle]").first().click();
            await wait(
              page,
              /**
               * 检查页面是否达到所需状态，取得 对 threadPlayer.playing 取反的布尔值；由外层轮询及超时控制重试。
               * 无参数。
               * @returns {boolean} 对 threadPlayer.playing 取反的布尔值。
               */
              () => !threadPlayer.playing,
              null,
              3000
            );
            await page.evaluate(
              /**
               * 在目标页面或 Electron 上下文中执行 l1Player.seek；跨上下文参数由测试框架序列化传入。
               * 无参数。
               * @returns {*} l1Player.seek 的调用结果。
               */
              () => l1Player.seek(0.5)
            );
            await page.locator("[play-pause-toggle]").first().click();
            await wait(
              page,
              /**
               * 检查页面是否达到所需状态，执行 threadPlayer.currentHowl.seek；由外层轮询及超时控制重试。
               * 无参数。
               * @returns {*} threadPlayer.playing 且 threadPlayer.currentHowl.seek 的调用结果 是否大于 threadPlayer.currentHowl.duration 的调用结果 乘以 0.49。
               */
              () =>
                threadPlayer.playing &&
                threadPlayer.currentHowl.seek() >
                  threadPlayer.currentHowl.duration() * 0.49,
              null,
              3000
            );
            entry.controls = "pause/seek/resume passed";
            const hasAudio =
              entry.audioChecks.filter(
                /**
                 * 筛选检查 entry.audioChecks 中的条目，check.audible。
                 * @param check 来自 entry.audioChecks 的当前条目；使用 audible 字段。
                 * @returns {*} check.audible。
                 */
                (check) => check.audible
              ).length >= 2 &&
              entry.audioChecks.every(
                /**
                 * 筛选检查 entry.audioChecks 中的条目，对 check.muted 取反的布尔值。
                 * @param check 来自 entry.audioChecks 的当前条目；使用 muted 字段。
                 * @returns {boolean} 对 check.muted 取反的布尔值。
                 */
                (check) => !check.muted
              );
            entry.status = hasAudio
              ? "passed"
              : "progress-confirmed/audio-unverified";
            played += 1;
          }
        } catch (error) {
          entry.status = "failed-or-unverified";
          entry.error = error.message.split("\n")[0];
        }
        entry.events = await page.evaluate(
          /**
           * 在目标页面或 Electron 上下文中取得 window.__playbackEvents；跨上下文参数由测试框架序列化传入。
           * 无参数。
           * @returns {*} window.__playbackEvents。
           */
          () => window.__playbackEvents
        );
        await page.evaluate(
          /**
           * 在目标页面或 Electron 上下文中执行 l1Player.pause；跨上下文参数由测试框架序列化传入。
           * 无参数。
           * @returns {*} l1Player.pause 的调用结果。
           */
          () => l1Player.pause()
        );
        console.log(JSON.stringify({ source, ...entry }));
        fs.writeFileSync(
          path.join(output, "report.json"),
          JSON.stringify(report, null, 2)
        );
      }
      if (result.search.hasMore) {
        const firstId = result.search.samples[0]?.id;
        await page
          .locator('.search-pagination button[ng-click="nextPage()"]')
          .click();
        await wait(
          page,
          /**
           * 检查页面是否达到所需状态，执行 angular.element().scope；由外层轮询及超时控制重试。
           * 无参数。
           * @returns {*} scope.curpage 是否严格等于 2 且 对 scope.loading 取反的布尔值。
           */
          () => {
            const scope = angular
              .element(
                document.querySelector(
                  '[ng-controller="InstantSearchController"]'
                )
              )
              .scope();
            return scope.curpage === 2 && !scope.loading;
          }
        );
        result.pagination = await page.evaluate(
          /**
           * 在目标页面或 Electron 上下文中执行 angular.element().scope；跨上下文参数由测试框架序列化传入。
           * @param firstId 前一页首条结果的 ID，用于确认翻页已改变结果。
           * @returns {Object} 包含 page、count、firstResultChanged、error 的对象。
           */
          (firstId) => {
            const scope = angular
              .element(
                document.querySelector(
                  '[ng-controller="InstantSearchController"]'
                )
              )
              .scope();
            return {
              page: scope.curpage,
              count: scope.result.length,
              firstResultChanged: scope.result[0]?.id !== firstId,
              error: scope.searchError,
            };
          },
          firstId
        );
      }
    }
    await page.locator("[ng-click=\"changeSourceTab('allmusic')\"]").click();
    await wait(
      page,
      /**
       * 检查页面是否达到所需状态，执行 angular.element().scope；由外层轮询及超时控制重试。
       * 无参数。
       * @returns {*} scope.tab 是否严格等于 "allmusic" 且 对 scope.loading 取反的布尔值。
       */
      () => {
        const scope = angular
          .element(
            document.querySelector('[ng-controller="InstantSearchController"]')
          )
          .scope();
        return scope.tab === "allmusic" && !scope.loading;
      }
    );
    report.aggregate = await page.evaluate(
      /**
       * 在目标页面或 Electron 上下文中执行 angular.element().scope；跨上下文参数由测试框架序列化传入。
       * 无参数。
       * @returns {Object} 包含 count、sources、hasMore 的对象。
       */
      () => {
        const scope = angular
          .element(
            document.querySelector('[ng-controller="InstantSearchController"]')
          )
          .scope();
        return {
          count: scope.result.length,
          sources: scope.searchSources,
          hasMore: scope.hasMore,
        };
      }
    );
    report.finalMetrics = await app.evaluate(
      /**
       * 在目标页面或 Electron 上下文中执行 app.getAppMetrics().map；跨上下文参数由测试框架序列化传入。
       * @param options 解构参数，包含 app（Electron 应用生命周期入口）；使用 getAppMetrics 字段。
       * @returns {Array} 逐项转换后的数组。
       */
      ({ app }) =>
        app.getAppMetrics().map(
          /**
           * 转换 app.getAppMetrics() 中的条目，包含 type、cpu、memory 的对象。
           * @param options 来自 app.getAppMetrics() 的当前条目；解构参数，包含 type（当前查询或操作类型）、cpu（Electron 进程 CPU 使用情况）、memory（Electron 进程内存统计）。
           * @returns {Object} 包含 type、cpu、memory 的对象。
           */
          ({ type, cpu, memory }) => ({ type, cpu, memory })
        )
    );
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
   * 异步操作失败后，更新 report.failure、process.exitCode，执行 fs.writeFileSync。
   * @param error 被捕获或传入的异常；使用 message 字段。
   * @returns {void} 无返回值。
   */
  (error) => {
    report.failure = error.message;
    fs.writeFileSync(
      path.join(output, "report.json"),
      JSON.stringify(report, null, 2)
    );
    console.error(error.message);
    process.exitCode = 1;
  }
);
