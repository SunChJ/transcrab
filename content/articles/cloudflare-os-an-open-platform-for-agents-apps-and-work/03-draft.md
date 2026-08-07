# Cloudflare OS：面向智能体、应用与工作的开放平台

每个组织都有自己的使命，一个存在的理由。组织会把使命连同其术语、流程、系统、标准和行事方式传递给员工。而员工则会把这些背景信息与自己的经验结合起来，朝着使命努力。

工作可以有多种形式：从代码，到文档和幻灯片，到人际关系，再到现实世界中的成果。

其中有些是直截了当的：代码要么能跑，要么不能跑。过去几年里，智能体一直在利用这个反馈循环，为开发者产出“能跑”的代码。但我们其他人呢？

把同样的杠杆带给组织的其他部分，是个更困难的问题。智能体需要理解公司的背景，并且能够触达员工用来完成工作的系统。它们需要把这些背景和访问权转化为推动组织迈向使命的工作。

这就是我们创建 Cloudflare OS 的原因。它为每个人提供一个围绕其公司构建的智能体和工作区：公司如何运作、公司知道什么、公司依赖哪些系统。

今年五月，我们让 Cloudflare 的每个人都用上了第一版 Cloudflare OS。各个职能部门的数千人——其中许多并非工程背景——每天都在用它创建文档和幻灯片、自动化重复性任务，以及构建小型应用来可视化数据、辅助工作。

Cloudflare OS 还让每个人都能共享由 Cloudflare 各团队构建的背景知识和技能库。它把我们的术语、流程以及完成重复性工作的最佳实践，捕获为智能体可以遵循的指令。当一个人琢磨出更好的做事方法时，其他所有人都能用上。

**今天，我们开源了新版 [Cloudflare OS](https://os.cloudflare.app/)。** 任何组织都可以部署它、把它接入内部系统，并让它成为自己的平台。

## 我们从第一版中学到了什么

我们今天开源的 Cloudflare OS，建立在内部运行第一版时学到的经验之上。这段历程由我们的 CIO Sam Rhea 在他的[博文](https://blog.cloudflare.com/how-we-use-ai-with-cloudflare-os)中详述。

第一版围绕个人通过私有工作区与智能体协作展开。应用是静态的，而不是连接到内部系统的实时软件；而且大多是确定性的任务，仍然需要再次运行智能体技能并消耗更多模型 token。

协作暴露了一个更根本的挑战。访问 [MCP server](https://www.cloudflare.com/learning/ai/what-is-model-context-protocol-mcp/) 告诉我们智能体可以调用哪些工具，但并不能告诉我们智能体观察到了哪些底层资源。一旦人们开始共享工作区、应用和产出物，我们就必须确保协作不会暴露某个人本无权查看的信息。

我们在新的基础上重建了 Cloudflare OS 来解决这些问题。安全必须是平台的一部分，而不是每个构建应用或使用智能体的人都必须正确实现的东西。

结果就是一个为运行它的公司而生的平台。你可以定制界面、接入你的工具、添加能够捕捉你所在组织运作方式的技能和背景知识。

## 认识 Cloudflare OS

和许多其他 AI 工具一样，Cloudflare OS 从你在浏览器里的一次对话开始。它的不同之处在于，每一次对话都扎根于你的组织精心沉淀的背景知识和技能。给工作区一个目标，它就能利用这些知识，与你所在组织已经在用的工具和数据一起协作，达成目标。

<figure data-astro-cid-7nvefuv6=""><p><img src="https://blog.cloudflare.com/_image?href=https%3A%2F%2Fblog.cloudflare.com%2F_emdash%2Fapi%2Fmedia%2Ffile%2F01KZ7PDY68A0TND85MN4AZCF3G.png&amp;w=715&amp;h=477&amp;f=webp&amp;fit=cover&amp;position=center" srcset="https://blog.cloudflare.com/_image?href=https%3A%2F%2Fblog.cloudflare.com%2F_emdash%2Fapi%2Fmedia%2Ffile%2F01KZ7PDY68A0TND85MN4AZCF3G.png&amp;w=640&amp;h=427&amp;f=webp&amp;fit=cover&amp;position=center 640w, https://blog.cloudflare.com/_image?href=https%3A%2F%2Fblog.cloudflare.com%2F_emdash%2Fapi%2Fmedia%2Ffile%2F01KZ7PDY68A0TND85MN4AZCF3G.png&amp;w=715&amp;h=477&amp;f=webp&amp;fit=cover&amp;position=center 715w, https://blog.cloudflare.com/_image?href=https%3A%2F%2Fblog.cloudflare.com%2F_emdash%2Fapi%2Fmedia%2Ffile%2F01KZ7PDY68A0TND85MN4AZCF3G.png&amp;w=750&amp;h=500&amp;f=webp&amp;fit=cover&amp;position=center 750w, https://blog.cloudflare.com/_image?href=https%3A%2F%2Fblog.cloudflare.com%2F_emdash%2Fapi%2Fmedia%2Ffile%2F01KZ7PDY68A0TND85MN4AZCF3G.png&amp;w=828&amp;h=552&amp;f=webp&amp;fit=cover&amp;position=center 828w, https://blog.cloudflare.com/_image?href=https%3A%2F%2Fblog.cloudflare.com%2F_emdash%2Fapi%2Fmedia%2Ffile%2F01KZ7PDY68A0TND85MN4AZCF3G.png&amp;w=1080&amp;h=721&amp;f=webp&amp;fit=cover&amp;position=center 1080w, https://blog.cloudflare.com/_image?href=https%3A%2F%2Fblog.cloudflare.com%2F_emdash%2Fapi%2Fmedia%2Ffile%2F01KZ7PDY68A0TND85MN4AZCF3G.png&amp;w=1280&amp;h=854&amp;f=webp&amp;fit=cover&amp;position=center 1280w, https://blog.cloudflare.com/_image?href=https%3A%2F%2Fblog.cloudflare.com%2F_emdash%2Fapi%2Fmedia%2Ffile%2F01KZ7PDY68A0TND85MN4AZCF3G.png&amp;w=1430&amp;h=954&amp;f=webp&amp;fit=cover&amp;position=center 1430w" alt="BLOG-3379 2.png" loading="lazy" decoding="async" data-image-placeholder-media="true" data-lightbox-src="/_image?href=https%3A%2F%2Fblog.cloudflare.com%2F_emdash%2Fapi%2Fmedia%2Ffile%2F01KZ7PDY68A0TND85MN4AZCF3G.png&amp;w=1536&amp;h=1024&amp;f=webp" data-lightbox-width="1536" data-lightbox-height="1024" data-astro-cid-7nvefuv6="true" sizes="(min-width: 715px) 715px, 100vw" data-astro-image="constrained" data-astro-image-fit="cover" data-astro-image-pos="center" width="715" height="477"></p></figure>

Cloudflare OS 由三部分组成：

*   **一个智能体工作区**，扎根于你的公司沉淀的背景知识和技能，并带有一个隔离的运行时，智能体可以在其中编写和运行代码。
*   **一套全新的安全与治理框架**，用于安全访问内部数据和服务。
*   **一个供个人创建、可修改应用的平台**，人们可以构建、分享并持续改进应用。

从一个对话开始，它可以变成一份文档、一个应用或一个工作流，持续完成工作。

## 为全公司每个人准备的智能体工作区

智能体工作区是为组织中的每个人设计的。你在浏览器里与它交互，所以你不必是开发者，也不必会使用终端。

一个工作区把智能体会话、持久状态、产出物和文件、资源访问，以及一个智能体可以编写和运行代码的隔离运行时结合在一起。

它们自带你的团队或公司收集好的背景知识和技能。不必再为每个任务重复造轮子——如果你的团队有人想出了做某事的最佳方式，所有人都能受益。人们不再需要在每次开始任务时，向模型重新解释同样的流程、术语和最佳实践。

你可以做的事情包括：

### 研究并提问

让工作区利用公司背景和你提供给它的资源来研究某个主题。智能体可以编写代码来搜索、过滤、关联和分析信息，而不是把整个数据集拉进模型的上下文窗口。

### 创建文档、幻灯片和电子表格

工作区可以把它的研究成果变成你可以继续编辑的文档、演示文稿或电子表格。这些产出物不一定是静态文件。它们可以保持与实时数据的连接，在数据源变化时自动更新，同时仍然可以导出为熟悉的格式或服务，比如 Google Drive。

### 为你的团队创建可协作、可连接的应用

当文档或电子表格不够用时，智能体可以构建一个拥有自己的界面、逻辑和状态的应用。应用可以使用已连接的公司资源，并支持多人协同工作。

### 运行确定性工作流

并非每项工作都需要完整的智能体会话。很多工作是一串已知步骤，其中只有一两处需要判断力。工作区可以把这些工作变成基本确定性的工作流：可预测的步骤用代码，只在能增加价值的地方使用模型。工作流可以按需运行、按计划运行，或在连接系统中发生某个事件时运行。

Cloudflare OS 通过 Gatekeeper（详见下文安全章节）赋予智能体和应用对记录系统（systems of record）的受治理访问权限。它还通过 [MCP Server Portals](https://developers.cloudflare.com/cloudflare-one/access-controls/ai-controls/mcp-portals/) 支持你的组织已经在使用的现有 [Model Context Protocol（MCP）](https://modelcontextprotocol.io/docs/2026-07-28/getting-started/intro) 服务器。

## 一套全新的安全与治理框架，安全访问内部数据和服务

当人们开始在办公中尝试 AI 时，他们最先提出的需求之一往往就是公司系统的 API key。这很合理：如果 AI 无法访问人们用来完成工作的系统，那么它在工作场景下就没多大用处。

但把 API key 交给个人和智能体既危险又不可扩展。key 通常提供宽泛而长期的访问权限，难以约束、难以安全共享、难以审计。

MCP 给了智能体使用这些系统的一种更好的方式。MCP server 可以持有凭证并暴露一组定义好的工具，而不是直接把 key 交给智能体。但控制智能体可以调用哪些工具只是第一步。MCP 本身并不能告诉我们智能体观察到了哪些底层资源。智能体可以把跨系统的信息组合起来、把它发送到权限更宽松的地方，或者通过应用和产出物把它暴露给可能无权查看原始资源的人。授权必须考虑到数据接下来可能流向何处。

### 智能体从零权限开始

[Cloudflare Access](https://developers.cloudflare.com/cloudflare-one/access-controls/) 控制谁能进入 Cloudflare OS。在内部，每个智能体和应用一开始都无权访问任何东西。智能体可以请求访问某个特定资源，由你批准或拒绝。生成的代码会以带类型的绑定形式获得该资源：

```
const issues = await env.PROJECT.listIssues({
  teamId: "ENG",
  state: "open",
});
```

`env.PROJECT` 是一种能力（capability），代表在特定策略下使用某个特定资源的权限。凭证与智能体及任何生成的代码完全隔离。

服务器端代码运行在全局出站网络被禁用的 Dynamic Worker 中。客户端代码运行在浏览器的沙箱化 frame 中。除非通过你显式提供的能力，两者都无法触达互联网。

### Gatekeeper 治理资源和操作

Gatekeeper 是一个特定于服务的 [Worker](https://developers.cloudflare.com/workers/?_gl=1*1pzndf6*_gcl_au*MzM2MDkxNTQzLjE3ODQ4NDczOTM.*_ga*MWVkZWU3OTctMzJjNC00YWE1LWI2ZDUtZTJkNTY1NzYxYWQ0*_ga_SQCRB0TXZW*czE3ODUyMTk3NjMkbzckZzAkdDE3ODUyMTk3NjMkajYwJGwwJGgwJGRQeHAyTUEtdzgtVUFETUEzOGwtVFVhajVDd2laRWYxSC1R)，位于 Cloudflare OS 与外部服务之间。它理解服务的 API、它的资源，以及可以对资源执行的操作。

把整个 GitHub 账户的访问权交给智能体，很可能过于宽泛。一个 Gatekeeper 可以只给它单个仓库的访问权、允许它读取 issue 但不能读取源代码、屏蔽特定字段、应用速率限制，并规定合并 pull request 前必须获得批准。

智能体及其应用看到的是一小套 TypeScript API。Gatekeeper 负责处理 [OAuth](https://www.cloudflare.com/learning/access-management/what-is-oauth/)、持有凭证、执行策略、记录读取了什么，并调解任何具有外部可见副作用的行为。

<figure data-astro-cid-7nvefuv6=""><p><img src="https://blog.cloudflare.com/_image?href=https%3A%2F%2Fblog.cloudflare.com%2F_emdash%2Fapi%2Fmedia%2Ffile%2F01KZ7PDXZJ8CW8K5Y8DBCBACM7.png&amp;w=715&amp;h=413&amp;f=webp&amp;fit=cover&amp;position=center" srcset="https://blog.cloudflare.com/_image?href=https%3A%2F%2Fblog.cloudflare.com%2F_emdash%2Fapi%2Fmedia%2Ffile%2F01KZ7PDXZJ8CW8K5Y8DBCBACM7.png&amp;w=640&amp;h=370&amp;f=webp&amp;fit=cover&amp;position=center 640w, https://blog.cloudflare.com/_image?href=https%3A%2F%2Fblog.cloudflare.com%2F_emdash%2Fapi%2Fmedia%2Ffile%2F01KZ7PDXZJ8CW8K5Y8DBCBACM7.png&amp;w=715&amp;h=413&amp;f=webp&amp;fit=cover&amp;position=center 715w, https://blog.cloudflare.com/_image?href=https%3A%2F%2Fblog.cloudflare.com%2F_emdash%2Fapi%2Fmedia%2Ffile%2F01KZ7PDXZJ8CW8K5Y8DBCBACM7.png&amp;w=750&amp;h=433&amp;f=webp&amp;fit=cover&amp;position=center 750w, https://blog.cloudflare.com/_image?href=https%3A%2F%2Fblog.cloudflare.com%2F_emdash%2Fapi%2Fmedia%2Ffile%2F01KZ7PDXZJ8CW8K5Y8DBCBACM7.png&amp;w=828&amp;h=478&amp;f=webp&amp;fit=cover&amp;position=center 828w, https://blog.cloudflare.com/_image?href=https%3A%2F%2Fblog.cloudflare.com%2F_emdash%2Fapi%2Fmedia%2Ffile%2F01KZ7PDXZJ8CW8K5Y8DBCBACM7.png&amp;w=1080&amp;h=624&amp;f=webp&amp;fit=cover&amp;position=center 1080w, https://blog.cloudflare.com/_image?href=https%3A%2F%2Fblog.cloudflare.com%2F_emdash%2Fapi%2Fmedia%2Ffile%2F01KZ7PDXZJ8CW8K5Y8DBCBACM7.png&amp;w=1280&amp;h=739&amp;f=webp&amp;fit=cover&amp;position=center 1280w, https://blog.cloudflare.com/_image?href=https%3A%2F%2Fblog.cloudflare.com%2F_emdash%2Fapi%2Fmedia%2Ffile%2F01KZ7PDXZJ8CW8K5Y8DBCBACM7.png&amp;w=1430&amp;h=826&amp;f=webp&amp;fit=cover&amp;position=center 1430w" alt="BLOG-3379 3.png" loading="lazy" decoding="async" data-image-placeholder-media="true" data-lightbox-src="/_image?href=https%3A%2F%2Fblog.cloudflare.com%2F_emdash%2Fapi%2Fmedia%2Ffile%2F01KZ7PDXZJ8CW8K5Y8DBCBACM7.png&amp;w=1920&amp;h=1109&amp;f=webp" data-lightbox-width="1920" data-lightbox-height="1109" data-astro-cid-7nvefuv6="true" sizes="(min-width: 715px) 715px, 100vw" data-astro-image="constrained" data-astro-image-fit="cover" data-astro-image-pos="center" width="715" height="413"></p></figure>

### 策略跟随智能体所见

仅仅控制最初的读取是不够的。举个例子：智能体读取了数据仓库中的一张敏感表，并用它生成了一个实时仪表盘。共享这个仪表盘，绝不能变成把这张表分享给无法直接访问它的人。

Cloudflare OS 会记录智能体观察到的每一个资源。这些观察记录始终附着于智能体及其工作。当其他人试图打开这个工作区、与智能体交互或查看它的产出物时，Gatekeeper 会核验那个人对所观察资源的访问权限。

<figure data-astro-cid-7nvefuv6=""><p><img src="https://blog.cloudflare.com/_image?href=https%3A%2F%2Fblog.cloudflare.com%2F_emdash%2Fapi%2Fmedia%2Ffile%2F01KZ7PDY5GTDXQJPAWC065WH87.png&amp;w=715&amp;h=463&amp;f=webp&amp;fit=cover&amp;position=center" srcset="https://blog.cloudflare.com/_image?href=https%3A%2F%2Fblog.cloudflare.com%2F_emdash%2Fapi%2Fmedia%2Ffile%2F01KZ7PDY5GTDXQJPAWC065WH87.png&amp;w=640&amp;h=414&amp;f=webp&amp;fit=cover&amp;position=center 640w, https://blog.cloudflare.com/_image?href=https%3A%2F%2Fblog.cloudflare.com%2F_emdash%2Fapi%2Fmedia%2Ffile%2F01KZ7PDY5GTDXQJPAWC065WH87.png&amp;w=715&amp;h=463&amp;f=webp&amp;fit=cover&amp;position=center 715w, https://blog.cloudflare.com/_image?href=https%3A%2F%2Fblog.cloudflare.com%2F_emdash%2Fapi%2Fmedia%2Ffile%2F01KZ7PDY5GTDXQJPAWC065WH87.png&amp;w=750&amp;h=486&amp;f=webp&amp;fit=cover&amp;position=center 750w, https://blog.cloudflare.com/_image?href=https%3A%2F%2Fblog.cloudflare.com%2F_emdash%2Fapi%2Fmedia%2Ffile%2F01KZ7PDY5GTDXQJPAWC065WH87.png&amp;w=828&amp;h=536&amp;f=webp&amp;fit=cover&amp;position=center 828w, https://blog.cloudflare.com/_image?href=https%3A%2F%2Fblog.cloudflare.com%2F_emdash%2Fapi%2Fmedia%2Ffile%2F01KZ7PDY5GTDXQJPAWC065WH87.png&amp;w=1080&amp;h=699&amp;f=webp&amp;fit=cover&amp;position=center 1080w, https://blog.cloudflare.com/_image?href=https%3A%2F%2Fblog.cloudflare.com%2F_emdash%2Fapi%2Fmedia%2Ffile%2F01KZ7PDY5GTDXQJPAWC065WH87.png&amp;w=1280&amp;h=829&amp;f=webp&amp;fit=cover&amp;position=center 1280w, https://blog.cloudflare.com/_image?href=https%3A%2F%2Fblog.cloudflare.com%2F_emdash%2Fapi%2Fmedia%2Ffile%2F01KZ7PDY5GTDXQJPAWC065WH87.png&amp;w=1430&amp;h=926&amp;f=webp&amp;fit=cover&amp;position=center 1430w" alt="BLOG-3379 4.png" loading="lazy" decoding="async" data-image-placeholder-media="true" data-lightbox-src="/_image?href=https%3A%2F%2Fblog.cloudflare.com%2F_emdash%2Fapi%2Fmedia%2Ffile%2F01KZ7PDY5GTDXQJPAWC065WH87.png&amp;w=1920&amp;h=1244&amp;f=webp" data-lightbox-width="1920" data-lightbox-height="1244" data-astro-cid-7nvefuv6="true" sizes="(min-width: 715px) 715px, 100vw" data-astro-image="constrained" data-astro-image-fit="cover" data-astro-image-pos="center" width="715" height="463"></p></figure>

同一份观察日志也用于制定策略，决定智能体何时可以发起外部请求。读取敏感数据，可以阻止智能体向某些数据源写入数据、邀请新的协作者、把工作转交给另一个智能体，或发起出站请求。

使用智能体或构建应用的人不必担心会犯这些错误。平台现在就可以替你处理这一切。

## 一个构建和分享个人可修改应用的平台

大多数办公套件给你一组固定的应用：文档、电子表格和演示文稿。在 Cloudflare OS 中，每个“文件”都可以是自己的应用，由智能体为一个人、一个项目或一个团队编写。

这些不是需要导出并部署到别处的原型。每一个都是全栈应用，包含客户端代码、服务器端代码、API 和持久状态。应用默认私有，但可以像文档一样共享。

### 每个应用都是一个 Worker

当你让工作区构建一个应用时，智能体会编写两部分：

*   在浏览器中渲染应用 UI 的客户端代码
*   存储状态并实现应用行为的服务器端代码

服务器按需以 [Dynamic Worker](https://developers.cloudflare.com/dynamic-workers/) 形式加载，并实例化为 [Durable Object Facet](https://developers.cloudflare.com/dynamic-workers/usage/durable-object-facets/)（这两项都是我们为这个项目构建的特性）。facet 给应用一个独立的 SQLite 数据库，与负责管理它的 Cloudflare OS 运行时分开。Dynamic Workers 使用轻量的 V8 isolate，所以每个应用都可以拥有自己的隔离运行时，而不需要专门闲置一台服务器或容器。

<figure data-astro-cid-7nvefuv6=""><p><img src="https://blog.cloudflare.com/_image?href=https%3A%2F%2Fblog.cloudflare.com%2F_emdash%2Fapi%2Fmedia%2Ffile%2F01KZ7PDXTESRQTCERH9MDPVGC3.png&amp;w=715&amp;h=421&amp;f=webp&amp;fit=cover&amp;position=center" srcset="https://blog.cloudflare.com/_image?href=https%3A%2F%2Fblog.cloudflare.com%2F_emdash%2Fapi%2Fmedia%2Ffile%2F01KZ7PDXTESRQTCERH9MDPVGC3.png&amp;w=640&amp;h=377&amp;f=webp&amp;fit=cover&amp;position=center 640w, https://blog.cloudflare.com/_image?href=https%3A%2F%2Fblog.cloudflare.com%2F_emdash%2Fapi%2Fmedia%2Ffile%2F01KZ7PDXTESRQTCERH9MDPVGC3.png&amp;w=715&amp;h=421&amp;f=webp&amp;fit=cover&amp;position=center 715w, https://blog.cloudflare.com/_image?href=https%3A%2F%2Fblog.cloudflare.com%2F_emdash%2Fapi%2Fmedia%2Ffile%2F01KZ7PDXTESRQTCERH9MDPVGC3.png&amp;w=750&amp;h=442&amp;f=webp&amp;fit=cover&amp;position=center 750w, https://blog.cloudflare.com/_image?href=https%3A%2F%2Fblog.cloudflare.com%2F_emdash%2Fapi%2Fmedia%2Ffile%2F01KZ7PDXTESRQTCERH9MDPVGC3.png&amp;w=828&amp;h=488&amp;f=webp&amp;fit=cover&amp;position=center 828w, https://blog.cloudflare.com/_image?href=https%3A%2F%2Fblog.cloudflare.com%2F_emdash%2Fapi%2Fmedia%2Ffile%2F01KZ7PDXTESRQTCERH9MDPVGC3.png&amp;w=1080&amp;h=636&amp;f=webp&amp;fit=cover&amp;position=center 1080w, https://blog.cloudflare.com/_image?href=https%3A%2F%2Fblog.cloudflare.com%2F_emdash%2Fapi%2Fmedia%2Ffile%2F01KZ7PDXTESRQTCERH9MDPVGC3.png&amp;w=1280&amp;h=754&amp;f=webp&amp;fit=cover&amp;position=center 1280w, https://blog.cloudflare.com/_image?href=https%3A%2F%2Fblog.cloudflare.com%2F_emdash%2Fapi%2Fmedia%2Ffile%2F01KZ7PDXTESRQTCERH9MDPVGC3.png&amp;w=1430&amp;h=842&amp;f=webp&amp;fit=cover&amp;position=center 1430w" alt="BLOG-3379 5.png" loading="lazy" decoding="async" data-image-placeholder-media="true" data-lightbox-src="/_image?href=https%3A%2F%2Fblog.cloudflare.com%2F_emdash%2Fapi%2Fmedia%2Ffile%2F01KZ7PDXTESRQTCERH9MDPVGC3.png&amp;w=1920&amp;h=1131&amp;f=webp" data-lightbox-width="1920" data-lightbox-height="1131" data-astro-cid-7nvefuv6="true" sizes="(min-width: 715px) 715px, 100vw" data-astro-image="constrained" data-astro-image-fit="cover" data-astro-image-pos="center" width="715" height="421"></p></figure>

浏览器客户端使用 [Cap’n Web](https://github.com/cloudflare/capnweb)——Cloudflare 开源的基于对象能力（object-capability）的远程过程调用（RPC）系统——与服务器通信。客户端可以像调用普通 JavaScript 函数一样调用服务器方法：

```
const issues = await app.listIssues({
 status: "done",
});
```

特别之处在于，智能体也可以调用同样的方法。

**所以，如果你能自己造一个完成某件事的工具，那么当你不在场时，智能体也能用你的工具来完成这件事。**

### 分享应用，或分享它的构建方式

当你在 Cloudflare OS 中构建一个应用时，有两种分享方式：

*   分享应用本身，让别人可以使用同一份状态进行实时协作。
*   分享应用的蓝图（blueprint），让别人可以创建你自己应用的一个副本。

<figure data-astro-cid-7nvefuv6=""><p><img src="https://blog.cloudflare.com/_image?href=https%3A%2F%2Fblog.cloudflare.com%2F_emdash%2Fapi%2Fmedia%2Ffile%2F01KZ7PDXN0ZTW8DZZ0VC98Z0AP.png&amp;w=715&amp;h=284&amp;f=webp&amp;fit=cover&amp;position=center" srcset="https://blog.cloudflare.com/_image?href=https%3A%2F%2Fblog.cloudflare.com%2F_emdash%2Fapi%2Fmedia%2Ffile%2F01KZ7PDXN0ZTW8DZZ0VC98Z0AP.png&amp;w=640&amp;h=254&amp;f=webp&amp;fit=cover&amp;position=center 640w, https://blog.cloudflare.com/_image?href=https%3A%2F%2Fblog.cloudflare.com%2F_emdash%2Fapi%2Fmedia%2Ffile%2F01KZ7PDXN0ZTW8DZZ0VC98Z0AP.png&amp;w=715&amp;h=284&amp;f=webp&amp;fit=cover&amp;position=center 715w, https://blog.cloudflare.com/_image?href=https%3A%2F%2Fblog.cloudflare.com%2F_emdash%2Fapi%2Fmedia%2Ffile%2F01KZ7PDXN0ZTW8DZZ0VC98Z0AP.png&amp;w=750&amp;h=298&amp;f=webp&amp;fit=cover&amp;position=center 750w, https://blog.cloudflare.com/_image?href=https%3A%2F%2Fblog.cloudflare.com%2F_emdash%2Fapi%2Fmedia%2Ffile%2F01KZ7PDXN0ZTW8DZZ0VC98Z0AP.png&amp;w=828&amp;h=329&amp;f=webp&amp;fit=cover&amp;position=center 828w, https://blog.cloudflare.com/_image?href=https%3A%2F%2Fblog.cloudflare.com%2F_emdash%2Fapi%2Fmedia%2Ffile%2F01KZ7PDXN0ZTW8DZZ0VC98Z0AP.png&amp;w=1080&amp;h=429&amp;f=webp&amp;fit=cover&amp;position=center 1080w, https://blog.cloudflare.com/_image?href=https%3A%2F%2Fblog.cloudflare.com%2F_emdash%2Fapi%2Fmedia%2Ffile%2F01KZ7PDXN0ZTW8DZZ0VC98Z0AP.png&amp;w=1280&amp;h=508&amp;f=webp&amp;fit=cover&amp;position=center 1280w, https://blog.cloudflare.com/_image?href=https%3A%2F%2Fblog.cloudflare.com%2F_emdash%2Fapi%2Fmedia%2Ffile%2F01KZ7PDXN0ZTW8DZZ0VC98Z0AP.png&amp;w=1430&amp;h=568&amp;f=webp&amp;fit=cover&amp;position=center 1430w" alt="BLOG-3379 6.png" loading="lazy" decoding="async" data-image-placeholder-media="true" data-lightbox-src="/_image?href=https%3A%2F%2Fblog.cloudflare.com%2F_emdash%2Fapi%2Fmedia%2Ffile%2F01KZ7PDXN0ZTW8DZZ0VC98Z0AP.png&amp;w=1920&amp;h=764&amp;f=webp" data-lightbox-width="1920" data-lightbox-height="764" data-astro-cid-7nvefuv6="true" sizes="(min-width: 715px) 715px, 100vw" data-astro-image="constrained" data-astro-image-fit="cover" data-astro-image-pos="center" width="715" height="284"></p></figure>

从蓝图实例化出的应用包含原始应用的代码，但不包含它的 SQLite 数据、对话历史、凭证或已连接资源。每个新应用都从独立的状态和资源开始。

这意味着当你与团队分享应用时，他们可以用 AI 自行修改应用，而不是提交一个功能请求然后指派给你。

## 使用任意模型，并控制它的成本

Cloudflare OS 可以使用任何模型。每一次推理调用都经过 [Cloudflare AI Gateway](https://developers.cloudflare.com/ai-gateway/)，让你的组织有一个地方来决定哪些模型可用、每个任务该由哪个模型处理。

<figure data-astro-cid-7nvefuv6=""><p><img src="https://blog.cloudflare.com/_image?href=https%3A%2F%2Fblog.cloudflare.com%2F_emdash%2Fapi%2Fmedia%2Ffile%2F01KZ7PDXTSXP67QP4M7F21B9V1.png&amp;w=715&amp;h=332&amp;f=webp&amp;fit=cover&amp;position=center" srcset="https://blog.cloudflare.com/_image?href=https%3A%2F%2Fblog.cloudflare.com%2F_emdash%2Fapi%2Fmedia%2Ffile%2F01KZ7PDXTSXP67QP4M7F21B9V1.png&amp;w=640&amp;h=297&amp;f=webp&amp;fit=cover&amp;position=center 640w, https://blog.cloudflare.com/_image?href=https%3A%2F%2Fblog.cloudflare.com%2F_emdash%2Fapi%2Fmedia%2Ffile%2F01KZ7PDXTSXP67QP4M7F21B9V1.png&amp;w=715&amp;h=332&amp;f=webp&amp;fit=cover&amp;position=center 715w, https://blog.cloudflare.com/_image?href=https%3A%2F%2Fblog.cloudflare.com%2F_emdash%2Fapi%2Fmedia%2Ffile%2F01KZ7PDXTSXP67QP4M7F21B9V1.png&amp;w=750&amp;h=348&amp;f=webp&amp;fit=cover&amp;position=center 750w, https://blog.cloudflare.com/_image?href=https%3A%2F%2Fblog.cloudflare.com%2F_emdash%2Fapi%2Fmedia%2Ffile%2F01KZ7PDXTSXP67QP4M7F21B9V1.png&amp;w=828&amp;h=384&amp;f=webp&amp;fit=cover&amp;position=center 828w, https://blog.cloudflare.com/_image?href=https%3A%2F%2Fblog.cloudflare.com%2F_emdash%2Fapi%2Fmedia%2Ffile%2F01KZ7PDXTSXP67QP4M7F21B9V1.png&amp;w=1080&amp;h=501&amp;f=webp&amp;fit=cover&amp;position=center 1080w, https://blog.cloudflare.com/_image?href=https%3A%2F%2Fblog.cloudflare.com%2F_emdash%2Fapi%2Fmedia%2Ffile%2F01KZ7PDXTSXP67QP4M7F21B9V1.png&amp;w=1280&amp;h=594&amp;f=webp&amp;fit=cover&amp;position=center 1280w, https://blog.cloudflare.com/_image?href=https%3A%2F%2Fblog.cloudflare.com%2F_emdash%2Fapi%2Fmedia%2Ffile%2F01KZ7PDXTSXP67QP4M7F21B9V1.png&amp;w=1430&amp;h=664&amp;f=webp&amp;fit=cover&amp;position=center 1430w" alt="BLOG-3379 7.png" loading="lazy" decoding="async" data-image-placeholder-media="true" data-lightbox-src="/_image?href=https%3A%2F%2Fblog.cloudflare.com%2F_emdash%2Fapi%2Fmedia%2Ffile%2F01KZ7PDXTSXP67QP4M7F21B9V1.png&amp;w=1920&amp;h=891&amp;f=webp" data-lightbox-width="1920" data-lightbox-height="891" data-astro-cid-7nvefuv6="true" sizes="(min-width: 715px) 715px, 100vw" data-astro-image="constrained" data-astro-image-fit="cover" data-astro-image-pos="center" width="715" height="332"></p></figure>

并非每个任务都需要最贵的模型。你可能不希望每天早上用最昂贵的前沿模型来总结未读邮件。AI Gateway 给了你所需的控制力，确保昂贵模型只用于最困难的工作。

每个请求都会归属到发起它的个人、团队或工作区。管理员可以看到推理支出的去向、设置预算和速率限制，并决定达到限制后会发生什么。

## 开源，让它成为你自己的

Cloudflare OS 今天就可以使用，而且是开源的。去看看 [cloudflare-os GitHub 仓库](https://github.com/cloudflare/cloudflare-os)。你可以把它部署到你自己的 Cloudflare 账户中，并使用你自己的 Access 策略、AI Gateway 配置、数据和集成。

我们的内部部署反映了 Cloudflare 的系统、术语、策略和行事方式。你的部署应该反映你的组织。

Cloudflare OS 的设计让你可以定制界面、添加内部 Gatekeeper、构建组织专属特性，而无需改动核心产品。

我们发布了两个仓库：[Cloudflare OS 核心](https://github.com/cloudflare/cloudflare-os)和一个[示例部署](https://github.com/cloudflare/cloudflare-os-starter)，后者基于我们在 Cloudflare 内部的运行方式。部署仓库在不修改核心的情况下使用它，为配置、自定义 UI、内部集成、分析和部署流水线提供空间。

## 与我们的合作伙伴共同交付

源代码只是起点。背景知识、技能、工作流、内部系统和策略，才是让 Cloudflare OS 对你的组织更有用的东西。

Cloudflare 的战略合作伙伴 Presidio 和 Happy Cog 将与你合作，围绕你所在组织的运作方式定制 Cloudflare OS，并在你的员工队伍中推广落地。

合作伙伴可以帮助你沉淀共享技能和组织背景知识、构建自定义界面、通过 Gatekeeper 和 MCP Server Portals 接入内部系统，并配置安全、模型和成本控制。

你将得到一个带自己品牌标识的 Cloudflare OS，连接你的系统、运行在 Cloudflare 上，并贴合你员工的实际工作方式。

## 开始使用

Cloudflare OS 今天已在 [GitHub](https://github.com/cloudflare/cloudflare-os) 上线。你可以浏览源代码、试用 demo，或者使用我们的[入门仓库](https://github.com/cloudflare/cloudflare-os-starter)在几分钟内把它部署到你自己的 Cloudflare 账户。

我们才刚刚开始。我们正在努力把 Cloudflare OS 作为完全托管的产品带入 Cloudflare dashboard，为开发工作流添加容器支持，并把工作区带进 Slack 和其他聊天工具。

如果你想和我们的团队聊聊，我们很乐意与你交流。请使用[这个表单](https://www.cloudflare.com/resource/cloudflare-os-interest-landing-page/)联系我们！
