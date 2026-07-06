---
title: Superpowers 6
date: '2026-07-06T09:48:55.643Z'
sourceUrl: 'https://blog.fsck.com/2026/06/15/Superpowers-6/'
lang: zh
---
你也可以在我们的公司博客阅读这篇文章：[https://primeradiant.com/blog](https://primeradiant.com/blog)

TL;DR：Superpowers 6 快了非常多，而且要达到同样高质量的结果，消耗的 token 少得多。如果你正在 tokenmaxxing，也许可以跳过这个版本；但如果你在意构建速度最高快 50%、成本最高低 60%，那你会喜欢 Superpowers 6。

一周前，我们正准备发布 Superpowers 5.2。为了加入“再多一个改进”，这个版本已经延期过几次。

我们增加了对 Pi、Antigravity 和 Kimi Code 的支持。

我们让 Superpowers 在 Codex、OpenCode 和 Cursor 上工作得更好。

我们重写了一批 Superpowers skills，让它们不依赖特定模型和 harness，这有助于它们在各处都更可靠。我们还写了一份新的贡献指南，说明如何为 Superpowers 增加对新的 coding agent harness 的支持。

我们做了不少工作，让 Visual Brainstorming 更容易使用、更安全，也更可靠。

我们还修复了一大堆 bug，其中包括一个特别讨厌的问题：代码审查 subagent 有时会审查整个分支，而不是只审查单个任务。

这本来会是一次很棒的发布。

然后 Anthropic 发布了（又撤回了）Fable。在我能使用 Fable 的那几天里，我尽可能把它用在了最有价值的地方。

我们从 Superpowers 用户那里最常听到的抱怨，并不是什么秘密：token 很贵，而 Superpowers 会用掉大量 token。用 Superpowers 构建软件也比不用它更慢。“慢”这件事本不该重要，因为它发生在构建过程中由 autonomous subagent 驱动的开发编排阶段。

但它确实重要。慢并不好玩。贵也不好玩。

Superpowers 构建耗时更久、成本更高的许多原因，和它能为这么多用户交付好结果的原因是同一批原因。它会做大量前置规划，确保你的实现可以 hands-off；它会在实现过程中强制严格的 red-green TDD；然后 Superpowers 内部的 orchestrator 会从两个维度审查每一个改动：

1.  agent 是否准确实现了被要求的内容，不多也不少。
2.  工作质量是否达标。

就它正在做的事情本身而言，它注定会比 yolo 一个未经测试的实现然后收工更慢。

但它又慢又贵，从来没有让我*开心*过。

Fable 发布后，我决定看看它能在多大程度上优化 Subagent Driven Development。

我想我当时希望 token 开销能降低大概 15%。

我得到了这个结果。而且远远不止。

我们的第一个切入点，是 coordinator 到 reviewer 的交接。Fable 分析了数千个 Subagent Driven Development session，发现 code review subagent 和 spec-compliance review subagent 在做审查时，有时会运行*大量* git 命令。只是把“如何找到要审查的 commit”的书面说明改成一个 shell script，预先生成一个包含格式良好的 diff 和一些其他 metadata 的 review package，就把 token 开销和 wall-clock time 降低了大约 10%。

那天晚上睡觉前，我告诉 Fable，在我睡觉的时候，看看能不能再从我们的 eval 中削掉 15% 的 wall clock time 和 token cost。

也是在睡觉前，我在内部 Slack 上发了一条消息，说我们应该评估一下：如果把 code reviewer 和 spec compliance reviewer 合并，会发生什么。

我其实不知道自己期待一夜之间会发生什么，但我确实没想到，醒来后会发现 Fable 独立得出了同样的结论，测试了它，并发现它在我们的 eval suite 上省下了我要求的额外 15%。

[![pasted image 20260615 200048](https://blog.fsck.com/assets/2026/06/pasted-image-20260615-200048.png)](https://blog.fsck.com/assets/2026/06/pasted-image-20260615-200048.png)

第二天晚上，我的野心又稍微大了一点。

```
/goal once this is done, run an autoresearch loop to improve cost-efficiency of the superpowers build loop. test with opus as the coordinator. make an hypothesis log. run experiments. run at least 25 experiments.
```

Fable 搭出了一个完整的 autoresearch harness，并跑了一整夜。你可以在 [GitHub](https://github.com/prime-radiant-inc/superpowers-autoresearch) 上查看它构建的东西。

```
**The ==autoresearch== loop is complete: 25 experiments closed** (plus 4 logged as backlog), opus as coordinator throughout, every hypothesis pre-registered with a prediction in the log, now durable at evals `docs/experiments/2026-06-11-build-loop-==autoresearch==.md` (a76ddc9). Loop spend ≈ $165.

 What the loop found

**The ship candidate (E27):** opus controller + elicited plan + conditional haiku implementers + terse reviewer contract + narration recipe + final-review tier pin → **fractals $6.24/$6.60** (the combo config on hand plans was $11.67–14.84). Planted-defect gates 2/3, with the one fail forensically attributed to reviewer variance plus judge strictness — the terse contract was explicitly exonerated by reading the reviewer's reports. The N=5 gate battery is still owed before any of it ships as skill text.

**Wins with numbers:** terse reviewer contract (−41% reviewer output, verdicts intact), narration recipe (−54%, zero variance), conditional implementer tiering (~$0.5–1/run, and E22 proved it correctly _refuses_ haiku on prose plans), fixture-realism replicated on svelte (−24% scope-matched).

**Things now provably dead:** capping controller thinking **backfires** — turns rose 92→138 and output doubled; thinking buys turn efficiency. Plan word budgets slash test content −62% even when code is exempted. Sonnet plan generation keeps fidelity but collapses task structure. Implementation bodies in plans are marginal — tests + interfaces + structure carry the whole load (E28).

**Risk finding worth remembering:** reviewers given only the diff package produce _confident_ spec verdicts that silently redefine "spec" as the global constraints — 0/5 flagged the missing brief. Same failure family as the haiku-reviewer advocacy.

**Six leads closed as already-optimal** (report reads, cache health, reviewer floor, haiku fixers, todo bookkeeping, dispatch re-derivation) — recorded so nobody re-buys them.

Three of my own measurement bugs were caught and corrected mid-loop by the manual-inspection discipline (a grep counting template echoes as self-review catches, a harness that never inlined the diff, a scorer regex missing newlines) — one retracted verdict was re-measured clean (−74% became the honest −41%).
```

长话短说，在大约 36 小时的工作、以及如果没有补贴本会花掉 650 美元的 token 开销之后，我们的 Anthropic eval benchmark 看起来已经把 Superpowers 构建的 wall-clock runtime 降低了 50%，token 开销降低了 60%。

然后我们用 Codex 跑了 eval。结果并不好。我原本担心它们可能不会呈现同样幅度的改进，但结果是*完全没有*改进。

挖了几分钟后，我们找到了罪魁祸首。在 Codex 上，eval 还没有和宿主操作系统充分隔离……所以我们一直在 benchmark Superpowers 5.1.0。

稍微折腾了一下之后……对，所有结果都站住了。

[![pasted image 20260615 195959](https://blog.fsck.com/assets/2026/06/pasted-image-20260615-195959.png)](https://blog.fsck.com/assets/2026/06/pasted-image-20260615-195959.png)

最大的改进来自三件事：合并 spec compliance 和 code quality review agent；预先烘焙交给 reviewer 的 review “packet”，让它们很少需要运行 git；以及调整我们给 orchestrator 的指导，让它更清楚某类任务需要什么样的 agent。

我们一直在努力打磨 Superpowers 的 eval suite。没有它，我们就不可能衡量和测试这些改动。这个 suite 仍然相对年轻，但它已经让我们能够在多种受支持的 harness 上改动和测试 Superpowers，并量化这些改动在越来越多 coding agent 上产生的效果。你可以在这里找到它：https://github.com/prime-radiant-inc/superpowers-evals

我们对自己（以及我们的机器人伙伴）在 Superpowers 6 中做出的改进感到非常自豪。我们认为你会喜欢这个新版本。

你现在就可以从 [https://github.com/obra/superpowers](https://github.com/obra/superpowers) 安装它。接下来几天，它也会逐渐进入各个 first party plugin marketplace。

PS：我们正在招聘！如果你认识应该全职从事 Superpowers 工作的人，请把这个职位分享给他们：[https://primeradiant.com/jobs/superpowers-community-engineer/](https://primeradiant.com/jobs/superpowers-community-engineer/)
