# ADR-0017｜单曲完整单元标准层：18 段模型、派生等级与教学法（V3.0）

- 状态：Accepted
- 日期：2026-09-21
- 关联：ADR-0007（转换层与歌曲边界）、ADR-0014（V1.1-A 前台层）、ADR-0015（前台/后台分层与候选库）、
  ADR-0016（艺术化设计系统）、`MOS-SONG-TEACHING-METHOD-V1.0`、
  `MOS-SONG-PRODUCTION-TEMPLATE-V1.0`、`MOS-SONG-PRODUCTION-WORKSHEET-V1.0`
- 范围：**新增独立内容层 + 前台重构 + 工具链**。Song Core Record（`content/songs/**`）**逐字节不变**；
  冻结研究数据（Frozen Skill、W01–W04、候选库、52W·LQ·MM、既有 Calibration）**零改动**。

## 背景

V2.1 前台已经能「听 / 学 / 教 / 传」，但存在三个结构性问题：

1. **歌与周次的强绑定**。V1.1-A 起，歌曲的呈现方式带着「属于哪一周 / 哪一课」的痕迹。
   但音乐其实**可以相对独立地完成门训功能**：一首歌被唱熟、被教出去、在生活里用起来，
   门训就已经在发生。周次绑定价值不大，反而**限制了歌的使用范围**。
2. **「一首歌做到什么程度」无法表达**。歌曲有「详情层 / 登记层」两类记录，
   但**没有**「歌词有没有？简谱有没有？钢琴有没有？示唱有没有？时间轴有没有？」这件事的数据位置。
   于是前台只能笼统地显示「尚未提供」，无法区分「结构已建、内容为空」与「根本没这首歌」。
3. **教学法没有落成标准**。学唱 / 视唱 / 教唱三模式、十步法、光标跟随、四级学习者状态
   只存在于对话与设想中，没有 schema、没有词表、没有可验收的机器表达。

用户同时提出三条具体要求：**只要简谱**（统一格式）、**只要钢琴伴奏**、
**乐谱必须明显、进度可以光标跟随**。

## 决策

### 1. 新增独立内容层 `content/song-units/**`（不碰 Song Core Record）

- 一首歌对应一个**单曲完整单元**（`MUS-SU-NNNN`），按 `song_id` 挂到既有歌曲上。
- 单元**不写入** Song Core Record；`content/songs/**` 逐字节不变。
- **不引用周次、不引用课程**。周次使用是下游**可能出现的消费方式**，不是制作前提。

### 2. 18 段模型 + 两态（`PROVIDED` / `NOT_PROVIDED`）

见模板 `MOS-SONG-PRODUCTION-TEMPLATE-V1.0`：01 歌曲资料 … 18 最终验收。
18 段**必须齐备**（结构完整性），但**允许内容为空**；
「结构完整 + 内容空」是**合法的真实状态**，不是缺陷。

### 3. 四级完成度是**派生**，不是声明

- `L1`（歌词+简谱）/ `L2`（+钢琴）/ `L3`（+示唱+时间轴）/ `L4`（+男女示唱+光标+教学段）。
- 等级由 `app/song-unit.js` 的 `deriveLevel()` 从**实际资源**计算，**绝不写进记录**。
- 取舍理由：**避免「声明即完成」** —— 若等级写在记录里，就会有人先把等级填成 L4 再慢慢补资源。
- 连带硬约束：`status`（生产状态）也必须有**机械前置**成立，否则自相矛盾（`statusConsistent()` 强制）。

### 4. schema 用 `additionalProperties: false` 防漂移

`content/schema/song-unit.schema.json`（JSON Schema 2020-12）**只允许 18 段**，
**不允许私加段落**。防的是「结构无限膨胀」——每加一个字段就多一处要维护/校验的契约。

### 5. 教学法落成标准 + 机器词表

- 标准：`docs/standards/MOS-SONG-TEACHING-METHOD-V1.0.md`（八原则 / 十步法 / 三模式 / 光标标准 / 四级状态 / Day0·2·7）。
- 词表：`content/song-units/index.json` → `teaching_method` / `learner_stages` / `review_cycle` /
  `score_class_keys` / `lyrics_class_keys` / `vocal_keys` / `live_teaching_modules` / `acceptance_groups`。
- 三模式**共用同一首歌**，差别只在**示范出现的时机**：
  学唱先给完整示范；视唱**默认不给**完整示范（先看谱 → 内听 → 唱 → 核对 → 修正）；教唱面向「把歌交给别人」。

### 6. 光标跟随：只按真实标记，绝不插值

- 光标位置来自 `timeline.phrases[].marks`（真实的小节 / 拍 / 音符标记）。
- **不得**按「音频总长 × 比例」推算当前小节 —— 那会给出**假的精度**。
- 没有时间轴就**不显示光标**（`supportedLevels()` 只列真实存在的层级）；宁可没有，也不给会骗人的光标。
- 单调性由 `timelineProblems()` 检查并报出。

### 7. 只做简谱、只做钢琴

- 记谱**只做简谱**，并统一格式（调号 / 拍号 / 小节 / 时值 / 高低音点 / 附点 / 延音 / 休止 / 升降号 / 歌词对齐）。
- 伴奏**只做钢琴**（可复现：家庭 / 小组 / 教室都有钢琴或键盘，不需要其他乐器编制）。
- 示唱 `singer` 字段枚举 `[null]` —— **禁止虚拟歌手**；不得用合成声音冒充真人。

### 8. 四级学习者状态：只记录、不评价

`know → sing_along → sing_alone → can_teach`。`markStage()` **只增不减**；
**不提供通过 / 不通过，不给徽章或奖励**；平台校验器**硬检查**禁止评分 / 排名 / 徽章字段。
间隔复习 Day0 / 2 / 7 只提示「该回来唱了」，**不催不迫、不累计欠账**。

### 9. 可追溯内容（不生成神学内容）

第 14 段（内容理解）与第 15 段（生命实践）中凡写入文本**必须**带 `derived_from`
指向内容层既有字段。**不得凭空生成神学内容** —— 平台只把内容研究到「可以讲 / 可以用」。

### 10. 诚实降级

任何资源缺失一律如实显示为 **「尚未提供」**；不得假装播放、不得用占位图冒充乐谱。
「有步骤、有内容、没资源」是**允许且必须被如实表达**的状态。

### 11. 工作单只派生进度，不写内容

`tools/song-worksheet.js` 派生 STEP00–15 的状态 / 缺口 / A–J 签核表；
**`release.signed_by` 由人工填写，工具不代填**；`PENDING` **不等于通过**；
`release.mechanical_ready` 只是「资源包齐备 + A–J 无 PENDING」，**机械就绪 ≠ 可发布**。

## 取舍记录

| 取舍 | 选择 | 理由 |
|---|---|---|
| 等级写在记录里 vs 派生 | **派生** | 防「声明即完成」 |
| 18 段自由扩展 vs 冻结 | **冻结（`additionalProperties: false`）** | 防结构漂移 |
| 光标按比例插值 vs 只按真实标记 | **只按真实标记** | 不给假精度 |
| 多乐器编配 vs 只钢琴 | **只钢琴** | 可复现 |
| 与周次绑定 vs 独立 | **独立** | 音乐可独立完成门训功能 |
| 评价嗓音 vs 只指方向 | **只指方向** | 不设通过 / 排名 / 徽章 |

## 落地物

- 内容层：`content/schema/song-unit.schema.json`、`content/song-units/index.json`、
  `content/song-units/MUS-SU-0001…0010.json`（10 首详情层歌曲）
- 派生层：`content/production/song-unit-levels.json`、`content/production/song-worksheets.json`
- 程序层：`app/song-unit.js`（纯逻辑）、`app/front/score.js`（渲染+光标）、
  `app/front/review.js`（四级状态+间隔）、`app/front/pulse.js`（节拍器）、
  `app/front/player.js`（多轨 + 单句循环 + 精确 seek）、前台五页重构、`app/ui/v30.css`
- 工具：`tools/song-units.js`（构建/核对）、`tools/song-worksheet.js`（工作单）
- 标准：`docs/standards/MOS-SONG-TEACHING-METHOD-V1.0.md`、`MOS-SONG-PRODUCTION-TEMPLATE-V1.0.md`、
  `MOS-SONG-PRODUCTION-WORKSHEET-V1.0.md`

## 硬边界（本轮未动）

Frozen Skill、W01–W04、2027 52W、LQ、MM、候选库 100 首（`NOT_YET_ASSESSED` / `SOURCE_REQUIRED`、
无排序/评分/推荐字段）、升层试批 5 首、Song Core Record、既有 Calibration —— **逐字节不变**。
`immutable_drift = []`。

## 验收

validate 0/0（含 V3.0 单元完整性 / 派生等级一致性 / 状态机一致性 / 禁评分排名徽章 /
禁虚构资源 / 时间轴单调性硬检查）｜smoke 305/305｜platform-tests 94/94｜
regression 70/70 `immutable_drift=[]`｜derive + song-units --check + song-worksheet --check｜
CDP 121/121（含 V3.0 简谱/光标/三模式/四级状态断言、360/390/430/1366 视口、离线冷启动）。

## 残留

- 10 首详情层歌曲**全部为 `INTAKE` / 等级 `NONE`** —— 这是**真实状态**，
  不得为消除缺口而虚构歌词、简谱、音频或教学内容。
- 简谱**记谱细则**（延音线跨小节、附点与连音边界、多段歌词共用谱写法）只定义了要素清单，
  细则待人工确认（CI-0025）。
- 后台仍保留 Week Music（`#/week/WNN`）与年度单元，与前台「淡化周次」形成双轨（CI-0026）。
- 资源与音频的**技术规格**（简谱渲染输出、音频容器、响度归一）待资源入库前确认（CI-0027）。
