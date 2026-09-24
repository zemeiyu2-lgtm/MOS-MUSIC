# MOS-MUSIC｜模型校准与冻结 V1.0（Model Calibration & Freeze）

状态：**已冻结（FROZEN）** ｜ 日期：2026-09-21 ｜ 阶段：Phase 2A.1
依据：Phase 2A 样本验证（W01–W03 单元 + 5 首歌曲八维辨识）＋ `docs/RESEARCH-FINDINGS-PHASE-2A.md`
效力：本文件自冻结起是 MOS-MUSIC 母模型的正式依据；进入 Phase 2B 前不得再改。

---

## 一、核心模型（校准后冻结）

```text
圣经真理
 ↓
神学理解
 ↓
音乐表达
 ↓
共同歌唱
 ↓
记忆
 ↓
情感形成
 ↓
S6 行
 ↓
S7 传
 ↓
生命形成
 ↓
门徒传递
```

## 二、七步法定义（名称不变，定义正式化）

保持七步：**读 → 明 → 唱 → 记 → 感 → 行 → 传**。不改成八步，不增加步骤。

| 步骤 | 正式定义 |
|---|---|
| S1 读 | 进入圣经文本。 |
| S2 明 | 理解圣经真理及其神学意义。 |
| S3 唱 | 用音乐表达、宣告或回应已经理解的真理。 |
| S4 记 | 通过旋律、歌词、重复和共同参与帮助真理进入记忆。 |
| S5 感 | 让圣经真理形成与福音相称的情感回应。 |
| S6 行 | 把所唱、所记、所感的真理转化为具体生活行动。 |
| S7 传 | 把已经形成的真理、实践和音乐资源传递给另一个人，进入门徒复制。 |

## 三、实践转换层（Practice Conversion Layer）

正式定义：

> 音乐门训中的实践转换层，是指通过明确、具体、可执行的 S6 行动，
> 使歌曲所表达和记忆的圣经真理进入门徒真实生活。

**注意：实践转换层不是新的第八步。它就是 S6｜行的理论定义。**

S6 四要素（缺一则退化为抽象属灵愿望）：行动对象、行动内容、行动时间、行动方式。

## 四、传递转换层（Transmission Conversion Layer）

正式定义：

> 音乐门训中的传递转换层，是指通过 S7「传」，
> 使个人已经领受和实践的真理，通过教导、分享、共同歌唱或带领七步法，
> 进入另一个人的门徒形成过程。

**注意：传递转换层不是新的第八步。它就是 S7｜传的理论定义。**

## 五、核心模型公式（修订）

简化表达保留：

```text
真理 × 音乐 × 共同体 × 实践 = 门徒形成
```

正式解释：

```text
圣经真理 × 音乐表达 × 共同体参与 × 实践转换 × 传递 = 音乐门徒形成
```

正式模型：

```text
Truth → Music → Memory → Emotion → Practice → Transmission → Formation
真理  → 音乐   → 记忆   → 情感    → 实践     → 传递        → 生命形成

其中：实践 = S6，传递 = S7
```

## 六、歌曲功能边界（冻结）

正式记录：**歌曲不是完整门训单元。**

歌曲主要承担：真理表达、记忆、情感形成、共同体参与、祷告、生命回应。

歌曲可以支持 Life Practice，但**不得假设歌曲本身自动产生具体行为**。

```text
歌曲 ≠ 生命实践
歌曲 + S6 具体行动设计 = 音乐进入生命实践
```

## 七、冻结范围

本冻结覆盖：

* 核心模型链（第一节）
* 七步法名称与定义（第二节）
* 两个转换层术语与定义（第三、四节）
* 核心公式（第五节）
* 歌曲功能边界（第六节）

本冻结**不**覆盖：个别歌曲选择、中文译本版本、年度主题命名（这些仍在人工审查流程中，
见 `docs/PHASE-2A-THEOLOGICAL-REVIEW.md`）。

## 八、落盘位置

| 载体 | 内容 |
|---|---|
| `content/schema/common.schema.json` → `$defs.sevenSteps` | 七步法定义（含 S6/S7 转换层） |
| `content/schema/discipleship-unit.schema.json` → `review_gate` | `song_relation` / `theological_risk` / `practice_conversion` / `transmission_conversion` |
| `content/schema/song.schema.json` → `theological_note` | 歌曲使用限制类神学备注 |
| `content/schema/annual.schema.json` | `annual_theme=null` + `annual_theme_status=not_defined_in_source` |
| `tools/validate-content.js` | 转换层与年度主题硬检查 |
| `docs/RESEARCH-FINDINGS-PHASE-2A.md` | Finding 01–03 |
| `docs/ADR/ADR-0007-…` | 本校准的架构决定记录 |
