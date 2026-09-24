# ADR-0014｜V1.1-A 使用体验完善层：Song Detail / Song Resources / Week Music / Human Review

- 状态：Accepted（2026-09-21）
- 关联：ADR-0010（登记层）、ADR-0011（派生索引与库级辨识）、ADR-0012（版权词表维度分离）、
  ADR-0013（锚点认定与升层路径）、CI-0023
- 背景：平台 V1.0 + 曲库 V0.5 完成后进入 REAL USE。第一轮使用反馈的共识是：
  「生产工具」已可用，但讲员 / 敬拜同工 / 研究者还需要**看清每一首歌与每一周的真实状态**，
  而不是把「未辨识」「未导入」留成空白或伪装成可用。

## 决策

### 1. Song Detail（歌曲详情页，`#/song/MUS-S-NNNN`，MODULE 13）

单首歌曲的只读档案页，固定顺序：

```
01 基本资料 → 02 Bible Anchor → 03 Theme / Ministry Mapping
→ 04 Discernment → 05 Human Review → 06 Usage History
→ 07 Missing Resources → 08 Copyright / Sources
```

- **NOT_ASSESSED**：尚未辨识（不是漏数据）。八维未评、Song_Relation 无周次上下文、
  S6/S7 属单元层 —— 全部显式标注，不用空白冒充完整。
- **NOT_IMPORTED**：资源槽位为空（不是占位遗漏）。
- 02 区固定显示 **「Anchor ≠ sermon selection」**：锚点是圣诗自身歌词指向的经文（ADR-0013），
  不是从周次反推的选歌依据。
- 登记层-only 歌曲（未升详情层）进入详情页时**如实显示登记状态**（含 SOURCE_REQUIRED），
  不用登记记录伪装成歌曲档案（CI-0018 口径）。
- 03 区显式区分 `preliminary`（升层试批初步认定，待人工验收）与
  `discerned`（已完成八维辨识的样本值）。

### 2. Song Resources（歌曲资源层）

资源是**独立模型**，不混入 Song Core Record（`content/songs/**` 逐字节不变）：

- schema：`content/schema/song-resource.schema.json`（`additionalProperties:false`）；
- 索引：`content/song-resources/index.json`（`relation_to_song_core = independent_layer`）；
- 资源类型：LYRICS / SCORE_LEAD / SCORE_SIMPLE / LEAD_VOCAL / ACCOMPANIMENT / RECORDING；
- 每条资源必填：resource_id（MUS-R-NNNN）/ song_id / resource_type / language / version /
  key / source / copyright_status / license_status / verification_status / file_url / notes；
- `file_url` 本阶段强制 null：**不托管未授权内容，不虚构资源**；
- 程序层 `app/song-resources.js` 是唯一状态来源：`resourceSlots()` 逐槽位输出
  NOT_IMPORTED / AVAILABLE。

### 3. Week Music（周音乐页，`#/week/WNN`，MODULE 14）

按周显示：Scripture / Core Truth / LQ / MM / Core Song / Song Relation / Primary Function /
Review Gate / Reuse / S6 / S7，另加 Resource Access 区：

- 资源未导入时显示 **RESOURCE_PENDING**（周次口径），与歌曲页的 NOT_IMPORTED 同义不同词；
- 未生产周次（W05+）如实显示「尚未生产，不会自动生产 W05」；
- 页面只读，不指定未来周次。

### 4. Human Review 记录层

- 记录文件：`content/production/review-records.json`（Production Content，不入基线）；
- schema：`content/schema/review-record.schema.json`；
- 裁决词表：**ACCEPT / REVISE / HOLD / REJECT**；
- 必填字段：record_id（MUS-RR-NNNN）/ target_kind / target_id / decision / reason /
  evidence / reviewer / timestamp（+ 可选 follow_up）；
- 界面（`#/production?view=review`）只做三件事：列出待人工事项、列出已有记录、给出记录模板；
  **写入由人工完成**（平台对 content/** 只读，不代填 reviewer / timestamp）；
- 硬边界：记录**不反写** Frozen Skill、不修改既有歌曲裁决、不改变 W01–W04 历史结果、
  不触发自动升层或自动生产。ACCEPT ≠ 自动改 review_status / tier / 八维。

### 5. Dashboard（真实使用仪表盘）

只保留七项：Library（50）/ Detail（10）/ Intake（40）/ Human Review（待人工 =
试批验收 5 + 单元门 REVIEW/BLOCK，分开计数）/ Capacity（可用/剩余/缺口）/
Calibration（未结案数）/ Production（W01–W04 门状态）。

### 6. 搜索

使用者端音乐库（MODULE 02）与生产端音乐库视图均支持 **Song ID / 中文歌名 / 英文歌名**
客户端过滤。搜索只查 ID 与名称，**不做语义推荐**（平台无推荐算法，ADR-0010 边界不变）。

## 后果与边界

- 兼容性：Frozen Skill、W01–W04、2027 52W、LQ、MM、Music Library V0.5、现有 Calibration、
  V1.0 数据结构、regression baseline 全部未改；`immutable_drift = []`。
- 版本：内容 `MUS-V-0.6.0`；平台 `1.1.0`；SW 缓存 `mos-music-v7`。
- 登记层与详情层契约未动；升层路径仍按 ADR-0013，剩余 40 首未升层。
- 展示层状态词（NOT_ASSESSED 等）无 schema 承载 —— 已登记 CI-0023（LOW/OBSERVED），
  真实使用积累案例后再决定是否升为数据契约。
