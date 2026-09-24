# MOS 讲道音乐生产平台 V1.0｜Calibration Issue 清单

数据源（唯一真相）：`content/production/calibration-issues.json`
程序侧校验：`app/calibration.js`（字段、状态、类别、归属层）
渲染：`#/production?view=calibration`

**纪律**：发现问题不立即修改冻结技能。先记录 → 分类 → 累积 → 复盘 → 形成 V1.1/V1.2。

---

## 1. 字段定义（§十二）

`issue_id · date · week · song · category · description · evidence · current_behavior ·
expected_behavior · severity · workaround · proposed_change · status · target_version`
（另加 `resolution_layer`、`resolved_note` 两个平台扩展字段，不改变上述 14 项语义）

- **status**：`OPEN` `OBSERVED` `REVIEWED` `ACCEPTED` `REJECTED` `FIXED` `DEFERRED`
- **severity**：`BLOCKER` `HIGH` `MEDIUM` `LOW` `INFO`
- **category**：`unit_level_gate` `cross_week_reuse` `baseline_scope` `song_relation`
  `theological_risk` `practice_conversion` `transmission_conversion` `library_capacity`
  `evidence_sufficiency` `two_layer_verdict` `process`
- **resolution_layer**：`platform`（平台层可自行修）｜`skill`（必须先取得批准）｜
  `content`（资源层）｜`process`（人工流程）

---

## 2. 当前清单（22 条）

| Issue | 周 | 类别 | 严重度 | 状态 | 归属层 | 目标版本 | 一句话 |
|---|---|---|---|---|---|---|---|
| CI-0001 | W04 | unit_level_gate | HIGH | FIXED | platform | platform-1.0.0 | 已冻结技能只输出歌曲层裁决，没有单元层裁决（N1） |
| CI-0002 | W04 | cross_week_reuse | HIGH | FIXED | platform | platform-1.0.0 | 技能没有跨周复用检查（N2） |
| CI-0003 | W04 | baseline_scope | MEDIUM | FIXED | platform | platform-1.0.0 | 回测哈希作用域覆盖整个内容目录，正常新增内容即判为基线破坏（N3） |
| CI-0004 | W01 | two_layer_verdict | HIGH | FIXED | platform | platform-1.0.0 | 两层裁决易被合并（歌曲生命周期 vs 本周适配）（C1） |
| CI-0005 | W02 | transmission_conversion | MEDIUM | OBSERVED | platform | platform-1.0.1 | W02 的 S7 缺可验证机制（无互报/复述约定） |
| CI-0006 | W04 | song_relation | HIGH | **OPEN** | process | — | W04 主歌关系等级待人工裁决（H-1） |
| CI-0007 | W04 | process | MEDIUM | **OPEN** | process | — | W04 LQ 跨线配对待人工确认（H-2） |
| CI-0008 | W05 | library_capacity | **BLOCKER** | FIXED | content | library-0.5.0 | 曲库 5 首已用尽，W05 起无未使用歌曲可承担主歌（H-3）→ 已由 V0.5 扩库解决 |
| CI-0009 | W04 | process | MEDIUM | FIXED | platform | platform-1.0.0 | 技能输出不携带歌曲使用历史 |
| CI-0010 | — | process | HIGH | FIXED | platform | platform-1.0.0 | 引擎平台化后与冻结技能存在双实现漂移风险 |
| CI-0011 | — | unit_level_gate | LOW | DEFERRED | skill | skill-1.0.1 | CI-0001 平台侧已修，技能侧仍缺单元层 |
| CI-0012 | — | baseline_scope | LOW | DEFERRED | skill | skill-1.0.1 | CI-0003 平台侧已修，技能侧作用域仍过宽 |
| CI-0013 | — | process | **BLOCKER** | FIXED | content | library-0.5.0 | 45 首候选清单未随指令交付 → 清单已到位并完成登记 |
| CI-0014 | — | baseline_scope | **BLOCKER** | FIXED | process | platform-1.0.1 | 扩库必需的登记文件位于不可变基线内 → 按案 a 关闭 |
| CI-0015 | — | process | HIGH | FIXED | process | platform-1.0.1 | V0.5 版权词表与歌曲详情既有枚举不对齐 → 按案 a 关闭（维度分离、禁止映射） |
| CI-0016 | W05 | library_capacity | HIGH | OBSERVED | content | — | 50 首 ≠ 全年唯一可用（可用 45 < 剩余 48 周，缺口 3） |
| CI-0017 | — | song_relation | HIGH | FIXED | process | platform-1.0.1 | 库级辨识与周级辨识的两级口径未定 → 已固化 `library_scope` |
| CI-0018 | — | process | MEDIUM | **OPEN** | process | — | 两段式完成的判据已定（严格口径），试批 5 首已升层，剩余 40 首待验收 |
| CI-0019 | — | process | MEDIUM | **OPEN** | process | — | 八类权利对象分别核验 vs 资源四槽的粒度不匹配 |
| CI-0020 | — | baseline_scope | LOW | **OPEN** | process | — | 案 a 后主题 Schema 仍有 `song_count` 字段描述待清理 |
| CI-0021 | — | process | LOW | **OPEN** | process | — | 案 a 后 `copyright_status_mapped` 字段名与其新语义不符（命名债） |
| CI-0022 | — | process | LOW | **OPEN** | process | — | 升层状态外挂于登记层契约之外（观测性残留，ADR-0013） |

**统计**：共 22 条 ｜ 已修 11 ｜ 未结案 7（其中 BLOCKER 0）｜ 观察中 2 ｜ 推迟 2。

> 阻断级未结案为 **0**：CI-0008 与 CI-0013 / CI-0014 三个 BLOCKER 均已结案。

---

## 3. 未结案问题（影响后续决定）

### CI-0016（HIGH，资源层）— OBSERVED，保留真实性
曲库扩至 50 首后，可用（未使用过）45 首，而 W05–W52 剩余需求 48 周，缺口 3。
`MUSIC_LIBRARY_CAPACITY_WARNING` **如实保持生效**。

人工裁决：50 首作为 Music Library V0.5 保留，但**不宣布**「已足够全年唯一使用」；
目标下一阶段扩充到约 60 首，本阶段不追加新歌。三条路径（继续扩库 / 明确复用规则 /
缩减年度计划）仍需人工选择，平台不自行决定、不降标准、不为凑数复用。

### CI-0018（MEDIUM，流程层）— 判据已定，试批 5 首已执行，**保持 OPEN**
「50 首入库」是**分层**完成的：5 首有歌曲详情记录，45 首只有入库登记记录。
若把登记记录当作歌曲详情记录使用，会把「未辨识」当成「已入库可用」。

**口径已定**：人工选择**严格口径**（50 首都需要歌曲详情记录）。

**执行的硬前置（四条）**：

1. `bible.core_passage` 是 `song.schema.json#bible` 的必填项且 `additionalProperties: false`，
   无锚点即写不出合法记录；
2. 锚点来源不存在（现有 5 首的锚点靠上游经文登记表里 `sample-validation` 条目进库，
   该表 26 条全部是 24 课/52W 经文中心，不含 45 首所需锚点）；
3. CI-0015（已按案 a 关闭，词表契约不再是障碍）；
4. 冻结技能 §三 要求 `Week_ID / Bible_Passage / Core_Truth / LQ / MM` 为必需输入，
   §二 禁止反向选歌，§十六-5 禁批量 —— 而人工又禁止指定 W05–W52。

**2026-09-21 人工授权解除第 2 与第 4 条的冲突**：

> 「授权你按公版圣诗固有经文依据逐首认定」

锚点是**这首歌自己的固有属性**（圣诗自身歌词所指向的经文依据），不是某一周的安排 ——
因此不构成 §二 所禁止的反向选歌。据此完成**试批 5 首**
（`MUS-S-0006 … MUS-S-0010`）：

| 歌 | 核心经文 | 依据类型 |
|---|---|---|
| MUS-S-0006 圣哉，圣哉，圣哉 | 启4:8–11 | 歌词直引 + 传统主题一致 |
| MUS-S-0007 荣耀归于真神 | 约3:16 | 歌词直引 |
| MUS-S-0008 拥戴我主为王 | 腓2:9–11 | 传统主题一致 + 意象对应 |
| MUS-S-0009 你真伟大 | 诗8:1–9 | 歌词对应 + 默想次序一致 |
| MUS-S-0010 你的信实广大 | 耶哀3:22–23 | 歌词直引 |

**为何仍保持 OPEN**：试批只完成 **5/45**，剩余 **40 首**仍在登记层；
是否沿用同一口径**须人工验收本批后决定**（`accepted_by_human` 全为 `false`）。
另外 §六 的作品级归属 / 中文译词版本 / 乐谱来源核验证据仍缺，
本批以 `literature_based_pending_verification` 明示，未越界宣称已核验。

### CI-0022（LOW，流程层）— 升层状态外挂于登记层契约之外
登记层字段契约位于不可变基线内且 `additionalProperties: false`，
无法容纳「是否已升层」这类生命周期结论。CI-0018 的裁决（ADR-0013）因此把
升层状态外挂为 `content/production/library-promotions.json`。

残留问题：① 只读 `registry.json` 的使用者无法判断某首歌是否已升层；
② 该文件的完整性只由平台校验器保障，不受冻结 schema 约束；
③ 后来者可能为「补上这件事」而给登记记录加字段，反而破坏冻结契约。

已用 `validate-content.js`（升层路径硬校验）与 `regression.js` 第 9.7 段锁住行为，
权威源与理由记录于 ADR-0013。字段落位是否调整须走内容契约变更流程，故保持 OPEN。

### CI-0019（MEDIUM，流程层）
§六 要求把八类权利对象分别核验（原始英文作品 / 中文译词 / 中文编曲 / 五线谱 /
简谱 / 示唱 / 录音 / 伴奏），而歌曲详情的资源槽只有四类，粒度不匹配。

### CI-0020（LOW，基线作用域）
案 a 后 `content/themes/index.json` 不再写 `song_count`，但主题 Schema 里仍有该字段描述，
属描述性遗留，待清理（不影响运行与校验）。

### CI-0021（LOW，流程层）
CI-0015 案 a 裁定「两侧词表禁止互相映射」后，详情层字段名 `copyright_status_mapped`
仍写着 `mapped`，与它现在的语义（独立的法律状态判定槽）不符。后来者可能据名把已废止的
映射逻辑写回代码。已用 `COPYRIGHT_MAP_PROHIBITED` 与单测断言锁住行为，但**字段名本身**
须走内容契约变更（改冻结的 `library-intake.schema.json`）才能修，故保持 OPEN。

### CI-0006 / CI-0007（HIGH / MEDIUM，流程层）
W04 主歌关系等级与 LQ 跨线配对仍待人工确认。V0.5 阶段**未重新裁决** W01–W04。

---

## 4. 已修问题

### 平台层（platform-1.0.0）
- **CI-0001 → N1**：新增 Unit-Level Review Gate（`unitReviewGate`），10 项检查，
  输出 PASS/REVIEW/BLOCK，且**不反写歌曲层**。
- **CI-0002 → N2**：新增 Cross-Week Reuse Check（`crossWeekReuse`），
  显示 previous week / role / previous theme / current theme / reuse status，只提示不否决。
- **CI-0003 → N3**：Baseline Scope 重构为 **Immutable Baseline** 与 **Production Content** 两段。
- **CI-0004 → C1**：两层裁决在 Schema、平台、文档三处同时固化分离。
- **CI-0009**：使用历史由 `tools/build-usage.js` 从周次与单元记录推导（不手工维护）。
- **CI-0010**：引擎与冻结技能的一致性由 `tools/regression.js` 的 `PARITY_FIELDS` 强制逐字段对拍。

### 平台层（platform-1.0.1，V0.5 阶段）
- **CI-0008（BLOCKER）**：曲库容量枯竭 → V0.5 扩库至 50 首后解除「无未使用歌曲」的阻断；
  容量告警仍按 CI-0016 如实保留。
- **CI-0013（BLOCKER）**：候选清单到位，45 首已完成入库登记（RFC4180 解析，
  清单没给的字段一律留空，不代填）。
- **CI-0014（BLOCKER）**：按人工裁定的**案 a** 关闭 —— 主题歌曲计数与歌曲经文锚点
  改为派生索引（`content/production/theme-song-counts.json`、
  `content/production/song-scripture-index.json`），移出 Immutable Baseline；
  上游经文登记表保持冻结、内容未变。实证：曲库 5 → 50，而 `immutable_drift = []`。
  详见 `docs/ADR/ADR-0011`。
- **CI-0015（HIGH）**：按人工裁定的**案 a** 关闭 —— 两侧词表**维度不同，禁止互相映射**。
  详见下一节与 `docs/ADR/ADR-0012`。
- **CI-0017**：两级辨识口径固化为 `library_scope`（无周次 →
  `Song_Relation = not_yet_assessed`、`decision = Research`、S6/S7 不适用、不做风险扫描、
  八维留空、缺失证据逐首列出）。

---

## 5. 技能层待批事项（不得擅改 Frozen）

`content/production/version-governance.json` → `P-SKILL-1.0.1`（status: `pending_human_approval`）：

1. 输出增加单元层摘要，或明确由平台与人工承担（CI-0011）
2. 回测哈希作用域收窄为冻结基线文件集合（CI-0012）
3. 跨周复用检查升级为技能内置提示（当前由平台承担）

**未获人工批准前，绝不改动 `mos-music-song-discernment@1.0.0`。**

---

## 6. 使用方式（进入 REAL USE PHASE 后）

真实使用中发现任何不合，按下列模板追加到 `calibration-issues.json`：

```json
{
  "issue_id": "CI-00NN",
  "date": "2027-01-15",
  "week": "W05",
  "song": "MUS-S-0001",
  "category": "song_relation",
  "description": "……",
  "evidence": "……（可复核的具体依据：文件 / 运行 / 人工判断）",
  "current_behavior": "……",
  "expected_behavior": "……",
  "severity": "MEDIUM",
  "workaround": "……",
  "proposed_change": "……",
  "status": "OPEN",
  "target_version": "platform-1.0.1",
  "resolution_layer": "platform"
}
```

追加后跑 `node tools/validate-content.js`（结构硬检查）与 `node tools/regression.js`（计数一致性）。

---

## 7. V0.5 扩库阶段记录（CI-0013 – CI-0022）与两项案 a 裁决 + 一项人工授权

扩库（5 → 50 首）撞上的问题全部记录在案，**无一条通过修改已冻结技能解决**。

| 编号 | 类别 | 级别 | 内容 | 结论 |
|---|---|---|---|---|
| CI-0013 | process | BLOCKER | 45 首候选清单未随指令交付 | FIXED（清单已到，已完成登记） |
| CI-0014 | baseline_scope | BLOCKER | 扩库必需的登记文件位于不可变基线内 | FIXED（案 a） |
| CI-0015 | process | HIGH | 版权词表与既有枚举不对齐 | FIXED（案 a） |
| CI-0016 | library_capacity | HIGH | 满库 50 首后容量告警不解除 | OBSERVED（保留真实性） |
| CI-0017 | song_relation | HIGH | 库级/周级辨识两级口径未定 | FIXED（固化 `library_scope`） |
| CI-0018 | process | MEDIUM | 两段式完成判据与锚点来源 | OPEN（判据已定；试批 5 首已升层，余 40 首待验收） |
| CI-0019 | process | MEDIUM | 八类权利对象 vs 资源四槽粒度不匹配 | OPEN |
| CI-0020 | baseline_scope | LOW | 主题 Schema 的 `song_count` 描述遗留 | OPEN |
| CI-0021 | process | LOW | `copyright_status_mapped` 命名债 | OPEN |
| CI-0022 | process | LOW | 升层状态外挂于登记层契约之外 | OPEN（ADR-0013 记录权威源） |

### CI-0014 的裁决与执行（案 a）

**裁定**：`content/themes/index.json#song_count` 与歌曲经文锚点生产索引
**属于 Derived / Production Index，不是 Immutable Baseline。**

落地点：

1. 主题歌曲计数改为派生视图 `content/production/theme-song-counts.json`（工具推导）；
2. 歌曲经文锚点改为派生索引 `content/production/song-scripture-index.json` 承载，
   上游 `content/bible/reference-index.json` 保持冻结、内容未变；
3. Immutable Baseline 只冻结真正不可变的对象（已冻结技能 / 冻结校准文档 /
   W01–W04 周次与单元 / Schema 与上游模型数据）；
4. 正常新增歌曲**不再**构成基线漂移，也**不得**通过重生成基线来掩盖真实漂移；
5. `tools/baseline.js` 输出 `scope_change_log`（新增/移除/变化逐文件），
   使「规则性改动」在留档上可与「静默重生成」区分。
   本次记录为 `新增 2｜移除 0｜变化 1`。

**实证**：

| 项 | 结果 |
|---|---|
| 登记新增 | 45 首（MUS-S-0006…0050） |
| 合并曲库 | 50 首（详情 5 + 登记 45） |
| 派生索引 | 主题计数 24 项；经文锚点 50 条（已登记 5 / 待产生 45） |
| `immutable_drift` | **`[]`** |
| W01–W04 历史 | 未改动（回归逐周对拍通过） |
| 冻结技能 | `mos-music-song-discernment@1.0.0` 未改动（8/8 用例 × 25 字段对拍） |

### CI-0015 的裁决与执行（案 a）

**裁定**：两侧词表**维度不同，禁止互相映射**。

| | 登记层词表 | 详情层词表 |
|---|---|---|
| 回答的问题 | 这份资料从哪来、我还要做什么 | 这个作品受不受版权保护、是否已获授权 |
| 维度 | 来源与行动状态 | 法律状态 |
| 取值 | `PUBLIC_DOMAIN` `LICENSED` `USER_PROVIDED` `SOURCE_REQUIRED` `UNKNOWN` | `unknown` `public_domain` `copyrighted` `licensed` `permission_granted` |

关键判定：`SOURCE_REQUIRED` 是**行动**（必须去取得来源），`USER_PROVIDED` 是**来源**
（用户自备）—— 两者都不是法律状态，因此它们**本来就不该有对应值**。
旧实现的 `USER_PROVIDED → permission_granted`、`SOURCE_REQUIRED → unknown` 制造了
错误等价（用户自备 ≠ 已获授权），已被废止。

落地点（**零 schema 改动、零基线漂移**）：

1. `app/library-intake.js` 新增 `LEGAL_STATUS`（详情层法律状态词表，只读引用既有枚举）；
2. 新增 `LEGAL_STATUS_DETERMINATION`：只有 `PUBLIC_DOMAIN` / `LICENSED` 可给出判定值；
3. 新增 `NON_LEGAL_INTAKE_STATUS = ['USER_PROVIDED','SOURCE_REQUIRED']`：
   这两项**永不产生详情层结论**（硬约束）；
4. `mapCopyrightStatus()` 废止，改由 `legalStatusOf()` 承担**独立判定槽**语义
   （未判定一律 `unknown`）；
5. 新增 `COPYRIGHT_MAP_PROHIBITED = true`，配合平台单测断言「禁止映射」这条裁决
   没有被悄悄改回；
6. 详情层字段 `copyright_status_mapped` 的值不变（45 首仍为 `unknown`，即未判定），
   因此**无需重建登记数据**；其字段名遗留问题记入 CI-0021。

**实证**：

| 项 | 结果 |
|---|---|
| 登记层词表 | 保持清单 5 值，未改写 |
| 详情层判定槽 | 45 首一律 `unknown`（未判定），无一条被写成 `permission_granted` |
| schema 改动 | **0** |
| `immutable_drift` | **`[]`** |
| 平台单测 | 新增 5 条断言（含「用户自备 ≠ 已获授权」硬约束） |

### CI-0018 的裁决与执行（2026-09-21 人工授权）＋ CI-0022 新增

**授权**：「按公版圣诗固有经文依据逐首认定」—— 锚点是这首诗**自己的固有属性**
（其歌词所指向的经文依据），与任何周次安排无关，因此**不构成**反向选歌。

**升层表达**：登记层契约冻结（`additionalProperties: false`）⇒ 升层状态不进登记记录，
由 `content/production/library-promotions.json` 单独声明；
合并曲库时被声明的歌曲只按详情层计一次。登记记录**逐字节不变**。

**字段政策（四分，无一项代填）**：
`authorized_determination`（锚点三字段）／`literature_based_pending_verification`
（作者 / 作曲 / 译词，按公版赞美诗学通行记载填入并标注来源）／
`preliminary_pending_acceptance`（主题映射 / 主功能 / 难度）／
`left_empty_not_filled`（八维 / song_relation / S6 / S7 / 使用决定 / tier 升级）。

**试批实证**（`MUS-S-0006 … 0010`，batch=`V0.5-promotion-trial-1`）：

| 项 | 结果 |
|---|---|
| 升层 | 5 首（详情层 5 → **10**） |
| 待升层 | **40**（登记层 45 - 5） |
| 经文锚点索引 | 已登记 10 / 待认定 40 / 其中升层标记 5 |
| `SOURCE_REQUIRED` | **未改**（无一首被写成 `PUBLIC_DOMAIN`） |
| 详情层法律状态 | 5 首全部 `unknown`（未判定） |
| `accepted_by_human` | **全部 `false`** —— 平台不自认已验收 |
| schema 改动 | **0** |
| `immutable_drift` | **`[]`** |
| 冻结技能 / W01–W04 / 52W·LQ·MM | 未改动 |
| W05–W52 | 未生成（未指派任何周次） |

**CI-0018 保持 OPEN**：剩余 40 首是否沿用同一口径，须人工验收本批后决定。
**CI-0022 新增（LOW / OPEN）**：升层状态外挂于登记层契约之外 ——
只读 `registry.json` 读不出升层状态；权威源是 `library-promotions.json`，
由校验器与回归第 9.7 段锁住，防止有人反而给冻结记录加字段。
详见 `docs/ADR/ADR-0013-hymn-anchor-determination-and-promotion-path.md`。

---

## 8. V0.5 阶段结论

- **CI-0013 关闭**：清单到位，登记完成。
- **CI-0014 按案 a 关闭**：派生索引移出不可变基线，正常扩库零漂移。
- **CI-0015 按案 a 关闭**：版权词表维度分离、禁止映射，零 schema 改动。
- **CI-0018 部分推进（保持 OPEN）**：判据已定（严格口径）＋人工授权锚点逐首认定
  ⇒ 试批 5 首升入详情层（零 schema 改动、登记层逐字节不变）；
  剩余 40 首待人工验收，`accepted_by_human` 全为 `false`。
- **CI-0022 新增（OPEN）**：升层状态外挂的观测性残留（ADR-0013 记录权威源）。
- **CI-0016 保持 OPEN/OBSERVED**：50 首完成 V0.5，但全年唯一可用容量仍不足；
  目标下一阶段扩充至约 60 首，本阶段不再追加歌曲。
- 复用政策继续沿用 V1.0 `reuse_review`：允许复用、不自动放行、不自动否决、
  不降低神学标准、不因容量压力强制选歌。
- 阻断级未结案：**0**。剩余 OPEN 项（CI-0018/0019/0020/0021/0022 与 H-1/H-2）均为
  判据、粒度、观测性与命名问题，不影响本阶段结论，等待下一阶段人工决定。

---

## 9. V3.0 单曲完整单元标准层（CI-0025 – CI-0027）

**背景**：V3.0 把「一首歌成为可学、可视唱、可教、可传的完整单元」落成标准层
（18 段模型 + 派生等级 L1–L4 + 教学十步法 / 三模式 + 光标跟随 + 四级学习者状态），
并把「视频/乐器/周次绑定」等旧假设移除。本阶段**新增三项校准问题**，均为**待人工裁决**，
不影响本阶段技术结论。详见 `docs/ADR/ADR-0017-single-song-unit-standard-layer.md`。

**CI-0025 新增（LOW / OPEN）— 简谱记谱细则未定**
V3.0 只定义了「记谱要素清单」（调号 / 拍号 / 小节 / 时值 / 高低音点 / 附点 / 延音 / 休止 / 升降号 / 歌词对齐），
**未定细则**：延音线跨小节的写法、附点与连音的边界、一段谱对多段歌词的书写规则。
→ 待人工确认后写入 `MOS-SONG-PRODUCTION-TEMPLATE` V1.1（**不改 schema**）。
当前影响：无（详情层 10 首 `score` 全为 `NOT_PROVIDED`，尚未产生真实记谱）。

**CI-0026 新增（MEDIUM / OPEN）— 前台「淡化周次」与后台「保留 Week Music」双轨**
前台已按本阶段要求**淡化与 52 周经文 / 课程的绑定**（歌曲页、首页不再以周次组织）；
但后台仍保留 Week Music 页（`#/week/WNN`）与年度单元（W01–W04 冻结）。
→ 双轨是否需要在下一阶段调整后台入口定位（保留 / 改写 / 迁入研究视图），须人工裁决。
**未擅自改动任何冻结内容**。

**CI-0027 新增（LOW / OPEN）— 资源与音频技术规格未定**
「统一格式」目前只落在**结构层**（段与字段统一）；**技术规格未定**：
简谱渲染输出形态（内置 SVG/HTML 而非图片）、音频容器与编码、响度归一与时长上限。
→ 待资源**实际入库前**确认，避免入库后返工。

**本阶段未结案复核**：CI-0023 / CI-0024（展示层词表与精选层约定，见 ADR-0014/0015）保持 OPEN/OBSERVED；
CI-0016 / CI-0018 / CI-0019 / CI-0020 / CI-0021 / CI-0022 状态不变。
**阻断级未结案：0**。

---

## PILOT 10 新增（2026-09-22）

**CI-0028 新增（MEDIUM / OPEN）— 歌词语言口径：中文译本权利**
PILOT 10 只能托管**公版英文原文**（0001–0005 已结构化入包）；常见中文译本各有版权方。
→ **中文歌样板当前不可生产，阻断在译本权利而非生产链**。需人工逐首决定授权路径
（取得译本授权 / 人工提供自有译文 USER_PROVIDED / 委托新译并登记权属）。

**CI-0029 新增（LOW / OPEN）— 简谱草稿的人工校对流程**
0001 已有 10 小节 DRAFT 转写（verified_measures 空）。需定义「校对通过」的操作标准
（对照源 / 签核人 / verified_measures 回填格式）。通过并置 VERIFIED 后，工具自动把
单元 score 置 PROVIDED、等级随之派生 L1 —— 派生逻辑无需改动。

**本轮边界**：0006–0010 权利未判定 ⇒ 全部资源 NOT_AVAILABLE（不推定、不虚构）；
音频全 NOT_AVAILABLE（无真人录音，禁 AI 歌声冒充）；时间轴全 SYNC_NOT_READY（不插值）。
**阻断级未结案：0**。当前 OPEN：CI-0016/0018–0029（均非阻断）。

---

## V3.x 新增（2026-09-23）

**CI-0030 新增（MEDIUM / OPEN）— 外部真人示唱版本的复用授权与署名口径**
V3.x §六/§七 采用 Reuse First（`source_url` + `start/end` + `phrase_id`，原站播放 / 嵌入 /
时间段定位，**不下载不转存**）。但「站外嵌入是否需平台方授权」「如何署名（作者 / 演唱者 /
来源站）」「离线时如何降级呈现」均未定案 → **在首次导入任何外部真人资源前必须先定规则**。
本轮无任何外部资源（`human_male` / `human_female` 全部 `UNSURVEYED`），故无实际授权问题暴露。

**CI-0031 新增（MEDIUM / OPEN）— Singing Coach 音频上传接口的隐私口径**
接口本轮保持 `RESERVED_NOT_CONNECTED`（只在客户端本地保存并回听，**无任何上传**）。
正式接入后端或对象存储前，必须先定义**用户同意 / 保留期限 / 删除方式 / 最小化采集**四项，
并与代码同批交付；否则不得打开上传。

**CI-0032 新增（LOW / OPEN）— 100 首外部资源检索未执行**
按停止条件「先普查再生产」，本轮不执行外部检索，普查表因此有 **495 项 `UNSURVEYED`**
（外部真人 / 钢琴 / 教学 / 其余简谱），来源字段一律留空（校验器与 guard 硬检查禁止
`UNSURVEYED` 携带来源）。需下一阶段单独立项后才执行 Reuse First 检索。

**本轮边界**：不开始制作 100 首实际资源；不生成 AI 歌声；不代替人工听校 / 不代替人工定版权结论；
不下载 / 不转存任何外部资源；Coach 不读门训数据、不评分、不排名、不评属灵。
**阻断级未结案：0**。当前 OPEN 共 15 条（CI-0016/0018–0032 中的 OPEN 项，均非阻断）。
