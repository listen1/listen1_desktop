/**
 * 文件职责：对比三个依赖层的锁文件快照与现状，查询版本和审计信息并输出维护清单；运行时会写入维护报告。
 *
 * 文件级定义：
 * - fs：从 node:fs 引入，用于文件读写与目录操作。
 * - path：从 node:path 引入，用于路径解析和拼接。
 * - cp：从 node:child_process 引入，用于启动外部维护命令。
 * - root：由脚本目录解析出的项目根目录。
 * - output：本次维护或测试结果的输出目录。
 * - baseline：用于比较的原始维护快照目录。
 * - layers：主仓库、桌面运行包和共享播放器三个依赖层。
 * - read：读取指定 UTF-8 JSON 文件并解析为对象。
 * - packages：兼容新旧锁文件结构，提取各安装位置的包名、版本及依赖信息。
 * - main：对比三个依赖层的锁文件快照与现状，查询版本和审计信息并输出维护清单。
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
 * cp：从 node:child_process 引入，用于启动外部维护命令；类型为 typeof import("node:child_process")。
 * @type {typeof import("node:child_process")}
 */
const cp = require("node:child_process");
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
 * baseline：用于比较的原始维护快照目录；类型为 string。
 * @type {string}
 */
const baseline = path.join(root, "dist/maintenance/baseline");
/**
 * layers：主仓库、桌面运行包和共享播放器三个依赖层；类型为 Array。
 * @type {Array}
 */
const layers = [".", "app", "app/listen1_chrome_extension"];
/**
 * 读取指定 UTF-8 JSON 文件并解析为对象。
 * @param file 待读取或校验的文件路径。
 * @returns {*} JSON.parse 的调用结果。
 */
const read = (file) =>
  JSON.parse(fs.readFileSync(file, "utf8").replace(/^\uFEFF/, ""));
/**
 * 兼容新旧锁文件结构，提取各安装位置的包名、版本及依赖信息。
 * @param lock 待检查的依赖锁文件对象；使用 packages、dependencies 字段。
 * @returns {Array} 逐项转换后的数组；其他分支返回 整理后的结果 result。
 */
function packages(lock) {
  if (lock.packages)
    return Object.entries(lock.packages)
      .filter(
        /**
         * 筛选检查 Object.entries() 中的条目，key。
         * @param options 来自 Object.entries() 的当前条目；解构参数，包含 key（索引、配置或字段名称）。
         * @returns {*} key。
         */
        ([key]) => key
      )
      .map(
        /**
         * 转换 Object.entries().filter() 中的条目，包含 name、location、展开字段 的对象。
         * @param options 来自 Object.entries().filter() 的当前条目；解构参数，包含 location（依赖在锁文件安装树中的相对位置）、entry（当前记录）。
         * @returns {Object} 包含 name、location、展开字段 的对象。
         */
        ([location, entry]) => ({
          name: location.split("node_modules/").at(-1),
          location,
          ...entry,
        })
      );
  const result = [];
  /**
   * 递归遍历旧锁文件的依赖树，保留嵌套安装位置。
   * @param dependencies 旧锁文件当前层的依赖字典。
   * @param [parent] 当前依赖在安装树中的父路径；默认值为 ""。
   * @returns {void} 无返回值。
   */
  function walk(dependencies, parent = "") {
    for (const [name, entry] of Object.entries(dependencies || {})) {
      const location = parent + "node_modules/" + name;
      result.push({ name, location, ...entry });
      walk(entry.dependencies, location + "/");
    }
  }
  walk(lock.dependencies);
  return result;
}
/**
 * 对比三个依赖层的锁文件快照与现状，查询版本和审计信息并输出维护清单；运行时会写入维护报告。异步步骤失败时向外拒绝，由入口统一设置退出状态。
 * 无参数。
 * @returns {Promise<void>} 异步完成后无返回值；拒绝由调用链处理。
 */
async function main() {
  fs.mkdirSync(output, { recursive: true });
  const inventory = {
    generated: new Date().toISOString(),
    runtime: process.version,
    layers: [],
    latestDirect: [],
  };
  const directNames = new Set();
  for (const layer of layers) {
    const manifest = read(path.join(root, layer, "package.json"));
    const old = packages(read(path.join(baseline, layer, "package-lock.json")));
    const current = packages(read(path.join(root, layer, "package-lock.json")));
    const direct = { ...manifest.dependencies, ...manifest.devDependencies };
    Object.keys(direct).forEach(
      /**
       * 逐项处理 Object.keys() 中的条目，directNames.add 的调用结果。
       * @param name 来自 Object.keys() 的当前条目。
       * @returns {*} directNames.add 的调用结果。
       */
      (name) => directNames.add(name)
    );
    const records = current.map(
      /**
       * 转换 current 中的条目，执行 old.filter().map。
       * @param entry 来自 current 的当前条目；使用 name、version、location、license、integrity、resolved 字段。
       * @returns {Object} 包含 name、version、location、direct、before、decision、reason、license、integrity、resolved 的对象。
       */
      (entry) => {
        const before = [
          ...new Set(
            old
              .filter(
                /**
                 * 筛选检查 old 中的条目，prior.name 是否严格等于 entry.name。
                 * @param prior 来自 old 的当前条目；使用 name 字段。
                 * @returns {boolean} prior.name 是否严格等于 entry.name。
                 */
                (prior) => prior.name === entry.name
              )
              .map(
                /**
                 * 转换 old.filter() 中的条目，prior.version。
                 * @param prior 来自 old.filter() 的当前条目；使用 version 字段。
                 * @returns {*} prior.version。
                 */
                (prior) => prior.version
              )
          ),
        ];
        return {
          name: entry.name,
          version: entry.version,
          location: entry.location,
          direct:
            entry.location === `node_modules/${entry.name}` &&
            !!direct[entry.name],
          before,
          decision: before.includes(entry.version)
            ? "retain"
            : "upgrade-or-replace",
          reason: direct[entry.name]
            ? "Pinned direct candidate; see validation report"
            : "Resolved by the upgraded parent package and pinned in this lockfile; no forced transitive override",
          license: entry.license,
          integrity: entry.integrity,
          resolved: entry.resolved,
        };
      }
    );
    for (const prior of old)
      if (
        !current.some(
          /**
           * 筛选检查 current 中的条目，entry.name 是否严格等于 prior.name。
           * @param entry 来自 current 的当前条目；使用 name 字段。
           * @returns {boolean} entry.name 是否严格等于 prior.name。
           */
          (entry) => entry.name === prior.name
        ) &&
        !records.some(
          /**
           * 筛选检查 records 中的条目，entry.name 是否严格等于 prior.name 且 entry.decision 是否严格等于 "remove"。
           * @param entry 来自 records 的当前条目；使用 name、decision 字段。
           * @returns {*} entry.name 是否严格等于 prior.name 且 entry.decision 是否严格等于 "remove"。
           */
          (entry) => entry.name === prior.name && entry.decision === "remove"
        )
      )
        records.push({
          name: prior.name,
          before: [
            ...new Set(
              old
                .filter(
                  /**
                   * 筛选检查 old 中的条目，entry.name 是否严格等于 prior.name。
                   * @param entry 来自 old 的当前条目；使用 name 字段。
                   * @returns {boolean} entry.name 是否严格等于 prior.name。
                   */
                  (entry) => entry.name === prior.name
                )
                .map(
                  /**
                   * 转换 old.filter() 中的条目，entry.version。
                   * @param entry 来自 old.filter() 的当前条目；使用 version 字段。
                   * @returns {*} entry.version。
                   */
                  (entry) => entry.version
                )
            ),
          ],
          decision: "remove",
          reason:
            "Removed with its old direct dependency or replaced parent graph",
        });
    inventory.layers.push({ layer, direct, packages: records });
  }
  const queue = [...directNames];
  await Promise.all(
    Array.from(
      { length: 5 },
      /**
       * 进入此回调后，更新 attempt、data，执行 queue.pop。
       * 无参数。
       * @returns {Promise<void>} 异步完成后无返回值；拒绝由调用链处理。
       */
      async () => {
        while (queue.length) {
          const name = queue.pop();
          try {
            const source = `https://registry.npmjs.org/${encodeURIComponent(name)}/latest`;
            let data;
            for (let attempt = 0; attempt < 2; attempt += 1) {
              const response = await fetch(source, {
                signal: AbortSignal.timeout(12000),
              });
              if (!response.ok) throw new Error(String(response.status));
              data = await response.json();
              if (typeof data.version === "string") break;
            }
            if (typeof data.version !== "string")
              throw new Error("Registry response has no version");
            inventory.latestDirect.push({
              name,
              latest: data.version,
              engines: data.engines,
              deprecated: data.deprecated || null,
              source,
            });
          } catch (error) {
            inventory.latestDirect.push({ name, unverified: error.message });
          }
        }
      }
    )
  );
  inventory.latestDirect.sort(
    /**
     * 比较排序 inventory.latestDirect 中的条目，a.name.localeCompare 的调用结果。
     * @param a 来自 inventory.latestDirect 的第一个待比较条目；使用 name 字段。
     * @param b 来自 inventory.latestDirect 的第二个待比较条目；使用 name 字段。
     * @returns {*} a.name.localeCompare 的调用结果。
     */
    (a, b) => a.name.localeCompare(b.name)
  );
  fs.writeFileSync(
    path.join(output, "dependencies.json"),
    JSON.stringify(inventory, null, 2) + "\n"
  );
  const npm = path.resolve(
    process.env.LISTEN1_NPM_CLI ||
      path.join(root, "dist/maintenance/npm12/node_modules/npm/bin/npm-cli.js")
  );
  for (const [index, layer] of layers.entries()) {
    const result = cp.spawnSync(
      process.execPath,
      [
        npm,
        "audit",
        "--json",
        "--registry=https://registry.npmjs.org",
        "--prefix",
        path.join(root, layer),
      ],
      { encoding: "utf8", windowsHide: true, timeout: 60000 }
    );
    try {
      const audit = JSON.parse(result.stdout);
      fs.writeFileSync(
        path.join(output, `audit-${index}.json`),
        JSON.stringify(audit, null, 2) + "\n"
      );
      console.log(
        layer,
        JSON.stringify(audit.metadata?.vulnerabilities || audit.error)
      );
    } catch {
      console.log(layer, "Audit unavailable");
    }
  }
  console.log(
    "Direct version comparison:",
    JSON.stringify(
      inventory.latestDirect.map(
        /**
         * 转换 inventory.latestDirect 中的条目，包含 name、latest、locked 的对象。
         * @param item 来自 inventory.latestDirect 的当前条目；使用 name、latest 字段。
         * @returns {Object} 包含 name、latest、locked 的对象。
         */
        (item) => ({
          name: item.name,
          latest: item.latest,
          locked: inventory.layers
            .map(
              /**
               * 转换 inventory.layers 中的条目，layer.direct[item.name]。
               * @param layer 来自 inventory.layers 的当前条目；使用 direct 字段。
               * @returns {*} layer.direct[item.name]。
               */
              (layer) => layer.direct[item.name]
            )
            .filter(Boolean),
        })
      )
    )
  );
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
