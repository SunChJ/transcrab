# 我们把 Bun 的 Rust 重写版用于 Prisma Compute 生产环境

Prisma Compute 在 Bun 上运行 TypeScript 应用。发布 public beta 时，我们选择运行在 Bun canary 上，更具体地说，是预计会作为 Bun 1.4 发布的 Rust 重写版。

这个决定和我们通常怎么看待“重写”无关。它只取决于测试结果。

我们很早就选择 Bun，是因为它符合我们对 Compute 的设想：一个 batteries included、兼容 Node.js 的 TypeScript runtime，可以把客户应用运行在数据库旁边，空闲时 scale to zero，流量回来时再唤醒。后来我们开始在真实负载下运行它，情况变得更复杂。我们遇到了内存泄漏，也遇到了一个连接池问题：VM pause 后再 resume，连接池无法恢复。能在 Bun 代码库里修的，我们都尽量修了。Rust 重写版出现后，我们用同样的 failure mode 测试它。它全部处理得很好。

这篇文章就是这个决定背后的报告：Compute 对 runtime 有什么要求，Bun 1.3 上哪里坏了，canary 上发生了什么变化，以及为什么发布 beta 时选择 canary，比维护一个越来越重的私有 fork 更好。

[Prisma Compute](https://www.prisma.io/blog/launching-prisma-compute-public-beta) 会把 TypeScript 应用托管在和数据库相同的基础设施上。你把一个 agent 指向项目。它会 provision 一个 branch database，应用你的 schema，build 并部署应用，读取日志，修复失败项，然后再次部署。

底层每个应用都运行在 Bun 上。没有事情发生时，实例会 scale to zero。每次部署都会变成一个不可变版本，并拥有自己的 preview URL；每个 database branch 也可以带着自己的应用部署。

这种生命周期会以 benchmark 永远测不出来的方式压迫 runtime。Compute app 不是一个处理一次 request 就退出的脚本。它是一个长期运行的服务。它可能先闲置，被带着内存快照 pause，然后 resume，并且必须立刻处理流量。它的连接池可能还握着 pause 前健康、pause 后已经失效的 socket。即使 JavaScript 抽象还活着，它的 native resource 也必须被释放。

所以当我们谈 runtime reliability 时，我们指的是那些必须连续几个月都保持工作的东西：无论经过多少 request body 和 object body，内存都保持有界；连接池能察觉死连接并重新连接；pause 的实例恢复后仍处于可用状态；request 失败时要明确报错，而不是永远挂起。

这些就是我们测试 Bun 的条件。

内存问题最先出现。

最清楚的公开例子是 [Bun issue #29083](https://github.com/oven-sh/bun/issues/29083)。复现很小：在一个 1 GiB 的 Linux container 里，用 `Bun.S3File.arrayBuffer()` 反复把同一个 S3 object 读进 `ArrayBuffer`，并在每次迭代后用 `Bun.gc(true)` 强制垃圾回收。在 stable Bun 上，RSS 仍然一路上升，超过报告设置的 900 MiB 阈值，并且增长到足以让 container 被 OOM kill。

真正让我们担心的并不是 S3 API 本身，而是这个 bug 暗示的普通 server code 问题：你可以把一个 body 读进内存，丢掉对它的所有引用，强制 full GC，然后仍然看到进程增长到远超 JavaScript heap 能解释的范围。长期运行的服务无处可躲。

连接池是第二个问题，在某些方面更糟。

如果 VM 被 pause 很久后 resume，或者网络在没有警告的情况下杀掉 socket，database pool 必须意识到自己的 idle connection 已经没了。在我们的测试中，Bun 的 SQL pool 没做到。实例从 scale-to-zero 恢复后，pool 仍然把死掉的连接算作 live。新的 query 会排队等待一个永远不会空出来的 slot。没有错误，没有重连尝试；只是一个已经安静停止工作的连接池。

对大多数进程来说，这是边缘情况。对 Compute 来说，这是主路径。Scale-to-zero 是产品的一部分，standby 和 resume 会不断发生。如果客户应用从 idle 中醒来，第一个 query 就永远挂起，那平台就是坏的，不管 pause 前一切表现得多好。

S3 复现给了我们一个干净的对比，因为 issue #29083 后续用同一个脚本跑了两个 runtime。

在 stable release `1.3.14+0d9b296af` 上，泄漏完全按报告复现：默认运行大约在第 96 次迭代时跨过 900 MiB 阈值。更长的验证运行则持续增长，直到 container 被杀掉。

在 canary build `1.3.14-canary.1+172afa532` 上，它没有复现。默认运行结束时没有跨过阈值。即使是 4096 次迭代的长运行，RSS 也保持平稳，采样峰值大约 118 MiB。

连接池结果也指向同一个方向。重写前我们运行的 Bun 版本，在从 scale-to-zero 恢复后，会稳定地让 SQL pool deadlock。在 Rust 重写版上，根据我们的测试，pool 恢复了。

我们想谨慎界定这个说法的范围。我们不是说所有可能的 pool failure 都已经修好。我们说的是：Compute 中我们反复遇到的那个具体 failure，也就是 standby 后 dead idle connection 让 pool 永久卡住的问题，在 canary 上消失了。

结合这两个结果，问题不再是 canary 有没有风险，而是我们更愿意承担哪一种风险。

摆在桌面上的其实只有三个选择。

我们可以在 stable Bun 上发布 beta，明知道它带着客户会遇到的 failure mode。我们不愿意这么做。

我们可以继续维护自己的 patched Bun。我们已经直接在 Bun 代码库里修过一些内存泄漏。但我们背的每个 patch 都会让 fork 更难维护，而且对 Prisma 之外的人没有任何帮助。对一个打算成长的平台来说，私有 runtime fork 不是一个好地基。

或者，我们可以发布在那个已经修复了可复现问题的 canary 上，继续用 Compute 的 workload 测试它，并在可能时向 upstream 贡献。这就是我们做的事。

Compute 是 public beta，而不是一个成熟产品的静默迁移，这一点有帮助。我们仍在打磨体验，也预期会有粗糙边缘。我们希望反馈循环保持很短：在生产环境遇到症状，把它缩小成最小复现，带到 upstream，在 canary 上复测，然后在证据改变时发布。

发布在 canary 上，从来不是在赌新代码天生比旧代码更安全，即使经验证据表明它很可能确实如此。它基于一个简单事实：通过我们测试的 build，比没通过测试的 build 更适合作为基础。

我们对 Bun 的未来感到兴奋，也相信它对我们和用户来说都是正确选择。

关于一个自动翻译出来的 runtime 能不能被信任，已经有很多争论。我们没有试图解决这个争论。我们问的是一个更窄的问题：这个 runtime 在 Compute 的 workload 下表现如何？这个问题可以用测试回答。

从我们的视角看，这次重写带来了具体帮助。Rust 的 ownership model 和 RAII pattern 把一类手动资源清理错误从桌面上拿掉了。即使代码还远不是惯用 Rust，编译器也标出了真实问题。我们也发现，新的代码库比之前那个我们一直 patch 的代码库更容易贡献。

这些都不意味着重写一 merge，工作就结束了。unsafe code 需要 audit，翻译出来的代码需要 review，非惯用部分也需要被拆成足够小、人类能够理解的块逐步重做。关于这次翻译如何完成、团队如何 review 的完整故事，应该放在 Bun 自己的文章里，而不是我们这里。

我们的结论刻意保持克制：在 Prisma Compute 关心的条件下，Rust 重写版比我们一直测试的 stable release 表现更好。这已经足以改变我们发布的内容。

Runtime bug 只有遇到真实 workload 才会变成真实问题。

Benchmark 会告诉你一种真相，最小复现会隔离出另一种真相。但像 Compute 这样的平台生活在两者之间的地带：服务连续运行数天后的内存行为，pool 经历 standby 和 resume 后是否存活，部署和日志在 agent loop 中流动，客户应用必须在基础设施 idle 后又回来时继续工作。我们就是在这个地带发现这些 bug，也是在这里验证了修复。

这正是开源 runtime 需要的反馈循环。我们在生产环境遇到 failure，把它们缩小成别人能处理的报告，然后看到 Rust 重写版解决了其中几个。我们发布在表现更好的 build 上，也会继续把学到的东西送回 upstream。

[Prisma Compute 现在处于 public beta](https://pris.ly/compute-blog-pb)，并且 [beta 期间免费使用](https://pris.ly/pricing-compute)。要试用它，先登录一次：

<figure dir="ltr" tabindex="-1"><div role="region" tabindex="0"><pre><code><span><span>bunx</span><span> @prisma/cli@latest</span><span> auth</span><span> login</span></span></code></pre></div></figure>

然后把你的 agent 指向项目，并告诉它：

<figure dir="ltr" tabindex="-1"><div role="region" tabindex="0"><pre><code><span><span>Deploy your app with @prisma/cli@latest.</span></span></code></pre></div></figure>

agent 会 build 应用，provision 一个 branch database，应用你的 schema，部署到不可变 preview URL，读取日志，修复失败项，然后重新部署。如果过程中有东西坏了，不管是在你的应用里、Compute 里，还是 Bun 本身，请在 Discord 上的 [`prisma-compute` channel](https://pris.ly/discord-compute) 告诉我们。最好的 runtime 反馈始于真实 workload，终于一个别人能修的 repro。
