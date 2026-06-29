# 改进 LM Studio 的 MLX 引擎以支持智能体工作流

我们最近在 LM Studio 中发布了 mlx-engine v1.8.5。这次更新通过对 KV cache 做 checkpoint，显著提升了重复、长上下文智能体工作流的性能。它还为 VLM 请求加入了 continuous batching。这项工作是开源的；你可以在[这里查看 PR](https://github.com/lmstudio-ai/mlx-engine/pull/326)。

在这篇文章中，我会解释它解决的缓存复用问题、为什么当前开源 LLM 模型让回退变得更困难，以及新的磁盘后端缓存是如何工作的。我们的基准测试显示，额外 RAM 使用量最多可降低 80%，吞吐量最高可提升 2 倍，图像请求处理速度最高可提升 3.5 倍。

可以看看 Adrien 使用新版 mlx-engine 通过 codex --oss 本地审查一个 URL shortener app 的视频：

[https://x.com/adrgrondin/status/2057186643086278782?s=20](https://x.com/adrgrondin/status/2057186643086278782?s=20)。

## 什么是 mlx-engine？

MLX Engine（mlx-engine）是一个针对 Apple silicon 优化、采用 MIT 许可的推理引擎。它由 LM Studio 创建并维护。它使用 Apple 的 MLX 机器学习库，并构建在 mlx-lm、mlx-vlm 等项目之上。MLX Engine 是 LM Studio 所有 MLX 推理的后端。

## 当前模型架构，以及 mlx-engine 的不足

目前最受欢迎的两个开源模型是 Qwen 3.5（以及 3.6）和 Gemma 4。作为各自模型架构的一部分，它们使用了一些巧妙技巧，在大上下文长度下减小 KV cache 的大小。Qwen 3.5 使用混合架构，Gemma 4 使用滑动窗口架构。这些注意力策略可以在大上下文长度下降低内存使用，但也让 KV cache 不能任意回退。

我们来看看 Gemma 4 如何处理推理。这个例子聚焦于 Gemma 4 E2B；它交错使用“local”注意力层（512 token 的滑动窗口）和“global”注意力层。

步骤 1：Prompt prefill。为 system prompt 和用户消息计算 KV cache。
步骤 2：Decode。在计算 assistant reasoning content 和 assistant message 的同时构建 KV cache。
步骤 3：Rewind。将 KV cache 裁剪回步骤 1，然后追加不包含先前 reasoning content 的 assistant message。

![](https://pbs.twimg.com/media/HJ1MVwHXIAAauTl.jpg)

因此，推理引擎必须解决的一个关键问题是：在回退 KV cache、准备后续响应时，如何避免重新计算。

## 我们如何改进 mlx-engine 中的 prompt caching

针对这些智能体用例，我们设计了一种 KV cache 回退方案。通过把 prompt cache 保存到磁盘并从磁盘恢复，后续请求的 KV cache 就不需要重新计算。

将 KV cache 保存到磁盘

在每 256 个 token 的边界复制并存储这些 KV cache，可以让我们在对应的 KV cache tensor 仍然存在时，恢复精确的缓存前缀。如果 prompt 的一部分被编辑过、从未计算过，或者已从磁盘缓存中淘汰，mlx-engine 会回退到重新计算该后缀。256 个 token 足够小，可以避免在重新计算上浪费太多工作；同时又足够大，可以保持磁盘缓存的效率。

首先，在每个 256 token 边界（sequence len % 256 == 0），把 local attention layers 的 KV cache 副本流式传输到 disk-writer 后端。当模型正在处理 prompt 或生成新 token 时，后台磁盘写入进程会同时运行。在每个 256 token 边界，系统会复制最近 256 个 token 对应的 KV cache，并把它发送给 disk writer，随后由 disk writer 将该 block 持久化到磁盘。

由于 Apple silicon 采用统一内存架构，我们会把 local attention KV cache 提交到磁盘，并从内存中淘汰它。这确保 mlx-engine 的内存占用会随 active sequences 扩展，而不是随所有此前见过的 sequences 扩展。

从磁盘恢复 KV cache

首先，为每个 256 token block 计算一个 key。然后，确定需要取回哪些 global 和 local KV cache blocks。使用 prompt 的 key 列表和 cache 类型，从磁盘中尽可能多地加载 KV cache。对于那些从未计算过 KV cache（或其 KV cache 已从磁盘淘汰）的 prompt 段落，则安排这些段落进行 prompt prefill。磁盘缓存是一个 LRU store，因此每当我们向磁盘存储保存或从中加载时，该 store 都会淘汰最近最少使用的 KV cache tensors。

这确保我们的磁盘存储会针对使用模式进行优化。如果引擎收到的是使用同一个 system prompt 的短 prompt，那么 system prompt 的 local attention KV cache 不会被淘汰，但陈旧对话的 KV cache 会被淘汰。而如果引擎只接收一个不断增长的对话请求，较早的 local attention KV cache 会被淘汰，以便为更长的 global attention KV cache 腾出空间。

![](https://pbs.twimg.com/media/HJ1Mec0WEAAMiIZ.png)

磁盘缓存设计

我们把磁盘缓存设计成在模型卸载后自动清理。换句话说，这个缓存是临时的，不会留下持久文件。

磁盘缓存是一个 scratch file，而不是一个装满独立缓存文件的文件夹。我们把许多 cache records 打包进这一个文件。每个 KV cache entry 都是一个序列化后的 safetensors blob，引擎会维护一张内存表，记录：“entry X 从字节偏移 Y 开始，长度为 Z 字节。”当 KV cache entries 被淘汰时，它们的字节范围会回到 free list，并被后续 records 复用；如果空闲空间到达文件末尾，文件就会被缩小。

我们通过使用操作系统在 /tmp 中的临时文件机制，并把所有 lookup metadata 都只视为模型生命周期内的状态，来让磁盘缓存保持临时性。模型卸载时，cache store 会清空内存索引并关闭 scratch file。如果模型进程退出，操作系统会关闭文件句柄并释放存储空间。

## 还有 continuous batching

我们还为 vision model runner 加入了 continuous batching。关于 continuous batching 的实现和收益，已经有很多文章讨论过；Hugging Face 有一篇[很好的解释文章](https://huggingface.co/blog/continuous_batching)。

Continuous batching 允许用户使用同一个模型并发处理请求。再加上前面描述的 KV cache 改进，mlx-engine 现在可以用于严肃的智能体工作负载。

## 基准测试

为了让性能改进更具体，我们在一台配备 36 GB RAM 的 M3 Max MacBook Pro 上，使用 lmstudio-community/Qwen3.6-27B-MLX-4bit，运行了一些端到端 LM Studio API 基准测试。

这些基准测试聚焦于本次更新希望改进的工作负载：并行聊天、长 prompt 处理，以及重复的高分辨率图像 prompt。

基准测试：并行聊天吞吐量

设置：模型以 parallel=4 加载，然后通过 LM Studio API 并发发送四个短聊天请求。每个响应都允许自然停止。

结果：对于这个四路并行聊天工作负载，mlx-engine v1.8.5 端到端完成运行的速度约快 2.2 倍，输出 token 数量几乎相同。

基准测试：并行长 prompt 下的内存使用

设置：模型以 parallel=4 加载，然后通过 LM Studio API 并发发送四个大 prompt。在模型加载后和运行完成后分别测量 RAM 使用量。

结果：对于这个并行长 prompt 工作负载，mlx-engine v1.8.5 在运行结束后使用的额外 RAM 约少 82%，同时保持了相近的 wall-clock time 和略高的总 token 吞吐量。这正是把 inactive prompt-cache records 从统一内存中移出的预期收益。Active sequences 仍然需要驻留在内存中，但 stale cache records 不再需要持续堆积在 RAM 里。

基准测试：重复的高分辨率图像 prompt

设置：同一个图像 prompt 发送两次，每个请求生成一个 token。这可以隔离处理 image-expanded prompt 以及恢复 prompt cache 的成本。

结果：对于这个重复的高分辨率图像 prompt，mlx-engine v1.8.5 完成第二个请求的速度约快 3.5 倍。收益来自恢复了大部分 image-expanded prompt cache。

可以在你的 Mac 上用 LM Studio 试试：[https://lmstudio.ai/download](https://lmstudio.ai/download)
