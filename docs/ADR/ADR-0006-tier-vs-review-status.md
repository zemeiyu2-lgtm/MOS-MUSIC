# ADR-0006｜资源等级（A/B/C）与审核七态为两个独立字段

状态：已接受（用户裁决）｜ 日期：2026-09-21

## 决定

歌曲（及课程）同时携带两个互不推导的字段：

| 字段 | 取值 | 含义 |
|---|---|---|
| `tier` | A / B / C | 资源等级：A=MOS核心库，B=MOS推荐库，C=MOS研究资源库 |
| `review_status` | Draft / Under Review / Approved / Core / Recommended / Research / Archived | 内容生命周期/审核状态 |

## 理由

tier 回答"放在哪个库"，review_status 回答"审核走到哪一步"。二者正交：
一首 C 级研究歌曲可以是 Approved（审核通过但只做研究用）；
一首 A 级核心歌曲可以退回 Draft（重新审核）。

## 后果

- Schema 中两字段均为必填枚举，CI 校验不允许用一个字段模拟另一个。
- AI 生成内容必须从 Draft 起步，不经人工审核不得进入 Core（§26）。
