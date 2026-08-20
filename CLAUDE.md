# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

「轻账本」—— 纯前端、零依赖、零构建的个人财务记账 Web 应用。无后端、无账号，数据只存本机浏览器（IndexedDB）。需求与配色规范见 [财务记账PRD.md](财务记账PRD.md)（第七章配色、第八章数据模型）。

## 常用命令

- **运行**：直接双击 `index.html`（`file://` 协议即可用），或 `python -m http.server 8000` 后访问 `http://localhost:8000`（后者才使 PWA / Service Worker 生效）
- **语法检查单个 JS**：`node --check js/store.js`
- 无构建步骤、无 npm、无测试框架；图表为手写 SVG，无第三方图表库

## 架构

**单页应用（SPA）**：`index.html` 只含 4 个空 `page` 容器、底部 Tab 导航和弹层骨架（overlay/sheet/modal/toast）；所有页面内容由 `js/ui.js` 的 `renderHome / renderFlow / renderStats / renderMine` 动态生成 innerHTML。

**脚本加载顺序（严格，用普通 `<script>` 标签，非 ES modules）**：

```
db.js → defaults.js → store.js → charts.js → ui.js → app.js
```

各文件是 IIFE，挂到全局对象通信：`window.DB`（存储）、`window.Defaults`（默认数据）、`window.Store`（业务逻辑）、`window.Charts`（SVG 图表）、`window.UI`（渲染与交互）。UI 层大量使用内联 `onclick="UI.xxx()"` 绑定事件。

**数据流**：`Store.init()` 把 IndexedDB 读入内存缓存 → UI 渲染直接读内存 → CRUD 修改内存 + 异步写库。统计指标（`getOverview`/`getCategoryBreakdown`/`getTrend`）实时从内存 `transactions` 聚合，无缓存。

**存储**：`db.js` 封装 IndexedDB（库名 `qingzhangben`，objectStore：`transactions` / `accounts` / `categories` / `settings`），IndexedDB 不可用时降级 localStorage。数据模型（Transaction / Category / Account / Settings 字段）见 PRD 第八章。

## 关键约束

- **必须用普通 `<script>` 标签加载 JS，禁止 `<script type="module">`**：项目需支持 `file://` 双击打开，ES modules 在该协议下会被 CORS 阻止。
- **零依赖**：不引入任何第三方库或 CDN（隐私卖点是「无网络请求」，图表/图标均手写或 emoji）。
- **配色走 CSS 变量**：色板集中在 `css/main.css` 的 `:root`（PRD 第七章），功能色有固定语义（收入 `--income`、支出 `--expense`、转账 `--transfer`），新 UI 复用变量，不写裸 hex。
- 分类图标用 emoji（PRD 明确要求，覆盖通用「SVG 图标」建议）；删除类操作一律二次确认。
