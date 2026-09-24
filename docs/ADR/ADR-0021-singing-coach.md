# ADR-0021｜MOS Singing Coach（独立模块）与 AI 反馈原则

- 状态：**Frozen（仅冻结定位与基础层范围）**
- 日期：2026-09-23
- 关联：ADR-0018（音乐系统独立定位）

## 决策一：Singing Coach 与 MOS Formation 完全独立

建立独立产品模块 **MOS Singing Coach**。它**不读取**：

- 52 周课程完成度；
- 门训积分 / 进度记录；
- 门训成绩 / 四级学习状态；
- 周次（WNN）与课程（MUS-C-NN）数据。

它只链接到**歌曲自身的资源**（歌词 / 简谱 / 示唱 / 钢琴 / 表达参考）。
`tools/guard.js` 会检查 `app/coach.js` 与 `app/front/coach.js` 不得出现门训数据源。

## 决策二：核心能力模型（十项）

```text
Pitch / Rhythm / Sight Singing / Breath / Sustain / Diction / Range / Phrasing / Dynamics / Expression
```

每一项都必须写明：**能观察到什么**、**不评价什么**（例如「不评价属灵状态」「不评价天赋高低」）。

## 决策三：本轮只做基础层

完成：数据模型、页面入口、个人训练记录、训练项目模型、反馈结构、
音频上传接口**预留**、AI 分析接口**预留**。

暂时不做：复杂评分、排行榜、比赛、属灵评分、「敬虔程度」评价、自动判断属灵状态。

## 决策四：AI 反馈原则（以后正式实现时同样适用）

不要只输出：

> 92 分

而应输出：

> 这一句音高较稳定。／第三个音稍低。／长音最后一拍容易下降。／这一句可以尝试更连贯。

最终：

> **再唱一次。**

AI **不能**自行判断「你有没有属灵感情」。音乐表达反馈必须基于：
**乐谱 / 优秀示范 / 教师标注 / 声学指标**。

## 落地形状

- 词表与模型：`content/coach/index.json`（+ `content/schema/coach.schema.json`）
- 数据层：`app/coach.js`（能力 / 训练项目 / 反馈构造 / 练习记录 / 两个接口）
- 前台：`app/front/coach.js`，路由 `#/coach`（入口在首页与「我的」，**不进底部导航**）
- 练习记录：IndexedDB `coach_sessions`（store 升级 → `DB_VERSION = 4`），只存事实，不存分数
- 反馈结构：`target / observed / descriptor / next_action / retry_prompt`
- 两个预留接口当前状态：`RESERVED_NOT_CONNECTED`
  - 音频上传：只在本机保存与回听，**没有任何上传动作**（本轮没有后端）；
  - AI 分析：调用时**如实返回「未接入」**，绝不假装分析、绝不编造反馈。

## 实测现状（2026-09-23）

- 能力 10 项、训练项目 10 项，**全部 `MODEL_ONLY`**（模型就位、课程内容未生产）—— 这是真实状态；
- 练习记录 0 条（尚未有用户）；
- 已接入厂商 **0**。
