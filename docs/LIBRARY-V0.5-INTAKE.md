# Music Library V0.5 · 扩库与入库流程

> 目标：把 MOS Music Library 从 5 首扩充到 50 首（新增 45 首），并保持
> **平台结构不变、已冻结技能不变、W01–W04 历史裁决不变**。
>
> 本文件是执行手册；裁决与理由见 `docs/ADR/ADR-0010-music-library-v0.5-intake-layer.md`。

---

## 0. 当前状态（一句话）

**BLOCKED。** 45 首候选清单未随扩库指令交付，仓库内、本机全盘与历史会话中均无此清单；
入库第一段无法启动。已登记 `CI-0013`（BLOCKER / OPEN）。

同一阶段另暴露两项结构性阻断（与清单无关，需人工裁决）：

| 编号 | 内容 | 状态 |
|---|---|---|
| CI-0013 | 候选清单未提供 | OPEN / BLOCKER |
| CI-0014 | 扩库必需的登记文件（主题计数、经文登记表）位于不可变基线内 → 扩库必然产生基线漂移 | OPEN / BLOCKER |
| CI-0016 | 满库 50 首后容量告警仍未解除（45 可用 < 48 周） | OPEN / HIGH |
| CI-0017 | 库级辨识（无周次上下文）的口径未定 | OPEN / HIGH |
| CI-0015 | V0.5 版权词表与歌曲详情既有枚举不对齐 | OPEN / HIGH |

---

## 1. 为什么分两段

歌曲详情记录（`content/songs/**`）的**必填**字段包含 `bible.core_passage`（经文锚点），
而 V0.5 候选清单**不提供**经文锚点 —— 它只能由已冻结技能的 S1→S7 流程产生。
若为填满必填字段而代填经文，就是虚构。

因此入库分两段，界线不可模糊：

| 段 | 产出 | 本阶段是否执行 | 理由 |
|---|---|---|---|
| **第一段 · 登记** | `content/library/registry.json` 逐首入库登记记录（身份 / 来源 / 资源现状 / 清单初步主题 / 建议用途方向 / 版权状态） | ✅ 可执行 | 全部字段都来自人工清单，无需虚构 |
| **第二段 · 歌曲详情** | `content/songs/MUS-S-NNNN.json` + 曲库索引 + 主主题统计 + 经文登记 | ❌ 暂不执行 | 需要经文锚点（来自技能）+ 需先解决 CI-0014 |

第一段的另一个好处：**它不触碰不可变基线内的任何文件**，因此可在 `immutable_drift = 0`
的前提下完成，不破坏 §十三 的验收条件。

---

## 2. 人工需要提供什么

45 首候选，每首至少给出下列列：

| 列 | 必填 | 说明 |
|---|---|---|
| 中文歌名 | ✅ | 唯一识别用；清单内不得重名 |
| English Title | ➖ | 可空 |
| alternate_titles | ➖ | 别名 / 异译，数组 |
| author | ➖ | 词作者 |
| composer | ➖ | 曲作者 |
| translator | ➖ | 中文译者 |
| source | ➖ | 出处（诗集 / 版权方 / 链接） |
| 初步主题 | ➖ | **library_metadata**，不是辨识结论 |
| 建议用途方向 | ➖ | **library_metadata**，不是辨识结论 |
| copyright_status | ✅ | 只允许 `PUBLIC_DOMAIN` / `LICENSED` / `USER_PROVIDED` / `SOURCE_REQUIRED` / `UNKNOWN` |

**不允许**由工具补全、推测，或从网络抓取歌名与作者。无法确认的一律记 `SOURCE_REQUIRED`
或 `UNKNOWN`，事后再逐首补资源。

**本阶段不要求**：完整歌词、五线谱、简谱、示唱音频、伴奏音频。四槽一律 `NOT_IMPORTED`。

---

## 3. 执行步骤

### 3.1 清单规范化

把人工清单写进 `content/library/v0.5-candidates.json`，并把 `status` 由
`PENDING_LIST` 改为 `RECEIVED`、`received_at` 填上提供时间。

> 注意：`content/**` 下的 JSON 必须是纯数据。校验器会拒绝出现代码形态的文件
> （函数、箭头函数、脚本标签、浏览器存储 API、以及**小写独立词 `import`** —— 因此
> 路径或说明里不要出现「…-import…」这种写法）。

### 3.2 检查（不写任何文件）

```bash
node tools/library-intake.js
```

输出：清单结构检查 → 逐首登记记录预览 → 第二段前置检查（逐条列出为什么还不能写歌曲详情）
→ §九 使用历史视图。`RESULT BLOCKED_PENDING_LIST` 表示清单仍缺。

### 3.3 写出登记层

```bash
node tools/library-intake.js --write
```

写出：`content/library/registry.json`、更新 `content/library/index.json` 计数。
**不会**写 `content/songs/**`，**不会**碰不可变基线内的文件。

### 3.4 复核

```bash
node tools/usage-history.js                                   # §九 使用历史表
node tools/library-report.js --md docs/LIBRARY-V0.5-REPORT.md # §十四 报告 + §十 容量重算
node tools/library-intake.js --guard                           # 扩库守卫（CI 同款）
```

### 3.5 验收（§十三）

```bash
node tools/validate-content.js     # 必须 0 errors
node tests/smoke.js                # 必须全通过
node tools/platform-tests.js       # 必须全通过
node tools/regression.js --emit    # immutable_drift 必须为空
node tools/cdp-verify.js           # 必须全通过（需本地静态服务器）
```

### 3.6 第二段（歌曲详情层，须另一次人工决定后启动）

经文锚点由已冻结技能的 S1→S7 产生后，才允许写歌曲详情记录。

CI-0014 已由人工按 **案 a** 关闭（见 `docs/ADR/ADR-0011`）：主题歌曲计数与歌曲经文锚点
**已移出不可变基线**，改由派生索引承载（`content/production/theme-song-counts.json`、
`content/production/song-scripture-index.json`）。因此写歌曲详情**不再**构成基线漂移。
即便如此，第二段仍须人工批准后才启动 —— 平台不自行把登记层升级为详情层。

---

## 4. 容量重算口径（§十）

| 指标 | 定义 |
|---|---|
| total songs | 曲库总首数 |
| usable | **从未被任何周次使用过**的歌曲数（复用不算可用） |
| assessed | 已有辨识留档的歌曲数 |
| unresolved | 尚无辨识留档的歌曲数 |
| used / unused | 使用过 / 未使用过 |
| HIGH risk | 存在 HIGH 级风险记录的歌曲 |
| REVIEW | 辨识留档中出现「需人工复核」的歌曲 |
| BLOCK | 存在 HIGH 级风险（会阻断单元层审查门）的歌曲 |
| evidence insufficient | 留档为研究级或关系尚未辨识的歌曲 |
| remaining unique capacity | = usable（不依赖复用的剩余容量） |
| deficit | max(0, 剩余周次需求 − usable) |

**推算（待清单确认后由报告复核）**：50 首中前 5 首已被 W01–W04 全部使用，故 usable = 45；
W05–W52 剩余 48 周 → `deficit = 3`，`MUSIC_LIBRARY_CAPACITY_WARNING` **不会解除**（CI-0016）。

---

## 5. 硬性边界（不得越线）

- 不改已冻结技能 `mos-music-song-discernment@1.0.0`；
- 不改 W01–W04 任何裁决（歌曲层与单元层都不改）；
- 不改 52W 上游、364D LQ、MM01–MM24；
- 不生成 W05–W52，不给任何歌曲指定未来周次；
- 不把任何歌曲标为「最佳」或推荐首选；
- 不因扩库而改变任何已有周次的核心歌；
- 不为了填满 52 周而降低辨识标准；
- 清单的初步主题与建议用途方向**不得**被写进任何辨识结论字段
  （校验器会扫描登记层是否出现 `Core Candidate` / `direct_biblical_expression` /
  `theme_response` / `Needs Human Review` 等字眼）。

---

## 6. 文件清单

| 文件 | 角色 |
|---|---|
| `content/library/v0.5-candidates.json` | 人工清单（上游输入，规范形态） |
| `content/library/registry.json` | 入库登记记录（工具生成，可重跑） |
| `content/library/index.json` | 扩库索引与计数 |
| `content/schema/library-candidates.schema.json` | 清单契约 |
| `content/schema/library-intake.schema.json` | 登记记录契约 |
| `content/production/library-report.json` | §十四 报告（工具生成） |
| `content/production/theme-song-counts.json` | 派生索引：主题歌曲计数（案 a） |
| `content/production/song-scripture-index.json` | 派生索引：歌曲经文锚点（案 a） |
| `content/production/song-discernment-v0.5.json` | 库级歌基层辨识结果（Song-level results） |
| `tools/library-intake.js` | 入库工具（读 CSV / 检查 / 写出 / 守卫 / 状态） |
| `tools/derive-indexes.js` | 派生索引生成与一致性校验（`--check`） |
| `tools/song-discernment.js` | 库级歌基层辨识（`--show` / `--check`） |
| `tools/usage-history.js` | §九 使用历史视图 |
| `tools/library-report.js` | §十四 报告 + §十 容量 |
| `app/library-intake.js` | 纯逻辑模块（浏览器与命令行共用） |
