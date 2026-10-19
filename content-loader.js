/* Read prose on demand. The generated index contains metadata, never article bodies. */
(function () {
  "use strict";
  const cache = new Map();
  window.FS.assetURL = function (file) {
    // Encode local filenames, preserving any explicitly configured remote URL.
    const url = /^(?:https?:)?\/\//.test(file.src) ? file.src
      : file.src.split("/").map(encodeURIComponent).join("/");
    return url + (file.revision ? `${url.includes("?") ? "&" : "?"}v=${encodeURIComponent(file.revision)}` : "");
  };
  window.FS.readFile = function (path) {
    const file = window.FS.files[path];
    if (!file) return Promise.reject(new Error("没有这个文件"));
    if (typeof file.content === "string") return Promise.resolve(file.content);
    if (file.type !== "text" || !file.src) return Promise.reject(new Error("不是文本文件"));
    if (!cache.has(path)) {
      // Encode each segment so Chinese names, spaces, # and ? remain literal filenames.
      const url = window.FS.assetURL(file);
      const pending = fetch(url).then(response => {
        if (!response.ok) throw new Error(`读取失败（HTTP ${response.status}），请稍后重试`);
        return response.text();
      }).catch(error => {
        cache.delete(path);
        throw new Error(error.message || "读取失败，请检查网络后重试");
      });
      cache.set(path, pending);
    }
    return cache.get(path);
  };
})();
