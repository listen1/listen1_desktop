const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const { createAudioAssets, allowedMediaUrl } = require("../app/audio-assets");

test("audio assets validate domain, redirects, size and chunk boundaries", async () => {
  assert.equal(allowedMediaUrl("https://music.126.net/x", "netease"), true);
  assert.equal(
    allowedMediaUrl("https://xy1.mcdn.bilivideo.cn:8082/x", "bilibili"),
    true
  );
  assert.equal(
    allowedMediaUrl("https://music.126.net:8082/x", "netease"),
    false
  );
  for (const url of [
    "file:///C:/x",
    "https://music.126.net.evil.test/x",
    "https://user:secret@music.126.net/x",
    "http://127.0.0.1/x",
  ])
    assert.equal(allowedMediaUrl(url, "netease"), false);
  let calls = 0;
  const manager = createAudioAssets(async () => {
    calls += 1;
    return new Response(Uint8Array.of(1, 2, 3));
  });
  const input = {
    requestId: "one",
    trackId: "netrack_1",
    platform: "netease",
    url: "https://music.126.net/test",
  };
  const first = await manager.prepare(input);
  const second = await manager.prepare({ ...input, requestId: "two" });
  assert.equal(calls, 1);
  assert.equal(first.fingerprint, second.fingerprint);
  const chunk = manager.read({ assetId: first.assetId, offset: 0, length: 3 });
  chunk[0] = 99;
  assert.equal(
    manager.read({ assetId: first.assetId, offset: 0, length: 1 })[0],
    1
  );
  assert.throws(() =>
    manager.read({ assetId: first.assetId, offset: 1, length: 3 })
  );
  manager.release(first.assetId);
  assert.throws(() =>
    manager.read({ assetId: first.assetId, offset: 0, length: 1 })
  );
  manager.resetConsumers();
  assert.throws(() =>
    manager.read({ assetId: second.assetId, offset: 0, length: 1 })
  );
  await manager.prepare({ ...input, requestId: "after-reload" });
  assert.equal(calls, 1);
  manager.dispose();
  const redirects = createAudioAssets(
    async () =>
      new Response(null, {
        status: 302,
        headers: { location: "http://127.0.0.1/private" },
      })
  );
  assert.equal((await redirects.prepare(input)).error, "UNSUPPORTED_SOURCE");
  redirects.dispose();
});

test("local asset cache observes file changes without modifying originals", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "listen1-audio-"));
  const file = path.join(directory, "test.wav");
  const manager = createAudioAssets(() => {
    throw new Error("must stay local");
  });
  try {
    await fs.writeFile(file, Buffer.from([1, 2, 3]));
    const input = { requestId: "local", trackId: `lmtrack_${file}` };
    const a = await manager.prepare(input);
    manager.release(a.assetId);
    assert.deepEqual([...(await fs.readFile(file))], [1, 2, 3]);
    await fs.writeFile(file, Buffer.from([4, 5, 6, 7]));
    const b = await manager.prepare(input);
    assert.notEqual(a.fingerprint, b.fingerprint);
    assert.equal(
      (
        await manager.prepare({
          requestId: "bad",
          trackId: "lmtrack_relative.wav",
        })
      ).error,
      "INVALID_SOURCE"
    );
  } finally {
    manager.dispose();
    await fs.rm(directory, { recursive: true });
  }
});

test("cancelled network preparation publishes no asset", async () => {
  const manager = createAudioAssets(
    (_, { signal }) =>
      new Promise((resolve, reject) => {
        signal.addEventListener("abort", () => reject(new Error("cancelled")), {
          once: true,
        });
      })
  );
  const promise = manager.prepare({
    requestId: "cancel",
    trackId: "netrack_1",
    platform: "netease",
    url: "https://music.126.net/test",
  });
  manager.cancel("cancel");
  assert.equal((await promise).error, "CANCELLED");
  manager.dispose();
});
