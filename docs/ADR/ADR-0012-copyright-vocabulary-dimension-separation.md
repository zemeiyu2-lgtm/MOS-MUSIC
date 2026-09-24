# ADR-0012｜版权词表维度分离、禁止互相映射（案 a）

状态：已采纳（人工裁决）｜日期：2026-09-21｜阶段：V0.5 后第一项裁决

---

## 背景

CI-0015 记录了一个词表契约缺陷：

> V0.5 清单的版权词表（`PUBLIC_DOMAIN` / `LICENSED` / `USER_PROVIDED` /
> `SOURCE_REQUIRED` / `UNKNOWN`）与歌曲详情记录的既有枚举（`unknown` /
> `public_domain` / `copyrighted` / `licensed` / `permission_granted`）并不等价。

当时的实现只有一条「先能落库」的过渡办法：一张机械映射表
（`COPYRIGHT_MAP`，并标记 `COPYRIGHT_MAP_PROVISIONAL = true`），
把 `USER_PROVIDED → permission_granted`、`SOURCE_REQUIRED → unknown`。

这张表本身是错的：它把**两个不同维度的问题**当成了同一个问题的两种写法。

| | 登记层词表 | 详情层词表 |
|---|---|---|
| 回答的问题 | 这份资料从哪来、我还要做什么 | 这个作品受不受版权保护、是否已获授权 |
| 维度 | **来源与行动状态** | **法律状态** |

- `SOURCE_REQUIRED` 是**行动**：确认必须去取得来源。
- `USER_PROVIDED` 是**来源**：资料由用户自备。
- 两者都**不是法律状态**。所以它们在详情层**没有、也不应有**对应值。
- 把它们映射过去，等于宣称「用户自备」＝「已获授权」——
  这正是 CI-0015 的 `expected` 明令禁止的一步。

---

## 决策｜采纳案 a

**两侧词表维度不同，禁止互相映射。**

1. 登记层词表（`COPYRIGHT_STATUS`）＝ 来源与行动状态，**保持清单 5 值不改写**。
2. 详情层词表（`LEGAL_STATUS`）＝ 法律状态，**只读引用既有枚举**，不新增取值。
3. 详情层字段 `copyright_status_mapped` 的语义改为
   **独立的法律状态判定槽**，不是映射结果：未判定时为 `unknown`。
4. **硬约束**：`SOURCE_REQUIRED` 与 `USER_PROVIDED` 永不产生 `permission_granted`
   （也永不产生任何法律状态结论）。
5. 只有 `PUBLIC_DOMAIN` / `LICENSED` 可给出判定值，且仍须**作品级证据**支持，
   不得凭清单推定（与指令 §六 一致）。

---

## 落地点

| 改动 | 文件 | 性质 |
|---|---|---|
| 废止 `COPYRIGHT_MAP` 与 `COPYRIGHT_MAP_PROVISIONAL` | `app/library-intake.js` | 程序层，非冻结 |
| 新增 `LEGAL_STATUS`（详情层法律状态词表） | `app/library-intake.js` | 程序层 |
| 新增 `LEGAL_STATUS_DETERMINATION`（仅两项可判定） | `app/library-intake.js` | 程序层 |
| 新增 `NON_LEGAL_INTAKE_STATUS`（永不给结论的两项） | `app/library-intake.js` | 程序层 |
| 新增 `COPYRIGHT_MAP_PROHIBITED`（锁住裁决） | `app/library-intake.js` | 程序层 |
| `mapCopyrightStatus()` → `legalStatusOf()` | `app/library-intake.js` | 程序层 |
| 使用历史取值的语义注释 | `tools/build-usage.js` | 程序层 |
| 5 条断言（含「用户自备 ≠ 已获授权」硬约束） | `tools/platform-tests.js` | 程序层 |
| CI-0015 → FIXED（记录案 a） | `content/production/calibration-issues.json` | Production Content |
| 新增 CI-0021（字段名命名债） | `content/production/calibration-issues.json` | Production Content |

**关键性质：零 schema 改动、零基线漂移。**

- `content/schema/song.schema.json` 与 `content/schema/library-intake.schema.json`
  **均未改动** —— 两者都在 Immutable Baseline 内。
- 详情层字段的**取值不变**（45 首仍为 `unknown`，即未判定），
  因此**不需要重建任何登记数据**。

---

## 为什么不动冻结 Schema

CI-0015 的 `proposed_change` 写的是「若需要改冻结侧数据契约，一并列入 P-SKILL-1.0.1 提案，
不在本阶段擅改」。本案例 a 恰恰证明**不需要**改：

- 详情层枚举本来就没有「来源待补」这一取值 —— 因为它本来就**不该有**：
  来源待补是登记层的待办，不是作品的法律状态。
- 换句话说，两侧词表的「不等价」不是缺陷，而是**正确的信号**：
  它在提醒我们不要把两个维度混为一谈。当年那张映射表把信号抹掉了，才是真正的缺陷。

---

## 残留与后续（CI-0021）

详情层字段名 `copyright_status_mapped` 仍写着 `mapped`，与它现在的语义
（独立判定槽）不符。改名须改冻结的 `library-intake.schema.json`，属内容契约变更，
故保持 OPEN 并记入 CI-0021。

当前用两道防线锁住行为，避免后来者据名把映射写回来：

1. `COPYRIGHT_MAP_PROHIBITED === true`；
2. 平台单测断言 `!('COPYRIGHT_MAP' in LI)` 且 `legalStatusOf('USER_PROVIDED') !== 'permission_granted'`。

---

## 与其他裁决的关系

- **CI-0014 案 a（ADR-0011）**：解决的是**基线作用域** —— 派生索引移出冻结区。
- **CI-0015 案 a（本文）**：解决的是**词表契约** —— 两个维度分离、禁止映射。
- **CI-0018（仍 OPEN）**：解决的是**升层判据** —— 45 首登记层何时升为详情层。
  它曾被 CI-0015 挡住一条路（无合法版权状态可写），**本裁决解除了这一条**，
  但 CI-0018 仍被其余硬前置挡住：经文锚点是 `song.schema.json#bible` 必填项且无来源，
  冻结技能 §三 要求周次上游输入而人工禁止指定 W05–W52。
  因此 **CI-0015 的关闭不等于升层可执行**。

---

## 结论

两侧词表各自正确、且不应互通。`SOURCE_REQUIRED` 与 `USER_PROVIDED` 是
登记层的来源与行动状态，永远留在登记层；详情层只承载法律状态，未判定即 `unknown`。
