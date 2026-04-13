# TransCrab Translation Quality Stabilization Plan

**Goal:** 把 TransCrab 翻译流程从单一 prompt 升级为可配置、可复现、可回滚的标准翻译流水线，显著降低质量波动。

**Scope:**
- In:
  - 建立翻译质量基线与评估脚本
  - 引入 `quick / normal / refined` 三档翻译模式
  - 引入 glossary + audience + style 配置
  - 引入长文 chunk 流程与一致性上下文
  - 引入 pre-apply 质量闸门（Markdown/CJK/术语）
  - 更新 run-crab 和文档，形成标准流程
- Out:
  - 不改抓取核心链路（fetch/readability/turndown）
  - 不接第三方翻译 API
  - 不动部署平台配置

**Architecture (2–5 bullets):**
- 新增翻译编排层（translation orchestrator），独立于 `add-url.mjs` 的抓取能力。
- 模式化执行：quick（直翻）/normal（分析+翻译）/refined（分析+翻译+审校）。
- 统一配置输入：CLI 参数 > 项目配置文件 > 默认值。
- 在 `apply-translation` 前加入自动 lint/normalize 闸门，失败即阻断。
- 保留 legacy prompt 开关，确保可快速回滚。

**Acceptance / Verification:**
- 基准集（当前阶段先 3 篇）重复执行时输出结构稳定，后续再扩到 10 篇。
- Markdown 结构错误率接近 0（强调符号、标题层级、代码块、链接）。
- 术语一致性明显改善（同词不再多译）。
- refined 发布闭环可执行（draft → critique → revision → final）。

## Scope decisions (applied)

> 以下是实施过程中经 onevcat 确认后的“有意调整”，作为当前计划基线。

1) **发布默认质量优先**：`mode=auto` 下发布流程固定为 `refined`，不再在 quick/normal/refined 间切换。
2) **自动化重心调整**：自动化从“档位选择”转为“主题识别（technology/business/life）→ 风格/受众映射”。
3) **基线样本分阶段推进**：先落地 3 篇已翻译样本进入 fixtures，后续按需要扩展到 10 篇。
4) **`translate.<lang>.prompt.txt` 的定位**：这是兼容性产物路径，不是语言控制开关；真正控制项在 profile（mode/style/audience）。
5) **legacy prompt 开关**：本轮未实现，后续若确有回滚诉求再单独立项。

## Milestones

1. M1 - 基线与评估框架
2. M2 - 翻译模式与配置骨架
3. M3 - Normal/Refined 质量流程（含 chunk）
4. M4 - 质量闸门与自动修复
5. M5 - CLI 集成、文档与回滚

---

## Task 1: 建立基准样本与评分维度（M1）

**Files:**
- Create: `test/translation-quality/fixtures/README.md`
- Create: `test/translation-quality/fixtures/*.md`（10 篇样本索引）

**Steps:**
1) 选择 10 篇代表性文章（短文/长文、技术/叙事、含代码/表格）。
2) 在 README 写入样本挑选标准与来源记录格式。
3) 为每篇样本登记基础元信息（长度、领域、是否含代码块）。
4) 提交样本索引（可先不放全文，先放清单和指针）。

**Notes / edge cases:**
- 样本需要覆盖“最容易翻车”的 markdown 结构。

## Task 2: 定义质量 Rubric 与评分脚本骨架（M1）

**Files:**
- Create: `test/translation-quality/rubric.md`
- Create: `scripts/eval-translation-quality.mjs`

**Steps:**
1) 定义 4 个评分维度：忠实度、术语一致、Markdown 正确、中文可读性。
2) 为每个维度定义 1–5 分锚点和扣分规则。
3) 创建评估脚本骨架：读取多次输出并生成对比报告 JSON。
4) 跑一次空评估，确认输出格式稳定。

**Notes / edge cases:**
- 初版允许部分维度人工评分，先把结构搭起来。

## Task 3: 抽离翻译编排器（M2）

**Files:**
- Create: `scripts/translate-orchestrator.mjs`
- Modify: `scripts/add-url.mjs`（只保留 prompt 生成兼容路径）

**Steps:**
1) 新建 orchestrator 输入/输出协议（source, mode, lang, audience, style）。
2) 将“分析/翻译/审校”步骤定义为可组合 pipeline。
3) 给 add-url 保留 legacy 行为，不破坏现有脚本调用。
4) 对 orchestrator 做最小 CLI smoke test。

**Notes / edge cases:**
- 必须保证旧流程可继续工作。

## Task 4: 引入配置系统（M2）

**Files:**
- Create: `transcrab.translate.config.json`
- Create: `scripts/lib/translate-config.mjs`
- Modify: `scripts/run-crab.sh`

**Steps:**
1) 定义默认配置（mode, audience, style, chunkThreshold, glossary）。
2) 实现配置读取优先级：CLI > config file > default。
3) run-crab 新增参数透传：`--mode --audience --style --glossary`。
4) 验证无配置文件时的默认行为与旧版一致。

**Notes / edge cases:**
- CLI 参数缺失时要有明确默认值，不可 silent fail。

## Task 5: 实现 Normal 模式（分析→翻译）（M3）

**Files:**
- Create: `scripts/prompts/analysis.zh.txt`
- Create: `scripts/prompts/translate.zh.txt`
- Modify: `scripts/translate-orchestrator.mjs`

**Steps:**
1) 增加 analysis step，产出术语与语气指导。
2) 将 analysis 结果注入翻译 prompt，形成 normal 流程。
3) 保存中间产物（analysis、assembled prompt）用于排查。
4) 用 2 篇样本验证 normal 输出质量优于 quick。

**Notes / edge cases:**
- 分析结果要结构化，避免下一步 prompt 漂移。

## Task 6: 实现 Refined 模式（含审校）（M3）

**Files:**
- Create: `scripts/prompts/review.zh.txt`
- Modify: `scripts/translate-orchestrator.mjs`

**Steps:**
1) 在 normal 基础上加 review step，输出问题清单。
2) 基于问题清单执行 revision，产出最终译文。
3) 记录每次修订的差异摘要，便于复盘。
4) 用 2 篇高难样本验证 refined 的稳定收益。

**Notes / edge cases:**
- 避免 over-polish 改变原文事实含义。

## Task 7: 长文 chunk + 术语一致性上下文（M3）

**Files:**
- Create: `scripts/chunk-markdown.mjs`
- Modify: `scripts/translate-orchestrator.mjs`

**Steps:**
1) 超阈值内容自动切块，保留标题与段落边界。
2) 在翻译前抽取全局术语表并广播给每块。
3) 合并 chunk 输出并校验结构完整性。
4) 用 1 篇长文验证 chunk 前后术语一致率。

**Notes / edge cases:**
- 代码块/表格不能被切断。

## Task 8: 质量闸门（lint + normalize）（M4）

**Files:**
- Create: `scripts/lint-translation.mjs`
- Modify: `scripts/apply-translation.mjs`

**Steps:**
1) 在 apply 前执行 lint：强调语法、标题结构、链接和代码块闭合。
2) 增加 CJK 标点与空格规范化（可自动修复部分问题）。
3) 增加术语漂移检测（基于 analysis glossary）。
4) lint 不通过时阻断写入并打印可操作修复建议。

**Notes / edge cases:**
- 自动修复应可禁用（`--no-fix`）。

## Task 9: 基线对比与回归报告（M4）

**Files:**
- Modify: `scripts/eval-translation-quality.mjs`
- Create: `test/translation-quality/reports/README.md`

**Steps:**
1) 对 quick/normal/refined 分别跑基准集。
2) 输出按样本、按维度、按模式的对比报告。
3) 标注“质量提升但速度变慢”的权衡信息。
4) 形成建议默认模式（预期 normal）。

**Notes / edge cases:**
- 报告应可重复生成，避免手工整理。

## Task 10: 标准流程落地 + 回滚开关（M5）

**Files:**
- Modify: `scripts/run-crab.sh`
- Modify: `README.md`
- Modify: `skills/transcrab/SKILL.md`

**Steps:**
1) 将 run-crab 默认模式设为 `normal`，保留 `--mode quick/refined`。
2) 加入 `--legacy-prompt` 开关，允许一键回退旧流程。
3) 更新 README 与 skill 文档（触发条件、模式说明、质量闸门）。
4) 跑一次端到端：crab + URL（推荐 `crab: <url>`）-> 产出 zh.md -> 验证可部署。

**Notes / edge cases:**
- 文档必须明确：失败场景如何 fallback。

---

## Linear Ticket Mapping（to be created）

- Parent: TransCrab 翻译质量稳定化（总控）
- Child 1: M1 基线与评估框架
- Child 2: M2 翻译模式与配置骨架
- Child 3: M3 Normal/Refined + Chunk 一致性
- Child 4: M4 质量闸门与自动修复
- Child 5: M5 标准流程落地与回滚

## Suggested execution mode

- 先并行推进 M1 + M2（互不阻塞）。
- M3 依赖 M2 完成后开始。
- M4 可在 M3 中后期并行开发。
- M5 最后收口并做端到端验收。
