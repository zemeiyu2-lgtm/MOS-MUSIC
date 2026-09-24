# ADR-0020｜完整歌曲资源模型 · Reuse First · 外部真人分段 · AI 资源类型

- 状态：**Frozen**
- 日期：2026-09-23
- 关联：ADR-0012（版权词表维度分离）、ADR-0013（锚点与升层）、ADR-0017（单曲单元标准层）

## 决策一：正式冻结完整资源模型

```text
Song
├── lyrics / score / timeline
├── demo   ├── human_male / human_female      （真人）
│          └── ai_male / ai_female            （AI，显式标注）
├── accompaniment └── piano                    （Piano First，只做钢琴）
├── teaching ├── score / lyrics / vocal / human_teacher
├── content  ├── meaning / scripture / background / reflection / practice / prayer
└── personal ├── favorite / learning / history / notes   （客户端本地，不入内容层）
```

**兼容性铁律**：不破坏 V3.0 schema 兼容性；新增**一律用可选字段**；
不修改任何已有冻结字段的含义（`demos.male` / `demos.female` / `piano` / `timeline` / `cursor` 语义不变）。

`personal` 层落在客户端：`my_songs.liked / learning / last_sung_at / notes`（内容层只声明映射，不存个人数据）。

## 决策二：真人示唱 **Reuse First**

> **找现成 → 核版本 → 能用就用 → 缺什么补什么 → 最后自己制作。**

资源来源类型（内部记录）：

```text
EXTERNAL_HUMAN_MALE / EXTERNAL_HUMAN_FEMALE / MOS_HUMAN_MALE / MOS_HUMAN_FEMALE / AI_MALE / AI_FEMALE
```

**前台一律只显示「男声示唱」「女声示唱」**；来源类型只在后台可见。
AI 类型必须在界面上显式标注「非真人」。

## 决策三：外部真人版本的分段能力（只定位，不转存）

必须支持：

```text
source_url / start / end / phrase_id
```

同一个完整真人版本可以产生：完整示唱 / 第一段 / 第二段 / 第三段 / 副歌 / 难句。

**不得**未经许可把外部视频下载、重新上传为 MOS 自有资源。
优先：**原站播放 / 嵌入 / 时间段定位**（`host_policy: original_site`）。
校验器与 `tools/guard.js` 都会拒绝任何 `download_url` / `local_copy` / `reupload` 类字段。

## 决策四：真人示唱 + 简谱同步链

```text
song → phrase → score → lyric → external_human_audio → start / end
```

目标：**点某句谱 → 播放对应真人示范**。
前提是分句时间轴与光标使用**真实标记**（绝不插值）。当前无真实音频 ⇒ 该链保持 `SYNC_NOT_READY`。

## 决策五：AI 示唱是正式资源类型，但本轮不接入厂商

保留 `AI_MALE` / `AI_FEMALE` 作为正式资源类型。本轮只完成：
API abstraction、resource schema、player support、metadata、source tracking。

- `demos.ai_male` / `demos.ai_female`：`is_ai` 恒为 `true`、`singer` 恒为 `null`、`engine` / `vendor` 本轮为 `null`。
- **AI 轨不计入 L1–L4 等级派生**（等级仍只看真人示唱），也不得冒充真人。
- 未来可替换具体 Singing Engine，接口形状不变。

## 决策六：钢琴 **Piano First**

只保留钢琴为标准伴奏；支持整曲 / 分句 / 循环 / 速度。引入其它乐器属产品变更，需另开 ADR。

## 决策七：新增「表达参考」预留结构

```text
expression_reference: phrase / dynamics / phrasing / breath / emphasis / climax / release / vocal_tip
```

来源只能是真人（真人教师 / 优秀真人示唱者 / 音乐编辑）。
AI 以后只负责 **分析 → 比较 → 提示**，不自行决定神学或属灵表达。

## 实测现状（2026-09-23）

- 资源层记录数 **0**：六类槽位全部 `NOT_IMPORTED`（真实状态，不虚构）；
- 外部检索**未执行** ⇒ 100 首普查表中人类示唱 / 钢琴 / 教学一律 `UNSURVEYED`；
- AI 成品 **0**（类型就位、引擎未接入）。
