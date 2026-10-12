// Session-only compressed audio cache. No audio or credentials are persisted.
const fs = require("node:fs/promises");
const { createHash, randomUUID } = require("node:crypto");
const { isAbsolute, extname } = require("node:path");

const MAX_BYTES = 128 * 1024 * 1024;
const CHUNK_BYTES = 1024 * 1024;
const READ_TIMEOUT_MS = 30000;
const MEDIA_DOMAINS = {
  netease: ["music.126.net", "music.163.com"],
  qq: ["qq.com", "qqmusic.cn"],
  kugou: ["kugou.com", "kugou.net"],
  kuwo: ["kuwo.cn"],
  bilibili: ["bilivideo.com", "bilivideo.cn", "bilibili.com", "akamaized.net"],
  migu: ["migu.cn", "migucloud.com", "cmvideo.cn", "miguvideo.com"],
  taihe: ["taihe.com", "91q.com", "qianqian.com", "bdstatic.com"],
};

function failure(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

function allowedMediaUrl(value, platform) {
  try {
    const url = new URL(value);
    return (
      value.length <= 16384 &&
      ["http:", "https:"].includes(url.protocol) &&
      !url.username &&
      !url.password &&
      (!url.port ||
        ["80", "443"].includes(url.port) ||
        (platform === "bilibili" &&
          url.protocol === "https:" &&
          url.hostname.endsWith(".mcdn.bilivideo.cn") &&
          url.port === "8082")) &&
      (MEDIA_DOMAINS[platform] || []).some(
        (domain) =>
          url.hostname === domain || url.hostname.endsWith(`.${domain}`)
      )
    );
  } catch {
    return false;
  }
}

function createAudioAssets(fetchAudio) {
  const requests = new Map();
  const leases = new Map();
  const cache = new Map();
  let bytesUsed = 0;
  const trim = () => {
    for (const [key, entry] of cache) {
      if (bytesUsed <= MAX_BYTES) break;
      cache.delete(key);
      bytesUsed -= entry.bytes.length;
    }
  };
  const lease = (entry) => {
    const assetId = randomUUID();
    leases.set(assetId, entry);
    return {
      assetId,
      fingerprint: entry.fingerprint,
      byteLength: entry.bytes.length,
    };
  };
  const prepare = async (input) => {
    let controller;
    let timer;
    let timedOut = false;
    try {
      if (
        !input ||
        typeof input.requestId !== "string" ||
        !/^[\w-]{1,100}$/.test(input.requestId) ||
        typeof input.trackId !== "string" ||
        input.trackId.length > 32768
      )
        throw failure("INVALID_SOURCE");
      if (
        requests.has(input.requestId) ||
        requests.size >= 2 ||
        leases.size >= 4
      )
        throw failure("RESOURCE_LIMIT");
      controller = new AbortController();
      requests.set(input.requestId, controller);
      timer = setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, READ_TIMEOUT_MS);
      let key;
      let bytes;
      if (input.trackId.startsWith("lmtrack_")) {
        const file = input.trackId.slice(8);
        if (
          !isAbsolute(file) ||
          !/\.(mp3|flac|mp4|m4a|ogg|oga|opus|wav|webm|aac|aiff?|alac)$/i.test(
            extname(file)
          )
        )
          throw failure("INVALID_SOURCE");
        const before = await fs.stat(file);
        if (!before.isFile() || before.size > MAX_BYTES)
          throw failure("RESOURCE_LIMIT");
        key = `local:${file}:${before.size}:${before.mtimeMs}:${before.ctimeMs}`;
        if (cache.has(key)) {
          const entry = cache.get(key);
          cache.delete(key);
          cache.set(key, entry);
          if (controller.signal.aborted) throw failure("CANCELLED");
          return lease(entry);
        }
        bytes = await fs.readFile(file, { signal: controller.signal });
        const after = await fs.stat(file);
        if (
          before.size !== after.size ||
          before.mtimeMs !== after.mtimeMs ||
          before.ctimeMs !== after.ctimeMs
        )
          throw failure("SOURCE_CHANGED");
      } else {
        if (
          typeof input.url !== "string" ||
          !allowedMediaUrl(input.url, input.platform)
        )
          throw failure("UNSUPPORTED_SOURCE");
        key = `${input.platform}:${input.url}`;
        const cached = cache.get(key);
        if (cached && cached.expires > Date.now()) {
          cache.delete(key);
          cache.set(key, cached);
          return lease(cached);
        }
        let url = input.url;
        let response;
        for (let hop = 0; hop <= 5; hop += 1) {
          if (!allowedMediaUrl(url, input.platform))
            throw failure("UNSUPPORTED_SOURCE");
          response = await fetchAudio(url, {
            signal: controller.signal,
            credentials: "include",
            redirect: "manual",
            headers: {
              Accept: "audio/*,video/mp4,application/octet-stream;q=0.9",
            },
          });
          if (![301, 302, 303, 307, 308].includes(response.status)) break;
          const location = response.headers.get("location");
          await response.body?.cancel();
          if (!location || hop === 5) throw failure("UNSUPPORTED_SOURCE");
          url = new URL(location, url).href;
        }
        if (!response.ok || response.status === 206) {
          await response.body?.cancel();
          throw failure("NETWORK_ERROR");
        }
        const type = response.headers.get("content-type") || "";
        if (
          /^(text\/|application\/(json|xml|vnd\.apple\.mpegurl|x-mpegurl))/i.test(
            type
          )
        ) {
          await response.body?.cancel();
          throw failure("UNSUPPORTED_SOURCE");
        }
        if (Number(response.headers.get("content-length")) > MAX_BYTES) {
          await response.body?.cancel();
          throw failure("RESOURCE_LIMIT");
        }
        const reader = response.body.getReader();
        const chunks = [];
        let size = 0;
        try {
          for (;;) {
            const part = await reader.read();
            if (part.done) break;
            size += part.value.length;
            if (size > MAX_BYTES) throw failure("RESOURCE_LIMIT");
            chunks.push(Buffer.from(part.value));
          }
        } catch (error) {
          await reader.cancel().catch(() => {});
          throw error;
        }
        const expected = Number(response.headers.get("content-length"));
        if (
          !size ||
          (expected &&
            !response.headers.get("content-encoding") &&
            expected !== size)
        )
          throw failure("NETWORK_ERROR");
        bytes = Buffer.concat(chunks, size);
      }
      if (controller.signal.aborted) throw failure("CANCELLED");
      const entry = {
        bytes,
        fingerprint: createHash("sha256").update(bytes).digest("hex"),
        expires: Date.now() + 5 * 60000,
      };
      if (cache.has(key)) bytesUsed -= cache.get(key).bytes.length;
      cache.set(key, entry);
      bytesUsed += bytes.length;
      trim();
      return lease(entry);
    } catch (error) {
      return {
        error:
          error.code === "ENOENT"
            ? "FILE_MISSING"
            : controller?.signal.aborted
              ? timedOut
                ? "NETWORK_ERROR"
                : "CANCELLED"
              : [
                    "INVALID_SOURCE",
                    "RESOURCE_LIMIT",
                    "UNSUPPORTED_SOURCE",
                    "SOURCE_CHANGED",
                    "FILE_MISSING",
                  ].includes(error.code)
                ? error.code
                : "NETWORK_ERROR",
      };
    } finally {
      clearTimeout(timer);
      if (controller && requests.get(input?.requestId) === controller)
        requests.delete(input.requestId);
    }
  };
  return {
    prepare,
    read({ assetId, offset, length }) {
      const entry = leases.get(assetId);
      if (
        !entry ||
        !Number.isSafeInteger(offset) ||
        offset < 0 ||
        !Number.isSafeInteger(length) ||
        length < 1 ||
        length > CHUNK_BYTES ||
        offset + length > entry.bytes.length
      )
        throw failure("INVALID_ASSET");
      return new Uint8Array(entry.bytes.subarray(offset, offset + length));
    },
    cancel(requestId) {
      requests.get(requestId)?.abort();
    },
    release(assetId) {
      leases.delete(assetId);
    },
    resetConsumers() {
      for (const controller of requests.values()) controller.abort();
      requests.clear();
      leases.clear();
    },
    dispose() {
      for (const controller of requests.values()) controller.abort();
      leases.clear();
      cache.clear();
      bytesUsed = 0;
    },
  };
}

module.exports = { createAudioAssets, allowedMediaUrl, MAX_BYTES, CHUNK_BYTES };
