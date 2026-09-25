# MOS-MUSIC｜歌曲辨识与选歌技能 V1.0

> 「不是帮我找一首合适的歌，而是判断哪一首歌能够在已经确定的圣经真理和门训目标之下，承担合适的形成功能。」

- **Skill ID**：`mos-music-song-discernment`
- **版本**：`1.0.0`
- **状态**：`Frozen`（W01–W03 回测全通过后冻结）
- **依赖**：MOS-MUSIC Phase 2A.1 已冻结模型（`docs/MODEL-CALIBRATION-V1.0.md`）

## 固定链条（顺序不得颠倒）

```text
圣经 → 释经 → 核心真理 → LQ → MM 主题 → 音乐功能 → 歌曲辨识 → 七步法 → S6 行 → S7 传 → 生命形成
```

## 目录

```text
mos-music-song-discernment/
├── SKILL.md                      技能定义（用途/输入/输出/流程/八维/风险/停止条件/禁止事项）
├── README.md                     本文件
├── tools/discern.js              可执行运行器（零依赖，只读上游）
├── examples/                     W01 / W02 / W03 / W03-AUX 的结构化辨识结果
└── tests/
    ├── backtest-w01-w03.json     回测用例与期望值（Ground Truth = 冻结人工裁决）
    ├── upstream-hashes.json      上游快照（回测验收 A 项：不得改动）
    └── backtest-result.json      最近一次回测结果
```

## 用法

```bash
# 单周辨识（自动读取该周 core_song）
node tools/discern.js --project <MOS-MUSIC 路径> --week 2027-W02

# JSON 输出
node tools/discern.js --project <MOS-MUSIC 路径> --week 2027-W03 --json

# 指定候选歌 / 传入待审的 S6、S7 草案
node tools/discern.js --project <MOS-MUSIC 路径> --week 2027-W03 --song MUS-S-0005

# 历史回测（W01–W03）＋ 重新生成 examples
node tools/discern.js --project <MOS-MUSIC 路径> --backtest --emit
```

## 回测结果（V1.0）

| Week | Song | Expected | Actual | Pass |
|---|---|---|---|---|
| W01 | 奇异恩典 | Direct / Confirmed / Tier A | 一致 | PASS |
| W02 | 我灵镇静 | Theme_Response / Needs Human Review | 一致（risk F） | PASS |
| W03 | 耶稣呼召 | Direct / Confirmed | 一致 | PASS |
| W03 | 一切全献上（辅助） | Tier B / Under Review + 道德主义风险 | 一致（risk A） | PASS |

验收 A–G（上游不变 / 关系正确 / 风险识别 / S6 有效 / S7 有效 / 歌曲≠单元 / Tier 与 Review 独立）全部 PASS。
详细结果与校准发现见项目 `docs/SKILL-SONG-DISCERNMENT-BACKTEST-W01-W03.md`。

## 三条铁律

1. **禁止反向选歌**：不得由歌曲倒推或修改经文 / 核心真理 / LQ / MM。
2. **歌曲 ≠ 完整门训单元**：歌曲承担表达、记忆、情感、共同体、祷告；行为必须由 S6 四要素（对象/内容/时间/方式）落地。
3. **Tier 与 Review Status 独立**；且「歌曲生命周期状态」与「本周适配裁决」是两个层级，必须分别输出。

## 停止条件摘要

候选歌不在音乐库 / 上游缺失或与冻结版本不一致 / 需要改上游才能匹配 → 立即停止，输出 `Needs Human Review` 或 `No Suitable Song Found`；不执行 W04–W52 批量生产。
