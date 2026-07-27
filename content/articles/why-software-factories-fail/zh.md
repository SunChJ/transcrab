---
title: 软件工厂为何失败
date: '2026-07-27T07:12:09.793Z'
sourceUrl: 'https://x.com/dexhorthy/status/2080697380379427275'
lang: zh
---
又名：仅靠 Harness 还不够

更新：本文的演讲版已上线 YouTube：[https://www.youtube.com/watch?v=Ib5GBkD555M](https://www.youtube.com/watch?v=Ib5GBkD555M)

系列文章第一篇。第二篇在这里：https://x.com/dexhorthy/status/2081058573556306030

## 看来我们现在都开始堆循环了

所有人都在争先恐后地把 AI 编程投入生产。关于「循环工程」的讨论已经很多，而眼下的主流看法似乎是：我们大概应该再多写几个循环。

![](https://pbs.twimg.com/media/HN8Ped8aEAAF-zc.jpg)

[StrongDM 介绍过他们的无人值守软件工厂](https://factory.strongdm.ai/)：没有人类读代码，也没有人类写代码。

这套叙事大概是这样的：

1. 你才是瓶颈。
2. 模型已经足够好了。
3. 代码是免费的。
4. 多交付点东西就完了。
[OpenAI 的 Ryan Lopopolo](https://x.com/_lopopolo) [今年 2 月写过相关文章](https://openai.com/index/harness-engineering/)，并在 [4 月做了一场演讲](https://www.youtube.com/watch?v=am_oeAoUhew)，介绍 OpenAI 的软件工厂 Symphony。

这些人都聪明得不得了，我也非常尊敬他们。但若要用最愤世嫉俗的方式来解读，这无非又是一个借口：往那门批量制造 AI 垃圾的大炮里再塞些风投资金。

## 呃……进展挺……顺利的

我们的朋友 [Mario](https://x.com/badlogicgames) 登上 AI Engineer Europe 的讲台，[恳求大家慢一点](https://www.youtube.com/watch?v=RjfbvDXpFls)——因为一些按理说绝不该因编程智能体失误而宕机的公司，怎么说呢……[确实正因编程智能体失误而宕机](https://www.ft.com/content/00c282de-ed14-4acd-a948-bc8d6bdb339d)。

借用 [Matt Pocock](https://x.com/mattpocockuk) 的说法，[代码库正在以前所未有的速度分崩离析](https://www.youtube.com/watch?v=3MP8D-mdheA)。

我一直没能找到 StrongDM 发布的任何确凿数据或结论，说明那个「黑灯工厂」究竟运转得怎样。他们的[天气报告](https://factory.strongdm.ai/weather-report)只在今年 2 月到 6 月间零星更新过几次。补充：[7 月 23 日，团队在 Hacker News 上有过一些交流](https://news.ycombinator.com/item?id=49026625)——听起来我们可能很快就会看到更正式的进展报告！

[Faros AI 的团队](https://www.faros.ai/research/ai-acceleration-whiplash)发布了一份报告：自从我们[2](https://github.com/humanlayer/advanced-context-engineering-for-coding-agents/blob/main/wsff.md#user-content-fn-1b-f56fe9a973fe7c6ebb6a9673c1bc64cb)在今年 1、2 月纷纷用上这些 AI 编程工具后，Pull Request 的评审质量大幅下降。

- 评论更多、更长，而且大量 PR 完全未经评审就被合并。
- 事故大幅增加。
- 每位开发者产生的 Bug 大幅增加。
![](https://pbs.twimg.com/media/HN8PswLa8AApp4d.jpg)

与其说这份报告提供了一把可验证的「确凿证据」，不如说它展示了一种相关性信号（没错，我是故意选这个词的；可别让我开始吐槽 Claude 味儿的文风）。本文的重点本就是警惕垃圾数据，但根据我的亲身观察，它所指出的大方向似乎是对的。

## 「是你拿的姿势不对」（并不是）

很多人会告诉你，这是能力问题——如果你得不到好结果，那是你自己的错。

但不管你决定怎么……呃……拿它，我敢保证，总会有人告诉你：如果疯狂堆 Token 对你不管用，那就是你的能力有问题。你只需要花更多 Token，别再读代码了。如果你才刚走到这一步，相信我，这也是必经阶段。[去年夏天我也这么想](https://hlyr.dev/ace)。

很伤我自尊的是，我以前讲过一些「怎样才能拿得更好」的蠢话，结果被录了下来，如今在 YouTube 上的累计播放量大约有一百万。我不是在炫耀；我说这件事，只是想说明自己长期深入研究过怎样把编程智能体用好，并且确实发现了一些被许多人认为很有用的方法。

- [面向编程智能体的高级上下文工程](https://hlyr.dev/ace)
- [拒绝凭感觉——在复杂代码库中解决难题](https://hlyr.dev/nva)
- [关于 RPI，我们都错在了哪里](https://hlyr.dev/qrspi-mlops)
总之，我们被迫忍受了网上无休无止的「加大 Token 就完事」论调，而它给出的承诺可以简洁概括为：只要 Harness 工程做得够好，我们就能两全其美：

- 速度提升 10 到 100 倍；
- 质量依然很高；
- 而且谁都不必再做那件我们都讨厌的事——代码评审。
我们只要配置更多 Linter，再往足够多的 PR 评审机器人里撒几句「对抗式评审」之类的魔法咒语，软件自然就会顺顺利利地把自己造出来。

## 这不是能力问题

我想说服你的是：无论投入多少 Harness 工程，堆多少循环，都解决不了一个本质上属于模型训练的问题。

为了弄明白这一点，我不得不深入研究编程模型究竟是如何训练和评估的——既包括 [RLVR](https://github.com/opendilab/awesome-RLVR)，也包括基准测试。

本文会依次讨论：

1. 软件工厂的历史可以追溯到 1968 年：它经历了怎样的演变，AI 又改变了什么？
2. 为什么模型即使能在基准测试中拿到顶尖成绩（甚至是那些全新的「前沿」基准），依然能制造堆积如山的垃圾代码？
3. 尽管如此，你仍然可以在不把代码库付之一炬的前提下快速推进。
我会尽量拨开那些每天冒出来的新技能插件所制造的炒作，以及那场「AI 精神错乱式堆 Token 建议」的瘟疫；不点名任何具体技能或框架，只从一般规律出发，谈谈哪些做法真正有效。

视频版：本文以我在 [AI Engineer World's Fair 2026 上的主题演讲](https://www.youtube.com/watch?v=Ib5GBkD555M)为基础，并扩展了其中的内容。

感谢 [@addyosmani](https://x.com/addyosmani)、[@CyrusNewDay](https://x.com/CyrusNewDay)、[@HamelHusain](https://x.com/HamelHusain)、[@zeeg](https://x.com/zeeg)、[@dillon_mulroy](https://x.com/dillon_mulroy)、[@nayshins](https://x.com/nayshins) 和 [@jeffreyhuber](https://x.com/jeffreyhuber) 为本文提出反馈。

## 插一句：这和 Vibe Coding 没有关系

[Addy Osmani](https://x.com/addyosmani/status/2066595308629594363) 理清了一个值得特别指出的问题：

一个开发者用 Vibe Coding 做了个可能总共只有十几个人会运行的业余项目；另一支团队则要让一套已有十年历史的企业系统再撑过一个季度。两者几乎没有任何值得一提的共同约束，而市面上流传的大多数建议，其实不过是其中一方在教另一方该怎么活。

如果你喜欢 Vibe Coding，请继续享受。我自己也常用这种方式做不少东西；只不过我同时还维护着许多生产软件，也通过 HumanLayer 帮助另外数千名工程师做同样的事。因此，接下来的内容面向的是那些要在复杂代码库中解决棘手问题的人。

我常听人用「棕地项目」来描述这种差别。过去，这通常是指某个有十年历史的 Java 项目。但以我们如今的交付速度，一套由智能体构建的代码库可能只需三到六个月就会开始步履维艰——速度逐渐变慢，而你添加新功能的方式也不得不随之改变。

## 软件工厂简史

我的整个职业生涯都在构建和研究软件工厂，但直到最近才知道：「软件工厂」这个词最早可以追溯到 [1968 年的一场 NATO 会议](http://homepages.cs.ncl.ac.uk/brian.randell/NATO/nato1968.PDF)——「软件工程」一词也诞生于同一场会议。

此后唯一让我觉得特别有意思的事是，[美国国防部写了一份 31 页的 PDF，大意是 DoD 应该开始把 Jenkins 用得更好之类的](https://dodcio.defense.gov/Portals/0/Documents/Library/DevSecOpsReferenceDesign.pdf)。

## 2022 年的软件工厂

让我们把「软件工厂」的定义锚定在 2022 年，也就是 AI 爆发前夕。在一个典型的软件工厂里：

- 人来决定要构建什么——工程师、产品经理和领导层共同推动愿景。
- 任务进入追踪系统——Linear、Jira，随便什么；它本质上是一台描述待办事项状态的状态机。
- 有人领取工单并完成开发——期间可能顺便做些手动或自动化测试。
- 提交 Pull Request——运行自动化检查，由人类评审代码，或许还会有人把代码拉到本地测试。
- 有问题吗？回到「有人开发这个东西」那一步。
- 发布到生产环境——让它真正接触用户。
- 加入监控——围绕「出问题时凌晨 3 点呼叫工程师」这件事，已经形成了一整个产业。
- 用户抱怨——提出需求、发现 Bug、提交功能请求 → 团队再把它们加回追踪系统。
如此循环往复。我们甚至还没谈到 AI，这张图里就已经有好几个循环了。

## 把对齐工作前置

几十年前，团队就已经明白了一件事：开发需要数小时甚至数天，评审也是如此。

![](https://pbs.twimg.com/media/HN8RQdDakAA1V99.jpg)

所以，我们把工作前置——规划、架构提案、Sprint 计划——由整个团队一起完成。这意味着：

- 减少返工，因为任何人写代码之前，大家就已经达成一致；
- 减少逐行评审的时间。如果你读过一篇很长但完成度很高的 PR，就会知道：当实现几乎无可挑剔时，评审可以快得惊人。
![](https://pbs.twimg.com/media/HN8RTX9bwAAMpir.jpg)

稍后我们会回到这里。现在，先看看把智能体编程引入其中后会发生什么。

## 智能体软件工厂

现在，几乎每家公司——

- [Ramp](https://infoq.com/news/2026/01/ramp-coding-agent-platform/)
- [Stripe](https://stripe.dev/blog/minions-stripes-one-shot-end-to-end-coding-agents)
- [WorkOS](https://workos.com/blog/project-horizon)
- [Brex](https://www.latent.space/p/brex)
今年大部分时间都在解释自己如何建起了一座智能体工厂，交付的代码中约有 75% 来自智能体。

智能体工厂基本上就是把「有人开发这个东西」替换成「智能体开发这个东西」——里面当然还包括编排、Harness、沙箱、模型、Computer Use 等等。我不会深入这些细节；坦白说，我已经看烦了，我相信你也一样。

![](https://pbs.twimg.com/media/HN8RZ2vbAAATZJh.jpg)

当智能体开始负责开发：

- 开发耗时从数小时或数天缩短到几分钟或几小时。
- 评审仍需数小时或数天。人类依然要阅读代码并测试改动。于是，评审成了新的瓶颈。
![](https://pbs.twimg.com/media/HN8RbyUa4AAPx8a.jpg)

那就再把评审也加速：

- 智能体代码评审，用来发现风格、Bug 和安全问题；
- 智能体回归测试，通过浏览器和 Computer Use 从外部反复检验应用，完成后或许还会给你发一段可爱的小视频。
![](https://pbs.twimg.com/media/HN8Rd9VbYAA-z7L.jpg)

现在评审更快了，但它很可能依然是瓶颈。不过，我们还可以增加更多循环。

接下来，你可以把事故也接入工厂。不必再在凌晨 3 点呼叫某个人；他醒来时，面前可能已经有一个修复问题的 PR。

![](https://pbs.twimg.com/media/HN8RgOcasAA3KGC.jpg)

我们也可以把用户反馈接入工厂。用户提出需求，系统就自动把它造出来。

![](https://pbs.twimg.com/media/HN8Rh7gaEAAqx76.jpg)

到了这一步，工作就只剩两个问题：你能往队列里塞多少东西？又能以多快的速度评审和测试产出？

![](https://pbs.twimg.com/media/HN8RjrBaMAAj5CR.jpg)

这就把我们带到了无人值守软件工厂。

## 无人值守软件工厂

[Dan Shapiro 创造了这个说法](https://www.danshapiro.com/blog/2026/01/the-five-levels-from-spicy-autocomplete-to-the-software-factory/)，[Simon Willison 则介绍过 StrongDM 的实现](https://simonwillison.net/2026/Feb/7/software-factory/)——在那里，我们不再阅读代码。

你望着自己漂亮的软件工厂，却发现它被那个烦人的代码评审环节毁了。于是你说：让人类逐项阅读每一次改动？谢了，不必。

![](https://pbs.twimg.com/media/HN8RmztaEAAOd9g.jpg)

于是你把这一步扔掉，将精力投入其他地方：

- 投资测试，并让智能体测试自己的工作；
- 投资沙箱和编排；
- 投资自动化评审；
- 投资监控；
- 投资发布机制；
- 投资用户反馈信号的收集。
![](https://pbs.twimg.com/media/HN8RoxQbEAAcloG.jpg)

至此，工作真的只剩下一个问题：我们能让智能体构建多少东西？我们究竟想把[多大一片海洋煮沸](https://garryslist.org/posts/boil-the-ocean)？

## 一切一定会非常顺利（才怪）

![](https://pbs.twimg.com/media/HN8Wwh1akAAgZBY.jpg)

我要提出一个可能颇具争议的观点：无人值守工厂行不通。

下面就来谈谈软件工厂为何失败。

## 我们试过了

2025 年 7 月，我们全面转向无人值守模式。智能体只需阅读规格和工单，所有中小型任务都交给后台智能体——整套方案全上。

如果你曾认真尝试几个月，应该已经知道结局。你迟早会遇到至少一个足够棘手的问题，任凭最先进的提示词和工作流，智能体都解决不了。

- 你做了深入、具备上下文感知能力的研究，把所有相关信息整理后放进模型最擅长处理的上下文区域；
- 你让智能体用十种不同的方法尝试复现问题。
最终你只能咬咬牙，重新钻进那个自己已经三个月没读过的代码库，试着弄清究竟哪里坏了。

而与此同时：

- 你的网站挂了；
- 你的用户火冒三丈；
- 如果你和我差不多，你自己也痛苦不堪——只能埋头阅读那些被你放进系统里的垃圾代码。
第一次发生时，我甩甩头就把它抛在脑后。虽然刚刚花了差不多整整两周，在 Claude 式意大利面代码里艰难穿行，但我仍觉得「这点下行风险值得拿来换速度」。到 11 月大约第三次遇到同样的事时，我们认定从头重写反而更容易。于是，我的联合创始人整整两周泡在 VS Code 里（甚至不是 Cursor），亲手把所有模式一点点搭了出来。

## 模型会随时间推移降低代码库质量

我真正想说的是：模型存在一个短板。如果缺少相当程度的人类引导，它们无法长期维持并提升代码库质量。[4](https://github.com/humanlayer/advanced-context-engineering-for-coding-agents/blob/main/wsff.md#user-content-fn-3-f56fe9a973fe7c6ebb6a9673c1bc64cb)

我所说的可维护性，具体指的是这种情况：想修改代码库的一部分而不破坏另一部分，会变得极其困难。这就是 [Martin Fowler 所说的「霰弹式修改」](https://refactoring.guru/smells/shotgun-surgery)。

关于可维护性，我不准备再多说。你可以去读许多相关著作：

- [John Ousterhout 的《A Philosophy of Software Design》](https://web.stanford.edu/~ouster/cgi-bin/aposd.php)
- [Robert C. Martin 的《Clean Code》](https://www.oreilly.com/library/view/clean-code-a/9780136083238/)
- [Martin Fowler 的《Refactoring》](https://martinfowler.com/books/refactoring.html)
那么，模型为什么做不好软件可维护性？

## 「但模型后来肯定变强了吧」

看到这里，你可能已经忍不住想说：可是 Dex，从去年 7 月到现在，模型肯定已经进步很多了吧？

确实如此——某些方面进步很大，另一些方面却和从前差不多。

- 解决一次性问题，或用 Vibe Coding 做一个全新的营销网站？没错，强得多。
- 持续提升代码库质量？据我所见，并没有好多少。
![](https://pbs.twimg.com/media/HN8RwLqbQAA-pQT.jpg)

我证明不了这一点，你也证明不了。目前并没有优秀的基准测试，能够衡量模型维持代码库质量的能力。（稍后会进一步讨论这方面的进展。）

根本不存在衡量模型维持代码库质量的优秀基准测试

但如果你已经和编程智能体共事了一段时间——而且很多人都在发帖谈论这件事——你可能已经有同样的直觉：随着时间推移，它们往往会把事情弄得更糟，让代码库越来越难维护。

为了弄清原因，我想把视角拉远，回头看看第一个真正出色的编程智能体。

## Claude Code 的胜出，靠的是在 Harness 内进行强化学习

不到一年，Claude Code 的营收就从零增长到约 40 亿美元——现在似乎已接近 90 亿美元。

![](https://pbs.twimg.com/media/HN8R0_naMAApmn2.jpg)

这多少有些不可思议，因为当时已经存在不少优秀的 CLI 智能体。[aider](https://aider.chat/)、[cline](https://cline.bot/)、[codebuff](https://codebuff.com/)——它们都早于 Claude Code 出现，也都内置了真正出色的上下文工程，拥有一整套你可能会认为是 Claude Code 标志的工具：读取、写入、编辑、grep、bash。我用过它们，确实很好。但工具调用有时就是会……失败——你眼睁睁看着它连续三次在同一个编辑操作上乱撞，最后只好自己重新打开编辑器处理。

[2024 年的 SWE-Agent 论文](https://arxiv.org/abs/2405.15793)指出，即便只是对工具形态做小幅调整，也会带来明显差异。例如，在 ReadFile 的结果中加入行号，或把 Edit 工具从查找替换改成按行范围编辑。

![](https://pbs.twimg.com/media/HN8R3wya8AAYoJi.jpg)

随后 Claude Code 发布，并迅速一飞冲天。你可以将其轻描淡写地归因于分发渠道，但公认的解释是：Claude Code 胜出，是因为它确实更好用；而它之所以更好用，是因为 Anthropic 在 Harness 内部对模型进行了强化学习——这是第一次有实验室针对自己即将发布的那套具体工具来训练模型。结果，模型变得极其擅长在智能体循环中调用这些工具。

不断调整工具定义和评估方式，直到找到模型最喜欢的形态，这是一回事——我曾为各种用例在这上面耗费数周。但如果你掌握模型权重，能够直接修改模型，让它更擅长使用一套特定工具，那就是完全不同的游戏。

[OpenAI 团队去年 11 月的一场演讲](https://www.youtube.com/watch?v=wVl6ZjELpBk)对此总结得很好：如果你构建了 Harness，却不掌握模型权重，无法在 Harness 内对模型做强化学习，那你相较于同时掌握二者的团队，始终会处于劣势。

## 60 秒理解编程智能体强化学习

我为这个主题做了大量研究，也制作了许多可视化内容，试图解释其中真正重要的部分。但后来发现，[Calvin French-Owen](https://x.com/calvinfo)（Codex 团队的 MTS、Segment 创始人）在 [AI Council](https://www.youtube.com/watch?v=q-ntX4DLW_c) 的演讲讲得更好、更清楚。所以我直接在这里放上一段受他幻灯片启发制作的动画：

想让模型变得更擅长编程，你需要：

1. 生成一些编程智能体为解决问题而产生的轨迹（例如「修好我的测试」）；
2. 按照某些标准为这些轨迹打分（验证器）；
3. 更新模型权重，让优秀轨迹出现的概率更高，糟糕轨迹出现的概率更低。
然后在数周或数月里，把这个过程重复数百万次。

不过，这里的「打分」往往单一得近乎荒唐。

## 糟糕的设计不会受到惩罚

以 [SWE-bench Multilingual](https://huggingface.co/datasets/SWE-bench/SWE-bench_Multilingual) 为例。里面的任务都很小——每项大约只需 15 分钟——来自 Redis、jq、Django 等开源仓库。奖励只有 0 或 1，依据是：

- FAIL_TO_PASS——你是否修好了指定的问题？
- PASS_TO_PASS——你是否在没有破坏其他东西的前提下修好它？
来看一个真实案例：fastlane 项目中的 fastlane__fastlane-19304。[fastlane](https://github.com/fastlane/fastlane) 是一个 Ruby 项目。它的 zip action 会读取两个可选参数，然后立即对它们调用 `.empty?`；因此，只要不填写 include 和 exclude，它就会直接崩溃：

![](https://pbs.twimg.com/media/HN8U8yhbMAAZjQj.jpg)

最终关闭该问题的人类修复只有两行（把 nil 的默认值设为空数组）：

![](https://pbs.twimg.com/media/HN8U_keaIAAotk_.jpg)

评估过程中，模型会：

1. 从一个基础 Commit 开始——仓库被检出到该修复合入前的那个时刻；
2. 获得 Bug 报告——在本例中是 `'zip_command': undefined method 'empty?' for nil:NilClass`。
接着，智能体根据 Issue 自己编写代码。它看不到标准补丁，也看不到充当评分器的测试补丁：

![](https://pbs.twimg.com/media/HN8VCrpbIAACaZp.jpg)

然后：

1. 保留模型生成的补丁；
2. 丢弃它对测试文件做出的任何编辑（我们见过模型悄悄注释掉失败的测试，或塞入一个让测试失去意义的 Mock）；
3. 在补丁之上应用基准测试提供的测试补丁；
4. 运行整个测试套件：既包括原有 zip 测试（PASS_TO_PASS），也包括新增测试（FAIL_TO_PASS），看看它们能否全部通过。
![](https://pbs.twimg.com/media/HN8VNn8bUAA3D4N.jpg)

顺带一提：基准测试不是验证器——事实上，二者必须彼此隔离（不要拿测试集训练，诸如此类）。我举这个例子，主要是为了说明「判断一条编程智能体轨迹的质量」通常采用什么形式，以及它有哪些局限。

模型究竟怎样得到正确答案并不重要。只要测试通过，我们就算赢了；但破坏代码库可维护性不会受到任何惩罚。

破坏代码库可维护性，不会受到任何惩罚

于是，你就会得到四处乱塞的 try/catch：

![](https://pbs.twimg.com/media/HN8VhxEboAAS7gG.jpg)

## 验证质量，比「测试是否通过」难上几个数量级

运行测试，大约几秒钟就能得到一个清晰的通过或失败结果。正因如此，强化学习可以运行数百万轮循环，优化模型的每一次生成。

但糟糕架构的代价，要用数周、数月，甚至数年来衡量。它会在某个人为了做一行修改而打开文件时突然显现：他发现自己根本不可能只改一行——之前有人凭感觉写得太上头，现在我们不得不在 11 个地方重复同样的修改，同时祈祷不会悄悄破坏三个文件之外的其他东西。

![](https://pbs.twimg.com/media/HN8Vr0nakAAEKz4.jpg)

测试能在几秒钟内提供反馈，但糟糕架构的代价要用数周、数月，甚至数年来衡量

糟糕的设计，恰恰是当今基准测试唯一无法评估的东西。我知道，我知道，强化学习不等于基准测试；但如果强化学习已经解决了这个问题，我相信它多少也会开始体现在基准测试的设计中。

无论如何，我个人并不相信：当今基准测试上的任何进步，都能证明模型突然就擅长避免把你的代码库变成一团垃圾了。

## 前沿正在进步，只是很慢

当然，许多聪明人都在研究这个问题。我的观点不是它无法解决，而是[炒作已经跑在了严谨实践前面](https://www.youtube.com/watch?v=c35YoMdnI78)。

下面是一些我认为方向正确的尝试：

- [SWE-Marathon](https://www.swe-marathon.org/)（Abundant AI）：耗时约 400 小时的任务，例如「克隆 Excel 的全部功能」；奖励通道是复合式的，而不是只有一个通过或失败的比特。
- [DeepSWE](https://deepswe.datacurve.ai/blog/deepswe)（Datacurve）：在开源仓库中设计现实世界从未真正实现过的大型任务，因此它们必然不可能已经存在于训练集中（解决了污染问题，但没有解决质量问题）。
- [Frontier Code](https://cognition.com/blog/frontier-code)（Cognition）：包含多个 PR 的任务，并以一种巧妙方式对质量进行确定性评估——如果模型编写的测试在应用补丁前的代码上不会失败，就对它施加惩罚（如果你从未听说过[变异测试](https://en.wikipedia.org/wiki/Mutation_testing)，接下来可有得玩了[5](https://github.com/humanlayer/advanced-context-engineering-for-coding-agents/blob/main/wsff.md#user-content-fn-5-f56fe9a973fe7c6ebb6a9673c1bc64cb)）。它还会让一个裁判模型检查 Diff 是否符合代码质量规则。
![](https://pbs.twimg.com/media/HN8VxryaoAAtjN2.jpg)

但让模型来判断质量，终究只能走这么远。

事实上，不难想象：如果模型能够可靠地区分好代码和坏代码，那它一开始或许就会写出好版本。强化学习需要一个既快速又可靠的判定器，而在可维护性问题上，我们还没有这样的判定器。

如果模型能可靠地区分好代码和坏代码，那它一开始或许就会写出好版本；但可维护性没有快速判定器，所以我们无法在强化学习中为它提供奖励

当然，增加评审智能体、投入更多 Token 确实有帮助——它们能抬高下限，抓住那些愚蠢的错误。

但它们无法抬高上限，因为上限取决于我们通过强化学习成功教给模型的能力，而优秀的设计正是我们至今还不知道该如何教会模型的东西。

因此，我依然不会拿自己的代码库押在这些方案上。但它们是我见过第一批真正试图为可维护性打分，而不是止步于通过或失败的评估体系。

顺带一提，也许未来某个模型就是能彻底搞定这件事，让我们从此高枕无忧。如果你想把「苦涩的教训」抛在脑后，一路用提示词豪赌到 GPT-7 发布，看看结果如何，请自便——但我们眼下还有问题要解决，接下来我会说明我们是怎么做的。

## 把灯重新打开

我今天才知道 Twitter Articles 有「媒体数量上限」，所以剩下的内容会放进第二篇文章——敬请期待。
