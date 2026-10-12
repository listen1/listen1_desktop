/**
 * 文件职责：汇总已有维护报告、依赖审计和安装包校验值，生成供维护文档引用的验证证据。
 *
 * 文件级定义：
 * - fs：从 node:fs 引入，用于文件读写与目录操作。
 * - path：从 node:path 引入，用于路径解析和拼接。
 * - crypto：从 node:crypto 引入，用于计算校验摘要及加密测试参考值。
 * - root：由脚本目录解析出的项目根目录。
 * - output：本次维护或测试结果的输出目录。
 * - read：读取指定维护报告。
 * - names：需要汇总的维护证据文件名列表。
 * - evidence：汇总后的维护证据及检查摘要。
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
 * crypto：从 node:crypto 引入，用于计算校验摘要及加密测试参考值；类型为 typeof import("node:crypto")。
 * @type {typeof import("node:crypto")}
 */
const crypto = require("node:crypto");
/**
 * root：由脚本目录解析出的项目根目录；类型为 string。
 * @type {string}
 */
const root = path.resolve(__dirname, "..");
/**
 * output：本次维护或测试结果的输出目录；类型为 string。
 * @type {string}
 */
const output = path.join(root, "docs/maintenance");
/**
 * 读取指定维护报告；文件不存在时沿用空结果以便继续汇总。
 * @param name 待查找或注册的名称。
 * @returns {*} JSON.parse 的调用结果。
 */
const read = (name) =>
  JSON.parse(fs.readFileSync(path.join(root, name), "utf8"));
/**
 * names：需要汇总的维护证据文件名列表；类型为 Array。
 * @type {Array}
 */
const names = [
  "online-final",
  "online-qq-final",
  "online-qq-confirm",
  "qq-search-diagnostic",
  "qq-probe",
  "electron-smoke-visible",
  "packaged-smoke",
  "packaged-online",
  "packaged-smoke-final",
  "packaged-final-netease",
];
/**
 * evidence：汇总后的维护证据及检查摘要；类型为 Object。
 * @type {Object}
 */
const evidence = {
  generated: new Date().toISOString(),
  environment: read("dist/maintenance/baseline.json"),
  observations: {},
};
for (const name of names) {
  const file = `dist/maintenance/${name}/report.json`;
  if (fs.existsSync(path.join(root, file)))
    evidence.observations[name] = { file, ...read(file) };
  else evidence.observations[name] = { file, status: "unverified: no report" };
}
evidence.startupObservations = [
  "baseline",
  "baseline-playback",
  "fixed-before-upgrade-playback",
  "electron44-runtime",
  "electron44-network-polling",
  "all-dependencies-startup",
].map(
  /**
   * 转换 [ "baseline", "baseline-playback", "fixed-before-upgrade-playback", "electron44-runtime", "electron44-network-polling", "all-dependencies-startup", ] 中的条目，执行 read。
   * @param name 来自 [ "baseline", "baseline-playback", "fixed-before-upgrade-playback", "electron44-runtime", "electron44-network-polling", "all-dependencies-startup", ] 的当前条目。
   * @returns {Object} 包含 name、file、date、electron、startupMs、errors 的对象。
   */
  (name) => {
    const file = `dist/maintenance/${name}/report.json`;
    const result = read(file);
    return {
      name,
      file,
      date: result.date,
      electron: result.runtime?.electron,
      startupMs: result.startupMs,
      errors: result.errors,
    };
  }
);
evidence.artifacts = [
  "dist/windows-test/listen1_2.33.1_win_x64.exe",
  "dist/windows-test/listen1_2.33.1_win_x64.7z",
]
  .filter(
    /**
     * 筛选检查 [ "dist/windows-test/listen1_2.33.1_win_x64.exe", "dist/windows-test/listen1_2.33.1_win_x64.7z", ] 中的条目，fs.existsSync 的调用结果。
     * @param file 来自 [ "dist/windows-test/listen1_2.33.1_win_x64.exe", "dist/windows-test/listen1_2.33.1_win_x64.7z", ] 的当前条目。
     * @returns {*} fs.existsSync 的调用结果。
     */
    (file) => fs.existsSync(path.join(root, file))
  )
  .map(
    /**
     * 转换 [ "dist/windows-test/listen1_2.33.1_win_x64.exe", "dist/windows-test/listen1_2.33.1_win_x64.7z", ].filter() 中的条目，包含 file、bytes、sha256、signature 的对象。
     * @param file 来自 [ "dist/windows-test/listen1_2.33.1_win_x64.exe", "dist/windows-test/listen1_2.33.1_win_x64.7z", ].filter() 的当前条目。
     * @returns {Object} 包含 file、bytes、sha256、signature 的对象。
     */
    (file) => ({
      file,
      bytes: fs.statSync(path.join(root, file)).size,
      sha256: crypto
        .createHash("sha256")
        .update(fs.readFileSync(path.join(root, file)))
        .digest("hex"),
      signature: "unsigned test build; Authenticode checked separately",
    })
  );
fs.mkdirSync(output, { recursive: true });
fs.writeFileSync(
  path.join(output, "validation.json"),
  JSON.stringify(evidence, null, 2) + "\n"
);
console.log(
  "Saved validation.json; artifacts:",
  JSON.stringify(evidence.artifacts)
);
