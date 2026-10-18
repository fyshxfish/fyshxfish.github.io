/* ========================================================================
 * 虚拟文件系统 + 个人配置
 * ----------------------------------------------------------------------
 * 写文章：在 content/books、content/.diary 或 content/pages 中新增 .md / .txt。
 * 清单由 scripts/build.py 自动生成，正文按需读取。详见 WRITING.md。
 * 图片、音频等特殊条目仍在下面 FS.files 中配置。
 *   - 路径以 / 开头
 *   - 文件名以 . 开头 → 自动隐藏（需要 `ls -a` 才能看到）
 *   - 目录是从路径里自动推断的
 *
 * 文件类型：
 *   - { content: "..." }           少量内联文本（兼容保留）
 *   - { type: "text", src: "..." } 独立文本文件（自动生成）
 *   - { type: "image", src: "..." } 图片（cat 时会弹浮窗）
 *   - { type: "audio", src: "..." } 音频（play 时播放）
 *   - { type: "exec", run: fn }    可执行——但通常用 commands 实现
 * ====================================================================== */
window.SITE = {
  // ------ 提示符 ------
  user: "visitor",
  host: "fyshx",

  // ------ message 命令的收件 ------
  // 1) 去 https://web3forms.com 拿个 access_key, 填进来
  // 2) 留空时, message 命令会走 mailto: 兜底
  web3formsKey: "57b09c29-8d7a-4149-8d3d-8abf2c6f6250",
  contactEmail: "1622057740@qq.com",  // 兜底邮箱; 同时 contact 命令会用

};

window.FS = {
  // 进入这些目录时应用桌面装饰，离开目录后继续保留。
  // 天气目录由此配置直接提供，无需说明文件；文章目录由文件路径推断。
  appearance: {
    "/weather/shining-for-you": { decoration: "stars" },
    "/weather/rain": { rain: "medium" },
    "/weather/rain/light": { rain: "light" },
    "/weather/rain/medium": { rain: "medium" },
    "/weather/rain/heavy": { rain: "heavy" },
    "/weather/rain/changing": { rain: "changing" },
    "/weather/snow": { snow: true },
    "/weather/reset": { reset: true },
  },
  files: {
    // ====== /playlist ======
    // 把真实 mp3 放到 content/playlist/song.mp3, 再登记一条虚拟路径:
    // "/playlist/song.mp3": { type: "audio", src: "content/playlist/song.mp3" },

    "/playlist/无眠-苏打绿.mp3": { type: "audio", src: "content/playlist/无眠-苏打绿.mp3" },
    "/playlist/左边-苏打绿.mp3": { type: "audio", src: "content/playlist/左边-苏打绿.mp3" },
    "/playlist/下雨的夜晚-苏打绿.mp3": { type: "audio", src: "content/playlist/下雨的夜晚-苏打绿.mp3" },
    "/playlist/By-the-Campfire": {
      type: "audio",
      title: "Traveler's Encore from Outer Wilds",
      tracks: [
        { name: "Esker", color: "#168c88", src: "content/playlist/campfire/Esker.mp3" },
        { name: "Gabbro", color: "#268452", src: "content/playlist/campfire/Gabbro.mp3" },
        { name: "Solanum", color: "#9a7918", src: "content/playlist/campfire/Solanum.mp3" },
        { name: "Riebeck", color: "#7651bd", src: "content/playlist/campfire/Riebeck.mp3" },
        { name: "Chert", color: "#b26b2c", src: "content/playlist/campfire/Chert.mp3" },
        { name: "Feldspar", color: "#287ca5", src: "content/playlist/campfire/Feldspar.mp3" },
        { name: "Prisoner", color: "#54823b", src: "content/playlist/campfire/Prisoner.mp3" },
      ],
    },

  },
};
