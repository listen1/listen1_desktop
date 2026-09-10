/**
 * 各音乐平台 API 的请求头改写规则（主进程使用）。
 *
 * 背景：浏览器扩展里这件事由 declarativeNetRequest 规则表完成
 * （见 listen1_chrome_extension/rules_1.json），Electron 里则必须挂在
 * session.webRequest.onBeforeSendHeaders 上自己做。
 *
 * 注意：Electron 30+ 传给 onBeforeSendHeaders 的 `requestHeaders` 是
 * 普通对象（{ "Referer": "..." }），不是老版 API 的 [{ name, value }] 数组。
 * 早期版本按数组遍历，循环体一次都没执行，所有规则形同虚设。
 */

/** 各平台要求的移动端 UA（酷狗等接口只认移动端 UA） */
const MOBILE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 14_3 like Mac OS X) AppleWebKit/534.30 (KHTML, like Gecko) Version/4.0 Mobile Safari/534.30";

/**
 * @typedef {Object} HeaderOverride
 * @property {string} [referer]    设置 Referer
 * @property {string|false} [origin] 设置 Origin；显式 false 表示删除 Origin
 * @property {string} [userAgent]  覆盖 User-Agent
 * @property {Record<string,string>} [headers] 额外设置的自定义请求头
 *
 * @typedef {Object} HeaderRule
 * @property {string} name         平台名，仅用于日志与自检
 * @property {RegExp} match        命中请求 URL 的正则
 * @property {HeaderOverride} override
 */

/**
 * 规则表。按顺序求值，后面的规则可以覆盖前面的结果。
 * 每条规则的依据都来自实测（见 scripts/verify_providers.js）：
 * - 网易 eapi 的开关是 Cookie 值（os=pc 单独用会 code:-110，需 appver=8.9.70）
 * - bilibili 的 api.bilibili.com 实测带不带 Origin 都不影响，
 *   但播放 CDN 需要 Referer
 * - 酷狗 Web 接口已废弃，可用接口只认移动端 UA
 * @type {HeaderRule[]}
 */
const RULES = [
  {
    name: "netease",
    match: /(^|\.)music\.163\.com$/,
    override: {
      referer: "https://music.163.com/",
      origin: "https://music.163.com",
    },
  },
  {
    // 网易 eapi 接口的开关是 Cookie 的值（实测 os=pc 单独用会返回 code:-110、
    // 播放地址为 null；必须带上 appver=8.9.70）。Referer/Origin 对它不起作用，
    // 这里保留只是为了与 weapi 等其它接口保持一致。
    name: "netease-eapi",
    match: /(^|\.)music\.163\.com$/,
    matchPath: /\/(eapi|weapi)\//,
    override: {
      referer: "https://music.163.com/",
      origin: "https://music.163.com",
      headers: { Cookie: "os=pc; appver=8.9.70" },
    },
  },
  {
    name: "qq",
    match: /(^|\.)(y\.qq\.com|qqmusic\.qq\.com|music\.qq\.com|y\.gtimg\.cn)$/,
    override: {
      referer: "https://y.qq.com/",
      origin: "https://y.qq.com",
    },
  },
  {
    // 酷狗 Web 接口已废弃，可用接口全部只认移动端 UA
    name: "kugou",
    match: /(^|\.)(kugou\.com|kglink\.kugou\.com)$/,
    override: {
      referer: "https://m.kugou.com/",
      origin: false, // 移动端接口不校验 Origin，带上反而可能被拒
      userAgent: MOBILE_UA,
    },
  },
  {
    name: "kuwo",
    match: /(^|\.)kuwo\.cn$/,
    override: {
      referer: "https://www.kuwo.cn/",
      origin: "https://www.kuwo.cn",
    },
  },
  {
    // 音频流 CDN 不校验 Origin，Referer 带上即可
    name: "bilibili-cdn",
    match: /(^|\.)(bilivideo\.com|bilivideo\.cn|hdslb\.com)$/,
    override: {
      referer: "https://www.bilibili.com/",
      origin: "https://www.bilibili.com",
    },
  },
  {
    // api.bilibili.com 实测带不带 Origin 都能通过，删除它只是减少无谓的跨域标识
    name: "bilibili",
    match: /(^|\.)(bilibili\.com)$/,
    override: {
      referer: "https://www.bilibili.com/",
      origin: false,
    },
  },
  {
    name: "migu",
    match: /(^|\.)migu\.cn$/,
    override: {
      referer: "https://music.migu.cn/",
      origin: "https://music.migu.cn",
      // NOTICE: 不在这里设置 channel 头。请求 channel 由 migu.js 的
      // bootstrap_track 自己携带（见 app.c.nf.migu.cn 的 listen 接口），
      // 在这里统一覆盖会让浏览器扩展与 Electron 两端行为不一致。
    },
  },
  {
    name: "taihe",
    match: /(^|\.)(taihe\.com|music\.taihe\.com)$/,
    override: {
      referer: "https://music.taihe.com/",
      origin: "https://music.taihe.com",
    },
  },
  {
    // GitHub 图床 / gist，供歌词与更新检查使用
    name: "githubusercontent",
    match: /(^|\.)githubusercontent\.com$/,
    override: {
      referer: "https://gist.githubusercontent.com/",
    },
  },
];

/** 与 headerRules 无关、但仍需保持默认放行的请求（如 OAuth 回调） */
const PASSTHROUGH_HOSTS = [
  "listen1.github.io",
  "conch.xiami.com", // 虾米已关站，仅保留旧链接可打开
];

/** @param {HeaderRule} rule @param {string} url */
function hostMatches(rule, url) {
  try {
    const parsed = new URL(url);
    if (!rule.match.test(parsed.hostname)) return false;
    if (rule.matchPath && !rule.matchPath.test(parsed.pathname)) return false;
    return true;
  } catch (err) {
    return false;
  }
}

/**
 * 在已有请求头对象上按大小写不敏感地写入 / 覆盖一个头。
 * @param {Record<string, string>} headers
 * @param {string} name
 * @param {string} value
 */
function setHeader(headers, name, value) {
  const existing = Object.keys(headers).find(
    (key) => key.toLowerCase() === name.toLowerCase()
  );
  headers[existing || name] = value;
}

/**
 * @param {Record<string, string>} headers
 * @param {string} name
 */
function deleteHeader(headers, name) {
  Object.keys(headers)
    .filter((key) => key.toLowerCase() === name.toLowerCase())
    .forEach((key) => delete headers[key]);
}

/**
 * 计算某个 URL 命中的 header 规则，返回要设置/删除的头。
 * 与网络无关，方便单测。
 * @param {string} url
 * @returns {{ referer?: string; origin?: string | false; userAgent?: string; headers: Record<string,string> }}
 */
function resolveOverride(url) {
  /** @type {HeaderOverride} */
  let result = {};
  RULES.filter((rule) => hostMatches(rule, url)).forEach((rule) => {
    result = {
      ...result,
      ...rule.override,
      headers: { ...(result.headers || {}), ...(rule.override.headers || {}) },
    };
  });
  return result;
}

/**
 * 就地改写请求头。保持“就地修改”的语义，调用方拿到的还是原对象。
 * @param {string} url
 * @param {Record<string, string>} headers
 * @returns {Record<string, string>} 同一个 headers 对象
 */
function applyHeaderRules(url, headers) {
  if (!headers || typeof headers !== "object") return headers;

  const override = resolveOverride(url);
  if (!override.referer && !override.userAgent && !override.headers) {
    return headers;
  }

  if (override.referer) {
    setHeader(headers, "Referer", override.referer);
  }

  // origin 显式给 false 表示“删除”，给 undefined 表示“不处理”
  if (override.origin === false) {
    deleteHeader(headers, "Origin");
  } else if (typeof override.origin === "string") {
    setHeader(headers, "Origin", override.origin);
  }

  if (override.userAgent) {
    setHeader(headers, "User-Agent", override.userAgent);
  }

  Object.entries(override.headers || {}).forEach(([name, value]) => {
    setHeader(headers, name, value);
  });

  return headers;
}

/** 给自检脚本用的规则摘要 */
function describeRules() {
  return RULES.map((rule) => ({
    name: rule.name,
    match: rule.match.source,
    override: rule.override,
  }));
}

module.exports = {
  MOBILE_UA,
  RULES,
  PASSTHROUGH_HOSTS,
  resolveOverride,
  applyHeaderRules,
  describeRules,
};
