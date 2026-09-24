# MOS LIFE HYMN｜V3.x 产品方向冻结与资源生产基础升级

> 本文是 V3.x 的**方向性权威文本**（冻结）。
> 本轮重点**不是**增加大量 UI 功能，而是确保后续 100 首歌曲生产**不会走回头路**。
> 决策记录：ADR-0018（独立定位）、ADR-0019（分类 V1.1）、ADR-0020（资源模型 / Reuse First）、ADR-0021（Singing Coach）。

---

## 〇、起点

V3.0 已完成：单曲 18 段结构｜L1–L4｜教学十步法｜学唱 / 视唱 / 教唱｜简谱核心｜
男女示唱 + 钢琴资源模型｜时间轴与光标｜前台独立于 52 周课程｜全量验收通过。

## 一、正式冻结 MOS Music 的独立定位

> **MOS Music 是独立的音乐学习、歌唱训练、教唱与生命形成系统。**

- 不以 52 周经文为组织中心；
- 不以门训课程为组织中心；
- 不以讲章为组织中心；
- 歌曲自身可以独立成立；
- 课程可以引用音乐，音乐也可以被课程引用；
- 两者相连，但**互不从属**。

**前台不突出 W01 / W02 / W03……；后台保留历史引用关系；不得删除已有后台 Week Music 数据。**

## 二、歌曲分类 V1.1（四维）

| 维度 | 回答 |
|---|---|
| 01 主题 | 歌曲主要表达什么（敬拜 / 恩典 / 救恩…… 词表沿用内容层既有词，未新增） |
| 02 处境 | 人在什么情况下可能需要这首歌（词取自记录本身的 `formation.emotion`） |
| 03 场景 | 在哪里使用（个人 / 家庭 / 小组 / 主日……） |
| 04 音乐 | 难度 / 速度 / 音域 / 拍号 / 适合视唱 / 适合群体歌唱 / 适合个人练习 |

## 三、分类原则

> **分类只是帮助用户找到歌曲。它不是歌曲的身份。**
> 一首歌可以同时出现在多个分类中。不要让歌曲只能属于一个类别。

## 四、歌曲内容层

保持：`meaning` / `scripture` / `background` / `reflection` / `practice` / `prayer`。
这些内容**属于歌曲本身**，不得重新绑定 W01 / W02 / 某一课 / 某一次讲道。

## 五、完整歌曲资源模型

见 ADR-0020。要点：`lyrics / score / timeline / demo（human_* + ai_*）/ accompaniment(piano) /
teaching / content / personal`。新增一律可选字段，不改冻结字段含义。

## 六、真人示唱资源策略：Reuse First

来源类型：`EXTERNAL_HUMAN_MALE / EXTERNAL_HUMAN_FEMALE / MOS_HUMAN_MALE / MOS_HUMAN_FEMALE / AI_MALE / AI_FEMALE`。
前台显示「男声示唱 / 女声示唱」，来源类型内部记录。

## 七、外部真人版本的分段能力

支持 `source_url / start / end / phrase_id`：同一完整真人版本可切出整曲 / 分节 / 副歌 / 难句。
**不得**未经许可下载、重新上传为 MOS 自有资源；优先原站播放 / 嵌入 / 时间段定位。

## 八、真人示唱 + 简谱同步

`song → phrase → score → lyric → external_human_audio → start / end`，
实现「点某句谱 → 播放对应真人示范」。当前无真实音频 ⇒ `SYNC_NOT_READY`（不插值）。

## 九、AI 示唱

保留 `AI_MALE` / `AI_FEMALE` 为正式资源类型；**本轮不接入具体厂商**，
只完成 API abstraction / resource schema / player support / metadata / source tracking。
AI 轨不计入等级、不冒充真人。

## 十、钢琴

**Piano First**：只保留钢琴为标准伴奏，支持整曲 / 分句 / 循环 / 速度。

## 十一 & 十二、MOS Singing Coach

独立产品模块，与 MOS Formation 完全独立。核心能力十项（Pitch / Rhythm / Sight Singing / Breath /
Sustain / Diction / Range / Phrasing / Dynamics / Expression）。
本轮只做基础层：数据模型 / 页面入口 / 个人训练记录 / 训练项目模型 / 反馈结构 /
音频上传接口预留 / AI 分析接口预留。不做复杂评分、排行榜、比赛、属灵评分、「敬虔程度」评价。

## 十三、AI 反馈原则

不输出「92 分」，而输出「这一句音高较稳定 / 第三个音稍低 / 长音最后一拍容易下降 / 可以更连贯」，
最后是「再唱一次」。AI 不能判断「有没有属灵感情」；音乐表达反馈只基于乐谱、优秀示范、教师标注、声学指标。

## 十四、表达参考预留结构

`expression_reference`：phrase / dynamics / phrasing / breath / emphasis / climax / release / vocal_tip。
来源只能是真人；AI 以后只做分析 → 比较 → 提示。

## 十五 & 十七、100 首资源普查（先普查再生产）

`tools/song-resource-discovery.js` 为 100 首逐首记录：
`score_found / lyrics_found / human_male_found / human_female_found / piano_found / teaching_found /
source_url / source_name / source_type / next_action`，
状态 `FOUND / NOT_FOUND / VERIFY / REUSE / CREATE`（+ `UNSURVEYED` 表示尚未检索）。

**本轮不开始制作 100 首实际资源**：先知道 100 首里真正需要 MOS 自己做多少。

## 十六、资源生产优先级

> **找现成 → 核版本 → 能用就用 → 缺什么补什么 → 最后自己制作。**
> 不要重新制作网上已经存在的高质量资源。

## 十八、前台设计原则

用户看到：**主题 / 处境 / 场景 / 音乐**。
用户不看到：`calibration`、`source_required`、`governance`、`W01`、`W02` —— 除非进入后台。

## 十九、保护现有研究数据

不得修改：Frozen Skill、W01–W04、现有研究裁决、Candidate 状态、52 周后台历史引用。

## 二十、验收

validate / smoke / platform-tests / regression / derive / discernment / guard / CDP，
并新增检查：分类完整性、外部真人资源字段、分段时间轴、AI 资源类型、Singing Coach 接口、100 首资源普查工具；
`immutable_drift = []`。

## 二十一、停止条件

本轮结束后**不开始制作 100 首实际资源**。输出两份报告：
`MOS_MUSIC_V3.X_RESOURCE_DISCOVERY_REPORT.md`、`MOS_MUSIC_V3.X_PRODUCT_BOUNDARY.md`。
完成后停止。

---

## 最终目标

不是建立一个更复杂的音乐数据库，而是建立：

> **一个可以独立使用、可以学习歌唱、可以培养视唱、可以提高技巧、可以长期陪伴个人成长，
> 同时也可以自然进入教会共同体的音乐系统。**
