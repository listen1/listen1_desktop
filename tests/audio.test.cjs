/**
 * 文件职责：使用注入的文件与标签读取替身验证本地歌词、编码容错和损坏音频的回退行为。
 *
 * 文件级定义：
 * - test：从 node:test 引入，用于注册 Node 行为测试。
 * - assert：从 node:assert/strict 引入，用于断言测试结果。
 * - fs：从 node:fs 引入，用于文件读写与目录操作。
 * - vm：从 node:vm 引入，用于执行带受控全局对象的测试源码。
 * - path：从 node:path 引入，用于路径解析和拼接。
 * - loadAudio：在虚拟机中注入文件、编码和标签读取替身，装载音频工具并返回待测接口。
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
 * 在虚拟机中注入文件、编码和标签读取替身，装载音频工具并返回待测接口。
 * @param options 解构参数，包含 readFile（异步读取歌词等本地文件）、parseFile（注入的音频标签解析替身）、detect（探测歌词字节编码；默认值为 供后续调用的函数）。
 * @returns {Object} 包含 展开字段、readAudioTags 的对象。
 */
function loadAudio({
  readFile,
  parseFile,
  /**
   * 调用方未提供可选回调时，取得 "utf-8"。
   * 无参数。
   * @returns {string} "utf-8"。
   */
  detect = () => "utf-8",
}) {
  const module = { exports: {} };
  const context = vm.createContext({
    module,
    exports: module.exports,
    TextDecoder,
    /**
     * 测试替身：执行 require，供用例观察调用与状态。
     * @param name 待查找或注册的名称。
     * @returns {*} 根据当前分支返回相应结果，可能的形式为 Object、*。
     */
    require(name) {
      if (name === "music-metadata") return { parseFile };
      if (name === "fs" || name === "node:fs")
        return {
          /**
           * 测试替身：取得 true，供用例观察调用与状态。
           * 无参数。
           * @returns {boolean} true。
           */
          existsSync: () => true,
        };
      if (name === "fs/promises" || name === "node:fs/promises")
        return { readFile };
      if (name === "chardet") return { detect };
      return require(name);
    },
  });
  vm.runInContext(
    fs.readFileSync(path.join(__dirname, "../app/functions.js"), "utf8"),
    context
  );
  return {
    ...module.exports,
    /**
     * 测试替身：执行 module.exports.readAudioTags，供用例观察调用与状态。
     * @param file 待读取或校验的文件路径。
     * @returns {*} module.exports.readAudioTags 的调用结果。
     */
    readAudioTags: (file) => module.exports.readAudioTags(file, parseFile),
  };
}

test("unreadable sidecar keeps successfully read audio tags" /**
 * 验证同名歌词文件不可读取时仍保留已解析的音频标签；断言失败由测试运行器记录。
 * 无参数。
 * @returns {Promise<void>} 异步完成后无返回值；拒绝由调用链处理。
 */, async () => {
  const audio = loadAudio({
    /**
     * 测试替身：取得 包含 common 的对象，供用例观察调用与状态。
     * 无参数。
     * @returns {Promise<Object>} 异步完成后得到 包含 common 的对象。
     */
    parseFile: async () => ({
      common: { title: "Title", artist: "Artist", album: "Album" },
    }),
    /**
     * 测试替身：执行 Error（"EACCES"），供用例观察调用与状态。
     * 无参数。
     * @returns {Promise<void>} 异步完成后无返回值；拒绝由调用链处理。
     */
    readFile: async () => {
      throw Error("EACCES");
    },
  });
  const result = await audio.readAudioTags("C:/synthetic/song.mp3");
  assert.equal(result.common.title, "Title");
  assert.equal(result.common.artist, "Artist");
  assert.equal(result.common.album, "Album");
});

test("broken audio returns a usable filename fallback" /**
 * 验证损坏音频回退到文件名标题，并返回可供界面使用的结果；断言失败由测试运行器记录。
 * 无参数。
 * @returns {Promise<void>} 异步完成后无返回值；拒绝由调用链处理。
 */, async () => {
  const audio = loadAudio({
    /**
     * 测试替身：执行 Error（"Invalid audio"），供用例观察调用与状态。
     * 无参数。
     * @returns {Promise<void>} 异步完成后无返回值；拒绝由调用链处理。
     */
    parseFile: async () => {
      throw Error("Invalid audio");
    },
    /**
     * 测试替身：执行 Buffer.alloc，供用例观察调用与状态。
     * 无参数。
     * @returns {Promise<*>} 异步完成后得到 Buffer.alloc 的调用结果。
     */
    readFile: async () => Buffer.alloc(0),
  });
  const result = await audio.readAudioTags("C:/synthetic/song.mp3");
  assert.equal(result.common.title, "song");
  assert.ok(result.error);
});

test("structured millisecond lyrics are converted without losing old text lyrics" /**
 * 验证毫秒时间戳歌词转换为 LRC，同时保留旧文本歌词；断言失败由测试运行器记录。
 * 无参数。
 * @returns {void} 无返回值。
 */, () => {
  const { normalizeLyrics } = loadAudio({});
  const lines = normalizeLyrics([
    "[00:01.00]old",
    {
      timeStampFormat: 2,
      syncText: [
        { timestamp: 1250, text: "中文" },
        { timestamp: 62000, text: "next" },
      ],
    },
    { text: "plain" },
  ]);
  assert.equal(lines[0], "[00:01.00]old");
  assert.equal(lines[1], "[00:01.25]中文\n[01:02.00]next");
  assert.equal(lines[2], "plain");
});

test("invalid sidecar encoding does not discard valid tags" /**
 * 验证歌词编码不受支持时不会丢失有效音频标签；断言失败由测试运行器记录。
 * 无参数。
 * @returns {Promise<void>} 异步完成后无返回值；拒绝由调用链处理。
 */, async () => {
  const audio = loadAudio({
    /**
     * 测试替身：取得 包含 common 的对象，供用例观察调用与状态。
     * 无参数。
     * @returns {Promise<Object>} 异步完成后得到 包含 common 的对象。
     */
    parseFile: async () => ({ common: { title: "still valid" } }),
    /**
     * 测试替身：执行 Buffer.from（"lyrics"），供用例观察调用与状态。
     * 无参数。
     * @returns {Promise<*>} 异步完成后得到 Buffer.from 的调用结果。
     */
    readFile: async () => Buffer.from("lyrics"),
    /**
     * 测试替身：取得 "unsupported-encoding"，供用例观察调用与状态。
     * 无参数。
     * @returns {string} "unsupported-encoding"。
     */
    detect: () => "unsupported-encoding",
  });
  assert.equal(
    (await audio.readAudioTags("C:/synthetic/song.mp3")).common.title,
    "still valid"
  );
});
