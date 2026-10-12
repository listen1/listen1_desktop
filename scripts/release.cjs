const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const platforms = ["win", "mac", "linux"];

function validateReleaseTag(tag, rootVersion, appVersion) {
  if (rootVersion !== appVersion) {
    throw new Error(
      `Desktop package versions differ: ${rootVersion} / ${appVersion}`
    );
  }
  if (tag !== `v${rootVersion}`) {
    throw new Error(`Release tag must be v${rootVersion}; received ${tag}`);
  }
}

function expectedAssets(platform, metadata) {
  const prefix = `${metadata.name}_${metadata.version}_${platform}`;
  switch (platform) {
    case "win":
      return [
        `${prefix}.exe`,
        `${prefix}_x64.exe`,
        `${prefix}_arm64.exe`,
        `${prefix}_x64.7z`,
        `${prefix}_arm64.7z`,
        "latest.yml",
      ];
    case "mac":
      return [
        ...["x64", "arm64", "universal"].map((arch) => `${prefix}_${arch}.dmg`),
        "latest-mac.yml",
      ];
    case "linux":
      return [
        ...["x64", "arm64"].flatMap((arch) =>
          ["tar.gz", "AppImage", "deb"].map((ext) => {
            // electron-builder uses format-specific aliases for Linux x64.
            const artifactArch =
              arch === "x64"
                ? { AppImage: "x86_64", deb: "amd64" }[ext] || arch
                : arch;
            return `${prefix}_${artifactArch}.${ext}`;
          })
        ),
        "latest-linux.yml",
        "latest-linux-arm64.yml",
      ];
    default:
      throw new Error(`Unknown release platform: ${platform}`);
  }
}

function artifactFiles(platform, directory, metadata) {
  const required = expectedAssets(platform, metadata);
  const optional = required
    .filter((name) => !name.endsWith(".yml"))
    .map((name) => `${name}.blockmap`);
  const names = [
    ...required,
    ...optional.filter((name) => fs.existsSync(path.join(directory, name))),
  ];
  return names.map((name) => {
    const file = path.join(directory, name);
    const stat = fs.lstatSync(file);
    if (!stat.isFile() || stat.size === 0) {
      throw new Error(`Missing or empty release asset: ${file}`);
    }
    return file;
  });
}

function collectArtifacts(platform, source, destination, metadata) {
  const files = artifactFiles(platform, source, metadata);
  fs.mkdirSync(destination, { recursive: true });
  for (const file of files) {
    fs.copyFileSync(file, path.join(destination, path.basename(file)));
  }
  return files.length;
}

function runGh(args) {
  const result = spawnSync("gh", args, { encoding: "utf8", windowsHide: true });
  if (result.error) throw result.error;
  return result;
}

function publishDraftRelease(
  { tag, repository, directory, metadata, appVersion },
  invoke = runGh
) {
  validateReleaseTag(tag, metadata.version, appVersion);
  const target = `${metadata.build.publish.owner}/${metadata.build.publish.repo}`;
  if (repository !== target) {
    throw new Error(
      `Release repository must be ${target}; received ${repository}`
    );
  }
  // Validate every platform before making any GitHub write request.
  const files = platforms.flatMap((platform) =>
    artifactFiles(
      platform,
      path.join(directory, `listen1-${platform}`),
      metadata
    )
  );
  const existing = invoke([
    "release",
    "view",
    tag,
    "--repo",
    repository,
    "--json",
    "isDraft",
  ]);
  let args;
  if (existing.status === 0) {
    if (JSON.parse(existing.stdout).isDraft !== true) {
      throw new Error(
        `Release ${tag} is already public; refusing to replace its assets`
      );
    }
    args = [
      "release",
      "upload",
      tag,
      ...files,
      "--repo",
      repository,
      "--clobber",
    ];
  } else {
    args = [
      "release",
      "create",
      tag,
      ...files,
      "--repo",
      repository,
      "--draft",
      "--verify-tag",
      "--title",
      tag,
      "--generate-notes",
    ];
  }
  const result = invoke(args);
  if (result.status !== 0) {
    throw new Error(
      result.stderr?.trim() ||
        `GitHub release command failed (${result.status})`
    );
  }
  return result.stdout?.trim();
}

function main() {
  const repo = path.resolve(__dirname, "..");
  const metadata = JSON.parse(
    fs.readFileSync(path.join(repo, "package.json"), "utf8")
  );
  const app = JSON.parse(
    fs.readFileSync(path.join(repo, "app/package.json"), "utf8")
  );
  const [
    command,
    value,
    source = "dist",
    destination = "dist/release-artifacts",
  ] = process.argv.slice(2);
  switch (command) {
    case "check-tag":
      validateReleaseTag(
        process.env.RELEASE_TAG || value,
        metadata.version,
        app.version
      );
      console.log(`Release tag matches desktop version ${metadata.version}`);
      break;
    case "collect":
      console.log(
        `Collected ${collectArtifacts(value, source, destination, metadata)} ${value} assets`
      );
      break;
    case "publish":
      console.log(
        publishDraftRelease({
          tag: process.env.RELEASE_TAG,
          repository: process.env.GITHUB_REPOSITORY,
          directory: value,
          metadata,
          appVersion: app.version,
        })
      );
      break;
    default:
      throw new Error(
        "Usage: release.cjs check-tag [tag] | collect <platform> [source] [destination] | publish <directory>"
      );
  }
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

module.exports = {
  validateReleaseTag,
  expectedAssets,
  collectArtifacts,
  publishDraftRelease,
};
