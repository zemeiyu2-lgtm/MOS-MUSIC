# MOS 生命诗歌｜单首歌曲完整制作模板 V1.0

> 状态：**Frozen**（V3.1 标准层）
> 适用范围：把一首歌做成「可学、可视唱、可教、可传」的完整歌曲单元
> 机器 schema：`content/schema/song-unit.schema.json`
> 机器词表：`content/song-units/index.json` → `sections` / `completion_levels` / `production_states`
> 工作单：`MOS-SONG-PRODUCTION-WORKSHEET-V1.0.md`（规定怎么一步步做）

---

## 一、一首歌的标准模型

**一首歌 = 18 个段**。核心段与资源段的状态分为三类；结构仍必须完整。

| 状态 | 含义 |
|---|---|
| `PROVIDED` | 该段内容**已真实存在**，可用于教学。 |
| `NOT_PROVIDED` | 该段内容尚不存在，前台显示「尚未提供」。 |
| `CANDIDATE_EXTERNAL` | 已找到外部候选来源，但尚未完成应用内播放/嵌入、分段或教学适用性确认；**不计入完成等级**。 |

18 段**必须齐备**（结构完整性，校验器强制）；但**允许内容为空**。
「结构完整 + 内容空」是**合法的真实状态**，不是缺陷。

---

## 二、18 段总表

| 段 | key | 名称 | 组 | 上前台 | 内容 |
|---|---|---|---|---|---|
| 01 | `song_meta` | 歌曲资料 | core | ✅ | 歌名（中/英）、可能的版本、来源说明。 |
| 02 | `lyrics` | 统一歌词 | core | ✅ | 结构化歌词（分段 / 分句）、校对状态、来源。 |
| 03 | `score` | 统一简谱 | core | ✅ | **只做简谱**、统一格式；调号 / 拍号 / 音符 / 歌词对齐。 |
| 04 | `demo_male` | 男声示唱 | resource | ✅ | 真人男声示范；外部来源未完成应用内核验时只能记为 `CANDIDATE_EXTERNAL`。 |
| 05 | `demo_female` | 女声示唱 | resource | ✅ | 真人女声示范；外部来源未完成应用内核验时只能记为 `CANDIDATE_EXTERNAL`。 |
| 06 | `accompaniment` | 伴奏 | resource | ✅ | **伴奏不限定乐器**；至少提供一种完整、合适、稳定、可唱的伴奏，有选择时再提供更多版本。 |
| 07 | `timeline` | 分句时间轴 | resource | ✅ | 分句 → 小节 / 拍 / 音符的真实时间标记。 |
| 08 | `cursor` | 光标跟谱数据 | resource | ✅ | 由时间轴派生的跟谱层（等级 / 标记范围）。 |
| 09 | `teach_learn` | 学唱教学 | teaching | ✅ | 学唱模式的逐步教学。 |
| 10 | `teach_score` | 教谱教学 | teaching | ✅ | 教谱：调 / 拍号 / 起音 / 结构 / 易错处。 |
| 11 | `teach_lyrics` | 教词教学 | teaching | ✅ | 教词：难读字 / 难唱词 / 词义 / 换气 / 长音 / 重音。 |
| 12 | `teach_vocal` | 声乐教学 | teaching | ✅ | 声乐提示（**不是专业声乐课**）：呼吸 / 起音 / 换气 / 高音 / 长音 / 音准 / 力度 / 咬字 / 情感。 |
| 13 | `teach_live` | 真人教唱 | teaching | ✅ | 真人教唱模块（导入 / 教谱 / 教节奏 / 教词 / 分句示范 / 声乐提示 / 完整示范）。 |
| 14 | `content_understanding` | 内容理解 | content | ✅ | 这首歌在说什么；**不绑定周次 / 课程**。 |
| 15 | `life_practice` | 生命实践 | content | ✅ | 轻入口：一个祷告 / 一个行动 / 一个关系 / 一个提醒 / 一个生活操练。 |
| 16 | `transmission` | 教唱与传唱 | content | ✅ | 把这首歌交出去（教谁 / 怎么传）。 |
| 17 | `rights` | 版权与来源 | rights | ❌ | 版权状态 / 来源追溯（后台可查，前台不喧哗）。 |
| 18 | `acceptance` | 最终验收 | acceptance | ❌ | A–J 十组验收行（结果 PENDING / PASS / REVISE / HOLD）。 |

**上前台**：`front: true` 的段由前台呈现；`rights` / `acceptance` 属于后台治理，不在前台展示。

---

## 三、四级完成度（派生，不写在记录里）

**等级是「实际资源」的派生结果**，由 `app/song-unit.js` 的 `deriveLevel()` 计算，
**绝不写进单元记录** —— 避免「声明即完成」的自欺。

| 级 | 名称 | 前台标签 | 前置资源 |
|---|---|---|---|
| `NONE` | 尚未达到最低可用 | 资源待制作 | （无）结构已建立，但歌词与简谱尚未提供 —— 现在还不能读谱唱。 |
| `L1` | 基本歌：歌词 + 简谱 | **可以读谱唱** | `lyrics` + `score`。可以读、可以唱，但还没有伴奏支持。 |
| `L2` | 可学唱：歌词 + 简谱 + 伴奏 | **可以正式学唱** | `lyrics` + `score` + `accompaniment`。有伴奏陪唱，可以进入正式学习。 |
| `L3` | 完整学唱：简谱 + 伴奏 + 示唱 + 时间轴 | **可以完整学唱** | `L1/L2` + `demo_any` + `timeline`。有真人示唱与分句时间轴，学唱体验完整。 |
| `L4` | 完整教学歌 | **完整教学歌** | `L3` + `demo_male` + `demo_female` + `cursor` + `teach_learn` + `teach_score` + `teach_lyrics` + `teach_vocal` + `teach_live`。可学、可视唱、可教、可传的完整歌曲单元。 |

### 派生规则（机械定义）

- `demo_any = demo_male OR demo_female`，且只有 `status=PROVIDED` 才计入等级；`CANDIDATE_EXTERNAL` 不计入。
- `teach_learn` 成立 **⟺** `lyrics` ∧ `score` ∧ `accompaniment` ∧ `demo_any` ∧ `timeline` 同时成立
  （没有示范与时间轴，「学唱教学」无从谈起）。
- `teach_score` / `teach_lyrics` 成立 **⟺** 该段条目列表长度 > 0（空列表不算成立）。
- `cursor` 成立 **⟺** 存在至少一个真实标记的跟谱层级。
- 升级必须**逐级**：不能从 `NONE` 直接跳到 `L3`；缺哪一段就停在哪一级。
- 等级**只升不降**不成立（这是实然状态，不是承诺）—— 若资源被撤回，等级如实回落。

---

## 四、制作顺序（标准流水线）

生产状态机（`production_states`）与段的推进顺序一致：

```
INTAKE → VERIFYING → LYRICS_READY → SCORE_READY → ACCOMPANIMENT_READY
       → DEMO_READY → SYNC_READY → TEACHING_READY → REVIEW → COMPLETE
                                                        ↓
                                                      HOLD（任意阶段可显式挂起）
```

| 状态 | 名称 | 含义 |
|---|---|---|
| `INTAKE` | 已进入待制作库 | 只有身份与来源，尚未开始制作。 |
| `VERIFYING` | 资料核对中 | 版本 / 来源 / 版权在核对，尚未定案。 |
| `LYRICS_READY` | 歌词完成 | 歌词结构化、分句、校对完成。 |
| `SCORE_READY` | 简谱完成 | 简谱按统一标准完成并与歌词对齐。 |
| `ACCOMPANIMENT_READY` | 伴奏完成 | 伴奏可播放、节拍稳定、与歌曲一致。 |
| `DEMO_READY` | 示唱完成 | 至少一个真人示唱可用。 |
| `SYNC_READY` | 时间轴与光标完成 | 分句时间轴与跟谱数据就绪。 |
| `TEACHING_READY` | 教学内容完成 | 学唱 / 教谱 / 教词 / 声乐提示就绪。 |
| `REVIEW` | 最终审核 | 进入人工签核，未通过不得发布。 |
| `COMPLETE` | 完整歌曲 | 达到 L4 且人工签核通过。 |
| `HOLD` | 暂停制作 | 显式挂起，并在 `status_note` 说明原因。 |

### 机械一致性（校验器强制）

**声明的 `status` 必须有其前置资源成立**，否则视为自相矛盾：

| 声明 status | 必须已成立 |
|---|---|
| `LYRICS_READY` | `lyrics == PROVIDED` |
| `SCORE_READY` | + `score == PROVIDED` |
| `ACCOMPANIMENT_READY` | + `accompaniment == PROVIDED` |
| `DEMO_READY` | + `demo_any` |
| `SYNC_READY` | + `timeline` |
| `TEACHING_READY` | + `teach_learn` |
| `COMPLETE` | + `L4` 且 `acceptance` 全 PASS |

`statusConsistent()` 是唯一的判定入口（`app/song-unit.js`）。

---

## 五、可追溯内容（不生成神学内容）

- 第 14 段（内容理解）与第 15 段（生命实践）中，凡写入文本**必须**带 `derived_from`
  指向内容层既有字段（如歌曲单元的 `formation.transmission`、`bible.core_passage`）。
- **不得凭空生成神学内容**。平台只把已有内容研究到「可以讲 / 可以用」，不替使用者完成表达。
- 圣经依据只作为**参考**随歌携带（`bible.core_passage`），**不把歌绑定到某周 / 某课**。

---

## 六、与周次 / 课程的关系（本 V3.0 的定位）

- 单曲单元是**独立层**（`content/song-units/**`），**不写入 Song Core Record**
  （`content/songs/**` 逐字节不变）。
- 单曲单元**不引用周次、不引用课程**。周次使用是**下游可能出现的消费方式**，不是制作前提。
- 版本号不受年度周次影响：一首歌做好了，它在任何一年、任何场合都能用。

---

## 七、100 首目标策略

| 阶段 | 目标 | 重点 |
|---|---|---|
| 第 1 阶段 | 曲库成形（当前 50 首：详情层 10 + 登记层 45 去重合计 50） | 先把**歌**收全，不急着做 18 段。 |
| 第 2 阶段 | 详情层扩到 10 → 60 | 每首歌先做 **L1（歌词 + 简谱）**，这是最低可用线。 |
| 第 3 阶段 | 骨干歌做满 L2 / L3 | 常用的歌补伴奏与示唱。 |
| 第 4 阶段 | 核心歌做满 L4 | 只对**会被反复教**的歌做完整教学包。 |

**策略原则**：

1. **先 L1 铺满，再逐级加深** —— 不要一首歌做到 L4 而其他歌都是 NONE。
2. **不虚构**：没有的资源就是「尚未提供」，等级如实停在当前级。
3. **不做排名**：100 首之间**不排序、不评分、不推荐**。
4. **伴奏通用**：所有伴奏以「合适、完整、好唱、与歌曲音乐性相称」为标准；不限定钢琴。

---

## 八、硬边界

- 18 段 schema 使用 `additionalProperties: false` —— **防止结构漂移**（不能私自加段）。
- 单元记录**不得出现**评分 / 排名 / 徽章 / 通过类字段（校验器硬检查）。
- 示唱 `singer` 字段枚举为 `[null]` —— **禁止虚拟歌手**。
- 只覆盖**已进入曲库**的歌曲；候选层（`content/candidates/**`）尚未进库的歌曲不属于单曲制作范围。
- 本层**不产生分数、排名、推荐或通过 / 不通过结论**。

---

## 版本

| 版本 | 日期 | 说明 |
|---|---|---|
| V1.1 | 2026-09-25 | 将伴奏从钢琴专属升级为通用伴奏，并保留现有钢琴资源兼容：18 段模型 / 四级完成度 / 状态机 / 制作顺序 / 100 首策略 / 硬边界。 |
