---
title: 你的智能体需要的是计算机，而不是容器——推出 @cloudflare/computer
date: '2026-08-06T02:06:26.619Z'
sourceUrl: 'https://blog.cloudflare.com/cloudflare-computer/'
lang: zh
---
能力最强的智能体都有一个简单的共同点：它们拥有一台属于自己的计算机来完成工作。

编码智能体正是这样工作的。你为它们提供文件系统、shell、工具、软件包，以及运行代码的能力。它们检查环境、进行修改、测试成果，然后继续推进。计算机为模型提供了一种熟悉的方式，让它能够对现实世界采取行动。在 Cloudflare，我们正在努力提供合适的基础原语，用于构建能力最强的智能体。

**今天，我们推出 [@cloudflare/computer](https://github.com/cloudflare/workspace) 的早期预览版。** @cloudflare/computer 软件包提供了一套智能体运行时：代码究竟运行在 isolate、容器沙箱还是 Web 浏览器中，相关细节和机制都由平台负责处理。每个智能体都会获得一台“计算机”，而运行时则针对效率和可扩展性进行优化。

我们认为，要满足智能体系统不断增长的计算需求，就必须寻找超越传统容器化的解决方案。

## 智能体的构建方式正在改变

过去六个月里，我们看到这条路线发生了细微但重要的演变。今年年初，启动一个容器并在其中运行智能体还是常见做法。最近几个月，智能体运行框架开始迅速转向通过工具提供沙箱化的代码执行。这把“手”（实际完成工作的沙箱）与“脑”（智能体循环）分离开来。

<figure><p><img src="https://blog.cloudflare.com/_image?href=https%3A%2F%2Fblog.cloudflare.com%2F_emdash%2Fapi%2Fmedia%2Ffile%2F01KZ0QHGR1F725Y45HAYQ7EP4V.png&amp;w=715&amp;h=292&amp;f=webp&amp;fit=cover&amp;position=center" alt="BLOG-3464_image6.png"></p></figure>

无论运行框架位于何处，为每个智能体分配一个容器都会带来挑战：纵观所有云平台和超大规模云服务商，全世界的计算资源远不足以让每家公司都为每位用户的每个智能体提供独立的容器化计算环境。这种模式无法扩展到数亿乃至数十亿个并发智能体。这正是为什么业界如今不仅迫切需要 GPU 算力，也对 CPU 算力产生了近乎恐慌的需求。

Cloudflare 长期以来一直在解决这个问题，并为此打造了一种更高效的计算原语：isolate。近十年前，我们[推出 Cloudflare Workers](https://blog.cloudflare.com/introducing-cloudflare-workers/) 时，就做出了这个当时并非行业共识的选择；近六年前[推出 Durable Objects](https://blog.cloudflare.com/introducing-workers-durable-objects/) 时，我们再次押注于此。我们之所以这样做，是因为 isolate 能够近乎无限地横向扩展。它们可以极快地启动和销毁；智能体空闲时可以[休眠](https://developers.cloudflare.com/durable-objects/examples/websocket-hibernation-server/)，可以[存储智能体自身的状态](https://blog.cloudflare.com/sqlite-in-durable-objects/)，甚至可以[启动自己的 isolate](https://blog.cloudflare.com/dynamic-workers/)来运行不受信任的代码。isolate 是实现横向扩展的最佳方式，而智能体需要的正是横向扩展。

<figure><p><img src="https://blog.cloudflare.com/_image?href=https%3A%2F%2Fblog.cloudflare.com%2F_emdash%2Fapi%2Fmedia%2Ffile%2F01KZ0QHG8112R261JGEK5515Y7.png&amp;w=715&amp;h=683&amp;f=webp&amp;fit=cover&amp;position=center" alt="BLOG-3464_image3.png"></p></figure>

去年，我们[让 isolate 获得了启动自有容器沙箱的能力](https://blog.cloudflare.com/containers-are-available-in-public-beta-for-simple-global-and-programmable/)。从第一天起，Cloudflare 的架构就被设计成：在 isolate（也就是 Durable Object）中运行智能体运行框架，并在需要时把挂接的容器作为工具调用。这样一来，只有真正需要时才会使用更重型的计算原语，从而优化性能与成本。Durable Objects 可以近乎无限地横向扩展，挂接的容器则让它能够纵向扩展，以执行任何任务。我们自己就是这样构建智能体的，也看到客户用这种方式打造出了令人惊叹的产品。

<figure><p><img src="https://blog.cloudflare.com/_image?href=https%3A%2F%2Fblog.cloudflare.com%2F_emdash%2Fapi%2Fmedia%2Ffile%2F01KZ0QHGJWE4D64HEZPZ1PMCAN.png&amp;w=715&amp;h=352&amp;f=webp&amp;fit=cover&amp;position=center" alt="BLOG-3464_image8.png"></p></figure>

不过，构建智能体需要多种底层计算原语（isolate 和容器），还要让客户与开发者在用户空间自行组合它们。审视这种现状后，我们认为还可以做得更好：提供一层更简单的抽象。

因此，我们先把 @cloudflare/computer 作为开源库推出，开启这项实验，并与那些正在挑战大规模智能体运行极限的客户一起学习。

## 在 isolate 与容器之间共享文件系统

@cloudflare/computer 软件包从一个简单的设想出发：如果我们为智能体提供一个预先准备好、以声明式方式定义的文件系统，其中包含当前任务所需的一切；同时再提供多种可以操作这些文件的执行环境，每种环境在速度、能力和成本上各有优劣，会怎样？

事实证明，如今的智能体非常善于为当前任务选择正确的环境。只需操作文件、处理数据或管理 git 仓库的工作，可以在 isolate 中运行；需要 Linux、`npm` 或原生二进制文件的命令，则可以在容器中运行。两种环境操作的是同一批文件，这些文件会与源文件系统保持同步。

<figure><p><img src="https://blog.cloudflare.com/_image?href=https%3A%2F%2Fblog.cloudflare.com%2F_emdash%2Fapi%2Fmedia%2Ffile%2F01KZ0QHGH4NAWXAMWKSJ5JDMQY.png&amp;w=715&amp;h=645&amp;f=webp&amp;fit=cover&amp;position=center" alt="BLOG-3464_image2.png"></p></figure>

@cloudflare/computer 软件包提供一个持久化文件系统，可与 git 仓库、存储桶或你选择的任何文件配合使用。它还提供工具，让你可以通过 [Code Mode](https://blog.cloudflare.com/code-mode/) 或 bash 命令读取、写入和编辑文件。所有操作都会经过权限控制、审计和观测：你既能细粒度控制智能体可以执行哪些更改，也能得到一条清晰的审计轨迹，了解智能体做过什么。

## 如何使用

你可以在任何 Durable Object 上实例化一个 @cloudflare/computer Workspace，从而获得虚拟文件系统和执行运行时。

通过 npm 安装：

```
npm install @cloudflare/computer
```

它的主要用例，是为智能体提供这套文件系统和工具。例如，下面展示了如何在一个由 @cloudflare/think 驱动、用于分流和处理错误报告的智能体上实例化 Workspace。

```typescript
import { Think } from "@cloudflare/think";
import { Workspace, type DurableObjectStorageLike } from "@cloudflare/computer";
import { createWorkersAI } from "workers-ai-provider";

export class Agent extends Think {
  override workspaceBash = false;

  override workspace = new Workspace({
    storage: this.ctx.storage,
    useThink: true, // soon will not be needed
  });

  override getModel() {
    return createWorkersAI({ binding: this.env.AI })("@cf/zai-org/glm-5.2");
  }

  override getSystemPrompt() {
    return `
You are a bug triage agent.

Use the project in /workspace/repo to reproduce the bug, inspect the
code, make a focused fix when it is safe, and run verification. In your
final answer, include what you changed, which commands you ran, and
whether verification passed.`;
  }
}
```

@cloudflare/computer 软件包内置了多种执行后端，你也可以编写自己的后端。这里我们接入一个 Cloudflare Container。

```
import { Think } from "@cloudflare/think";
import { Workspace, WorkspaceProxy } from "@cloudflare/computer";
import {
  CloudflareContainerBackend,
  withWorkspaceContainer,
} from "@cloudflare/computer/backends/container";

export { WorkspaceProxy };

export class Agent extends withWorkspaceContainer(Think) {
  override workspaceBash = false;

  override workspace = new Workspace({
    storage: this.ctx.storage,
    useThink: true, // soon will not be needed
    backends: [
      new CloudflareContainerBackend({
        container: () => this,
        workspace: {
          binding: "Agent",
          id: this.ctx.id.toString(),
        },
      }),
    ],
  });

  /* Example code truncated for readability... */
}
```

你可以在用于回复所报告问题的产品专用工具旁，同时向智能体开放文件、git 和 shell 工具。

```
import { createAITools } from "@cloudflare/computer/tools";
import type { ToolSet } from "ai";
import { replyToIssue } from "./tools/github";

export class Agent extends withWorkspaceContainer(Think) {
  override workspaceBash = false;

  /* Example code truncated for readability... */

  override getTools(): ToolSet {
    return {
      ...createAITools({
        workspace: this.workspace,
        shell: {
          defaultBackend: "container",
          backends: {
            container: {
              description:
                "Cloudflare Container with a full Linux userland: " +
                "npm, node, package managers, test runners, and real " +
                "binaries on $PATH. Use it when a task needs more than " +
                "file manipulation.",
            },
          },
        },
      }),
      replyToIssue,
    };
  }
}
```

模型可以在智能体循环中使用工具，但你也可以直接使用 Workspace API，例如在向智能体发送提示词之前准备好环境。

```
export class Agent extends withWorkspaceContainer(Think) {
  override workspaceBash = false;

  /* Example code truncated for readability... */

  async startTriage(report: { title: string; body: string; repoUrl: string }) {
    await this.workspace.fs.mkdir("/workspace", { recursive: true });
    await this.workspace.fs.writeFile(
      "/workspace/BUG_REPORT.md",
      `# ${report.title}\n\n${report.body}\n`,
    );

    await this.workspace.git.clone({
      url: report.repoUrl,
      dir: "/workspace/repo",
    });

    return this.submitMessages([
      {
        id: crypto.randomUUID(),
        role: "user",
        parts: [
          {
            type: "text",
            text: [
              `Triage this bug: ${report.title}`,
              "The bug report is in /workspace/BUG_REPORT.md.",
              "The repository is checked out at /workspace/repo.",
            ].join("\n"),
          },
        ],
      },
    ]);
  }
}
```

你可以查看 [Workspace 仓库](https://github.com/cloudflare/computer)，了解使用不同后端和工具的更多示例；其中还有一份[分步教程](https://github.com/cloudflare/computer/tree/main/examples/tutorial)，会带你从零开始构建智能体。

## 工作原理

@cloudflare/computer 的核心是 Workspace：一个以 SQLite 为后端的虚拟文件系统，可以从云存储、版本控制等多种来源填充内容。

<figure><p><img src="https://blog.cloudflare.com/_image?href=https%3A%2F%2Fblog.cloudflare.com%2F_emdash%2Fapi%2Fmedia%2Ffile%2F01KZ0QHH01B75YXB0CMQ395YW3.png&amp;w=715&amp;h=393&amp;f=webp&amp;fit=cover&amp;position=center" alt="BLOG-3464_image7.png"></p></figure>

Workspace 支持可选的执行运行时，让代码能够针对这个文件系统运行。所有运行时都支持同一套 `exec(string, options)` 接口，目前开箱即用地提供两种（当然，你也可以自行编写）：

* 基于 isolate 的运行时环境：它使用 [just-bash](https://justbash.dev/) 将 shell 代码转换为 JavaScript，并在 [dynamic worker](https://developers.cloudflare.com/dynamic-workers/) 中运行。文件系统在这里可以通过 Worker bindings 直接访问。
* 容器运行时：它使用 [Cloudflare Containers](https://developers.cloudflare.com/containers/) 提供完整的 Linux 环境。文件系统通过用户空间文件系统（FUSE）挂载提供，确保容器可以访问文件，并将更改同步回来。

`Workspace` 类既提供直接操作文件系统的 API 接口，也提供兼容 `node:fs` 的封装，因此可以轻松配合第三方 JavaScript 库使用。

<figure><p><img src="https://blog.cloudflare.com/_image?href=https%3A%2F%2Fblog.cloudflare.com%2F_emdash%2Fapi%2Fmedia%2Ffile%2F01KZ4CFYR52H8M9DBZFH552T63.png&amp;w=715&amp;h=456&amp;f=webp&amp;fit=cover&amp;position=center" alt="image4.png"></p></figure>

为了配合智能体使用，我们提供了一套兼容 AI SDK 的工具集，包含最常用的工具：read、write、edit、ls 和 exec。exec 工具有些特殊，它通过一个 `backend` 参数跨运行时工作。工具描述会引导智能体为当前任务选择正确的运行时：要么是快速、低成本的 Worker 后端，要么是功能完整的容器。在我们的测试中，前沿模型非常善于做出正确选择，只在确有需要时才回退到容器。

## 接下来

在 Cloudflare，我们已经看到智能体完全依靠 isolate 来构建、测试和部署采用现代工具链的 JavaScript 应用，为每位客户生成量身定制的文档，以及使用 Web 浏览器执行复杂任务。

我们对 @cloudflare/computer 的目标，是为智能体提供这样一种运行时：只有不到 10% 的工作需要容器，而编码任务、音视频处理和文档创建都可以由 isolate 完成。

立即试用[早期预览版](https://github.com/cloudflare/computer)吧——我们迫不及待想听到你的反馈。
