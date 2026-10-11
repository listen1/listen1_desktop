// 人工授权验收：每种登录方式使用全新的 profile，报告只保存状态和数量。
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { _electron } = require("playwright");

const method = process.env.LISTEN1_NETEASE_LOGIN_METHOD;
assert.ok(["qq", "scan"].includes(method), "Choose qq or scan");
const output = path.resolve(
  __dirname,
  "../dist/maintenance",
  process.env.LISTEN1_NETEASE_LOGIN_RUN ||
    `netease-login-${method}-${Date.now()}`
);
const profile = path.join(output, "profile");
assert.ok(
  !fs.existsSync(profile),
  "Use a new run name for an independent login session"
);
fs.mkdirSync(output, { recursive: true });
const report = {
  date: new Date().toISOString(),
  method,
  manualConfirmation: false,
  playlists: [],
};
const save = () =>
  fs.writeFileSync(
    path.join(output, "report.json"),
    JSON.stringify(report, null, 2)
  );
let app;
const wait = (page, fn, arg = null, timeout = 25000) =>
  page.waitForFunction(fn, arg, { polling: 200, timeout });

async function launch() {
  app = await _electron.launch({
    executablePath: require("electron"),
    args: [path.join(__dirname, "electron-entry.cjs")],
    env: { ...process.env, LISTEN1_TEST_USER_DATA: profile },
  });
  const page = await app.firstWindow();
  // 不收集控制台、网络响应、登录 URL 或真实账号文本。
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].show()
  );
  await wait(
    page,
    () =>
      window.l1Player &&
      angular
        .element(document.querySelector('[ng-controller="AuthController"]'))
        .scope()
  );
  return page;
}

async function main() {
  let page = await launch();
  await page.evaluate(() => {
    localStorage.setObject("enable_auto_choose_source", false);
    document.addEventListener("click", (event) => {
      if (
        event.target.closest('[ng-click="closeDialog();refreshAuthStatus();"]')
      )
        window.__manualLoginConfirmed = true;
    });
    const auth = angular
      .element(document.querySelector('[ng-controller="AuthController"]'))
      .scope();
    const nav = angular
      .element(document.querySelector('[ng-controller="NavigationController"]'))
      .scope();
    nav.$apply(() => {
      nav.showTag(5);
      nav.showDialog(11, "netease");
      auth.openLogin("netease");
    });
  });
  console.log(JSON.stringify({ stage: "awaiting-manual-login", method }));
  save();
  await wait(
    page,
    () =>
      window.__manualLoginConfirmed &&
      angular
        .element(document.querySelector('[ng-controller="AuthController"]'))
        .scope()
        .is_login("netease"),
    null,
    1200000
  );
  report.manualConfirmation = true;
  report.nicknameVisible = await page.evaluate(() => {
    const auth = angular
      .element(document.querySelector('[ng-controller="AuthController"]'))
      .scope();
    const nickname = auth.musicAuth.netease.nickname;
    return (
      typeof nickname === "string" &&
      !!nickname.trim() &&
      Array.from(document.querySelectorAll(".usercard-nickname")).some(
        (element) =>
          element.getClientRects().length &&
          element.textContent.trim() === nickname
      )
    );
  });
  // 账号 ID 仅用于内存中的重启比对，不写入报告或终端。
  const userId = await page.evaluate(() => {
    const auth = angular
      .element(document.querySelector('[ng-controller="AuthController"]'))
      .scope();
    return auth.musicAuth.netease.user_id;
  });
  report.account = "passed";
  await page.evaluate(() => {
    const auth = angular
      .element(document.querySelector('[ng-controller="AuthController"]'))
      .scope();
    const nav = angular
      .element(document.querySelector('[ng-controller="NavigationController"]'))
      .scope();
    nav.$apply(() =>
      nav.showTag(6, { platform: "netease", user: auth.musicAuth.netease })
    );
  });
  let details = 0;
  for (const category of [
    "my_created_playlist",
    "my_favorite_playlist",
    "recommend_playlist",
  ]) {
    await page.evaluate((category) => {
      const scope = angular
        .element(document.querySelector('[ng-controller="PlatformController"]'))
        .scope();
      scope.$apply(() => scope.changeTab(category));
    }, category);
    await wait(
      page,
      () =>
        !angular
          .element(
            document.querySelector('[ng-controller="PlatformController"]')
          )
          .scope().platformLoading
    );
    const state = await page.evaluate(() => {
      const scope = angular
        .element(document.querySelector('[ng-controller="PlatformController"]'))
        .scope();
      return {
        count: scope.myPlatformPlaylists.length,
        error: scope.platformError,
        first: scope.myPlatformPlaylists[0]?.id,
      };
    });
    const check = {
      category,
      count: state.count,
      code: state.error,
      status: state.error ? "failed" : "passed",
    };
    report.playlists.push(check);
    if (!state.error && state.first) {
      check.detail = await page.evaluate(async (id) => {
        try {
          const data = await MediaService.getPlaylist(id, false).promise;
          return {
            status:
              data.info && Array.isArray(data.tracks) ? "passed" : "failed",
            tracks: data.tracks?.length,
          };
        } catch (error) {
          return { status: "failed", code: error.code };
        }
      }, state.first);
      if (check.detail.status === "passed") {
        await page.evaluate((id) => {
          const nav = angular
            .element(
              document.querySelector('[ng-controller="NavigationController"]')
            )
            .scope();
          nav.$apply(() => nav.showPlaylist(id));
        }, state.first);
        await wait(
          page,
          (id) =>
            angular
              .element(
                document.querySelector('[ng-controller="NavigationController"]')
              )
              .scope().list_id === id,
          state.first
        );
        check.detail.visible = true;
        details += 1;
        await page.evaluate(() => {
          const nav = angular
            .element(
              document.querySelector('[ng-controller="NavigationController"]')
            )
            .scope();
          nav.$apply(() => nav.closeWindow());
        });
      }
    }
    save();
  }
  report.details = details ? "passed" : "unverified-no-accessible-playlist";
  await app.close();
  app = null;
  page = await launch();
  await wait(page, () => {
    const auth = angular
      .element(document.querySelector('[ng-controller="AuthController"]'))
      .scope();
    return auth.authStatus.netease && !auth.authStatus.netease.loading;
  });
  report.restart = await page.evaluate((userId) => {
    const auth = angular
      .element(document.querySelector('[ng-controller="AuthController"]'))
      .scope();
    return !auth.authStatus.netease.error &&
      auth.is_login("netease") &&
      auth.musicAuth.netease.user_id === userId
      ? "passed"
      : "failed";
  }, userId);
  report.status =
    report.nicknameVisible &&
    report.playlists.every(
      (check) =>
        check.status === "passed" &&
        (!check.detail || check.detail.status === "passed")
    ) &&
    report.restart === "passed" &&
    details > 0
      ? "passed"
      : "incomplete";
  if (report.status !== "passed") process.exitCode = 1;
}

main()
  .catch(() => {
    // Playwright 错误可能含页面文本/URL，因此仅保存固定失败标记。
    report.status = "incomplete";
    report.failure = report.manualConfirmation
      ? "verification-failed"
      : "manual-login-not-completed";
    process.exitCode = 1;
  })
  .finally(async () => {
    save();
    if (app) await app.close();
    console.log(
      JSON.stringify({
        method,
        status: report.status || "incomplete",
        restart: report.restart || "unverified",
      })
    );
  });
