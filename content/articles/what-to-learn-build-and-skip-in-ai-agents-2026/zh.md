---
title: AI Agent 领域该学什么、构建什么、跳过什么（2026）
date: '2026-05-08T02:04:56.383Z'
sourceUrl: >-
  https://x.com/rohit4verse/status/2049548305408131349?s=46&t=oDjsBy-f-VCdrYC6Q655dA
lang: zh
---
每天都有一个新框架、一个新 benchmark、一个新的“10x”发布。问题不再是“我该怎么跟上”。问题变成了：这里面到底哪些是真信号，哪些只是披着紧迫感外衣的噪音。

每一份路线图发布一个月后就会过时。你上个季度刚掌握的框架，现在已经成了 legacy。你优化过的 benchmark 被刷穿，然后被替换掉。我们曾经被训练去走一条传统路径：一套按主题和等级排列的技术栈，一连串工作和任期，缓慢爬升。AI 改写了这张画布。现在，只要有合适的 prompts 和足够好的品味，任何人都能交付过去一个有两年经验的工程师需要一个 sprint 才能完成的东西。

专业能力仍然重要。没有什么能替代亲眼见过系统崩掉、凌晨两点 debug 内存泄漏、坚持用无聊方案而不是聪明方案并被证明正确的经历。那种品味会复利。停止以过去那种方式复利的是：熟悉本周这个框架的 API 表面。六个月后它就会变。两年后赢的人，是那些早早选中持久 primitives，并让其他东西从身边流过去的人。

我在这个领域构建了两年，拿到过多个超过 25 万美元的 offer，现在在一家隐身公司负责技术。如果有人问我“现在到底应该关注什么”，我会把这篇发给他。

这不是路线图。Agent 领域还没有目的地。大实验室都在公开迭代，把 regression 发给数百万用户，写复盘，线上修补。如果 Claude Code 背后的团队都能发出 47% 的性能 regression，而且要等用户社区发现后才抓到，那么所谓底下存在一张稳定地图的想法就是虚构。所有人都还在摸索。创业公司正在繁荣，因为巨头也不知道答案。不会写代码的人在和 agent 结对，在周五发布那些 ML 博士周二还说不可能的东西。

这个时刻有趣的地方，是它改变了“资历”这个问题。传统路径会把你优化成资历：学位、初级职位、高级职位、staff，慢慢累积职级。当你脚下的领域不动时，这很合理。现在这个领域在所有人脚下同样移动。一个 22 岁、公开发布 agent demo 的人，和一个 35 岁的资深工程师之间的差异，不再是十年积累下来的 stack mastery。22 岁的人拥有和资深工程师一样的空白画布，而对他们两者真正复利的，是愿意 ship，以及那一小组不会在一个季度内过时的 primitives。

这是整篇文章的重新框定。下面是一种判断哪些 primitives 值得你投入注意力、哪些发布可以让它们过去的方法。适合的拿走，不适合的留下。

## 真正有效的过滤器

你不可能跟上每周的发布。你也不该尝试。你需要的是过滤器，不是信息流。

过去 18 个月里，有五个测试经受住了考验。在让任何新发布碰你的 stack 之前，先用它们过一遍。

两年后这还重要吗？如果它只是 frontier model 外面的一层 wrapper、一个 CLI flag，或者“Devin but for X”，答案几乎总是否定的。如果它是一个 primitive（协议、记忆模式、沙箱方法），答案更常是肯定的。wrapper 的半衰期很短。primitive 的半衰期以年计。

有没有你尊重的人在它之上构建了真实东西，并诚实写过？营销文章不算。复盘算。一篇叫“我们在生产里试了 X，下面是坏掉的地方”的博客，抵得过十篇发布公告。这个领域里真正好的信号，总是由那些为它丢掉过一个周末的人写出来的。

采用它是否要求你丢掉已有的 tracing、retry、config、auth？如果是，那它就是一个试图成为平台的框架。试图成为平台的框架死亡率有 90%。好的 primitives 会嵌入你的现有系统，而不是强迫你迁移。

跳过它六个月的代价是什么？对大多数发布来说，答案是什么都没有。六个月后你会知道更多。赢家版本会更清楚。这一条测试能让你毫无焦虑地跳过 90% 的发布，也是大多数人拒绝做的测试，因为跳过感觉像落后。但并不是。

你能衡量它是否真的帮到了你的 agents 吗？如果不能，你就是在猜。没有 evals 的团队靠感觉运行，然后发出 regression。有 evals 的团队可以让数据告诉他们，这周 GPT-5.5 还是 Opus 4.7 在他们的特定 workload 上更强。

如果你只从这篇文章里采纳一个习惯，就采纳这个：当一个新东西发布时，写下六个月后你需要看到什么，才会相信它重要。然后回来检查。大多数时候，问题会自己给出答案，而你的注意力会花在能复利的东西上。

这些测试背后的技能，比任何一条都更难命名。它是愿意对自己不选择的东西显得不酷。本周在 Hacker News 上爆火的框架，会有一支持续十四天的啦啦队，他们听起来都会很聪明。六个月后，一半框架无人维护，啦啦队也已经转向。没有参与的人，把注意力省给了那些在发布热度过去后仍然能经受“变无聊”考验的东西。那种姿态——按兵不动、观察、说“六个月后我会知道”——才是这个领域真正的职业技能。所有人都会读发布。几乎没人擅长不反应。

## 该学什么

概念。模式。事物的形状。这些想法会带来复利回报。它们能穿过模型更换、框架更换、范式转移。真正理解它们，你就能在一个周末学会任何新工具。跳过它们，你就会永远重复学习表层机制。

### Context engineering

过去两年最重要的一次改名，是“prompt engineering”变成“context engineering”。这个变化是真实的，不是表面修辞。

模型不再只是一个让你写巧妙指令的东西。它是一个你在每一步都要为它组装可工作 context 的东西。这个 context 同时包括 system instructions、tool schemas、检索到的文档、此前工具输出、scratchpad state，以及压缩过的历史。agent 的行为，是你放进窗口里的东西涌现出来的结果。

把这一点内化：context 就是 state。每一个无关噪音 token 都会消耗推理质量。context rot 是真实的生产故障。一个十步任务走到第八步时，最初目标可能已经被工具输出埋住。能交付可靠 agents 的团队，会主动总结、压缩、修剪。他们给工具描述做版本管理。他们缓存静态部分，拒绝缓存会变化的部分。他们像有经验的工程师看待 RAM 一样看待 context window。

一个具体感受它的方法：拿任何一个生产中的 agent，打开完整 trace logging。看第一步的 context。再看第七步的 context。数一数其中还有多少 token 仍然在发挥价值。第一次做这件事，你会尴尬。然后你会去修它，而同一个 agent 会在不更换模型、不改 prompt 的情况下明显更可靠。

如果只读一篇相关内容，就读 Anthropic 的《Effective Context Engineering for AI Agents》。然后读他们的 multi-agent research postmortem，里面用数字说明了当规模上来后，context isolation 有多重要。

### Tool design

工具是 agents 接触你业务的地方。模型根据名称和描述选择工具。模型根据错误信息重试。模型成败取决于工具 contract 是否匹配 LLM 擅长表达的东西。

5 到 10 个命名良好的工具，胜过 20 个平庸工具。工具名应该像英文动词短语。描述应该包括什么时候使用、什么时候不要使用。错误信息应该是模型能采取行动的反馈。“Max tokens 500 exceeded, try summarizing first” 比 “Error: 400 Bad Request” 好太多。公开研究里有一个团队报告，仅重写错误信息就让 retry loops 减少了 40%。

Anthropic 的《Writing tools for agents》是正确起点。之后，给你自己的工具加 instrumentation，查看真实调用模式。agent 可靠性的最大收益几乎总在 tool-side。人们一直调 prompt，却忽略真正杠杆所在的地方。

### Orchestrator-subagent 模式

2024 和 2025 年的 multi-agent 争论，最终汇成了如今大家都在 ship 的一个综合方案。天真的 multi-agent 系统——多个 agents 并行写共享 state——会灾难性失败，因为错误会复合。single-agent loops 能扩展得比你想象更远。生产里有一种 multi-agent 形状有效：一个 orchestrator agent，把范围狭窄、只读的任务委托给隔离的 subagents，然后综合它们的结果。

这就是 Anthropic research system 的工作方式。也是 Claude Code subagents 的工作方式。也是 Spring AI 和大多数生产框架现在标准化的模式。Subagents 拿到小而聚焦的 contexts。它们不能 mutate shared state。写入由 orchestrator 负责。

Cognition 的《Don’t Build Multi-Agents》和 Anthropic 的《How we built our multi-agent research system》看起来相反，其实只是用不同词汇在说同一件事。两篇都读。

默认使用 single-agent。只有当 single agent 遇到真实墙壁时，才使用 orchestrator-subagent：context window 压力、顺序工具调用带来的延迟，或者任务异质性确实受益于聚焦 contexts。在真正感到痛之前就构建它，只会 ship 你不需要的复杂性。

### Evals 和 golden datasets

每个能交付可靠 agents 的团队都有 evals。没有 evals 的团队，就没有可靠 agents。这是这个领域单项杠杆最高的习惯，也是我在每家公司都看到投入最不足的事情。

有效做法是：收集生产 traces，标注失败，把它作为 regression set。每当出现新失败，就加入进去。主观部分用 LLM-as-judge，其余部分用 exact-match 或程序化检查。在任何 prompt、model 或 tool 变更前运行这套 suite。Spotify 工程博客报告，他们的 judge layer 会在 agent 输出上线前否决约 25%。没有它，四个坏结果里就有一个会到达用户。

让这件事真正成立的心智模型是：eval 是一个 unit test，用来在底下一切都变化时保持 agent 诚实。模型有新版本。框架发 breaking change。供应商废弃 endpoint。你的 evals 是唯一能告诉你 agent 是否仍在做自己工作的东西。没有它们，你写的是一个正确性依赖移动靶善意的系统。

那些 eval frameworks（Braintrust、Langfuse evals、LangSmith）都可以。它们都不是瓶颈。瓶颈是你一开始有没有一个 labeled set。第一天就构建它，在扩展任何东西之前。最初 50 个例子一个下午就能手工标完。没有借口。

### File-system-as-state 和 think-act-observe loop

对于任何做真实多步骤工作的 agent，持久架构是：think、act、observe、repeat。文件系统或结构化存储作为 source of truth。每个 action 都有日志、可 replay。Claude Code、Cursor、Devin、Aider、OpenHands、goose。它们都收敛到这里是有原因的。

模型是无状态的。harness 必须是有状态的。文件系统是每个开发者已经理解的有状态 primitive。一旦接受这个 framing，整个 harness discipline（checkpointing、resumability、sub-agent verification、sandboxed execution）都会从认真对待这个模式中自然长出来。

它更深层教你的东西是：在任何值得花 compute bill 的生产 agent 里，harness 做的工作都比模型更多。模型选择下一步行动。harness 验证它，在 sandbox 里运行它，捕获输出，决定回喂什么，决定何时停止，决定何时 checkpoint，决定何时 spawn subagent。把模型换成另一个质量相近的模型，好的 harness 仍然能 ship。把 harness 换成差的，即使世界上最好的模型也会产出一个随机忘记自己在做什么的 agent。

如果你构建的东西比 single-shot tool call 更复杂，harness 才是你该花时间的地方。模型只是其中一个组件。

### MCP，作为概念

不要只学习如何调用 MCP servers。要学习它的模型：agent capabilities、tools 和 resources 之间的清晰分离，底下有可扩展的 auth 和 transport story。一旦理解它，你看到的每个其他“agent integration framework”都会像 MCP 的劣化版本，你也会省下逐个评估它们的时间。

Linux Foundation 现在托管它。所有主要模型提供商都支持它。“AI 的 USB-C”这个类比现在更准确，不再只是反讽。

### Sandboxing 作为 primitive

每个生产 coding agent 都运行在 sandbox 里。每个 browser agent 都遭遇过 indirect prompt injection。每个 multi-tenant agent 都在某个时候 ship 过权限范围 bug。把 sandboxing 当作 primitive infrastructure，而不是客户提出后才添加的 feature。

学习基础知识：process isolation、network egress controls、secret scoping、agent 与 tool 之间的 auth boundaries。那些在客户安全审查后才补上的团队，会丢掉 deal。那些从第一周就内建的团队，能平静通过企业采购。

## 该用什么构建

具体选择，2026 年 4 月。这些会变化，但变化会慢。这里要选得无聊一点。

### Orchestration

LangGraph 是生产默认选项。大约三分之一运行 agents 的大公司在用它。它的 abstractions 匹配 agent 系统的真实形状：typed state、conditional edges、durable workflows、human-in-the-loop checkpoints。缺点是啰嗦。优点是，这种啰嗦匹配 agent 进入生产后你真正需要控制的东西。

如果你生活在 TypeScript 里，Mastra 是事实选择。它在那个生态里有最干净的心智模型。

如果你的团队喜欢 Pydantic，并且希望 type safety 成为 first-class citizen，Pydantic AI 是合理的 greenfield 选择。它在 2025 年末达到 v1.0，势头真实。

对于 provider-native 工作（computer use、voice、real-time），在你的 LangGraph nodes 里使用 Claude Agent SDK 或 OpenAI Agents SDK。不要试图让它们成为 heterogeneous system 的顶层 orchestrator。它们是为自己的 lane 优化的。

### Protocol layer

MCP，就这么简单。把你的 tool integrations 构建成 MCP servers。也用同样方式消费外部 integrations。registry 已经越过一个临界点：你几乎总能在需要自己构建前先找到一个 server。2026 年还写 custom tool plumbing，是白交税。

### Memory

按 autonomy level 选择，而不是按 hype 选择。

Mem0 用于 chat-style personalization：用户偏好、轻量历史。Zep 用于生产 conversational systems，当 state 会演化、你需要 entity tracking。Letta 用于 agent 需要跨天或跨周保持 coherence 的场景。大多数团队不需要这个。真正需要的团队，需要的正是这个。

错误是，在你有 memory problem 之前就去拿 memory framework。先用 context window 能容纳的东西加一个 vector store。只有当你能清楚说出它解决的 failure mode 时，再添加 memory system。

### Observability 和 evals

Langfuse 是 OSS 默认选项。可 self-host，MIT 许可，覆盖 tracing、prompt versioning 和基本的 LLM-as-judge evals。如果你已经是 LangChain shop，LangSmith 集成更紧。Braintrust 适合 research-style eval workflows，能做严谨比较。如果你在 polyglot stack 里需要 vendor-neutral OpenTelemetry instrumentation，答案是 OpenLLMetry / Traceloop。

tracing 和 evals 两者都要。tracing 回答“agent 到底做了什么？”evals 回答“agent 比昨天更好了还是更差了？”没有两者就不要 ship。盲飞的成本，是第一天正确接好这些东西成本的十倍。

### Runtime 和 sandbox

E2B 用于通用 sandboxed code execution。Browserbase（配 Stagehand）用于 browser automation。需要真实 OS-level desktop control 时，用 Anthropic Computer Use。短时 burst 用 Modal。不要运行 unsandboxed code execution。永远不要。一个被 prompt-injected 的 agent 在生产环境里的 blast radius，是你不想讲的故事。

### Models

追逐 benchmark 很累，而且大多没什么帮助。务实地看，2026 年 4 月：

Claude Opus 4.7 和 Sonnet 4.6 适合可靠 tool use、多步骤 coherence 和优雅 failure recovery。Sonnet 是大多数 workloads 的性价比甜点。需要最强 CLI/terminal reasoning，或者你生活在 OpenAI infra 里时，用 GPT-5.4 和 5.5。长上下文或多模态很重的任务，用 Gemini 2.5 和 3。成本比顶级性能更重要时，特别是狭窄、定义良好的任务，用 DeepSeek-V3.2 或 Qwen 3.6。

把 models 当作可替换。如果你的 agent 只能和一个模型一起工作，那是 smell，不是 moat。用 evals 决定部署什么。每季度重新评估一次，不要每周评估。

## 该跳过什么

你会被建议学习并使用下面所有东西。你不需要。跳过的成本很低，省下的时间很大。

AutoGen 和 AG2 用于生产。微软的框架转向社区维护，发布停滞，abstractions 不匹配生产团队真正需要的东西。用于学术探索可以。不要把产品锚在上面。

CrewAI 用于新生产构建。它到处都是，因为 demo 很容易。构建真实系统的工程师已经迁走了。你愿意的话可以用它做 prototype。不要承诺在它之上长期投入。

Microsoft Semantic Kernel，除非你锁死在 Microsoft enterprise stack 里，而且你的买家在意你使用它。它不是生态前进的方向。

DSPy，除非你具体在大规模优化 prompt programs。它有哲学价值，但受众很窄。它不是 general agent framework。不要把它当成这个来选。

Standalone code-writing agents 作为架构选择。Code-as-action 是有趣研究。它还不是生产默认模式，你会和 tooling 与安全问题搏斗，而你的竞争对手不需要。

“Autonomous agent” pitches。AutoGPT 和 BabyAGI 这条血脉在产品形态上已经死了。行业最终接受的诚实 framing 是“agentic engineering”：有监督、有边界、有评估。2026 年还在卖 deploy-and-forget autonomous agents 的人，卖的是 2023 年。

Agent app stores 和 marketplaces。自 2023 年以来一直被承诺，但从未获得企业 traction。企业不买通用预构建 agents。它们买和 outcome 绑定的 vertical agents，或者自己构建。不要围绕 app-store dream 组织你的业务。

Horizontal “build any agent” enterprise platforms 作为客户选择（Google Agentspace、AWS Bedrock Agents、Microsoft Copilot Studio 这一层）。它们最终会有用。现在它们混乱、发货慢，buy-versus-build 的数学仍然偏向于自己构建 narrow agent，或者购买 vertical agent。Salesforce Agentforce 和 ServiceNow Now Assist 是例外，因为它们赢在嵌入你已经使用的 workflow systems。

追逐 SWE-bench 和 OSWorld leaderboard。Berkeley 研究者在 2025 年记录过，几乎每个公开 benchmark 都能被刷，而不用真正解决底层任务。现在团队把 Terminal-Bench 2.0 和自己的内部 evals 当作真实信号。默认对单一数字 benchmark leap 保持怀疑。

天真的 parallel multi-agent architectures。五个 agents 在 shared memory 上聊天，demo 里很惊艳，生产里会崩。如果你不能在餐巾纸上画出有读写边界的干净 orchestrator-subagent 图，就不要 ship。

新 agent 产品的 per-seat SaaS pricing。市场已经转向 outcome 和 usage based。按 seat 定价会把钱留在桌上，也向买家发出信号：你不相信自己的产品能交付 outcomes。

本周你在 Hacker News 上看到的下一个框架。等六个月。如果它仍然重要，会很明显。如果不重要，你省下一次迁移。

## 该如何真正行动

如果你想采用 agents，而不只是跟上它们，这个顺序有效。它很无聊。它有效。

选择一个已经重要的 outcome。不是 moonshot。不是横向“agent platform”项目。而是你的业务已经在意、并且可衡量的东西：转移支持工单、起草 first-pass legal review、筛选 inbound leads、生成月度报告。agent 成功的标准，是这个 outcome 发生变化。这会在第一天成为你的 eval target。

这一步比任何东西都重要，因为它会约束后续每个决策。有了具体 outcome，“哪个框架”的问题就不再是哲学问题。你选择能最快 ship 这个 outcome 的框架。“哪个模型”的问题也不再是 benchmark 争论。你选择 evals 显示在这项具体工作上有效的模型。“我们是否需要 memory / subagents / custom harness”也不再是思想实验。只有当具体 failure modes 需要时才添加。跳过这一步的团队，最后会构建没人要求的 horizontal platforms。认真对待这一步的团队，会 ship 一个 narrow agent，一个季度内回本，而这个被 ship 的 agent 教给他们的东西，会超过两年阅读。

在 ship 任何东西前设置 tracing 和 evals。选 Langfuse 或 LangSmith。接好它。必要时手工构建一个小 golden dataset。50 个 labeled examples 足够开始。你无法改进无法衡量的东西。后补它的成本大约是现在构建的 10 倍。

从 single-agent loop 开始。选 LangGraph 或 Pydantic AI。模型选 Claude Sonnet 4.6 或 GPT-5。给 agent 三到七个设计良好的工具。给它文件系统或数据库作为 state。发布给小范围用户。观察 traces。

把 agent 当作产品，而不是项目。它会以你没预测到的方式失败。这些失败就是你的路线图。用真实生产 traces 构建 regression set。每次 prompt change、model swap、tool change 都要在部署前经过 evals。大多数团队在这里投入不足。大多数可靠性也来自这里。

只有当你已经挣到资格时才扩大 scope。当 context 成为瓶颈时引入 subagents。当 single-window context 装不下所需内容时引入 memory frameworks。当底层 API 真的不存在时引入 computer use 或 browser use。不要提前架构这些。让 failure modes 把它们拉进来。

选择无聊基础设施。tools 用 MCP。sandboxes 用 E2B 或 Browserbase。state 用 Postgres 或你已经在运行的数据存储。用你现有的 auth 和 observability stack。异国情调的 infra 很少是赢家。纪律才是。

从第一天就关注 unit economics。每次 action 的成本、cache hit rates、retry-loop costs、model-call distribution。Agents 在 PoC 里看起来便宜，但规模放大 100 倍后会爆炸，除非你从一开始就 instrument cost per outcome。一个每次运行 0.50 美元的 PoC，在中等规模下会变成每月 5 万美元。没提前看到的团队，会迎来一次并不愉快的 CFO 会议。

每季度重新评估模型，不要每周。锁定一个季度。季度结束时，用你的 eval suite 跑当前 frontier，如果数据说该换，就换。这样你既能获得模型改进的收益，又不会陷入追逐每次发布的混乱。

## 读懂潮水

某件事是信号的具体迹象：

一个受尊重的工程团队写了带数字的复盘，而不只是 adoption claims。它是 primitive（protocol、pattern、infra），不是 wrapper 或 bundle。它能和你已经运行的东西互操作，而不是替换它。pitch 描述的是它解决的 failure mode，而不是它启用的 capability。它存在足够久，已经有人写过“哪些地方没成功”的博客。

某件事是噪音的具体迹象：

30 天后仍没有生产案例的 demo videos。干净得不像真的 benchmark leaps。使用“autonomous”、“agent OS”或“build any agent”却不加限定的 pitches。文档假设你会丢掉现有 tracing、auth 和 config 的框架。stars 快速上涨，但 commits、releases 和 contributors 没有同步上涨。Twitter velocity 没有 GitHub velocity。

一个有用的每周习惯：周五留 30 分钟给这个领域。读三样东西：Anthropic engineering blog、Simon Willison 的 notes、Latent Space。如果有 postmortems，扫一两篇。跳过本周其余所有东西。你会知道重要的东西。

## 值得观察什么

接下来两个季度值得注意的事情，不是因为它们保证会赢，而是因为“这是信号吗？”这个问题还没有完全解决：

Replit Agent 4 的 parallel forking model。第一次严肃尝试“多个 agents 并行工作”，且不被 shared state 绊倒。如果它在规模上站住，orchestrator-subagent 默认模式可能会变化。

Outcome-based pricing 的成熟。Sierra 和 Harvey 的收入轨迹在 narrow verticals 里验证了它。问题是它会推广到外部，还是只停留在 vertical-only model。

Skills 作为 packaging layer。GitHub 上 AGENTS.md 和 skills directories 的扩散，暗示了一种正在出现的 agent capabilities 打包方式。它能否像 MCP 对 tools 那样标准化，是开放问题。

Claude Code 2026 年 4 月的质量 regression 及其 postmortem。一个行业领先 agent 发出了 47% 的性能 regression，而且是用户先于内部 monitoring 发现。这说明即使在领先者那里，生产 agent eval practices 也仍然很不成熟。如果它推动全行业投入更好的 online evals，这次修正就是健康的。

Voice 作为默认支持界面。Sierra 的 voice channel 在 2025 年末超过 text。如果这个模式在其他 verticals 中持续，设计约束（latency、interruption、real-time tool use）会变成一等问题，许多当前架构都需要重做。

Open-model agent capability 正在缩小差距。DeepSeek-V3.2 带 native thinking-into-tool-use。Qwen 3.6。更广泛的开放模型生态。狭窄 agent tasks 的 cost-performance 正在变化。闭源默认并不永久。

这些事情里的每一件，都有清楚的“六个月后我需要看到什么才会相信它”的答案。这就是测试。跟踪答案，不要跟踪公告。

## 非传统押注

每一个你不采用的框架，都是一次你不欠下的迁移。每一个你不追逐的 benchmark，都是一个你保留下来的专注季度。本轮赢的公司（Sierra、Harvey、Cursor 在各自领域）都选择了狭窄目标，构建无聊纪律，然后让这个领域的噪音从身边过去。

传统路径是：选择一套 stack，掌握多年，爬梯子。当 stack 能稳定十年时，这有效。现在 stack 每个季度都在变。赢的人停止优化 stack mastery，转而优化 taste、primitives 和 ship velocity。他们公开构建小东西。他们通过 shipping 学习。他们因为已经做出来的东西被拉进房间。artifact 就是 credential。

坐下来想一秒，因为这是整篇文章真正的重点。我们多数人是在一种工作模型里长大的：它假设世界会静止足够久，让资历可以复利。你上学。拿学位。爬梯子。这里两年，那里三年，简历慢慢变成能开门的东西。整套机器都假设另一侧有一个稳定行业。

agent 领域现在没有稳定的另一侧。你可能想加入的公司只有六个月大。它们构建在其上的框架只有十八个月大。底层协议只有两年大。这个领域里一半被引用最多的文章，是由三年前还不在这个领域的人写的。没有梯子可爬，因为建筑一直在换楼层。当梯子失效时，剩下的是更古老的方法：做一个东西，放到互联网上，让作品介绍你。它是非传统路径，因为它绕过 credentialing system。它也是唯一能在移动领域里复利的路径。

这就是从内部看这个时代的样子。连巨头都在公开迭代、ship regressions、写 postmortems、线上修补。今年 ship 最有趣东西的团队里，有些人十八个月前还不在这个领域。不会写代码的人在和 agents 结对，发布真实软件。PhDs 被那些选对 primitives 并开始挥棒的 builders 甩在后面。门已经打开。大多数人还在找申请表。

你现在真正需要发展的技能，不是“agents”。而是在一个表面不断变化的领域里，判断哪些工作会复利的纪律。Context engineering 会复利。Tool design 会复利。Orchestrator-subagent pattern 会复利。Eval discipline 会复利。Harness mindset 会复利。知道周二发布的框架 API 不会。一旦你能区分它们，每周的发布潮就不再像压力，而开始像可以忽略的噪音。

你不需要学会所有东西。你需要学习会复利的东西，跳过不会复利的东西。选择一个 outcome。在 ship 前接好 tracing 和 evals。使用 LangGraph 或你团队里的等价物。使用 MCP。sandbox 你的 runtime。默认 single-agent。让 failure modes 拉你去扩大 scope。每季度重新评估模型。周五读三样东西。

这就是 playbook。剩下的是 taste、ship velocity，以及不追逐无关紧要之物的耐心。构建东西。把它们放到互联网上。这个时代奖励做出东西的人，多过奖励能描述东西的人。从来没有比现在更适合成为那个做东西的人。
