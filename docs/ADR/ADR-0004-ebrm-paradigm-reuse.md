# ADR-0004｜复用 EBRM PWA 范式，不复制业务逻辑

状态：已接受（用户裁决）｜ 日期：2026-09-21

## 决定

技术栈照 EBRM 已验证范式：零构建原生 HTML/CSS/JS + manifest.json + Service Worker
三段式缓存 + IndexedDB + JSON 分片 + GitHub Pages + GitHub Actions CI。

允许复用：PWA 结构、SW 缓存策略、IndexedDB 封装思路、响应式 UI 范式、部署方式。
禁止复制：EBRM 的业务逻辑、内容、领域模型。

## 环境约束（本机现实）

npm/bundler 被安全策略拦截 → 第一阶段禁止引入 React/Vue/打包器/Electron。
原生方案是本机唯一可行且与范式一致的路线。

## MOS-DIS 视觉资产复用

设计令牌取自 MOS-DIS：`#234F42`（深绿主色）/ `#B7965B`（金）/ `#F7F3EB` / `#FFFDF9`
底色 / r18 圆角 / focus-visible 焦点环 / prefers-reduced-motion 动效降级。
移动端范式：底部导航 + 抽屉弹层 + 步骤条（七段）。
