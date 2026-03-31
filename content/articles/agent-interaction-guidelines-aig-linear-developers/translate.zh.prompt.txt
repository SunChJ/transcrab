你是一个翻译助手。请把下面的 Markdown 内容翻译成简体中文。
[TransCrab Translation Profile]
- mode: auto
- audience: technical
- style: technical
- auto-resolved-mode: refined
- auto-resolved-audience: technical
- auto-resolved-style: technical
- auto-reasons: 公开发布默认使用 refined 流程，优先质量与稳定性；主题信号不明显，回退到 technology
- pipeline: analyze -> translate -> review -> revise
- 执行策略：自动判断（auto）。
- 发布流程固定按 refined 质量标准执行。
- 你需要根据主题（technology/business/life）自动选择最合适的翻译风格与语气。
要求：
- 保留 Markdown 结构（标题/列表/引用/表格/链接）。
- 代码块、命令、URL、文件路径保持原样，不要翻译。
- **必须同时翻译标题**：请先输出一行 Markdown 一级标题（以 "# " 开头），作为译文标题。
- 然后空一行，再输出译文正文（不要再重复标题）。
- 只输出翻译结果本身，不要附加解释、不要加前后缀。
---
Agents are changing how software is planned, built, reviewed, and deployed. Because agents produce work in abundance, roles and workflows get reshaped. The value shifts to orchestrating input, context engineering, and reviewing output.

This shift demands a new contract for human‑computer interaction. The Agent Interaction Guidelines (AIG) are the foundational, evolving principles and practices for designing agent interactions that integrate more naturally into human workflows.

## [Principles & practices⁠](#principles-and-practices)

### [**An agent should always disclose that it's an agent**⁠](#an-agent-should-always-disclose-that-it's-an-agent)

When humans and agents work side by side, humans need instant certainty about who they are interacting with. The agent must signal its identity clearly so that it can never be mistaken for a person.

![A screenshot of a user dropdown menu listing both agentic and human users. Agents are clearly marked as agents with a small badge.](https://webassets.linear.app/images/ornj730p/production/1a4bc3ce7dc27a80d2f83b5ac18638a928fdb2d3-1248x756.png?w=1440&q=95&auto=format&dpr=2)

fig. 01Clear boundary between human and agentic users

### [**An agent should inhabit the platform natively**⁠](#an-agent-should-inhabit-the-platform-natively)

By default, agents should be able to work through existing UI patterns and standard actions of the platform they operate in.

![A screenshot of an issue activity feed in Linear that shows how an agent changes the issue status and links a GitHub issue.](https://webassets.linear.app/images/ornj730p/production/ff59cea32f96906acb15e66fec4154f573e4db0e-1248x756.png?w=1440&q=95&auto=format&dpr=2)

fig. 02The agent is able to use the same actions a human user would

### [**An agent should provide instant feedback**⁠](#an-agent-should-provide-instant-feedback)

Silence leads to uncertainty. When invoked, an agent should provide immediate, but unobtrusive, feedback to reassure the user it has received a request.

![A screenshot of a comment thread in Linear. A human user asks the coding agent to take a look at a bug. The agent instantly replies with a "Thinking" indicator.](https://webassets.linear.app/images/ornj730p/production/0b883b9c94ff358dfae949937d8a85a43e80cc57-1248x756.png?w=1440&q=95&auto=format&dpr=2)

fig. 03The agent instantly indicates that it’s processing the request

### [**An agent should be clear and transparent about its internal state**⁠](#an-agent-should-be-clear-and-transparent-about-its-internal-state)

Agents should clearly indicate whether they’re thinking, waiting for input, executing, or finished working. Humans should be able to understand what’s happening at a glance and, when needed, inspect the underlying reasoning, tool calls, prompts, and decision logic.

![A screenshot of "Agent Session" showing every step of the agent's thought process](https://webassets.linear.app/images/ornj730p/production/b18e90e043a254b145b536530870fbc1bc4c786d-1248x756.png?w=1440&q=95&auto=format&dpr=2)

fig. 04The agent’s reasoning is fully transparent and open to inspection

### [**An agent should respect requests to disengage**⁠](#an-agent-should-respect-requests-to-disengage)

When asked to disengage, an agent should step back, immediately – and only re-engage once it’s received a clear signal to do so.

### [**An agent cannot be held accountable**⁠](#an-agent-cannot-be-held-accountable)

There should be a clear delegation model between humans and agents. An agent can carry out tasks, but the final responsibility should always remain with a human.

![A screenshot of an issue that's been delegated to an agent. The UI makes it clear that there is still a human user who is responsible for the issue.](https://webassets.linear.app/images/ornj730p/production/97805cb8635416aaf12792f1c91f2d98739647f1-1248x756.png?w=1440&q=95&auto=format&dpr=2)

fig. 05Clear delegation flow between human and agent

## [Get involved⁠](#get-involved)

The Agent Interaction Guidelines are written with the community in mind. If you’re building agents and thinking through these same challenges, [join our Slack community](https://linear.app/join-slack) to contribute to the conversation.

This page is a living document and we expect to continually add to it as we learn more in practice.

![A footer image with a Linear logo and an AIG logo](https://webassets.linear.app/images/ornj730p/production/008597cc690fe6cba9f57fd8c2f49fcca52b7989-1344x250.png?w=1440&q=95&auto=format&dpr=2)
