# 自动改进的软件

编码 agent 已经改变了我们构建软件的方式。现在，它们也在改变我们改进软件的方式。今天我想分享一个 agent 平台：编码 agent 可以自己构建、运行并改进它。

整个 agent 开发生命周期由五个 prompt 覆盖：

- Create：搭建一个新的 agent。
- Improve：按照已有 spec 强化一个现有 agent。
- Extend：为现有 agent 添加新能力。
- Hill Climb：运行 eval 套件，诊断失败，并修复范围内的问题。
- Review：扫描仓库，检查文档、代码和配置之间的漂移。

“Improve → Hill Climb” 循环可以在极少监督下递归改进我的 agents。很难想象手动完成这件事。

顺带一提，这个自动改进循环之所以可能，是因为环境就是为它设计的。Agent 代码、 traces、日志、eval 套件和正在运行的软件都在同一个地方，所以编码 agent 可以端到端直接跑起来。

## 它能工作，是因为我们控制了整个技术栈

大多数软件无法自动改进，因为它的输入和输出分散在不同工具里。要运行自动改进循环，编码 agent 必须从三个不同工具中拼接数据；每个工具都有自己的认证、自己的操作方式。

理论上可行。实践中摩擦太大。

我的代码库是专门为自动改进设计的。比如，Claude Code 可以测试一个 agent，然后通过读取 sessions、traces 和日志判断 PASS 或 FAIL。如果 agent 失败，它会编辑这个 agent，然后再次运行。

有三件事让这成为可能：

1. 每个动作都暴露为 API。运行 agent、读取 session、运行 eval。每个关键动作都可以用 cURL 或 bash 执行。
2. 数据共置。Sessions 和 traces 都在我们的 Postgres 数据库里。编码 agent 可以触发一次运行，并在不离开环境的情况下读取输出。
3. 日志高于一切。整个平台在本地 Docker 上运行。编码 agent 读取实时日志，并按需更新。test → review 循环大约 5 秒。日志就是解锁一切的实时反馈环。

Agent 平台是第一类这样的软件：动作、数据和迭代工具足够靠近，编码 agent 可以端到端测试、修改代码、再测试，直到 agent 变好。也就是说，承载这个循环的平台，会成为这个循环首先改进的东西。

## Agent 开发生命周期

接下来我会展示 Claude Code 如何运行我的 agent 平台。

## 1. 创建一个 agent

要创建一个新的 agent，我打开 Claude Code 并输入：

Run create-new-agent.md in a new branch.

Claude 会先问几个问题：这个 agent 应该做什么、需要哪些工具。然后它通过 MCP 搜索 Agno 文档，找到合适的 toolkit，生成 agent 文件，把它注册到 app/main.py，重启容器，并通过 cURL 做 smoke test。从 prompt 到 agent，5 到 10 分钟。

因为平台处理了所有事情，我开始构建一些以前根本懒得做的 agents：一个总结隔夜 Slack 消息的 agent，一个起草每周更新的 agent，一个高亮仓库里重要 issue 的 agent。这些都不值得变成一个持续好几天的项目。但它们都能塞进一次咖啡休息时间。

## 2. 改进一个 agent

要改进一个已有 agent，我输入：

Run improve-agent.md on code-search agent.

Claude 会读取这个 agent 的 INSTRUCTIONS，并从中推导出 8 到 12 个 probes。有些是黄金路径，有些是边界情况，有些测试工具选择。还会混入几个对抗性用例：prompt injection、畸形输入、试图把 agent 拉离目标的请求。

它通过 cURL 对 live container 运行每个 probe。读取响应。读取容器日志中的工具调用。然后根据 INSTRUCTIONS 实际承诺的内容判断 PASS 或 FAIL。

对每个失败，它会选择一个杠杆：收紧一条规则、添加一条规则、替换一个工具、提高 num_history_runs，或者任何适合该失败模式的改动。它编辑 agents/<slug>.py，热重载，然后只重新运行失败过的 probes。

然后继续迭代。最多五轮。如果全部通过，会更早停止。

除了启动任务，我不需要输入任何东西。以前这要花一天手动到处点，现在已经完全自动化。

## 3. 扩展一个 agent

要给已有 agent 添加能力，我输入：

Run extend-agent.md on code-search agent.

Extend 会让我坐在驾驶位。我描述一个改动：添加一个工具、优化一个 prompt、修一个 bug。Claude 执行。Agno docs MCP 会被加载，所以 toolkit 研究基于真实 API。

Claude 做出改动，运行 smoke tests。每次迭代都是一个小而经过验证的步骤。改动保持精确，并且单独测试。

## 4. Hill Climb

随着时间推移，我们会积累很多 evals；手动修失败就太可惜了。我只需要输入：

Run eval-and-improve.md.

Hill Climb 会运行 eval 套件，诊断每个失败，并修复范围内的问题。失败类型会映射到修复位置：INSTRUCTIONS 中缺少规则、幻觉、触发了错误工具、rubric 过度指定。对每个失败，Claude 选择正确杠杆、编辑，然后只重新运行失败用例。等全部变绿后，再重新运行完整套件来捕捉回归。

Eval 套件只有两个文件。evals/cases.py 声明用例。每个用例是一条输入加一个 rubric（正确响应应该是什么样），并可选地包含预期工具调用。它基于 Agno 的 AgentAsJudgeEval 和 ReliabilityEval 构建。

Improve 捕捉分布外失败。Hill Climb 确保分布内用例继续通过。两者配合得非常好。

## 5. Review

因为这个仓库主要由编码 agents 管理，所以移动得很快。为了让一切保持同步，我输入：

Run review-and-improve.md.

Claude 会扫描整个仓库，查找文档、代码和配置之间的漂移。磁盘上的每个 agent 文件都应该注册到 app/main.py。代码读取的每个环境变量都应该出现在 example.env 和 AGENTS.md 中。Markdown 文档里的每个路径都应该仍然存在。每个脚本都应该做到它声称会做的事。

机械性漂移会被就地自动修复：重命名过的文件、example.env 中缺失的条目、架构图里漏掉的新 agent。更大的问题会被标记出来，并附上建议的下一步。

这最适合在发布前或重构后运行。对人来说枯燥的工作，对一个能读取仓库里每个文件的编码 agent 来说却很简单。

文档和代码之间的漂移一直是生产软件的一种税。现在它不再有成本。

## 为什么是 Agent 平台？

Agent 平台是这种模式的完美试验场。

1. 绿地。Agent 平台相对较新，可以从一开始就为编码 agent 设计。
2. 工作流清楚。我们知道如何改进一个 agent：运行它、读取日志、给响应评分、编辑、再运行。
3. 这个循环真的有用。对普通软件来说，优化一个 API endpoint 不一定有意义。对 agents 来说，每一轮改进都真实、可衡量，并会增加价值。

只要正确搭建平台，就可以在它之上构建任何 agent：用 create 工作流从想法变成 agent，用 improve 工作流强化 agent，用 extend 工作流添加新能力，用 evals 锁住它们，然后围绕它们做 hill-climb。

再用 review-and-improve 工作流保持整个仓库同步。

这几乎不可能手动完成。

## 我的自动改进 Agent 平台

这是我的自动改进 agent 平台链接：[agent-platform-railway](https://github.com/agno-agi/agent-platform-railway)。

它是一个 agent 平台 starter codebase，可以在本地 Docker 运行，也可以部署到 Railway。Prompts 在 docs/ 文件夹里。Clone、配置，然后 10 分钟内就能跑起 agents。

完整设置指南见 [README](https://github.com/agno-agi/agent-platform-railway)，参考资料见 [Agno Docs](https://docs.agno.com/)。

## 自动改进的软件

我已经跑这个循环几个星期了，它仍然不断让我惊讶。

Agent instructions 被收紧了半句话。一个 docstring 和代码重新同步。每次运行，平台都会更干净一点。

我能看见一个所有软件都这样运作的世界：一个编码 agent 端到端管理你的平台，修复那些小到你永远不会优先处理的问题。感谢阅读！

Ashpreet

用 🧡 和 [Agno](https://github.com/agno-agi/agno) 构建。