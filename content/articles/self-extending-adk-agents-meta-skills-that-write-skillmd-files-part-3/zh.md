---
title: 使用可复用技能构建 ADK Agent（第三部分）：元技能与自扩展 Agent
date: '2026-03-18T09:56:49.920Z'
sourceUrl: 'https://lavinigam.com/posts/adk-agent-skills-part3/'
lang: zh
---
> **这是关于使用可复用技能构建 ADK Agent 的三部分系列文章之第三部分**。
> 
> *   [← 第一部分：什么是 Agent 技能？](https://lavinigam.com/posts/adk-agent-skills-part1/)
> *   [← 第二部分：基于文件、外部技能与 SkillToolset 内部原理](https://lavinigam.com/posts/adk-agent-skills-part2/)
> *   [每个 ADK 开发者都应了解的 5 种 SKILL.md 设计模式 →](https://lavinigam.com/posts/adk-skill-design-patterns/)
> *   [ADK 核心技能](https://google.github.io/adk-docs/tutorials/coding-with-ai/?utm_campaign=adk-agent-skills-part3&utm_medium=blog&utm_source=lavinigam-blog) — 用于构建 ADK Agent 的官方技能

在第一和第二部分中，我们构建了现有的 ADK 技能——内联 SEO 检查清单、从目录加载的基于文件和外部技能，它们都通过 `SkillToolset` 连接并自动生成了三个工具。第三部分完成了闭环：Agent 编写自己的技能。

到本文结束时，你将了解如何：

*   构建一个**元技能 (meta skill)**，用于根据 agentskills.io 规范生成新的 SKILL.md 文件
*   理解**自扩展 Agent (self-extending agents)** 如何改变能力构建的经济效益
*   认识到技能如何改变 **Agent 的决策**，而不仅仅是知识

[克隆仓库 ↗](https://github.com/lavinigam-gcp/build-with-adk/tree/main/adk-agent-skills-tutorial)

> 提示
> 
> *   **元技能**教 Agent 根据 agentskills.io 规范按需生成新的 SKILL.md 文件
> *   **自扩展 Agent** 可以通过在运行时编写和加载新的技能定义，在无需人工干预的情况下扩展自身能力
> *   技能改变 Agent 的*决策方式*，而不仅仅是它的知识——它们重塑了 Agent 处理问题的方法
> *   Giorgio Crivellari 的 ADK 治理技能将代码正确率从 29% 提高到 99%，展示了结构化技能的强大力量

**元技能 (meta skill)** 是旨在生成新 SKILL.md 文件的技能——它教 Agent 如何根据 agentskills.io 规范按需创建额外的技能。配备元技能的 Agent 变得具有**自扩展性**：它可以在运行时编写并加载新的技能定义，从而在无需人工干预的情况下扩展其自身能力。

前三个模式涵盖了现有的技能——由你编写（内联、基于文件）或由你寻找（外部）。模式 4 完成了闭环：Agent 自己编写新技能。

`skill-creator` 是一个内联技能，其指令解释了如何编写 SKILL.md 文件，其 `resources` 包含 [agentskills.io 规范](https://agentskills.io/specification?utm_campaign=adk-agent-skills-part3&utm_medium=blog&utm_source=lavinigam-blog) 和一个工作示例。这就是模式 1 中的 `resources` 字段变得至关重要的地方。

```python
# agent.py — Pattern 4: Meta Skill
skill_creator = models.Skill(
    frontmatter=models.Frontmatter(
        name="skill-creator",
        description=(
            "Creates new ADK-compatible skill definitions from requirements."
            " Generates complete SKILL.md files following the Agent Skills"
            " specification at agentskills.io."
        ),
    ),
    instructions=(
        "When asked to create a new skill, generate a complete SKILL.md file.\n\n"
        "Read `references/skill-spec.md` for the format specification.\n"
        "Read `references/example-skill.md` for a working example.\n\n"
        "Follow these rules:\n"
        "1. Name must be kebab-case, max 64 characters\n"
        "2. Description must be under 1024 characters\n"
        "3. Instructions should be clear, step-by-step\n"
        "4. Reference files in references/ for detailed domain knowledge\n"
        "5. Keep SKILL.md under 500 lines — put details in references/\n"
        "6. Output the complete file content the user can save directly\n"
    ),
    resources=models.Resources(
        references={
            # Full content in agent.py — abbreviated here for readability
            "skill-spec.md": "# Agent Skills Specification (agentskills.io)...",
            "example-skill.md": "# Example: Code Review Skill...",
        }
    ),
)
```

资源将 agentskills.io 规范嵌入为 `skill-spec.md`，并将一个工作的代码审查技能嵌入为 `example-skill.md`。当被要求创建新技能时，Agent 加载 `skill-creator`，通过 `load_skill_resource` 读取两个参考资料，并生成一个符合规范的完整 SKILL.md。该模式灵感来自 [obra/superpowers 的 writing-skills 技能](https://github.com/obra/superpowers/blob/main/skills/writing-skills/SKILL.md)，它教 Claude Code 如何编写新技能。

[Lavi Nigam](https://lavinigam.com/about/) 通过提问进行了测试：“我需要一个用于审查 Python 代码安全漏洞的新技能。你能为此创建一个 SKILL.md 吗？” Agent 加载了 `skill-creator`，读取了规范和示例，并生成了一个完整的 `python-security-review` 技能——包含有效的 kebab-case 命名、涵盖输入验证、身份验证和加密的结构化指令，以及基于严重程度的报告格式。

![Agent generates a python-security-review SKILL.md with frontmatter, instructions, and references](https://lavinigam.com/posts/adk-agent-skills-part3/meta-skill-creator-output.webp)

`skill-creator` 元技能生成了一个完整的 `python-security-review` SKILL.md，具有有效的 frontmatter、分步指令和基于严重程度的报告格式。

技能只是一个 SKILL.md 文件。LLM 可以生成文本。这意味着拥有编写技能之技能的 Agent 变得具有自扩展性——它可以按需创建新的领域专业知识，然后在下一个会话中通过 `load_skill_from_dir` 加载它。生成的技能遵循相同的 agentskills.io 规范，因此它们不仅可以在 ADK 中使用，还可以在任何兼容的 Agent 中使用。

## 构建 ADK 技能带给我的启示

**技能改变 Agent 的决策方式，而不仅仅是它的知识。** 当 Agent 加载技能时，它不仅获得了新信息，还获得了一种处理问题的新方式。技能重塑了 Agent 的推理过程，而不仅仅是参考资料。

对于简单的 SEO 审查，Agent 加载了一个技能。对于写作，并行加载了两个。对于技能创建，它链接了 `load_skill` → `load_skill_resource` → `load_skill_resource` → 生成。L1 列表就像一个菜单——Agent 根据任务组合技能，系统提示词中无需进行编排。

质量的提升比 Token 使用量更显著。通过将博客作者的风格指南作为 L3 资源，在生成时就消除了反模式。Giorgio Crivellari [记录了类似的效果](https://medium.com/google-cloud/i-built-an-agent-skill-for-googles-adk-here-s-why-your-coding-agent-needs-one-too-e5d3a56ef81b)：他的 ADK 治理技能将代码正确率从 29% 提高到 99%。

元技能使其具有自扩展性——Agent 可以根据需求生成 SKILL.md 文件，遵循相同的 agentskills.io 规范，并在任何兼容的 Agent 之间通用。与其预先构建每项能力，不如构建一个元技能，让 Agent 生成其余部分。参阅 [更多关于 ADK 的内容](https://lavinigam.com/tags/adk/) 以获取相关文章。

> 警告
> 
> 运行 [`adk api_server`](https://google.github.io/adk-docs/runtime/api-server/?utm_campaign=adk-agent-skills-part3&utm_medium=blog&utm_source=lavinigam-blog) 时，请使用 `adk api_server .` 而不是 `adk api_server app/`。ADK 会在目标目录中查找子应用——如果 `app/` 包含 `skills/` 子目录，它会将其发现为独立的“技能”应用，而不是将 `app/` 视为你的应用。如果 Agent 没有加载，请使用 `curl localhost:8000/list-apps` 进行检查。

## 扩展 ADK 技能：脚本、多 Agent 与团队库

从这里开始有三个探索方向：

*   **脚本执行** — ADK 源码包含一个 [`RunSkillScriptTool`](https://github.com/google/adk-python/tree/main/src/google/adk/tools/skill_toolset.py?utm_campaign=adk-agent-skills-part3&utm_medium=blog&utm_source=lavinigam-blog)，它可以执行 `scripts/` 目录中的 Python 和 Shell 脚本。文档称“尚不支持”，但实现是功能性的。这使技能可以运行代码，而不仅仅是提供指令。
*   **多 Agent + 技能** — 一个 [`SequentialAgent`](https://google.github.io/adk-docs/agents/workflow-agents/sequential-agents/?utm_campaign=adk-agent-skills-part3&utm_medium=blog&utm_source=lavinigam-blog) 流水线，其中研究员 Agent 加载 `content-research-writer` 技能，并输出给具有 `blog-writer` 技能的作者 Agent。`SkillToolset` 成为整个 Agent 系统中的模块化知识层。
*   **团队技能库** — 通过 Git 仓库共享技能，使用标签进行版本管理，将其加载到任何遵循 agentskills.io 规范的 Agent 中。Google 通过 [官方 ADK 开发技能](https://github.com/google/adk-docs/tree/main/skills?utm_campaign=adk-agent-skills-part3&utm_medium=blog&utm_source=lavinigam-blog) 实现了这一点——这是一个精心策划的库，可以通过 `npx skills add google/adk-docs -y -g` 安装到 Gemini CLI、Claude Code 或 Cursor 中。团队专属库可以像 Giorgio 的治理技能那样提高质量下限。

克隆 [配套仓库](https://github.com/lavinigam-gcp/build-with-adk/tree/main/adk-agent-skills-tutorial?utm_campaign=adk-agent-skills-part3&utm_medium=blog&utm_source=lavinigam-blog)，安装依赖项，设置 API 密钥，并在项目根目录运行 `adk web .` 以查看所有四种模式的运行情况。在 `app/skills/` 下换入你自己的 SKILL.md 文件，或者让 `skill-creator` 为你的领域生成一个。

[📦

配套仓库

克隆仓库并运行所有四种技能模式

→](https://github.com/lavinigam-gcp/build-with-adk/tree/main/adk-agent-skills-tutorial) [📚

ADK 技能文档

在 ADK 中定义和使用技能的官方指南

→](https://google.github.io/adk-docs/skills/) [🌐

Agent 技能规范

被 40 多个 Agent 采用的开放标准

→](https://agentskills.io/specification)

## 系列总结

在[整个 Agent 工程系列](https://lavinigam.com/series/agent-engineering/)中，我们构建了一个具有四种日益强大的技能模式的博客写作 Agent：

1.  **第一部分** — 概念：渐进式披露（L1/L2/L3）、项目设置以及在 Python 中定义的内联技能。
2.  **第二部分** — 生态系统：带有参考文档的基于文件的技能、来自社区仓库的外部技能、`SkillToolset` 内部原理以及多技能加载。
3.  **第三部分** — 元模式：编写新技能的技能、自扩展 Agent 以及模块化知识对质量的影响。

核心思想：技能将单体的系统提示词转变为模块化的知识层。Agent 决定加载什么、何时加载以及如何组合多个技能来完成复杂任务。这种从“所有内容始终存在”到“按需加载”的转变，改变的不只是 Token 效率，还有 Agent 自身的行为。

生态系统验证了这一点：Google 的 [ADK 核心技能](https://google.github.io/adk-docs/tutorials/coding-with-ai/?utm_campaign=adk-agent-skills-part3&utm_medium=blog&utm_source=lavinigam-blog) 使用相同的 SKILL.md 格式来教导编码 Agent 如何构建 ADK 应用——这一规范同时驱动着编写 Agent 的工具和 Agent 本身。

## 常见问题解答

**生成的技能可以在同一个会话中加载吗？** 是的。在元技能将新的 SKILL.md 文件写入磁盘后，你可以将其目录添加到 `SkillToolset` 中，Agent 即可立即使用。在实践中，重新加载带有新技能目录的 Agent 是最整洁的方法。

**如何对生成的技能进行版本控制？** 像对待任何其他代码产物一样对待生成的 SKILL.md 文件——将它们提交到 Git。元技能写入指定的输出目录，由你审查并提交生成的文件。这保留了审计追踪，并允许你随着时间的推移优化生成的技能。

**如何防止 Agent 生成有害或错误的技能？** 元技能的指令定义了输出格式和质量约束。你可以添加护栏（guardrails），例如要求特定章节、强制包含安全免责声明，或限制 Agent 可以生成技能的领域。生成的 SKILL.md 文件也是人类可读的，因此你可以在部署前对其进行审查。

**元技能是否适用于 Gemini 以外的模型？** 元技能模式与模型无关——它生成遵循 agentskills.io 规范的文本文件。任何能够遵循结构化输出指令的 LLM 都可以生成有效的 SKILL.md 文件。ADK 本身支持多种模型后端。

**ADK 核心技能与元技能模式有什么关系？** ADK 核心技能是涵盖 ADK 开发、评估、部署和可观测性的[官方技能](https://github.com/google/adk-docs/tree/main/skills?utm_campaign=adk-agent-skills-part3&utm_medium=blog&utm_source=lavinigam-blog)。本文中的元技能模式是按需生成*新*技能。它们相辅相成：核心技能提供基础 ADK 知识，而元技能创建器则生成团队在 Google 提供的内容之外所需的特定领域技能。

* * *

## 参考资料

1.  [Skills for ADK Agents](https://google.github.io/adk-docs/skills/?utm_campaign=adk-agent-skills-part3&utm_medium=blog&utm_source=lavinigam-blog) — SkillToolset 和渐进式披露的官方 ADK 文档
2.  [Agent Skills Specification](https://agentskills.io/specification?utm_campaign=adk-agent-skills-part3&utm_medium=blog&utm_source=lavinigam-blog) — 定义 SKILL.md 格式的开放标准，已被 40 多个 Agent 采用
3.  [What Are Agent Skills?](https://agentskills.io/what-are-skills?utm_campaign=adk-agent-skills-part3&utm_medium=blog&utm_source=lavinigam-blog) — 技能作为可复用、模型无关能力的概览
4.  [ADK Overview (Vertex AI)](https://docs.cloud.google.com/agent-builder/agent-development-kit/overview?utm_campaign=adk-agent-skills-part3&utm_medium=blog&utm_source=lavinigam-blog) — Google Cloud 关于 Agent 开发套件的文档
5.  [`skills/models.py`](https://github.com/google/adk-python/tree/main/src/google/adk/skills/models.py?utm_campaign=adk-agent-skills-part3&utm_medium=blog&utm_source=lavinigam-blog) — `Skill`, `Frontmatter`, `Resources` 类定义
6.  [`tools/skill_toolset.py`](https://github.com/google/adk-python/tree/main/src/google/adk/tools/skill_toolset.py?utm_campaign=adk-agent-skills-part3&utm_medium=blog&utm_source=lavinigam-blog) — 带有自动生成工具的 `SkillToolset` 实现
7.  [`skills/_utils.py`](https://github.com/google/adk-python/tree/main/src/google/adk/skills/_utils.py?utm_campaign=adk-agent-skills-part3&utm_medium=blog&utm_source=lavinigam-blog) — `load_skill_from_dir`、验证、SKILL.md 解析
8.  [`skills_agent` sample](https://github.com/google/adk-python/tree/main/contributing/samples/skills_agent/?utm_campaign=adk-agent-skills-part3&utm_medium=blog&utm_source=lavinigam-blog) — 带有内联 + 基于文件技能的官方 ADK 示例
9.  [awesome-claude-skills](https://github.com/ComposioHQ/awesome-claude-skills) — 按领域组织的 100 多个生产技能
10. [content-research-writer](https://github.com/ComposioHQ/awesome-claude-skills/blob/master/content-research-writer/SKILL.md) — 本教程中使用的外部技能
11. [writing-skills (obra/superpowers)](https://github.com/obra/superpowers/blob/main/skills/writing-skills/SKILL.md) — 启发模式 4 的元技能编写模式
12. [adk-skill (Giorgio Crivellari)](https://github.com/miticojo/adk-skill) — 开源 ADK 治理技能
13. Giorgio Crivellari — [I Built an Agent Skill for Google’s ADK](https://medium.com/google-cloud/i-built-an-agent-skill-for-googles-adk-here-s-why-your-coding-agent-needs-one-too-e5d3a56ef81b) — 质量提升 245% 的案例研究
14. Ravi Chaganti — [Google ADK Agent Skills](https://ravichaganti.com/blog/google-adk-agent-skills/) — 实践指南
15. Sid Bharath — [The Complete Guide to Google’s ADK](https://sidbharath.com/blog/the-complete-guide-to-googles-agent-development-kit-adk/)
16. Spring AI — [Generic Agent Skills](https://spring.io/blog/2026/01/13/spring-ai-generic-agent-skills/) — 采用该规范的 Java 生态系统
17. [@antigravity — Intro to Agent Skills](https://x.com/antigravity/status/2028153290937061878) — 触发此构建的视频（8.5 万播放量）
18. [@liamottley\_ — “SaaS is being replaced by SKILL.md files”](https://x.com/liamottley_/status/2025863592462233830) — 562 个互动
19. [@Pavan\_Belagatti — MCP vs Skills](https://x.com/Pavan_Belagatti/status/2027396542815199643) — 清晰的 MCP/技能区分
20. [@dAAAb — 15 Open-Source Agent Skills](https://x.com/dAAAb/status/2028666775001608334) — 40 多个支持 agentskills.io 的 Agent
21. [@alexalbert\_\_ — Agent Skills as open standard](https://x.com/alexalbert__/status/2001760879302553906)
22. [ADK Core Skills](https://google.github.io/adk-docs/tutorials/coding-with-ai/?utm_campaign=adk-agent-skills-part3&utm_medium=blog&utm_source=lavinigam-blog) — 用于构建 ADK Agent 的官方技能

[克隆仓库 ↗](https://github.com/lavinigam-gcp/build-with-adk/tree/main/adk-agent-skills-tutorial)
