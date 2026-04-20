# Artifacts：会说 Git 的版本化存储

2026-04-16

9 分钟阅读

![](https://cf-assets.www.cloudflare.com/zkvhlag99gkb/3mZ163MhASDRQW86DQm86r/2e89a01820f1b0a87af22d18208f470c/BLOG-3269_1.png)

Agent 改变了我们看待源码控制、文件系统和状态持久化的方式。开发者和 agent 正在生成前所未有的代码量——未来 5 年写出的代码，会超过编程历史上此前所有代码的总和——这推动了承载需求所需系统规模发生了一个数量级的变化。源码控制平台尤其吃力：它们原本是为人类需求设计的，不是为那些 24 小时不停工、能同时处理多个问题、永远不知疲倦的 agent 带来的 10 倍量级变化而设计的。

我们认为，现在需要一种新的基础原语：一个首先为 agent 而生的分布式、版本化文件系统，并且它能够服务今天正在构建的这类应用。

我们把它叫做 Artifacts：一个会说 Git 的版本化文件系统。你可以通过程序创建仓库，把它和 agent、sandbox、Workers 或任何其他计算范式并排使用，同时也能从任意常规 Git 客户端连接进去。

想给每个 agent session 都配一个 repo？Artifacts 可以。每个 sandbox 实例都来一个？也可以。想从一个已验证可用的起点派生出 10,000 个 fork？没错，还是 Artifacts。Artifacts 提供了 REST API 和原生 Workers API，用于创建仓库、生成凭证、提交 commit，适合那些 Git 客户端并不合适的环境（例如任意 serverless function）。

Artifacts 目前处于私有测试阶段，我们计划在 5 月上旬开放公测。

```typescript
// Create a repo
const repo = await env.AGENT_REPOS.create(name)
// Pass back the token & remote to your agent
return { repo.remote, repo.token }
```

```bash
# Clone it and use it like any regular git remote
$ git clone https://x:${TOKEN}@123def456abc.artifacts.cloudflare.net/git/repo-13194.git
```

就是这样。一个裸仓库，随建随用，任意 Git 客户端都可以像操作普通远端一样操作它。

如果你想把一个已有 Git 仓库引导进 Artifacts，让 agent 能独立处理并推送独立改动，也可以通过 `.import()` 完成：

```typescript
interface Env {
  ARTIFACTS: Artifacts
}

export default {
  async fetch(request: Request, env: Env) {
    // Import from GitHub
    const { remote, token } = await env.ARTIFACTS.import({
      source: {
        url: "https://github.com/cloudflare/workers-sdk",
        branch: "main",
      },
      target: {
        name: "workers-sdk",
      },
    })

    // Get a handle to the imported repo
    const repo = await env.ARTIFACTS.get("workers-sdk")

    // Fork to an isolated, read-only copy
    const fork = await repo.fork("workers-sdk-review", {
      readOnly: true,
    })

    return Response.json({ remote: fork.remote, token: fork.token })
  },
}
```

[看看文档](https://developers.cloudflare.com/artifacts/)开始上手；如果你想了解 Artifacts 是如何被使用、如何构建，以及底层是怎么工作的，那就继续往下读。

## 为什么是 Git？什么叫版本化文件系统？

Agent 懂 Git。Git 深深存在于大多数模型的训练数据中。无论是 happy path，还是各种边界情况，agent 都很熟悉；而面向代码优化的模型（和/或 harness）尤其擅长使用 Git。

更进一步，Git 的数据模型不仅适合源码控制，也适合任何你需要追踪状态、回到过去、并持久化大量小数据的场景。代码、配置、session prompt 和 agent 历史：这些都是你常常希望按小块（“commit”）保存、并且可以回滚到（“history”）的东西（“object”）。

我们当然也可以重新发明一种全新的专有协议……但那会遇到冷启动问题。AI 模型不懂它，于是你就得分发 skill、CLI，或者希望用户已经接上了你的 docs MCP……这些都会增加摩擦。如果我们只是给 agent 一个带认证、受保护的 HTTPS Git remote URL，让它像面对普通 Git 仓库那样操作，会怎样？事实证明，这样效果很好。而对那些不说 Git 的客户端——例如 Cloudflare Worker、Lambda function 或 Node.js 应用——我们则提供了 REST API，以及即将推出的特定语言 SDK。这些客户端当然也能用 [isomorphic-git](https://isomorphic-git.org/)，但很多时候，一个更简单的 TypeScript API 能显著缩小所需 API 面。

### 不只是源码控制

Artifacts 的 Git API 可能会让你以为它只是做源码控制的，但实际上，Git API 和它背后的数据模型，是一种非常强大的状态持久化方式：它让任何数据都能被 fork、time-travel 和 diff。

在 Cloudflare 内部，我们已经把 Artifacts 用在内部 agent 上：自动把当前文件系统状态以及 session 历史持久化到每个 session 各自的 Artifacts repo 中。这样我们就能：

* 持久化 sandbox 状态，而不需要预先分配并长期保留块存储。

* 和他人共享 session，并允许他们沿着 session（prompt）状态和文件状态一起回溯，不受“实际”仓库（源码控制）是否产生过 commit 的限制。

* 还有最棒的一点：可以从任意时间点 *fork* 一个 session，让团队里的同事直接从那个时刻接着干。你在调试某个问题，想让另一双眼睛看看？发个 URL，对方 fork 一下就行。想一起打磨某个 API？让同事 fork 你的 session，从你停下来的地方继续。

我们也和一些团队聊过，他们想在并不要求 Git 协议本身的场景里使用 Artifacts，但他们很需要 Git 的那些语义：回滚、克隆、diff。比如把每个客户的配置作为产品的一部分存起来，并希望可以回退，Artifacts 就会是个不错的表示方式。

我们很期待看到大家不仅把 Artifacts 用在 Git 场景里，也去探索那些非 Git 的用法。

## 底层实现

Artifacts 构建在 Durable Objects 之上。如今 Durable Objects 天生就具备创建数百万、甚至数千万个有状态、彼此隔离的计算实例的能力，而这也正是我们支持每个命名空间下数百万 Git repo 所需要的能力。

Major League Baseball（实时比赛分发）、Confluence Whiteboards，以及我们自己的 [Agents SDK](https://developers.cloudflare.com/agents/) 都已经在相当大的规模下使用 Durable Objects，所以我们是在一个已经生产验证过一段时间的原语之上继续搭建。

不过，我们确实还需要一个能跑在 Cloudflare Workers 上的 Git 服务器实现。它必须足够小、尽可能完整、可扩展（[notes](https://git-scm.com/docs/git-notes)、[LFS](https://git-lfs.com/)），还要高效。所以我们用 [Zig](https://ziglang.org/) 写了一个，并把它编译成了 Wasm。

为什么选 Zig？有三个原因：

1. 整个 Git 协议引擎都用纯 Zig 编写（不依赖 libc），编译后是一个大约 100KB 的 WASM 二进制（而且还有进一步优化空间）。它从零实现了 SHA-1、zlib inflate/deflate、delta 编码/解码、pack 解析，以及完整的 git smart HTTP 协议，除标准库外零外部依赖。

2. Zig 让我们能手动控制内存分配，这在 Durable Objects 这种受限环境里很重要。Zig Build System 也让我们能轻松在 WASM 运行时（生产）和原生构建（测试时对照 libgit2 做正确性验证）之间共享代码。

3. WASM 模块通过一层很薄的回调接口与 JS host 通信：11 个由 host 导入的函数用于存储操作（`host_get_object`、`host_put_object` 等），再加上一个用于流式输出的函数（`host_emit_bytes`）。WASM 这一侧可以完全脱离宿主环境独立测试。

除此之外，Artifacts 还使用了 R2（做快照）和 KV（跟踪认证 token）：

<figure><img src="https://cf-assets.www.cloudflare.com/zkvhlag99gkb/35SxJbQfntIscpotc0GBt8/48ae11213d7483c9b488321baacf78e7/BLOG-3269_2.png" alt="BLOG-3269 2" width="1800" height="1000" loading="lazy"></figure>

`*Artifacts 的工作方式（Workers、Durable Objects 与 WebAssembly）*`

一个 Worker 充当前端，负责认证与授权、关键指标（错误、延迟）处理，并在请求到来时动态定位每个 Artifacts 仓库（也就是 Durable Object）。

具体来说：

* 文件存储在底层 Durable Object 的 SQLite 数据库中。

  * Durable Object 存储单行最大为 2MB，所以较大的 Git object 会被切块，分散存到多行中。

  * 我们使用了同步 KV API（`state.storage.kv`），而它底层其实也是由 SQLite 支撑的。

* DO 的内存上限大约是 128MB：这意味着我们可以生成数千万个实例（它们足够轻、足够快），但同时也必须在这些限制之内工作。

  * 在 fetch 和 push 路径上，我们都大量使用流式处理，直接返回由原始 WASM 输出块构成的 `ReadableStream<Uint8Array>`。

  * 我们避免自己重新计算 Git delta，而是把原始 delta 和 base hash 与解析后的 object 一起持久化。这样在 fetch 时，如果请求方已经拥有 base object，Zig 就会直接发出 delta，而不是整个完整 object，从而同时节省带宽和内存。

* 同时支持 Git 协议 v1 与 v2。

  * 我们支持 `ls-refs`、浅克隆（`deepen`、`deepen-since`、`deepen-relative`）以及基于 `have/want` 协商的增量 fetch 等 capability。

  * 我们有一套覆盖面很广的测试体系，包括针对 Git 客户端的一致性测试，以及对照 libgit2 server 的验证测试，用来确认协议支持是否正确。

在此基础上，我们还原生支持 [git-notes](https://git-scm.com/docs/git-notes)。Artifacts 是为 agent 优先设计的，而 notes 正好允许 agent 给 Git object 附加注释（元数据），包括 prompt、agent 归属信息以及其他可以在不修改 object 本身的前提下读写的元数据。

## 大仓库，大麻烦？来认识 ArtifactFS

大多数仓库其实并不大，而 Git 在存储效率上[本来就非常高](https://github.blog/open-source/git/gits-database-internals-i-packed-object-store/)：绝大多数仓库最多只需要几秒就能 clone 完，时间主要花在网络建立、认证以及[校验](https://git-scm.com/book/ms/v2/Git-Internals-Git-Objects)上。在许多 agent 或 sandbox 场景里，这完全可以接受：sandbox 启动时直接 clone 仓库，然后开始工作。

但如果是一个多 GB 的仓库，或者一个包含数百万对象的仓库呢？怎样才能快速 clone，而不让 agent 为此卡上几分钟、同时吞掉大量算力？

一个流行的 Web 框架（2.4GB，而且历史很长）clone 下来接近 2 分钟。浅克隆会更快，但还不足以降到个位数秒，而且我们也不总想省略历史（agent 往往会从历史中获益）。

那能不能把大仓库的启动时间压到大约 10 到 15 秒，让 agent 尽快开始干活？可以，用一些技巧就行。

伴随 Artifacts 一起发布的，还有我们开源的 [ArtifactFS](https://github.com/cloudflare/artifact-fs)：一个文件系统驱动，目标是在尽可能短的时间内挂载大型 Git 仓库，并在后台逐步 hydrate 文件内容，而不是在初始 clone 阶段全部阻塞住。它非常适合 agent、sandbox、容器以及任何启动时间很关键的场景。如果你能为每个大型仓库 sandbox 启动节省约 90 到 100 秒，而你每个月会运行 10,000 次这样的 sandbox 任务，那就是 2,778 小时的 sandbox 时间节省。

你可以把 ArtifactFS 理解成“异步版 Git clone”：

* ArtifactFS 会对 Git 仓库执行一次无 blob clone：先获取文件树和 refs，但不拿文件内容。这样它就能在 sandbox 启动过程中完成，而你的 agent harness 也能尽快开始工作。

* 然后它会在后台通过一个轻量守护进程并发地 hydrate（下载）文件内容。

* 它会优先处理 agent 通常最先要用到的文件：包清单（`package.json`、`go.mod`）、配置文件和代码；如果可能，则降低二进制 blob（图片、可执行文件以及其他非文本文件）的优先级，让 agent 在文件内容逐步就绪时，先扫描文件树。

* 如果某个文件在 agent 读取时还没有完成 hydrate，那么这次读取会阻塞到它完成为止。

这个文件系统并不会尝试把文件“同步”回远端仓库：对于成千上万甚至数百万对象的场景，这通常非常慢；而且既然我们说的是 Git，本来也不需要这么做。你的 agent 只需要像对待普通仓库一样 commit 和 push。没有新的 API 要学。

更重要的是，ArtifactFS 可以配合任意 Git remote 使用，而不只是我们的 Artifacts。如果你是从 GitHub、GitLab，或者自建 Git 基础设施克隆大型仓库，一样可以用 ArtifactFS。

## 接下来会有什么？

今天发布的还只是 beta，我们已经在推进接下来几周会落地的一批功能：

* 扩展[可用指标](https://developers.cloudflare.com/artifacts/observability/metrics/)。当前我们已经提供按命名空间、repo 统计的关键操作指标，以及每个 repo 的存储字节数，方便你管理数百万个 Artifacts，而不至于陷入运维琐事。

* 支持针对 repo 级事件的 [Event Subscriptions](https://developers.cloudflare.com/queues/event-subscriptions/)，这样我们就能对命名空间内任意仓库的 push、pull、clone 和 fork 发出事件。这也能让你消费这些事件、编写 webhook，并用这些事件去通知终端用户、驱动产品内的生命周期事件，或者触发 push 之后的任务（例如 CI/CD）。

* 提供原生 TypeScript、Go 和 Python 客户端 SDK，用于与 Artifacts API 交互。

* 提供 repo 级与命名空间级搜索 API，例如“找出所有包含 `package.json` 文件的 repo”。

我们也计划为 [Workers Builds](https://developers.cloudflare.com/workers/ci-cd/builds/) 提供 API，让你能在任意 agent 驱动的工作流上运行 CI/CD 任务。

## 这会花我多少钱？

Artifacts 还处在早期阶段，但我们希望它的定价能适应 agent 规模：拥有数百万个 repo 也要足够划算，闲置或很少使用的 repo 不该成为负担，而定价应当贴合 agent 这种高度单租户化的使用方式。

你也不该总担心一个 repo 会不会被使用、它是热的还是冷的、某个 agent 会不会把它唤醒。我们会按照你实际消耗的存储，以及针对每个 repo 发生的操作（例如 clone、fork、push 和 pull）收费。

**单价**

**包含额度**

**操作**

每 1,000 次操作 $0.15

每月前 10k 次免费

**存储**

$0.50 / GB-月

前 1GB 免费。

无论你有 1,000、100,000，还是 1,000 万个 repo，体积更大、使用更频繁的仓库，成本都会高于体积更小、访问更少的仓库。

随着 beta 推进，我们也会把 Artifacts 带到 Workers Free 计划（会附带一些合理限制），如果定价发生变化，我们会在 beta 期间持续同步，并在开始计费前提前说明。

## 我该从哪里开始？

<figure><img src="https://cf-assets.www.cloudflare.com/zkvhlag99gkb/3xLMMKCN1HNGWbkSyq0tDZ/2a8d49383957804f3ce204783e11ae80/BLOG-3269_3.png" alt="BLOG-3269 3" width="1999" height="1125" loading="lazy"></figure>

Artifacts 以私有 beta 形式发布，我们预计在 5 月上旬准备好公测（明确一下，是 2026 年）。未来几周我们会逐步放量，[你现在就可以登记私有 beta 意向](https://forms.gle/DwBoPRa3CWQ8ajFp7)。

在此之前，你可以这样进一步了解 Artifacts：

* 阅读文档中的[快速开始指南](https://developers.cloudflare.com/artifacts/get-started/workers/)

* 打开 Cloudflare 控制台（Build > Storage & Databases > Artifacts）

* 阅读 [REST API 示例](https://developers.cloudflare.com/artifacts/api/rest-api/)

* 了解更多[Artifacts 的底层工作机制](https://developers.cloudflare.com/artifacts/concepts/how-artifacts-works/)

关注[changelog](https://developers.cloudflare.com/changelog/product/artifacts/)，追踪 beta 的后续进展。

## 在 Cloudflare TV 上观看

Cloudflare 的 connectivity cloud 能保护[整个企业网络](https://www.cloudflare.com/network-services/)，帮助客户高效构建[互联网级应用](https://workers.cloudflare.com/)，加速任意[网站或互联网应用](https://www.cloudflare.com/performance/accelerate-internet-applications/)，[抵御 DDoS 攻击](https://www.cloudflare.com/ddos/)，[阻挡黑客](https://www.cloudflare.com/application-security/)，并帮助你走上 [Zero Trust](https://www.cloudflare.com/products/zero-trust/) 之路。

访问任意设备上的 [1.1.1.1](https://one.one.one.one/)，即可开始使用我们的免费应用，让你的网络更快、更安全。

如果你想了解更多关于我们“帮助构建更好互联网”的使命，[可以从这里开始](https://www.cloudflare.com/learning/what-is-cloudflare/)。如果你正在寻找新的职业方向，也可以看看[我们的招聘岗位](https://www.cloudflare.com/careers)。

[Agents Week](https://blog.cloudflare.com/tag/agents-week/)[Agents](https://blog.cloudflare.com/tag/agents/)[GitHub](https://blog.cloudflare.com/tag/github/)[Cloudflare Workers](https://blog.cloudflare.com/tag/workers/)[Storage](https://blog.cloudflare.com/tag/storage/)[Developer Platform](https://blog.cloudflare.com/tag/developer-platform/)[Developers](https://blog.cloudflare.com/tag/developers/)
