# ADR-0007：S6/S7 转换层正式化与歌曲边界冻结（Phase 2A.1 模型校准）

- 状态：Accepted（已冻结）
- 日期：2026-09-21
- 关联：ADR-0002（与 MOS-DIS 流程边界）、ADR-0006（tier 与 review_status 独立）、docs/MODEL-CALIBRATION-V1.0.md、docs/RESEARCH-FINDINGS-PHASE-2A.md

## 背景

Phase 2A 样本验证（W01–W03 + 5 首歌曲八维辨识）得出结构性发现：
歌曲的情感形成能力显著高于直接行为形成能力（Finding 01）；
没有明确的 S6 指令，「行」退化为抽象属灵愿望（Finding 02）；
没有明确的 S7 要求，音乐门训停留在个人而没有进入复制（Finding 03）。

## 决定

1. **不加第八步。** 七步法保持「读 → 明 → 唱 → 记 → 感 → 行 → 传」不变；
   校准只作用于定义层：
   - S6 = 实践转换层（Practice Conversion Layer）
   - S7 = 传递转换层（Transmission Conversion Layer）
2. **歌曲边界冻结：** 歌曲不是完整门训单元；歌曲 ≠ 生命实践；
   歌曲 + S6 具体行动设计 = 音乐进入生命实践。
3. **Schema 层落盘：**
   - `common.schema.json#/$defs/sevenSteps` 写入七步正式定义；
   - `discipleship-unit.schema.json#review_gate` 增加 `song_relation`
     （direct_biblical_expression | theme_response | narrative_response | not_yet_assessed）、
     `theological_risk`、`practice_conversion`、`transmission_conversion`；
   - `song.schema.json` 增加 `theological_note`（使用限制类神学备注）；
   - `annual.schema.json`：`annual_theme` 可为 null，新增 `annual_theme_status`
     （not_defined_in_source | confirmed）——52W 母表未定义总主题时 MOS-MUSIC 不自行命名。
4. **校验器硬检查：** 每个年度单元必须声明 `song_relation` 与两个转换层落地说明；
   `annual_theme=null` 必须伴随 `annual_theme_status=not_defined_in_source`。

## 后果

- 正面：母模型在进入 Phase 2B（内容生产）前有稳定的理论依据与机器可校验的落盘形式；
  「唱了就改变」的隐含假设被显式禁止。
- 代价：内容生产门槛提高——每个单元必须写出四要素齐全的 S6 与可查验的 S7，
  否则 validate-content 不通过。这是刻意设计，不是负担。
- 与 MOS-DIS 边界不受影响：MOS-DIS 五步日流程（H-1 裁决 B）不因本校准改动。
