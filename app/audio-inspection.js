// Bounded, read-only metadata probes. No media URLs or audio bytes are persisted.
const fs = require("node:fs/promises");
const { isAbsolute, extname } = require("node:path");
const { allowedMediaUrl } = require("./audio-assets");
const { readOriginalLyrics } = require("./functions");

const MAX_BYTES = 8 * 1024 * 1024;
const BLOCK_BYTES = 64 * 1024;
const fail = (code) => Object.assign(new Error(code), { code });
let metadataModule;
const parser = () => (metadataModule ||= import("music-metadata"));
function audioFields(format = {}) {
  const result = {};
  for (const key of ["codec", "container"]) {
    if (typeof format[key] === "string")
      result[key] = format[key].slice(0, 200);
  }
  for (const key of ["duration", "bitrate", "sampleRate", "bitsPerSample"]) {
    if (Number.isFinite(format[key]) && format[key] > 0)
      result[key] = format[key];
  }
  if (typeof format.lossless === "boolean") result.lossless = format.lossless;
  return result;
}

// Implements music-metadata's public tokenizer interface. Ignoring audio data
// advances an offset; Range servers let MP4 metadata at the end be read directly.
class RangeTokenizer {
  constructor(readAt, fileInfo, signal) {
    this.readAt = readAt;
    this.fileInfo = fileInfo;
    this.signal = signal;
    this.position = 0;
  }
  supportsRandomAccess() {
    return false;
  }
  async peekBuffer(buffer, options = {}) {
    if (this.signal.aborted) throw fail("CANCELLED");
    const position = options.position ?? this.position;
    const offset = options.offset ?? 0;
    const length = options.length ?? buffer.length - offset;
    if (
      !Number.isSafeInteger(position) ||
      position < 0 ||
      !Number.isSafeInteger(length) ||
      length < 0 ||
      length > MAX_BYTES ||
      !Number.isSafeInteger(offset) ||
      offset < 0 ||
      offset + length > buffer.length
    )
      throw fail("RESOURCE_LIMIT");
    let bytes;
    try {
      bytes = await this.readAt(position, length);
    } catch (error) {
      this.error = error;
      throw error;
    }
    buffer.set(bytes.subarray(0, length), offset);
    if (bytes.length < length && !options.mayBeLess) {
      const error = new Error("End-Of-Stream");
      error.name = "EndOfStreamError";
      throw error;
    }
    return bytes.length;
  }
  async readBuffer(buffer, options = {}) {
    const length = await this.peekBuffer(buffer, options);
    this.position = (options.position ?? this.position) + length;
    return length;
  }
  async peekToken(token, position = this.position) {
    if (
      !Number.isSafeInteger(token.len) ||
      token.len < 0 ||
      token.len > MAX_BYTES
    ) {
      this.error = fail("RESOURCE_LIMIT");
      throw this.error;
    }
    const buffer = new Uint8Array(token.len);
    await this.peekBuffer(buffer, { position: position ?? this.position });
    return token.get(buffer, 0);
  }
  async readToken(token, position = this.position) {
    const start = position ?? this.position;
    const value = await this.peekToken(token, start);
    this.position = start + token.len;
    return value;
  }
  readNumber(token) {
    return this.readToken(token);
  }
  peekNumber(token) {
    return this.peekToken(token);
  }
  async ignore(length) {
    if (!Number.isSafeInteger(length) || length < 0)
      throw fail("INVALID_SOURCE");
    const count = Math.min(
      length,
      this.fileInfo.size === undefined
        ? length
        : Math.max(0, this.fileInfo.size - this.position)
    );
    this.position += count;
    return count;
  }
  async close() {}
  async abort() {}
}

function createAudioInspection(fetchAudio) {
  const requests = new Map();
  return {
    cancel(id) {
      requests.get(id)?.abort();
    },
    dispose() {
      for (const controller of requests.values()) controller.abort();
    },
    async inspect(input) {
      let timer;
      let controller;
      let handle;
      let expired = false;
      let format = {};
      const result = {};
      try {
        if (
          !input ||
          typeof input.requestId !== "string" ||
          !/^[\w-]{1,100}$/.test(input.requestId) ||
          typeof input.trackId !== "string" ||
          input.trackId.length > 32768
        )
          throw fail("INVALID_SOURCE");
        if (requests.has(input.requestId) || requests.size >= 2)
          throw fail("RESOURCE_LIMIT");
        controller = new AbortController();
        requests.set(input.requestId, controller);
        const signal = controller.signal;
        const timeout = Number.isFinite(input.timeoutMs)
          ? Math.max(1, Math.min(15000, input.timeoutMs))
          : 15000;
        timer = setTimeout(() => {
          expired = true;
          controller.abort();
        }, timeout);
        const { parseFromTokenizer } = await parser();
        let tokenizer;
        let before;
        let readBytes = 0;
        if (input.trackId.startsWith("lmtrack_")) {
          const file = input.trackId.slice(8);
          if (
            !isAbsolute(file) ||
            !/^\.(mp3|flac|mp4|m4a|ogg|oga|opus|wav|webm|aac|aiff?|alac)$/i.test(
              extname(file)
            )
          )
            throw fail("INVALID_SOURCE");
          handle = await fs.open(file, "r");
          before = await handle.stat();
          if (!before.isFile()) throw fail("INVALID_SOURCE");
          result.fileSize = before.size;
          result.filePath = file;
          tokenizer = new RangeTokenizer(
            async (position, length) => {
              if (signal.aborted) throw fail("CANCELLED");
              if (readBytes + length > MAX_BYTES) throw fail("RESOURCE_LIMIT");
              const buffer = Buffer.alloc(length);
              const { bytesRead } = await handle.read(
                buffer,
                0,
                length,
                position
              );
              readBytes += bytesRead;
              return buffer.subarray(0, bytesRead);
            },
            { size: before.size, path: file },
            signal
          );
        } else {
          if (!allowedMediaUrl(input.url, input.platform))
            throw fail("UNSUPPORTED_SOURCE");
          const blocks = new Map();
          let prefix;
          let validator;
          const fileInfo = {};
          const fetchRange = async (start) => {
            let url = input.url;
            let response;
            for (let hop = 0; hop <= 5; hop += 1) {
              if (!allowedMediaUrl(url, input.platform))
                throw fail("UNSUPPORTED_SOURCE");
              response = await fetchAudio(url, {
                signal,
                credentials: "include",
                redirect: "manual",
                headers: {
                  Range: `bytes=${start}-${start + BLOCK_BYTES - 1}`,
                  ...(validator ? { "If-Range": validator } : {}),
                },
              });
              if (![301, 302, 303, 307, 308].includes(response.status)) break;
              const next = response.headers.get("location");
              await response.body?.cancel();
              if (!next || hop === 5) throw fail("UNSUPPORTED_SOURCE");
              url = new URL(next, url).href;
            }
            const cancel = () => response.body?.cancel().catch(() => {});
            if (![200, 206].includes(response.status)) {
              await cancel();
              throw fail("NETWORK_ERROR");
            }
            const type = response.headers.get("content-type") || "";
            if (
              /^(text\/|application\/(json|xml|vnd\.apple\.mpegurl|x-mpegurl))/i.test(
                type
              )
            ) {
              await cancel();
              throw fail("UNSUPPORTED_SOURCE");
            }
            const currentValidator =
              response.headers.get("etag") ||
              response.headers.get("last-modified");
            if (validator && currentValidator !== validator) {
              await cancel();
              throw fail("SOURCE_CHANGED");
            }
            validator ||= currentValidator;
            fileInfo.mimeType = type || undefined;
            const range = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(
              response.headers.get("content-range") || ""
            );
            if (
              response.status === 206 &&
              (!range ||
                Number(range[1]) !== start ||
                Number(range[2]) < start ||
                Number(range[2]) >= Number(range[3]) ||
                Number(range[2]) - start + 1 > BLOCK_BYTES)
            ) {
              await cancel();
              throw fail("INVALID_RESPONSE");
            }
            const total =
              response.status === 206
                ? Number(range[3])
                : Number(response.headers.get("content-length")) || undefined;
            if (
              total !== undefined &&
              (!Number.isSafeInteger(total) ||
                total < 0 ||
                (fileInfo.size !== undefined && total !== fileInfo.size))
            ) {
              await cancel();
              throw fail("SOURCE_CHANGED");
            }
            if (
              total !== undefined &&
              !response.headers.get("content-encoding")
            ) {
              fileInfo.size = total;
              result.fileSize = total;
            }
            if (response.status === 200 && start !== 0) {
              await cancel();
              throw fail("SOURCE_CHANGED");
            }
            const reader = response.body.getReader();
            const chunks = [];
            let size = 0;
            const limit =
              response.status === 206
                ? Math.min(BLOCK_BYTES, MAX_BYTES - readBytes)
                : MAX_BYTES - readBytes;
            try {
              while (size < limit) {
                const part = await reader.read();
                if (part.done) break;
                readBytes += part.value.length;
                if (readBytes > MAX_BYTES) throw fail("RESOURCE_LIMIT");
                size += part.value.length;
                chunks.push(Buffer.from(part.value));
              }
            } finally {
              await reader.cancel().catch(() => {});
            }
            const bytes = Buffer.concat(chunks, size);
            if (response.status === 200) prefix = bytes;
            else if (bytes.length !== Number(range[2]) - start + 1)
              throw fail("NETWORK_ERROR");
            return bytes;
          };
          blocks.set(0, await fetchRange(0));
          tokenizer = new RangeTokenizer(
            async (position, length) => {
              if (prefix) return prefix.subarray(position, position + length);
              const chunks = [];
              let remaining = Math.min(
                length,
                fileInfo.size === undefined
                  ? length
                  : Math.max(0, fileInfo.size - position)
              );
              while (remaining > 0) {
                const start = Math.floor(position / BLOCK_BYTES) * BLOCK_BYTES;
                if (!blocks.has(start)) {
                  if (readBytes + BLOCK_BYTES > MAX_BYTES)
                    throw fail("RESOURCE_LIMIT");
                  blocks.set(start, await fetchRange(start));
                }
                const block = blocks.get(start);
                const part = block.subarray(
                  position - start,
                  Math.min(block.length, position - start + remaining)
                );
                if (!part.length) break;
                chunks.push(part);
                remaining -= part.length;
                position += part.length;
              }
              return Buffer.concat(chunks);
            },
            fileInfo,
            signal
          );
        }
        const metadata = await parseFromTokenizer(tokenizer, {
          duration: false,
          skipCovers: true,
          skipPostHeaders: true,
          observer: (event) => {
            if (event.tag.type === "format")
              format = audioFields(event.metadata.format);
          },
        });
        // Some container parsers treat a failed tail read as EOF. Transport
        // errors still invalidate the probe even if they return partial tags.
        if (tokenizer.error) throw tokenizer.error;
        format = audioFields(metadata.format);
        if (handle) {
          result.originalLyric = await readOriginalLyrics(
            result.filePath,
            metadata.common
          );
          const after = await handle.stat();
          if (
            before.size !== after.size ||
            before.mtimeMs !== after.mtimeMs ||
            before.ctimeMs !== after.ctimeMs
          )
            throw fail("SOURCE_CHANGED");
        }
        if (signal.aborted) throw fail("CANCELLED");
        return {
          ...result,
          audioInfo: format,
          ...(!format.codec ? { error: "INSPECTION_INCOMPLETE" } : {}),
        };
      } catch (error) {
        const code = expired
          ? "INSPECTION_TIMEOUT"
          : controller?.signal.aborted
            ? "CANCELLED"
            : [
                  "INVALID_SOURCE",
                  "UNSUPPORTED_SOURCE",
                  "SOURCE_CHANGED",
                  "RESOURCE_LIMIT",
                  "NETWORK_ERROR",
                  "INVALID_RESPONSE",
                  "ENOENT",
                ].includes(error.code)
              ? error.code
              : "INSPECTION_INCOMPLETE";
        return {
          ...(["SOURCE_CHANGED", "CANCELLED"].includes(code) ? {} : result),
          audioInfo: ["SOURCE_CHANGED", "CANCELLED"].includes(code)
            ? {}
            : format,
          error: code,
        };
      } finally {
        clearTimeout(timer);
        controller?.abort();
        if (handle) await handle.close();
        if (controller && requests.get(input?.requestId) === controller)
          requests.delete(input.requestId);
      }
    },
  };
}

module.exports = {
  createAudioInspection,
  audioFields,
  RangeTokenizer,
  MAX_BYTES,
};
