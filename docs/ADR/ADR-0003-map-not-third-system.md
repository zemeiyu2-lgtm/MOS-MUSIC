# ADR-0003｜24 课不是第三套年度体系，经 MAP 关联（H-2 裁决）

状态：已接受（用户裁决）｜ 日期：2026-09-21

## 决定

- 52 周 ＝ MOS 年度门训/讲道主线（唯一来源：`mos-52w.csv` / 释经工程 V2.0）。
- 24 课 ＝ MOS-MUSIC 音乐门训主题骨架（MUS-C-01…24）。
- LQ ＝ 生命问题/实践观察维度。
- 三者通过 `content/map/MOS-MUSIC-MAP_V1.0.json` 关联；**不复制、不重建**任何一套。

## 映射字段

Map_ID / Music_Unit_ID / Music_Theme / MOS_Week / Bible_Passage / Core_Truth /
Theology / Life_Question / LQ / Discipleship_Context / Music_Function

关联方向（规格书 §33）：

```
MOS 52周 → 经文/核心真理/生命处境 → MOS-MUSIC 24主题 → 音乐门训 → LQ/实践
```

## 后果

- 52 周数据更新时只需更新 MAP 的 `MOS_Week` 引用，MOS-MUSIC 不存 52 周正文。
- MAP V1.0 的 Core_Truth / Theology 摘要来自已定案的 52 周经文中心，属研究级
  引用（Research），不是新的神学创作。
- Phase 6 批量建内容前，MAP 的 24 条映射需经 MOS 人工审核。
