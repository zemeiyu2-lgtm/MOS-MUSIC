# ADR-0001｜MOS-MUSIC 独立仓库与独立 origin

状态：已接受 ｜ 日期：2026-09-21 ｜ 关联：H-5（用户裁决）

## 决定

MOS-MUSIC 是独立仓库、独立 origin。不并入 MOS-DIS、不并入 MOS-GOV（ChurchCRM 插件）、
不并入 EBRM。

## 理由

1. MOS-DIS 是 3.6MB 单体 HTML，非 PWA（无 SW/manifest/IndexedDB），把音乐门训塞进去
   会继承其全部技术债，违反 §34 内容/程序分离。
2. MOS-GOV 是 ChurchCRM 插件（服务端 PHP/SQL），定位是治理，不是内容前端。
3. EBRM 的 origin 部署已稳定，混入会造成缓存与 SW 作用域冲突。

## 后果

- 跨产品只允许 ID 级引用（如 MAP 的 MOS_Week），不共享运行时存储。
- 本 SW 只清理 `mos-music-*` 前缀缓存；绝不删除同 origin 下其它产品缓存。
- 本应用禁止读写 MOS-DIS 的 localStorage key（CI 硬校验，且本应用一律用 IndexedDB）。
