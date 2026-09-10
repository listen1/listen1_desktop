#!/usr/bin/env node
/**
 * 各音乐平台接口的联网自检。
 *
 * 用途：这些平台会静默改接口（改参数名、加请求头、下线老端点），
 * 播放失败时先跑这个脚本，就能立刻分清是「平台变了」还是「我们挂了」。
 *
 * 运行：npm run verify:providers
 * 只测某一个平台：npm run verify:providers -- kuwo kugou
 *
 * 退出码：全部通过为 0，有失败为 1（方便挂到 CI 上）。
 */

const crypto = require("crypto");
const { applyHeaderRules } = require("../app/headerRules");

const DESKTOP_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const TIMEOUT_MS = 15000;

/**
 * 伪装成 Electron 主进程的请求：先套用 headerRules，再发出去，
 * 这样自检通过就等于 app 里也能通。
 * @param {string} url
 * @param {RequestInit} [init]
 */
async function fetchWithRules(url, init = {}) {
  /** @type {Record<string,string>} */
  const base = { "User-Agent": DESKTOP_UA, ...(init.headers || {}) };
  const headers = applyHeaderRules(url, base);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, { ...init, headers, signal: controller.signal });
    const text = await response.text();
    return { status: response.status, text };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * @typedef {Object} Check
 * @property {string} name
 * @property {string} platform
 * @property {string} url
 * @property {RequestInit} [init]
 * @property {(res: {status: number, text: string}) => string | true} expect
 *   返回 true 表示通过，返回字符串表示失败原因
 */

/** 酷我 token 缓存：一次自检只取一次 */
let kuwoToken;

/** 酷我要求 Secret 头，算法抄自 kuwo 官网前端 */
function kuwoSecret(text, key) {
  const digits = Array.from(key, (c) => c.charCodeAt(0)).join("");
  const r = Math.floor(digits.length / 5);
  const seed = parseInt(
    digits[r] +
      digits[2 * r] +
      digits[3 * r] +
      digits[4 * r] +
      digits[5 * r],
    10
  );
  const half = Math.ceil(key.length / 2);
  const cap = 2147483647;
  let rand = Math.round(1e9 * Math.random()) % 1e8;
  let n = digits + rand;
  while (n.length > 10) {
    n = (parseInt(n.slice(0, 10), 10) + parseInt(n.slice(10), 10)).toString();
  }
  n = (seed * n + half) % cap;
  let out = "";
  for (let i = 0; i < text.length; i += 1) {
    const byte = text.charCodeAt(i) ^ Math.floor((n / cap) * 255);
    out += byte.toString(16).padStart(2, "0");
    n = (seed * n + half) % cap;
  }
  let tail = rand.toString(16);
  while (tail.length < 8) tail = `0${tail}`;
  return out + tail;
}

const KUWO_COOKIE = "Hm_Iuvt_cdb524f42f23cer9b268564v7y735ewrq2324";

async function getKuwoAuth() {
  if (!kuwoToken) {
    const response = await fetch("https://www.kuwo.cn/", {
      headers: { "User-Agent": DESKTOP_UA },
    });
    const cookie = (response.headers.getSetCookie?.() || []).join(";");
    kuwoToken = new RegExp(`${KUWO_COOKIE}=([^;]+)`).exec(cookie)?.[1] ?? "";
  }
  return {
    Cookie: `${KUWO_COOKIE}=${kuwoToken}`,
    csrf: kuwoToken,
    Secret: kuwoSecret(kuwoToken, KUWO_COOKIE),
  };
}

/** 网易 eapi 的加密参数（对应扩展里的 netease.eapi） */
function neteaseEapi(url, payload) {
  const key = "e82ckenh8dichen8";
  const text = JSON.stringify(payload);
  const digest = crypto
    .createHash("md5")
    .update(`nobody${url}use${text}md5forencrypt`)
    .digest("hex");
  const data = `${url}-36cd479b6b5-${text}-36cd479b6b5-${digest}`;
  const cipher = crypto.createCipheriv("aes-128-ecb", Buffer.from(key), null);
  return Buffer.concat([cipher.update(Buffer.from(data)), cipher.final()])
    .toString("hex")
    .toUpperCase();
}

/** 千千音乐的签名（对应 taihe.js 里的 axiosTH 拦截器） */
function taiheSignedUrl(path, params) {
  const all = {
    ...params,
    timestamp: Math.round(Date.now() / 1000),
    appid: "16073360",
  };
  const query = new URLSearchParams(Object.entries(all).sort());
  all.sign = crypto
    .createHash("md5")
    .update(
      decodeURIComponent(`${query.toString()}0b50b02fd0d73a9c4c8c3a781c30845f`),
      "utf8"
    )
    .digest("hex");
  return `https://music.taihe.com/v1${path}?${new URLSearchParams(all)}`;
}

/** @returns {Check[]} */
function buildChecks() {
  return [
    {
      platform: "netease",
      name: "明文搜索 api/cloudsearch/pc",
      url: "https://music.163.com/api/cloudsearch/pc",
      init: {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: "s=test&type=1&limit=2&offset=0",
      },
      expect: ({ status, text }) =>
        status === 200 && text.includes('"songs"')
          ? true
          : `status=${status} body=${text.slice(0, 120)}`,
    },
    {
      platform: "netease",
      name: "eapi 取播放地址（缺 Referer 会 -110）",
      url: "https://interface3.music.163.com/eapi/song/enhance/player/url",
      init: {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          params: neteaseEapi("/api/song/enhance/player/url", {
            ids: "[347230]",
            br: 999000,
            encodeType: "flac",
          }),
        }).toString(),
      },
      expect: ({ status, text }) => {
        const data = JSON.parse(text).data?.[0];
        if (status !== 200 || !data) return `status=${status} body=${text.slice(0, 120)}`;
        if (data.code === -110) return "-110 未登录/缺 Referer（检查 headerRules 的 netease 规则）";
        return data.url ? true : `无播放地址（code=${data.code}，多为付费/版权限制）`;
      },
    },
    {
      platform: "qq",
      name: "c.y.qq.com 搜索",
      url: "https://c.y.qq.com/soso/fcgi-bin/client_search_cp?p=1&n=2&w=test&format=json",
      expect: ({ status, text }) =>
        status === 200 && text.includes('"code":0')
          ? true
          : `status=${status} body=${text.slice(0, 120)}`,
    },
    {
      platform: "qq",
      name: "u.y.qq.com musicu.fcg POST",
      url: "https://u.y.qq.com/cgi-bin/musicu.fcg",
      init: {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          comm: { ct: 24, cv: 0 },
          req_1: {
            module: "music.search.SearchCgiService",
            method: "DoSearchForQQMusicDesktop",
            param: { query: "test", num_per_page: 2, page_num: 1 },
          },
        }),
      },
      expect: ({ status, text }) =>
        status === 200 && JSON.parse(text).code === 0
          ? true
          : `status=${status} body=${text.slice(0, 120)}`,
    },
    {
      platform: "kugou",
      name: "songsearch_v2 搜索（Web 端点）",
      url: "https://songsearch.kugou.com/song_search_v2?keyword=test&page=1&pagesize=2&platform=WebFilter&format=json",
      expect: ({ status, text }) => {
        if (status !== 200) return `status=${status}`;
        let data;
        try {
          data = JSON.parse(text);
        } catch (err) {
          // 该接口偶发返回被截断的 JSON，属于平台侧不稳定
          return `响应不是完整 JSON（${text.length} 字节，疑似被截断）`;
        }
        return data.status === 1 && data.data?.lists?.length
          ? true
          : `status=${data.status} body=${text.slice(0, 120)}`;
      },
    },
    {
      platform: "kugou",
      name: "m.kugou.com getSongInfo（移动端 UA）",
      // 用一首免费曲目，避免 VIP 曲目（pay_type=3）干扰判断
      url: "https://m.kugou.com/app/i/getSongInfo.php?cmd=playInfo&hash=C244C90E7C528F727E209C922BEDEEFC",
      expect: ({ status, text }) => {
        const data = JSON.parse(text);
        if (status !== 200) return `status=${status}`;
        // 接口正常时 errcode=0；url 为空只说明这首要付费，不算接口故障
        if (data.errcode !== 0) {
          return `errcode=${data.errcode} error=${data.error}（旧 wwwapi 已下线，勿回退）`;
        }
        return data.url ? true : `errcode=0 但 url 为空（pay_type=${data.pay_type}）`;
      },
    },
    {
      platform: "kuwo",
      name: "search.kuwo.cn 搜索（无需鉴权）",
      url: "https://search.kuwo.cn/r.s?all=test&ft=music&itemset=web_2013&client=kt&pn=0&rn=2&rformat=json&encoding=utf8",
      expect: ({ status, text }) =>
        status === 200 && text.includes("abslist")
          ? true
          : `status=${status} body=${text.slice(0, 120)}`,
    },
    {
      platform: "kuwo",
      name: "playUrl 取播放地址（需 Secret 头）",
      url: "https://www.kuwo.cn/api/v1/www/music/playUrl?mid=367887397&type=music&httpsStatus=1&reqId=&plat=web_www&from=",
      init: {},
      expect: ({ status, text }) => {
        const data = JSON.parse(text);
        return status === 200 && data.code === 200 && data.data?.url
          ? true
          : `status=${status} body=${text.slice(0, 120)}`;
      },
    },
    {
      platform: "bilibili",
      name: "view 取 cid（带 Origin 会 412）",
      url: "https://api.bilibili.com/x/web-interface/view?aid=170001",
      expect: ({ status, text }) => {
        const data = JSON.parse(text);
        return status === 200 && data.code === 0
          ? true
          : `status=${status} body=${text.slice(0, 120)}`;
      },
    },
    {
      platform: "bilibili",
      name: "playurl 取音频流（fnval=16）",
      url: "https://api.bilibili.com/x/player/playurl?fnval=16&avid=170001&cid=279786",
      expect: ({ status, text }) => {
        const data = JSON.parse(text);
        return status === 200 && data.data?.dash
          ? true
          : `status=${status} body=${text.slice(0, 120)}`;
      },
    },
    {
      platform: "migu",
      name: "app.u.nf 搜索（无需 Referer）",
      url: "https://app.u.nf.migu.cn/pc/resource/song/item/search/v1.0?text=test&pageNo=1&pageSize=2",
      expect: ({ status, text }) =>
        status === 200 && text.startsWith("[")
          ? true
          : `status=${status} body=${text.slice(0, 120)}`,
    },
    {
      platform: "migu",
      name: "listen 取播放地址（channel 必须是请求头）",
      url: "https://app.c.nf.migu.cn/MIGUM3.0/strategy/pc/listen/v1.0?netType=01&resourceType=2&copyrightId=60054704965&contentId=600929000000096577&toneFlag=PQ",
      // channel 由 migu.js 自己携带，这里模拟它
      init: { headers: { channel: "0146951" } },
      expect: ({ status, text }) => {
        const data = JSON.parse(text);
        if (status !== 200) return `status=${status}`;
        if (data.code === "299999") return "channel 未生效（必须作为请求头发送）";
        return data.code === "000000" || data.code === "000001"
          ? true
          : `code=${data.code} info=${data.info}`;
      },
    },
    {
      platform: "taihe",
      name: "v1/search 签名搜索（参数名是 word）",
      url: taiheSignedUrl("/search", { word: "test", pageNo: 1, pageSize: 2 }),
      expect: ({ status, text }) => {
        const data = JSON.parse(text);
        if (status !== 200) return `status=${status}`;
        if (data.errno === 22001) return "签名错误（检查 taiheSignedUrl 的 appid/密钥）";
        if (data.errno === 23001) return "搜索词参数名不对（应为 word）";
        return data.state === true ? true : `errno=${data.errno} errmsg=${data.errmsg}`;
      },
    },
  ];
}

async function main() {
  const only = process.argv.slice(2);
  let checks = buildChecks();
  if (only.length) {
    checks = checks.filter((check) => only.includes(check.platform));
  }

  const pad = Math.max(...checks.map((c) => c.platform.length));
  /** @type {string[]} */
  const failures = [];

  for (const check of checks) {
    const label = `${check.platform.padEnd(pad)}  ${check.name}`;
    let init = { ...check.init };
    // 酷我的鉴权头依赖先访问首页拿 token
    if (check.platform === "kuwo" && check.url.includes("playUrl")) {
      init = { ...init, headers: { ...(init.headers || {}), ...(await getKuwoAuth()) } };
    }
    let result;
    try {
      const res = await fetchWithRules(check.url, init);
      result = check.expect(res);
    } catch (err) {
      result = `请求异常: ${err.message}`;
    }
    if (result === true) {
      console.log(`✅ ${label}`);
    } else {
      console.log(`❌ ${label}\n     ${result}`);
      failures.push(`${check.platform}/${check.name}: ${result}`);
    }
  }

  console.log(`\n${checks.length - failures.length}/${checks.length} 通过`);
  if (failures.length) {
    console.log("\n失败项：");
    failures.forEach((f) => console.log(`  - ${f}`));
    process.exit(1);
  }
}

main();
