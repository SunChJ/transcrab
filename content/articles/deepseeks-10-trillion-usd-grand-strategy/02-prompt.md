你是一个翻译助手。请把下面的 Markdown 内容翻译成简体中文。
[TransCrab Translation Profile]
- mode: auto
- audience: business
- style: business
- auto-resolved-mode: refined
- auto-resolved-audience: business
- auto-resolved-style: business
- auto-reasons: 公开发布默认使用 refined 流程，优先质量与稳定性；商业关键词命中较高，判定为 business
- pipeline: analyze -> translate -> review -> revise
- 执行策略：自动判断（auto）。
- 发布流程固定按 refined 质量标准执行。
- 你需要根据主题（technology/business/life）自动选择最合适的翻译风格与语气。
要求：
- 保留 Markdown 结构（标题/列表/引用/表格/链接）。
- 代码块、命令、URL、文件路径保持原样，不要翻译。
- 若正文中出现形如 @@FIGURE_SVG_001@@ 的占位符，必须原样保留（不要改写、不要删除、不要移动）。
- **必须同时翻译标题**：请先输出一行 Markdown 一级标题（以 "# " 开头），作为译文标题。
- 然后空一行，再输出译文正文（不要再重复标题）。
- 只输出翻译结果本身，不要附加解释、不要加前后缀。
---
Have you ever wondered, how DeepSeek may make money, and lot of it?

They didn't come up with competitive coding plans like GLM, MoonShot and MiniMax. They don't have multimodal, audio, video models. Till date they don't have a harness (they have begun hiring recently for building a harness)? DeepSeek is also committed to open source in the long term and is too happy to share their secret sauce. Is this madness? Is this sheer waste of money? Are investors who are about to invest 10B USD in them throwing money into a drain?

No - quite the contrary, imho!!! 

Here I present observations about what they have done till date, and a  strategy they seem to be following . [Liang Wenfeng](https://en.wikipedia.org/wiki/Liang_Wenfeng)'s (DeepSeek CEO) eyes seem to be on much bigger prize and they could achieve 1T USD valuation, while helping create a 10T USD industry!

![](https://pbs.twimg.com/media/HI_Cfs7bwAAt2tI.png)

## Revisiting DeepSeek's Hero's Journey

DeepSeek has always gone against the wind of building incrementally better models and trying to sell immediate applications - e.g. coding plans. I wrote this viral tweet on 27th Jan 2025 about what I saw as [DeepSeek's Hero's Journey.](https://x.com/bookwormengr/status/1883712073814954379?s=20) The story is getting only more interesting.

- When people were trying building dense models, DeepSeek went after Mixture of Expert models (MoE) that were hard to train.
- They worked from 'first principal' approach and invented new algorithm GRPO to replace dominant PPO algorithm for Reinforcement Learning (RL) that was more expensive to implement.
- They figured out Reinforcement Learning from Verified Rewards (RLVR) as a key strategy to improve reasoning ability of models.
- They came up with a simple strategy for Speculative Decoding through "Multi Token Prediction" that also densified the training signal.
- They perfected "ZERO bubble" pipelines to improve use of limited GPU resources.
- They published Expert Load balancer to make it easy for everyone deploy Mixture of Expert models. Particularly with "Wide Expert Parallel" strategy models can be served much more economically as one can have large batches.
- They invented MLA, DSA, CSA, HCA to reduce KV Cache need and keep computation demand against growing context near constant.
- They invented Engram to trade memory for compute.
- They invented mHC to achieve stable training as model size grows. And th list continues....
In Hero's Journey story structure (the most universal), hero never decides what his journey is going to be. He learns along the way and figures out a great mission for himself and completes it against all the odds. He meets many detractors, but he ignores them. He meets many bad faith actors. He has great flaw or shortcoming - but he overcomes them to accomplish his mission. He confronts challenges that seem unsurmountable, but figures out how to make alliances and how to use precious resources wisely. This is what gets the audience to root for the hero. This is what earns DeepSeek their fan following and global respect and also detractors.

As I will show you in detail, DeepSeek is on this journey for long enough now and have discovered the ultimate destiny:  it is not selling coding plans, but to enable a 10T USD Chinese AI hardware ecosystem and achieve 1T USD valuation for itself. In doing to so they will enable many new entrants in the western hardware ecosystem as well.

Comments and criticism welcome: [@naval](https://x.com/@naval) [@teortaxesTex](https://x.com/@teortaxesTex) [@jukan05](https://x.com/@jukan05) [@bubbleboi](https://x.com/@bubbleboi) [@poezhao0605](https://x.com/poezhao0605) [@hsu_steve](https://x.com/@hsu_steve) [@tphuang](https://x.com/@tphuang)

![](https://pbs.twimg.com/media/HI-_GxpbUAA0ytD.jpg)

## Starting with some fun with KV Cache calculations:

Read this timely tweet from @SemiAnalysis_ :

![](https://pbs.twimg.com/media/HI8tom-asAAbsp0.jpg)

Let us do some fun KV cache math first. Don't worry if you don't like Math. We will use  recently release KV Cache calculator to see KV Cache saving made possible by DeepSeek V4 Pro and compare it with latest GLM and Qwen models.

I compute for 1M context. I assume 8 bit KV precision and 16 bit indexer precision. You can play with the calculator.

https://kvcache.ai/tools/kv-cache-calculator/

![](https://pbs.twimg.com/media/HI8dAepboAAjbvE.jpg)

For 1M context

1. DeepSeek V4 needs only 5.48GB HBM
2. GML5 needs 60GB HBM
3. Qwen3-235B-A22B needs whopping 89B
Mind you

1. DeepSeek is 1.6T parameter model,
2. GLM5 is around 700B parameter, it already uses DeepSeek's MLA and DSA; though not latest compressed attention
3. Qwen3-235B-A22B is around 235B  and uses GQA attention
DeepSeek has made foundational contribution to ease pressure on memory. If widely adopted this innovation can make long horizon agents highly economical and unlock next set of use cases.

![](https://pbs.twimg.com/media/HI8jYKjbgAABN2i.jpg)

## Method behind the madness:

This small size of KV cache - without compromising on quality -  is the reason they can offer long held cache at such a ridiculously low price - less than 3% price of Cache hits for Sonnet 4.6 - and they hold it for multiple hours.

Small amount of cache for long horizon task enables offloading to SSDs and reloading very cost effective. This reduces requirement of HBM that is in short supply and hardest to make memory from Chinese AI hardware industry perspective. DeepSeek have also developed techniques to load KV cache faster from SSD as described [in the Dual Path paper.](https://arxiv.org/pdf/2602.21548)

![](https://pbs.twimg.com/media/HI8lTGdaQAASZY9.jpg)

## Who is the immediate beneficiary of KV Cache compression?:

Who supplies SSD in large quantity? Remember YMCT is emerging as 3D NAND giant. NAND allows DeepSeek to avoid re-computation of KVs. In turn, DeepSeek creates a large market for NAND & SSD - not just of YMTC's but everyone else's as well.

![](https://pbs.twimg.com/media/HI8Vt5Wa0AArcJh.png)

## It is not only about NAND & SSD, however:

LPDDR memory has great potential to be a place where you hold weights and stream them into HBM as needed, reducing the pressure on HBM demand.  [SGLang team has published great blog about it.](https://www.lmsys.org/blog/2025-09-25-gb200-part-2/) I present below diagram to explain how the scheme works.

While DeepSeek did not do anything specifically for this - their MoE architecture with large number of experts and 4 bit weights make it easy to implement this scheme.

![](https://pbs.twimg.com/media/HI8XeibbsAA6N8d.jpg)

This innovation combined with super compact KV Cache (lossless) reduce HBM demand significantly.

Who in China makes LPDDR? CXMT. They are only 0.5 Gen behind on speed for LPDDR and 1 generation behind on density. Not very far! In addition abundant NAND, Chinese ecosystem will have abundant LPDDR in near future. Can this relieve pressure on compute? YES. Follow on..

![](https://pbs.twimg.com/media/HI8V1KMaUAADa-Z.png)

## Smart use of memory also reduces pressure of GPUs/ASICS as well

It is quite clear to understand use of NAND for KV cache allows holding KV cache for longer, reduce pressure of HBM and helps avoid re-computation of KV cache that relieves compute pressure on GPUs & ASICs. Can LPDDR also help in similar manner, in addition being a place from where weights can be streamed in "just in time fashion"? The answer is YES.

LPDDR  supports holding large amount of what is known as "Engram". In their [Engram paper ](https://arxiv.org/pdf/2601.07372)DeepSeek showed that while MoE scales capacity via conditional computation, Transformers lack a native primitive for knowledge lookup. They're forced to inefficiently simulate retrieval through computation. They introduce Engram, a module that modernizes classic N-gram embedding into an O(1) hash-based lookup, creating a complementary sparsity axis they call conditional memory. This saves computation, but needs memory to host the embeddings table which can be large in size.  It is a classic memory-compute substitution, but with the insight that the "memory" side is dramatically cheaper per bit retrieved (a LPDDR lookup vs. a full forward pass through transformer layers), making it a very favorable trade at scale. This is how they save on compute by trading memory!!!

![](https://pbs.twimg.com/media/HI8cXUVaIAAECSv.jpg)

Trade-offs worth having: Chinese GPUs & ASICS are forever going to lag in raw FLOPs compared to western GPUs due to not having same transistor density per chiplet (no EUV). They are quite behind in packaging as well. So such trade-offs are well worth it, particularly if you can make abundant NAND and LPDDR memory.

## DeepSeek's long game recounted:

From all these innovations, DeepSeek's game doesn't seem to be immediate profits of few hundred millions given all the choices they have made (no multimodality yet, no voice models, video - what is that?) - but they are playing a patient 10T USD game to enable alternative hardware ecosystem.

It is not only about making Chinese  memory players key players on Chinese and global AI hardware arena, but also reducing the resource demand itself, to be able to train and serve AI models cost effectively - this will enable many GPU/ASIC makers as well as networking chip makers as they will become viable options. All these innovations will also help Western open source ecosystem as well as new hardware makers.

All the signs are there. Just let us recount in detail all the innovations they came up with:

1.  Mixture of Expert (MoE) and MLA introduced in DeepSeek V2. MoE is made it possible to train very intelligent models at 40 to 50% less compute. MLA made it possible to reduce KV cache by 90%. This made offloading KV cache to SSD quite efficient. This ideas were introduced in their May 2024 paper [DeepSeek V2](https://arxiv.org/pdf/2405.04434). It later unlocked training DeepSeek V3 which was near closed source at the time with only 2048 H800 nerfed GPUs.

![](https://pbs.twimg.com/media/HI-xE9wbwAAIPkq.jpg)

2. DSA (introduced in [DeepSeek V3.2 Exp)](https://arxiv.org/pdf/2512.02556) to reduce compute for long context scenarios and also relieve pressure on HBM bandwidth. It ensures computation doesn't grow with growing context. Please see charts below - processing time for DeepSeek-v3.2 stays flat with context.

![](https://pbs.twimg.com/media/HI8tGRtbgAAY520.jpg)

3. mHC introduced in Dec 2025 in paper [mHC: Manifold-Constrained Hyper-Connections](https://arxiv.org/pdf/2512.24880). mHC  is a macro-architecture innovation from DeepSeek that reinvents how information flows between transformer layers. Instead of the standard residual connection (x + F(x)) used since ResNet, mHC expands the residual stream into multiple parallel information highways and allows learned mixing between them — but crucially constrains the mixing matrices to be doubly stochastic (via Sinkhorn-Knopp projection onto the Birkhoff polytope), which mathematically guarantees that signal magnitude is preserved across arbitrary depth.

- This solves the catastrophic instability that plagued unconstrained Hyper-Connections (initially invented at ByteDance), where signal amplification exploded to 3000× at 27B scale, collapsing training entirely.
- The compute cost is minimal: mHC adds only 6.7% wall-clock training overhead since it doesn't change the FLOPs of attention or FFN layers, only how their outputs are routed between layers.
- The performance gains, however, are substantial: at 27B parameters, mHC delivers +7.2 points on BIG-Bench Hard reasoning, +3.2 on DROP, +2.8 on GSM8K math, and +1.4 on MMLU general knowledge, all at the same model size and nearly identical compute budget.
In essence, mHC achieves meaningfully higher intelligence per parameter by giving the network a richer, more expressive topology for routing information across layers, while paying almost nothing in additional FLOPs.

![](https://pbs.twimg.com/media/HI_HvaNb0AAVQYB.jpg)

4. CSA, HSA (introduced in [DeepSeek V4](https://huggingface.co/deepseek-ai/DeepSeek-V4-Pro/blob/main/DeepSeek_V4.pdf) in April 2026) to reduce KV need by another 90% by compressing KV tokens and reduces FLOPs needed by large margin relieving pressure on both HBM and GPU/ASIC.

![](https://pbs.twimg.com/media/HI8tWzibcAArEOl.png)

5. [Engram](https://arxiv.org/pdf/2601.07372) introduced in Q1 2026 where they trade memory (LPDDR memory) for compute (in a way). As the following detailed chart show performance gain due to Engram at same overall parameters budget.

![](https://pbs.twimg.com/media/HI-6s2GasAAKoRh.jpg)

6. Extreme focus on Compute and Communication overlap, and innovations like Dual Path can be explained as work around to resource constraint. But DeepSeek goes further to advise hardware vendors on their ASIC design to make sure they don't waste precious silicon resources. This is from [DeepSeek V4 paper](https://huggingface.co/deepseek-ai/DeepSeek-V4-Pro/blob/main/DeepSeek_V4.pdf).

![](https://pbs.twimg.com/media/HI8oNywa8AA-Yxz.png)

7. Investment in TileLang point in the consistent direction that they are not just dealing with their own compute crunch but making Chinese hardware ecosystem competitive with western ecosystem. With Tilelang it is possible to develop kernel (code for computation) once and have it run successfully on multiple hardware platforms for which TileLang backend is available. I expect all other China based labs to join in - helping Chinese hardware makers deal indirectly with the "CUDA moat". This also unlocks more western hardware like AMD. 
Note: many AI platforms in China either provide CUDA compatibility or CUDA translation layer: Moore Threads, MetaX, Biren, and Iluvatar CoreX are the most CUDA-compatible Chinese chips via translation layers. They do not need TileLang (in theory).

![](https://pbs.twimg.com/media/HI8bWY7akAA5zwu.jpg)

## Large scale RL and RSI:

With access to more  compute  (due to more potential hardware options) and reduction in compute demand, DeepSeek can take on much more ambitious training projects; particularly RL post training. RL involves generating large number of trajectories - generating trillions of tokens. It can get expensive real fast. Furthermore to train 1M context models, you need to generate trajectories that long. Training models for such long trajectories enables long horizon tasks.

Furthermore, availability of more hardware at DeepSeek due to increased options will enable automated research (RSI). RSI involves AI itself designing and carrying out experiments. The approach has large number of trials and errors and can get costly very quickly. However, RSI is important to explore the entire design space. DeepSeek will need to be RSI capable before they hit AGI followed by ASI.

## What DeepSeek does today, rest of the industry does tomorrow:

DeepSeek's innovations around Mixture of Expert, MLA, DSA have been picked up by rest of the AI labs from around the world and from China. 

For example, ZAI - makers of GLM family of models - use MLA and DSA. Kimi (Moonshot) has adopted MLA and have no hesitation in saying their architecture is based on DeepSeek's architecture. In return DeepSeek uses Muon optimiser that was first used my Kimi (Moonshot) for large scale training. 

(NOTE:
- MoE was invented at [Google in 2027 with Naom Shazeer](https://arxiv.org/pdf/1701.06538) as the key author. DeepSeek applied it at massive scale and invented their own tricks.
- The Muon (MomentUm Orthogonalized by Newton-Schulz) optimizer was created by machine learning researcher Keller Jordan in late 2024. Kimi (Moonshot) team were the first one to use it at massive scale.)

## What about making $$$?:

Let us study interesting example of OpenAI. OpenAI received warrant/options to buy stocks of AMD and Cerebras at a low price, based on consumption mile stones. It is a great deal for AMD and Cerebras. OpenAI being committed to them, makes they likely to succeed in the long run.

[Quote from AMD announcement](https://www.amd.com/en/newsroom/press-releases/2025-10-6-amd-and-openai-announce-strategic-partnership-to-d.html): "As part of the agreement, to further align strategic interests, AMD has issued OpenAI a warrant for up to 160 million shares of AMD common stock, structured to vest as specific milestones are achieved. The first tranche vests with the initial 1 gigawatt deployment, with additional tranches vesting as purchases scale up to 6 gigawatts. Vesting is further tied to AMD achieving certain share-price targets and to OpenAI achieving the technical and commercial milestones required to enable AMD deployments at scale."

![](https://pbs.twimg.com/media/HI8X-TQaEAAcpFs.jpg)

I forecast DeepSeek to enter in such agreements with multiple Chinese memory, ASIC, CPU and networking stack makers and work closely with them to make their hardware stacks viable for leading AI workloads.

Given combined valuation of all Western (including East Asian allies) AI stocks far exceeds 10T USD. This - collaboration that awards equity - approach allows DeepSeek to help create equally big industry in China and claim their piece of the pie while achieving 1T USD valuation for themselves. 

This will allow them to make far more $$$ while also achieving their goal in their words of "AGI for everyone". Liang Wenfeng - a big fan of Jim Simmon  - is too smart a capitalist  to miss this! 

This is the only thing that makes sense, if you look at everything DeepSeek have done so far...

![](https://pbs.twimg.com/media/HI8jJHQaUAAaIh1.jpg)

Detailed blog on these innovation coming out this weekend, follow my substack https://polymath707.substack.com/ if interested...
