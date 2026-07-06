# 更强的模型，更差的工具

写于 2026 年 7 月 4 日

过去两天，一个非常奇怪的 [Pi issue](https://github.com/earendil-works/pi/issues/6278) 把我带进了兔子洞。简短地说，新版 Claude 模型有时会在调用 Pi 的编辑工具时，在嵌套的 `edits[]` 数组里额外塞入一些凭空编造的字段。而且这还不是 Haiku 或某个小模型的问题，而是 Opus 4.8。编辑内容本身通常是对的，但参数不符合 schema：模型会发明一些不存在的 key，于是 Pi 拒绝这次工具调用，并要求模型重试。

这件事本身并不算太意外，因为模型偶尔确实会发出格式错误的工具调用，尤其是小模型。让我惊讶的是，新版 Anthropic 模型在这方面反而变差了：Opus 4.8 和 Sonnet 5 都会出现这个问题，而旧模型不会。换句话说，这一家族里的 SOTA 模型，在这个特定工具 schema 上反而不如它们的老兄弟。

如果你好奇 Fable：我有意没有测试它，因为我不确定他们正在跑的分类器会不会悄悄把我降级到 Opus。

## 工具调用是文本

如果你没有花太多时间研究 LLM 工具调用的内部机制，要理解的重点是：工具调用并不神奇，它使用的是某种相当粗糙的带内信令。模型会收到一段 transcript、一个 system prompt，以及一组可用工具。服务端会把这些东西咀嚼成一个带有特殊标记 token 的大 prompt。因为模型在这种格式的样例上接受过训练和强化，所以在生成过程中的某个时刻，它会吐出一段会被 API 或客户端解释为“用这些参数调用这个工具”的内容。

对一个文件编辑工具来说，预期的调用 payload 可能大致长这样：

```
{
  "path": "some/file.py",
  "edits": [
    {
      "oldText": "text to replace",
      "newText": "replacement text"
    }
  ]
}
```

随后，harness 会校验参数、执行编辑，并把结果反馈给模型。如果校验失败，模型会看到错误，通常会再试一次。

Anthropic 模型里这种格式化到底是怎么发生的，我们并不知道，但有些人曾经弄出过 “ANTML” 标记，而且它们有时也会泄漏到公开交流中。据我所知，上面的调用从模型那里序列化出来大概会像这样：

```jsx
<antml:function_calls>
  <antml:invoke name="edit">
    <antml:parameter name="path">some/file.py</antml:parameter>
    <antml:parameter name="edits">
[
  {
    "oldText": "text to replace",
    "newText": "replacement text"
  }
]
    </antml:parameter>
  </antml:invoke>
</antml:function_calls>
```

这里有个重要点：这东西虽然看起来像 XML，但其实并不是真正的 XML。它只是他们觉得方便做 tokenization 和训练的一种格式。另一个要注意的点是，基本的顶层字符串参数会以内联形式出现，而对象数组则通过 JSON 序列化实现。虽然我并不*完全确定*它就是这样工作的，但有一些迹象表明这离事实不远。后面会用到这一点。

让模型生成这种结构，有两种非常不同的方式：

1.  你可以*要求*模型生成符合某个 schema 的合法 JSON，然后事后再校验。
2.  你可以约束采样器，让非法 JSON，甚至非法的 schema 形状，从一开始就无法被采样出来。

第二种方法通常被称为 grammar-aware decoding 或 constrained decoding。采样器会屏蔽那些违反 grammar 的 token。如果模型当前处在一个 JSON object 里，而 schema 规定只允许 `oldText` 和 `newText`，采样器就可以阻止它输出 `"in_file"` 或 `"type"`。Grammar-aware decoding 既可以用来约束语法上合法的 JSON，也可以用来强制特定的枚举值或 key。

如果没有任何形式的约束，模型就只是在遵循一种学到的惯例。

## 失败模式

Pi 的编辑工具支持在一次调用里进行多处精确字符串替换。所以参数里会有一个 `edits` 数组。在失败案例中，模型会生成这样的条目：

```
{
  "oldText": "...",
  "newText": "...",
  "requireUnique": true
}
```

或者这样的：

```
{
  "oldText": "...",
  "newText": "...",
  "oldText2": "",
  "newText2": ""
}
```

在反复试验中，我看到了一整个由模型编出来的尾随 key 动物园：`type`、`id`、`kind`、`unique`、`requireUnique`、`matchCase`、`in_file`、`forceMatchCount`、`children`、`notes`、`cost`、`oldText2`、`newText2`、`oldText_2`、`newText_2`，甚至还有一个位于 edit object 内部的 `event.0.additionalProperties` key。

最烦人的地方在于，我检查过的那些无效调用里，真正的 `oldText` 和 `newText` payload 都是 byte-correct 的。模型实际上已经生成了正确的调用，却在 object 的末尾又加了一些胡话。

这种失败还高度依赖上下文。像“edit this file”这样全新的单轮 prompt，在我这里完全无法复现。一个 agentic history，也就是模型先读过文件、诊断过问题，然后再组织一次多行编辑的历史，才可能复现。更烦的是，并不是所有 transcript 都会表现出这种行为。事实上，我一开始完全要靠 [Petr Baudis](https://github.com/pasky) 的 transcript 才能复现！在那位用户的 session 里，继续会话会导致 Opus 4.8 大约 20% 的时间失败。把 history 里的 thinking block 去掉后，失败率降低了一半。在我的运行中，开启 strict tool invocation 则消除了这个问题。

## 为什么情况在变糟

我最强的假设是：这不是随机退化，而是训练产物。

旧版 Anthropic 模型接受训练时，确实也训练过一些工具（其中有些是公开文档化的）。但那时的训练还没有像 Claude Code 这样由用户实际使用的 harness 作为明显目标。现代 Anthropic 模型很可能不一样，因为它们的 post-training 包含 Claude Code，或者某个非常相似的 harness。模型学会了在那个环境中，成功的工具调用看起来是什么样。它也学会了那个环境会容忍哪些错误。

Claude Code 自己的工具相对扁平。普通编辑工具不是 Pi 这种嵌套的 `edits[]` 形状；它更接近 `file_path`、`old_string`、`new_string`，再加一个可选 flag（`replace_all`）。看 Claude Code 的客户端很有启发：它包含针对格式错误工具调用的重试路径、参数别名、类型强制转换、Unicode 修复，以及对未知 key 的过滤。换句话说，Anthropic 自己的客户端似乎预期并接受了相当多的松散输入，而且大多是静默修复。

如果强化学习发生在这样的 harness 里，或者发生在它的某个模拟环境里，那么略微格式错误的工具调用仍然可以完成任务并获得 reward。harness 完全吸收了错误，于是对于发明一个别名、添加一个游离字段，或者使用一个相近的参数名，几乎没有什么梯度会惩罚它。

更糟的是，模型可能已经非常强地适配了 canonical Claude Code edit tool shape。另一个 harness 可以提供一个语义意图相同、但 schema 不同的工具。这样的工具会越来越偏离分布。训练得更好的模型反而可能更用力地和你较劲，因为它的 prior 更强。

这并不算太意外，但和几个月前的情况相比已经有所变化。Opus 4.5 发布时，它对其他编辑工具适配得非常好。事实上，我当时还挺相信我们正走在一条好路上：只要指令写得足够好，模型就越来越可能适应任何出现在它面前的工具形状。

现在我有点担心我们正在走的这条路。替代性的工具 schema 可能不只是“不熟悉”。如果 post-training 优化的是某一个特定且宽容的工具生态，那么这些 schema 可能会被隐式惩罚。而这个生态并没有文档化。虽然有一个已经文档化的 [text editor tool](https://platform.claude.com/docs/en/agents-and-tools/tool-use/text-editor-tool)，但你会看到，Claude Code 实际上并不遵循这种格式。Claude Code 内部到底做了什么（它是一个闭源 harness），对你是隐藏的。

## 宽松 Harness

Claude Code 显然是闭源的，但我们可以看看压缩后的代码，大致了解它在做什么。说实话，它对传入数据非常宽容。

首先，Claude Code 会检查模型可见文本里是否泄漏了 `<invoke` 标记。发生这种情况时，它还会发出一些 telemetry，然后用自己的状态机把这类坏调用推回给模型，让它重试。

它有明确的 Unicode escape 修复逻辑，会修复字符串值里损坏的 `\uXXXX` 序列和孤立代理项。它还为不同工具提供参数别名。例如，`Edit` 接受 `old_str`（大概来自模型曾经基于官方文档化的 text editor tool 训练的时期）、schema 里更新的 `old_string`、`new_str`/`new_string`、作为 `file_path` 别名的 `path`，以及更多类似别名。

它还会静默过滤掉意外 key，并且也没有使用 `strict` mode。`strict` mode 的问题在于，Anthropic 会对工具定义施加复杂度限制，导致 API 请求失败，所以这大概就是 Claude Code 没有尝试使用它的原因。

## 严格性

这个问题也会出现在其他 harness 里吗？Anthropic 的一个巨大问题是，模型完全闭源，harness 也是闭源的。Codex 模型同样闭源，但至少 harness 不是。我们还有 [gpt-oss](https://github.com/openai/gpt-oss)，它至少有点意思。这些模型被明确训练来使用 OpenAI 的 [harmony](https://github.com/openai/harmony) response format，而且有大量文档，至少能告诉我们 OpenAI 的人是如何思考这件事的。

Harmony 把 channel 和 tool-call content type 变成 prompt format 的一部分。一个 function call 可以像这样：

```
<|start|>assistant<|channel|>commentary to=functions.get_weather
<|constrain|>json<|message|>{"location":"San Francisco"}<|call|>
```

关键部分是 `<|constrain|>json`。模型可以用带内方式表达这个 message body 是 JSON，而推理栈可以利用这个边界，在工具调用的 body 部分切换到 JSON-constrained sampling。想来 Anthropic 的模型里也有一点类似机制，至少在 `strict` mode 下我会这样猜。

harmony 里的这个 marker 有助于采样器识别什么时候需要用特定 grammar 采样；而且因为它是 transcript 的一部分，这件事做起来相当容易。对于托管的 GPT 模型，也可以为需要遵循类似约束的自定义工具提供一个 [LARK](https://lark-parser.readthedocs.io/en/latest/grammar.html) grammar。

Anthropic 看起来和这不一样，不过也许并非完全不同。如果对象数组确实像看起来那样被表示为 JSON，那么模型就必须在工具参数内部写 JSON。那里可能有基础的 grammar-constrained sampling，而这或许也能部分解释那些额外 key。对一个嵌套数组参数来说，那段 JSON 包含了位于字符串字面量里的、被转义的多行文件内容，而且还都在一个 tag 里面。那些意外的、编造出来的 key，恰好出现在这个任务熵最高的位置：在结束一个几百 token 长的、被转义的 `newText` 字符串之后，模型必须决定接下来是 `}` 还是 `, "..."`。

Opus 4.8 和 Sonnet 5 似乎对“编辑工具调用应该长什么样”有强得多的 prior，而那个 prior 看起来就是 Claude Code 的编辑 schema：一个扁平的 old/new string pair，加上可选的 `replace_all` flag。我的猜测是，Opus 学到了一次 edit operation 可以带一个额外的可选字段，但在 Pi 的嵌套 `oldText`/`newText` 形状下，它没有受训学到那个字段应该叫什么。所以它每次都现场采样一个看起来合理的名字，这也解释了为什么失败案例会产生几十种随机 key，而不是一个稳定的别名。

既然 Anthropic 的 `strict` mode 看起来可以修复这个问题，我推测在服务端它们会拒绝采样任何 JSON schema 结构不允许的 key。这也能解释为什么开启 strict mode 时，它们会限制工具定义的复杂度。

到目前为止，我测试过的 Codex 模型没有出现这类回归。我测试了所有可用模型，除了我还拿不到访问权限的 5.6。

## 这对 Harness 意味着什么

令人不适的教训是：至少在 Anthropic 模型上，工具 schema 并不是中性的。我们喜欢假装 schema 是一个抽象契约，而模型是一个会遵守它的通用推理器，但对某些工具来说，情况可能已经不再如此。

工具 schema 位于某个分布之中，有些形状接近模型在 post-training 中见过的东西，有些则离得很远。有些形状对提供商隐藏的编码方式来说很容易（例如 ANTML 里的顶层属性），而另一些形状则要求模型在嵌套数组中、长篇多行字符串之后，把大段转义 JSON object 写进参数内部。模型可能足够聪明，能够理解 schema，却仍然会在压力下采样不出精确的形状。

如果这种模型行为持续下去，我很好奇它会对 harness 带来什么影响。显然，你可以在 Anthropic 上开启 `strict` sampling，问题应该就会消失。另一方面，模型出现这种行为本身，也展示了强化学习对它们的影响。如果你想获得最佳模型表现，和这种 prior 对抗可能是徒劳的。

眼下的现实是，Claude Code 不是开源的，我们也无法真正知道他们在 RL 环境里到底做了什么。我们不能假设经过 Claude Code 训练的行为会干净地迁移到你的工具上，除非你的工具和它非常接近。越多 post-training 发生在某一个占主导地位的 harness 里，其他所有 harness 就越不得不继承它的怪癖。

我过去对 strict grammar-constrained tool invocation 更持怀疑态度，因为 constrained decoding 可能会带来质量取舍。我仍然认为总体上这可能是真的，但这个 bug 明显改变了我的先验。如果最新模型在解决任务上变得更强，却在忠实输出替代性工具 schema 上变得更差，那么 harness 就需要在某个地方提供更强的保证。

如果你想了解更多，或者想讨论这件事，可以读一读 [Pi tracker 上的 issue](https://github.com/earendil-works/pi/issues/6278)。

本文标签为 [ai](https://lucumr.pocoo.org/tags/ai/) 和 [pi](https://lucumr.pocoo.org/tags/pi/)。

[copy as](https://lucumr.pocoo.org/2026/7/4/better-models-worse-tools.md) / [view](https://lucumr.pocoo.org/2026/7/4/better-models-worse-tools.md) markdown
