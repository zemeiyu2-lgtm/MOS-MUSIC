# ADR-0008：歌曲辨识与选歌 Skill V1.0（mos-music-song-discernment）

- 状态：Accepted（回测通过后冻结）
- 日期：2026-09-21
- 关联：ADR-0006（tier 与 review_status 独立）、ADR-0007（S6/S7 转换层与歌曲边界）、
  `docs/MODEL-CALIBRATION-V1.0.md`、`docs/SKILL-SONG-DISCERNMENT-V1.0.md`、
  `docs/SKILL-SONG-DISCERNMENT-BACKTEST-W01-W03.md`

## 背景

Phase 2A.1 冻结母模型后，进入 Phase 2B 前需要一条**可复用、可回测、不可反向**的选歌路径：
由「经文 → 核心真理 → LQ → MM → 音乐功能」出发判断候选歌曲能否承担本周音乐门训功能。
Phase 2A 样本验证同时暴露：按 MM 主题逐周选歌的质量参差是真实风险（W02 属主题级呼应），
必须有常设的辨识机制，而不是靠人凭印象挑歌。

## 决定

1. **建立 Skill** `mos-music-song-discernment` V1.0.0，固化「先经文后音乐」链条，
   永久禁止反向选歌；匹配不上时输出 `Needs Human Review` / `No Suitable Song Found`，**不得改上游**。
2. **Skill 落位于用户级技能目录** `~/.workbuddy/skills/mos-music-song-discernment/`
   （与既有 MOS 技能 mos-sermon-exegesis、mos-gov-dev-verify 同规范，**不新建第二套目录约定**）。
3. **字段与 Schema 同源**，不新增并行字段：`song_relation` / `theological_risk` /
   `practice_conversion` / `transmission_conversion` → `discipleship-unit.schema.json#review_gate`；
   `theological_note` / `tier` / `review_status` → `song.schema.json`。
4. **两层裁决分离（回测 C1 得出的强制约束）**：
   歌曲生命周期状态（`review_status`）与本周适配裁决（`review_gate.theological_review`）
   必须分别输出，**不得合并**为一个 "Confirmed"。
5. **回测门槛**：Skill 必须能在 W01–W03 上复现冻结人工裁决（含 W02 必须判 `theme_response`
   且识别「安静不得取代恩典越界」、W03 必须识别辅助歌道德主义风险）。
   不通过时只改 Skill（V1.0 → V1.0.1），**不得修改人工裁决**，不得直接跳到 V2.0。
6. **上游只读**：运行器只读 `content/**`；回测以 14 个上游文件的哈希一致性作为验收 A 项。

## 后果

- 正面：Phase 2B 的逐周选歌有了可执行、可复现、可回测的门径；选歌质量不再依赖个人印象；
  「歌曲 ≠ 完整门训单元」「Tier 与 Review 独立」「theme_response 不得写成 direct」
  等红线变成机器可检查的规则。
- 代价：选歌流程变重（必须输出八维、S6 四要素、S7 三要素、风险 A–F 与 Decision Trace）；
  这是刻意设计——**宁可慢，不可降低神学标准**。
- 边界：Skill 不改变 52W / LQ / MM / MOS-DIS / MOS-GOV / EBRM；不自动改 `review_status`；
  不批量生产 W04–W52。
