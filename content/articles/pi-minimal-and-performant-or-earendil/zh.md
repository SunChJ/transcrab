---
title: Pi：极简而高效
date: '2026-08-06T02:06:22.346Z'
sourceUrl: 'https://earendil.com/posts/pi-autoresearch-and-databricks/'
lang: zh
---
## Pi 的极简主义正是它的优势

AI 让编写代码变得廉价，因此许多公司开始打造越来越庞大的工具，以追求更好的性能：更长的提示词、更多的编排、更厚的层次，以及更高的复杂度。这也让这些工具的使用成本天然更高。Pi 选择了相反的方向。

Pi 是一套有意选择极简主义的编码智能体运行框架。它开箱即用时只有 4 个工具，[系统提示词](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/src/core/system-prompt.ts#L121-L159)和工具定义加起来不到 1,000 个 token。它背后的思路是：大多数工作靠基础能力就能完成；如果你还需要别的，就自己构建。

越来越多的证据表明，Pi 的设计不仅更简洁，也更便宜、性能更好。用户发现，即使还没有加入针对个人工作流和需求的扩展，原生 Pi 也能取得业内领先的结果。正如下面 Databricks 和 Shopify 的案例所示，Pi 为两家公司都带来了理想的结果。

## 案例研究

### **Databricks 研究：每项任务的成本**

Databricks 最近分享了他们的研究结果——《[*在 Databricks 数百万行代码库上对编码智能体进行基准测试*](https://www.databricks.com/blog/benchmarking-coding-agents-databricks-multi-million-line-codebase)》。这项研究旨在了解：哪些编码智能体在真实编码任务上表现最好，以及任务表现会如何随价格变化。

为了避免受到那些[已经过度饱和的外部基准测试](https://arxiv.org/html/2602.16763v3)的偏差影响，他们根据团队工程师日常执行的任务创建了自己的基准。结果符合我们的预期，但业内许多人可能会感到意外。用他们的话说：“……调用模型所使用的运行框架，会显著影响成本和质量”；而且，“在许多情况下，Pi 这样的简单运行框架在我们的工作负载上表现最好。”

<figure><img src="https://earendil.com/static/posts/pi-autoresearch-and-databricks/databricks-cost-per-task.png" srcset="https://earendil.com/static/posts/pi-autoresearch-and-databricks/databricks-cost-per-task.png 800w, https://earendil.com/static/posts/pi-autoresearch-and-databricks/databricks-cost-per-task@2x.png 1600w" sizes="(max-width: 520px) calc(100vw - 56px), (max-width: 800px) calc(100vw - 80px), 760px" alt="Databricks 基准图表，对比编码智能体的通过率和每项任务成本。" loading="lazy" decoding="async"><figcaption>图表由 Databricks 制作。</figcaption></figure>

当与 Opus 4.8 和 xhigh 推理强度结合使用时，Pi 的整体通过率最高，同时成本显著低于 Claude Code 和 Codex。

#### 极简运行框架，效果可衡量

Pi 的优势在于，它不会用大量默认设置和指令包裹模型，让这些内容淹没在[指令层级](https://openai.com/index/the-instruction-hierarchy/)之中。相反，Pi 不会妨碍模型发挥，团队则可以加入自己的工作流真正需要的东西。

Databricks 的研究很有启发性，因为它将模型与运行框架拆开来考察。

他们报告称，使用不同的运行框架，以相同的推理强度运行同一个模型时，“每项任务的成本差异显著（有时超过 2 倍），而质量保持不变”。我们把这称为 Pi 的“上下文纪律”。“Pi 每轮发送的上下文大约少 3 倍。它能更好地管理上下文，维持更紧凑的工作集，并用更少的运行轮次完成任务。”

我们认同，评估时必须考虑端到端的工程经济性，而不只是每个 token 的价格。模型层面同样如此：例如，我们观察到，在 Haiku 4.5 上运行复杂工作流，成本往往高于 Sonnet 4.6，尤其是涉及代码执行时。原因很简单：智能体需要更多轮次才能成功完成任务。

如今，我们也在运行框架层面看到了同样的现象：更强、更昂贵的模型搭配高效的运行框架，反而可能比相反的组合更便宜。

### **Shopify 构建 Pi Autoresearch：可扩展胜过臃肿**

极简主义是 Pi 核心理念的一部分。它之所以行得通，是因为“极简”并不等于“不灵活”。事实上，Pi 是第一套为可扩展性和自我编辑而生、并得到广泛使用的智能体基础设施。

Shopify 提供了另一个很有启发性的外部验证。在这篇 [Shopify Engineering 文章](https://shopify.engineering/autoresearch)中，David Cortés 介绍了如何直接把 `pi-autoresearch` 构建为 Pi 扩展：他只是让 Pi“为 Autoresearch 创建一个扩展……”。Pi 会阅读自己的扩展文档，并以此为起点构建新的工作流。

Autoresearch 是一个利用编码智能体进行优化的自主循环。当你提出一项修改时，它会运行实验，找出哪些改动有效、哪些会导致回归。只要优化目标可以衡量，它就能丢弃造成回归的改动，并持续自我改进。

对 Shopify [以及其他团队](https://x.com/pidotdev/status/2080616483072225778?s=20)来说，Autoresearch 扩展很快就成为了重要的内部生产力工具。Shopify 报告的案例包括：单元测试运行速度“达到原来的 300 倍”、React 组件挂载速度“提高 20%”、多个项目的构建时间缩短，甚至连 pnpm 的性能也有所改善。

<figure><img src="https://earendil.com/static/posts/pi-autoresearch-and-databricks/shopify-autoresearch.png" srcset="https://earendil.com/static/posts/pi-autoresearch-and-databricks/shopify-autoresearch.png 800w, https://earendil.com/static/posts/pi-autoresearch-and-databricks/shopify-autoresearch@2x.png 1600w" sizes="(max-width: 520px) calc(100vw - 56px), (max-width: 800px) calc(100vw - 80px), 760px" alt="Shopify 的 pi-autoresearch GitHub 仓库截图。" loading="lazy" decoding="async"><figcaption>图片来自 Shopify 的 <a href="https://github.com/davebcn87/pi-autoresearch">pi-autoresearch GitHub 仓库</a>。</figcaption></figure>

这里的重点是：Pi 并没有开箱即用地提供这些工具。它做的是让你能够极其轻松地自行构建它们。Pi 不会假设供应商比你更懂自己的工作流，然后试图塞进世上所有的工具；它相信最了解需求的人是你，并把扩展能力交给你，让你能够塑造自己的工作流。

## 为什么极简主义如今更有优势

大约一年前，人们还可以主张，原生运行框架相对其他方案具有结构性优势，因为模型就是围绕它们构建的。但如今，这一论点已经越来越站不住脚。

现在的前沿模型通常都很擅长理解终端或终端式编码环境，并在其中采取行动。[Anthropic 最近将 Claude Code 的系统提示词缩短了 80%](https://x.com/petergyang/status/2078895219534438556?s=20)，就是一个明显信号。因此，问题正逐渐不再是运行框架有多“原生”，而是它如何管理上下文、避免冗余，并通过简洁的原语采取行动。模型需要一个干净的环境接口，也需要一套不浪费上下文的运行框架。

Pi 提供的正是这些：更少的提示词开销和重复上下文、更低的运行成本，以及更少的不必要抽象。由于它具备扩展能力，你不会因此失去功能，反而能获得选择权。只有当复杂性确实“值得”时，你才把它加入进来。

我们也看到本地模型正在快速发展，而 [Earendil](https://earendil.com/) 对它们的前景十分看好。Pi 的上下文纪律在这里尤其有价值。本地模型的上下文窗口通常更小，[预填充](https://earendil.com/posts/prompt-caching/)也可能耗时很久，因此保持稳定的提示词前缀非常重要。上下文纪律意味着：除非用户明确要求，否则我们不会改变上下文，从而避免再次预填充耗费数分钟。再加上默认系统提示词和工具集都极为精简，Pi 因而成为本地模型的理想运行框架。

Pi 正在证明，它可以兼顾这一切：更便宜、更精简，也更高效。
