---
title: LLM 究竟是如何工作的
date: '2026-06-29T03:54:38.674Z'
sourceUrl: 'https://www.0xkato.xyz/how-llms-actually-work/'
lang: zh
---
2026 年 6 月 1 日，星期一 - 26 分钟

这篇文章会带你走一遍 LLM 的工作方式。现代 LLM 大多是通过一层又一层堆叠 transformer block 构建起来的，所以只要理解 transformer 这套机制，你就已经走完了大半程。

我会讲现代基于 transformer 的 LLM 内部最核心的机制，但不会塞进那些黏糊糊的数学细节。别误会，你确实应该学习数学，不过这篇可以作为入门。

大多数现代 LLM 共享同一种 transformer 家族骨架。它们之间的差异来自各自的训练数据、规模和配置选择，以及在基础模型之上做的后训练。读完之后，你应该能够阅读许多现代 LLM 论文或 model card，并知道其中每一节在讨论架构中的哪一部分。

路线如下：

1. Tokens：一串文本如何变成一串整数
2. Embeddings：这些整数如何获得含义
3. Positional encoding：模型如何知道 token 出现的顺序
4. Attention：token 如何彼此共享信息
5. Multi-head attention：模型如何同时跟踪多种关系
6. Feed-forward network：模型中很大一部分已存储结构所在的位置
7. Residual stream 和 layer normalization：是什么让深层堆叠可以训练
8. 预测下一个 token：模型实际输出什么，以及生成循环如何工作
9. Architecture vs trained weights：现代 LLM 中哪些东西大体共享，哪些东西不同

![Transformer pipeline from tokenization to next-token prediction](https://www.0xkato.xyz/assets/transformer-pipeline.png)

全文会穿插一些“小解释”，这样无论你背景如何，都可以跟上。

* * *

## Tokenization

模型并不直接阅读文本。它们读取的是整数 ID。把你的 prompt 转换成这些整数序列的步骤，就叫 tokenization。

Tokenizer 接收一个字符串，并输出一串整数，其中每个整数都指向固定 vocabulary 中的一个条目。现代 LLM 的 vocabulary 通常包含几万到几十万个条目。

> **小解释：token ID**  
> Token ID 是模型用来表示某个 vocabulary 条目的整数。模型处理的是这个数字，而不是书写出来的单词本身。

Token 通常不是完整单词，而是 subword 片段。比如 “tokenization” 可能被拆成 \[“token”, “ization”\]。“running” 可能被拆成 \[“run”, “ning”\]。原因是效率。整词 vocabulary 太大，而且无法很好泛化到新词。字符级 vocabulary 又太小，会迫使模型从零开始学习最简单的模式。Subword tokenization 处在中间：最常见的片段会成为单个 token，罕见或新出现的词则由更小的片段组合而成。

> **小解释：vocabulary**  
> Vocabulary 是 tokenizer 的固定片段列表。每个片段都有一个 ID，模型只能直接接收这个列表中的 ID。

这个取舍会在很多人意想不到的地方显现出来。经典例子是：问一个 LLM “strawberry” 里有几个 R。LLM 过去经常答错。这并不是模型不会计数，而是模型并不直接在字母层面运作；它只处理 token ID，而这些 ID 恰好拼出了一个人类会按字母拆分的词。

![Tokenization turns text into token IDs](https://www.0xkato.xyz/assets/transformer-tokenization.png)

不同模型家族使用不同的 tokenizer。GPT 模型使用 Byte Pair Encoding 的变体。SentencePiece 常见于 LLaMA 风格模型。选择哪一种会影响计算量，因为 token 更少意味着工作更少，也会影响多语言覆盖等问题。但基本形状相同：文本输入，整数输出。

现在 prompt 已经是一串整数，下一步就是给这些整数赋予含义。

* * *

## Embeddings

像 `1024` 这样的 token ID 只是一个行索引。它本身没有任何含义。给它含义的是一张巨大的表，叫 embedding matrix。

每个模型都有这样一张表。Vocabulary 中每个条目对应一行，每一行都是一长串数字组成的 vector。每一行的长度就是模型的 hidden size。在许多 7B 级模型里，这意味着每个 token 有 4,096 个数字。更大的模型通常使用更宽的 vector。

> **小解释：vector**  
> Vector 是一串数字。在 transformer 中，每个 token 都会变成一个 vector，这样模型才能对它做数学运算。

当 tokenizer 把一个整数交给模型时，模型会查找对应的行，并使用那一行的 vector。这个 vector 就是该 token 的 embedding。它是模型对这个 token “含义”的表示，是在训练中学出来的。

> **小解释：embedding matrix**  
> Embedding matrix 是一张查找表。输入 token ID，输出学到的 vector。

这些 embeddings 有一个有趣性质：语义相近的 token 最终会拥有相近的 vector。“king”的 vector 在空间中接近 “queen”，“Paris”的 vector 接近 “France”。这些都不是硬编码进去的。它们是在足够多文本上训练后涌现出来的；模型学到这些位置，是因为它们有助于更好地预测文本。

你可以对 embeddings 做算术，有时还真的有效。著名例子是 `king − man + woman ≈ queen`。Embedding space 的几何结构承载了真实的语义结构，尽管没人告诉模型要以这种方式构建它。

![Embedding space analogy with semantic relationships](https://www.0xkato.xyz/assets/transformer-embedding-analogy.png)

这里需要说清楚：到这个阶段，每个 token 都已经被替换为它的 embedding，但 embedding 本身并不说明这个 token 位于序列中的什么位置。“dog”的 vector 是同一个 vector，不管 “dog” 是 prompt 中第一个词还是第五个词。这就是问题所在。

Positional encoding 填补的正是这个空缺。

* * *

## Positional encoding

普通 self-attention 并没有内置的词序表示。如果没有某种位置信号，它就没有直接方式知道 “dog” 出现在 “bites” 之前还是之后。

词序会改变含义。所以模型还需要另一块东西。它需要一种方法，把每个 token 的位置注入到数学运算中。

> **小解释：positional encoding**  
> Positional encoding 是模型获取顺序信息的方式。它告诉模型每个 token 在序列中的位置。

最初的 transformer 论文（Vaswani et al. 2017）是这样做的：给每个位置一组自己的数字模式，并在任何其他处理之前，把它直接加到每个 token 的 embedding 上。位置 1 有一种模式，位置 5 有另一种模式，位置 100 又有另一种模式。这些模式来自不同频率的 sine 和 cosine 波。于是，位置 1 上的 “dog” embedding 就不同于位置 5 上的 “dog” embedding，只因为加进去的位置模式不同。

这套方法能用，而 sinusoidal encodings 被选择的部分原因，是它们可以外推到训练时见过的精确序列长度之外。但 additive position schemes 仍有两个问题，随着模型规模变大，这两个问题变得重要起来。

第一，embedding 必须在同一组数字里同时承载含义和位置。能塞进去的信息是有限的。

第二，尤其是 learned absolute position embeddings，泛化并不干净。如果你训练时 prompt 最多只有 2,048 个 token，那么模型训练时从没见过位置 5,000，而那个位置的 embedding 也不是以同样方式学出来的。

现代模型大多使用另一种方案，叫 Rotary Position Embeddings（RoPE）。它由 Su 等人在 2021 年提出，现在被 LLaMA、Mistral、Gemma、Qwen 和大多数其他开放权重模型家族使用。直觉是：不要把位置信息加到每个 token 的 vector 上，而是根据 token 的位置，把 Query 和 Key vectors 旋转一个角度。位置 1 的 token 转动较小，位置 100 的 token 转动更大。之后在 attention 中比较两个 token 时，真正起作用的是它们 Query 和 Key 旋转之间的差异，这就编码了它们相隔多远。

> **小解释：RoPE**  
> RoPE 是 Rotary Position Embeddings 的缩写。它不添加位置 vector，而是旋转 Query 和 Key vectors，让相对距离在 attention 中显现出来。

![Rotary position embeddings rotate vectors by position](https://www.0xkato.xyz/assets/transformer-rope.png)

实际优势很明显。RoPE 能自然编码相对位置，这更接近 attention 真正需要的东西。它对更长上下文的泛化更好，而且不会给模型增加新参数。

即使有很好的 positional encoding，现代 LLM 仍有一个有文献记录的问题，叫 “lost in the middle”（Liu et al. 2023）。它们使用长 prompt 开头和结尾的信息，比使用埋在中间的信息更可靠。这就是为什么“把重要上下文放在前面”或“在末尾重复关键信息”这类 prompt engineering 建议确实有效。模型并不是同等有效地使用 prompt 的每一部分。

当 token 的含义和位置都被编码后，下一个问题是：token 之间到底如何交换信息？

* * *

## Attention

这就是给这个架构命名的机制：attention。

在每个 transformer layer 内部，attention 只做一件事。它让每个 token 查看它被允许看到的其他 token，并决定哪些 token 对接下来要做的事情重要。

它通过让每个 token 同时扮演三种角色来做到这一点。每个 token 都会被转换成三个新的 vectors，叫 Query、Key 和 Value（Q、K、V）。

> **小解释：Q、K、V**  
> Query 表示“我在寻找什么”，Key 表示“我能匹配什么”，Value 则是在匹配强时被复制的信息。

* Query 问：“我想从其他 token 那里找什么？”
* Key 说：“这是我能提供给看向我的 token 的东西。”
* Value 承载：“当匹配发生时，这是会被传递出去的信息。”

同一个 token 会同时扮演这三种角色。Q、K、V 的转换都是学到的矩阵，所以模型会在训练过程中弄清楚每个 token 应该寻找什么，以及应该提供什么。

匹配通过相似度分数发生。每个 token 的 Query 会与它被允许看到的每个 token 的 Key 进行比较，使用的是 scaled dot product。直观地说，这衡量两个 vector 有多对齐。缩放会在 softmax 前保持数值稳定。

> **小解释：dot product**  
> Dot product 是一种给两个 vector 的对齐程度打分的简单方法。对齐越高，匹配越强。

这些匹配分数随后会通过 softmax 转换成权重。Softmax 会把任意一组数字变成一个类似概率的分布，总和为 1。匹配分数更高的 token 获得更高权重，然后这些权重会用于对 value vectors 做加权平均。

> **小解释：softmax**  
> Softmax 把原始分数变成总和为 1 的权重。大分数得到大权重，小分数得到小权重。

举个例子。考虑句子 “The cat that I saw yesterday was sleeping.” 当模型处理 “was” 时，它需要弄清楚是谁在 sleeping。“was”的 Query vector 会与它被允许看到的 token 的 Key vectors 比较。它与 “cat” 的 dot product 很高，因为模型学到，像 “was” 这样的动词需要一个主语，而像 “cat” 这样的主语会产生能很好对齐的 Key vectors。它与 “yesterday” 的 dot product 很低。Softmax 把这些分数变成权重，“cat” 得到高权重，“yesterday” 得到低权重。模型随后对相应的 value vectors 做加权求和，所以 “cat” 的 value 主导结果。“was”的新表示现在主要受 “cat” 的 value 影响。这就是一个位于前面好几个位置的 token 如何成为指代对象。

GPT 风格语言模型有一个特定约束：它们从左到右生成文本。位置 5 的 token 只能 attend 到位置 1 到 5。它不能 attend 到位置 6、7、8，因为这些还没生成出来。这叫 causal masking。实现很简单：未来 token 的匹配分数会被设置得极低，以至于 softmax 后权重实际上为零。

> **小解释：causal masking**  
> Causal masking 会隐藏未来 token。它防止 decoder-only language model 在预测下一个 token 时偷看后文。

![Attention heatmap showing causal masking and high attention to cat](https://www.0xkato.xyz/assets/transformer-attention-heatmap.png)

可解释性研究中一个很有趣的发现，是 Anthropic 在 2022 年发现的专门化 attention heads，叫 induction heads。这些 heads 会学会识别 prompt 中形如 “A B … A” 的模式，并预测 B 接下来会出现。当模型第二次看到 “A” 时，induction head 会回看 “A” 之前出现的位置，看看它后面跟了什么，然后复制那个内容。它们是目前已知的、支撑 in-context learning 的最清晰机制之一，也就是 LLM 从你的 prompt 中捕捉模式并继续它的能力。

> **小解释：induction head**  
> Induction head 是一种 attention head，它会注意 prompt 中重复出现的模式，并帮助继续这些模式。

Attention 有一个很大的成本。在 full attention 中，每个 token 都会与它被允许看到的所有 token 比较，所以 prompt 长度翻倍，工作量大致会变成四倍。这就是长 prompt 运行昂贵的原因，也解释了为什么很多近期研究都在让 attention 更高效，比如 FlashAttention、sparse attention、linear attention。

但一个 attention head 只能给模型一种学到的关系视角。

* * *

## Multi-head attention

一次单独的 attention pass 只给模型一种方式来决定哪些 token 对哪些其他 token 重要。这还不够。语言中同时存在许多关系。主谓一致。代词和它指代的名字。句子之间的长程引用。词序和局部短语。

Multi-head attention 通过并行运行多次 attention 来解决这个问题，每个并行过程都在自己的较小空间中运作。每个并行过程叫一个 head。

> **小解释：attention head**  
> Attention head 是一次独立的 attention pass，拥有自己的 learned projections。

这里经常被讲错，许多教程也会讲错。每个 head 并不是拿到原始 token vector 的一个字面切片。每个 head 都有自己学到的 projection matrices，会把完整 token vector 映射到它自己的较小 Q、K、V vectors。因此，如果一个模型每个 token 有 4,096 个数字，并且有 32 个 heads，那么每个 head 通常在 128 维空间中工作，但这 128 个数字是完整 4,096 维的 learned projection，而不是固定切片。它们是同一个 token 的不同“视角”，不是这个 token 的不同块。

每个 head 独立运行自己的 attention pass。然后所有 heads 的输出会被拼接起来，并通过最后一个 linear layer，把它们混回一个完整大小的 vector。这个最后的混合也是模型学出来的。

![Multi-head attention combines specialized attention heads](https://www.0xkato.xyz/assets/transformer-multi-head-attention.png)

有趣之处在于，不同 heads 往往会部分专门化。模型从未被告知每个 head 应该做什么。专门化会在训练中自然涌现。研究人员发现过跟踪语法的 heads，比如把动词连到宾语、把冠词连到名词；也发现过判断哪个代词指向哪个名字的 heads；还有跟踪位置模式的 heads、induction heads，以及许多其他类型。一个 transformer layer 可能有 32 个 heads。现代前沿模型有几十层。所以一个典型 LLM 总共有数千个 attention heads，每个 head 都加入自己学到的视角。

有一个实际成本问题推动了最近的架构变化。每个 head 都需要为已经生成的所有 token 在内存中保留自己的 Key 和 Value vectors，这样当新 token 生成时，模型不必从头重新计算一切。这叫 KV cache，是长上下文长度下运行 LLM 的主要内存成本。

> **小解释：KV cache**  
> KV cache 在生成过程中存储旧的 Key 和 Value vectors。它让模型不必每添加一个 token 就重新计算整个 prompt。

现代 decoder-only LLM 大多使用一种变体，叫 Grouped-Query Attention（GQA）。不是每个 head 都拥有自己的 keys 和 values，而是一组 heads 共享相同的 key 和 value heads。LLaMA-2 70B 有 64 个 query heads，但只有 8 个 key/value heads。Mistral 7B 有 32 个 query heads 和 8 个 key/value heads。结果是精度几乎与完整 multi-head attention 相同，但内存压力和推理成本低得多。

> **小解释：GQA**  
> Grouped-Query Attention 让多个 query heads 共享更少的 key/value heads。这会减少 KV-cache 内存，同时保留许多 query 视角。

* * *

## Feed-forward network

Attention 完成 token 之间的信息混合后，每一层还有第二步，只是大家没那么常谈起它：feed-forward network。

如果说 attention 负责 token 彼此交谈，那么 feed-forward network 负责每个 token 独自做更多处理。它独立运行在每个 token 的 vector 上，不进行跨 token 混合。

Feed-forward network 按顺序做三件事：

1. 把 token 的 vector 扩展到更大的尺寸（原始 transformer 使用 4x，而现代 SwiGLU 模型通常使用不同扩展尺寸）。
2. 应用一个 non-linear function。
3. 把 vector 压缩回原始尺寸。

![Feed-forward network expands, transforms, and compresses each token vector](https://www.0xkato.xyz/assets/transformer-ffn.png)

中间那个 non-linear 步骤在做一件值得理解的具体事情。Non-linearity 是一个会弯曲输入的函数。最简单的 ReLU 会对任何负数输出零，对正数则原样通过。

> **小解释：non-linearity**  
> Non-linearity 是一种函数，它防止网络坍缩成一个巨大的线性变换。

没有它，FFN 就只是两个 linear layers 堆在一起，而纯线性数学的堆叠会坍缩。连续两个 linear layers 在数学上等价于一个 linear layer，连续一百个 linear layers 仍然等价于一个。Non-linearity 阻止了这种坍缩，也是 FFN 能做出比单个矩阵乘法更丰富事情的原因。

原始 transformer 使用 ReLU。GPT 和 BERT 转向 GELU。LLaMA、Mistral、PaLM 等现代模型使用 SwiGLU。Expand-then-compress 的结构保持不变。真正被不断迭代的是 non-linearity 本身。

Dense transformer 模型的大多数参数存在于 FFN 中，而不是 attention 中。很大一部分 weights 都在 feed-forward layers 里。

而这些参数并不是泛泛而谈的。模型中大量已存储的事实和语义结构就存在于这里。研究人员发现，FFN 内部的一些 neurons 与特定概念或事实高度相关。一个 neuron 可能会在与 Eiffel Tower 相关的文本上强烈激活。另一个可能对编程语言激活。另一个可能对过去式动词激活。当一个模型“知道”Paris 是 France 的首都时，这个事实会分布在特定层的 FFN weights 和 activations 中。

这种存储记忆的性质带来了一个有趣后果。研究人员已经弄清楚如何在不重新训练模型的情况下，直接编辑训练后模型中的某些事实。像 ROME（Rank-One Model Editing）这样的方法，可以通过对某个特定 FFN weight matrix 做有针对性的 low-rank edit，把 “the Eiffel Tower is in Paris” 改成 “the Eiffel Tower is in Rome”。之后模型往往会生成与这个被编辑关联一致的文本。

一些现代前沿模型已经开始用一种叫 Mixture of Experts（MoE）的东西替换 dense FFN。不是每层只有一个 feed-forward network，而是模型拥有许多并行 FFNs（称为 experts），以及一个很小的 router network，用来选择哪些 experts 处理每个 token。Mixtral 8x7B 每层有 8 个 experts；任意给定 token 只会激活其中 2 个。总参数量会大幅上升，但每个 token 的计算量增长慢得多，因为只运行少数几个 experts。这就是在不按比例增加推理成本的情况下扩展参数量的方式。

> **小解释：MoE**  
> Mixture of Experts 意味着模型有多个 feed-forward networks，并且只把每个 token 路由给其中少数几个。

Mixtral 8x7B 总共有 467 亿参数，但每个 token 只使用约 129 亿参数。这已经成为超大模型的常见选项，因为它允许你继续增加参数量，而不让推理成本按比例增长。

* * *

## Residual stream 和 layer normalization

Residual stream 让模型变成“累加式”而不是“替换式”。Attention 运行后，或者 feed-forward network 运行后，结果通常不会替换 token 的 vector。它会被加到原 vector 上，逐位置相加。新 vector 等于旧 vector 加上 sub-block 的输出。

> **小解释：residual connection**  
> Residual connection 会把一个 block 的输出加回它开始时的 vector。它给信息和梯度提供了一条穿过网络的捷径。

跨过三十层、五十层或一百层时，每一层的贡献会积累起来，而不是简单覆盖前一个 vector。这个运行中的总和叫 residual stream，它有一个奇特性质。原始 input embeddings 仍然有一条直接的加法路径通向后期层，同时沿途混入每个 sub-block 的贡献。

![Residual stream accumulates attention and feed-forward outputs](https://www.0xkato.xyz/assets/transformer-residual-stream.png)

Residual connections 并不是为 transformer 发明的。它们来自 ResNet（He et al. 2015），最初用于图像识别。动机是深层网络很难训练。训练信号在穿过许多层反向传播时会变得太弱，有时也会太强。模型实际上无法从自己的错误中学习。加入一条 shortcut path 后，信号可以从输出直接流回输入。突然之间，你就可以训练几百层的网络了。Transformers 继承了同一个技巧。

在现代可解释性研究中，residual stream 已经成为中心对象。每个组件、每个 attention head、每个 feed-forward network，甚至最后的 unembedding 步骤，都会从 residual stream 读取，并写回 residual stream。

第二块是 layer normalization，它存在的原因更实际。没有它，residual stream 无法保持稳定。经过几十次加法流动的数字，往往要么向上爆炸，要么坍缩到接近零。无论哪种情况，训练都会失败。Layer normalization 会在 sub-block 之间，把每个 token 的 vector 重新缩放回受控范围。

> **小解释：layer normalization**  
> Layer normalization 会重新缩放 token vector，让它的数字在模型训练时保持在稳定范围内。

原始 2017 transformer 在每个 sub-block 之后应用 normalization（post-norm）。这对浅层模型有效，但随着深度增加，可靠训练变得更困难。现代 transformers（GPT-2 之后、LLaMA、Mistral）通常在每个 sub-block 之前应用 normalization（pre-norm）。这是让非常深的 transformers 更容易训练的变化之一。

函数本身也发生了变化。许多现代开放模型（LLaMA、Mistral、Gemma、Phi）使用一种更简单的变体，叫 RMSNorm。原始 layer normalization 同时做两件事：把每个 vector 向零平移，然后重新缩放数字大小。RMSNorm 去掉平移步骤，只保留重新缩放。经验上，重新缩放承担了大部分收益，同时计算成本更低。

> **小解释：RMSNorm**  
> RMSNorm 是一种更便宜的 normalization 方法，它重新缩放 vector 大小，但不先减去均值。

所以，这就是那些不太光鲜的机制。没有 residual connections，非常深的模型会难训练得多。没有 layer normalization，运行中的总和可能爆炸或坍缩。两者都有时，你就能得到几百层深的模型。

* * *

## Next-token prediction

所有 attention 和 feed-forward 处理层完成后，模型会为序列中的每个 token 得到一个 vector。在生成时，为了预测下一个词，它只取最后一个 token 的最终 vector。

这个最后的 vector 会被转换成每个可能的下一个 token 对应的一个数字。如果 vocabulary 有 100,000 个 token，那就是 100,000 个数字。这些数字叫 logits。它们还不是概率，可以是任意大小、正数或负数。

> **小解释：logits**  
> Logits 是每个可能下一个 token 的原始分数。只有经过 softmax 后，它们才会变成概率。

Softmax 会把这些 logits 转换成模型对可能下一个 tokens 的概率分布。和前面是同一个操作，只是出现在模型中的不同位置。

模型通常并不会每次都只选择最高概率 token。Decoding settings 控制输出有多确定或多变化。Temperature 会改变分布的尖锐程度。Top-k 和 top-p 会把选择限制在最合理的一批下一个 tokens 中。这就是为什么同一个模型在一种设置下感觉精确，在另一种设置下感觉更有创造力。

> **小解释：temperature**  
> Temperature 控制采样时的随机性。低 temperature 让模型更保守，高 temperature 让模型更多样。

一旦选定一个 token，它就会被加入输入。模型会在更长的序列上运行下一步，通常复用 KV cache，这样就不必从头重新计算整个 prefix。新 token 的新 attention。新的 feed-forward。新的最终 vector。新的预测。循环会持续到模型发出 end-of-sequence token，或达到长度限制。一整段文字其实只是这个循环，一次一个 token。

这个单一目标，也就是预测下一个 token，是基础 LLM 的核心训练信号。基础模型并不是直接针对事实准确性、对话能力、推理或编码训练的。它是在海量文本上训练来预测下一个 token。之后的 post-training 才会把模型调优到遵循指令、偏好、安全和对话行为。

有一个值得了解的重大效率创新，叫 speculative decoding。一个小而快的模型会提前提出几个 token。大模型并行验证它们。如果这些被提出的 tokens 在大模型概率下被接受，就接受它们。如果不接受，就回退到大模型。做得正确时，输出分布与单独运行大模型一致，但循环可以快很多。

> **小解释：speculative decoding**  
> Speculative decoding 使用一个小 draft model 先向前猜，然后让更大的模型一次性验证多个猜测 token。

Next-token prediction loop 是架构中最简单的一部分，但它让整件事运转起来。

* * *

## Architecture vs trained weights

我们已经走过了核心机制：tokens、embeddings、positional encoding、attention、multi-head attention、feed-forward network、residual stream 和 normalization，以及输出侧的 next-token loop。这就是基础架构的一次完整遍历。

那么 GPT、Claude、Gemini 和 LLaMA 之间到底有什么不同？公开细节各不相同，专有模型也不会发布每个架构选择。但在本文讨论的层级上，它们大体处在同一个 transformer 家族设计空间中。

大多数现代基于 transformer 的 LLM 使用相同的大结构：tokenization、embeddings、positional encoding、堆叠的 transformer layers（每层包含 multi-head attention 和 feed-forward network）、residual streams、layer normalization，以及 next-token prediction。

模型之间变化的是：

1. 训练权重本身，也就是从不同训练数据、不同规模中学到的东西。
2. 配置：层数、vocabulary size、head count、parameter count、MoE 或 dense。
3. 后训练：instruction tuning、从人类反馈中学习、叠加在基础模型之上的安全控制。

> **小解释：weights**  
> Weights 是模型内部学到的数字。训练会改变这些数字，直到模型能够很好地预测文本。

2023 到 2025 年的“现代 transformer”栈，在许多严肃的前沿模型和开放权重模型之间收敛到了一组共同选择，尽管不同团队是独立走到这些选择的。Pre-norm placement。RMSNorm。RoPE。SwiGLU。Grouped-Query Attention。部分最大模型中的 Mixture of Experts。这些东西不是一次性发明出来的。它们是在原始 2017 设计之上，经过大约五年的精炼逐渐积累起来的。

* * *

## 未来会走向哪里

Transformer 家族架构的收敛，在机器学习历史上很不寻常。在这个领域的大部分历史中，每个问题都有自己的专门网络。图像识别用一种。语言用另一种。音频用第三种。视觉团队和语言团队几乎不共享方法。

现在，transformer 风格模型出现在语言、视觉、音频和多模态系统中。Transformer 吸收了这个领域的很大一部分。

这可能会改变。Mamba 和其他 state-space models 是可信的替代方案，尤其适用于非常长的序列。Hybrid architectures 正在被探索。Mixture-of-experts 已经改变了前沿模型中“架构”这个词的含义，其方式在五年前还会被认为相当奇特。

但本文中的核心机制，tokens、embeddings、positional encoding、attention、feed-forward network、residual stream 和 normalization、next-token prediction，是更持久的部分。即使架构发生变化，这些也是任何 sequence model 都必须以某种形式解决的问题。

如果你已经读到这里，你就能阅读许多现代 transformer 论文或 model cards，并知道每一节在讨论哪一部分。这就是目标。

非常欢迎反馈。如果这些内容让你感兴趣，请在 [X](https://x.com/0xkato) 上联系我。我很喜欢认识新朋友。
