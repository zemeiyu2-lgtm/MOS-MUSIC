# ADR-0009｜讲道音乐生产平台 V1.0 与 Calibration / Baseline 治理

状态：已采纳 ｜ 日期：2026-09-21 ｜ 阶段：V1.0（REAL USE PHASE 起点）

---

## 背景

Phase 2A → 2A.1（模型校准与冻结）→ 2A.2（歌曲辨识 Skill V1.0 冻结）→ 2B（W04 单周试产）
逐步暴露了四类结构性缺口：

- **N1**：冻结技能只输出**歌曲层**裁决，没有**单元层**裁决——"这首歌放进这一周是否仍然成立"
  只能人肉补足。
- **N2**：没有**跨周复用**检查——同一首歌是否已作过主歌、是否可在相邻周复用，被交回人工。
- **N3**：回测的"上游不变"哈希作用域覆盖整个内容目录，导致**新增正常生产内容**必然使该项变为
  CHANGED，把"正常生产"误判为"基线损坏"。
- **C1**：两层裁决（本周适配裁决 vs 歌曲生命周期）容易被合并成一个字段。

同时，W04 起出现**曲库容量枯竭**（5 首已用尽），需要平台能表达"资源不足、交人工裁决"，
而不是悄悄凑数。

---

## 决策

### 1. 建立"讲道音乐生产平台 V1.0"（MODULE 12，浏览器内只读工具）

闭环：`Music Library → Song Discernment → Sermon Week → Song Matching → Unit Production
→ Human Review → Validation → Production Record`。

平台只**识别 / 整理 / 辨识 / 匹配 / 提示 / 记录 / 验收**，不替人做神学判断，不替人选歌。

### 2. 平台引擎与冻结技能分离，一致性由回归强制

- 冻结技能：`~/.workbuddy/skills/mos-music-song-discernment@1.0.0`（Frozen，不得擅改）
- 平台引擎：`app/discernment.js` + `content/production/discernment-lexicon.json`
- 二者是**两份实现**；一致性由 `tools/regression.js` 的 `PARITY_FIELDS` 逐字段对拍，
  分叉即回归失败（CI-0010）。

选择"两份实现 + 对拍"而不是"共享代码"，原因：技能是**用户级、跨项目**资产，
平台是**项目内**资产；技能必须能在没有本平台的环境里独立运行。共享代码会制造隐性耦合，
也会诱使"以平台为准改技能"。

### 3. 引擎用 `.js` 而不是 `.mjs`

平台引擎原为 `.mjs`。CDP 验收暴露出：静态服务器的 MIME 映射表若不含 `.mjs`，
浏览器会拒绝执行（`Failed to fetch dynamically imported module`）。
零构建原生 JS 的部署面（GitHub Pages / 任意静态服务器）无法保证 `.mjs` 的 MIME 正确，
因此**统一改为 `.js`**（从 module script 导入时浏览器按 ES module 解析，与扩展名无关）。

### 4. 词表放 content/，判定逻辑放 app/

`discernment-lexicon.json`（词表、风险触发、S6/S7 规则、严重度映射）属**内容层**：
可审查、可版本化、可人工复核。引擎只消费它。这是 §34 内容/程序分离在平台层的延续。

### 5. Unit-Level Review Gate（N1）必须与歌曲层单向隔离

`unitReviewGate()` 输出 `PASS` / `REVIEW` / `BLOCK`，语义只描述"这一周是否成立"；
**不得反写歌曲记录**。回归套件以不变量
`song_layer_untouched = true` 强制这一点。

### 6. Baseline Scope 分两段（N3）

| 段 | 内容 | 变化时的含义 |
|---|---|---|
| **Immutable Baseline** | Schema、上游模型数据（bible/courses/themes/training/templates/contexts/map/framework）、W01–W04 历史裁决、冻结校准文档、W04 辨识留档、已冻结技能本体与校准用例 | 变化即**失败**（除非经正式批准的版本升级） |
| **Production Content** | `content/production/**`、后续新增周次 | 正常增长，**不判失败** |

### 7. Calibration Issue 系统 + 四段版本治理

发现问题只记录，不自动改冻结。状态：`OPEN OBSERVED REVIEWED ACCEPTED REJECTED FIXED DEFERRED`。
治理阶段：`Frozen → Observed → Proposed → Released`。
技术上硬约束：`Proposed` 出现 `applied_to_frozen` 即判违规，`validate-content` 与回归套件都会失败。

### 8. 库容不足只告警，不凑数

`MUSIC_LIBRARY_CAPACITY_WARNING`：可用（未使用过）歌曲 < 剩余周数即告警。
禁止强行重复、降低标准、自动使用 HIGH 风险歌曲、虚构歌曲、把证据不足歌曲伪装成合格。

---

## 后果

**正面**
- N1/N2/N3/C1 四项缺口在平台层闭合，并有回归强制。
- 平台与技能各司其职，技能仍可独立运行。
- 历史裁决与上游得到机器可验证的保护（immutable drift 必须为空）。
- 真实使用中发现的问题有固定落点，不会污染冻结规则。

**代价 / 限制**
- 双实现需要长期维护对拍（`PARITY_FIELDS`）。
- 平台是只读的：内容落盘仍由人工与工具完成。
- 曲库容量问题（CI-0008 / BLOCKER）**不由平台解决**，只能由人工裁决（H-3）。

---

## 相关文件

- `docs/PLATFORM-V1.0.md`（平台规格）
- `docs/CALIBRATION-ISSUES.md`（问题清单）
- `docs/VERSION-GOVERNANCE.md`（版本治理）
- `docs/MODEL-CALIBRATION-V1.0.md`、`docs/ADR/ADR-0007`（S6/S7 转换层与歌曲边界）
- `docs/ADR/ADR-0008`（歌曲辨识技能）
- `content/production/*.json`（平台数据层）
