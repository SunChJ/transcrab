# 我们如何构建知识库

Authors: [@hi_im_isaac_](https://x.com/@hi_im_isaac_), [@learnwdaniel](https://x.com/@learnwdaniel), [@gaozenghao](https://x.com/@gaozenghao)
note: the interactive version of full technical blog available: https://www.cerebras.ai/blog/how-we-built-our-knowledge-base

每位员工每天向内部知识库提问超过 15,000 次。上线三个月后，它已成为公司内采用最广泛的内部工具之一，既服务人工，也服务自动化和 agent。

在 Cerebras，我们的团队分布在数据中心运维、芯片设计、硬件、训练、推理、云平台等方向。每年都有大量新同事加入，沟通渠道里反复出现同类问题：

- “X 在哪里能找到？”
- “Y 的专家是谁？”
- “Z 是什么？”

![](https://pbs.twimg.com/media/HNXjBFnbgAAjQuO.jpg)

我们建立了 Cerebras Knowledge，目的是把人和系统连接到有用信息。

## 在信息所在处提供能力

在组织内快速找到信息并不容易。数据散落在各类工具里，通常每隔一段时间就有人提出同样的“完美方案”：把所有信息都放进一个平台，变成单一真相来源。可这在实践中往往行不通。

信息会在最适合的地方生成：文档里的建议修改、Slack 的讨论串、GitHub 的代码引用、Jira 的状态元数据。各平台是为各自场景优化的，而非通用信息库。试图在 Google Docs 里讨论 PR 就会非常别扭。

于是我们设计一个系统，尽量不改变既有使用方式。数据采集端则是把每个平台的数据直接抽取出来。

## 知识库的结构

我们的知识库提供三件事：

- 存储和采集内部数据的平台；
- 查询这些数据的平台；
- 做鉴权、审计和分析的访问层。

核心是一个 Postgres 表，统一保存 embeddings、原始摘要和各种源的 metadata。系统持续从公司内各处摄取数据，维护随时可查询的数据存储。

我们希望有一个简单、但能兼容多数数据形态的接口。同时也希望 Cerebras 的其他开发者可以接入自定义 connector。结果是我们做得很克制：从 Slack 讨论串到 netlists 的任何 source，最终都落在同一张 embeddings 表里，进入同一查询接口。

![](https://pbs.twimg.com/media/HNXl4DhagAAs85L.jpg)

每个数据源都会声明“数据是什么、怎么接入、刷新频率是多少”。无论来自 Slack、代码仓库、文档系统，还是自建数据库，最终写入的 embedding 行都遵循同一 schema。

## 处理非结构化 Slack 对话

Slack 是最关键的数据源，因为它承载了公司内最新、最实时的工程讨论。

![](https://pbs.twimg.com/media/HNXmztfagAAJAcI.jpg)

我们最初尝试直接对原始文本做 embedding 检索，结果很快发现：仅靠向量检索无法完整覆盖相关信息。

Slack 信息有几个天然难点：

- 信息密度差异很大：`hey yeah sure mike` 这类一句话，也可能和一段内核级解释并列；
- 消息长度波动大，且在余弦相似度里短消息常常压过长消息；
- 消息语义往往依赖上下文对话。

因此我们采用混合策略。Slack ingestion 时，每条 thread 同时通过多种检索策略可检索，不同策略互补：

- 全文检索抓住 embedding 会模糊的精确 token（错误文本、flag 名、主机名）。当有人粘贴具体错误串时，词面匹配几乎总是最有价值证据，通常不应被语义匹配所取代。
- Embedding 检索负责同义改写。提问“manifest load 后恢复卡住”与回答“NFS 挂载导致 checkpoint 停住”可能没共享词汇，向量相似度负责把二者连上。
- 逆文档频率（IDF）把“信号”从噪音里分离。带有稀有 token（如罕见配置 flag）的短消息值得被提权；“sounds good, thanks!” 虽和很多查询靠得很近，但按词罕见度调整后分数几乎为零。
- 时间衰减（age decay）反映 answer 的过时性。两条 thread 可能回答同一问题，但 6 个月前的答案可能对应的是旧基础设施；同等相关时，更新的结果应优先。

![](https://pbs.twimg.com/media/HNXm48IasAA02Ho.jpg)

我们不会完全信任单一得分器。每种技术先各自给出排名，再在查询阶段做融合（见重排）。

## Socket Mode

为实现实时采集，我们在 workspace 中部署 Slack bot 并开启 Socket Mode。Slack 通过持久 WebSocket 推送每个消息事件，我们无需轮询 Web API，也不容易踩限流。

事件到来时先立即 ACK，使用稳定的 event id 做去重，再将消息标记给 ingest consumer。

ingest consumer 不会单条写入消息，而是先定位消息所属 thread，并从 Slack API 重拉整条 thread（父消息 + 所有回复）再一次性落库为一条记录。这样任何回复都会重新拉取父节点和同级消息，保证存量内容、参与者列表、最近活动时间都反映完整对话。

系统中的每个 Slack channel 都是独立的 source，可按需做更新频率调优，比如高频故障频道会更频繁 ingest。

## Thread 与消息

原始 Slack 文本落地后立刻可做关键词检索，因为我们在 raw 内容上维护了 Postgres 全文（GIN）索引。为了让向量检索也好用，还要再做一层处理。

在“蒸馏”阶段，LLM 从完整 thread 提取结构化数据：

- 工程师真正会搜索到的单句问题；
- 简短摘要；
- 结论/解决方案；
- 涉及的系统与代码引用。

![](https://pbs.twimg.com/media/HNXnAjaaQAA9tRb.jpg)

将这些数据点做 embedding 并写入共享表。原始 transcript 不直接 embedding。实测中，把 thread 归一化为一致格式后准确率显著提升；外加 metadata 后，语义匹配也更有信息量。

## Bursting

到这一步 Slack 检索已经不错，但我们发现一个反复问题：长 thread 里的关键消息未必被 thread-level 摘要覆盖。

因此我们用 bursting：将同一作者的连续消息片段作为一个 burst，并把 thread 主题作为上下文前缀嵌入。如果某个关键消息是“枝节内容”、它的词汇没进入摘要，bursts 能让它自己被检索到。

为防止低质量内容入库，每个 burst 需要通过加权信号并超过阈值：

- 在全局语料里至少包含一个相对稀有的 token（IDF >= 4.0）；
- 合并后长度至少 200 字符；
- 至少一条消息有 reaction（社交信号）。

![](https://pbs.twimg.com/media/HNXnGhFaoAAdBq-.jpg)

达到条件的 burst 再 embedding，和 thread 级记录并列存入 embeddings 表。

## 代码仓库

最初我们也在争论：代码库要不要 embedding。随着 Claude Code 等 CLI 工具普及，看到“grep 就够了”会觉得做 embedding 很反直觉。参考业界实践并阅读了 Cursor 在大规模代码语义搜索方面的结果后，我们还是尝试了。

我们有很多内部仓库，其中一些超过 40GB。核心问题是如何高效保持更新。

### 使用 @cocoindex_io 维护代码 embedding

经过多轮实验，我们选了 CocoIndex。它是一个开源文档 embedding 框架，擅长对代码库做向量化。

每个仓库按“从粗到细”的语言级正则边界切分。优先尝试高层边界（如 class），若块仍过大，再回落到 method，再到更小 block。切块后 embedding 后写入 Postgres。单个文件可生成多层粒度 embedding，例如按文件级、按函数级。

![](https://pbs.twimg.com/media/HNXnOwbaIAEGsTL.jpg)

CocoIndex 在 Postgres 中保存同步元数据。每次 commit 时，只重建并导出变更 chunk，而非重算整个仓库。由于 sync 状态和 embedding store 放在同一数据库，这一点尤其有效。

随着 codebase 数量增长，我们把仓库接入改成团队提交配置文件，包括路径级 allowlist/denylist。

## 自定义数据源

有些团队已有自己的数据库，不愿为了接入知识库而先迁移到 Slack 或文档系统，但也希望对其现有表有同样的查询能力。

我们将自定义 source 作为 plugin 脚本。团队提交一个小型 Python 模块，负责读取自身系统并按 embeddings 表格式产出行，同时补上对应 source 配置。

只要脚本以和其它 embedding 行相同的 schema 写入共享库，其他流程无需改造。数据即可与 Slack、代码、文档并行查询。

## 规划与工具 fan-out

每次查询我们先做一轮轻量 planning：LLM 决定会用哪些工具、哪些数据源。主要工具如下：

- `subsystem_index`：逐文件 LLM 摘要；
- `search`：统一向量管道，覆盖 Slack、wiki、代码和其他索引源，内部合并并重排；
- `search_slack`：直接 Slack 检索；
- `search_code`：对源码仓库做 ripgrep；
- `recent_prs`：问题相关的最新 PR；
- `who_knows`：某主题上的专家名单。

Planner 依据 compact 的索引快照（有哪些 project、每个 project 下有何 source、source 擅长回答什么）生成执行器调用列表；executor 并行执行，统一转成同一 evidence schema，最终交给 synthesis LLM。

![](https://pbs.twimg.com/media/HNXne7ja0AAGZwY.jpg)

## 重排

一篇文档可能因为共享词汇而靠前，但其实回答的是别的问题。重排前，我们用互补检索器产出的不兼容 rank list 做融合，采用 reciprocal rank fusion（RRF）：对每个文档，在出现的每个列表中加上 `weight / (60 + rank)`（默认 weight 1.0，平滑常数 60）。

![](https://pbs.twimg.com/media/HNXnl4MbAAAGnAp.jpg)

平滑常数让“共识”重于“单点强信号”：一个文档若在多种检索器中都靠前，可以压过只在一个检索器第一名的结果。然后去重同源 chunk、限制每个文件贡献数量，最终得到更丰富的 Top20。

再把这些候选喂给小 reranker model，给每条打 0~10 分，保留前十。

在最终排序完成后，会给命中的结果补上下文。例如命中 wiki section 时，会额外拉取相邻两段，避免只显示“脱离标题与前置约束/注意事项”的孤段落，给读者可读、完整的片段。

因此最终检索输出是：多检索器融合结果 + 源级去重 + 针对问题重排 + 再加上下文扩展。

## MCP

在 MCP 集成里，我们把 retrieval 组件直接暴露为工具，不再只给“回答这个问题”这一个 endpoint。工具故意设计得很简洁，尽量减少 LLM 依赖，便于快速、低成本调用。

每个 MCP tool 对应一个底层检索原语，如 `search_slack`、`search_code`、`search`、`who_knows`。输入输出都窄、结构固定且稳定，方便任何客户端或 agent 直接调用，不需要在 tool 内再塞编排逻辑。

工具通常只运行单一查询 pipeline（vector search、lexical search、ripgrep），加轻量启发式打分后返回原始 evidence 行。

Claude Code 或其他兼容 MCP 的 agent 成为编排引擎，自己决定调用顺序和聚合策略，拼出最终答案或代码改动。检索层本身不依赖这些 LLM 决策即可服务请求。

## Web UI

Web UI 里也有同样的工具，只是它连接的是完整查询链路：对每个用户问题走到端到端执行。UI 的 agent 承担 planner 与 executor。

- Planner：轻量 LLM 根据 query 与当前 project，选择要用的检索工具，例如 `search`、`search_slack`、`subsystem_index`。
- Executor：并发发起这些工具调用，聚合结果并转为统一 evidence schema，包含分数、时效性、来源提示。
- Synthesis：最终 LLM 按用户问题和 evidence bundle 生成 UI 展示内容，包含引用、注意事项、跨源融合。

从用户角度看，Web UI 就是“提问并获取答案”；底层其实运行的是同样的 planner -> executor -> synthesizer 模式，MCP 客户端也可以显式复现这一流程。

![](https://pbs.twimg.com/media/HNXoEZraAAAKN9q.jpg)

## 组织模型

随着 corpus 变大，“search everything everywhere”很快不再有用。Compiler 团队不想在结果里看到 infra runbook，infra 团队也不想被 compiler 的内部内容污染。

Project 就是默认的相关性组织单元。

### 项目与范围化检索

我们把 workspace 查询范围按 project 划分。project 是一组命名后的数据源：对应团队或项目所需的 Slack channel、代码仓库、内部数据库和文档空间。

Project 设计上保持轻量。共享的 source（如故障响应 channel、共享平台仓库）可被多个项目复用，而不必复制。

![](https://pbs.twimg.com/media/HNXoNu4bEAA21ua.jpg)

### 引导与默认值

新同事 onboarding 时会要求选择或创建一个默认项目，比如 ML 训练基础设施、Compiler、数据中心运维。

该默认 project 存在用户档案中，用于自动限定查询范围。新同事无需先弄清所有 channel、仓库、文档就能得到高信噪比答案。

## 收官

最终，这套知识库之所以有用，是因为它顺着信息原本存在的位置来工作，而不是强行把一切塞进单一系统。通过多种检索技术组合，我们能更快拿到证据。实践中得到的是：既能应对真实公司数据的灵活性，也能随着公司扩张保持结构化和可用性。

如果你看到这里并且感兴趣，我们的 ai/growth 团队在招人，有意请联系 @learnwdaniel。

References

1. Malkov and Yashunin, Efficient and Robust Approximate Nearest Neighbor Search Using Hierarchical Navigable Small World Graphs
2. Anthropic, Introducing Contextual Retrieval
3. Cormack, Clarke, and Büttcher, Reciprocal Rank Fusion Outperforms Condorcet and Individual Rankers
4. Li et al., How Much Information Do We Need from a Chunk? (signal/verbosity tradeoff)
5. Use XML Tags
6. Best Nested Data Format
7. Cursor, Improving Semantic Search in Large Codebases
8. Salesforce/Slack Engineering, Search-o1: Agentic Search-Enhanced Large Reasoning Models
9. How Slack AI Processes Billions of Messages
10. Improving Agents with Semantic Search
11. Improving Agent with Semantic Search