# MOS-MUSIC｜Song Discernment Skill V1.0 回测报告（W01–W03）

日期：2026-09-21 ｜ 阶段：Phase 2A.2（Skill 创建与回测）｜ 结论：**BACKTEST ALL PASS（4/4 用例 + 验收 A–G 全过）**

- Skill：`mos-music-song-discernment` V1.0.0（`~/.workbuddy/skills/mos-music-song-discernment/`）
- 运行器：`tools/discern.js`（零依赖，只读上游）
- Ground Truth：**Phase 2A.1 冻结人工裁决**（各单元 `review_gate` + `PHASE-2A-THEOLOGICAL-REVIEW.md`）
- 上游快照：`tests/upstream-hashes.json`（14 个上游文件，回测 A 项要求哈希一致）

> 说明：本次任务指令中提到「Phase 2A.2 人工裁决结果」作为 Ground Truth。项目内实际存在并已冻结的
> 人工裁决即 Phase 2A.1 的冻结结论（W01 Confirmed / W02 Theme_Response+Under Review / W03 主歌
> Confirmed / 辅助歌 Tier B+Under Review），回测即以此为基准，未修改任何上游文件。

---

## 一、回测结果表

| Week | Song | Expected | Actual | Pass |
|---|---|---|---|---|
| W01 | 奇异恩典 MUS-S-0001 | Direct / Confirmed（Tier A） | `direct_biblical_expression` / `confirmed` / Tier A / under_review | **PASS** |
| W02 | 我灵镇静 MUS-S-0002 | Theme_Response / Under Review | `theme_response` / `needs_human_review` / Tier B / under_review + **risk F** | **PASS** |
| W03 | 耶稣呼召 MUS-S-0003 | Confirmed（Direct） | `direct_biblical_expression` / `confirmed` / Tier B / under_review | **PASS** |
| W03 | 一切全献上 MUS-S-0005（辅助） | Tier B / Under Review（+道德主义风险） | Tier B / under_review + **risk A** | **PASS** |

---

## 二、回测验收 A–G

| 项 | 内容 | 结果 |
|---|---|---|
| A | 上游不变（14 个上游文件哈希一致） | **PASS**（unchanged） |
| B | Song_Relation 正确（W01 Direct / W02 Theme_Response / W03 主歌 Direct） | **PASS** |
| C | 神学风险识别正确（W03 道德主义 A / W02 对齐风险 F） | **PASS** |
| D | S6 检查有效（三周均四要素齐备） | **PASS** |
| E | S7 检查有效（三周均成立） | **PASS** |
| F | 歌曲 ≠ 完整门训单元（显式声明 `song_is_complete_unit=false`） | **PASS** |
| G | Tier 与 Review Status 独立（两字段分别输出且不相等） | **PASS** |

---

## 三、Decision Trace（每周结构化判断依据）

### W01｜奇异恩典

1. **选此歌**：歌曲标签与本周核心真理的恩典性行动词共现（恩典）——直接表达同一真理。
2. **关系判定**：`direct_biblical_expression`（与核心真理行动词共现）。**不是** theme_response，因为歌曲陈述的是与经文同一的救恩内容，而非仅回应经文的姿态。
3. **主功能**：`EM`（取自歌曲 `formation.primary_function`；周功能 TR/EM）。
4. **S6**：四要素齐备 —— 对象（一件具体难处/某段关系）／内容（改写成感恩交托祷告）／时间（本周至少三次）／方式（写下来）。
5. **S7**：成立且含验证（讲给家人 + 约下周同唱）。
6. **神学风险**：未发现。
7. **Tier A 理由**：歌曲完成完整辨识、真理维度 5/5、跨代可唱且为会众共同记忆。
8. **Review Status `under_review` 理由**：歌曲生命周期由人工审核决定，与本周适配裁决 `confirmed` 属**两个层级**。

### W02｜我灵镇静

1. **选此歌**：歌曲记录明确声明为间接呼应/主题级、非经文直译，且无恩典性行动词共现。
2. **关系判定**：`theme_response`。**不是** direct —— 歌曲回应的是「恩典主权」的神学前设与「信靠/安静」的情感姿态，未承接经文「恩典越界、接纳圈外人」的主张。
3. **主功能**：`EM`（周功能 TR/EM/CO）。
4. **S6**：四要素齐备（对象：一位圈外人；内容：约餐/换座/具体接纳；时间：本周；方式：组长检查分座分组习惯）。
5. **S7**：成立，但**缺互报/验证机制** → 记改善提示（不判失败，与人工裁决一致）。
6. **神学风险**：`F[HIGH]` 对齐风险——本周功能含 TR/CO（真理/共同体导向），而歌曲仅为主题级回应，可能以安静/情感取代经文主张。
7. **Tier B 理由**：适合特定主题/场景，但非核心母库资源。
8. **Review Status `under_review` 理由**：与人工裁决一致，**不得升级为 Core**。

### W03｜耶稣呼召（主歌）

1. **选此歌**：歌曲标签与核心真理行动词共现（呼召）——直接表达同一真理。
2. **关系判定**：`direct_biblical_expression`（主语是基督的呼召，与路5 呼召结构同构）。
3. **主功能**：`LI`（周功能 LI/TR/EM）——「放下…跟从」可直接翻译成具体顺服行动。
4. **S6**：四要素齐备（对象：一位家人/小组；内容：认错/停止不诚实做法/加入小组；时间：本周并写下完成时间；方式：三选一 + 记录）。
5. **S7**：成立且含验证（带一位肢体走七步法，下次聚会互报「行」与「传」）。
6. **神学风险**：未发现（歌曲有基督论锚点「呼召主的主权」，可防道德主义）。
7. **Tier B 理由**：教义与场景适配良好，但尚未进入核心母库。
8. **Review Status `under_review` 理由**：同 W01，层级分离。

### W03｜一切全献上（辅助歌）

1. **选此歌**：歌曲仅提供姿态类情感回应（降服），未承接经文主张。
2. **关系判定**：`theme_response`（辅助使用，不作为经文直译）。
3. **主功能**：`EM`。
4. **S6**：四要素齐备（由单元 S6 承担，不由歌曲承担）。
5. **S7**：成立且含验证（单元 S7）。
6. **神学风险**：`A[HIGH]` 道德主义 —— 无基督论/救恩论锚点 + 自我献上语汇（献上/降服）；`B[NOTE]` 情感功能为主而真理维度 3/5；`F[HIGH]` 对齐风险。
7. **Tier B 理由**：与人工裁决一致（Tier B）。
8. **Review Status `under_review` 理由**：与人工裁决一致；**不删除、不得作 Core**。

---

## 四、Calibration Findings（Skill 与人工裁决的差异）

### C1（层级澄清，最重要）

人工裁决中的 **「Confirmed」** 指**本周适配裁决**（`review_gate.theological_review=confirmed`），
而歌曲自身的**生命周期状态**在 W01/W03 均为 `under_review`。
Skill 必须把这两者**分层输出**（`week_fit_verdict` vs `review_status`），否则会把歌曲状态误报为
Confirmed 或把适配裁决误降为 Under Review。→ **已写入 SKILL.md 第十三节，不可合并。**

### C2（Skill 在辅助歌上比人工裁决更保守，方向一致）

对 W03 辅助歌《一切全献上》，人工裁决只要求「Tier B / Under Review + 道德主义风险」，
**未指定 Song_Relation**；Skill 额外判定 `theme_response` 并触发 `F[HIGH]` 对齐风险。
这不是 Calibration Failure：风险方向与人工裁决一致（都认定该歌不能作 Core、必须保持
福音结构），属于**保守侧扩展**。已记录为：辅助歌关系未定级时，Skill 输出关系 + 对齐风险，
交人工复核，不阻断辅助使用。

### C3（Skill 暴露了人工裁决未显式指出的 S7 弱点）

W02 的 S7 缺少互报/验证机制（相对 W01 的「约下周同唱」与 W03 的「互报行与传」）。
人工裁决未将此列为问题；Skill 记为**改善提示**而非失败，避免僭越人工裁决。
→ 建议 Phase 2B 生产时，为 EM 型歌曲周补上可验证的传递机制。

### C4（模型问题：无）

回测**未发现** Phase 2A.1 模型的矛盾或缺口：七步法、转换层、歌曲边界、Tier/Review 独立性
在三个样本周上全部自洽。唯一需要固化的是 C1 的**两层裁决分离**（已在模型层与技能层同时落盘）。

---

## 五、未做的事（边界确认）

未修改 52W、经文、Core Truth、LQ、MM01–MM24（上游哈希 `unchanged` 为证）；
未修改 W01–W03 人工裁决；未生产 W04–W52；未批量导入歌曲/歌词/音频。
