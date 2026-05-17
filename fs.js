/* ========================================================================
 * 虚拟文件系统 + 个人配置
 * ----------------------------------------------------------------------
 * 加文件：在下面 FS.files 里加一行就行
 *   - 路径以 / 开头
 *   - 文件名以 . 开头 → 自动隐藏（需要 `ls -a` 才能看到）
 *   - 目录是从路径里自动推断的
 *
 * 文件类型：
 *   - { content: "..." }           普通文本/markdown
 *   - { type: "image", src: "..." } 图片（cat 时会弹浮窗）
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

  // ------ neofetch 用的小肖像 ------
  ascii: [
    "       .--.   ",
    "      |o_o |  ",
    "      |:_/ |  ",
    "     //   \\ \\ ",
    "    (|     | )",
    "   /'\\_   _/`\\",
    "   \\___)=(___/",
  ],

  // ------ history 命令显示的人生大事记 (随时增删) ------
  lifeLog: [
    "2018-09  commit: 上了大学",
    "2020-??  fix:    被微积分按在地上摩擦",
    "2022-??  feat:   开始想做一个终端式的个人主页",
    "2026-05  feat:   终于把它做了出来",
    "2026-06  todo:   毕业",
  ],

  // ------ fortune 命令的废话池 (添新句子就加一行) ------
  fortunes: [
    "你今天的事情，明天的你会替你处理。",
    "Don't worry, be λ.",
    "如果证不出来，就把它当成已知条件。",
    "宇宙不会替你写论文，但它会让 ddl 替你写。",
    "把生活当成一个 REPL：错了再来一遍就好。",
    "凌晨四点的 Coq 比凌晨四点的海棠花更值得记录。",
    "你比你以为的更厉害。但还差一点点。",
  ],
};

window.FS = {
  files: {
    // ====== 根目录 ======
    "/readme.md": { content: `
# 你好 :)

欢迎来到我的小角落。这里没有花哨的图，
只有一些我愿意被一两个人慢慢翻完的东西。

可以试试这些命令：

  \`ls\`        看看根目录都有啥
  \`ls -a\`     看看藏起来的东西
  \`cd dream\`  逛逛我的想做清单
  \`cat daily/2026-05-17.md\`  随便挑一篇看看
  \`help\`      看完整命令列表
  \`message\`   给我留句话

输入 \`whoami\` 还能看到一份非正式的自我介绍。
`.trim() },

    "/contact.txt": { content: `
邮箱  : your-email@example.com
github: github.com/your-handle
其他  : 在 message 里告诉我你怎么称呼, 我会回到你给的地址。
`.trim() },

    // ====== /dream ======
    "/dream/想去南极看一次企鹅.md": { content: `
# 想去南极看一次企鹅

不一定真要去，也可能就是想知道
"这件事我可以列在愿望里" 本身。
`.trim() },

    "/dream/学会冲浪.md": { content: `
# 学会冲浪

或者只是站在浪里被它推一下，也行。
`.trim() },

    "/dream/写一本只给三个人看的小书.md": { content: `
# 写一本只给三个人看的小书

主题不知道。封面我已经想好了。
`.trim() },

    // ====== /daily ======
    "/daily/2026-05-17.md": { content: `
# 一个普通的周日

今天把这个站点搭起来了。
四年前想做的事, 拖到大四才动手, 但终归是做了。

写在这里, 算是开张。
`.trim() },

    // ====== /photo ======
    "/photo/cat.txt": { content: `
   |\\---/|
   | o_o |
    \\_^_/

(占位用的猫. 以后这里会有真的照片.)
`.trim() },

    // 真的图片示例（放一张到 content/photo/sample.jpg 就能用）
    // "/photo/sample.jpg": { type: "image", src: "content/photo/sample.jpg" },

    // ====== /projects ======
    "/projects/README.md": { content: `
# 做过的东西

  - terminal-home (你现在就在这)
  - proof-pet     一个赛博电子鸡, 喂引理长大
  - ...           待补充
`.trim() },

    // ====== 隐藏文件 (ls -a 才能看到) ======
    "/.about-me": { content: `
> 这是 whoami 看不到的那部分。

我不太擅长一句话介绍自己。
真要说, 那就是 — 还在路上, 还在学,
还相信慢慢做完的小东西比赶出来的大东西更值钱。
`.trim() },

    "/.bashrc": { content: `
# 加载终端时执行的小仪式
export MOOD="还行"
export COFFEE_LEVEL="未达标"
alias hi="echo 你好"
`.trim() },

    "/.secret/poem.txt": { content: `
你来过了。
那就够了。
`.trim() },
  },
};
