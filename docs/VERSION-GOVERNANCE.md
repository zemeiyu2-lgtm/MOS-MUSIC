# MOS 讲道音乐生产平台 V1.0｜版本治理

数据源：`content/production/version-governance.json`
程序侧校验：`app/calibration.js#governanceView`、`tools/validate-content.js#checkProductionPlatform`

---

## 1. 四段阶段

```text
Frozen     核心规则与已经审核确认的生产结果（不得擅自改动）
   ↓
Observed   实际使用发现的问题（只记录）
   ↓
Proposed   建议修改（必须写明 requires 前置条件）
   ↓
Released   正式进入下一版本（取得人工批准后）
```

**唯一禁止**：发现问题 → 自动修改 Frozen 技能。
技术上也做了硬约束：`Proposed` 记录若出现 `status: "applied_to_frozen"`，
`validate-content.js` 与 `governanceView()` 都会判为违规，回归套件直接失败。

---

## 2. Frozen 段（当前）

| 项 | 值 |
|---|---|
| Skill ID | `mos-music-song-discernment` |
| 版本 | `1.0.0` |
| 状态 | `Frozen`（冻结于 2026-09-21） |
| 技能路径 | `~/.workbuddy/skills/mos-music-song-discernment/` |
| 冻结校准 | `docs/MODEL-CALIBRATION-V1.0.md` |
| 历史裁决 | `2027-W01` `2027-W02` `2027-W03` `2027-W04` |

Frozen 项（逐条禁止改动）：

1. 七步法（读→明→唱→记→感→行→传，**不加第八步**）
2. S6 = 实践转换层；S7 = 传递转换层
3. 歌曲 ≠ 完整门训单元（歌曲 + S6 具体行动设计 = 音乐进入生命实践）
4. `tier`（资源等级）与 `review_status`（生命周期）为两个独立字段
5. 两层裁决分离：本周适配裁决 ≠ 歌曲生命周期
6. W01–W04 历史裁决（不得追溯修改）

---

## 3. 版本号规则

| 对象 | 当前 | 允许的下一步 | 说明 |
|---|---|---|---|
| Frozen 技能 | `1.0.0` | `1.0.1`（校准）→ 取得批准后 | **不得直接跳 2.0** |
| 生产平台 | `3.0.0` | `3.0.1` / `3.1.0` | 平台层问题可自行修，但仍须登记 Calibration Issue |
| 内容版本 | `MUS-V-0.8.0` | 递增 | 内容结构变化即递增（程序侧 `CONTENT_VERSION`） |
| SW 缓存 | `mos-music-v10` | 递增整数 | 每次外壳/预缓存清单变化即换代 |
| 不可变基线 | `MUS-V-0.5.0` | 由 `tools/baseline.js` 重生成 | 仅当冻结对象**经正式批准**变化时方可重生成 |
| 派生索引 | `MUS-V-0.8.0` | 随曲库/单元自动重算 | **不属于**不可变基线（CI-0014 案 a）；见 ADR-0011、ADR-0017 |

---

## 4. Proposed 段（当前，等待人工批准）

### P-SKILL-1.0.1 → `mos-music-song-discernment@1.0.1`
- 输出增加单元层摘要，或在文档中明确"单元层由平台与人工负责"（对应 CI-0011）
- 回测哈希作用域收窄为冻结基线文件集合（对应 CI-0012）
- 跨周复用检查升级为技能内置提示（当前由平台承担）
- requires：人工批准。未获批准前不得改动 Frozen 技能，平台也不得代其变更判定。

### P-LIBRARY-1.0.0 → `library-1.1.0`
- 扩库：新增经完整辨识的公版歌曲，使可用歌曲数 ≥ 剩余周数
- 或授权有限复用规则（例如同一首歌不得在相邻 4 周内重复作主歌）
- 或缩减年度计划范围（明确本年度只生产至第 N 周）
- requires：人工裁决（H-3）。三条路径平台都支持，但均需明确授权。

---

## 5. Released 段（当前）

### platform-1.0.1 ｜ Music Library V0.5（50 首入库）+ 派生索引作用域修正 ｜ 2026-09-21

范围：曲库 5 → 50 首（登记层 45 首）／入库登记层（`content/library/`）／
派生索引（主题歌曲计数 / 歌曲经文锚点）／库级歌基层辨识（`library_scope`）／
**CI-0014 案 a**（派生索引移出不可变基线）／回归套件第 9 段（曲库 V0.5 与派生索引）

验收：

| 门 | 结果 |
|---|---|
| validate-content | PASS 0 errors / 0 warnings（17 程序文件 + 93 内容文件） |
| smoke | ALL PASS 178 / 0 |
| platform unit tests | ALL PASS 83 / 0 |
| regression | ALL PASS 51 / 51（**immutable_drift = []**） |
| 派生索引一致性 | 通过（`derive-indexes.js --check` / `song-discernment.js --check`） |
| CDP | ALL PASS 65 / 0 |
| PWA offline cold-start | PASS（含派生索引离线可读） |

未做（按裁决保留）：W05–W52 未生成；未指定任何未来周次；容量告警仍生效（CI-0016）。
（升层在发布时点未启动；后经人工授权于同日完成 5 首试批，见下一节。）

### MUS-V-0.5.0（内容层追加）｜ 曲库升层试批 `V0.5-promotion-trial-1` ｜ 2026-09-21

人工授权：「按公版圣诗固有经文依据逐首认定」（CI-0018 / ADR-0013）。

范围：`content/production/song-anchor-determinations.json`（锚点认定留档）／
`content/production/library-promotions.json`（独立升层声明，登记层契约冻结不下加字段）／
歌曲详情记录 `MUS-S-0006…0010`（详情层 5 → **10**）／升层路径硬校验与回归第 9.7 段。

**未做（按裁决保留）**：剩余 40 首未升层（须人工验收试批后决定）；`accepted_by_human` 全为 `false`；
未做八维辨识、未升 tier、未指派任何周次；`SOURCE_REQUIRED` 未改、法律状态全部 `unknown`；
歌词 / 歌谱 / 示唱 / 伴奏未收录。

验收：

| 门 | 结果 |
|---|---|
| validate-content | PASS 0 errors / 0 warnings（17 程序文件 + 100 内容文件） |
| smoke | ALL PASS 188 / 0 |
| platform unit tests | ALL PASS 86 / 0 |
| regression | ALL PASS 57 / 57（**immutable_drift = []**） |
| 派生索引一致性 | 通过（锚点 50 条：已登记 10 / 待认定 40） |
| 扩库守卫 | GUARD PASS（详情 10/50，登记 45 条，待升层 40） |
| CDP + PWA 离线冷启动 | ALL PASS 66 / 0（含升层声明与认定留档离线可读） |

关键性质：**零 schema 改动、零基线漂移、登记层逐字节不变**。

### platform-1.1.0 / MUS-V-0.6.0 ｜ V1.1-A 真实使用第一轮完善 ｜ 2026-09-21

ADR-0014。目标不是重构，而是把「生产工具」完善为讲员 / 敬拜同工 / 研究者日常可用的工作平台。

范围：**Song Detail 页**（`#/song/MUS-S-NNNN`，八段档案：01 基本资料 → 02 Bible Anchor
（固定「Anchor ≠ sermon selection」）→ 03 主题映射（preliminary / discerned 分开）→
04 辨识（NOT_ASSESSED 明示）→ 05 人工审查 → 06 使用历史 → 07 资源（NOT_IMPORTED）→ 08 版权；
登记层-only 歌曲如实呈现）／**Song Resources 层**（`content/song-resources/index.json` +
`content/schema/song-resource.schema.json` + `app/song-resources.js`；六类槽位，
当前 0 条资源记录，`file_url` 强制 null，不虚构）／**Week Music 页**（`#/week/WNN`，
W01–W04 + Resource Access（RESOURCE_PENDING）；W05+ 如实空态）／
**Human Review 记录层**（`content/production/review-records.json` 0 条 +
`content/schema/review-record.schema.json`；ACCEPT/REVISE/HOLD/REJECT 人工写入，
不反写任何裁决）／**Dashboard 七项指标**／**双端曲库搜索**（ID / 中文 / 英文）。

**未做（按裁决保留）**：W05–W52；自动升层剩余 40 首；AI 推荐 / 自动选歌 / 自动示唱 / 自动作曲；
云同步 / 用户系统；资源实际文件导入（只建资源层结构）。

验收：

| 门 | 结果 |
|---|---|
| validate-content | PASS 0 errors / 0 warnings（20 程序文件 + 104 内容文件） |
| smoke | ALL PASS 216 / 0 |
| platform unit tests | ALL PASS 94 / 0 |
| regression | ALL PASS 64 / 64（**immutable_drift = []**） |
| 派生索引一致性 | 通过（derive / song-discernment / library-intake guard） |
| CDP + PWA 离线冷启动 | ALL PASS 88 / 0（含歌曲详情八段 / 周音乐 / 人工审查 / 搜索） |

关键性质：**向后兼容**（Frozen Skill、W01–W04、2027 52W、LQ、MM、V0.5 曲库、现有 Calibration、
V1.0 数据结构、regression baseline 全部未改）；展示层状态词已登记 CI-0023（LOW/OBSERVED）。

### platform-3.0.0 / MUS-V-0.8.0 ｜ 单曲完整单元标准层 ｜ 2026-09-21

- 标准层（新）：`docs/standards/MOS-SONG-TEACHING-METHOD-V1.0.md`（教学法）、
  `MOS-SONG-PRODUCTION-TEMPLATE-V1.0.md`（18 段模板 + L1–L4）、
  `MOS-SONG-PRODUCTION-WORKSHEET-V1.0.md`（STEP00–15 工作单）。ADR-0017。
- 内容层（新）：`content/song-units/index.json`（18 段 / 11 状态 / 十步 / 三模式 / 四级状态词表）、
  `content/song-units/MUS-SU-0001…0010.json`（10 个单元包）、
  `content/schema/song-unit.schema.json`（`additionalProperties:false` 防漂移）。
  派生层 `content/production/song-unit-levels.json` 与 `song-worksheets.json`。
- 程序层：`app/song-unit.js`（派生等级 + 状态机一致性）、
  `app/front/score.js`（简谱渲染 + 光标跟随，只按真实标记）、
  `app/front/review.js`（四级状态 + Day0·2·7）、`app/front/pulse.js`（真实节拍器）、
  `app/front/player.js`（多轨 + 单句循环 + 精确 seek）、前台五页重构 + `app/ui/v30.css`。
- 工具：`tools/song-units.js`（构建/核对）、`tools/song-worksheet.js`（工作单）；
  校验器新增 V3.0 硬检查（18 段 / 派生等级 / 状态机 / 禁评分排名徽章 / 禁虚构资源 / 时间轴单调 /
  标准文档存在）；SW 升 `mos-music-v10`。
- 校准：新增 CI-0025（记谱细则）/ CI-0026（前台淡化周次 vs 后台 Week Music 双轨）/ CI-0027（资源技术规格）。
- 验收：validate 0/0｜smoke 305/305｜platform-tests 94/94｜regression 70/70 `immutable_drift=[]`｜
  song-units/song-worksheet `--check` 通过｜CDP 121/121（含 V3.0 断言与离线冷启动）。
- 边界：Song Core Record（`content/songs/**`）与全部冻结研究数据**逐字节不变**；
  只做简谱、只做钢琴；淡化周次绑定。

### platform-2.1.0 ｜ MOS 生命诗歌软件 V2.1（艺术化 UI）｜ 2026-09-21

- 设计系统 `app/ui/v21.css`：Design Tokens（含 Lyrics 字阶）、柔和金强调、**深夜沉浸模式**
  （data-mood，偏好存 IndexedDB user_prefs，不使用 localStorage）、轻动效、统一状态样式。
- 系列化艺术封面 `app/front/covers.js`：纯 SVG 抽象视觉，按歌曲确定性变体 + 内容层主题取色，
  程序零主题词（validate 硬检查）。
- 统一 MusicPlayer `app/front/player.js`：play/pause/seek（role=slider）/速度 0.5·0.75·1.0/循环/
  资源槽位/当前句回调；首页·歌曲页·学唱·教唱共用；无资源「尚未提供」优雅降级，绝不模拟播放。
- 页面重构：首页 Hero Card（今天一起唱 + 今天只学一节 + 唱歌理由轮换）、歌曲本大小卡片混合、
  歌曲页九段（歌词为视觉中心、点击选句、教·传轻入口）、Learn/Teach 大舞台卡片 + 五步全标签进度、
  Mine 个人音乐空间。ADR-0016。
- 验收：validate 0/0（31 程序 + 105 内容）｜smoke 250/250｜platform-tests 94/94｜
  regression 70/70 immutable_drift=[]｜CDP 113/113（含视口与离线冷启动）。
- 边界：研究数据零改动（Frozen Skill / W01–W04 / 候选库 100 首 / 升层试批 / Calibration 逐字节不变）。

### platform-2.0.0 / MUS-V-0.7.0 ｜ MOS 生命诗歌软件 V2.0 ｜ 2026-09-21

- 前台重构：底部导航三入口（首页「今天一起唱」/ 歌曲「生命诗歌本」/ 我的）；
  歌曲页一页解决（唱/懂/活/教/传）；学唱五步 / 教唱五步 / 真实分享 URL；
  我的歌（IndexedDB my_songs，无积分无排行榜）。ADR-0015。
- 100 首目标候选库：content/candidates/index.json（NOT_YET_ASSESSED / SOURCE_REQUIRED /
  provisional 初分类 / 无排序字段）；MUS-S-0051…0100 仅候选层，不自动登记不自动升层。
- 后台全部保留：生产 / 人工审查 / 曲库管理 / Calibration / 研究档案（#/song-detail/）/ 周音乐。
- 验收：validate 0/0（含 V2.0 硬检查）｜smoke 243/243｜platform-tests 94/94｜regression 70/70
  immutable_drift=[]｜CDP 106/106（含 360/390/430/1366 视口与离线冷启动）。
- 新增 CI-0024（LOW/OBSERVED）：前台精选轮换与 front_tags 初分类为展示层约定。
- 边界：Frozen Skill / W01–W04 / 既有裁决未改；W05 未生产；剩余 40 首未升层；资源 0 条不虚构。

### platform-1.0.0 ｜ MOS Sermon Music Production Platform V1.0 ｜ 2026-09-21

范围：Music Library（含使用历史与风险记录）／Song Discernment Engine（平台化，与冻结技能判定一致）／
Sermon Week · Song Matching · Unit Production（生产计划器）／Unit-Level Review Gate（N1）／
Cross-Week Reuse Check（N2）／Baseline Scope 修正（N3）／Calibration Issue 系统与版本治理／
Production Dashboard／Regression Suite（W01–W04）

验收：

| 门 | 结果 |
|---|---|
| validate-content | PASS 0 errors / 0 warnings（16 程序文件 + 84 内容文件） |
| smoke | ALL PASS 147 / 0 |
| platform unit tests | ALL PASS 55 / 0 |
| regression | PASS 27 / 27（immutable_drift = 空） |
| CDP | ALL PASS 56 / 0 |
| PWA offline cold-start | PASS |

---

## 6. 升级动作清单（每次发布照此执行）

```bash
node tools/build-usage.js       # 使用历史随内容变化重建
node tools/derive-indexes.js    # 派生索引随曲库重建（案 a：不属于基线）
node tools/derive-indexes.js --check  # 派生索引与曲库一致性
node tools/song-discernment.js  # 库级歌基层辨识（library_scope）结果落档
node tools/library-report.js    # 入库报告 + 容量重算 + 升层试批段
node tools/song-units.js        # V3.0 单曲单元包 + 派生等级表（--check 只校验）
node tools/song-worksheet.js    # V3.0 单曲生产工作单（--check 只校验）
node tools/baseline.js          # 基线清单（仅冻结对象变化时才需要）
node tools/validate-content.js  # 静态硬检查
node tests/smoke.js             # 结构与接线
node tools/platform-tests.js    # 核心模块单元测试
node tools/regression.js --emit # W01–W04 回归 + 一致性 + 落档
node tools/cdp-verify.js        # 端到端 + 离线冷启动
```

全部为 0 失败，才可更新 `version-governance.json` 的 `released` 段。

> **案 a 纪律**：`tools/baseline.js` 只在冻结对象经**正式批准**变化时才运行。
> 派生索引（`theme-song-counts` / `song-scripture-index` / `library-usage` /
> `song-discernment-v0.5`）由 `derive-indexes.js` 维护，永不进入不可变基线。

---

## V3.x（2026-09-23）｜content `MUS-V-1.0.0` / 平台 `3.1.0` / SW `mos-music-v12`

本轮为**产品方向冻结 + 生产基础升级**（ADR-0018…0021），非新增业务架构。

新增工具（全部支持 `--check`）：

```bash
node tools/taxonomy.js                # 四维分类构建 / 核对（多归属不得退化为单选）
node tools/song-content.js            # 歌曲内容层构建 / 核对（六字段 · 不绑周次课程）
node tools/song-resource-discovery.js # 100 首资源普查（--report 输出文本报告）
node tools/guard.js                   # 边界守护 10 项（前台术语 / AI 冒充 / Coach 越界 / 分类多归属）
```

全部为 0 失败，才可更新 `version-governance.json` 的 `released` 段。

> **V3.x 纪律**：
> 1. 外部检索未执行时 `source_url` 必须为 `null`（`UNSURVEYED` 不得携带来源）；
> 2. 外部真人版本一律原站播放 / 嵌入 / 时间段定位，**不下载 / 不转存**；
> 3. AI 示唱为独立可选轨，**永不进入真人槽位、不参与等级派生**，前台必须标注「非真人」；
> 4. Singing Coach 与 MOS Formation 互不评分、互不推导（不读课程完成度 / 积分 / 成绩 / 周次）；
> 5. 本轮**不开始制作 100 首实际资源**（先普查再生产）。
