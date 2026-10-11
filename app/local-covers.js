// Managed copies are addressed by opaque IDs, never by renderer-supplied paths.
const fs = require("node:fs/promises");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const { pathToFileURL } = require("node:url");

const MAX_COVER_BYTES = 10 * 1024 * 1024;
const validId = (id) =>
  typeof id === "string" &&
  /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/.test(id);
const fail = (code) => Object.assign(new Error(code), { code });

function imageFormat(bytes) {
  if (bytes.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex")))
    return "png";
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return "jpg";
  if (
    bytes.toString("ascii", 0, 4) === "RIFF" &&
    bytes.toString("ascii", 8, 12) === "WEBP"
  )
    return "webp";
  throw fail("COVER_INVALID");
}

function createLocalCovers(root, decodeImage) {
  const directory = path.resolve(root, "covers");
  const pending = new Set();
  let importing = 0;
  const folder = (id) => {
    if (!validId(id)) throw fail("COVER_INVALID");
    const target = path.resolve(directory, id);
    if (path.dirname(target) !== directory) throw fail("COVER_INVALID");
    return target;
  };
  const release = async (id) => {
    if (!pending.delete(id)) return;
    const target = folder(id);
    // Only remove files this importer created; committed copies survive backups.
    for (const name of [
      "image.png",
      "image.jpg",
      "image.webp",
      "metadata.json",
    ]) {
      await fs.unlink(path.join(target, name)).catch((error) => {
        if (error.code !== "ENOENT") throw error;
      });
    }
    await fs.rmdir(target);
  };
  return {
    async import(file) {
      if (pending.size + importing >= 4) throw fail("RESOURCE_LIMIT");
      importing += 1;
      try {
        const handle = await fs.open(file, "r");
        let bytes;
        try {
          const stat = await handle.stat();
          if (!stat.isFile() || stat.size > MAX_COVER_BYTES)
            throw fail("COVER_TOO_LARGE");
          const buffer = Buffer.alloc(MAX_COVER_BYTES + 1);
          let size = 0;
          while (size < buffer.length) {
            const part = await handle.read(
              buffer,
              size,
              buffer.length - size,
              size
            );
            if (!part.bytesRead) break;
            size += part.bytesRead;
          }
          if (size > MAX_COVER_BYTES) throw fail("COVER_TOO_LARGE");
          bytes = buffer.subarray(0, size);
        } finally {
          await handle.close();
        }
        const extension = imageFormat(bytes);
        const size = await decodeImage(bytes, extension);
        if (
          !size ||
          !Number.isSafeInteger(size.width) ||
          !Number.isSafeInteger(size.height) ||
          size.width <= 0 ||
          size.height <= 0 ||
          size.width > 8192 ||
          size.height > 8192 ||
          size.width * size.height > 40000000
        )
          throw fail("COVER_INVALID");
        const assetId = randomUUID();
        const target = folder(assetId);
        const fileName = path.basename(file);
        pending.add(assetId);
        try {
          await fs.mkdir(target, { recursive: true });
          const storedName = `image.${extension}`;
          await fs.writeFile(path.join(target, storedName), bytes, {
            flag: "wx",
          });
          await fs.writeFile(
            path.join(target, "metadata.json"),
            JSON.stringify({ storedName, fileName }),
            { flag: "wx" }
          );
          return {
            assetId,
            fileName,
            url: pathToFileURL(path.join(target, storedName)).href,
          };
        } catch (error) {
          await release(assetId).catch(() => {});
          throw error;
        }
      } finally {
        importing -= 1;
      }
    },
    async url(id) {
      const target = folder(id);
      const metadata = JSON.parse(
        await fs.readFile(path.join(target, "metadata.json"), "utf8")
      );
      if (!/^image\.(png|jpg|webp)$/.test(metadata.storedName))
        throw fail("COVER_INVALID");
      const file = path.join(target, metadata.storedName);
      if (!(await fs.stat(file)).isFile()) throw fail("COVER_INVALID");
      return pathToFileURL(file).href;
    },
    retain(id) {
      folder(id);
      pending.delete(id);
    },
    release,
  };
}

module.exports = { createLocalCovers, MAX_COVER_BYTES, imageFormat };
