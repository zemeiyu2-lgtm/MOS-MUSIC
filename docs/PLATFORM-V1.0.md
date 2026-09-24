# MOS 讲道音乐生产平台 V1.0｜平台规格（Platform Specification）

Platform_ID: `mos-sermon-music-production-platform`
Version: `1.0.0` ｜ Status: `V1.0`（进入 REAL USE PHASE）
Annual: `MOS-MUSIC-ANNUAL-2027`
Frozen 技能: `mos-music-song-discernment@1.0.0`（本平台不修改它）

---

## 1. 目标

形成可长期实际使用的闭环：

```text
Music Library → Song Discernment → Sermon Week → Song Matching
→ Unit Production → Human Review → Validation → Production Record
```

平台是**生产工具**，不是创作工具，也不是推荐系统。它负责识别、整理、辨识、匹配、提示、
记录、验收；**不替人写内容，不替人做神学判断，不替人决定用哪首歌**。

---

## 2. 方向铁律（不得颠倒）

```text
52W 经文 → 核心真理 → LQ → MM 主题 → 音乐功能 → 候选歌曲
→ 歌曲辨识 → 使用决定
```

禁止：`歌曲 → 寻找经文 → 修改核心真理 → 修改 LQ → 修改 MM 主题`。
候选歌无法匹配时，输出 `Needs Human Review` 或 `No Suitable Song Found`，
**不得修改上游**。

---

## 3. 已实现模块

| 模块 | 实现位置 | 说明 |
|---|---|---|
| A. Music Library | `content/production/library-usage.json` + `tools/build-usage.js` | 歌曲身份 / 神学主题 / 圣经表达 / 使用历史 / 已使用周次 / 风险记录 / 辨识状态 / 版本 / 审核状态。全部字段**推导**自周次与单元记录，不手工维护 |
| B. Song Discernment Engine | `app/discernment.js` + `content/production/discernment-lexicon.json` | 平台化的八维辨识、Song_Relation、Primary_Function、S6/S7、风险 A–F、Tier、Review Status、决策轨迹。词表在 content/（内容/程序分离） |
| C. Cross-Week Reuse Check（N2） | `app/production-rules.js#crossWeekReuse` | 显示 previous week / song role / previous theme / current theme / reuse status；**只提示，不自动否决** |
| D. Unit-Level Review Gate（N1） | `app/production-rules.js#unitReviewGate` | 10 项检查 → `PASS` / `REVIEW` / `BLOCK`；**结论只描述"这一周是否成立"，不写回歌曲层** |
| E. S6 / S7 结构检查 | `app/production-rules.js` + 词表 | 缺对象/内容/时间/方式或验证机制 → `REVIEW`，**不自动生成虚假的完整结果** |
| F. 生产计划器 | `app/production-rules.js#planProduction` + `tools/produce-plan.js` | 单周 / 连续 / 全年；默认 `human_review` 门 |
| G. Library Capacity Warning | `app/production-rules.js#libraryCapacity` | `MUSIC_LIBRARY_CAPACITY_WARNING`：可用歌曲 < 剩余周数即告警 |
| H. Regression Suite | `tools/regression.js` + `content/production/regression-cases.json` | W01–W04 歌曲层 + 单元层 + 不变量 + 平台与技能一致性 |
| I. Baseline Scope（N3 修正） | `tools/baseline.js` + `content/production/baseline-immutable.json` | Immutable Baseline 与 Production Content 分离 |
| J. Calibration Issue 系统 | `app/calibration.js` + `content/production/calibration-issues.json` | 14 字段 + 7 状态 + 归属层 |
| K. 版本治理 | `content/production/version-governance.json` | Frozen → Observed → Proposed → Released |
| L. Production Dashboard | `app/production-console.js`（MODULE 12） | 年度 / 音乐 / 技能与校准三组统计 + 生产记录 |

---

## 4. 使用方式

平台是 PWA 内的内部工具，**不进底部导航**，入口在 `#/production`：

```text
#/production?view=dashboard      生产总览（年度 / 音乐库 / 技能与校准）
#/production?view=library        音乐库（含使用历史、已使用周次、风险记录）
#/production?view=discern&week=W04  歌曲辨识（候选全量 + 八维 + 决策轨迹）
#/production?view=producer&mode=year|range|single  生产计划
#/production?view=calibration    校准问题与版本治理
```

命令行侧（不依赖浏览器）：

```bash
node tools/produce-plan.js --week W05        # 单周计划
node tools/produce-plan.js --range W05 W10   # 连续
node tools/produce-plan.js --year            # 全年
node tools/build-usage.js                    # 重建音乐库使用历史
node tools/baseline.js                       # 重建不可变基线清单
node tools/regression.js --emit              # 回归 + 落档
node tools/platform-tests.js                 # 核心模块单元测试
```

---

## 5. 明确不实现（写在平台里，防止滑移）

- 推荐算法 / AI 选歌 / "最佳歌曲"判定
- 同步服务器 / 用户系统 / 复杂后台
- 自动填满 52 周
- 强行重复、降低标准、自动使用 HIGH 风险歌曲、创造不存在的歌曲
- 把证据不足的歌曲伪装成合格歌曲
- 改写历史周次（W01–W04）或已冻结技能

---

## 6. 关键语义（防止误读）

| 名称 | 含义 |
|---|---|
| `PASS` | 无待裁事项，机器可自动通过 |
| `REVIEW` | 有需人工确认但不阻断的事项（证据不足 / 缺验证 / 复用 / 说明缺失） |
| `BLOCK` | 必须人工裁决后才可继续（上游缺失 / 歌曲不在库 / HIGH 风险未化解 / 七步或预期形成缺失）。**历史周次被判 BLOCK 不等于周次不合格**，只表示机器不可自动放行 |
| `blocked_capacity` | 该周无未使用歌曲可用 → 先由人工裁定扩库或复用规则 |
| `Core Candidate` | 适合进入 MOS 核心**候选**（不是已进入核心） |
| 两层裁决 | 本周适配裁决（`review_gate.theological_review`）≠ 歌曲生命周期（`song.review_status`） |
| Tier 与 Review | `tier`（A/B/C 资源等级）与 `review_status`（七态）永远两个独立字段 |

---

## 7. 生产纪律（V1.0 最重要的一条）

> 发现问题 → **记录** → 分类 → 累积 → 定期复盘 → 形成 V1.1 / V1.2 修订。

绝对不要「发现问题 → 自动修改已冻结的技能」。
所有发现进入 `content/production/calibration-issues.json`，状态流转见
`docs/CALIBRATION-ISSUES.md` 与 `docs/VERSION-GOVERNANCE.md`。

---

## 8. 当前已知限制

1. 曲库仅 5 首且 W01–W04 已用尽 → **W05 起无未使用歌曲**（CI-0008 / BLOCKER，待 H-3 裁决）。
2. W04 的三项待人工裁决（关系等级 / LQ 跨线配对 / 曲库）未结案前不得批量推进。
3. 生产计划器只产出计划与门状态；实际内容落盘由人工与工具完成（app/ 为浏览器端，只读）。
4. 平台与冻结技能是**两份实现**（引擎 vs `tools/discern.js`），一致性由回归套件强制，不是自动共享代码。
