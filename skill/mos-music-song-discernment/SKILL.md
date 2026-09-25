---
name: mos-music-song-discernment
description: MOS-MUSIC 音乐门训的歌曲辨识与选歌技能。当需要判断一首候选歌曲是否适合承担某一周的圣经真理与门训形成功能（八维辨识、Song_Relation、Primary_Function、S6 实践转换、S7 传递转换、神学风险、Tier/Review Status、使用决定），或提到 MOS-MUSIC 选歌／歌曲辨识／音乐门训单元／W01–W52 音乐层生产时使用。禁止反向选歌（不得由歌曲倒推经文/核心真理/LQ/MM）。已在 W01–W03 冻结样本上回测通过。
version: 1.0.0
status: Frozen
frozen_at: 2026-09-21
backtest: W01–W03 ALL PASS（4/4 用例 + 验收 A–G；报告见 MOS-MUSIC docs/SKILL-SONG-DISCERNMENT-BACKTEST-W01-W03.md）
agent_created: true
---

# MOS-MUSIC｜歌曲辨识与选歌技能 V1.0

> **不是「帮我找一首合适的歌」，而是「判断哪一首歌能够在已经确定的圣经真理和门训目标之下，承担合适的形成功能」。**

固定链条（**顺序不得颠倒**）：

```text
圣经 → 释经 → 核心真理 → LQ → MM 主题 → 音乐功能 → 歌曲辨识 → 七步法 → S6 行 → S7 传 → 生命形成
```

---

## 一、Skill 用途

根据**已经确定**的圣经经文、释经核心、核心真理、LQ、MM 主题与音乐门训功能，
对候选歌曲进行**神学、门训、形成**三层辨识，并判断该歌曲是否适合承担本周的音乐门训功能。

核心原则：**先经文，后音乐；先真理，后歌曲。**

本技能**不是**歌曲推荐器，**不是**曲库管理器，**不是**敬拜歌单工具。

---

## 二、绝对禁止：反向选歌

允许的方向：

```text
52W 经文 → 核心真理 → LQ → MM 主题 → 音乐门训功能 → 候选歌曲 → 歌曲辨识 → 使用决定
```

禁止的方向：

```text
歌曲 → 寻找经文 → 修改核心真理 → 修改 LQ → 修改 MM 主题
```

若候选歌曲无法很好匹配：

1. **不得修改上游内容**（经文、核心真理、LQ、MM 一律不动）；
2. 必须输出 `Needs Human Review`；若候选中确无合适歌曲，输出 `No Suitable Song Found`。

---

## 三、输入（Input）

每次调用至少需要（字段名对应项目 Schema）：

| 输入 | 来源 | 说明 |
|---|---|---|
| `Year` / `Week_ID` | `content/annual/<year>/` | 年度实例与周次 |
| `Bible_Passage` | 正式 52W 来源（`2027-WNN.json` 的 `bible_passage_id`） | 只引用，不复制释经数据 |
| `Core_Truth` | 正式 52W 来源（`core_truth.text`，`copy_policy=reference_only`） | 不得自行改写 |
| `LQ_ID` / `LQ_Text` | MOS 既有 LQ01–LQ08 | 不新建第二套 LQ |
| `MM_ID` | `content/framework/music-units.json`（MM01–MM24） | Framework 母库，不是年度计划 |
| `Music_Function` | 周记录 `music_function[]` | TR/MM/EM/PR/CO/LI/MI/RP |
| `Candidate_Songs` | 现有 Music Library（`content/songs/`） | **库中没有就报没有，不得自行制造歌曲资料** |
| （可选）`Proposed_S6` / `Proposed_S7` | 单元草案 | `audit` 模式下用于检查实践/传递转换 |

缺失输入一律：停止 → 报 `Needs Human Review`（资料不足），不得臆测。

---

## 四、工作流程（Workflow）

1. **加载上游**：读周记录（经文/核心真理/LQ/MM/功能），读 MM 母库定义，读候选歌曲记录。
2. **上游不变检查**：确认本次运行不写任何上游文件（工具只读）。
3. **八维辨识**：逐维评估（见第六节），每维给出分数依据与缺口。
4. **Song_Relation 判断**（见第七节）。
5. **Primary_Function 判断**（见第八节）。
6. **S6 实践转换检查**（见第九节）。
7. **S7 传递转换检查**（见第十节）。
8. **神学风险扫描**（见第十一节，必扫 A–E）。
9. **Tier / Review Status 读取**（见第十二、十三节，两字段独立）。
10. **Decision 判定**（见第十五节）。
11. **输出**：按第十四节格式输出结构化结果 + Decision Trace（第二十节）。

机器可执行实现：`tools/discern.js`

```bash
# 单周辨识（audit 模式，带候选 S6/S7）
node tools/discern.js --project <MOS-MUSIC 路径> --week 2027-W02

# 历史回测（W01–W03，对照冻结人工裁决）
node tools/discern.js --project <MOS-MUSIC 路径> --backtest
```

---

## 五、输出（Output）

固定格式见**第十四节**；字段名与项目 Schema 对齐：

- `song_relation` → `discipleship-unit.schema.json#review_gate.song_relation`
- `theological_risk` / `practice_conversion` / `transmission_conversion` → 同上 `review_gate`
- `theological_note` → `song.schema.json`
- `tier` / `review_status` → `song.schema.json`（两字段独立，见第十二、十三节）

---

## 六、八维歌曲辨识框架

每首候选歌曲必须逐维检查。**评分是 1–5 + 说明，禁止合成总分，禁止「好歌/坏歌」结论。**

| # | 维度 | 检查内容 |
|---|---|---|
| 01 | **圣经真理** Biblical Truth | 是否与圣经真理一致；是否有明显经文误用；是否把个人经验置于圣经真理之上 |
| 02 | **神学形成** Theology | 神论 / 基督论 / 救恩论 / 圣灵论 / 教会论 / 门徒论 / 宣教论 / **福音结构**。不要求每首歌含完整系统神学，重点是**不产生明显神学偏差** |
| 03 | **情感形成** Emotional Formation | 形成的是喜乐/感恩/敬畏/悔改/信靠/安慰/盼望/渴慕/悲伤/委身中的哪一种；**情绪是否受到真理塑造**（不是"能否制造强烈情绪"） |
| 04 | **共同体** Community | 能否帮助「我相信」进入「我们相信」：共同歌唱、彼此教导、群体身份、教会共同记忆 |
| 05 | **会众参与** Congregational Participation | 普通会众能否参与；是否过度依赖专业演唱；是否适合小组/家庭 |
| 06 | **代际传递** Intergenerational | 儿童 / 青少年 / 成人 / 家庭是否具有合理传递可能 |
| 07 | **生活实践** Life Practice | **本技能重点**：歌曲本身**不能自动等于**生命实践；检查歌曲表达的真理**能否通过 S6 转换成具体生活行动** |
| 08 | **使命方向** Mission | 能否合理支持见证 / 爱邻舍 / 服事 / 差派 / 万民 / 门徒再生产（不要求每首歌直接讲宣教） |

---

## 七、Song_Relation 判断

**沿用项目既有枚举**（`discipleship-unit.schema.json#review_gate.song_relation`），不创造新枚举：

| 枚举值（Schema 规范值） | 含义 |
|---|---|
| `direct_biblical_expression` | 歌曲与本周经文核心真理存在**直接而明确**的关系 |
| `theme_response` | 不是经文直接释经，但能**合理回应本周主题** |
| `narrative_response` | 歌曲叙述与本周经文同构的场景/事件 |
| `not_yet_assessed` | 证据不足，须人工裁决 |

判定依据（可复现规则，见 `tools/discern.js`）：

1. 歌曲自身的神学/经文主题与本周 **核心真理的恩典性行动词**（恩典/救恩/呼召/差遣/悦纳/释放/赦免/寻回/重生…）有交集 → `direct_biblical_expression`；
2. 无交集，但歌曲主题为**姿态类词汇**（信靠/安静/交托/盼望/敬畏/忍耐/感恩）且以情感功能为主 → `theme_response`；
3. 歌曲叙述与经文场景同构（如"耶稣呼召—撇下—跟随"）→ `narrative_response`；
4. 其余或证据不足 → `not_yet_assessed` + `Needs Human Review`。

**样例（不得升级表述）**：W02《我灵镇静》= `theme_response`，**不得**写成 `direct`。

---

## 八、Primary_Function 判断

从既有功能码中选择**一个主功能**（`music_function` 枚举）：

```text
TR = Truth Teaching    MM = Memory        EM = Emotional Formation   PR = Prayer
CO = Community         LI = Life Practice MI = Mission               RP = Reproduction
```

- `Primary_Function` **必填**；可以有序的辅助功能。
- **不得**为了让一首歌「看起来完整」而填满所有功能（校验器与人工审查都会拒绝）。

---

## 九、S6 实践转换检查（核心检查）

必须回答：**这首歌表达的真理，如何进入具体生活？**

S6 必须同时具备四要素：

```text
Object  对象：对谁做（具体的人/具体的难处）
Content 内容：做什么（具体行为，不是感受）
Time    时间：什么时候完成（本周/今天/三次…）
Method  方式：怎么做、如何查验
```

不合格（S6_Insufficient）：

> 本周更加爱主。／本周更加信靠神。／本周更加委身。

合格：

> 本周主动联系一位平时较少接触的人，在本周内安排一次具体交流，认真聆听对方，并采取一个具体行动表达接纳。

规则：**歌曲本身不足以产生行为**；歌曲 + S6 具体行动设计 = 音乐进入生命实践。
缺任一要素 → 标记 `S6_Insufficient`，并输出 `Needs Human Review`（若 S6 由本技能起草，则退回重写，不得放过）。

---

## 十、S7 传递转换检查

必须回答：**这个音乐门训内容如何传给另一个人？**

检查三要素：

```text
Target        传给谁（一位家人/一位肢体/孩子/组员…）
Channel       通过什么方式（解释/讲述/共同歌唱/带他走七步法…）
Verification  如何知道传出去了（下周互报/复述/一起完成…）
```

- 「把歌曲分享给朋友」**不自动**等同于门徒传递；重点是**传递真理与形成，而不是传递音乐文件**。
- 缺 `Verification` 不判失败，但必须记为**改善提示**（本组样本中 W02 属此类）。

---

## 十一、神学风险检查（必扫 A–E）

| 风险 | 表现 | 校准方向 |
|---|---|---|
| **A 道德主义** | 我要努力献上自己 → 所以我成为好门徒 | 基督呼召 → 恩典 → 人回应 → 跟随 |
| **B 情绪取代真理** | 我唱得很感动 → 所以我已经被改变 | 拒绝该推论；情绪须由真理塑造 |
| **C 歌曲替代释经** | 把歌曲解释成经文本身 | 歌曲回应经文，不等于经文 |
| **D 个人经验取代福音** | 大量「我的感觉/我的经历/我的需要」 | 仍须以神、基督、福音、圣经为中心 |
| **E 实践空洞化** | 最终只有「更加爱主」 | 标记 `S6_Insufficient` |
| **F 对齐风险（本技能补充）** | `theme_response` 歌曲只承接神学前设/情感，未承接本周经文的主张，而本周功能含 TR/CO/MI | 提高为 `Needs Human Review`，不得径行通过 |

风险等级：`HIGH`（阻断通过，须人工复核）／`NOTE`（记录，不阻断）。

---

## 十二、Tier（资源等级）

沿用 `song.schema.json#tier`，**独立字段**：

- **Tier A**：MOS 核心库（完成完整审核，适合核心门训）
- **Tier B**：MOS 推荐/辅助库（适合具体主题或场景）
- **Tier C**：MOS 研究资源（有使用或研究价值，尚未完成完整辨识）

Tier 由**辨识证据**支持，不由「好不好听」「流不流行」决定。

---

## 十三、Review Status（审核状态）

沿用既有七态（`song.schema.json#review_status`），**不另创生命周期**：

```text
draft · under_review · approved · core · recommended · research · archived
```

**铁律**：`Tier` 与 `Review Status` 是**两个独立字段**，不得混用、不得互相推导。

层级区分（易错点）：**歌曲生命周期状态**（歌曲自己的 `review_status`，如 `under_review`）
与**本周适配裁决**（单元 `review_gate.theological_review`：`confirmed`/`needs_human_review`/`not_yet_validated`）
是**两个不同层级**的判断，输出时必须分别给出，不得合并成一个"Confirmed"。

---

## 十四、输出格式（固定）

```text
MOS-MUSIC SONG DISCERNMENT RESULT

Week:
Bible Passage:
Core Truth:
LQ:
MM Theme:

Candidate Song:

Song_Relation:
Primary_Function:

Eight-Dimension Discernment:
1. Biblical Truth:
2. Theology:
3. Emotional Formation:
4. Community:
5. Congregational Participation:
6. Intergenerational:
7. Life Practice:
8. Mission:

S6 Practice Conversion:
Object:
Content:
Time:
Method:

S7 Transmission Conversion:

Theological Risks:

Gospel Structure:

Tier:

Review Status:

Decision:

Reason:

Human Review Required: YES / NO
```

附加字段（项目实际使用）：`Week_Fit_Verdict`（confirmed / needs_human_review / not_yet_validated）、
`Not_Yet_Validated`（真实会众反馈，只能在使用中验证）。

---

## 十五、Decision 逻辑

Decision **不等于**「好歌／不好歌」：

| Decision | 含义 |
|---|---|
| `Core Candidate` | 适合进入 MOS 核心候选（关系直接 + 真理维度充分 + 无 HIGH 风险 + S6/S7 成立） |
| `Recommended` | 适合年度使用，但不是核心母库 |
| `Research` | 值得保存和研究，但暂不用于核心生产（资料不完整/维度偏低） |
| `Needs Human Review` | 资料或神学判断不足（含 HIGH 风险、对齐风险、证据不足） |
| `No Suitable Song Found` | 当前候选中没有合适歌曲 |

判定顺序（先阻断，后定级）：

```text
候选为空                        → No Suitable Song Found
资料不完整（八维缺项/未辨识）      → Research
存在 HIGH 风险或对齐风险          → Needs Human Review
关系 direct + 真理维度≥4 + S6✓S7✓ → Core Candidate
关系 direct/theme + S6✓S7✓       → Recommended
其余                            → Needs Human Review
```

---

## 十六、停止条件（Stop Conditions）

出现以下任一情况**立即停止**，不得继续"想办法让它通过"：

1. 候选歌曲不在 Music Library 中（禁止制造歌曲资料）；
2. 上游缺失或与冻结版本不一致（经文/核心真理/LQ/MM 任一无法确认）；
3. 需要修改上游才能匹配（经文、核心真理、LQ、MM 一律不动）；
4. 存在 HIGH 风险且无法在不改上游的前提下化解；
5. 发现要求"批量生产 W04–W52"或"批量导入歌曲/歌词/音频"——本技能不执行批量生产。

---

## 十七、禁止事项（Prohibitions）

1. 禁止反向选歌（歌曲 → 经文/真理/LQ/MM）。
2. 禁止修改 52W、经文、Core Truth、LQ、MM01–MM24、MOS-DIS、MOS-GOV、EBRM。
3. 禁止把 `Tier` 与 `Review Status` 混为一个字段。
4. 禁止把「唱了/感动了」当作已改变（风险 B）。
5. 禁止把 `theme_response` 写成 `direct`。
6. 禁止为了一首歌填满所有功能码。
7. 禁止把「分享歌曲文件」当作门徒传递。
8. 禁止批量导入歌词/音频，禁止托管未授权内容。
9. 禁止跳过 S6 四要素检查。
10. 禁止因为"技能方便"而降低神学审核标准。

---

## 十八、回测规则（Backtest）

- Ground Truth：**已冻结的人工裁决**（W01–W03，见 `docs/PHASE-2A-THEOLOGICAL-REVIEW.md` 与各单元 `review_gate`）。
- 回测**不得修改**原始 W01–W03（上游哈希必须一致，见 `tests/upstream-hashes.json`）。
- 回测必须输出 **Decision Trace**（第二十节），不得只报最终答案。
- 不通过时：**只改 Skill，不改人工裁决**；版本 V1.0 → V1.0.1（校准），不得直接跳到 V2.0。
- 用例与期望值：`tests/backtest-w01-w03.json`。

---

## 十九、Decision Trace（回测必填）

每周至少说明 8 项：

1. 为什么选这首歌；2. 为什么不是另一种 Song_Relation；3. 为什么属于这个 Primary_Function；
4. S6 是否成立；5. S7 是否成立；6. 是否存在神学风险；7. 为什么进入该 Tier；
8. 为什么是当前 Review Status。

---

## 二十、版本信息

| 项 | 值 |
|---|---|
| Skill 名称 | MOS-MUSIC｜歌曲辨识与选歌技能 V1.0 |
| Skill ID | `mos-music-song-discernment` |
| 版本 | `1.0.0`（冻结后不再改动；如需校准只允许 V1.0.1） |
| 状态 | **`Frozen`**（2026-09-21；W01–W03 回测 4/4 + 验收 A–G 全通过） |
| 依赖 | MOS-MUSIC Phase 2A.1（`docs/MODEL-CALIBRATION-V1.0.md` 已冻结） |
| 对应 ADR | ADR-0007（转换层与歌曲边界）、ADR-0008（本技能） |
