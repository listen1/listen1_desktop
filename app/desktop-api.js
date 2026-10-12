/**
 * 文件职责：为主窗口和悬浮歌词窗口校验 IPC 来源与参数，注册外部链接、登录、Cookie 和本地音频导入接口。
 *
 * 文件级定义：
 * - ipcMain：从 electron 引入，用于接收并注册主进程 IPC。
 * - dialog：从 electron 引入，用于显示本地文件选择对话框。
 * - shell：从 electron 引入，用于调用系统浏览器打开外部地址。
 * - session：从 electron 引入，用于管理会话、代理、请求头与 Cookie。
 * - BrowserWindow：从 electron 引入，用于创建或检查 Electron 窗口。
 * - pathToFileURL：从 node:url 引入，用于把真实路径转换为编码后的文件 URL。
 * - fileURLToPath：从 node:url 引入，用于将本地页面 URL 还原为路径进行来源校验。
 * - resolve：从 node:path 引入，用于解析绝对路径。
 * - basename：从 node:path 引入，用于提取文件名用于标题回退。
 * - isAbsolute：从 node:path 引入，用于校验旧本地曲目路径。
 * - readAudioTags：从 ./functions 引入，用于解析本地音频标签与歌词。
 * - cookieDomains：允许桌面 Cookie 操作的平台域名集合。
 * - loginDomains：允许隔离登录窗口访问的平台域名集合。
 * - controls：主窗口可调用的桌面控制操作集合。
 * - floatingControls：歌词窗口可调用的控制操作集合。
 * - allowedUrl：校验 HTTP(S) 地址、禁止用户名密码，并在提供域名列表时只允许准确域名及其子域名。
 * - createDesktopApi：注册桌面能力 IPC，并返回窗口身份和控制参数校验函数。
 */
/**
 * ipcMain：从 electron 引入，用于接收并注册主进程 IPC；类型为 typeof import("electron").ipcMain。
 * dialog：从 electron 引入，用于显示本地文件选择对话框；类型为 typeof import("electron").dialog。
 * shell：从 electron 引入，用于调用系统浏览器打开外部地址；类型为 typeof import("electron").shell。
 * session：从 electron 引入，用于管理会话、代理、请求头与 Cookie；类型为 typeof import("electron").session。
 * BrowserWindow：从 electron 引入，用于创建或检查 Electron 窗口；类型为 typeof import("electron").BrowserWindow。
 */
const { ipcMain, dialog, shell, session, BrowserWindow } = require("electron");
/**
 * pathToFileURL：从 node:url 引入，用于把真实路径转换为编码后的文件 URL；类型为 typeof import("node:url").pathToFileURL。
 * fileURLToPath：从 node:url 引入，用于将本地页面 URL 还原为路径进行来源校验；类型为 typeof import("node:url").fileURLToPath。
 */
const { pathToFileURL, fileURLToPath } = require("node:url");
/**
 * resolve：从 node:path 引入，用于解析绝对路径；类型为 typeof import("node:path").resolve。
 * basename：从 node:path 引入，用于提取文件名用于标题回退；类型为 typeof import("node:path").basename。
 * isAbsolute：从 node:path 引入，用于校验旧本地曲目路径；类型为 typeof import("node:path").isAbsolute。
 */
const { resolve, basename, extname, isAbsolute } = require("node:path");
/**
 * readAudioTags：从 ./functions 引入，用于解析本地音频标签与歌词；类型为 typeof import("./functions").readAudioTags。
 */
const { readAudioTags, readLocalLyric } = require("./functions");

/**
 * cookieDomains：允许桌面 Cookie 操作的平台域名集合；类型为 Array。
 * @type {Array}
 */
const cookieDomains = [
  "music.163.com",
  "qq.com",
  "kugou.com",
  "kuwo.cn",
  "bilibili.com",
  "migu.cn",
  "taihe.com",
  "91q.com",
];
/**
 * loginDomains：允许隔离登录窗口访问的平台域名集合；类型为 Array。
 * @type {Array}
 */
const loginDomains = ["music.163.com", "qq.com", "migu.cn", "github.com"];
/**
 * controls：主窗口可调用的桌面控制操作集合；类型为 Set。
 * @type {Set}
 */
const controls = new Set([
  "enable_global_shortcut",
  "disable_global_shortcut",
  "enable_lyric_floating_window",
  "disable_lyric_floating_window",
  "window_min",
  "window_max",
  "window_close",
  "get_proxy_config",
  "update_proxy_config",
  "update_lyric_floating_window_css",
]);
/**
 * floatingControls：歌词窗口可调用的控制操作集合；类型为 Set。
 * @type {Set}
 */
const floatingControls = new Set([
  "float_window_accept_mouse_event",
  "float_window_ignore_mouse_event",
  "float_window_close",
  "float_window_font_small",
  "float_window_font_large",
  "float_window_background_light",
  "float_window_background_dark",
  "float_window_font_change_color",
]);

/**
 * 校验 HTTP(S) 地址、禁止用户名密码，并在提供域名列表时只允许准确域名及其子域名；无效地址返回 false。
 * @param value 待验证的地址值。
 * @param domains 允许的域名数组；省略时不限制域名，传入空数组则没有可匹配域名。
 * @returns {boolean} 地址是否满足协议、认证字段及可选域名范围。
 */
function allowedUrl(value, domains) {
  try {
    const url = new URL(value);
    return (
      ["http:", "https:"].includes(url.protocol) &&
      !url.username &&
      !url.password &&
      (!domains ||
        domains.some(
          /**
           * 筛选检查 domains 中的条目，url.hostname 是否严格等于 domain，为空或假值时使用 url.hostname.endsWith 的调用结果。
           * @param domain 来自 domains 的当前条目。
           * @returns {*} url.hostname 是否严格等于 domain，为空或假值时使用 url.hostname.endsWith 的调用结果。
           */
          (domain) =>
            url.hostname === domain || url.hostname.endsWith(`.${domain}`)
        ))
    );
  } catch {
    return false;
  }
}

/**
 * 注册桌面能力 IPC，并返回窗口身份和控制参数校验函数；窗口引用由调用方动态提供，避免关闭后仍信任旧窗口。
 * @param options 解构参数，包含 getMainWindow（取得当前主窗口引用的函数）、getFloatingWindow（取得当前悬浮歌词窗口引用的函数）。
 * @returns {Object} 包含 isMain、isFloating、validControl 的对象。
 */
function createDesktopApi({ getMainWindow, getFloatingWindow }) {
  let inspection;
  let covers;
  const getInspection = () => {
    if (!inspection) {
      inspection = require("./audio-inspection").createAudioInspection(
        (url, options) =>
          getMainWindow().webContents.session.fetch(url, options)
      );
      const manager = inspection;
      getMainWindow().webContents.on("did-start-navigation", (details) => {
        if (details.isMainFrame && !details.isSameDocument) manager.dispose();
      });
      getMainWindow().webContents.once("destroyed", () => {
        manager.dispose();
        inspection = null;
      });
      require("electron").app.once("will-quit", () => manager.dispose());
    }
    return inspection;
  };
  const getCovers = () => {
    if (!covers) {
      const { app } = require("electron");
      const { decodeCoverImage } = require("./cover-image");
      covers = require("./local-covers").createLocalCovers(
        app.getPath("userData"),
        (bytes, extension) =>
          decodeCoverImage(bytes, extension, getMainWindow())
      );
    }
    return covers;
  };
  let audioAssets;
  const getAudioAssets = () => {
    if (!audioAssets) {
      const { createAudioAssets } = require("./audio-assets");
      audioAssets = createAudioAssets((url, options) =>
        getMainWindow().webContents.session.fetch(url, options)
      );
      const { app } = require("electron");
      const manager = audioAssets;
      app.once("will-quit", () => manager.dispose());
      getMainWindow().webContents.on("did-start-navigation", (details) => {
        if (details.isMainFrame && !details.isSameDocument)
          manager.resetConsumers();
      });
      getMainWindow().webContents.once("destroyed", () => {
        manager.dispose();
        audioAssets = null;
      });
    }
    return audioAssets;
  };
  /**
   * 同时校验发送窗口、主 frame 和准确的本地页面路径，拒绝子 frame、远程页面及已销毁窗口。
   * @param event 触发当前处理器的事件对象；使用 sender、senderFrame 字段。
   * @param window 待校验的窗口对象；使用 isDestroyed、webContents 字段。
   * @param file 待读取或校验的文件路径。
   * @returns {boolean} 发送方是否为当前窗口的指定本地页面主 frame。
   */
  const matches = (event, window, file) => {
    if (
      !window ||
      window.isDestroyed() ||
      event.sender !== window.webContents ||
      event.senderFrame !== event.sender.mainFrame
    )
      return false;
    try {
      return (
        resolve(fileURLToPath(event.senderFrame.url)) ===
        resolve(__dirname, file)
      );
    } catch {
      return false;
    }
  };
  /**
   * 确认消息来自当前主窗口的 listen1.html 主 frame。
   * @param event 触发当前处理器的事件对象。
   * @returns {boolean} 是否来自可信主窗口。
   */
  const isMain = (event) =>
    matches(event, getMainWindow(), "listen1_chrome_extension/listen1.html");
  /**
   * 确认消息来自当前悬浮窗口的 floatingWindow.html 主 frame。
   * @param event 触发当前处理器的事件对象。
   * @returns {boolean} 是否来自可信悬浮歌词窗口。
   */
  const isFloating = (event) =>
    matches(event, getFloatingWindow(), "floatingWindow.html");
  /**
   * 按窗口身份检查操作白名单，并校验代理和歌词样式等操作携带的参数。
   * @param event 触发当前处理器的事件对象。
   * @param operation 桌面控制白名单中的操作名。
   * @param params 当前请求或操作参数；使用 mode、proxyRules 字段。
   * @returns {boolean} 当前窗口是否获准执行该操作且参数是否合法。
   */
  const validControl = (event, operation, params) => {
    if (isFloating(event)) return floatingControls.has(operation);
    if (!isMain(event) || !controls.has(operation)) return false;
    if (
      operation.includes("css") ||
      operation === "enable_lyric_floating_window"
    )
      return (
        typeof params === "string" &&
        params.length <= 20000 &&
        !/@import|url\s*\(/i.test(params)
      );
    if (operation === "update_proxy_config")
      return (
        !!params &&
        (["system", "direct"].includes(params.mode) ||
          (typeof params.proxyRules === "string" &&
            /^(https?|socks[45]|quic):\/\/[^\s/@]+:\d{1,5}$/.test(
              params.proxyRules
            )))
      );
    return true;
  };
  /**
   * 注册仅接受主窗口调用的异步 IPC 处理器；来源不符时抛错，业务结果由 invoke 的 Promise 返回。
   * @param channel 待注册或发送的消息通道。
   * @param fn 接收处理结果的回调函数。
   * @returns {void} 无返回值；注册的处理器通过 invoke 的 Promise 返回业务结果。
   */
  const handle = (channel, fn) =>
    ipcMain.handle(
      channel,
      /**
       * 响应 ipcMain.handle 事件，调用 fn，依次传入 ...args。
       * @param event 触发当前处理器的事件对象。
       * @param ...args 传递给包装函数的参数。
       * @returns {Promise<*>} 异步完成后得到 fn 回调的直接返回值。
       */
      async (event, ...args) => {
        if (!isMain(event)) throw new Error("Untrusted desktop caller");
        return fn(...args);
      }
    );
  handle("desktop:prepareAudioSource", (input) =>
    getAudioAssets().prepare(input)
  );
  handle("desktop:readAudioSource", (input) => getAudioAssets().read(input));
  handle("desktop:cancelAudioPreparation", (id) => audioAssets?.cancel(id));
  handle("desktop:releaseAudioSource", (id) => audioAssets?.release(id));
  handle("desktop:inspectAudioSource", (input) =>
    getInspection().inspect(input)
  );
  handle("desktop:cancelAudioInspection", (id) => inspection?.cancel(id));
  handle("desktop:localCoverUrl", (id) => getCovers().url(id));
  handle("desktop:retainLocalCover", (id) => getCovers().retain(id));
  handle("desktop:releaseLocalCover", (id) => getCovers().release(id));
  handle("desktop:importLocalCover", async () => {
    const selection = await dialog.showOpenDialog(getMainWindow(), {
      title: "更换歌曲封面",
      properties: ["openFile"],
      filters: [{ name: "Images", extensions: ["png", "jpg", "jpeg", "webp"] }],
    });
    if (selection.canceled) return { cancelled: true };
    try {
      if (selection.filePaths?.length !== 1)
        throw new Error("Invalid selection");
      return {
        cancelled: false,
        ...(await getCovers().import(selection.filePaths[0])),
      };
    } catch (error) {
      return {
        cancelled: false,
        error: {
          code: ["COVER_INVALID", "COVER_TOO_LARGE", "RESOURCE_LIMIT"].includes(
            error.code
          )
            ? error.code
            : "COVER_READ_FAILED",
        },
      };
    }
  });
  handle(
    "desktop:openExternal",
    /**
     * 进入此回调后，执行 allowedUrl。
     * @param url 待解析或请求的地址；来源适配器使用其中的查询参数。
     * @returns {Promise<void>} 异步完成后无返回值；拒绝由调用链处理。
     */
    async (url) => {
      if (!allowedUrl(url)) throw new Error("Unsupported external URL");
      await shell.openExternal(url);
    }
  );
  handle(
    "desktop:openLogin",
    /**
     * 进入此回调后，执行 allowedUrl。
     * @param url 待解析或请求的地址；来源适配器使用其中的查询参数。
     * @returns {Promise<void>} 异步完成后无返回值；拒绝由调用链处理。
     */
    async (url) => {
      if (!allowedUrl(url, loginDomains))
        throw new Error("Unsupported login URL");
      const window = new BrowserWindow({
        parent: getMainWindow(),
        width: 985,
        height: 700,
        autoHideMenuBar: true,
        webPreferences: {
          sandbox: true,
          contextIsolation: true,
          nodeIntegration: false,
          webSecurity: true,
        },
      });
      window.webContents.on(
        "will-navigate",
        /**
         * 响应 "will-navigate" 事件，执行 allowedUrl。
         * @param event 触发当前处理器的事件对象；使用 preventDefault 字段。
         * @param target 合并时提供待补充曲目的目标歌单 ID；使用 startsWith 字段。
         * @returns {void} 无返回值。
         */
        (event, target) => {
          if (
            !allowedUrl(target, loginDomains) &&
            !target.startsWith(
              "https://listen1.github.io/listen1/callback.html?"
            )
          )
            event.preventDefault();
        }
      );
      window.webContents.setWindowOpenHandler(
        /**
         * 进入此回调后，执行 allowedUrl。
         * @param options 解构参数，包含 target（合并时提供待补充曲目的目标歌单 ID）。
         * @returns {Object} 包含 action 的对象。
         */
        ({ url: target }) => {
          if (allowedUrl(target, loginDomains))
            window.loadURL(target).catch(
              /**
               * 保留的空回调，此处无需继续处理或改变状态。
               * 无参数。
               * @returns {void} 无返回值。
               */
              () => {}
            );
          return { action: "deny" };
        }
      );
      await window.loadURL(url);
    }
  );
  /**
   * 构造平台 Cookie 请求参数，检查 URL、名称、字段类型和有效期；设置时将过期时间限制在允许范围内。
   * @param input 待校验或转换的输入值；使用 url、name、value、domain、path、sameSite、expirationDate 字段。
   * @param set 是否按写入 Cookie 的要求校验附加字段。
   * @returns {Object} 供 Electron Cookie API 使用的规范化参数；非法输入会抛出异常。
   */
  function cookieDetails(input, set) {
    if (
      !input ||
      !allowedUrl(input.url, cookieDomains) ||
      typeof input.name !== "string" ||
      !input.name ||
      input.name.length > 256
    )
      throw new Error("Invalid cookie request");
    const details = { url: input.url, name: input.name };
    if (!set) return details;
    if (typeof input.value !== "string" || input.value.length > 16384)
      throw new Error("Invalid cookie value");
    details.value = input.value;
    if (input.domain) {
      const domain = input.domain.replace(/^\./, "");
      const hostname = new URL(input.url).hostname;
      if (hostname !== domain && !hostname.endsWith(`.${domain}`))
        throw new Error("Invalid cookie domain");
      details.domain = input.domain;
    }
    if (typeof input.path === "string" && input.path.startsWith("/"))
      details.path = input.path;
    for (const key of ["secure", "httpOnly"])
      if (typeof input[key] === "boolean") details[key] = input[key];
    if (
      ["unspecified", "no_restriction", "lax", "strict"].includes(
        input.sameSite
      )
    )
      details.sameSite = input.sameSite;
    if (details.sameSite === "no_restriction") details.secure = true;
    if (Number.isFinite(input.expirationDate))
      details.expirationDate = Math.min(
        input.expirationDate,
        Date.now() / 1000 + 400 * 86400
      );
    return details;
  }
  handle(
    "desktop:cookieGet",
    /**
     * 进入此回调后，执行 session.defaultSession.cookies.get。
     * @param input 待校验或转换的输入值。
     * @returns {Promise<*>} 异步完成后得到 await session.defaultSession.cookies.get(cookieDetails(input, false))[0]，为空或假值时使用 null。
     */
    async (input) =>
      (
        await session.defaultSession.cookies.get(cookieDetails(input, false))
      )[0] || null
  );
  handle(
    "desktop:cookieSet",
    /**
     * 进入此回调后，执行 session.defaultSession.cookies.set。
     * @param input 待校验或转换的输入值。
     * @returns {Promise<*>} 异步完成后得到 session.defaultSession.cookies.set 的调用结果。
     */
    async (input) =>
      session.defaultSession.cookies.set(cookieDetails(input, true))
  );
  handle(
    "desktop:cookieRemove",
    /**
     * 进入此回调后，执行 session.defaultSession.cookies.remove。
     * @param input 待校验或转换的输入值。
     * @returns {Promise<void>} 异步完成后无返回值；拒绝由调用链处理。
     */
    async (input) => {
      const details = cookieDetails(input, false);
      await session.defaultSession.cookies.remove(details.url, details.name);
    }
  );
  handle(
    "desktop:localFileUrl",
    /**
     * 进入此回调后，执行 trackId.startsWith（"lmtrack_"）。
     * @param trackId 目标曲目 ID；使用 startsWith 字段。
     * @returns {*} pathToFileURL().href。
     */
    (trackId) => {
      if (
        typeof trackId !== "string" ||
        !trackId.startsWith("lmtrack_") ||
        !isAbsolute(trackId.slice(8))
      )
        throw new Error("Invalid local track ID");
      return pathToFileURL(trackId.slice(8)).href;
    }
  );
  handle(
    "desktop:importLocalMusic",
    /**
     * 进入此回调后，执行 dialog.showOpenDialog。
     * 无参数。
     * @returns {Promise<Object>} 异步完成后得到 包含 cancelled、tracks、errors 的对象。
     */
    async () => {
      const selection = await dialog.showOpenDialog(getMainWindow(), {
        title: "添加歌曲",
        properties: ["openFile", "multiSelections"],
        filters: [
          {
            name: "Music Files",
            extensions: ["flac", "mp3", "mp4", "ogg", "wav", "webm"],
          },
        ],
      });
      if (selection.canceled)
        return { cancelled: true, tracks: [], errors: [] };
      const tracks = new Array(selection.filePaths.length),
        errors = [];
      let next = 0;
      await Promise.all(
        Array.from(
          { length: Math.min(4, tracks.length) },
          /**
           * 进入此回调后，更新 tracks[index]，执行 readAudioTags。
           * 无参数。
           * @returns {Promise<void>} 异步完成后无返回值；拒绝由调用链处理。
           */
          async () => {
            while (next < tracks.length) {
              const index = next++;
              const file = selection.filePaths[index];
              const metadata = await readAudioTags(file);
              const { common } = metadata;
              if (metadata.error)
                errors.push({
                  file: basename(file),
                  code: metadata.error.code,
                });
              tracks[index] = {
                id: `lmtrack_${file}`,
                title: basename(file, extname(file)),
                artist: common.artist || "",
                artist_id: `lmartist_${common.artist || ""}`,
                album: common.album || "",
                album_id: `lmalbum_${common.album || ""}`,
                source: "localmusic",
                source_url: "",
                img_url: "",
                audio_info: require("./audio-inspection").audioFields(
                  metadata.format
                ),
                lyric_provenance: metadata.lyricProvenance,
                lyrics: common.lyrics || [],
                sound_url: pathToFileURL(file).href,
              };
            }
          }
        )
      );
      return { cancelled: false, tracks, errors };
    }
  );
  handle("desktop:importLocalLyric", async () => {
    const selection = await dialog.showOpenDialog(getMainWindow(), {
      title: "导入歌词",
      properties: ["openFile"],
      filters: [{ name: "LRC", extensions: ["lrc"] }],
    });
    if (selection.canceled) return { cancelled: true, lyric: "", fileName: "" };
    const file = selection.filePaths?.[0];
    if (!file || selection.filePaths.length !== 1)
      return {
        cancelled: false,
        lyric: "",
        fileName: "",
        error: { code: "LYRIC_READ_FAILED" },
      };
    try {
      return {
        cancelled: false,
        lyric: await readLocalLyric(file),
        fileName: basename(file),
      };
    } catch (error) {
      const codes = ["INVALID_LRC_FILE", "INVALID_UTF8", "LYRIC_TOO_LARGE"];
      return {
        cancelled: false,
        lyric: "",
        fileName: "",
        error: {
          code: codes.includes(error.code) ? error.code : "LYRIC_READ_FAILED",
        },
      };
    }
  });
  return { isMain, isFloating, validControl };
}
module.exports = { createDesktopApi, allowedUrl };
