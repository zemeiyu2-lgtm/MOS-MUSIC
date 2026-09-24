# ADR-0015｜前台/后台分层与 100 首目标候选库（MOS 生命诗歌软件 V2.0）

- 状态：Released（platform-2.0.0 / MUS-V-0.7.0）
- 日期：2026-09-21
- 关联：ADR-0001（独立 origin）、ADR-0004（EBRM 范式）、ADR-0010（V0.5 登记层）、
  ADR-0012（版权词表维度）、ADR-0013（锚点认定与升层）、ADR-0014（V1.1-A 结构层）、CI-0024

## 1. 背景

V1.1-A 完成后，平台进入真实使用。真实使用反馈表明：生产工具的模块化导航
（12+ 模块、多级视图）对讲员、敬拜同工与普通使用者构成理解负担。
同一时间，人工提供了《MOS Life Hymn Library V2｜100 首目标曲库》CSV，
要求全部 100 首进入统一候选目录，但**不因此升层、不因此推荐**。

## 2. 决策

### 2.1 前台/后台分层（信息架构，不删能力）

- **前台（普通用户）**：底部导航只保留三项——首页（今天一起唱）、歌曲（生命诗歌本）、
  我的（我的歌）。前台二级为歌曲页（一页解决：唱/懂/活/教/传）、学唱模式、教唱模式。
  前台一律使用普通语言：资源缺失显示「尚未提供」，辨识缺失显示「介绍尚未提供」，
  不出现 tier / NOT_ASSESSED / NOT_IMPORTED / review_status 等工程词。
- **后台（管理者）**：既有全部模块与路由**原样保留**（生产、人工审查、曲库管理、
  Calibration、歌曲研究档案 #/song-detail/、周音乐、24 课、七步法、培训、反馈、
  内容治理），由「我的 → 后台入口」进入。普通用户不直接面对，但能力一个不删。
- 前台程序文件由校验器约束：不得出现后台术语与歌曲 ID 硬编码（validate V2.0 段）。

### 2.2 候选库（第四层结构的正式落地）

- 新增 `content/candidates/index.json`（100 条，由 `tools/build-candidates.js` 从
  人工提供的 CSV 生成；CSV 原样拷贝至 `content/candidates/source/`）。
- 层级链：**候选库（candidates）→ 详情库（content/songs，10）→ 实际使用
  （library-usage）→ 精选库（前台精选，仅来自已人工确认单元）**。
- 铁律：全部候选 `discernment_status=NOT_YET_ASSESSED`、`copyright_status=SOURCE_REQUIRED`
  （ADR-0012 维度：来源与行动状态）；CSV 行序保持原序，**不构成推荐排序**；
  候选记录禁止 score/rank/rating 字段（validate + regression 断言锁定）。
- song_id 规范化：CSV 的 `S-NNNN` → `MUS-S-NNNN`，`csv_song_id` 保留溯源。
  MUS-S-0001…0050 与曲库 V0.5 重合（层级信息运行时联查，不复制数据）；
  MUS-S-0051…0100 仅候选层（不自动登记、不自动升层——升层路径见 ADR-0013）。
- `front_tags`（13 主题 / 7 场景）为**录入期关键词初分类**
  （`provisional_intake_classification`），仅供浏览筛选，不是辨识结论。
  词表放在候选索引（内容层），程序不得硬编码（§34）。

### 2.3 爱唱机制与学唱/教唱/传唱

- 「我的歌」存本地 IndexedDB（`my_songs` store，DB_VERSION 3，用户层 + outbox）：
  ❤️ 喜欢 / 📚 正在学 / 🎤 教过 / ↗️ 传过 / 🕘 最近唱过。**无积分、无排行榜**。
- 播放器为真实实现（audio.playbackRate 0.5/0.75/1.0、loop、示范=RECORDING/LEAD_VOCAL、
  陪唱=ACCOMPANIMENT）；无资源时按钮禁用并显示「尚未提供」，**不假装播放**。
- 分享生成可直接进入歌曲页的 URL（navigator.share / 剪贴板兜底），并记入「我传过」。
- 学唱（听一句→跟一句→一起唱→再唱一次→完整唱）与教唱（五步 + 「今天教第 1 节即可」）
  为固定路径流程；逐句音频需带时间标记的资源，当前如实说明播放从曲首开始。

### 2.4 「精选」口径（非推荐）

首页精选 = **已人工确认**（review_gate.theological_review = confirmed）样本周
（W01–W03）核心歌曲，按自然日确定性轮换。池子来自人工裁决，轮换只是展示顺序；
不显示分数、不显示排行榜、不产生「最佳歌曲」。该口径与 front_tags 一并登记为
**CI-0024（LOW/OBSERVED）**：真实使用发现误读再评估升级。

## 3. 边界（未做）

- 不修改 Frozen Skill、W01–W04、52W/LQ/MM、升层裁决、Calibration 既有结论。
- 不自动生产 W05；不自动升层剩余 40 首；不自动登记 MUS-S-0051…0100。
- 不导入任何歌词/歌谱/音频实际文件（资源层六槽结构就绪，全部「尚未提供」）。
- 不做 AI 推荐、自动选歌、云同步、用户系统。
- 开源项目（GraceChords、chn.songs、worship-toolkit、OpenSong、OpenWorship 等）
  只借鉴交互思路（即时搜索、大触控目标、速度/循环、可分享深链、离线优先），
  不复制代码与素材；素材级引用必须逐项核验许可证。

## 4. 后果

- 前台信息架构与后台治理解耦：真实使用反馈将主要来自前台，按 Calibration 流程累积。
- 候选库成为后续扩库的输入层；任何升层仍须走 ADR-0013 路径（人工授权 + 逐首认定）。
- 新增结构层（candidates、my_songs）全部不进入不可变基线（immutable_drift=[] 保持）。
