# ADR-0010｜Music Library V0.5 扩库：登记层与辨识层分离

状态：已采纳 ｜ 日期：2026-09-21 ｜ 阶段：V0.5（REAL USE PHASE 第一项实际工作）

---

## 背景

曲库容量自 W04 起枯竭（5 首已被 W01–W04 全部使用），`MUSIC_LIBRARY_CAPACITY_WARNING`
持续生效，W05 起无未使用歌曲可承担主歌（CI-0008）。因此启动曲库扩容：5 首 → 50 首。

扩容要求里有一条看起来只是流程要求、实际是架构要求：

> 清单给出的「初步主题」与「建议用途方向」只是 `library_metadata`，
> **绝不是** `discernment_result`；辨识结论必须由已冻结技能重新产生。

同时，歌曲详情记录（`content/songs/**`）的必填字段包含 `bible.core_passage`（经文锚点），
而候选清单不提供经文锚点 —— 该锚点只能由技能的 S1→S7 流程产生。

---

## 决策

### 1. 新增独立的「入库登记层」内容种类，不改歌曲详情记录契约

- 新增 `content/library/`（清单 / 登记记录 / 索引）。
- 新增两份契约：`library-candidates.schema.json`、`library-intake.schema.json`。
- **不动** `content/schema/song.schema.json`。

理由：

1. `song.schema.json` 位于 Immutable Baseline（`baseline-immutable.json` 收录其哈希）。
   扩库字段（English Title / alternate_titles / translator / initial_theme /
   suggested_function / work_status / 资源四槽 / library_version）并非既有契约的一部分；
   改它会让 `immutable_drift ≠ 0`，与 §十三 直接冲突。
2. 把「登记层」与「歌曲详情层」分成两个文件，是对「初步主题 ≠ 辨识结论」的**结构性保证**，
   而不只是文档里的一句约定：登记层在物理上就没有写辨识结论的字段。
3. 复用已有的 N3 两段化思路：可增长的内容走 Production/Governed 作用域，
   不可变基线只保留真正冻结的对象。

### 2. 两段式入库，第二段在经文锚点产生前一律不启动

| 段 | 触发条件 | 产出 |
|---|---|---|
| 第一段 · 登记 | 清单提供即可 | `content/library/registry.json`（只含元数据） |
| 第二段 · 歌曲详情 | ①经文锚点由技能产生；②CI-0014 已裁决 | `content/songs/**` + 索引 + 主题计数 + 经文登记 |

工具对第二段只做**前置检查**（`preflightSongRecord`），逐条列出缺什么、为什么不能写。
宁缺勿造：缺锚点就不写记录。

### 3. 第一段不触碰不可变基线，因此可零漂移完成

第一段只写 `content/library/**` 与 `content/production/**`，两者都不在不可变基线内，
`immutable_drift` 保持为空。

### 4. 扩库守卫加严而不是放宽

原 CI 守卫是「`content/songs` 下不得超过 5 首（§36 Phase 6 前不许批量导入）」。
本阶段正是 §36 所描述的 `Schema → Prototype → Sample → Validate → **Bulk**` 的批量阶段，
因此上限放宽到 V0.5 目标总数 50 —— 但**同时加严**：
超出基准库的每一首歌曲都必须有对应的入库登记记录，否则 CI 失败。
即：允许扩容，不允许绕过登记层塞歌。

### 5. 容量口径扩容

`libraryCapacity` 增加 §十 要求的全部指标（usable / assessed / unresolved / used / unused /
HIGH risk / REVIEW / BLOCK / evidence insufficient / remaining unique capacity / deficit）。
既有字段语义不变，保持向后兼容。

### 6. 一切新问题进 Calibration Issue，不自行改规则

本阶段登记 CI-0013 … CI-0017，全部 `OPEN`，无一条通过修改已冻结技能解决。

---

## 本阶段发现的两项结构性阻断（未自行修）

### CI-0014｜扩库必需的登记文件位于不可变基线内

扩库会强制修改两个位于 Immutable Baseline 内的文件：

- `content/themes/index.json` 的 `song_count` —— 校验器按曲库主主题统计重算；
- `content/bible/reference-index.json` —— 歌曲详情的经文锚点必须已登记。

于是「正常扩库」必然产出 `immutable_drift ≠ 0`。这是 CI-0003（N3 作用域过宽）的同类缺陷，
只是在曲库维度上再次暴露。

可退的路只有两条，都不是平台能单方面决定的：

- (a) 把 `song_count` 改为工具推导的派生视图（同使用历史推导的先例），经文登记表整体移出不可变基线；
- (b) 不可变基线改为按白名单冻结（skill / docs 校准文档 / W01–W04 周次与单元 / 上游模型），
  `content/**` 下的登记类文件归入 Governed。

**平台不自行重生成基线** —— 那等于把真实变更洗成零漂移。

### CI-0013｜候选清单未提供

清单未随指令交付，入库第一段无输入。工具以 `BLOCKED_PENDING_LIST` 明确失败，
不使用任何占位或推测数据。

---

## 后果

**正面**

- 扩库可零基线漂移地完成第一段，§十三 的既有验收门全部保持全绿。
- 「初步主题不是辨识结论」从约定升级为结构约束 + 校验器硬检查（登记层出现辨识结论字眼即报错）。
- 容量重算、使用历史视图、入库报告三者同源，避免口径漂移。
- 新增 27 项单元测试（平台测试 55 → 82），覆盖词表映射、拒填策略、前置检查与报告口径。

**代价 / 未决**

- 歌曲详情层必须等 CI-0013（清单）与 CI-0014（基线作用域）都结案才能推进，
  即 §十六 的「50 首全部入库」在两项裁决前无法完成。
- 满库 50 首后容量告警仍不解除（CI-0016：45 可用 < 48 周，缺口 3），
  需要人工在「继续扩库 / 明确复用规则 / 缩减年度计划」中选择。
- 库级辨识与周级辨识的两级口径未定（CI-0017），本阶段不做任何辨识。

---

## 参见

- `docs/LIBRARY-V0.5-INTAKE.md`（执行手册）
- `docs/ADR/ADR-0009-sermon-music-production-platform.md`（平台 V1.0 与 N3 两段化）
- `content/production/calibration-issues.json`（CI-0013 … CI-0017）
