# MOS-MUSIC｜项目架构（Project Architecture）

Version: V3.x ｜ 内容版本 `MUS-V-1.0.0` ｜ 平台 `3.1.0` ｜ SW `mos-music-v12` ｜ 状态：已实现并通过全门验证

## 1. 定位

> **V3.x 正式冻结（ADR-0018）**：
> **MOS Music 是独立的音乐学习、歌唱训练、教唱与生命形成系统。**
> 不以 52 周经文 / 门训课程 / 讲章为组织中心；**歌曲自身可以独立成立**；
> 课程可以引用音乐，音乐也可以被课程引用 —— **两者相连，但互不从属**。
> **前台不突出 W01/W02/W03……；后台保留历史引用关系，且不得删除。**

MOS-MUSIC 是**音乐门徒训练形成系统**（Mobile + Desktop + Offline-First PWA）。
核心公式（Phase 2A.1 校准）：真理 × 音乐 × 共同体 × 实践 = 门徒形成
（正式表达：Truth → Music → Memory → Emotion → **Practice(S6)** → **Transmission(S7)** → Formation）。
核心流程：**读 → 明 → 唱 → 记 → 感 → 行 → 传**（七步，唯一核心音乐门训流程；不加第八步）。

Phase 2A.1 冻结（详见 docs/MODEL-CALIBRATION-V1.0.md）：
- **S6 = 实践转换层**（Practice Conversion Layer）——把所唱、所记、所感的真理转化为具体生活行动。
- **S7 = 传递转换层**（Transmission Conversion Layer）——把真理、实践和音乐资源传递给另一个人。
- **歌曲 ≠ 完整门训单元**：歌曲承担表达/记忆/情感/共同体/祷告，不自动产生行为；
  歌曲 + S6 具体行动设计 = 音乐进入生命实践。

与 MOS-DIS 的边界（H-1 裁决：B｜两系统并列）：
- MOS-DIS = 每日门训行为系统（经文→反思→选择→实践→完成，五步）。
- MOS-MUSIC = 音乐门训形成系统（七步）。
- 两套流程各自独立、互不合并、互不修改。

## 2. 三层架构（规格书 §9）

```
Content Layer     content/**（JSON，无逻辑）
      ↓ 按需 fetch / SW 缓存 / 落库 IndexedDB
Application Layer app/** + index.html（零构建原生 JS，无内容字符串）
      ↓ Outbox 队列
Synchronization Layer  IndexedDB ↔ 云端数据库（Phase 3+ 接入服务器）
```

## 3. 目录结构

```
MOS-MUSIC/
├── index.html            应用外壳（单壳 hash 路由）
├── offline.html          离线兜底页（§30）
├── manifest.json         PWA 清单
├── sw.js                 Service Worker（三段式缓存）
├── app/                  程序层（禁止出现内容字符串，CI 硬校验）
│   ├── shell.js          启动 / 注册 SW / 安装提示 / 同步入口
│   ├── router.js         hash 路由（#/today 等 12 条路由）
│   ├── modules.js        MODULE 01–12 渲染器
│   ├── content-source.js 内容读取（网络→IndexedDB 回退，离线必读）
│   ├── store.js          IndexedDB 封装（库名 mos-music，13 store）
│   ├── net.js            网络探测（onLine + HEAD 探针，fail-closed）
│   ├── sync.js           Outbox 同步骨架（本地优先 / 服务器优先）
│   ├── discernment.js    ★ 歌曲辨识引擎（平台化，与 Frozen Skill 判定一致，PER 字段对拍）
│   ├── production-rules.js ★ 生产规则：Unit Review Gate(N1) / 跨周复用(N2) / 库容 / 计划器
│   ├── calibration.js    ★ Calibration Issue 校验与四段版本治理
│   ├── production-console.js ★ MODULE 12 生产控制台视图（只读）
│   ├── song-unit.js      ★ V3.0 单曲单元纯逻辑（18 段位标志 / L1–L4 派生 / 状态机一致性 / 缺口）
│   ├── song-resources.js ★ 资源槽位纯逻辑 + V3.x 来源类型词表（6 项；AI 不入真人槽位；前台显示规则）
│   ├── coach.js          ★ V3.x MOS Singing Coach 数据层（独立模块 · 不回写门训数据）
│   ├── front/            V2.0/V3.0 前台：util · player · home · songbook · mine · song-page ·
│   │                       learn · teach · covers · my-songs ·
│   │                       coach.js（V3.x Singing Coach 入口）·
│   │                       score.js（简谱渲染 + 光标跟随，只按真实标记不插值）·
│   │                       review.js（四级学习者状态 + Day0/2/7 间隔）·
│   │                       pulse.js（Web Audio 真实节拍器，不伪造音频）
│   └── ui/               tokens.css（MOS 视觉令牌）+ components.css + v21.css + v30.css（简谱 / 光标 / 节拍器 / 教学）
├── content/              内容层（禁止出现逻辑，CI 硬校验）
│   ├── schema/           13 个 JSON Schema（song/course/theme/map/production-issue/taxonomy/song-content/coach/resource-discovery/…）
│   ├── bible/            经文引用索引（Reference/Passage ID，无全文）
│   ├── courses/          24 课空壳（MUS-C-01…24）
│   ├── songs/            音乐库索引 + 歌曲详情记录（详情层 10 首；其余 40 首在登记层）
│   ├── framework/        MM01–MM24 Framework 母库（非年度计划）
│   ├── annual/2027/      Annual 年度实例：W01–W04 周记录 + 完整单元
│   ├── production/       ★ 生产平台数据层（词表 / 使用历史 / 校准问题 / 治理 / 基线 / 回归用例 /
│   │                       升层声明 library-promotions / 锚点认定 song-anchor-determinations /
│   │                       V3.0 派生：song-unit-levels（等级表）/ song-worksheets（工作单）/
│   │                       V3.x 生产工作包 packages/**（10 首 × 9 槽位 + WORKSHEET.md）/
│   │                       V3.x 资源普查 resource-discovery.json）
│   ├── song-units/       ★ V3.0 单曲完整单元（index.json 词表 + MUS-SU-0001…0010 单元包，
│   │                       18 段 / 独立层，不写入 Song Core Record，不引用周次）
│   ├── taxonomy/         ★ V3.x 歌曲分类 V1.1（四维词表 index.json + 100 首分词 assignments.json）
│   ├── song-content/     ★ V3.x 歌曲内容层（10 首 × meaning/scripture/background/reflection/practice/prayer）
│   ├── coach/            ★ V3.x MOS Singing Coach 词表（10 能力 / 10 训练项目 / 反馈结构 / 两个预留接口）
│   ├── song-resources/   资源层（六类槽位，独立模型，当前 0 条，不虚构）
│   ├── library/          入库登记层（45 首登记记录，SOURCE_REQUIRED，逐字节不变）
│   ├── candidates/       100 首目标候选库（NOT_YET_ASSESSED / SOURCE_REQUIRED，无排序字段）
│   ├── themes/           八维辨识标签体系
│   ├── training/         L1/L2/L3 + MUS-F-01…06
│   ├── templates/        家庭 5 分钟 / 小组流程 / 教会季度模板
│   └── map/              MOS-MUSIC-MAP V1.0（52周↔24课↔LQ 映射）
├── assets/icons/         PWA 图标（192/180/512/maskable-512）
├── tools/                validate-content.js（内容/程序分离 CI 校验）· cdp-verify.js ·
│                         build-usage.js（音乐库使用历史）· baseline.js（不可变基线/生产清单）·
│                         regression.js（W01–W04 回归 + 引擎与技能对拍）·
│                         platform-tests.js（核心模块单元测试）· produce-plan.js（生产计划器）·
│                         discern-w04.js（Phase 2B：Skill 驱动，只装配输入不含选歌逻辑）·
│                         song-units.js（V3.0 构建 18 段单元包 + 派生等级表）·
│                         song-worksheet.js（V3.0 单曲生产工作单 STEP00–15）·
│                         build-packages.js（PILOT 10 生产工作包 9 槽位）·
│                         taxonomy.js（V3.x 四维分类构建/核对）·
│                         song-content.js（V3.x 歌曲内容层构建/核对）·
│                         song-resource-discovery.js（V3.x 100 首资源普查）·
│                         guard.js（V3.x 边界守护 10 项）
├── tests/                smoke.js（553 项静态断言）
└── docs/                 本文档、ID-RULES、ADR、standards/（V3.0 三份歌曲标准）、
                          V3X-PRODUCT-DIRECTION.md（V3.x 方向冻结）、
                          PLATFORM-V1.0.md、CALIBRATION-ISSUES.md、
                          VERSION-GOVERNANCE.md、MODEL-CALIBRATION-V1.0.md、
                          RESEARCH-FINDINGS-PHASE-2A.md、SKILL-SONG-DISCERNMENT-*.md、
                          PHASE-2B-W04-DISCERNMENT.json
```

## 3.1 歌曲辨识 Skill（Phase 2A.2 冻结）

选歌/歌曲辨识不在 app/ 内实现，而是以**用户级技能**形式提供，避免内容与逻辑混层：

```text
~/.workbuddy/skills/mos-music-song-discernment/
├── SKILL.md            技能定义（先经文后音乐；禁止反向选歌；八维辨识；风险 A–F）
├── tools/discern.js    零依赖运行器（只读 content/**；--week / --backtest / --emit-examples）
├── examples/           W01 / W02 / W03 / W03-AUX 结构化结果
└── tests/              backtest-w01-w03.json · upstream-hashes.json · backtest-result.json
```

- 固定链条：圣经 → 释经 → 核心真理 → LQ → MM → 音乐功能 → **歌曲辨识** → 七步法 → S6 → S7 → 生命形成。
- 回测：W01–W03 全通过（4/4 用例 + 验收 A–G），报告见 `docs/SKILL-SONG-DISCERNMENT-BACKTEST-W01-W03.md`。
- 输出字段与 Schema 同源（`discipleship-unit.schema.json#review_gate`、`song.schema.json`），不新增并行字段。
- **Phase 2B 实战使用**：W04 单周试产由 `tools/discern-w04.js` 驱动该 Skill 完成（5 首候选全量辨识），
  结果留档 `docs/PHASE-2B-W04-DISCERNMENT.json`，报告见 `MOS-MUSIC_PHASE2B_W04_REPORT_V1.0.md`。
  本次发现 3 项范围缺口（单元层裁决／跨周复用／回测哈希作用域），已列为 V1.0.1 候选，冻结版本未改。

## 3.2 讲道音乐生产平台 V1.0（MODULE 12，见 docs/PLATFORM-V1.0.md）

Phase 2B 的 W04 暴露三项范围缺口（N1 单元层裁决 / N2 跨周复用 / N3 回测哈希作用域过宽），
V1.0 把它们平台化，同时**不动冻结技能**：

```text
闭环：Music Library → Song Discernment → Sermon Week → Song Matching
      → Unit Production → Human Review → Validation → Production Record
```

| 层 | 实现 | 说明 |
|---|---|---|
| 引擎 | `app/discernment.js` + `content/production/discernment-lexicon.json` | 八维辨识 / Song_Relation / Primary_Function / S6·S7 / 风险 A–F / Tier / Review Status / 决策轨迹。词表在 content/（守 §34） |
| 规则 | `app/production-rules.js` | Unit Review Gate（N1，输出 PASS/REVIEW/BLOCK，**不反写歌曲层**）、跨周复用（N2）、库容告警、生产计划器 |
| 校准 | `app/calibration.js` + `content/production/calibration-issues.json` | §十二 14 字段 / 7 状态；Frozen→Observed→Proposed→Released |
| 界面 | `app/production-console.js`（MODULE 12，不进底部导航，入口 `#/production`） | 生产总览 / 音乐库 / 歌曲辨识 / 生产计划 / 校准与版本。**只读**，不写任何 `content/**` |
| 基线 | `tools/baseline.js` + `content/production/baseline-immutable.json` | Immutable Baseline 与 Production Content 分离（N3 修正） |

- 引擎与冻结技能是**两份实现**，一致性由 `tools/regression.js#PARITY_FIELDS` 逐字段对拍强制（CI-0010）。
- 引擎文件用 `.js`（不用 `.mjs`）：静态服务器对 `.mjs` 的 MIME 映射不保证（ADR-0009）。
- 平台与技能分离 ≠ 平台可改技能：任何技能层问题只能进 `Proposed`，等人工批准（见 VERSION-GOVERNANCE）。

## 3.3 单曲完整单元标准层 V3.0（见 docs/ADR/ADR-0017）

把「一首歌成为可学、可视唱、可教、可传的完整单元」落成**可检查的数据结构**。
它**不是**周次体系，**不引用周次 / 课程**；周次使用是下游可能出现的消费方式。

| 层 | 实现 | 说明 |
|---|---|---|
| 标准 | `docs/standards/`（三份） | 教学法（八原则 / 十步法 / 三模式 / 光标标准 / 四级状态 / Day0·2·7）、18 段模板 + L1–L4、STEP00–15 工作单 |
| 词表 | `content/song-units/index.json` | 18 段 / 11 个生产状态 / L1–L4 / 十步 / 三模式 / 四级状态 / 间隔 / 记谱·教词·声乐键 / A–J 验收 |
| 记录 | `content/song-units/MUS-SU-NNNN.json` | 每首歌一份，**18 段必须齐备、内容可为空**；`additionalProperties:false` 防漂移 |
| 纯逻辑 | `app/song-unit.js` | 段位标志 / `deriveLevel()`（L1–L4 **派生**，不写记录）/ `statusConsistent()`（状态机前置）/ 缺口 |
| 呈现 | `app/front/score.js` | 简谱渲染（只在 `score` 段）；光标跟随 `locate()` **只按真实标记、绝不插值**；`supportedLevels()` 只列真实层级 |
| 呈现 | `app/front/review.js` | 四级学习者状态（`markStage` 只增不减）/ Day0·2·7 间隔（只提示，不催不迫） |
| 呈现 | `app/front/pulse.js` | Web Audio 节拍器（**真实点击音**；无 AudioContext 时 `available=false`，**不伪造音频**） |
| 派生 | `content/production/song-unit-levels.json` / `song-worksheets.json` | 全库等级表 / 工作单（**派生层，不属于不可变基线**，同 CI-0014 案 a） |
| 工具 | `tools/song-units.js` / `song-worksheet.js` | 构建与核对（`--check`）；工作单只派生进度，**不写内容、不代签核** |

铁律：**只做简谱、只做钢琴伴奏**（可复现）；示唱必须真人（`singer` 枚举 `[null]`，禁虚拟歌手）；
**不设通过 / 不通过、不评分、不排名、不给徽章**；资源缺失一律如实「尚未提供」。
当前详情层 10 首：**5 首 `VERIFYING`**（0001–0005：公版英文歌词已结构化入包与单元；
0001 另有简谱 **DRAFT 草稿**，未听校、**不计入等级**）、**5 首 `INTAKE`**（0006–0010：
法律状态未判定 ⇒ 全部资源如实 NOT_AVAILABLE）；**等级全库 `NONE`** —— 这是**派生结果**，
不得为消除缺口而虚构内容。

## 3.4 V3.x 产品方向冻结与资源生产基础层（见 docs/V3X-PRODUCT-DIRECTION.md 与 ADR-0018…0021）

本轮**停止新增架构功能**，改为把「后续 100 首歌曲生产不会走回头路」变成可检查的结构。

| 层 | 实现 | 说明 |
|---|---|---|
| 方向文本 | `docs/V3X-PRODUCT-DIRECTION.md` | 冻结文本（21 节）；独立定位 / 分类 / 资源模型 / Reuse First / Coach / 普查 / 停止条件 |
| 分类 | `content/taxonomy/index.json` + `assignments.json` | 四维词表 + **100 首逐首分词**（多归属，`derived_from` 可追溯；无来源的维度如实留空） |
| 分类工具 | `tools/taxonomy.js` | `--build` / `--check`（四维齐全、多归属真实存在、不得退化为单选） |
| 内容层 | `content/song-content/**`（10 首 × 6 字段） | meaning / scripture / background / reflection / practice / prayer；**属歌曲本身，不绑周次课程**；经文只存引用与 ID |
| 内容层工具 | `tools/song-content.js` | `--build` / `--check`（六字段齐全、状态词表、缺失即 `NOT_AVAILABLE`） |
| 资源模型 | `content/schema/song-resource.schema.json`、`song-unit.schema.json` | 新增 `source_type` / `source_url` / `host_policy` / `segment(phrase_id,start,end)` / `is_ai` / `engine` / `vendor` / `source_tracking`；单元新增 `demos.ai_male` / `demos.ai_female` 与 `expression_reference` |
| 资源来源词表 | `app/song-resources.js`（`SOURCE_TYPES`） | 6 项（外部真人 / MOS 真人 / AI × 男·女）+ `sourceTypeDisplay()`（AI 必带「（非真人）」）+ `violatesHumanSlot()` |
| Singing Coach | `content/coach/index.json` + `app/coach.js` + `app/front/coach.js` | 独立模块 `#/coach`：10 能力 / 10 训练项目（`MODEL_ONLY`）/ 描述式反馈 / 两个 `RESERVED_NOT_CONNECTED` 接口 |
| 资源普查 | `tools/song-resource-discovery.js` + `content/production/resource-discovery.json` | 100 首 × 11 列；状态 `FOUND / NOT_FOUND / VERIFY / REUSE / CREATE / UNSURVEYED` |
| 边界守护 | `tools/guard.js` | 10 项：前台不露周次与课程码、后台历史引用未删、AI 不入真人槽位、外部资源禁下载转存、Coach 不读门训数据、分类多归属、普查不虚构来源、内容层不绑周次、无评分排名属灵评价、前台隐藏后台术语 |

铁律：**外部检索未执行时来源一律留空**（`UNSURVEYED` 不得携带来源）；**不下载 / 不转存**外部资源；
**AI 不冒充真人、不计入等级**；**Coach 与门训系统互不评分、互不推导**；
本轮**不开始制作 100 首实际资源**（先普查再生产）。

## 4. 关键设计决定（详见 docs/ADR/）

| ADR | 决定 |
|---|---|
| ADR-0001 | 独立仓库 + 独立 origin，不并入 MOS-DIS / MOS-GOV / EBRM |
| ADR-0002 | H-1：与 MOS-DIS 五步并列，边界互不侵犯 |
| ADR-0003 | H-2：24 课不是第三套年度体系，经 MAP 关联 52 周与 LQ |
| ADR-0004 | 复用 EBRM 已验证 PWA 范式，不复制其业务逻辑 |
| ADR-0005 | 经文 V1.0 只存 Reference + Passage ID + 摘要，不托管全文 |
| ADR-0006 | tier（A/B/C）与 review_status（七态）为两个独立字段 |
| ADR-0007 | S6=实践转换层、S7=传递转换层；歌曲 ≠ 完整门训单元（Phase 2A.1 冻结） |
| ADR-0008 | 歌曲辨识与选歌 Skill V1.0（先经文后音乐；禁止反向选歌；两层裁决分离） |
| ADR-0009 | 讲道音乐生产平台 V1.0；引擎与冻结技能双实现对拍；Baseline 两段化；校准问题不自动改 Frozen |
| ADR-0010 | 曲库 V0.5 两层结构：入库登记层（`content/library/`）与歌曲详情层（`content/songs/`）分离 |
| ADR-0011 | 派生索引移出不可变基线（案 a，CI-0014）；库级歌基层辨识固化为 `library_scope`（CI-0017） |
| ADR-0012 | 版权词表维度分离、禁止互相映射（案 a，CI-0015）：登记层=来源与行动状态，详情层=法律状态 |
| ADR-0013 | 圣诗固有经文依据的锚点认定与升层路径（CI-0018 试批）：锚点=歌的固有属性不构成反向选歌；升层状态以独立声明承载，登记层逐字节不变 |
| ADR-0014 | V1.1-A 使用体验完善层：Song Detail 八段档案（NOT_ASSESSED/NOT_IMPORTED 明示）、Song Resources 独立资源层、Week Music 页（RESOURCE_PENDING）、Human Review 记录层（ACCEPT/REVISE/HOLD/REJECT）、Dashboard 七项指标、曲库搜索 |
| ADR-0015 | 前台/后台分层与 100 首目标候选库（V2.0）：前台三入口 + 唱懂活教传；候选层 NOT_YET_ASSESSED/SOURCE_REQUIRED、无排序字段 |
| ADR-0016 | 艺术化设计系统与前后台视觉彻底分层（V2.1）：v21.css 设计令牌、深夜沉浸模式（IndexedDB 偏好）、系列化 SVG 封面（内容驱动）、统一 MusicPlayer；研究数据零改动 |
| ADR-0017 | 单曲完整单元标准层（V3.0）：18 段模型（`content/song-units/**` 独立层）、L1–L4 派生等级（不写记录）、教学十步法 / 三模式、光标只按真实标记不插值、四级学习者状态只记录不评价、只简谱只钢琴、淡化周次绑定 |
| ADR-0018 | **MOS Music 独立定位冻结（V3.x）**：音乐系统 = 独立的音乐学习 / 歌唱训练 / 教唱 / 生命形成系统；不以 52 周经文、门训课程、讲章为组织中心；与门训系统**相连而不相属**；前台不突出周次，后台历史引用保留且不得删除 |
| ADR-0019 | **歌曲分类 V1.1（V3.x）**：四维（主题 / 处境 / 场景 / 音乐）+ 多归属；分类只是「帮人找到歌曲」，**不是歌曲的身份**；词表与分词表在内容层，程序不硬编码 |
| ADR-0020 | **完整资源模型与 Reuse First（V3.x）**：`demo{human_male/human_female/ai_male/ai_female}`、`accompaniment(piano)`、`teaching`、`content`、`personal`；来源类型 6 项；外部真人版本 `source_url + start/end + phrase_id` 原站播放，**不下载不转存**；AI 独立轨、不计入等级、不冒充真人；新增字段一律可选、不改冻结字段含义 |
| ADR-0021 | **MOS Singing Coach（V3.x）**：独立产品模块，与 MOS Formation 完全独立（不读课程完成度 / 积分 / 成绩 / 周次 / 辨识结论）；十项能力 + 训练项目模型 + 描述式反馈（收在「再唱一次」）+ 音频上传与 AI 分析接口预留；**不做评分 / 排名 / 比赛 / 属灵评分** |

## 5. 验证状态

- `tests/smoke.js`：**553/553 通过**（结构、Schema、ID 规则、命名空间隔离、MODULE 12 接线、平台约束、
  曲库 V0.5 派生索引与升层声明、V1.1-A 资源层 / 审查记录层 / 程序接线 / 展示层词汇、
  **PILOT 10 生产工作包（10 × 9 槽位 / 样板 A–E / 草稿不计级）；V3.x 分类 · 内容层 · 资源模型 · Coach · 普查 · 守护**）。
- `tools/validate-content.js`：**0 错误 0 警告**（38 程序文件 + 229 内容文件分离校验；
  含 Phase 2A.1 转换层与年度主题硬检查、Phase 2B 年度周/单元 4 件期望、
  V1.0 生产平台硬检查：链条、默认门、校准字段、治理阶段、库容与 baseline 作用域；
  V0.5 曲库扩库登记层硬检查：清单契约、登记记录契约、「登记层不得出现辨识结论字眼」、
  派生索引一致性与 `derived_scope` 声明；升层路径硬校验：详情文件存在 / song_id 一致 /
  锚点一致 / 来源可追溯 / 升层与认定一一对应；
  **V1.1-A 硬检查：资源层结构 / 资源逐条 schema / file_url=null / 不虚构、
  审查记录逐条 schema / 四值裁决词表 / 不得系统代填 reviewer、生产索引计数一致、
  结构层不得进入不可变基线**；
  **V3.0 硬检查：单曲单元 18 段齐备 / schema 严格（`additionalProperties:false`）/
  派生等级与资源一致 / 状态机机械前置一致 / 禁评分·排名·徽章 / 禁虚构资源 /
  时间轴单调 / 可追溯 `derived_from` / 三份标准文档存在且声明不悬空 / SW v12 预缓存**；
  **V3.x 硬检查：四维分类完整性与多归属 / 歌曲内容层六字段不绑周次 / 外部真人分段字段与
  AI 显式标注 / 不下载转存政策 / Singing Coach 接口预留与不读门训数据 / 100 首普查不虚构来源**）。
- `tools/platform-tests.js`：**101/101 通过**（辨识引擎 / 审查门 / 跨周复用 / 库容 / 计划器 /
  校准治理 / §十 容量指标 / V0.5 入库与辨识分离 / V1.1-A 资源槽位逻辑 /
  **V3.x 资源来源类型与真人槽位硬约束**）。
- `tools/regression.js`：**82/82 通过**（W01–W04 歌曲层 8 用例 + 单元层 4 项 + 不变量 5 项 +
  校准治理 3 项 + 索引一致性 4 项 + 曲库 V0.5 / 升层路径约 33 项 +
  V1.1-A 结构层 7 项 + **V3.x 新层不进基线 4 项 / 分类多归属 / 内容层不绑周次 / Coach 独立 / 普查不虚构**；
  `immutable_drift = []`）。
- 派生索引一致性：`derive-indexes.js --check`（主题计数 / 经文锚点 50 条：已登记 10 / 待认定 40）与
  `song-discernment.js --check`（库级辨识 45 首全部 Research / 无周次 / 无代填）通过。
- 边界守护：`tools/guard.js`（**checks=10 / violations=0**：前台不露周次与课程码、后台周次历史引用未删、
  AI 示唱必显式标注且不入真人槽位、外部真人一律原站定位、Coach 不读门训数据、
  分类多归属、普查不虚构来源、内容层不绑周次课程、无评分排名属灵评价、前台隐藏后台术语）。
- Headless Chrome CDP 验收：**138/138 通过**（脚本 `tools/cdp-verify.js`：启动、SW、IndexedDB、
  Framework/Annual 分离、校准字段、W04 单元五项断言、离线重载、冷启动离线、恢复在线、
  MODULE 12 七个子视图与平台约束、派生索引离线可读、
  歌曲详情页八段 / 登记层-only 如实呈现 / 周音乐页与 W05 空态 / 人工审查视图 / 双端搜索过滤；
  V2.0 前台三入口与学唱教唱；V2.1 Hero/系列封面/歌词选句/深夜模式/统一播放器；
  V3.0 简谱显著呈现与「尚未提供」降级 / 光标只按真实标记 / 十步法三模式切换 /
  视唱默认不先给完整示范 / 节拍器 / 四级学习者状态；
  **PILOT 10 歌曲页（英文公版歌词 + 简谱草稿徽章 + 译本未托管 + 权利未判定阻断）；
  V3.x 诗歌本四维筛 / 歌曲页分类与内容层 / Coach 独立模块与不读门训数据 / 我的 Coach 入口**；
  视口 360·390·430·1366）。
- **单曲单元与工作单一致性**：`tools/song-units.js --check`（10 个单元包与等级表一致、
  无 18 段缺口、状态机无自相矛盾）、`tools/song-worksheet.js --check`（工作单与资源就绪表一致）、
  `tools/build-packages.js --check`（10 首 × 9 槽位齐备）、`tools/taxonomy.js --check`、
  `tools/song-content.js --check`、`tools/song-resource-discovery.js --check` 全部通过。
- 真实离线冷启动已验证：离开文档 → 断网 → 重新打开 index.html → 应用从 SW 缓存 +
  IndexedDB（含生产平台索引、使用历史、曲库登记索引、派生索引、4 周年度记录）完整启动。
- 歌曲辨识 Skill 回测：W01–W03 用例 4/4 PASS，验收 B–G PASS；A 项作用域过宽已在平台侧改为
  Immutable Baseline（CI-0012 技能侧待批 V1.0.1，平台侧已闭合）。
- 2027 年度实例：W01–W04 共 4 个周记录 + 4 个完整单元（W05–W52 未生产，按裁决暂停）。
- 曲库 V0.5（5 → 50）：**第一阶段已完成，第二段（升层）试批 5 首已完成**。
  登记层（`content/library/**`）45 首登记记录（**逐字节不变**）+ 歌曲详情层 **10 首**
  （原 5 首 + 试批升层 `MUS-S-0006…0010`），合并曲库 50 首；
  派生索引（主题歌曲计数 / 歌曲经文锚点 / 库级辨识）随曲库变化而
  `immutable_drift = []`（CI-0014 案 a）。
  升层路径（ADR-0013）：锚点按**圣诗固有经文依据**逐首认定
  （`content/production/song-anchor-determinations.json`），升层状态以独立声明
  `content/production/library-promotions.json` 承载（冻结登记契约不允许附加字段）；
  剩余 **40 首**仍在登记层，须人工验收试批后决定（CI-0018，`accepted_by_human` 全为 `false`）。
  容量实况：可用 45 < 剩余 48 周，`MUSIC_LIBRARY_CAPACITY_WARNING` 如实保持生效（CI-0016）。
  版权词表已按案 a 分离为两个维度（登记层＝来源与行动状态，详情层＝法律状态，禁止互相映射），
  零 schema 改动（CI-0015）；试批 5 首 `SOURCE_REQUIRED` 未改、法律状态全部 `unknown`。
  执行手册见 `docs/LIBRARY-V0.5-INTAKE.md`，决策见 `docs/ADR/ADR-0010-music-library-v0.5-intake-layer.md`、
  `docs/ADR/ADR-0011-derived-index-scope-and-library-scope-discernment.md`、
  `docs/ADR/ADR-0012-copyright-vocabulary-dimension-separation.md`
  与 `docs/ADR/ADR-0013-hymn-anchor-determination-and-promotion-path.md`。
- V1.1-A 使用体验完善层（ADR-0014）：
  - **Song Detail**（`#/song/MUS-S-NNNN`）：01 基本资料 → 02 Bible Anchor（固定「Anchor ≠ sermon selection」警示）
    → 03 主题映射（preliminary / discerned 分开）→ 04 辨识（NOT_ASSESSED 明示）
    → 05 人工审查 → 06 使用历史 → 07 资源现状（NOT_IMPORTED 明示）→ 08 版权与来源；
    登记层-only 歌曲如实显示「未升详情层」。
  - **Song Resources**：`content/song-resources/index.json` + `content/schema/song-resource.schema.json`
    + `app/song-resources.js`；六类槽位（LYRICS/SCORE_LEAD/SCORE_SIMPLE/LEAD_VOCAL/ACCOMPANIMENT/RECORDING），
    当前 0 条资源记录（只建结构，`file_url` 强制 null，不虚构）。
  - **Week Music**（`#/week/WNN`）：经文 / 核心真理 / LQ / MM / 核心歌 / 关系 / 功能 / 审查门 / 复用 /
    S6 / S7 + Resource Access（RESOURCE_PENDING）；W05+ 如实显示「尚未生产，不自动生产」。
  - **Human Review**：`content/production/review-records.json`（0 条）+ 记录 schema；
    裁决 ACCEPT/REVISE/HOLD/REJECT 由人工写入，平台只列待办与模板，
    不反写 Frozen Skill / 歌曲裁决 / W01–W04 历史，不触发自动升层。
  - **Dashboard**：七项核心指标（Library 50 / Detail 10 / Intake 40 / Human Review 待人工 /
    Capacity / Calibration 未结案 / Production W01–W04 状态）。
  - **搜索**：使用者端与生产端音乐库支持 Song ID / 中文歌名 / 英文歌名过滤（无语义推荐）。
  - 版本：内容 `MUS-V-0.6.0`｜平台 `1.1.0`｜SW 缓存 `mos-music-v7`。
    展示层状态词已登记 CI-0023（LOW/OBSERVED）。
