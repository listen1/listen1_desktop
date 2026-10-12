/**
 * 文件职责：读取本地音频标签，将同步歌词规范化为 LRC，并在缺少内嵌歌词时容错读取同名歌词文件。
 *
 * 文件级定义：
 * - open：从 fs/promises 引入，用于有界读取歌词文件。
 * - basename：从 path 引入，用于提取文件名用于标题回退。
 * - extname：从 path 引入，用于提取扩展名。
 * - parse：从 path 引入，用于拆解文件路径以寻找同名歌词。
 * - format：从 path 引入，用于重组同名歌词路径。
 * - detect：从 chardet 引入，用于探测歌词字节编码。
 * - metadataModule：缓存的 music-metadata 动态导入 Promise，避免重复装载。
 * - parseAudio：按需加载并缓存 ESM 版 music-metadata，再解析指定音频。
 * - normalizeLyrics：将字符串歌词或带毫秒时间戳的 syncText 规范化为 LRC 数组。
 * - readSidecarLyrics：读取同名 .lrc 并按探测编码解码。
 * - module.exports.readAudioTags：读取标签和规范化歌词，缺少歌词时尝试同名 .lrc。
 */
/**
 * open：从 fs/promises 引入，用于有界读取歌词文件；类型为 typeof import("fs/promises").open。
 */
const { open } = require("fs/promises");
/**
 * basename：从 path 引入，用于提取文件名用于标题回退；类型为 typeof import("path").basename。
 * extname：从 path 引入，用于提取扩展名；类型为 typeof import("path").extname。
 * parse：从 path 引入，用于拆解文件路径以寻找同名歌词；类型为 typeof import("path").parse。
 * format：从 path 引入，用于重组同名歌词路径；类型为 typeof import("path").format。
 */
const { basename, extname, parse, format } = require("path");
/**
 * detect：从 chardet 引入，用于探测歌词字节编码；类型为 typeof import("chardet").detect。
 */
const { detect } = require("chardet");

// 通过函数隔离元数据读取，便于独立加载 ESM 依赖。
/**
 * metadataModule：缓存的 music-metadata 动态导入 Promise，避免重复装载；类型为 Promise<*>|undefined。
 * @type {Promise<*>|undefined}
 */
let metadataModule;
/**
 * 按需加载并缓存 ESM 版 music-metadata，再解析指定音频；导入与解析失败沿 Promise 向上传递。
 * @param filePath 音频文件的绝对路径。
 * @returns {Promise<Object>} music-metadata 返回的标签解析结果，失败时拒绝。
 */
async function parseAudio(filePath) {
  metadataModule ||= import("music-metadata");
  const { parseFile } = await metadataModule;
  return parseFile(filePath);
}

/**
 * 将字符串歌词或带毫秒时间戳的 syncText 规范化为 LRC 数组；无可用歌词时返回空数组。
 * @param lyrics 标签解析得到的歌词数组。
 * @returns {string[]} 规范化后的歌词文本数组；无可用歌词时为空数组。
 */
function normalizeLyrics(lyrics) {
  if (!Array.isArray(lyrics)) return [];
  return lyrics
    .map(
      /**
       * 转换 lyrics 中的条目，执行 entry.syncText.map().join（"\n"）。
       * @param entry 来自 lyrics 的当前条目；使用 syncText、timeStampFormat、text 字段。
       * @returns {*} entry；其他分支返回 entry.syncText.map().join 的调用结果；其他分支返回 entry.text，为空或假值时使用 entry.syncText.map().join 的调用结果，为空或假值时使用 ""。
       */
      (entry) => {
        if (typeof entry === "string") return entry;
        if (entry?.syncText?.length && entry.timeStampFormat === 2) {
          return entry.syncText
            .map(
              /**
               * 转换 entry.syncText 中的条目，执行 Math.max。
               * @param options 来自 entry.syncText 的当前条目；解构参数，包含 timestamp（同步歌词的时间偏移，单位为毫秒；默认值为 0）、text（待处理的文本；默认值为 ""）。
               * @returns {string} 按当前字段拼接的字符串。
               */
              ({ timestamp = 0, text = "" }) => {
                const seconds = Math.max(0, timestamp) / 1000;
                return `[${String(Math.floor(seconds / 60)).padStart(2, "0")}:${(seconds % 60).toFixed(2).padStart(5, "0")}]${text}`;
              }
            )
            .join("\n");
        }
        return (
          entry?.text ||
          entry?.syncText
            ?.map(
              /**
               * 转换 entry.syncText 中的条目，line.text。
               * @param line 来自 entry.syncText 的当前条目；使用 text 字段。
               * @returns {*} line.text。
               */
              (line) => line.text
            )
            .join("\n") ||
          ""
        );
      }
    )
    .filter(Boolean);
}

/**
 * 读取同名 .lrc 并按探测编码解码；文件缺失、损坏或编码异常时返回 undefined，不影响已读出的标签。
 * @param {string} audioPath 用于推导同名歌词文件的音频路径。
 * @returns {Promise<string | undefined>} 成功解码的同名歌词，读取或编码失败时为 undefined。
 */
async function readSidecarLyrics(audioPath) {
  const lyricPath = format({
    ...parse(audioPath),
    ext: ".lrc",
    base: undefined,
  });

  try {
    const handle = await open(lyricPath, "r");
    let fileBuffer;
    try {
      const limit = 1024 * 1024;
      if ((await handle.stat()).size > limit) return undefined;
      const buffer = Buffer.alloc(limit + 1);
      let size = 0;
      while (size < buffer.length) {
        const { bytesRead } = await handle.read(
          buffer,
          size,
          buffer.length - size,
          size
        );
        if (!bytesRead) break;
        size += bytesRead;
      }
      if (size > limit) return undefined;
      fileBuffer = buffer.subarray(0, size);
    } finally {
      await handle.close();
    }
    const encoding = detect(fileBuffer) || "utf-8";
    return new TextDecoder(encoding).decode(fileBuffer);
  } catch {
    // .lrc 缺失、损坏或编码异常时，仍返回音频标签信息。
    return undefined;
  }
}

async function readOriginalLyrics(filePath, common = {}) {
  const lyrics = normalizeLyrics(common.lyrics);
  if (lyrics.length)
    return { lyric: lyrics[0], provenance: { kind: "embedded" } };
  const lyric = await readSidecarLyrics(filePath);
  return lyric
    ? {
        lyric,
        provenance: {
          kind: "file",
          fileName: basename(
            format({ ...parse(filePath), ext: ".lrc", base: undefined })
          ),
        },
      }
    : { lyric: "" };
}

module.exports = {
  // Explicit imports use strict UTF-8; legacy sidecars keep encoding detection.
  // Bound the read itself, including files that grow while being read.
  async readLocalLyric(filePath) {
    const fail = (code) => Object.assign(new Error(code), { code });
    if (extname(filePath).toLowerCase() !== ".lrc")
      throw fail("INVALID_LRC_FILE");
    const handle = await open(filePath, "r");
    try {
      const stat = await handle.stat();
      const limit = 1024 * 1024;
      if (!stat.isFile()) throw fail("LYRIC_READ_FAILED");
      if (stat.size > limit) throw fail("LYRIC_TOO_LARGE");
      const buffer = Buffer.alloc(limit + 1);
      let length = 0;
      while (length < buffer.length) {
        const { bytesRead } = await handle.read(
          buffer,
          length,
          buffer.length - length,
          length
        );
        if (!bytesRead) break;
        length += bytesRead;
      }
      if (length > limit) throw fail("LYRIC_TOO_LARGE");
      try {
        return new TextDecoder("utf-8", { fatal: true }).decode(
          buffer.subarray(0, length)
        );
      } catch {
        throw fail("INVALID_UTF8");
      }
    } finally {
      await handle.close();
    }
  },
  /**
   * 读取标签和规范化歌词，缺少歌词时尝试同名 .lrc；解析失败仍以文件名构造 common 标题并保留错误信息。
   * @param {string} filePath 音频文件的绝对路径。
   * @param [parseMetadata] 标签解析函数；默认调用延迟加载的 music-metadata；默认值为 parseAudio。
   * @returns {Promise<Object>} 含 common 标签的结果；解析异常时仍保留文件名标题和错误信息。
   */
  async readAudioTags(filePath, parseMetadata = parseAudio) {
    const fileName = basename(filePath, extname(filePath));
    try {
      const metaData = await parseMetadata(filePath);
      metaData.common ||= {};
      metaData.common.title ||= fileName;
      metaData.common.lyrics = normalizeLyrics(metaData.common.lyrics);
      if (metaData.common.lyrics.length)
        metaData.lyricProvenance = { kind: "embedded" };
      if (!metaData.common.lyrics.length) {
        const lyric = await readSidecarLyrics(filePath);
        if (lyric) {
          metaData.common.lyrics = [lyric];
          metaData.lyricProvenance = {
            kind: "file",
            fileName: basename(
              format({ ...parse(filePath), ext: ".lrc", base: undefined })
            ),
          };
        }
      }
      return metaData;
    } catch (error) {
      return {
        error: { code: error.code || "INVALID_AUDIO", message: error.message },
        common: {
          title: fileName,
          album: "",
          artist: "",
        },
      };
    }
  },
  normalizeLyrics,
  readOriginalLyrics,
};
