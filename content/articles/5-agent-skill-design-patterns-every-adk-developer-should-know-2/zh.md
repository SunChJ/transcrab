---
title: ADK 技能设计模式
date: '2026-03-18T06:00:01.125Z'
sourceUrl: 'https://lavinigam.com/posts/adk-skill-design-patterns/'
lang: zh
---
> **这篇文章扩展了 ADK 技能 3 部曲系列：**
> 
> *   [第 1 部分：使用 SkillToolset 实现渐进式披露](https://lavinigam.com/posts/adk-agent-skills-part1/)
> *   [第 2 部分：基于文件、外部技能及 SkillToolset 内部原理](https://lavinigam.com/posts/adk-agent-skills-part2/)
> *   [第 3 部分：编写技能的技能 —— 自扩展 ADK 智能体](https://lavinigam.com/posts/adk-agent-skills-part3/)
> *   [ADK 核心技能](https://google.github.io/adk-docs/tutorials/coding-with-ai/?utm_campaign=adk-skill-design-patterns&utm_medium=blog&utm_source=lavinigam-blog) —— 用于构建 ADK 智能体的官方技能

**ADK 技能设计模式**是用于组织 SKILL.md 文件的可重用结构模板 —— 这是一种基于 Markdown 的指令格式，用于告诉 Google ADK 智能体如何使用工具、生成内容或编排多步骤工作流。在本系列的 [第 1-3 部分](https://lavinigam.com/posts/adk-agent-skills-part1/) 中，我介绍了基础知识 —— 什么是智能体技能、Google ADK 的 [SkillToolset](https://google.github.io/adk-docs/skills/?utm_campaign=adk-skill-design-patterns&utm_medium=blog&utm_source=lavinigam-blog) 如何实现渐进式披露，以及如何使用元技能构建自扩展智能体。但在我自己的项目中，有一个问题被反复提及：我知道如何创建一个技能，但我该如何组织其中的内容？

包装 FastAPI 规范的技能与运行 4 步文档流水线的技能看起来完全不同，但它们都使用相同的 SKILL.md 格式。[智能体技能规范 (Agent Skills specification)](https://agentskills.io/specification?utm_campaign=adk-skill-design-patterns&utm_medium=blog&utm_source=lavinigam-blog) 定义了容器 —— SKILL.md 的前置元数据 (frontmatter)、`references/`、`assets/`、`scripts/` 目录 —— 但没有说明里面应该放什么。这是一个内容设计问题，而不是格式问题。

目前有五种模式不断涌现。我在 Claude Code 的 [内置技能](https://github.com/anthropics/skills)、[skills.sh](https://skills.sh/) 上的社区仓库、实际项目，甚至在 [最近的一篇 arXiv 论文](https://arxiv.org/html/2602.20867v1)（该论文正式编目了七种系统级技能设计模式）中都看到了它们。本文命名了其中最实用的五种，展示了它们在 ADK 中的工作代码，并帮助你为自己的用例选择合适的模式。

通过本文，你将学会如何：

*   使用 **工具包装器 (Tool Wrapper)** 让你的智能体瞬间成为任何库或框架的专家
*   使用 **生成器 (Generator)** 根据可重用模板生成结构一致的文档
*   使用 **审查器 (Reviewer)** 让智能体根据清单对代码进行评分，并按严重程度分组
*   使用 **反转模式 (Inversion)** 翻转对话 —— 让智能体在采取行动前向你提问
*   使用 **流水线 (Pipeline)** 强制执行严格的分步工作流，并在阶段之间设置检查点

[克隆仓库 ↗](https://github.com/lavinigam-gcp/build-with-adk/tree/main/adk-skill-design-patterns)

> 注意
> 
> *   **工具包装器 (Tool Wrapper)** —— 类似于库的速查表；让智能体仅在相关时应用其规范。
> *   **生成器 (Generator)** —— 类似于智能体填写的表单；每次都能生成结构一致的文档。
> *   **审查器 (Reviewer)** —— 类似于评分标准；根据清单对提交的代码进行评分，并将发现的问题按严重程度分组。
> *   **反转模式 (Inversion)** —— 智能体先对你进行访谈；在生成任何输出前提出结构化问题。
> *   **流水线 (Pipeline)** —— 类似于带有签核环节的食谱；强制执行严格的分步工作流，确保不遗漏任何步骤。
> *   所有这五种模式都可以 **组合使用** —— 流水线可以包含审查步骤；生成器可以使用反转模式进行输入采集。

## 一种 SKILL.md 格式，多种用例

[智能体技能标准](https://agentskills.io/specification?utm_campaign=adk-skill-design-patterns&utm_medium=blog&utm_source=lavinigam-blog) 已被超过 [30 种智能体工具](https://agentskills.io/home?utm_campaign=adk-skill-design-patterns&utm_medium=blog&utm_source=lavinigam-blog) 采用 —— 包括 Claude Code、Gemini CLI、GitHub Copilot、Cursor、JetBrains Junie 等。每个技能都遵循相同的目录布局：

```yaml
skill-name/
├── SKILL.md          ← YAML 前置元数据 + Markdown 指令（必填）
├── references/       ← 风格指南、清单、规范（可选）
├── assets/           ← 模板和输出格式（可选）
└── scripts/          ← 可执行脚本（可选）
```

我在 [第 2 部分](https://lavinigam.com/posts/adk-agent-skills-part2/) 详细介绍了该格式，因此这里不再赘述。

格式告诉你如何打包技能，但它没有告诉你如何设计内容。指令应该是清单吗？是一个工作流吗？还是一组问题？参考资料应该存放风格指南、模板还是查找表？答案取决于你的技能想要实现什么，这就是模式发挥作用的地方。

本文中的五种模式都使用相同的 SKILL.md 格式，但组织内容的方式不同 —— 不同的指令风格、不同的资源类型，以及 L2（指令）和 L3（参考资料/资产）之间的不同关系。如果你需要复习渐进式披露的三个级别，请参阅 [第 1 部分的解释](https://lavinigam.com/posts/adk-agent-skills-part1/#what-are-skills-and-why-they-matter)。

## 快速回顾：SkillToolset 和三个级别

ADK 的 [`SkillToolset`](https://google.github.io/adk-docs/skills/?utm_campaign=adk-skill-design-patterns&utm_medium=blog&utm_source=lavinigam-blog) 通过三个自动生成的工具实现渐进式披露。我在 [第 2 部分](https://lavinigam.com/posts/adk-agent-skills-part2/#wiring-adk-skills-with-skilltoolset) 介绍了内部原理，这里只做简要说明：`list_skills` 显示技能名称和描述 (L1)，`load_skill` 获取完整指令 (L2)，而 [`load_skill_resource`](https://google.github.io/adk-docs/skills/#define-skills-with-files?utm_campaign=adk-skill-design-patterns&utm_medium=blog&utm_source=lavinigam-blog) 则根据需求加载参考文件和模板 (L3)。智能体在启动时为每个技能支付约 100 个 Token，然后仅在需要时加载其余部分。

对于本文中的模式示例，所有五个技能都加载到一个 `SkillToolset` 中。智能体根据用户的请求决定激活哪一个。

```python
# agent.py
import pathlib

from google.adk import Agent
from google.adk.skills import load_skill_from_dir
from google.adk.tools.skill_toolset import SkillToolset

SKILLS_DIR = pathlib.Path(__file__).parent / "skills"

skill_toolset = SkillToolset(
    skills=[
        load_skill_from_dir(SKILLS_DIR / "api-expert"),       # 模式 1: 工具包装器
        load_skill_from_dir(SKILLS_DIR / "report-generator"), # 模式 2: 生成器
        load_skill_from_dir(SKILLS_DIR / "code-reviewer"),    # 模式 3: 审查器
        load_skill_from_dir(SKILLS_DIR / "project-planner"),  # 模式 4: 反转模式
        load_skill_from_dir(SKILLS_DIR / "doc-pipeline"),     # 模式 5: 流水线
    ],
)

root_agent = Agent(
    model="gemini-2.5-flash",
    name="pattern_demo_agent",
    instruction="在对任何用户请求采取行动之前，先加载相关的技能。",
    tools=[skill_toolset],
)
```

每个技能前置元数据中的 `description` 字段是最重要的一行。它是智能体的搜索索引 —— 如果描述模糊，智能体在应该激活该技能时就不会激活。下面的每个模式都展示了如何编写能够可靠触发的描述。

## 模式 1：工具包装器 (Tool Wrapper) —— 教会智能体使用库

**工具包装器**是一种智能体技能，它将库或工具的规范、最佳实践和编码标准打包成按需知识，供智能体在处理相关技术时加载。它是最简单的 SKILL.md 模式 —— 包含指令和参考文件，没有模板或脚本。

工具包装器技能将库或工具的规范打包成按需知识。加载技能后，智能体会变成该领域的专家。想想 FastAPI 规范、Terraform 模式、安全策略或数据库查询最佳实践。

这是最简单的模式。没有模板，没有脚本 —— 只有告诉智能体遵循哪些规则的指令，加上存放详细规范文档的 `references/` 目录。

![模式 1：工具包装器 —— SKILL.md 加载带有库规范的参考资料，智能体应用规则](https://lavinigam.com/posts/adk-skill-design-patterns/pattern-tool-wrapper.webp)

*工具包装器模式：SKILL.md 在库关键词上触发，从 references/ 中加载规范，智能体将其作为领域专业知识应用。*

```yaml
# skills/api-expert/SKILL.md
---
name: api-expert
description: FastAPI 开发最佳实践和规范。在构建、审查或调试 FastAPI 应用程序、REST API 或 Pydantic 模型时使用。
metadata:
  pattern: tool-wrapper
  domain: fastapi
---

你是 FastAPI 开发专家。请将这些规范应用于用户的代码或问题。

## 核心规范

加载 'references/conventions.md' 以获取完整的 FastAPI 最佳实践列表。

## 审查代码时
1. 加载规范参考
2. 根据每项规范检查用户的代码
3. 对于每次违规，引用具体规则并建议修复方案

## 编写代码时
1. 加载规范参考
2. 严格遵循每项规范
3. 为所有函数签名添加类型注解
4. 依赖注入使用 Annotated 风格
```

`references/conventions.md` 文件存放实际的规则 —— 命名规范、路由定义、错误处理模式、异步与同步指南。智能体仅在激活技能时才加载此文件，从而保持基准上下文足够小。

这里的 `description` 至关重要。它包含了具体的关键词 —— “FastAPI”、“REST APIs”、“Pydantic models” —— 这些词与开发人员实际输入的词相匹配。像 “帮助处理 API” 这样的描述很难触发，因为它太通用了。

### 何时使用工具包装器

当你希望智能体针对特定的库、SDK 或内部系统应用一致的、专家级的规范时。这是应用最广泛的模式 —— 几个工程团队已经开源了他们的技能作为参考：

*   **Vercel [`react-best-practices`](https://github.com/vercel-labs/agent-skills)** —— 来自 Vercel 工程团队的 40 多条 React 和 Next.js 性能规则，按影响级别（从 CRITICAL 到 LOW）组织，在智能体处理 React 或 Next.js 代码时按需加载。
*   **Supabase [`supabase-postgres-best-practices`](https://github.com/supabase/agent-skills)** —— 涵盖 8 个类别（查询性能、连接管理、RLS、安全）的 Postgres 优化指南，结构化为按需参考资料。
*   **Google [`gemini-api-dev`](https://github.com/google-gemini/gemini-skills)** —— Google 为 Gemini API 提供的官方工具包装器，编码了构建由 Gemini 驱动的应用的最佳实践，可直接安装到任何兼容技能的智能体中。
*   **Google [`adk-core-skills`](https://github.com/google/adk-docs/tree/main/skills?utm_campaign=adk-skill-design-patterns&utm_medium=blog&utm_source=lavinigam-blog)** —— Google 官方的 ADK 开发技能：涵盖 ADK 开发指南、速查表、评估、部署、可观测性和脚手架的 6 个技能。可通过 `npx skills add google/adk-docs -y -g` 安装到任何编码智能体（Gemini CLI, Claude Code, Cursor）。这些是教导编码智能体如何正确编写 ADK 代码的工具包装器 —— ADK 团队在内部先行试用 (Dogfooding) 了 `SkillToolset` 在运行时使用的同种 SKILL.md 格式。

该模式同样适用于内部工具：编写一个 `google-adk-conventions` 技能，其中编码了你团队的 ADK 模式 —— 默认使用哪个模型、如何命名智能体、如何连接工具集、如何处理错误 —— 这样你团队构建的每个 ADK 智能体都会自动遵循相同的规范，而无需在每个系统提示词中重复它们。

```yaml
# skills/google-adk-conventions/SKILL.md
---
name: google-adk-conventions
description: Google ADK 编码规范和最佳实践。在构建、审查或调试任何 ADK 智能体、工具或多智能体系统时使用。
metadata:
  pattern: tool-wrapper
  domain: google-adk
---

你是 ADK 专家。在编写或审查 ADK 代码时，请应用这些规范。

## 智能体命名
- `name` 字段必须与智能体的目录名称完全匹配 (`search-agent/` → `name="search-agent"`)
- 使用小写字母、连字符分隔的名称：使用 `search-agent`，而不是 `SearchAgent`

## 模型选择
- 大多数任务默认使用 `gemini-2.5-flash`（快速且经济）
- 仅在复杂的多步骤推理中使用 `gemini-2.5-pro`
- 将模型定义为常量，切勿内联硬编码：`MODEL = "gemini-2.5-flash"`

## 工具定义
加载 `references/tool-conventions.md` 以获取完整规则。关键点：
- 名称：动词-名词，蛇形命名法 (snake_case) —— `get_weather`, `search_documents`，而不是 `run` 或 `doStuff`
- 始终添加类型提示：`city: str`, `user_id: int`
- 不设置默认参数值 —— LLM 必须推导或请求所有输入
- Docstring 是 LLM 的主要手册 —— 保持精确，不要描述 `ToolContext`

## 多智能体系统
- 子智能体上的 `description` 字段是你的路由 API —— 请具体化，不要太通用
- 每个根智能体仅限一个内置工具（Google Search, Code Exec）
- 当一个智能体拥有 5 个以上工具时，将相关工具分组到 `BaseToolset` 子类中
```

> 注意
> 
> 前置元数据中的 `metadata` 字段是一个 `dict[str, str]` —— ADK 会存储它但不会强制执行任何架构。我用它来按模式和领域标记技能，这在你有 20 多个技能并需要审计它们时非常有帮助。

## 模式 2：生成器 (Generator) —— 生成结构化输出

**生成器**技能通过填充可重用模板来生成文档、报告或配置。与工具包装器不同，它使用两个可选目录：`assets/` 存放输出模板（要填充的结构），而 `references/` 存放风格指南（要遵循的质量规则）。指令负责编排整个过程 —— 加载风格指南、加载模板、收集输入、进行填充。

![模式 2：生成器 —— SKILL.md 编排模板填充并遵循风格指南规则](https://lavinigam.com/posts/adk-skill-design-patterns/pattern-generator.webp)

*生成器模式：指令编排过程，references/ 定义质量规则，assets/ 提供输出模板。*

```yaml
# skills/report-generator/SKILL.md
---
name: report-generator
description: 以 Markdown 格式生成结构化技术报告。当用户要求编写、创建或起草报告、总结或分析文档时使用。
metadata:
  pattern: generator
  output-format: markdown
---

你是一个技术报告生成器。请严格遵循以下步骤：

第 1 步：加载 'references/style-guide.md' 以获取语气和格式规则。

第 2 步：加载 'assets/report-template.md' 以获取所需的输出结构。

第 3 步：向用户询问填充模板所需的任何缺失信息：
- 主题或内容
- 关键发现或数据点
- 目标受众（技术、高管、大众）

第 4 步：根据风格指南规则填充模板。模板中的每个部分都必须出现在输出中。

第 5 步：以单个 Markdown 文档的形式返回完成的报告。
```

`assets/report-template.md` 中的模板定义了每份报告必须具备的确切部分 —— 执行摘要、背景、方法论、发现、总结表、建议、后续步骤。`references/style-guide.md` 中的风格指南控制语气（“第三人称，主动语态”）、格式（“H2 用于章节，H3 用于子章节”）和质量（“执行摘要不超过 150 字，不使用模糊的后续步骤”）。

智能体在激活技能时通过 `load_skill_resource` 加载这两个文件。模板强制执行结构，风格指南强制执行质量。只需更换其中任何一个文件，即可在不触动指令的情况下更改输出。

### 何时使用生成器

当输出每次都需要遵循固定结构时 —— 一致性比创造力更重要。常见的现实用例：

*   **技术报告** —— 无论主题如何，执行摘要、方法论、发现、建议始终按相同顺序排列。
*   **API 文档** —— 每个端点都使用相同的部分进行记录：描述、参数、请求/响应示例、错误代码。
*   **提交信息 (Commit messages)** —— 根据模板强制执行约定式提交 (Conventional Commits) 格式（`feat:`, `fix:`, `docs:`），使仓库中的每个提交读起来都具有一致性。
*   **ADK 智能体脚手架** —— 从模板为新的 ADK 项目生成标准的 `agent.py` + `__init__.py` + `.env` 结构，并预先配置好你团队的模型常量和指令风格。

## 模式 3：审查器 (Reviewer) —— 根据标准进行评估

**审查器**技能根据存储在 `references/` 中的清单来评估代码、内容或工件，并生成按严重程度分组的评分发现报告。关键的设计见解是：将“检查什么”（清单文件）与“如何检查”（指令中的审查协议）分开。将 `references/review-checklist.md` 替换为 `references/security-checklist.md`，你就可以通过相同的技能结构获得完全不同的审查结果。

![模式 3：审查器 —— 输入流经审查协议，清单驱动评估，生成评分报告](https://lavinigam.com/posts/adk-skill-design-patterns/pattern-reviewer.webp)

*审查器模式：用户提交代码，技能从 references/ 加载其清单，应用审查协议，并生成按严重程度分组的发现报告。*

```yaml
# skills/code-reviewer/SKILL.md
---
name: code-reviewer
description: 审查 Python 代码的质量、风格和常见漏洞。当用户提交代码进行审查、要求对其代码提供反馈或想要进行代码审计时使用。
metadata:
  pattern: reviewer
  severity-levels: error,warning,info
---

你是一个 Python 代码审查器。请严格遵循以下审查协议：

第 1 步：加载 'references/review-checklist.md' 以获取完整的审查标准。

第 2 步：仔细阅读用户的代码。在批评之前先了解其目的。

第 3 步：将清单中的每条规则应用于代码。对于发现的每项违规：
- 记录行号（或大概位置）
- 分类严重程度：错误 (必须修复)、警告 (应该修复)、提示 (考虑修复)
- 解释为什么这是一个问题，而不仅仅是指出哪里错了
- 提供具体的修复建议及更正后的代码

第 4 步：生成包含以下部分的结构化审查：
- **摘要**：代码的作用、整体质量评估
- **发现**：按严重程度分组（先是错误，然后是警告，最后是提示）
- **评分**：1-10 分，并简要说明理由
- **前 3 项建议**：最具影响力的改进建议
```

`references/review-checklist.md` 包含按类别组织的实际规则 —— 正确性 (严重程度： error)、风格 (严重程度： warning)、文档 (严重程度： info)、安全 (严重程度： error)、性能 (严重程度： info)。每个类别都有具体的、可检查的项目：“不使用可变默认参数”、“函数不超过 30 行”、“不使用通配符导入”。

当我用一个带有三个故意遗留 Bug 的函数（`PascalCase` 命名、可变默认参数和空的 `except:`）测试此模式时，智能体加载了技能，获取了清单，并捕捉到了全部三个问题。它将可变默认参数归类为错误（正确 —— 这是一个 Bug），将命名归类为警告（正确 —— 这是风格问题），并生成了一份评分报告。驱动行为的是清单，而不是智能体的预训练知识。

### 何时使用审查器

任何人类审查员根据清单工作的地方 —— 审查器技能都可以对其进行编码并一致地应用。常见的现实用例：

*   **代码审查** —— 根据你团队的风格规则捕捉可变默认参数、缺失的类型提示、空的 `except:` 块；[Giorgio Crivellari](https://medium.com/google-cloud/i-built-an-agent-skill-for-googles-adk-here-s-why-your-coding-agent-needs-one-too-e5d3a56ef81b) 通过一个 ADK 治理技能演示了这一点，该技能将代码质量分数从 29% 提升到了 99%。
*   **安全审计** —— 对提交的代码运行 OWASP Top 10 检查，在进行任何人工审查之前按严重程度对发现的问题进行分类。
*   **编辑审查** —— 根据内部风格指南（语气、标题结构、字数、禁用词汇）检查博客文章或文档。
*   **ADK 智能体审查** —— 根据你团队的 `google-adk-conventions` 验证新的智能体：命名、模型常量、工具 docstrings、描述字段质量。

## 模式 4：反转模式 (Inversion) —— 技能对你进行访谈

**反转模式**颠覆了典型的智能体交互：不是由用户驱动对话，而是由技能指示智能体在生成任何输出之前，通过定义的阶段提出结构化问题。在收集到所需的所有信息之前，智能体不会采取行动。这不需要特殊的框架支持 —— 反转模式纯粹是一种指令编写模式，依靠像 `在所有阶段完成之前切勿开始构建` 这样的显式限制来约束智能体。

![模式 4：反转模式 —— 在合成输出前进行三个阶段的提问](https://lavinigam.com/posts/adk-skill-design-patterns/pattern-inversion.webp)

*反转模式：技能驱动对话进行分阶段提问，仅在收集到所有答案后才合成输出。*

```yaml
# skills/project-planner/SKILL.md
---
name: project-planner
description: 通过结构化问题收集需求来规划新的软件项目，然后再生成计划。当用户说“我想构建”、“帮我规划”、“设计一个系统”或“开始一个新项目”时使用。
metadata:
  pattern: inversion
  interaction: multi-turn
---

你正在进行结构化的需求访谈。在所有阶段完成之前，切勿开始构建或设计。

## 第 1 阶段 —— 问题发现（一次只提一个问题，等待每个答案）

按顺序询问这些问题。不要跳过任何一个。

- Q1: “这个项目为用户解决了什么问题？”
- Q2: “主要用户是谁？他们的技术水平如何？”
- Q3: “预期规模是多少？（每天的用户数、数据量、请求率）”

## 第 2 阶段 —— 技术限制（仅在第 1 阶段得到完整回答后进行）

- Q4: “你将使用什么部署环境？”
- Q5: “你对技术栈有什么要求或偏好吗？”
- Q6: “有哪些不可协商的要求？（延迟、可用性、合规性、预算）”

## 第 3 阶段 —— 合成（仅在所有问题得到回答后进行）

1. 加载 'assets/plan-template.md' 以获取输出格式
2. 使用收集到的需求填充模板的每个部分
3. 向用户展示完整的计划
4. 询问：“这个计划是否准确捕捉了你的需求？你有什么想修改的吗？”
5. 根据反馈进行迭代，直到用户确认
```

这种分阶段结构是反转模式奏效的原因。第 1 阶段必须在第 2 阶段开始之前完成。第 3 阶段仅在所有问题都得到回答后触发。顶部的 `在所有阶段完成之前切勿开始构建或设计` 指令是关键的门控 —— 如果没有它，智能体往往会在第一个答案之后就草率得出结论。

`assets/plan-template.md` 锚定了合成步骤。它定义了问题陈述、目标用户、规模要求、技术架构、不可协商的要求、拟议里程碑、风险与缓解措施以及决策日志等章节。智能体使用访谈答案填充此模板，无论对话过程如何，都能产生一致的输出。

### 何时使用反转模式

任何智能体在开展有用工作之前需要获取用户上下文的地方 —— 它能防止最常见的智能体失败模式：基于假设而不是询问来生成详细计划。常见的现实用例：

*   **需求收集** —— 在生成技术设计之前，就项目对用户进行访谈，确保计划反映实际限制而不是猜测。
*   **诊断访谈** —— 在建议修复方案之前，逐步完成结构化的故障排除清单（环境、版本、错误消息、复现步骤）。
*   **配置向导** —— 在生成基础设施配置之前，收集部署偏好（云供应商、区域、扩展要求）。
*   **ADK 智能体设计** —— 在搭建新的 ADK 智能体脚手架之前，对用户进行访谈：它需要哪些工具，使用哪个模型，它是多智能体系统的一部分吗，路由限制是什么？

## 模式 5：流水线 (Pipeline) —— 强制执行多步工作流

**流水线**技能定义了一个顺序工作流，其中每个步骤必须在前一个步骤完成之后才开始，并带有显式的门控条件防止智能体跳过验证。它是最复杂的模式 —— 与仅加载参考资料的工具包装器不同，流水线使用所有三个可选目录（`references/`、`assets/`、`scripts/`），并在步骤之间添加控制流。指令本身就是工作流的定义。

![模式 5：流水线 —— 带有门控条件的四个步骤](https://lavinigam.com/posts/adk-skill-design-patterns/pattern-pipeline.webp)

*流水线模式：步骤按顺序执行，带有菱形门控条件。“用户确认？”门控防止智能体跳过验证。*

```yaml
# skills/doc-pipeline/SKILL.md
---
name: doc-pipeline
description: 通过多步流水线从 Python 源代码生成 API 文档。当用户要求记录模块、生成 API 文档或从代码创建文档时使用。
metadata:
  pattern: pipeline
  steps: "4"
---

你正在运行一个文档生成流水线。请按顺序执行每个步骤。如果某个步骤失败，不要跳过步骤或继续。

## 第 1 步 —— 解析与盘点
分析用户的 Python 代码以提取所有公共类、函数和常量。将盘点结果作为清单展示。询问：“这是你想记录的完整公共 API 吗？”

## 第 2 步 —— 生成 Docstrings
对于每个缺失 Docstring 的函数：
- 加载 'references/docstring-style.md' 以获取所需的格式
- 严格按照风格指南生成 Docstring
- 展示每个生成的 Docstring 以供用户批准
在用户确认之前，不要进入第 3 步。

## 第 3 步 —— 组装文档
加载 'assets/api-doc-template.md' 以获取输出结构。将所有类、函数和 Docstrings 编译成单个 API 参考文档。

## 第 4 步 —— 质量检查
根据 'references/quality-checklist.md' 进行审查：
- 每个公共符号都有记录
- 每个参数都有类型和描述
- 每个函数至少有一个使用示例
报告结果。在展示最终文档之前修复问题。
```

门控条件是核心特征。“在用户确认之前，不要进入第 3 步”防止了智能体使用未经审查的 Docstring 组装文档。顶部的“如果某个步骤失败，不要跳过步骤或继续”强化了顺序约束。如果没有这些门控，智能体往往会冲过所有步骤，展示一个跳过了验证的最终结果。

每个步骤加载不同的资源。第 2 步加载 `references/docstring-style.md`（Google 风格的 Docstring 格式）。第 3 步加载 `assets/api-doc-template.md`（带有目录、类、函数、常量部分的输出结构）。第 4 步加载 `references/quality-checklist.md`（完整性和质量规则）。智能体只为每步所需的资源支付上下文 Token。

### 何时使用流水线

任何步骤之间存在依赖关系且顺序至关重要的多步过程 —— 如果跳过某个步骤会产生错误或未经验证的输出，请使用流水线。常见的现实用例：

*   **文档生成** —— 解析代码 → 生成 Docstrings（需用户批准） → 组装文档 → 质量检查，阶段之间设有门控。
*   **数据处理** —— 验证输入 → 转换 → 增强 → 写入输出，每一步必须在下一步运行前成功。
*   **部署工作流** —— 运行测试 → 构建产物 → 部署到测试环境 → 冒烟测试 → 推送到生产环境，带有各级人工确认门控。
*   **ADK 智能体入职** —— 访谈用户（反转模式） → 脚手架文件（生成器） → 根据规范进行验证（审查器），将三种模式组合成一个流水线。

## 选择合适的 ADK 技能模式

每种模式回答一个不同的问题。使用下表寻找合适的模式，如果仍不确定，请参考下面的决策树。

| 模式 | 适用场景。.. | 使用的目录 | 复杂度 |
| --- | --- | --- | --- |
| **工具包装器 (Tool Wrapper)** | 智能体需要关于特定库或工具的专家知识 | `references/` | 低 |
| **生成器 (Generator)** | 输出每次都必须遵循固定模板 | `assets/` + `references/` | 中 |
| **审查器 (Reviewer)** | 代码或内容需要根据清单进行评估 | `references/` | 中 |
| **反转模式 (Inversion)** | 智能体必须在行动前从用户处收集上下文 | `assets/` | 中 —— 多轮对话 |
| **流水线 (Pipeline)** | 工作流具有顺序步骤，且步骤间设有验证门控 | `references/` + `assets/` + `scripts/` | 高 |

模式是可以组合的。流水线可以包含审查步骤 —— 文档流水线的第 4 步加载 `quality-checklist.md` 并根据其评估组装好的文档，这就是嵌入在流水线内部的审查器模式。生成器可以在生成输出之前使用反转模式收集输入。工具包装器可以作为参考文件嵌入在流水线技能中。[arXiv 论文 “SoK: Agentic Skills”](https://arxiv.org/html/2602.20867v1)（2026 年 2 月）发现，生产系统通常结合 2-3 种模式，最常见的组合是元数据驱动的披露（我们的工具包装器）加上市场分发。

如果你不确定哪种模式适合，请从这个决策树开始：

![选择合适的模式 —— 带有“是/否”分支的决策树流程图，指向每种模式](https://lavinigam.com/posts/adk-skill-design-patterns/pattern-comparison.webp)

*决策指南：遵循是/否分支，为你的用例寻找合适的模式。大多数技能都能清晰地映射到其中一种模式。*

## ADK 技能生态系统

你不需要从头开始编写每个技能。[智能体技能标准](https://agentskills.io/specification?utm_campaign=adk-skill-design-patterns&utm_medium=blog&utm_source=lavinigam-blog) 意味着任何为 Claude Code、Gemini CLI、Cursor 或 [30 多种兼容智能体](https://agentskills.io/home?utm_campaign=adk-skill-design-patterns&utm_medium=blog&utm_source=lavinigam-blog) 编写的技能都可以通过 `load_skill_from_dir()` 加载到 ADK 中。以下是寻找它们的地方：

*   **[skills.sh](https://skills.sh/)** —— 最大的社区市场（安装量超过 86,000 次）；使用 `npx skills add <owner/repo>` 浏览并安装任何技能。
*   **[google-gemini/gemini-skills](https://github.com/google-gemini/gemini-skills)** —— Google 为 Gemini API 提供的官方工具包装器技能，涵盖了构建由 Gemini 驱动的应用的最佳实践。
*   **[google/adk-docs/skills](https://github.com/google/adk-docs/tree/main/skills?utm_campaign=adk-skill-design-patterns&utm_medium=blog&utm_source=lavinigam-blog)** —— Google 的官方 ADK 开发技能（开发指南、速查表、评估、部署、可观测性、脚手架）—— 通过 `npx skills add google/adk-docs -y -g` 安装。
*   **[vercel-labs/agent-skills](https://github.com/vercel-labs/agent-skills)** —— Vercel 官方提供的 React、Next.js、AI SDK 和部署模式技能（2.2 万 Star）。
*   **[supabase/agent-skills](https://github.com/supabase/agent-skills)** —— Supabase 的 Postgres 优化指南，涵盖查询性能、RLS 和连接管理。
*   **[anthropics/skills](https://github.com/anthropics/skills)** —— 生产级文档技能，用于生成 PowerPoint、Excel、Word 和 PDF（8.65 万 Star）。
*   **[VoltAgent/awesome-agent-skills](https://github.com/VoltAgent/awesome-agent-skills)** —— 来自领先工程团队的官方技能精选集。
*   **[kodustech/awesome-agent-skills](https://github.com/kodustech/awesome-agent-skills)** —— 专注于架构和设计模式的技能。

要在 ADK 中加载这些技能，请克隆或复制技能目录，并将 `load_skill_from_dir` 指向它：

```python
# 从任何兼容技能的源加载社区技能
community_skill = load_skill_from_dir(
    pathlib.Path(__file__).parent / "skills" / "community-skill-name"
)
```

> 注意
> 
> 目录名称必须与技能 SKILL.md 前置元数据中的 `name` 字段完全匹配 —— ADK 会在加载时强制执行此要求。[第 2 部分](https://lavinigam.com/posts/adk-agent-skills-part2/#pattern-2-file-based-adk-skills) 介绍了确切的错误行为。

> 警告
> 
> **使用外部技能需自担风险。** 社区和第三方技能未经 Google 或 ADK 团队审查或背书。在加载任何外部技能之前，请检查其 SKILL.md 指令、参考文件和脚本，以防出现非预期的行为、数据外泄或提示词注入。你负责对添加到智能体中的任何技能进行审计。

### ADK 核心技能：Google 官方开发技能

Google 发布了 [官方技能](https://google.github.io/adk-docs/tutorials/coding-with-ai/?utm_campaign=adk-skill-design-patterns&utm_medium=blog&utm_source=lavinigam-blog)，教导编码智能体如何编写 ADK 代码：

| 技能 | 教授内容 |
| --- | --- |
| `adk-dev-guide` | ADK 架构、智能体类型、工具定义、回调 |
| `adk-cheatsheet` | 常见 ADK 任务的快速参考模式 |
| `adk-eval-guide` | 编写和运行智能体评估 |
| `adk-deploy-guide` | 将 ADK 智能体部署到 Cloud Run 和 Vertex AI |
| `adk-observability-guide` | ADK 智能体的追踪、日志记录和监控 |
| `adk-scaffold` | 项目脚手架和目录结构 |

只需一条命令即可全局安装全部六个技能：

```bash
npx skills add google/adk-docs -y -g
```

这些都是 **工具包装器 (Tool Wrapper)** 技能 —— 即 [上文](#模式-1工具包装器-tool-wrapper--教会智能体使用库) 介绍的同种模式。它们遵循 agentskills.io 规范，这意味着它们可以在 Gemini CLI、Claude Code、Cursor 以及任何兼容的智能体中工作。ADK 团队在内部先行试用了 `SkillToolset` 在运行时使用的同种 SKILL.md 格式 —— 一套规范同时驱动开发工作流（编码智能体编写 ADK 代码）和生产运行时（部署的智能体按需加载技能）。

* * *

## 常见问题

### 我可以在其他编码智能体中使用在 ADK 中开发的技能吗？

可以 —— 你在 ADK 内部开发的技能遵循 [agentskills.io 规范](https://agentskills.io/specification?utm_campaign=adk-skill-design-patterns&utm_medium=blog&utm_source=lavinigam-blog)，这是 Gemini CLI、Antigravity、Claude Code 和 OpenAI Codex 使用的同种开放标准。在 ADK 中编写的技能可以被这些智能体中的任何一个加载。跨客户端的规范是将共享技能存储在 `<project>/.agents/skills/` 或 `~/.agents/skills/` 中。对于外部编写的技能（来自社区仓库或其他团队），请查看各智能体的文档以了解如何导入和加载它们。

### 一个智能体可以拥有多少个技能？

目前的 ADK 版本（v1.25.0+，标记为 Experimental）没有硬性限制。[`SkillToolset`](https://google.github.io/adk-docs/skills/?utm_campaign=adk-skill-design-patterns&utm_medium=blog&utm_source=lavinigam-blog) 在每次 LLM 调用时通过 [`process_llm_request()`](https://github.com/google/adk-python/tree/main/src/google/adk/tools/skill_toolset.py?utm_campaign=adk-skill-design-patterns&utm_medium=blog&utm_source=lavinigam-blog) 注入技能描述（每个约 100 Token）。如果有 50 个技能，每次调用的开销大约为 5,000-7,500 Token（包括 XML 包装） —— 对于拥有 12.8 万以上上下文窗口的模型来说，这仍然是可以接受的。性能会随着技能数量的增加而优雅地下降。

### 模式可以组合吗？

可以。流水线技能可以包含审查步骤（文档流水线的第 4 步是质量审查）。生成器可以使用反转模式在生成输出之前收集输入。[arXiv 论文](https://arxiv.org/html/2602.20867v1) 发现，生产系统每个技能平均使用 2 种模式，最常见的组合是元数据驱动的披露加上市场分发。

### `scripts/` 目录中的可执行脚本呢？

当前的 pip 发行版尚不支持通过 `scripts/` 目录执行脚本 —— [ADK 文档](https://google.github.io/adk-docs/skills/?utm_campaign=adk-skill-design-patterns&utm_medium=blog&utm_source=lavinigam-blog) 将其列为已知限制。当该功能发布时，它将支持流水线和工具包装器模式，并直接从技能目录运行可执行的 Python 和 Shell 脚本。我在 [第 3 部分的“下一步”](https://lavinigam.com/posts/adk-agent-skills-part3/#extending-adk-skills-scripts-multi-agent-and-team-libraries) 中预告了这一功能。

### 技能应该存储在哪里 —— 项目级还是用户级？

项目级 (`<project>/.agents/skills/`) 用于与代码库共存的团队共享技能。用户级 (`~/.agents/skills/`) 用于跨所有项目的个人技能。ADK 使用显式的 `load_skill_from_dir()` 路径 —— 你选择目录，而 [Agent Skills 规范](https://agentskills.io/specification?utm_campaign=adk-skill-design-patterns&utm_medium=blog&utm_source=lavinigam-blog) 中的约定会处理跨客户端的互操作性。

### 如何测试技能的有效性？

agentskills.io 规范定义了一种 [评估方法论](https://agentskills.io/skill-creation/evaluating-skills?utm_campaign=adk-skill-design-patterns&utm_medium=blog&utm_source=lavinigam-blog)：在 `evals/evals.json` 中创建测试用例，在有和没有该技能的情况下分别运行每个用例，并测量通过率的增量。这个增量会告诉你该技能带来的确切收益与其消耗的上下文 Token 成本之间的关系。

### ADK 技能和工具之间有什么区别？

工具赋予智能体采取行动的能力 —— 调用 API、读取文件、查询数据库。技能教导智能体*何时*以及*如何*有效地使用这些工具。工具是“调用天气 API”。技能是“当用户询问旅行时，检查每个目的地的天气，比较结果，并格式化为行程单”。技能是在工具之上的组合 —— 参见 [第 1 部分的解释](https://lavinigam.com/posts/adk-agent-skills-part1/#what-are-skills-and-why-they-matter) 以了解完整区别。

### SKILL.md 文件在 Google ADK 中是如何工作的？

SKILL.md 文件是带有 YAML 前置元数据（`name`, `description`）和结构化指令的 Markdown 文档。ADK 的 [`SkillToolset`](https://google.github.io/adk-docs/skills/?utm_campaign=adk-skill-design-patterns&utm_medium=blog&utm_source=lavinigam-blog) 通过 `load_skill_from_dir()` 加载它们，自动生成三个工具（`list_skills`, `load_skill`, `load_skill_resource`），并使用渐进式披露，仅在与用户查询相关时才加载完整指令。参见 [第 2 部分](https://lavinigam.com/posts/adk-agent-skills-part2/) 获取完整的格式参考。

### 我应该从哪种 SKILL.md 设计模式开始？

从 **工具包装器 (Tool Wrapper)** 开始 —— 它是最简单的模式（只有指令加参考文件），也是应用最广泛的。将你团队的编码规范或库的最佳实践包装到一个带有 `references/` 目录的 SKILL.md 中。当你需要结构化输出或评估时，再晋升到生成器或审查器。上面的 [决策树](#选择合适的-adk-技能模式) 可以帮助你选择合适的模式。

### 什么是 ADK 核心技能，它们与 SkillToolset 有什么关系？

ADK 核心技能是 Google 发布的 [官方技能](https://github.com/google/adk-docs/tree/main/skills?utm_campaign=adk-skill-design-patterns&utm_medium=blog&utm_source=lavinigam-blog)，教导编码智能体（Gemini CLI, Claude Code, Cursor）如何正确编写 ADK 代码。它们遵循本文描述的 **工具包装器 (Tool Wrapper)** 模式，并使用 agentskills.io 规范。`SkillToolset` 是为*已部署*的生产智能体配备技能的运行时 API。两者使用相同的 SKILL.md 格式：核心技能帮助你*构建* ADK 智能体；SkillToolset 帮助你的智能体通过模块化知识进行*运行*。

* * *

## ADK 技能的下一步

克隆 [配套仓库](https://github.com/lavinigam-gcp/build-with-adk/tree/main/adk-skill-design-patterns?utm_campaign=adk-skill-design-patterns&utm_medium=blog&utm_source=lavinigam-blog)，运行 [`adk web .`](https://google.github.io/adk-docs/runtime/web-interface/?utm_campaign=adk-skill-design-patterns&utm_medium=blog&utm_source=lavinigam-blog)，并尝试每种模式。从审查器开始 —— 提交一些 Python 代码，观察智能体加载清单并生成评分审查报告。然后将 `references/review-checklist.md` 替换为你自己团队的编码标准。

如果你是 ADK 技能的新手，请从 [第 1 部分](https://lavinigam.com/posts/adk-agent-skills-part1/) 的基础知识开始。如果你想要能够创建其他技能的技能，[第 3 部分](https://lavinigam.com/posts/adk-agent-skills-part3/) 介绍了元技能模式。本文是 [Lavi Nigam](https://lavinigam.com/about/) 的 [智能体工程系列](https://lavinigam.com/series/agent-engineering/) 的一部分 —— 更多相关内容请参阅 [ADK 标签](https://lavinigam.com/tags/adk/)。

* * *

## 参考文献

1.  [ADK 智能体技能](https://google.github.io/adk-docs/skills/?utm_campaign=adk-skill-design-patterns&utm_medium=blog&utm_source=lavinigam-blog) —— SkillToolset 和渐进式披露的官方 ADK 文档
2.  [智能体技能规范](https://agentskills.io/specification?utm_campaign=adk-skill-design-patterns&utm_medium=blog&utm_source=lavinigam-blog) —— 定义 SKILL.md 格式的开放标准，已被 30 多种智能体工具采用
3.  [什么是智能体技能？](https://agentskills.io/home?utm_campaign=adk-skill-design-patterns&utm_medium=blog&utm_source=lavinigam-blog) —— 来自 agentskills.io 的概念概述和采用列表
4.  [第 1 部分：使用 SkillToolset 实现渐进式披露](https://lavinigam.com/posts/adk-agent-skills-part1/) —— 基础：L1/L2/L3 级别，内联技能
5.  [第 2 部分：基于文件、外部技能及 SkillToolset 内部原理](https://lavinigam.com/posts/adk-agent-skills-part2/) —— SKILL.md 格式、load\_skill\_from\_dir、多技能加载
6.  [第 3 部分：编写技能的技能](https://lavinigam.com/posts/adk-agent-skills-part3/) —— 元技能模式，自扩展智能体
7.  [配套代码仓库](https://github.com/lavinigam-gcp/build-with-adk/tree/main/adk-skill-design-patterns?utm_campaign=adk-skill-design-patterns&utm_medium=blog&utm_source=lavinigam-blog) —— 本文所有五种模式的工作代码
8.  [`skill_toolset.py`](https://github.com/google/adk-python/tree/main/src/google/adk/tools/skill_toolset.py?utm_campaign=adk-skill-design-patterns&utm_medium=blog&utm_source=lavinigam-blog) —— 带有自动生成工具的 SkillToolset 源代码
9.  [`skills_agent` 示例](https://github.com/google/adk-python/tree/main/contributing/samples/skills_agent?utm_campaign=adk-skill-design-patterns&utm_medium=blog&utm_source=lavinigam-blog) —— 带有内联 + 基于文件技能的官方 ADK 示例
10.  [SoK: Agentic Skills — Beyond Tool Use in LLM Agents](https://arxiv.org/html/2602.20867v1) —— 2026 年 2 月的 arXiv 论文，识别了 7 种系统级技能设计模式
11.  [skills.sh — 智能体技能目录](https://skills.sh/) —— 拥有 86,000 多次总安装量的社区市场
12.  [Anthropic 技能仓库](https://github.com/anthropics/skills) —— 86,500 Star，生产级文档技能
13.  [google-gemini/gemini-skills](https://github.com/google-gemini/gemini-skills) —— Google 官方提供的 Gemini API 工具包装器技能
14.  [vercel-labs/agent-skills](https://github.com/vercel-labs/agent-skills) —— Vercel 官方提供的 React、Next.js 和部署模式技能
15.  [supabase/agent-skills](https://github.com/supabase/agent-skills) —— Supabase 以工具包装器技能形式提供的 Postgres 优化指南
16.  [awesome-agent-skills (VoltAgent)](https://github.com/VoltAgent/awesome-agent-skills) —— 来自领先开发团队的精选集
17.  [awesome-agent-skills (kodustech)](https://github.com/kodustech/awesome-agent-skills) —— 架构和设计模式技能
18.  [在技能中使用脚本](https://agentskills.io/skill-creation/using-scripts?utm_campaign=adk-skill-design-patterns&utm_medium=blog&utm_source=lavinigam-blog) —— 智能体脚本设计模式
19.  [评估技能](https://agentskills.io/skill-creation/evaluating-skills?utm_campaign=adk-skill-design-patterns&utm_medium=blog&utm_source=lavinigam-blog) —— 评估方法论：测试用例、通过率增量
20.  [Giorgio Crivellari — 我为 Google 的 ADK 构建了一个智能体技能](https://medium.com/google-cloud/i-built-an-agent-skill-for-googles-adk-here-s-why-your-coding-agent-needs-one-too-e5d3a56ef81b) —— 审查器模式实现了从 29% 到 99% 的代码质量提升
21.  [使用 AI 进行编码 —— ADK 核心技能](https://google.github.io/adk-docs/tutorials/coding-with-ai/?utm_campaign=adk-skill-design-patterns&utm_medium=blog&utm_source=lavinigam-blog) —— 将 ADK 技能与编码智能体结合使用的官方教程
22.  [ADK 核心技能 (GitHub)](https://github.com/google/adk-docs/tree/main/skills?utm_campaign=adk-skill-design-patterns&utm_medium=blog&utm_source=lavinigam-blog) —— 官方 ADK 开发技能的源代码

* * *

[📦

配套仓库

克隆该仓库，并使用 adk web . 在本地运行所有五种模式示例。

→](https://github.com/lavinigam-gcp/build-with-adk/tree/main/adk-skill-design-patterns) [📚

ADK 技能文档

关于 SkillToolset、渐进式披露和技能加载的官方指南

→](https://google.github.io/adk-docs/skills/) [📜

Agentic Skills — Beyond Tool Use in LLM Agents

识别了生产智能体系统中 7 种系统级技能设计模式的研究论文

→](https://arxiv.org/html/2602.20867v1)

[克隆仓库 ↗](https://github.com/lavinigam-gcp/build-with-adk/tree/main/adk-skill-design-patterns)
