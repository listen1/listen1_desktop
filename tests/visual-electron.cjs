// Real isolated Electron UI, storage, IPC, file decoding and playback. Network
// metadata uses deterministic Range responses; it is not an online-service test.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { _electron } = require("playwright");
const { writeAudioFixtures } = require("./fixtures.cjs");
const root = path.resolve(__dirname, "..");
const run = process.env.LISTEN1_VISUAL_RUN || `visual-${Date.now()}`;
if (!/^[\w-]+$/.test(run)) throw Error("Invalid run name");
const output = path.join(root, "dist/maintenance", run);
const profile = path.join(output, "profile");
if (fs.existsSync(profile)) throw Error("Use a new isolated profile");
fs.mkdirSync(profile, { recursive: true });
fs.writeFileSync(
  path.join(profile, "config.json"),
  JSON.stringify({
    windowState: { width: 1280, height: 900, maximized: false, zoomLevel: 0 },
    proxyConfig: { mode: "direct" },
  })
);
const fixtures = writeAudioFixtures(path.join(output, "fixtures"));
const coverFile = path.join(output, "fixtures", "封面副本 #1.png");
const jpegFile = path.join(output, "fixtures", "真实图片.jpg");
const webpFile = path.join(output, "fixtures", "真实图片.webp");
const badCover = path.join(output, "fixtures", "invalid.png");
const lyricFile = path.join(output, "fixtures", "手动歌词.lrc");
fs.writeFileSync(badCover, "not an image");
fs.writeFileSync(lyricFile, "[00:00]手动原文\n[00:01]第二行");
const report = {
  date: new Date().toISOString(),
  checks: [],
  screenshots: [],
  errors: [],
};
const wait = (page, fn, arg = null) =>
  page.waitForFunction(fn, arg, { polling: 100, timeout: 12000 });
const state = (page) =>
  page.evaluate(() => ({
    id: window.threadPlayer.currentAudio?.id,
    playing: window.threadPlayer.playing,
    position: window.threadPlayer.currentHowl?.seek(),
  }));
const choose = (app, file) =>
  app.evaluate(({ dialog }, target) => {
    dialog.showOpenDialog = async () => ({
      canceled: !target,
      filePaths: target ? [target] : [],
    });
  }, file);
const close = async (page) => {
  if (await page.locator(".track-manager-close").count())
    await page.locator(".track-manager-close").click();
};
const detail = (page, field) =>
  page.locator(`[data-detail-field="${field}"] dd`).innerText();
const openDetails = async (page, track) => {
  await close(page);
  await page.evaluate((song) => {
    const scope = angular
      .element(document.querySelector("track-details"))
      .isolateScope();
    scope.$root.$broadcast("track-details:open", song);
    scope.$apply();
  }, track);
  await page.locator(".track-details-dialog").waitFor();
};
const navigate = (page, id = "lmplaylist_reserve") =>
  page.evaluate((list) => {
    const scope = angular
      .element(document.querySelector('[ng-controller="NavigationController"]'))
      .scope();
    scope.showPlaylist(list);
    scope.$apply();
  }, id);
const screenshot = async (page, name) => {
  await page.evaluate(() => window.notyf?.dismissAll());
  await page.waitForFunction(
    () => document.querySelectorAll(".notyf__toast").length === 0,
    null,
    { polling: 100, timeout: 4000 }
  );
  await page.screenshot({
    animations: "disabled",
    path: path.join(output, `${name}.png`),
  });
  report.screenshots.push(`${name}.png`);
};

async function launch(online = false) {
  const app = await _electron.launch({
    executablePath: require("electron"),
    args: [path.join(__dirname, "electron-entry.cjs")],
    env: { ...process.env, LISTEN1_TEST_USER_DATA: profile },
  });
  const page = await app.firstWindow();
  page.on("pageerror", (error) => report.errors.push(error.message));
  await app.evaluate(({ session, BrowserWindow }, allowNetwork) => {
    if (!allowNetwork)
      session.defaultSession.webRequest.onBeforeRequest(
        { urls: ["http://*/*", "https://*/*"] },
        (request, callback) => callback({ cancel: true })
      );
    BrowserWindow.getAllWindows()[0].show();
    BrowserWindow.getAllWindows()[0].focus();
  }, online);
  await wait(
    page,
    () =>
      !!window.listen1Desktop &&
      !!window.threadPlayer &&
      !!angular.element(document.body).injector()
  );
  return { app, page };
}

async function onlineChecks(page) {
  report.online = [];
  for (const source of ["netease", "qq", "kuwo"]) {
    const result = await page.evaluate(async (platform) => {
      try {
        const search = await MediaService.search(platform, {
          keywords: "夜曲",
          curpage: 1,
          type: 0,
        }).promise;
        const song = search.result[0];
        if (!song) return { source: platform, status: "empty-search" };
        const presentation = angular
          .element(document.body)
          .injector()
          .get("TrackPresentation");
        const info = await presentation.query(song).promise;
        return {
          source: platform,
          status: info.error || "parsed",
          audioInfo: info.audioInfo,
          fileSize: info.fileSize,
        };
      } catch (error) {
        return { source: platform, status: error.code || "error" };
      }
    }, source);
    report.online.push(result);
    console.log(JSON.stringify(result));
    assert.equal(await page.evaluate(() => window.threadPlayer.playing), false);
  }
}

async function check(app, page) {
  const png = await app.evaluate(({ nativeImage }) => {
    const bitmap = Buffer.alloc(64 * 64 * 4);
    for (let index = 0; index < bitmap.length; index += 4) {
      bitmap[index] = 180;
      bitmap[index + 1] = 90;
      bitmap[index + 2] = 70;
      bitmap[index + 3] = 255;
    }
    const image = nativeImage.createFromBitmap(bitmap, {
      width: 64,
      height: 64,
    });
    return {
      png: image.toPNG().toString("base64"),
      jpeg: image.toJPEG(90).toString("base64"),
    };
  });
  fs.writeFileSync(coverFile, Buffer.from(png.png, "base64"));
  fs.writeFileSync(jpegFile, Buffer.from(png.jpeg, "base64"));
  fs.writeFileSync(
    webpFile,
    Buffer.from(
      "UklGRqwAAABXRUJQVlA4WAoAAAAQAAAABwAABwAAQUxQSDgAAAABZ6CojRQ4uRdgii9SiIjAiaY30jwUQ5Ik9W8kRmAR1nEhbpW7rFYiov+hEZXBJviD9Cd4BlMPAlZQOCBOAAAAsAEAnQEqCAAIAAIANCWkAAL3ha9EqAD++IMT3BP5r+daj/jf+ui037SugCpn5hUTdIylL5zrf7CoV5n/3wrys0p/blFjy/kj8gAfAAAA",
      "base64"
    )
  );
  await choose(app, fixtures.audio);
  await page.evaluate(() =>
    angular
      .element(document.querySelector('[ng-controller="NavigationController"]'))
      .scope()
      .addLocalMusic()
  );
  await wait(
    page,
    () => localStorage.getObject("lmplaylist_reserve")?.tracks.length === 1
  );
  const local = await page.evaluate(
    () => localStorage.getObject("lmplaylist_reserve").tracks[0]
  );
  const title = "很长的完整歌名 · Kaleidoscope heart 万花筒之心 · "
    .repeat(4)
    .trim();
  await page.evaluate(
    ({ id, title }) => {
      const fields = MediaService.updateLocalTrack(id, {
        title,
        artist: "Fixture artist",
        album: "很长的专辑名",
      });
      localStorage.setObject("playerlists", ["myplaylist_visual"]);
      localStorage.setObject("myplaylist_visual", {
        info: {
          id: "myplaylist_visual",
          title: "测试歌单",
          cover_img_url: "missing-cover.png",
        },
        tracks: [{ ...localStorage.getObject("lmplaylist_reserve").tracks[0] }],
      });
      l1Player.setNewPlaylist([
        localStorage.getObject("lmplaylist_reserve").tracks[0],
      ]);
      l1Player.mute();
      l1Player.play();
      angular
        .element(document.body)
        .injector()
        .get("$rootScope")
        .$broadcast("myplaylist:update");
    },
    { id: local.id, title }
  );
  local.title = title;
  await wait(page, () => window.threadPlayer.currentHowl?.state() === "loaded");
  await page.evaluate(() => {
    l1Player.pause();
    window.threadPlayer.currentHowl.seek(17);
    l1Player.requestFrameUpdate();
  });
  const baseline = await state(page);
  await wait(page, () =>
    [...document.querySelectorAll(".footer img[track-cover]")].some(
      (image) => image.naturalWidth > 0
    )
  );
  await navigate(page);
  const row = page
    .locator(".detail-songlist li:visible")
    .filter({ has: page.locator("track-actions") })
    .first();
  await row.hover();
  await row.locator(".edit-local-track").click();
  for (const file of [jpegFile, webpFile]) {
    await choose(app, file);
    await page.locator(".choose-local-cover").click();
    await wait(
      page,
      () =>
        !angular.element(document.querySelector("track-manager")).isolateScope()
          .state.coverLoading
    );
    assert.equal(
      await page.evaluate(
        () =>
          angular
            .element(document.querySelector("track-manager"))
            .isolateScope().state.cover?.fileName
      ),
      path.basename(file)
    );
  }
  await choose(app, badCover);
  await page.locator(".choose-local-cover").click();
  await wait(
    page,
    () =>
      !!angular.element(document.querySelector("track-manager")).isolateScope()
        .state.error
  );
  assert.equal(
    await page.evaluate(
      () =>
        localStorage.getObject("lmplaylist_reserve").tracks[0].cover_asset_id
    ),
    undefined
  );
  await choose(app, coverFile);
  await page.locator(".choose-local-cover").click();
  await wait(
    page,
    () =>
      !!angular.element(document.querySelector("track-manager")).isolateScope()
        .state.cover
  );
  await screenshot(page, "cover-preview");
  // Storage failure must leave every old snapshot and the current transport intact.
  await page.evaluate(() => {
    window.__originalSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === "myplaylist_visual" && value.includes("cover_asset_id"))
        throw Error("fixture quota");
      return window.__originalSetItem.call(this, key, value);
    };
  });
  await page.locator(".save-local-metadata").click();
  await wait(
    page,
    () =>
      angular.element(document.querySelector("track-manager")).isolateScope()
        .state.errorCode === "LYRIC_STORAGE"
  );
  assert.equal(
    await page.evaluate(
      () =>
        localStorage.getObject("lmplaylist_reserve").tracks[0].cover_asset_id
    ),
    undefined
  );
  await page.evaluate(() => {
    Storage.prototype.setItem = window.__originalSetItem;
  });
  await page.locator(".save-local-metadata").click();
  await wait(
    page,
    () =>
      !!localStorage.getObject("lmplaylist_reserve").tracks[0].cover_asset_id
  );
  await wait(
    page,
    () =>
      !angular.element(document.querySelector("track-manager")).isolateScope()
        .state.saving
  );
  assert.deepEqual(await state(page), baseline);
  const saved = await page.evaluate(
    () => localStorage.getObject("lmplaylist_reserve").tracks[0]
  );
  assert.equal(saved.cover_file_name, path.basename(coverFile));
  const copies = await page.evaluate(() => [
    localStorage.getObject("myplaylist_visual").tracks[0],
    localStorage.getObject("current-playing")[0],
    window.threadPlayer.currentAudio,
  ]);
  copies.forEach((song) =>
    assert.equal(song.cover_asset_id, saved.cover_asset_id)
  );
  await close(page);
  // Cancel a replacement and verify its temporary file is deleted, while the saved one remains.
  await row.hover();
  await row.locator(".edit-local-track").click();
  await choose(app, coverFile);
  await page.locator(".choose-local-cover").click();
  await wait(
    page,
    () =>
      !!angular.element(document.querySelector("track-manager")).isolateScope()
        .state.cover
  );
  const draft = await page.evaluate(
    () =>
      angular.element(document.querySelector("track-manager")).isolateScope()
        .state.cover.assetId
  );
  await close(page);
  await wait(
    page,
    async (asset) =>
      !(await window.listen1Desktop.localCoverUrl(asset).catch(() => "")),
    draft
  );
  assert.equal(
    await page.evaluate(
      () =>
        localStorage.getObject("lmplaylist_reserve").tracks[0].cover_asset_id
    ),
    saved.cover_asset_id
  );
  report.checks.push(
    "invalid cover, preview, quota rollback, cross-playlist/queue/core sync and cancel cleanup preserve pause/seek"
  );

  for (const theme of ["white", "black", "white2", "black2"]) {
    await page.evaluate((value) => {
      const scope = angular
        .element(document.querySelector('[ng-controller="ProfileController"]'))
        .scope();
      scope.setTheme(value);
      scope.$apply();
    }, theme);
    await wait(
      page,
      (modern) =>
        document.querySelector(".body")?.dataset.layout ===
        (modern ? "modern" : "classic"),
      theme.endsWith("2")
    );
    await navigate(page);
    await row.hover();
    const actions = await row.locator(".track-actions a").evaluateAll((nodes) =>
      nodes.map((node) => {
        const rect = node.getBoundingClientRect();
        const svg = node.querySelector("svg");
        return {
          x: rect.x,
          y: rect.y,
          width: rect.width,
          stroke: getComputedStyle(svg).strokeWidth,
          fill: getComputedStyle(svg).fill,
        };
      })
    );
    assert.equal(actions.length, 3);
    assert.equal(new Set(actions.map((a) => a.y)).size, 1);
    assert.ok(actions[1].x > actions[0].x && actions[2].x > actions[1].x);
    assert.equal(new Set(actions.map((a) => a.stroke)).size, 1);
    assert.ok(actions.every((a) => a.fill === "none" && a.width >= 24));
    assert.equal(
      await row
        .locator("a[add-and-play],a[play-from-playlist]")
        .first()
        .getAttribute("title"),
      title
    );
    await screenshot(page, `${theme}-wide-list`);
    await row.locator(".show-track-details").click();
    await wait(
      page,
      () =>
        !angular.element(document.querySelector("track-details")).isolateScope()
          .state.loading
    );
    assert.equal(await detail(page, "_TRACK_TITLE"), title);
    assert.equal(await detail(page, "_COVER_FILE_NAME"), saved.cover_file_name);
    assert.ok((await detail(page, "_AUDIO_CODEC")).includes("PCM"));
    assert.equal(await detail(page, "_AUDIO_FILE_PATH"), fixtures.audio);
    assert.deepEqual(await state(page), baseline);
    assert.equal(await page.locator(".track-details-fields > div").count(), 10);
    assert.equal(
      await page
        .locator(".track-details-dialog")
        .evaluate((node) => node.scrollWidth <= node.clientWidth),
      true
    );
    await screenshot(page, `${theme}-wide-details`);
    await close(page);
    await row.locator(".show-track-details").focus();
    await page.keyboard.press("Enter");
    await page.locator(".track-details-dialog").waitFor();
    await wait(page, () =>
      document.activeElement?.closest(".track-details-dialog")
    );
    assert.deepEqual(await state(page), baseline);
    await page.keyboard.press("Escape");
    await page.locator(".track-details-dialog").waitFor({ state: "hidden" });
    await page.evaluate(() => {
      window.__detailHowl = window.threadPlayer.currentHowl;
      l1Player.play();
    });
    await wait(page, () => window.threadPlayer.playing);
    await row.locator(".show-track-details").click();
    await page.locator(".track-details-dialog").waitFor();
    const continuing = await state(page);
    assert.equal(continuing.id, baseline.id);
    assert.equal(continuing.playing, true);
    assert.ok(continuing.position >= baseline.position);
    assert.equal(
      await page.evaluate(
        () => window.threadPlayer.currentHowl === window.__detailHowl
      ),
      true
    );
    await close(page);
    await page.evaluate(() => {
      l1Player.pause();
      window.threadPlayer.currentHowl.seek(17);
      l1Player.requestFrameUpdate();
    });
    assert.deepEqual(await state(page), baseline);
    await page.locator(".playlist-toggle .icon").click();
    const queued = page
      .locator(".menu-list li")
      .filter({ has: page.locator("track-actions") })
      .first();
    await queued.hover();
    assert.equal(
      await queued.locator("a[play-from-playlist]").getAttribute("title"),
      title
    );
    await queued.locator(".show-track-details").click();
    assert.equal(await detail(page, "_TRACK_TITLE"), title);
    assert.deepEqual(await state(page), baseline);
    await close(page);
    await page.locator(".playlist-toggle .icon").click();
    await page.evaluate((song) => {
      const search = angular
        .element(
          document.querySelector('[ng-controller="InstantSearchController"]')
        )
        .scope();
      search.result = [song];
      search.loading = false;
      const nav = angular
        .element(
          document.querySelector('[ng-controller="NavigationController"]')
        )
        .scope();
      nav.showTag(3);
      nav.$apply();
    }, saved);
    const searchRow = page
      .locator('[ng-controller="InstantSearchController"] .detail-songlist li')
      .filter({ has: page.locator("track-actions") })
      .first();
    await searchRow.hover();
    await searchRow.locator(".show-track-details").click();
    assert.equal(await detail(page, "_TRACK_TITLE"), title);
    assert.deepEqual(await state(page), baseline);
    await close(page);
    await navigate(page);
    assert.equal(
      await page.locator(".footer .detail .title").getAttribute("title"),
      title
    );
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].setSize(860, 700)
    );
    await row.hover();
    await screenshot(page, `${theme}-narrow-list`);
    await row.locator(".show-track-details").click();
    await screenshot(page, `${theme}-narrow-details`);
    await close(page);
    if (theme.endsWith("2")) {
      await page.evaluate(() => {
        const scope = angular
          .element(
            document.querySelector('[ng-controller="NavigationController"]')
          )
          .scope();
        if (scope.isOpenSidebar) scope.openSidebar();
        scope.$apply();
      });
      await wait(
        page,
        () =>
          document.querySelector(".sidebar-content").getBoundingClientRect()
            .width <= 61
      );
      await page.locator(".sidebar-playlist-cover").first().waitFor();
      const clips = await page
        .locator(
          ".sidebar .sidebar-block .icon, .sidebar .sidebar-block svg, .sidebar-playlist-cover"
        )
        .evaluateAll((nodes) =>
          nodes
            .filter((node) => node.getBoundingClientRect().width > 0)
            .map((node) => {
              const r = node.getBoundingClientRect();
              const sidebar = node
                .closest(".sidebar-scroll-content")
                .getBoundingClientRect();
              return {
                left: r.left >= sidebar.left,
                right: r.right <= sidebar.right,
                width: r.width,
              };
            })
        );
      assert.ok(
        clips.length >= 3 &&
          clips.every((clip) => clip.left && clip.right && clip.width >= 16)
      );
      assert.equal(
        await page
          .locator(".sidebar-playlist-cover")
          .first()
          .evaluate((node) => node.naturalWidth > 0),
        true
      );
      await screenshot(page, `${theme}-collapsed`);
      await page.evaluate(() => {
        const scope = angular
          .element(
            document.querySelector('[ng-controller="NavigationController"]')
          )
          .scope();
        scope.openSidebar();
        scope.$apply();
      });
      await wait(
        page,
        () =>
          document.querySelector(".sidebar-content").getBoundingClientRect()
            .width >= 199
      );
    }
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].setSize(1280, 900)
    );
    await page.evaluate(() => {
      const nav = angular
        .element(
          document.querySelector('[ng-controller="NavigationController"]')
        )
        .scope();
      nav.showTag(4);
      nav.$apply();
    });
    await screenshot(page, `${theme}-settings`);
    await navigate(page);
    report.checks.push(
      `${theme}: mouse/keyboard details preserve playing/paused audio, full title, horizontal icons, wide/narrow screenshots${theme.endsWith("2") ? ", collapsed sidebar thumbnails" : ""}`
    );
  }

  await openDetails(page, saved);
  for (const language of [
    "zh-CN",
    "zh-TC",
    "en-US",
    "fr-FR",
    "ko-KR",
    "pt-BR",
  ]) {
    await page.evaluate((value) => {
      const scope = angular
        .element(document.querySelector('[ng-controller="ProfileController"]'))
        .scope();
      scope.setLang(value);
    }, language);
    await wait(page, (value) => i18next.language === value, language);
    await wait(
      page,
      () =>
        !document
          .querySelector(".track-details-dialog h2")
          .textContent.startsWith("_")
    );
    assert.equal(
      await page
        .locator(".track-details-fields dt")
        .evaluateAll((nodes) =>
          nodes.some((n) => n.textContent.startsWith("_"))
        ),
      false
    );
  }
  report.checks.push("six languages resolve all new detail labels");
  await close(page);
  // The actual parser and session are used; only transport payloads are fixtures.
  await app.evaluate(({ BrowserWindow }, encoded) => {
    const bytes = Buffer.from(encoded, "base64");
    BrowserWindow.getAllWindows()[0].webContents.session.fetch = async (
      url,
      options
    ) => {
      const [, begin, last] = /bytes=(\d+)-(\d+)/.exec(options.headers.Range);
      const start = Number(begin),
        end = Math.min(Number(last), bytes.length - 1);
      return new Response(bytes.subarray(start, end + 1), {
        status: 206,
        headers: {
          "content-type": "audio/wav",
          "content-range": `bytes ${start}-${end}/${bytes.length}`,
          etag: '"fixture"',
        },
      });
    };
  }, fs.readFileSync(fixtures.audio).toString("base64"));
  const network = {
    id: "netrack_detail",
    title: "网络目标",
    artist: "Artist",
    album: "Album",
    source: "netease",
  };
  await page.evaluate(() => {
    window.__resolveCalls = 0;
    window.__queryDelay = 0;
    MediaService.bootstrapTrack = (track) =>
      RequestTask.create(({ resolve, onCleanup }) => {
        window.__resolveCalls += 1;
        const timer = setTimeout(
          () =>
            resolve({
              url: "https://music.126.net/fixture.wav",
              platform: "netease",
            }),
          window.__queryDelay
        );
        onCleanup(() => clearTimeout(timer));
      });
    netease.lyric = () => ({
      success: (fn) => fn({ lyric: "[00:00]原平台歌词", tlyric: "" }),
    });
  });
  await openDetails(page, network);
  assert.equal(await page.evaluate(() => window.__resolveCalls), 0);
  assert.equal(await detail(page, "_AUDIO_CODEC"), "");
  await page.locator(".read-audio-info").click();
  await wait(
    page,
    () =>
      !angular.element(document.querySelector("track-details")).isolateScope()
        .state.loading
  );
  assert.ok((await detail(page, "_AUDIO_CODEC")).includes("PCM"));
  assert.equal(await detail(page, "_AUDIO_FILE_PATH"), "");
  assert.equal(await page.locator(".track-details-fields > div").count(), 11);
  assert.deepEqual(await state(page), baseline);
  await close(page);
  await openDetails(page, network);
  await wait(
    page,
    () =>
      !!angular.element(document.querySelector("track-details")).isolateScope()
        .state.info
  );
  assert.equal(await page.evaluate(() => window.__resolveCalls), 1);
  await page.evaluate((song) => {
    Lyrics.saveOverride(song.id, {
      lyric: "[00:00]替换歌词",
      tlyric: "",
      provenance: { kind: "file", fileName: "手动歌词.lrc" },
    });
    angular
      .element(document.body)
      .injector()
      .get("$rootScope")
      .$broadcast("lyrics:changed", song.id);
  }, network);
  assert.equal(await detail(page, "_LYRIC_FILE_NAME"), "手动歌词.lrc");
  await page.evaluate(async (id) => {
    await MediaService.getLyric(id, null, null, null, { original: true })
      .promise;
    Lyrics.removeOverride(id);
    angular
      .element(document.body)
      .injector()
      .get("$rootScope")
      .$broadcast("lyrics:changed", id);
  }, network.id);
  assert.equal(await detail(page, "_LYRIC_FILE_NAME"), "");
  assert.ok(await detail(page, "_LYRIC_SOURCE_PLATFORM"));
  await screenshot(page, "network-details");
  await close(page);
  await page.evaluate(() => {
    window.__queryDelay = 300;
  });
  await openDetails(page, { ...network, id: "netrack_slow" });
  await page.locator(".read-audio-info").click();
  await openDetails(page, {
    ...network,
    id: "netrack_new",
    title: "新查看目标",
  });
  await page.waitForTimeout(500);
  assert.equal(await detail(page, "_TRACK_TITLE"), "新查看目标");
  assert.equal(await detail(page, "_AUDIO_CODEC"), "");
  await close(page);
  report.checks.push(
    "manual network inspection, session cache, target races and independent lyric provenance"
  );
  // A playing item's actual source, including a fallback, takes precedence over
  // manual resolution; another source event invalidates the old displayed data.
  await page.evaluate((song) => {
    window.__queryDelay = 0;
    l1Player.addTrack(song);
    const track = window.threadPlayer.playlist.find(
      (item) => item.id === song.id
    );
    track.platform = "qq";
    window.threadPlayer.setMediaURI(
      "https://isure.stream.qqmusic.qq.com/fixture.wav",
      song.id
    );
  }, network);
  await openDetails(page, network);
  await page.locator(".read-audio-info").click();
  await wait(
    page,
    () =>
      !angular.element(document.querySelector("track-details")).isolateScope()
        .state.loading
  );
  assert.ok((await detail(page, "_AUDIO_CODEC")).includes("PCM"));
  const calls = await page.evaluate(() => window.__resolveCalls);
  await page.evaluate(
    (id) =>
      window.threadPlayer.setMediaURI(
        "https://isure.stream.qqmusic.qq.com/changed.wav",
        id
      ),
    network.id
  );
  await wait(
    page,
    () =>
      !angular.element(document.querySelector("track-details")).isolateScope()
        .state.info
  );
  assert.equal(await detail(page, "_AUDIO_CODEC"), "");
  assert.ok(await detail(page, "_LYRIC_SOURCE_PLATFORM"));
  await page.locator(".read-audio-info").click();
  await wait(
    page,
    () =>
      !angular.element(document.querySelector("track-details")).isolateScope()
        .state.loading
  );
  assert.equal(await page.evaluate(() => window.__resolveCalls), calls);
  assert.deepEqual(await state(page), baseline);
  await close(page);
  await openDetails(page, { ...network, id: "netrack_theme_cancel" });
  await page.evaluate(() => {
    window.__queryDelay = 300;
  });
  await page.locator(".read-audio-info").click();
  await page.evaluate(() => {
    const scope = angular
      .element(document.querySelector('[ng-controller="ProfileController"]'))
      .scope();
    scope.setTheme("white2");
    scope.$apply();
  });
  await page.waitForTimeout(400);
  assert.equal(await page.locator(".track-details-dialog").count(), 0);
  report.checks.push(
    "actual fallback source bypasses resolving, changes invalidate displayed audio, theme change cancels pending work"
  );
  fs.unlinkSync(coverFile);
  return { saved, baseline };
}

(async () => {
  let app;
  try {
    let page;
    ({ app, page } = await launch());
    const { saved } = await check(app, page);
    await app.close();
    ({ app, page } = await launch(process.argv.includes("--online")));
    await navigate(page);
    const song = await page.evaluate(
      () => localStorage.getObject("lmplaylist_reserve").tracks[0]
    );
    assert.equal(song.cover_asset_id, saved.cover_asset_id);
    await wait(page, () =>
      [...document.querySelectorAll("[track-cover]")].some(
        (image) => image.naturalWidth === 64
      )
    );
    await openDetails(page, song);
    assert.equal(await detail(page, "_COVER_FILE_NAME"), saved.cover_file_name);
    assert.equal(await page.evaluate(() => window.threadPlayer.playing), false);
    await screenshot(page, "restart-cover-details");
    report.checks.push(
      "restart restores managed cover after deleting original image and remains paused"
    );
    if (process.argv.includes("--online")) await onlineChecks(page);
    assert.deepEqual(report.errors, []);
    console.log(
      JSON.stringify({
        output,
        checks: report.checks.length,
        screenshots: report.screenshots.length,
      })
    );
  } catch (error) {
    report.failure = error.stack;
    console.error(error);
    process.exitCode = 1;
  } finally {
    if (app) await app.close();
    fs.writeFileSync(
      path.join(output, "report.json"),
      JSON.stringify(report, null, 2)
    );
  }
})();
