---
title: ADK Agent 技能：基于文件的技能与外部技能 —— 构建可重用的专业知识（第 2 部分）
date: '2026-03-18T09:54:48.531Z'
sourceUrl: 'https://lavinigam.com/posts/adk-agent-skills-part2/'
lang: zh
---
> **这是关于使用可重用技能构建 ADK Agent 的三部分系列文章中的第 2 部分**。
> 
> *   [← 第 1 部分：什么是 Agent 技能？](https://lavinigam.com/posts/adk-agent-skills-part1/)
> *   [第 3 部分：编写技能的技能 —— 自扩展 ADK Agent →](https://lavinigam.com/posts/adk-agent-skills-part3/)
> *   [每个 ADK 开发者都应该知道的 5 种 SKILL.md 设计模式 →](https://lavinigam.com/posts/adk-skill-design-patterns/)
> *   [ADK 核心技能](https://google.github.io/adk-docs/tutorials/coding-with-ai/?utm_campaign=adk-agent-skills-part2&utm_medium=blog&utm_source=lavinigam-blog) —— 构建 ADK Agent 的官方技能

在第 1 部分中，我们介绍了渐进式披露（Progressive Disclosure）—— 保持 Agent 上下文精简的 L1/L2/L3 模式 —— 并用 Python 构建了一个内联 SEO 检查表技能。内联技能编写速度快，但知识仅存在于代码中。本篇文章将超越 Python 字符串，深入探讨存储在磁盘上、来自社区仓库并连接到工作 Agent 中的 ADK 技能。

读完本文，你将了解如何：

*   从包含 `SKILL.md` 和参考文档的目录中加载**基于文件的技能**
*   集成来自社区仓库（如 [awesome-claude-skills](https://github.com/ComposioHQ/awesome-claude-skills)）的**外部技能**
*   将所有技能连接到单个 `SkillToolset` 中，并理解其**三个自动生成的工具**
*   在 ADK Web 中查看**多技能加载**的实际运行效果

[克隆仓库 ↗](https://github.com/lavinigam-gcp/build-with-adk/tree/main/adk-agent-skills-tutorial)

> 提示
> 
> *   **基于文件的技能**将知识存储为带有 YAML frontmatter 的 `SKILL.md` 文件，使技能可重用且可进行版本控制
> *   **外部技能**从社区仓库（如 awesome-claude-skills）加载，让你能够导入预构建的专业知识
> *   `SkillToolset` 会从任何技能集合中自动生成三个工具：`list_skills`、`get_skill_details` 和 `load_skill_resource`
> *   ADK 在导入时验证技能名称 —— 重名会立即抛出 `ValueError`，而不是在运行时抛出

ADK 中的**基于文件的技能**是存储为一个目录的技能，该目录包含一个带有 YAML frontmatter（`name` 和 `description`）和 Markdown 指令的 `SKILL.md` 文件，以及用于 L3 资源的后续可选子目录 `references/`、`assets/` 和 `scripts/`。

SEO 检查表作为内联技能表现良好，因为它是自包含的 —— 九条规则，无需外部文件。博客撰写技能需要更多：包含语气规则、格式约定和反模式的风格指南。该参考文档不适合作为 Python 字符串内联。这就是[基于文件的技能](https://google.github.io/adk-docs/skills/#define-skills-with-files?utm_campaign=adk-agent-skills-part2&utm_medium=blog&utm_source=lavinigam-blog)发挥作用的地方。

基于文件的技能位于其专属目录中，包含一个 `SKILL.md` 文件以及可选的参考、资产和脚本子目录。`SKILL.md` 以 YAML frontmatter 开头，后面跟着 Markdown 指令。

```markdown
# skills/blog-writer/SKILL.md
---
name: blog-writer
description: Blog post writing skill with structure templates and style guidelines.
  Guides the agent through writing well-structured, engaging technical blog posts
  with proper formatting, section flow, and reader engagement techniques.
---

# Blog Writer Instructions

When asked to write a blog post, follow these steps:

## Step 1: Structure
Use `load_skill_resource` to read `references/style-guide.md` for the writing style rules.

## Step 2: Outline First
Before writing, create a brief outline with:
- **Hook**: Opening that grabs attention
- **Context**: Why this topic matters now
- **Core sections**: 3-5 sections that build on each other
- **Takeaway**: What the reader walks away knowing
...
```

这种设计将知识分为两层。`SKILL.md` 指令（L2）告诉 Agent *遵循哪些步骤*。`references/style-guide.md` 文件（L3）提供每个步骤的*详细知识* —— 语气指南、格式约定、要避免的反模式。Agent 仅在指令要求时才通过 `load_skill_resource` 加载参考资料。

> 重要提示
> 
> 目录名称**必须**与 `SKILL.md` frontmatter 中的 `name` 字段匹配。`blog-writer/` 要求 `name: blog-writer`。不匹配会导致 `load_skill_from_dir` 抛出验证错误 —— 不允许部分匹配，也没有回退方案。

在 Python 中加载基于文件的技能只需要一行代码。

```python
# agent.py — 模式 2：基于文件的技能
blog_writer_skill = load_skill_from_dir(
    pathlib.Path(__file__).parent / "skills" / "blog-writer"
)
```

当 Agent 使用此技能撰写博客引言时，我可以看到它首先加载技能指令（L2），然后通过 `load_skill_resource` 获取风格指南（L3）。风格指南的影响在输出中清晰可见 —— 段落简短，没有“在当今快速发展的……”之类的开场白，标题以动词开头。

![Agent 通过 load_skill_resource 加载 style-guide.md，将写作规则应用于博客输出](https://lavinigam.com/posts/adk-agent-skills-part2/l3-resource-loading.webp)

L3 实际运行：Agent 按需调用 load\_skill\_resource(“blog-writer”, “references/style-guide.md”) 以获取详细的写作规则。

基于文件的技能使知识可重用 —— 任何遵循 agentskills.io 规范的 Agent 都可以加载相同的 `blog-writer/` 目录。但你仍然是自己编写的 `SKILL.md`。如果别人已经写好了你需要的技能呢？

**外部技能**是从项目外部来源加载的基于文件的技能 —— 通常是像 awesome-claude-skills 这样的社区仓库 —— 它提供预构建的领域专业知识，你的 Agent 可以直接使用，而无需你亲自编写指令。

外部技能的工作方式与基于文件的技能完全相同 —— 唯一的区别是目录的来源。你无需编写自己的 `SKILL.md`，而是从社区仓库下载一个，并使用相同的 `load_skill_from_dir` 调用进行加载。

外部技能不限于社区仓库。Google 发布了[官方 ADK 开发技能](https://github.com/google/adk-docs/tree/main/skills?utm_campaign=adk-agent-skills-part2&utm_medium=blog&utm_source=lavinigam-blog) —— 涵盖开发指南、速查表、评估、部署、可观测性和脚手架 —— 可以使用 `npx skills add google/adk-docs -y -g` 安装。这些是遵循相同 agentskills.io 规范的第一方外部技能，可以像下面的社区 `content-research-writer` 技能一样通过 `load_skill_from_dir` 加载。

该 Agent 中的 [`content-research-writer`](https://github.com/ComposioHQ/awesome-claude-skills/blob/master/content-research-writer/SKILL.md) 技能改编自 [Composio 的 awesome-claude-skills](https://github.com/ComposioHQ/awesome-claude-skills) 仓库，该仓库拥有 100 多个针对各种领域的生产级技能。加载外部技能的工作流程如下：

1.  在社区仓库中**寻找**符合你用例的技能
2.  将技能目录**克隆或下载**到你项目的 `skills/` 文件夹中
3.  **验证** `SKILL.md` 的 frontmatter 是否有效（如果你有[验证工具](https://agentskills.io/specification?utm_campaign=adk-agent-skills-part2&utm_medium=blog&utm_source=lavinigam-blog)，运行 `skills-ref validate ./my-skill`）
4.  **审查**指令和参考文件 —— 然后加载它

> 警告
> 
> 技能的指令将成为你的 Agent 的行为。在加载外部技能之前，请务必阅读 `SKILL.md` 和任何参考文件。将其视为依赖项审查 —— 你正在给 LLM 提供新的指令。

```python
# agent.py — 模式 3：外部技能
content_researcher_skill = load_skill_from_dir(
    pathlib.Path(__file__).parent / "skills" / "content-research-writer"
)
```

代码与模式 2 完全相同。这就是重点 —— [agentskills.io 规范](https://agentskills.io/specification?utm_campaign=adk-agent-skills-part2&utm_medium=blog&utm_source=lavinigam-blog)定义了通用的目录格式，因此 `load_skill_from_dir` 不关心 `SKILL.md` 是你写的还是下载的。

`content-research-writer` 技能包含一个五阶段的研究方法论，并在 `references/seo-guidelines.md` 中提供了详细的 SEO 指南。只需一行代码，所有这些知识就变得对 Agent 可用，无需重写。

基于文件的技能和外部技能涵盖了大多数用例 —— 你要么自己编写技能，要么找到一个已有的技能。但如果你需要的技能在任何仓库中都不存在呢？第 3 部分将通过一个按需生成新技能的元技能来回答这个问题。

### 模式摘要

| 模式 | 来源 | 可重用性 | 最适用场景 |
| --- | --- | --- | --- |
| **内联 (Inline)** | Python 代码 | 单个 Agent | 简单的检查表、稳定的规则 |
| **基于文件 (File-based)** | 本地目录 | 任何兼容规范的 Agent | 带有参考文档的复杂技能 |
| **外部 (External)** | 社区仓库 | 跨 Agent 可移植 | 别人已经写好的技能 |
| **元技能 (Meta)** | 内联 + 资源 | 自扩展 | 按需生成新技能 |
| **官方 (Official)** | 第一方仓库 | 跨 Agent 可移植 | Google 发布的技能 (ADK Core Skills) |

## 使用 SkillToolset 连接 ADK 技能

**SkillToolset** 是 ADK 内置的 `BaseToolset` 子类，它将任何 Agent 技能集合转换为三个自动生成的工具 —— `list_skills`（返回所有技能的 L1 元数据）、`get_skill_details`（加载特定技能的 L2 指令）和 `load_skill_resource`（获取 L3 参考文件）。

定义好所有四个技能（第 1 部分的内联 SEO 检查表、基于文件的博客撰写器、外部内容研究员，以及将在第 3 部分介绍的元技能 `skill-creator`）后，最后一步是将它们包装进 [`SkillToolset`](https://github.com/google/adk-python/tree/main/src/google/adk/tools/skill_toolset.py?utm_campaign=adk-agent-skills-part2&utm_medium=blog&utm_source=lavinigam-blog) 并交给 Agent。

```python
# agent.py — 组装并连接
skill_toolset = SkillToolset(
    skills=[seo_skill, blog_writer_skill, content_researcher_skill, skill_creator]
)

root_agent = Agent(
    model="gemini-2.5-flash",
    name="blog_skills_agent",
    description="A blog-writing agent powered by reusable skills.",
    instruction=(
        "You are a blog-writing assistant with specialized skills.\n\n"
        "You have four skills available:\n"
        "- **seo-checklist**: SEO optimization rules\n"
        "- **blog-writer**: Writing structure and style guide\n"
        "- **content-research-writer**: Research methodology\n"
        "- **skill-creator**: Generate new skill definitions\n\n"
        "When the user asks you to write, research, or optimize:\n"
        "1. Load the relevant skill(s) to get detailed instructions\n"
        "2. Use load_skill_resource to access reference materials\n"
        "3. Follow the skill's step-by-step instructions\n\n"
        "Always explain which skill you're using and why."
    ),
    tools=[skill_toolset],
)
```

Agent 的 `instruction` 明确列出了这四个技能。这与 `SkillToolset` 自动注入的列表有所重叠，但目的不同 —— `instruction` 提供了关于 Agent 身份的稳定提示，而动态的 `list_skills` 注入为 LLM 的每次请求提供了结构化的元数据。

### 底层原理：三个自动生成的工具

`SkillToolset` 不是一个普通的工具 —— 它是一个 [`BaseToolset`](https://github.com/google/adk-python/tree/main/src/google/adk/tools/skill_toolset.py?utm_campaign=adk-agent-skills-part2&utm_medium=blog&utm_source=lavinigam-blog)，这意味着它的 `get_tools()` 方法在 LLM 的每一步都会被调用。它会自动注册三个直接对应于渐进式披露的工具：

*   **`list_skills`** (L1) —— 返回所有技能名称和描述的 XML 列表。通过 `process_llm_request()` 自动注入到系统上下文中 —— Agent 从不显式调用它。始终存在，始终轻量。
    
*   **`load_skill`** (L2) —— 接收技能名称并返回其完整的指令和 frontmatter。当 Agent 决定某个技能与当前查询相关时，就会调用此工具。
    
*   **`load_skill_resource`** (L3) —— 接收技能名称和文件路径，返回 `references/`、`assets/` 或 `scripts/` 目录下的文件内容。详细知识仅按需加载。
    

![SkillToolset 流程，显示 list_skills 注入、load_skill 和 load_skill_resource 工具序列](https://lavinigam.com/posts/adk-agent-skills-part2/skilltoolset-flow.webp)

SkillToolset 的三个自动生成工具：list\_skills (L1, 自动注入)、load\_skill (L2, 按需) 和 load\_skill\_resource (L3, 按需)。

![Agent 图，显示 blog_skills_agent 及其三个自动注册的 SkillToolset 工具和函数调用详情](https://lavinigam.com/posts/adk-agent-skills-part2/skilltoolset-agent-graph.webp)

ADK Web 的 Agent 图视图，显示连接到三个 SkillToolset 工具的 blog\_skills\_agent，函数调用参数和 token 计数清晰可见。

> 注意
> 
> `SkillToolset` 在构造时验证技能名称，如果任何两个技能重名，则抛出 `ValueError`。这发生在导入时，而不是运行时 —— 因此你会立即发现重复。

## 运行：渐进式披露实际效果

通过 [ADK Web](https://google.github.io/adk-docs/runtime/web-interface/?utm_campaign=adk-agent-skills-part2&utm_medium=blog&utm_source=lavinigam-blog) 运行 Agent 可以直观地看到渐进式披露模式。

> 警告
> 
> 请使用 `adk web .` 而不是 `adk web app/` —— 直接指向 `app/` 会使 ADK 将 `skills/` 发现为独立的应用程序，而不是将 `app/` 视为你的应用程序。

当我提出“帮我写一段博客引言，并使其符合 SEO 标准”时，Agent 在没有被告知加载两者的情况下，并行加载了 `blog-writer` 和 `seo-checklist` 技能。L1 元数据列表为它提供了足够的上下文来判断这两个技能都相关。接着它调用 `load_skill_resource` 读取风格指南，并生成了一段遵循两个技能指令的引言。

![Agent 并行加载 blog-writer 和 seo-checklist 技能，并使用 load_skill_resource 获取风格指南](https://lavinigam.com/posts/adk-agent-skills-part2/multi-skill-parallel-loading.webp)

多技能加载：Agent 在同一轮对话中自主加载了 blog-writer 和 seo-checklist，然后通过 load\_skill\_resource 获取风格指南。

ADK Web UI 通过工具调用徽章使流程可见。每个徽章显示工具名称及其状态（待处理 → 完成）。在这次交互中，触发了四个事件：在同一轮中执行 `load_skill("blog-writer")` 和 `load_skill("seo-checklist")`，随后执行 `load_skill_resource("references/style-guide.md")`，最后是 Agent 的书面回复。

Agent 在否定情况下的推理也很有趣。当我问“你能用你的视频编辑技能创建一个缩略图吗？”时，Agent 检查了 L1 列表，并正确回复它没有视频编辑技能。它列出了所有四个可用的技能。没有产生幻觉，也没有试图伪造它并不具备的能力。

我们已经涵盖了现有的技能 —— 你自己编写的技能（内联、基于文件）或在社区仓库中找到的技能（外部）。我们已将它们连接到 `SkillToolset` 中，并看到了多技能加载的效果。本教程是 [Lavi Nigam](https://lavinigam.com/about/) 撰写的[完整 Agent 工程系列](https://lavinigam.com/series/agent-engineering/)的一部分 —— 查看[更多关于 ADK 的内容](https://lavinigam.com/tags/adk/)以获取相关文章。

在**第 3 部分**中，Agent 将编写自己的技能。我们将构建一个元技能 `skill-creator`，它可以按需生成新的 `SKILL.md` 文件，思考技能如何改变 Agent 行为，并探索该模式的未来发展。

[继续阅读第 3 部分：编写技能的技能 —— 自扩展 ADK Agent →](https://lavinigam.com/posts/adk-agent-skills-part3/)

* * *

## 常见问题解答

**我可以在同一个 SkillToolset 中混合使用基于文件的技能和内联技能吗？** 可以。`SkillToolset` 接受任何技能源列表。你可以在单个 `skills=[]` 参数中组合内联 Python 字典、基于文件的技能目录和外部技能路径。加载后，工具集会对它们一视同仁。

**如果 SKILL.md 文件包含无效的 YAML frontmatter 会怎样？** ADK 的技能加载器会在导入时（即 Agent 启动前）抛出解析错误。Frontmatter 必须包含有效的 YAML，且至少包含 `name` 和 `description` 字段。缺失或格式错误的 frontmatter 会导致技能加载失败。

**SkillToolset 自动生成的三个工具是什么？** `list_skills` 返回所有注册技能的 L1 元数据（名称和描述）。`get_skill_details` 根据名称加载特定技能的完整 L2 指令。`load_skill_resource` 从技能的 `references/` 目录中获取 L3 参考文件。Agent 根据用户的查询自主调用这些工具。

**SKILL.md 文件或 L3 资源是否有大小限制？** Agent 技能规范没有施加强制性的大小限制，但实际应用中存在限制。L2 指令应能与对话一起放入模型的上下文窗口内。L3 资源是单独加载的，因此每个文件应是自包含的且大小合理（几千个 token）。

**SkillToolset 如何处理重复的技能名称？** 如果任何两个技能共享相同的 `name` 字段，它会在导入时抛出 `ValueError`。这发生在 Agent 启动之前，因此你会立即得到清晰的错误提示，而不是令人困惑的运行时行为。

**我可以使用 SkillToolset 加载 ADK 核心技能吗？** 可以。Google 将[官方 ADK 开发技能](https://github.com/google/adk-docs/tree/main/skills?utm_campaign=adk-agent-skills-part2&utm_medium=blog&utm_source=lavinigam-blog)作为标准的 `SKILL.md` 目录发布。由于它们遵循 agentskills.io 规范，你可以像加载任何基于文件或外部技能一样，使用 `load_skill_from_dir` 加载它们。使用 `npx skills add google/adk-docs -y -g` 进行安装，然后将 `load_skill_from_dir` 指向安装目录即可。

* * *

## 参考资料

1.  [ADK Agent 技能](https://google.github.io/adk-docs/skills/?utm_campaign=adk-agent-skills-part2&utm_medium=blog&utm_source=lavinigam-blog) —— SkillToolset 和渐进式披露的官方 ADK 文档
2.  [Agent 技能规范](https://agentskills.io/specification?utm_campaign=adk-agent-skills-part2&utm_medium=blog&utm_source=lavinigam-blog) —— 定义 `SKILL.md` 格式的开放标准，已被 40 多个 Agent 采用
3.  [ADK 概览 (Vertex AI)](https://docs.cloud.google.com/agent-builder/agent-development-kit/overview?utm_campaign=adk-agent-skills-part2&utm_medium=blog&utm_source=lavinigam-blog) —— Agent 开发套件的 Google Cloud 文档
4.  [`tools/skill_toolset.py`](https://github.com/google/adk-python/tree/main/src/google/adk/tools/skill_toolset.py?utm_campaign=adk-agent-skills-part2&utm_medium=blog&utm_source=lavinigam-blog) —— 带有自动生成工具的 `SkillToolset` 实现
5.  [`skills/_utils.py`](https://github.com/google/adk-python/tree/main/src/google/adk/skills/_utils.py?utm_campaign=adk-agent-skills-part2&utm_medium=blog&utm_source=lavinigam-blog) —— `load_skill_from_dir`、验证、`SKILL.md` 解析
6.  [`skills_agent` 示例](https://github.com/google/adk-python/tree/main/contributing/samples/skills_agent/?utm_campaign=adk-agent-skills-part2&utm_medium=blog&utm_source=lavinigam-blog) —— 包含内联 + 基于文件技能的官方 ADK 示例
7.  [awesome-claude-skills](https://github.com/ComposioHQ/awesome-claude-skills) —— 按领域组织的 100 多个生产级技能
8.  [content-research-writer](https://github.com/ComposioHQ/awesome-claude-skills/blob/master/content-research-writer/SKILL.md) —— 本教程中使用的外部技能
9.  [ADK 核心技能](https://github.com/google/adk-docs/tree/main/skills?utm_campaign=adk-agent-skills-part2&utm_medium=blog&utm_source=lavinigam-blog) —— 构建 ADK Agent 的官方技能

* * *

[📦

配套代码仓库

克隆仓库，并使用 adk web 运行基于文件和外部技能模式。

→](https://github.com/lavinigam-gcp/build-with-adk/tree/main/adk-agent-skills-tutorial) [📚

ADK 技能文档

SkillToolset、渐进式披露和技能加载的官方指南

→](https://google.github.io/adk-docs/skills/) [🌐

Agent 技能规范

已被 30 多个 Agent 采用的 SKILL.md 格式开放标准

→](https://agentskills.io/specification)

[克隆仓库 ↗](https://github.com/lavinigam-gcp/build-with-adk/tree/main/adk-agent-skills-tutorial)
