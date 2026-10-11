/**
 * 文件职责：使用可丢弃配置目录运行桌面冒烟回归，覆盖本地播放、主题、语言、备份、离线失败和悬浮歌词。
 *
 * 文件级定义：
 * - fs：从 node:fs 引入，用于文件读写与目录操作。
 * - path：从 node:path 引入，用于路径解析和拼接。
 * - assert：从 node:assert/strict 引入，用于断言测试结果。
 * - spawn：从 node:child_process 引入，用于启动子进程并接收退出状态。
 * - _electron：从 playwright 引入，用于通过 Playwright 启动和控制 Electron。
 * - writeAudioFixtures：从 ./fixtures.cjs 引入，用于生成独立的合成音频测试样本。
 * - root：由脚本目录解析出的项目根目录。
 * - output：本次维护或测试结果的输出目录。
 * - report：收集本轮测量或测试结果的可序列化报告对象。
 * - wait：以 100 毫秒轮询页面条件，在指定超时内等待成立。
 * - main：使用可丢弃配置目录运行桌面冒烟回归，覆盖本地播放、主题、语言、备份、离线失败和悬浮歌词。异步步骤失败时向外拒绝，由入口统一设置退出状态。
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
 * assert：从 node:assert/strict 引入，用于断言测试结果；类型为 typeof import("node:assert/strict")。
 * @type {typeof import("node:assert/strict")}
 */
const assert = require("node:assert/strict");
/**
 * spawn：从 node:child_process 引入，用于启动子进程并接收退出状态；类型为 typeof import("node:child_process").spawn。
 */
const { spawn } = require("node:child_process");
/**
 * _electron：从 playwright 引入，用于通过 Playwright 启动和控制 Electron；类型为 typeof import("playwright")._electron。
 */
const { _electron } = require("playwright");
/**
 * writeAudioFixtures：从 ./fixtures.cjs 引入，用于生成独立的合成音频测试样本；类型为 typeof import("./fixtures.cjs").writeAudioFixtures。
 */
const { writeAudioFixtures } = require("./fixtures.cjs");
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
  process.env.LISTEN1_SMOKE_RUN || "electron-smoke"
);
/**
 * report：收集本轮测量或测试结果的可序列化报告对象；类型为 Object。
 * @type {Object}
 */
const report = { date: new Date().toISOString(), checks: [], errors: [] };
/**
 * 以 100 毫秒轮询页面条件，在指定超时内等待成立。
 * @param page 执行页面条件检查的 Playwright Page 对象；使用 waitForFunction 字段。
 * @param fn 在页面上下文内反复执行的条件判断函数。
 * @param [arg] 序列化后传给条件判断函数的参数；默认值为 null。
 * @param [timeout] 最长等待时间，单位为毫秒；默认值为 8000。
 * @returns {Promise<*>} page.waitForFunction 的调用结果。
 */
const wait = (page, fn, arg = null, timeout = 8000) =>
  page.waitForFunction(fn, arg, { polling: 100, timeout });
/**
 * 使用可丢弃配置目录运行桌面冒烟回归，覆盖本地播放、主题、语言、备份、离线失败和悬浮歌词。异步步骤失败时向外拒绝，由入口统一设置退出状态。
 * 无参数。
 * @returns {Promise<void>} 异步完成后无返回值；拒绝由调用链处理。
 */
async function main() {
  fs.mkdirSync(output, { recursive: true });
  const fixtures = writeAudioFixtures(path.join(output, "fixtures"));
  const profile = path.join(output, "profile");
  fs.mkdirSync(profile, { recursive: true });
  fs.writeFileSync(
    path.join(profile, "config.json"),
    JSON.stringify({
      windowState: { width: 1000, height: 670, maximized: false, zoomLevel: 0 },
      proxyConfig: { mode: "direct" },
    })
  );
  /**
   * 使用本轮独立配置目录启动开发入口或指定的打包应用，返回 Playwright 管理的 Electron 实例。
   * 无参数。
   * @returns {*} _electron.launch 的调用结果。
   */
  const launch = () =>
    _electron.launch({
      executablePath: process.env.LISTEN1_TEST_EXE || require("electron"),
      args: process.env.LISTEN1_TEST_EXE
        ? []
        : [path.join(__dirname, "electron-entry.cjs")],
      env: { ...process.env, LISTEN1_TEST_USER_DATA: profile },
    });
  let app = await launch();
  try {
    let page = await app.firstWindow();
    page.on(
      "pageerror",
      /**
       * 响应 "pageerror" 事件，执行 report.errors.push。
       * @param error 被捕获或传入的异常；使用 message 字段。
       * @returns {number} 追加后的数组长度。
       */
      (error) => report.errors.push(error.message)
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
    /**
     * 执行一个冒烟步骤，成功后记录名称与耗时；失败向外抛出，由主流程记录异常并结束本轮。
     * @param name 待查找或注册的名称。
     * @param fn 接收处理结果的回调函数。
     * @returns {Promise<void>} 异步完成后无返回值；拒绝由调用链处理。
     */
    const check = async (name, fn) => {
      const start = Date.now();
      await fn();
      report.checks.push({
        name,
        status: "passed",
        elapsedMs: Date.now() - start,
      });
      console.log(name);
    };
    report.runtime = await app.evaluate(
      /**
       * 在目标页面或 Electron 上下文中取得 process.versions；跨上下文参数由测试框架序列化传入。
       * 无参数。
       * @returns {*} process.versions。
       */
      () => process.versions
    );
    await check(
      "isolated renderer and IPC sender validation",
      /**
       * 验证渲染进程隔离、桌面桥版本及非法登录地址拒绝行为；失败交给外层主流程记录。
       * 无参数。
       * @returns {Promise<void>} 异步完成后无返回值；拒绝由调用链处理。
       */
      async () => {
        assert.deepEqual(
          await page.evaluate(
            /**
             * 在目标页面或 Electron 上下文中取得 包含 require、process、bridge 的对象；跨上下文参数由测试框架序列化传入。
             * 无参数。
             * @returns {Object} 包含 require、process、bridge 的对象。
             */
            () => ({
              require: typeof require,
              process: typeof process,
              bridge: listen1Desktop.version,
            })
          ),
          { require: "undefined", process: "undefined", bridge: 1 }
        );
        const rejected = await page.evaluate(
          /**
           * 在目标页面或 Electron 上下文中执行 listen1Desktop.openLogin（"https://example.invalid/"）；跨上下文参数由测试框架序列化传入。
           * 无参数。
           * @returns {Promise<boolean>} 异步完成后得到 false；其他分支返回 true。
           */
          async () => {
            try {
              await listen1Desktop.openLogin("https://example.invalid/");
              return false;
            } catch {
              return true;
            }
          }
        );
        assert.equal(rejected, true);
      }
    );
    await check(
      "old queue and playlists restore without a storage migration",
      /**
       * 验证旧播放队列和歌单可直接恢复，保持既有存储结构；失败交给外层主流程记录。
       * 无参数。
       * @returns {Promise<void>} 异步完成后无返回值；拒绝由调用链处理。
       */
      async () => {
        await page.evaluate(
          /**
           * 在目标页面或 Electron 上下文中执行 localStorage.setObject（"current-playing"）；跨上下文参数由测试框架序列化传入。
           * @param options 解构参数，包含 audio（待加入或操作的曲目对象）。
           * @returns {void} 无返回值。
           */
          ({ audio }) => {
            const track = {
              id: `lmtrack_${audio}`,
              title: "Old title",
              artist: "",
              source: "localmusic",
              sound_url: `file://${audio}`,
            };
            localStorage.setObject("current-playing", [track]);
            localStorage.setObject("player-settings", {
              volume: 5,
              playmode: 0,
              nowplaying_track_id: track.id,
            });
            localStorage.setObject("playerlists", ["myplaylist_fixture"]);
            localStorage.setObject("myplaylist_fixture", {
              is_mine: 1,
              info: { id: "myplaylist_fixture", title: "旧歌单" },
              tracks: [track],
            });
          },
          fixtures
        );
        await page.reload();
        await wait(
          page,
          /**
           * 检查页面是否达到所需状态，取得 threadPlayer.playlist.length 是否严格等于 1；由外层轮询及超时控制重试。
           * 无参数。
           * @returns {boolean} threadPlayer.playlist.length 是否严格等于 1。
           */
          () => threadPlayer.playlist.length === 1
        );
        assert.equal(
          await page.evaluate(
            /**
             * 在目标页面或 Electron 上下文中执行 localStorage.getObject（"myplaylist_fixture"）；跨上下文参数由测试框架序列化传入。
             * 无参数。
             * @returns {*} localStorage.getObject().tracks.length。
             */
            () => localStorage.getObject("myplaylist_fixture").tracks.length
          ),
          1
        );
      }
    );
    await check(
      "local file dialog result → ESM tags → batch playlist → playback and lyrics",
      /**
       * 验证文件选择、ESM 标签读取、批量入队、本地播放和歌词显示的完整链路；失败交给外层主流程记录。
       * 无参数。
       * @returns {Promise<void>} 异步完成后无返回值；拒绝由调用链处理。
       */
      async () => {
        await app.evaluate(
          /**
           * 在目标页面或 Electron 上下文中更新 dialog.showOpenDialog；跨上下文参数由测试框架序列化传入。
           * @param options 解构参数，包含 dialog（显示本地文件选择对话框）；使用 showOpenDialog 字段。
           * @param paths 模拟文件对话框返回的音频路径数组。
           * @returns {void} 无返回值。
           */
          ({ dialog }, paths) => {
            /**
             * 测试替身：取得 包含 canceled、filePaths 的对象，供用例观察调用与状态。
             * 无参数。
             * @returns {Promise<Object>} 异步完成后得到 包含 canceled、filePaths 的对象。
             */
            dialog.showOpenDialog = async () => ({
              canceled: false,
              filePaths: paths,
            });
          },
          [fixtures.audio, fixtures.plain, fixtures.broken]
        );
        await page.evaluate(
          /**
           * 在目标页面或 Electron 上下文中执行 angular.element().scope().addLocalMusic；跨上下文参数由测试框架序列化传入。
           * 无参数。
           * @returns {*} angular.element().scope().addLocalMusic 的调用结果。
           */
          () =>
            angular
              .element(
                document.querySelector('[ng-controller="NavigationController"]')
              )
              .scope()
              .addLocalMusic()
        );
        await wait(
          page,
          /**
           * 检查页面是否达到所需状态，执行 localStorage.getObject（"lmplaylist_reserve"）；由外层轮询及超时控制重试。
           * 无参数。
           * @returns {boolean} localStorage.getObject().tracks.length 是否严格等于 3。
           */
          () =>
            localStorage.getObject("lmplaylist_reserve")?.tracks.length === 3
        );
        const tracks = await page.evaluate(
          /**
           * 在目标页面或 Electron 上下文中执行 localStorage.getObject（"lmplaylist_reserve"）；跨上下文参数由测试框架序列化传入。
           * 无参数。
           * @returns {*} localStorage.getObject().tracks。
           */
          () => localStorage.getObject("lmplaylist_reserve").tracks
        );
        const tagged = tracks.find(
          /**
           * 筛选检查 tracks 中的条目，track.title 是否严格等于 "Synthetic title"。
           * @param track 来自 tracks 的当前条目；使用 title 字段。
           * @returns {boolean} track.title 是否严格等于 "Synthetic title"。
           */
          (track) => track.id === `lmtrack_${fixtures.audio}`
        );
        assert.ok(tagged);
        assert.equal(tagged.title, path.basename(fixtures.audio, ".wav"));
        assert.equal(tagged.artist, "Fixture artist");
        assert.match(tagged.sound_url, /%23/);
        assert.match(tagged.sound_url, /%25/);
        assert.match(tagged.lyrics[0], /合成歌词/);
        assert.ok(
          tracks.some(
            /**
             * 筛选检查 tracks 中的条目，track.title 是否严格等于 "no-tags"。
             * @param track 来自 tracks 的当前条目；使用 title 字段。
             * @returns {boolean} track.title 是否严格等于 "no-tags"。
             */
            (track) => track.title === "no-tags"
          )
        );
        assert.ok(
          tracks.some(
            /**
             * 筛选检查 tracks 中的条目，track.title 是否严格等于 "broken"。
             * @param track 来自 tracks 的当前条目；使用 title 字段。
             * @returns {boolean} track.title 是否严格等于 "broken"。
             */
            (track) => track.title === "broken"
          )
        );
        await page.evaluate(
          /**
           * 在目标页面或 Electron 上下文中执行 l1Player.setNewPlaylist；跨上下文参数由测试框架序列化传入。
           * @param track 统一曲目对象，包含用于路由和查找的 ID。
           * @returns {void} 无返回值。
           */
          (track) => {
            l1Player.setNewPlaylist([track]);
            l1Player.play();
          },
          tagged
        );
        await wait(
          page,
          /**
           * 检查页面是否达到所需状态，执行 threadPlayer.currentHowl.seek；由外层轮询及超时控制重试。
           * 无参数。
           * @returns {*} threadPlayer.playing 且 threadPlayer.currentHowl.seek 的调用结果 是否大于 1。
           */
          () => threadPlayer.playing && threadPlayer.currentHowl.seek() > 1
        );
        assert.equal(
          await app.evaluate(
            /**
             * 在目标页面或 Electron 上下文中执行 BrowserWindow.getAllWindows()[0].webContents.isCurrentlyAudible；跨上下文参数由测试框架序列化传入。
             * @param options 解构参数，包含 BrowserWindow（创建或检查 Electron 窗口）；使用 getAllWindows 字段。
             * @returns {*} BrowserWindow.getAllWindows()[0].webContents.isCurrentlyAudible 的调用结果。
             */
            ({ BrowserWindow }) =>
              BrowserWindow.getAllWindows()[0].webContents.isCurrentlyAudible()
          ),
          true
        );
        await page.evaluate(
          /**
           * 在目标页面或 Electron 上下文中执行 l1Player.pause；跨上下文参数由测试框架序列化传入。
           * 无参数。
           * @returns {*} l1Player.pause 的调用结果。
           */
          () => l1Player.pause()
        );
        await wait(
          page,
          /**
           * 检查页面是否达到所需状态，取得 对 threadPlayer.playing 取反的布尔值；由外层轮询及超时控制重试。
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
        await wait(
          page,
          /**
           * 检查页面是否达到所需状态，执行 threadPlayer.currentHowl.seek；由外层轮询及超时控制重试。
           * 无参数。
           * @returns {*} threadPlayer.playing 且 threadPlayer.currentHowl.seek 的调用结果 是否不小于 20。
           */
          () => threadPlayer.playing && threadPlayer.currentHowl.seek() >= 20
        );
        await page.evaluate(
          /**
           * 在目标页面或 Electron 上下文中执行 l1Player.pause；跨上下文参数由测试框架序列化传入。
           * 无参数。
           * @returns {*} l1Player.pause 的调用结果。
           */
          () => l1Player.pause()
        );
      }
    );
    await check(
      "all themes preserve a single player listener and keyboard binding",
      /**
       * 逐一切换主题，验证播放器监听与键盘绑定没有重复注册；失败交给外层主流程记录。
       * 无参数。
       * @returns {Promise<void>} 异步完成后无返回值；拒绝由调用链处理。
       */
      async () => {
        await app.evaluate(
          /**
           * 在目标页面或 Electron 上下文中执行 BrowserWindow.getAllWindows()[0].showInactive；跨上下文参数由测试框架序列化传入。
           * @param options 解构参数，包含 BrowserWindow（创建或检查 Electron 窗口）；使用 getAllWindows 字段。
           * @returns {*} BrowserWindow.getAllWindows()[0].showInactive 的调用结果。
           */
          ({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].showInactive()
        );
        const listenerCount = await page.evaluate(
          /**
           * 在目标页面或 Electron 上下文中取得 frontPlayerListener.length；跨上下文参数由测试框架序列化传入。
           * 无参数。
           * @returns {*} frontPlayerListener.length。
           */
          () => frontPlayerListener.length
        );
        for (const theme of ["white2", "black2", "black", "white"]) {
          await page.evaluate(
            /**
             * 在目标页面或 Electron 上下文中执行 scope.$apply；跨上下文参数由测试框架序列化传入。
             * @param theme 要启用的主题标识。
             * @returns {void} 无返回值。
             */
            (theme) => {
              const scope = angular
                .element(
                  document.querySelector('[ng-controller="ProfileController"]')
                )
                .scope();
              scope.$apply(
                /**
                 * 测试替身：执行 scope.setTheme，供用例观察调用与状态。
                 * 无参数。
                 * @returns {*} scope.setTheme 的调用结果。
                 */
                () => scope.setTheme(theme)
              );
            },
            theme
          );
          await wait(
            page,
            /**
             * 检查页面是否达到所需状态，执行 document.getElementById().sheet.href.includes；由外层轮询及超时控制重试。
             * @param theme 要启用的主题标识。
             * @returns {boolean} document.getElementById().sheet.href.includes 的布尔判断结果。
             */
            (theme) =>
              document.getElementById("theme-css").sheet?.href?.includes(
                {
                  white: "iparanoid.css",
                  black: "origin.css",
                  white2: "iparanoid2.css",
                  black2: "origin2.css",
                }[theme]
              ),
            theme
          );
          assert.equal(
            await page.evaluate(
              /**
               * 在目标页面或 Electron 上下文中取得 frontPlayerListener.length；跨上下文参数由测试框架序列化传入。
               * 无参数。
               * @returns {*} frontPlayerListener.length。
               */
              () => frontPlayerListener.length
            ),
            listenerCount
          );
          await page.screenshot({
            path: path.join(output, `theme-${theme}.png`),
            timeout: 8000,
            animations: "disabled",
          });
        }
        await page.evaluate(
          /**
           * 在目标页面或 Electron 上下文中执行 l1Player.unmute；跨上下文参数由测试框架序列化传入。
           * 无参数。
           * @returns {*} l1Player.unmute 的调用结果。
           */
          () => l1Player.unmute()
        );
        await page.keyboard.press("m");
        assert.equal(
          await page.evaluate(
            /**
             * 在目标页面或 Electron 上下文中取得 threadPlayer.muted；跨上下文参数由测试框架序列化传入。
             * 无参数。
             * @returns {*} threadPlayer.muted。
             */
            () => threadPlayer.muted
          ),
          true
        );
        await page.keyboard.press("m");
        assert.equal(
          await page.evaluate(
            /**
             * 在目标页面或 Electron 上下文中取得 threadPlayer.muted；跨上下文参数由测试框架序列化传入。
             * 无参数。
             * @returns {*} threadPlayer.muted。
             */
            () => threadPlayer.muted
          ),
          false
        );
      }
    );
    await check(
      "language switching and restart persistence",
      /**
       * 验证语言切换结果和本地持久化；失败交给外层主流程记录。
       * 无参数。
       * @returns {Promise<void>} 异步完成后无返回值；拒绝由调用链处理。
       */
      async () => {
        for (const language of [
          "zh-TC",
          "en-US",
          "fr-FR",
          "ko-KR",
          "pt-BR",
          "zh-CN",
        ]) {
          await page.evaluate(
            /**
             * 在目标页面或 Electron 上下文中执行 angular.element().scope().setLang；跨上下文参数由测试框架序列化传入。
             * @param language 本轮切换或等待恢复的语言代码。
             * @returns {*} angular.element().scope().setLang 的调用结果。
             */
            (language) =>
              angular
                .element(
                  document.querySelector('[ng-controller="ProfileController"]')
                )
                .scope()
                .setLang(language),
            language
          );
          await wait(
            page,
            /**
             * 检查页面是否达到所需状态，执行 localStorage.getObject（"language"）；由外层轮询及超时控制重试。
             * @param language 本轮切换或等待恢复的语言代码。
             * @returns {*} localStorage.getObject 的调用结果 是否严格等于 language 且 i18next.language 是否严格等于 language。
             */
            (language) =>
              localStorage.getObject("language") === language &&
              i18next.language === language,
            language
          );
        }
        await page.evaluate(
          /**
           * 在目标页面或 Electron 上下文中执行 angular.element().scope().setLang（"fr-FR"）；跨上下文参数由测试框架序列化传入。
           * 无参数。
           * @returns {*} angular.element().scope().setLang 的调用结果。
           */
          () =>
            angular
              .element(
                document.querySelector('[ng-controller="ProfileController"]')
              )
              .scope()
              .setLang("fr-FR")
        );
        await wait(
          page,
          /**
           * 检查页面是否达到所需状态，执行 localStorage.getObject（"language"）；由外层轮询及超时控制重试。
           * 无参数。
           * @returns {boolean} localStorage.getObject 的调用结果 是否严格等于 "fr-FR"。
           */
          () => localStorage.getObject("language") === "fr-FR"
        );
        await page.reload();
        await wait(
          page,
          /**
           * 检查页面是否达到所需状态，取得 i18next.language 是否严格等于 "fr-FR" 且 window.l1Player；由外层轮询及超时控制重试。
           * 无参数。
           * @returns {*} i18next.language 是否严格等于 "fr-FR" 且 window.l1Player。
           */
          () => i18next.language === "fr-FR" && window.l1Player
        );
      }
    );
    await check(
      "queue insertion emits one complete snapshot for 1,000 tracks",
      /**
       * 验证千首曲目批量入队只推送一次完整队列快照；失败交给外层主流程记录。
       * 无参数。
       * @returns {Promise<void>} 异步完成后无返回值；拒绝由调用链处理。
       */
      async () => {
        report.queue = await page.evaluate(
          /**
           * 在目标页面或 Electron 上下文中执行 l1Player.clearPlaylist；跨上下文参数由测试框架序列化传入。
           * 无参数。
           * @returns {Object} 包含 snapshots、elapsedMs 的对象。
           */
          () => {
            l1Player.clearPlaylist();
            const snapshots = [];
            const remove = addPlayerListener(
              "front",
              /**
               * 测试替身：执行 snapshots.push，供用例观察调用与状态。
               * @param msg 播放器消息或通知内容；使用 type、data 字段。
               * @returns {void} 无返回值。
               */
              (msg) => {
                if (msg.type === "BG_PLAYER:PLAYLIST")
                  snapshots.push(msg.data.length);
              }
            );
            const started = performance.now();
            l1Player.addTracks(
              Array.from(
                { length: 1000 },
                /**
                 * 测试替身：取得 包含 id、title、source 的对象，供用例观察调用与状态。
                 * @param _ 数组或类数组输入中的当前值；当前函数体未使用，保留调用签名。
                 * @param id 当前条目的零起点索引。
                 * @returns {Object} 包含 id、title、source 的对象。
                 */
                (_, id) => ({
                  id: `netrack_test${id}`,
                  title: `Test ${id}`,
                  source: "netease",
                })
              )
            );
            const elapsedMs = performance.now() - started;
            remove();
            return { snapshots, elapsedMs };
          }
        );
        assert.deepEqual(report.queue.snapshots, [1000]);
        await page.evaluate(
          /**
           * 在目标页面或 Electron 上下文中执行 l1Player.clearPlaylist；跨上下文参数由测试框架序列化传入。
           * 无参数。
           * @returns {*} l1Player.clearPlaylist 的调用结果。
           */
          () => l1Player.clearPlaylist()
        );
      }
    );
    await check(
      "JSON backup round trip and malformed backup rejection",
      /**
       * 验证 JSON 备份导出恢复及格式损坏备份的拒绝行为；失败交给外层主流程记录。
       * 无参数。
       * @returns {Promise<void>} 异步完成后无返回值；拒绝由调用链处理。
       */
      async () => {
        const backup = await page.evaluate(
          /**
           * 在目标页面或 Electron 上下文中更新 scope.downloadFile，执行 localStorage.removeItem（"myplaylist_fixture"）；跨上下文参数由测试框架序列化传入。
           * 无参数。
           * @returns {*} exported。
           */
          () => {
            const scope = angular
              .element(
                document.querySelector('[ng-controller="NavigationController"]')
              )
              .scope();
            let exported;
            const download = scope.downloadFile;
            /**
             * 测试替身：更新 exported，供用例观察调用与状态。
             * @param _name 测试中不读取的下载文件名；当前函数体未使用，保留调用签名。
             * @param _type 测试中不读取的下载类型；当前函数体未使用，保留调用签名。
             * @param content 文件、歌词或备份内容。
             * @returns {void} 无返回值。
             */
            scope.downloadFile = (_name, _type, content) => {
              exported = content;
            };
            scope.backupMySettings();
            scope.downloadFile = download;
            localStorage.removeItem("myplaylist_fixture");
            return exported;
          }
        );
        await page.evaluate(
          /**
           * 在目标页面或 Electron 上下文中执行 angular.element().scope；跨上下文参数由测试框架序列化传入。
           * @param text 待处理的文本。
           * @returns {Promise<void>} 异步完成后无返回值；拒绝由调用链处理。
           */
          async (text) => {
            const scope = angular
              .element(
                document.querySelector('[ng-controller="NavigationController"]')
              )
              .scope();
            scope.importMySettings({
              target: {
                files: [
                  new File([text], "backup.json", { type: "application/json" }),
                ],
              },
            });
          },
          backup
        );
        await wait(
          page,
          /**
           * 检查页面是否达到所需状态，执行 localStorage.getObject（"myplaylist_fixture"）；由外层轮询及超时控制重试。
           * 无参数。
           * @returns {boolean} localStorage.getObject().info.title 是否严格等于 "旧歌单"。
           */
          () =>
            localStorage.getObject("myplaylist_fixture")?.info.title ===
            "旧歌单"
        );
        await page.evaluate(
          /**
           * 在目标页面或 Electron 上下文中执行 angular.element().scope；跨上下文参数由测试框架序列化传入。
           * 无参数。
           * @returns {void} 无返回值。
           */
          () => {
            const scope = angular
              .element(
                document.querySelector('[ng-controller="NavigationController"]')
              )
              .scope();
            scope.importMySettings({ target: { files: [] } });
            scope.importMySettings({
              target: { files: [new File(["null"], "invalid.json")] },
            });
          }
        );
        assert.equal(
          await page.evaluate(
            /**
             * 在目标页面或 Electron 上下文中执行 localStorage.getObject（"myplaylist_fixture"）；跨上下文参数由测试框架序列化传入。
             * 无参数。
             * @returns {*} localStorage.getObject().info.title。
             */
            () => localStorage.getObject("myplaylist_fixture").info.title
          ),
          "旧歌单"
        );
      }
    );
    await check(
      "offline search and playlist failures finish without unhandled errors",
      /**
       * 验证离线搜索与歌单失败能够结束加载且没有未处理异常；失败交给外层主流程记录。
       * 无参数。
       * @returns {Promise<void>} 异步完成后无返回值；拒绝由调用链处理。
       */
      async () => {
        await page.context().setOffline(true);
        await page.evaluate(
          /**
           * 在目标页面或 Electron 上下文中执行 search.$apply；跨上下文参数由测试框架序列化传入。
           * 无参数。
           * @returns {void} 无返回值。
           */
          () => {
            const search = angular
              .element(
                document.querySelector(
                  '[ng-controller="InstantSearchController"]'
                )
              )
              .scope();
            search.$apply(
              /**
               * 测试替身：更新 search.keywords，供用例观察调用与状态。
               * 无参数。
               * @returns {void} 无返回值。
               */
              () => {
                search.keywords = "offline fixture";
              }
            );
            angular
              .element(
                document.querySelector('[ng-controller="PlayListController"]')
              )
              .scope()
              .loadPlaylist();
          }
        );
        await wait(
          page,
          /**
           * 检查页面是否达到所需状态，执行 angular.element().scope；由外层轮询及超时控制重试。
           * 无参数。
           * @returns {*} 对 search.loading 取反的布尔值 且 search.searchError 是否严格等于 "NETWORK" 且 对 playlists.loading 取反的布尔值。
           */
          () => {
            const search = angular
              .element(
                document.querySelector(
                  '[ng-controller="InstantSearchController"]'
                )
              )
              .scope();
            const playlists = angular
              .element(
                document.querySelector('[ng-controller="PlayListController"]')
              )
              .scope();
            return (
              !search.loading &&
              search.searchError === "NETWORK" &&
              !playlists.loading
            );
          },
          null,
          17000
        );
        await page.context().setOffline(false);
      }
    );
    await check(
      "lyrics bridge, text rendering, translation, style and close",
      /**
       * 验证歌词桥、纯文本显示、译文通道、样式更新与窗口关闭；失败交给外层主流程记录。
       * 无参数。
       * @returns {Promise<void>} 异步完成后无返回值；拒绝由调用链处理。
       */
      async () => {
        await page.evaluate(
          /**
           * 在目标页面或 Electron 上下文中执行 listen1Desktop.control（"enable_lyric_floating_window"）；跨上下文参数由测试框架序列化传入。
           * 无参数。
           * @returns {*} listen1Desktop.control 的调用结果。
           */
          () =>
            listen1Desktop.control(
              "enable_lyric_floating_window",
              "div.content { font-size: 22px; }"
            )
        );
        const floating = await app
          .waitForEvent("window", {
            /**
             * 测试替身：取得 candidate 是否不等于 page，供用例观察调用与状态。
             * @param candidate 当前等待的窗口或备用曲目候选。
             * @returns {boolean} candidate 是否不等于 page。
             */
            predicate: (candidate) => candidate !== page,
            timeout: 5000,
          })
          .catch(
            /**
             * 异步操作失败后，执行 app.windows().find。
             * 无参数。
             * @returns {*} 首个匹配条目，未匹配时为 undefined。
             */
            () =>
              app.windows().find(
                /**
                 * 筛选检查 app.windows() 中的条目，candidate 是否不等于 page。
                 * @param candidate 来自 app.windows() 的当前条目。
                 * @returns {boolean} candidate 是否不等于 page。
                 */
                (candidate) => candidate !== page
              )
          );
        assert.ok(floating);
        await floating.waitForLoadState("domcontentloaded");
        await page.evaluate(
          /**
           * 在目标页面或 Electron 上下文中执行 listen1Desktop.setLyric；跨上下文参数由测试框架序列化传入。
           * 无参数。
           * @returns {*} listen1Desktop.setLyric 的调用结果。
           */
          () =>
            listen1Desktop.setLyric({
              lyric: "<b>原文</b>",
              tlyric: "translation",
            })
        );
        await wait(
          floating,
          /**
           * 检查页面是否达到所需状态，执行 document.body.textContent.includes（"<b>原文</b>"）；由外层轮询及超时控制重试。
           * 无参数。
           * @returns {*} document.body.textContent.includes 的布尔判断结果 且 document.body.textContent.includes 的布尔判断结果。
           */
          () =>
            document.body.textContent.includes("<b>原文</b>") &&
            document.body.textContent.includes("translation")
        );
        assert.equal(await floating.locator("b").count(), 0);
        await floating.evaluate(
          /**
           * 在目标页面或 Electron 上下文中执行 window.api.send（"control"）；跨上下文参数由测试框架序列化传入。
           * 无参数。
           * @returns {*} window.api.send 的调用结果。
           */
          () => window.api.send("control", "float_window_ignore_mouse_event")
        );
        await page.evaluate(
          /**
           * 在目标页面或 Electron 上下文中执行 listen1Desktop.control（"disable_lyric_floating_window"）；跨上下文参数由测试框架序列化传入。
           * 无参数。
           * @returns {*} listen1Desktop.control 的调用结果。
           */
          () => listen1Desktop.control("disable_lyric_floating_window")
        );
      }
    );
    await check(
      "direct/system/custom proxy settings and close hides window",
      /**
       * 验证直连、系统和自定义代理设置，以及关闭主窗口时隐藏的行为；失败交给外层主流程记录。
       * 无参数。
       * @returns {Promise<void>} 异步完成后无返回值；拒绝由调用链处理。
       */
      async () => {
        for (const config of [
          { mode: "system" },
          { proxyRules: "http://localhost:7890" },
          { mode: "direct" },
        ])
          await page.evaluate(
            /**
             * 在目标页面或 Electron 上下文中执行 listen1Desktop.control（"update_proxy_config"）；跨上下文参数由测试框架序列化传入。
             * @param config 本次请求或设置的配置对象。
             * @returns {*} listen1Desktop.control 的调用结果。
             */
            (config) => listen1Desktop.control("update_proxy_config", config),
            config
          );
        await page.evaluate(
          /**
           * 在目标页面或 Electron 上下文中执行 listen1Desktop.control（"window_close"）；跨上下文参数由测试框架序列化传入。
           * 无参数。
           * @returns {*} listen1Desktop.control 的调用结果。
           */
          () => listen1Desktop.control("window_close")
        );
        assert.equal(
          await app.evaluate(
            /**
             * 在目标页面或 Electron 上下文中执行 BrowserWindow.getAllWindows().find().isVisible；跨上下文参数由测试框架序列化传入。
             * @param options 解构参数，包含 BrowserWindow（创建或检查 Electron 窗口）；使用 getAllWindows 字段。
             * @returns {*} BrowserWindow.getAllWindows().find().isVisible 的调用结果。
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
                .isVisible()
          ),
          false
        );
      }
    );
    await check(
      "second instance exits and restores the existing window",
      /**
       * 验证第二实例退出并唤回既有主窗口；失败交给外层主流程记录。
       * 无参数。
       * @returns {Promise<void>} 异步完成后无返回值；拒绝由调用链处理。
       */
      async () => {
        const second = spawn(
          process.env.LISTEN1_TEST_EXE || require("electron"),
          process.env.LISTEN1_TEST_EXE
            ? []
            : [path.join(__dirname, "electron-entry.cjs")],
          {
            env: { ...process.env, LISTEN1_TEST_USER_DATA: profile },
            windowsHide: true,
            stdio: "ignore",
          }
        );
        const code = await new Promise(
          /**
           * 启动当前异步操作，执行 setTimeout，由 resolve／reject 决定 Promise 的结果。
           * @param resolve 用于兑现当前 Promise 的函数。
           * @param reject 用于拒绝当前 Promise 的函数。
           * @returns {void} 无返回值。
           */
          (resolve, reject) => {
            const timer = setTimeout(
              /**
               * 在定时器或动画帧触发时，调用 reject，依次传入 新建的 Error 实例。
               * 无参数。
               * @returns {void} 无返回值。
               */
              () => {
                second.kill();
                reject(new Error("Second instance did not exit"));
              },
              10000
            );
            second.once(
              "error",
              /**
               * 响应 "error" 事件，调用 reject，依次传入 error。
               * @param error 被捕获或传入的异常。
               * @returns {void} 无返回值。
               */
              (error) => {
                clearTimeout(timer);
                reject(error);
              }
            );
            second.once(
              "exit",
              /**
               * 响应 "exit" 事件，调用 resolve，依次传入 code。
               * @param code 子进程退出码，信号终止时可能为 null。
               * @returns {void} 无返回值。
               */
              (code) => {
                clearTimeout(timer);
                resolve(code);
              }
            );
          }
        );
        assert.equal(code, 0);
        assert.equal(
          await app.evaluate(
            /**
             * 在目标页面或 Electron 上下文中执行 BrowserWindow.getAllWindows().find().isVisible；跨上下文参数由测试框架序列化传入。
             * @param options 解构参数，包含 BrowserWindow（创建或检查 Electron 窗口）；使用 getAllWindows 字段。
             * @returns {*} BrowserWindow.getAllWindows().find().isVisible 的调用结果。
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
                .isVisible()
          ),
          true
        );
      }
    );
    await app.close();
    app = await launch();
    page = await app.firstWindow();
    await wait(
      page,
      /**
       * 检查页面是否达到所需状态，取得 window.l1Player 且 i18next.language 是否严格等于 "fr-FR"；由外层轮询及超时控制重试。
       * 无参数。
       * @returns {*} window.l1Player 且 i18next.language 是否严格等于 "fr-FR"。
       */
      () => window.l1Player && i18next.language === "fr-FR"
    );
    assert.equal(
      JSON.parse(fs.readFileSync(path.join(profile, "config.json"), "utf8"))
        .proxyConfig.mode,
      "direct"
    );
    report.checks.push({
      name: "application restart and desktop config persistence",
      status: "passed",
    });
    assert.deepEqual(report.errors, []);
  } finally {
    if (app) await app.close();
    fs.writeFileSync(
      path.join(output, "report.json"),
      JSON.stringify(report, null, 2)
    );
  }
}
main().catch(
  /**
   * 异步操作失败后，更新 report.failure、process.exitCode，执行 fs.writeFileSync。
   * @param error 被捕获或传入的异常；使用 stack 字段。
   * @returns {void} 无返回值。
   */
  (error) => {
    report.failure = error.stack;
    fs.writeFileSync(
      path.join(output, "report.json"),
      JSON.stringify(report, null, 2)
    );
    console.error(error);
    process.exitCode = 1;
  }
);
