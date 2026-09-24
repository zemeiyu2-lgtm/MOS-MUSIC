# 单曲生产工作单｜我灵镇静

- 歌曲：MUS-S-0002（单元 MUS-SU-0002）
- 生产状态：VERIFYING　｜　完成等级：L3 → L4
- 下一步：STEP13　｜　下一状态：TEACHING_READY
- 机械就绪：否　｜　人工签核：未签核

## 阻断项（缺什么就写什么，不虚构）

- ⛔ lyrics_zh_translation_rights（常见中文译本各有版权方，本仓不托管；等待 USER_PROVIDED 或授权，CI-0028）
- ⛔ audio_human_recording（钢琴伴奏与真人示唱未录制；禁 AI 歌声冒充真人）
- ⛔ score_not_started（统一简谱未转写或未听校）
- ⛔ lyrics_proofread_pending（已托管歌词尚未逐节核对）

## 生产工作包槽位（9 槽位）

| 槽位 | 状态 |
| --- | --- |
| metadata | PROVIDED |
| lyrics | PROVIDED |
| score | PROVIDED |
| audio | NOT_AVAILABLE |
| timeline | PROVIDED |
| teaching | NOT_AVAILABLE |
| content | PROVIDED |
| rights | PROVIDED |
| worksheet | PROVIDED |

## STEP00–STEP15

| 步骤 | 名称 | 状态 | 解锁状态 |
| --- | --- | --- | --- |
| 00 | 立案与来源登记 | HUMAN | — |
| 01 | 资料核对 | HUMAN | VERIFYING |
| 02 | 确定采用版本 | HUMAN | — |
| 03 | 歌词结构化 | DONE | LYRICS_READY |
| 04 | 歌词校对与教词要点 | DONE | — |
| 05 | 统一简谱记谱 | DONE | SCORE_READY |
| 06 | 歌词与音符对齐 | DONE | — |
| 07 | 钢琴伴奏 | DONE | PIANO_READY |
| 08 | 男声示唱 | DONE | DEMO_READY |
| 09 | 女声示唱 | DONE | — |
| 10 | 分句时间轴 | DONE | SYNC_READY |
| 11 | 光标跟谱数据 | DONE | — |
| 12 | 学唱教学 | DONE | TEACHING_READY |
| 13 | 教谱 / 教词 / 声乐提示 | TODO | — |
| 14 | 真人教唱模块 | TODO | — |
| 15 | 内容理解 / 生命实践 / 传唱 | HUMAN | — |

## 缺口

- 声乐提示
- 真人教唱

## 资源包

- [x] 结构化歌词（分节 / 分句 / line_id）
- [x] 统一简谱（含歌词对齐）
- [x] 钢琴伴奏（全曲）
- [x] 男声示唱
- [x] 女声示唱
- [x] 分句时间轴
- [x] 光标跟谱数据
- [ ] 教学内容（学唱 / 教谱 / 教词 / 声乐）
- [ ] 真人教唱模块

## 签核（A–J）

| 组 | 项目 | 结果 | 审核人 |
| --- | --- | --- | --- |
| A | data | PENDING | — |
| B | lyrics | PENDING | — |
| C | score | PENDING | — |
| D | demo | PENDING | — |
| E | piano | PENDING | — |
| F | teaching | PENDING | — |
| G | sync | PENDING | — |
| H | live_teaching | PENDING | — |
| I | content | PENDING | — |
| J | rights | PENDING | — |

> 发布条件：资源包齐备 + A–J 全部裁决且无 REVISE / HOLD + 人工签核。
> 等级是派生结果：DRAFT 简谱不计入；不得手工宣布「完成」。
> 本工作单由工具派生，不代替人写内容，也不代替签核。
