const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const { fileURLToPath } = require("node:url");
const { writeAudioFixtures } = require("./fixtures.cjs");
const { createLocalCovers, MAX_COVER_BYTES } = require("../app/local-covers");
const {
  createAudioInspection,
  RangeTokenizer,
  MAX_BYTES,
} = require("../app/audio-inspection");

const input = {
  requestId: "probe",
  trackId: "netrack_probe",
  platform: "netease",
  url: "https://music.126.net/fixture.m4a",
};
const png = Buffer.from("89504e470d0a1a0a00000000", "hex");
test("bounded tokenizer fills requested buffer offsets and preserves read positions", async () => {
  const input = Buffer.from([1, 2, 3, 4, 5]);
  const tokenizer = new RangeTokenizer(
    async (position, length) => input.subarray(position, position + length),
    { size: input.length },
    new AbortController().signal
  );
  const buffer = new Uint8Array([9, 9, 9, 9]);
  assert.equal(await tokenizer.readBuffer(buffer, { offset: 1, length: 2 }), 2);
  assert.deepEqual([...buffer], [9, 1, 2, 9]);
  assert.equal(tokenizer.position, 2);
  assert.equal(
    await tokenizer.readToken({ len: 1, get: (value) => value[0] }, null),
    3
  );
  assert.equal(tokenizer.position, 3);
  await assert.rejects(tokenizer.peekBuffer(buffer, { offset: 3, length: 2 }), {
    code: "RESOURCE_LIMIT",
  });
});
const atom = (name, payload) => {
  const header = Buffer.alloc(8);
  header.writeUInt32BE(payload.length + 8);
  header.write(name, 4);
  return Buffer.concat([header, payload]);
};
const tailFile = () =>
  Buffer.concat([
    atom("ftyp", Buffer.from("M4A \0\0\0\0M4A ")),
    atom("mdat", Buffer.alloc(MAX_BYTES + 64)),
    atom("free", Buffer.alloc(32)),
  ]);
function ranges(bytes, mutate) {
  const calls = [];
  const fetch = async (url, options) => {
    const [, first, last] = /bytes=(\d+)-(\d+)/.exec(options.headers.Range);
    const start = Number(first),
      end = Math.min(Number(last), bytes.length - 1);
    calls.push({ start, end, validator: options.headers["If-Range"] });
    return new Response(bytes.subarray(start, end + 1), {
      status: 206,
      headers: {
        "content-type": "audio/mp4",
        "content-range": `bytes ${start}-${end}/${bytes.length}`,
        etag: mutate && calls.length > 1 ? '"new"' : '"same"',
      },
    });
  };
  return { fetch, calls };
}

test("cover copies survive source deletion and restart; only provisional copies can be released", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "listen1-covers-"));
  try {
    const file = path.join(root, "原封面 #1.png");
    await fs.writeFile(file, png);
    await assert.rejects(
      createLocalCovers(root, async () => {
        throw Error("decoder failed");
      }).import(file),
      /decoder failed/
    );
    const manager = createLocalCovers(root, () => ({
      width: 100,
      height: 100,
    }));
    const saved = await manager.import(file);
    assert.equal(saved.fileName, path.basename(file));
    manager.retain(saved.assetId);
    await manager.release(saved.assetId);
    await fs.unlink(file);
    const restarted = createLocalCovers(root, () => {
      throw Error("no decoding on lookup");
    });
    assert.equal(await restarted.url(saved.assetId), saved.url);
    assert.deepEqual(await fs.readFile(fileURLToPath(saved.url)), png);
    const nextFile = path.join(root, "next.png");
    await fs.writeFile(nextFile, png);
    const draft = await manager.import(nextFile);
    await manager.release(draft.assetId);
    await assert.rejects(manager.url(draft.assetId));
    await assert.rejects(manager.url("../outside"), { code: "COVER_INVALID" });
    assert.deepEqual(await fs.readFile(nextFile), png);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("cover import rejects actual non-images, oversized files, invalid dimensions and write failures", async () => {
  const root = await fs.mkdtemp(
    path.join(os.tmpdir(), "listen1-covers-invalid-")
  );
  try {
    const file = path.join(root, "test.png");
    const manager = createLocalCovers(root, () => ({
      width: 100,
      height: 100,
    }));
    await fs.writeFile(file, "not a png");
    await assert.rejects(manager.import(file), { code: "COVER_INVALID" });
    await fs.writeFile(file, Buffer.alloc(MAX_COVER_BYTES + 1));
    await assert.rejects(manager.import(file), { code: "COVER_TOO_LARGE" });
    await fs.writeFile(file, png);
    for (const size of [
      { width: 0, height: 1 },
      { width: 8193, height: 1 },
      { width: 8000, height: 8000 },
    ])
      await assert.rejects(createLocalCovers(root, () => size).import(file), {
        code: "COVER_INVALID",
      });
    await fs.writeFile(path.join(root, "covers"), "blocks mkdir");
    await assert.rejects(manager.import(file));
    assert.deepEqual(await fs.readFile(file), png);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("local details parse real audio/stat/sidecar without overwriting or inventing metadata", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "listen1-info-"));
  try {
    const files = writeAudioFixtures(root);
    const original = await fs.readFile(files.audio);
    const manager = createAudioInspection(() => {
      throw Error("local files must stay local");
    });
    const details = await manager.inspect({
      requestId: "local",
      trackId: `lmtrack_${files.audio}`,
    });
    assert.equal(details.error, undefined);
    assert.equal(details.fileSize, original.length);
    assert.equal(details.filePath, files.audio);
    assert.equal(details.audioInfo.codec, "PCM");
    assert.equal(details.audioInfo.sampleRate, 22050);
    assert.equal(details.audioInfo.bitsPerSample, 16);
    assert.equal(details.audioInfo.duration, 40);
    assert.equal(details.originalLyric.provenance.kind, "file");
    assert.equal(
      details.originalLyric.provenance.fileName,
      path.basename(files.audio, ".wav") + ".lrc"
    );
    assert.deepEqual(await fs.readFile(files.audio), original);
    const missing = await manager.inspect({
      requestId: "missing",
      trackId: `lmtrack_${path.join(root, "missing.wav")}`,
    });
    assert.equal(missing.error, "ENOENT");
    assert.deepEqual(missing.audioInfo, {});
    assert.equal(missing.fileSize, undefined);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("Range probes skip large audio payloads and detect changing assets across ranges", async () => {
  const bytes = tailFile();
  const server = ranges(bytes);
  const result = await createAudioInspection(server.fetch).inspect(input);
  assert.equal(result.error, "INSPECTION_INCOMPLETE");
  assert.equal(result.fileSize, bytes.length);
  assert.equal(result.audioInfo.container, "M4A");
  assert.equal(result.audioInfo.codec, undefined);
  assert.equal(server.calls.length, 2);
  assert.ok(server.calls[1].start >= MAX_BYTES);
  assert.equal(server.calls[1].validator, '"same"');
  const changed = await createAudioInspection(
    ranges(bytes, true).fetch
  ).inspect(input);
  assert.equal(changed.error, "SOURCE_CHANGED");
  assert.deepEqual(changed.audioInfo, {});
  assert.equal(changed.fileSize, undefined);
});

test("non-Range probes enforce the 8 MiB read limit, cancel bodies and preserve only confirmed fields", async () => {
  const bytes = tailFile();
  let delivered = 0,
    cancelled = false;
  const manager = createAudioInspection(
    async () =>
      new Response(
        new ReadableStream(
          {
            pull(controller) {
              const part = bytes.subarray(delivered, delivered + 65536);
              delivered += part.length;
              if (part.length) controller.enqueue(part);
              else controller.close();
            },
            cancel() {
              cancelled = true;
            },
          },
          { highWaterMark: 0 }
        ),
        {
          headers: {
            "content-length": String(bytes.length),
            "content-type": "audio/mp4",
          },
        }
      )
  );
  const result = await manager.inspect(input);
  assert.ok(delivered <= MAX_BYTES);
  assert.equal(cancelled, true);
  assert.equal(result.audioInfo.container, "M4A");
  assert.equal(result.audioInfo.codec, undefined);
  assert.ok(result.error);
  assert.equal(result.fileSize, bytes.length);
});

test("inspection cancellation, timeout, hostile redirects and invalid ranges terminate safely", async () => {
  const blocked = createAudioInspection(
    async () =>
      new Response(null, {
        status: 302,
        headers: { location: "http://127.0.0.1/private" },
      })
  );
  assert.equal((await blocked.inspect(input)).error, "UNSUPPORTED_SOURCE");
  const invalid = createAudioInspection(
    async () =>
      new Response(Uint8Array.of(1), {
        status: 206,
        headers: { "content-range": "bytes 1-1/2" },
      })
  );
  assert.equal((await invalid.inspect(input)).error, "INVALID_RESPONSE");
  const delayed = createAudioInspection(
    (url, { signal }) =>
      new Promise((resolve, reject) =>
        signal.addEventListener("abort", () => reject(Error("aborted")), {
          once: true,
        })
      )
  );
  assert.equal(
    (await delayed.inspect({ ...input, timeoutMs: 25 })).error,
    "INSPECTION_TIMEOUT"
  );
  const task = delayed.inspect(input);
  await new Promise((resolve) => setTimeout(resolve, 20));
  delayed.cancel(input.requestId);
  assert.equal((await task).error, "CANCELLED");
  assert.equal(
    (await delayed.inspect({ ...input, url: "file:///C:/private.wav" })).error,
    "UNSUPPORTED_SOURCE"
  );
});
