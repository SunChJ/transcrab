# DeepSeek 的 10 万亿美元大战略

你有没有想过，DeepSeek 到底可能怎么赚钱，而且赚很多钱？

他们没有像 GLM、MoonShot 和 MiniMax 那样推出有竞争力的编程订阅方案。他们也没有多模态、音频、视频模型。到目前为止，他们甚至还没有自己的 harness（他们最近才开始招聘来搭建 harness）。DeepSeek 还长期承诺开源，而且非常乐意分享自己的“秘方”。这是疯了吗？这是纯粹烧钱吗？那些准备向他们投资 100 亿美元的投资人，是在把钱扔进下水道吗？

不，在我看来恰恰相反！

下面我想谈谈他们迄今为止做过的事，以及他们似乎正在执行的一套战略。[梁文锋](https://en.wikipedia.org/wiki/Liang_Wenfeng)（DeepSeek CEO）的目光似乎放在一个大得多的奖品上：他们可能实现 1 万亿美元估值，同时帮助创造一个 10 万亿美元规模的产业！

![](https://pbs.twimg.com/media/HI_Cfs7bwAAt2tI.png)

## 重新审视 DeepSeek 的英雄之旅

DeepSeek 一直逆着“持续做出略强一点的模型，然后尽快卖应用”的风潮走，例如卖编程套餐。2025 年 1 月 27 日，我写过一条传播很广的推文，谈我眼中的 [DeepSeek 的英雄之旅](https://x.com/bookwormengr/status/1883712073814954379?s=20)。这个故事现在只变得更有意思了。

- 当人们还在努力构建稠密模型时，DeepSeek 转向了训练难度很高的 Mixture of Expert 模型（MoE）。
- 他们从“第一性原理”出发，发明了新的 GRPO 算法，用来替代强化学习（RL）中占主导地位、实现成本更高的 PPO 算法。
- 他们找到了 Reinforcement Learning from Verified Rewards（RLVR），并把它作为提升模型推理能力的关键策略。
- 他们通过“Multi Token Prediction”为 Speculative Decoding 提出了一套简单策略，同时也让训练信号变得更密集。
- 他们完善了“ZERO bubble”流水线，以提升有限 GPU 资源的使用效率。
- 他们发布了 Expert Load Balancer，让每个人都更容易部署 Mixture of Expert 模型。尤其是在“Wide Expert Parallel”策略下，模型可以用大 batch 提供服务，因此服务成本低得多。
- 他们发明了 MLA、DSA、CSA、HCA，以降低 KV Cache 需求，并让计算需求在上下文变长时接近保持恒定。
- 他们发明了 Engram，用内存换计算。
- 他们发明了 mHC，使模型规模增长时训练仍能保持稳定。这个清单还可以继续列下去……

在“英雄之旅”这种最普遍的故事结构里，英雄一开始并不会决定自己的旅程将是什么。他是在路上学习，逐渐发现自己的伟大使命，并在重重阻碍下完成它。他会遇到许多唱反调的人，但会选择忽略他们；也会遇到许多恶意行动者。他有严重的缺陷或短板，但最终克服这些缺点，完成自己的使命。他面对看似无法逾越的挑战，却找到了结盟的方法，也学会了如何明智地使用宝贵资源。这正是观众愿意为英雄加油的原因。也正是这种东西，让 DeepSeek 赢得了粉丝、全球尊重，以及批评者。

正如我接下来会详细说明的，DeepSeek 已经在这条路上走了足够久，并且发现了自己的终极命运：不是卖编程套餐，而是赋能一个 10 万亿美元规模的中国 AI 硬件生态，并让自己达到 1 万亿美元估值。在这个过程中，他们也会为西方硬件生态中的许多新进入者打开机会。

欢迎评论和批评：[@naval](https://x.com/@naval) [@teortaxesTex](https://x.com/@teortaxesTex) [@jukan05](https://x.com/@jukan05) [@bubbleboi](https://x.com/@bubbleboi) [@poezhao0605](https://x.com/poezhao0605) [@hsu_steve](https://x.com/@hsu_steve) [@tphuang](https://x.com/@tphuang)

![](https://pbs.twimg.com/media/HI-_GxpbUAA0ytD.jpg)

## 先从 KV Cache 计算的一点乐趣开始

先读一下 @SemiAnalysis_ 这条非常及时的推文：

![](https://pbs.twimg.com/media/HI8tom-asAAbsp0.jpg)

我们先来做一点有趣的 KV Cache 数学。别担心，如果你不喜欢数学也没关系。我们会用最近发布的 KV Cache 计算器，看看 DeepSeek V4 Pro 带来的 KV Cache 节省，并把它同最新的 GLM 和 Qwen 模型做比较。

我按 1M 上下文来计算。假设 KV 精度为 8 bit，indexer 精度为 16 bit。你也可以自己去玩这个计算器。

https://kvcache.ai/tools/kv-cache-calculator/

![](https://pbs.twimg.com/media/HI8dAepboAAjbvE.jpg)

在 1M 上下文下：

1. DeepSeek V4 只需要 5.48GB HBM
2. GML5 需要 60GB HBM
3. Qwen3-235B-A22B 需要惊人的 89B

请注意：

1. DeepSeek 是 1.6T 参数模型；
2. GLM5 约为 700B 参数，已经使用了 DeepSeek 的 MLA 和 DSA，只是还没有使用最新的压缩注意力；
3. Qwen3-235B-A22B 约为 235B，并使用 GQA attention。

DeepSeek 为缓解内存压力做出了基础性贡献。如果这种创新被广泛采用，就能让长周期 agent 变得非常经济，并解锁下一批用例。

![](https://pbs.twimg.com/media/HI8jYKjbgAABN2i.jpg)

## 疯狂背后的方法

这种极小的 KV Cache 规模，而且没有牺牲质量，正是他们能以荒谬低价提供长期缓存的原因：其缓存命中价格不到 Sonnet 4.6 的 3%，并且他们可以保留数小时。

面向长周期任务的小体积缓存，使得把缓存卸载到 SSD、再重新加载变得非常划算。这降低了对 HBM 的需求，而从中国 AI 硬件产业的角度看，HBM 正供应紧张，也是最难制造的内存。DeepSeek 还开发了从 SSD 更快加载 KV Cache 的技术，相关内容见 [Dual Path 论文](https://arxiv.org/pdf/2602.21548)。

![](https://pbs.twimg.com/media/HI8lTGdaQAASZY9.jpg)

## KV Cache 压缩的直接受益者是谁？

谁能大量供应 SSD？别忘了，YMCT 正在成为 3D NAND 巨头。NAND 让 DeepSeek 避免重新计算 KV。反过来，DeepSeek 也为 NAND 和 SSD 创造了一个巨大市场，不仅属于 YMTC，也属于其他所有厂商。

![](https://pbs.twimg.com/media/HI8Vt5Wa0AArcJh.png)

## 不过，这不只是 NAND 和 SSD 的故事

LPDDR 内存很有潜力成为存放权重的地方，并在需要时把权重流式送入 HBM，从而降低 HBM 需求压力。[SGLang 团队发表过一篇很好的博客](https://www.lmsys.org/blog/2025-09-25-gb200-part-2/)讨论这个问题。下面这张图解释了这套方案如何工作。

虽然 DeepSeek 并没有专门为此做什么，但他们的 MoE 架构拥有大量专家，并且使用 4 bit 权重，这让这套方案更容易实现。

![](https://pbs.twimg.com/media/HI8XeibbsAA6N8d.jpg)

这项创新与极其紧凑的 KV Cache（无损）结合起来，会显著降低 HBM 需求。

中国谁在做 LPDDR？CXMT。他们在 LPDDR 速度上只落后 0.5 代，在密度上落后 1 代，并不算远！除了充足的 NAND，中国生态在不久的将来也会拥有充足的 LPDDR。这能缓解计算压力吗？能。继续看……

![](https://pbs.twimg.com/media/HI8V1KMaUAADa-Z.png)

## 聪明地使用内存，也会降低 GPU/ASIC 压力

NAND 用于 KV Cache 的价值很容易理解：它允许更长时间地持有 KV Cache，降低 HBM 压力，并帮助避免重新计算 KV Cache，从而减轻 GPU 与 ASIC 的计算压力。那么 LPDDR 除了作为“just in time”流式加载权重的地方之外，也能以类似方式帮忙吗？答案是：能。

LPDDR 可以承载大量被称为“Engram”的东西。在他们的 [Engram 论文](https://arxiv.org/pdf/2601.07372)中，DeepSeek 指出：虽然 MoE 通过条件计算扩展容量，但 Transformer 缺少一种用于知识查找的原生 primitive。因此，它们被迫用计算来低效地模拟检索。DeepSeek 引入了 Engram：一个将经典 N-gram embedding 现代化为 O(1) hash-based lookup 的模块，由此创造出一条互补的稀疏性轴线，他们称之为 conditional memory。这可以节省计算，但需要用内存承载可能很大的 embedding table。这是经典的内存-计算替代，不过关键洞察在于：“内存”一侧按每 bit 检索成本算要便宜得多（一次 LPDDR lookup 对比穿过 Transformer 层的一次完整 forward pass），因此在规模化时这是一笔非常划算的交易。DeepSeek 就是这样通过用内存换计算来节省算力的！

![](https://pbs.twimg.com/media/HI8cXUVaIAAECSv.jpg)

这是值得做的取舍：中国 GPU 和 ASIC 在原始 FLOPs 上会长期落后于西方 GPU，因为它们没有同样的 chiplet 晶体管密度（没有 EUV）。它们在封装上也相当落后。所以这类取舍非常值得，尤其是在你能够制造大量 NAND 和 LPDDR 内存的情况下。

## 回到 DeepSeek 的长期棋局

从所有这些创新来看，DeepSeek 的目标似乎并不是赚几亿美元的短期利润。看看他们做出的选择就知道了：还没有多模态，还没有语音模型，视频模型更是“那是什么？”他们玩的，是一场耐心的 10 万亿美元大局：赋能替代性硬件生态。

这不只是让中国内存玩家成为中国乃至全球 AI 硬件舞台上的关键角色，也是在降低资源需求本身，使 AI 模型能够以更低成本训练和服务。这会让许多 GPU/ASIC 制造商以及网络芯片制造商变成可行选项。所有这些创新也会帮助西方开源生态和新的硬件制造商。

所有迹象都在那里。让我们详细回顾一下他们提出的这些创新：

1. DeepSeek V2 引入了 Mixture of Expert（MoE）和 MLA。MoE 让训练非常智能的模型所需计算减少了 40% 到 50%。MLA 让 KV Cache 降低了 90%。这使得把 KV Cache 卸载到 SSD 变得相当高效。这些想法出现在他们 2024 年 5 月的论文 [DeepSeek V2](https://arxiv.org/pdf/2405.04434) 中。后来，它们解锁了 DeepSeek V3 的训练：当时 DeepSeek V3 接近闭源水准，却只用了 2048 张被削弱的 H800 GPU。

![](https://pbs.twimg.com/media/HI-xE9wbwAAIPkq.jpg)

2. DSA（在 [DeepSeek V3.2 Exp](https://arxiv.org/pdf/2512.02556) 中引入）用于降低长上下文场景下的计算量，同时缓解 HBM 带宽压力。它确保计算不会随着上下文增长而增长。请看下面的图表，DeepSeek-v3.2 的处理时间会随着上下文增长保持平坦。

![](https://pbs.twimg.com/media/HI8tGRtbgAAY520.jpg)

3. mHC 于 2025 年 12 月在论文 [mHC: Manifold-Constrained Hyper-Connections](https://arxiv.org/pdf/2512.24880) 中提出。mHC 是 DeepSeek 的一种宏观架构创新，重新发明了信息如何在 Transformer 层之间流动。它不使用自 ResNet 以来的标准残差连接（x + F(x)），而是把残差流扩展成多个并行的信息高速通道，并允许它们之间进行可学习的混合。关键在于，它把混合矩阵约束为双随机矩阵（通过 Sinkhorn-Knopp 投影到 Birkhoff polytope），这在数学上保证了信号幅度在任意深度下都能被保留。

- 这解决了无约束 Hyper-Connections（最初由 ByteDance 发明）中灾难性的失稳问题：在 27B 规模下，信号放大会爆炸到 3000×，导致训练彻底崩溃。
- 计算成本很低：mHC 只增加 6.7% 的 wall-clock 训练开销，因为它不改变 attention 或 FFN 层的 FLOPs，只改变这些层的输出如何在层之间路由。
- 但性能提升相当可观：在 27B 参数规模下，mHC 在 BIG-Bench Hard 推理上提升 +7.2 分，在 DROP 上 +3.2，在 GSM8K 数学上 +2.8，在 MMLU 通用知识上 +1.4，而模型大小相同，计算预算几乎相同。

本质上，mHC 通过给网络提供更丰富、更有表达力的信息跨层路由拓扑，在几乎不增加额外 FLOPs 的情况下，显著提升了每个参数所承载的智能。

![](https://pbs.twimg.com/media/HI_HvaNb0AAVQYB.jpg)

4. CSA、HSA（在 2026 年 4 月的 [DeepSeek V4](https://huggingface.co/deepseek-ai/DeepSeek-V4-Pro/blob/main/DeepSeek_V4.pdf) 中引入）通过压缩 KV token，把 KV 需求再降低 90%，并大幅降低所需 FLOPs，从而同时缓解 HBM 与 GPU/ASIC 压力。

![](https://pbs.twimg.com/media/HI8tWzibcAArEOl.png)

5. [Engram](https://arxiv.org/pdf/2601.07372) 于 2026 年第一季度引入，在某种意义上用内存（LPDDR memory）交换计算。如下方详细图表所示，在总体参数预算相同的情况下，Engram 带来了性能提升。

![](https://pbs.twimg.com/media/HI-6s2GasAAKoRh.jpg)

6. 对计算与通信重叠的极致关注，以及 Dual Path 这类创新，可以被解释为对资源约束的应对。但 DeepSeek 还进一步为硬件供应商的 ASIC 设计提供建议，确保他们不浪费宝贵的硅片资源。下面内容来自 [DeepSeek V4 论文](https://huggingface.co/deepseek-ai/DeepSeek-V4-Pro/blob/main/DeepSeek_V4.pdf)。

![](https://pbs.twimg.com/media/HI8oNywa8AA-Yxz.png)

7. 对 TileLang 的投入也指向同一个方向：他们不只是解决自己的算力紧张问题，而是在让中国硬件生态具备与西方生态竞争的能力。有了 TileLang，就可以开发一次 kernel（计算代码），然后让它在多个拥有 TileLang backend 的硬件平台上成功运行。我预计其他中国实验室也会加入进来，帮助中国硬件制造商间接应对“CUDA moat”。这也会解锁更多西方硬件，比如 AMD。

注：许多中国 AI 平台要么提供 CUDA 兼容性，要么提供 CUDA translation layer；Moore Threads、MetaX、Biren 和 Iluvatar CoreX 都是通过 translation layer 实现 CUDA 兼容度较高的中国芯片。它们理论上并不需要 TileLang。

![](https://pbs.twimg.com/media/HI8bWY7akAA5zwu.jpg)

## 大规模 RL 与 RSI

如果 DeepSeek 能获得更多算力（因为潜在硬件选项更多），同时计算需求又被降低，那么他们就能承担更雄心勃勃的训练项目，尤其是 RL post training。RL 涉及生成大量轨迹，也就是生成数万亿 token，成本会迅速变得非常高。此外，如果要训练 1M 上下文模型，就需要生成那么长的轨迹。训练模型处理这种长轨迹，能够解锁长周期任务。

此外，由于硬件选项增加，DeepSeek 可用的硬件更多，也会推动自动化研究（RSI）。RSI 指 AI 自己设计并执行实验。这种方法包含大量试错，成本会非常快地上升。不过，RSI 对探索整个设计空间非常重要。DeepSeek 在触及 AGI 并进一步走向 ASI 之前，需要具备 RSI 能力。

## DeepSeek 今天做的事，行业明天会跟上

DeepSeek 围绕 Mixture of Expert、MLA、DSA 的创新，已经被全球和中国的其他 AI 实验室采用。

例如，GLM 系列模型的开发者 ZAI 使用了 MLA 和 DSA。Kimi（Moonshot）也采用了 MLA，并毫不避讳地表示其架构基于 DeepSeek 的架构。反过来，DeepSeek 也使用了 Muon optimiser，而 Muon 最早是由 Kimi（Moonshot）用于大规模训练的。

（注：
- MoE 是 [Google 在 2027 年由 Naom Shazeer 作为关键作者](https://arxiv.org/pdf/1701.06538) 发明的。DeepSeek 将其应用到巨大规模，并发明了自己的技巧。
- Muon（MomentUm Orthogonalized by Newton-Schulz）优化器由机器学习研究者 Keller Jordan 于 2024 年末创建。Kimi（Moonshot）团队是第一个在巨大规模上使用它的团队。）

## 那怎么赚钱呢？

让我们研究一下 OpenAI 这个有趣例子。OpenAI 获得了 AMD 和 Cerebras 的 warrant/options，可以在较低价格买入其股票，条件基于消耗里程碑。这对 AMD 和 Cerebras 来说是一笔很好的交易。OpenAI 承诺使用它们的硬件，会让它们长期来看更可能成功。

[AMD 公告中的引文](https://www.amd.com/en/newsroom/press-releases/2025-10-6-amd-and-openai-announce-strategic-partnership-to-d.html)：“作为协议的一部分，为进一步对齐战略利益，AMD 已向 OpenAI 发行一份认股权证，最多可购买 1.6 亿股 AMD 普通股，并按具体里程碑达成情况分批归属。第一批将在最初 1 gigawatt 部署时归属，后续批次会随着采购规模扩大到 6 gigawatts 而归属。归属还与 AMD 达成特定股价目标，以及 OpenAI 达成为规模化部署 AMD 所需的技术和商业里程碑相绑定。”

![](https://pbs.twimg.com/media/HI8X-TQaEAAcpFs.jpg)

我预测 DeepSeek 会与多家中国内存、ASIC、CPU 和网络栈制造商达成类似协议，并与它们密切合作，让它们的硬件栈能够胜任领先 AI 工作负载。

所有西方（包括东亚盟友）AI 股票的合计估值远远超过 10 万亿美元。这种“通过股权奖励合作”的方法，使 DeepSeek 能帮助中国创造一个同样庞大的产业，并在自己达到 1 万亿美元估值的同时，拿到属于自己的那一份蛋糕。

这将让他们赚到多得多的钱，同时也实现他们口中的目标：“AGI for everyone”。梁文锋是 Jim Simmon 的忠实粉丝，也是一位极其聪明的资本家，他不可能错过这一点！

如果你看 DeepSeek 到目前为止所做的一切，这是唯一说得通的解释……

![](https://pbs.twimg.com/media/HI8jJHQaUAAaIh1.jpg)

关于这些创新的详细博客会在本周末发布，如果感兴趣，可以关注我的 Substack：https://polymath707.substack.com/
