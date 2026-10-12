// Prepare short listening copies from the measured desktop transport exports.
// Outputs remain in ignored dist; source audio and user profiles are untouched.
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const root = path.resolve(__dirname, "..");
const output = path.join(root, "dist/maintenance/loudness");
const report = JSON.parse(
  fs.readFileSync(path.join(output, "report.json"), "utf8")
);
const ffmpeg =
  process.env.LISTEN1_FFMPEG ||
  path.join(
    root,
    "dist/maintenance/tools/ffmpeg-9.0.2-essentials_build/bin/ffmpeg.exe"
  );
const groups = [];
const local = report.local.find((entry) => entry.file === "dynamic.wav");
if (local)
  groups.push({
    prefix: "dynamic-wav",
    title: "本地强瞬态与弱段",
    start: 0,
    duration: 8,
    ...local,
  });
for (const entry of report.online) {
  if (entry.standard && entry.dynamic)
    groups.push({
      prefix: `online-${entry.platform}`,
      title: `${entry.platform}：${entry.title}`,
      start: 45,
      duration: 20,
      ...entry,
    });
}
if (!groups.length)
  throw new Error(
    "No measured A/B exports; run tests/loudness-electron.cjs first."
  );
const escape = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        character
      ]
  );
const labels = ["原始", "标准", "高动态", "标准（电平匹配）"];
const sections = groups.map((group) => {
  const files = [
    "standard-original",
    "standard-normalized",
    "dynamic-normalized",
    "standard-normalized",
  ];
  const controls = files.map((suffix, index) => {
    const name = `${group.prefix}-listen-${index}.wav`;
    const args = [
      "-hide_banner",
      "-loglevel",
      "error",
      "-y",
      "-ss",
      String(group.start),
      "-i",
      path.join(output, `${group.prefix}-${suffix}.wav`),
      "-t",
      String(group.duration),
    ];
    if (index === 3)
      args.push(
        "-af",
        `volume=${group.dynamic.state.targetDb - group.standard.state.targetDb}dB`
      );
    args.push("-ar", "48000", "-c:a", "pcm_s16le", path.join(output, name));
    const result = spawnSync(ffmpeg, args, { encoding: "utf8" });
    if (result.status !== 0)
      throw new Error(result.stderr || "FFmpeg unavailable");
    return `<label>${labels[index]}<audio controls preload="none" src="${name}"></audio></label>`;
  });
  return `<section><h2>${escape(group.title)}</h2><small>片段从 ${group.start} 秒开始，长度 ${group.duration} 秒；比较过程中保持相同主音量。</small>${controls.join("")}</section>`;
});
fs.writeFileSync(
  path.join(output, "listening.html"),
  `<!doctype html>
<html lang="zh-CN"><meta charset="utf-8"><title>音量均衡 A/B 试听</title>
<style>body{font:16px/1.7 system-ui;max-width:900px;margin:40px auto;padding:0 20px;background:#f7f7fa;color:#242536}section{background:white;border:1px solid #ddd;border-radius:12px;padding:20px;margin:20px 0}label{display:block;margin:12px 0}audio{width:100%}small{color:#555}</style>
<h1>音量均衡 A/B 试听</h1><p>材料由实际 BufferAudio 播放适配器离线渲染，保持原曲时间结构。播放器初始主音量为 10%，每次只播放一项。</p>
<p>先比较原始与均衡的整体电平，再用“标准（电平匹配）”与高动态比较瞬态和音色。合成素材用于检查静音、弱段与尖峰，实际音乐用于试听。客观测量已完成，人耳试听尚待你确认。</p>
${sections.join("\n")}<p>请关注歌曲之间的电平、弱段与静音、瞬态失真，以及标准和高动态在相同电平下是否有可察觉差异。这些片段对应导出时的目标阶段；完整原始／处理 WAV 保存在同目录，active WAV 仅用于测量。</p>
<script>document.querySelectorAll("audio").forEach(a=>{a.volume=.1;a.addEventListener("play",()=>document.querySelectorAll("audio").forEach(b=>{if(a!==b)b.pause()}))})</script></html>`
);
console.log(
  `Prepared ${groups.length} A/B groups: ${path.join(output, "listening.html")}`
);
