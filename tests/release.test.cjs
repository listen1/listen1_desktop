const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {
  validateReleaseTag,
  expectedAssets,
  collectArtifacts,
  publishDraftRelease,
} = require("../scripts/release.cjs");

const metadata = {
  name: "listen1",
  version: "2.35.1",
  build: { publish: { owner: "MapleSugarCake", repo: "listen1_desktop" } },
};

const fixtureAssets = {
  win: [
    "listen1_2.35.1_win.exe",
    "listen1_2.35.1_win_x64.exe",
    "listen1_2.35.1_win_arm64.exe",
    "listen1_2.35.1_win_x64.7z",
    "listen1_2.35.1_win_arm64.7z",
    "latest.yml",
  ],
  mac: [
    "listen1_2.35.1_mac_x64.dmg",
    "listen1_2.35.1_mac_arm64.dmg",
    "listen1_2.35.1_mac_universal.dmg",
    "latest-mac.yml",
  ],
  linux: [
    "listen1_2.35.1_linux_x64.tar.gz",
    "listen1_2.35.1_linux_x86_64.AppImage",
    "listen1_2.35.1_linux_amd64.deb",
    "listen1_2.35.1_linux_arm64.tar.gz",
    "listen1_2.35.1_linux_arm64.AppImage",
    "listen1_2.35.1_linux_arm64.deb",
    "latest-linux.yml",
    "latest-linux-arm64.yml",
  ],
};

function fixture(t) {
  const temporaryRoot = path.resolve(os.tmpdir());
  const directory = fs.mkdtempSync(
    path.join(temporaryRoot, "listen1-release-")
  );
  t.after(() => {
    if (
      path.dirname(directory) !== temporaryRoot ||
      !path.basename(directory).startsWith("listen1-release-")
    ) {
      throw new Error("Unexpected release fixture cleanup path");
    }
    fs.rmSync(directory, { recursive: true, force: true });
  });
  for (const platform of ["win", "mac", "linux"]) {
    const folder = path.join(directory, `listen1-${platform}`);
    fs.mkdirSync(folder);
    for (const name of fixtureAssets[platform]) {
      fs.writeFileSync(path.join(folder, name), "synthetic release asset");
    }
  }
  return {
    tag: "v2.35.1",
    repository: "MapleSugarCake/listen1_desktop",
    directory,
    metadata,
    appVersion: "2.35.1",
  };
}

test("version tags must match both desktop packages", () => {
  assert.doesNotThrow(() => validateReleaseTag("v2.35.1", "2.35.1", "2.35.1"));
  for (const tag of ["v2.35.0", "vtest", "2.35.1", undefined]) {
    assert.throws(
      () => validateReleaseTag(tag, "2.35.1", "2.35.1"),
      /Release tag must/
    );
  }
  assert.throws(
    () => validateReleaseTag("v2.35.1", "2.35.1", "2.35.0"),
    /versions differ/
  );
});

test("Linux release filenames match the locked builder architecture aliases", () => {
  const { Arch, getArtifactArchName } = require("builder-util");
  const assets = expectedAssets("linux", metadata);
  for (const arch of [Arch.x64, Arch.arm64]) {
    for (const ext of ["tar.gz", "AppImage", "deb"]) {
      const artifactArch = getArtifactArchName(arch, ext);
      assert.ok(
        assets.includes(`listen1_2.35.1_linux_${artifactArch}.${ext}`),
        `Missing builder filename for ${Arch[arch]} ${ext}`
      );
    }
  }
});

test("collect the Linux runner filenames and retain update metadata references", (t) => {
  const options = fixture(t);
  const source = path.join(options.directory, "listen1-linux");
  fs.writeFileSync(
    path.join(source, "latest-linux.yml"),
    "version: 2.35.1\nfiles:\n  - url: listen1_2.35.1_linux_x86_64.AppImage\n  - url: listen1_2.35.1_linux_amd64.deb\n"
  );
  const destination = path.join(options.directory, "collected-linux");
  assert.equal(collectArtifacts("linux", source, destination, metadata), 8);
  assert.deepEqual(
    fs.readdirSync(destination).sort(),
    [...fixtureAssets.linux].sort()
  );
  assert.deepEqual(
    fs.readFileSync(path.join(destination, "latest-linux.yml")),
    fs.readFileSync(path.join(source, "latest-linux.yml"))
  );
  assert.equal(
    fs.existsSync(path.join(destination, "listen1_2.35.1_linux_x64.AppImage")),
    false
  );
  assert.equal(
    fs.existsSync(path.join(destination, "listen1_2.35.1_linux_x64.deb")),
    false
  );
});

test("collect installers, update metadata and blockmaps without debug files or unpacked apps", (t) => {
  const options = fixture(t);
  const source = path.join(options.directory, "listen1-win");
  fs.writeFileSync(
    path.join(source, "listen1_2.35.1_win.exe.blockmap"),
    "blockmap"
  );
  fs.writeFileSync(path.join(source, "builder-debug.yml"), "debug");
  fs.mkdirSync(path.join(source, "win-unpacked"));
  const destination = path.join(options.directory, "collected");
  assert.equal(collectArtifacts("win", source, destination, metadata), 7);
  assert.equal(fs.existsSync(path.join(destination, "latest.yml")), true);
  assert.equal(
    fs.existsSync(path.join(destination, "listen1_2.35.1_win.exe.blockmap")),
    true
  );
  assert.equal(
    fs.existsSync(path.join(destination, "builder-debug.yml")),
    false
  );
  assert.equal(fs.existsSync(path.join(destination, "win-unpacked")), false);
});

test("missing arm64 or empty metadata prevents all GitHub requests", (t) => {
  const options = fixture(t);
  const missing = path.join(
    options.directory,
    "listen1-linux",
    "listen1_2.35.1_linux_arm64.AppImage"
  );
  fs.unlinkSync(missing);
  const invoke = () =>
    assert.fail("Must validate all platforms before contacting GitHub");
  assert.throws(() => publishDraftRelease(options, invoke), /ENOENT/);
  fs.writeFileSync(missing, "installer");
  fs.writeFileSync(
    path.join(options.directory, "listen1-mac", "latest-mac.yml"),
    ""
  );
  assert.throws(
    () => publishDraftRelease(options, invoke),
    /empty release asset/
  );
});

test("create only a draft for an existing version tag with all platform assets", (t) => {
  const options = fixture(t);
  const calls = [];
  publishDraftRelease(options, (args) => {
    calls.push(args);
    return calls.length === 1
      ? { status: 1, stderr: "release not found" }
      : { status: 0, stdout: "draft URL" };
  });
  const create = calls[1];
  assert.deepEqual(create.slice(0, 3), ["release", "create", "v2.35.1"]);
  assert.ok(create.includes("--draft"));
  assert.ok(create.includes("--verify-tag"));
  for (const platform of ["win", "mac", "linux"]) {
    for (const name of fixtureAssets[platform]) {
      assert.ok(
        create.includes(
          path.join(options.directory, `listen1-${platform}`, name)
        )
      );
    }
  }
});

test("reruns can refresh drafts but cannot replace public release assets", (t) => {
  const options = fixture(t);
  const calls = [];
  publishDraftRelease(options, (args) => {
    calls.push(args);
    return calls.length === 1
      ? { status: 0, stdout: JSON.stringify({ isDraft: true }) }
      : { status: 0 };
  });
  assert.deepEqual(calls[1].slice(0, 3), ["release", "upload", "v2.35.1"]);
  assert.ok(calls[1].includes("--clobber"));
  let publicCalls = 0;
  assert.throws(
    () =>
      publishDraftRelease(options, () => {
        publicCalls += 1;
        return { status: 0, stdout: JSON.stringify({ isDraft: false }) };
      }),
    /already public/
  );
  assert.equal(publicCalls, 1);
});

test("tag and repository mismatch cannot publish, and upload failures are reported", (t) => {
  const options = fixture(t);
  const invoke = () =>
    assert.fail("Invalid release identity must not contact GitHub");
  assert.throws(
    () => publishDraftRelease({ ...options, tag: "v2.35.0" }, invoke),
    /Release tag must/
  );
  assert.throws(
    () =>
      publishDraftRelease(
        { ...options, repository: "listen1/listen1_desktop" },
        invoke
      ),
    /repository must/
  );
  let calls = 0;
  assert.throws(
    () =>
      publishDraftRelease(options, () => {
        calls += 1;
        return calls === 1
          ? { status: 0, stdout: JSON.stringify({ isDraft: true }) }
          : { status: 1, stderr: "synthetic upload failure" };
      }),
    /synthetic upload failure/
  );
});
