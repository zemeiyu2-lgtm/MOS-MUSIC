# ADR-0005｜经文版权策略：V1.0 不托管受版权保护的译本全文

状态：已接受（用户裁决）｜ 日期：2026-09-21 ｜ 关联：规格书 §27

## 决定

V1.0 数据层只保存：

- `Bible Reference`（书卷 / 章 / 节范围）
- `Passage ID`（引用标识）
- `Core Truth` / MOS Summary / Explanation（MOS 自己的研究摘要）
- 合法来源信息（译本名称 + 版权方 + 授权状态）

**不**批量复制现代中文译本（和合本/新译本/CUV 等）全文进仓库。
具体完整经文显示方案（用户本地持有译本 / 获得授权 / 公版来源）后续再定。

## 后果

- `content/bible/reference-index.json` 只含引用与摘要字段，CI 校验其不含大段经文。
- 歌曲同理：`Copyright_Status / License / Usage_Permission` 未明确前，
  不托管完整音频与歌词（§27），只存元数据与研究标签。
