# MOS-MUSIC V1.0

> 真理 × 音乐 × 共同体 × 实践 ＝ 门徒形成
>
> 一个以圣经真理为核心、以音乐为形成媒介、以门徒生命实践为目标的
> 离线优先（Offline-First）音乐门徒训练平台。

**当前状态：MOS 生命诗歌软件 V3.0（单曲完整单元标准层）已完成并通过全部验证（platform 3.0.0 / SW mos-music-v10 / 内容版本 MUS-V-0.8.0）。**

- 平台 V3.0（ADR-0017，**本轮核心**）：把「一首歌成为可学、可视唱、可教、可传的完整单元」落成标准层 ——
  **18 段单曲完整单元**（`content/song-units/**`，独立层，不写入 Song Core Record）、
  **四级完成度 L1–L4**（由实际资源**派生**，不写在记录里，防「声明即完成」）、
  **教学十步法 + 三模式**（学唱 / 视唱 / 教唱，差别只在**示范出现的时机**）、
  **光标跟随**（只按真实时间标记，**绝不插值**；无时间轴就不显示）、
  **四级学习者状态**（认识 / 会唱 / 独立唱 / 会教，**只记录不评价**、无分数排名徽章）、
  **间隔复习 Day 0 / 2 / 7**。
  **只做简谱、只做钢琴伴奏**（可复现），**淡化与 52 周 / 课程的绑定**（歌曲可独立完成门训功能）。
  三份标准文档：`docs/standards/MOS-SONG-TEACHING-METHOD-V1.0.md`、
  `MOS-SONG-PRODUCTION-TEMPLATE-V1.0.md`、`MOS-SONG-PRODUCTION-WORKSHEET-V1.0.md`。
- 平台 V2.1（ADR-0016）：艺术化 UI —— 设计系统 `v21.css`、系列化 SVG 封面、统一 MusicPlayer、深夜沉浸模式。
- 平台 V1.1-A（ADR-0014）：在 V1.0 之上新增真实使用层 ——
  **歌曲详情页**（`#/song/MUS-S-NNNN`，八段档案：基本资料 / 锚点 / 主题映射 / 辨识 /
  人工审查 / 使用历史 / 资源 / 版权，NOT_ASSESSED / NOT_IMPORTED 明示，固定「Anchor ≠ sermon selection」警示）、
  **Song Resources 资源层**（六类槽位，独立模型，当前 0 条资源记录，不虚构）、
  **周音乐页**（`#/week/WNN`，W01–W04，资源 RESOURCE_PENDING）、
  **人工审查记录层**（ACCEPT / REVISE / HOLD / REJECT，人工写入，不反写任何裁决）、
  **仪表盘七项指标**与**曲库搜索**（ID / 中文 / 英文）。
- 平台 V1.0：24 课与音乐库结构、七步流程、讲道音乐生产平台（MODULE 12）冻结；
  W01–W04 周次单元为已完成的真实产出（冻结历史）。
- 音乐库 V0.5：曲库 **50 首** = 歌曲详情层 **10 首**（MUS-S-0001…0010）+ 入库登记层 45 首
  （MUS-S-0006…0050，均 `copyright_status=SOURCE_REQUIRED`，其中 5 首已升入详情层）。
  登记层**只登记元数据**，不含辨识结论、不含经文锚点、不含歌谱/音频/译词，且**逐字节不变**。
- 升层试批（CI-0018 / ADR-0013）：人工授权「按公版圣诗固有经文依据逐首认定」⇒
  MUS-S-0006…0010 完成**锚点认定 + 独立升层声明**（`content/production/library-promotions.json`），
  零 schema 改动、零基线漂移。剩余 **40 首**仍在登记层，须人工验收试批后决定；
  八维辨识、Song_Relation、S6/S7、tier 升级与使用决定**一概未做**。
- 容量实况：可用（未使用）45 首 vs 剩余 W05–W52 共 48 周 → 缺口 3 周，
  `MUSIC_LIBRARY_CAPACITY_WARNING` **如实保持生效**。50 首表示 V0.5 第一阶段完成，
  **不代表已足够全年唯一使用**（下一阶段目标约 60 首，由人工决定）。
- 尚未开始：W05–W52 的周次生产（按裁决暂停，等待人工决定）。

## 核心流程（唯一，不得出现竞争流程）

**读 → 明 → 唱 → 记 → 感 → 行 → 传**

## 快速开始

```bash
# 任意静态服务器即可（示例）
python -m http.server 8000
# 浏览器打开 http://localhost:8000/
```

手机/平板：浏览器打开后「添加到主屏幕」即可安装（PWA）。
首次联网访问后，离线也能完成基本音乐门训。

## 模块（MODULE 01–12）

今日门训 ｜ 音乐库 ｜ 24课音乐册 ｜ 七步门训 ｜ 个人门训 ｜
家庭5分钟 ｜ 小组门训 ｜ 教会实施 ｜ 培训（L1/L2/L3 + F01–F06）｜ 反馈 ｜ 内容管理
｜ **讲道音乐生产平台（MODULE 12，内部工具，入口 `#/production`）**

## 开发

```bash
node tests/smoke.js                # 静态结构断言（305 项）
node tools/validate-content.js     # 内容/程序分离 + 生产平台 + 曲库登记层 + V3.0 单曲单元硬校验
node tools/platform-tests.js       # 核心模块单元测试（94 项）
node tools/regression.js --emit    # W01–W04 回归 + 引擎与冻结技能对拍
node tools/cdp-verify.js           # 端到端 + 离线冷启动（需本机 Chrome）
node tools/build-usage.js          # 重建音乐库使用历史
node tools/baseline.js             # 重建不可变基线清单（须经批准才可运行）
node tools/produce-plan.js --year  # 生产计划（单周/连续/全年）
# 曲库 V0.5 扩库
node tools/library-intake.js --from-csv <清单.csv>  # 读 CSV → 写候选清单（RECEIVED）
node tools/library-intake.js --status    # 扩容进度
node tools/library-intake.js             # 清单检查 + 逐首登记预览（不写文件）
node tools/library-intake.js --write     # 写出入库登记层
node tools/library-intake.js --guard     # 扩库守卫（CI 同款）
node tools/derive-indexes.js             # 派生索引（主题歌曲计数 / 歌曲经文锚点）--check 只校验
node tools/song-discernment.js           # 库级歌基层辨识（library_scope，不含周次）--show/--check
node tools/usage-history.js              # §九 使用历史视图
node tools/library-report.js             # §十四 入库报告 + §十 容量重算
# 单曲完整单元 V3.0
node tools/song-units.js                 # 构建 18 段单元包 + 派生等级表（--check 只校验）
node tools/song-worksheet.js             # 单曲生产工作单 STEP00–15（--check / --md MUS-S-0001）
```

推送后 GitHub Actions 自动执行同一套校验并部署 GitHub Pages（`.github/workflows/ci.yml`）。

## 目录与文档

- 架构：`docs/ARCHITECTURE.md`
- ID 规则：`docs/ID-RULES.md`
- **歌曲标准（V3.0）**：`docs/standards/MOS-SONG-TEACHING-METHOD-V1.0.md`（教学法）、
  `MOS-SONG-PRODUCTION-TEMPLATE-V1.0.md`（18 段模板与 L1–L4）、
  `MOS-SONG-PRODUCTION-WORKSHEET-V1.0.md`（STEP00–15 工作单）
- 架构决策：`docs/ADR/`（独立 origin、双流程边界、MAP、EBRM 范式、版权、tier 七态、
  转换层与歌曲边界、歌曲辨识技能、讲道音乐生产平台、曲库 V0.5 登记层、
  V0.5 派生索引作用域与库级辨识、版权词表维度分离、
  圣诗锚点认定与升层路径、V1.1-A 使用体验完善层、V2.0 前台分层与候选库、
  V2.1 艺术化设计系统、**V3.0 单曲完整单元标准层**）
- 生产平台：`docs/PLATFORM-V1.0.md` ｜ 校准问题：`docs/CALIBRATION-ISSUES.md` ｜
  版本治理：`docs/VERSION-GOVERNANCE.md`
- 曲库 V0.5 扩库：`docs/LIBRARY-V0.5-INTAKE.md` ｜ 入库报告：`docs/LIBRARY-V0.5-REPORT.md`

## 红线（对所有贡献者与 AI 生效）

1. 不修改 01–11 母模型、24 课主题、七步法、八维辨识。
2. 不建立传统/现代音乐排名，不做喜好式评价（只有八维辨识）。
3. tier（A/B/C）与 review_status（七态）是两个独立字段。
4. 内容（`content/`）与程序（`app/`）严格分离，CI 硬校验。
5. 未获授权不托管任何受版权保护的音频、歌词、译本全文。
6. Phase 6 之前不批量导入歌曲。
7. 不使用 MOS-DIS 的任何 localStorage key；本应用数据一律在 IndexedDB（库名 `mos-music`）。
8. 生产平台（MODULE 12）只读：不写任何 `content/**`；发现问题只登记 Calibration Issue，
   **绝不自动修改已冻结的歌曲辨识技能**。
9. （V3.0）**只做简谱、只做钢琴伴奏**；示唱必须真人（禁止虚拟歌手）、不得用合成声音冒充。
10. （V3.0）**等级 L1–L4 是资源派生结果**，不得写进记录（防「声明即完成」）；
   声明 `status` / `PROVIDED` 必须有机械前置成立。
11. （V3.0）**光标只按真实时间标记定位，绝不插值**；没有时间轴就不显示光标。
12. （V3.0）**不设通过 / 不通过、不评分、不排名、不给徽章**；四级学习者状态**只记录不评价**。
13. （V3.0）资源缺失一律如实显示 **「尚未提供」**，不得假装播放、不得虚构内容补满结构。
