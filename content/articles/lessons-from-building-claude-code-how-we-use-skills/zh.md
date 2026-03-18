---
title: '构建 Claude Code 的经验教训：我们如何使用 Skills'
date: '2026-03-18T10:04:07.259Z'
sourceUrl: 'https://x.com/trq212/status/2033949937936085378'
lang: zh
---
Skills 已成为 Claude Code 中最常用的扩展点之一。它们灵活、易于制作且分发简单。

但这种灵活性也让人难以衡量什么才是最佳实践。什么样的 Skills 值得制作？编写一个优秀 Skill 的秘诀是什么？什么时候应该与他人分享？

在 Anthropic，我们一直在广泛使用 Claude Code 的 Skills，目前有数百个正在活跃使用中。以下是我们在利用 Skills 加速开发过程中学到的经验教训。

## 什么是 Skills？

如果你是第一次接触 Skills，我建议先[阅读我们的文档](https://code.claude.com/docs/en/skills)或观看我们在 Skilljar 上关于 [Agent Skills 的最新课程](https://anthropic.skilljar.com/introduction-to-agent-skills)。本文将假设你已经对 Skills 有一定了解。

关于 Skills，我们常听到一个误解，认为它们“仅仅是 Markdown 文件”。但 Skills 最有趣的地方在于它们不仅仅是文本文件，而是包含脚本、资源、数据等的文件夹，Agent 可以发现、探索并操作这些内容。

在 Claude Code 中，Skills 还拥有[丰富的配置选项](https://code.claude.com/docs/en/skills#frontmatter-reference)，包括注册动态钩子（dynamic hooks）。

我们发现，Claude Code 中一些最有趣的 Skills 创造性地利用了这些配置选项和文件夹结构。

### Skills 的类型

在对我们所有的 Skills 进行编目后，我们发现它们可以归纳为几个反复出现的类别。最优秀的 Skills 通常能清晰地归入其中一类；而那些令人困惑的 Skills 往往横跨多个类别。这并不是一个最终列表，但它是思考你的组织内部是否遗漏了某些 Skills 的好方法。

![](https://pbs.twimg.com/media/HDlvMmubEAIzF-N.jpg)

## 1. 库与 API 参考 (Library & API Reference)

这类 Skills 解释了如何正确使用某个库、CLI 或 SDK。它们既可以针对内部库，也可以针对 Claude Code 有时会遇到困难的常用库。这些 Skills 通常包含一个参考代码片段文件夹，以及一份供 Claude 在编写脚本时避开的“踩坑”列表。

示例：

- billing-lib — 内部计费库：边界情况、陷阱等。
- internal-platform-cli — 内部 CLI 封装器的每个子命令及使用示例。
- frontend-design — 让 Claude 更好地理解你的设计系统。

## 2. 产品验证 (Product Verification)

这类 Skills 描述了如何测试或验证代码是否正常运行。它们通常与 Playwright、tmux 等外部工具配合使用来进行验证。

验证 Skills 对于确保 Claude 的输出正确极其有用。让一名工程师花一周时间把验证 Skills 做到极致是完全值得的。

可以考虑使用一些技巧，比如让 Claude 录制其输出的视频，以便你确切看到它测试了什么；或者在每一步强制执行状态的程序化断言。这些通常通过在 Skill 中包含各种脚本来实现。

示例：

- signup-flow-driver — 在无头浏览器中运行 注册 → 邮件验证 → 入职 流程，并在每一步提供断言状态的钩子。
- checkout-verifier — 使用 Stripe 测试卡驱动结账 UI，验证发票是否真正进入正确状态。
- tmux-cli-driver — 用于交互式 CLI 测试，适用于需要 TTY 验证的场景。

## 3. 数据获取与分析 (Data Fetching & Analysis)

这类 Skills 连接到你的数据和监控栈。它们可能包含带有凭据的库、特定的仪表板 ID 等，以及关于常见工作流或获取数据方式的指令。

示例：

- funnel-query — “我应该关联哪些事件来查看 注册 → 激活 → 付费”以及包含权威 user_id 的表格。
- cohort-compare — 比较两个群组的留存或转化，标记具有统计学意义的差异，并链接到细分定义。
- grafana — 数据源 UID、集群名称、问题与仪表板的查找表。

## 4. 业务流程与团队自动化 (Business Process & Team Automation)

这类 Skills 将重复的工作流自动化为一条命令。这些 Skills 的指令通常比较简单，但可能对其他 Skills 或 MCP 有较复杂的依赖。对于这类 Skills，将之前的结果保存在日志文件中可以帮助模型保持一致，并对之前的工作流执行进行反思。

示例：

- standup-post — 汇总你的工单追踪系统、GitHub 活动以及之前的 Slack 消息，格式化为仅含增量的站报。
- create-<ticket-system>-ticket — 强制执行 Schema（有效枚举值、必填字段）以及创建后的工作流（提醒评审人员、在 Slack 中发送链接）。
- weekly-recap — 已合并的 PR + 已关闭的工单 + 部署情况 → 格式化的每周简报。

## 5. 代码脚手架与模板 (Code Scaffolding & Templates)

这类 Skills 为代码库中的特定功能生成框架样板。你可以将这些 Skills 与可组合的脚本结合使用。当你的脚手架有无法纯粹由代码涵盖的自然语言需求时，它们尤其有用。

示例：

- new-<framework>-workflow — 带有你的注解的全新服务/工作流/处理程序脚手架。
- new-migration — 迁移文件模板及常见注意事项。
- create-app — 预先配置好鉴权、日志和部署配置的内部应用。

## 6. 代码质量与审查 (Code Quality & Review)

这类 Skills 强制执行组织内部的代码质量标准并协助代码审查。为了实现最大的健壮性，它们可以包含确定性的脚本或工具。你可能希望将这些 Skills 作为钩子的一部分或在 GitHub Action 中自动运行。

- adversarial-review — 产生一个“新鲜眼光”的子 Agent 进行批判、实施修复，并不断迭代直到发现的问题降为琐碎细节。
- code-style — 强制执行代码风格，特别是 Claude 默认做得不够好的风格。
- testing-practices — 关于如何编写测试以及测试什么的指令。

## 7. CI/CD 与部署 (CI/CD & Deployment)

这类 Skills 帮助你在代码库中获取、推送和部署代码。这些 Skills 可能会引用其他 Skills 来收集数据。

示例：

- babysit-pr — 监控 PR → 重试不稳定的 CI → 解决合并冲突 → 启用自动合并。
- deploy-<service> — 构建 → 冒烟测试 → 带有错误率比较的渐进式流量发布 → 出现回归时自动回滚。
- cherry-pick-prod — 隔离的工作树 → 拣选 (cherry-pick) → 冲突解决 → 带有模板的 PR。

## 8. 运行手册 (Runbooks)

这类 Skills 接收一个症状（如 Slack 线程、告警或错误特征），引导完成多工具调查，并生成结构化报告。

示例：

- <service>-debugging — 为高流量服务映射 症状 → 工具 → 查询模式。
- oncall-runner — 获取告警 → 检查常见诱因 → 格式化发现结果。
- log-correlator — 给定请求 ID，从每个可能接触到该请求的系统中提取匹配的日志。

## 9. 基础设施运维 (Infrastructure Operations)

这类 Skills 执行日常维护和操作程序——其中一些涉及破坏性操作，需要护栏。这使得工程师更容易在关键操作中遵循最佳实践。

示例：

- <resource>-orphans — 查找孤立的 Pod/卷 → 发布到 Slack → 观察期 → 用户确认 → 级联清理。
- dependency-management — 组织的依赖审批工作流。
- cost-investigation — “为什么我们的存储/流出费用飙升”，并带有具体的 Bucket 和查询模式。

### 制作 Skills 的技巧

![](https://pbs.twimg.com/media/HDoKg58bEAAL1bw.jpg)

一旦决定了要制作什么 Skill，该如何编写它？以下是我们发现的一些最佳实践、提示和技巧。

我们最近还发布了 [Skill Creator](https://claude.com/blog/improving-skill-creator-test-measure-and-refine-agent-skills)，让在 Claude Code 中创建 Skills 变得更加容易。

## 不要陈述显而易见的内容

Claude Code 对你的代码库了解很多，而 Claude 对编码也了解很多（包括许多默认观点）。如果你发布一个主要关于知识的 Skill，请尝试关注那些能推动 Claude 跳出常规思维模式的信息。

[frontend design skill](https://github.com/anthropics/skills/blob/main/skills/frontend-design/SKILL.md) 就是一个很好的例子——它是由 Anthropic 的一位工程师通过与客户不断迭代，旨在提升 Claude 的设计品味，避开像 Inter 字体和紫色渐变这样的老套模式。

## 构建“踩坑指南” (Gotchas) 章节

![](https://pbs.twimg.com/media/HDlwEG1bEAUdmcV.jpg)

任何 Skill 中信息增量最高的内容就是 Gotchas 章节。这些章节应该根据 Claude 在使用你的 Skill 时遇到的常见失败点逐步构建。理想情况下，你应该随着时间的推移更新你的 Skill，以捕捉这些踩坑点。

## 利用文件系统与渐进式披露

![](https://pbs.twimg.com/media/HDlwhSjbEAIJSc9.jpg)

正如我们之前所说，Skill 是一个文件夹，而不仅仅是一个 Markdown 文件。你应该将整个文件系统视为一种上下文工程和渐进式披露（progressive disclosure）的形式。告诉 Claude 你的 Skill 中有哪些文件，它会在适当的时候读取它们。

渐进式披露最简单的形式是指向其他 Markdown 文件供 Claude 使用。例如，你可以将详细的函数签名和用法示例拆分到 `references/api.md` 中。

另一个例子：如果你的最终输出是一个 Markdown 文件，你可以在 `assets/` 中包含一个模板文件供其复制和使用。

你可以拥有包含参考、脚本、示例等的文件夹，这有助于 Claude 更有效地工作。

## 避免过度约束 (Avoid Railroading)

Claude 通常会努力遵循你的指令。由于 Skills 的复用性很高，你需要注意不要在指令中过于死板。给 Claude 它需要的信息，但给它根据情况进行调整的灵活性。例如：

![](https://pbs.twimg.com/media/HDlwurvbEAM5ZNu.jpg)

## 深思熟虑的设置流程

![](https://pbs.twimg.com/media/HDlw1mYbEAY-Bul.jpg)

有些 Skills 可能需要通过用户的上下文进行设置。例如，如果你正在制作一个将站报发布到 Slack 的 Skill，你可能希望 Claude 询问发布到哪个 Slack 频道。

实现这一点的一个好模式是将这些设置信息存储在 Skill 目录下的 `config.json` 文件中，如上例所示。如果配置未设置，Agent 随后可以向用户询问信息。

如果你希望 Agent 展示结构化的多选题，可以指示 Claude 使用 `AskUserQuestion` 工具。

## 描述字段是给模型看的

当 Claude Code 开始一个会话时，它会构建一个包含所有可用 Skill 及其说明的列表。Claude 会扫描这个列表来决定“是否有处理此请求的 Skill？”这意味着描述字段不是摘要，而是关于何时触发该 Skill 的说明。

![](https://pbs.twimg.com/media/HDlw5ULbEAQOqtJ.jpg)

## 记忆与数据存储

![](https://pbs.twimg.com/media/HDoImh1bEAU-mMI.jpg)

某些 Skills 可以通过在其内部存储数据来实现某种形式的记忆。你可以将数据存储在任何地方，小到追加式的文本日志文件或 JSON 文件，大到 SQLite 数据库。

例如，一个 `standup-post` Skill 可能会保存一个 `standups.log`，记录它写过的每一篇帖子。这意味着下次运行它时，Claude 可以读取自己的历史记录，并分辨出自昨天以来发生了什么变化。

存储在 Skill 目录中的数据在升级 Skill 时可能会被删除，因此你应该将其存储在稳定的文件夹中。目前我们为每个插件提供 `${CLAUDE_PLUGIN_DATA}` 作为存储数据的稳定文件夹。

## 存储脚本与生成代码

你能给 Claude 提供的最强大的工具之一就是代码。提供脚本和库让 Claude 可以把它的步骤花在逻辑编排和决定下一步做什么上，而不是重建样板代码。

例如，在你的数据科学 Skill 中，你可能有一个从事件源获取数据的函数库。为了让 Claude 进行复杂的分析，你可以给它一组如下所示的辅助函数：

![](https://pbs.twimg.com/media/HDlxbtkbkAAOse7.jpg)

Claude 随后可以即时生成脚本来组合这些功能，以针对类似“周二发生了什么？”这样的提示进行更高级的分析。

![](https://pbs.twimg.com/media/HDlxfEIb0AA2E7l.jpg)

## 按需启用的钩子 (On Demand Hooks)

Skills 可以包含仅在调用该 Skill 时激活并持续整个会话的钩子。这适用于那些你不想一直运行、但在某些时候极其有用的特定钩子。

例如：

- `/careful` — 通过 Bash 上的 `PreToolUse` 匹配器阻断 `rm -rf`、`DROP TABLE`、`force-push`、`kubectl delete`。你只有在确信自己要动生产环境时才想要这个——如果一直开启，会让人发疯。
- `/freeze` — 阻断任何不在特定目录下的 `Edit/Write`。在调试时非常有用：“我想添加日志，但我总是意外地‘修复’了不相关的代码”。

### 分发 Skills

Skills 的最大优势之一是你可以与团队的其他成员共享它们。

你可以通过两种方式与他人分享 Skills：

- 将你的 Skills 签入仓库（在 `./.claude/skills` 目录下）。
- 制作一个插件，并拥有一个 Claude Code 插件市场，用户可以在其中上传和安装插件（详见[此处文档](https://code.claude.com/docs/en/plugin-marketplaces)）。

对于在相对较少的仓库中工作的小型团队，将 Skills 签入仓库效果很好。但每个签入的 Skill 也会给模型的上下文增加一点负担。随着规模扩大，内部插件市场允许你分发 Skills，并让你的团队决定安装哪些。

## 管理市场

你如何决定哪些 Skills 进入市场？人们如何提交它们？

我们没有一个集中的团队来决定；相反，我们尝试有机地发现最实用的 Skills。如果你有一个希望人们试用的 Skill，可以将其上传到 GitHub 的 Sandbox 文件夹中，并在 Slack 或其他论坛中指引人们。

一旦一个 Skill 获得了关注（这由 Skill 所有者决定），他们可以提交一个 PR 将其移入市场。

警告：制作蹩脚或冗余的 Skills 非常容易，因此在发布前确保有一定的策展机制很重要。

## 组合 Skills

你可能希望拥有相互依赖的 Skills。例如，你可能有一个上传文件的 Skill，以及一个生成 CSV 并上传它的 Skill。这种依赖管理目前尚未原生内置于市场或 Skills 中，但你只需按名称引用其他 Skills，如果已安装，模型就会调用它们。

## 衡量 Skills

为了了解 Skill 的表现，我们使用 `PreToolUse` 钩子记录公司内部的 Skill 使用情况（[示例代码在此](https://gist.github.com/ThariqS/24defad423d701746e23dc19aace4de5)）。这意味着我们可以发现哪些 Skills 很受欢迎，或者哪些 Skills 的触发率低于预期。

### 结语

Skills 对 Agent 来说是极其强大、灵活的工具，但现在仍处于早期阶段，我们都在探索如何最好地使用它们。

与其说这是一个权威指南，不如说它是我们所见证的一袋有用技巧。理解 Skills 的最佳方式就是开始行动、进行实验，并看看什么对你最有效。我们的大多数 Skills 起初只有几行字和一个 Gotcha，正是因为人们在 Claude 遇到新的边界情况时不断补充，它们才变得越来越好。

希望这有所帮助，如果你有任何问题，请告诉我。
