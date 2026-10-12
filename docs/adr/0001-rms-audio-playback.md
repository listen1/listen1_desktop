# 在完整资产上测量 RMS，并通过独立 AudioBuffer 链播放

2026-10-06，按已确认需求采用 100 ms 有效片段 RMS 与整曲固定增益。现有 Howler 实例使用 HTML5 音频，其音量范围不能提供正增益；跨域媒体直接接入 Web Audio 也可能因 CORS 输出静音。因此桌面层通过当前 Electron session 获取最终音源的完整字节，共享播放器解码、分析并播放同一份资产，均衡增益后串接独立主音量；关闭功能和确实不可处理的音源继续使用 Howler。

完整资产准备增加冷首播等待和内存成本，换取可核验的整曲平均电平、峰值余量和分析／播放一致性。只处理当前曲目，不预分析队列；压缩资产缓存上限 128 MiB，单个解码音频上限 256 MiB，当前解码缓冲与最多 128 个测量摘要仅存于本次页面运行。各模式目标从 −20 dBFS 起只下调；高动态通过目标让步保留曲内比例，标准允许最多 1 dB 联动限峰，输出误差超过 0.5 dB 时回退到无须限峰的共同目标。

读取能力归桌面仓库，算法、状态、播放适配和 UI 归共享子模块。新增 IPC 沿用主窗口／主 frame／准确本地页面校验，网络域名按已注册平台限制并逐跳校验重定向。本地音频只读，不迁移歌单或修改原文件。播放代次、当前曲目、实际地址和模式一起约束结果，资产指纹用于复用测量；仅在仍有效的播放任务完成后提交共同目标。

接口依据为 Electron 的 [Chromium 网络请求](https://www.electronjs.org/docs/latest/api/net#netfetchinput-init) 和 [导航事件](https://www.electronjs.org/docs/latest/api/web-contents#event-did-start-navigation)；主页面文档导航使用事件的 `isMainFrame`／`isSameDocument` 字段释放旧消费者租约。
