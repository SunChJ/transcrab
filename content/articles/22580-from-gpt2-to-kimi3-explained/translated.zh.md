# 22580：从 GPT-2 到 Kimi3 进化简解

两万五千八十。也就是 22,580 个 GPT-2（2019）模型能塞进 KimiK3（2026）。七年里我们放大了 22,580 倍。那这到底只是"规模化"吗？

在这篇工作日志里，我会讲讲我们是怎么走到这里的，以及从那时到现在到底有多少东西真的变了。我会梳理促成 KimiK3 的主要架构演进。

GPT-2

GPT-2 是一个只用解码器的架构：

输入会同时收到 token 与位置向量：

每个 transformer block 的局部结构如下：

注意力过程如下：

当最后的隐藏状态矩阵生成后，语言模型头会把它映射为词表 logits。做自回归解码时，只需要最后一个位置的 logits 来选择下一个 token。

这是 decoder-only 生成的一个低效点：模型会计算每个输入位置的表示，但每一步解码只消费最后一个位置的 logits。若不做缓存，下一个 token 需要重复计算大部分内容。

KV cache 的动机就很直接：把新 token 追加到输入后，模型否则会重复把所有历史 token 的投影重新算一遍。把 key/value 向量存起来，就能避免这部分重复。

这份存储就是 KV cache。它会保留前 N-1 个 token 的向量，并且可能会大到形成内存带宽瓶颈。

按约 50k 可选 token、12 个 block、12 个 head、embedding 维度 768 估算，GPT-2 的基线参数量约 1.24 亿。

在 2.8 万亿参数规模下，一份 KimiK3 模型大致相当于 22,580 个 GPT-2 模型。

线性注意力（Linear Attention）

Softmax 注意力在 q·k 后再做非线性处理，使得每个 query 与所有 key 互相关联。Linear attention 先对 q 和 k 分别做特征映射（例如 ELU+1），这让乘积可重排，因此增长中的 K、V 向量集合可以被折叠到一个固定的 D×D 状态里。

论文里给出的 O(N²) 说法一开始把我带偏了。并非“transformer 每个时间步复杂度与当前序列长度平方成正比”。Flash Attention 解决了这点——但当时它还没发布（在 2020 年才出来）。

当时训练里常见做法还是把完整的 N×N 注意力矩阵 materialize 出来，FlashAttention 不存在，很多参考实现又在自回归时不带 KV cache，反复重算历史。

同样的过程用可视化更直观。每个解码步都会做两次 ND 读和两次 1D 写到 HBM，而 KV cache 会随序列长度线性增长到 O(N)。

你能看到过量读写，本文的这篇论文就是用新的做法替代它。

这其中有取舍。

这里把 softmax 的指数换成对 q 和 k 分别做 ELU+1。两种方法最终都会归一化分数，但线性注意力的特征映射相比 softmax kernel 是更弱的近似。近似会带来精度损失，但实际误差与架构、任务有关系。

注意，图里省略了 qk 求和归一化这一项。

从高层看，注意力三步如下：

1. 把 qk 分数变为非负。Linear attention 用 ELU+1，softmax 用指数。
2. 做归一化除法。
3. 计算加权平均值。

这保留了注意力的基本语义，只是用表达能力更弱的特征映射来保证 QK 非负，从而换取效率。

DeltaNet（Fast Weight Programmers）

有限容量缓存必须覆盖或合并已有信息。第 i-1 个 token 的状态并不会占有独立槽位，而是被加到同一个 D×D 矩阵里。新的 query 因此无法精确检索到每个历史 token 的“隔离表示”。

这种加法更新同样带来效率提升。和拼接式增长不同，它避免缓存 O(N) 增长；但也会让信息互相干扰。DeltaNet 的作用正是在这种可恢复性下降下做补救。

按照 Schlag 的 Fast Weight Programmers 论文里说得很形象：当序列长度超过存储容量，会进入过载状态。要在这类状态下稳定工作，模型应学会动态交互记忆内容，选择性保留或删除 key-value 关联。像公式 17 那样持续向有限内存做纯加法更新，最终必然遇到上限。

正是让线性注意力“有吸引力”的同一 regime（N 远大于 D）也暴露了核心短板。当状态超出有效容量后，关联会互相干扰，因为更新是加法且旧信息不会离开缓存。

这张图更直观看：

若把单个关联记为 S = k.T @ v。用同一个 key 读回时得到 k @ (k.T @ v) = (k @ k.T) v，即 key 平方范数乘以 v。也就是说读回结果按 key 的平方范数缩放；如果把 k 归一化，或最后除以范数，就能精确还原 v。

Q 也可理解为一个 learned pointer。Wq 与 Wk 都读取同一残差流，某个事实对应的 query 会指向该 fact 写入时的 key 方向。更新时先读当前 key 在 cache 中检索到的信息，减去已有内容，再乘以 key 并加回。旧信息被移除，新增信息替换写入。

DeltaNet（并行化的 Delta 规则线性变换器）

这是全文最难的一段，我花了大约 7 小时才理清，于是按实现来讲解。简言之，DeltaNet 用广义 Householder 的一阶线性递推，实现了可并行的 chunk 式前向传播，训练可在硬件上高效地走线性时间。

它会把输入/输出切成若干 chunk，块大小为 C，并在每个块内按该块的最终状态、以及当前块的 query/key/value 块计算输出。

实际工程里的难点在于 prefill。对长度为 T 的 token 序列直接按 Delta 规则实现会是：

即便不看 Delta 规则，直接的线性注意力 prefill 也是顺序性的。

chunk 化带来更高效路径。通过示例更容易理解：

设 C=N 时退化为标准 O(N²) attention；C=1 时就是普通线性注意力。中间值在块内更多计算与硬件利用率之间做权衡。实践上 C 常见取 64 或 128，因为 tensor core 在这个粒度更容易打满，UMMA 就是一个例子。

中间 tile 会被折叠进状态 S 更新里。

块内我们仍按 q(kᵀv) 走，即真实 attention 的顺序（mask 后的 QKᵀ 再乘 V）。跨块则走 (kᵀv)q，即递归式、先状态后读取的顺序。

因此注意力复杂度从 O(N²) 切开：一部分是固定的 2Ld²（状态相关，不受 C 影响）；另一部分是增长项 2LCd（对角上的分数矩阵）。全 attention 是 C=L 的特例，此时这项变成 2L²d，也就是二次方。C 越小 FLOPs 越少。

从纯 FLOPs 看 C=1 最便宜，但不一定最快。GPU 上，工作更贴合矩阵乘硬件时，吞吐更高。

下一步要把同样思路扩展到 DeltaNet。

底层问题不复杂：纯加法注意力用到的 chunk 化并不能直接套到 delta 更新。

因为我们需要每个状态来计算要减去的信息；如果不做重参数化，就无法同样并行。

作者因此将 delta 更新重写一遍：

序列化版本每次迭代算一个 delta。

重参数化后，chunk 代码可以一次算出 C 个 delta。

这也让我们得到了第一个对比点：MHA 对比 DeltaNet Transformer。

Gated Delta Net

现在我们有了精确改写缓存的办法。每来一个新事实（新 key 向量），都能看到该点原先存的内容，并替换为期望的新注意力目标。

但这个机制只能在有具体替换目标时遗忘某个关联；它不能在上下文切换时高效清空多个关联，也不能全面衰减以回收容量。

如果是纯加法线性注意力：

加入遗忘能力很直接，只要有控制衰减状态的参数即可：

这就是 Mamba-2 的贡献。先对上一时刻 cache 衰减，再按全量加回新 cache，避免状态无界增长。

按统一比例在每个时间步衰减所有 key-value 关联是可行的，也是 Mamba 的做法，但它没法区分不同关联的重要性。

也就是说，模型若要忘某个特定关联，不得不同时让全部关联一起衰减。Delta rule 相反可以单点更新，但不能让其他 fact 自动衰减。

因此，Gated Delta rule 将 Mamba 的门控更新与 Delta rule 结合。它加入一个参数 alpha：alpha=1 时退化为纯 Delta rule，alpha=0 时清空记忆。难点是要用同一套并行 chunk 方式实现。

实现仍沿用上一节的 DeltaNet 重参数化，数学结构几乎一致，只是再加一个数据相关的 0~1 标量控制前态衰减。这样既能做有效的 key-value 关联学习，又有自适应内存管理。

对应代码变更如下：

γʳ/γⁱ 项表示累计衰减。一个在时间 x 写入、在 x+t 读取的 token，会被乘上 αₓαₓ₊₁…αₓ₊ₜ，这和前缀积（prefix-like）计算是同型思路。

最终得到的结构大致是这样：

KDA / Kimi Linear

到这一步，研究者开始尝试混合式架构，在同一模型里加入不同注意力形式，比如 Gated DeltaNet 和 Mamba 的融合。

Kimi Linear 之所以引人注意，是它的一个核心主张：在受控比较中，它超过了 full attention。论文把它描述为可直接替换的架构改进，且在质量更好、解码吞吐更高（最高可达 6x）。

Kimi Linear 通过细粒度门控改进了 Gated DeltaNet。

它不再是一个全局 decay 标量，而是按通道学习独立衰减。

对应 KDA 更新规则类似，但代码上更像下面这样：

这里 alpha.reshape(nb, C, d) 体现了论文最关键的改进：通道级别的记忆衰减控制。

放在 DeltaNet Transformer 旁边看，Kimi Linear 主要改了三点：

1. 使用混合系统，穿插 Multi-head Latent Attention（MLA）层。
2. 用 Mixture-of-Experts（MoE）替换 MLP。
3. 通过 alpha 投影提升 DeltaNet 的容量。

之后会讲 MLA 与 MoE，先强调一个关键点：这不是“盲目堆规模”。额外容量有明确数学动机——按通道的衰减尺度给了模型更细粒度的记忆控制。

规模律仍然重要，但关键是把容量加在对的地方、以系统能利用的方式加。

每一层改动都在针对前一阶段的具体瓶颈。

Kimi K3

最终，KimiK3 的语言主干与上图的 Kimi Linear 十分类似。它包含 23 个四层 macrocycle。每个 macrocycle 的前 3 层用 Kimi Delta Attention，第四层用 Multi-head Latent Attention。第一层用稠密 FFN，其余层都用潜在 MoE。

初看起来 Kimi K3 的变化并不大：

- 大幅扩容
- 每 12 层插入 Blockwise AttnRes
- MLA query LoRA 与 output gating
- Latent-space MoE
- SiTU 激活函数
- Gated MLA

KDA 提供常量状态递归记忆，而周期性 MLA 层保留了上下文上的全量 softmax 检索。下图是后文讨论变化时的一个简化参考。

我们先看更直接的改动：Gated MLA、latent-space MoE 与 SiTU。

Gated MLA 决定从 MLA 取回的特征能有多少进入 residual stream，通过对输入投影出的 gate 做逐元素乘法实现。

传统 MoE 用学习到的路由器按 token 做 dot-product，相似度打分后只分配少量专家。KimiK3 总共有 898 个 expert：其中 2 个共享并处理所有 token，其余 896 个里每个 token 选择 16 个。

KimiK3 还改了 expert 激活路径。原本是对 up 投影做 SiLU，再逐元素乘 gate，最后做 down 投影；现在改用 SiTU。

模型也把输入降维送入共享专家，并对它们输出再升维：

这体现了推理里一个反复出现的取舍：没有 fused kernel 的话，新激活比原路径慢约 3 倍。一个缓冲是专家在压缩 latent 空间里运行，前向更快，FLOPs 近乎减半。

剩下的改动是 MLA query LoRA、output gating，以及每 12 层的 blockwise AttnRes。AttnRes 大约带来 2% 推理延迟，但有两个收益：

- 选择性检索更早的表示，缓解 residual dilution 与隐状态增长
- 约 1.25x 的计算优势

AttnRes 与 MLA 在一个方向上互补。KDA 用常量状态，会不可避免丢掉信息；MLA 从 token 上下文检索，AttnRes 从更早层级表示里检索。

AttnRes

感谢 @chloey3k 在这一段提供帮助。每次前向里，输入穿过一叠层。每一层通常是注意力块（KDA 或 MLA）加一个 MLP 或 MoE 块。

常规情况下，每一层的输入是原始 embedding 与所有前面层输出的等权和。

文中 h_i 表示第 i 层的输入，h_1 是当前 token 的 embedding（当前序列末尾 token），f_i(h_i) 是第 i 层输出（一个注意力或 MLP 块）。

问题在于缺乏选择性访问。不同层类型会收到同样聚合后的状态，尽管它们在上下文中应有不同权重。因为递归是纯加法，后续层必须学习更大的输出才能影响累积残差，训练可能不稳。

AttnRes 不再一视同仁，而是为和中的每一项乘上专用权重，让模型在上下文里给最有用的层更多权重。

每个 α_i 由 query-key 点积得到。query 对每层学习，key 与 value 来自更早的 residual stream 状态。先归一化再加权这些状态做组合。

因此模型不必只看紧邻前一层。AttnRes 让每层都能按需读取早期层输出，查询能检索到当前计算最需要的表示。

下面的伪代码在 block 粒度上做了同样操作。一个 block 是 12 层里 attention 和 MLP 结果的逐元素和，作为统一的 depth 表示，后续给 AttnRes 混合。

在每一层都加 residual attention 成本太高；只在固定块边界加，能以较低成本拿到大部分收益。KimiK3 每隔 12 层一组边界。
在 23 个四层 macrocycle 下，共形成 8 个 AttnRes block，并提升了推理速度。

这大概是 block_attn_res 函数里最核心的部分。

从 GPT-2 到 KimiK3 的演进到此结束。

核心变化不是规模本身。每一步都在改变模型存了什么、如何更新那些状态、如何检索这些信息，以及固定状态无法保存时如何弥补。

KimiK3 结合了常量状态递归记忆、周期性 softmax 棉索、稀疏专家容量与选择性深度残差访问。最终形成一个把额外容量放在“有明确功能位置”的系统。

本质上，固定容量的关联记忆（固定维度）需要有淘汰策略；纯粹加法线性更新在容量耗尽后必然出现干扰。为此，需要学习式选择（如门控、路由、衰减），而注意力是最有效的选择性读取机制。