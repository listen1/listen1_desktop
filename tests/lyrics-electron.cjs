// Real Electron UI/IPC/files/playback; remote provider responses are fixtures in
// the default run. --online probes only public search/lyrics in a fresh profile.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { _electron } = require("playwright");
const { writeAudioFixtures } = require("./fixtures.cjs");
const root = path.resolve(__dirname, "..");
const online = process.argv.includes("--online");
const run =
  process.env.LISTEN1_LYRICS_RUN ||
  `lyrics-${online ? "online" : "ui"}-${Date.now()}`;
if (!/^[\w-]+$/.test(run)) throw Error("Invalid test run name");
const output = path.join(root, "dist/maintenance", run);
const profile = path.join(output, "profile");
if (fs.existsSync(profile)) throw Error("Use a new isolated test run name");
fs.mkdirSync(profile, { recursive: true });
fs.writeFileSync(
  path.join(profile, "config.json"),
  JSON.stringify({
    windowState: { width: 1100, height: 800, maximized: false, zoomLevel: 0 },
    proxyConfig: { mode: "direct" },
  })
);
const fixtures = writeAudioFixtures(path.join(output, "fixtures"));
const importedLrc = path.join(output, "fixtures", "replacement.lrc");
const invalidLrc = path.join(output, "fixtures", "invalid.lrc");
const invalidUtf8 = path.join(output, "fixtures", "encoding.lrc");
fs.writeFileSync(
  importedLrc,
  "\uFEFF[ti:Replacement]\r\n[ar:]\r\n\r\n[00:00]导入原文\r\n[00:01][00:03.12]第二行\r\n"
);
fs.writeFileSync(invalidLrc, "[ti:Bad]\n\n正文缺少时间戳\n");
fs.writeFileSync(invalidUtf8, Buffer.from([0xff, 0xfe, 0, 1]));
const report = {
  date: new Date().toISOString(),
  online,
  checks: [],
  sources: [],
  errors: [],
  diagnostics: [],
};
const wait = (page, fn, arg = null, timeout = 12000) =>
  page.waitForFunction(fn, arg, { polling: 100, timeout });
const manager = (page) => page.locator(".track-manager-dialog");
const state = (page) =>
  page.evaluate(() => {
    const value = window.__lyricTestState();
    return {
      target: value.target,
      candidates: value.candidates,
      errorCode: value.errorCode,
      preview: value.preview,
      sourceStates: value.sourceStates,
      searching: value.searching,
    };
  });
const open = async (page, track) => {
  await close(page);
  await page.evaluate((target) => {
    const scope = angular
      .element(document.querySelector("track-manager"))
      .isolateScope();
    scope.$root.$broadcast("track-manager:open", {
      mode: "lyrics",
      track: target,
    });
    scope.$apply();
  }, track);
  await manager(page).waitFor();
};
const close = async (page) => {
  if (await manager(page).count())
    await page.locator(".track-manager-close").click();
  else if (await page.locator(".lyric-search-back").count())
    await page.locator(".lyric-search-back").click();
};
const manageTarget = async (page) => {
  if (!(await manager(page).count())) {
    const target = (await state(page)).target;
    await open(page, target);
  }
};
const override = (page, id) =>
  page.evaluate((trackId) => window.Lyrics.getOverride(trackId), id);
const chooseFile = (app, file) =>
  app.evaluate(({ dialog }, filePath) => {
    dialog.showOpenDialog = async () => ({
      canceled: !filePath,
      filePaths: filePath ? [filePath] : [],
    });
  }, file);

async function launch() {
  const app = await _electron.launch({
    executablePath: require("electron"),
    args: [path.join(__dirname, "electron-entry.cjs")],
    env: { ...process.env, LISTEN1_TEST_USER_DATA: profile },
  });
  const page = await app.firstWindow();
  page.on("pageerror", (error) => report.errors.push(error.message));
  page.on("console", (message) => {
    const prefix = "[Listen1 request] ";
    if (message.text().startsWith(prefix)) {
      try {
        report.diagnostics.push(
          JSON.parse(message.text().slice(prefix.length))
        );
      } catch {}
    }
  });
  if (!online)
    await app.evaluate(({ session }) =>
      session.defaultSession.webRequest.onBeforeRequest(
        { urls: ["http://*/*", "https://*/*"] },
        (details, callback) => callback({ cancel: true })
      )
    );
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].showInactive()
  );
  await wait(
    page,
    () =>
      !!window.listen1Desktop &&
      !!window.l1Player &&
      !!angular.element(document.body).injector()
  );
  await page.evaluate(() => {
    window.__lyricTestState = () => {
      const session = angular
        .element(document.body)
        .injector()
        .get("LyricSearchSession");
      return session.active
        ? session.editor.state
        : angular
            .element(document.querySelector("track-manager"))
            .isolateScope().state;
    };
  });
  return { app, page };
}

async function setupProviders(page) {
  await page.evaluate(
    ({ fileUrl }) => {
      window.__lyricsFixture = {
        delays: {},
        failures: {},
        empty: {},
        fileUrl,
        calls: [],
        searches: [],
      };
      const entries = [
        ["netease", netease, "ne"],
        ["qq", qq, "qq"],
        ["kugou", kugou, "kg"],
        ["kuwo", kuwo, "kw"],
        ["bilibili", bilibili, "bi"],
        ["migu", migu, "mg"],
        ["taihe", taihe, "th"],
      ];
      entries.forEach(([name, provider, prefix]) => {
        provider.search = (url) => ({
          success(fn, failure) {
            window.__lyricsFixture.searches.push({
              name,
              page: Number(getParameterByName("curpage", url)),
              keywords: getParameterByName("keywords", url),
            });
            const pageNumber = Number(getParameterByName("curpage", url));
            setTimeout(() => {
              if (window.__lyricsFixture.failures[name]) {
                failure({ code: window.__lyricsFixture.failures[name] });
                return;
              }
              fn({
                result: [
                  {
                    id: `${prefix}track_candidate_${pageNumber}`,
                    title: `${name} candidate`,
                    artist: "Fixture artist",
                    album: "Fixture album",
                    source: name,
                    lyric_url: "fixture",
                  },
                ],
                total: 2,
                pageSize: 1,
                hasMore: pageNumber === 1,
                type: 0,
              });
            }, 5);
          },
        });
        provider.lyric = (url) => ({
          success(fn, failure) {
            const id = getParameterByName("track_id", url);
            window.__lyricsFixture.calls.push(id);
            setTimeout(() => {
              if (window.__lyricsFixture.failures[id]) {
                failure({ code: window.__lyricsFixture.failures[id] });
                return;
              }
              if (name === "bilibili" || window.__lyricsFixture.empty[id]) {
                fn({ lyric: "", tlyric: "" });
                return;
              }
              if (id.endsWith("_2")) {
                fn({ lyric: "plain untimed lyrics", tlyric: "" });
                return;
              }
              fn({
                lyric: `[00:00]${id} 原文\n[00:01]${id} 第二行`,
                tlyric:
                  name === "kugou"
                    ? ""
                    : `[00:00]${id} 译文\n[00:01]${id} 第二行译文`,
              });
            }, window.__lyricsFixture.delays[id] || 5);
          },
        });
      });
      const original = MediaService.bootstrapTrack.bind(MediaService);
      MediaService.bootstrapTrack = (track, success, failure, options) => {
        if (track.id !== "netrack_fixture_target")
          return original(track, success, failure, options);
        const timer = setTimeout(
          () => success({ url: fileUrl, platform: "netease" }),
          0
        );
        return { cancel: () => clearTimeout(timer) };
      };
    },
    { fileUrl: pathToFileURL(fixtures.audio).href }
  );
}

async function importMusic(app, page) {
  await app.evaluate(
    ({ dialog }, files) => {
      dialog.showOpenDialog = async () => ({
        canceled: false,
        filePaths: files,
      });
    },
    [fixtures.audio, fixtures.plain, fixtures.broken]
  );
  await page.evaluate(() =>
    angular
      .element(document.querySelector('[ng-controller="NavigationController"]'))
      .scope()
      .addLocalMusic()
  );
  await wait(
    page,
    () => localStorage.getObject("lmplaylist_reserve")?.tracks.length === 3
  );
  return page.evaluate(
    () => localStorage.getObject("lmplaylist_reserve").tracks
  );
}

async function currentLyrics(page) {
  return page.evaluate(
    () =>
      angular
        .element(
          document.querySelector('[ng-controller="PlayController as playCtrl"]')
        )
        .scope().lyricArray
  );
}

async function search(page, source = "allmusic", keywords = "fixture") {
  if (await manager(page).count())
    await page.locator(".open-lyric-search").click();
  await page.locator(".lyric-search-keywords").fill(keywords);
  await page.locator(".lyric-search-keywords").press("Enter");
  await wait(page, () => !window.__lyricTestState().searching, null, 22000);
  await page.locator('[data-lyric-source="' + source + '"]').click();
}

async function select(page, id) {
  await page.locator(`[data-candidate-id="${id}"]`).click();
  await wait(page, () => !window.__lyricTestState().previewing, null, 20000);
}

async function offlineChecks(app, page) {
  await setupProviders(page);
  const tracks = await importMusic(app, page);
  const local = tracks[0];
  assert.equal(local.title, path.basename(fixtures.audio, ".wav"));
  assert.equal(local.artist, "Fixture artist");
  assert.equal(tracks[1].artist, "");
  report.checks.push(
    "filename defaults, optional tags and real desktop audio import"
  );
  await page.evaluate(() => {
    const nav = angular
      .element(document.querySelector('[ng-controller="NavigationController"]'))
      .scope();
    nav.showPlaylist("lmplaylist_reserve");
  });
  const row = page
    .locator(".detail-songlist li")
    .filter({ hasText: local.title });
  await page.mouse.move(5, 5);
  assert.equal(
    await row
      .locator("track-actions")
      .evaluate((node) => getComputedStyle(node).opacity),
    "0"
  );
  await row.hover();
  assert.equal(await row.locator(".manage-lyrics").isVisible(), true);
  await row.locator(".edit-local-track").click();
  await page.locator(".metadata-title").fill("User title");
  await page.locator(".metadata-artist").fill("A_B");
  await page.locator(".metadata-album").fill("");
  await page.locator(".save-local-metadata").click();
  assert.equal(
    (
      await page.evaluate(
        () => localStorage.getObject("lmplaylist_reserve").tracks[0]
      )
    ).title,
    "User title"
  );
  await close(page);
  await importMusic(app, page);
  assert.equal(
    (
      await page.evaluate(
        () => localStorage.getObject("lmplaylist_reserve").tracks[0]
      )
    ).title,
    "User title"
  );
  report.checks.push(
    "local metadata editing and duplicate imports preserve manual information"
  );
  const updated = await page.evaluate(
    () => localStorage.getObject("lmplaylist_reserve").tracks[0]
  );
  const network = {
    id: "netrack_fixture_target",
    title: "Network target",
    artist: "Artist",
    album: "Album",
    source: "netease",
    source_url: "https://music.163.com/",
  };
  await page.evaluate(
    ([a, b]) => {
      l1Player.setNewPlaylist([a, b]);
      l1Player.mute();
      l1Player.play();
    },
    [updated, network]
  );
  await wait(
    page,
    () => threadPlayer.playing && threadPlayer.currentHowl?.seek() > 0
  );
  await page.evaluate(() => {
    l1Player.pause();
    l1Player.seek(0.05);
    window.__lyricsHowl = threadPlayer.currentHowl;
  });
  await page.evaluate(() => {
    const nav = angular
      .element(document.querySelector('[ng-controller="NavigationController"]'))
      .scope();
    nav.toggleNowPlaying();
    nav.$apply();
    const play = angular
      .element(
        document.querySelector('[ng-controller="PlayController as playCtrl"]')
      )
      .scope();
    play.enableLyricFloatingWindowTranslation = true;
  });
  await page.locator(".nowplaying-track-actions .manage-lyrics").click();
  const modalBox = await manager(page).boundingBox();
  const inside = { x: modalBox.x + 40, y: modalBox.y + 35 };
  const outside = { x: 10, y: 10 };
  for (const [start, end] of [
    [inside, outside],
    [outside, inside],
  ]) {
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(end.x, end.y, { steps: 10 });
    await page.mouse.up();
    assert.equal(await manager(page).count(), 1);
  }
  await page.mouse.click(10, 10);
  assert.equal(await manager(page).count(), 0);
  await open(page, updated);
  await page.keyboard.press("Escape");
  assert.equal(await manager(page).count(), 0);
  await open(page, updated);
  report.checks.push(
    "inside/outside drag gestures stay open; stationary backdrop and Escape close"
  );
  await search(page);
  assert.equal((await state(page)).candidates.length, 7);
  const searchCount = await page.evaluate(
    () => window.__lyricsFixture.searches.length
  );
  await page.locator('[data-lyric-source="qq"]').click();
  assert.equal((await state(page)).candidates.length, 1);
  await page.locator('[data-lyric-source="allmusic"]').click();
  assert.equal(
    await page.evaluate(() => window.__lyricsFixture.searches.length),
    searchCount
  );
  report.checks.push(
    "row icons appear on hover; platform filtering reads cached results without requests"
  );
  await select(page, "qqtrack_candidate_1");
  await page.locator(".apply-lyrics").click();
  await wait(page, () =>
    angular
      .element(
        document.querySelector('[ng-controller="PlayController as playCtrl"]')
      )
      .scope()
      .lyricArray.some((line) => line.translationFlag)
  );
  assert.equal((await override(page, local.id)).tlyric.includes("译文"), true);
  assert.equal((await override(page, local.id)).provenance.platform, "qq");
  assert.equal(
    await page.evaluate(
      () =>
        window.__lyricsHowl === threadPlayer.currentHowl &&
        !threadPlayer.playing
    ),
    true
  );
  report.checks.push(
    "aggregate search, candidate preview, replacement and paused playback identity"
  );
  const floatingReady = app.waitForEvent("window", { timeout: 8000 });
  await page.evaluate(() =>
    window.listen1Desktop.control("enable_lyric_floating_window", "")
  );
  const floating = await floatingReady;
  await floating.waitForURL(/floatingWindow\.html/);
  await floating.waitForSelector("#currentLyricTrans", { state: "attached" });
  // Force an unchanged primary line too: the floating translation must update.
  await page.evaluate(() => threadPlayer.sendFrameUpdate());
  await wait(floating, () =>
    document.getElementById("currentLyricTrans").textContent.includes("译文")
  );
  await manageTarget(page);
  await page.locator(".toggle-lyric-timing").click();
  await page.evaluate(() => {
    threadPlayer.currentHowl.seek(0.9);
    threadPlayer.sendFrameUpdate();
  });
  await wait(
    floating,
    () =>
      !document.getElementById("currentLyric").textContent.includes("第二行")
  );
  const lyricCalls = await page.evaluate(
    () => window.__lyricsFixture.calls.length
  );
  await page.locator(".lyric-earlier").click();
  await wait(
    floating,
    () =>
      document.getElementById("currentLyric").textContent.includes("第二行") &&
      document
        .getElementById("currentLyricTrans")
        .textContent.includes("第二行译文")
  );
  assert.equal(
    await page.evaluate((id) => Lyrics.getOffset(id), local.id),
    -300
  );
  await page.locator(".lyric-later").click();
  await wait(
    floating,
    () =>
      !document.getElementById("currentLyric").textContent.includes("第二行")
  );
  await page.locator(".lyric-later").click();
  assert.equal(
    await page.evaluate((id) => Lyrics.getOffset(id), local.id),
    300
  );
  await page.evaluate(() => {
    threadPlayer.currentHowl.seek(1.1);
    threadPlayer.sendFrameUpdate();
  });
  await wait(
    floating,
    () =>
      !document.getElementById("currentLyric").textContent.includes("第二行")
  );
  await page.locator(".toggle-lyric-timing").click();
  assert.ok(
    (await page.locator(".toggle-lyric-timing").innerText()).includes("+0.3")
  );
  await page.locator(".toggle-lyric-timing").click();
  await page.locator(".lyric-reset").click();
  await wait(floating, () =>
    document.getElementById("currentLyric").textContent.includes("第二行")
  );
  assert.equal(await page.evaluate((id) => Lyrics.getOffset(id), local.id), 0);
  assert.equal(
    await page.evaluate(() => window.__lyricsFixture.calls.length),
    lyricCalls
  );
  await page.evaluate((id) => {
    Lyrics.setOffset(id, 60000);
    angular
      .element(document.body)
      .injector()
      .get("$rootScope")
      .$broadcast("lyrics:offset-changed", id);
    angular.element(document.body).injector().get("$rootScope").$apply();
  }, local.id);
  assert.equal(await page.locator(".lyric-later").isDisabled(), true);
  await page.locator(".lyric-reset").click();
  await page.locator(".lyric-earlier").click();
  await page.screenshot({ path: path.join(output, "timing-modal.png") });
  report.checks.push(
    "paused ±0.3 s alignment updates primary and translation in both windows without fetching lyrics"
  );
  await chooseFile(app, importedLrc);
  await manageTarget(page);
  await page.locator(".import-local-lyric").click();
  await wait(page, () => window.__lyricTestState().preview?.ready);
  await page.locator(".apply-lyrics").click();
  assert.equal(await page.evaluate((id) => Lyrics.getOffset(id), local.id), 0);
  await wait(
    floating,
    () => document.getElementById("currentLyricTrans").textContent === ""
  );
  assert.equal((await override(page, local.id)).tlyric, "");
  assert.equal(
    (await override(page, local.id)).provenance.fileName,
    path.basename(importedLrc)
  );
  assert.equal(
    (await currentLyrics(page)).some((line) => line.translationFlag),
    false
  );
  report.checks.push(
    "UTF-8 LRC import clears saved, displayed and floating translations while paused"
  );
  for (const [file, expected] of [
    [invalidLrc, "INVALID_LRC"],
    [invalidUtf8, "INVALID_UTF8"],
  ]) {
    await chooseFile(app, file);
    await manageTarget(page);
    await page.locator(".import-local-lyric").click();
    await wait(
      page,
      (code) => window.__lyricTestState().errorCode === code,
      expected
    );
    assert.equal(await page.locator(".apply-lyrics").isDisabled(), true);
    assert.equal(
      (await override(page, local.id)).lyric.includes("导入原文"),
      true
    );
  }
  await chooseFile(app, null);
  await manageTarget(page);
  await page.locator(".import-local-lyric").click();
  await wait(page, () => !window.__lyricTestState().importing);
  assert.equal(
    (await override(page, local.id)).lyric.includes("导入原文"),
    true
  );
  report.checks.push(
    "bad body line, invalid encoding and cancellation retain prior lyrics"
  );
  await manageTarget(page);
  await page.locator(".restore-original-lyric").click();
  await wait(page, () => !window.__lyricTestState().previewing);
  assert.equal(await override(page, local.id), null);
  await wait(page, () =>
    angular
      .element(
        document.querySelector('[ng-controller="PlayController as playCtrl"]')
      )
      .scope()
      .lyricArray.some((line) => line.content.includes("合成歌词"))
  );
  await page.locator(".lyric-later").click();
  assert.equal(await override(page, local.id), null);
  assert.equal(
    await page.evaluate((id) => Lyrics.getOffset(id), local.id),
    300
  );
  await page.locator(".lyric-reset").click();
  await search(page, "bilibili");
  await select(page, "bitrack_candidate_1");
  assert.equal((await state(page)).errorCode, "NO_SYNC_LYRIC");
  await search(page, "qq");
  await page.locator(".lyric-pagination button").last().click();
  await wait(
    page,
    () => window.__lyricTestState().candidates[0]?.id === "qqtrack_candidate_2"
  );
  await select(page, "qqtrack_candidate_2");
  assert.equal((await state(page)).errorCode, "NO_SYNC_LYRIC");
  await page.evaluate(() => {
    window.__lyricsFixture.failures.qq = "NETWORK";
  });
  await search(page, "qq");
  assert.equal((await state(page)).sourceStates[0].code, "NETWORK");
  await page.evaluate(() => {
    delete window.__lyricsFixture.failures.qq;
  });
  report.checks.push(
    "restore, pagination, empty/untimed lyrics and explicit network failure"
  );
  await close(page);
  await page.evaluate(() => {
    l1Player.loadById("netrack_fixture_target");
    l1Player.play();
  });
  await wait(
    page,
    () =>
      threadPlayer.currentAudio?.id === "netrack_fixture_target" &&
      threadPlayer.currentHowl?.state() === "loaded"
  );
  await page.evaluate(() => l1Player.pause());
  await open(page, network);
  await search(page);
  await select(page, "qqtrack_candidate_1");
  await page.locator(".apply-lyrics").click();
  await wait(page, () =>
    angular
      .element(
        document.querySelector('[ng-controller="PlayController as playCtrl"]')
      )
      .scope()
      .lyricArray.some((line) => line.content.includes("qqtrack"))
  );
  await chooseFile(app, importedLrc);
  await manageTarget(page);
  await page.locator(".import-local-lyric").click();
  await wait(page, () => window.__lyricTestState().preview?.ready);
  await page.locator(".apply-lyrics").click();
  assert.equal((await override(page, network.id)).tlyric, "");
  assert.equal(
    await page.evaluate(
      () =>
        threadPlayer.currentAudio.id === "netrack_fixture_target" &&
        threadPlayer.currentAudio.source === "netease"
    ),
    true
  );
  report.checks.push(
    "network target supports both searched lyrics and imported LRC without source changes"
  );
  await page.evaluate(() => {
    window.__lyricsFixture.failures.netrack_fixture_target = "TIMEOUT";
  });
  await manageTarget(page);
  await page.locator(".restore-original-lyric").click();
  await wait(page, () => window.__lyricTestState().errorCode === "TIMEOUT");
  assert.equal(
    (await override(page, network.id)).lyric.includes("导入原文"),
    true
  );
  await page.evaluate(() => {
    delete window.__lyricsFixture.failures.netrack_fixture_target;
  });
  await page.locator(".track-manager-error button").click();
  await page.evaluate(() =>
    angular
      .element(
        document.querySelector('[ng-controller="PlayController as playCtrl"]')
      )
      .scope()
      .retryLyrics()
  );
  await wait(page, () =>
    angular
      .element(
        document.querySelector('[ng-controller="PlayController as playCtrl"]')
      )
      .scope()
      .lyricArray.some((line) =>
        line.content.includes("netrack_fixture_target")
      )
  );
  report.checks.push(
    "failed restore retains old lyrics and timing until retry succeeds"
  );
  // A target stays fixed when playback changes, including an A -> B -> A cycle.
  await page.evaluate(() => {
    l1Player.loadById(l1Player.status.playlist[0].id);
  });
  await search(page);
  await select(page, "kgtrack_candidate_1");
  assert.equal((await state(page)).target.id, network.id);
  await page.locator(".apply-lyrics").click();
  assert.equal(
    (await override(page, network.id)).lyric.includes("kgtrack"),
    true
  );
  assert.equal(await override(page, local.id), null);
  await manageTarget(page);
  await page.locator(".toggle-lyric-timing").click();
  await page.locator(".lyric-later").click();
  assert.equal(
    await page.evaluate((id) => Lyrics.getOffset(id), network.id),
    300
  );
  assert.equal(
    await page.evaluate(() => threadPlayer.currentAudio.id),
    local.id
  );
  report.checks.push(
    "offset controls keep the nonplaying target fixed and disable the ±60 s boundary"
  );
  await close(page);
  await page.evaluate(() => {
    window.Lyrics.removeOverride("netrack_fixture_target");
    window.__lyricsFixture.delays.netrack_fixture_target = 700;
    l1Player.loadById("netrack_fixture_target");
  });
  await open(page, network);
  await search(page);
  await select(page, "qqtrack_candidate_1");
  await page.locator(".apply-lyrics").click();
  await page.evaluate(() => {
    const a = l1Player.status.playlist[0].id;
    l1Player.loadById(a);
    l1Player.loadById("netrack_fixture_target");
  });
  await wait(page, () =>
    angular
      .element(
        document.querySelector('[ng-controller="PlayController as playCtrl"]')
      )
      .scope()
      .lyricArray.some((line) => line.content.includes("qqtrack"))
  );
  await page.waitForTimeout(800);
  assert.equal(
    (await currentLyrics(page)).some((line) =>
      line.content.includes("qqtrack")
    ),
    true
  );
  // Continuous preview selection: a late A cannot replace the selected B.
  await page.evaluate(() => {
    window.__lyricsFixture.delays.qqtrack_candidate_1 = 500;
  });
  await page.locator('[data-candidate-id="qqtrack_candidate_1"]').click();
  await page.locator('[data-candidate-id="kgtrack_candidate_1"]').click();
  await wait(page, () => window.__lyricTestState().preview?.ready);
  await page.locator(".apply-lyrics").click();
  await page.waitForTimeout(550);
  assert.equal(
    (await override(page, network.id)).lyric.includes("kgtrack"),
    true
  );
  report.checks.push(
    "fixed target, late original lyrics, A-B-A switching and continuous replacements"
  );
  const savedTarget = (await state(page)).target.id;
  const savedCandidates = (await state(page)).candidates.map(
    (track) => track.id
  );
  await page.evaluate(() => {
    const scope = angular
      .element(document.querySelector('[ng-controller="ProfileController"]'))
      .scope();
    scope.setTheme("white2");
    scope.$apply();
  });
  await wait(
    page,
    () =>
      angular.element(document.body).injector().get("LyricSearchSession")
        .active && !!document.querySelector(".lyric-search-page")
  );
  assert.equal((await state(page)).target.id, savedTarget);
  assert.deepEqual(
    (await state(page)).candidates.map((track) => track.id),
    savedCandidates
  );
  report.checks.push(
    "theme layout reconstruction keeps the fixed search target and completed cached results"
  );
  await close(page);
  for (const theme of ["white", "black", "white2", "black2"]) {
    await page.evaluate((value) => {
      const profileScope = angular
        .element(document.querySelector('[ng-controller="ProfileController"]'))
        .scope();
      profileScope.setTheme(value);
      profileScope.$apply();
    }, theme);
    await wait(
      page,
      () =>
        document.querySelectorAll(
          '[ng-controller="PlayController as playCtrl"]'
        ).length === 1
    );
    await page.evaluate(() => {
      const nav = angular
        .element(
          document.querySelector('[ng-controller="NavigationController"]')
        )
        .scope();
      if (nav.getCurrentUrl() !== "/now_playing") nav.toggleNowPlaying();
      nav.$apply();
    });
    await wait(page, () =>
      angular
        .element(
          document.querySelector('[ng-controller="PlayController as playCtrl"]')
        )
        .scope()
        .lyricArray.some((line) => line.content.includes("kgtrack"))
    );
    await page.locator(".nowplaying-track-actions .manage-lyrics").click();
    assert.equal((await state(page)).target.id, network.id);
    await page.locator(".toggle-lyric-timing").click();
    await page.screenshot({ path: path.join(output, `modal-${theme}.png`) });
    await search(page);
    await select(page, "kgtrack_candidate_1");
    await page.evaluate(() => {
      document.querySelector(".browser").scrollTop = 0;
    });
    await page.screenshot({ path: path.join(output, `dialog-${theme}.png`) });
    assert.equal(await page.locator(".lyric-search-page").count(), 1);
    const box = await page.locator(".lyric-search-page").boundingBox();
    assert.ok(box.width > 400 && box.x >= 0, JSON.stringify(box));
    await close(page);
  }
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()
      .find(
        (window) =>
          !window.isDestroyed() &&
          window.webContents.getURL().includes("listen1.html")
      )
      .setSize(760, 800)
  );
  await open(page, network);
  await search(page);
  await select(page, "kgtrack_candidate_1");
  const columns = await page
    .locator(".lyric-search-columns")
    .evaluate((element) => getComputedStyle(element).gridTemplateColumns);
  assert.equal(columns.trim().split(/\s+/).length, 1);
  const searchBox = await page.locator(".lyric-search-page").boundingBox();
  assert.ok(
    searchBox.x + searchBox.width <= (await page.evaluate(() => innerWidth)) + 2
  );
  await page.locator(".apply-lyrics").scrollIntoViewIfNeeded();
  const applyBox = await page.locator(".apply-lyrics").boundingBox();
  const footerTop = await page
    .locator(".footer")
    .evaluate((element) => element.getBoundingClientRect().top);
  assert.ok(
    applyBox.y + applyBox.height <= footerTop + 2,
    JSON.stringify({ applyBox, footerTop })
  );
  await page.screenshot({ path: path.join(output, "search-narrow.png") });
  await close(page);
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()
      .find(
        (window) =>
          !window.isDestroyed() &&
          window.webContents.getURL().includes("listen1.html")
      )
      .setSize(1100, 800)
  );
  report.checks.push("narrow windows place preview below results");
  for (const language of [
    "zh-CN",
    "zh-TC",
    "en-US",
    "fr-FR",
    "ko-KR",
    "pt-BR",
  ]) {
    await page.evaluate(async (value) => {
      const profileScope = angular
        .element(document.querySelector('[ng-controller="ProfileController"]'))
        .scope();
      profileScope.setLang(value);
      await i18next.changeLanguage(value);
      profileScope.$applyAsync();
    }, language);
    await wait(
      page,
      (value) =>
        i18next.language === value &&
        !i18next.t("_LYRIC_MANAGE").startsWith("_"),
      language
    );
    await open(page, network);
    await page.locator(".toggle-lyric-timing").click();
    assert.equal((await manager(page).innerText()).includes("_LYRIC_"), false);
    await close(page);
  }
  report.checks.push(
    "four themes, two layouts and six languages use one shared dialog"
  );
  await open(page, {
    id: "bitrack_no_lyrics",
    title: "No lyrics",
    source: "bilibili",
  });
  await page.locator(".toggle-lyric-timing").click();
  await wait(page, () => !window.__lyricTestState().checking);
  assert.equal(await page.locator(".lyric-earlier").isDisabled(), true);
  assert.equal(await page.locator(".lyric-later").isDisabled(), true);
  await page.evaluate(() => {
    Lyrics.setOffset("bitrack_no_lyrics", 300);
    const root = angular.element(document.body).injector().get("$rootScope");
    root.$broadcast("lyrics:offset-changed", "bitrack_no_lyrics");
    root.$apply();
  });
  await page.locator(".lyric-reset").click();
  assert.equal(
    await page.evaluate(() => Lyrics.getOffset("bitrack_no_lyrics")),
    0
  );
  await close(page);
  report.checks.push(
    "original-only timing uses the provider; empty lyrics disable shifts and still allow reset"
  );
  await open(page, network);
  await page.locator(".toggle-lyric-timing").click();
  await page.locator(".lyric-later").click();
  await page.locator(".lyric-later").click();
  await page.locator(".lyric-later").click();
  assert.equal(
    await page.evaluate((id) => Lyrics.getOffset(id), network.id),
    900
  );
  await close(page);
  await page.evaluate(() => {
    localStorage.setObject("language", "zh-CN");
    const items = {};
    Object.keys(localStorage).forEach((key) => {
      items[key] = localStorage.getObject(key);
    });
    window.__lyricBackup = JSON.stringify(items);
    window.Lyrics.removeOverride("netrack_fixture_target");
    Object.entries(JSON.parse(window.__lyricBackup)).forEach(([key, value]) =>
      localStorage.setObject(key, value)
    );
  });
  assert.equal(
    (await override(page, network.id)).lyric.includes("kgtrack"),
    true
  );
  assert.equal(
    await page.evaluate((id) => Lyrics.getOffset(id), network.id),
    900
  );
  return { local, network };
}

async function onlineChecks(page, local) {
  const names = [
    "netease",
    "qq",
    "kugou",
    "kuwo",
    "bilibili",
    "migu",
    "taihe",
  ].filter(
    (name) =>
      !process.env.LISTEN1_LYRICS_SOURCES ||
      process.env.LISTEN1_LYRICS_SOURCES.split(",").includes(name)
  );
  for (const source of names) {
    await open(page, local);
    await search(page, source, "夜曲");
    const result = await state(page);
    const record = {
      source,
      search: {
        code:
          result.sourceStates.find((status) => status.name === source)?.code ||
          result.errorCode ||
          null,
        count: result.candidates.length,
      },
      candidates: [],
    };
    for (const candidate of result.candidates.slice(0, 3)) {
      await select(page, candidate.id);
      const preview = await state(page);
      const evidence = {
        id: candidate.id,
        code: preview.errorCode || null,
        synchronized: !!preview.preview?.ready,
      };
      if (preview.errorCode === "NO_SYNC_LYRIC") {
        evidence.response = await page.evaluate(async (track) => {
          const data = await MediaService.getLyric(
            track.id,
            track.album_id,
            track.lyric_url,
            track.tlyric_url,
            { original: true }
          ).promise;
          return {
            type: typeof data.lyric,
            length: typeof data.lyric === "string" ? data.lyric.length : null,
            html:
              typeof data.lyric === "string" &&
              /^\s*(?:<!doctype\s+html|<html)/i.test(data.lyric),
            timedLines: window.Lyrics.parse(data.lyric, "").length,
          };
        }, candidate);
      }
      record.candidates.push(evidence);
      if (!preview.preview?.ready) continue;
      await page.locator(".apply-lyrics").click();
      record.localSaved = !!(await override(page, local.id));
      await close(page);
      // This target is an actual search result; no remote audio playback is needed.
      await open(page, candidate);
      await page.evaluate((track) => {
        angular
          .element(document.querySelector("track-manager"))
          .isolateScope()
          .select(track);
      }, candidate);
      await wait(
        page,
        () => !window.__lyricTestState().previewing,
        null,
        20000
      );
      const networkPreview = await state(page);
      if (networkPreview.preview?.ready) {
        await page.locator(".apply-lyrics").click();
        record.networkSaved = !!(await override(page, candidate.id));
        const target = (await state(page)).target;
        assert.equal(target.id, candidate.id);
        assert.equal(target.source, candidate.source);
      } else record.networkCode = networkPreview.errorCode;
      break;
    }
    report.sources.push(record);
    console.log(JSON.stringify(record));
    await close(page);
  }
}

async function main() {
  let { app, page } = await launch();
  try {
    if (online) {
      const tracks = await importMusic(app, page);
      await onlineChecks(page, tracks[0]);
    } else {
      const { local, network } = await offlineChecks(app, page);
      await app.close();
      ({ app, page } = await launch());
      await wait(page, () =>
        window.Lyrics.getOverride("netrack_fixture_target")?.lyric.includes(
          "kgtrack"
        )
      );
      assert.equal((await override(page, network.id)).tlyric, "");
      assert.equal(
        await page.evaluate((id) => Lyrics.getOffset(id), network.id),
        900
      );
      assert.equal(
        (
          await page.evaluate(
            () => localStorage.getObject("lmplaylist_reserve").tracks[0]
          )
        ).title,
        "User title"
      );
      assert.equal(
        (
          await page.evaluate(
            () => localStorage.getObject("lmplaylist_reserve").tracks[0]
          )
        ).id,
        local.id
      );
      await setupProviders(page);
      await page.evaluate(() => {
        l1Player.setNewPlaylist(localStorage.getObject("current-playing"));
        l1Player.loadById("netrack_fixture_target");
      });
      await wait(page, () =>
        angular
          .element(
            document.querySelector(
              '[ng-controller="PlayController as playCtrl"]'
            )
          )
          .scope()
          .lyricArray.some((line) => line.content.includes("kgtrack"))
      );
      report.checks.push(
        "JSON backup and real application restart restore lyrics and metadata"
      );
    }
    assert.deepEqual(report.errors, []);
    console.log(report.checks.join("\n"));
  } finally {
    fs.writeFileSync(
      path.join(output, "report.json"),
      JSON.stringify(report, null, 2)
    );
    await app.close();
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
