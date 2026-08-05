---
title: 我们重写了智能体：借助 Pi、Agents SDK 和 Code Mode，让它完全运行在 Durable Object 中
date: '2026-08-05T02:02:58.973Z'
sourceUrl: >-
  https://x.com/Vercantez/status/2082138839888589200?s=12&t=oDjsBy-f-VCdrYC6Q655dA
lang: zh
---
最近，我们完成了 camelAI 智能体脱离虚拟机的迁移。现在，智能体运行在 [Cloudflare Durable Object](https://developers.cloudflare.com/durable-objects/) 中，文件系统位于 SQLite 和 R2，而它编写的是 JavaScript，不再是 bash。大多数团队会把编程智能体运行在完整的 Linux VM 或容器沙箱中，我们过去也是如此。

我们想摆脱 VM，是因为为每位用户提供一台带挂载磁盘、常驻运行的机器，扩展成本实在太高。难点在于，编程智能体默认自己身处 Linux 环境：训练让它们习惯使用 bash，而我们上线时采用的运行框架也要求完整 VM。为了走到今天，我们先后进行了三次重新设计。代价是，智能体现在只能完成我们已为其构建显式方法的任务。这听起来像是一种限制，但实际上对产品很有帮助。

我是 camelAI 的 CTO Miguel。我们的代码库最近已经开源，因此本文涉及的所有代码都可以在 [github.com/qaml-ai/camelAI](https://github.com/qaml-ai/camelAI) 查看。接下来我会随文章进展链接到相关文件。以下是整个演进过程。

## 第零步：VM 时代

我们最初基于 Claude Code 运行框架上线，而它需要完整的虚拟机才能运行。我们试过多家 VM 服务商，但没有一家能满足我们的持久化和性能要求，最终只好[自建容器服务](https://camelai.com/blog/we-tried-every-container-service-then-built-our-own)。那篇文章仍然在线，但其中的基础设施我们已经全部停用了。

容器服务可以正常工作，却过于笨重。为每位用户维持一台常驻 VM 很昂贵，把每位用户的文件保存在高速挂载磁盘上同样如此。要扩展这套架构，就得扩展真实的机器和真实的磁盘；按照我们的目标用户规模，成本将高得难以承受。因此，我们没有继续钻研更精巧的 VM 编排，而是开始围绕“完全不需要 VM”来设计系统。

## 第一步：把智能体移出 VM

Claude Code 运行框架与 VM 无法分离，所以第一步是构建自己的运行框架。我们以 Mario Zechner 的开源编程智能体 [pi](https://github.com/badlogic/pi-mono) 为基础。pi 是一套分层的库：最上层假定它运行在常规操作系统中，但较低层提供了智能体循环、状态管理等智能体原语，并不关心具体运行环境。我们没有修改任何 pi 代码，而是引入这些较低层的库，在其上构建了[自己的运行框架](https://github.com/qaml-ai/camelAI/blob/main/workers/main/src/chat-thread-do.ts)，让它运行在 Cloudflare Durable Object 而非 Linux 环境中。

Durable Object 是一个小型、有状态的计算实例，会在 Cloudflare 边缘、靠近创建它的用户之处启动。每个聊天线程都有自己的 Durable Object。仅这一改变就降低了延迟，因为不必再把所有请求路由到集中的 VM 主机。

这个阶段我们仍然保留 VM，但智能体不再住在 VM 里面。需要运行命令时，它会远程调用 VM。Anthropic 在介绍其托管智能体时，也把这种拆分描述为“大脑与双手分离”。它为我们带来了一些很好的特性：

- 智能体无需等待机器启动，因此在 VM 唤醒之前就能开始响应。
- 智能体继续工作时，VM 可以重新休眠；如果当前这一轮不需要运行任何命令，VM 甚至完全不必唤醒。
- 一个“大脑”可以控制多双“手”。单个智能体能够同时操作多台 VM。

我们把这些“双手”称为项目。每个项目都配有一台用于执行命令的 VM，以及一个通过 [Cloudflare Artifacts](https://developers.cloudflare.com/artifacts/) 以编程方式创建的 git 仓库。Artifacts 是兼容 git 的存储，可以从 Worker 中即时配置。智能体其实并不知道自己运行在 VM 之外：它仍然可以使用 bash，工作方式与其他编程智能体没有区别。

问题在于，这一改动只解决了延迟，其他问题都没有解决。每位用户仍对应一台 VM，因此原有设计的成本和扩展问题也依然存在。

## 第二步：移除 VM

下一个版本保留了相同的项目结构，但移除了背后的 VM。如今，每个项目均由[位于 Durable Object 中的文件系统](https://github.com/qaml-ai/camelAI/blob/main/workers/main/src/workspace-filesystem-do.ts)提供支持，较大的文件则存放在后端的 [R2](https://developers.cloudflare.com/r2/) 中。

这并不是我们的原创。Cloudflare 的 agents 团队构建了 [Shell](https://www.npmjs.com/package/@cloudflare/shell)，这是一套面向 Workers 的实验性文件系统和执行运行时；我们大量复用了他们的代码。其机制很简单：Durable Object 的存储是一个上限为 10 GB 的 SQLite 数据库，每一行也有大小上限。小文件直接存入 SQLite 的行中；大约超过 1.5 MB 的文件则写入 R2，SQLite 行里只保存一个指针。对智能体而言，它看起来就像普通文件系统；但在底层，它其实是数据库加对象存储。因此，持久性来自已保存的数据，而不是一套必须由我们持续维持运行的基础设施。

版本历史仍由 Artifacts 管理，所以每个项目都能保留 git 历史，而我们无需托管 git 服务器。

## 第三步：移除 bash

移除 bash 感觉是一项激进的决定。编程智能体在训练中形成了使用 bash 的习惯，而 bash 也正是所有人首先选择在 VM 中运行智能体的原因。除了成本，它还带来了另一个问题：拥有 bash 和网络访问权限的智能体，需要凭据才能完成任何有用的工作；我们尝试过带身份验证的代理 URL，但方案越来越取巧，也越来越难以强制落实。

于是，我们移除了 bash。智能体现在改写 JavaScript，并通过 [Code Mode](https://blog.cloudflare.com/code-mode/) 和 Cloudflare 的 [dynamic Worker loaders](https://blog.cloudflare.com/dynamic-workers) 执行。每次执行都在一个全新的 V8 isolate 中运行；它能在几毫秒内启动，只占用数 MB 内存。沙箱会预加载用户的数据连接，以及[覆盖平台全部能力的方法](https://github.com/qaml-ai/camelAI/blob/main/workers/main/src/code-mode-tools.ts)。凭据从不进入沙箱。智能体调用连接提供的方法，身份验证则在我们这一侧完成。

仔细看看智能体实际用 bash 做什么，你会发现放弃它的代价比想象中更低。绝大多数操作都与文件有关，而智能体已经拥有相应的原生工具。我们为它提供读取、写入和编辑工具，再加上自己实现的 [grep 和 glob](https://github.com/qaml-ai/camelAI/blob/main/workers/main/src/pi-container-tools.ts)，这就覆盖了 80/20 原则中的大头。剩下的是针对特定任务的特定命令，我们把它们改造成了显式方法：

- 过去通过代理执行的 `wrangler deploy`，变成了完全由我们控制的 `deploy_project` 方法。由于现在能准确知道部署何时发生，我们可以挂接这一事件并自动打开实时预览。过去，我们不得不嗅探代理转发的 wrangler 流量，猜测是哪个线程部署了内容。
- 构建用户应用和运行 Python Notebook 也各自成为独立方法，底层均由短生命周期容器支持。

这两类任务确实需要 Linux，所以我们保留了容器。用户应用使用 Vite、Tailwind 和 React Router 构建，而添加依赖意味着必须运行 `bun install`。我们考虑过在 Worker 内完成构建，因为要构建的应用本身就是 Worker；但这一方式并没有得到良好支持，而且 Workers 只有 128 MB 内存和很少一部分 CPU。构建会很慢，许多项目也会轻易超过内存上限。因此，每次构建会通过 [Cloudflare Sandbox SDK](https://github.com/cloudflare/sandbox-sdk) 启动一个容器，把项目复制进去、执行任务、返回结果，然后关闭容器。运行 Notebook 的方式也一样。我们仍然使用完整的 Linux，但只在确实需要它的那几秒钟里使用。

坦率地说，这一方案的缺点是我们必须预判智能体需要什么。拥有 bash 时，它可以自行想办法解决问题；现在，如果缺少某项能力，就必须由我们添加。实际使用中，这种压力反而改善了产品，因为它迫使我们认真思考用户正在做什么，并为其构建一流的正式路径，而不是任由智能体临场发挥。

我们还获得了一项意外收益。Bash 是开放式的，而低成本模型在开放式环境中的表现并不好。改用一组更小、更明确的显式方法后，它们的表现明显改善。这一点很重要，因为让 camelAI 保持低运行成本，正是这套架构存在的意义。

## 最终架构

如今，这套技术栈使用 Durable Objects 承载智能体及其文件系统，R2 存放大文件，Artifacts 保存 git 历史，pi 充当运行框架，再通过 Code Mode 和 dynamic Workers 执行代码。它像其他 Cloudflare 应用一样部署，不需要管理任何外部容器服务。

Dynamic Workers 按执行次数计费，而不是按运行时长计费。数千次执行的成本，大致相当于我们评估过的那些服务运行几分钟容器的费用。由于一切都运行在靠近用户的边缘，延迟很低；扩展也成了 Cloudflare 的问题，而不是我们的问题。

用户仍然可以构建全栈应用并将其部署到公开 URL，智能体也仍然能够读取、写入、grep 和部署。从用户的角度来看，一切都没有改变。

## TL;DR

最初，我们在自建 VM 服务上运行 Claude Code 运行框架，成本高昂且难以扩展。第一步，我们把智能体本身移入 Cloudflare Durable Object，让它远程控制 VM；这解决了延迟，却没有解决成本。随后，我们彻底用存储在 Durable Object SQLite 和 R2 中的文件系统取代 VM。该文件系统基于 Cloudflare 的 Shell 项目，git 历史则由 Cloudflare Artifacts 保存。最后，我们移除 bash，通过 Code Mode 和 dynamic Workers 为智能体提供 JavaScript 沙箱，并为部署、构建和 Notebook 设置显式方法。最终结果是：成本降低几个数量级，延迟更低，运维更简单，也更易于让较小的模型操控。全部代码均已在 [github.com/qaml-ai/camelAI](https://github.com/qaml-ai/camelAI) 开源。
