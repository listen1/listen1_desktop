// Real desktop preparation/transport, independent output metering and UI regression.
// All inputs, profiles, A/B files and evidence stay in ignored dist/maintenance.
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const { _electron } = require("playwright");
const root = path.resolve(__dirname, "..");
const output = path.join(root, "dist/maintenance/loudness");
const ffmpeg =
  process.env.LISTEN1_FFMPEG ||
  path.join(
    root,
    "dist/maintenance/tools/ffmpeg-9.0.2-essentials_build/bin/ffmpeg.exe"
  );
fs.mkdirSync(output, { recursive: true });
const report = {
  date: new Date().toISOString(),
  checks: [],
  local: [],
  online: [],
  errors: [],
};
const platforms = (
  process.env.LISTEN1_LOUDNESS_SOURCES || "netease,qq,kugou,kuwo,bilibili,migu"
).split(",");
if (
  process.env.LISTEN1_LOUDNESS_SOURCES &&
  fs.existsSync(path.join(output, "report.json"))
) {
  report.online = JSON.parse(
    fs.readFileSync(path.join(output, "report.json"), "utf8")
  ).online.filter((entry) => !platforms.includes(entry.platform));
}
if (process.env.LISTEN1_LOUDNESS_SKIP_LOCAL === "1") {
  const previous = JSON.parse(
    fs.readFileSync(path.join(output, "report.json"), "utf8")
  );
  report.local = previous.local;
  report.replay = previous.replay;
  if (process.env.LISTEN1_LOUDNESS_SOURCES)
    report.online = previous.online.filter(
      (entry) => !platforms.includes(entry.platform)
    );
}
function wav(file, channels, rate) {
  const frames = channels[0].length;
  const count = channels.length;
  const bytes = Buffer.alloc(44 + frames * count * 4);
  bytes.write("RIFF");
  bytes.writeUInt32LE(bytes.length - 8, 4);
  bytes.write("WAVEfmt ", 8);
  bytes.writeUInt32LE(16, 16);
  bytes.writeUInt16LE(3, 20);
  bytes.writeUInt16LE(count, 22);
  bytes.writeUInt32LE(rate, 24);
  bytes.writeUInt32LE(rate * count * 4, 28);
  bytes.writeUInt16LE(count * 4, 32);
  bytes.writeUInt16LE(32, 34);
  bytes.write("data", 36);
  bytes.writeUInt32LE(bytes.length - 44, 40);
  for (let i = 0; i < frames; i += 1)
    for (let c = 0; c < count; c += 1)
      bytes.writeFloatLE(channels[c][i], 44 + (i * count + c) * 4);
  fs.writeFileSync(file, bytes);
}
function measure(file) {
  const result = spawnSync(
    ffmpeg,
    [
      "-hide_banner",
      "-nostats",
      "-i",
      file,
      "-af",
      "astats=metadata=0:reset=0,ebur128=peak=true",
      "-f",
      "null",
      "-",
    ],
    { encoding: "utf8", maxBuffer: 8 * 1048576 }
  );
  assert.equal(result.status, 0, result.stderr.slice(-1000));
  const text = result.stderr;
  const levels = [...text.matchAll(/RMS level dB: ([-\d.inf]+)/g)];
  const peaks = [...text.matchAll(/Peak:\s+([-\d.]+) dBFS/g)];
  return {
    rmsDb: Number(levels.at(-1)?.[1]),
    truePeakDb: Number(peaks.at(-1)?.[1]),
  };
}
const wait = (page, fn, arg, timeout = 30000) =>
  page.waitForFunction(fn, arg, { polling: 50, timeout });

async function capture(page, name) {
  const data = await page.evaluate(async (name) => {
    const p = threadPlayer;
    const raw = p._normalizer.cached.buffer;
    const current = p.currentHowl;
    const save = async (suffix, buffer) => {
      const key = name + "-" + suffix;
      await window.saveLoudnessChunk(key, null);
      for (let c = 0; c < buffer.numberOfChannels; c += 1) {
        const bytes = new Uint8Array(buffer.getChannelData(c).buffer);
        for (let offset = 0; offset < bytes.length; offset += 524288) {
          const chunk = bytes.subarray(offset, offset + 524288);
          let binary = "";
          for (let i = 0; i < chunk.length; i += 32768)
            binary += String.fromCharCode(...chunk.subarray(i, i + 32768));
          await window.saveLoudnessChunk(key, btoa(binary));
        }
      }
    };
    const render = async (volume, muted, short = false) => {
      const context = new OfflineAudioContext(
        current.buffer.numberOfChannels,
        short ? current.buffer.sampleRate : current.buffer.length,
        current.buffer.sampleRate
      );
      context.resume = async () => {};
      const transport = new listen1NormalizedAudio.BufferAudio(
        {
          onload() {},
          onplay() {},
          onend() {},
          onpause() {},
          onstop() {},
          onplayerror() {
            throw new Error("offline transport failed");
          },
        },
        { buffer: current.buffer, gain: current.gain.gain.value },
        context,
        volume,
        muted
      );
      if (short) transport.seek(2);
      await transport.play();
      const result = await context.startRendering();
      transport.unload();
      return result;
    };
    await save("original", raw);
    await save("full", await render(1, false));
    await save("low", await render(0.1, false));
    const silent = async (volume, muted) => {
      const b = await render(volume, muted, true);
      return Array.from({ length: b.numberOfChannels }, (_, c) =>
        b.getChannelData(c).every((v) => v === 0)
      ).every(Boolean);
    };
    return {
      state: { ...p.loudness },
      timings: p._prepared.timings,
      sampleRate: raw.sampleRate,
      frames: raw.length,
      channels: raw.numberOfChannels,
      zeroSilent: await silent(0, false),
      mutedSilent: await silent(0.7, true),
    };
  }, name);
  const load = (suffix) => {
    const bytes = fs.readFileSync(
      path.join(output, name + "-" + suffix + ".pcm")
    );
    return Array.from(
      { length: data.channels },
      (_, c) =>
        new Float32Array(
          bytes.buffer,
          bytes.byteOffset + c * data.frames * 4,
          data.frames
        )
    );
  };
  const original = load("original"),
    full = load("full"),
    low = load("low");
  const rate = data.sampleRate;
  const block = Math.round(rate / 10);
  const selected = original.map(() => []);
  const lowSelected = original.map(() => []);
  for (let start = 0; start < original[0].length; start += block) {
    const end = Math.min(start + block, original[0].length);
    let energy = 0;
    for (const channel of original)
      for (let i = start; i < end; i += 1) energy += channel[i] ** 2;
    if (energy / ((end - start) * original.length) >= 1e-6) {
      for (let c = 0; c < original.length; c += 1)
        for (let i = start; i < end; i += 1) {
          selected[c].push(full[c][i]);
          lowSelected[c].push(low[c][i]);
        }
    }
  }
  const file = (suffix) => path.join(output, `${name}-${suffix}.wav`);
  wav(file("original"), original, rate);
  wav(file("normalized"), full, rate);
  wav(file("active"), selected, rate);
  wav(file("low-active"), lowSelected, rate);
  const measured = measure(file("active"));
  const peak = measure(file("normalized"));
  const lowMeasured = measure(file("low-active"));
  assert.ok(
    Math.abs(measured.rmsDb - data.state.targetDb) <= 0.5,
    JSON.stringify({ measured, state: data.state })
  );
  assert.ok(peak.truePeakDb < -1, JSON.stringify(peak));
  assert.ok(Math.abs(lowMeasured.rmsDb - measured.rmsDb + 20) < 0.01);
  assert.ok(data.zeroSilent);
  assert.ok(data.mutedSilent);
  let silencePeak = 0;
  let maxReduction = 0;
  let ratioError = 0;
  const gain = 10 ** (data.state.gainDb / 20);
  for (let i = rate / 10; i < original[0].length - rate * 0.02; i += 1) {
    for (let c = 0; c < original.length; c += 1) {
      const input = original[c][i];
      const actual = full[c][i];
      if (input === 0) silencePeak = Math.max(silencePeak, Math.abs(actual));
      if (Math.abs(input) > 1e-4) {
        ratioError = Math.max(ratioError, Math.abs(actual - input * gain));
        maxReduction = Math.max(
          maxReduction,
          -20 * Math.log10(Math.abs(actual / (input * gain)))
        );
      }
    }
  }
  assert.equal(silencePeak, 0);
  if (data.state.mode === "dynamic") assert.ok(ratioError < 1e-6);
  else assert.ok(maxReduction <= 1.00001);
  return {
    state: data.state,
    timings: data.timings,
    rmsDb: measured.rmsDb,
    truePeakDb: peak.truePeakDb,
    lowVolumeDb: lowMeasured.rmsDb,
    silencePeak,
    ratioError,
    maxReduction,
  };
}

async function main() {
  const fixtures = [];
  for (const [name, rate, level, transient] of [
    ["quiet", 22050, 0.01, false],
    ["dynamic", 48000, 0.08, true],
    ["near-full", 44100, 0.98, false],
  ]) {
    const data = Float32Array.from({ length: rate * 8 }, (_, i) => {
      const t = i / rate;
      if (t < 1 || (t >= 5 && t < 6)) return 0;
      const amplitude = t < 3 ? level : t < 5 ? level / 4 : level * 0.7;
      return amplitude * Math.sin(2 * Math.PI * 997 * t);
    });
    if (transient) data[rate * 4] = 0.98;
    const file = path.join(output, `${name}.wav`);
    wav(file, [data, data.map((v) => v * 0.8)], rate);
    fixtures.push(file);
  }
  for (const extension of ["mp3", "flac", "m4a", "ogg", "webm"]) {
    const file = path.join(output, `encoded.${extension}`);
    const result = spawnSync(
      ffmpeg,
      ["-y", "-hide_banner", "-loglevel", "error", "-i", fixtures[0], file],
      { encoding: "utf8" }
    );
    assert.equal(result.status, 0, result.stderr);
    fixtures.push(file);
  }
  const corrupt = path.join(output, "broken.mp3");
  fs.writeFileSync(corrupt, "not audio");
  const profile = path.join(output, `profile-${Date.now()}`);
  fs.mkdirSync(profile, { recursive: true });
  fs.writeFileSync(
    path.join(profile, "config.json"),
    JSON.stringify({
      windowState: { width: 1100, height: 760, maximized: false },
      proxyConfig: { mode: "system" },
    })
  );
  const app = await _electron.launch({
    executablePath: require("electron"),
    args: [path.join(__dirname, "electron-entry.cjs")],
    env: { ...process.env, LISTEN1_TEST_USER_DATA: profile },
  });
  try {
    const page = await app.firstWindow();
    page.on("pageerror", (error) =>
      report.errors.push(error.message.replace(/https?:\/\/\S+/g, "[URL]"))
    );
    await page.exposeFunction("saveLoudnessChunk", (name, encoded) => {
      assert.match(name, /^[a-zA-Z0-9-]+$/);
      const file = path.join(output, name + ".pcm");
      if (encoded === null) fs.writeFileSync(file, "");
      else fs.appendFileSync(file, Buffer.from(encoded, "base64"));
    });
    await wait(
      page,
      () => window.l1Player && window.angular?.element(document.body).injector()
    );
    report.runtime = await app.evaluate(() => process.versions);
    await page.evaluate(() => {
      threadPlayer.volume = 0.05;
      threadPlayer.clearPlaylist();
    });
    assert.equal(await page.evaluate(() => threadPlayer._normalizer), null);
    for (const file of process.env.LISTEN1_LOUDNESS_SKIP_LOCAL === "1"
      ? []
      : fixtures) {
      await page.evaluate((file) => {
        threadPlayer.setNewPlaylist([
          {
            id: `lmtrack_${file}`,
            source: "localmusic",
            title: "Test",
            artist: "Fixture",
          },
        ]);
        threadPlayer.setLoudness({ enabled: true, mode: "standard" });
        threadPlayer.play(0);
      }, file);
      const start = Date.now();
      await wait(page, () =>
        ["active", "error", "skipped"].includes(threadPlayer.loudness.status)
      );
      const coldMs = Date.now() - start;
      assert.equal(
        await page.evaluate(() => threadPlayer.loudness.status),
        "active",
        JSON.stringify(await page.evaluate(() => threadPlayer.loudness))
      );
      await page.evaluate(() => threadPlayer.pause());
      const name = path.basename(file).replace(/\./g, "-");
      const standard = await capture(page, `${name}-standard`);
      await page.evaluate(() => {
        threadPlayer.seekTime(2);
        threadPlayer.setLoudness({ enabled: true, mode: "dynamic" });
      });
      const hotStart = Date.now();
      await wait(page, () => threadPlayer.loudness.status === "active");
      const hotMs = Date.now() - hotStart;
      assert.equal(await page.evaluate(() => threadPlayer.playing), false);
      assert.equal(
        await page.evaluate(() => threadPlayer.currentHowl.seek()),
        2
      );
      const dynamic = await capture(page, `${name}-dynamic`);
      report.local.push({
        file: path.basename(file),
        standard,
        dynamic,
        coldMs,
        hotMs,
      });
      console.log(`Measured local ${path.basename(file)}`);
    }
    report.checks.push(
      "8 local formats/rates measured; actual transport master/mute, silence, ratios and peak budget"
    );
    await page.evaluate((file) => {
      threadPlayer.setNewPlaylist([
        { id: `lmtrack_${file}`, source: "localmusic" },
      ]);
      threadPlayer.setLoudness({ enabled: true, mode: "dynamic" });
      threadPlayer.play(0);
    }, corrupt);
    await wait(page, () => threadPlayer.loudness.status === "skipped");
    assert.equal(
      await page.evaluate(() => threadPlayer.loudness.reason),
      "UNSUPPORTED_AUDIO"
    );
    await page.evaluate(() => threadPlayer.pause());
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].showInactive()
    );
    await page.evaluate((file) => {
      threadPlayer.setNewPlaylist([
        {
          id: `lmtrack_${file}`,
          source: "localmusic",
          title: "UI fixture",
          artist: "Fixture",
        },
      ]);
      threadPlayer.play(0);
    }, fixtures[0]);
    await wait(page, () => threadPlayer.loudness.status === "active");
    await page.evaluate(() => threadPlayer.pause());
    if (process.env.LISTEN1_LOUDNESS_SKIP_LOCAL !== "1") {
      report.replay = await capture(page, "replay-quiet");
      assert.equal(
        report.replay.state.targetDb,
        report.local.at(-1).dynamic.state.targetDb
      );
      assert.equal(report.replay.timings.scanMs, 0);
    }
    report.seekTransition = await page.evaluate(async () => {
      const context = new OfflineAudioContext(2, 96000, 48000);
      const resume = context.resume.bind(context);
      context.resume = async () => {};
      const buffer = context.createBuffer(2, 96000, 48000);
      buffer.getChannelData(0).fill(0.45);
      buffer.getChannelData(1).fill(0.225);
      let ends = 0;
      const transport = new listen1NormalizedAudio.BufferAudio(
        {
          onload() {},
          onplay() {},
          onpause() {},
          onstop() {},
          onplayerror() {
            throw new Error("transition");
          },
          onend() {
            ends += 1;
          },
        },
        { buffer, gain: 1 },
        context,
        1,
        false
      );
      await transport.play();
      const suspended = context.suspend(0.25);
      const rendering = context.startRendering();
      await suspended;
      transport.seek(1);
      await Promise.resolve();
      await resume();
      const rendered = await rendering;
      const left = rendered.getChannelData(0),
        right = rendered.getChannelData(1);
      let peak = 0,
        difference = 0,
        ratioError = 0;
      for (let i = 1; i < left.length; i += 1) {
        peak = Math.max(peak, Math.abs(left[i]));
        difference = Math.max(difference, Math.abs(left[i] - left[i - 1]));
        ratioError = Math.max(ratioError, Math.abs(right[i] - left[i] / 2));
      }
      transport.unload();
      return { peak, difference, ratioError, ends };
    });
    assert.ok(report.seekTransition.peak <= 0.450001);
    assert.ok(report.seekTransition.difference < 0.001);
    assert.equal(report.seekTransition.ratioError, 0);
    assert.equal(report.seekTransition.ends, 1);
    for (const theme of ["white", "black", "white2", "black2"]) {
      await page.evaluate((theme) => {
        const s = angular
          .element(
            document.querySelector('[ng-controller="ProfileController"]')
          )
          .scope();
        s.$apply(() => s.setTheme(theme));
      }, theme);
      if (theme.endsWith("2"))
        await page.locator(".footertime:visible").hover();
      await page.locator(".loudness-button:visible").waitFor();
      await page.locator(".loudness-button:visible").click();
      assert.equal(await page.locator(".loudness-panel:visible").count(), 1);
      const geometry = await page
        .locator(".loudness-button:visible")
        .evaluate((button) => {
          const holder = button.closest("[loudness-control]");
          const volume = holder.nextElementSibling;
          const b = button.getBoundingClientRect();
          const v = volume.getBoundingClientRect();
          return {
            sibling: volume.classList.contains("volume-ctrl"),
            outsideWheel: !button.closest("[volume-wheel]"),
            right: b.right,
            left: v.left,
            centerDelta: Math.abs((b.top + b.bottom - v.top - v.bottom) / 2),
          };
        });
      assert.ok(
        geometry.sibling &&
          geometry.outsideWheel &&
          geometry.right <= geometry.left + 1 &&
          geometry.centerDelta < 3,
        JSON.stringify(geometry)
      );
      await page.screenshot({
        path: path.join(output, `theme-${theme}.png`),
        animations: "disabled",
      });
      await page.keyboard.press("Escape");
      await page
        .locator(".loudness-panel:visible")
        .waitFor({ state: "hidden" });
      if (theme.endsWith("2"))
        await page.locator(".footertime:visible").hover();
      const gain = await page.evaluate(() => threadPlayer.loudness.gainDb);
      await page.evaluate(() => {
        threadPlayer.volume = 0.2;
        threadPlayer.unmute();
      });
      await wait(
        page,
        () =>
          !threadPlayer.muted &&
          Math.abs(threadPlayer.currentHowl.master.gain.value - 0.2) < 1e-6
      );
      const volumeIcon = page.locator(".volume-ctrl:visible > .icon");
      await volumeIcon.click();
      await wait(
        page,
        () =>
          threadPlayer.muted && threadPlayer.currentHowl.master.gain.value === 0
      );
      await volumeIcon.click();
      await wait(page, () => !threadPlayer.muted);
      const wheel = async (selector) =>
        page
          .locator(selector)
          .evaluate((element) =>
            element.dispatchEvent(
              new WheelEvent("mousewheel", { bubbles: true, deltaY: -120 })
            )
          );
      await wheel(".loudness-button:visible");
      assert.equal(await page.evaluate(() => threadPlayer.volume), 0.2);
      await wheel(".volume-ctrl:visible");
      assert.notEqual(await page.evaluate(() => threadPlayer.volume), 0.2);
      const bar = page.locator(".volume-ctrl:visible .barbg");
      const bounds = await bar.boundingBox();
      await page.mouse.move(
        bounds.x + bounds.width * 0.2,
        bounds.y + bounds.height / 2
      );
      await page.mouse.down();
      await page.mouse.move(
        bounds.x + bounds.width * 0.6,
        bounds.y + bounds.height / 2
      );
      await page.mouse.up();
      await wait(
        page,
        () =>
          Math.abs(
            threadPlayer.currentHowl.master.gain.value - threadPlayer.volume
          ) < 1e-6
      );
      const master = await page.evaluate(() => ({
        volume: threadPlayer.volume,
        master: threadPlayer.currentHowl.master.gain.value,
        gain: threadPlayer.loudness.gainDb,
      }));
      assert.ok(Math.abs(master.volume - 0.6) < 0.02);
      assert.ok(Math.abs(master.master - master.volume) < 1e-6);
      assert.equal(master.gain, gain);
      await page.locator(".loudness-button:visible").focus();
      await page.keyboard.press("Enter");
      await page.locator(".loudness-panel:visible").waitFor();
      await page.locator("body").click({ position: { x: 20, y: 100 } });
      await page
        .locator(".loudness-panel:visible")
        .waitFor({ state: "hidden" });
    }
    for (const language of [
      "zh-CN",
      "zh-TC",
      "en-US",
      "fr-FR",
      "ko-KR",
      "pt-BR",
    ]) {
      await page.evaluate(
        (language) =>
          angular
            .element(
              document.querySelector('[ng-controller="ProfileController"]')
            )
            .scope()
            .setLang(language),
        language
      );
      await wait(page, (language) => i18next.language === language, language);
      await page.locator(".footertime:visible").hover();
      await page.locator(".loudness-button:visible").click();
      const text = await page.locator(".loudness-panel:visible").innerText();
      assert.ok(!text.includes("_LOUDNESS_"));
      await page.screenshot({
        path: path.join(output, `language-${language}.png`),
        animations: "disabled",
      });
      await page.keyboard.press("Escape");
      await page
        .locator(".loudness-panel:visible")
        .waitFor({ state: "hidden" });
    }
    report.checks.push(
      "Both layouts / four themes / six languages; icon placement, keyboard, outside click and state restoration"
    );
    if (process.env.LISTEN1_LOUDNESS_ONLINE === "1") {
      await page.evaluate(() => {
        localStorage.setObject("enable_auto_choose_source", false);
      });
      for (const platform of platforms) {
        const entry = { platform };
        report.online.push(entry);
        try {
          const found = await page.evaluate(async (platform) => {
            const result = await MediaService.search(platform, {
              keywords: "夜空中最亮的星",
              curpage: 1,
              type: 0,
            }).promise;
            const track = result.result?.find((t) => !t.disabled);
            if (!track) throw new Error("NO_SEARCH_SAMPLE");
            threadPlayer.setNewPlaylist([track]);
            threadPlayer.setLoudness({ enabled: true, mode: "standard" });
            threadPlayer.play(0);
            return { id: track.id, title: track.title, artist: track.artist };
          }, platform);
          Object.assign(entry, found);
          const start = Date.now();
          await wait(
            page,
            () =>
              threadPlayer.currentAudio?.disabled ||
              ["active", "error", "skipped"].includes(
                threadPlayer.loudness.status
              ),
            null,
            180000
          );
          entry.coldMs = Date.now() - start;
          entry.state = await page.evaluate(() => ({
            ...threadPlayer.loudness,
          }));
          await page.evaluate(() => threadPlayer.pause());
          entry.sourceUnavailable = await page.evaluate(
            () => !!threadPlayer.currentAudio?.disabled
          );
          if (entry.state.status === "active") {
            entry.standard = await capture(page, `online-${platform}-standard`);
            await page.evaluate(() =>
              threadPlayer.setLoudness({ enabled: true, mode: "dynamic" })
            );
            await wait(page, () => threadPlayer.loudness.status === "active");
            entry.dynamic = await capture(page, `online-${platform}-dynamic`);
          }
        } catch (error) {
          entry.failure = error.message
            .replace(/https?:\/\/\S+/g, "[URL]")
            .slice(0, 400);
          await page.evaluate(() => threadPlayer.clearPlaylist());
        }
      }
    }
    const reloadEvidence = await page.evaluate(
      async (file) => ({
        lease: await listen1Desktop.prepareAudioSource({
          requestId: "reload-lease",
          trackId: `lmtrack_${file}`,
        }),
        enabled: threadPlayer.loudness.enabled,
        mode: threadPlayer.loudness.mode,
      }),
      fixtures[0]
    );
    assert.ok(reloadEvidence.lease.assetId);
    await page.reload();
    await wait(
      page,
      () =>
        window.threadPlayer && window.angular?.element(document.body).injector()
    );
    const restored = await page.evaluate(async (assetId) => {
      let oldLeaseRejected = false;
      try {
        await listen1Desktop.readAudioSource({ assetId, offset: 0, length: 1 });
      } catch (error) {
        oldLeaseRejected = error.message.includes("INVALID_ASSET");
      }
      return {
        enabled: threadPlayer.loudness.enabled,
        mode: threadPlayer.loudness.mode,
        oldLeaseRejected,
      };
    }, reloadEvidence.lease.assetId);
    assert.equal(restored.oldLeaseRejected, true);
    assert.equal(restored.enabled, reloadEvidence.enabled);
    assert.equal(restored.mode, reloadEvidence.mode);
    report.checks.push(
      "Reload invalidates asset leases and restores saved feature settings"
    );
    assert.deepEqual(report.errors, []);
  } finally {
    await app.close();
    fs.writeFileSync(
      path.join(output, "report.json"),
      JSON.stringify(report, null, 2)
    );
  }
}
main().catch((error) => {
  report.failure = error.stack;
  fs.writeFileSync(
    path.join(output, "report.json"),
    JSON.stringify(report, null, 2)
  );
  console.error(error);
  process.exitCode = 1;
});
