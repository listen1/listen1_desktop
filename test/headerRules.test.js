/**
 * headerRules 的单元测试：不联网，只校验规则命中的头。
 * 运行：npm run test:rules
 */
const assert = require("assert");
const { test } = require("node:test");
const { applyHeaderRules, MOBILE_UA } = require("../app/headerRules");

/** @param {string} url @param {Record<string,string>} [headers] */
function headersFor(url, headers = {}) {
  return applyHeaderRules(url, { "User-Agent": "electron", ...headers });
}

test("网易云 eapi 补上 Referer/Origin/Cookie", () => {
  const h = headersFor("https://interface3.music.163.com/eapi/song/enhance/player/url");
  assert.strictEqual(h.Referer, "https://music.163.com/");
  assert.strictEqual(h.Origin, "https://music.163.com");
  assert.strictEqual(h.Cookie, "os=pc; appver=8.9.70");
});

test("网易云 weapi 同样命中", () => {
  const h = headersFor("https://music.163.com/weapi/cloudsearch/get/web");
  assert.strictEqual(h.Cookie, "os=pc; appver=8.9.70");
});

test("QQ 音乐改写 Referer/Origin", () => {
  const h = headersFor("https://c.y.qq.com/soso/fcgi-bin/client_search_cp");
  assert.strictEqual(h.Referer, "https://y.qq.com/");
  assert.strictEqual(h.Origin, "https://y.qq.com");
});

test("酷狗换移动端 UA 并删除 Origin", () => {
  const h = headersFor("https://songsearch.kugou.com/song_search_v2", {
    Origin: "https://www.kugou.com",
  });
  assert.strictEqual(h["User-Agent"], MOBILE_UA);
  assert.ok(!("Origin" in h), "Origin 应被删除");
});

test("bilibili API 删除 Origin（带 Origin 会被 412）", () => {
  const h = headersFor("https://api.bilibili.com/x/web-interface/view?aid=1", {
    Origin: "https://www.bilibili.com",
  });
  assert.strictEqual(h.Referer, "https://www.bilibili.com/");
  assert.ok(!("Origin" in h), "Origin 应被删除");
});

test("bilibili 音频 CDN 保留 Origin", () => {
  const h = headersFor("https://upos-sz-mirror.bilivideo.com/x.m4s");
  assert.strictEqual(h.Referer, "https://www.bilibili.com/");
  assert.strictEqual(h.Origin, "https://www.bilibili.com");
});

test("咪咕带 Referer/Origin，但不覆盖 provider 自带的 channel", () => {
  const h = headersFor("https://app.c.nf.migu.cn/MIGUM3.0/strategy/pc/listen/v1.0", {
    channel: "0146951",
  });
  assert.strictEqual(h.Referer, "https://music.migu.cn/");
  assert.strictEqual(h.Origin, "https://music.migu.cn");
  assert.strictEqual(h.channel, "0146951", "channel 应由 migu.js 决定，不能被改写");
});

test("千千音乐改写 Referer", () => {
  const h = headersFor("https://music.taihe.com/v1/search?word=test");
  assert.strictEqual(h.Referer, "https://music.taihe.com/");
});

test("大小写不敏感：小写 referer 会被覆盖而不是新增", () => {
  const h = headersFor("https://c.y.qq.com/soso/fcgi-bin/client_search_cp", {
    referer: "https://example.com/",
  });
  assert.strictEqual(h.referer, "https://y.qq.com/");
  assert.ok(!("Referer" in h), "不应新增一个大小写不同的重复头");
  assert.strictEqual(
    Object.keys(h).filter((k) => k.toLowerCase() === "referer").length,
    1
  );
});

test("无关域名不被改写", () => {
  const h = headersFor("https://example.com/api", { Referer: "https://a.b/" });
  assert.strictEqual(h.Referer, "https://a.b/");
  assert.ok(!("Origin" in h));
});

test("非法 URL 不抛异常", () => {
  assert.doesNotThrow(() => applyHeaderRules("not a url", { Referer: "x" }));
});
