/**
 * 文件职责：在虚拟机中测量千首歌曲批量入队的耗时、消息数和快照大小，对比基线与现有播放核心。
 *
 * 文件级定义：
 * - fs：从 node:fs 引入，用于文件读写与目录操作。
 * - path：从 node:path 引入，用于路径解析和拼接。
 * - vm：从 node:vm 引入，用于执行带受控全局对象的测试源码。
 * - root：由脚本目录解析出的项目根目录。
 * - measure：在带消息计数替身的虚拟机中执行播放器，追加千首曲目并记录耗时及快照大小。
 * - report：收集本轮测量或测试结果的可序列化报告对象。
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
 * vm：从 node:vm 引入，用于执行带受控全局对象的测试源码；类型为 typeof import("node:vm")。
 * @type {typeof import("node:vm")}
 */
const vm = require("node:vm");
/**
 * root：由脚本目录解析出的项目根目录；类型为 string。
 * @type {string}
 */
const root = path.resolve(__dirname, "..");
/**
 * 在带消息计数替身的虚拟机中执行播放器，追加千首曲目并记录耗时及快照大小。
 * @param source 音乐来源名称。
 * @returns {Object} 包含 ms、events、snapshots、records、serializedCharacters 的对象。
 */
function measure(source) {
  let events = 0,
    snapshots = 0,
    records = 0,
    bytes = 0;
  const context = vm.createContext({
    window: {},
    navigator: {},
    /**
     * 保留的空回调，此处无需继续处理或改变状态。
     * 无参数。
     * @returns {void} 无返回值。
     */
    setInterval() {},
    /**
     * 保留的空回调，此处无需继续处理或改变状态。
     * 无参数。
     * @returns {void} 无返回值。
     */
    clearInterval() {},
    setTimeout,
    clearTimeout,
    Howler: {
      /**
       * 测量替身：固定返回满音量，避免测量依赖真实音频设备。
       * 无参数。
       * @returns {number} 1。
       */
      volume: () => 1,
      /**
       * 保留的空回调，此处无需继续处理或改变状态。
       * 无参数。
       * @returns {void} 无返回值。
       */
      unload() {},
    },
    /**
     * 统计消息数量；队列事件另累计快照数、曲目数及 JSON 字节长度。
     * @param _mode 测试中不读取的播放器消息目标模式；当前函数体未使用，保留调用签名。
     * @param message 待转发的消息或文本；使用 type、data 字段。
     * @returns {void} 无返回值。
     */
    playerSendMessage(_mode, message) {
      events += 1;
      if (message.type === "BG_PLAYER:PLAYLIST") {
        snapshots += 1;
        records += message.data.length;
        bytes += JSON.stringify(message.data).length;
      }
    },
  });
  vm.runInContext(fs.readFileSync(source, "utf8"), context);
  events = 0;
  const tracks = Array.from(
    { length: 1000 },
    /**
     * 进入此回调后，取得 包含 id、title、artist、source 的对象。
     * @param _ 数组或类数组输入中的当前值；当前函数体未使用，保留调用签名。
     * @param i 当前条目的零起点索引。
     * @returns {Object} 包含 id、title、artist、source 的对象。
     */
    (_, i) => ({
      id: `netrack_${i}`,
      title: `Synthetic ${i}`,
      artist: "Fixture",
      source: "netease",
    })
  );
  const start = performance.now();
  context.window.threadPlayer.appendAudioList(tracks);
  return {
    ms: performance.now() - start,
    events,
    snapshots,
    records,
    serializedCharacters: bytes,
  };
}
/**
 * report：收集本轮测量或测试结果的可序列化报告对象；类型为 Object。
 * @type {Object}
 */
const report = {
  date: new Date().toISOString(),
  method:
    "Same Node process; player core plus JSON serialization. Excludes DOM rendering and disk writes. Five repetitions; no OS cache flush.",
  before: [],
  after: [],
};
for (let i = 0; i < 5; i += 1) {
  report.before.push(
    measure(
      path.join(
        root,
        "dist/maintenance/baseline/app/listen1_chrome_extension/js/player_thread.js"
      )
    )
  );
  report.after.push(
    measure(path.join(root, "app/listen1_chrome_extension/js/player_thread.js"))
  );
}
fs.mkdirSync(path.join(root, "docs/maintenance"), { recursive: true });
fs.writeFileSync(
  path.join(root, "docs/maintenance/queue-performance.json"),
  JSON.stringify(report, null, 2) + "\n"
);
console.log(JSON.stringify(report));
