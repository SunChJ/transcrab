# 为什么软件工厂会失败：把灯光重新打开

这篇是 [《Why Software Factories Fail》](https://x.com/dexhorthy/status/2080697380379427275) 的第二部分。

这篇文章的演讲版已发布在 YouTube：[https://www.youtube.com/watch?v=Ib5GBkD555M](https://www.youtube.com/watch?v=Ib5GBkD555M)

## 把灯光重新打开

在 [第一部分](https://x.com/dexhorthy/status/2080697380379427275) 中，我深入解释了为什么模型长期维护代码库质量是不可靠的。为什么无论多少“工具工程”或“tokenmaxxing”（疯狂堆token），都无法解决模型训练和基准测试带来的问题。为什么把“模型当评审”当作代码质量的标准，没法像有些人说得那样奏效。

目前，评审者仍然是你——所以我们要把代码评审找回来。

![](https://pbs.twimg.com/media/HN8aZGOaQAAf7Nq.jpg)

我们会回到 AI 之前就一直在做的事：在开始前先做一点[前置规划](https://github.com/humanlayer/advanced-context-engineering-for-coding-agents/blob/main/wsff.md#front-loading-alignment)，以降低后续遭遇漫长、困难评审的概率。

我们会寻找“杠杆点”，并用 AI 在四个阶段帮忙：

- 产品需求
- 系统架构
- 程序设计
- 垂直切片

## 产品评审

一切从产品评审开始：一份简短文档，明确我们要做什么、为什么要做。目标是把两三句话或一段长长的语音乱谈，转成半结构化内容。

第一步，先对齐要解决的问题——用用户的语言说出真实的用户痛点。第二步，明确“成功是什么样子”——上线后我们能根据什么判断这件事值得做。理想情况下这是用户结果，比如“可以更快完成 XYZ 工作流”，或“更早达到入门里程碑 ABC”。有时也可以是更底层的指标，如错误率、延迟数字，或只是“关于 X 的支持工单不再出现”。

我们尽量让讨论停留在产品层面，而不是过早陷入技术细节。因为我经常在产品和工程之间穿梭，经常会不自觉地往技术上钻。出现这种情况时，我会先记下来，留到后续阶段再说，先回到用户真正体验到的内容。如果技术决策阻塞了产品决策，那就先提交当前结论，转入架构讨论，或做更多
可行性原型研究（[相关视频](https://www.youtube.com/watch?v=Zx_GOhGik0o)）。

而且，大多数内容都在“用户看到什么”，所以我通常不去单纯文字描述，而是直接做一个 mockup。一个简陋的 HTML 原型往往能比三段解释更快解决争议。

这是一个正在进行中的真实例子：文档先用 JSON 大纲钉住功能点，再给出两个实际页面的粗略 HTML mockup：

[https://x.com/dexhorthy/status/2078592010852982977](https://x.com/dexhorthy/status/2078592010852982977)

当然，并非每一件事都需要产品评审。文案微调、一次性脚本、明显可复现的 bug，依然可以直接一次性丢给 agent 来处理。我们把这种流程留给那些“模型误解意图”代价很高的变更。

在这篇与系列中，我会要求开发者自行选择是否开启评审。如果你想在评审阶段省点时间，就让会 review 这个 PR 的人提前参与，并在他面前走一遍产品/技术规格（可异步用文档评论，像我们在 humanlayer 这样的平台上会这么做，但你也可以在 GitHub/Notion/Plannotator 等工具里轻松完成）。

## 系统架构

一旦产品评审定稿，我们再做系统架构。这个思路并不新鲜，连不少“vibe coder”都开始认可这种做法。

## 如果你想在评审时省时间，就提前找未来会 review 这个 PR 的那个人，在编码前先过一遍产品和技术规格。

在这个阶段，我们对齐各个服务、端点、schema、队列与存储之间的交互方式，但不深入 [program design](https://github.com/humanlayer/advanced-context-engineering-for-coding-agents/blob/main/wsff.md#program-design) 的细节。为了最大化人与模型的沟通带宽，我们这里大量使用可视化，比如时序图：

![](https://pbs.twimg.com/media/HN8bdRDawAApcQf.jpg)

接口/端点形状：

![](https://pbs.twimg.com/media/HN8biDkbEAAOedw.jpg)

数据模型与转换：

![](https://pbs.twimg.com/media/HN8doU7aQAAT_PR.jpg)

Mermaid 在这里也可以用，但有时会用过头，也容易让你误以为“已经对齐”了。架构层面确实有很高杠杆，能提前揪出不少模型会犯的坑；但光有它并不足以生成高质量代码。要做到这一点，还得做程序设计。

## 程序设计

完成架构后，我们开始一个我认为在 agent coding 中被严重低估的环节：程序设计。

很多人以为架构定好后，模型就能“自己做完”。你可以试一次，但结果可能不尽如人意。

我观察到有效的方式是：在任何人（人类或模型）写实现之前，把目光从架构再往下走一层，进入代码形状：类型、方法签名、程序布局和调用栈。

我们最初版本的程序设计能力做得不够好，难读、耗脑。我们试过 mermaid，它有价值，但我们真正喜欢的是伪代码的轻量化可视化：

任何编排或控制流变化都可以先画 call stack 树。需要强调差异时，用 diff 语法最直观：

![](https://pbs.twimg.com/media/HN8dxzXbYAAErzv.jpg)

[Dillon Mulroy](https://x.com/dillon_mulroy/status/2059985696148849025) 提到过在规划里使用调用图，我认为这思路很对。

文件树差异图：保持对代码库布局和文件归属的感知。

![](https://pbs.twimg.com/media/HN8d1U8bMAAaIXU.jpg)

关键新增函数的类型与签名——那些对架构文档来说太“内部”、但模型仍会踩坑的部分。

![](https://pbs.twimg.com/media/HN8d3oebMAEeQpJ.jpg)

这些都不需要很长时间就能做出来（模型先给出草稿，你再和它对线），而且每一项本来都该在 code review 里“隐式决策”——而这正是最贵的改动时机。

## 垂直切片

接着我们会做我称之为“垂直切片”的做法——Matt Pocock 和我在 2026 年一月也聊过这个：

[关于垂直切片 / tracer bullets 的直播聊天](https://www.youtube.com/live/NKu3T9FUjmU?si=6BGnZLOkmuIPTjzh&t=2230)，也常被称作 [tracer bullets](https://basecamp.com/shapeup/3.2-chapter-11#integrate-one-slice)。

模型更偏爱我所谓的“水平计划”：按技术栈顺序堆起来——

1. 数据库迁移
2. 服务层
3. API
4. 前端

实际执行时，这意味着你很难在开发过程中“随手触到”完整的解决方案。你当然可以用代码做测试，但在我几乎做过的每个功能里，阅读测试只是开始，更多时候是边改边在浏览器里看效果，或边改边用 curl 验证。

AI 时代之前，几乎没人会一口气写 2000 行甚至 500 行代码而中途不做任何检查。

我花了不少时间才意识到这点。
我以前总是从中间开始向外扩展。大致是：

1. 先定义 API contract，返回 mock 数据，用 curl 测试
2. 再写前端消费 mock 数据，在浏览器里迭代和打磨
3. 再把 API 接到 services 层（services 返回 mock 行为）
4. 再加数据库迁移，并把 services 接上数据库
5. 再加大量业务逻辑
6. 再补一堆错误处理

并且每一步我都会测试、迭代、打磨。

如果我非常看重这段代码，或者对模型在该区域的产出持保留态度，我也会在每一步做 review。检查和纠偏 100 到 200 行，往往比最后一次性面对 2000+ 行不知道坏在哪儿便宜得多。

有点啰嗦，但再提醒一次：这是我认为更省时间的地方。

人类如果总想着“尽量一次到位”——比如每次都要 2000 行、500 行才去 review——通常是效率错觉。

而且模型在没有人类干预的情况下，很难自己形成这样的计划；不同代码库、不同任务差异太大，这种思路也难以泛化。我更愿意在这里保留在场。

相信我。
如果我能把这部分思考外包掉，那么就算是有利可图，很多坏事仍会发生；真正该做的是把“思考”交给人来推动，再让 AI 放大它。

30 分钟的规划，能省掉数小时的 review。

所以我们把人类一定要参与的流程，至少在以下场景保留：

1. 产品设计
2. 系统架构
3. 程序设计
4. 垂直切片

显然，我们并不是每一个需求都做完整流程（见文末 Side Quest）。我大致会这样分配：

- 约 40% 任务走一次性处理，或再加一两轮轻量反馈
- 中等任务通常会在一份完整设计文档里合并产品与系统设计，不再拆成多阶段
- 大任务会走完整流程；而对于大规模重构之类明显不适合写“产品需求”的场景，通常会跳过产品部分

多数时候，我会一次让模型做 1 到 3 个切片，并边做边 review。无论是内部实现还是最终行为，早点纠偏会比在 2000+ 行代码后才发现问题便宜得多，也清楚得多。

## 你可能会觉得 PR 太多

你并不是真有太多 PR。
你有太多“烂”PR。

自 AI 时代之前，我们就已经 review 过大量需要返工的 PR 了。

但一份很好的 PR 会很舒适。你从头看到尾，代码清晰，遵循了你此前做过的决策和讨论，也符合你对软件“应该怎么写”的坚持。

反过来，如果一个 PR 需要 20% 重做（我觉得这已经很宽松了，大多数一次性 AI PR 更接近 50% 重做），那对提交者和 reviewer 都是智力和情绪负担。
（即便提交者是 AI，通常也有人发起这条工作、给了 initial prompt、或者至少会关心产出结果。）

为了省你点时间（我们快结束了），我在一个 side quest 里也写了更多：

["时间都花到哪里去了"](https://github.com/humanlayer/advanced-context-engineering-for-coding-agents/blob/main/side-quests/where-does-the-time-go.md)

## 一个约束理论（2026 版）

这篇核心观点可能会让你有点沮丧：
“现在我们仍然被困在读代码这件事上。”

我一度很期待那种世界：我们只要下达需求，就能让模型“自己做完”，不读代码，也能产出随时间演进、不会崩坏的生产级软件。

但我在这里想强调的，大概只有“约束”二字。
模型擅长某些事，也不擅长某些事。既然如此，我们该如何依据这些约束优化流程？

模型擅长某些事，也不擅长某些事。我们该如何依据这些约束优化流程？

你很可能太忙于想要 10 倍甚至 100 倍提速，逼自己相信“代码质量已不再重要”；其实你完全可以接受这些约束，改为更安全地提升 2-3 倍效率。

我想给的收尾建议很简单：

1. 先深入理解约束，通过大量和模型协作建立直觉
2. 在约束边界内优化系统
3. 寻找杠杆点
4. 读代码

就是这样。
如果你想继续看完这一段，我就让你自己翻到下一部分吧。希望这能帮你避开一些灾难，至少也希望你看这些小动画时玩得开心。

谢谢阅读

-dex

## PS 我们对这事很执着

我们正在做 [humanlayer.com](https://humanlayer.com/)，一个 agentic IDE 与协作平台，目标是帮助你在保持接近人类水平代码质量的前提下，加速 2-3 倍。

我们的方向是两件事：一是“软件工厂的构建模块化”，二是“更好地验证软件可维护性”（也许也包括更好的模型）。

HumanLayer 对最多 3 人的小团队免费。如果你想了解入门方式，可以去我们的 [discord](https://hlyr.dev/discord) 找我们，或发邮件到 [founders@humanlayer.dev](mailto:founders@humanlayer.dev)。

快速感谢 [@calvinfo](https://x.com/@calvinfo) 的启发，感谢联合创始人 [@0xBlacklight](https://x.com/@0xBlacklight)，感谢 [@swyx](https://x.com/@swyx) 和 [@aiDotEngineer](https://x.com/@aiDotEngineer) 团队给我提供了探索这些想法的舞台，也感谢所有支持我们的客户、投资人、朋友和家人。

如果你想深入了解，我几乎会一直聊下去；你可以从这篇文章里的链接里找到这些内容，以及它在播客、长篇白板等场景中的延展。

## PPS 其他资源

播客与文章：

- [Dex 与 Gergely 讨论上下文工程与软件工厂（The Pragmatic Engineer，2026年7月）](https://www.youtube.com/watch?v=Usufn8IQJgw)
- [Dex 与 Matt Pocock 谈 evergreen AI 编码建议（以及 ralph loops）— 2026年1月](https://www.youtube.com/watch?v=NKu3T9FUjmU)

AI That Works 章节：

- [Benchmarks prove nothing](https://www.youtube.com/watch?v=X5mI1ZVxaIc)
- [Product Specs for AI Coding](https://www.youtube.com/watch?v=0LPBw3NO3Jc)
- [Learning Tests for better backpressure](https://www.youtube.com/watch?v=Zx_GOhGik0o)
- [Applying 12-factor agents principles to AI coding](https://www.youtube.com/watch?v=qgAny0sEdIk)

链接汇总：

- [《Why Software Factories Fail》主旨演讲 — AI Engineer World's Fair 2026](https://hlyr.dev/wsff-live)
- [StrongDM 的 lights-off software factory](https://factory.strongdm.ai/)
- [OpenAI: Harness Engineering（2026年2月）](https://openai.com/index/harness-engineering/)
- [Ryan Lopopolo 讲解 Symphony（演讲，2026年4月）](https://www.youtube.com/watch?v=am_oeAoUhew)
- [Mario 在 AI Engineer Europe 的分享：《在烂代码世界里造 PI》](https://www.youtube.com/watch?v=RjfbvDXpFls)
- [FT：AI coding agent 失误导致的亚马逊故障](https://www.ft.com/content/00c282de-ed14-4acd-a948-bc8d6bdb339d)
- [Matt Pocock：codebases 正在散架](https://www.youtube.com/watch?v=3MP8D-mdheA)
- [Faros AI：AI加速的过山车报告](https://www.faros.ai/research/ai-acceleration-whiplash)
- [Advanced Context Engineering for Coding Agents（演讲 8/25）](https://hlyr.dev/ace)
- [No Vibes Allowed（演讲 11/25）](https://hlyr.dev/nva)
- [Everything We Got Wrong About RPI（演讲 3/26）](https://hlyr.dev/qrspi-mlops)
- [Awesome-RLVR - 强化学习资源](https://github.com/opendilab/awesome-RLVR)
- [Advanced Context Engineering for Coding Agents（文字版）](https://github.com/humanlayer/advanced-context-engineering-for-coding-agents/blob/main/ace-fca.md)
- [12-Factor Agents](https://hlyr.dev/12fa)
- [Addy Osmani 关于 vibe-coding 与可维护性](https://x.com/addyosmani/status/2066595308629594363)
- [1968年北约软件工程会议（NATO）](http://homepages.cs.ncl.ac.uk/brian.randell/NATO/nato1968.PDF)
- [DoD DevSecOps 参考设计（PDF）](https://dodcio.defense.gov/Portals/0/Documents/Library/DevSecOpsReferenceDesign.pdf)
- [Ramp 的 coding-agent 平台](https://infoq.com/news/2026/01/ramp-coding-agent-platform/)
- [Stripe: Minions，端到端一次性编码代理](https://stripe.dev/blog/minions-stripes-one-shot-end-to-end-coding-agents)
- [WorkOS: Project Horizon](https://workos.com/blog/project-horizon)
- [Brex（Latent Space）](https://www.latent.space/p/brex)
- [Dan Shapiro：软件工厂的五个层次](https://www.danshapiro.com/blog/2026/01/the-five-levels-from-spicy-autocomplete-to-the-software-factory/)
- [Simon Willison 关于 StrongDM 软件工厂](https://simonwillison.net/2026/Feb/7/software-factory/)
- [“Boil the ocean”](https://garryslist.org/posts/boil-the-ocean)
- [Shotgun surgery（重构军刀，refactoring.guru）](https://refactoring.guru/smells/shotgun-surgery)
- [John Ousterhout ——《A Philosophy of Software Design》](https://web.stanford.edu/~ouster/cgi-bin/aposd.php)
- [Robert C. Martin ——《Clean Code》](https://www.oreilly.com/library/view/clean-code-a/9780136083238/)
- [Martin Fowler ——《Refactoring》](https://martinfowler.com/books/refactoring.html)
- [aider](https://aider.chat/)
- [cline](https://cline.bot/)
- [codebuff](https://codebuff.com/)
- [SWE-Agent 论文（2024）](https://arxiv.org/abs/2405.15793)
- [OpenAI Codex 演讲（11月）](https://www.youtube.com/watch?v=wVl6ZjELpBk)
- [Calvin French-Owen —— AI Council 分享](https://www.youtube.com/watch?v=q-ntX4DLW_c)
- [SWE-bench Multilingual（数据集）](https://huggingface.co/datasets/SWE-bench/SWE-bench_Multilingual)
- [AIE Worlds Fair 2026 - The Great Loops Debate（“热度跑在纪律前面”）](https://www.youtube.com/watch?v=c35YoMdnI78)
- [SWE-Marathon（Abundant AI）](https://www.swe-marathon.org/)
- [DeepSWE（Datacurve）](https://deepswe.datacurve.ai/blog/deepswe)
- [Frontier Code（Cognition）](https://cognition.com/blog/frontier-code)
- [变异测试（Wikipedia）](https://en.wikipedia.org/wiki/Mutation_testing)
- [Dillon Mulroy 讲调用图在规划中的用途](https://x.com/dillon_mulroy/status/2059985696148849025)
- [Dex × Matt Pocock：vertical slices / tracer bullets（2026年1月直播）](https://www.youtube.com/live/NKu3T9FUjmU?si=6BGnZLOkmuIPTjzh&t=2230)
- [“思考的辛苦不能被外包” （Jake Nations）](https://www.arthropod.software/p/vibe-coding-our-way-to-disaster)