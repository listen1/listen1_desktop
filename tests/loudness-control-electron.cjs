// Focused UI regression; disposable profile, local fixture, no remote audio.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { _electron } = require("playwright");
const { writeAudioFixtures } = require("./fixtures.cjs");

const root = path.resolve(__dirname, "..");
const run = process.env.LISTEN1_LOUDNESS_UI_RUN || `loudness-ui-${Date.now()}`;
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
const fixture = writeAudioFixtures(path.join(output, "fixtures"));
const report = { checks: [], screenshots: [], errors: [] };
const wait = (page, fn, arg = null) =>
  page.waitForFunction(fn, arg, { polling: 25, timeout: 10000 });
const pause = (page, ms) => page.waitForTimeout(ms);
const outside = (page) => page.mouse.move(30, 130);
const button = (page) => page.locator(".loudness-button:visible");
const panel = (page) => page.locator(".loudness-panel:visible");
const theme = async (page, value) => {
  await page.evaluate((name) => {
    const scope = angular
      .element(document.querySelector('[ng-controller="ProfileController"]'))
      .scope();
    scope.$apply(() => scope.setTheme(name));
  }, value);
  await wait(
    page,
    (modern) =>
      !!document.querySelector(".footertime") === modern &&
      document.getElementById("common-css").sheet !== null,
    value.endsWith("2")
  );
};
const reveal = async (page, modern) => {
  if (modern) await page.locator(".footertime:visible").hover();
};
const open = async (page, modern) => {
  await reveal(page, modern);
  await button(page).click();
  await panel(page).waitFor();
};
const closed = async (page, modern) => {
  await panel(page).waitFor({ state: "hidden" });
  if (modern) {
    assert.equal(await page.locator(".timeswitch:visible").count(), 1);
    assert.equal(await page.locator(".bottomprogressbar:visible").count(), 0);
  }
};
const screenshot = async (page, name) => {
  await page.screenshot({
    path: path.join(output, `${name}.png`),
    animations: "disabled",
  });
  report.screenshots.push(`${name}.png`);
};

async function main() {
  const app = await _electron.launch({
    executablePath: require("electron"),
    args: [path.join(__dirname, "electron-entry.cjs")],
    env: { ...process.env, LISTEN1_TEST_USER_DATA: profile },
  });
  try {
    const page = await app.firstWindow();
    page.on("pageerror", (error) => report.errors.push(error.message));
    await app.evaluate(({ session, BrowserWindow }) => {
      session.defaultSession.webRequest.onBeforeRequest(
        { urls: ["http://*/*", "https://*/*"] },
        (request, callback) => callback({ cancel: true })
      );
      BrowserWindow.getAllWindows()[0].show();
      BrowserWindow.getAllWindows()[0].focus();
    });
    await wait(page, () => !!window.threadPlayer && !!window.l1Player);
    report.runtime = await app.evaluate(() => process.versions);
    assert.equal(
      await page.evaluate(() => CSS.supports("selector(select:open)")),
      true
    );
    await page.evaluate((file) => {
      threadPlayer.setNewPlaylist([
        { id: `lmtrack_${file}`, source: "localmusic", title: "UI fixture" },
      ]);
      threadPlayer.volume = 0.2;
    }, fixture.plain);

    for (const name of ["white", "black", "white2", "black2"]) {
      const modern = name.endsWith("2");
      await outside(page);
      await theme(page, name);
      await page.evaluate(() =>
        l1Player.setLoudness({ enabled: false, mode: "standard" })
      );
      await open(page, modern);
      await wait(page, () => !threadPlayer.loudness.enabled);
      await wait(page, () => {
        const el = document.querySelector(".loudness-button");
        const volume = el.closest("[loudness-control]").nextElementSibling;
        return (
          !el.classList.contains("enabled") &&
          getComputedStyle(el.querySelector("svg")).color ===
            getComputedStyle(volume.querySelector(".icon")).color
        );
      });
      const icon = await button(page).evaluate((element) => {
        const svg = element.querySelector("svg");
        const styles = getComputedStyle(svg);
        const volume = element.closest("[loudness-control]").nextElementSibling;
        return {
          fill: styles.fill,
          color: styles.color,
          stroke: styles.stroke,
          width: styles.width,
          volumeColor: getComputedStyle(volume.querySelector(".icon")).color,
          outsideWheel: !element.closest("[volume-wheel]"),
          shapes: [...svg.children].map((child) => ({
            fill: getComputedStyle(child).fill,
            stroke: getComputedStyle(child).stroke,
          })),
        };
      });
      assert.equal(icon.fill, icon.color);
      assert.equal(icon.color, icon.volumeColor, JSON.stringify(icon));
      assert.equal(icon.stroke, "none");
      assert.equal(icon.width, "18px");
      assert.equal(icon.outsideWheel, true);
      for (const shape of icon.shapes) {
        assert.equal(shape.fill, icon.color);
        assert.equal(shape.stroke, "none");
      }
      await screenshot(page, `${name}-disabled`);
      await panel(page).hover();
      await pause(page, 300);
      assert.equal(await panel(page).count(), 1);
      await page.locator(".volume-ctrl:visible").hover();
      await pause(page, 300);
      assert.equal(await panel(page).count(), 1);
      // Traverse the physical gap, pause briefly, then re-enter the panel.
      const bounds = await button(page).boundingBox();
      await page.mouse.move(bounds.x + bounds.width / 2, bounds.y - 4);
      await pause(page, 60);
      await panel(page).hover();
      await outside(page);
      await pause(page, 70);
      assert.equal(await panel(page).count(), 1);
      await panel(page).hover();
      await pause(page, 250);
      assert.equal(await panel(page).count(), 1);
      await panel(page).locator("input").check();
      await wait(page, () => threadPlayer.loudness.enabled);
      await wait(page, () => {
        const el = document.querySelector(".loudness-button");
        const probe = document.createElement("span");
        probe.style.color = "var(--important-color)";
        el.append(probe);
        const expected = getComputedStyle(probe).color;
        probe.remove();
        return (
          el.classList.contains("enabled") &&
          getComputedStyle(el).color === expected
        );
      });
      const enabled = await button(page).evaluate((element) => {
        const probe = document.createElement("span");
        probe.style.color = "var(--important-color)";
        element.append(probe);
        const expected = getComputedStyle(probe).color;
        probe.remove();
        return { actual: getComputedStyle(element).color, expected };
      });
      assert.equal(enabled.actual, enabled.expected);
      await screenshot(page, `${name}-enabled`);
      await outside(page);
      await closed(page, modern);
      await screenshot(page, `${name}-closed`);

      await open(page, modern);
      const select = panel(page).locator("select");
      await select.selectOption("dynamic");
      await wait(page, () => threadPlayer.loudness.mode === "dynamic");
      await select.click();
      await wait(page, () =>
        document.querySelector(".loudness-panel select").matches(":open")
      );
      await outside(page);
      await pause(page, 350);
      assert.equal(await panel(page).count(), 1);
      await page.keyboard.press("Escape");
      await wait(
        page,
        () =>
          !document.querySelector(".loudness-panel select")?.matches(":open")
      );
      await outside(page);
      await closed(page, modern);

      await open(page, modern);
      await panel(page).locator("select").click();
      await wait(page, () =>
        document.querySelector(".loudness-panel select").matches(":open")
      );
      await page.keyboard.press("ArrowUp");
      await page.keyboard.press("Enter");
      await wait(page, () => threadPlayer.loudness.mode === "standard");
      await outside(page);
      await closed(page, modern);

      await open(page, modern);
      await page.locator("body").click({ position: { x: 30, y: 130 } });
      await closed(page, modern);
      // Real Tab navigation starts outside the hover group.
      await outside(page);
      await page.evaluate((isModern) => {
        const target = isModern
          ? document.querySelector(".footertime")
          : document.querySelector(".loudness-button");
        target.focus();
      }, modern);
      if (modern) await page.keyboard.press("Tab");
      await page.keyboard.press("Enter");
      await panel(page).waitFor();
      await pause(page, 300);
      assert.equal(await panel(page).count(), 1);
      await page.keyboard.press("Escape");
      await panel(page).waitFor({ state: "hidden" });
      assert.equal(
        await button(page).evaluate((el) => el === document.activeElement),
        true
      );
      await page.keyboard.press("Space");
      await panel(page).waitFor();
      await page.keyboard.press("Tab");
      await page.keyboard.press("Tab");
      assert.equal(
        await page.evaluate(() => document.activeElement.tagName),
        "SELECT"
      );
      await page.keyboard.press("Space");
      await wait(page, () =>
        document.querySelector(".loudness-panel select").matches(":open")
      );
      await pause(page, 300);
      assert.equal(await panel(page).count(), 1);
      await page.keyboard.press("Escape");
      assert.equal(await panel(page).count(), 1);
      await page.keyboard.press("Tab");
      await closed(page, modern);

      await reveal(page, modern);
      const volumeIcon = page.locator(".volume-ctrl:visible > .icon");
      await volumeIcon.click();
      await wait(page, () => threadPlayer.muted);
      await volumeIcon.click();
      await wait(page, () => !threadPlayer.muted);
      const wheel = (locator) =>
        locator.evaluate((el) =>
          el.dispatchEvent(
            new WheelEvent("mousewheel", { bubbles: true, deltaY: -120 })
          )
        );
      const before = await page.evaluate(() => threadPlayer.volume);
      await wheel(button(page));
      assert.equal(await page.evaluate(() => threadPlayer.volume), before);
      await wheel(page.locator(".volume-ctrl:visible"));
      assert.notEqual(await page.evaluate(() => threadPlayer.volume), before);
      const bar = await page
        .locator(".volume-ctrl:visible .barbg")
        .boundingBox();
      await page.mouse.move(bar.x + bar.width * 0.2, bar.y + bar.height / 2);
      await page.mouse.down();
      await page.mouse.move(bar.x + bar.width * 0.6, bar.y + bar.height / 2);
      await page.mouse.up();
      await wait(page, () => Math.abs(threadPlayer.volume - 0.6) < 0.03);
      report.checks.push(
        `${name}: solid icon, colors, hover, select, outside click, keyboard, volume`
      );
    }
    await open(page, true);
    await outside(page);
    await theme(page, "white");
    await pause(page, 350);
    assert.equal(await panel(page).count(), 0);
    await open(page, false);
    await pause(page, 300);
    assert.equal(await panel(page).count(), 1);
    report.checks.push(
      "Theme destruction cancels pending close without affecting new controls"
    );
    assert.equal(await page.evaluate(() => threadPlayer.playing), false);
    assert.deepEqual(report.errors, []);
  } catch (error) {
    report.failure = error.message;
    throw error;
  } finally {
    fs.writeFileSync(
      path.join(output, "report.json"),
      JSON.stringify(report, null, 2)
    );
    await app.close();
  }
  console.log(
    JSON.stringify({ output, checks: report.checks, errors: report.errors })
  );
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
