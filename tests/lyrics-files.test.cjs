const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const syncFs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const vm = require("node:vm");

function reader(open = fs.open) {
  const module = { exports: {} };
  vm.runInNewContext(
    syncFs.readFileSync(path.join(__dirname, "../app/functions.js"), "utf8"),
    {
      module,
      Buffer,
      TextDecoder,
      require(name) {
        if (name === "fs/promises") return { readFile: fs.readFile, open };
        if (name === "chardet") return { detect: () => "utf-8" };
        return require(name);
      },
    }
  );
  return module.exports.readLocalLyric;
}

test("explicit LRC files decode strict UTF-8 with BOM and reject invalid encoding, extension and size", async (t) => {
  const temporaryRoot = path.resolve(os.tmpdir());
  const directory = await fs.mkdtemp(path.join(temporaryRoot, "listen1-lrc-"));
  t.after(async () => {
    assert.equal(path.dirname(path.resolve(directory)), temporaryRoot);
    await fs.rm(directory, { recursive: true, force: true });
  });
  const read = reader();
  const lyric = path.join(directory, "中文.LRC");
  await fs.writeFile(lyric, "\uFEFF[ti:Title]\r\n\r\n[00:01]正文\r\n", "utf8");
  assert.equal(await read(lyric), "[ti:Title]\r\n\r\n[00:01]正文\r\n");
  await fs.writeFile(lyric, Buffer.from([0xff, 0xfe, 0x00, 0x01]));
  await assert.rejects(read(lyric), { code: "INVALID_UTF8" });
  await assert.rejects(read(path.join(directory, "song.txt")), {
    code: "INVALID_LRC_FILE",
  });
  await fs.writeFile(lyric, Buffer.alloc(1024 * 1024 + 1));
  await assert.rejects(read(lyric), { code: "LYRIC_TOO_LARGE" });
  await assert.rejects(read(path.join(directory, "missing.lrc")), {
    code: "ENOENT",
  });
});

test("bounded reads also reject a file growing after stat and close the file handle", async () => {
  let closed = false;
  const read = reader(async () => ({
    stat: async () => ({ size: 1, isFile: () => true }),
    read: async (buffer, offset, length) => {
      buffer.fill(65, offset, offset + length);
      return { bytesRead: length };
    },
    close: async () => {
      closed = true;
    },
  }));
  await assert.rejects(read("C:/fixture/growing.lrc"), {
    code: "LYRIC_TOO_LARGE",
  });
  assert.equal(closed, true);
});
