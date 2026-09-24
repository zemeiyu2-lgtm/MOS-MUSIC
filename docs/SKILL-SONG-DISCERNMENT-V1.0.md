# MOS-MUSIC｜歌曲辨识与选歌技能 V1.0（Skill Specification）

状态：**FROZEN** ｜ 版本：`1.0.0` ｜ 日期：2026-09-21 ｜ 阶段：Phase 2A.2
回测：W01–W03 全通过（见 `docs/SKILL-SONG-DISCERNMENT-BACKTEST-W01-W03.md`）
技能本体：`~/.workbuddy/skills/mos-music-song-discernment/`（与 mos-sermon-exegesis、mos-gov-dev-verify 同规范）

---

## 1. 定义（不可漂移）

> 根据**已经确定**的圣经经文、释经核心、核心真理、LQ、MM 主题和音乐门训功能，
> 对候选歌曲进行神学、门训与形成辨识，并判断歌曲是否适合承担本周的音乐门训功能。

**不是**歌曲推荐器。核心原则：**先经文，后音乐；先真理，后歌曲。**

## 2. 固定链条

```text
圣经 → 释经 → 核心真理 → LQ → MM 主题 → 音乐功能 → 歌曲辨识 → 七步法 → S6 行 → S7 传 → 生命形成
```

反向（歌曲 → 经文/真理/LQ/MM）**永久禁止**；匹配不上时输出 `Needs Human Review`
或 `No Suitable Song Found`，**不得修改上游**。

## 3. 输入

`Year / Week_ID / Bible_Passage / Core_Truth / LQ_ID / LQ_Text / MM_ID / MM_Theme / Music_Function / Candidate_Songs`
（可选 `Proposed_S6` / `Proposed_S7`）。缺输入 → 停止并报资料不足。

## 4. 输出

SKILL.md 第十四节的固定格式 + `Week_Fit_Verdict` + `Not_Yet_Validated` + Decision Trace（8 项）。

## 5. 八维辨识

圣经真理 / 神学形成 / 情感形成 / 共同体 / 会众参与 / 代际传递 / 生活实践 / 使命方向。
1–5 分 + 说明，**禁止合成总分**，**禁止好歌坏歌二元结论**（与 song.schema 一致）。

## 6. Song_Relation（沿用既有枚举，不新增）

| 枚举值 | 含义 |
|---|---|
| `direct_biblical_expression` | 与本周经文核心真理直接而明确的关系 |
| `theme_response` | 非经文直接释经，但合理回应本周主题 |
| `narrative_response` | 叙述与经文同构的场景 |
| `not_yet_assessed` | 证据不足，交人工 |

判定规则（可复现）：核心真理**恩典性行动词**与歌曲标签共现 → direct；
仅姿态类情感词回应 → theme_response；叙事同构 → narrative_response；其余 → not_yet_assessed。
**theme_response 不得写成 direct。**

## 7. Primary_Function

`TR / MM / EM / PR / CO / LI / MI / RP` 中**必填一个**主功能（可有序的辅助功能）；
**不得**为求完整而填满。

## 8. S6 实践转换检查（核心）

四要素缺一不可：**Object / Content / Time / Method**。
「更加爱主」式表述 → `S6_Insufficient`。歌曲本身不足以产生行为。

## 9. S7 传递转换检查

**Target / Channel / Verification**；缺 Verification 记改善提示不判失败；
「分享歌曲文件」≠ 门徒传递（传的是真理与形成）。

## 10. 神学风险 A–F

A 道德主义（HIGH）｜B 情绪取代真理（NOTE）｜C 歌曲替代释经（NOTE）｜
D 个人经验取代福音（NOTE）｜E 实践空洞化（HIGH，= S6_Insufficient）｜
**F 对齐风险（HIGH，本技能补充）**：theme_response 歌曲遇 TR/CO/MI 导向周 → 须人工复核。

## 11. Tier 与 Review Status

`tier`（A/B/C）与 `review_status`（draft/under_review/approved/core/recommended/research/archived）
**两字段独立，不得混用**。且必须区分**两个层级**：
歌曲生命周期状态 ≠ 本周适配裁决（`confirmed` / `needs_human_review` / `not_yet_validated`）。

## 12. Decision

`Core Candidate` / `Recommended` / `Research` / `Needs Human Review` / `No Suitable Song Found`
（判定顺序：候选为空 → 资料不全 → HIGH 风险 → 关系+维度+S6/S7 → 其余）。

## 13. 停止条件与禁止事项

见 SKILL.md 第十六、十七节（含：不批量生产 W04–W52、不批量导入歌曲/歌词/音频、
不因技能方便而降低神学审核标准）。

## 14. 项目侧落盘

| 载体 | 内容 |
|---|---|
| `~/.workbuddy/skills/mos-music-song-discernment/SKILL.md` | 技能定义（17 节） |
| `…/tools/discern.js` | 可执行运行器（只读上游，`--week` / `--backtest` / `--emit-examples`） |
| `…/examples/W01.json W02.json W03.json W03-AUX.json` | 结构化辨识结果 |
| `…/tests/backtest-w01-w03.json` | 回测用例与期望值 |
| `…/tests/upstream-hashes.json` | 上游快照（14 文件） |
| 本文档 | 冻结规格 |
| `docs/SKILL-SONG-DISCERNMENT-BACKTEST-W01-W03.md` | 回测报告与校准发现 |
| `docs/ADR/ADR-0008-song-discernment-skill.md` | 架构决定 |

## 15. 与 Schema 的对应

技能输出字段与项目 Schema 同源，**不新增并行字段**：

- `song_relation` / `theological_risk` / `practice_conversion` / `transmission_conversion`
  → `discipleship-unit.schema.json#review_gate`
- `theological_note` / `tier` / `review_status` → `song.schema.json`

## 16. 使用边界

- **允许**：Phase 2B 逐周选歌与辨识（一次一周，人工确认后落盘）。
- **禁止**：批量生产 W04–W52、自动选歌入库、绕开人工裁决直接改 `review_status`。
