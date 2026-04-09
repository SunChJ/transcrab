---
title: 扩展托管式智能体：将大脑与双手解耦
date: '2026-04-09T05:00:31.934Z'
sourceUrl: 'https://www.anthropic.com/engineering/managed-agents'
lang: zh
---
*可通过我们的 [文档](https://platform.claude.com/docs/en/managed-agents/overview)开始使用 Claude Managed Agents。*

工程博客里一个持续不断的话题，是如何[构建有效的智能体](https://www.anthropic.com/engineering/building-effective-agents)，以及如何为[长时运行的工作](https://www.anthropic.com/engineering/harness-design-long-running-apps)设计[合适的 harness](https://www.staging.ant.dev/engineering/effective-harnesses-for-long-running-agents)。这些工作的共同线索是：harness 往往编码了 Claude 目前“还不能独立完成什么”的假设。但随着模型能力持续提升，这些假设需要被频繁重新审视，因为它们会逐渐[过时](http://www.incompleteideas.net/IncIdeas/BitterLesson.html)。

举个例子，在之前的工作中，[我们发现](https://www.anthropic.com/engineering/harness-design-long-running-apps) Claude Sonnet 4.5 在感知到上下文窗口快要触顶时，会提前结束任务——这种行为有时被称为“上下文焦虑（context anxiety）”。我们通过在 harness 中加入上下文重置来缓解这个问题。但当我们把同一套 harness 用在 Claude Opus 4.5 上时，却发现这种行为已经消失了。原来的重置逻辑反而变成了累赘。

我们预期 harness 还会继续演化。所以我们构建了 Managed Agents：这是 Claude Platform 中的一项托管服务，它代表你运行长时任务智能体，并通过一小组接口来暴露能力。这些接口的设计目标，是比任何一版具体实现活得更久——包括我们今天正在运行的实现。

构建 Managed Agents，意味着要解决计算机系统中的一个老问题：如何为“[尚未被想到的程序](http://www.catb.org/esr/writings/taoup/html/ch03s01.html)”设计系统。几十年前，操作系统通过将硬件虚拟化为抽象层来解决了这个问题——比如 *process*、*file* ——这些抽象足够通用，能够承载当时还不存在的程序。抽象层比底层硬件活得更久。`read()` 并不关心自己面对的是 1970 年代的磁盘阵列，还是今天的 SSD。上层接口保持稳定，而底层实现则可以自由变化。

Managed Agents 采用了同样的思路。我们把智能体系统中的几个关键组件做了虚拟化：session（记录一切已发生事件的追加式日志）、harness（调用 Claude 并把 Claude 的工具调用路由到相应基础设施的循环），以及 sandbox（Claude 可以在其中执行代码、编辑文件的运行环境）。这样一来，每个部分的实现都可以被替换，而不会扰动其他部分。我们关心的是这些接口应当长什么样，而不是它们背后具体跑着什么。

![](https://www.anthropic.com/_next/image?url=https%3A%2F%2Fwww-cdn.anthropic.com%2Fimages%2F4zrzovbb%2Fwebsite%2F903b624ada206b10753a24c6a1367e74a869165d-1080x1080.png&w=3840&q=75)

## 不要养一只“宠物”

一开始，我们把所有智能体组件都塞进了同一个容器里，这意味着 session、agent harness 和 sandbox 全都共享同一个运行环境。这种做法有一些好处，比如文件编辑就是直接的系统调用，也不需要额外设计服务边界。

但把一切都耦合进一个容器后，我们撞上了一个基础设施老问题：我们养出了一只[*宠物*](https://cloudscaling.com/blog/cloud-computing/the-history-of-pets-vs-cattle/)。在“宠物 vs 牛群”的比喻里，宠物是一个有名字、需要精心照料、不能轻易失去的个体；而牛群则是可替换的。在我们的系统里，这个服务器就成了那只宠物：一旦容器出故障，session 也就丢了；一旦容器失去响应，我们就不得不去想办法把它“救活”。

“照料容器”意味着你得去排查那些卡死、无响应的 session。我们唯一能看到内部情况的窗口，是 WebSocket 事件流，但它并不能告诉我们故障究竟出现在*哪里*。这意味着 harness 本身的 bug、事件流中的一次丢包，或是容器离线，最后在表面上看起来都一模一样。为了查明问题，工程师必须进入容器内部开 shell；但因为容器里往往还带着用户数据，这基本等于我们失去了安全地调试系统的能力。

第二个问题是，harness 默认假设 Claude 正在处理的所有资源都和它一起放在容器里。当客户希望 Claude 访问他们自己虚拟私有云（VPC）里的资源时，他们只能选择与我们的网络建立对等连接，或者把我们的 harness 跑到他们自己的环境中。一个被写死在 harness 里的假设，在我们想把系统连到不同基础设施时，立刻变成了障碍。

我们最终的方案，是把我们所说的“大脑”（Claude 及其 harness）与“双手”（执行动作的 sandbox 与工具），以及“session”（记录事件的日志）解耦。三者各自变成一层接口，对彼此只做尽可能少的假设；并且三者都可以独立失败、独立替换。

**Harness 离开容器。** 将大脑与双手解耦，意味着 harness 不再驻留在容器内部。它像调用其他工具一样去调用容器：`execute(name, input) → string`。于是容器变成了“牛群”。如果容器挂掉，harness 会把这次失败当作一次工具调用错误，传回给 Claude；如果 Claude 判断应该重试，就可以用一个标准配方重新初始化新的容器：`provision({resources})`。我们不再需要人工照料那些出问题的容器。

**如何从 harness 故障中恢复。** Harness 本身也变成了“牛群”。由于 session 日志放在 harness 之外，harness 崩溃时没有任何内部状态必须被保留下来。某个 harness 实例挂掉之后，系统只需启动一个新的实例，用 `wake(sessionId)` 重新唤醒，再通过 `getSession(id)` 取回事件日志，就可以从上一次停下来的地方继续运行。在 agent loop 进行过程中，harness 会通过 `emitEvent(id, event)` 持续把事件写入 session，从而保留一份耐久的事件记录。

![](https://www.anthropic.com/_next/image?url=https%3A%2F%2Fwww-cdn.anthropic.com%2Fimages%2F4zrzovbb%2Fwebsite%2F73e900af5b9d6ed8c64db0a8e74d4465963556b7-1640x1596.png&w=3840&q=75)

**安全边界。** 在耦合式设计里，Claude 生成的任何不受信任代码，都是和凭证运行在同一个容器中的——这意味着一次 prompt injection 只需要诱导 Claude 去读取自己的运行环境。一旦攻击者拿到这些 token，他们就能启动新的、不受限制的 session，并把任务继续委托出去。缩小 token 权限范围当然是一种明显的缓解手段，但这仍然是在编码一个关于“Claude 拿到受限 token 后还能做什么”的假设，而 Claude 正在变得越来越聪明。真正结构性的修复，是确保这些 token 根本无法从 Claude 生成代码运行的 sandbox 中被访问到。

为了做到这一点，我们用了两种模式。身份认证可以与资源一起打包，也可以被放在 sandbox 之外的安全保险库中。以 Git 为例，我们在初始化 sandbox 时，使用各个仓库自己的访问令牌去 clone 仓库，并把凭证接进本地 git remote。这样 Git `push` 和 `pull` 可以在 sandbox 内部正常工作，而智能体本身从未直接接触 token。对于自定义工具，我们支持 MCP，并把 OAuth token 存在一个安全保险库中。Claude 通过一个专用代理来调用 MCP 工具；这个代理接收一个与 session 绑定的 token，再据此从保险库取出相应凭证，并代为向外部服务发起调用。整个过程中，harness 本身并不知道这些凭证的存在。

## Session 不是 Claude 的上下文窗口

长时任务往往会超出 Claude 上下文窗口的长度，而常见的应对方式几乎都要求你不可逆地决定“保留什么、丢弃什么”。我们曾在[之前的工作](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents)中讨论过这些上下文工程技术。比如，compaction 允许 Claude 对自己的上下文做摘要，而 memory tool 则允许 Claude 把上下文写入文件，从而实现跨 session 的学习。它们还可以与上下文裁剪（context trimming）配合使用，有选择地移除旧的工具结果或 thinking blocks 等 token。

但这种对上下文进行选择性保留或丢弃的不可逆决策，很容易带来失败。你很难提前知道未来某一轮推理究竟会需要哪些 token。如果消息先经过 compaction 再进入模型，那么被压缩掉的消息就会从 Claude 的上下文窗口里被移除；除非你额外存储了它们，否则这些信息是无法恢复的。先前的研究[已经探讨过](https://arxiv.org/pdf/2512.24601)另一种思路：把上下文存储成一个活在*上下文窗口之外*的对象。例如，可以把上下文放进一个 REPL 对象里，再让 LLM 通过写代码的方式去筛选或切片它。

![](https://www.anthropic.com/_next/image?url=https%3A%2F%2Fwww-cdn.anthropic.com%2Fimages%2F4zrzovbb%2Fwebsite%2Fcf0719d7832b1f577b7393c84a7c53eecc725ca4-760x200.png&w=1920&q=75)

在 Managed Agents 中，session 提供了同样的好处：它作为一个上下文对象，存在于 Claude 的上下文窗口之外。但与其把它存放在 sandbox 或 REPL 内部，不如把它持久地写在 session 日志中。接口 `getEvents()` 允许“大脑”通过选择事件流中的位置切片，来查询上下文。这个接口非常灵活：大脑可以从自己上次停止读取的位置继续向前；可以回退到某个时刻之前几条事件，以了解上下文铺垫；也可以在执行某个动作之前，重新读取当时的上下文。

这些被取回的事件，还可以在进入 Claude 上下文窗口之前，由 harness 进一步做变换。这些变换完全可以是 harness 想要编码的任意逻辑，包括为了提升 prompt cache 命中率而进行的上下文整理，或者其他上下文工程方法。我们之所以把“session 中可恢复的上下文存储”和“harness 中任意形式的上下文管理”拆开，是因为我们无法预判未来模型到底需要哪种上下文工程。接口的职责，是把具体的上下文管理留给 harness，同时只保证 session 是耐久的、可查询的。

## 多个大脑，多双手

**多个大脑。** 将大脑与双手解耦，解决了我们最早遇到的一类客户投诉。当团队希望 Claude 操作他们自己 VPC 中的资源时，过去唯一的办法是和我们的网络建立对等连接，因为当时承载 harness 的容器默认假设所有资源都在它附近。一旦 harness 不再住在容器里，这个假设就消失了。这个改动还带来了性能收益。我们最初把大脑放进容器里，意味着每多一个大脑，就要多起一个容器。对每个大脑来说，只有等容器准备好之后，推理才可能开始；每个 session 都要预先承担完整的容器启动成本。哪怕某个 session 根本不会用到 sandbox，它也还是得 clone 仓库、启动进程、从我们的服务器拉取待处理事件。

这些空转时间，会直接体现在 TTFT（time-to-first-token）上，也就是一个 session 从接收任务到吐出第一个响应 token 所需的时间。TTFT 正是用户最直接能*感受到*的延迟。

把大脑与双手解耦之后，容器就会由大脑通过工具调用 `(execute(name, input) → string)` 按需拉起，而不是一开始就强制准备好。这样一来，如果某个 session 一开始并不需要容器，它就不必等待容器。只要编排层从 session 日志里拉到待处理事件，推理就可以立刻开始。采用这种架构后，我们的 p50 TTFT 大约下降了 60%，p95 则下降了 90% 以上。要扩展到多个大脑，也只需要启动更多无状态 harness，并只在需要时把它们接到对应的双手上。

**多双手。** 我们也希望每个大脑都能连接到多双手。在实践中，这意味着 Claude 必须理解多个执行环境，并判断任务该交给哪里去做——这比只在单一 shell 中工作，是一个更难的认知任务。我们之所以最早把大脑放进单个容器，是因为那时的模型还做不到这一点。但随着智能能力提升，单容器反而成了限制：只要这个容器出故障，大脑所伸向的每一双手的状态都会一起丢失。

将大脑与双手解耦后，每一双手都被统一成一个工具：`execute(name, input) → string`。输入是名称和参数，输出是一段字符串。这个接口可以承载任意自定义工具、任意 MCP server，以及我们自己的工具。Harness 不需要知道某个 sandbox 到底是一个容器、一台手机，还是一个 Pokémon 模拟器。由于任何一双手都不和某个特定大脑绑定，大脑之间甚至还可以互相传递“双手”。

![](https://www.anthropic.com/_next/image?url=https%3A%2F%2Fwww-cdn.anthropic.com%2Fimages%2F4zrzovbb%2Fwebsite%2F4f67b1c10566552aec514a716ea43544ab330e0b-668x243.png&w=1920&q=75)

## 结语

我们面对的挑战，其实是一个老问题：如何为“尚未被想到的程序”设计系统。操作系统之所以能跨越几十年依然适用，是因为它们把硬件虚拟化成了足够通用的抽象层，让未来才会出现的程序也能跑在上面。对于 Managed Agents，我们想做的是一套能够容纳未来 harness、sandbox 以及 Claude 周边其他组件的系统。

从这个意义上说，Managed Agents 是一种“元 harness”。它并不预设未来 Claude 一定需要某一种特定 harness；相反，它提供的是一组足够通用的接口，允许未来出现许多不同的 harness。例如，Claude Code 就是一种非常优秀的 harness，我们今天已经在很多任务中广泛使用它。我们也已经看到，面向特定任务的 agent harness 在狭窄领域里往往表现更好。Managed Agents 能够容纳这些不同形态，并随着 Claude 智能水平的提高继续适配。

所谓元 harness 设计，意味着我们对 Claude 周围的接口保持明确的判断：我们预期 Claude 需要操纵状态（session），也需要执行计算（sandbox）；我们也预期 Claude 需要扩展到多个大脑、多双手。我们把这些接口设计成能够在长时间尺度上可靠且安全地运行，但并不对未来 Claude 会需要多少个大脑、这些大脑与双手位于哪里，做任何预设。

## 致谢

本文由 Lance Martin、Gabe Cemaj 和 Michael Cohen 撰写。特别感谢 Agents API 团队与 Jake Eaton 的贡献。
