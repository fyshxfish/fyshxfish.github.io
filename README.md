# terminal-home

一个明亮风的终端式个人主页，主题用了 Bluloco Light。
零依赖、单页 HTML，github.io 直接托管。

```
terminal-home/
├── index.html      ← 入口（基本不用改）
├── style.css       ← 主题颜色（要换色就改这里）
├── fs.js           ← ★ 文件系统 + 个人信息（你主要编辑这里）
├── terminal.js     ← 命令引擎 + 所有彩蛋（要加命令就改这里）
└── content/        ← 真实静态资源（图片之类）
```

## 怎么本地预览

因为页面用了 `localStorage`，直接 `open index.html` 也能跑。
最稳的是起个静态服务器：

```bash
cd terminal-home
python3 -m http.server 5500
# 然后浏览器开 http://localhost:5500
```

## 怎么改内容

打开 `fs.js`，往 `FS.files` 里加一行：

```js
"/daily/2026-06-01.md": { content: `
# 标题

正文写在这里。支持简单 markdown:
**粗体** *斜体* \`代码\` # 标题 ## 二级
` },
```

- 路径以 `/` 开头，文件名带 `.` 自动隐藏（`ls -a` 才看到）
- 目录是从路径里自动推断的，不用单独声明
- 想用真图片：

  ```js
  "/photo/sunset.jpg": { type: "image", src: "content/photo/sunset.jpg" },
  ```

  然后把图片真的放到 `content/photo/sunset.jpg`。

## 通过目录改变外观

```sh
cd /appearence/shining-for-you  # 星星装饰
cd ../meteors           # 每隔 5 秒划过一颗流星，可与星星叠加
cd /books               # 离开后仍保留外观
cd /appearence/reset     # 恢复当前主题的默认桌面背景
```

外观效果作用于终端窗口外的桌面，终端窗口保持默认外观。
`theme` 命令也只切换桌面背景配色。

这些目录支持 `ls`、`tree` 和 Tab 补全；`cat /appearence/readme.md` 可查看说明。
外观设置只在当前页面有效，刷新后清除；原有 `theme` 选择仍会保存。
`reset` 关闭星星和流星装饰，不改变当前主题。

配置写在 `fs.js` 的 `FS.appearance` 中，按完整目录路径匹配，成功进入目录后生效。
新增效果目录时，在 `FS.files` 中添加对应的 `readme.md`，让虚拟文件系统能识别目录。
星星样式写在 `style.css` 中，通过桌面容器上的 `data-decoration` 匹配；流星由独立装饰层实现。
目录名沿用 `/appearence` 这个拼写。

## 怎么改"我"

`fs.js` 顶部的 `SITE` 对象：

| 字段 | 改成 |
|---|---|
| `user` / `host` | 提示符显示的用户名 / 主机名 |
| `contactEmail` | 落底邮箱 |
| `web3formsKey` | message 命令的收件 key（看下面） |
| `lifeLog` | `history` 显示的人生大事记 |

## 怎么开通 message

1. 去 https://web3forms.com，填你的邮箱拿一个 access key（不需要注册账号）
2. 把 key 填到 `fs.js` 的 `SITE.web3formsKey`
3. 完事。用户在终端里 `message`，按 `.send` 发送，你邮箱就会收到

如果 key 留空，`message` 会兜底走 `mailto:` 打开邮件客户端（体验略破功，但能用）。

## 怎么部署到 github.io

```bash
# 在 terminal-home/ 里
git init
git add .
git commit -m "first commit"
gh repo create your-handle.github.io --public --source=. --push
```

或者手动建一个名为 `your-handle.github.io` 的 repo，把这几个文件传上去，
等几分钟，访问 https://your-handle.github.io 就能看到。

## 命令清单

**写在 help 里的**
`ls` `cd` `cat` `pwd` `tree` `clear` `echo` `play` `message` `help`

**没写在 help 里、但是会的**
`history` `which` `man` `date` `cls`

**彩蛋（按肌肉记忆乱试就能发现）**
`sudo *` · `rm *` · `vim` / `nano`
`sl` · `coffee` · `flip` · `roll 2d6` · `8ball <q>`
`man you`
`theme [bluloco-light|bluloco-dark|matrix|amber]`
`exit` / `quit` / `logout`
↑↑↓↓←→←→BA · sudo make me a sandwich

## 交互细节

- ↑↓ 翻命令历史（持久化在 localStorage）
- Tab 补全命令名和路径
- Ctrl+L 清屏
- Ctrl+C 中断当前输入 / 取消 message
- `cd -` 回到上一次目录
- `theme` 切换桌面背景主题，选项会被记住
