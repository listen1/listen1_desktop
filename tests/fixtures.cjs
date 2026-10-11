/**
 * 文件职责：生成合成 WAV 音频、标签、同名歌词和损坏文件，供本地音频与 Electron 回归使用。
 *
 * 文件级定义：
 * - fs：从 node:fs 引入，用于文件读写与目录操作。
 * - path：从 node:path 引入，用于路径解析和拼接。
 * - writeAudioFixtures：写入带标签的合成 WAV、无标签 WAV、同名 LRC 和损坏音频，返回测试使用的绝对路径。
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
 * 写入带标签的合成 WAV、无标签 WAV、同名 LRC 和损坏音频，返回测试使用的绝对路径。
 * @param directory 合成测试文件的输出目录。
 * @returns {Object} audio、plain、broken 等测试文件的路径集合。
 */
function writeAudioFixtures(directory) {
  fs.mkdirSync(directory, { recursive: true });
  const rate = 22050,
    duration = 40;
  const samples = Buffer.alloc(rate * duration * 2);
  for (let i = 0; i < rate * duration; i += 1)
    samples.writeInt16LE(
      Math.round(900 * Math.sin((2 * Math.PI * 440 * i) / rate)),
      i * 2
    );
  /**
   * 构造 RIFF 子块，写入块名与长度，并按偶数字节边界补齐。
   * @param name 待查找或注册的名称。
   * @param bytes RIFF 子块的二进制内容。
   * @returns {*} Buffer.concat 的调用结果。
   */
  const chunk = (name, bytes) => {
    const header = Buffer.alloc(8);
    header.write(name);
    header.writeUInt32LE(bytes.length, 4);
    return Buffer.concat([header, bytes, Buffer.alloc(bytes.length % 2)]);
  };
  const format = Buffer.alloc(16);
  format.writeUInt16LE(1, 0);
  format.writeUInt16LE(1, 2);
  format.writeUInt32LE(rate, 4);
  format.writeUInt32LE(rate * 2, 8);
  format.writeUInt16LE(2, 12);
  format.writeUInt16LE(16, 14);
  const tags = Buffer.concat([
    Buffer.from("INFO"),
    chunk("INAM", Buffer.from("Synthetic title\0")),
    chunk("IART", Buffer.from("Fixture artist\0")),
    chunk("IPRD", Buffer.from("Fixture album\0")),
  ]);
  const content = Buffer.concat([
    Buffer.from("WAVE"),
    chunk("fmt ", format),
    chunk("LIST", tags),
    chunk("data", samples),
  ]);
  const wave = chunk("RIFF", content);
  const audio = path.join(directory, "测试音乐 #100%.wav");
  const plain = path.join(directory, "no-tags.wav");
  fs.writeFileSync(audio, wave);
  fs.writeFileSync(
    plain,
    chunk(
      "RIFF",
      Buffer.concat([
        Buffer.from("WAVE"),
        chunk("fmt ", format),
        chunk("data", samples),
      ])
    )
  );
  fs.writeFileSync(
    audio.replace(/\.wav$/, ".lrc"),
    "[00:00.00]合成歌词\n[00:02.00]第二行\n"
  );
  const broken = path.join(directory, "broken.wav");
  fs.writeFileSync(broken, "invalid audio fixture");
  return { audio, plain, broken };
}
module.exports = { writeAudioFixtures };
