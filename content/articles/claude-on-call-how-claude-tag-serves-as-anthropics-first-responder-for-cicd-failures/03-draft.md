# Claude 来值班：Claude Tag 如何成为 Anthropic CI/CD 故障的第一响应者

[*使用我们的配置套件，搭建你自己的 Claude 值班助手*](https://github.com/anthropics/oncall-kit)*。*

## 用 AI 响应 CI/CD 故障：Claude 在 Anthropic 的值班实践

几周前轮到我值班，晚上 10 点，同事在 Slack 上发来消息：一个新服务中大约有 44 个测试没有触发。

换作以前，我会停下手头的事，坐到笔记本电脑前，疲惫地叹口气，开始长达一小时的排查和修复。但现在，我的工作方式完全不同了：把 @Claude 拉进来，问问它发现了什么。

这一次，Claude 发现那些测试是在当天早上启用某个功能开关后消失的，而且回退该开关是安全的。我请同事回退开关。3 分钟后，Claude 在 Slack 上通知我，确认跳过测试的规则确实已经移除，错误率也恢复到了基线水平。

<figure><p><img alt="" src="https://cdn.prod.website-files.com/68a44d4040f98a4adf2207b6/6a85deb08541b5a210e00ef5_cb834739.png" loading="lazy"></p><figcaption>根据真实交流重新编排，以便清晰呈现。</figcaption></figure>

过去几个月，Claude Tag 一直是 Anthropic CI/CD 故障值班响应的第一响应者。这不仅让我们有了更多社交生活，也让每起 CI 故障都能立刻得到响应：近期所有有情况报告的故障，其首份报告都由 Claude 撰写，**通常会在 15 分钟内发布初步分析。**

本文将介绍我们搭建了什么，以及它如何运作，让你也能自己搭建一套，不再害怕轮到自己值班。

## **我们的 Claude 值班配置**

在逐一介绍故障响应的各个阶段之前，我先概述一下我们的配置，让你在了解细节时心中有一幅全景图。

值班智能体需要**记忆**，才能记住已经做过什么；需要**连接与访问权限**，才能调查、理解并采取行动；需要**任务调度**，才能知道何时该回来继续工作；还需要**指令**，才能知道该做什么。

[Claude Tag](https://claude.com/product/tag) 是我们值班智能体的核心。它保存值班 Slack 频道中的记忆，也提供了在故障处理过程中逐轮下达指令的交互入口。Claude 还会实时响应值班频道及其他频道中的事件。例行任务，也就是 Claude 定期执行的操作，同样在这个频道中通过自然语言提示来安排，例如“每周一美国东部标准时间上午 9 点执行 CI 值班交接”。

[Claude Tag 有自己的服务账号](https://claude.com/blog/agent-identity-access-model)，并且可以访问 Anthropic CI 工程师所需的工具，例如 Datadog 或 Grafana。管理员只需为频道完成一次配置（[具体方法见这里](https://claude.com/docs/claude-tag/admins/setup-overview#choose-which-tools-to-connect)）。

除了值班频道，我们还让 Claude 关注其他相关频道，这些频道也都有 Claude Tag 作为成员。这样，它就能获得服务告警、配置变更或 PR 更新等额外上下文。

长期生效的指令以 skill 的形式保存在 Markdown 文件中，并提交到 GitHub 仓库。这样，多位同事可以共同迭代这些指令，我们也能像管理代码一样管理变更。其中还包含任务路由指令、策略和经验教训日志等关键信息，形成自我改进的闭环。

这套配置只花了我们几个小时，而不是几天。我们在 GitHub 上提供了一个通用的[值班配置套件](https://github.com/anthropics/oncall-kit)，帮助你搭建类似的智能体。它会把团队自己的历史故障记录转化为分诊手册，并在故障频道中配置一个只有只读权限的 Claude，负责诊断、升级处理和学习。你可以花大约十分钟，[看看它如何处理一个虚构团队的历史记录](https://github.com/anthropics/oncall-kit/blob/main/test-fixtures/RUNBOOK.md)。

简要概括，步骤如下：

* 你需要订阅 [Claude Team 或 Claude Enterprise](https://support.claude.com/en/collections/9387370-team-and-enterprise-plans) 套餐。
* 组织所有者需要通过 Claude Tag，把 Claude 加入值班 Slack 频道。
* 组织所有者还需要协助，为值班 Slack 频道中的 Claude 接入合适的连接器和 GitHub 仓库，并配置 [Claude Code Remote](https://code.claude.com/docs/en/remote-control)。
* 将 Claude 加入故障频道，指示它监控故障并立即开展分诊。

下面，我们逐一看看，故障处理的每个阶段发生了怎样的变化。

## **发现故障**

Claude 改变的不只是故障响应方式，也改变了最初发现故障的方式。过去，故障发现主要有两类薄弱环节。

人很难始终未卜先知，设置出完美的规则和阈值。尤其是在缺乏足够数据来分析流量模式时，就更难了。

为此，我们让 Claude 分析新服务上线头几天的数据和收到的告警，建议补充规则，并微调那些范围过宽或过窄的规则。

第二类主要问题是告警疲劳：检查和甄别每一条触发的告警十分枯燥。但 Claude 不会像人一样感到疲劳。

Claude 会监控各个告警频道中的每条相关告警，并逐项对照[根目录 oncall.md 文件](https://github.com/anthropics/oncall-kit/blob/main/templates/ONCALL.md)中的标准，判断是可以等到早晨再处理，还是需要呼叫值班人员。例如，基于数据分析调优后，文件中的某条规则可能是：“如果错误率超过 2%，持续超过 5 分钟，并且不在已知的部署窗口内，就呼叫值班人员；否则记录到 lessons.md。”

Claude 的值班告警流程还可以通过另外两种方式触发：

* CI 团队成员在值班频道中报告问题，就像开头提到的 44 个测试未运行的例子；或者
* 公司里的任何人都可以通过内部页面发起故障事件。如果事件被标记为 CI 基础设施故障，系统就会为它创建一个 Slack 频道，由我们的值班 Claude 接手。

<figure><p><img alt="" src="https://cdn.prod.website-files.com/68a44d4040f98a4adf2207b6/6a84a163e2030bce8127dd8e_a5e36b9a.png" loading="lazy"></p></figure>

这里的关键是：告警流程是确定性的，而值班升级处理既有确定性路径，也有智能体驱动的路径。

## **分诊**

让 Claude 过滤告警噪声是一回事，真正节省时间的则是调查过程。从故障事件创建到 Claude 发布首份有证据支撑的分析，中位用时为 14 分钟；最快的情况下，它能在 4 分钟内发布的首份报告中指出根因。

当告警升级为故障事件时，Claude 往往已经在 Slack 频道里准备好了一个有证据支撑的假设，供我们审阅。Claude Tag 会启动一个[动态工作流](https://claude.com/blog/a-harness-for-every-task-dynamic-workflows-in-claude-code)：由编排智能体启动执行子智能体，调查每项依赖和权威信息源。

对我们而言，这些信息源包括 Grafana、日志存储、PagerDuty、GitHub、Kubernetes，以及 Slack 故障频道，全部通过 [MCP 连接器](https://code.claude.com/docs/en/mcp)接入。Claude 可以并行追踪多条线索，帮助降低平均解决时间（MTTR）。

执行子智能体将发现汇报给编排智能体，后者再将信息综合整理为一份条理清晰的情况报告（SITREP）。

<figure><p><img alt="" src="https://cdn.prod.website-files.com/68a44d4040f98a4adf2207b6/6a84a163e2030bce8127ddb7_faae8c5a.png" loading="lazy"></p></figure>

编排智能体和执行子智能体并不是盲目搜索。它们由一个调查 skill 引导，并可查阅[针对每类 bug 的更详细 Markdown 参考文件](https://github.com/anthropics/oncall-kit/tree/main/skills/triage)。

例如，有一个针对影子运行结果偏差（shadow divergence）问题的调查 skill，长达 617 行，记录了我在典型调查中执行的每一步。我是在一次故障中与 Claude 逐轮排查，然后让它根据这段经历生成了这个文件。

Lessons.md 也会指导 Claude 排查问题。这个 Markdown 文件持续记录我们解决过的每起故障：发生了什么、根因是什么、如何修复，以及有哪些值得记住的坑。Claude 会自行追加内容。每次新调查都从读取它开始，因此 Claude 提出的第一个假设会参考近期发生过的事情。

如果同一种模式出现得足够频繁，我们就会把它纳入调查 skill 本身。我最喜欢的一条记录，是 Claude 针对我写的。当时我还没检查指标，就根据配置文件做了推断。如今 lessons.md 里写着：“先查数据，再提假设。配置告诉你可能哪里会出问题；指标告诉你实际出了什么问题。”

即便有这些工具和上下文，Claude 也不总能一次就判断正确。人的直觉和经验仍然很重要。Claude Tag 支持团队以多人协作的方式排查故障，任何一位同事都可以实时引导调查，或补充新的假设。

<figure><p><img alt="" src="https://cdn.prod.website-files.com/68a44d4040f98a4adf2207b6/6a85df2d22740fdbccb17112_24270a8f.png" loading="lazy"></p><figcaption>根据真实对话重现，以便清晰呈现。</figcaption></figure>

## **解决故障**

既然 Claude 能升级处理告警、排查问题，它也能修复问题吗？各个团队的答案可能不同，下面是我们的做法。

我们团队的大多数部署都由功能开关控制。我在 Claude Code 中创建了一个独立智能体，使用我的权限，可以通过这些功能开关逐步发布变更。

发布流程的第一阶段通常由 Claude 管理金丝雀流量、监控问题，并自动调高或调低某个功能开关的放量比例。这完全可以另写一篇文章，所以这里不再展开。

Claude Tag 还会通过以下方式帮助团队解决故障：

* 告诉我们是否需要对 Kubernetes 集群的某些部分执行 drain 或 cordon。
* 指导我们如何扩容部分基础设施，以应对需求突增。这种情况很少，但当 Claude 能明确告诉我们可以采取哪些缓解措施时，会非常有帮助。
* 最常见的是以 PR 形式提供修复，由值班人员审查、合并，然后部署，快速解决问题。

## **验证、沟通与交接**

Claude 会复用调查过程中用到的许多 MCP 连接器和工具，验证修复是否达到预期。按照 oncall.md 中长期生效的指令，它会将故障复盘写入 lessons.md，并用于交接情况报告。

为了传达多起故障的整体情况，我们创建了一个名为 ci-weather 的智能体。它汇总各个 Slack 故障频道的信息，以及构建指标、合并队列统计和部署延迟，再将一份新闻简报式报告发布到公司内任何人都能阅读的公共频道。现在，工程师想判断是否应该暂缓合并，或者想知道“CI 到底出了什么问题”时，可以直接查看这个频道，而不必来问我们。

坦白说，报告格式经过了好几轮迭代。Claude 可以一次就写出一个生成状态报告的 skill，但怎样才算易读，取决于团队自己的偏好。这是人与人之间的沟通，而不只是底层系统的连接。

<figure><p><img alt="" src="https://cdn.prod.website-files.com/68a44d4040f98a4adf2207b6/6a84a163e2030bce8127ddb1_c00ab792.png" loading="lazy"></p></figure>

最后，虽然 Claude 会在 lessons.md 中为自己记日志，我们也希望每周一为人类同事生成交接报告。Claude 会产出每日和每周摘要，让团队成员能够顺畅接续上一位同事的工作。

## **从监控故障，到监控故障响应系统**

如今，我们的软件工程师平均[每季度交付的代码量是过去的 8 倍](https://www.anthropic.com/institute/recursive-self-improvement)，这里的过去指 2021 至 2025 年。我们一直维持着高质量标准：每个 PR 都有明确的人类负责人，每次变更都必须获得批准才能合并，每次变更都要经过同一套 CI 检查关卡。而要跟上智能体编程的步伐，唯一的办法就是让 CI 也由智能体驱动。

Claude 接手了我工作中那些繁琐的部分、下班后的打扰，以及故障期间的沟通，让我能够专注于真正改善系统可靠性的中长期架构变更。

这套系统最棒的一点是，它并不显得零散。我们的值班流程一直都在 Slack 中，现在只是 Claude 也加入了频道。

如何开始：

* 你需要订阅 [Claude Team 或 Claude Enterprise](https://support.claude.com/en/collections/9387370-team-and-enterprise-plans) 套餐。
* 组织所有者需要通过 Claude Tag，把 Claude 加入值班 Slack 频道。
* 组织所有者还需要协助，为值班 Slack 频道中的 Claude 接入合适的连接器和 GitHub 仓库，并配置 [Claude Code Remote](https://code.claude.com/docs/en/remote-control)。
* 将 Claude 加入故障频道，指示它监控故障并立即开展分诊。

[*使用我们的配置套件，搭建你自己的 Claude 值班助手*](https://github.com/anthropics/oncall-kit)*。*

*本文由 Anthropic 技术成员 Sachin Malhotra 撰写，Anthropic 员工 Michael Segner 亦有贡献。*
