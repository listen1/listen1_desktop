// 网易搜索真实 DOM、账号失败提示及主题销毁回归，始终使用可丢弃 profile。
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { _electron } = require("playwright");

const root = path.resolve(__dirname, "..");
const output = path.join(
  root,
  "dist/maintenance",
  process.env.LISTEN1_NETEASE_RUN || `netease-ui-${Date.now()}`
);
const online = process.env.LISTEN1_NETEASE_ONLINE === "1";
const report = {
  date: new Date().toISOString(),
  online,
  checks: [],
  errors: [],
};
const wait = (page, fn, arg = null) =>
  page.waitForFunction(fn, arg, { polling: 100, timeout: 20000 });
const account = {
  code: 200,
  account: { id: 42, userName: "fixture" },
  profile: { nickname: "Fixture account", avatarUrl: "" },
};
const fixture = { account, playlists: { code: 200, playlist: [] } };

async function main() {
  fs.mkdirSync(output, { recursive: true });
  const app = await _electron.launch({
    executablePath: require("electron"),
    args: [path.join(__dirname, "electron-entry.cjs")],
    env: {
      ...process.env,
      LISTEN1_TEST_USER_DATA: path.join(output, "profile"),
    },
  });
  try {
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].showInactive()
    );
    const page = await app.firstWindow();
    page.on("console", (message) => {
      if (
        message.type() === "error" &&
        message.text().includes("ngRepeat:dupes")
      )
        report.errors.push("ngRepeat:dupes");
    });
    page.on("pageerror", () => report.errors.push("pageerror"));
    await page.route("https://music.163.com/**", async (route) => {
      const url = new URL(route.request().url());
      if (online) return route.continue();
      // 热门歌单是 HTML 页面；保持其合法空结构，避免无关初始化错误污染截图。
      if (url.pathname.startsWith("/discover/playlist")) {
        return route.fulfill({
          status: 200,
          contentType: "text/html",
          body: '<ul class="m-cvrlst"></ul>',
        });
      }
      let body = { code: 200 };
      if (url.pathname === "/api/nuser/account/get") body = fixture.account;
      else if (url.pathname === "/api/user/playlist") body = fixture.playlists;
      else if (url.pathname === "/weapi/personalized/playlist")
        body = { code: 200, result: [] };
      else if (url.pathname === "/api/search/pc") {
        const params = new URLSearchParams(route.request().postData());
        const base = Number(params.get("offset")) || 0;
        const list = Array.from({ length: 16 }, (_, index) => ({
          id: base + index + 1,
          name: `Fixture ${base + index}`,
          fee: 0,
          artists: [{ id: 1, name: "Fixture artist" }],
          album: { id: 1, name: "Fixture album", picUrl: "" },
          coverImgUrl: "",
          creator: { nickname: "Fixture creator" },
          trackCount: 1,
        }));
        const items = [...list, ...list.slice(0, 4)];
        body = {
          code: 200,
          result:
            params.get("type") === "1000"
              ? { playlists: items, playlistCount: 40 }
              : { songs: items, songCount: 40 },
        };
      }
      await route
        .fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(body),
        })
        .catch(() => {});
    });
    await wait(
      page,
      () => window.l1Player && angular.element(document.body).injector()
    );
    await page.evaluate(() => {
      // 排除无关平台的在线行为，网易仍走实际 provider 与 Axios。
      for (const provider of PROVIDERS.filter(
        (item) => item.name !== "netease"
      )) {
        provider.instance.get_user = () => ({
          success: (fn) => fn({ status: "fail", data: {} }),
        });
        provider.instance.search = () => ({
          success: (fn) => fn({ result: [], total: 0 }),
        });
      }
    });
    for (const theme of ["white", "black", "white2", "black2"]) {
      fixture.account = account;
      fixture.playlists = { code: 200, playlist: [] };
      await page.evaluate((theme) => {
        const scope = angular
          .element(
            document.querySelector('[ng-controller="ProfileController"]')
          )
          .scope();
        scope.$apply(() => scope.setTheme(theme));
      }, theme);
      await wait(
        page,
        () =>
          !!document.querySelector('[ng-controller="InstantSearchController"]')
      );
      await page
        .locator('input[ng-model="keywords"]')
        .fill(online ? "星球卑" : "Fixture duplicate");
      await page.evaluate(() => {
        const scope = angular
          .element(
            document.querySelector('[ng-controller="InstantSearchController"]')
          )
          .scope();
        scope.$apply(() => {
          scope.changeSearchType(0);
          scope.changeSourceTab("netease");
        });
      });
      await wait(page, () => {
        const scope = angular
          .element(
            document.querySelector('[ng-controller="InstantSearchController"]')
          )
          .scope();
        return (
          scope.tab === "netease" && !scope.loading && scope.result.length > 0
        );
      });
      const verifyRows = async (type, pageNumber) => {
        await wait(
          page,
          ({ type, pageNumber }) => {
            const scope = angular
              .element(
                document.querySelector(
                  '[ng-controller="InstantSearchController"]'
                )
              )
              .scope();
            return (
              !scope.loading &&
              scope.searchType === type &&
              scope.curpage === pageNumber &&
              document.querySelectorAll(
                '.searchbox [ng-repeat^="song in result"], .searchbox [ng-repeat="playlist in result"]'
              ).length === scope.result.length
            );
          },
          { type, pageNumber }
        );
        const data = await page.evaluate(() => {
          const scope = angular
            .element(
              document.querySelector(
                '[ng-controller="InstantSearchController"]'
              )
            )
            .scope();
          return {
            count: scope.result.length,
            unique: new Set(
              scope.result.map((item) => `${item.source}:${item.id}`)
            ).size,
            dom: document.querySelectorAll(
              '.searchbox [ng-repeat^="song in result"], .searchbox [ng-repeat="playlist in result"]'
            ).length,
            first: scope.result[0]?.id,
            error: scope.searchError,
            hasMore: scope.hasMore,
          };
        });
        assert.equal(data.error, null);
        assert.equal(data.count, data.unique);
        assert.equal(data.dom, data.count);
        if (!online) assert.equal(data.count, 16);
        report.checks.push({ theme, type, page: pageNumber, ...data });
        return data;
      };
      const first = await verifyRows(0, 1);
      if (first.hasMore) {
        await page
          .locator('.search-pagination button[ng-click="nextPage()"]')
          .click();
        const second = await verifyRows(0, 2);
        assert.notEqual(second.first, first.first);
      }
      await page.evaluate(() => {
        const scope = angular
          .element(
            document.querySelector('[ng-controller="InstantSearchController"]')
          )
          .scope();
        scope.$apply(() => scope.changeSearchType(1));
      });
      await verifyRows(1, 1);
      if (!online) {
        await page.evaluate(() => {
          const auth = angular
            .element(document.querySelector('[ng-controller="AuthController"]'))
            .scope();
          auth.$apply(() => auth.refreshAuthStatus("netease"));
        });
        await wait(page, () =>
          angular
            .element(document.querySelector('[ng-controller="AuthController"]'))
            .scope()
            .is_login("netease")
        );
        fixture.account = { code: 301 };
        await page.evaluate(() => {
          const auth = angular
            .element(document.querySelector('[ng-controller="AuthController"]'))
            .scope();
          const nav = angular
            .element(
              document.querySelector('[ng-controller="NavigationController"]')
            )
            .scope();
          auth.$apply(() => {
            nav.showTag(5);
            auth.refreshAuthStatus("netease");
          });
        });
        await wait(
          page,
          () =>
            angular
              .element(
                document.querySelector('[ng-controller="AuthController"]')
              )
              .scope().authStatus.netease.error === "AUTH_REQUIRED"
        );
        assert.ok(
          await page
            .locator(
              '.request-status button[ng-click="refreshAuthStatus(source)"]'
            )
            .first()
            .isVisible()
        );
        assert.ok(
          await page.evaluate(() =>
            angular
              .element(
                document.querySelector('[ng-controller="AuthController"]')
              )
              .scope()
              .is_login("netease")
          )
        );
        await page.screenshot({
          path: path.join(output, `${theme}-account-error.png`),
        });
        fixture.account = account;
        await page
          .locator(
            '.request-status button[ng-click="refreshAuthStatus(source)"]'
          )
          .first()
          .click();
        await wait(
          page,
          () =>
            !angular
              .element(
                document.querySelector('[ng-controller="AuthController"]')
              )
              .scope().authStatus.netease.error
        );
        fixture.playlists = { code: 429 };
        await page.evaluate(() => {
          const auth = angular
            .element(document.querySelector('[ng-controller="AuthController"]'))
            .scope();
          const nav = angular
            .element(
              document.querySelector('[ng-controller="NavigationController"]')
            )
            .scope();
          nav.$apply(() =>
            nav.showTag(6, {
              platform: "netease",
              user: auth.musicAuth.netease,
            })
          );
        });
        await wait(
          page,
          () =>
            angular
              .element(
                document.querySelector('[ng-controller="PlatformController"]')
              )
              .scope().platformError === "RATE_LIMIT"
        );
        assert.ok(
          await page
            .locator(
              '.request-status button[ng-click="loadPlatformPlaylists()"]'
            )
            .isVisible()
        );
        await page.screenshot({
          path: path.join(output, `${theme}-playlist-error.png`),
        });
        fixture.playlists = { code: 200, playlist: [] };
        await page
          .locator('.request-status button[ng-click="loadPlatformPlaylists()"]')
          .click();
        await wait(page, () => {
          const scope = angular
            .element(
              document.querySelector('[ng-controller="PlatformController"]')
            )
            .scope();
          return !scope.platformLoading && !scope.platformError;
        });
        await page.evaluate(() => {
          const auth = angular
            .element(document.querySelector('[ng-controller="AuthController"]'))
            .scope();
          auth.$apply(() => auth.logout("netease"));
        });
        assert.equal(
          await page.evaluate(
            () =>
              angular
                .element(
                  document.querySelector('[ng-controller="PlatformController"]')
                )
                .scope().myPlatformPlaylists.length
          ),
          0
        );
        report.checks.push({
          theme,
          accountErrorRetry: true,
          playlistErrorRetry: true,
          logout: true,
        });
      }
      // 回到搜索页，下一主题能继续使用真实搜索输入。
      await page.evaluate(() => {
        const nav = angular
          .element(
            document.querySelector('[ng-controller="NavigationController"]')
          )
          .scope();
        nav.$apply(() => nav.showTag(0));
      });
    }
    for (const language of [
      "zh-CN",
      "zh-TC",
      "en-US",
      "fr-FR",
      "ko-KR",
      "pt-BR",
    ]) {
      const translations = await page.evaluate(async (language) => {
        await i18next.changeLanguage(language);
        return [
          "_REQUEST_LOADING",
          "_ACCOUNT_UNCONFIRMED",
          "_REQUEST_RETRY",
          "_PLATFORM_PLAYLIST_EMPTY",
        ].map((key) => ({ key, value: i18next.t(key) }));
      }, language);
      assert.ok(translations.every(({ key, value }) => value && value !== key));
    }
    report.languages = 6;
    assert.deepEqual(report.errors, []);
  } finally {
    await app.close();
  }
}
main()
  .catch((error) => {
    report.failure = error.message.split("\n")[0];
    process.exitCode = 1;
  })
  .finally(() => {
    fs.writeFileSync(
      path.join(output, "report.json"),
      JSON.stringify(report, null, 2)
    );
    console.log(
      JSON.stringify({
        online,
        checks: report.checks.length,
        errors: report.errors,
        failure: report.failure || null,
      })
    );
  });
