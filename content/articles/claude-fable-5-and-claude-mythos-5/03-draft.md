# Claude Fable 5 和 Claude Mythos 5

*   更新
    
    Claude Mythos 5 和 Fable 5 重新部署
    
    2026 年 7 月 1 日
    
    Claude Fable 5 和 Mythos 5 现已可用。
    
    [
    
    阅读更多
    
    ](https://www.anthropic.com/news/redeploying-fable-5)
*   Claude Mythos 5 和 Fable 5 暂不可访问
    
    2026 年 6 月 12 日
    
    我们正在暂停 Claude Fable 5 和 Claude Mythos 5 的访问。给客户带来中断，我们深表歉意，并正努力尽快恢复访问。
    
    [
    
    阅读更多
    
    ](https://www.anthropic.com/news/fable-mythos-access)

今天，我们发布 **Claude Fable 5**：这是一款 Mythos 级别1模型，并且已经被我们调整到可安全面向普通用户使用。

Fable 5 的能力超过了我们以往任何一款面向大众开放的模型。它在几乎所有经过测试的 AI 能力基准上都达到最先进水平，在软件工程、知识工作、视觉、科学研究以及许多其他领域表现出色。任务越长、越复杂，Fable 5 相比我们其他模型的领先幅度就越大。

发布这样一款能力强大的模型伴随着风险。如果没有防护措施，Fable 5 在网络安全等领域的能力可能被滥用并造成严重损害。因此，我们在发布模型时加入了防护措施：涉及某些主题的查询将改由我们下一档能力最强的模型 Claude Opus 4.8 响应。为了既安全又快速地发布模型，我们对这些防护措施采取了保守调校；它们有时会拦截无害请求，不过平均触发比例低于 5% 的会话。随着未来几个月更强大的模型到来，我们正在尽快改进防护措施并降低误报率。

面向一小群网络防御者和基础设施提供商，我们也在发布 **Claude Mythos 5**。它与 Fable 5 使用相同的底层模型，但在部分领域移除了防护措施。2 Mythos 5 最初将通过 [Project Glasswing](https://www.anthropic.com/glasswing) 部署，并与美国政府合作，作为 Claude Mythos Preview 的升级版本。它拥有全球所有模型中最强的网络安全能力。接下来，我们计划通过更广泛的可信访问计划扩大 Mythos 5 的访问范围。

Fable 5 和 Mythos 5 这类模型的能力有潜力为世界带来深远益处。我们已经在 Project Glasswing 中看到开端：这些模型已经[帮助网络防御者](https://www.anthropic.com/research/glasswing-initial-update)保护极其重要的软件。我们也在生命科学研究中看到了这一点：模型正在提出新颖假设，并加快新疗法的开发。

Fable 5 和 Mythos 5 的定价为每百万输入 token 10 美元、每百万输出 token 50 美元，低于 Claude Mythos Preview 价格的一半。今天的联合发布，是我们朝着一个目标迈出的又一步：尽可能快速、尽可能安全地把先进 AI 能力带给尽可能多的用户。

下表比较了 Fable 5 和 Mythos 5 与其他领先模型的能力。

<figure><img alt="展示 Claude Fable 和 Mythos 与其他领先模型对比的基准表格" loading="lazy" width="2600" height="2870" decoding="async" data-nimg="1" srcset="https://www.anthropic.com/_next/image?url=https%3A%2F%2Fwww-cdn.anthropic.com%2Fimages%2F4zrzovbb%2Fwebsite%2F1e65982497d7d4891219ed0e83141625a291b860-2600x2870.png&amp;w=3840&amp;q=75 1x" src="https://www.anthropic.com/_next/image?url=https%3A%2F%2Fwww-cdn.anthropic.com%2Fimages%2F4zrzovbb%2Fwebsite%2F1e65982497d7d4891219ed0e83141625a291b860-2600x2870.png&amp;w=3840&amp;q=75"></figure>

  
Fable 5 和 Mythos 5 能够比以往任何 Claude 模型更长时间地自主工作。下面我们会讨论这些能力如何用于软件工程，并介绍模型在知识工作、视觉、记忆和生命科学研究方面提升后的能力。

*软件工程。* 在早期测试中，[Stripe](https://stripe.com/) 表示，Fable 5 把数月工程工作压缩到了数天。在一个 5000 万行的 Ruby 代码库中，模型用一天完成了一次全代码库迁移；如果手工完成，原本需要整个团队两个多月。相比过去的 Claude 模型，Fable 5 也更节省 token：在 Cognition 的 [FrontierCode](https://cognition.ai/blog/frontier-code) 评测中，Fable 5 即使在中等努力程度下，也在前沿模型中得分最高；该评测测试模型能否通过困难的编码任务，同时满足高质量生产代码库的标准。

<figure><img loading="lazy" width="1920" height="1080" decoding="async" data-nimg="1" srcset="https://www.anthropic.com/_next/image?url=https%3A%2F%2Fwww-cdn.anthropic.com%2Fimages%2F4zrzovbb%2Fwebsite%2Fd3c3efe0e8ab310856368cee2b2161439db6676a-1920x1080.png&amp;w=1920&amp;q=75 1x, https://www.anthropic.com/_next/image?url=https%3A%2F%2Fwww-cdn.anthropic.com%2Fimages%2F4zrzovbb%2Fwebsite%2Fd3c3efe0e8ab310856368cee2b2161439db6676a-1920x1080.png&amp;w=3840&amp;q=75 2x" src="https://www.anthropic.com/_next/image?url=https%3A%2F%2Fwww-cdn.anthropic.com%2Fimages%2F4zrzovbb%2Fwebsite%2Fd3c3efe0e8ab310856368cee2b2161439db6676a-1920x1080.png&amp;w=3840&amp;q=75"></figure>

<figure><img loading="lazy" width="3840" height="2160" decoding="async" data-nimg="1" srcset="https://www.anthropic.com/_next/image?url=https%3A%2F%2Fwww-cdn.anthropic.com%2Fimages%2F4zrzovbb%2Fwebsite%2F036229d8f9be9a5a911dbbd863b3c6cc09a79a70-3840x2160.png&amp;w=3840&amp;q=75 1x" src="https://www.anthropic.com/_next/image?url=https%3A%2F%2Fwww-cdn.anthropic.com%2Fimages%2F4zrzovbb%2Fwebsite%2F036229d8f9be9a5a911dbbd863b3c6cc09a79a70-3840x2160.png&amp;w=3840&amp;q=75"></figure>

*知识工作。* Fable 5 在复杂分析任务上表现强劲。在 [Hebbia](https://www.hebbia.com/) 面向高级推理能力的 Finance Benchmark 中，Fable 5 取得了所有模型中的最高分，在基于文档的推理、图表与表格解读以及问题解决方面都有显著提升。[IMC](https://www.imc.com/) 指出，Fable 5 几乎全面通过了他们的交易分析评测，包括事实查找、概念推理、根因分析和期望值分析。

*视觉。* Fable 5 是处理视觉相关任务的新一代最先进模型。它可以从细致的科学图表中提取精确数字，也能完成复杂的视觉任务，例如仅凭截图重建一个 Web 应用的源代码。它还需要更少的脚手架：例如，即使有额外有用工具的辅助框架，过去的 Claude 模型也很难通关《宝可梦 火红》；但 Fable 5 只用一个最小化、纯视觉的辅助框架就通关了 FireRed。

<figure><template data-dgst="BAILOUT_TO_CLIENT_SIDE_RENDERING"></template><figcaption>Claude 仅使用原始游戏截图从头到尾游玩《宝可梦 火红》的延时记录，不使用地图、导航辅助或额外游戏状态信息。早期 Claude 模型需要复杂的辅助框架才能玩《宝可梦》；Claude Fable 5 只凭视觉就完成了游戏。</figcaption></figure>

*记忆和长上下文。* 在持续运行的任务中，Fable 5 能在数百万 token 的范围内保持专注，并利用自己的笔记改进输出。当我们让模型游玩牌组构筑游戏 [*Slay the Spire*](https://en.wikipedia.org/wiki/Slay_the_Spire) 时，给它接入持久化的文件式记忆后，性能提升幅度是 Opus 4.8 的三倍；Fable 抵达游戏最终章节的次数也多了三倍。

*药物设计：* 借助 Mythos 5，我们内部的蛋白质设计专家将药物设计流程中的部分环节加快了约 10 倍。在一个例子中，他们发现 Mythos 5 在配备蛋白质设计和生物信息学工具、但没有人类协助的情况下，能够达到或超过熟练人类操作者的水平。在这个过程中，模型执行了通常由科学家完成的所有任务：选择结合位点、挑选并运行蛋白质设计工具，并在过程中从失败中恢复。本研究中的 14 个蛋白质靶点里，有 9 个（如下所示）产出了强有力的药物设计候选方案，我们目前正在进一步研究。

<figure><img loading="lazy" width="1920" height="1080" decoding="async" data-nimg="1" srcset="https://www.anthropic.com/_next/image?url=https%3A%2F%2Fwww-cdn.anthropic.com%2Fimages%2F4zrzovbb%2Fwebsite%2F6a97019c4d8ea13fdd7200455f6dd9e8c267ba0b-1920x1080.png&amp;w=1920&amp;q=75 1x, https://www.anthropic.com/_next/image?url=https%3A%2F%2Fwww-cdn.anthropic.com%2Fimages%2F4zrzovbb%2Fwebsite%2F6a97019c4d8ea13fdd7200455f6dd9e8c267ba0b-1920x1080.png&amp;w=3840&amp;q=75 2x" src="https://www.anthropic.com/_next/image?url=https%3A%2F%2Fwww-cdn.anthropic.com%2Fimages%2F4zrzovbb%2Fwebsite%2F6a97019c4d8ea13fdd7200455f6dd9e8c267ba0b-1920x1080.png&amp;w=3840&amp;q=75"><figcaption>由 Mythos 5 设计的蛋白质复合物。靶点包括免疫检查点、生长因子和受体信号通路、神经退行性疾病、肌肉疾病，以及更困难的结构靶点。</figcaption></figure>

*分子生物学中的新颖假设。* Mythos 5 是我们第一款能够稳定产出新颖且有说服力的科学假设的模型。在与 Opus 级模型进行的盲测正面对比中，我们的科学家约 80% 的时间更偏好 Mythos 提出的分子生物学假设，并已将其中几项推进到实验评估阶段。与此同时，Mythos 提出的一个假设——关于一种*大肠杆菌*蛋白的新机制——已得到[一项研究](https://www.biorxiv.org/content/10.64898/2026.03.12.711259v1)的佐证，该研究来自一个独立研究同一问题的实验室。

*基因组学中的新颖研究。* Mythos 5 在超过一周、基本自主的工作中开展了新的基因组学研究。它组装了覆盖 138 种动物物种、包含数百万细胞的单细胞数据，并设计和训练了一个定制机器学习模型，用于识别即使在亲缘关系很远的生物中也承担相同作用的细胞。仅在高层次人类输入下，Mythos 5 训练出的模型超过了近期发表在 *Science* 期刊上的一个模型，尽管它的规模小了 100 倍。我们计划在未来几个月发布这些结果。

*对齐。* 在我们的自动化对齐评估中，我们发现 Mythos 5 的不对齐行为水平较低，与 Opus 4.8 类似；这些行为包括模型采取的欺骗等不对齐行动，以及配合用户滥用模型。鉴于 Fable 5 与 Mythos 5 使用相同的底层模型，Fable 5 的对齐水平也会相近。该评估以及一整套详细的其他安全和能力测试，已在模型的[系统卡](https://anthropic.com/claude-fable-5-mythos-5-system-card)中完整说明。

<figure><img loading="lazy" width="3840" height="2160" decoding="async" data-nimg="1" srcset="https://www.anthropic.com/_next/image?url=https%3A%2F%2Fwww-cdn.anthropic.com%2Fimages%2F4zrzovbb%2Fwebsite%2F2502a0daf85b741641cff36757d7243ef48f8be8-3840x2160.png&amp;w=3840&amp;q=75 1x" src="https://www.anthropic.com/_next/image?url=https%3A%2F%2Fwww-cdn.anthropic.com%2Fimages%2F4zrzovbb%2Fwebsite%2F2502a0daf85b741641cff36757d7243ef48f8be8-3840x2160.png&amp;w=3840&amp;q=75"><figcaption>我们的自动化对齐评估中，不对齐行为的总体水平。更多信息见<a href="https://anthropic.com/claude-fable-5-mythos-5-system-card">系统卡</a>第 6.2.3.1 节。</figcaption></figure>

## Claude Fable 5 的早期反馈

获得早期访问权限的客户对 Fable 5 进行了自己的测试。下面是他们用自己的话描述的部分发现：

![ logo](https://www-cdn.anthropic.com/images/4zrzovbb/website/f084c88e65466636019709c40cc477aadce2f718-151x64.svg)

> Claude Fable 5 是 CursorBench 上的最先进模型。它打开了一类长周期问题的大门，而这些问题过去超出了早期模型的能力范围。

![ logo](https://www-cdn.anthropic.com/images/4zrzovbb/website/fc55f4db8afa5db479127fde5be3e492940f513d-94x64.svg)

> 对 GitHub 服务的开发者来说，Claude Fable 5 是一次真正的进步。在我们的早期测试中，它能承担复杂、长周期的编码任务，自主性和可靠性都超过了以往基准。但最让我们兴奋的是它指向的方向：未来，开发者可以把越来越有雄心的工作交给智能体，并在整个软件生命周期中信任其结果。

![ logo](https://www-cdn.anthropic.com/images/4zrzovbb/website/1d9e0d7a5760165244bba057a622513bb75cb65d-80x64.svg)

> 这是我们有机会测试过的所有 Claude 模型中最强的结果。Claude Fable 5 在智能体式编码和原型制作上明显向前迈进了一步。

![ logo](https://www-cdn.anthropic.com/images/4zrzovbb/website/046fc90b1e849e0ef96b6a9923d47ae13272b50f-173x64.svg)

> Claude Fable 5 的推理能力明显超出 Opus 4.8 一个层级。它能以资深研究科学家的水准工作：选择方向、分配资源、推翻自己的错误信念，并产出新颖的第一性原理成果。

![ logo](https://www-cdn.anthropic.com/images/4zrzovbb/website/40a2a6a28afd8ac8fbf0e764b6bbf4ebf06a1977-133x64.svg)

> Claude Fable 5 理解构建者真正想表达的意思，而不只是他们输入了什么。一年前需要一百条提示才能做出的应用，现在它可以一次完成。当客户真的遇到瓶颈时，它就是我们会调用的模型，帮助他们快速越过去，从而完成自己原本想构建的东西。

![ logo](https://www-cdn.anthropic.com/images/4zrzovbb/website/a0935a9396e8ec29b273be438cac14583c5999a6-130x64.svg)

> Claude Fable 5 给人的感觉有实质差异。在盲审中，我们的律师发现它给出的修订标记每次都能达到或超过我们当前模型的水平。

![ logo](https://www-cdn.anthropic.com/images/4zrzovbb/website/73b380711885c6beb5270575119dbf31d7f71236-107x64.svg)

> 在最高努力程度下，Claude Fable 5 会反思并验证自己的工作。对我们来说，这正是高度自主化运营成为可能的原因：额外的思考会收回成本。

![ logo](https://www-cdn.anthropic.com/images/4zrzovbb/website/74f9dcd65076def29413e42e822da248590b68d3-145x64.svg)

> 与之前的模型相比，Claude Fable 5 用更少轮次交付了更强的工程能力，能够处理我们员工每天在 Claude Code 中运行的复杂多智能体工作流。

![ logo](https://www-cdn.anthropic.com/images/4zrzovbb/website/ad249bca4e8e195e08764efc43ecbc586ca37482-143x64.svg)

> Claude Fable 5 是 Cognition 的前沿编码评测 FrontierBench 上得分最高的模型。它擅长长周期推理，并能开箱即用地泛化到不熟悉的工具。

![ logo](https://www-cdn.anthropic.com/images/4zrzovbb/website/e360f8a29093a6b4fccdc006315035583e89f9ac-146x64.svg)

> Claude Fable 5 是我们测试过的最强金融优先模型，无论是在通用金融能力还是推理能力上都是如此。这是一次显著提升。

![ logo](https://www-cdn.anthropic.com/images/4zrzovbb/website/7fbed01e869d6a4faf97317a1fc4b74f7997c66e-78x64.svg)

> Claude Fable 5 是第一个在我们针对复杂、长时间分析任务的核心分析基准上突破 90% 的模型，比 Opus 高出 10 个百分点。在最难的问题上，它展现出很强的判断力和对细微差别的关注。

![ logo](https://www.anthropic.com/_next/image?url=https%3A%2F%2Fwww-cdn.anthropic.com%2Fimages%2F4zrzovbb%2Fwebsite%2F41fa2545bafc63f50148ce0d710dbdadb8c06f87-888x256.png&w=256&q=75)

> Claude Fable 5 是我们测试过的、用于前沿物理研究的最强模型，而且只使用三分之一的推理 token。它用 36 小时几乎达到了 GPT-5.5 四天后达到的位置。

![ logo](https://www-cdn.anthropic.com/images/4zrzovbb/website/0504471eb7da85317c6def349d315e2f8be00b0f-127x64.svg)

> 在 ViBench，也就是我们的端到端 vibe-coding 基准上，Claude Fable 5 是我们测试过的表现最好的模型：几乎覆盖了我们的基础用例，并能用更少时间和更少 token 构建应用。

![ logo](https://www-cdn.anthropic.com/images/4zrzovbb/website/b7787c9ab5714b0c1789da32a3a52daba81f6bef-63x64.svg)

> Claude Fable 5 在我们的日常电子表格套件中，在每个努力程度下都击败了 Opus 4.8，而且使用更少轮次，完成速度快了 25–30%。

01 /

14

## Claude Fable 5 的新防护措施

Mythos 级模型已经达到一个会带来重大风险的门槛。今年 4 月，我们启动了 [Project Glasswing](https://www.anthropic.com/glasswing)，只向有限的一组网络防御者和关键软件基础设施提供商发布了第一款 Mythos 级模型（Claude Mythos Preview）。当时我们表示，只要我们开发出足够强、能够可靠防止滥用的新防护措施，就希望最终把 [Mythos 级能力开放给所有用户](https://www.anthropic.com/glasswing#:~:text=We%20do%20not,Preview3.)。

过去几个月，我们一直在改进这些防护措施，现在它们已经足够稳健，可以支持面向普通用户发布。由于我们优先考虑安全，因此有意把防护措施调得较为谨慎，而且它们仍然比理想状态更严格；例如，有时无害请求也会触发我们的分类器。我们知道这会让一些用户感到沮丧，我们的目标是在发布后继续更新和细化防护措施，降低误报。

下面我们会逐一讨论 Fable 5 的新防护措施。我们更完整的一组防护措施及其评估，见模型的[系统卡](https://anthropic.com/claude-fable-5-mythos-5-system-card)以及我们最新的[风险报告](https://cdn.sanity.io/files/4zrzovbb/website/097c63b5fe7dd8b14866e1f15bb1910ec713658a.pdf)。

### 安全分类器

Mythos 级模型在前沿网络安全和研究生物学方面的能力，意味着它们会给恶意行为者带来实质性的*能力提升*风险。也就是说，这些模型可能提供信息或建议，帮助这些行为者造成他们无法从其他来源（例如互联网搜索引擎）获得的严重伤害。此外，大量高级 AI 模型使用场景都具有双重用途：同样的查询，在网络安全专业人士和生物学研究者手中可能有益，但如果被恶意行为者获取，就可能很危险。

因此，我们需要强有力的防护措施来防止滥用，而且覆盖范围必须足够广。防护措施本身还必须经得起持续、复杂的绕过尝试，也就是对系统进行“越狱”。Mythos 级能力带来的能力提升对许多对手都有价值，例如那些可以从网络攻击中获利的人；因此我们预计他们会有动机试图规避我们的安全措施。

Fable 5 配备了一组新的*分类器*：这些独立的 AI 系统会检测潜在滥用，包括越狱尝试，并阻止主模型（在这里是 Fable 5）作出回应。我们已经[在模型上运行分类器一段时间了](https://www.anthropic.com/research/next-generation-constitutional-classifiers)，Fable 5 的分类器是在此前工作的基础上扩展而来，并增加了额外覆盖范围。

当 Fable 的分类器检测到请求与网络安全、生物和化学、或蒸馏有关时，响应会自动改由 Claude Opus 4.8 处理。发生这种情况时，用户会收到告知。Opus 4.8 本身也是一款能力很强的模型：由 Opus 回退处理的响应，比 Fable 直接拒绝要好得多。我们的早期数据显示，超过 95% 的 Fable 会话完全不会发生回退；对这些会话而言，Fable 5 的表现实际上与 Mythos 5 相同。

分类器覆盖以下领域：

1\. *网络安全。* Mythos 级模型非常[擅长](https://red.anthropic.com/2026/mythos-preview/)发现和利用软件漏洞。因此，它们可能让网络攻击变得更容易、成本更低。Mythos 级模型也在智能体式黑客攻击方面展现出强能力。这涉及执行网络攻击中的多个不同环节，而不只是寻找漏洞，包括侦察、发现、横向移动等。为了防止这些智能体式黑客能力在网络攻击中提供能力提升，我们设计的网络安全分类器覆盖利用行为以及更广义的攻击性网络任务。如下图所示，我们的分类器会阻止 Fable 在这些任务上取得任何进展。

<figure><img loading="lazy" width="3840" height="2160" decoding="async" data-nimg="1" srcset="https://www.anthropic.com/_next/image?url=https%3A%2F%2Fwww-cdn.anthropic.com%2Fimages%2F4zrzovbb%2Fwebsite%2Ffaf941fe1ebfd09139d39b8e4ad9048121979284-3840x2160.png&amp;w=3840&amp;q=75 1x" src="https://www.anthropic.com/_next/image?url=https%3A%2F%2Fwww-cdn.anthropic.com%2Fimages%2F4zrzovbb%2Fwebsite%2Ffaf941fe1ebfd09139d39b8e4ad9048121979284-3840x2160.png&amp;w=3840&amp;q=75"><figcaption>运行网络安全评测<sup>3</sup>的结果；此处的 Fable 5 采用阻断响应而非回退到 Opus 4.8 的模式。评测不包含规避防护措施的尝试。</figcaption></figure>

我们对分类器进行了大量红队测试，以检验它们抵御越狱的稳健性。除内部测试外，我们还开展了一项外部漏洞赏金计划，在超过 1000 小时测试中没有发现通用越狱方法。我们合作的外部红队组织到目前为止也未能在长篇智能体式任务上发现任何通用越狱方法，不过英国 AISI 在一个短暂的初始测试窗口内已朝着某个方向取得进展。4 要*完全*防止通用越狱很可能是不可能的，但我们的目标是让任何残余越狱方法都足够缓慢、足够昂贵，从而使我们能够在其被大规模使用前检测并阻止。

下图来自我们的一项内部评测，展示了 Fable 5 的防护措施如何让它比我们此前面向普通用户开放的模型更能抵抗越狱。

<figure><img loading="lazy" width="1920" height="1080" decoding="async" data-nimg="1" srcset="https://www.anthropic.com/_next/image?url=https%3A%2F%2Fwww-cdn.anthropic.com%2Fimages%2F4zrzovbb%2Fwebsite%2F6bede3f6101d15bd899922917ea6246adda4515b-1920x1080.png&amp;w=1920&amp;q=75 1x, https://www.anthropic.com/_next/image?url=https%3A%2F%2Fwww-cdn.anthropic.com%2Fimages%2F4zrzovbb%2Fwebsite%2F6bede3f6101d15bd899922917ea6246adda4515b-1920x1080.png&amp;w=3840&amp;q=75 2x" src="https://www.anthropic.com/_next/image?url=https%3A%2F%2Fwww-cdn.anthropic.com%2Fimages%2F4zrzovbb%2Fwebsite%2F6bede3f6101d15bd899922917ea6246adda4515b-1920x1080.png&amp;w=3840&amp;q=75"><figcaption>一项内部评测的结果：自动化红队程序尝试在 400 轮对话中使用模型完成一个与攻击性网络安全有关的短任务；被阻断时会重新开始并回退。任务大多较简单，并不代表真实网络安全使用场景，有时甚至只是加密远程服务器上的文件。在更复杂、更真实的任务上，我们尚未在生产系统中看到成功越狱。请注意，Opus 4.6 没有阻断式网络安全防护。</figcaption></figure>

我们的一位外部合作伙伴发现，在所有测试模型中（包括 Opus 4.8 和 Opus 4.7），Fable 5 针对有害网络查询的防护最稳健。对于涉及规划网络攻击、漏洞利用开发或规避防御的有害单轮请求，Fable 5 的遵从率为零。无论请求是否使用了 30 种不同公开越狱技术中的一种，这一点都成立。

2\. *生物和化学。* 我们长期使用[分类器](https://www.anthropic.com/news/activating-asl3-protections)阻止模型回应一小部分与生物武器有关的查询。但我们不再确信，只阻断这一小部分就足够了。原因有两个：第一，我们有理由担心资源充足的恶意行为者试图从我们的模型中获得能力提升，用于高风险生物研究。第二，模型现在完成现实世界科学任务的能力更强了。

例如，我们测试了 Mythos 5 完成设计[腺相关病毒](https://en.wikipedia.org/wiki/Adeno-associated_virus)（AAV）中一个高难步骤的能力。AAV 是递送基因疗法的一种组件，但同样的能力如果落入错误的人手中，也可能促成危险病毒的设计。在这项任务中，不同 AI 模型需要预测一次基因修改会如何影响病毒外壳的组装，这些候选对象来自 [Dyno Therapeutics](https://www.dynotx.com/) 开发的一组与治疗相关但尚未发表的候选体。我们并没有明确训练模型来执行这项任务；然而 Mythos 级模型仅凭生物学推理，就超过了专门面向蛋白质任务的复杂模型，也就是“蛋白质语言模型”。这展示了模型完成基因疗法研发中简单但重要任务的可喜能力，同时也凸显了这类双重用途能力带来的风险。

<figure><img loading="lazy" width="3840" height="2160" decoding="async" data-nimg="1" srcset="https://www.anthropic.com/_next/image?url=https%3A%2F%2Fwww-cdn.anthropic.com%2Fimages%2F4zrzovbb%2Fwebsite%2F3437ad5c0853a7bd273ed5e56289a4f38dcd9731-3840x2160.png&amp;w=3840&amp;q=75 1x" src="https://www.anthropic.com/_next/image?url=https%3A%2F%2Fwww-cdn.anthropic.com%2Fimages%2F4zrzovbb%2Fwebsite%2F3437ad5c0853a7bd273ed5e56289a4f38dcd9731-3840x2160.png&amp;w=3840&amp;q=75"><figcaption>一项评测的结果：我们的模型预测一种简单病毒的病毒外壳未发表实验属性。在此语境下，病毒外壳组装是最简单可预测的病毒性状，但在设计更复杂特征时，它仍然是必须做对的重要属性。AAV = 腺相关病毒。</figcaption></figure>

我们的优先事项是尽快安全发布 Fable，即使代价是防护措施覆盖过宽。因此，暂时我们安排 Fable 在大多数与生物和化学有关的请求上回退到 Opus 4.8。与我们所有分类器一样，我们希望尽快收窄这些防护措施：从上述证据可以看出，Fable 在科学领域有巨大的正向应用潜力，我们不希望分类器误报造成阻碍。未来几周，一些生物医学研究者和公司将能够加入 Mythos 5 生物能力的可信访问计划（见下文）。

3\. *蒸馏。* 我们此前曾发现，有人进行[大规模尝试](https://www.anthropic.com/news/detecting-and-preventing-distillation-attacks)，试图提取（“蒸馏”）Claude 的能力，用于在威权国家训练[竞争性](https://www.anthropic.com/legal/commercial-terms)模型。蒸馏 Fable 5 的能力可能间接导致接近前沿水平的 AI 能力扩散，而这些能力可能在没有适当防护措施的情况下被发布。被我们的分类器标记为此类蒸馏尝试一部分的请求，将回退到 Opus 4.8。

### 新的数据保留政策

最后，我们正在改变 Fable 5、Mythos 5 以及未来同等或更高能力级别模型处理企业客户数据的方式。对于 Mythos 级模型上的所有流量，无论来自第一方还是第三方入口，我们都将要求保留 30 天。我们不会使用这些数据训练新的 Claude 模型，也不会用于任何与安全无关的目的；我们还建立了新的隐私保护措施，包括记录所有人类对这些数据的访问，并确保数据在几乎所有情况下会在 30 天后删除（更多详情见[这篇文章](https://support.claude.com/en/articles/15425996)）。这些数据将帮助我们防御复杂且新颖的攻击，包括新的越狱方法以及跨越多个请求运行的攻击，同时也帮助我们识别并减少误报。

## Claude Mythos 5 和可信访问计划

从今天开始，所有当前拥有 Claude Mythos Preview 访问权限的用户（例如 Project Glasswing 中的网络安全合作伙伴）都将能够升级到 Claude Mythos 5。Claude Mythos 5 与 Claude Fable 5 是同一个模型，但移除了网络安全防护。用户会发现，在大多数情况下，Mythos 5 与 Mythos Preview 相当或略强，同时成本大幅降低。

在与美国政府协商后，我们计划稳步扩大 Claude Mythos 5 的访问范围，继续[定期增加](https://www.anthropic.com/news/expanding-project-glasswing)新合作伙伴，同时推进一个可信访问计划，让网络安全组织能够以更系统的方式申请。

我们的计划还包括面向生物领域开放可信访问计划，帮助用 Mythos 级能力加速生物医学研究并发现新疗法。该计划将提供移除了生物和化学防护措施的 Fable 5 访问权限（但网络安全防护仍保留）。它将吸纳少量来自不同生命科学组织的研究者，覆盖基础研究和转化研究；我们计划在扩大该计划访问范围的同时继续改进防护措施。  

## 可用性

Claude Fable 5 今天起在所有地区可用。Claude Mythos 5 在更广泛的可信访问计划推出前，仅限 Glasswing 合作伙伴（已移除网络安全防护）以及很快开放给部分生物学研究者（已移除生物和化学防护）使用。

两款模型的定价均为每百万输入 token 10 美元、每百万输出 token 50 美元。开发者可以通过 [Claude API](https://platform.claude.com/docs/en/about-claude/models/overview) 使用 claude-fable-5。

我们预计 Fable 5 的需求会非常高，而且难以预测。在 Claude API 和按用量计费的 Enterprise 方案中，Fable 5 从今天起完全可用。对于订阅方案，我们宁愿更早而不是更晚提供访问，因此会以更保守的方式分阶段推出：

*   从今天到 6 月 22 日，Fable 5 将包含在 Pro、Max、Team 和按席位计费的 Enterprise 方案中，不额外收费。
*   6 月 23 日，我们会将 Fable 5 从这些方案中移除。之后使用它将需要[用量额度](https://support.claude.com/en/articles/12429409-manage-usage-credits-for-paid-claude-plans)。如果容量允许，我们会延长包含使用的窗口。
*   在此之后，当容量足够时，我们的目标是恢复 Fable 5，使其成为订阅方案的标准组成部分。我们会尽可能快地做到这一点。

在整个期间，我们会提前沟通任何变化，让用户知道当前状态。

*2026 年 6 月 9 日编辑：更新了关于 AAV 的讨论，说明候选体由 Dyno Therapeutics 开发。*

## 相关内容

### 艾伯塔省政府使用 Claude 在政府系统中发现并修复网络安全漏洞

自 2025 年以来，艾伯塔省政府一直使用 Claude Code，并结合 Opus 和 Sonnet 模型来审查其系统、发现漏洞并修复漏洞。

[阅读更多](https://www.anthropic.com/news/alberta-government-claude-cybersecurity)

### 关于 Fable 5 网络安全防护措施和我们的越狱框架的更多细节

[阅读更多](https://www.anthropic.com/news/fable-safeguards-jailbreak-framework)

### 推出 Claude Sonnet 5

Sonnet 5 在编码、智能体和专业工作方面大规模交付前沿性能。

[阅读更多](https://www.anthropic.com/news/claude-sonnet-5)
