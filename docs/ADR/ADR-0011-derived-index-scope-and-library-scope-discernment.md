# ADR-0011｜派生索引移出不可变基线（案 a）与库级歌基层辨识固化

状态：已采纳（人工裁决）｜日期：2026-09-21｜阶段：V0.5 第二段执行

---

## 背景

V0.5 第一段（登记层）已完成：45 首新增候选登记，曲库合并为 50 首。
推进时撞上 ADR-0010 记录的阻断 **CI-0014**：

> 扩库会强制修改两个位于 Immutable Baseline 内的文件 ——
> `content/themes/index.json` 的 `song_count`、`content/bible/reference-index.json` 的经文登记。
> 于是「正常扩库」必然产出 `immutable_drift ≠ 0`。

即：**一个按规则正常发生的生产活动，被基线机制判成了破坏冻结对象。**
问题不在扩库，在基线作用域过宽（CI-0003 / N3 的同类缺陷）。

同时，指令明确要求「不得进入 W05–W52」「不生成新的周次 Unit」，
但要求「对新增候选运行已冻结的技能并保存 Song-level results」。
这两条并存，就必须先回答：没有周次上下文时，冻结技能的 S1→S7 到底能产出什么。

---

## 决策 1｜采纳案 a：派生索引与不可变基线的边界重划

**Immutable Baseline 只冻结真正不可变的对象：**

| 冻结对象 | 理由 |
|---|---|
| 已冻结技能（`mos-music-song-discernment@1.0.0` 8 个文件） | 版本治理要求：改动须走版本流程 |
| 冻结校准文档（`docs/MODEL-CALIBRATION-V1.0.md` 等） | 是「已发生过的裁决」的留档，不是活文档 |
| W01–W04 周次与单元记录 | 真实产出历史，只能追加不能改写 |
| Schema 与上游模型数据（`content/schema/**`、`content/courses/**`、`content/framework/**`、52W 经文中枢） | 核心规则与上游模型 |

**从冻结区移出，改为 Derived / Production Index：**

| 移出项 | 新载体 | 权威源 |
|---|---|---|
| 主题歌曲计数（原 `content/themes/index.json#song_count`） | `content/production/theme-song-counts.json` | 曲库本身（详情层 `discipleship.main_theme`） |
| 歌曲经文锚点索引（原需写入 `content/bible/reference-index.json`） | `content/production/song-scripture-index.json` | 曲库本身（详情层 `bible.core_passage`） |

改动约束（防止「案 a」被用成掩盖漂移的借口）：

1. 派生索引文件必须显式声明 `derived: true`；
2. 派生索引由工具从实际数据推导，**只读曲库，绝不写入冻结文件**；
3. 不可变基线**不再收录** `content/production/**` 与 `content/library/**`；
4. 基线重建时记录 `scope_change_log`（新增 / 移除 / 变化三类逐文件列出），
   使「规则性改动」与「静默重生成基线」在留档上可区分；
5. 上游经文登记表 `content/bible/reference-index.json` **内容不变、保持冻结** ——
   只是歌曲锚点不再需要写进去。

### 归因说明（诚实记账）

`content/themes/index.json` 的哈希在本次发生过**一次性变化**（移除 `song_count` 字段）。
这是案 a 的规则性改动，不是「重生成基线把真实变更洗成零漂移」。
判定依据：`baseline.js` 输出 `scope_change_log`，本次记录为
`新增 2｜移除 0｜变化 1`（CHANGED `content/themes/index.json`；ADDED 两份新 Schema），
变更原因可逐条回溯。此后正常扩库不再触碰任何冻结文件。

### 实证

| 指标 | 结果 |
|---|---|
| 新增登记 | 45 首（MUS-S-0006…0050） |
| 合并曲库 | 50 首（详情 5 + 登记 45） |
| 派生索引变化 | 主题计数 24 项、经文锚点 50 条（已登记 5 / 待产生 45） |
| Immutable Baseline 漂移 | **`immutable_drift = []`** |

---

## 决策 2｜库级歌基层辨识（`library_scope`）的产出边界

冻结技能 §三 规定输入至少需要周次上下文（经文 / 核心真理 / LQ / MM / 功能）。
本阶段不进 W05–W52，因此**没有**周次上下文。按技能 §三与 §十五的处理原则：

> 缺失输入一律：停止 → 报资料不足，不得臆测。

于是确立 `library_scope` 这一范围，并固化其字段边界：

| 字段 | 库级取值 | 理由 |
|---|---|---|
| `scope` | `library_scope` | 与 `week_scope` 显式区分，不与周辨识混算 |
| `song_relation` | `not_yet_assessed` | Song_Relation 是**周相对**字段，无周次即不可判定 |
| `decision` | `Research` | 资料不完整（技能 §十五），不得升格为 `Core Candidate` |
| `s6` / `s7` | `null` | S6 实践转换 / S7 传递转换属**单元层**，本阶段不生成 Unit |
| `risk_scan` | `not_applied` | 无标签证据时不做风险扫描，避免把「缺证据」误报成「神学风险」 |
| `eight_dimensions` | 全部 `score = null` | 不给推测分 |
| `missing_evidence` | 逐首列出缺什么 | 报资料不足的具体形态，而不是一句「不通过」 |
| `song_is_complete_unit` | `false` | 歌曲层 ≠ 完整门训单元（ADR-0007 边界） |

覆盖：45 首新增候选全部产出 Song-level results 并落盘
（`content/production/song-discernment-v0.5.json`）。
MUS-S-0001…0005 **不重新裁决** —— 其结论仍为 W01–W04 的冻结运行留档。

---

## 决策 3｜容量与复用（沿用人工裁决，不改标准）

- **CI-0016 保持 OPEN/OBSERVED**：50 首 = V0.5 第一阶段完成，
  **不宣布**「已足够全年唯一使用」。可用 45 首 < 剩余 48 周，缺口 3，
  `MUSIC_LIBRARY_CAPACITY_WARNING` 如实保持生效。目标下一阶段扩充至约 60 首，
  本阶段不追加新歌。
- **复用政策保持 V1.0 `reuse_review`**：允许复用、不自动放行、不自动否决、
  不因容量压力降低神学标准、不为了填满 52 周而凑数。
- 三条路径（继续扩库 / 明确复用规则 / 缩减年度计划）仍待人工选择，平台不自行决定。

---

## 决策 4｜命名与硬检查的一致性（不改检查，只改命名）

`content/**` 的 §34 硬检查会拒绝任何出现代码形态的内容文件，其中包含**小写独立词 `import`**。
V0.5 引入的入库模块路径本身带 `import` 字样，被该检查命中。

处理方式：**修改命名，而不是削弱硬检查**。

| 原名 | 新名 |
|---|---|
| `tools/import-library.js` | `tools/library-intake.js` |
| `app/library-import.js` | `app/library-intake.js` |
| `docs/LIBRARY-V0.5-IMPORT.md` | `docs/LIBRARY-V0.5-INTAKE.md` |

理由：§34 的目的是保证内容层是纯数据。让程序侧命名避开内容层禁词，
比给检查加例外更安全 —— 例外一旦打开，就无法再保证内容层不含代码。

---

## 后果

**正面**

- 正常扩库不再被误判为基线破坏：`immutable_drift = []` 与「曲库 5 → 50」可以同时成立。
- 「派生」与「冻结」在机制上分开：派生索引可随数据增长，冻结对象只能走版本流程。
- 库级辨识有明确产出边界，「没有周次就不能判周相对的字段」成为可校验规则，
  而不是靠使用者自觉。
- 回归套件新增第 9 段（约 30 项检查）把上述边界全部固化为断言。

**代价 / 未决**

- 歌曲详情层（第二段）仍需人工批准后才启动：登记层 → 详情层不是自动升级。
- 登记层 45 首全部 `copyright_status = SOURCE_REQUIRED`：
  只完成候选登记，未取得可核验的作品级版权证据前不改为 `PUBLIC_DOMAIN`（CI-0019 相关）。
- 满库 50 首后容量告警仍不解除（CI-0016）。

---

## 参见

- `docs/ADR/ADR-0010-music-library-v0.5-intake-layer.md`（登记层与辨识层分离）
- `docs/ADR/ADR-0009-sermon-music-production-platform.md`（平台 V1.0 与 N3 两段化）
- `content/production/baseline-immutable.json`（`derived_scope` / `derived_rule` / `scope_change_log`）
- `content/production/song-discernment-v0.5.json`（库级辨识留档）
- `content/production/calibration-issues.json`（CI-0013 / CI-0014 / CI-0016 / CI-0017 等）
