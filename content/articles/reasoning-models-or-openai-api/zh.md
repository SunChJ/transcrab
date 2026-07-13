---
title: 推理模型 | OpenAI API
date: '2026-07-13T02:20:50.312Z'
sourceUrl: 'https://developers.openai.com/api/docs/guides/reasoning#reasoning-mode'
lang: zh
---
**推理模型**（例如 [GPT-5.5](https://developers.openai.com/api/docs/models/gpt-5.5)）会在生成响应前使用内部推理令牌。这有助于模型进行规划、有效使用工具、考察备选方案、消解歧义，以及完成更困难的多步骤任务。推理模型尤其擅长复杂问题求解、编程、科学推理和多步骤智能体工作流；它们也是我们轻量级编程智能体 [Codex CLI](https://github.com/openai/codex) 的最佳模型选择。

大多数推理工作负载可从 `gpt-5.6` 开始。如果面对更具挑战性、能够接受更高延迟的问题，并且需要 API 中最高智能水平的选项，请在 Responses API 中使用 [`gpt-5.6-sol`](https://developers.openai.com/api/docs/models/gpt-5.6-sol)，并将 `reasoning.mode` 设为 `pro`。若要降低成本，可考虑 `gpt-5.4`；若同时希望降低成本和延迟，可考虑 `gpt-5.4-mini`。

**推理模型与 [Responses API](https://developers.openai.com/api/docs/guides/migrate-to-responses) 配合效果更好**。虽然 Chat Completions API 仍受支持，但使用 Responses API 可获得更强的模型智能和性能。

调用 [Responses API](https://developers.openai.com/api/docs/api-reference/responses/create)，并指定推理模型和推理强度：

```
from openai import OpenAI

client = OpenAI()

prompt = """
Write a bash script that takes a matrix represented as a string with 
format '[1,2],[3,4],[5,6]' and prints the transpose in the same format.
"""

response = client.responses.create(
    model="gpt-5.6",
    reasoning={"effort": "low"},
    input=[
        {
            "role": "user", 
            "content": prompt
        }
    ]
)

print(response.output_text)
```

`reasoning.effort` 参数用于引导模型在执行任务时投入多少思考。

支持的值取决于模型，可能包括 `none`、`minimal`、`low`、`medium`、`high` 和 `xhigh`。较低的推理强度优先考虑速度和更低的令牌用量；较高的推理强度则让模型进行更充分的思考，以生成质量更高的响应。模型也会在各种推理强度下自适应推理：简单任务使用较少令牌，复杂任务投入更多思考。

默认值同样因模型而异，并非通用设置。`gpt-5.5` 的默认推理强度为 `medium`，这是发挥 `gpt-5.5` 在质量、可靠性和性能之间完整平衡的最佳起点。

推理强度

最适合的场景

`none`

对延迟要求极高，且无需推理或多链式工具调用的任务。对于使用 `gpt-5.5` 且对延迟敏感的场景，我们建议先尝试 `low`，如有需要再改为 `none`。

常见用例包括语音、快速信息检索和分类。

`low`

以适度的延迟增加换取高效推理。适合需要工具使用、规划、搜索或多步骤决策，同时希望优化速度和成本的场景。

常见用例包括数据分析、起草、以执行为导向的编程，以及客服／聊天助手工作流。

`medium`

适合质量和可靠性很重要，且任务涉及规划、复杂推理和判断的场景。它是大多数工作负载的默认配置，也是延迟、性能与成本帕累托曲线上较为均衡的一点。

常见用例包括智能体编程、研究、处理电子表格和幻灯片，以及委派长周期工作。

`high`

适用于高难度推理、复杂调试、深度规划，以及质量和智能程度比延迟更重要的高价值任务。推荐用于复杂工作流和智能体任务。

常见用例包括智能体编程、长期研究和知识工作。视任务复杂度而定，可同时评估 `medium` 与 `high`。

`xhigh`

适用于深度研究、异步工作流和需要长时间运行的智能体任务。仅当评估结果显示收益足以证明额外延迟和成本合理时使用。

常见用例包括安全与代码审查、企业生产力、更深入的研究和富有挑战性的编程工作流。

对于对延迟敏感、希望更快显示第一个可见令牌的应用，可先要求模型生成一段简短前言，再继续进行更深入的推理。

有些模型仅支持这些值的子集，因此请在选择设置前查阅相应的[模型页面](https://developers.openai.com/api/docs/models)。

GPT-5.6 模型在 Responses API 中支持 `standard` 和 `pro` 推理模式，默认使用 `standard`。对于需要更多模型工作、且可接受更高延迟和令牌用量的困难任务，可将 `reasoning.mode` 设为 `pro`。

推理模式和推理强度彼此独立。模式选择标准或专业执行；`reasoning.effort` 则控制模型在该模式内采用多少推理。若省略 `reasoning.effort`，GPT-5.6 在两种模式中均默认使用 `medium`。

```
curl https://api.openai.com/v1/responses \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $OPENAI_API_KEY" \
  -d '{
    "model": "gpt-5.6",
    "reasoning": {
      "mode": "pro",
      "effort": "medium"
    },
    "input": "Review this database migration plan and identify potential failure modes."
  }'
```

专业模式会汇总为生成最终答案而执行的模型工作，并按所选模型的标准[令牌费率](https://developers.openai.com/api/docs/pricing)对这些令牌计费。与标准模式相比，专业模式会执行更多模型工作，因此会增加令牌用量和成本。现有的 Pro 模型 ID 将保持其当前行为和定价。

推理模型除输入和输出令牌外，还会引入**推理令牌**。模型使用这些推理令牌进行“思考”，即拆解提示并考察生成响应的多种方法。我们的 `gpt-5.5`、`gpt-5.4` 等推理模型支持交错思考：模型可以在思考前和思考过程中生成可见输出令牌，也可以在工具调用之间进行思考。

下图展示了用户与助手进行多步骤对话时的默认行为。每一步的输入和输出令牌都会被延续，而较早轮次的推理不会被渲染到下一个样本中。支持持久化推理的模型可通过 `reasoning.context` 改变这一行为。

![包含当前轮次上下文的推理令牌](https://cdn.openai.com/API/docs/images/context-window.png)

虽然无法通过 API 查看推理令牌，但它们仍会占用模型上下文窗口的空间，并按[输出令牌](https://openai.com/api/pricing)计费。

### 管理上下文窗口

创建响应时，务必确保上下文窗口为推理令牌留有足够空间。视问题复杂度而定，模型可能生成数百到数万个推理令牌。实际使用的推理令牌数可在[响应对象的 usage 对象](https://developers.openai.com/api/docs/api-reference/responses/object)中查看，位于 `output_tokens_details` 下：

```
{
  "usage": {
    "input_tokens": 75,
    "input_tokens_details": {
      "cached_tokens": 0
    },
    "output_tokens": 1186,
    "output_tokens_details": {
      "reasoning_tokens": 1024
    },
    "total_tokens": 1261
  }
}
```

上下文窗口长度可在[模型参考页面](https://developers.openai.com/api/docs/models)找到，并且不同模型快照之间会有所差异。

### 控制成本

要控制推理模型的成本，可以使用 [`max_output_tokens`](https://developers.openai.com/api/docs/api-reference/responses/create#responses-create-max_output_tokens) 参数限制模型生成的令牌总数；该总数包含推理令牌、可见输出令牌和不可见格式令牌。有关生成令牌如何反映在用量和输出限制中的详情，请参阅[输出令牌计数](https://developers.openai.com/api/docs/guides/token-counting#understand-output-token-counts)。

### 为推理分配空间

如果生成的令牌达到上下文窗口限制，或达到设定的 `max_output_tokens` 值，你会收到 `status` 为 `incomplete` 的响应，且 `incomplete_details` 的 `reason` 将设为 `max_output_tokens`。这可能发生在尚未生成任何可见输出令牌之前，意味着你可能已为输入和推理令牌付费，却没有收到可见响应。

为避免这种情况，请确保上下文窗口中有足够空间，或将 `max_output_tokens` 调整为更高的值。OpenAI 建议，在开始试用这些模型时，至少为推理和输出预留 25,000 个令牌。随着你逐步了解提示所需的推理令牌数量，可据此调整缓冲空间。

```
from openai import OpenAI

client = OpenAI()

prompt = """
Write a bash script that takes a matrix represented as a string with 
format '[1,2],[3,4],[5,6]' and prints the transpose in the same format.
"""

response = client.responses.create(
    model="gpt-5.6",
    reasoning={"effort": "medium"},
    input=[
        {
            "role": "user", 
            "content": prompt
        }
    ],
    max_output_tokens=300,
)

if response.status == "incomplete" and response.incomplete_details.reason == "max_output_tokens":
    print("Ran out of tokens")
    if response.output_text:
        print("Partial output:", response.output_text)
    else: 
        print("Ran out of tokens during reasoning")
```

### 将推理项保留在上下文中

在 [Responses API](https://developers.openai.com/api/docs/api-reference/responses) 中，使用推理模型进行[函数调用](https://developers.openai.com/api/docs/guides/function-calling)时，我们强烈建议你将最后一次函数调用返回的所有推理项（以及函数输出）传回。如果模型连续调用多个函数，则应传回自上一条 `user` 消息以来的所有推理项、函数调用项和函数调用输出项。这让模型可以延续推理过程，以最高令牌效率产出更好的结果。

最简单的方式是将上一个响应中的所有推理项传入下一个响应。系统会智能忽略与你的函数无关的推理项，只在上下文中保留相关项目。你可以通过 `previous_response_id` 参数传递先前响应中的推理项，也可以手动将过去响应的所有[输出](https://developers.openai.com/api/docs/api-reference/responses/object#responses/object-output)项传入新响应的 [input](https://developers.openai.com/api/docs/api-reference/responses/create#responses-create-input)。

对于高级用例，如果你要在将上下文窗口的部分内容传给下一个响应前进行截断和优化，请确保从最后一条用户消息到函数调用输出之间的所有项都原封不动地传入下一个响应。这样可确保模型拥有所需的全部上下文。

请参阅[本指南](https://developers.openai.com/api/docs/guides/conversation-state)，了解有关手动管理上下文的更多信息。

对话状态和推理状态承担不同角色。跨调用传递消息会为模型提供可见的对话历史。对于受支持的模型，持久化推理还能让模型将较早轮次中兼容的推理项渲染到下一次的上下文中。

持久化推理提供连续性，但不会暴露模型的原始推理过程。推理项仍是不透明的，API 不会返回其推理文本。通过设置 `reasoning.context`，可控制模型能够使用哪些可用的推理项：

对 `reasoning.context` 模式的支持取决于模型。请将示例中的 `YOUR_MODEL_ID` 替换为支持所选模式的模型。

值

行为

`auto`

使用所选模型的默认设置。省略 `reasoning.context` 与使用 `auto` 的效果相同。

`current_turn`

使当前活跃轮次的推理可用，但不会将较早轮次的推理渲染到下一个样本中。

`all_turns`

将较早轮次中可用且兼容的推理项渲染到下一个样本中。只有受支持的模型接受此值。

响应的 `reasoning.context` 字段包含实际生效的模式，即 `current_turn` 或 `all_turns`。请在每个响应上检查该字段，以确认模型使用的模式。此设置不会创建原本不存在的推理项。

只有当请求可以访问较早的响应项时，`all_turns` 才会生效。可使用 `previous_response_id`、将响应附加到对话，或手动重放完整响应历史。在第一次请求中，由于不存在较早的推理，`current_turn` 和 `all_turns` 的行为相同。

### 使用已存储响应继续推理

使用 `previous_response_id` 是最简短的有状态集成方式：

```
from openai import OpenAI

client = OpenAI()

first = client.responses.create(
    model="YOUR_MODEL_ID",
    input="Inspect this repository and identify the likely bug.",
    reasoning={"context": "current_turn"},
)

second = client.responses.create(
    model="YOUR_MODEL_ID",
    previous_response_id=first.id,
    input="Now patch the bug and explain the change.",
    reasoning={"context": "all_turns"},
)

print(second.output_text)
```

重放模型不再需要的旧响应项时，可使用 `current_turn`。这些推理项可以留在 API 负载中以维持连续性，但服务不会将它们渲染到新的样本中。这可以降低长时间运行工作流的渲染上下文量。

### 不使用已存储响应也能保留推理

在无状态模式下使用 Responses API 时——无论是将 `store` 设为 `false`，还是组织启用了零数据保留——都应在每次调用的 `include` 参数中请求 `reasoning.encrypted_content`：

```
curl https://api.openai.com/v1/responses \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $OPENAI_API_KEY" \
  -d '{
    "model": "gpt-5.6",
    "reasoning": {"effort": "medium"},
    "input": "What is the weather like today?",
    "tools": [ ... function config here ... ],
    "include": [ "reasoning.encrypted_content" ]
  }'
```

`output` 数组中的推理项将包含 `encrypted_content` 属性，其中含有可传递给未来调用的加密推理令牌。

如需在 `store: false` 时使用 `all_turns`，请在每次调用时请求加密推理内容，保留每个输出项，附加下一条用户消息，并重放完整历史：

```
from openai import OpenAI

client = OpenAI()

history = [
    {
        "role": "user",
        "content": "Inspect this repository and identify the likely bug.",
    }
]

first = client.responses.create(
    model="YOUR_MODEL_ID",
    store=False,
    input=history,
    include=["reasoning.encrypted_content"],
    reasoning={"context": "current_turn"},
)

# Keep every output item, including encrypted reasoning and assistant phase.
history.extend(item.model_dump() for item in first.output)
history.append(
    {
        "role": "user",
        "content": "Now patch the bug and explain the change.",
    }
)

second = client.responses.create(
    model="YOUR_MODEL_ID",
    store=False,
    input=history,
    include=["reasoning.encrypted_content"],
    reasoning={"context": "all_turns"},
)

print(second.output_text)
```

虽然我们不会暴露模型生成的原始推理令牌，但你可以使用 `summary` 参数查看模型推理的摘要。请参阅[模型文档](https://developers.openai.com/api/docs/models)，了解哪些推理模型支持摘要。

不同模型支持不同的推理摘要设置。例如，计算机使用模型支持 `concise` 摘要器，而 o4-mini 支持 `detailed`。要获取模型可用的最详细摘要器，请将该参数设为 `auto`。目前，对大多数推理模型而言，`auto` 等同于 `detailed`，但未来可能会提供更细粒度的设置。

推理摘要输出是 `reasoning` [输出项](https://developers.openai.com/api/docs/api-reference/responses/object#responses/object-output)中 `summary` 数组的一部分。除非你明确选择包含推理摘要，否则不会返回此输出。

下面的示例展示如何发出包含推理摘要的 API 请求。

```
from openai import OpenAI
client = OpenAI()

response = client.responses.create(
    model="gpt-5.6",
    input="What is the capital of France?",
    reasoning={
        "effort": "low",
        "summary": "auto"
    }
)

print(response.output)
```

此 API 请求将返回一个输出数组，其中同时包含助手消息和模型生成响应时的推理摘要。

```
[
  {
    "id": "rs_6876cf02e0bc8192b74af0fb64b715ff06fa2fcced15a5ac",
    "type": "reasoning",
    "summary": [
      {
        "type": "summary_text",
        "text": "**Answering a simple question**\n\nI\u2019m looking at a straightforward question: the capital of France is Paris. It\u2019s a well-known fact, and I want to keep it brief and to the point. Paris is known for its history, art, and culture, so it might be nice to add just a hint of that charm. But mostly, I\u2019ll aim to focus on delivering a clear and direct answer, ensuring the user gets what they\u2019re looking for without any extra fluff."
      }
    ]
  },
  {
    "id": "msg_6876cf054f58819284ecc1058131305506fa2fcced15a5ac",
    "type": "message",
    "status": "completed",
    "content": [
      {
        "type": "output_text",
        "annotations": [],
        "logprobs": [],
        "text": "The capital of France is Paris."
      }
    ],
    "role": "assistant"
  }
]
```

对于在 Responses API 中使用 GPT-5.5 和 GPT-5.4 的长时间运行或工具密集型流程，请使用助手消息的 `phase` 字段，以避免过早停止和其他异常行为。`phase` 在 API 层面是可选的，但 OpenAI 建议使用它。工具调用前的前言等中间助手更新使用 `phase: "commentary"`；完成的回答使用 `phase: "final_answer"`。不要将 `phase` 添加到用户消息中。通常，使用 `previous_response_id` 是最简单的路径，因为会保留先前的助手状态。如果手动重放助手历史，请保留每个原始 `phase` 值。缺失或遗漏 `phase` 可能导致这些工作流中的前言被视为最终答案。有关模型特定的提示指导，请参阅 [Prompting GPT-5.5](https://developers.openai.com/api/docs/guides/latest-model?model=gpt-5.5#prompting-best-practices)。

### 往返传递助手 phase 值

```
from openai import OpenAI

client = OpenAI()

response = client.responses.create(
    model="gpt-5.6",
    input=[
        {
            "role": "assistant",
            "phase": "commentary",
            "content": "I’ll inspect the logs and then summarize root cause and remediation.",
        },
        {
            "role": "assistant",
            "phase": "final_answer",
            "content": "Root cause: cache invalidation race.",
        },
        {
            "role": "user",
            "content": "Great—now give me a rollout-safe fix plan.",
        },
    ],
)

print(response.output_text)
```

使用推理模型时，请考虑这些差异。具备推理能力的 GPT-5 模型通常最适合获得清晰的目标、强约束和明确的输出约定，而不必规定每一个中间步骤。

*   向模型提供任务、约束和期望输出格式。
*   将 `reasoning.effort` 视为调节旋钮，而非恢复质量的主要手段。
*   对智能体或研究密集型工作流，定义何为完成，以及模型应如何验证其工作。

有关使用推理模型的最佳实践，请[参阅本指南](https://developers.openai.com/api/docs/guides/reasoning-best-practices)。

### 提示示例

编程（重构）

编程（规划）

STEM 研究

有关推理模型用于现实场景的示例，请参阅 [cookbook](https://developers.openai.com/cookbook)。

[

使用推理进行数据验证

评估一个合成医疗数据集是否存在异常。



](https://cookbook.openai.com/examples/o1/using_reasoning_for_data_validation)[

使用推理生成例程

使用帮助中心文章生成智能体可执行的操作。



](https://cookbook.openai.com/examples/o1/using_reasoning_for_routine_generation)
