# 推出 GPT-5.3-Codex-Spark

*一款面向 Codex 实时编程的超高速模型。*

今天，我们发布 GPT-5.3-Codex-Spark 的研究预览版。它是 GPT-5.3-Codex 的小型版本，也是我们首个专为实时编程设计的模型。Codex-Spark 是我们与 Cerebras 合作的首个里程碑；双方的合作已于[今年 1 月宣布](https://openai.com/index/cerebras-partnership/)。在超低延迟硬件上运行时，Codex-Spark 经过专门优化，几乎可以即时响应：在保持强大实际编程能力的同时，生成速度超过每秒 1000 个 token。

我们通过 Cerebras 向 ChatGPT Pro 用户提供 Codex-Spark 研究预览版，让开发者能够尽早开始试用。与此同时，我们正与 Cerebras 共同扩大数据中心容量、强化端到端用户体验，并为部署更大型的前沿模型做好准备。

我们最新的前沿模型尤其擅长长时间运行的任务，可以在数小时、数天乃至数周内自主工作，无需人工干预。Codex-Spark 则是首个专为在 Codex 中实时协作而设计的模型：它可以进行针对性修改、重塑逻辑或优化界面，让你立即看到结果。有了 Codex-Spark，Codex 现在既能承担长期运行的宏大任务，也能完成当下需要即时处理的工作。

随着访问范围不断扩大，我们希望了解开发者会如何使用它，并把反馈融入后续改进。

Codex-Spark 发布时提供 128k 上下文窗口，且仅支持文本。在研究预览期间，Codex-Spark 将采用独立的速率限制，其用量不会计入标准速率限制。不过，当需求较高时，为了兼顾所有用户的可靠性，你可能会遇到访问受限或暂时排队的情况。

## 速度与智能

Codex-Spark 针对交互式工作进行了优化；在这类工作中，延迟与智能同样重要。你可以与模型实时协作，在它工作时随时中断或重新引导，并借助近乎即时的响应快速迭代。由于针对速度进行了调优，Codex-Spark 默认采用轻量的工作方式：只做最少且有针对性的修改，并且不会自动运行测试，除非你明确要求。

## 编程

Codex-Spark 是一款能力出色的小型模型，针对快速推理进行了优化。在 SWE-Bench Pro 和 Terminal-Bench 2.0 这两项评估智能体式软件工程能力的基准测试中，GPT-5.3-Codex-Spark 表现强劲；与 GPT-5.3-Codex 相比，它只需很短一部分时间就能完成任务。

<figure><figcaption>SWE-Bench Pro：各模型在不同推理强度下的准确率与预计任务耗时。</figcaption><table><thead><tr><th>模型</th><th>推理强度</th><th>准确率</th><th>任务耗时（分钟）</th></tr></thead><tbody><tr><td>GPT-5.3-Codex-Spark</td><td>低</td><td>47%</td><td>1.03</td></tr><tr><td>GPT-5.3-Codex-Spark</td><td>中</td><td>49%</td><td>1.68</td></tr><tr><td>GPT-5.3-Codex-Spark</td><td>高</td><td>50%</td><td>2.05</td></tr><tr><td>GPT-5.3-Codex-Spark</td><td>超高</td><td>51%</td><td>2.29</td></tr><tr><td>GPT-5.3-Codex</td><td>低</td><td>51%</td><td>3.13</td></tr><tr><td>GPT-5.3-Codex</td><td>中</td><td>53%</td><td>4.64</td></tr><tr><td>GPT-5.3-Codex</td><td>高</td><td>56%</td><td>8.88</td></tr><tr><td>GPT-5.3-Codex</td><td>超高</td><td>57%</td><td>16.29</td></tr><tr><td>GPT-5.1-Codex-mini</td><td>低</td><td>46%</td><td>4.61</td></tr><tr><td>GPT-5.1-Codex-mini</td><td>中</td><td>48%</td><td>6.03</td></tr><tr><td>GPT-5.1-Codex-mini</td><td>高</td><td>49%</td><td>7.09</td></tr></tbody></table><p>耗时估算为以下几项之和：(1) 输出生成时间（输出 token 数 ÷ 采样速度）；(2) 预填充时间（预填充 token 数 ÷ 预填充速度）；(3) 工具执行总时间；(4) 网络总开销。</p></figure>

<figure><figcaption>Terminal-Bench 2.0 准确率。</figcaption><table><thead><tr><th>模型</th><th>准确率</th></tr></thead><tbody><tr><td>GPT-5.3-Codex-Spark</td><td>58.4%</td></tr><tr><td>GPT-5.3-Codex</td><td>77.3%</td></tr><tr><td>GPT-5.1-Codex-mini</td><td>46.1%</td></tr></tbody></table></figure>

## 面向所有模型的延迟优化

在训练 Codex-Spark 的过程中，我们逐渐意识到，要实现实时协作，模型速度只是其中一部分；我们还需要降低整个请求—响应链路的延迟。为此，我们在运行框架中实施了端到端延迟优化，所有模型都将从中受益。

在底层，我们简化了响应数据从客户端流向服务器、再返回客户端的方式，重写了推理栈的关键部分，并重新设计会话初始化流程，让第一个可见 token 更早出现，同时确保 Codex 在迭代过程中始终保持响应。通过引入持久 WebSocket 连接，并对 Responses API 进行针对性优化，我们将每次客户端/服务器往返的开销降低了 80%，每 token 开销降低了 30%，首 token 延迟降低了 50%。

Codex-Spark 默认启用 WebSocket 路径；很快，它也会成为所有模型的默认路径。

## 由 Cerebras 提供算力

Codex-Spark 运行在 Cerebras 的 [Wafer Scale Engine 3](https://www.cerebras.ai/chip) 上。这是一款专为高速推理打造的 AI 加速器，为 Codex 提供延迟优先的服务层。我们与 Cerebras 合作，把这条低延迟路径接入与其他模型相同的生产服务栈，使其能够在 Codex 各个产品形态中无缝运行，并为未来模型提供支持。

> “GPT-5.3-Codex-Spark 最让我们兴奋之处，是能够与 OpenAI 及开发者社区携手探索快速推理会带来哪些可能：新的交互模式、新的使用场景，以及截然不同的模型体验。这次预览仅仅是开始。”

— Cerebras 联合创始人兼 CTO Sean Lie

GPU 仍是我们训练和推理链路的基础，并为广泛使用场景提供最具成本效益的 token。Cerebras 则以擅长要求极低延迟的工作流作为补充，缩短端到端循环，让 Codex 在你迭代时响应更敏捷。对于单个工作负载，也可以结合使用 GPU 与 Cerebras，以取得最佳性能。

## 可用范围与详情

Codex-Spark 今天开始作为研究预览版，向使用最新版 Codex app、CLI 和 VS Code 扩展的 ChatGPT Pro 用户逐步推出。由于它运行在专用的低延迟硬件上，因此采用独立的速率限制；研究预览期间，该限制可能会根据需求调整。此外，我们还通过 API 向少量设计合作伙伴提供 Codex-Spark，以了解开发者希望如何把它集成到自己的产品中。

接下来几周，随着我们继续在真实工作负载下调优集成方案，访问范围也会逐步扩大。

Codex-Spark 目前仅支持文本，上下文窗口为 128k，也是超高速模型系列的首款产品。随着我们和开发者社区进一步了解快速模型在编程领域最能发挥优势的场景，我们会推出更多能力，包括更大型的模型、更长的上下文窗口和多模态输入。

Codex-Spark 接受了与主线模型相同的安全训练，其中包括网络安全相关训练。我们按照标准部署流程对 Codex-Spark 进行了评估，包括网络安全及其他能力的基线评估，并判断它在网络安全或生物领域达到 Preparedness Framework 所界定高能力门槛的可能性缺乏可信依据。

## 下一步

Codex-Spark 是迈向“双模式 Codex”的第一步：一种模式面向更长时间跨度的推理与执行，另一种模式则通过实时协作实现快速迭代。随着时间推移，这两种模式将逐渐融合：Codex 可以让你保持紧密的交互循环，同时把长期运行的工作委托给后台子智能体；当你既需要广度又需要速度时，也可以将任务并行分发给多个模型。这样一来，你无需预先选择单一模式。

随着模型能力增强，交互速度日益成为明显的瓶颈。超高速推理缩短了这一循环，让 Codex 用起来更加自然，也为每一位希望把想法变成可用软件的人拓展了可能性。
