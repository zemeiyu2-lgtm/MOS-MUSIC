# ADR-0013｜圣诗固有经文依据的锚点认定与「登记层 → 详情层」升层路径

状态：已采纳（人工授权）｜日期：2026-09-21｜阶段：V0.5 扩库第二段（升层）试批
人工授权原文：**「授权你按公版圣诗固有经文依据逐首认定」**
范围：`MUS-S-0006 … MUS-S-0010`（5 首试批）；剩余 40 首不在本裁决范围内

---

## 背景

CI-0018 记录的是**升层判据**：V0.5 的「50 首入库」是分层完成的 ——
5 首有歌曲详情记录（`content/songs/`），45 首只有入库登记记录（`content/library/registry.json`）。
人工已批准采用**严格口径**（50 首都需要歌曲详情记录），但排查后发现当前**不可执行**，
且不是工作量问题，而是四条硬前置（见 `MOS-MUSIC_LIBRARY_V0.5_REPORT.md` §12）：

1. `bible.core_passage` 是 `content/schema/song.schema.json#bible` 的**必填项**，
   且该 schema 与登记层 schema（`library-intake.schema.json`）都是
   `additionalProperties: false` —— **既不能没有锚点，也不能加过渡字段**。
2. **锚点来源不存在**：现有 5 首的锚点靠上游经文登记表里 `source: sample-validation`
   的条目进库，而该表 26 条全部是 24 课 / 52W 的经文中心，不含 45 首所需的锚点。
3. 冻结技能 §三 把 `Year / Week_ID`、`Bible_Passage`、`Core_Truth`、`LQ`、`MM`、
   `Music_Function` 列为**必需输入**，§二 / §十七-1 禁止反向选歌，§十六-5 遇批量导入立即停止
   ⇒「对 45 首运行冻结技能 S1→S7」不是被支持的运行方式；而指令 §七 又禁止指定 W05–W52。
4. §六 的作品级归属 / 版本核验证据仍缺。

人工授权解除了其中最关键的一条：**锚点不必来自周次，可以来自圣诗自身**。

---

## 决策｜一、锚点认定口径

**锚点取该圣诗自身歌词所指向的经文依据；不以「某一周需要哪首」为前提去指定。**

这不是文字游戏，而是两条不同的路径：

| | 方向（被禁止） | 方向（本裁决） |
|---|---|---|
| 起点 | 某一周的经文与需要 | **这首圣诗自己的歌词** |
| 问题 | 「这周要什么歌」 | 「这首诗在讲哪段经文」 |
| 结果 | 为周次反向挑歌 | 为歌认定其固有依据 |

⇒ 因此**不构成**方向规则所禁止的「反向选歌」（`content/production/index.json#direction_rule`）。

锚点证据类型（逐首标注，写进留档）：

- `歌词直引` —— 歌词直接引用或近乎逐字改写某节经文；
- `传统主题一致` —— 赞美诗学通行记载的主题归属与某段经文一致；
- `歌词对应 + 默想次序一致` —— 结构 / 次序层面的对应，非字面引用。

**认定 ≠ 核验完成**：锚点按上述依据**认定**（`authorized_determination`），
但**作品级版本核验**（中文译词、乐谱来源）仍未做，继续计入缺失证据。

---

## 决策｜二、升层声明口径（登记层契约冻结下的唯一路径）

登记层字段契约 `content/schema/library-intake.schema.json` 位于不可变基线内，
且 `additionalProperties: false` ⇒ **登记记录里不可能增加 `promoted` 之类的字段**。
若强行加字段，就是改冻结契约；若改写登记记录，就破坏了「登记层逐字节不变」的来源可追溯性。

因此：

> **升层状态不入登记记录，另立 `content/production/library-promotions.json` 单独声明。**

规则（`relation_rule`，已由校验器强制执行）：

1. `promotions[].song_id` 必须**同时**出现在 `content/library/registry.json`（登记来源）
   与 `content/songs/<song_id>.json`（详情记录）中；
2. `detail_file` 必须存在，且其 `bible.core_passage` 必须与 `anchor.core_passage` **一致**；
3. 合并曲库时，被声明的歌曲**只按详情层计一次** —— 不得在两个层重复计数。

⇒ 「未声明升层的重叠」是**错误**（会被当成两首歌重复计数）；
「已声明升层的重叠」必须**逐条可核验**。
这不是把检查放宽，而是要求「详情记录 + 升层声明」两件事同时成立。

---

## 决策｜三、字段政策（四分）

| 类别 | 字段 | 说明 |
|---|---|---|
| `authorized_determination` | `bible.core_passage` `bible.bible_reference_ids` `bible.bible_themes` | 本次人工授权的认定范围 |
| `literature_based_pending_verification` | `author` `composer` `source` `era` | 按公版赞美诗学通行记载填入，**逐首标注来源与核验状态**，不假装已作作品级核验 |
| `preliminary_pending_acceptance` | `discipleship.main_theme` `discipleship.music_unit_refs` `formation.primary_function` `discipleship.difficulty` | 初步映射，标 `preliminary_pending_acceptance`，待人工验收 |
| `left_empty_not_filled` | 八维辨识 · `song_relation` · S6 · S7 · 使用决定 · `tier` 升级 | **一律留空**，不给推测值 |

---

## 决策｜四、硬边界（本批不得越过）

- 不改写候选清单的 `SOURCE_REQUIRED`，**不推定为 `PUBLIC_DOMAIN`**；
- 法律状态未判定一律记 `unknown`（承 ADR-0012）；
- **不做八维辨识**、**不升 `tier`**（保持 `C`）、`review_status` 保持 `draft`；
- **不指派任何周次**，不生成 W05–W52 任何周次或单元；
- **不收录**歌词 / 歌谱 / 示唱 / 伴奏（四槽保持 `NOT_IMPORTED`）；
- 只处理 5 首试批，剩余 40 首须经人工验收后再定。

---

## 落地点

| 改动 | 文件 | 性质 |
|---|---|---|
| 锚点认定留档（5 首，含赞美诗学记载与核验状态） | `content/production/song-anchor-determinations.json` | Production Content（新增） |
| 升层声明（5 条，batch=`V0.5-promotion-trial-1`） | `content/production/library-promotions.json` | Production Content（新增） |
| 5 首歌曲详情记录 | `content/songs/MUS-S-0006…0010.json` | Production Content（新增） |
| 详情层索引 `count` 5 → 10、facets 更新 | `content/songs/index.json` | Production Content |
| 登记层索引计数（`promoted_to_detail` / `intake_pending_promotion`） | `content/library/index.json` | Production Content |
| 合并视图支持升层（`mergeLibrary` + `songFactsFrom`） | `app/library-intake.js` | 程序层 |
| 库级辨识对已升层歌曲反映证据变化（`upgraded`） | `app/discernment.js` | 程序层 |
| 派生索引带上 `promoted` 标记 | `tools/derive-indexes.js` | 程序层 |
| 使用历史带上 `promoted` 与 `library_scope_result` | `tools/build-usage.js` | 程序层 |
| 报告新增「升层（第二段，试批）」段 | `tools/library-report.js` | 程序层 |
| 升层路径硬校验（详情存在 / 锚点一致 / 认定与声明一一对应） | `tools/validate-content.js` | 程序层 |
| 回归 §9.7 升层路径断言 | `tools/regression.js` | 程序层 |
| 离线预缓存补两份新文件 | `sw.js`（`mos-music-v6`） | 程序层 |
| CI-0018 记录试批进展（**保持 OPEN**） | `content/production/calibration-issues.json` | Production Content |
| 新增 CI-0022（升层状态外挂的观测性残留） | `content/production/calibration-issues.json` | Production Content |

**关键性质：零 schema 改动、零基线漂移、登记层逐字节不变。**

- `content/schema/song.schema.json` 与 `content/schema/library-intake.schema.json`
  **均未改动** —— 两者都在 Immutable Baseline 内，`additionalProperties: false` 保持原样。
- `content/library/registry.json` **未改动**：升层不在登记记录里表达。
- `immutable_drift = []`：新增内容全部落在 Production Content 与派生索引。

---

## 为什么不动冻结 Schema

CI-0018 一度看起来需要「给登记层加一个 `promoted` 字段」或「给详情层加一个
`anchor_status` 字段」。本裁决证明**两者都不需要**：

- **升层是两层的组合事实，不是任何一层的属性。** 它由「详情记录存在」＋
  「升层声明存在」共同构成，天然属于**声明层**（一份独立的 Production Content 文件），
  而不是登记记录的字段。把它塞进登记记录，等于让一个「只登记元数据」的层
  携带生命周期结论 —— 与 ADR-0010 分层设计相悖。
- **锚点缺失不是「待补字段」，而是「尚未认定」。** 认定之后它就是正常取值，
  不需要过渡字段（这正是 CI-0015 案 a 的同一教训：两侧不等价不是缺陷，
  而是提醒我们不要把两个维度混为一谈）。

---

## 残留与后续

### CI-0018｜**保持 OPEN**

本批只完成 5/45。剩余 **40 首**仍在登记层；其锚点认定是否沿用同一口径，
**须人工验收本批后决定**（`library-promotions.json#boundaries.awaiting`）。
`accepted_by_human` 全部为 `false` —— 平台不自认已验收。

### CI-0018 仍受的最后一条硬前置

作品级归属 / 中文译词版本 / 乐谱来源的核验证据仍缺（§六）。
本批以 `literature_based_pending_verification` 明示，未越界宣称已核验。

### CI-0022｜新增（升层状态外挂的观测性残留，OPEN / LOW）

升层状态在登记层契约之外，因此：

1. 只读 `content/library/registry.json` 的使用者**无法**判断某首歌是否已升层；
2. `library-promotions.json` 的完整性**只由平台校验器**保障，不冻结 schema；
3. 后来者可能为「补上这件事」而给冻结的登记记录加字段，反而破坏契约。

已用 `validate-content.js`（升层路径硬校验）与 `regression.js §9.7` 锁住行为，
并保留本 ADR 供查。字段落位是否调整须走内容契约变更流程。

---

## 与其他裁决的关系

| 裁决 | 解决的问题 | 与本裁决的关系 |
|---|---|---|
| ADR-0010 | 曲库 V0.5 两层结构（登记层 / 详情层分离） | 本裁决是「两层之间如何迁移」的规则 |
| ADR-0011（CI-0014 案 a） | 基线作用域：派生索引移出冻结区 | 本批 5 首升层后 `immutable_drift` 仍为 `[]`，是该裁决的又一次实证 |
| ADR-0012（CI-0015 案 a） | 词表契约：登记层词表 ≠ 详情层词表 | 本裁决**继承其硬约束**：`SOURCE_REQUIRED` 不因升层而变成 `PUBLIC_DOMAIN` |
| 本裁决（CI-0018 部分） | 升层判据：锚点来源与升层表达位置 | 仅解决试批 5 首；剩余 40 首待人工验收 |

---

## 结论

圣诗的经文锚点是**这首歌自己的固有属性**，不是某一周的安排；因此可以逐首认定，
且不构成反向选歌。升层是**两层的组合事实**，因此由独立声明文件承载，
不触碰已冻结的登记层契约。本裁决在**零 schema 改动、零基线漂移、
登记层逐字节不变**的前提下，把 5 首选批推进到详情层；剩余 40 首保持原状，
等人工验收。**八维辨识、Song_Relation、S6 / S7、tier 升级与使用决定一概未做。**
