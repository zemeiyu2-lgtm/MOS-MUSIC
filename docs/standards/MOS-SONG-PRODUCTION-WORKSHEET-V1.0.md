# MOS 生命诗歌｜单首歌曲生产工作单 V1.0

> 状态：**Frozen**（V3.0 标准层）
> 适用范围：一首歌「从立案到可发布」的作业流程
> 生成工具：`tools/song-worksheet.js`（派生 STEP00–15 状态 / 缺口 / 签核表，**不写内容**）
> 产物：`content/production/song-worksheets.json`
> 模板：`MOS-SONG-PRODUCTION-TEMPLATE-V1.0.md`（规定 18 段与等级）
> 教学法：`MOS-SONG-TEACHING-METHOD-V1.0.md`（规定教学段内容）

---

## 一、工作单是什么

工作单把「一首歌成为完整歌曲单元」拆成 **STEP00–STEP15 十六步**，加 **A–J 十组人工签核**。

- 工作单**只派生「做到哪一步」**，每一步的完成状态由 `app/song-unit.js` 的资源就绪表推导，**不人工填写**。
- 工作单**绝不写入**歌词、简谱、音频、教学内容 —— 那是**人的工作**。
- 缺口、下一步、签核表全部**如实列出，缺就写缺**。

> **一句话**：工作单是「进度仪表」，不是「内容生成器」，也不是「发布许可」。

---

## 二、状态机

生产状态（`production_states`，与模板 §四一致）：

```
INTAKE → VERIFYING → LYRICS_READY → SCORE_READY → PIANO_READY
       → DEMO_READY → SYNC_READY → TEACHING_READY → REVIEW → COMPLETE
```

- **任意阶段可显式挂起**：`HOLD`，并在 `status_note` 写明原因。
- **声明状态必须有机械前置**（见模板 §四「机械一致性」）；自相矛盾由校验器强制报错。
- 状态**向后兼容**：只是「走到哪」，不覆盖、不删除既有记录。

---

## 三、STEP00–STEP15

| 步 | key | 名称 | 目标 | 依据资源 | 解锁状态 |
|---|---|---|---|---|---|
| 00 | `intake` | 立案与来源登记 | 把这首歌放进待制作库，登记来源与版权来源状态。 | — | — |
| 01 | `verify_meta` | 资料核对 | 核对歌名（中/英）、词曲作者、译词版本、调 / 拍号 / 速度 / 时长 / 段落结构。 | — | `VERIFYING` |
| 02 | `choose_version` | 确定采用版本 | 写明当前采用哪一个歌词版本与乐谱版本，避免同一首歌出现多个未说明版本。 | — | — |
| 03 | `lyrics_structure` | 歌词结构化 | 歌词分节 / 分句，带 `section_id` / `lyric_id` / `line_id`（不得只留图片或 PDF）。 | `lyrics` | `LYRICS_READY` |
| 04 | `lyrics_proof` | 歌词校对与教词要点 | 标出易读错 / 易唱错 / 词义 / 换气 / 长音 / 重音。 | `lyrics` | — |
| 05 | `score_notation` | 统一简谱记谱 | 调号 / 拍号 / 小节 / 时值 / 高低音点 / 附点 / 延音 / 休止 / 升降号。 | `score` | `SCORE_READY` |
| 06 | `lyric_alignment` | 歌词与音符对齐 | 每个音符标注 `lyric_line_id` / `lyric_char_index`，供跟谱与逐字对齐。 | `score` | — |
| 07 | `piano` | 钢琴伴奏 | **第一阶段统一只做钢琴**：节拍稳定、与歌一致、可循环、调一致。 | `piano` | `PIANO_READY` |
| 08 | `demo_male` | 男声示唱 | 真人示唱：音准稳定、节奏清楚、咬字清楚、少混响、不过度修音。 | `demo_male` | `DEMO_READY` |
| 09 | `demo_female` | 女声示唱 | 同男声标准；缺一则如实未提供，**不得用合成声音冒充**。 | `demo_female` | — |
| 10 | `timeline` | 分句时间轴 | 每句 `start` / `end`（秒）与小节范围 —— 单句循环、当前句高亮的地基。 | `timeline` | `SYNC_READY` |
| 11 | `cursor` | 光标跟谱数据 | 只登记**真实可用**的跟随层级（句 / 小节 / 拍 / 音符 / 歌词）。 | `cursor` | — |
| 12 | `teach_learn` | 学唱教学 | 五步（听 → 跟 → 陪 → 自己唱 → 再唱一次）需词 / 谱 / 钢琴 / 至少一个示唱 / 时间轴齐备。 | `teach_learn` | `TEACHING_READY` |
| 13 | `teach_class` | 教谱 / 教词 / 声乐提示 | 教谱要点随乐谱产生；教词要点随歌词整理产生；声乐只记这首歌真正需要的提示。 | `teach_score` `teach_lyrics` `teach_vocal` | — |
| 14 | `teach_live` | 真人教唱模块 | 短、碎、可重复利用（导入 / 教谱 / 教节奏 / 教词 / 分句示范 / 声乐提示 / 完整示范）。 | `teach_live` | — |
| 15 | `content_formation` | 内容理解 / 生命实践 / 传唱 | 只写这首歌自身的内容层，文本必须可追溯（`derived_from`），**不绑定某一周 / 某一课**。 | — | — |

**步状态**（工具派生）：

- `DONE`：该步依据资源全部就绪；
- `TODO`：该步依据资源尚未就绪（缺口会逐项列出）；
- `HUMAN`：该步**无机械判据**（属人工 / 文本类，如资料核对、版本选择、内容撰写）——工具**不代为判定**。

---

## 四、角色

| 角色 | 职责 | 不做 |
|---|---|---|
| **内容研究员** | 资料核对、版本选择、歌词结构化与校对、内容理解 / 生命实践 / 传唱文本（须 `derived_from`） | 不判定资源是否可发布 |
| **记谱员** | 统一简谱记谱、歌词与音符对齐 | 不生成示唱 / 伴奏 |
| **音频制作者** | 钢琴伴奏、男声 / 女声示唱、分句时间轴 | 不用合成声音冒充真人；不加非钢琴乐器 |
| **教学编辑** | 学唱 / 教谱 / 教词 / 声乐提示、真人教唱模块 | 不写承诺（不设「学会」「通过」） |
| **版权 / 治理** | 版权与来源状态登记、来源追溯 | **不得**把 `SOURCE_REQUIRED` 推成 `permission_granted`（见 ADR-0012） |
| **签核人（人工）** | A–J 十组裁决与最终签核 | 不由工具代签；不把 `PENDING` 当作通过 |

> 一个人可身兼多角，但**签核人与制作人分离**：制作人不能给自己的作品签核。

---

## 五、A–J 十组签核

| 组 | key | 项目 |
|---|---|---|
| A | `data` | 数据（歌名 / 版本 / 来源） |
| B | `lyrics` | 歌词（完整 / 校对 / 分句） |
| C | `score` | 简谱（调 / 节奏 / 音符 / 歌词对齐） |
| D | `demo` | 示唱（男声 / 女声至少其一） |
| E | `piano` | 钢琴（可播放 / 节拍稳定 / 与歌一致） |
| F | `teaching` | 教学（学唱 / 教谱 / 教词 / 基本声乐提示） |
| G | `sync` | 同步（分句时间轴 / 光标 / 歌词） |
| H | `live_teaching` | 教唱（真人教学内容） |
| I | `content` | 内容（歌曲内容 / 圣经根基 / 生命实践） |
| J | `rights` | 版权（来源 / 使用状态） |

**结果取值**：`PENDING`（尚未裁决）/ `PASS`（通过）/ `REVISE`（需修改）/ `HOLD`（挂起）。

**裁决规则**：

- `PENDING` **不等于通过**；`acceptance.mechanically_complete` 只表示「十组都不是 PENDING」。
- 出现任一 `REVISE` 或 `HOLD` → **不得发布**，回到对应 STEP 修正。
- 签核人字段（`reviewer`）为 `null` 表示尚未指定审核人。

---

## 六、资源包结构

发布时**应齐备**的资源件（`resource_package`）：

| key | 资源 | 依据 |
|---|---|---|
| `lyrics_structured` | 结构化歌词（分节 / 分句 / `line_id`） | `lyrics` |
| `score_simple` | 统一简谱（含歌词对齐） | `score` |
| `piano_full` | 钢琴伴奏（全曲） | `piano` |
| `demo_male` | 男声示唱 | `demo_male` |
| `demo_female` | 女声示唱 | `demo_female` |
| `timeline` | 分句时间轴 | `timeline` |
| `cursor_data` | 光标跟谱数据 | `cursor` |
| `teaching` | 教学内容（学唱 / 教谱 / 教词 / 声乐） | `teach_learn` `teach_score` `teach_lyrics` `teach_vocal` |
| `live_teaching` | 真人教唱模块 | `teach_live` |

---

## 七、发布条件（三重）

发布必须**同时**满足：

1. **资源包齐备**（`resource_package` 全部 `ready`）；
2. **A–J 全部裁决且无 `REVISE` / `HOLD`**（`acceptance.pass` 覆盖十组）；
3. **人工签核**（`release.signed_by` 由人工填写）。

> `release.mechanical_ready` **只是前两项的机器检查** ——
> **机械就绪 ≠ 可发布**。工具**不代替签核**，也**不把 `PENDING` 当作通过**。

---

## 八、工作单不做什么（边界）

- 只派生「做到哪一步」，**不代替人写**歌词 / 简谱 / 音频 / 教学内容；
- `release.signed_by` **由人工填写，工具不代填**；
- `PENDING` 是尚未裁决，**不等于通过**；
- **不产生分数、排名、推荐**；不自动升层、**不自动改 Frozen 技能**；
- JSON 只输出到 `content/production/song-worksheets.json`（派生层），与 `song-unit-levels.json` 必须一致（`--check` 强制）。

---

## 九、生成与核对

```bash
# 生成工作单（派生层，可重跑）
node tools/song-worksheet.js

# 核对工作单与单元资源是否一致（不写盘；六道门之一）
node tools/song-worksheet.js --check

# 打印某一首的 Markdown 工作单，供人使用
node tools/song-worksheet.js --md MUS-S-0001
```

当前状态：曲库 50 首中 **10 首**已建立单曲完整单元（18 段结构），40 首仅登记层记录（不在本工作单范围）。
10 首**全部停留在 STEP00（`INTAKE`）** —— 这是**真实状态，不是遗漏**。

---

## 版本

| 版本 | 日期 | 说明 |
|---|---|---|
| V1.0 | 2026-09-21 | 首次冻结：STEP00–15 / 状态机 / 角色 / A–J 签核 / 资源包 / 三重发布条件 / 工具边界。 |
