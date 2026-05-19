---
title: 大型代码库中的 Claude Code：运行方式、最佳实践与起步指南
date: '2026-05-19T02:18:10.889Z'
sourceUrl: >-
  https://claude.com/blog/how-claude-code-works-in-large-codebases-best-practices-and-where-to-start
lang: zh
---
Claude Code 已经在多种生产环境中运行：数百万行级的 monorepo、积累了几十年的遗留系统、横跨几十个仓库的分布式架构，以及拥有数千名开发者的组织。和更小、更简单的代码库相比，这些环境会带来额外挑战，比如每个子目录的构建命令都不一样，或者遗留代码分散在多个文件夹中，彼此没有共同的根目录。

本文总结了我们观察到的、能够帮助团队在规模化场景中成功采用 Claude Code 的模式。这里的“大型代码库”涵盖很广：数百万行的 monorepo、经历数十年演进的遗留系统、分布在独立仓库中的数十个微服务，或者上述情况的任意组合。它也包括一些团队不总会和 AI 编程工具联系在一起的语言代码库，例如 C、C++、C#、Java、PHP。（在这些场景中，Claude Code 的表现通常比大多数团队预期的更好，尤其是在近期模型发布之后。）虽然每一次大型代码库落地都会受到具体版本控制方式、团队结构和既有约定的影响，但本文中的模式具有跨场景的通用性，也适合作为正在考虑采用 Claude Code 的团队的起点。

## Claude Code 如何导航大型代码库

Claude Code 导航代码库的方式和软件工程师相似：它遍历文件系统、读取文件、用 grep 精确查找所需内容，并沿着引用关系在代码库中追踪。它在开发者本机运行，不需要预先构建、维护代码库索引，也不需要把索引上传到服务器。

由 RAG 驱动的 AI 编程工具通常会对整个代码库做 embedding，并在查询时检索相关片段。在大规模环境下，这类系统可能失效，因为 embedding 流水线跟不上活跃工程团队的提交速度。等开发者查询索引时，索引反映的可能已经是几周、几天，甚至几小时前的代码库状态。检索结果可能返回一个团队两周前已经重命名的函数，或者引用上个 sprint 已经删除的模块，却没有任何提示说明它们已经过期。

智能体式搜索可以避开这些失败模式。数千名工程师持续提交新代码时，不需要维护 embedding 流水线或中心化索引。每个开发者的实例都基于实时的代码库工作。

但这种方式也有取舍：Claude 需要足够的起始上下文，才能知道该从哪里开始找。这意味着 Claude 的导航质量取决于代码库设置得好不好，尤其是是否通过 CLAUDE.md 文件和 skills 分层提供上下文。如果你让它在十亿行级代码库中查找某个模糊模式的所有实例，工作还没真正开始就会触及上下文窗口限制。愿意投入代码库设置的团队，会得到更好的结果。

## 运行框架和模型同样重要

关于 Claude Code，最常见的误解之一是：它的能力完全由所使用的模型决定。团队往往关注模型 benchmark，以及它在测试任务上的表现。实际情况是，围绕模型构建的生态，也就是运行框架（harness），对 Claude Code 表现的影响往往超过模型本身。

这个运行框架由五类扩展点组成：CLAUDE.md 文件、hooks、skills、plugins 和 MCP servers。它们各自承担不同职能，团队构建它们的顺序也很重要，因为每一层都会建立在前一层之上。除此之外，LSP 集成和 subagents 这两项能力会补齐整体设置。下面我们分别说明这些组件和能力的作用：

[**CLAUDE.md**](https://code.claude.com/docs/en/memory) **文件应该最先建设**。这些是 Claude 在每个会话开始时自动读取的上下文文件：根目录文件负责整体图景，子目录文件负责局部约定。它们为 Claude 提供完成任务所需的代码库知识。由于无论任务是什么，它们都会在每个会话中加载，因此应聚焦于广泛适用的信息，避免变成性能负担。

[**Hooks**](https://code.claude.com/docs/en/hooks-guide) **让设置具备自我改进能力**。多数团队会把 hooks 理解为防止 Claude 做错事的脚本，但它们更有价值的用法是持续改进。stop hook 可以在上下文仍然新鲜时回顾一次会话中发生了什么，并提出 CLAUDE.md 更新建议。start hook 可以动态加载团队特定上下文，让每个开发者都能自动获得适合自己模块的设置，而不需要手动配置。对于 lint 和 format 这类自动化检查，hooks 能以确定性的方式执行规则，比依赖 Claude 记住一条指令更稳定。

[**Skills**](https://code.claude.com/docs/en/skills) **让正确的专业知识按需可用，而不膨胀每个会话的上下文**。在有几十类任务的大型代码库中，并不是所有专业知识都需要出现在每个会话里。Skills 通过[渐进式披露](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices)解决这个问题：把原本会争夺上下文空间的专门工作流和领域知识移出去，只在任务需要时加载。例如，当 Claude 评估代码漏洞时加载安全审查 skill；当代码变更后需要同步更新文档时加载文档处理 skill。

Skills 也可以限定到具体路径，只在代码库的相关部分激活。负责支付服务的团队可以把部署 skill 绑定到该目录，这样当有人在 monorepo 的其他位置工作时，它就不会自动加载。

[**Plugins**](https://code.claude.com/docs/en/plugins) **负责分发有效实践**。大型代码库的一个挑战是，*好用*的设置可能停留在小圈子经验中。Plugin 可以把 skills、hooks 和 MCP 配置打包成一个可安装包。新工程师入职第一天安装这个 plugin 后，就能立即拥有已经在使用 Claude 的同事所拥有的同一套上下文和能力。Plugin 更新还可以通过[托管 marketplace](https://support.claude.com/en/articles/13837433-manage-claude-cowork-plugins-for-your-organization)在组织内分发。

例如，我们合作过的一家大型零售组织构建了一个 skill，把 Claude 连接到内部分析平台，让业务分析师无需离开现有工作流就能拉取业绩数据。他们在面向业务部门大规模推广前，先把它作为 plugin 分发出去。

**Language server protocol（LSP）集成让 Claude 获得和开发者 IDE 相同的导航能力。** 大多数面向大型代码库的 IDE 已经在运行 LSP，用来支持“跳转到定义”和“查找所有引用”。把这套能力暴露给 Claude，可以让它获得符号级精度：它能跟随一次函数调用找到定义，跨文件追踪引用，并区分不同语言中同名的函数。没有 LSP 时，Claude 只能基于文本做模式匹配，可能落到错误的符号上。我们合作过的一家企业软件公司在推广 Claude Code 前，先在全组织部署了 LSP 集成，目的就是让 C 和 C++ 的大规模导航变得可靠。对于多语言代码库，这是投入产出比最高的建设之一。

**MCP servers 扩展一切。** MCP servers 是 Claude 连接内部工具、数据源和 API 的方式，这些能力是它否则无法触达的。最成熟的团队会构建 MCP servers，把结构化搜索作为 Claude 可以直接调用的工具暴露出来。其他团队则把 Claude 接入内部文档、工单系统或分析平台。

[**Subagents**](https://code.claude.com/docs/en/sub-agents) **把探索和编辑拆开**。Subagent 是一个隔离的 Claude 实例，拥有自己的上下文窗口。它接收一个任务、完成工作，然后只把最终结果返回给父 agent。一旦运行框架就绪，一些团队会启动一个只读 subagent 来梳理某个子系统，并把发现写入文件，再让主 agent 基于完整图景进行编辑。

<figure><p><img alt="" src="https://cdn.prod.website-files.com/68a44d4040f98a4adf2207b6/6a04aaf1c37c6196e5ee19bb_fig1-the-claude-code-harness-v1%402x.png" loading="lazy"></p><figcaption><em>Claude Code 扩展层一览。</em></figcaption></figure>

下表总结了每个组件的作用、加载时机，以及我们最常看到的误用：

<figure><div role="region" tabindex="0"><table><thead><tr><th>组件</th><th>它是什么</th><th>何时加载</th><th>最适合</th><th>常见误区</th></tr></thead><tbody><tr><td>CLAUDE.md</td><td>Claude 自动读取的上下文文件</td><td>每个会话</td><td>项目特定约定、代码库知识</td><td>把本该放进 skill 的可复用专业知识写在这里</td></tr><tr><td>Hooks</td><td>在关键时刻运行的脚本</td><td>由事件触发</td><td>自动化一致行为、捕获会话经验</td><td>用 prompt 处理本该自动运行的事情</td></tr><tr><td>Skills</td><td>面向特定任务类型的打包指令</td><td>相关时按需加载</td><td>跨会话、跨项目复用专业知识</td><td>把所有内容都塞进 CLAUDE.md</td></tr><tr><td>Plugins</td><td>打包的 skills、hooks、MCP 配置</td><td>配置后始终可用</td><td>在组织内分发一套有效设置</td><td>让好设置停留在小圈子经验里</td></tr><tr><td>Language server protocol（LSP）*</td><td>通过语言专用 server 提供实时代码智能</td><td>配置后始终可用</td><td>符号级导航，以及 typed language 中的自动错误检测</td><td>以为它会自动存在</td></tr><tr><td>MCP servers</td><td>连接外部工具和数据</td><td>配置后始终可用</td><td>让 Claude 访问它原本无法触达的内部工具</td><td>基础能力还没跑顺就先建设 MCP 连接</td></tr><tr><td>Subagents*</td><td>面向特定任务的独立 Claude 实例</td><td>调用时加载</td><td>拆分探索与编辑、并行工作</td><td>在同一个会话中同时做探索和编辑</td></tr><tr><td colspan="5">*LSP 通过 plugin 层访问。Subagents 是一种委派能力，而不是一个已配置的扩展点。</td></tr></tbody></table></div></figure>

## 成功部署中的三种配置模式

如何为大型代码库配置 Claude Code，很大程度上取决于代码库本身的结构。不过，在我们观察过的部署中，有三种模式反复出现。

### 让代码库在规模化场景中可导航

Claude 在大型代码库中能提供多少帮助，受限于它找到正确上下文的能力。每个会话加载过多上下文会降低性能；上下文太少，又会让 Claude 盲目摸索。最有效的部署会提前投入，让代码库对 Claude 来说可读、可理解。几个模式反复出现：

*   **让 CLAUDE.md 文件保持精简并分层。** Claude 在代码库中移动时会叠加加载这些文件：根目录文件提供整体图景，子目录文件提供局部约定。根目录文件应该只包含指针和关键注意事项；其他内容很容易变成噪音。
*   **在子目录初始化，而不是在仓库根目录初始化。** 当 Claude 的作用域限定在和任务真正相关的代码库部分时，效果最好。在 monorepo 中，这可能有点反直觉，因为工具链通常默认从根目录运行，但 Claude 会自动沿目录树向上查找并加载路径上的每一个 CLAUDE.md 文件，因此根目录上下文并不会丢失。
*   **按子目录限定 test 和 lint 命令。** Claude 只改了一个服务，却运行全量测试套件，会导致超时，并把上下文浪费在无关输出上。子目录级 CLAUDE.md 应该写明适用于该部分代码库的命令。对于每个目录都有自己的测试和构建命令的服务化代码库，这种方式很有效。在有深层跨目录依赖的编译型语言 monorepo 中，按子目录限定会更难，可能需要项目特定的构建配置。
*   **使用 `.ignore` 文件排除生成文件、构建产物和第三方代码。** 在 `.claude/settings.json` 中提交 `permissions.deny` 规则，意味着这些排除项会进入版本控制，团队中的每个开发者都能获得同样的降噪效果，而不需要自己配置。在某些代码库中，生成文件本身就是开发对象。负责代码生成器的开发者可以在本地设置中覆盖项目级排除规则，而不影响团队其他成员。
*   **当目录结构本身无法说明问题时，构建代码库地图。** 对于代码没有集中在常规目录结构中的组织，可以在仓库根目录放一个轻量 markdown 文件，列出每个顶层文件夹，并用一句话说明其中内容。这相当于给 Claude 一份目录表，让它在打开文件前先扫描。对于拥有数百个顶层文件夹的代码库，最好采用分层方式：根文件只描述最高层结构，子目录 CLAUDE.md 文件按需加载下一层细节。更简单的场景中，直接 @ 提及 Claude 应该参考的特定文件或目录，也能达到类似效果。
*   **运行 LSP servers，让 Claude 按符号搜索，而不是按字符串搜索。** 在大型代码库中 grep 一个常见函数名，可能返回成千上万个匹配项，Claude 会消耗上下文去打开文件判断哪个才重要。LSP 只返回指向同一符号的引用，因此过滤发生在 Claude 读取内容之前。要完成这项设置，需要为你的语言安装一个[代码智能 plugin](https://code.claude.com/docs/en/discover-plugins#code-intelligence)，以及对应的 language server binary；Claude Code 文档覆盖了可用 plugin 和故障排查方式。

**一个注意事项**：确实存在一些边界情况，即使分层 CLAUDE.md 方法也会失效，例如有数十万个文件夹、数百万个文件的代码库，或者使用非 Git 版本控制的遗留系统。我们会在本系列后续文章中讨论这些挑战。

### 随着模型智能演进，主动维护 CLAUDE.md 文件

随着模型演进，为当前模型编写的指令可能会反过来限制未来模型。过去帮助 Claude 理解某些模式的 CLAUDE.md 文件，在下一个模型发布后，可能变得不再必要，甚至开始形成约束。例如，一条要求 Claude 把每次重构拆成单文件变更的 CLAUDE.md 规则，可能曾经帮助早期模型保持方向，但会阻止新模型完成它本来能够处理好的协调式跨文件编辑。

为了弥补特定模型限制而构建的 skills 和 hooks，无论限制来自模型推理能力，还是来自 Claude Code 自身工具能力，一旦这些限制不再存在，就会变成额外负担。比如在 Perforce 代码库中，一个拦截文件写入以强制执行 `p4 edit` 的 hook，在 Claude Code 增加原生 Perforce 模式后就变得多余了。

团队应该预期每三到六个月做一次有意义的配置审查；如果在重大模型发布之后，性能感觉已经进入平台期，也值得专门做一次审查。

### 为 Claude Code 管理和采用指定 owner

仅靠技术配置并不能推动采用。真正做好的组织，也会投入组织层面的建设。

推广最快的团队，通常会在开放大范围访问前先进行专门的基础设施投入。一个小团队，有时甚至只是一个人，会先把工具链串好，让开发者第一次接触 Claude 时，它就已经能融入现有开发工作流。在一家公司，几位工程师构建了一整套 plugins 和 MCPs，并在第一天就对开发者可用。在另一家公司，一个完整团队专门负责管理 AI 编程工具，并在推广开始前把基础设施准备好。两种情况下，开发者的第一次体验都是有效率的，而不是令人受挫的，采用也因此扩散开来。

<figure><p><img alt="" src="https://cdn.prod.website-files.com/68a44d4040f98a4adf2207b6/6a04e25f1984beb50dc5525b_fig2-phases-of-claude-code-rollout-v1%402x.png" loading="lazy"></p></figure>

今天做这类工作的团队，通常位于 developer experience 或 developer productivity 组织下；这些职能通常负责新工程师 onboarding 和开发者工具建设。在一些组织中，一个新兴角色是 agent manager：一种混合 PM/工程师职能，专门管理 Claude Code 生态。对于没有专门团队的组织，最低可行版本是指定一个 DRI：由一个人拥有 Claude Code 配置的所有权，有权对设置、权限策略、plugin marketplace 和 CLAUDE.md 约定做决策，并负责让它们保持更新。

自下而上的采用会带来热情，但如果没有人集中整理有效实践，也很容易碎片化。你需要有个人或团队来组装并推广正确的 Claude Code 约定，例如标准化的 CLAUDE.md 层级，或者一组经过筛选的 skills 和 plugins。没有这项工作，知识会停留在小圈子里，采用也会进入平台期。

在大型组织中，尤其是在受监管行业，治理问题会很早出现，例如：谁控制哪些 skills 和 plugins 可用，如何避免数千名工程师各自重复构建同一套东西，如何确保 AI 生成代码经过和人类代码相同的审查流程。为了尽早处理这些问题，我们建议从一组已批准的 skills、必需的代码审查流程和受限的初始访问开始，随着信心建立再逐步扩大。

我们观察到，最顺畅的部署通常会很早建立跨职能工作组，把工程、信息安全和治理代表聚在一起，共同定义需求并制定推广路线图。

## 将这些模式应用到你的组织

Claude Code 围绕常规软件工程环境设计：工程师是代码库的主要贡献者，仓库使用 Git，代码遵循标准目录结构。大多数大型代码库符合这个模型，但也有一些非传统设置需要额外配置工作，例如包含大量二进制资产的游戏引擎、使用非常规版本控制的环境，或者由非工程师参与贡献的代码库。我们的建议假设的是常规设置，而本文描述的模式已经在许多客户中得到验证。剩余复杂性需要结合你的代码库、工具链和组织情况做判断。这也是 Anthropic Applied AI 团队会直接和工程团队合作的地方：把这些模式翻译成你所在组织的具体要求。

<figure><p><img alt="" src="https://cdn.prod.website-files.com/68a44d4040f98a4adf2207b6/6a04e2860abbe67418ca0f8b_fig3-getting-started-checklist-v2%402x.png" loading="lazy"></p></figure>

*从* [*Claude Code for Enterprise*](https://claude.com/product/claude-code/enterprise)*开始。*

‍

***致谢：*** *特别感谢 Anthropic Applied AI 团队的 Alon Krifcher、Charmaine Lee、Chris Concannon、Harsh Patel、Henrique Savelli、Jason Schwartz、Jonah Dueck 和 Kirby Kohlmorgen 分享他们大规模部署 Claude Code 的经验，也感谢 Zoox 的 Amit Navindgi 对本文提供反馈。*

‍
