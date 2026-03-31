---
title: Agent Interaction Guidelines（AIG）——Linear Developers
date: '2026-03-31T08:02:24.060Z'
sourceUrl: 'https://linear.app/developers/aig'
lang: zh
---
Agent 正在改变软件被规划、构建、审查与部署的方式。由于 agent 能以极高规模产出工作，角色分工与工作流也随之被重塑。价值的重心，开始转向输入编排、上下文工程，以及对输出结果的审阅。

这种转变要求我们为人机交互建立一份新的契约。Agent Interaction Guidelines（AIG）是一组基础性的、持续演进的原则与实践，用来指导如何设计更自然地融入人类工作流的 agent 交互。

## [原则与实践⁠](#principles-and-practices)

### [**Agent 应始终明确表明自己是 agent**⁠](#an-agent-should-always-disclose-that-it's-an-agent)

当人类与 agent 并肩工作时，人们需要立刻确定自己正在与谁交互。Agent 必须清楚地表明自己的身份，确保自己绝不会被误认为真人。

![A screenshot of a user dropdown menu listing both agentic and human users. Agents are clearly marked as agents with a small badge.](https://webassets.linear.app/images/ornj730p/production/1a4bc3ce7dc27a80d2f83b5ac18638a928fdb2d3-1248x756.png?w=1440&q=95&auto=format&dpr=2)

fig. 01 人类用户与 agent 用户之间的清晰边界

### [**Agent 应原生地栖居于平台之中**⁠](#an-agent-should-inhabit-the-platform-natively)

默认情况下，agent 应能够通过其所在平台既有的 UI 模式与标准操作来完成工作。

![A screenshot of an issue activity feed in Linear that shows how an agent changes the issue status and links a GitHub issue.](https://webassets.linear.app/images/ornj730p/production/ff59cea32f96906acb15e66fec4154f573e4db0e-1248x756.png?w=1440&q=95&auto=format&dpr=2)

fig. 02 Agent 能够使用与人类用户相同的操作

### [**Agent 应提供即时反馈**⁠](#an-agent-should-provide-instant-feedback)

沉默会带来不确定感。当被调用时，agent 应立即给出反馈，但又不应打扰用户，以此让用户确认：它已经收到请求。

![A screenshot of a comment thread in Linear. A human user asks the coding agent to take a look at a bug. The agent instantly replies with a "Thinking" indicator.](https://webassets.linear.app/images/ornj730p/production/0b883b9c94ff358dfae949937d8a85a43e80cc57-1248x756.png?w=1440&q=95&auto=format&dpr=2)

fig. 03 Agent 会立刻表明自己正在处理该请求

### [**Agent 应清晰且透明地展示其内部状态**⁠](#an-agent-should-be-clear-and-transparent-about-its-internal-state)

Agent 应清楚表明自己当前是在思考、等待输入、执行任务，还是已经完成工作。人类应当能够一眼看懂当前发生了什么；在有需要时，也应能够检查其底层推理、工具调用、提示词与决策逻辑。

![A screenshot of "Agent Session" showing every step of the agent's thought process](https://webassets.linear.app/images/ornj730p/production/b18e90e043a254b145b536530870fbc1bc4c786d-1248x756.png?w=1440&q=95&auto=format&dpr=2)

fig. 04 Agent 的推理过程完全透明，并可供检查

### [**Agent 应尊重“退出参与”的请求**⁠](#an-agent-should-respect-requests-to-disengage)

当被要求 disengage 时，agent 应立即退后；只有在再次收到明确信号时，才重新介入。

### [**Agent 不能被追究责任**⁠](#an-agent-cannot-be-held-accountable)

在人类与 agent 之间，应有一套清晰的委派模型。Agent 可以执行任务，但最终责任始终应由人类承担。

![A screenshot of an issue that's been delegated to an agent. The UI makes it clear that there is still a human user who is responsible for the issue.](https://webassets.linear.app/images/ornj730p/production/97805cb8635416aaf12792f1c91f2d98739647f1-1248x756.png?w=1440&q=95&auto=format&dpr=2)

fig. 05 人类与 agent 之间清晰的委派关系

## [参与进来⁠](#get-involved)

Agent Interaction Guidelines 是面向社区编写的。如果你也在构建 agent，并思考这些相同的问题，欢迎 [加入我们的 Slack 社区](https://linear.app/join-slack)，一起参与讨论。

这是一份持续演进的活文档。随着我们在实践中学到更多内容，我们也会不断补充它。

![A footer image with a Linear logo and an AIG logo](https://webassets.linear.app/images/ornj730p/production/008597cc690fe6cba9f57fd8c2f49fcca52b7989-1344x250.png?w=1440&q=95&auto=format&dpr=2)
