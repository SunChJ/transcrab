---
title: 什么是推理
date: '2026-08-24T07:50:21.285Z'
sourceUrl: 'https://lucumr.pocoo.org/2026/8/19/what-is-reasoning/'
lang: zh
---
写于 2026 年 8 月 19 日

几周前，[有人分享了一篇论文](https://arxiv.org/html/2608.09867v1)，展示了如何从闭源权重模型中提取推理轨迹。再加上网上关于诱骗模型泄露这些轨迹的讨论，我出于好奇对此展开了更多研究。Twitter 上似乎充斥着对其原理的一知半解和混乱认识，所以这篇文章或许能帮助一些人理解究竟发生了什么。

## 隐藏推理轨迹

推理轨迹通常不会展示给我们。[我们曾为此感到遗憾](https://earendil.com/posts/session-portability/)，但大多数时候也只能接受。所幸开放权重模型会把它们暴露出来；从这些模型的行为可以看到，推理轨迹可能既冗长又混乱。这或许正是应该将其与通常展示给用户的内容分开的充分理由。

UI 至少需要能够识别它们。这个行业很擅长把推理轨迹说得既特殊又神秘，但它们其实只是文本：模型经过训练，会先把自己的思考作为回答的一部分输出到暂存区，然后再给出最终答案。

GPT-OSS 的 Harmony 响应格式很直观地展示了这一点：

```
<|channel|>analysis<|message|>
I need to work this out ...
<|end|><|start|>assistant<|channel|>final<|message|>
The answer is ...
<|return|>
```

这些标记是特殊 token，但位于标记之间的推理使用的文本与最终答案「并无不同」（只不过 GPT 的思维链文本读起来确实很好笑）。当模型采样到 `analysis` channel token 时，解析器会把后续文本路由到一个独立的流，并通过 Responses API 将其暴露出来。对于闭源模型，想必会由一个简单模型对其进行删减和总结。

## 推理强度

多少预算会用于推理？早期的 API 会暴露推理 token 预算，让人以为这是采样过程的一项属性。实际上，推理强度被写进了系统提示词。GPT-OSS 会在系统提示词中加入：

```
Reasoning: low
```

就这么简单。训练塑造了由此产生的行为，例如输出用于切换到 `analysis` channel 的 token 序列。这也解释了为什么改变推理强度会使 KV cache 失效。我猜闭源 GPT 模型把推理强度称为「juice」，因为你可以问大多数模型它们有多少 juice。

在面向 DeepSeek 的 [DwarfStar](https://github.com/antirez/ds4) 中，启用最高推理强度时，系统提示词会加入：

```
Reasoning Effort: Absolute maximum with no shortcuts permitted.
You MUST be very thorough in your thinking and comprehensively decompose the
problem to resolve the root cause, rigorously stress-testing your logic against
all potential paths, edge cases, and adversarial scenarios.
```

## 不要思考

因此，推理 token 最终去往何处是一种习得的约定：模型经过训练，不会把草稿内容放进 `final` channel。只要诱使模型相信自己正处于这个 channel，它就可能泄露 token。我们甚至见过较老的模型在思考被禁用时，把推理过程写进 bash 工具，再将自己的想法 echo 到 `/dev/null`。

所以从某种意义上说，对一些模型而言，唯一「特殊」的行为反而是不思考。有时，实现这一点的方式是「机械地」移除模型惯常的思考途径。在 [DwarfStar](https://github.com/antirez/ds4) 中，禁用思考时会预填充 `</think>`，启用思考时则会预填充 `<think>`；这两个 token 分别用于结束和开始思考。GPT-OSS 不做预填充，而是让模型自行决定采用哪一种方式。

不过，可以推测有些推理 API 会在启用推理时预填充起始 token，这样模型就永远不必自行采样该 token；而在禁用推理时，API 也可能阻止模型采样推理 token，因为这种采样很容易被检测到。这或许解释了为什么[自定义 `think` 工具](https://gist.github.com/mitsuhiko/0904a3d89741e8e3bcca1ca93ea076de)能够诱骗模型，把部分推理内容放到不该出现的位置——但仅限于原生推理已被禁用的情况。

趣事：这篇博客文章触发了安全检查

更好笑的是，由于安全过滤器的阻拦，我没法用 GPT 5.6 terra 检查这篇博客文章的拼写和语法，只好改用 Kimi。

![GPT-5.6-terra 拒绝为这篇博客文章检查拼写](https://lucumr.pocoo.org/static/gpt-5.6-terra-spell-check.png)

本文标签：[ai](https://lucumr.pocoo.org/tags/ai/)

[复制为](https://lucumr.pocoo.org/2026/8/19/what-is-reasoning.md) / [查看](https://lucumr.pocoo.org/2026/8/19/what-is-reasoning.md) Markdown
