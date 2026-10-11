/**
 * 文件职责：用 Electron 替身验证 IPC 白名单、页面来源、本地导入并发限制和平台请求头。
 *
 * 文件级定义：
 * - test：从 node:test 引入，用于注册 Node 行为测试。
 * - assert：从 node:assert/strict 引入，用于断言测试结果。
 * - fs：从 node:fs 引入，用于文件读写与目录操作。
 * - vm：从 node:vm 引入，用于执行带受控全局对象的测试源码。
 * - path：从 node:path 引入，用于路径解析和拼接。
 * - pathToFileURL：从 node:url 引入，用于把真实路径转换为编码后的文件 URL。
 * - applyPlatformHeaders：从 ../app/request-headers 引入，用于按来源处理音乐平台请求头。
 * - harness：创建窗口、IPC、对话框和标签读取替身，装载桌面 API 并暴露处理器及并发统计供断言。
 */
/**
 * test：从 node:test 引入，用于注册 Node 行为测试；类型为 typeof import("node:test")。
 * @type {typeof import("node:test")}
 */
const test = require("node:test");
/**
 * assert：从 node:assert/strict 引入，用于断言测试结果；类型为 typeof import("node:assert/strict")。
 * @type {typeof import("node:assert/strict")}
 */
const assert = require("node:assert/strict");
/**
 * fs：从 node:fs 引入，用于文件读写与目录操作；类型为 typeof import("node:fs")。
 * @type {typeof import("node:fs")}
 */
const fs = require("node:fs");
/**
 * vm：从 node:vm 引入，用于执行带受控全局对象的测试源码；类型为 typeof import("node:vm")。
 * @type {typeof import("node:vm")}
 */
const vm = require("node:vm");
/**
 * path：从 node:path 引入，用于路径解析和拼接；类型为 typeof import("node:path")。
 * @type {typeof import("node:path")}
 */
const path = require("node:path");
/**
 * pathToFileURL：从 node:url 引入，用于把真实路径转换为编码后的文件 URL；类型为 typeof import("node:url").pathToFileURL。
 */
const { pathToFileURL } = require("node:url");
/**
 * applyPlatformHeaders：从 ../app/request-headers 引入，用于按来源处理音乐平台请求头；类型为 typeof import("../app/request-headers").applyPlatformHeaders。
 */
const { applyPlatformHeaders } = require("../app/request-headers");

/**
 * 创建窗口、IPC、对话框和标签读取替身，装载桌面 API 并暴露处理器及并发统计供断言。
 * 无参数。
 * @returns {Object} 包含 handlers、event、api、maximum 的对象。
 */
function harness(options = {}) {
  const handlers = {},
    directory = path.resolve(__dirname, "../app");
  const frame = {
    url: pathToFileURL(
      path.join(directory, "listen1_chrome_extension/listen1.html")
    ).href,
  };
  const sender = { mainFrame: frame },
    window = {
      webContents: sender,
      /**
       * 测试替身：取得 false，供用例观察调用与状态。
       * 无参数。
       * @returns {boolean} false。
       */
      isDestroyed: () => false,
    };
  const event = { sender, senderFrame: frame };
  let active = 0,
    maximum = 0;
  const context = {
    module: { exports: {} },
    __dirname: directory,
    URL,
    /**
     * 测试替身：执行 require，供用例观察调用与状态。
     * @param name 待查找或注册的名称。
     * @returns {*} 包含 ipcMain、dialog、session 的对象；其他分支返回 包含 readAudioTags 的对象；其他分支返回 require 的调用结果。
     */
    require(name) {
      if (name === "electron")
        return {
          ipcMain: {
            /**
             * 测试替身：更新 handlers[name]，供用例观察调用与状态。
             * @param name 待查找或注册的名称。
             * @param fn 接收处理结果的回调函数。
             * @returns {void} 无返回值。
             */
            handle: (name, fn) => {
              handlers[name] = fn;
            },
          },
          dialog: {
            /**
             * 测试替身：执行 Array.from，供用例观察调用与状态。
             * 无参数。
             * @returns {Promise<Object>} 异步完成后得到 包含 canceled、filePaths 的对象。
             */
            showOpenDialog: async () =>
              options.selection || {
                canceled: false,
                filePaths: Array.from(
                  { length: 17 },
                  /**
                   * 测试替身：取得 按当前字段拼接的字符串，供用例观察调用与状态。
                   * @param _ 数组或类数组输入中的当前值；当前函数体未使用，保留调用签名。
                   * @param i 当前条目的零起点索引。
                   * @returns {string} 按当前字段拼接的字符串。
                   */
                  (_, i) => `C:/fixtures/中文 #${i}.wav`
                ),
              },
          },
          session: {
            defaultSession: {
              cookies: {
                /**
                 * 测试替身：取得 空数组，供用例观察调用与状态。
                 * 无参数。
                 * @returns {Promise<Array>} 异步完成后得到 空数组。
                 */
                get: async () => [],
              },
            },
          },
        };
      if (name === "./functions")
        return {
          readLocalLyric:
            options.readLocalLyric || (async () => "[00:01]fixture lyric"),
          /**
           * 测试替身：更新 active、maximum，执行 Math.max，供用例观察调用与状态。
           * 无参数。
           * @returns {Promise<Object>} 异步完成后得到 包含 common 的对象。
           */
          readAudioTags: async () => {
            active += 1;
            maximum = Math.max(maximum, active);
            await new Promise(
              /**
               * 启动当前异步操作，执行 setTimeout，由 resolve／reject 决定 Promise 的结果。
               * @param resolve 用于兑现当前 Promise 的函数。
               * @returns {*} setTimeout 的调用结果。
               */
              (resolve) => setTimeout(resolve, 3)
            );
            active -= 1;
            return { common: { title: "fixture" } };
          },
        };
      return require(name.startsWith("./") ? path.join(directory, name) : name);
    },
  };
  vm.runInNewContext(
    fs.readFileSync(path.join(directory, "desktop-api.js"), "utf8"),
    context
  );
  const api = context.module.exports.createDesktopApi({
    /**
     * 测试替身：取得 window，供用例观察调用与状态。
     * 无参数。
     * @returns {*} window。
     */
    getMainWindow: () => window,
    /**
     * 测试替身：取得 null，供用例观察调用与状态。
     * 无参数。
     * @returns {null} null。
     */
    getFloatingWindow: () => null,
  });
  return {
    handlers,
    event,
    api,
    /**
     * 测试替身：取得 maximum，供用例观察调用与状态。
     * 无参数。
     * @returns {*} maximum。
     */
    maximum: () => maximum,
  };
}

test("desktop methods reject other windows, subframes, invalid URLs and controls" /**
 * 验证桌面接口拒绝其他窗口、子 frame、非法地址和越权控制操作；断言失败由测试运行器记录。
 * 无参数。
 * @returns {Promise<void>} 异步完成后无返回值；拒绝由调用链处理。
 */, async () => {
  const { api, handlers, event } = harness();
  assert.equal(api.isMain(event), true);
  for (const channel of [
    "prepareAudioSource",
    "readAudioSource",
    "cancelAudioPreparation",
    "releaseAudioSource",
    "importLocalCover",
    "localCoverUrl",
    "retainLocalCover",
    "releaseLocalCover",
    "inspectAudioSource",
    "cancelAudioInspection",
  ]) {
    await assert.rejects(
      handlers[`desktop:${channel}`]({ ...event, sender: {} }, {}),
      /Untrusted/
    );
    await assert.rejects(
      handlers[`desktop:${channel}`](
        { ...event, senderFrame: { ...event.senderFrame } },
        {}
      ),
      /Untrusted/
    );
  }
  assert.equal(
    api.isMain({ ...event, senderFrame: { ...event.senderFrame } }),
    false
  );
  assert.equal(api.validControl(event, "arbitrary", {}), false);
  assert.equal(
    api.validControl(
      event,
      "update_lyric_floating_window_css",
      "@import url(https://invalid/)"
    ),
    false
  );
  await assert.rejects(
    handlers["desktop:cookieGet"]({ ...event, sender: {} }, {}),
    /Untrusted/
  );
  await assert.rejects(
    handlers["desktop:cookieGet"](event, {
      url: "https://qq.com.evil.invalid",
      name: "test",
    }),
    /Invalid cookie/
  );
  await assert.rejects(
    handlers["desktop:openLogin"](event, "file:///C:/test.html"),
    /Unsupported/
  );
});

test("local import limits metadata concurrency to four and returns encoded file URLs" /**
 * 验证本地标签读取并发不超过四个，并正确编码含特殊字符的文件 URL；断言失败由测试运行器记录。
 * 无参数。
 * @returns {Promise<void>} 异步完成后无返回值；拒绝由调用链处理。
 */, async () => {
  const { handlers, event, maximum } = harness();
  const result = await handlers["desktop:importLocalMusic"](event);
  assert.equal(maximum(), 4);
  assert.equal(result.tracks.length, 17);
  assert.match(result.tracks[0].sound_url, /%23/);
  assert.equal(result.tracks[0].id, "lmtrack_C:/fixtures/中文 #0.wav");
  assert.equal(result.tracks[0].title, "中文 #0");
});

test("LRC import uses a single-file dialog and rejects untrusted frames", async () => {
  const { handlers, event } = harness({
    selection: {
      canceled: false,
      filePaths: ["C:/fixtures/other-name.lrc"],
    },
  });
  const result = await handlers["desktop:importLocalLyric"](event);
  assert.equal(result.lyric, "[00:01]fixture lyric");
  assert.equal(result.fileName, "other-name.lrc");
  assert.equal(result.cancelled, false);
  await assert.rejects(
    handlers["desktop:importLocalLyric"]({ ...event, senderFrame: {} }),
    /Untrusted/
  );
});

test("LRC import cancellation and read errors return safe results without file paths", async () => {
  let reads = 0;
  const cancelled = harness({
    selection: { canceled: true },
    readLocalLyric: async () => {
      reads += 1;
    },
  });
  assert.equal(
    (await cancelled.handlers["desktop:importLocalLyric"](cancelled.event))
      .cancelled,
    true
  );
  assert.equal(reads, 0);
  const failed = harness({
    selection: { canceled: false, filePaths: ["C:/private/song.lrc"] },
    readLocalLyric: async () => {
      throw Object.assign(new Error("C:/private/song.lrc"), {
        code: "INVALID_UTF8",
      });
    },
  });
  const result = await failed.handlers["desktop:importLocalLyric"](
    failed.event
  );
  assert.equal(result.error.code, "INVALID_UTF8");
  assert.equal(JSON.stringify(result).includes("private"), false);
});

test("platform headers handle Electron objects case-insensitively and use a valid Origin" /**
 * 验证请求头名称大小写兼容及 Origin 的合法格式；断言失败由测试运行器记录。
 * 无参数。
 * @returns {void} 无返回值。
 */, () => {
  const details = {
    url: "https://u.y.qq.com/cgi-bin/musicu.fcg",
    requestHeaders: { origin: "null", referer: "file://app" },
  };
  applyPlatformHeaders(details);
  assert.equal(details.requestHeaders.Origin, "https://y.qq.com");
  assert.equal(details.requestHeaders.Referer, "https://y.qq.com/");
  assert.equal(Object.keys(details.requestHeaders).length, 2);
  const unrelated = {
    url: "https://example.invalid/",
    requestHeaders: { Accept: "text/plain" },
  };
  applyPlatformHeaders(unrelated);
  assert.deepEqual(unrelated.requestHeaders, { Accept: "text/plain" });
});
