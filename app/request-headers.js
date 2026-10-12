/**
 * 文件职责：根据音乐平台的 URL 调整 Referer、Origin 和移动端请求头，复用已有头字段而不重复添加。
 *
 * 文件级定义：
 * - MOBILE_UA：兼容部分平台接口的移动端 User-Agent 字符串。
 * - applyPlatformHeaders：按目标站点选择 Referer、Origin 和 User-Agent，原地修改 requestHeaders。
 */
/**
 * MOBILE_UA：兼容部分平台接口的移动端 User-Agent 字符串；类型为 string。
 * @type {string}
 */
const MOBILE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 14_3 like Mac OS X) AppleWebKit/534.30 (KHTML, like Gecko) Version/4.0 Mobile Safari/534.30";

/**
 * 按目标站点选择 Referer、Origin 和 User-Agent，原地修改 requestHeaders；不适用的头保留原值。
 * @param {electron.OnBeforeSendHeadersListenerDetails} details Electron 提供的请求详情，含 URL 和请求头；使用 url、requestHeaders 字段。
 * @returns {void} 无返回值。
 */
function applyPlatformHeaders(details) {
  let replace_referer = true;
  let replace_origin = true;
  let add_referer = true;
  let add_origin = true;
  let referer_value = "";
  let origin_value = "";
  let ua_value = "";

  if (details.url.includes("://music.163.com/")) {
    referer_value = "https://music.163.com/";
    origin_value = "https://music.163.com"; // Origin 采用不含路径的站点来源。
  }
  if (details.url.includes("://interface3.music.163.com/")) {
    referer_value = "https://music.163.com/";
    origin_value = "https://music.163.com"; // Origin 采用不含路径的站点来源。
  }
  if (details.url.includes("://gist.githubusercontent.com/")) {
    referer_value = "https://gist.githubusercontent.com/";
  }

  if (details.url.includes(".xiami.com/")) {
    add_origin = false;
    referer_value = "https://www.xiami.com/";
  }
  if (details.url.includes("www.xiami.com/api/search/searchSongs")) {
    const key = /key%22:%22(.*?)%22/.exec(details.url)[1];
    add_origin = false;
    referer_value = `https://www.xiami.com/search?key=${key}`;
  }
  if (details.url.includes("c.y.qq.com/")) {
    referer_value = "https://y.qq.com/";
    origin_value = "https://y.qq.com";
  }
  if (
    details.url.includes("y.qq.com/") ||
    details.url.includes("qqmusic.qq.com/") ||
    details.url.includes("music.qq.com/") ||
    details.url.includes("imgcache.qq.com/")
  ) {
    referer_value = "https://y.qq.com/";
  }
  if (details.url.includes(".kugou.com/")) {
    referer_value = "https://www.kugou.com/";
    ua_value = MOBILE_UA;
  }
  if (details.url.includes("m.kugou.com/")) {
    ua_value = MOBILE_UA;
  }
  if (details.url.includes(".kuwo.cn/")) {
    referer_value = "https://www.kuwo.cn/";
  }
  if (
    details.url.includes(".bilibili.com/") ||
    details.url.includes(".bilivideo.com/")
  ) {
    referer_value = "https://www.bilibili.com/";
    replace_origin = false;
    add_origin = false;
  }
  if (details.url.includes(".bilivideo.cn")) {
    referer_value = "https://www.bilibili.com/";
    origin_value = "https://www.bilibili.com/";
    add_referer = true;
    add_origin = true;
  }
  if (details.url.includes(".migu.cn")) {
    referer_value = "http://music.migu.cn/v3/music/player/audio?from=migu";
  }
  if (details.url.includes("m.music.migu.cn")) {
    referer_value = "https://m.music.migu.cn/";
  }

  //缺省逻辑：如果没有设置 Origin，则默认 Origin 与 Referer 保持一致
  if (origin_value == "") {
    origin_value = referer_value ? new URL(referer_value).origin : "";
  }

  const headers = details.requestHeaders;
  /**
   * 不区分大小写查找请求头名称。
   * @param name 待查找或注册的名称；使用 toLowerCase 字段。
   * @returns {boolean} 是否存在满足条件的条目。
   */
  const hasHeader = (name) =>
    Object.keys(headers).some(
      /**
       * 筛选检查 Object.keys() 中的条目，key.toLowerCase 的调用结果 是否严格等于 name.toLowerCase 的调用结果。
       * @param key 来自 Object.keys() 的当前条目；使用 toLowerCase 字段。
       * @returns {boolean} key.toLowerCase 的调用结果 是否严格等于 name.toLowerCase 的调用结果。
       */
      (key) => key.toLowerCase() === name.toLowerCase()
    );
  /**
   * 优先修改已有同名头，缺少时才创建新字段。
   * @param name 待查找或注册的名称；使用 toLowerCase 字段。
   * @param value 待检查或转换的输入值。
   * @returns {void} 无返回值。
   */
  const setHeader = (name, value) => {
    Object.keys(headers)
      .filter(
        /**
         * 筛选检查 Object.keys() 中的条目，key.toLowerCase 的调用结果 是否严格等于 name.toLowerCase 的调用结果。
         * @param key 来自 Object.keys() 的当前条目；使用 toLowerCase 字段。
         * @returns {boolean} key.toLowerCase 的调用结果 是否严格等于 name.toLowerCase 的调用结果。
         */
        (key) => key.toLowerCase() === name.toLowerCase()
      )
      .forEach(
        /**
         * 逐项处理 Object.keys().filter() 中的条目，delete headers[key]。
         * @param key 来自 Object.keys().filter() 的当前条目。
         * @returns {number} delete headers[key]。
         */
        (key) => delete headers[key]
      );
    headers[name] = value;
  };
  if (
    referer_value &&
    (add_referer || (replace_referer && hasHeader("Referer")))
  )
    setHeader("Referer", referer_value);
  if (origin_value && (add_origin || (replace_origin && hasHeader("Origin"))))
    setHeader("Origin", new URL(origin_value).origin);
  if (ua_value) setHeader("User-Agent", ua_value);
  details.requestHeaders = headers;
}

module.exports = { applyPlatformHeaders };
