---
title: Harness 设计手册
date: '2026-09-12T04:42:08.669Z'
sourceUrl: 'https://stencil.so/blog/harness-playbook'
lang: zh
---
*首先，想说声谢谢。数十万用户使用过 omp，报告故障、提出需求，共同塑造了它今天的模样。这篇文章和 omp² 本身，都因你们而存在。*

听说 omp² 之后，很多人马上问：“可是，为什么要重做？”

给 fetch 套一个 while 循环，听起来很简单。但 OpenCode、Pi、OpenClaw 和 omp 都在同时进行全面重构，是有原因的：这类软件以前并不存在。只有从简单版本起步，我们才能看到裂缝，进而找到更好的实现方式。

无法避免的复杂性，必须有人负责。现在，[复杂性守恒](https://en.wikipedia.org/wiki/Law_of_conservation_of_complexity)的天平偏向了扩展和用户，让人在 omp 或 Pi 之上几乎无法编写可靠的软件。我已经听到有人说：*“什么？它的扩展机制明明又简单又好用。”* 给我几章的篇幅，让我试着改变你的想法。

Dijkstra 写过，[“简单是可靠的前提”](https://www.cs.virginia.edu/~evans/cs655/readings/ewd498.html)，可他又以用算法解决寻路问题而闻名。为什么不直接暴力搜索？他根本不是在主张我们如今反复念叨的**简单就是好，复杂就是坏**。那句话是为了帮助实现者推理。可我们却令人惭愧地拿它当借口，让实现者不必推理。

Ousterhout 在斯坦福的讲义中补上了另一半。他告诉模块作者，要[“拥抱痛苦”](https://web.stanford.edu/~ouster/cgi-bin/cs190-spring16/lecture.php?topic=modularDesign)：接下难题，把它彻底解决，再让其他人轻松使用成果。把复杂性压到模块内部。让少数实现者承担它，而不是让每个调用者各自承担一份更小、又略有差别的副本。

* * *

不少读者应该还记得，那条把 Claude Code 比作游戏引擎的推文引发了一波梗图。这种比喻听起来有点牵强，但如果列出智能体运行框架（harness）的职责，先把渲染放到一边，其实相当吻合。

它维护一个权威的世界状态，把变更记入日志，执行不可信操作，将状态复制给多个视图，调度参与者，解释命令，适配互不兼容的协议，并渲染实时界面。

是不是很熟悉？游戏引擎似乎已经为这些同类复杂性负责了几十年。

接下来的内容，既是复盘，也是设计手册：

- **omp 给我们的教训**：指出我们在一个真实用户使用的系统中遭遇的失败。
- **omp² 的改变**：描述替代架构——其中一些已经实现，另一些还在推敲。

1. [设计边界](#the-design-envelope)
2. [状态](#the-state)
3. [运行时](#the-runtime)
4. [控制平面](#the-control-plane)
5. [模型推理](#the-inference)
6. [工具接口](#the-tool-surface)
7. [界面](#the-interface)
8. [技术栈](#the-stack)
9. [结语](#closing-notes)
10. [官方示例中的状态故障](#appendix-a-state-failures-in-the-official-examples)
11. [弹性推测槽位](#appendix-b-elastic-speculative-slots)

<a id="the-design-envelope"></a>

## 设计边界

在讨论智能体运行框架的任何子系统之前，先想象四种截然不同的产品都要依赖它：

- **多智能体共享工作区**：*多个智能体及子智能体在同一文件夹中工作的本地环境。*
- **远程操控端**：*用户用手机上的远程客户端，操控云端智能体，或桌下那台机器上的智能体。*
- **旁观端**：*通过 Web 客户端观看 Claude 智能体工作。*
- **Factorio**：*通过 SDK 处理不可信输入的自动化软件工厂。*

这不是市场用户画像，而是架构测试。它们共同覆盖了那些会让运行框架不再只是聊天循环的维度：

| 测试场景 | 本地或远程 | 交互或自主 | 信任边界 | 并发 |
| --- | --- | --- | --- | --- |
| 多智能体共享工作区 | 本地 | 交互式 | 大体可信 | 多个智能体，一个工作区 |
| 远程操控端 | 远程 | 交互式 | 主机与客户端分离 | 一个或多个智能体 |
| 旁观端 | 远程视图 | 只观察 | 不可信的展示输入 | 多名观看者 |
| Factorio | 远程或集群 | 自主运行 | 恶意仓库与工具输入 | 多个作业 |

只适用于第一种场景的设计，往往会把控制器偷偷塞进 TUI，把状态保存在闭包里，让扩展在引擎进程中执行，并假设一个没有资源或时间上限的调用出了问题，人总能救场。要同时经受住四种场景，设计就不得不建立更好的边界。

本手册余下的内容围绕五个推论展开：

1. **唯一的权威会话。** 回退、分叉、恢复、复制和检查，都必须从同一份记入日志的状态派生。
2. **可信的控制平面。** 策略和会话所有权留在主机；沙盒只接收有明确限制的执行请求。
3. **有界工作。** 工具调用、子智能体和后台作业，都应是可取消的流，拥有集中的限制与可观测性。
4. **显式兼容性。** 模型和提供商的特殊行为，应成为结构化知识，而不是散落在调用点的分支判断。
5. **视图只是投影。** TUI、Web 客户端、远程客户端和子智能体检查器渲染同一份状态，而不是成为额外的权威来源。

这些约束贯穿全文。后面提出 DOM、convar、Director、微型 VM 桩程序或组件渲染器时，都是为了解决这五项需求中的某一项，而不是为了炫技去引入子系统。

第一项是基础：在决定代码在哪里运行、如何渲染之前，运行框架首先得知道什么才是真实状态。

<a id="the-state"></a>

## 状态

### 哪些东西必须保留下来

如果希望某个东西能持久保存、回退、容忍崩溃并支持分叉，你有三种选择：

1. 保存产生它的历史。
2. 保存你关心的属性变化。
3. 保存机器本身。

<figure data-hk="000000010000000000004000010a40"><img src="https://stencil.so/blog/harness-playbook/state-sourcing-meme.webp" width="1376" height="768" alt="&quot;You need to serialize state&quot; meme, three panels: event sourcing (crying wojak buried in events, replay everything), incremental snapshotting (calm wojak diffing two property snapshots), and gigachad sourcing (diff WASM memory, restore the machine)." loading="lazy"></figure>

Source Engine 在网络同步中使用了第二种方案的变体。omp 和 Pi 目前则……没有一致地采用其中任何一种。它们有事件，但状态并不真正源于这些事件，违背了事件溯源的首要原则：**仅凭事件就必须能够推导出状态**。

### omp 给我们的教训：两个权威来源

<figure data-hk="000000010000000000004000010a43"><div data-hk="000000010000000000004000010a440" role="img" aria-label="Side-by-side comparison: CS:GO's Source Engine has one authority — the entity list — whose deltas cover every field, so replaying the .dem file reproduces the original session. Pi has two authorities: the journaled message tree, and a pile of authoritative-but-underived state (todo, retry counters, subagent registry, extension closures) that no delta covers, so replaying the .jsonl does not reproduce the session."><svg id="state-authorities-0" width="100%" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" style="max-width: 679.64453125px;" viewBox="0 0 679.64453125 1778.4000244140625" role="graphics-document document" aria-roledescription="flowchart-v2"><g><marker id="state-authorities-0_flowchart-v2-pointEnd" viewBox="0 0 10 10" refX="5" refY="5" markerUnits="userSpaceOnUse" markerWidth="8" markerHeight="8" orient="auto"><path d="M 0 0 L 10 5 L 0 10 z" style="stroke-width: 1; stroke-dasharray: 1, 0;"></path></marker><marker id="state-authorities-0_flowchart-v2-pointStart" viewBox="0 0 10 10" refX="4.5" refY="5" markerUnits="userSpaceOnUse" markerWidth="8" markerHeight="8" orient="auto"><path d="M 0 5 L 10 10 L 10 0 z" style="stroke-width: 1; stroke-dasharray: 1, 0;"></path></marker><marker id="state-authorities-0_flowchart-v2-pointEnd-margin" viewBox="0 0 11.5 14" refX="11.5" refY="7" markerUnits="userSpaceOnUse" markerWidth="10.5" markerHeight="14" orient="auto"><path d="M 0 0 L 11.5 7 L 0 14 z" style="stroke-width: 0; stroke-dasharray: 1, 0;"></path></marker><marker id="state-authorities-0_flowchart-v2-pointStart-margin" viewBox="0 0 11.5 14" refX="1" refY="7" markerUnits="userSpaceOnUse" markerWidth="11.5" markerHeight="14" orient="auto"><polygon points="0,7 11.5,14 11.5,0" style="stroke-width: 0; stroke-dasharray: 1, 0;"></polygon></marker><marker id="state-authorities-0_flowchart-v2-circleEnd" viewBox="0 0 10 10" refX="11" refY="5" markerUnits="userSpaceOnUse" markerWidth="11" markerHeight="11" orient="auto"><circle cx="5" cy="5" r="5" style="stroke-width: 1; stroke-dasharray: 1, 0;"></circle></marker><marker id="state-authorities-0_flowchart-v2-circleStart" viewBox="0 0 10 10" refX="-1" refY="5" markerUnits="userSpaceOnUse" markerWidth="11" markerHeight="11" orient="auto"><circle cx="5" cy="5" r="5" style="stroke-width: 1; stroke-dasharray: 1, 0;"></circle></marker><marker id="state-authorities-0_flowchart-v2-circleEnd-margin" viewBox="0 0 10 10" refY="5" refX="12.25" markerUnits="userSpaceOnUse" markerWidth="14" markerHeight="14" orient="auto"><circle cx="5" cy="5" r="5" style="stroke-width: 0; stroke-dasharray: 1, 0;"></circle></marker><marker id="state-authorities-0_flowchart-v2-circleStart-margin" viewBox="0 0 10 10" refX="-2" refY="5" markerUnits="userSpaceOnUse" markerWidth="14" markerHeight="14" orient="auto"><circle cx="5" cy="5" r="5" style="stroke-width: 0; stroke-dasharray: 1, 0;"></circle></marker><marker id="state-authorities-0_flowchart-v2-crossEnd" viewBox="0 0 11 11" refX="12" refY="5.2" markerUnits="userSpaceOnUse" markerWidth="11" markerHeight="11" orient="auto"><path d="M 1,1 l 9,9 M 10,1 l -9,9" style="stroke-width: 2; stroke-dasharray: 1, 0;"></path></marker><marker id="state-authorities-0_flowchart-v2-crossStart" viewBox="0 0 11 11" refX="-1" refY="5.2" markerUnits="userSpaceOnUse" markerWidth="11" markerHeight="11" orient="auto"><path d="M 1,1 l 9,9 M 10,1 l -9,9" style="stroke-width: 2; stroke-dasharray: 1, 0;"></path></marker><marker id="state-authorities-0_flowchart-v2-crossEnd-margin" viewBox="0 0 15 15" refX="17.7" refY="7.5" markerUnits="userSpaceOnUse" markerWidth="12" markerHeight="12" orient="auto"><path d="M 1,1 L 14,14 M 1,14 L 14,1" style="stroke-width: 2.5;"></path></marker><marker id="state-authorities-0_flowchart-v2-crossStart-margin" viewBox="0 0 15 15" refX="-3.5" refY="7.5" markerUnits="userSpaceOnUse" markerWidth="12" markerHeight="12" orient="auto"><path d="M 1,1 L 14,14 M 1,14 L 14,1" style="stroke-width: 2.5; stroke-dasharray: 1, 0;"></path></marker><g><g></g><g><path d="M339.822,836.2L339.822,836.2L339.822,862.2L339.822,862.2L339.822,888.2" id="state-authorities-0-L_CSGO_PI_0" style=";" data-edge="true" data-et="edge" data-id="L_CSGO_PI_0" data-points="W3sieCI6MzM5LjgyMjI2NTYyNSwieSI6ODM2LjIwMDAxMjIwNzAzMTJ9LHsieCI6MzM5LjgyMjI2NTYyNSwieSI6ODYyLjIwMDAxMjIwNzAzMTJ9LHsieCI6MzM5LjgyMjI2NTYyNSwieSI6ODg4LjIwMDAxMjIwNzAzMTJ9XQ==" data-look="classic"></path></g><g><g><g data-id="L_CSGO_PI_0" transform="translate(0, 0)"><text y="-10.1" text-anchor="middle"><tspan x="0" y="-0.1em" dy="1.1em" text-anchor="middle"></tspan></text></g></g><g><rect style="stroke: none"></rect></g></g><g><g transform="translate(0, 880.2000122070312)"><g><g id="state-authorities-0-PI" data-look="classic"><rect style="" x="8" y="8" width="663.64453125" height="882.2000007629395"></rect><g transform="translate(271.712890625, 8)"><g><rect style="stroke: none"></rect><text y="-10.1" style=""><tspan x="0" y="-0.1em" dy="1.1em"><tspan font-style="normal" font-weight="normal">π</tspan><tspan font-style="normal" font-weight="normal"> ·</tspan><tspan font-style="normal" font-weight="normal"> two</tspan><tspan font-style="normal" font-weight="normal"> authorities</tspan></tspan></text></g></g></g></g><g><path d="M273.908,186.5L328.23,186.5L328.23,240.6L398.495,240.6L398.495,294.7" id="state-authorities-0-L_P_PRIVATE_P_CHANGE_0" style="stroke:#ef4444;stroke-width:3px;color:#f87171;fill:none;;;stroke:#ef4444;stroke-width:3px;color:#f87171;fill:none" data-edge="true" data-et="edge" data-id="L_P_PRIVATE_P_CHANGE_0" data-points="W3sieCI6MjczLjkwODQxMjIyODU0NTY3LCJ5IjoxODYuNX0seyJ4IjozMjguMjMwNDY4NzUsInkiOjI0MC42MDAwMDAzODE0Njk3M30seyJ4IjozOTguNDk0NTgwODI3MTc0MzMsInkiOjI5NC43MDAwMDA3NjI5Mzk0NX1d" data-look="classic" marker-end="url(#state-authorities-0_flowchart-v2-crossEnd__ef4444)"></path><path d="M523.844,159.5L523.844,159.5L523.844,240.6L496.279,240.6L496.279,291.188" id="state-authorities-0-L_P_TRUTH_P_CHANGE_0" style=";" data-edge="true" data-et="edge" data-id="L_P_TRUTH_P_CHANGE_0" data-points="W3sieCI6NTIzLjg0Mzc1LCJ5IjoxNTkuNX0seyJ4Ijo1MjMuODQzNzUsInkiOjI0MC42MDAwMDAzODE0Njk3M30seyJ4Ijo0OTQuMzY1MzY4NjU0MDE4NzcsInkiOjI5NC43MDAwMDA3NjI5Mzk0NX1d" data-look="classic" marker-end="url(#state-authorities-0_flowchart-v2-pointEnd)"></path><path d="M466.031,398.7L466.031,398.7L466.031,437.2L466.031,437.2L466.031,471.7" id="state-authorities-0-L_P_CHANGE_P_DISK_0" style=";" data-edge="true" data-et="edge" data-id="L_P_CHANGE_P_DISK_0" data-points="W3sieCI6NDY2LjAzMTI1LCJ5IjozOTguNzAwMDAwNzYyOTM5NDV9LHsieCI6NDY2LjAzMTI1LCJ5Ijo0MzcuMjAwMDAwNzYyOTM5NDV9LHsieCI6NDY2LjAzMTI1LCJ5Ijo0NzUuNzAwMDAwNzYyOTM5NDV9XQ==" data-look="classic" marker-end="url(#state-authorities-0_flowchart-v2-pointEnd)"></path><path d="M466.031,543.7L466.031,543.7L466.031,582.2L466.031,582.2L466.031,616.7" id="state-authorities-0-L_P_DISK_P_REPLAY_0" style=";" data-edge="true" data-et="edge" data-id="L_P_DISK_P_REPLAY_0" data-points="W3sieCI6NDY2LjAzMTI1LCJ5Ijo1NDMuNzAwMDAwNzYyOTM5NX0seyJ4Ijo0NjYuMDMxMjUsInkiOjU4Mi4yMDAwMDA3NjI5Mzk1fSx7IngiOjQ2Ni4wMzEyNSwieSI6NjIwLjcwMDAwMDc2MjkzOTV9XQ==" data-look="classic" marker-end="url(#state-authorities-0_flowchart-v2-pointEnd)"></path><path d="M466.031,688.7L466.031,688.7L466.031,727.2L410.514,727.2L410.514,763.511" id="state-authorities-0-L_P_REPLAY_P_RESULT_0" style=";" data-edge="true" data-et="edge" data-id="L_P_REPLAY_P_RESULT_0" data-points="W3sieCI6NDY2LjAzMTI1LCJ5Ijo2ODguNzAwMDAwNzYyOTM5NX0seyJ4Ijo0NjYuMDMxMjUsInkiOjcyNy4yMDAwMDA3NjI5Mzk1fSx7IngiOjQwNy4xNjY2OTg2MTk2MzE5LCJ5Ijo3NjUuNzAwMDAwNzYyOTM5NX1d" data-look="classic" marker-end="url(#state-authorities-0_flowchart-v2-pointEnd)"></path><path d="M171.011,186.5L145.809,186.5L145.809,240.6L145.809,240.6L145.809,346.7L145.809,346.7L145.809,437.2L145.809,437.2L145.809,509.7L145.809,509.7L145.809,582.2L145.809,582.2L145.809,654.7L145.809,654.7L145.809,727.2L234.523,727.2L234.523,764.162" id="state-authorities-0-L_P_PRIVATE_P_RESULT_0" style="stroke:#ef4444;stroke-width:4px;color:#f87171;fill:none;;;stroke:#ef4444;stroke-width:4px;color:#f87171;fill:none" data-edge="true" data-et="edge" data-id="L_P_PRIVATE_P_RESULT_0" data-points="W3sieCI6MTcxLjAxMTMwMzM1ODY5OTgyLCJ5IjoxODYuNX0seyJ4IjoxNDUuODA4NTkzNzUsInkiOjI0MC42MDAwMDAzODE0Njk3M30seyJ4IjoxNDUuODA4NTkzNzUsInkiOjM0Ni43MDAwMDA3NjI5Mzk0NX0seyJ4IjoxNDUuODA4NTkzNzUsInkiOjQzNy4yMDAwMDA3NjI5Mzk0NX0seyJ4IjoxNDUuODA4NTkzNzUsInkiOjUwOS43MDAwMDA3NjI5Mzk0NX0seyJ4IjoxNDUuODA4NTkzNzUsInkiOjU4Mi4yMDAwMDA3NjI5Mzk1fSx7IngiOjE0NS44MDg1OTM3NSwieSI6NjU0LjcwMDAwMDc2MjkzOTV9LHsieCI6MTQ1LjgwODU5Mzc1LCJ5Ijo3MjcuMjAwMDAwNzYyOTM5NX0seyJ4IjoyMzguMjE0ODY3NzE0NzIzOTQsInkiOjc2NS43MDAwMDA3NjI5Mzk1fV0=" data-look="classic" marker-end="url(#state-authorities-0_flowchart-v2-pointEnd__ef4444)"></path></g><g><g transform="translate(328.23046875, 240.60000038146973)"><g data-id="L_P_PRIVATE_P_CHANGE_0" transform="translate(0, -14.600001335144043)"><g><rect style="color:#f87171 !important" x="-95.625" y="-0.9999990463256836" width="191.25" height="31.200000762939453"></rect><text y="-10.1" text-anchor="middle" style="fill:#f87171 !important"><tspan x="0" y="-0.1em" dy="1.1em" text-anchor="middle"><tspan font-style="normal" font-weight="normal">1</tspan><tspan font-style="normal" font-weight="normal"> ·</tspan><tspan font-style="normal" font-weight="normal"> never</tspan><tspan font-style="normal" font-weight="normal"> a</tspan><tspan font-style="normal" font-weight="normal"> delta</tspan><tspan font-style="normal" font-weight="normal"> —</tspan><tspan font-style="normal" font-weight="normal"> but</tspan><tspan font-style="normal" font-weight="normal"> it</tspan></tspan><tspan x="0" y="1em" dy="1.1em" text-anchor="middle"><tspan font-style="normal" font-weight="normal">IS</tspan><tspan font-style="normal" font-weight="normal"> state</tspan></tspan></text></g></g></g><g><g data-id="L_P_TRUTH_P_CHANGE_0" transform="translate(0, 0)"><text y="-10.1" text-anchor="middle"><tspan x="0" y="-0.1em" dy="1.1em" text-anchor="middle"></tspan></text></g></g><g><rect style="stroke: none"></rect></g><g><g data-id="L_P_CHANGE_P_DISK_0" transform="translate(0, 0)"><text y="-10.1" text-anchor="middle"><tspan x="0" y="-0.1em" dy="1.1em" text-anchor="middle"></tspan></text></g></g><g><rect style="stroke: none"></rect></g><g><g data-id="L_P_DISK_P_REPLAY_0" transform="translate(0, 0)"><text y="-10.1" text-anchor="middle"><tspan x="0" y="-0.1em" dy="1.1em" text-anchor="middle"></tspan></text></g></g><g><rect style="stroke: none"></rect></g><g><g data-id="L_P_REPLAY_P_RESULT_0" transform="translate(0, 0)"><text y="-10.1" text-anchor="middle"><tspan x="0" y="-0.1em" dy="1.1em" text-anchor="middle"></tspan></text></g></g><g><rect style="stroke: none"></rect></g><g transform="translate(145.80859375, 509.70000076293945)"><g data-id="L_P_PRIVATE_P_RESULT_0" transform="translate(0, -8.000000953674316)"><g><rect style="color:#f87171 !important" x="-95.6171875" y="-0.9999990463256836" width="191.234375" height="18"></rect><text y="-10.1" text-anchor="middle" style="fill:#f87171 !important"><tspan x="0" y="-0.1em" dy="1.1em" text-anchor="middle"><tspan font-style="normal" font-weight="normal">2</tspan><tspan font-style="normal" font-weight="normal"> ·</tspan><tspan font-style="normal" font-weight="normal"> rewind</tspan><tspan font-style="normal" font-weight="normal"> cannot</tspan><tspan font-style="normal" font-weight="normal"> reach</tspan><tspan font-style="normal" font-weight="normal"> it</tspan></tspan></text></g></g></g></g><g><g id="state-authorities-0-flowchart-P_PRIVATE-16" data-look="classic" transform="translate(203.62109375, 116.5)"><rect style="fill:#ef444440 !important;stroke:#ef4444 !important;stroke-width:2px !important" x="-132" y="-70" width="264" height="140"></rect><g style="" transform="translate(-100, -54)"><rect></rect><foreignObject width="200" height="108"><p><span></span></p><p>OUTSIDE THE TREE<br>todo · retry · subagents · streaming<br>closures · prompts · tools · settings · MCP<br><b>authoritative, not derived</b></p><p></p></foreignObject></g></g><g id="state-authorities-0-flowchart-P_CHANGE-18" data-look="classic" transform="translate(466.03125, 346.70000076293945)"><rect style="fill:#f59e0b40 !important;stroke:#f59e0b !important;stroke-width:2px !important" x="-132" y="-52" width="264" height="104"></rect><g style="" transform="translate(-100, -36)"><rect></rect><foreignObject width="200" height="72"><p><span></span></p><p>UNIT OF CHANGE<br><b>message · custom · custom_message</b><br>covers the tree only</p><p></p></foreignObject></g></g><g id="state-authorities-0-flowchart-P_TRUTH-17" data-look="classic" transform="translate(523.84375, 116.5)"><rect style="fill:#2563eb40 !important;stroke:#3b82f6 !important;stroke-width:2px !important" x="-107.6015625" y="-43" width="215.203125" height="86"></rect><g style="" transform="translate(-75.6015625, -27)"><rect></rect><foreignObject width="151.203125" height="54"><p><span></span></p><p>SOURCE OF TRUTH<br><b>message tree</b><br>ids and messages only</p><p></p></foreignObject></g></g><g id="state-authorities-0-flowchart-P_DISK-19" data-look="classic" transform="translate(466.03125, 509.70000076293945)"><rect style="fill:#8b5cf640 !important;stroke:#8b5cf6 !important;stroke-width:2px !important" x="-125.6015625" y="-34" width="251.203125" height="68"></rect><g style="" transform="translate(-93.6015625, -18)"><rect></rect><foreignObject width="187.203125" height="36"><p><span></span></p><p>ON DISK · <b>.jsonl</b><br>the tree, and nothing else</p><p></p></foreignObject></g></g><g id="state-authorities-0-flowchart-P_REPLAY-20" data-look="classic" transform="translate(466.03125, 654.7000007629395)"><rect style="fill:#22c55e40 !important;stroke:#22c55e !important;stroke-width:2px !important" x="-93.203125" y="-34" width="186.40625" height="68"></rect><g style="" transform="translate(-61.203125, -18)"><rect></rect><foreignObject width="122.40625" height="36"><p><span></span></p><p>REPLAY<br><b>move leaf pointer</b></p><p></p></foreignObject></g></g><g id="state-authorities-0-flowchart-P_RESULT-21" data-look="classic" transform="translate(341.421875, 808.7000007629395)"><rect style="fill:#ef4444 !important;stroke:#fca5a5 !important;stroke-width:3px !important" x="-132" y="-43" width="264" height="86"></rect><g style="color:#fff !important" transform="translate(-100, -27)"><rect></rect><foreignObject width="200" height="54"><p><span style="color:#fff !important"></span></p><p><b>replay(.jsonl) ≠ original</b><br>rewind · fork · resume all lie</p><p></p></foreignObject></g></g></g></g><g transform="translate(21.822265625, 0)"><g><g id="state-authorities-0-CSGO" data-look="classic"><rect style="" x="8" y="8" width="620" height="828.2000007629395"></rect><g transform="translate(202.7890625, 8)"><g><rect style="stroke: none"></rect><text y="-10.1" style=""><tspan x="0" y="-0.1em" dy="1.1em"><tspan font-style="normal" font-weight="normal">Source</tspan><tspan font-style="normal" font-weight="normal"> engine</tspan><tspan font-style="normal" font-weight="normal"> ·</tspan><tspan font-style="normal" font-weight="normal"> single</tspan><tspan font-style="normal" font-weight="normal"> authority</tspan></tspan></text></g></g></g></g><g><path d="M168,150.5L168,150.5L168,204.6L251.574,204.6L251.574,258.7" id="state-authorities-0-L_C_PRED_C_CHANGE_0" style=";" data-edge="true" data-et="edge" data-id="L_C_PRED_C_CHANGE_0" data-points="W3sieCI6MTY4LCJ5IjoxNTAuNX0seyJ4IjoxNjgsInkiOjIwNC42MDAwMDAzODE0Njk3M30seyJ4IjoyNTEuNTczNjM1Njg4MzU4ODgsInkiOjI1OC43MDAwMDA3NjI5Mzk0NX1d" data-look="classic" marker-end="url(#state-authorities-0_flowchart-v2-crossEnd)"></path><path d="M468,150.5L468,150.5L468,204.6L387.784,204.6L387.784,256.526" id="state-authorities-0-L_C_TRUTH_C_CHANGE_0" style=";" data-edge="true" data-et="edge" data-id="L_C_TRUTH_C_CHANGE_0" data-points="W3sieCI6NDY4LCJ5IjoxNTAuNX0seyJ4Ijo0NjgsInkiOjIwNC42MDAwMDAzODE0Njk3M30seyJ4IjozODQuNDI2MzY0MzExNjQxMSwieSI6MjU4LjcwMDAwMDc2MjkzOTQ1fV0=" data-look="classic" marker-end="url(#state-authorities-0_flowchart-v2-pointEnd)"></path><path d="M318,344.7L318,344.7L318,383.2L318,383.2L318,417.7" id="state-authorities-0-L_C_CHANGE_C_DISK_0" style=";" data-edge="true" data-et="edge" data-id="L_C_CHANGE_C_DISK_0" data-points="W3sieCI6MzE4LCJ5IjozNDQuNzAwMDAwNzYyOTM5NDV9LHsieCI6MzE4LCJ5IjozODMuMjAwMDAwNzYyOTM5NDV9LHsieCI6MzE4LCJ5Ijo0MjEuNzAwMDAwNzYyOTM5NDV9XQ==" data-look="classic" marker-end="url(#state-authorities-0_flowchart-v2-pointEnd)"></path><path d="M318,489.7L318,489.7L318,528.2L318,528.2L318,562.7" id="state-authorities-0-L_C_DISK_C_REPLAY_0" style=";" data-edge="true" data-et="edge" data-id="L_C_DISK_C_REPLAY_0" data-points="W3sieCI6MzE4LCJ5Ijo0ODkuNzAwMDAwNzYyOTM5NDV9LHsieCI6MzE4LCJ5Ijo1MjguMjAwMDAwNzYyOTM5NX0seyJ4IjozMTgsInkiOjU2Ni43MDAwMDA3NjI5Mzk1fV0=" data-look="classic" marker-end="url(#state-authorities-0_flowchart-v2-pointEnd)"></path><path d="M318,634.7L318,634.7L318,673.2L318,673.2L318,707.7" id="state-authorities-0-L_C_REPLAY_C_RESULT_0" style=";" data-edge="true" data-et="edge" data-id="L_C_REPLAY_C_RESULT_0" data-points="W3sieCI6MzE4LCJ5Ijo2MzQuNzAwMDAwNzYyOTM5NX0seyJ4IjozMTgsInkiOjY3My4yMDAwMDA3NjI5Mzk1fSx7IngiOjMxOCwieSI6NzExLjcwMDAwMDc2MjkzOTV9XQ==" data-look="classic" marker-end="url(#state-authorities-0_flowchart-v2-pointEnd)"></path></g><g><g transform="translate(168, 204.60000038146973)"><g data-id="L_C_PRED_C_CHANGE_0" transform="translate(0, -14.600001335144043)"><g><rect style="" x="-99.21875" y="-0.9999990463256836" width="198.4375" height="31.200000762939453"></rect><text y="-10.1" text-anchor="middle" style=""><tspan x="0" y="-0.1em" dy="1.1em" text-anchor="middle"><tspan font-style="normal" font-weight="normal">never</tspan><tspan font-style="normal" font-weight="normal"> a</tspan><tspan font-style="normal" font-weight="normal"> delta</tspan><tspan font-style="normal" font-weight="normal"> —</tspan><tspan font-style="normal" font-weight="normal"> fine,</tspan><tspan font-style="normal" font-weight="normal"> it</tspan><tspan font-style="normal" font-weight="normal"> is</tspan></tspan><tspan x="0" y="1em" dy="1.1em" text-anchor="middle"><tspan font-style="normal" font-weight="normal">derived</tspan></tspan></text></g></g></g><g><g data-id="L_C_TRUTH_C_CHANGE_0" transform="translate(0, 0)"><text y="-10.1" text-anchor="middle"><tspan x="0" y="-0.1em" dy="1.1em" text-anchor="middle"></tspan></text></g></g><g><rect style="stroke: none"></rect></g><g><g data-id="L_C_CHANGE_C_DISK_0" transform="translate(0, 0)"><text y="-10.1" text-anchor="middle"><tspan x="0" y="-0.1em" dy="1.1em" text-anchor="middle"></tspan></text></g></g><g><rect style="stroke: none"></rect></g><g><g data-id="L_C_DISK_C_REPLAY_0" transform="translate(0, 0)"><text y="-10.1" text-anchor="middle"><tspan x="0" y="-0.1em" dy="1.1em" text-anchor="middle"></tspan></text></g></g><g><rect style="stroke: none"></rect></g><g><g data-id="L_C_REPLAY_C_RESULT_0" transform="translate(0, 0)"><text y="-10.1" text-anchor="middle"><tspan x="0" y="-0.1em" dy="1.1em" text-anchor="middle"></tspan></text></g></g><g><rect style="stroke: none"></rect></g></g><g><g id="state-authorities-0-flowchart-C_PRED-0" data-look="classic" transform="translate(168, 98.5)"><rect style="fill:#64748b40 !important;stroke:#94a3b8 !important" x="-132" y="-52" width="264" height="104"></rect><g style="" transform="translate(-100, -36)"><rect></rect><foreignObject width="200" height="72"><p><span></span></p><p>OUTSIDE THE ENTITY LIST<br>client prediction<br><b>derived, never authoritative</b></p><p></p></foreignObject></g></g><g id="state-authorities-0-flowchart-C_CHANGE-2" data-look="classic" transform="translate(318, 301.70000076293945)"><rect style="fill:#f59e0b40 !important;stroke:#f59e0b !important;stroke-width:2px !important" x="-96.8046875" y="-43" width="193.609375" height="86"></rect><g style="" transform="translate(-64.8046875, -27)"><rect></rect><foreignObject width="129.609375" height="54"><p><span></span></p><p>UNIT OF CHANGE<br><b>{ Δ entity … }</b><br>covers every field</p><p></p></foreignObject></g></g><g id="state-authorities-0-flowchart-C_TRUTH-1" data-look="classic" transform="translate(468, 98.5)"><rect style="fill:#2563eb40 !important;stroke:#3b82f6 !important;stroke-width:2px !important" x="-132" y="-52" width="264" height="104"></rect><g style="" transform="translate(-100, -36)"><rect></rect><foreignObject width="200" height="72"><p><span></span></p><p>SOURCE OF TRUTH<br><b>entity list</b><br>rules · plugins · globals — all of it</p><p></p></foreignObject></g></g><g id="state-authorities-0-flowchart-C_DISK-3" data-look="classic" transform="translate(318, 455.70000076293945)"><rect style="fill:#8b5cf640 !important;stroke:#8b5cf6 !important;stroke-width:2px !important" x="-89.6015625" y="-34" width="179.203125" height="68"></rect><g style="" transform="translate(-57.6015625, -18)"><rect></rect><foreignObject width="115.203125" height="36"><p><span></span></p><p>ON DISK · <b>.dem</b><br>all of the state</p><p></p></foreignObject></g></g><g id="state-authorities-0-flowchart-C_REPLAY-4" data-look="classic" transform="translate(318, 600.7000007629395)"><rect style="fill:#22c55e40 !important;stroke:#22c55e !important;stroke-width:2px !important" x="-104" y="-34" width="208" height="68"></rect><g style="" transform="translate(-72, -18)"><rect></rect><foreignObject width="144" height="36"><p><span></span></p><p>REPLAY<br><b>seek tick, re-derive</b></p><p></p></foreignObject></g></g><g id="state-authorities-0-flowchart-C_RESULT-5" data-look="classic" transform="translate(318, 754.7000007629395)"><rect style="fill:#22c55e40 !important;stroke:#22c55e !important;stroke-width:2px !important" x="-132" y="-43" width="264" height="86"></rect><g style="" transform="translate(-100, -27)"><rect></rect><foreignObject width="200" height="54"><p><span></span></p><p><b>replay(.dem) == original</b><br>nothing outside left to leak</p><p></p></foreignObject></g></g></g></g></g></g><marker id="state-authorities-0_flowchart-v2-crossEnd__ef4444" viewBox="0 0 11 11" refX="12" refY="5.2" markerUnits="userSpaceOnUse" markerWidth="11" markerHeight="11" orient="auto"><path d="M 1,1 l 9,9 M 10,1 l -9,9" style="stroke-width: 2; stroke-dasharray: 1, 0;" stroke="#ef4444"></path></marker><marker id="state-authorities-0_flowchart-v2-pointEnd__ef4444" viewBox="0 0 10 10" refX="5" refY="5" markerUnits="userSpaceOnUse" markerWidth="8" markerHeight="8" orient="auto"><path d="M 0 0 L 10 5 L 0 10 z" style="stroke-width: 1; stroke-dasharray: 1, 0;" stroke="#ef4444" fill="#ef4444"></path></marker></g><defs><filter id="state-authorities-0-drop-shadow" height="130%" width="130%"><fedropshadow dx="4" dy="4" stdDeviation="0" flood-opacity="0.06" flood-color="#000000"></fedropshadow></filter></defs><defs><filter id="state-authorities-0-drop-shadow-small" height="150%" width="150%"><fedropshadow dx="2" dy="2" stdDeviation="0" flood-opacity="0.06" flood-color="#000000"></fedropshadow></filter></defs><linearGradient id="state-authorities-0-gradient" gradientUnits="objectBoundingBox" x1="0%" y1="0%" x2="100%" y2="0%"><stop offset="0%" stop-color="#2A2A35" stop-opacity="1"></stop><stop offset="100%" stop-color="#44CFFF" stop-opacity="1"></stop></linearGradient></svg></div><figcaption>One authority versus two: everything in Source is an entity delta, so <code>replay(.dem) == original</code>. Pi's journal covers the message tree only, while authoritative state lives outside it—rewind, fork, and resume all lie.</figcaption></figure>

走到这一步，原因可以理解。在每份日志里重复保存系统提示词和 `AGENTS.md` 确实浪费；对模板求哈希、保存变量就能解决。而且，这种状态建模方式在 TypeScript 中并不常见，毕竟它并没有真正的运行时类型。

但结果仍然是两个事实来源：

| 维度 | Source Engine | Pi 式运行框架 |
| --- | --- | --- |
| **事实来源** | 就是 `entity list`。服务端模拟，客户端预测。 | 消息树**加上**待办状态、重试计数、子智能体注册表、流式标志，以及其他持久化层看不见的状态 |
| **Δ 的单位** | `{ Δ entity ... }`，覆盖所有字段，因为每个增量都是实体增量 | `message` / `custom` / `custom_message`，没有引擎负责的状态归约；每个扩展手写推导逻辑 |
| **全局状态** | `CCSGameRules` 是一个单例**实体**，没有特例 | 分成三个层次，其中一个能正常工作 |
| **插件状态** | 插件写实体字段，所以状态默认就能网络同步和回放 | 模块级闭包：`let turnCount = 0`、`new Map()`、`new Set()` |
| **回放** | 加载 `.dem`，跳转到某个 tick，重新推导状态 | 加载 `.jsonl`；叶节点指针移动，其他权威来源却任意重置或保留 |

全局状态那一行尤其有意思。Source 没有会话全局变量，它们只是实体的属性。我们的全局状态却有自己的一套层级：

<figure data-hk="000000010000000000004000010a49"><div data-hk="000000010000000000004000010a500" role="img" aria-label="Decision tree for where a session-global fact lives in omp: journaled tree entries (three blessed types, replays correctly), journalable custom entries (every extension hand-rolls its own derive, roughly fifteen lifecycle bugs), or not journaled at all (AGENTS.md, extension set, tool roster, settings, provider config, MCP servers — cannot branch, cannot rewind)."><svg id="state-globals-0" width="100%" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" style="max-width: 1030px;" viewBox="0 0 1030 625.2000122070312" role="graphics-document document" aria-roledescription="flowchart-v2"><g><marker id="state-globals-0_flowchart-v2-pointEnd" viewBox="0 0 10 10" refX="5" refY="5" markerUnits="userSpaceOnUse" markerWidth="8" markerHeight="8" orient="auto"><path d="M 0 0 L 10 5 L 0 10 z" style="stroke-width: 1; stroke-dasharray: 1, 0;"></path></marker><marker id="state-globals-0_flowchart-v2-pointStart" viewBox="0 0 10 10" refX="4.5" refY="5" markerUnits="userSpaceOnUse" markerWidth="8" markerHeight="8" orient="auto"><path d="M 0 5 L 10 10 L 10 0 z" style="stroke-width: 1; stroke-dasharray: 1, 0;"></path></marker><marker id="state-globals-0_flowchart-v2-pointEnd-margin" viewBox="0 0 11.5 14" refX="11.5" refY="7" markerUnits="userSpaceOnUse" markerWidth="10.5" markerHeight="14" orient="auto"><path d="M 0 0 L 11.5 7 L 0 14 z" style="stroke-width: 0; stroke-dasharray: 1, 0;"></path></marker><marker id="state-globals-0_flowchart-v2-pointStart-margin" viewBox="0 0 11.5 14" refX="1" refY="7" markerUnits="userSpaceOnUse" markerWidth="11.5" markerHeight="14" orient="auto"><polygon points="0,7 11.5,14 11.5,0" style="stroke-width: 0; stroke-dasharray: 1, 0;"></polygon></marker><marker id="state-globals-0_flowchart-v2-circleEnd" viewBox="0 0 10 10" refX="11" refY="5" markerUnits="userSpaceOnUse" markerWidth="11" markerHeight="11" orient="auto"><circle cx="5" cy="5" r="5" style="stroke-width: 1; stroke-dasharray: 1, 0;"></circle></marker><marker id="state-globals-0_flowchart-v2-circleStart" viewBox="0 0 10 10" refX="-1" refY="5" markerUnits="userSpaceOnUse" markerWidth="11" markerHeight="11" orient="auto"><circle cx="5" cy="5" r="5" style="stroke-width: 1; stroke-dasharray: 1, 0;"></circle></marker><marker id="state-globals-0_flowchart-v2-circleEnd-margin" viewBox="0 0 10 10" refY="5" refX="12.25" markerUnits="userSpaceOnUse" markerWidth="14" markerHeight="14" orient="auto"><circle cx="5" cy="5" r="5" style="stroke-width: 0; stroke-dasharray: 1, 0;"></circle></marker><marker id="state-globals-0_flowchart-v2-circleStart-margin" viewBox="0 0 10 10" refX="-2" refY="5" markerUnits="userSpaceOnUse" markerWidth="14" markerHeight="14" orient="auto"><circle cx="5" cy="5" r="5" style="stroke-width: 0; stroke-dasharray: 1, 0;"></circle></marker><marker id="state-globals-0_flowchart-v2-crossEnd" viewBox="0 0 11 11" refX="12" refY="5.2" markerUnits="userSpaceOnUse" markerWidth="11" markerHeight="11" orient="auto"><path d="M 1,1 l 9,9 M 10,1 l -9,9" style="stroke-width: 2; stroke-dasharray: 1, 0;"></path></marker><marker id="state-globals-0_flowchart-v2-crossStart" viewBox="0 0 11 11" refX="-1" refY="5.2" markerUnits="userSpaceOnUse" markerWidth="11" markerHeight="11" orient="auto"><path d="M 1,1 l 9,9 M 10,1 l -9,9" style="stroke-width: 2; stroke-dasharray: 1, 0;"></path></marker><marker id="state-globals-0_flowchart-v2-crossEnd-margin" viewBox="0 0 15 15" refX="17.7" refY="7.5" markerUnits="userSpaceOnUse" markerWidth="12" markerHeight="12" orient="auto"><path d="M 1,1 L 14,14 M 1,14 L 14,1" style="stroke-width: 2.5;"></path></marker><marker id="state-globals-0_flowchart-v2-crossStart-margin" viewBox="0 0 15 15" refX="-3.5" refY="7.5" markerUnits="userSpaceOnUse" markerWidth="12" markerHeight="12" orient="auto"><path d="M 1,1 L 14,14 M 1,14 L 14,1" style="stroke-width: 2.5; stroke-dasharray: 1, 0;"></path></marker><g><g></g><g><path d="M364.442,162.442L140,162.442L140,279.6L140,279.6L140,317.2" id="state-globals-0-L_Q_A_0" style=";" data-edge="true" data-et="edge" data-id="L_Q_A_0" data-points="W3sieCI6MzY0LjQ0MTUyNDM3MzI0NDE0LCJ5IjoxNjIuNDQxNTI0MzczMjQ0MTR9LHsieCI6MTQwLCJ5IjoyNzkuNjAwMDAwMzgxNDY5N30seyJ4IjoxNDAsInkiOjMyMS4yMDAwMDA3NjI5Mzk0NX1d" data-look="classic" marker-end="url(#state-globals-0_flowchart-v2-pointEnd)"></path><path d="M440,238L440,238L440,279.6L440,279.6L440,317.2" id="state-globals-0-L_Q_B_0" style=";" data-edge="true" data-et="edge" data-id="L_Q_B_0" data-points="W3sieCI6NDQwLCJ5IjoyMzh9LHsieCI6NDQwLCJ5IjoyNzkuNjAwMDAwMzgxNDY5N30seyJ4Ijo0NDAsInkiOjMyMS4yMDAwMDA3NjI5Mzk0NX1d" data-look="classic" marker-end="url(#state-globals-0_flowchart-v2-pointEnd)"></path><path d="M515.558,162.442L740,162.442L740,279.6L740,279.6L740,317.2" id="state-globals-0-L_Q_C_0" style=";" data-edge="true" data-et="edge" data-id="L_Q_C_0" data-points="W3sieCI6NTE1LjU1ODQ3NTYyNjc1NTksInkiOjE2Mi40NDE1MjQzNzMyNDQxNH0seyJ4Ijo3NDAsInkiOjI3OS42MDAwMDAzODE0Njk3fSx7IngiOjc0MCwieSI6MzIxLjIwMDAwMDc2MjkzOTQ1fV0=" data-look="classic" marker-end="url(#state-globals-0_flowchart-v2-pointEnd)"></path><path d="M634.828,443.2L590,443.2L590,469.2L590,469.2L590,500.2" id="state-globals-0-L_C_C1_0" style=";" data-edge="true" data-et="edge" data-id="L_C_C1_0" data-points="W3sieCI6NjM0LjgyNzU4NjIwNjg5NjUsInkiOjQ0My4yMDAwMDA3NjI5Mzk0NX0seyJ4Ijo1OTAsInkiOjQ2OS4yMDAwMDA3NjI5Mzk0NX0seyJ4Ijo1OTAsInkiOjUwNC4yMDAwMDA3NjI5Mzk0NX1d" data-look="classic" marker-end="url(#state-globals-0_flowchart-v2-pointEnd)"></path><path d="M845.172,443.2L890,443.2L890,469.2L890,469.2L890,491.2" id="state-globals-0-L_C_C2_0" style=";" data-edge="true" data-et="edge" data-id="L_C_C2_0" data-points="W3sieCI6ODQ1LjE3MjQxMzc5MzEwMzUsInkiOjQ0My4yMDAwMDA3NjI5Mzk0NX0seyJ4Ijo4OTAsInkiOjQ2OS4yMDAwMDA3NjI5Mzk0NX0seyJ4Ijo4OTAsInkiOjQ5NS4yMDAwMDA3NjI5Mzk0NX1d" data-look="classic" marker-end="url(#state-globals-0_flowchart-v2-pointEnd)"></path></g><g><g transform="translate(140, 279.6000003814697)"><g data-id="L_Q_A_0" transform="translate(0, -8.000000953674316)"><g><rect style="" x="-92.015625" y="-0.9999990463256836" width="184.03125" height="18"></rect><text y="-10.1" text-anchor="middle" style=""><tspan x="0" y="-0.1em" dy="1.1em" text-anchor="middle"><tspan font-style="normal" font-weight="normal">journaled</tspan><tspan font-style="normal" font-weight="normal"> as</tspan><tspan font-style="normal" font-weight="normal"> tree</tspan><tspan font-style="normal" font-weight="normal"> entries</tspan></tspan></text></g></g></g><g transform="translate(440, 279.6000003814697)"><g data-id="L_Q_B_0" transform="translate(0, -14.600001335144043)"><g><rect style="" x="-81.2109375" y="-0.9999990463256836" width="162.421875" height="31.200000762939453"></rect><text y="-10.1" text-anchor="middle" style=""><tspan x="0" y="-0.1em" dy="1.1em" text-anchor="middle"><tspan font-style="normal" font-weight="normal">journalable</tspan><tspan font-style="normal" font-weight="normal"> via</tspan><tspan font-style="normal" font-weight="normal"> custom</tspan></tspan><tspan x="0" y="1em" dy="1.1em" text-anchor="middle"><tspan font-style="normal" font-weight="normal">entries</tspan></tspan></text></g></g></g><g transform="translate(740, 279.6000003814697)"><g data-id="L_Q_C_0" transform="translate(0, -8.000000953674316)"><g><rect style="" x="-74.015625" y="-0.9999990463256836" width="148.03125" height="18"></rect><text y="-10.1" text-anchor="middle" style=""><tspan x="0" y="-0.1em" dy="1.1em" text-anchor="middle"><tspan font-style="normal" font-weight="normal">not</tspan><tspan font-style="normal" font-weight="normal"> journaled</tspan><tspan font-style="normal" font-weight="normal"> at</tspan><tspan font-style="normal" font-weight="normal"> all</tspan></tspan></text></g></g></g><g><g data-id="L_C_C1_0" transform="translate(0, 0)"><text y="-10.1" text-anchor="middle"><tspan x="0" y="-0.1em" dy="1.1em" text-anchor="middle"></tspan></text></g></g><g><rect style="stroke: none"></rect></g><g><g data-id="L_C_C2_0" transform="translate(0, 0)"><text y="-10.1" text-anchor="middle"><tspan x="0" y="-0.1em" dy="1.1em" text-anchor="middle"></tspan></text></g></g><g><rect style="stroke: none"></rect></g></g><g><g id="state-globals-0-flowchart-Q-0" data-look="classic" transform="translate(440, 123)"><polygon points="115,0 230,-115 115,-230 0,-115" transform="translate(-114.5, 115)" style="fill:#2563eb40 !important;stroke:#3b82f6 !important;stroke-width:2px !important"></polygon><g style="" transform="translate(-90, -9)"><rect></rect><foreignObject width="180" height="18"><p><span></span></p><p>is this fact in the tree?</p><p></p></foreignObject></g></g><g id="state-globals-0-flowchart-A-2" data-look="classic" transform="translate(140, 382.20000076293945)"><rect style="fill:#22c55e40 !important;stroke:#22c55e !important;stroke-width:2px !important" x="-132" y="-61" width="264" height="122"></rect><g style="" transform="translate(-100, -45)"><rect></rect><foreignObject width="200" height="90"><p><span></span></p><p>A ✓ the blessed ~3<br>model_change · thinking_level_change<br>session_info · label<br>replays correctly</p><p></p></foreignObject></g></g><g id="state-globals-0-flowchart-B-4" data-look="classic" transform="translate(440, 382.20000076293945)"><rect style="fill:#f59e0b40 !important;stroke:#f59e0b !important;stroke-width:2px !important" x="-132" y="-61" width="264" height="122"></rect><g style="" transform="translate(-100, -45)"><rect></rect><foreignObject width="200" height="90"><p><span></span></p><p>B ~ hand-rolled<br>every extension writes its own derive<br>≈15 lifecycle bugs, see below</p><p></p></foreignObject></g></g><g id="state-globals-0-flowchart-C-6" data-look="classic" transform="translate(740, 382.20000076293945)"><rect style="fill:#ef444440 !important;stroke:#ef4444 !important;stroke-width:2px !important" x="-132" y="-61" width="264" height="122"></rect><g style="" transform="translate(-100, -45)"><rect></rect><foreignObject width="200" height="90"><p><span></span></p><p>C ✗ outside history<br>AGENTS.md · extension set · tool roster<br>settings · provider config · MCP servers</p><p></p></foreignObject></g></g><g id="state-globals-0-flowchart-C1-8" data-look="classic" transform="translate(590, 556.2000007629395)"><rect style="fill:#ef444440 !important;stroke:#ef4444 !important;stroke-width:2px !important" x="-132" y="-52" width="264" height="104"></rect><g style="" transform="translate(-100, -36)"><rect></rect><foreignObject width="200" height="72"><p><span></span></p><p>edit AGENTS.md → the replay uses today's copy.<br>the session you recorded is gone.</p><p></p></foreignObject></g></g><g id="state-globals-0-flowchart-C2-10" data-look="classic" transform="translate(890, 556.2000007629395)"><rect style="fill:#ef444440 !important;stroke:#ef4444 !important;stroke-width:2px !important" x="-132" y="-61" width="264" height="122"></rect><g style="" transform="translate(-100, -45)"><rect></rect><foreignObject width="200" height="90"><p><span></span></p><p>header line = (version, id, timestamp, cwd)<br>no parentid → not in the tree →<br>can't branch, can't rewind</p><p></p></foreignObject></g></g></g></g></g><defs><filter id="state-globals-0-drop-shadow" height="130%" width="130%"><fedropshadow dx="4" dy="4" stdDeviation="0" flood-opacity="0.06" flood-color="#000000"></fedropshadow></filter></defs><defs><filter id="state-globals-0-drop-shadow-small" height="150%" width="150%"><fedropshadow dx="2" dy="2" stdDeviation="0" flood-opacity="0.06" flood-color="#000000"></fedropshadow></filter></defs><linearGradient id="state-globals-0-gradient" gradientUnits="objectBoundingBox" x1="0%" y1="0%" x2="100%" y2="0%"><stop offset="0%" stop-color="#2A2A35" stop-opacity="1"></stop><stop offset="100%" stop-color="#44CFFF" stop-opacity="1"></stop></linearGradient></svg></div><figcaption>The three tiers of session globals, one of which works.</figcaption></figure>

Source 的正确性，并非来自精心编写的协调器或出色的文档。它让不可回放的状态*根本无法表示*。**正确性来自这个约束**，而不是寄希望于每位扩展作者都记得注册两个钩子、定义一种更新结构。

### 证据：API 把正确性变成了可选项

我们检查了 Pi 的 78 个官方扩展示例。其中 60 个无状态；17 个有状态的示例里，只有两个是正确的。（译注：原文总数为 78，而上述两类合计为 77，未说明余下一个示例的归类。）

| 示例 | 脱离权威管理的状态 | 用户可见的故障 |
| --- | --- | --- |
| `git-checkpoint.ts` | 检查点引用由临时 `Map` 持有 | `/fork` 执行前，`agent_settled` 已经清空检查点 |
| `plan-mode/index.ts` | 从整个文件而非选中分支恢复计划模式 | 回退后限制仍生效；恢复会话可能让已废弃分支复活 |
| `status-line.ts` | 轮次计数保存在闭包里 | 从第 3 轮回退到第 1 轮后，下一轮显示第 4 轮；恢复会话则从零开始 |
| `dynamic-tools.ts` | 运行中的扩展注册表 | 工具在回退后仍存在，恢复会话后却消失 |
| `snake.ts` | 恢复时扫描了废弃分支 | 废弃分支的存档重新出现 |
| `bookmark.ts` | “最后”按文件顺序定义 | 给废弃分支上用户看不到的助手消息加了书签 |
| `kimi-deferred-tools.ts` | 没有重新推导活跃工具列表 | 回退到发现之前，`Calculator` 仍处于活跃状态 |
| `auto-commit-on-exit.ts` | 关闭事件混淆了进程退出和会话切换 | `/new`、`/resume` 或 `/fork` 会提交工作树 |
| `tic-tac-toe.ts` | 实时写入与恢复读取使用不同条目类型 | 崩溃可能让用户的一步棋消失 |

细节见[附录 A](#appendix-a-state-failures-in-the-official-examples)。重点在于，文档无法修复这样一整类分散的缺陷。引擎需要让状态只能存在于一个地方。

<figure data-hk="000000010000000000004000010a56"><video src="https://stencil.so/blog/harness-playbook/bugs/tic-tac-toe.mp4" width="1000" height="684" autoplay="" loop="" muted="" playsinline=""></video><figcaption><code data-hk="000000010000000000004000010a5700">tic-tac-toe.ts</code>：落下 X，在 O 回应前崩溃，再恢复会话，X 就消失了。实时写入与恢复读取使用了不同的条目类型。</figcaption></figure>

### omp² 的改变：一份物化会话

如果整个会话物化为**一个 DOM** 呢？当然，你也可以使用带序列化的 ECS 系统，或者其他任何表示形式。我主要选择 XML，是因为它让状态非常容易组合、检查和调试。

```jsx
<meta>
   <todo>…</todo>          <!-- persistent components, journal-derived -->
   <jobs>…</jobs>
</meta>
<body>                     <!-- the live chain, entries as elements -->
   <user id="e12">…</user>
   <ai id="e13">…</ai>
   <Read id="e14" status="ok">
      <input path="src/main.rs:1-80"/>
      <result lines="80">…</result>
   </Read>
</body>
<queues>
   <steering>...</steering>
   <prompts>...</prompts>
</queues>
```

它的事件就是属性变更流：

```jsx
: todo.done
event: patch@1
by: e41
data: {"ops":[["set",412,"status","completed"],["set",415,"status","in_progress"]]}
```

树是权威来源，日志保存树的增量变更。运行时对象可以缓存它、为它建立索引，但不能成为第二个保存事实的地方。在日志的任意位置，运行框架都能物化整个会话，因此也能为整个会话生成快照。

### 唯一权威来源带来了什么

状态与会话记录放在同一棵树中后，几个难题就都归结为同一种操作。

**回退就是 DOM diff。** 对当前物化状态和目标状态求差异。一个 `<subagent>` 元素消失了？销毁元素，终止它。出现了一个？创建元素，恢复或启动它。增量本身，就是完整的生命周期待办清单。

> 新增有状态功能，不会给回退、分叉、恢复或复制增加任何调用点。

**提示词成为投影。** 不再需要给每个模板传入一个长达 100 行的状态对象。系统提示词读取的，是与其他部分相同的那棵树：

```jsx
- {{ count(select("todo item[status!=completed]")) }} open items
```

**复制成为订阅。** 应用逻辑和状态推导已经具备了。远程客户端消费补丁流，而不是追踪文件尾部。远程操控端和旁观端不再需要单独的状态传输管线。

**渲染成为投影。** 组件注册表可以根据相同的元素状态，渲染 `Read`、`Bash`、消息或子智能体。流式参数修改 `<input>`，流式输出修改 `<result>`。第七章会把它落成类型化界面，而不是又一个定制渲染器。

### 控制器与参与者

这种分离也让子智能体可以被检查。Pi 的视图直接读取实时会话状态——页脚调用 `sessionManager.getEntries()`——因此，要新增“检查子智能体”，就得把控制器状态穿过 UI 内部层层传递。

让控制器和参与者彻底分离：控制器拥有会话状态；参与者只渲染状态快照及补丁流。TUI、远程客户端和子智能体检查器成为平等的客户端。检查子智能体，只需要把同一个参与者指向子会话的状态。

忠实的状态模型是基础，但如果不可信代码掌控了修改状态的策略，这个基础依然会被破坏。下一章将划定运行时边界。

<a id="the-runtime"></a>

## 运行时

状态一章确立了运行框架认定的事实。运行时一章决定谁能修改它、不可信工作在哪里执行，以及当执行可能持续数小时、流式输出、甚至无视礼貌的停止请求时，“工具调用”究竟意味着什么。

### 沙盒应该执行，而不是决策

从设计边界里的 *Factorio* 场景出发。假设我们克隆 roboomp，让 gpt spark 把所有名字替换成 CodeWhatever，然后凭这套神奇技术向用户收取成千上万的费用。工具由谁运行？当然是 VM。嗯，真这么简单吗？

把执行器放进 VM 后，会发生这些事：

<figure data-hk="000000010000000000004000010a82"><svg data-hk="000000010000000000004000010a8300" viewBox="0 0 1000 560" role="img" aria-label="Hand-drawn sketch titled 'tools are complicated': a trusted driver harness on one side of a trust boundary, an untrusted VM on the other, and four tools — todo, file read/write, image-gen, py-eval — whose state, secrets, and outputs land on conflicting sides once programmatic tool usage enters the picture." font-family="var(--st-font-sketch)"><defs><pattern id="exec-dots" width="22" height="22" patternUnits="userSpaceOnUse"><circle cx="11" cy="11" r="1.1" fill="#2E333C"></circle></pattern></defs><rect width="1000" height="560" fill="#121419"></rect><rect width="1000" height="560" fill="url(#exec-dots)"></rect><text data-hk="000000010000000000004000010a830100" x="305" y="50" font-size="30" fill="#DBD8CF" text-anchor="middle" letter-spacing="2" stroke="#DBD8CF" stroke-width="0.8">TOOLS ARE COMPLICATED</text><path data-hk="000000010000000000004000010a830110" d="M61.5 62.8C207.9 65.3 432.8 60.1 550.6 61.1M60.4 61.8C251.8 59.8 429.8 65.1 548.8 62.8" fill="none" stroke="#DBD8CF" stroke-width="2" stroke-linecap="round"></path><rect data-hk="000000010000000000004000010a83020" x="136.5" y="81.5" width="212" height="79" rx="0" fill="#1A1E25"></rect><path data-hk="000000010000000000004000010a83021" d="M134.1 80.5C220.1 79.1 287.8 83.6 351.3 80.5M132.3 79.2C232.6 78.9 304.1 80.9 349.8 78.9M350.5 77.6C348.3 113.9 350.2 135.2 351.2 161M348.9 78.2C349.9 105.9 349.5 148.2 349.2 163.4M351.6 161.2C252.3 162.6 194.5 163.8 133.8 161.3M351.5 161.6C246.9 161.2 184.3 159.7 133.4 162.4M133.7 162.2C134.1 124 133.4 99.6 136.5 78.2M134.5 163.6C133.5 131.4 134.4 99.6 136.3 79.9" fill="none" stroke="#DBD8CF" stroke-width="1.5" stroke-linecap="round"></path><text data-hk="000000010000000000004000010a83030" x="155" y="131" font-size="26" fill="#DBD8CF">DRIVER</text><g data-hk="000000010000000000004000010a8304" transform="translate(316 125) scale(1.35) translate(-316 -125)"><ellipse data-hk="000000010000000000004000010a830500" cx="316" cy="125" rx="13" ry="13" fill="#1A1E25"></ellipse><path data-hk="000000010000000000004000010a830501" d="M327.2 129.4Q325.6 133.7 320.8 136Q316 138.3 311.5 136.3Q307 134.2 304.7 129.6Q302.5 125 304.4 120.4Q306.4 115.8 311.2 114Q316 112.3 320.8 113.9Q325.7 115.5 327.3 120.3Q328.8 125 327.2 129.4M326.7 129.4Q324.7 133.9 320.4 135.8Q316 137.7 311.1 136.1Q306.3 134.5 304.7 129.7Q303 125 305.3 120.6Q307.5 116.3 311.8 113.7Q316 111.1 320.3 113.1Q324.7 115.1 326.7 120.1Q328.7 125 326.7 129.4" fill="none" stroke="#DBD8CF" stroke-width="1.5" stroke-linecap="round"></path><path data-hk="000000010000000000004000010a830510" d="M320.2 126Q319.5 127.1 317.8 128Q316 128.9 314.8 128.6Q313.5 128.3 312.6 126.7Q311.6 125 312.2 123.3Q312.8 121.5 314.4 120.9Q316 120.3 317.7 120.9Q319.4 121.5 320.2 123.2Q320.9 125 320.2 126M319.7 126.5Q319.1 128 317.5 128.4Q316 128.8 314.3 128.1Q312.7 127.3 312.4 126.1Q312.1 125 312.5 123.4Q312.9 121.9 314.4 121.6Q316 121.4 317.5 121.6Q318.9 121.9 319.7 123.4Q320.4 125 319.7 126.5" fill="none" stroke="#DBD8CF" stroke-width="1.5" stroke-linecap="round"></path><path data-hk="000000010000000000004000010a830520" d="M316.4 121.2C315.7 117.5 316.3 114.3 316.2 113.5M316 120.8C316.5 118 316.2 114.2 315.5 113.2" fill="none" stroke="#DBD8CF" stroke-width="1.5" stroke-linecap="round"></path><path data-hk="000000010000000000004000010a830530" d="M312.3 126.5C309 128.3 307.8 129.4 305.8 131M312.9 126.7C309.2 128.2 307 130.3 305.1 130.7" fill="none" stroke="#DBD8CF" stroke-width="1.5" stroke-linecap="round"></path><path data-hk="000000010000000000004000010a830540" d="M320 127.6C322.1 128.9 324.3 129.9 326.6 130.9M319.8 126.6C323.1 129 323.8 129.6 326.2 131.6" fill="none" stroke="#DBD8CF" stroke-width="1.5" stroke-linecap="round"></path></g><text data-hk="000000010000000000004000010a83060" x="137" y="193" font-size="19" fill="#DBD8CF">trusted harness</text><path data-hk="000000010000000000004000010a83070" d="M499 73.5C498.9 120.1 498 150.3 498.8 167M499.3 72.9C500.6 111.9 501.7 149.2 499.6 167.6" fill="none" stroke="#DBD8CF" stroke-width="4" stroke-linecap="round"></path><text data-hk="000000010000000000004000010a83080" x="500" y="192" font-size="18" fill="#DBD8CF" text-anchor="middle">trust</text><text data-hk="000000010000000000004000010a83090" x="500" y="216" font-size="18" fill="#DBD8CF" text-anchor="middle">boundary</text><path data-hk="000000010000000000004000010a830a100" d="M350.8 123.6Q430.9 111.2 482.4 112.2Q533.9 113.3 574.9 117.5L615.9 121.8M352.9 123.8Q429.9 112 482.5 112.6Q535.2 113.2 574.6 118.1L614 122.9M615.3 122.9C612.1 123.9 607 125.4 604.3 125.8M614.7 123C609.9 124.4 607.1 124.9 604.6 125.9M615.2 123.1C612.2 121.7 608.9 119.1 605.3 117.5M615.2 123.1C610.7 119.7 608.3 118.8 605.9 117.2" fill="none" stroke="#DBD8CF" stroke-width="2.2" stroke-linecap="round"></path><rect data-hk="000000010000000000004000010a830a110" x="621.5" y="79.5" width="157" height="79" rx="0" fill="#1A1E25"></rect><path data-hk="000000010000000000004000010a830a111" d="M620 76.5C676.4 77.1 751.7 75.3 782.2 77M618.1 78.7C691.2 76.8 739.9 76.1 780.6 78.4M780.5 75.1C781.3 107.8 780.3 135.1 779.8 160.6M780.8 77.7C778.7 103.3 778.9 141.6 780.2 162.4M780.6 161.2C728.4 162.1 641.2 158 619.2 160.2M782.4 160.8C699.9 161.1 658.2 159.4 618.9 158.8M619.9 161.8C620.6 133.1 621 94.9 619.9 78.4M619.2 160.7C621.3 131.7 622.2 92.5 618.5 77.4" fill="none" stroke="#DBD8CF" stroke-width="1.5" stroke-linecap="round"></path><text data-hk="000000010000000000004000010a830a120" x="649" y="131" font-size="27" fill="#DBD8CF">VM</text><path data-hk="000000010000000000004000010a830a130" d="M734.8 124.7Q746.2 139.5 755.2 119.8L764.1 100.1M734.4 123.6Q745.1 138.9 753.8 120.2L762.5 101.5" fill="none" stroke="#4ADE80" stroke-width="3.5" stroke-linecap="round"></path><text data-hk="000000010000000000004000010a830a140" x="623" y="191" font-size="17" fill="#DBD8CF">untrusted: code exec,</text><text data-hk="000000010000000000004000010a830a150" x="760" y="215" font-size="17" fill="#DBD8CF">web content</text><text data-hk="000000010000000000004000010a830a160" x="55" y="257" font-size="20" fill="#DBD8CF" stroke="#DBD8CF" stroke-width="0.8">WHERE DOES EACH TOOL LIVE?</text><text data-hk="000000010000000000004000010a830a170" x="60" y="301" font-size="21" fill="#DBD8CF">1) TODO</text><path data-hk="000000010000000000004000010a830a180" d="M719.6 283.5Q519.8 284.8 434.6 284.4Q349.4 284.1 283.1 283.4L216.9 282.8M719.8 283.8Q520.1 284 434.6 283.8Q349.1 283.5 283.5 283.4L218 283.3M217.8 284C222.6 282 226 280.4 227.7 279.4M218 284.2C221.4 282.5 224.5 281.4 228.3 279.3M218 283.9C221.8 285.4 224.3 287 228 288.7M218 284.3C223.2 286.1 225.4 287.6 228 288.5" fill="none" stroke="#DBD8CF" stroke-width="2" stroke-linecap="round"></path><text data-hk="000000010000000000004000010a830a190" x="735" y="291" font-size="19" fill="#DBD8CF">harness state</text><text data-hk="000000010000000000004000010a830a200" x="60" y="347" font-size="21" fill="#DBD8CF">2) FILE R/W</text><path data-hk="000000010000000000004000010a830a210" d="M287.4 330.2Q479.4 331.2 532.5 324.3Q585.5 317.4 652.4 317.4L719.2 317.4M286.1 329.1Q479.5 330.8 532.2 323.8Q584.9 316.9 652.8 317.5L720.6 318.1M719.7 318.3C717 319.8 712.5 321.4 709.7 322.7M720.3 317.8C715.9 319.4 712.7 321 710.3 322.8M719.8 318.3C715.3 315.5 712.1 314.6 709.7 313.7M720.2 317.7C715.3 316.2 713.4 315 710.1 313.6M287.2 330.3C291.4 328.1 294.4 326.6 297.1 325.5M286.8 330.4C290.9 328.3 294.5 326.7 297.1 325.7M287 330.1C291.6 332.1 295 333.9 297.4 334.3M287 329.9C290 331.6 295.1 333.3 296.7 334.3" fill="none" stroke="#DBD8CF" stroke-width="2" stroke-linecap="round"></path><text data-hk="000000010000000000004000010a830a220" x="735" y="338" font-size="19" fill="#DBD8CF">which side?</text><text data-hk="000000010000000000004000010a830a230" x="60" y="394" font-size="21" fill="#DBD8CF">3) IMAGE-GEN</text><g data-hk="000000010000000000004000010a830a24" transform="translate(306 374) scale(-1.35 1.35) translate(-306 -374)"><ellipse data-hk="000000010000000000004000010a830a2500" cx="306" cy="374" rx="5" ry="5" fill="#1A1E25"></ellipse><path data-hk="000000010000000000004000010a830a2501" d="M309.7 375.5Q308.8 377 307.4 377.6Q306 378.3 304.6 378.2Q303.1 378.2 302.1 376.1Q301 374 301.4 371.9Q301.9 369.7 303.9 369.8Q306 369.8 308.1 369.9Q310.3 369.9 310.4 372Q310.6 374 309.7 375.5M310.7 375.7Q309.8 377.4 307.9 378Q306 378.7 304 378.1Q301.9 377.6 300.9 375.8Q299.9 374 301.5 372.3Q303.1 370.6 304.6 370.3Q306 370.1 307.9 370.2Q309.7 370.3 310.6 372.1Q311.6 374 310.7 375.7" fill="none" stroke="#F4644A" stroke-width="1.5" stroke-linecap="round"></path><path data-hk="000000010000000000004000010a830a2510" d="M311.2 378.4C315.8 382.3 322.3 390.5 326.9 392.7M309.2 379.5C316.5 383 321.6 389.6 328.4 393.3" fill="none" stroke="#F4644A" stroke-width="1.5" stroke-linecap="round"></path><path data-hk="000000010000000000004000010a830a2520" d="M319.5 389.4C318.1 391.1 316.4 392.6 315 393.5M318.6 389.1C317.4 391.2 315.3 393.9 314.5 394.2" fill="none" stroke="#F4644A" stroke-width="1.5" stroke-linecap="round"></path><path data-hk="000000010000000000004000010a830a2530" d="M323.7 393.1C322.3 394.6 320.7 397.2 320.4 398.6M324.5 393C322.7 395.3 320.6 397.2 319.8 398.2" fill="none" stroke="#F4644A" stroke-width="1.5" stroke-linecap="round"></path></g><path data-hk="000000010000000000004000010a830a260" d="M449.9 333.7Q517.9 351.4 569.3 358.5Q620.8 365.6 667.9 365.6L715 365.6M449.5 333.8Q519.1 351.7 569.9 358.7Q620.6 365.6 667.9 366.3L715.1 367M714.1 365.7C709.6 367.7 706.5 369.1 704.1 370.1M714 366.1C710.9 367.6 706.8 369.5 704.3 370.3M714.1 366.3C710.8 364.6 707.3 363 704.1 361.8M714.1 365.8C710.1 364.3 707.1 363.4 703.9 361.7" fill="none" stroke="#DBD8CF" stroke-width="2" stroke-linecap="round" stroke-dasharray="6 5"></path><text data-hk="000000010000000000004000010a830a270" x="735" y="385" font-size="19" fill="#DBD8CF">output lands here</text><text data-hk="000000010000000000004000010a830a280" x="60" y="441" font-size="21" fill="#DBD8CF">4) PY-EVAL</text><path data-hk="000000010000000000004000010a830a2900" d="M262.3 440.4Q263.5 428.9 266.1 428.1Q268.7 427.4 273.1 428.2Q277.4 429.1 278.3 431.3L279.2 433.6M262.3 438.8Q261.7 429.6 264.5 428.3Q267.3 426.9 271.8 427.1Q276.2 427.2 277.4 429.6L278.6 432.1" fill="none" stroke="#44CFFF" stroke-width="3.5" stroke-linecap="round"></path><path data-hk="000000010000000000004000010a830a2910" d="M280.6 433.5Q279.4 443 276.1 444.9Q272.8 446.7 269 445.5Q265.2 444.4 264.4 442L263.7 439.5M279.7 433.5Q280.5 441.3 277.4 443.7Q274.2 446.1 269.7 444.5Q265.3 442.9 265.1 440.4L264.9 438" fill="none" stroke="#F5B04A" stroke-width="3.5" stroke-linecap="round"></path><path data-hk="000000010000000000004000010a830a2920" d="M267 429.7Q267.4 430.4 266.7 430.4Q266 430.4 265.1 430.6Q264.2 430.8 264.5 429.9Q264.9 429 264.9 428.3Q264.8 427.5 265.4 427.9Q266 428.2 266.9 428.2Q267.8 428.2 267.1 428.6Q266.5 429 267 429.7M268.1 429.3Q267.7 429.6 266.9 429.8Q266 430.1 265.5 430.2Q265 430.3 264.2 429.7Q263.4 429 264 428.2Q264.6 427.3 265.3 427Q266 426.7 266.9 426.9Q267.8 427.2 268.2 428.1Q268.5 429 268.1 429.3" fill="none" stroke="#121419" stroke-width="2" stroke-linecap="round"></path><path data-hk="000000010000000000004000010a830a2930" d="M276.8 443.3Q276.3 443.5 276.1 444Q276 444.4 275.2 444.2Q274.4 443.9 274.9 443.5Q275.3 443 275.5 442.6Q275.7 442.3 275.8 442.3Q276 442.3 276.5 442.5Q277 442.7 277.2 442.8Q277.3 443 276.8 443.3M276.7 443.4Q276.8 443.7 276.4 443.9Q276 444.1 275.8 443.8Q275.6 443.6 275.4 443.3Q275.3 443 275.3 442.7Q275.3 442.5 275.6 441.6Q276 440.8 276.2 441.7Q276.4 442.6 276.5 442.8Q276.6 443 276.7 443.4" fill="none" stroke="#121419" stroke-width="2" stroke-linecap="round"></path><path data-hk="000000010000000000004000010a830a300" d="M299.1 425.5Q448.8 413.3 522.2 411.6Q595.6 410 657.3 417.9L719 425.9M300.6 426.9Q450.4 412.5 522.8 411.3Q595.2 410 657.4 417.8L719.6 425.5M720.1 425.8C716.6 427 711.4 428 709.7 429.3M720.2 426C715.3 427.4 711.4 428.5 709.6 429.5M719.6 425.7C716.5 424.4 713.1 421.4 710.3 420.6M720 426.1C717 424.7 713.3 422.3 710.7 420.2" fill="none" stroke="#DBD8CF" stroke-width="2" stroke-linecap="round"></path><text data-hk="000000010000000000004000010a830a310" x="735" y="433" font-size="19" fill="#DBD8CF">exec state</text><text data-hk="000000010000000000004000010a830a320" x="374" y="369" font-size="16" fill="#44CFFF" transform="rotate(-1 374 369)">needs secret</text><path data-hk="000000010000000000004000010a830a330" d="M433.2 378.3Q387.5 368.1 360.8 373.4L334 378.6M431.2 378Q387.6 366.2 361 372.4L334.4 378.7M334.8 379.1C339.4 376.2 342.1 373.8 343.8 372.4M334.9 379.1C338.7 376.2 341.3 374.3 343.5 372.3M334.7 379.3C340 379.9 342.3 380.6 345.6 381.4M335.1 379C339.3 380.2 342.2 380.3 345.6 381.3" fill="none" stroke="#44CFFF" stroke-width="1.8" stroke-linecap="round"></path><path data-hk="000000010000000000004000010a830a340" d="M438.4 459.4Q383.8 428.7 369 412.8Q354.2 396.9 356.7 383.6Q359.1 370.3 342.6 356.6Q326.1 342.9 293 332.6Q259.8 322.4 232.9 312.7L206 303M437.4 458.1Q384.4 429.5 369.5 413.2Q354.7 397 357.3 383.9Q359.8 370.8 342 357.5Q324.2 344.3 291.6 333.4Q259.1 322.5 231.4 311.9L203.7 301.2M204.7 301.9C209.5 301.4 214.3 301.4 216.2 301.2M205.2 301.8C208.7 302.3 213.1 301.8 216.2 301.6M205.1 301.9C209 305.5 210.5 307.2 212.5 309.7M204.9 302.3C207.8 304.5 210.5 307.6 212.8 309.8" fill="none" stroke="#F4644A" stroke-width="2.4" stroke-linecap="round"></path><path data-hk="000000010000000000004000010a830a350" d="M560.8 458.5Q629.3 419.9 671.2 399.8L713.2 379.8M561 458.4Q630.1 420.6 672.2 401.2L714.3 381.8M713.9 380.9C711 385 709 387.3 706.5 389.1M714.2 380.7C711.5 384 709.3 387.1 706.8 389.3M714.3 380.9C709.4 381 704.8 380.9 702.8 381.4M714.1 381.3C709 381.3 704.9 381.1 702.8 381.2" fill="none" stroke="#F4644A" stroke-width="2.4" stroke-linecap="round"></path><text data-hk="000000010000000000004000010a830a360" x="500" y="486" font-size="17" fill="#F4644A" text-anchor="middle" stroke="#F4644A" stroke-width="0.8">PROGRAMMATIC</text><text data-hk="000000010000000000004000010a830a370" x="500" y="518" font-size="17" fill="#F4644A" text-anchor="middle" stroke="#F4644A" stroke-width="0.8">TOOL USAGE</text><text data-hk="000000010000000000004000010a830a380" x="725" y="509" font-size="20" fill="#F4644A" stroke="#F4644A" stroke-width="0.8">CONFLICT!</text><path data-hk="000000010000000000004000010a830a390" d="M887.1 454.6Q897.4 460.8 899.2 466.6Q901.1 472.4 898 478Q894.9 483.6 892.5 487.5Q890 491.5 893.5 496.3Q896.9 501.2 899.1 509.1Q901.2 516.9 897.9 523Q894.6 529 890.2 530.7L885.8 532.4M887.1 455.7Q896.3 460.5 898.2 466.3Q900 472.1 897.3 478.1Q894.6 484 892.5 488.1Q890.4 492.2 894.6 496.3Q898.8 500.4 898.9 508.6Q899.1 516.7 896.9 523.3Q894.7 529.8 890.1 531.4L885.4 533.1" fill="none" stroke="#F4644A" stroke-width="3" stroke-linecap="round"></path><text data-hk="000000010000000000004000010a830a400" x="918" y="516" font-size="28" fill="#F4644A" stroke="#F4644A" stroke-width="0.8">?</text></svg></figure>

嗯，这行不通。因为：

- 程序化使用工具，需要访问所有工具；我们不能任意拆开操作运行框架状态的工具和操作环境状态的工具。
- 我们得构建双向网关，让 VM 能调用主机工具；这会：
  1. 违背初衷——要么给 DoS 开绿灯，要么对自家 VM 的某些操作做限流。
  2. 让事情更复杂。谢谢，不必了。

好吧，那把驱动应用也放进 VM！

<figure data-hk="000000010000000000004000010a87"><svg data-hk="000000010000000000004000010a8800" viewBox="0 0 1000 560" role="img" aria-label="Hand-drawn sketch titled 'what if the driver lives in the VM?': the driver, app source, and prompts sit inside the untrusted VM behind an LLM gateway proxy; connection errors and OOM kills are indistinguishable from outside, and app source leaks out to whoever prompts it. Caption: moved the boundary, kept the pain." font-family="var(--st-font-sketch)"><defs><pattern id="drv-dots" width="22" height="22" patternUnits="userSpaceOnUse"><circle cx="11" cy="11" r="1.1" fill="#2E333C"></circle></pattern></defs><rect width="1000" height="560" fill="#121419"></rect><rect width="1000" height="560" fill="url(#drv-dots)"></rect><text data-hk="000000010000000000004000010a880100" x="500" y="55" font-size="29" fill="#DBD8CF" text-anchor="middle" letter-spacing="2" stroke="#DBD8CF" stroke-width="0.8">WHAT IF THE DRIVER LIVES IN THE VM?</text><path data-hk="000000010000000000004000010a880110" d="M110.9 66.4C413.8 68.1 672.5 68.2 889.4 67M111.1 67.9C383.9 69.5 720.9 67.1 890.9 67.2" fill="none" stroke="#DBD8CF" stroke-width="2" stroke-linecap="round"></path><rect data-hk="000000010000000000004000010a88020" x="316.5" y="117.5" width="452" height="267" rx="26" fill="transparent"></rect><path data-hk="000000010000000000004000010a88021" d="M342 116C528.5 116.4 676.4 114.1 744.9 115.1M341.8 116.5C475.7 116.8 677.2 116.8 745.3 114.8M769.2 142.4C767.3 229.7 771.9 313.9 769.5 359.6M770.8 141.3C767.7 232.2 772.6 313.3 769.1 360.9M743.2 387.3C591.9 389.8 408.6 385.3 340.7 386.2M744.6 385.9C561.9 387.2 408.7 385.9 342.4 387M314.2 360C318.2 259.7 312.1 197.9 315.8 141.7M315.7 359.8C316.2 289.2 313.8 178.7 313.6 143.1M744.8 115Q769.3 115.9 768.7 142.7M769.3 359.4Q770.7 386.2 743.5 386.2M341.1 385.3Q314.2 387 314.4 360.6M313.9 140.7Q315.6 115.5 342 115.4" fill="none" stroke="#F4644A" stroke-width="2" stroke-linecap="round"></path><text data-hk="000000010000000000004000010a88030" x="543" y="154" font-size="28" fill="#DBD8CF" text-anchor="middle" stroke="#DBD8CF" stroke-width="0.8">VM (untrusted)</text><rect data-hk="000000010000000000004000010a88040" x="391.5" y="196.5" width="197" height="142" rx="8" fill="#1A1E25"></rect><path data-hk="000000010000000000004000010a88041" d="M396.6 195.4C469.6 195.9 529.1 194 582.9 196.1M398.9 194.6C464.9 196.7 549 196.8 581.3 194.2M589.9 202.7C591.8 243.4 588.1 292.8 588.6 331.8M591.1 202C592.1 262.1 587.7 306.3 589 330.6M581.7 341.3C515.2 340.1 456.9 340.7 398.8 340.2M580.7 339.3C494.5 340.9 458.7 338 398.4 338.9M391.3 332.2C389.5 273.7 388.4 231.7 390.8 204.1M390.2 333.1C389.2 281.1 387.5 226.1 390 203.2M583.4 195.9Q589.2 196.5 590.9 204.4M590.5 330.6Q588.8 340.8 580.6 339.8M398.5 341Q390 340.1 390.5 332.3M388.6 202.9Q389.3 193.6 396.7 194.1" fill="none" stroke="#DBD8CF" stroke-width="1.5" stroke-linecap="round"></path><text data-hk="000000010000000000004000010a88050" x="490" y="230" font-size="25" fill="#DBD8CF" text-anchor="middle" stroke="#DBD8CF" stroke-width="0.8">DRIVER</text><ellipse data-hk="000000010000000000004000010a880600" cx="560" cy="213" rx="1.6" ry="1.6" fill="#DBD8CF"></ellipse><path data-hk="000000010000000000004000010a880601" d="M561.1 213.9Q561.6 214.8 560.8 214.2Q560 213.6 559.2 213.8Q558.4 214 558.1 213.5Q557.8 213 558.2 212.4Q558.7 211.7 559.3 211.2Q560 210.7 560.7 211.3Q561.5 212 561.1 212.5Q560.7 213 561.1 213.9M560.8 213.7Q560.7 214.3 560.4 214.8Q560 215.3 559.8 214.9Q559.6 214.5 559.2 213.8Q558.9 213 559.2 212.1Q559.6 211.2 559.8 211.7Q560 212.3 560.3 212.3Q560.6 212.3 560.8 212.6Q561 213 560.8 213.7" fill="none" stroke="#DBD8CF" stroke-width="1.5" stroke-linecap="round"></path><ellipse data-hk="000000010000000000004000010a880610" cx="572" cy="213" rx="1.6" ry="1.6" fill="#DBD8CF"></ellipse><path data-hk="000000010000000000004000010a880611" d="M573.6 213.7Q573.1 214.4 572.6 214.5Q572 214.6 571.7 214.2Q571.4 213.7 571.3 213.4Q571.1 213 571 212.7Q570.9 212.4 571.4 211.5Q572 210.6 572.6 211.2Q573.3 211.8 573.7 212.4Q574.1 213 573.6 213.7M573.8 213.7Q573.9 214.4 573 214.3Q572 214.3 571.7 214.3Q571.4 214.3 571 213.6Q570.6 213 571.1 212.6Q571.5 212.2 571.8 212.1Q572 212.1 573 211.9Q573.9 211.8 573.8 212.4Q573.8 213 573.8 213.7" fill="none" stroke="#DBD8CF" stroke-width="1.5" stroke-linecap="round"></path><path data-hk="000000010000000000004000010a880620" d="M558 223.6Q565.6 219 569.4 222L573.2 225M559.4 225.6Q567.1 221.5 569.5 223.5L571.9 225.5" fill="none" stroke="#DBD8CF" stroke-width="1.5" stroke-linecap="round"></path><g data-hk="000000010000000000004000010a8807" transform="translate(426 269) scale(1.35) translate(-426 -269)"><ellipse data-hk="000000010000000000004000010a880800" cx="426" cy="269" rx="13" ry="13" fill="#1A1E25"></ellipse><path data-hk="000000010000000000004000010a880801" d="M436.8 273.7Q435 278.4 430.5 279.8Q426 281.1 421.7 280Q417.3 278.9 415.5 273.9Q413.7 269 414.9 264.7Q416.1 260.3 421 258.5Q426 256.8 430.8 258.2Q435.6 259.7 437.1 264.4Q438.6 269 436.8 273.7M437 273.5Q434.6 277.9 430.3 279.9Q426 281.8 421.4 280.2Q416.8 278.6 415.4 273.8Q414 269 415.5 264.5Q417 260 421.5 257.7Q426 255.4 430.3 257.7Q434.6 260 437 264.5Q439.4 269 437 273.5" fill="none" stroke="#DBD8CF" stroke-width="1.5" stroke-linecap="round"></path><path data-hk="000000010000000000004000010a880810" d="M429.8 270.7Q428.5 272.3 427.3 272.8Q426 273.3 424.4 272.7Q422.8 272.1 422.1 270.6Q421.3 269 422.1 267.3Q422.9 265.6 424.5 265.7Q426 265.9 427.6 265.7Q429.2 265.6 430.1 267.3Q431.1 269 429.8 270.7M429.4 270.5Q429.1 272 427.5 272.4Q426 272.7 424.4 272.4Q422.9 272 422.6 270.5Q422.3 269 422.7 267.2Q423.2 265.5 424.6 265.3Q426 265.1 427.7 265.4Q429.4 265.6 429.6 267.3Q429.8 269 429.4 270.5" fill="none" stroke="#DBD8CF" stroke-width="1.5" stroke-linecap="round"></path><path data-hk="000000010000000000004000010a880820" d="M426 264.9C426.1 260.8 425.4 259.4 426.4 256.5M425.8 264.6C426.8 262.5 425.9 258.3 426.5 257.2" fill="none" stroke="#DBD8CF" stroke-width="1.5" stroke-linecap="round"></path><path data-hk="000000010000000000004000010a880830" d="M422.9 270.5C419.3 273.1 417.1 273.8 415.7 275.2M423.1 270.5C419.1 272.8 418.3 273.8 415.6 275" fill="none" stroke="#DBD8CF" stroke-width="1.5" stroke-linecap="round"></path><path data-hk="000000010000000000004000010a880840" d="M429.2 270.5C432.1 272.6 435.3 274.5 436.9 274.7M429.2 271.3C432.4 273.2 434.6 274.5 436.3 274.8" fill="none" stroke="#DBD8CF" stroke-width="1.5" stroke-linecap="round"></path></g><g data-hk="000000010000000000004000010a8809" transform="translate(474 280) scale(1.45) translate(-474 -280)"><path data-hk="000000010000000000004000010a880a1000" d="M464.8 282.6Q465 275 468.1 272.8Q471.2 270.6 474.7 270.6Q478.2 270.6 479.4 273.3L480.6 276M464.7 283.9Q464 274.6 466.8 271.7Q469.6 268.8 473.7 270.8Q477.7 272.9 480.1 274.9L482.5 276.9" fill="none" stroke="#44CFFF" stroke-width="3.5" stroke-linecap="round"></path><path data-hk="000000010000000000004000010a880a1010" d="M483.7 278.1Q484.1 285.9 479.9 288.3Q475.8 290.7 472.2 288.8Q468.5 287 467.5 284.2L466.5 281.5M481.9 275.8Q483.6 284.8 480.5 287.1Q477.4 289.4 473 288.9Q468.6 288.4 468.5 285.1L468.4 281.8" fill="none" stroke="#F5B04A" stroke-width="3.5" stroke-linecap="round"></path><path data-hk="000000010000000000004000010a880a1020" d="M470.2 273.2Q470.7 273.5 469.9 274.3Q469 275.1 468.6 274.7Q468.3 274.3 467.8 273.7Q467.4 273 468 272.2Q468.7 271.3 468.9 271.9Q469 272.5 469.6 272.5Q470.3 272.5 469.9 272.8Q469.6 273 470.2 273.2M470 273.8Q469.3 274.6 469.1 274.8Q469 275 468.5 274.3Q468 273.6 467.7 273.3Q467.5 273 467.6 272.2Q467.7 271.5 468.4 271.4Q469 271.3 469.4 271.5Q469.7 271.7 470.2 272.4Q470.7 273 470 273.8" fill="none" stroke="#121419" stroke-width="2" stroke-linecap="round"></path><path data-hk="000000010000000000004000010a880a1030" d="M480.2 287.2Q479.9 287.5 479.5 287.8Q479 288.2 478.7 288Q478.4 287.7 477.8 287.4Q477.2 287 477.3 286.1Q477.4 285.3 478.2 285Q479 284.7 479.5 285Q479.9 285.2 480.2 286.1Q480.6 287 480.2 287.2M480.8 287.2Q480.1 287.3 479.5 287.9Q479 288.5 478.3 288.3Q477.7 288.2 477.3 287.6Q476.9 287 477.2 286.3Q477.4 285.5 478.2 286Q479 286.5 479.6 285.9Q480.2 285.4 480.8 286.2Q481.5 287 480.8 287.2" fill="none" stroke="#121419" stroke-width="2" stroke-linecap="round"></path></g><polygon data-hk="000000010000000000004000010a880a1100" points="530,244 559,244 568,253 568,292 530,292" fill="#1A1E25"></polygon><path data-hk="000000010000000000004000010a880a1101" d="M530.3 291.8C530.1 275 529.5 253.4 531.1 243.6M529.9 292.5C531.8 267.4 529.9 255.5 529.3 244.5M530.1 243.7C538.2 242.8 554.4 244.1 559.6 243.3M529.6 243.1C540 242.8 553.3 244.9 558.8 243M559.7 244.9C562.6 247 567 252.2 568.8 253M558.6 243.9C563.6 247.2 566.9 251.7 567.9 252.6M567.2 252.7C569.7 270.8 568.3 284.5 568.3 291.7M568.8 252C568.9 264.5 567.1 282.5 567.3 293.1M567.3 291.1C550.9 293.5 540 291.3 529 292.7M567.9 291.5C556.9 291.6 543.2 291.9 531.1 291.6" fill="none" stroke="#DBD8CF" stroke-width="1.5" stroke-linecap="round"></path><path data-hk="000000010000000000004000010a880a1110" d="M558.6 243.4C558.7 247.4 558.9 250.6 559 253.4M559.5 244.4C558.3 247.2 558.5 250.8 558.8 253.6" fill="none" stroke="#DBD8CF" stroke-width="1.5" stroke-linecap="round"></path><path data-hk="000000010000000000004000010a880a1120" d="M559.2 253.3C562.4 252.5 566.2 252.5 568.1 252.8M558.7 252.4C561.9 253.7 566 252.8 568 253.4" fill="none" stroke="#DBD8CF" stroke-width="1.5" stroke-linecap="round"></path><path data-hk="000000010000000000004000010a880a1130" d="M536.2 261.9C548.1 261.5 554.7 262.3 559.8 260.9M538.5 261.6C545 263.3 557.9 263.2 560.6 262.9" fill="none" stroke="#DBD8CF" stroke-width="1.5" stroke-linecap="round"></path><path data-hk="000000010000000000004000010a880a1140" d="M535.8 268.7C549.3 271.8 555.1 271.7 559.7 270.4M538.1 269.7C545.9 270.6 555.8 271.8 561.5 269.6" fill="none" stroke="#DBD8CF" stroke-width="1.5" stroke-linecap="round"></path><path data-hk="000000010000000000004000010a880a1150" d="M537.5 278.9C543.2 278.9 556.8 277.1 561.1 276.8M537.3 277.8C549 278.4 555.2 278.6 562.2 277.3" fill="none" stroke="#DBD8CF" stroke-width="1.5" stroke-linecap="round"></path><path data-hk="000000010000000000004000010a880a1160" d="M536.1 285C545.7 286.7 550 286 556.8 284.7M537.3 285.5C546.1 285.6 550.3 286.9 555.6 285.3" fill="none" stroke="#DBD8CF" stroke-width="1.5" stroke-linecap="round"></path><rect data-hk="000000010000000000004000010a880a120" x="403.5" y="299.5" width="173" height="51" rx="8" fill="#262B33"></rect><path data-hk="000000010000000000004000010a880a121" d="M409.6 298.5C470.1 296.9 535.8 300.1 568.5 297M409.1 297.3C480.6 298.7 534 297.6 570.6 297M578.5 307C578.7 321.6 577.1 335.2 577.5 344.9M578.1 304.8C579.4 321.4 578.6 336 579.3 342.8M569.1 351.5C520 350.5 463.1 350.8 409.2 352.2M570.3 352.1C499.9 352.4 450.2 354 408.6 352.4M402.7 343.7C401 325.9 403.7 317.4 401.7 307.2M400.7 344.3C400.4 327.7 400.6 317.2 401.1 307.1M570.8 296.7Q578.1 296.8 578.2 306.9M577.2 344.6Q577.2 352.5 570.3 351.8M411.3 351.1Q401.3 352.5 401.6 344.1M402.9 307.4Q401.9 297.1 408.8 296.8" fill="none" stroke="#9AA2AD" stroke-width="2" stroke-linecap="round"></path><text data-hk="000000010000000000004000010a880a130" x="490" y="322" font-size="18" fill="#DBD8CF" text-anchor="middle" stroke="#DBD8CF" stroke-width="0.8"><tspan data-hk="000000010000000000004000010a880a131" x="490">app source +</tspan><tspan data-hk="000000010000000000004000010a880a132" x="490" dy="21">prompts</tspan></text><text data-hk="000000010000000000004000010a880a140" x="157" y="132" font-size="20" fill="#DBD8CF" text-anchor="middle" stroke="#DBD8CF" stroke-width="0.8" transform="rotate(-1 157 132)"><tspan data-hk="000000010000000000004000010a880a141" x="157">now you have</tspan><tspan data-hk="000000010000000000004000010a880a142" x="157" dy="25">to build &amp; host</tspan><tspan data-hk="000000010000000000004000010a880a143" x="157" dy="25">THIS</tspan></text><rect data-hk="000000010000000000004000010a880a150" x="60.5" y="206.5" width="148" height="102" rx="7" fill="#1A1E25"></rect><path data-hk="000000010000000000004000010a880a151" d="M67.1 203.8C117.1 202.9 163.4 204.4 203.6 203.5M65.6 205.8C123.4 207 182.2 204.1 204.2 204M211 212.5C209.4 251.9 208.4 284.8 210.9 302.9M208.5 210.7C207.9 252.5 210.6 286.3 210.4 302.1M204 309.6C160.1 309.2 89.5 309.2 65.2 310.1M201.9 310.7C140.7 310.3 92.2 311.7 64.7 310.9M58.3 301.9C59.3 257.8 58.4 232.9 57.9 212.3M60.3 303.4C60.8 271.2 58.6 242.4 60.2 211.8M203.4 205.1Q211 205.6 211.3 213.3M210.9 302.6Q209.2 308.9 203.5 310.8M67.3 308.9Q60.3 310.8 57.8 303.2M57.9 211.7Q59.3 204.8 65 203.6" fill="none" stroke="#DBD8CF" stroke-width="1.5" stroke-linecap="round"></path><text data-hk="000000010000000000004000010a880a160" x="134" y="238" font-size="24" fill="#DBD8CF" text-anchor="middle" stroke="#DBD8CF" stroke-width="0.8"><tspan data-hk="000000010000000000004000010a880a161" x="134">LLM</tspan><tspan data-hk="000000010000000000004000010a880a162" x="134" dy="31">GATEWAY</tspan></text><path data-hk="000000010000000000004000010a880a1700" d="M191.4 196Q190.8 186.1 194.6 184.2Q198.3 182.3 201.2 184Q204 185.7 204.6 189.9L205.2 194.1M192 194.2Q192.4 187.1 195 185.1Q197.7 183 201.1 184.3Q204.5 185.6 204.5 190L204.5 194.4" fill="none" stroke="#DBD8CF" stroke-width="1.5" stroke-linecap="round"></path><polygon data-hk="000000010000000000004000010a880a1710" points="185,195 211,195 211,211 185,211" fill="#1A1E25"></polygon><path data-hk="000000010000000000004000010a880a1711" d="M185.3 211.2C185.1 204.5 184.8 200.2 184.5 195.3M184.6 212.1C185.1 204.8 185.7 200.3 184.7 195.8M184.6 195.1C196.6 195.5 205.4 194.3 212 195.3M184.2 193.9C197.1 195.6 203.1 195.6 211.9 194M211.6 195.5C211 201.8 211.4 207 210.7 211.2M210.2 195.6C210.5 200.8 211.3 207.4 210.9 211M210.2 211.6C200.8 211.3 189.7 211.5 185.4 210.8M211.6 211.6C199.1 211.9 194 211.9 185 212.1" fill="none" stroke="#DBD8CF" stroke-width="1.5" stroke-linecap="round"></path><ellipse data-hk="000000010000000000004000010a880a1800" cx="94" cy="276" rx="5" ry="5" fill="#1A1E25"></ellipse><path data-hk="000000010000000000004000010a880a1801" d="M98.1 277.7Q98 279.3 96 279.7Q94 280.1 92.2 280.2Q90.3 280.2 89.1 278.1Q88 276 89 274.6Q90.1 273.2 92 271.8Q94 270.5 95.9 271.5Q97.7 272.5 98 274.3Q98.3 276 98.1 277.7M98.2 277.4Q98.1 278.8 96.1 279.6Q94 280.4 92.1 279.7Q90.2 279 89.6 277.5Q89 276 89.6 273.9Q90.1 271.7 92 271.6Q94 271.5 95.9 272.1Q97.8 272.7 98 274.4Q98.2 276 98.2 277.4" fill="none" stroke="#DBD8CF" stroke-width="1.5" stroke-linecap="round"></path><path data-hk="000000010000000000004000010a880a1810" d="M97.9 280.9C104.5 285.1 109.5 291.1 113.7 295.2M97.4 279.4C104.9 288.5 111.3 290 113.7 295.2" fill="none" stroke="#DBD8CF" stroke-width="1.5" stroke-linecap="round"></path><path data-hk="000000010000000000004000010a880a1820" d="M107.1 291.5C105 294.3 103.8 294.5 102.7 295.5M107.2 291C105.2 293.2 103.7 294.1 102.8 296.3" fill="none" stroke="#DBD8CF" stroke-width="1.5" stroke-linecap="round"></path><path data-hk="000000010000000000004000010a880a1830" d="M111.8 294.8C110.7 297.8 109.3 298.7 108.5 299.6M111.8 295.5C109.9 296.6 108.7 299.5 107.7 300.4" fill="none" stroke="#DBD8CF" stroke-width="1.5" stroke-linecap="round"></path><path data-hk="000000010000000000004000010a880a190" d="M208.7 253.3Q281.7 215.2 335.6 233L389.5 250.7M210.9 251.8Q280.8 213.4 335.9 232.9L391 252.3M390.1 252.2C385.7 252.5 381.9 252.3 378.7 253M389.7 251.7C386.1 252.3 381.9 252.3 379.4 253M390.2 251.9C386 248.3 383.8 246.2 382.1 244.2M390.2 251.9C386.6 249.5 383.5 246 381.9 244.3" fill="none" stroke="#DBD8CF" stroke-width="2" stroke-linecap="round"></path><path data-hk="000000010000000000004000010a880a200" d="M244.6 317.8Q270.2 290.3 268.2 268L266.1 245.8M244.5 318.5Q269.8 290.4 269 268.1L268.3 245.7M266.8 247.2C268.8 251.2 271.1 255.2 272 256.5M266.7 246.7C268.6 250 270.1 253.6 272 256.7M266.9 247.3C265.9 250 264 254.6 263.1 257.5M267.2 247.1C265.2 251.6 263.8 254.9 263.2 257.4" fill="none" stroke="#DBD8CF" stroke-width="1.8" stroke-linecap="round"></path><text data-hk="000000010000000000004000010a880a210" x="216" y="343" font-size="21" fill="#DBD8CF" text-anchor="middle" transform="rotate(-1 216 343)"><tspan data-hk="000000010000000000004000010a880a211" x="216">proxy —</tspan><tspan data-hk="000000010000000000004000010a880a212" x="216" dy="27">key stays</tspan><tspan data-hk="000000010000000000004000010a880a213" x="216" dy="27">out here</tspan></text><text data-hk="000000010000000000004000010a880a220" x="600" y="194" font-size="19" fill="#DBD8CF" stroke="#DBD8CF" stroke-width="0.8">(a)</text><polygon data-hk="000000010000000000004000010a880a2300" points="642,200 651,192 660,200 651,210" fill="#1E2A3C"></polygon><path data-hk="000000010000000000004000010a880a2301" d="M650.4 210.2C646.1 204.9 644.2 201.9 640.9 199.2M650.7 210.1C648.5 207.2 645 202.4 641.1 199.9M641.7 198.9C645.6 196.6 649 194.4 650.5 193M641.9 199C644.8 196.5 647.1 193.8 651.3 191.5M650.7 192C655.8 195.8 657.1 197.2 659.6 200.2M649.9 192.2C654.5 196.8 657 199.1 659.9 199.5M659.4 199.5C656.2 202.9 651.9 209.2 650.6 210.3M660.5 200.5C656.9 203.5 652.4 207.5 650.3 210.1" fill="none" stroke="#DBD8CF" stroke-width="1.5" stroke-linecap="round"></path><path data-hk="000000010000000000004000010a880a2310" d="M647.3 195C645.7 192.4 644.3 190.6 642.6 188M647.3 194.8C645.9 192.8 644 189.4 643.2 187.5" fill="none" stroke="#DBD8CF" stroke-width="1.5" stroke-linecap="round"></path><path data-hk="000000010000000000004000010a880a2320" d="M652.8 191.5C651.1 189 651.4 187 650 184.8M653.1 192.2C652 189.3 650.3 186.9 650.6 185.4" fill="none" stroke="#DBD8CF" stroke-width="1.5" stroke-linecap="round"></path><path data-hk="000000010000000000004000010a880a2330" d="M652.3 209.3Q647.8 217.4 649.7 219.4Q651.5 221.4 649.6 225L647.6 228.6M649.7 209.8Q649 216.3 650.5 219Q652 221.8 650.8 225.6L649.6 229.4" fill="none" stroke="#DBD8CF" stroke-width="1.5" stroke-linecap="round"></path><text data-hk="000000010000000000004000010a880a240" x="672" y="204" font-size="19" fill="#DBD8CF" stroke="#DBD8CF" stroke-width="0.8"><tspan data-hk="000000010000000000004000010a880a241" x="672">conn</tspan><tspan data-hk="000000010000000000004000010a880a242" x="672" dy="22">error</tspan></text><path data-hk="000000010000000000004000010a880a250" d="M640.4 218Q619.1 236 604.7 234.3L590.2 232.6M642.3 218.9Q619.2 234.9 604.1 233.1L589 231.3M590 231.7C594.2 230.9 598 229.2 600.3 228.7M589.7 232.3C593.3 231 598.6 229.3 600.6 228.7M589.8 232C593.7 233.7 597.2 236 599.2 237.7M590.2 231.8C594.2 234.5 597.7 236.1 599.3 237.5" fill="none" stroke="#DBD8CF" stroke-width="1.8" stroke-linecap="round"></path><path data-hk="000000010000000000004000010a880a260" d="M727.9 215.6Q752 222.2 759.2 237L766.4 251.8M725.8 216.8Q751.3 221.8 758.3 237.1L765.4 252.5M765.8 251.9C762 248.6 759.6 246.8 758 244.7M766.3 252.3C763.4 249.8 759.6 246 757.5 244.7M765.9 251.7C766 248.2 765.8 244 765.5 240.8M765.8 251.8C765.7 248.2 766.2 244.2 766 241" fill="none" stroke="#DBD8CF" stroke-width="1.8" stroke-linecap="round"></path><g data-hk="000000010000000000004000010a880a27" transform="translate(669 279) scale(.78) translate(-669 -279)"><polygon data-hk="000000010000000000004000010a880a2800" points="637,287 651,283 641,267 659,274 661,250 672,267 683,245 687,269 708,262 697,280 712,288 692,292 698,310 678,300 670,318 662,299 645,308 651,293" fill="#4A2A10"></polygon><path data-hk="000000010000000000004000010a880a2801" d="M651.1 292.8C644.5 290.2 640.6 287.7 637.7 287.5M650.9 293.6C644.6 290.5 641.3 288.2 636 286.7M638.1 287.7C642.3 286 647.4 284.4 651.2 283.1M637.9 286.8C644.3 285.4 647 283.6 651.7 283.2M651.6 284C646.6 276.7 642.4 271.2 641.7 267M650.2 283.5C647 275.9 641.6 270.7 640.8 267.5M641.6 266.8C649.7 271 655.1 273 659.7 273M640.9 265.9C646.4 268.7 654 271.5 658.2 275M658.3 273C660.8 263.4 661.2 255.4 661.1 250.9M658.5 273.2C660 267.5 661.5 258.1 660.8 249.7M661.1 249.1C665.1 258 668.8 262.4 670.9 266.2M660 250.9C666.7 257.7 669.4 263.2 672.3 267.5M671.1 266.3C675.2 260.8 680.4 252.2 682.2 244M671.5 267.2C675 260.8 679.3 249.8 683.3 245.8M683.4 244C684.2 254.4 686.8 264.9 687.9 269.5M681.9 245.5C684.8 255 686.1 263.9 686.3 269.9M686.5 270C694.5 264.9 702 263.4 707.8 262.8M687.6 269.3C696.4 264.6 702.7 263.6 708.4 261M707.8 261.4C703.3 270.6 700.2 278.1 696.4 280.7M709 261C703.5 269.3 701 273.2 697.9 280.5M696.1 279.2C703.9 282.1 707.6 285.8 711.6 288.3M697.9 279.2C703.4 283.9 707.5 285.8 711.5 288M711.2 287C704.8 290.7 697.4 291.7 691.7 291.8M712.7 288.4C706 288.4 695 291.9 692 291.4M692.4 292.3C693.7 300.6 695.9 305 699.1 309.8M692.3 291.8C693.6 297.5 697.8 307 697.6 309.5M697.2 308.9C692.7 306.8 682.1 301.4 677.3 301M697 309C687.1 304.4 680.5 302.1 677.4 300.6M677.4 300.3C674.4 307.3 671.1 313.7 669 317.7M678.6 299.7C674.5 307.2 671.3 314.3 669 318.3M670.8 317.8C667.7 310.8 664.8 304.2 662.1 300.1M670.6 318.3C666.2 312.3 663 302.9 662 298.9M661 298.1C654.5 301.3 649.3 304.3 644.4 308.1M661.6 299C655 303.4 650.4 305.3 644 308.4M646 307.4C646.7 302.7 650.2 296 650.5 292.2M645.8 307.3C647.2 301.1 649.1 297.3 651.9 292.3" fill="none" stroke="#F4644A" stroke-width="2" stroke-linecap="round"></path><path data-hk="000000010000000000004000010a880a2810" d="M646.7 249C644.1 245.4 642.6 243.9 641.2 242.1M646.7 249.3C644.5 246.1 642.4 241.2 641.9 239.6" fill="none" stroke="#F5B04A" stroke-width="2" stroke-linecap="round"></path><path data-hk="000000010000000000004000010a880a2820" d="M703.3 252.6C705.7 251.2 710.7 245.7 710.7 244.8M703.6 254.4C706.4 250.3 708.2 247.1 709.3 244.3" fill="none" stroke="#F5B04A" stroke-width="2" stroke-linecap="round"></path></g><text data-hk="000000010000000000004000010a880a290" x="602" y="326" font-size="19" fill="#DBD8CF" stroke="#DBD8CF" stroke-width="0.8">(b)</text><text data-hk="000000010000000000004000010a880a300" x="641" y="328" font-size="19" fill="#DBD8CF" stroke="#DBD8CF" stroke-width="0.8"><tspan data-hk="000000010000000000004000010a880a301" x="641">OOM</tspan><tspan data-hk="000000010000000000004000010a880a302" x="641" dy="22">kamikaze</tspan></text><path data-hk="000000010000000000004000010a880a310" d="M635.1 281.5Q614.7 275.7 602.8 274.7L590.9 273.8M635.7 282.4Q613.3 276.6 601.7 274.7L590.1 272.8M589.7 273.1C593 271.7 597.9 270.5 600.8 270M590.2 272.7C594.6 271.7 597.1 271 600.4 269.6M589.8 272.9C593.7 275.3 597.2 277.4 599.1 278.7M590 272.8C594.2 275.9 596 276.8 599.6 278.5" fill="none" stroke="#DBD8CF" stroke-width="1.8" stroke-linecap="round"></path><path data-hk="000000010000000000004000010a880a320" d="M710.6 291.9Q740.6 285.2 751.4 272.2L762.2 259.2M710.3 289.7Q741.2 284.8 752.3 272.8L763.4 260.8M763.2 260.1C761.8 263.8 760.5 267.4 759.3 270.8M763.2 260.1C761.1 265 760.2 267.4 759.4 270.5M762.8 260.3C759.7 261.3 755.1 262.9 752.8 264.4M762.8 259.8C758.5 261.6 755.7 263.4 752.8 264.4" fill="none" stroke="#DBD8CF" stroke-width="1.8" stroke-linecap="round"></path><path data-hk="000000010000000000004000010a880a3300" d="M761 254Q764.3 245 764.8 250Q765.3 254.9 767.5 250.1Q769.6 245.2 769.7 252.1Q769.8 258.9 773.9 252.8Q778 246.6 776 253.3L774 260.1M761 252.8Q765.1 244.1 764.7 250Q764.2 255.9 767.8 251Q771.4 246.2 770.5 252.2Q769.7 258.2 773.2 252.5Q776.7 246.8 774.7 254.1L772.8 261.5" fill="none" stroke="#DBD8CF" stroke-width="2" stroke-linecap="round"></path><path data-hk="000000010000000000004000010a880a3310" d="M765.2 260.6Q770.9 251.7 770.7 257.8Q770.5 263.9 773.6 258.2L776.8 252.6M765.3 260.3Q770.4 250 770.9 257.1Q771.5 264.1 774.8 259.3L778.2 254.4" fill="none" stroke="#DBD8CF" stroke-width="2" stroke-linecap="round"></path><path data-hk="000000010000000000004000010a880a340" d="M781.2 250.2Q809.6 227.2 823.2 226.5L836.8 225.7M780.5 252Q810.6 226.4 824.8 226L839.1 225.7M838 224.7C834.3 226.7 831.2 228.1 827.8 229.8M837.7 224.9C834.2 226.6 829.9 228.5 828.4 229.9M837.8 224.8C834.9 224 829.2 221.4 828.1 220.8M837.7 225.2C833 222.8 829.6 221.5 827.9 220.9" fill="none" stroke="#DBD8CF" stroke-width="2" stroke-linecap="round"></path><path data-hk="000000010000000000004000010a880a3500" d="M846 208.1Q856.8 188.1 856.4 199.7Q856 211.3 862.9 201.1Q869.8 190.8 868.4 205.2Q867 219.5 875.5 206.6Q884.1 193.6 880.3 209L876.5 224.3M848.4 207.7Q859 188.5 857 199.7Q855 210.8 863.4 200Q871.9 189.1 869.2 204.2Q866.5 219.3 875.1 207.3Q883.6 195.3 880.2 209.3L876.7 223.2" fill="none" stroke="#DBD8CF" stroke-width="2" stroke-linecap="round"></path><path data-hk="000000010000000000004000010a880a3510" d="M858.7 223.2Q871.8 202.3 870.6 215.8Q869.4 229.3 877.3 218.1L885.2 206.8M858.1 222.3Q871.1 203.5 869.8 216Q868.5 228.5 877.2 217.5L885.9 206.4" fill="none" stroke="#DBD8CF" stroke-width="2" stroke-linecap="round"></path><path data-hk="000000010000000000004000010a880a360" d="M846.2 290.7Q815.8 284.1 795.4 274.6L775.1 265M844.8 292.3Q814.8 283.9 795.3 275.3L775.8 266.8M775.9 265.9C780.9 265.7 784 266.1 786.8 265.8M776.4 266.1C781.1 266.2 783.6 265.7 787.3 265.8M775.8 265.7C779.5 269.8 782.2 272.5 783 274.4M776 266.3C779.4 270.6 781.2 273 783.3 274.4" fill="none" stroke="#F4644A" stroke-width="1.8" stroke-linecap="round"></path><text data-hk="000000010000000000004000010a880a370" x="837" y="320" font-size="21" fill="#F4644A" text-anchor="middle" stroke="#F4644A" stroke-width="0.8" transform="rotate(1 837 320)"><tspan data-hk="000000010000000000004000010a880a371" x="837">outside can't tell</tspan><tspan data-hk="000000010000000000004000010a880a372" x="837" dy="25">which!</tspan></text><text data-hk="000000010000000000004000010a880a380" x="945" y="340" font-size="42" fill="#F4644A" text-anchor="middle" stroke="#F4644A" stroke-width="0.8" transform="rotate(2 945 340)">?</text><path data-hk="000000010000000000004000010a880a3900" d="M314.1 419.2Q429.3 417.9 439.1 425.4Q448.9 432.9 448.5 452.4Q448.1 472 439.5 479.9Q431 487.7 448.5 492.8Q466.1 497.8 443.5 492.4Q420.9 487.1 366.8 487.1Q312.8 487.1 303.6 480.5Q294.4 473.8 294.4 454.4Q294.5 434.9 304.8 426.5L315.2 418.1M313.8 418.8Q427.8 419.7 438 426.8Q448.3 433.9 448.5 453.5Q448.7 473.1 439.8 480.6Q430.9 488.1 449.6 493.4Q468.4 498.6 443.5 492.8Q418.6 486.9 367 486.6Q315.3 486.3 304.6 480.3Q293.9 474.4 294 453.6Q294.1 432.9 303.3 425.2L312.5 417.6" fill="none" stroke="#DBD8CF" stroke-width="2" stroke-linecap="round"></path><text data-hk="000000010000000000004000010a880a400" x="369" y="448" font-size="20" fill="#DBD8CF" text-anchor="middle"><tspan data-hk="000000010000000000004000010a880a401" x="369">untrusted</tspan><tspan data-hk="000000010000000000004000010a880a402" x="369" dy="23">prompt</tspan></text><ellipse data-hk="000000010000000000004000010a880a4100" cx="500" cy="464" rx="10" ry="10" fill="#1A1E25"></ellipse><path data-hk="000000010000000000004000010a880a4101" d="M508 467.2Q507 470.4 503.5 472.6Q500 474.9 496.7 473.1Q493.4 471.4 491.6 467.7Q489.9 464 491.8 460.4Q493.7 456.9 496.8 455.5Q500 454.2 503.3 455.3Q506.6 456.4 507.8 460.2Q508.9 464 508 467.2M508.6 467.5Q507.6 471 503.8 472.8Q500 474.6 496.3 472.5Q492.6 470.3 491.4 467.2Q490.2 464 491.6 460.4Q493 456.8 496.5 455.2Q500 453.5 503.6 455.3Q507.2 457.1 508.4 460.6Q509.6 464 508.6 467.5" fill="none" stroke="#DBD8CF" stroke-width="2" stroke-linecap="round"></path><path data-hk="000000010000000000004000010a880a4110" d="M498.8 473.9C499 485.6 499.8 499.5 498.8 513.4M500.5 474.6C500.5 486.4 500.3 500.5 500.7 514.4" fill="none" stroke="#DBD8CF" stroke-width="2" stroke-linecap="round"></path><path data-hk="000000010000000000004000010a880a4120" d="M499.7 488.8C492.1 484.4 486.7 480.6 482.6 477.3M499.9 488.9C494.7 486.4 484.7 479.4 481.3 476.2" fill="none" stroke="#DBD8CF" stroke-width="2" stroke-linecap="round"></path><path data-hk="000000010000000000004000010a880a4130" d="M501.3 490.1C507.3 486.1 511.4 479.8 519.9 474.8M499.2 488.4C506.6 485.2 513.4 479.6 518.7 474.7" fill="none" stroke="#DBD8CF" stroke-width="2" stroke-linecap="round"></path><path data-hk="000000010000000000004000010a880a4140" d="M500.3 514.2C494.2 522.3 487.9 531.9 486.4 537.2M500.1 514.2C491.3 524.4 490.1 532.4 484.3 535.4" fill="none" stroke="#DBD8CF" stroke-width="2" stroke-linecap="round"></path><path data-hk="000000010000000000004000010a880a4150" d="M501.1 515.3C505.7 521.7 509.8 530 516 536.2M500.5 514.8C504.6 521.3 510 528 514.4 537" fill="none" stroke="#DBD8CF" stroke-width="2" stroke-linecap="round"></path><path data-hk="000000010000000000004000010a880a420" d="M480.6 455.1Q451 421.3 448.6 386.2L446.1 351M481 454.3Q453 421.1 449.8 386.5L446.6 351.8M446.1 352.2C448 355.7 450.7 359.8 451.4 361.5M445.7 352C447.8 355.3 449.7 359.5 451.1 361.3M446 352C445 355.2 442.9 359.3 442.7 362.2M446.2 352.1C444.3 355.6 443.7 359.3 442.5 362.2" fill="none" stroke="#DBD8CF" stroke-width="2.2" stroke-linecap="round"></path><path data-hk="000000010000000000004000010a880a430" d="M552.1 351.5Q558 413.8 539.1 439L520.2 464.2M551.4 353Q559.7 413.4 540.4 438.6L521.2 463.7M520.7 465.2C522.5 459.5 523.1 457.7 523.7 454.4M521.3 465.3C521.5 461.1 522.5 456.5 523.8 454.5M520.9 465.3C525.3 462.9 527.1 461.7 530.3 459.4M520.9 465.2C524.5 463.4 528.9 460.5 530.4 459.9" fill="none" stroke="#DBD8CF" stroke-width="2.2" stroke-linecap="round"></path><polygon data-hk="000000010000000000004000010a880a4400" points="576,412 603,412 612,421 612,458 576,458" fill="#1A1E25"></polygon><path data-hk="000000010000000000004000010a880a4401" d="M576.3 457.2C576.7 444.2 574.6 420.3 575.9 412.9M575.1 457.3C577.4 436.2 576.8 423.7 576.7 411M576.7 413C586.4 410.7 597.5 411.2 601.9 411.1M576.9 412.6C586.2 413.4 594.9 411.2 602.8 411.7M603.7 412.1C607.3 415.2 611.3 419.3 611.5 420.5M602.4 412.9C606.5 415.7 610.3 419.2 612.5 421M612.8 421.2C611.2 432.8 613.3 450.8 611 457.1M612.4 421.3C611.5 434.8 613 447.2 611.5 458.3M612.9 458.5C597 458.9 586.4 457.9 575.1 458.8M611.8 458.4C600 458.4 587.2 458.3 576 457.8" fill="none" stroke="#DBD8CF" stroke-width="1.5" stroke-linecap="round"></path><path data-hk="000000010000000000004000010a880a4410" d="M603.3 411.4C602.9 415.7 603.1 419 603.6 420.9M603 412.5C602.9 414.9 602.7 418.3 603.4 421" fill="none" stroke="#DBD8CF" stroke-width="1.5" stroke-linecap="round"></path><path data-hk="000000010000000000004000010a880a4420" d="M602.5 420.4C606.4 421.1 609.5 421.1 612.2 420.6M602.5 421.3C607.2 420.7 609.9 421.3 611.6 421" fill="none" stroke="#DBD8CF" stroke-width="1.5" stroke-linecap="round"></path><path data-hk="000000010000000000004000010a880a4430" d="M584 430.6C590.8 429.8 600.3 429.4 604 428.8M584 429.6C590.5 430.9 601.9 430.3 604.3 429.7" fill="none" stroke="#DBD8CF" stroke-width="1.5" stroke-linecap="round"></path><path data-hk="000000010000000000004000010a880a4440" d="M581.9 437.5C590.7 438.3 600.9 436.6 604.5 439.1M582 438.3C589.3 439.2 600.4 438.4 605.5 438.2" fill="none" stroke="#DBD8CF" stroke-width="1.5" stroke-linecap="round"></path><path data-hk="000000010000000000004000010a880a4450" d="M582.9 445.7C592.3 446.2 598.2 446 604.5 446.1M583.6 445.8C594.2 447.2 599.3 445.8 605.6 446.6" fill="none" stroke="#DBD8CF" stroke-width="1.5" stroke-linecap="round"></path><path data-hk="000000010000000000004000010a880a4460" d="M584.1 453.4C587.2 454.8 597.5 453.9 600 454.6M582.1 454.2C588.6 453.8 593.5 453.4 598.9 454.4" fill="none" stroke="#DBD8CF" stroke-width="1.5" stroke-linecap="round"></path><text data-hk="000000010000000000004000010a880a450" x="626" y="434" font-size="20" fill="#F4644A" stroke="#F4644A" stroke-width="0.8" transform="rotate(1 626 434)"><tspan data-hk="000000010000000000004000010a880a451" x="626">app source</tspan><tspan data-hk="000000010000000000004000010a880a452" x="626" dy="25">leaks out</tspan></text><text data-hk="000000010000000000004000010a880a460" x="752" y="460" font-size="38" fill="#F4644A" stroke="#F4644A" stroke-width="0.8" transform="rotate(2 752 460)">!</text><text data-hk="000000010000000000004000010a880a470" x="768" y="542" font-size="16" fill="#DBD8CF" text-anchor="middle" stroke="#DBD8CF" stroke-width="0.8" transform="rotate(-1 768 542)">moved the boundary, kept the pain</text></svg></figure>

- 现在，应用提示词和内部源码都泄露了。除非把应用移出 VM，通过网络 RPC 连接运行框架，并把会话存储也移出去。
- 可会话存储在外面，就得授予 VM 写入权限，于是又同时回到了问题 1 和问题 2。

解决办法是：在 VM 里只放一个听命行事的桩程序，并且非常谨慎地限制回传数据流的最大体积——你不会想让一次误用的 Read 调用返回 2GB 响应：

<figure data-hk="000000010000000000004000010a91"><svg data-hk="000000010000000000004000010a9200" viewBox="0 0 1000 560" role="img" aria-label="Hand-drawn sketch titled 'the stub stays in, everything else stays out': the trusted host keeps the driver, harness, LLM gateway keys, and session storage; the untrusted VM contains only an executor stub (python plus ripgrep) talking over one typed RPC door, with a read-only git overlay mirror. Caption: minimum viable prisoner." font-family="var(--st-font-sketch)"><defs><pattern id="stub-dots" width="22" height="22" patternUnits="userSpaceOnUse"><circle cx="11" cy="11" r="1.1" fill="#2E333C"></circle></pattern></defs><rect width="1000" height="560" fill="#121419"></rect><rect width="1000" height="560" fill="url(#stub-dots)"></rect><text data-hk="000000010000000000004000010a920100" x="500" y="56" font-size="26" fill="#DBD8CF" text-anchor="middle" letter-spacing="2" stroke="#DBD8CF" stroke-width="0.8">THE STUB STAYS IN, EVERYTHING ELSE STAYS OUT</text><path data-hk="000000010000000000004000010a920110" d="M110.6 68.2C446.7 71.2 700.5 71.8 890.3 67.4M109.2 66.8C405.6 67.1 738.6 71.7 890.1 68.6" fill="none" stroke="#DBD8CF" stroke-width="2" stroke-linecap="round"></path><rect data-hk="000000010000000000004000010a92020" x="71.5" y="101.5" width="357" height="397" rx="0" fill="#1A1E25"></rect><path data-hk="000000010000000000004000010a92021" d="M67.2 99.6C180 98.4 374.5 99.4 432.3 99.2M68.7 99.5C228.5 97.7 375.6 97.3 431.9 99.3M429.5 100.1C430.7 233.3 429.5 410.8 431 499.6M430.5 100.5C429.9 295.4 432 390.9 430.7 501.1M430.8 499.6C265.4 502.2 166.1 499 67.6 498.9M430.4 500.9C293.7 499 165.8 496.8 66.6 501.3M70.9 502.6C68.7 363.8 70.3 231.5 70 99.6M70 501.4C70.1 341.8 67.3 191.7 71.2 98.2" fill="none" stroke="#DBD8CF" stroke-width="1.5" stroke-linecap="round" stroke-dasharray="7 5"></path><text data-hk="000000010000000000004000010a92030" x="95" y="140" font-size="19" fill="#DBD8CF" stroke="#DBD8CF" stroke-width="0.8">HOST</text><text data-hk="000000010000000000004000010a92040" x="172" y="140" font-size="16" fill="#4ADE80">(trusted)</text><path data-hk="000000010000000000004000010a92050" d="M272.7 131Q280 142.6 290.9 128.8L301.7 115M271.6 131.5Q279.6 143.8 291.1 130.4L302.6 117" fill="none" stroke="#4ADE80" stroke-width="3" stroke-linecap="round"></path><rect data-hk="000000010000000000004000010a92060" x="186.5" y="166.5" width="102" height="37" rx="0" fill="#1A1E25"></rect><path data-hk="000000010000000000004000010a92061" d="M185 164.6C238.3 165.7 260.4 162.4 293.3 164.9M184.3 164.3C221.4 164.5 259.8 167.3 292.8 166.1M291.4 163.6C291.2 179.2 290.9 200 289.3 205.9M291.4 164.4C289.9 182.9 287.7 197 290.9 205.6M289.3 205.6C243.7 204.8 213.8 204.3 183.8 205.8M290.8 203.7C256 203.1 214.8 206 183.8 204.1M185.1 205.5C184.9 189.3 184.2 175.6 184.9 163.7M183.9 206.6C183.1 188.1 183.2 172.8 186 164.3" fill="none" stroke="#DBD8CF" stroke-width="1.5" stroke-linecap="round"></path><text data-hk="000000010000000000004000010a92070" x="237" y="190" font-size="15" fill="#DBD8CF" text-anchor="middle">DRIVER</text><ellipse data-hk="000000010000000000004000010a920800" cx="290" cy="165" rx="13" ry="13" fill="#1A1E25"></ellipse><path data-hk="000000010000000000004000010a920801" d="M300.5 169.3Q298.8 173.7 294.4 175.6Q290 177.5 285.6 175.6Q281.1 173.7 279.2 169.3Q277.3 165 279 160.3Q280.8 155.6 285.4 153.4Q290 151.2 294.9 153.4Q299.9 155.5 301.1 160.3Q302.2 165 300.5 169.3M301.3 169.7Q299.3 174.5 294.7 175.9Q290 177.3 285.7 175.5Q281.3 173.7 279.6 169.4Q277.8 165 279.4 160.4Q281.1 155.7 285.5 154.3Q290 152.9 294.6 154.2Q299.3 155.4 301.3 160.2Q303.2 165 301.3 169.7" fill="none" stroke="#DBD8CF" stroke-width="1.5" stroke-linecap="round"></path><path data-hk="000000010000000000004000010a920810" d="M293 166.8Q293.1 168.6 291.5 169.1Q290 169.6 288.2 168.4Q286.4 167.2 286.7 166.1Q287 165 287.2 163.5Q287.5 161.9 288.7 161.6Q290 161.2 291.6 161.8Q293.2 162.4 293.1 163.7Q292.9 165 293 166.8M293.1 166.7Q292.3 168.3 291.1 168.5Q290 168.7 288.3 168.1Q286.6 167.5 286.5 166.3Q286.4 165 287.2 163.6Q287.9 162.3 289 161.2Q290 160.2 291.2 161.4Q292.5 162.6 293.2 163.8Q293.9 165 293.1 166.7" fill="none" stroke="#DBD8CF" stroke-width="1.5" stroke-linecap="round"></path><path data-hk="000000010000000000004000010a920820" d="M289.4 160.8C290.2 158.3 289.9 155 290.4 152.8M289.6 161C290.6 157.9 289.7 154.1 290.4 152.4" fill="none" stroke="#DBD8CF" stroke-width="1.5" stroke-linecap="round"></path><path data-hk="000000010000000000004000010a920830" d="M286.5 166.9C283.2 169 281.4 170.2 279.8 170.4M287.1 166.8C284.2 168.4 280.9 171.1 279 171.5" fill="none" stroke="#DBD8CF" stroke-width="1.5" stroke-linecap="round"></path><path data-hk="000000010000000000004000010a920840" d="M294 166.6C296.4 168.6 297.9 170.1 299.9 171.5M293 167.2C296.3 168.9 298.1 169.5 300.6 171.1" fill="none" stroke="#DBD8CF" stroke-width="1.5" stroke-linecap="round"></path><polygon data-hk="000000010000000000004000010a920900" points="330,237 330,199 335,195 356,195 361,202 402,202 402,237" fill="#1A1E25"></polygon><path data-hk="000000010000000000004000010a920901" d="M401.1 236.9C375.8 236.1 345.6 236.7 329.4 236.7M402.2 237.9C368.7 236.3 345.6 236.8 331 236.2M330.9 237.3C331.5 221.2 328.6 210.6 329 199.3M330.4 237.7C330.2 219.7 330 206.7 330.2 199.3M330.2 199C331.3 197.7 334.1 196.1 335.1 195M330.3 199.2C331.6 198.1 333.5 195.8 335.2 194.9M335.9 193.9C342.4 194.2 351 194.6 355.2 195.8M335.2 194.3C343 195.5 350.2 194.3 355 195.3M355.9 195C357.7 198.1 359.8 199.8 360.9 202.2M356.1 195.2C358.8 198.5 359.9 201 361.1 202.1M361.2 202.3C373.7 201.3 389.4 202.1 401.1 202.2M361.8 201.5C374.7 202.9 390.2 202.7 402.6 202.1M402.4 201.5C403 220 402.7 225.6 402.5 237.4M401.4 202.4C402 217.4 403 225.1 402.4 237.6" fill="none" stroke="#DBD8CF" stroke-width="1.5" stroke-linecap="round"></path><text data-hk="000000010000000000004000010a920910" x="366" y="226" font-size="13.5" fill="#DBD8CF" text-anchor="middle">&lt;git&gt;</text><path data-hk="000000010000000000004000010a920a100" d="M328.8 236.5Q305.9 250.7 298.9 255.2L292 259.6M330.1 237.4Q306.2 250.8 298.5 255.2L290.8 259.6M291.9 260.1C294.4 257.2 296.7 252.9 298.2 250.9M292 259.8C294.8 255.7 296.5 252.7 297.9 251.1M291.8 260.3C296.4 259.8 299.5 258.9 303.2 258.8M291.8 260.2C297 259.5 300.9 259.1 302.6 258.5" fill="none" stroke="#DBD8CF" stroke-width="1.5" stroke-linecap="round"></path><path data-hk="000000010000000000004000010a920a110" d="M180.1 194.6Q149.1 220.5 153.4 235.6Q157.7 250.7 169.3 259.2L180.8 267.7M181 194.6Q150.9 219.1 154.7 234.2Q158.5 249.2 170.8 258L183.1 266.8M182.2 267.9C176.7 266.7 173.8 266 171 265.6M181.8 267.9C177.9 267 174.1 266.3 171.3 265.6M182 268C179.7 264.3 177.8 259.8 176.5 258.3M181.6 267.9C180.3 265.5 178 261.4 176.9 258.1" fill="none" stroke="#DBD8CF" stroke-width="1.5" stroke-linecap="round"></path><rect data-hk="000000010000000000004000010a920a120" x="186.5" y="256.5" width="132" height="41" rx="0" fill="#1A1E25"></rect><path data-hk="000000010000000000004000010a920a121" d="M183.6 255.9C237.9 254.3 299.5 254 319.7 253.9M183.6 254.7C246 255 287.5 253.1 319.5 254.4M319.8 252.4C321 268.6 320.3 283.7 320.8 298M319.7 254.1C320.2 271.2 320.2 285.5 320.1 300.4M320.4 299.5C267.5 301.8 214.7 299.5 184.1 298.6M319.9 298.2C270 301 208.4 299 183.6 298.1M185.3 299.8C183.1 283.5 184.6 267.1 184.3 254.6M186.2 300.1C186.6 277 185.6 270.1 185.7 255.4" fill="none" stroke="#DBD8CF" stroke-width="1.5" stroke-linecap="round"></path><text data-hk="000000010000000000004000010a920a130" x="252" y="283" font-size="16" fill="#DBD8CF" text-anchor="middle">HARNESS</text><ellipse data-hk="000000010000000000004000010a920a1480" cx="320" cy="255" rx="8" ry="8" fill="#1A1E25"></ellipse><path data-hk="000000010000000000004000010a920a1481" d="M326.5 258.1Q325.7 261.3 322.9 262.1Q320 263 316.8 261.7Q313.6 260.4 312.9 257.7Q312.1 255 313.4 252.5Q314.7 249.9 317.4 248.9Q320 247.9 323.1 248.8Q326.2 249.7 326.8 252.3Q327.3 255 326.5 258.1M326.6 257.5Q325 260.1 322.5 262.1Q320 264.1 316.9 262.4Q313.9 260.7 312.6 257.9Q311.4 255 312.5 252.2Q313.6 249.4 316.8 248.2Q320 247.1 322.9 248.1Q325.8 249.1 327 252.1Q328.2 255 326.6 257.5" fill="none" stroke="#DBD8CF" stroke-width="1.5" stroke-linecap="round"></path><path data-hk="000000010000000000004000010a920a1490" d="M322.1 256Q322 257 321 256.7Q320 256.5 319.1 256.6Q318.2 256.8 317.5 255.9Q316.8 255 317.9 254.4Q319 253.9 319.5 253.4Q320 252.9 320.7 253Q321.4 253.2 321.8 254.1Q322.2 255 322.1 256M323 255.6Q322.5 256.1 321.2 256.5Q320 257 318.9 257.1Q317.8 257.3 318.1 256.2Q318.3 255 317.9 253.9Q317.6 252.8 318.8 252.5Q320 252.3 320.8 252.7Q321.6 253.1 322.6 254Q323.5 255 323 255.6" fill="none" stroke="#DBD8CF" stroke-width="1.5" stroke-linecap="round"></path><path data-hk="000000010000000000004000010a920a1400" d="M327.4 257.1C329.2 257.6 330 257.7 331.2 258.9M327.2 257.2C329 257.9 330.4 258.6 332 258.8" fill="none" stroke="#DBD8CF" stroke-width="1.5" stroke-linecap="round"></path><path data-hk="000000010000000000004000010a920a1410" d="M323.4 261.9C324.7 264 324.6 265.3 325.4 266M324.3 262C324.6 263.8 325.7 265.4 325.9 265.7" fill="none" stroke="#DBD8CF" stroke-width="1.5" stroke-linecap="round"></path><path data-hk="000000010000000000004000010a920a1420" d="M317.9 262C316.9 263.9 316.7 265.6 316.6 267M318.2 263.1C317.3 264 316.8 265.7 316 265.9" fill="none" stroke="#DBD8CF" stroke-width="1.5" stroke-linecap="round"></path><path data-hk="000000010000000000004000010a920a1430" d="M312.4 259.3C311.7 260.1 310.4 260.3 309.2 260.6M312.9 258.5C311.2 259.7 311.1 260.1 309.6 260.8" fill="none" stroke="#DBD8CF" stroke-width="1.5" stroke-linecap="round"></path><path data-hk="000000010000000000004000010a920a1440" d="M312.8 252.7C310.6 252.8 309.6 251.9 308.1 251.7M312.4 252.7C310.4 252.8 308.7 251.2 309 251.9" fill="none" stroke="#DBD8CF" stroke-width="1.5" stroke-linecap="round"></path><path data-hk="000000010000000000004000010a920a1450" d="M316.8 248C315.3 245.8 314.8 245.7 313.9 244.4M316.3 248C315.3 247.1 315.4 245.4 314.2 244.8" fill="none" stroke="#DBD8CF" stroke-width="1.5" stroke-linecap="round"></path><path data-hk="000000010000000000004000010a920a1460" d="M321.9 247.1C323.3 245.9 323.2 243.9 324.1 243.8M321.9 247.2C322.9 245.7 323.9 244.8 324 243.8" fill="none" stroke="#DBD8CF" stroke-width="1.5" stroke-linecap="round"></path><path data-hk="000000010000000000004000010a920a1470" d="M327.4 251.4C328.7 250.8 329.9 250.4 331 249.4M326.9 251.3C328.8 251.1 329.8 249.9 330.6 249.5" fill="none" stroke="#DBD8CF" stroke-width="1.5" stroke-linecap="round"></path><path data-hk="000000010000000000004000010a920a150" d="M213 300.1Q177.6 330.9 172 345.5L166.4 360.2M211.2 298.8Q177.8 328.8 171.9 344L166.1 359.3M166.1 359.9C165.6 356 165.6 351.6 165.8 348.9M166.2 359.8C165.8 356.5 165.6 351.6 165.5 349.1M166 360.2C170 356.4 171.5 354.4 173.8 352.3M165.8 360.1C169.6 356.8 171.7 354.4 173.9 352.6" fill="none" stroke="#DBD8CF" stroke-width="1.5" stroke-linecap="round"></path><path data-hk="000000010000000000004000010a920a160" d="M291.2 299Q321.4 328.7 326.7 344L332 359.3M293.2 299.9Q322.8 329.9 327.3 345L331.8 360.2M332 359.8C328.3 356.5 325.9 353.3 324.5 352.2M331.8 360C329.3 357.4 325.9 353.4 324.5 351.6M332.1 360.3C332.6 355.7 332.6 352.5 333.2 348.9M332.3 359.9C332.4 356.1 333 352.2 332.8 349" fill="none" stroke="#DBD8CF" stroke-width="1.5" stroke-linecap="round"></path><rect data-hk="000000010000000000004000010a920a170" x="106.5" y="366.5" width="112" height="49" rx="0" fill="#1A1E25"></rect><path data-hk="000000010000000000004000010a920a171" d="M105.1 364.4C155.1 363 189.7 363.8 220.8 365.8M106 364.6C145.1 364.9 190.6 363.1 219.1 366M221 364.3C217.7 383.6 220.6 407.2 219.3 419.7M219.2 363.9C218.7 389.8 220.6 403.1 220.4 419.6M219.4 417.9C163.8 418.7 129.5 416.5 103.6 416.7M219.7 416C171.2 417.7 121 417.1 102.4 416.6M105.4 416.7C106.6 399.7 106.2 373.8 104.4 363.7M104.3 418.2C105 396.9 104.9 377.7 104.9 362.3" fill="none" stroke="#DBD8CF" stroke-width="1.5" stroke-linecap="round"></path><text data-hk="000000010000000000004000010a920a180" x="168" y="387" font-size="14" fill="#DBD8CF" text-anchor="middle">LLM</text><text data-hk="000000010000000000004000010a920a190" x="168" y="405" font-size="14" fill="#DBD8CF" text-anchor="middle">GATEWAY</text><ellipse data-hk="000000010000000000004000010a920a2000" cx="97" cy="362" rx="5" ry="5" fill="#1A1E25"></ellipse><path data-hk="000000010000000000004000010a920a2001" d="M101.5 364Q100.5 365.9 98.7 366.9Q97 367.9 95.2 366.3Q93.3 364.8 92.1 363.4Q90.9 362 92.5 360.3Q94.2 358.6 95.6 358.3Q97 358 99.1 358.1Q101.3 358.1 101.9 360.1Q102.6 362 101.5 364M101.5 363.6Q101.1 365.3 99.1 366.1Q97 366.8 95.3 366.2Q93.5 365.5 92.3 363.7Q91.1 362 92.4 360Q93.8 358 95.4 357.3Q97 356.6 98.6 357.5Q100.3 358.4 101.1 360.2Q101.8 362 101.5 363.6" fill="none" stroke="#DBD8CF" stroke-width="1.5" stroke-linecap="round"></path><path data-hk="000000010000000000004000010a920a2010" d="M101.9 367.3C107.3 372.6 113.5 376.4 117.8 379.7M101.7 365.8C107.6 370.1 111.8 376.8 119.2 378.8" fill="none" stroke="#DBD8CF" stroke-width="1.5" stroke-linecap="round"></path><path data-hk="000000010000000000004000010a920a2020" d="M109.7 377.5C108.3 378.6 106.2 381.4 106.6 382.6M110 376.5C107.7 379.1 107.3 380.3 105.4 381.8" fill="none" stroke="#DBD8CF" stroke-width="1.5" stroke-linecap="round"></path><path data-hk="000000010000000000004000010a920a2030" d="M115 381.2C114 383.2 112.5 384.7 110.7 386.5M115 380.6C113.1 382.5 111.9 385.1 111.3 385.5" fill="none" stroke="#DBD8CF" stroke-width="1.5" stroke-linecap="round"></path><path data-hk="000000010000000000004000010a920a2100" d="M213.2 356.4Q212.6 347.9 215.3 346Q218 344.1 221.9 345.5Q225.8 346.9 226 350.8L226.1 354.6M212.9 355.6Q211.6 347.9 215.9 345.8Q220.2 343.7 222.8 346.4Q225.4 349 225.5 352.7L225.6 356.3" fill="none" stroke="#DBD8CF" stroke-width="1.5" stroke-linecap="round"></path><polygon data-hk="000000010000000000004000010a920a2110" points="206,356 232,356 232,372 206,372" fill="#1A1E25"></polygon><path data-hk="000000010000000000004000010a920a2111" d="M205.6 372.1C205.2 366.1 204.8 358.8 205.8 355.2M205.5 371.2C206.7 364.2 205.9 360.5 207.1 355.7M206.2 354.9C214.9 356.9 227.5 355.1 232.2 356.4M206.6 357C218.3 356.3 226.1 355.2 231 355.2M231.4 356.3C231.5 363.1 231.7 367.8 232.3 371.1M231 355.3C231.7 362.4 230.8 368.5 232.1 371M231 372.7C222.6 372 211.3 370.7 206.8 371.4M232.8 371C220.8 371.9 209.9 371.9 206.5 372.6" fill="none" stroke="#DBD8CF" stroke-width="1.5" stroke-linecap="round"></path><text data-hk="000000010000000000004000010a920a220" x="162" y="444" font-size="13" fill="#DBD8CF" text-anchor="middle" transform="rotate(-1 162 444)">keys live here</text><rect data-hk="000000010000000000004000010a920a230" x="271.5" y="366.5" width="127" height="49" rx="0" fill="#1A1E25"></rect><path data-hk="000000010000000000004000010a920a231" d="M270.3 365.2C335.4 366.8 381.6 365.1 401 364.4M270.7 366.4C331.2 364.9 365.9 364 401.5 363.8M399 364.3C399.5 386.5 401.1 407.2 399.3 418.1M399.8 363.3C398.9 383.1 402 406.1 399.3 419M400.1 416.1C336.8 415.8 297.2 418 271 416.3M402 416.6C358 415.3 300.7 419.6 269.6 416.4M270.9 419.1C269.2 391.9 269.5 381 270.1 364.4M269 418.4C271.8 399.1 270.4 380.4 268.7 362.6" fill="none" stroke="#DBD8CF" stroke-width="1.5" stroke-linecap="round"></path><text data-hk="000000010000000000004000010a920a240" x="354" y="387" font-size="14" fill="#DBD8CF" text-anchor="middle">SESSION</text><text data-hk="000000010000000000004000010a920a250" x="354" y="405" font-size="14" fill="#DBD8CF" text-anchor="middle">STORAGE</text><ellipse data-hk="000000010000000000004000010a920a2600" cx="290" cy="378" rx="13" ry="4.5" fill="#1A1E25"></ellipse><path data-hk="000000010000000000004000010a920a2601" d="M301.1 380Q299.5 381.9 294.7 381.8Q290 381.7 285.6 381.2Q281.3 380.6 279.3 379.3Q277.3 378 279.4 376.8Q281.5 375.5 285.7 374.9Q290 374.3 294.6 374.2Q299.2 374.1 300.9 376.1Q302.7 378 301.1 380M300.9 379.4Q299.3 380.9 294.7 381.3Q290 381.6 285.1 381.2Q280.2 380.8 278.1 379.4Q276.1 378 278.2 376.3Q280.3 374.6 285.2 374.1Q290 373.5 294.4 373.8Q298.8 374.1 300.6 376.1Q302.4 378 300.9 379.4" fill="none" stroke="#DBD8CF" stroke-width="1.5" stroke-linecap="round"></path><path data-hk="000000010000000000004000010a920a2610" d="M276.5 378.1C278.2 387.3 276.8 390.6 277.3 395.1M277.5 377.1C276.8 386.4 278.9 392.9 276.6 396" fill="none" stroke="#DBD8CF" stroke-width="1.5" stroke-linecap="round"></path><path data-hk="000000010000000000004000010a920a2620" d="M302.5 378.4C302.5 384.5 304.5 389.3 302.9 396M303.7 377.6C304.1 386 302.8 392.3 302.2 395.2" fill="none" stroke="#DBD8CF" stroke-width="1.5" stroke-linecap="round"></path><path data-hk="000000010000000000004000010a920a2630" d="M276.7 395.3Q289.6 400.5 296.4 397.6L303.2 394.6M277.8 396.1Q291.2 400.1 296.8 397.9L302.4 395.7" fill="none" stroke="#DBD8CF" stroke-width="1.5" stroke-linecap="round"></path><path data-hk="000000010000000000004000010a920a2640" d="M276.1 388.7Q289.1 392.4 295.7 390.9L302.4 389.5M277.6 388Q289.7 393.6 296.8 390.3L303.9 387" fill="none" stroke="#DBD8CF" stroke-width="1.5" stroke-linecap="round"></path><text data-hk="000000010000000000004000010a920a270" x="335" y="444" font-size="13" fill="#DBD8CF" text-anchor="middle" transform="rotate(0.8 335 444)">single writer</text><rect data-hk="000000010000000000004000010a920a280" x="556.5" y="156.5" width="392" height="267" rx="22" fill="#1A1E25"></rect><path data-hk="000000010000000000004000010a920a281" d="M575.7 153.6C718.4 153.5 845.2 155.8 927.8 155.5M577.8 155.6C691.3 154.9 846.6 157.9 927.2 154M949.7 177.2C952.6 258.4 947.7 359.5 948.8 404M949.3 177.8C951.3 266.8 951 339.1 950 403.1M928.6 425.5C790.6 422.3 691.3 424.3 576 425.5M926.7 425.6C776.2 426.7 655.8 425.5 576.7 423.5M554.2 402.7C558.2 308.9 554.5 218.6 554 176M556.3 404C553.1 296.9 553.7 237.2 554.2 178.4M928.5 153.8Q950 155.2 948.6 178.2M950.7 402.6Q951 425.8 926.8 425.8M575.8 425Q554 424.6 554.6 403.9M554 178.3Q556.5 156.5 575.8 156.3" fill="none" stroke="#F4644A" stroke-width="2" stroke-linecap="round"></path><path data-hk="000000010000000000004000010a920a290" d="M320.7 276.8C423 274.7 537 277.4 586.7 277M320 278.7C424.2 279.4 525.1 278.5 584.6 278.8M585.3 277.1C581 278.9 577.2 280.6 574.8 281.7M585 276.9C582.2 278.3 577.6 280.7 575.1 281.8M585.2 276.9C580.9 275.1 578.1 273.5 574.7 272.7M584.7 277.2C582.2 275.6 576.4 273.4 574.7 272.2M320.1 277.2C325 274.5 328.1 273.3 329.8 272.9M319.7 276.9C325.3 274.6 327.2 273.5 330.3 272.3M320.1 276.8C323.1 278.5 327.7 280.2 330.2 281.5M319.9 276.9C323.9 278.9 326.7 280 330.3 281.6" fill="none" stroke="#DBD8CF" stroke-width="2.4" stroke-linecap="round"></path><text data-hk="000000010000000000004000010a920a300" x="438" y="260" font-size="15" fill="#DBD8CF" text-anchor="middle">typed RPC</text><polygon data-hk="000000010000000000004000010a920a3100" points="482,248 504,248 496,259 490,259" fill="#1A1E25"></polygon><path data-hk="000000010000000000004000010a920a3101" d="M490.4 259.1C486.5 254.4 484 249 481.4 249.1M489.5 259.5C486.2 255.9 482.4 249.8 481.9 247.1M483 247.5C490.1 248 499.9 247.2 504.9 248.3M482 249C489.2 248.5 498.1 246.6 504.3 249M503.8 248.2C500.2 252.4 498.9 255.9 497 260M503.5 248.5C500.6 251.2 496.3 258.1 496.3 258.7M495.8 259.4C493.4 258.7 491.7 258.8 489.6 258.9M495.7 259C494.1 259.2 491.9 259.1 489.6 259.1" fill="none" stroke="#DBD8CF" stroke-width="1.5" stroke-linecap="round"></path><path data-hk="000000010000000000004000010a920a3110" d="M492.6 259.1C492.4 261.5 493.4 263.3 493.2 265.6M492.5 259C492.4 261.8 492.7 264.7 493 265.9" fill="none" stroke="#DBD8CF" stroke-width="1.5" stroke-linecap="round"></path><text data-hk="000000010000000000004000010a920a320" x="445" y="312" font-size="14" fill="#DBD8CF" text-anchor="middle" transform="rotate(-0.6 445 312)">the only door</text><text data-hk="000000010000000000004000010a920a330" x="752" y="192" font-size="19" fill="#DBD8CF" text-anchor="middle"><tspan data-hk="000000010000000000004000010a920a331" font-weight="bold">VM</tspan> <tspan data-hk="000000010000000000004000010a920a332" fill="#F4644A">(untrusted)</tspan></text><text data-hk="000000010000000000004000010a920a340" x="955" y="112" font-size="13" fill="#F4644A" text-anchor="end" transform="rotate(-1 955 112)">if popped: attacker gets</text><text data-hk="000000010000000000004000010a920a350" x="955" y="128" font-size="13" fill="#F4644A" text-anchor="end" transform="rotate(-1 955 128)">a stub, python, and grep</text><path data-hk="000000010000000000004000010a920a3600" d="M598.2 222.7Q599.2 214.4 601.5 212.5Q603.7 210.6 608.8 211.4Q613.9 212.3 614.5 214.7L615.2 217.2M598.4 222.4Q598.5 213.7 602 211.4Q605.4 209.1 609.5 211.2Q613.6 213.3 614.5 215.2L615.4 217.2" fill="none" stroke="#44CFFF" stroke-width="3.5" stroke-linecap="round"></path><path data-hk="000000010000000000004000010a920a3610" d="M616.3 217.8Q616.2 227.5 614 229Q611.8 230.6 607.3 229.9Q602.8 229.3 601.2 225.8L599.7 222.3M617.4 217.8Q616.4 225.8 614.3 227.5Q612.1 229.1 608.3 228.4Q604.4 227.7 602.6 226.1L600.8 224.4" fill="none" stroke="#F5B04A" stroke-width="3.5" stroke-linecap="round"></path><path data-hk="000000010000000000004000010a920a3620" d="M604 213.7Q604.4 214.4 603.7 214.2Q603 214 602.8 213.8Q602.6 213.6 602.5 213.3Q602.4 213 602.3 212.4Q602.2 211.8 602.6 211.3Q603 210.7 603.3 211.6Q603.6 212.4 603.6 212.7Q603.6 213 604 213.7M603.9 213.9Q604.1 214.7 603.6 214.3Q603 214 602.9 213.8Q602.7 213.6 602.2 213.3Q601.7 213 601.5 212.7Q601.3 212.3 602.1 211.4Q603 210.4 603.5 211.3Q604 212.1 603.8 212.6Q603.6 213 603.9 213.9" fill="none" stroke="#121419" stroke-width="2" stroke-linecap="round"></path><path data-hk="000000010000000000004000010a920a3630" d="M614.4 227.7Q614.7 228.3 613.9 228.9Q613 229.4 612.2 229.1Q611.5 228.8 611.9 227.9Q612.4 227 612.2 226.2Q612 225.3 612.5 225.6Q613 225.9 613.4 225.9Q613.8 225.9 613.9 226.4Q614 227 614.4 227.7M614.9 227.6Q614.6 228.2 613.8 227.9Q613 227.6 612.2 228.2Q611.4 228.8 611.2 227.9Q610.9 227 611.6 226.1Q612.3 225.2 612.6 225.8Q613 226.4 613.9 225.8Q614.8 225.3 615 226.2Q615.2 227 614.9 227.6" fill="none" stroke="#121419" stroke-width="2" stroke-linecap="round"></path><ellipse data-hk="000000010000000000004000010a920a3700" cx="652" cy="220" rx="9" ry="9" fill="#1A1E25"></ellipse><path data-hk="000000010000000000004000010a920a3701" d="M659.6 223.5Q657.6 227 654.8 228.3Q652 229.7 648.6 228Q645.2 226.4 644.3 223.2Q643.5 220 644.2 216.4Q644.9 212.9 648.5 212.4Q652 211.8 655 212.5Q657.9 213.1 659.8 216.6Q661.7 220 659.6 223.5M659.4 223.4Q658.2 226.8 655.1 228.4Q652 229.9 649.2 228.2Q646.4 226.5 645.1 223.3Q643.8 220 644.5 216.6Q645.2 213.3 648.6 211.7Q652 210.2 655.3 211.5Q658.7 212.9 659.6 216.4Q660.6 220 659.4 223.4" fill="none" stroke="#DBD8CF" stroke-width="1.5" stroke-linecap="round"></path><path data-hk="000000010000000000004000010a920a3710" d="M658.9 226.9C665.3 231.5 667.4 234.3 668.9 238.8M658.5 226.3C664.6 231.8 667.7 234.7 670.7 238.7" fill="none" stroke="#DBD8CF" stroke-width="2.2" stroke-linecap="round"></path><rect data-hk="000000010000000000004000010a920a380" x="586.5" y="251.5" width="117" height="49" rx="0" fill="#1A1E25"></rect><path data-hk="000000010000000000004000010a920a381" d="M584.6 248.9C642.3 250.5 665.7 249.1 707.6 248.8M584.6 248.5C632.2 249.8 671.7 250.5 708.5 251.4M704 249.2C705 273.8 704.4 290.6 705.7 303.8M704.2 248.3C706.1 269.7 706.1 291.7 704.6 303.3M706 302.5C647.4 301.6 614 301.9 584.9 300.6M707.5 301.5C652.5 301.7 626.9 301.5 585.3 302.5M585 303.7C583.8 279.8 583.9 257.1 586.2 250.1M586.4 302.5C584.7 280.6 586.8 259.9 586 248.8" fill="none" stroke="#DBD8CF" stroke-width="1.5" stroke-linecap="round"></path><text data-hk="000000010000000000004000010a920a390" x="645" y="272" font-size="13.5" fill="#DBD8CF" text-anchor="middle">EXECUTOR</text><text data-hk="000000010000000000004000010a920a400" x="645" y="290" font-size="13.5" fill="#DBD8CF" text-anchor="middle">STUB</text><text data-hk="000000010000000000004000010a920a410" x="645" y="322" font-size="12.5" fill="#9AA2AD" text-anchor="middle">py + rg</text><path data-hk="000000010000000000004000010a920a420" d="M708.8 275.9C748 275.4 771.1 276.3 789.8 276.9M709.8 275.8C736.7 277.6 772.1 276 790.7 275.5" fill="none" stroke="#9AA2AD" stroke-width="1.5" stroke-linecap="round" stroke-dasharray="6 5"></path><text data-hk="000000010000000000004000010a920a430" x="750" y="264" font-size="13" fill="#9AA2AD" text-anchor="middle">mirrored</text><polygon data-hk="000000010000000000004000010a920a4400" points="795,296 795,258 800,254 821,254 826,261 867,261 867,296" fill="#1A1E25"></polygon><path data-hk="000000010000000000004000010a920a4401" d="M868.1 295.2C839.7 296.6 820.3 295.3 794.8 296M867.7 296.3C832.4 295.4 810.9 296.5 794.5 296.1M794.4 295.6C794.2 282.2 794 268.4 794.5 258.2M795 295.8C796.4 281 795.2 268.4 794.5 257.6M795.4 257.9C796.7 256.2 798.3 255.3 800 253.9M794.8 258.1C797.7 255.7 798.7 254.7 799.7 254M800.9 253.8C807.4 253.1 816.7 255.6 821.3 253.1M799.1 255C807.9 254.5 816.3 254.4 821.1 253.4M820.7 254.1C823.5 256.7 825.7 259.7 826.2 260.7M820.8 253.8C822.7 256.5 823.7 259.1 825.9 261.3M826.3 262C842.9 261.1 855.7 260.6 867.5 259.9M825.3 261.8C845.1 261.2 853.7 261 866.1 260.5M866.9 262C866.9 273.9 867.4 288.6 867.3 296.5M866.1 260.5C867.2 275.3 867 288.3 866.9 296.9" fill="none" stroke="#DBD8CF" stroke-width="1.5" stroke-linecap="round"></path><text data-hk="000000010000000000004000010a920a4410" x="831" y="285" font-size="13.5" fill="#DBD8CF" text-anchor="middle">&lt;git&gt;</text><text data-hk="000000010000000000004000010a920a450" x="831" y="322" font-size="13" fill="#DBD8CF" text-anchor="middle" transform="rotate(-0.8 831 322)">RO overlay</text><text data-hk="000000010000000000004000010a920a460" x="720" y="372" font-size="13" fill="#9AA2AD">that's it.</text><text data-hk="000000010000000000004000010a920a470" x="720" y="388" font-size="13" fill="#9AA2AD">nothing else.</text><text data-hk="000000010000000000004000010a920a480" x="950" y="545" font-size="14.5" fill="#DBD8CF" text-anchor="end" transform="rotate(-0.5 950 545)">minimum viable prisoner</text></svg></figure>

这些图最终指向同一条边界：

- **主机**拥有会话状态、模型推理、策略、工具路由、审批、限制和日志记录。
- **沙盒**通过一个小巧、只负责执行的协议，管理环境内的执行。
- 所有回传流都受到限制，不能让不可信一侧耗尽主机内存或上下文。

这种安排满足 Factorio 场景，也不会让本地使用变差。同一个主机可以让桩程序面向本地进程、容器、VM 或远程机器。

### 子智能体跨越的是同一条边界

部署位置不只是主机与 VM 的区别。子智能体在文件系统层面也需要相同边界：worktree 只隔离受跟踪文件，而 `pi-iso` 利用 APFS、btrfs、ZFS、overlayfs、ProjFS，或以复制作为后备方案，为每个子智能体提供整个工作区的写时复制视图。子智能体独立修改，父智能体接收 diff。

子智能体获得视图，返回变更，不共享父智能体的可变权威状态。这是同一条主机／沙盒规则在文件系统层面的体现。

### omp 给我们的教训：一次调用，三个脱节的 API

那么，工具该怎么定义？稍后再谈最初做过的修改，不过核心契约基本没变：

```jsx
export const myCustomTool: ToolDefinition = {
	name: "my_tool",
	parameters: mySchema,

	// 1. Called during argument streaming & before execute()
	renderCall(args, theme, context) {
		if (context.argsComplete) {
			// Trigger async preview computation
		}
		return new Text("Pre-execution preview UI...", 0, 0);
	},

	// 2. Main execution
	async execute(_id, params) {
		/* ... -> string */
	},

	// 3. Called after execute() settles
	renderResult(result, options, theme, context) {
		return new Text("Final execution result UI", 0, 0);
	},
};
```

这个契约看起来简洁可爱，却把一个操作拆成了三个互不相关的阶段。预览、执行、模型看到的结果、人看到的结果、诊断、流式更新、取消和日志记录，描述的其实都是同一次调用。API 却迫使它们假装不是一回事。

### 回调拆分导致重复工作

首先，拆开渲染路径后，响应式更新变成了可选项。即使工具的显示形态没有突然切换，作者也得重复编写许多展示逻辑。

更大的问题在于 `execute` 的工作方式。以 Edit 为例：

- `renderCall` 打开文件，最好还把读取内容缓存到某处——哪里呢？——然后应用修改并渲染 diff。
- `execute` 再次打开文件，应用全部修改、写回，并以模型友好的格式返回 diff。
- `renderResult` 拿到这个 diff 后，还得解析我们选定的格式！为什么？因为人当然想看带颜色、带高亮的版本，也许还要更漂亮的行号。

这种直觉式实现带来了：

- I/O 浪费：文件打开两次。
- CPU 浪费：修改结果不是算一次，也不是两次，而是每个字符变化时都从头算一遍——`renderCall` 不是协程！
- 对任意格式进行不必要的序列化和反序列化：为了实现 `renderResult`，我们必须解析模型输出；或者把信息塞进 details，导致日志重复保存数据。

要提高效率，就得在这个定义之外实现并驱动一个协程，找地方保存其句柄，而且整套结果反序列化逻辑仍然跑不掉。

问题不只是代码重复。这个契约缺少一个权威对象，来承载从“参数流式传入”到“运行中”再到“已结束”的状态演进。每种实现都得为这套生命周期发明一条旁路。

### omp² 的改变：执行就是状态流

此外，也没有通用方式添加结构化警告、诊断或截断通知。大多数 Pi 工具最终都会做类似的事：

```jsx
text += `\n${theme.fg("warning", `[Truncated: ${truncation.outputLines} lines shown (${formatSize(truncation.maxBytes ?? DEFAULT_MAX_BYTES)} limit)]`)}`;
```

模型只能猜测工具数据在哪里结束、运行框架的说明从哪里开始。由于 `execute` 不是生成器，流式输出又需要在更新通道上叠加一套协议。

DOM 模型消除了这两种特例：

- 流式输出修改 `<result>` 的内容。
- 添加警告就创建 `<diag severity="warn">`。

执行期间，客户端接收这个状态的补丁。执行结束时，把相对上一状态的最终 diff 记入日志。

在统一会话模型里，一次调用就是一个包含结构化子节点的元素：

```jsx
<Edit id="e41" status="running" version="3">
   <input i="Update the parser without changing the public API">…</input>
   <result>…streaming structured state…</result>
   <diag severity="warn">…</diag>
   <usage tokens="0" elapsed-ms="842"/>
</Edit>
```

执行器在运行时修改这个元素。模型、用户、日志、远程客户端和测试框架，观察的是同一状态的不同投影。执行结束后冻结最终 diff；客户端不再需要解析结果字符串，去重建序列化之前原本就存在的丰富对象。

### 限制是原语的一部分

Pi 的工具没有限制：返回 1 MB 文本，它就会原样转发给模型。暴露这样的原语，层次太低了。

#### 统一限制输出

Pi 自己在 `Bash` 和 `Read` 上也遇到了这个问题，于是导出一个截断工具函数，供各实现复用。omp 为它增加了产物系统，让模型可以读回保留的完整输出；但责任仍然和 Pi 一样，落在每个实现身上。

向模型发送 1 MB 数据，也许值得保留为一种能力。但应该由集中实现默认截断，允许通过显式的 `notrunc` 属性退出，而不是让截断这种良好设计成为主动选择。辅助函数保持可选，会带来两类问题。

大多数工具都需要某种截断，所以可选辅助函数必然覆盖不均：

- 不知道这个函数存在的作者，各自实现，提示文本略有不同。
- 从没想到结果可能很大的作者，什么也不做。

在工具实现内部而不是对话渲染层截断，又会破坏 Code mode：

- 智能体在 `Eval` 中无法放心依赖工具输出；每次都得先从数据中解析并剥离运行框架通知。
- `Eval` 的结果本身也可能被截断，因此每次调用都会在同一份数据外面叠出 N+1 层独立截断。

#### 统一限制阻塞时间

把*任何东西*转入后台、限制调用最多阻塞多久，也应由库层负责，而不是由碰巧运行较久的工具各自处理。

第一个原因是缓存和用户体验。否则，意外的长调用会让智能体无法及时发现并调整；用户回来时看到卡住的会话；自主作业无限等待；提供商的 KV 缓存甚至会在调用返回前过期。

第二个原因是重复实现，omp 也犯了这个错。每个工具自己实现后台运行，就会各自长出 spawn、poll、message、kill 和 list 辅助接口。看看 Claude 为自己的 `Task` 和 `Bash` 工具画的这张图：

<figure data-hk="000000010000000000004000010b135"><svg data-hk="000000010000000000004000010b13600" viewBox="0 0 1000 630" role="img" aria-label="Mapping of Claude Code's background Bash tool surface against its Task subagent surface: spawn, stream out, message in, stop, result, and list each have a counterpart on both sides — run_in_background/Task, BashOutput/system-reminder, stdin/SendMessage, KillShell/interrupt, exit code/tool_result, /bashes/ListAgents." font-family="var(--st-font-sketch)"><defs><pattern id="bvt-dots" width="22" height="22" patternUnits="userSpaceOnUse"><circle cx="11" cy="11" r="1.1" fill="#2E333C"></circle></pattern></defs><rect width="1000" height="630" fill="#121419"></rect><rect width="1000" height="630" fill="url(#bvt-dots)"></rect><rect data-hk="000000010000000000004000010b136010" x="101.5" y="49.5" width="277" height="41" rx="10" fill="#1A1E25"></rect><path data-hk="000000010000000000004000010b136011" d="M110.2 49.5C224.2 49.2 325.3 48.1 371.1 48.6M111.1 47.3C216 47.5 291 47.6 371 49.2M378.5 59C381.7 69.2 381.2 77.8 379.2 81.4M380.8 56.6C380.7 66.8 380.5 74.4 381.4 82.9M371.3 90.9C285.5 91.7 160.6 89.8 111.3 91.7M369.7 92.4C287.9 92.3 178.9 91.2 110.3 92.6M99.5 81C99.5 71.1 100.4 64.2 100.3 57.8M100.5 82.8C99.3 70.5 98.2 63.5 99.4 58.6M371 49.4Q381 47 380.9 59M378.9 80.6Q380.4 92.3 369.7 92.2M110.9 90.9Q100.3 93.5 101.5 82.6M99.8 57.2Q99.5 46.7 109 48.3" fill="none" stroke="#4ADE80" stroke-width="1.5" stroke-linecap="round"></path><text data-hk="000000010000000000004000010b136020" x="240" y="76" font-size="15.5" fill="#4ADE80" text-anchor="middle" stroke="#4ADE80" stroke-width="0.8">Background Bash</text><rect data-hk="000000010000000000004000010b136030" x="431.5" y="49.5" width="157" height="41" rx="10" fill="#1A1E25"></rect><path data-hk="000000010000000000004000010b136031" d="M439.8 49.1C502 46.9 547.8 47.2 580.2 47M440.2 48.1C509.4 48.1 534.6 48.8 579.1 49.4M589.6 58C590.4 67.4 588.5 76.6 589.2 83.2M590.7 57C588.2 65.6 588.6 74 591.5 80.6M579.1 92.2C530.2 94.3 471.1 93.4 440.2 92.9M579.4 90.8C533.2 93.7 480.5 89.8 439.7 91.4M428.6 83C428.7 72.8 429.2 64.9 430.7 59.2M429 83.3C428.1 70.5 428.7 61.1 431.4 57.7M581.4 47.7Q589 47.3 588.8 58.1M590.1 80.7Q590.7 92.3 580.6 90.6M440.2 92Q429.2 90.7 428.6 83.2M429.5 57.9Q428.9 48 439.3 49.5" fill="none" stroke="#DBD8CF" stroke-width="1.5" stroke-linecap="round"></path><text data-hk="000000010000000000004000010b136040" x="510" y="76" font-size="15.5" fill="#DBD8CF" text-anchor="middle" stroke="#DBD8CF" stroke-width="0.8">Interface</text><rect data-hk="000000010000000000004000010b136050" x="651.5" y="49.5" width="277" height="41" rx="10" fill="#1A1E25"></rect><path data-hk="000000010000000000004000010b136051" d="M660.1 48.8C744.9 51.4 862.3 50.1 919.8 47.1M660 47.4C779.1 46.4 858.6 47.1 919.9 47.8M929.4 58.2C931 70.6 928.3 76.4 930.4 83M928.5 59C928.8 70.4 930.6 76.9 931.4 83.2M920.6 91.2C799.5 93.4 741.1 89.8 659.7 93M920.9 92.5C802.6 91.4 729.7 90.7 660.7 92.6M650.3 83.3C649.5 71 651.6 64.8 650.6 57.3M650.4 80.9C650.1 70.1 651.2 64.3 650 56.8M919.9 47.4Q929.4 48.5 931.2 57.1M930.1 80.7Q930.3 92.2 918.7 91.8M661.3 91.2Q648.6 93.1 649 82.9M649 57.3Q650.3 46.9 660.9 49.2" fill="none" stroke="#A78BFA" stroke-width="1.5" stroke-linecap="round"></path><text data-hk="000000010000000000004000010b136060" x="790" y="76" font-size="15.5" fill="#A78BFA" text-anchor="middle" stroke="#A78BFA" stroke-width="0.8">Subagent</text><rect data-hk="000000010000000000004000010b13607000" x="101.5" y="117.5" width="277" height="53" rx="10" fill="#1A1E25"></rect><path data-hk="000000010000000000004000010b13607001" d="M109.1 115.2C224.2 115.9 314.1 112.7 371.1 115.4M110.4 116.4C209.6 117.3 300.8 117.3 370.8 117.4M380.3 125.3C381 141.7 381.1 150.9 379.4 161.1M381.1 127C380.9 138.7 382.3 153.6 380.7 162.8M369.6 170.8C281.3 173.5 163.5 171.2 110.8 171.4M371.2 172.1C287.4 170.6 186.7 172.6 108.8 171.7M100.7 162.7C101.1 147 100.6 139 99.8 125.8M100 162.9C101.1 145.1 100.9 136.9 99.9 127M370.3 115.4Q379.6 114.7 379.5 127M380.6 161.1Q378.9 172.8 371 170.6M110.6 172Q100.8 172 100.8 160.5M99.9 126.3Q100.7 115.9 110.1 115.2" fill="none" stroke="#4ADE80" stroke-width="1.5" stroke-linecap="round"></path><text data-hk="000000010000000000004000010b13607010" x="240" y="141" font-size="14.5" fill="#4ADE80" text-anchor="middle">Bash</text><text data-hk="000000010000000000004000010b13607020" x="240" y="160" font-size="12.5" fill="#9AA2AD" text-anchor="middle">run_in_background: true</text><rect data-hk="000000010000000000004000010b1360710" x="431.5" y="123.5" width="157" height="41" rx="10" fill="#1A1E25"></rect><path data-hk="000000010000000000004000010b1360711" d="M440.4 121.3C493 122.2 534.9 119.9 580.8 120.8M439.1 122.7C507.9 121.5 550.3 121.4 581.1 120.7M588.8 131.9C590.3 142.6 588.9 151.4 588.5 155.1M590.6 133.1C591.1 140 590.7 149.5 588.9 155M579.7 165.7C536.5 164.3 486.8 165 438.7 165.3M579.5 166.6C517.8 165 469.8 168.1 441 165.2M430.8 155.9C429.7 143.6 430.4 137.3 431.1 133.4M430 156.2C431.3 145.7 430.9 138.2 428.6 132.7M579.6 121.8Q590.8 123 590.9 132M589.4 156.3Q591.5 164.9 580.1 167.3M439.2 166.8Q430.8 166.5 429.4 155.1M430.1 132.2Q430 123 439.7 120.9" fill="none" stroke="#DBD8CF" stroke-width="1.5" stroke-linecap="round"></path><text data-hk="000000010000000000004000010b1360720" x="510" y="150" font-size="14.5" fill="#DBD8CF" text-anchor="middle">Spawn</text><rect data-hk="000000010000000000004000010b13607300" x="651.5" y="117.5" width="277" height="53" rx="10" fill="#1A1E25"></rect><path data-hk="000000010000000000004000010b13607301" d="M661.1 117.4C788.3 117 839.4 113.6 918.5 117M659.2 114.7C770.3 115.7 835.6 118 920.2 114.5M929.7 124.6C931 145.2 931.7 153.6 928.7 163.4M931.2 127.3C930.8 139.5 930.4 154.4 930.3 161M919.1 173.4C791.7 173.5 702.9 171.1 658.7 172.4M921.1 170.6C827 171.8 737.7 172.3 660.1 171M649.8 162.6C650.3 148.5 649.3 133.8 648.9 125.3M651.1 162.7C651.1 150.7 649.7 136.3 649.9 125.2M919.6 117.5Q931.4 116.7 930.2 125.9M929.9 162.2Q931.4 171.8 919.1 171.5M660.9 173.4Q649.6 172.2 650 161.8M651 127.4Q649.8 117.2 659.4 116.4" fill="none" stroke="#A78BFA" stroke-width="1.5" stroke-linecap="round"></path><text data-hk="000000010000000000004000010b13607310" x="790" y="141" font-size="14.5" fill="#A78BFA" text-anchor="middle">Task</text><text data-hk="000000010000000000004000010b13607320" x="790" y="160" font-size="12.5" fill="#9AA2AD" text-anchor="middle">prompt, subagent_type</text><path data-hk="000000010000000000004000010b1360740" d="M389.2 145.3C397.5 144.3 414.4 145.7 421.3 143.6M388.2 143.7C402.1 145.3 415.9 143.5 421.7 142.6" fill="none" stroke="#9AA2AD" stroke-width="1.2" stroke-linecap="round" stroke-dasharray="6 5"></path><path data-hk="000000010000000000004000010b1360750" d="M597.7 143.9C618.7 142.8 634.4 143.9 642.2 143.2M598.1 143.3C616.4 142.9 631.8 143.8 643 144" fill="none" stroke="#9AA2AD" stroke-width="1.2" stroke-linecap="round" stroke-dasharray="6 5"></path><rect data-hk="000000010000000000004000010b13607600" x="101.5" y="201.5" width="277" height="53" rx="10" fill="#1A1E25"></rect><path data-hk="000000010000000000004000010b13607601" d="M109.5 199.3C199.2 199.2 295.2 199.5 368.8 198.9M111.1 201.1C189.2 203.5 320.8 202.9 369 200.9M379.8 209.1C381 224.5 379.2 233.9 380.1 244.9M381.1 209.9C379.3 225.2 381.7 238.1 380.2 245.4M369.4 254.6C262.4 258.2 167.7 252.4 108.6 256.7M371.4 255.9C286.9 253.9 191.8 255.8 111 256.7M99.8 244.8C99.5 230 99.9 218.2 99.9 208.9M100.4 247C100.9 232.8 100.5 219.4 101.1 210.8M369 199.1Q380.5 199.1 379.9 209.4M380.2 247.2Q380.3 257.3 370.4 255.7M111.3 254.8Q98.7 255.5 98.6 245.8M98.9 210.6Q98.8 200.8 109.2 199.7" fill="none" stroke="#4ADE80" stroke-width="1.5" stroke-linecap="round"></path><text data-hk="000000010000000000004000010b13607610" x="240" y="225" font-size="14.5" fill="#4ADE80" text-anchor="middle">BashOutput</text><text data-hk="000000010000000000004000010b13607620" x="240" y="244" font-size="12.5" fill="#9AA2AD" text-anchor="middle">poll by bash_id</text><rect data-hk="000000010000000000004000010b1360770" x="431.5" y="207.5" width="157" height="41" rx="10" fill="#1A1E25"></rect><path data-hk="000000010000000000004000010b1360771" d="M440.6 206.9C484.9 206.9 557.2 205.8 578.8 205.2M441.3 206C506.2 204.8 538.7 206.9 579.9 204.8M591.2 214.5C589.7 225.1 590.8 232 589.5 240.1M589.5 214.5C590 225.7 590.8 233.9 590.4 239.2M578.6 249.8C533.5 247.9 473.3 250.8 440.4 248.9M580.8 250.6C536.7 251.7 475.1 249.3 441 250.2M429.8 241.2C430.7 228.7 431.2 223.6 430 215M429.9 239C430.7 230.7 428.8 221.7 431.3 216.4M579.7 205.6Q590.2 205.4 589.4 215.2M590.6 240Q589.2 250.7 580.6 248.6M441.1 250.1Q430.6 250.2 431.1 238.9M429.1 216Q431.2 206.8 441.5 205.6" fill="none" stroke="#DBD8CF" stroke-width="1.5" stroke-linecap="round"></path><text data-hk="000000010000000000004000010b1360780" x="510" y="234" font-size="14.5" fill="#DBD8CF" text-anchor="middle">Stream out</text><rect data-hk="000000010000000000004000010b13607900" x="651.5" y="201.5" width="277" height="53" rx="10" fill="#1A1E25"></rect><path data-hk="000000010000000000004000010b13607901" d="M659.4 201.2C783.1 201.8 856.8 198.6 920.8 201.5M659.3 200.6C740.4 202.6 847.9 202.5 920.6 201.5M930.1 210.6C932 227.9 930.1 236.8 929.8 247.2M931.1 211C930.7 225.2 928.5 235.4 929.4 246.4M920.4 256.3C800.4 256.1 721.1 258.7 661.3 255.8M919.5 254.7C801.2 257.2 739.3 256.4 659.6 254.9M648.7 246.2C648.6 228.7 649.2 222.8 649.1 210.5M650 244.5C648.9 227.7 651.2 216.6 650.2 210.4M920.7 199.8Q930.9 200.2 928.9 210.4M930.6 245.7Q928.9 255.4 918.6 254.6M661.4 256Q649.8 255.9 649.5 246.7M651.3 209.5Q649 200.3 660.3 200.3" fill="none" stroke="#F5B04A" stroke-width="1.5" stroke-linecap="round"></path><text data-hk="000000010000000000004000010b13607910" x="790" y="225" font-size="14.5" fill="#F5B04A" text-anchor="middle">system-reminder</text><text data-hk="000000010000000000004000010b13607920" x="790" y="244" font-size="12.5" fill="#9AA2AD" text-anchor="middle">async agent notification</text><path data-hk="000000010000000000004000010b13607a100" d="M387.6 228.6C399.9 227.9 416.2 227.4 422 228.5M387 228.2C402.2 227.7 413 227.5 422.2 226.8" fill="none" stroke="#9AA2AD" stroke-width="1.2" stroke-linecap="round" stroke-dasharray="6 5"></path><path data-hk="000000010000000000004000010b13607a110" d="M598.1 228.4C613.6 226.9 628.9 229.4 642.5 228.4M597.5 229.4C613.1 229.5 633.9 228.3 641.6 226.8" fill="none" stroke="#9AA2AD" stroke-width="1.2" stroke-linecap="round" stroke-dasharray="6 5"></path><rect data-hk="000000010000000000004000010b13607a1200" x="101.5" y="285.5" width="277" height="53" rx="10" fill="#1A1E25"></rect><path data-hk="000000010000000000004000010b13607a1201" d="M109.8 282.8C214.2 281 304.5 284.7 371 283.6M109.6 285.3C208.7 285.1 327.9 283.2 369.9 282.5M381.3 294.8C379.9 309.9 378.9 322.7 380.5 329M380.1 295.4C380.8 308.6 379.1 319.8 380 329.8M369.6 341.4C277.3 341.4 151.3 342.7 108.6 339.5M369.4 339.5C274.4 338.9 188.6 342.3 111.2 340.9M99 330.3C98.1 319.3 101.4 304.8 98.5 292.9M100.4 328.8C100.5 319 99.2 304.3 99.4 294.2M371.2 284Q380.3 283 381.4 294.2M380.8 330.3Q381.5 340.7 369.9 338.6M111.5 340.2Q99.8 338.9 101 328.7M101.1 292.7Q99.5 285.4 109.3 284.9" fill="none" stroke="#F5B04A" stroke-width="1.5" stroke-linecap="round"></path><text data-hk="000000010000000000004000010b13607a1210" x="240" y="309" font-size="14.5" fill="#F5B04A" text-anchor="middle">stdin</text><text data-hk="000000010000000000004000010b13607a1220" x="240" y="328" font-size="12.5" fill="#9AA2AD" text-anchor="middle">no tool exposed</text><rect data-hk="000000010000000000004000010b13607a130" x="431.5" y="291.5" width="157" height="41" rx="10" fill="#1A1E25"></rect><path data-hk="000000010000000000004000010b13607a131" d="M440.1 289.6C498.3 291.6 548.8 292.9 581.5 291M441.2 289.9C492.2 288.4 557.4 287.2 581.5 290M591.5 300.1C588.7 308 590 317.9 590.3 323.9M589.3 301.4C589.5 307.5 588.9 317.5 591 324.7M578.5 334.1C524 333.5 473.7 335.1 439.1 334.8M580 335.4C519.2 335.3 487.2 333.5 439.7 332.7M431.1 325.3C428.2 314.8 430.4 306.5 429.8 298.7M430.6 323.1C430.9 314.9 428.8 306.3 428.8 300.5M580.3 290.2Q590.5 291.1 588.6 299.4M590.6 324.1Q589.6 332.6 580.5 334.4M439.2 333.3Q430.7 335.3 429.8 324.4M429.8 301.2Q428.5 289.9 439.5 290.4" fill="none" stroke="#DBD8CF" stroke-width="1.5" stroke-linecap="round"></path><text data-hk="000000010000000000004000010b13607a140" x="510" y="318" font-size="14.5" fill="#DBD8CF" text-anchor="middle">Message in</text><rect data-hk="000000010000000000004000010b13607a1500" x="651.5" y="285.5" width="277" height="53" rx="10" fill="#1A1E25"></rect><path data-hk="000000010000000000004000010b13607a1501" d="M659.9 282.5C766.9 280.4 853.6 283 920.3 283M661.5 283.1C765.3 284.2 873.1 287.4 920.8 285.1M929.7 293.8C929 309.2 930.4 322.8 931.2 328.6M931.1 295.3C928.9 307.8 930 319.1 929.4 329.1M918.8 340.8C805.6 342 722.8 341.1 660.2 340M918.8 340.2C830.9 342.9 745.4 337.9 658.7 341.4M649.8 329.9C651.9 314.8 649.6 305.3 648.7 294.7M651.4 329.7C651.4 317.5 649.3 302.4 650.7 295.2M919.2 285.5Q929.9 284.3 930.6 293.9M931.2 330.1Q930.3 339.8 921.2 340.6M660.1 340.5Q648.5 339.2 651.1 328.5M649.8 294.6Q649.5 285.1 659.8 284.7" fill="none" stroke="#A78BFA" stroke-width="1.5" stroke-linecap="round"></path><text data-hk="000000010000000000004000010b13607a1510" x="790" y="309" font-size="14.5" fill="#A78BFA" text-anchor="middle">SendMessage</text><text data-hk="000000010000000000004000010b13607a1520" x="790" y="328" font-size="12.5" fill="#9AA2AD" text-anchor="middle">agent_id, message</text><path data-hk="000000010000000000004000010b13607a160" d="M386.6 311.9C401.1 312 412.3 311.1 421.7 311.2M389.4 311.4C403.3 310.3 416.7 313.5 421.1 311.1" fill="none" stroke="#9AA2AD" stroke-width="1.2" stroke-linecap="round" stroke-dasharray="6 5"></path><path data-hk="000000010000000000004000010b13607a170" d="M597 311.6C613.6 312.3 627.4 309.8 640.9 310.7M598.9 312.7C612.9 312.4 629.2 312.7 642.6 313.1" fill="none" stroke="#9AA2AD" stroke-width="1.2" stroke-linecap="round" stroke-dasharray="6 5"></path><rect data-hk="000000010000000000004000010b13607a1800" x="101.5" y="369.5" width="277" height="53" rx="10" fill="#1A1E25"></rect><path data-hk="000000010000000000004000010b13607a1801" d="M109.8 367C220 369.5 331.2 365.9 371 367.2M109.1 367.9C190 369.4 292.9 368.8 370.6 367M380.6 378.3C379.8 394.1 379.2 406.4 381.2 414.4M381.3 379C381.8 395.7 380.4 403.2 380.8 414.6M370.6 422.8C255.8 423.6 167.2 424.3 110.4 425.3M371 422.6C240.8 425.7 185.9 422.2 109.1 423.7M98.5 414.1C100.6 401.6 98.7 388.4 99 379.2M99.6 413.7C99.8 402.8 98.9 384.8 98.9 377.6M370.6 368Q381 367.2 380.4 377.8M380.4 412.8Q378.7 422.9 369.2 425.3M110.2 424.2Q101.3 423.9 101.3 414.5M99.8 377Q98.5 368.3 109.9 367.1" fill="none" stroke="#4ADE80" stroke-width="1.5" stroke-linecap="round"></path><text data-hk="000000010000000000004000010b13607a1810" x="240" y="393" font-size="14.5" fill="#4ADE80" text-anchor="middle">KillShell</text><text data-hk="000000010000000000004000010b13607a1820" x="240" y="412" font-size="12.5" fill="#9AA2AD" text-anchor="middle">shell_id</text><rect data-hk="000000010000000000004000010b13607a190" x="431.5" y="375.5" width="157" height="41" rx="10" fill="#1A1E25"></rect><path data-hk="000000010000000000004000010b13607a191" d="M439.1 373.3C487.5 371.6 550.1 375.5 580.6 374.9M440.7 375C499.4 373.5 555.5 373.3 580.6 373.1M590.1 382.7C590.1 393.3 589 402.2 591.2 407.3M591.4 383.2C589.4 395.8 590.8 402.6 588.6 408.9M581.4 418.8C526.8 417 463.6 417.3 439.9 417.4M578.6 416.9C536.1 418.1 467.7 416.5 440.8 418M431 409.4C430.2 397.9 428.8 390.6 431.1 385M429.8 408C430.8 397 429 388.2 430.1 382.7M579 373.1Q588.9 373.1 591.3 384.2M589.3 407.8Q588.7 418.4 580.8 419.5M440.6 419.3Q430.8 418 429.1 408.4M431.4 384.6Q428.7 373.4 440.3 374.7" fill="none" stroke="#DBD8CF" stroke-width="1.5" stroke-linecap="round"></path><text data-hk="000000010000000000004000010b13607a200" x="510" y="402" font-size="14.5" fill="#DBD8CF" text-anchor="middle">Stop</text><rect data-hk="000000010000000000004000010b13607a2100" x="651.5" y="369.5" width="277" height="53" rx="10" fill="#1A1E25"></rect><path data-hk="000000010000000000004000010b13607a2101" d="M660.8 369.4C772 366.1 873.9 366.7 919.3 367.9M659 368.4C768.2 368.6 852.5 364.8 919.6 366.9M931.3 377.6C929.6 391.6 929.2 408 930.7 414.2M930.1 378.9C928.8 389.7 929.7 407.2 930.1 415.2M919.9 423.7C832.5 423.6 710 421 659.5 423.5M919.9 425.4C799.7 421.9 730.5 424.4 659.6 423M649.7 413.2C650 396.1 651.4 388 650.1 377.5M649.4 413.1C650.6 399.2 648.6 391.3 650.9 378.4M920.8 368.4Q929.7 367.2 930.1 379.5M929.8 413.7Q930.9 425.2 918.9 422.6M660.1 422.8Q649.6 425 650.2 413.2M649.2 376.7Q649 369.2 661 368" fill="none" stroke="#A78BFA" stroke-width="1.5" stroke-linecap="round"></path><text data-hk="000000010000000000004000010b13607a2110" x="790" y="393" font-size="14.5" fill="#A78BFA" text-anchor="middle">interrupt</text><text data-hk="000000010000000000004000010b13607a2120" x="790" y="412" font-size="12.5" fill="#9AA2AD" text-anchor="middle">cancel_queued: true</text><path data-hk="000000010000000000004000010b13607a220" d="M388.1 395.7C401.9 396.1 412.1 396 423.4 395.5M387 394.7C403.4 397 415.8 395.6 421 395.3" fill="none" stroke="#9AA2AD" stroke-width="1.2" stroke-linecap="round" stroke-dasharray="6 5"></path><path data-hk="000000010000000000004000010b13607a230" d="M596.8 394.6C618.7 394.9 632.3 396.1 641.5 395.2M598.4 397.1C615.5 397 626.2 397.5 642 395" fill="none" stroke="#9AA2AD" stroke-width="1.2" stroke-linecap="round" stroke-dasharray="6 5"></path><rect data-hk="000000010000000000004000010b13607a2400" x="101.5" y="453.5" width="277" height="53" rx="10" fill="#1A1E25"></rect><path data-hk="000000010000000000004000010b13607a2401" d="M111.5 451.4C226.7 450.4 283.4 454.8 369.4 452.2M109 452.2C234 452.5 279.7 448.8 368.5 452.2M380.8 462.4C379.4 476.1 379.2 486.7 381.3 498.2M379.5 463.3C380.8 475.3 380.4 492.4 379.5 497.1M368.7 507.1C286.9 509 180.7 505.8 109.6 509.3M369.9 508.6C269.2 508.4 153.3 509.8 110.1 507.4M99.2 498.5C100.4 488.1 99.7 470.8 100.3 461.8M100.7 499.5C100.1 487.4 101.2 469 100.2 460.9M369.8 451.9Q379.5 451.2 380.6 461M380.1 499.3Q379 507.8 371.5 508M110.7 508.4Q99.7 508.1 100.9 498.1M99.8 462.9Q99.6 453.2 111.2 453.2" fill="none" stroke="#4ADE80" stroke-width="1.5" stroke-linecap="round"></path><text data-hk="000000010000000000004000010b13607a2410" x="240" y="477" font-size="14.5" fill="#4ADE80" text-anchor="middle">exit code + tail</text><text data-hk="000000010000000000004000010b13607a2420" x="240" y="496" font-size="12.5" fill="#9AA2AD" text-anchor="middle">final BashOutput</text><rect data-hk="000000010000000000004000010b13607a250" x="431.5" y="459.5" width="157" height="41" rx="10" fill="#1A1E25"></rect><path data-hk="000000010000000000004000010b13607a251" d="M439.9 456.8C492.6 457 548.7 457 580.7 456.7M440.2 458.2C503.3 458.1 543.6 460.4 580.5 459.4M589.4 467.8C590.7 476.4 588.1 485.2 590.6 492.2M590.3 467.6C590.7 476.6 588.3 486.3 589.1 492.4M581.1 501.6C514.7 500.6 480 501 438.9 501.4M579.9 501.8C517.9 504.6 459.8 501.4 440.3 502.9M428.6 491.9C430 480.1 431.2 476.2 431.5 469M431.1 491.3C430.1 482.5 430 476.3 430.9 466.7M581.5 458.2Q589.9 458.7 590.5 469.2M589.6 490.9Q589.3 502.3 579.8 502M440.9 502.9Q430.2 503.4 430.6 492.5M429.1 467.9Q428.7 456.9 439.4 457.6" fill="none" stroke="#DBD8CF" stroke-width="1.5" stroke-linecap="round"></path><text data-hk="000000010000000000004000010b13607a260" x="510" y="486" font-size="14.5" fill="#DBD8CF" text-anchor="middle">Result</text><rect data-hk="000000010000000000004000010b13607a2700" x="651.5" y="453.5" width="277" height="53" rx="10" fill="#1A1E25"></rect><path data-hk="000000010000000000004000010b13607a2701" d="M660.2 452.5C764 452.1 863.4 453.7 921.4 451.4M660.2 450.8C770.7 452.7 877.7 453.3 920.3 452M928.9 462.9C929.9 478.2 929.8 485.7 928.8 497.5M930.6 462.3C929.2 478.5 929.8 489.5 929.1 499.2M919.9 508.8C815.6 509.1 724.3 510.1 661.3 508.5M919.2 507.7C827.6 508.4 710.6 508.5 659 508.6M651 497.8C650.3 481 650.7 469.7 649.3 461M650.9 498.2C648.1 485.8 649.7 469.7 651.1 461.2M920.7 452.1Q929 451.7 929.1 461.4M930.5 498.5Q928.7 508.8 920.5 509.3M659.9 509.3Q649.3 509.3 649.3 496.5M649.7 462.9Q650.6 452.6 659.1 450.6" fill="none" stroke="#A78BFA" stroke-width="1.5" stroke-linecap="round"></path><text data-hk="000000010000000000004000010b13607a2710" x="790" y="477" font-size="14.5" fill="#A78BFA" text-anchor="middle">tool_result</text><text data-hk="000000010000000000004000010b13607a2720" x="790" y="496" font-size="12.5" fill="#9AA2AD" text-anchor="middle">Task result block</text><path data-hk="000000010000000000004000010b13607a280" d="M389.2 480C404.8 478.9 416.5 481.6 422.5 478.7M389.1 481.2C402.1 482 417.3 479.6 423.2 480.3" fill="none" stroke="#9AA2AD" stroke-width="1.2" stroke-linecap="round" stroke-dasharray="6 5"></path><path data-hk="000000010000000000004000010b13607a290" d="M597.3 480.2C614 479.4 634.5 480.4 642.4 479.7M596.9 480.6C617.7 480.1 631.1 479.5 641.4 478.6" fill="none" stroke="#9AA2AD" stroke-width="1.2" stroke-linecap="round" stroke-dasharray="6 5"></path><rect data-hk="000000010000000000004000010b13607a3000" x="101.5" y="537.5" width="277" height="53" rx="10" fill="#1A1E25"></rect><path data-hk="000000010000000000004000010b13607a3001" d="M109.3 536.5C199.3 534.7 308.2 537.3 369.3 535.8M111.2 535.5C197.2 539.1 312.9 537.1 370.4 535.9M379.9 545.2C379.7 561.1 380.1 570.4 378.6 582.4M380.9 546C382.1 560.3 380.5 571.9 381.2 582.5M370.8 591.7C257.7 589.9 187.4 588.5 108.8 593.2M369.9 591C259.5 590.7 184 593 108.8 591.8M100.3 582.4C100.8 566.4 99.8 553.2 99.6 547.1M101.4 582.3C97.7 568.1 101.8 551.5 101 544.9M370.6 537.2Q380.6 534.6 378.9 544.6M378.8 581.1Q381.3 592.3 369.5 592.1M109.1 591.1Q99.4 591.2 99.8 582.2M98.7 546.4Q99.5 535.3 109.8 536.3" fill="none" stroke="#4ADE80" stroke-width="1.5" stroke-linecap="round"></path><text data-hk="000000010000000000004000010b13607a3010" x="240" y="561" font-size="14.5" fill="#4ADE80" text-anchor="middle">/bashes</text><text data-hk="000000010000000000004000010b13607a3020" x="240" y="580" font-size="12.5" fill="#9AA2AD" text-anchor="middle">running shells</text><rect data-hk="000000010000000000004000010b13607a310" x="431.5" y="543.5" width="157" height="41" rx="10" fill="#1A1E25"></rect><path data-hk="000000010000000000004000010b13607a311" d="M438.5 541.2C483.7 539.2 534.8 542.1 581.4 540.9M440.7 542.8C483.9 541.5 539.1 543.5 580.6 541M589.1 550.6C590.3 563.6 589.5 569.5 590.4 577M589.1 551C590.5 561.7 590 568.1 590 576.5M579.1 587.2C531.8 585 485.1 587.7 440.4 585.8M581.3 587.1C533.3 583.5 487.2 585.7 440.7 584.5M428.6 575.8C431.1 564.2 428 556.6 429.1 553.2M429.7 576.1C430.1 567.9 429.5 558.5 430.5 550.9M579.2 541.4Q590.9 542 590.9 550.9M590.9 574.7Q590.1 587.2 578.9 584.9M439.6 586.1Q429.9 585.2 429.7 576.7M431 551Q428.5 542.4 439.8 542.7" fill="none" stroke="#DBD8CF" stroke-width="1.5" stroke-linecap="round"></path><text data-hk="000000010000000000004000010b13607a320" x="510" y="570" font-size="14.5" fill="#DBD8CF" text-anchor="middle">List</text><rect data-hk="000000010000000000004000010b13607a3300" x="651.5" y="537.5" width="277" height="53" rx="10" fill="#1A1E25"></rect><path data-hk="000000010000000000004000010b13607a3301" d="M660.4 534.8C782.6 534.1 856.2 536.6 921.2 537M659.9 536.1C748.6 537.1 857.8 536.3 921.4 536M929.7 546.6C929.9 561 931.3 574.1 930.2 582.8M931.4 545.9C930.6 559.2 930.3 574 930.3 581.5M921 592.7C831.3 590.1 717.6 593.3 660.5 592.6M919.4 592.3C823.4 594.5 708.2 592.2 660.7 591.1M650.8 581.9C650.1 571.3 650 557.9 648.7 546.3M650.2 582.4C649.2 567.7 649.5 554.8 648.6 545.1M920.5 537.2Q929.9 536.6 929.2 545.2M929.9 581.8Q929.1 593.3 918.6 592.7M660.4 591.7Q650.5 590.7 651.4 581.9M651 547.1Q651.4 537.1 660.8 535.1" fill="none" stroke="#A78BFA" stroke-width="1.5" stroke-linecap="round"></path><text data-hk="000000010000000000004000010b13607a3310" x="790" y="561" font-size="14.5" fill="#A78BFA" text-anchor="middle">ListAgents</text><text data-hk="000000010000000000004000010b13607a3320" x="790" y="580" font-size="12.5" fill="#9AA2AD" text-anchor="middle">running agents</text><path data-hk="000000010000000000004000010b13607a340" d="M388 564.6C401.9 565.9 415.4 563.6 420.9 564.7M387.1 563.6C400.5 564.2 412.3 563.4 422.2 563.6" fill="none" stroke="#9AA2AD" stroke-width="1.2" stroke-linecap="round" stroke-dasharray="6 5"></path><path data-hk="000000010000000000004000010b13607a350" d="M598.2 562.7C614.7 564.1 628.2 564.7 640.5 562.8M597.2 564.7C614.9 563.2 635 564.3 642.8 564.3" fill="none" stroke="#9AA2AD" stroke-width="1.2" stroke-linecap="round" stroke-dasharray="6 5"></path><text data-hk="000000010000000000004000010b136080" x="952" y="616" font-size="13" fill="#9AA2AD" text-anchor="end" transform="rotate(-0.6 952 616)">claude's map of its own tools</text></svg></figure>

两者最终都收敛到进程接口：`signal` + `stream in` + `stream out`。后台 shell、子智能体、开发服务器守护进程、远程函数，以及超出预算的普通调用，其实都是同一种对象：带 stdin、stdout、退出状态和信号句柄的作业。应由一个具有 stdio 形态的作业原语封装它们。这样，阻塞预算在一处执行，溢出输出写到统一产物路径，检查、发消息或终止任何作业都使用同一个接口，而不是每个工具各抄一份。

对可观测性的期待也相同。想看子智能体状态的用户，也想看后台 shell。在不同运行框架实例间互相发消息的智能体，也想看到对方运行的守护进程，这样同一目录中的 N 个智能体就能共享一个支持 HMR 的 `bun dev`，而不是在 N 个端口启动 N 份副本。

### 取消需要可强制终止的边界

扩展——也就是自定义工具——与引擎共享 JavaScript isolate，会酿成灾难。真正的热重载几乎不可能实现；工具调用一旦脱离协作式取消机制，就无法被强行停止。

JavaScript 和 Go 通过 `AbortSignal`、`context.Context` 提供取消机制：这些协议很有用，却没有强制执行力。忘记传递信号、调用不接受信号的依赖、执行同步工作，或进入无限重试循环，都会让超时仅仅告诉智能体继续往下走，而原来的工作仍可能在后台消耗资源。

因此，安全的主机必须拥有真正可以终止的执行单元——进程、worker、子解释器、VM 请求，或其他等效边界；终止它不能连会话权威状态一起毁掉。取消属于运行时契约，不能靠每个工具作者自觉。

### 让必要的边界好用起来

刻意保持简单的沙盒桩程序，还带来最后一个 SDK 问题：扩展作者现在面对两个文件系统。一个自定义编辑函数，可能不得不从一边读取文件，完整传输到另一边，再写回去。

这就是 omp² 为扩展选择 Python 的原因。Python 可以通过标准库检查自己的 AST，打包函数所需源码，再提交给另一个运行时；`@remote` 标记可以把看起来像本地函数的调用变成 RPC。Modal 的 Python SDK 等系统中，远程函数之所以自然好用，也是因为这个特性。

自带 Python 运行时，还让 `Eval` 变得可靠，不必依赖用户恰好安装了哪个解释器。一举两得。

工作有了可信的负责人和可取消的执行原语之后，运行框架仍然需要一套一致方式来控制配置值和多轮行为。这就是控制平面。

<a id="the-control-plane"></a>

## 控制平面

运行时负责两种不同控制。**配置值**回答当前使用哪个模型、服务档位、主题或策略；**行为**回答智能体是否可以交还控制权、是否必须再运行一轮，或是否临时需要某项能力。如果每个调用者都维护私有 setter 或标志，两者都会失去一致性。

### 配置值：在定义设置时声明策略

配置系统也变成了雷区：脏状态跟踪，多层配置——全局、会话级、临时级……大多数 get/set 操作像 Pi 一样，都经过 `AgentSession` 类型，因为变更必须持久化到 JSONL。

知道哪个配置系统多年前就解决了这些问题吗？没错，Source Engine！

尤其值得一提的是，玩过 Valve 游戏的人，大多不用查就知道 `sv_cheats` 做什么。大家自定义配置这么多年，我想不起有什么用户对此不满。其他软件的配置，你能想出类似例子吗？

[convar](https://developer.valvesoftware.com/wiki/ConVar) 是一个带类型的变量，包含名称、默认值、帮助文本和一组**标志位**，在定义处声明一次：

```jsx
ConVar sv_gravity("sv_gravity", "800", FCVAR_REPLICATED | FCVAR_NOTIFY, "World gravity.");
```

持久化、所有权、作用域、复制，甚至回放是否忠实，都是**变量的属性**，从定义之初就说清楚。没人需要通过一个上帝对象执行 `set`，也没人手写脏状态跟踪。

<figure data-hk="000000010000000000004000010b158"><svg data-hk="000000010000000000004000010b15900" viewBox="0 0 1000 610" role="img" aria-label="Convar model: the server owns sv_cheats, sv_gravity, mp_friendlyfire, and a protected sv_password; REPLICATED forces server values onto every read-only client copy, USERINFO sends the client-owned name upward, ARCHIVE persists cl_interp to config.cfg, CHEAT locks r_drawothermodels unless sv_cheats is 1, and every change is stamped into the .dem so replay stays honest" font-family="var(--st-font-sketch)"><defs><pattern id="cv-dots" width="22" height="22" patternUnits="userSpaceOnUse"><circle cx="11" cy="11" r="1.1" fill="#2E333C"></circle></pattern></defs><rect width="1000" height="610" fill="#121419"></rect><rect width="1000" height="610" fill="url(#cv-dots)"></rect><text data-hk="000000010000000000004000010b1590100" x="500" y="48" font-size="26" fill="#DBD8CF" text-anchor="middle" letter-spacing="2" stroke="#DBD8CF" stroke-width="0.8">FLAGS, NOT PLUMBING</text><path data-hk="000000010000000000004000010b1590110" d="M298.6 61.4C472.2 60.1 563.9 63.3 701.2 58.7M300.6 59.3C431.2 59.1 623.3 62.4 700.6 60.6" fill="none" stroke="#DBD8CF" stroke-width="2" stroke-linecap="round"></path><text data-hk="000000010000000000004000010b159020" x="500" y="88" font-size="13.5" fill="#9AA2AD" text-anchor="middle">ConVar("sv_gravity", "800", <tspan data-hk="000000010000000000004000010b159021" fill="#44CFFF">REPLICATED</tspan> | <tspan data-hk="000000010000000000004000010b159022" fill="#F5B04A">NOTIFY</tspan>, "World gravity.")</text><rect data-hk="000000010000000000004000010b159030" x="49.5" y="113.5" width="369" height="281" rx="0" fill="#1A1E25"></rect><path data-hk="000000010000000000004000010b159031" d="M48 112.9C205.4 109.6 304.8 108.5 422.6 110.8M46.6 111.7C169.4 112.6 326.8 113.9 422.3 111.1M421.1 110.3C418.9 233 421.4 330.8 421.5 395.7M420.2 111.7C418.7 232.1 422.5 333.7 420.8 397.7M421.4 394.7C281.3 393.4 158.8 395.7 47.6 396M421.3 397.1C283.5 391.7 173.2 396.9 47.5 395.4M47.3 398.4C45.5 261.9 45.7 165.6 47 111M47.2 398.5C47.2 272.3 46.2 162.1 47.6 111.3" fill="none" stroke="#DBD8CF" stroke-width="1.5" stroke-linecap="round" stroke-dasharray="7 5"></path><text data-hk="000000010000000000004000010b159040" x="68" y="144" font-size="17" fill="#DBD8CF" stroke="#DBD8CF" stroke-width="0.8">SERVER</text><text data-hk="000000010000000000004000010b159050" x="158" y="144" font-size="15" fill="#4ADE80">(one authority)</text><path data-hk="000000010000000000004000010b159060" d="M265.1 134.2Q273.7 143.7 282.5 132.4L291.3 121.1M265.1 135.4Q273.2 142.9 283.2 132.6L293.1 122.2" fill="none" stroke="#4ADE80" stroke-width="2.5" stroke-linecap="round"></path><text data-hk="000000010000000000004000010b159070" x="68" y="186" font-size="14.5" fill="#DBD8CF">sv_cheats <tspan data-hk="000000010000000000004000010b159071" fill="#9AA2AD">0</tspan></text><text data-hk="000000010000000000004000010b159080" x="68" y="226" font-size="14.5" fill="#DBD8CF">sv_gravity <tspan data-hk="000000010000000000004000010b159081" fill="#9AA2AD">800</tspan></text><text data-hk="000000010000000000004000010b159090" x="68" y="266" font-size="14.5" fill="#DBD8CF">mp_friendlyfire <tspan data-hk="000000010000000000004000010b159091" fill="#9AA2AD">0</tspan></text><text data-hk="000000010000000000004000010b1590a100" x="68" y="306" font-size="14.5" fill="#DBD8CF">sv_password <tspan data-hk="000000010000000000004000010b1590a101" fill="#9AA2AD">•••</tspan></text><text data-hk="000000010000000000004000010b1590a110" x="400" y="186" font-size="13" fill="#DBD8CF" text-anchor="end"><tspan data-hk="000000010000000000004000010b1590a111" fill="#44CFFF">REPLICATED</tspan> <tspan data-hk="000000010000000000004000010b1590a112" fill="#F5B04A">NOTIFY</tspan></text><text data-hk="000000010000000000004000010b1590a120" x="400" y="226" font-size="13" fill="#DBD8CF" text-anchor="end"><tspan data-hk="000000010000000000004000010b1590a121" fill="#44CFFF">REPLICATED</tspan> <tspan data-hk="000000010000000000004000010b1590a122" fill="#F5B04A">NOTIFY</tspan></text><text data-hk="000000010000000000004000010b1590a130" x="400" y="266" font-size="13" fill="#44CFFF" text-anchor="end">REPLICATED</text><text data-hk="000000010000000000004000010b1590a140" x="400" y="306" font-size="13" fill="#9AA2AD" text-anchor="end">PROTECTED</text><rect data-hk="000000010000000000004000010b1590a150" x="581.5" y="113.5" width="369" height="281" rx="18" fill="#1A1E25"></rect><path data-hk="000000010000000000004000010b1590a151" d="M599.1 112C719.4 115.7 839.5 112.7 934.7 112.6M596.7 113.1C724.8 111.1 872.5 113.8 934.5 111.4M953 128.9C955 242.2 952.6 314.5 952.2 378.3M951.1 130.9C949.3 224.4 952.7 322.4 950.9 378.9M933.1 395.1C806.9 397.4 673.8 398.2 598 396.7M934.6 394.8C811.5 397.1 684 394.3 599.2 396.2M581.4 379C578 261.1 583.9 171.3 580 130.9M579.7 378.9C580.6 297 577.5 187.7 580.5 129.9M933.8 112.6Q950.8 110.6 950.8 131.4M951.9 377.8Q952.5 395.5 933.3 395.8M597.7 395.8Q579.8 395.6 581 376.8M581.4 129.4Q579.7 111.7 599.3 112.8" fill="none" stroke="#F4644A" stroke-width="1.5" stroke-linecap="round"></path><text data-hk="000000010000000000004000010b1590a160" x="600" y="144" font-size="17" fill="#F4644A" stroke="#F4644A" stroke-width="0.8">CLIENT</text><text data-hk="000000010000000000004000010b1590a170" x="688" y="144" font-size="15" fill="#F4644A">(every player)</text><text data-hk="000000010000000000004000010b1590a180" x="600" y="186" font-size="14.5" fill="#44CFFF">sv_cheats <tspan data-hk="000000010000000000004000010b1590a181" fill="#9AA2AD">0</tspan></text><text data-hk="000000010000000000004000010b1590a190" x="600" y="226" font-size="14.5" fill="#44CFFF">sv_gravity <tspan data-hk="000000010000000000004000010b1590a191" fill="#9AA2AD">800</tspan></text><text data-hk="000000010000000000004000010b1590a200" x="600" y="266" font-size="14.5" fill="#DBD8CF">cl_interp <tspan data-hk="000000010000000000004000010b1590a201" fill="#9AA2AD">0.031</tspan></text><text data-hk="000000010000000000004000010b1590a210" x="600" y="306" font-size="14.5" fill="#DBD8CF">r_drawothermodels <tspan data-hk="000000010000000000004000010b1590a211" fill="#9AA2AD">1</tspan></text><text data-hk="000000010000000000004000010b1590a220" x="600" y="346" font-size="14.5" fill="#DBD8CF">name <tspan data-hk="000000010000000000004000010b1590a221" fill="#9AA2AD">"can"</tspan></text><text data-hk="000000010000000000004000010b1590a230" x="932" y="186" font-size="12.5" fill="#9AA2AD" text-anchor="end">read-only</text><text data-hk="000000010000000000004000010b1590a240" x="932" y="226" font-size="12.5" fill="#9AA2AD" text-anchor="end">read-only</text><text data-hk="000000010000000000004000010b1590a250" x="932" y="266" font-size="13" fill="#A78BFA" text-anchor="end">ARCHIVE</text><text data-hk="000000010000000000004000010b1590a260" x="932" y="306" font-size="13" fill="#F4644A" text-anchor="end">CHEAT</text><text data-hk="000000010000000000004000010b1590a270" x="932" y="346" font-size="13" fill="#4ADE80" text-anchor="end">USERINFO</text><text data-hk="000000010000000000004000010b1590a280" x="600" y="322" font-size="12" fill="#F4644A" transform="rotate(-1 600 322)">locked unless sv_cheats = 1</text><path data-hk="000000010000000000004000010b1590a290" d="M425.3 180C496.7 180.3 544.4 182.7 574.8 181.2M423.8 181.9C482.7 180.1 524.7 181.7 576 180.5M575.9 180.2C571.1 181.8 569.2 183.5 566 184.8M575.9 180.1C572.8 181.6 567.5 183.7 565.7 184.5M575.7 179.8C571.8 178.5 568.2 176.8 565.7 175.4M576.1 179.9C572.3 178.1 567.9 176.1 565.7 175.7" fill="none" stroke="#44CFFF" stroke-width="1.5" stroke-linecap="round"></path><path data-hk="000000010000000000004000010b1590a300" d="M422.9 218.9C489.7 218.5 543.6 219.1 574.3 221.3M424.6 220.3C476.8 220.3 533.3 222.3 576 219.3M575.9 220.1C572.5 221.4 568.6 222.9 566.2 224.7M575.7 219.9C571.9 222.2 569 223.3 565.7 224.1M575.8 219.8C572 218.7 568.5 216.5 566.2 215.5M576.3 220C571.5 217.7 568.5 216.4 565.8 215.8" fill="none" stroke="#44CFFF" stroke-width="1.5" stroke-linecap="round"></path><text data-hk="000000010000000000004000010b1590a310" x="500" y="198" font-size="13" fill="#44CFFF" text-anchor="middle" stroke="#44CFFF" stroke-width="0.8" transform="rotate(-1 500 198)">REPLICATED</text><text data-hk="000000010000000000004000010b1590a320" x="500" y="212" font-size="12" fill="#9AA2AD" text-anchor="middle">forced onto every client</text><path data-hk="000000010000000000004000010b1590a330" d="M576.2 339.6C500.3 339.1 463.3 341.4 422.2 341.3M575.1 340.5C506.4 339.2 463.6 341.3 426 341M423.8 339.8C428.5 338.2 431.1 337.2 433.9 335.2M423.7 339.9C428.6 337.9 431.9 337 433.8 335.8M424.3 340C427.9 341.7 431.4 343.2 433.8 344.5M423.8 340.2C427.9 341.8 431.3 343.5 434.3 344.4" fill="none" stroke="#4ADE80" stroke-width="1.5" stroke-linecap="round"></path><text data-hk="000000010000000000004000010b1590a340" x="500" y="328" font-size="12.5" fill="#4ADE80" text-anchor="middle">USERINFO · sent up</text><path data-hk="000000010000000000004000010b1590a350" d="M956.9 179.7Q986.5 222.4 985.7 241.4Q984.9 260.4 972.4 278.9L959.9 297.4M958.6 178.8Q985.8 221.9 986.1 240.8Q986.5 259.6 973.6 278.2L960.7 296.7M959.7 298.3C960.8 293.8 961.4 290.6 962.2 287.4M960.1 298.3C960.9 293.8 961.5 289.9 962 287.2M960.1 297.8C964.1 295.5 966.4 294.5 969.2 291.9M960.1 298.2C962.9 296.1 966.4 294.2 969.5 292.4" fill="none" stroke="#F4644A" stroke-width="1.5" stroke-linecap="round" stroke-dasharray="6 5"></path><path data-hk="000000010000000000004000010b1590a360" d="M234.7 394C232.6 411.1 235 430.5 235.7 439.9M234.7 395.6C235.8 417.6 235.1 426.4 233.7 437.6M233.9 438.1C232.1 433.7 230.9 430.9 229.6 427.8M234.2 438.1C232.3 435 231 431.2 229.7 427.6M234.1 438.1C236.2 433 237.7 429.5 238.5 427.7M234.3 438.1C236.2 433.4 237.9 429.3 238.8 427.6" fill="none" stroke="#A78BFA" stroke-width="1.5" stroke-linecap="round"></path><rect data-hk="000000010000000000004000010b1590a370" x="175.5" y="443.5" width="117" height="41" rx="0" fill="#1A1E25"></rect><path data-hk="000000010000000000004000010b1590a371" d="M172.9 443.3C231.4 441.9 266.6 442.4 294.9 441.7M172.7 441.5C220.6 444.3 261.9 441.4 293.1 440.6M294.9 440.7C294.3 454.6 294.2 474.1 293.9 487.7M293.7 441.1C296.1 461 292.7 471.2 294 487.7M293.4 485.7C235.7 487.8 210 486.6 173.3 486.7M294 486.3C256.3 486.1 206.3 485.2 172.7 486.1M174 484.8C174.1 468.6 173.4 453.7 173.3 443.3M174.1 486.5C174.8 469.2 174.6 448.4 172.9 441.5" fill="none" stroke="#A78BFA" stroke-width="1.5" stroke-linecap="round"></path><text data-hk="000000010000000000004000010b1590a380" x="234" y="470" font-size="14" fill="#A78BFA" text-anchor="middle" stroke="#A78BFA" stroke-width="0.8">.dem</text><text data-hk="000000010000000000004000010b1590a390" x="252" y="414" font-size="12.5" fill="#9AA2AD" transform="rotate(-0.5 252 414)">every change stamped into the demo,</text><text data-hk="000000010000000000004000010b1590a400" x="252" y="429" font-size="12.5" fill="#9AA2AD" transform="rotate(-0.5 252 429)">replay stays honest</text><path data-hk="000000010000000000004000010b1590a410" d="M766.4 396.4C767.2 411 765.9 432.1 765.1 438.5M765.9 396.9C767.7 410.3 767.4 431.5 766.2 437.9M766.2 438C764.4 434.1 762.6 430.6 761.5 427.7M765.9 438.1C764.8 434.6 762.7 430.9 761.3 427.9M765.8 437.9C767.4 434.9 769.3 430.5 770.4 428.1M766 438.3C767.2 434.8 768.9 431.3 770.4 428.3" fill="none" stroke="#A78BFA" stroke-width="1.5" stroke-linecap="round"></path><rect data-hk="000000010000000000004000010b1590a420" x="697.5" y="443.5" width="137" height="41" rx="0" fill="#1A1E25"></rect><path data-hk="000000010000000000004000010b1590a421" d="M693.8 442.6C759.2 442 809.3 443.7 838.5 441.2M694.1 441.8C738.7 442.9 790.3 442.4 838.6 441.8M835.5 441.5C837 463 834.6 480.1 836.2 486.8M837.4 439.5C836.1 454.5 836.6 479.3 836.3 486.4M836.7 485.9C774.1 484.3 740.2 484.7 696.4 487.2M837.4 485.8C770.2 486.7 729.3 489.2 694.7 485.8M694.9 487.4C695.3 469.2 696.8 451.8 696 442.8M696.8 486.5C694.7 465.9 698 453.2 696.4 441.9" fill="none" stroke="#A78BFA" stroke-width="1.5" stroke-linecap="round"></path><text data-hk="000000010000000000004000010b1590a430" x="766" y="470" font-size="14" fill="#A78BFA" text-anchor="middle" stroke="#A78BFA" stroke-width="0.8">config.cfg</text><text data-hk="000000010000000000004000010b1590a440" x="784" y="414" font-size="12.5" fill="#9AA2AD" transform="rotate(-0.5 784 414)">ARCHIVE vars written to disk,</text><text data-hk="000000010000000000004000010b1590a450" x="784" y="429" font-size="12.5" fill="#9AA2AD" transform="rotate(-0.5 784 429)">everything else is ephemeral</text><text data-hk="000000010000000000004000010b1590a460" x="500" y="520" font-size="13" fill="#9AA2AD" text-anchor="middle"><tspan data-hk="000000010000000000004000010b1590a461" fill="#F5B04A">NOTIFY</tspan> = change announced to every player&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;PROTECTED = value never leaves the server</text><path data-hk="000000010000000000004000010b1590a470" d="M47.1 539.5C346.6 538.5 813.4 542.6 953.2 541M48.8 540.5C471.2 538.9 805.4 542.3 951.2 540.2" fill="none" stroke="#9AA2AD" stroke-width="1" stroke-linecap="round"></path><text data-hk="000000010000000000004000010b1590a480" x="500" y="572" font-size="15.5" fill="#DBD8CF" text-anchor="middle"><tspan data-hk="000000010000000000004000010b1590a481" fill="#F4644A">set() through a god object + dirty tracking</tspan>&nbsp;&nbsp;-&gt;&nbsp;&nbsp;<tspan data-hk="000000010000000000004000010b1590a482" fill="#4ADE80">flags where the variable is born</tspan></text><text data-hk="000000010000000000004000010b1590a490" x="952" y="600" font-size="13" fill="#9AA2AD" text-anchor="end" transform="rotate(-1 952 600)">one store. flags decide the rest.</text></svg><figcaption>One authoritative server store, mirrored to every client. REPLICATED pushes values down, USERINFO sends client-owned vars up, CHEAT locks vars behind <code data-hk="000000010000000000004000010b16000">sv_cheats</code>, ARCHIVE decides what reaches <code data-hk="000000010000000000004000010b16100">config.cfg</code> — and every change is stamped into the <code data-hk="000000010000000000004000010b16200">.dem</code>.</figcaption></figure>

convar 不是会话 DOM 旁边的第二个配置数据库。会话级 convar 就是权威树上另一个记入日志的节点；其标志声明它如何参与恢复、回退、派生子会话、复制和归档。

### 继承不该需要第二个设置

如今 omp 的服务档位，也就是 `/fast`，专门给子智能体设了另一项配置。

```jsx
tier:
  openai: priority
  subagent: inherit   # separate setting
```

在 convar 体系里，`ai_fastmode` 只有*一个*变量，标记为 `SESSION`：随会话写入日志，恢复时自然恢复其值。继承甚至不需要标志：默认情况下，新建子会话的*所有*变量都以父会话当前值初始化，无需主动启用。

想把子会话固定到特定值？一行就够：

```jsx
# subagent.cfg — auto-exec'd for every spawn
ai_fastmode 0

# sonic.cfg — auto-exec'd when a sonic spawns, class config
ai_model @smol
ai_thinking low
```

主会话用 `config.cfg`；任意数量的用户 cfg 都能充当配置方案；每次派生子会话自动执行 `subagent.cfg`，再叠加 `<agent>.cfg`。顺便解决了那个拥有一千个属性的上帝对象。TF2 早就知道该怎么做！

现在，一个值就能描述主会话及其子会话。继承规则位于变量定义处，不再成为不断膨胀的会话上帝对象上的又一个属性。

### 配置方案和快捷键沿用同一命令通道

有了 cfg，再加上绑定就更好了——`bind`、`toggle` 和 `alias` 本身也是控制台命令。我们不断为之发明 schema 的各种输入模式，都能留在同一命令体系里。用户想绑定一个隐藏思考内容的快捷键？

```jsx
bind ctrl+t "cl_showthinking 0"        # careful — one-way; the second press still writes 0
bind ctrl+t "toggle cl_showthinking"   # there we go; toggle also cycles value lists

alias +thinkhud "cl_showthinking 1"         # fires on key-down...
alias -thinkhud "cl_showthinking 0"         # ...and on key-up
bind ctrl+h +thinkhud                       # hold to peek at the thinking stream
```

这才应该是我们的快捷键层，而不是一套附带独立默认值表的专用 schema！

命令流把一切连接起来：cfg 文件、控制台输入、别名、按键绑定、远程管理和日志回放，都围绕同一批声明变量，使用同一种语言。定制不再催生一套又一套一次性 schema。


### 行为：循环形状的缺口

另一个值得关注的话题是可扩展性。我认为 Pi 的扩展层确实很出色，但它有一个“循环”形状的缺口。

我安装了 Pi 中最流行的 Plan 和 Goal 实现，同时启用两者，结果是：

<figure data-hk="000000010000000000004000010b181"><img src="https://stencil.so/blog/harness-playbook/plan-goal-mutex.png" width="776" height="130" alt="Pi status line showing: Warning: Another workflow is active in this session. End it before starting Plan mode." loading="lazy"></figure>

好吧！有意思，可这里并没有“工作流”API。那它们怎么实现的？答案是各自定义：

```jsx
export const WORKFLOW_MUTEX_CHANNEL = "workflow:mutex:v1";
export const AGENT_WORKFLOW_GROUP = "agent-workflow";

export class WorkflowMutex {
  private session: object | undefined;
  private readonly heldGroups = new Map<string, WorkflowMutexOwner>();
  private generation = 0;
  private readonly pi: Pick<ExtensionAPI, "events">;

  constructor(pi: Pick<ExtensionAPI, "events">) {
    this.pi = pi;
    pi.events.on(WORKFLOW_MUTEX_CHANNEL, (payload) => {
      this.answer(payload);
    });
  }
```

原来如此！这两个实现来自同一个作者。他遇到这个问题后，做出了一套能在自己那组插件之间协作的方案。

引入系统来封装这种行为的复杂性，被转嫁给了插件作者；而他们只能构建在自家扩展之间有效的系统。

omp 也有类似问题：

```jsx
// modes/interactive-mode.ts — the exclusivity "system", in its entirety
if (this.goalModeEnabled || this.goalModePaused) { this.showWarning("Exit goal mode first."); return; }
if (this.vibeModeEnabled)                        { this.showWarning("Exit vibe mode first."); return; }
// …restated by hand at six other entry points
```

独立编写的行为一碰面，缺失的抽象就暴露出来了。私有互斥锁可以防止同一作者的 Plan 和 Goal 插件冲突，却无法让任意扩展组合。omp 手写的模式检查也有同样的局限。

由此得出两个决定：给负责控制循环的原语一个名字——**Director**——并把更多内置行为移到公共扩展接口上，让接口的缺口无法再被忽视。

### Director 负责裁决候选交还点

智能体有一个循环。越来越多的功能想指挥这个循环：plan 希望在计划完成前再运行一轮，goal 希望在目标完成前再运行一轮，`/force` 希望改变下一次模型推理，待办提醒希望在交还控制权之前再获得一次提出异议的机会。

那就给**智能体层**一个统一负责这项决策的对象：Director 栈。

这里的“栈”指会话 DOM 中一棵实时子树，不是一个承诺以后再序列化的 Python 数组。DOM 才是权威来源；运行时只是遍历它。

```jsx
candidate yield flows this way ────────────────────────────────┐
                                                               ▼
Base  →  TodoReminder  →  Goal  →  Plan  →  ForceTool(write)
                                                parent    child/top
```

循环依旧平平无奇：

```jsx
while True:
    request = directors.prepare_inference(base_request)  # outside → inside
    turn = await inference(request)
    await execute_tools(turn)

    if turn.has_tool_calls:
        continue

    decision = await directors.on_yield(turn)            # inside → outside
    match decision:
        case Continue(): continue
        case Yield():    return
```

`prepare_inference` 从外向内遍历栈，让最内层行为可以细化父级即将发出的请求。`on_yield` 则反向向外遍历。每个 Director 可以：

- **Pass**：让下一个 Director 检查这次候选交还。
- **Continue**：接管这次交还，继续运行一轮。
- **Yield**：接管这次交还，真正把控制权交给用户。
- **Push**：在自身上方压入一个子 Director。
- **Done**：弹出自身，再把同一次候选交还提交给父级。
- **Fail**：带错误弹出。

因此，回退会移除 Director，恢复会话会还原它们，远程检查器也能看到当前由哪个行为负责裁决候选交还。

### 完整实现计划模式

假设计划模式已经启用，模型还没写计划文件就想交还控制权。Plan 会先于任何外层行为看到这次候选交还：

```jsx
class Plan(Director):
    async def on_yield(self, agent, turn):
        if not turn.wrote(self.plan_file):
            return agent.force_tool(
                "write",
                until=lambda turn: turn.wrote(self.plan_file),
                reminder="Write the plan file before yielding.",
                retries=3,
            )

        if not turn.called("ask") and not turn.proposed_plan():
            return agent.force_tool(
                "required",
                until=lambda turn: turn.called("ask") or turn.proposed_plan(),
                reminder="Propose the plan, or ask the user what is missing.",
                retries=3,
            )

        return Yield()
```

随后，软模式下的 `force_tool("write")` 会压入一个小型内置 Director，向下一次推理请求添加相应能力要求：

```python
class ForceTool(Director):
    def prepare_inference(self, request):
        return request.with_tool_choice(self.tool)

    async def on_yield(self, agent, turn):
        if self.until(turn):
            return Done()                    # pop; offer the yield back to Plan
        if self.retries_left:
            return Continue(self.reminder)
        return Fail("tool requirement exhausted")
```

Plan 下方原本还有另一个 Director：

```jsx
Base → TodoReminder → Plan
```

候选交还先到达 Plan。Plan 活跃时，要么继续，要么压入子 Director，要么直接把控制权交给用户。它不会 `Pass`，所以外层 TodoReminder 看不到这次交还。

扩展使用完全相同的接口：

```jsx
await agent.direct(VerifyBeforeYield(...))
```
```jsx
<directors>
  <todo-reminder id="d1">
    <plan id="d2" plan-file="local://auth-plan.md">
      <force-tool id="d3" tool="write" attempts="1" max-attempts="3"/>
    </plan>
  </todo-reminder>
</directors>
```

这是一套完整的组合机制，而不是又一个特殊模式。Plan 负责交还决策，临时压入 ForceTool，在子级结束后重新收到同一次候选交还，再决定继续还是交给用户。

### 钩子、Director 与模型推理

- **钩子**观察或修改一次推理或一轮执行。
- **Director** 可以跨轮次保有控制权，拦截交还。
- Director 能以有明确语义的方式堆叠、嵌套、结束，并恢复父级。

这足以让 plan、goal、vibe、autoresearch、提醒和外部验证行为使用同一个智能体层原语，无需让每种行为了解其他所有行为的私有标志。

`ForceTool` 表达的是语义请求：“下一次成功的轮次必须调用 `write`。”它不知道所选提供商有没有原生 `tool_choice`，不知道强制调用会不会破坏缓存，也不知道本地模型是否需要额外提示。这个转换属于推理层。

控制平面现在能够表达应该发生什么。下一章要让这份要求在互不兼容的模型和提供商之间，仍然具有相同含义。

<a id="the-inference"></a>

## 模型推理

控制平面请求的是语义行为：让这个模型流式输出，强制使用那项能力，约束这种结构，统计这些 token。推理层则必须把请求转换为：这个具体模型，在这个具体主机上，通过这个具体 API，实际能做到的事情。

### omp 给我们的教训：特殊行为会变成架构

这点很好解释，因为 omp v1 已经有一个前后对照提交。

在 `dd57045396` 之前，OpenAI 兼容性逻辑集中在一个 880 行的文件里，围绕一个巨大的构建器展开。打开文件，迎面就是：

```jsx
const isCerebras = modelMatchesHost(hostModel, "cerebras");
const isZai = modelMatchesHost(hostModel, "zai");
const isKimiModel = isKimiModelId(spec.id);
const isMoonshotKimi = isKimiModel && isMoonshotNative;
const isAnthropicModel =
    modelMatchesHost(hostModel, "anthropic") ||
    isClaudeModelId(spec.id) ||
    isAnthropicNamespacedModelId(spec.id);
// …then DeepSeek, Qwen, MiMo, Grok, Mistral, OpenCode, local servers
```

这些布尔值又派生出其他布尔值，再经过几层嵌套三元表达式，最后生成一个巨大的 `compat` 对象。Kimi 能不能在思考时强制调用工具？取决于哪个 Kimi、运行在哪个主机、通过哪个 API。这个回环地址代表 llama.cpp，还是代理其他服务的 LiteLLM？再加一个特判吧。

单看任何一个分支，都没有错！每个分支都修复了真实的提供商问题。问题是，同一份知识最终被编码到了多个地方：

- `compat/openai.ts`：880 行。
- `model-thinking.ts`：977 行。
- `variant-collapse.ts`：1,776 行。
- 独立的 Bedrock、Anthropic 和 Devin 兼容性构建器。
- 服务发现和提供商序列化器里，还有更多基于名称的识别逻辑。

替代它们的是什么？

```jsx
taxonomy/   "what model is this string?"
classes/    "what is true of this model lineage?"
providers/  "what does this host change?"
```

现在，Anthropic 的思考能力规则读起来是这样：

```jsx
class "anthropic" {
    on "anthropic" "amazon-bedrock" "google-vertex" {
        family "sonnet" {
            revision ">=3.7 <4.6" { thinking-mode "budget" }
        }
        revision ">=4.7" {
            thinking-mode "anthropic-adaptive"
        }
    }
}
```

这才是我们真正想表达的知识！Sonnet 4.6 之前的版本使用预算式思考；Anthropic 4.7 及之后使用自适应思考；而且只对已经验证过的主机作此判断。

KDL 本身并没有魔法。真正让我们避免用更漂亮的格式重建一团乱麻的，是编译器：

- 未知指令或取值？报错。
- 两条同等具体的规则设置同一项？报错——文件顺序不能偷偷决定谁赢。
- 没有匹配规则？是未知，不是“false”。

这让提供商不再古怪了吗？当然没有。我们仍有 `requires-mistral-tool-ids`、`qwen-preserve-thinking`、`strip-deepseek-special-tokens` 这样的兼容性维度，还有十种“关闭推理”的写法。看看这些名字，真让人想哭。

它免除的，是为下一个怪癖再到四个函数里各加一个分支。现在只需在负责这个事实的地方写一条规则；优先级有歧义，编译器就会大声报错。推理层终于能回答：*这个具体模型在这个具体主机上，到底支持什么？*

收益不是怪癖更少了，而是每个事实都有唯一负责人、优先级明确，并且当库尚未确定答案时，能表示 `unknown`。运行框架其余部分，不再靠提供商名称分支反复猜测模型身份。

### 提供商不只是 `stream`

我为 Pi 实现 Web 搜索插件时，这个问题几乎注定会回来找我。事实上，同样的压力也冲击了仓库最初的极简设计，Pi 新增的[图像模型](https://github.com/earendil-works/pi/blob/main/packages/ai/src/image-models.ts)实现就说明了这一点。

Pi 将提供商建模为 `stream` 和 `streamSimple`，基本就这些！这很适合快速接入一个提供商，却不适合在其上不断叠加能力，因为：

- Anthropic 的 token 计数接口怎么办？
- Codex 的 WebRTC 语音端点和远程压缩呢？
- Anthropic／OpenAI 的 Web 搜索呢？
- 嵌入向量呢？
- 图像／视频生成呢？
- 分词呢？
- 用量查询呢？
- 模型发现呢？

你觉得每个做这些事的扩展，都正确实现了同步协调的 OAuth 刷新和重试吗？

此外，能使用推理提供商最新的控制能力，本身就很有价值，例如：

- 约束采样。
- OpenAI 的文本详细程度选项。
- Google 的上下文过滤选项。
- 强制工具调用。
- Developer 角色。
- 会话中途的系统提示词。
- ……

认证刷新、重试、token 计数、搜索、生成、发现和提供商原生控制，都是共享基础设施。把它们留给扩展，就必然会出现同一协议的多个残缺实现。

### 能力策略：强制工具调用

强制工具调用很好地说明了，为什么“支持一个标志”还不够：

- **遇到不支持的提供商就报错**：任何原生功能想使用它，都得排除一大批模型。
- **悄悄忽略**：调用者意外得到尽力而为的执行路径，只能自己发明强制执行循环。
- **盲目透传**：提供商的副作用会变成产品缺陷。例如，Anthropic 的强制调用可能导致整个对话缓存未命中。
- **不暴露能力**：了解内情的调用者会绕过库，把上述三种失败模式再实现一遍。

理想的运行框架实现应当：

1. 始终注入软提示，告诉模型下一轮必须调用该工具。无条件这样做是值得的：OpenAI 等托管 API 会悄悄替你加上这种提示，开源推理引擎却不会。因此，vLLM 后面的模型可能面对一个从未被告知的硬约束，在启用推理时无所适从。软提示抹平了这项差异。
2. 只有没有额外代价时，才设置原生标志。如果提供商支持强制工具调用且无副作用，就透传；如果有代价，就跳过标志，只依靠软提示。
3. 不服从时逐步升级。如果模型没有调用工具，就在有限次数内重试；最后手段是在有代价的情况下也设置原生标志。说服失败之后，正确性优先于缓存。

<figure data-hk="000000010000000000004000010b250"><div data-hk="000000010000000000004000010b2510" role="img" aria-label="Flowchart of the forced-tool-call strategy: always inject a soft prompt telling the model it must call the tool; set the native tool_choice flag only when the provider supports forcing without side effects; if the model still does not call the tool, bounded retries escalate to setting the flag despite its cost before surfacing failure to the caller."><svg id="forced-tool-call-0" width="100%" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" style="max-width: 755.3125px;" viewBox="0 0 755.3125 1275.621826171875" role="graphics-document document" aria-roledescription="flowchart-v2"><g><marker id="forced-tool-call-0_flowchart-v2-pointEnd" viewBox="0 0 10 10" refX="5" refY="5" markerUnits="userSpaceOnUse" markerWidth="8" markerHeight="8" orient="auto"><path d="M 0 0 L 10 5 L 0 10 z" style="stroke-width: 1; stroke-dasharray: 1, 0;"></path></marker><marker id="forced-tool-call-0_flowchart-v2-pointStart" viewBox="0 0 10 10" refX="4.5" refY="5" markerUnits="userSpaceOnUse" markerWidth="8" markerHeight="8" orient="auto"><path d="M 0 5 L 10 10 L 10 0 z" style="stroke-width: 1; stroke-dasharray: 1, 0;"></path></marker><marker id="forced-tool-call-0_flowchart-v2-pointEnd-margin" viewBox="0 0 11.5 14" refX="11.5" refY="7" markerUnits="userSpaceOnUse" markerWidth="10.5" markerHeight="14" orient="auto"><path d="M 0 0 L 11.5 7 L 0 14 z" style="stroke-width: 0; stroke-dasharray: 1, 0;"></path></marker><marker id="forced-tool-call-0_flowchart-v2-pointStart-margin" viewBox="0 0 11.5 14" refX="1" refY="7" markerUnits="userSpaceOnUse" markerWidth="11.5" markerHeight="14" orient="auto"><polygon points="0,7 11.5,14 11.5,0" style="stroke-width: 0; stroke-dasharray: 1, 0;"></polygon></marker><marker id="forced-tool-call-0_flowchart-v2-circleEnd" viewBox="0 0 10 10" refX="11" refY="5" markerUnits="userSpaceOnUse" markerWidth="11" markerHeight="11" orient="auto"><circle cx="5" cy="5" r="5" style="stroke-width: 1; stroke-dasharray: 1, 0;"></circle></marker><marker id="forced-tool-call-0_flowchart-v2-circleStart" viewBox="0 0 10 10" refX="-1" refY="5" markerUnits="userSpaceOnUse" markerWidth="11" markerHeight="11" orient="auto"><circle cx="5" cy="5" r="5" style="stroke-width: 1; stroke-dasharray: 1, 0;"></circle></marker><marker id="forced-tool-call-0_flowchart-v2-circleEnd-margin" viewBox="0 0 10 10" refY="5" refX="12.25" markerUnits="userSpaceOnUse" markerWidth="14" markerHeight="14" orient="auto"><circle cx="5" cy="5" r="5" style="stroke-width: 0; stroke-dasharray: 1, 0;"></circle></marker><marker id="forced-tool-call-0_flowchart-v2-circleStart-margin" viewBox="0 0 10 10" refX="-2" refY="5" markerUnits="userSpaceOnUse" markerWidth="14" markerHeight="14" orient="auto"><circle cx="5" cy="5" r="5" style="stroke-width: 0; stroke-dasharray: 1, 0;"></circle></marker><marker id="forced-tool-call-0_flowchart-v2-crossEnd" viewBox="0 0 11 11" refX="12" refY="5.2" markerUnits="userSpaceOnUse" markerWidth="11" markerHeight="11" orient="auto"><path d="M 1,1 l 9,9 M 10,1 l -9,9" style="stroke-width: 2; stroke-dasharray: 1, 0;"></path></marker><marker id="forced-tool-call-0_flowchart-v2-crossStart" viewBox="0 0 11 11" refX="-1" refY="5.2" markerUnits="userSpaceOnUse" markerWidth="11" markerHeight="11" orient="auto"><path d="M 1,1 l 9,9 M 10,1 l -9,9" style="stroke-width: 2; stroke-dasharray: 1, 0;"></path></marker><marker id="forced-tool-call-0_flowchart-v2-crossEnd-margin" viewBox="0 0 15 15" refX="17.7" refY="7.5" markerUnits="userSpaceOnUse" markerWidth="12" markerHeight="12" orient="auto"><path d="M 1,1 L 14,14 M 1,14 L 14,1" style="stroke-width: 2.5;"></path></marker><marker id="forced-tool-call-0_flowchart-v2-crossStart-margin" viewBox="0 0 15 15" refX="-3.5" refY="7.5" markerUnits="userSpaceOnUse" markerWidth="12" markerHeight="12" orient="auto"><path d="M 1,1 L 14,14 M 1,14 L 14,1" style="stroke-width: 2.5; stroke-dasharray: 1, 0;"></path></marker><g><g></g><g><path d="M267.715,76L267.715,76L267.715,102L267.715,102L267.715,124" id="forced-tool-call-0-L_A_B_0" style=";" data-edge="true" data-et="edge" data-id="L_A_B_0" data-points="W3sieCI6MjY3LjcxNDg0Mzc1LCJ5Ijo3Nn0seyJ4IjoyNjcuNzE0ODQzNzUsInkiOjEwMn0seyJ4IjoyNjcuNzE0ODQzNzUsInkiOjEyOH1d" data-look="classic" marker-end="url(#forced-tool-call-0_flowchart-v2-pointEnd)"></path><path d="M267.715,214L267.715,214L267.715,240L267.715,240L267.715,262" id="forced-tool-call-0-L_B_C_0" style=";" data-edge="true" data-et="edge" data-id="L_B_C_0" data-points="W3sieCI6MjY3LjcxNDg0Mzc1LCJ5IjoyMTR9LHsieCI6MjY3LjcxNDg0Mzc1LCJ5IjoyNDB9LHsieCI6MjY3LjcxNDg0Mzc1LCJ5IjoyNjZ9XQ==" data-look="classic" marker-end="url(#forced-tool-call-0_flowchart-v2-pointEnd)"></path><path d="M293.308,430.813L318.012,430.813L318.012,498.006L355.931,498.006L355.931,536.748" id="forced-tool-call-0-L_C_E_0" style=";" data-edge="true" data-et="edge" data-id="L_C_E_0" data-points="W3sieCI6MjkzLjMwNzY4MDAyOTkxMTc1LCJ5Ijo0MzAuODEzNDEzNzIwMDg4MjV9LHsieCI6MzE4LjAxMTcxODc1LCJ5Ijo0OTguMDA2MjUwMzgxNDY5N30seyJ4IjozNTguNzI5MTQ2MTY2NTk3OTYsInkiOjUzOS42MDYyNTA3NjI5Mzk1fV0=" data-look="classic" marker-end="url(#forced-tool-call-0_flowchart-v2-pointEnd)"></path><path d="M221.234,409.925L137.203,409.925L137.203,498.006L137.203,498.006L137.203,544.606" id="forced-tool-call-0-L_C_D_0" style=";" data-edge="true" data-et="edge" data-id="L_C_D_0" data-points="W3sieCI6MjIxLjIzMzYxMTA1MDQ0MTM3LCJ5Ijo0MDkuOTI1MDE3MzAwNDQxM30seyJ4IjoxMzcuMjAzMTI1LCJ5Ijo0OTguMDA2MjUwMzgxNDY5N30seyJ4IjoxMzcuMjAzMTI1LCJ5Ijo1NDguNjA2MjUwNzYyOTM5NX1d" data-look="classic" marker-end="url(#forced-tool-call-0_flowchart-v2-pointEnd)"></path><path d="M322.881,401.24L456.211,401.24L456.211,498.006L423.471,498.006L423.471,536.557" id="forced-tool-call-0-L_C_E_2" style=";" data-edge="true" data-et="edge" data-id="L_C_E_2" data-points="W3sieCI6MzIyLjg4MDcyMjE3Nzg4NjIsInkiOjQwMS4yNDAzNzE1NzIxMTM3Nn0seyJ4Ijo0NTYuMjEwOTM3NSwieSI6NDk4LjAwNjI1MDM4MTQ2OTd9LHsieCI6NDIwLjg4MjIzMzY1MDU5ODk1LCJ5Ijo1MzkuNjA2MjUwNzYyOTM5NX1d" data-look="classic" marker-end="url(#forced-tool-call-0_flowchart-v2-pointEnd)"></path><path d="M137.203,598.606L137.203,598.606L137.203,633.606L200.087,633.606L200.087,658.779" id="forced-tool-call-0-L_D_F_0" style=";" data-edge="true" data-et="edge" data-id="L_D_F_0" data-points="W3sieCI6MTM3LjIwMzEyNSwieSI6NTk4LjYwNjI1MDc2MjkzOTV9LHsieCI6MTM3LjIwMzEyNSwieSI6NjMzLjYwNjI1MDc2MjkzOTV9LHsieCI6MjAzLjgwMDc4MTI1LCJ5Ijo2NjAuMjY1NzMyNTk2NDUxN31d" data-look="classic" marker-end="url(#forced-tool-call-0_flowchart-v2-pointEnd)"></path><path d="M392.008,607.606L392.008,607.606L392.008,633.606L329.124,633.606L329.124,658.779" id="forced-tool-call-0-L_E_F_0" style=";" data-edge="true" data-et="edge" data-id="L_E_F_0" data-points="W3sieCI6MzkyLjAwNzgxMjUsInkiOjYwNy42MDYyNTA3NjI5Mzk1fSx7IngiOjM5Mi4wMDc4MTI1LCJ5Ijo2MzMuNjA2MjUwNzYyOTM5NX0seyJ4IjozMjUuNDEwMTU2MjUsInkiOjY2MC4yNjU3MzI1OTY0NTE3fV0=" data-look="classic" marker-end="url(#forced-tool-call-0_flowchart-v2-pointEnd)"></path><path d="M238.82,709.606L212.004,709.606L212.004,735.606L212.004,735.606L212.004,757.606" id="forced-tool-call-0-L_F_G_0" style=";" data-edge="true" data-et="edge" data-id="L_F_G_0" data-points="W3sieCI6MjM4LjgyMDM4OTA5MzEzNzI3LCJ5Ijo3MDkuNjA2MjUwNzYyOTM5NX0seyJ4IjoyMTIuMDAzOTA2MjUsInkiOjczNS42MDYyNTA3NjI5Mzk1fSx7IngiOjIxMi4wMDM5MDYyNSwieSI6NzYxLjYwNjI1MDc2MjkzOTV9XQ==" data-look="classic" marker-end="url(#forced-tool-call-0_flowchart-v2-pointEnd)"></path><path d="M180.559,884.568L134.898,884.568L134.898,951.013L134.898,951.013L134.898,1028.817" id="forced-tool-call-0-L_G_H_0" style=";" data-edge="true" data-et="edge" data-id="L_G_H_0" data-points="W3sieCI6MTgwLjU1OTA0MTQxNzU1MDUsInkiOjg4NC41Njc2MzU5MzA0ODk5fSx7IngiOjEzNC44OTg0Mzc1LCJ5Ijo5NTEuMDEyNTAwNzYyOTM5NX0seyJ4IjoxMzQuODk4NDM3NSwieSI6MTAzMi44MTcxODgyNjI5Mzk1fV0=" data-look="classic" marker-end="url(#forced-tool-call-0_flowchart-v2-pointEnd)"></path><path d="M243.449,884.568L289.109,884.568L289.109,951.013L289.109,951.013L289.109,982.013" id="forced-tool-call-0-L_G_I_0" style=";" data-edge="true" data-et="edge" data-id="L_G_I_0" data-points="W3sieCI6MjQzLjQ0ODc3MTA4MjQ0OTUsInkiOjg4NC41Njc2MzU5MzA0ODk4fSx7IngiOjI4OS4xMDkzNzUsInkiOjk1MS4wMTI1MDA3NjI5Mzk1fSx7IngiOjI4OS4xMDkzNzUsInkiOjk4Ni4wMTI1MDA3NjI5Mzk1fV0=" data-look="classic" marker-end="url(#forced-tool-call-0_flowchart-v2-pointEnd)"></path><path d="M289.109,1129.622L289.109,1129.622L289.109,1164.622L313.366,1164.622L313.366,1196.441" id="forced-tool-call-0-L_I_J_0" style=";" data-edge="true" data-et="edge" data-id="L_I_J_0" data-points="W3sieCI6Mjg5LjEwOTM3NSwieSI6MTEyOS42MjE4NzU3NjI5Mzk1fSx7IngiOjI4OS4xMDkzNzUsInkiOjExNjQuNjIxODc1NzYyOTM5NX0seyJ4IjozMTUuNzkxMzI2OTkyNzUzNiwieSI6MTE5OS42MjE4NzU3NjI5Mzk1fV0=" data-look="classic" marker-end="url(#forced-tool-call-0_flowchart-v2-pointEnd)"></path><path d="M404.389,1199.622L468.91,1199.622L468.91,1164.622L468.91,1164.622L468.91,1057.817L468.91,1057.817L468.91,951.013L468.91,951.013L468.91,838.809L468.91,838.809L468.91,735.606L329.291,735.606L329.291,700.754" id="forced-tool-call-0-L_J_F_0" style=";" data-edge="true" data-et="edge" data-id="L_J_F_0" data-points="W3sieCI6NDA0LjM4ODgxMzQwNTc5NzEsInkiOjExOTkuNjIxODc1NzYyOTM5NX0seyJ4Ijo0NjguOTEwMTU2MjUsInkiOjExNjQuNjIxODc1NzYyOTM5NX0seyJ4Ijo0NjguOTEwMTU2MjUsInkiOjEwNTcuODE3MTg4MjYyOTM5NX0seyJ4Ijo0NjguOTEwMTU2MjUsInkiOjk1MS4wMTI1MDA3NjI5Mzk1fSx7IngiOjQ2OC45MTAxNTYyNSwieSI6ODM4LjgwOTM3NTc2MjkzOTV9LHsieCI6NDY4LjkxMDE1NjI1LCJ5Ijo3MzUuNjA2MjUwNzYyOTM5NX0seyJ4IjozMjUuNDEwMTU2MjUsInkiOjY5OS43ODQ3NTI1NDEwNzQxfV0=" data-look="classic" marker-end="url(#forced-tool-call-0_flowchart-v2-pointEnd)"></path><path d="M343.603,1075.129L625.313,1075.129L625.313,1164.622L625.313,1164.622L625.313,1204.622" id="forced-tool-call-0-L_I_K_0" style=";" data-edge="true" data-et="edge" data-id="L_I_K_0" data-points="W3sieCI6MzQzLjYwMjY4MTA5MDczMjc0LCJ5IjoxMDc1LjEyODU2OTY3MjIwNjh9LHsieCI6NjI1LjMxMjUsInkiOjExNjQuNjIxODc1NzYyOTM5NX0seyJ4Ijo2MjUuMzEyNSwieSI6MTIwOC42MjE4NzU3NjI5Mzk1fV0=" data-look="classic" marker-end="url(#forced-tool-call-0_flowchart-v2-pointEnd)"></path></g><g><g><g data-id="L_A_B_0" transform="translate(0, 0)"><text y="-10.1" text-anchor="middle"><tspan x="0" y="-0.1em" dy="1.1em" text-anchor="middle"></tspan></text></g></g><g><rect style="stroke: none"></rect></g><g><g data-id="L_B_C_0" transform="translate(0, 0)"><text y="-10.1" text-anchor="middle"><tspan x="0" y="-0.1em" dy="1.1em" text-anchor="middle"></tspan></text></g></g><g><rect style="stroke: none"></rect></g><g transform="translate(318.01171875, 498.0062503814697)"><g data-id="L_C_E_0" transform="translate(0, -8.000000953674316)"><g><rect style="" x="-9.203125" y="-0.9999990463256836" width="18.40625" height="18"></rect><text y="-10.1" text-anchor="middle" style=""><tspan x="0" y="-0.1em" dy="1.1em" text-anchor="middle"><tspan font-style="normal" font-weight="normal">No</tspan></tspan></text></g></g></g><g transform="translate(137.203125, 498.0062503814697)"><g data-id="L_C_D_0" transform="translate(0, -8.000000953674316)"><g><rect style="" x="-77.609375" y="-0.9999990463256836" width="155.21875" height="18"></rect><text y="-10.1" text-anchor="middle" style=""><tspan x="0" y="-0.1em" dy="1.1em" text-anchor="middle"><tspan font-style="normal" font-weight="normal">Yes,</tspan><tspan font-style="normal" font-weight="normal"> side-effect</tspan><tspan font-style="normal" font-weight="normal"> free</tspan></tspan></text></g></g></g><g transform="translate(456.2109375, 498.0062503814697)"><g data-id="L_C_E_2" transform="translate(0, -14.600001335144043)"><g><rect style="" x="-99.203125" y="-0.9999990463256836" width="198.40625" height="31.200000762939453"></rect><text y="-10.1" text-anchor="middle" style=""><tspan x="0" y="-0.1em" dy="1.1em" text-anchor="middle"><tspan font-style="normal" font-weight="normal">Yes,</tspan><tspan font-style="normal" font-weight="normal"> but</tspan><tspan font-style="normal" font-weight="normal"> costly</tspan></tspan><tspan x="0" y="1em" dy="1.1em" text-anchor="middle"><tspan font-style="normal" font-weight="normal">(e.g.</tspan><tspan font-style="normal" font-weight="normal"> Anthropic</tspan><tspan font-style="normal" font-weight="normal"> cache</tspan><tspan font-style="normal" font-weight="normal"> miss)</tspan></tspan></text></g></g></g><g><g data-id="L_D_F_0" transform="translate(0, 0)"><text y="-10.1" text-anchor="middle"><tspan x="0" y="-0.1em" dy="1.1em" text-anchor="middle"></tspan></text></g></g><g><rect style="stroke: none"></rect></g><g><g data-id="L_E_F_0" transform="translate(0, 0)"><text y="-10.1" text-anchor="middle"><tspan x="0" y="-0.1em" dy="1.1em" text-anchor="middle"></tspan></text></g></g><g><rect style="stroke: none"></rect></g><g><g data-id="L_F_G_0" transform="translate(0, 0)"><text y="-10.1" text-anchor="middle"><tspan x="0" y="-0.1em" dy="1.1em" text-anchor="middle"></tspan></text></g></g><g><rect style="stroke: none"></rect></g><g transform="translate(134.8984375, 951.0125007629395)"><g data-id="L_G_H_0" transform="translate(0, -8.000000953674316)"><g><rect style="" x="-12.8046875" y="-0.9999990463256836" width="25.609375" height="18"></rect><text y="-10.1" text-anchor="middle" style=""><tspan x="0" y="-0.1em" dy="1.1em" text-anchor="middle"><tspan font-style="normal" font-weight="normal">Yes</tspan></tspan></text></g></g></g><g transform="translate(289.109375, 951.0125007629395)"><g data-id="L_G_I_0" transform="translate(0, -8.000000953674316)"><g><rect style="" x="-9.203125" y="-0.9999990463256836" width="18.40625" height="18"></rect><text y="-10.1" text-anchor="middle" style=""><tspan x="0" y="-0.1em" dy="1.1em" text-anchor="middle"><tspan font-style="normal" font-weight="normal">No</tspan></tspan></text></g></g></g><g transform="translate(289.109375, 1164.6218757629395)"><g data-id="L_I_J_0" transform="translate(0, -8.000000953674316)"><g><rect style="" x="-12.8046875" y="-0.9999990463256836" width="25.609375" height="18"></rect><text y="-10.1" text-anchor="middle" style=""><tspan x="0" y="-0.1em" dy="1.1em" text-anchor="middle"><tspan font-style="normal" font-weight="normal">Yes</tspan></tspan></text></g></g></g><g><g data-id="L_J_F_0" transform="translate(0, 0)"><text y="-10.1" text-anchor="middle"><tspan x="0" y="-0.1em" dy="1.1em" text-anchor="middle"></tspan></text></g></g><g><rect style="stroke: none"></rect></g><g transform="translate(625.3125, 1164.6218757629395)"><g data-id="L_I_K_0" transform="translate(0, -8.000000953674316)"><g><rect style="" x="-9.203125" y="-0.9999990463256836" width="18.40625" height="18"></rect><text y="-10.1" text-anchor="middle" style=""><tspan x="0" y="-0.1em" dy="1.1em" text-anchor="middle"><tspan font-style="normal" font-weight="normal">No</tspan></tspan></text></g></g></g></g><g><g id="forced-tool-call-0-flowchart-A-0" data-look="classic" transform="translate(267.71484375, 42)"><rect style="" x="-132" y="-34" width="264" height="68"></rect><g style="" transform="translate(-100, -18)"><rect></rect><foreignObject width="200" height="36"><p><span></span></p><p>Extension requests forced tool call</p><p></p></foreignObject></g></g><g id="forced-tool-call-0-flowchart-B-1" data-look="classic" transform="translate(267.71484375, 171)"><rect style="" x="-132" y="-43" width="264" height="86"></rect><g style="" transform="translate(-100, -27)"><rect></rect><foreignObject width="200" height="54"><p><span></span></p><p>Inject soft prompt:<br>"you must call tool X next turn"</p><p></p></foreignObject></g></g><g id="forced-tool-call-0-flowchart-C-3" data-look="classic" transform="translate(267.71484375, 361.203125)"><polygon points="95.203125,0 190.40625,-95.203125 95.203125,-190.40625 0,-95.203125" transform="translate(-94.703125, 95.203125)"></polygon><g style="" transform="translate(-61.203125, -18)"><rect></rect><foreignObject width="122.40625" height="36"><p><span></span></p><p>Provider supports<br>native forcing?</p><p></p></foreignObject></g></g><g id="forced-tool-call-0-flowchart-E-5" data-look="classic" transform="translate(392.0078125, 573.6062507629395)"><rect style="" x="-89.6015625" y="-34" width="179.203125" height="68"></rect><g style="" transform="translate(-57.6015625, -18)"><rect></rect><foreignObject width="115.203125" height="36"><p><span></span></p><p>Run turn with<br>soft prompt only</p><p></p></foreignObject></g></g><g id="forced-tool-call-0-flowchart-D-7" data-look="classic" transform="translate(137.203125, 573.6062507629395)"><rect style="" x="-129.203125" y="-25" width="258.40625" height="50"></rect><g style="" transform="translate(-97.203125, -9)"><rect></rect><foreignObject width="194.40625" height="18"><p><span></span></p><p>Set native tool_choice flag</p><p></p></foreignObject></g></g><g id="forced-tool-call-0-flowchart-F-11" data-look="classic" transform="translate(264.60546875, 684.6062507629395)"><rect style="" x="-60.8046875" y="-25" width="121.609375" height="50"></rect><g style="" transform="translate(-28.8046875, -9)"><rect></rect><foreignObject width="57.609375" height="18"><p><span></span></p><p>Run turn</p><p></p></foreignObject></g></g><g id="forced-tool-call-0-flowchart-G-15" data-look="classic" transform="translate(212.00390625, 838.8093757629395)"><polygon points="77.203125,0 154.40625,-77.203125 77.203125,-154.40625 0,-77.203125" transform="translate(-76.703125, 77.203125)"></polygon><g style="" transform="translate(-43.203125, -18)"><rect></rect><foreignObject width="86.40625" height="36"><p><span></span></p><p>Model called<br>the tool?</p><p></p></foreignObject></g></g><g id="forced-tool-call-0-flowchart-H-17" data-look="classic" transform="translate(134.8984375, 1057.8171882629395)"><rect style="" x="-46.40625" y="-25" width="92.8125" height="50"></rect><g style="" transform="translate(-14.40625, -9)"><rect></rect><foreignObject width="28.8125" height="18"><p><span></span></p><p>Done</p><p></p></foreignObject></g></g><g id="forced-tool-call-0-flowchart-I-19" data-look="classic" transform="translate(289.109375, 1057.8171882629395)"><polygon points="71.8046875,0 143.609375,-71.8046875 71.8046875,-143.609375 0,-71.8046875" transform="translate(-71.3046875, 71.8046875)"></polygon><g style="" transform="translate(-46.8046875, -9)"><rect></rect><foreignObject width="93.609375" height="18"><p><span></span></p><p>Retries left?</p><p></p></foreignObject></g></g><g id="forced-tool-call-0-flowchart-J-21" data-look="classic" transform="translate(341.7109375, 1233.6218757629395)"><rect style="" x="-125.6015625" y="-34" width="251.203125" height="68"></rect><g style="" transform="translate(-93.6015625, -18)"><rect></rect><foreignObject width="187.203125" height="36"><p><span></span></p><p>Retry — escalate:<br>set flag despite drawbacks</p><p></p></foreignObject></g></g><g id="forced-tool-call-0-flowchart-K-25" data-look="classic" transform="translate(625.3125, 1233.6218757629395)"><rect style="" x="-122" y="-25" width="244" height="50"></rect><g style="" transform="translate(-90, -9)"><rect></rect><foreignObject width="180" height="18"><p><span></span></p><p>Surface failure to caller</p><p></p></foreignObject></g></g></g></g></g><defs><filter id="forced-tool-call-0-drop-shadow" height="130%" width="130%"><fedropshadow dx="4" dy="4" stdDeviation="0" flood-opacity="0.06" flood-color="#000000"></fedropshadow></filter></defs><defs><filter id="forced-tool-call-0-drop-shadow-small" height="150%" width="150%"><fedropshadow dx="2" dy="2" stdDeviation="0" flood-opacity="0.06" flood-color="#000000"></fedropshadow></filter></defs><linearGradient id="forced-tool-call-0-gradient" gradientUnits="objectBoundingBox" x1="0%" y1="0%" x2="100%" y2="0%"><stop offset="0%" stop-color="#2A2A35" stop-opacity="1"></stop><stop offset="100%" stop-color="#44CFFF" stop-opacity="1"></stop></linearGradient></svg></div><figcaption>The forced call starts as a soft prompt; the native flag goes on only when the provider supports it without side effects, and if the model still doesn't call the tool, bounded retries escalate to setting the flag despite its cost before surfacing failure to the caller.</figcaption></figure>

这是上一章 Director 在提供商一侧的实现。`ForceTool` 声明不变量；推理层选择成本最低、又真正满足要求的方式，并在模型不服从时升级措施。

### 工具 schema 是面向模型的协议

工具的 `parameters` 字段严格定义参数结构。对人类 API 来说很理想，但模型不是通用 API 客户端。它们的错误往往与工具名、以及训练中见过的运行框架有关。

强化学习优化到极致的智能体，可能拿另一个框架的 schema 调用熟悉的工具。Composer 模型有时会按自己预期的结构生成 `Grep` 调用，即使根本没有 `Grep` 工具。Codex 看见 `paths: string[]`，也可能随当天心情传来一个用 `;` 或 `,` 分隔的字符串。

因此，库既要验证，**也要纠正**。对工具的语义契约严格，对模型的方言宽容：映射没有歧义时，把 `paths: "a,b"` 修复成列表；否则返回结构化、可重试的错误。一个原始的 JSON Schema 验证器，无法独自承担这一层。

### 严格采样需要预算与方言管理

约束采样是我们最早加到 Pi 上的功能之一：

```jsx
+   strict?: boolean;
+   customFormat?: { syntax: "lark" | "regex"; definition: string };
+   customWireName?: string;
```

几个月后，Pi 也加入了 LARK 和 strict 支持，但只把它暴露为供提供商层透传的不透明结构。两项全局约束决定了，这样还不够：

1. **strict schema 容量是共享预算。** 许多提供商限制 strict schema 的数量。独立编写的扩展装得足够多，提供商就可能拒绝每一次请求。用户不该为了让框架恢复工作，靠二分排查并修改插件。
2. **语法方言因提供商而异。** 把同一份 LARK 语法传给所有提供商，本身就可能无效。扩展无法维护完整兼容性映射，因为用户可能通过原生主机、代理或自定义提供商访问同一个模型。

因此，这套看起来“复杂”的实现应该属于推理层：

<figure data-hk="000000010000000000004000010b263"><div data-hk="000000010000000000004000010b2640" role="img" aria-label="Flowchart of constrained-sampling handling: an extension declares a tool strict; if the provider lacks grammar enforcement or the strict-schema budget is exhausted, ship JSON Schema only with charitable client-side repair; otherwise normalize the schema per provider dialect and inject the grammar on the wire; invalid output is repaired client-side and surfaced to the model as a structured error for a retry."><svg id="constrained-sampling-0" width="100%" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" style="max-width: 542px;" viewBox="0 0 542 1458.015625" role="graphics-document document" aria-roledescription="flowchart-v2"><g><marker id="constrained-sampling-0_flowchart-v2-pointEnd" viewBox="0 0 10 10" refX="5" refY="5" markerUnits="userSpaceOnUse" markerWidth="8" markerHeight="8" orient="auto"><path d="M 0 0 L 10 5 L 0 10 z" style="stroke-width: 1; stroke-dasharray: 1, 0;"></path></marker><marker id="constrained-sampling-0_flowchart-v2-pointStart" viewBox="0 0 10 10" refX="4.5" refY="5" markerUnits="userSpaceOnUse" markerWidth="8" markerHeight="8" orient="auto"><path d="M 0 5 L 10 10 L 10 0 z" style="stroke-width: 1; stroke-dasharray: 1, 0;"></path></marker><marker id="constrained-sampling-0_flowchart-v2-pointEnd-margin" viewBox="0 0 11.5 14" refX="11.5" refY="7" markerUnits="userSpaceOnUse" markerWidth="10.5" markerHeight="14" orient="auto"><path d="M 0 0 L 11.5 7 L 0 14 z" style="stroke-width: 0; stroke-dasharray: 1, 0;"></path></marker><marker id="constrained-sampling-0_flowchart-v2-pointStart-margin" viewBox="0 0 11.5 14" refX="1" refY="7" markerUnits="userSpaceOnUse" markerWidth="11.5" markerHeight="14" orient="auto"><polygon points="0,7 11.5,14 11.5,0" style="stroke-width: 0; stroke-dasharray: 1, 0;"></polygon></marker><marker id="constrained-sampling-0_flowchart-v2-circleEnd" viewBox="0 0 10 10" refX="11" refY="5" markerUnits="userSpaceOnUse" markerWidth="11" markerHeight="11" orient="auto"><circle cx="5" cy="5" r="5" style="stroke-width: 1; stroke-dasharray: 1, 0;"></circle></marker><marker id="constrained-sampling-0_flowchart-v2-circleStart" viewBox="0 0 10 10" refX="-1" refY="5" markerUnits="userSpaceOnUse" markerWidth="11" markerHeight="11" orient="auto"><circle cx="5" cy="5" r="5" style="stroke-width: 1; stroke-dasharray: 1, 0;"></circle></marker><marker id="constrained-sampling-0_flowchart-v2-circleEnd-margin" viewBox="0 0 10 10" refY="5" refX="12.25" markerUnits="userSpaceOnUse" markerWidth="14" markerHeight="14" orient="auto"><circle cx="5" cy="5" r="5" style="stroke-width: 0; stroke-dasharray: 1, 0;"></circle></marker><marker id="constrained-sampling-0_flowchart-v2-circleStart-margin" viewBox="0 0 10 10" refX="-2" refY="5" markerUnits="userSpaceOnUse" markerWidth="14" markerHeight="14" orient="auto"><circle cx="5" cy="5" r="5" style="stroke-width: 0; stroke-dasharray: 1, 0;"></circle></marker><marker id="constrained-sampling-0_flowchart-v2-crossEnd" viewBox="0 0 11 11" refX="12" refY="5.2" markerUnits="userSpaceOnUse" markerWidth="11" markerHeight="11" orient="auto"><path d="M 1,1 l 9,9 M 10,1 l -9,9" style="stroke-width: 2; stroke-dasharray: 1, 0;"></path></marker><marker id="constrained-sampling-0_flowchart-v2-crossStart" viewBox="0 0 11 11" refX="-1" refY="5.2" markerUnits="userSpaceOnUse" markerWidth="11" markerHeight="11" orient="auto"><path d="M 1,1 l 9,9 M 10,1 l -9,9" style="stroke-width: 2; stroke-dasharray: 1, 0;"></path></marker><marker id="constrained-sampling-0_flowchart-v2-crossEnd-margin" viewBox="0 0 15 15" refX="17.7" refY="7.5" markerUnits="userSpaceOnUse" markerWidth="12" markerHeight="12" orient="auto"><path d="M 1,1 L 14,14 M 1,14 L 14,1" style="stroke-width: 2.5;"></path></marker><marker id="constrained-sampling-0_flowchart-v2-crossStart-margin" viewBox="0 0 15 15" refX="-3.5" refY="7.5" markerUnits="userSpaceOnUse" markerWidth="12" markerHeight="12" orient="auto"><path d="M 1,1 L 14,14 M 1,14 L 14,1" style="stroke-width: 2.5; stroke-dasharray: 1, 0;"></path></marker><g><g></g><g><path d="M276,76L276,76L276,102L276,102L276,124" id="constrained-sampling-0-L_A_B_0" style=";" data-edge="true" data-et="edge" data-id="L_A_B_0" data-points="W3sieCI6Mjc2LCJ5Ijo3Nn0seyJ4IjoyNzYsInkiOjEwMn0seyJ4IjoyNzYsInkiOjEyOH1d" data-look="classic" marker-end="url(#constrained-sampling-0_flowchart-v2-pointEnd)"></path><path d="M221.255,285.255L125.398,285.255L125.398,375L125.398,375L125.398,496.203L125.398,496.203L125.398,617.406L130.611,617.406L130.611,648.461" id="constrained-sampling-0-L_B_G_0" style=";" data-edge="true" data-et="edge" data-id="L_B_G_0" data-points="W3sieCI6MjIxLjI1NDg2OTM5MDQ4ODk1LCJ5IjoyODUuMjU0ODY5MzkwNDg4OX0seyJ4IjoxMjUuMzk4NDM3NSwieSI6Mzc1fSx7IngiOjEyNS4zOTg0Mzc1LCJ5Ijo0OTYuMjAzMTI1fSx7IngiOjEyNS4zOTg0Mzc1LCJ5Ijo2MTcuNDA2MjV9LHsieCI6MTMxLjI3MjYyOTMxMDM0NDgzLCJ5Ijo2NTIuNDA2MjV9XQ==" data-look="classic" marker-end="url(#constrained-sampling-0_flowchart-v2-pointEnd)"></path><path d="M314.612,301.388L356.789,301.388L356.789,375L356.789,375L356.789,406" id="constrained-sampling-0-L_B_C_0" style=";" data-edge="true" data-et="edge" data-id="L_B_C_0" data-points="W3sieCI6MzE0LjYxMTY0NTM1NTU5NTUsInkiOjMwMS4zODgzNTQ2NDQ0MDQ1fSx7IngiOjM1Ni43ODkwNjI1LCJ5IjozNzV9LHsieCI6MzU2Ljc4OTA2MjUsInkiOjQxMH1d" data-look="classic" marker-end="url(#constrained-sampling-0_flowchart-v2-pointEnd)"></path><path d="M311.208,536.825L220.789,536.825L220.789,617.406L191.01,617.406L191.01,649.475" id="constrained-sampling-0-L_C_G_0" style=";" data-edge="true" data-et="edge" data-id="L_C_G_0" data-points="W3sieCI6MzExLjIwNzg3MDU5MTg1MzQ2LCJ5Ijo1MzYuODI1MDU4MDkxODUzNX0seyJ4IjoyMjAuNzg5MDYyNSwieSI6NjE3LjQwNjI1fSx7IngiOjE4OC4yODc3MTU1MTcyNDE0LCJ5Ijo2NTIuNDA2MjV9XQ==" data-look="classic" marker-end="url(#constrained-sampling-0_flowchart-v2-pointEnd)"></path><path d="M383.767,555.428L412,555.428L412,617.406L412,617.406L412,666.406" id="constrained-sampling-0-L_C_D_0" style=";" data-edge="true" data-et="edge" data-id="L_C_D_0" data-points="W3sieCI6MzgzLjc2NzM4NDI5MTU1MDQsInkiOjU1NS40Mjc5MjgyMDg0NDk1fSx7IngiOjQxMiwieSI6NjE3LjQwNjI1fSx7IngiOjQxMiwieSI6NjcwLjQwNjI1fV0=" data-look="classic" marker-end="url(#constrained-sampling-0_flowchart-v2-pointEnd)"></path><path d="M412,738.406L412,738.406L412,782.406L412,782.406L412,804.406" id="constrained-sampling-0-L_D_E_0" style=";" data-edge="true" data-et="edge" data-id="L_D_E_0" data-points="W3sieCI6NDEyLCJ5Ijo3MzguNDA2MjV9LHsieCI6NDEyLCJ5Ijo3ODIuNDA2MjV9LHsieCI6NDEyLCJ5Ijo4MDguNDA2MjV9XQ==" data-look="classic" marker-end="url(#constrained-sampling-0_flowchart-v2-pointEnd)"></path><path d="M412,876.406L412,876.406L412,902.406L340.55,902.406L340.55,929.2" id="constrained-sampling-0-L_E_F_0" style=";" data-edge="true" data-et="edge" data-id="L_E_F_0" data-points="W3sieCI6NDEyLCJ5Ijo4NzYuNDA2MjV9LHsieCI6NDEyLCJ5Ijo5MDIuNDA2MjV9LHsieCI6MzM2LjgwNDY4NzUsInkiOjkzMC42MDQ0OTIxODc1fV0=" data-look="classic" marker-end="url(#constrained-sampling-0_flowchart-v2-pointEnd)"></path><path d="M140,756.406L140,756.406L140,782.406L140,782.406L140,842.406L140,842.406L140,902.406L211.45,902.406L211.45,929.2" id="constrained-sampling-0-L_G_F_0" style=";" data-edge="true" data-et="edge" data-id="L_G_F_0" data-points="W3sieCI6MTQwLCJ5Ijo3NTYuNDA2MjV9LHsieCI6MTQwLCJ5Ijo3ODIuNDA2MjV9LHsieCI6MTQwLCJ5Ijo4NDIuNDA2MjV9LHsieCI6MTQwLCJ5Ijo5MDIuNDA2MjV9LHsieCI6MjE1LjE5NTMxMjUsInkiOjkzMC42MDQ0OTIxODc1fV0=" data-look="classic" marker-end="url(#constrained-sampling-0_flowchart-v2-pointEnd)"></path><path d="M276,978.406L276,978.406L276,1004.406L276,1004.406L276,1026.406" id="constrained-sampling-0-L_F_H_0" style=";" data-edge="true" data-et="edge" data-id="L_F_H_0" data-points="W3sieCI6Mjc2LCJ5Ijo5NzguNDA2MjV9LHsieCI6Mjc2LCJ5IjoxMDA0LjQwNjI1fSx7IngiOjI3NiwieSI6MTAzMC40MDYyNX1d" data-look="classic" marker-end="url(#constrained-sampling-0_flowchart-v2-pointEnd)"></path><path d="M241.206,1139.222L175.594,1139.222L175.594,1209.016L175.594,1209.016L175.594,1258.016" id="constrained-sampling-0-L_H_I_0" style=";" data-edge="true" data-et="edge" data-id="L_H_I_0" data-points="W3sieCI6MjQxLjIwNjI3OTY5MTIxMTQsInkiOjExMzkuMjIxOTA0NjkxMjExNH0seyJ4IjoxNzUuNTkzNzUsInkiOjEyMDkuMDE1NjI1fSx7IngiOjE3NS41OTM3NSwieSI6MTI2Mi4wMTU2MjV9XQ==" data-look="classic" marker-end="url(#constrained-sampling-0_flowchart-v2-pointEnd)"></path><path d="M310.794,1139.222L376.406,1139.222L376.406,1209.016L376.406,1209.016L376.406,1240.016" id="constrained-sampling-0-L_H_J_0" style=";" data-edge="true" data-et="edge" data-id="L_H_J_0" data-points="W3sieCI6MzEwLjc5MzcyMDMwODc4ODYsInkiOjExMzkuMjIxOTA0NjkxMjExNH0seyJ4IjozNzYuNDA2MjUsInkiOjEyMDkuMDE1NjI1fSx7IngiOjM3Ni40MDYyNSwieSI6MTI0NC4wMTU2MjV9XQ==" data-look="classic" marker-end="url(#constrained-sampling-0_flowchart-v2-pointEnd)"></path><path d="M376.406,1330.016L376.406,1330.016L376.406,1356.016L376.406,1356.016L376.406,1378.016" id="constrained-sampling-0-L_J_K_0" style=";" data-edge="true" data-et="edge" data-id="L_J_K_0" data-points="W3sieCI6Mzc2LjQwNjI1LCJ5IjoxMzMwLjAxNTYyNX0seyJ4IjozNzYuNDA2MjUsInkiOjEzNTYuMDE1NjI1fSx7IngiOjM3Ni40MDYyNSwieSI6MTM4Mi4wMTU2MjV9XQ==" data-look="classic" marker-end="url(#constrained-sampling-0_flowchart-v2-pointEnd)"></path></g><g><g><g data-id="L_A_B_0" transform="translate(0, 0)"><text y="-10.1" text-anchor="middle"><tspan x="0" y="-0.1em" dy="1.1em" text-anchor="middle"></tspan></text></g></g><g><rect style="stroke: none"></rect></g><g transform="translate(125.3984375, 496.203125)"><g data-id="L_B_G_0" transform="translate(0, -8.000000953674316)"><g><rect style="" x="-9.203125" y="-0.9999990463256836" width="18.40625" height="18"></rect><text y="-10.1" text-anchor="middle" style=""><tspan x="0" y="-0.1em" dy="1.1em" text-anchor="middle"><tspan font-style="normal" font-weight="normal">No</tspan></tspan></text></g></g></g><g transform="translate(356.7890625, 375)"><g data-id="L_B_C_0" transform="translate(0, -8.000000953674316)"><g><rect style="" x="-12.8046875" y="-0.9999990463256836" width="25.609375" height="18"></rect><text y="-10.1" text-anchor="middle" style=""><tspan x="0" y="-0.1em" dy="1.1em" text-anchor="middle"><tspan font-style="normal" font-weight="normal">Yes</tspan></tspan></text></g></g></g><g transform="translate(220.7890625, 617.40625)"><g data-id="L_C_G_0" transform="translate(0, -8.000000953674316)"><g><rect style="" x="-9.203125" y="-0.9999990463256836" width="18.40625" height="18"></rect><text y="-10.1" text-anchor="middle" style=""><tspan x="0" y="-0.1em" dy="1.1em" text-anchor="middle"><tspan font-style="normal" font-weight="normal">No</tspan></tspan></text></g></g></g><g transform="translate(412, 617.40625)"><g data-id="L_C_D_0" transform="translate(0, -8.000000953674316)"><g><rect style="" x="-81.21875" y="-0.9999990463256836" width="162.4375" height="18"></rect><text y="-10.1" text-anchor="middle" style=""><tspan x="0" y="-0.1em" dy="1.1em" text-anchor="middle"><tspan font-style="normal" font-weight="normal">Yes,</tspan><tspan font-style="normal" font-weight="normal"> and</tspan><tspan font-style="normal" font-weight="normal"> priority</tspan><tspan font-style="normal" font-weight="normal"> wins</tspan></tspan></text></g></g></g><g><g data-id="L_D_E_0" transform="translate(0, 0)"><text y="-10.1" text-anchor="middle"><tspan x="0" y="-0.1em" dy="1.1em" text-anchor="middle"></tspan></text></g></g><g><rect style="stroke: none"></rect></g><g><g data-id="L_E_F_0" transform="translate(0, 0)"><text y="-10.1" text-anchor="middle"><tspan x="0" y="-0.1em" dy="1.1em" text-anchor="middle"></tspan></text></g></g><g><rect style="stroke: none"></rect></g><g><g data-id="L_G_F_0" transform="translate(0, 0)"><text y="-10.1" text-anchor="middle"><tspan x="0" y="-0.1em" dy="1.1em" text-anchor="middle"></tspan></text></g></g><g><rect style="stroke: none"></rect></g><g><g data-id="L_F_H_0" transform="translate(0, 0)"><text y="-10.1" text-anchor="middle"><tspan x="0" y="-0.1em" dy="1.1em" text-anchor="middle"></tspan></text></g></g><g><rect style="stroke: none"></rect></g><g transform="translate(175.59375, 1209.015625)"><g data-id="L_H_I_0" transform="translate(0, -8.000000953674316)"><g><rect style="" x="-12.8046875" y="-0.9999990463256836" width="25.609375" height="18"></rect><text y="-10.1" text-anchor="middle" style=""><tspan x="0" y="-0.1em" dy="1.1em" text-anchor="middle"><tspan font-style="normal" font-weight="normal">Yes</tspan></tspan></text></g></g></g><g transform="translate(376.40625, 1209.015625)"><g data-id="L_H_J_0" transform="translate(0, -8.000000953674316)"><g><rect style="" x="-9.203125" y="-0.9999990463256836" width="18.40625" height="18"></rect><text y="-10.1" text-anchor="middle" style=""><tspan x="0" y="-0.1em" dy="1.1em" text-anchor="middle"><tspan font-style="normal" font-weight="normal">No</tspan></tspan></text></g></g></g><g><g data-id="L_J_K_0" transform="translate(0, 0)"><text y="-10.1" text-anchor="middle"><tspan x="0" y="-0.1em" dy="1.1em" text-anchor="middle"></tspan></text></g></g><g><rect style="stroke: none"></rect></g></g><g><g id="constrained-sampling-0-flowchart-A-0" data-look="classic" transform="translate(276, 42)"><rect style="" x="-132" y="-34" width="264" height="68"></rect><g style="" transform="translate(-100, -18)"><rect></rect><foreignObject width="200" height="36"><p><span></span></p><p>Extension declares tool as strict</p><p></p></foreignObject></g></g><g id="constrained-sampling-0-flowchart-B-1" data-look="classic" transform="translate(276, 234)"><polygon points="106,0 212,-106 106,-212 0,-106" transform="translate(-105.5, 106)"></polygon><g style="" transform="translate(-72, -18)"><rect></rect><foreignObject width="144" height="36"><p><span></span></p><p>Provider supports<br>grammar enforcement?</p><p></p></foreignObject></g></g><g id="constrained-sampling-0-flowchart-G-3" data-look="classic" transform="translate(140, 704.40625)"><rect style="" x="-132" y="-52" width="264" height="104"></rect><g style="" transform="translate(-100, -36)"><rect></rect><foreignObject width="200" height="72"><p><span></span></p><p>Ship JSON Schema only;<br>unconstrained sampling +<br>charitable client-side repair</p><p></p></foreignObject></g></g><g id="constrained-sampling-0-flowchart-C-5" data-look="classic" transform="translate(356.7890625, 496.203125)"><polygon points="86.203125,0 172.40625,-86.203125 86.203125,-172.40625 0,-86.203125" transform="translate(-85.703125, 86.203125)"></polygon><g style="" transform="translate(-61.203125, -9)"><rect></rect><foreignObject width="122.40625" height="18"><p><span></span></p><p>Budget remaining?</p><p></p></foreignObject></g></g><g id="constrained-sampling-0-flowchart-D-9" data-look="classic" transform="translate(412, 704.40625)"><rect style="" x="-104" y="-34" width="208" height="68"></rect><g style="" transform="translate(-72, -18)"><rect></rect><foreignObject width="144" height="36"><p><span></span></p><p>Normalize schema<br>per provider dialect</p><p></p></foreignObject></g></g><g id="constrained-sampling-0-flowchart-E-11" data-look="classic" transform="translate(412, 842.40625)"><rect style="" x="-122" y="-34" width="244" height="68"></rect><g style="" transform="translate(-90, -18)"><rect></rect><foreignObject width="180" height="36"><p><span></span></p><p>Inject grammar constraint<br>on the wire</p><p></p></foreignObject></g></g><g id="constrained-sampling-0-flowchart-F-13" data-look="classic" transform="translate(276, 953.40625)"><rect style="" x="-60.8046875" y="-25" width="121.609375" height="50"></rect><g style="" transform="translate(-28.8046875, -9)"><rect></rect><foreignObject width="57.609375" height="18"><p><span></span></p><p>Run turn</p><p></p></foreignObject></g></g><g id="constrained-sampling-0-flowchart-H-17" data-look="classic" transform="translate(276, 1102.2109375)"><polygon points="71.8046875,0 143.609375,-71.8046875 71.8046875,-143.609375 0,-71.8046875" transform="translate(-71.3046875, 71.8046875)"></polygon><g style="" transform="translate(-46.8046875, -9)"><rect></rect><foreignObject width="93.609375" height="18"><p><span></span></p><p>Output valid?</p><p></p></foreignObject></g></g><g id="constrained-sampling-0-flowchart-I-19" data-look="classic" transform="translate(175.59375, 1287.015625)"><rect style="" x="-46.40625" y="-25" width="92.8125" height="50"></rect><g style="" transform="translate(-14.40625, -9)"><rect></rect><foreignObject width="28.8125" height="18"><p><span></span></p><p>Done</p><p></p></foreignObject></g></g><g id="constrained-sampling-0-flowchart-J-21" data-look="classic" transform="translate(376.40625, 1287.015625)"><rect style="" x="-118.40625" y="-43" width="236.8125" height="86"></rect><g style="" transform="translate(-86.40625, -27)"><rect></rect><foreignObject width="172.8125" height="54"><p><span></span></p><p>Repair client-side,<br>surface structured error<br>to model</p><p></p></foreignObject></g></g><g id="constrained-sampling-0-flowchart-K-23" data-look="classic" transform="translate(376.40625, 1416.015625)"><rect style="" x="-96.8046875" y="-34" width="193.609375" height="68"></rect><g style="" transform="translate(-64.8046875, -18)"><rect></rect><foreignObject width="129.609375" height="36"><p><span></span></p><p>Model retries with<br>correction signal</p><p></p></foreignObject></g></g></g></g></g><defs><filter id="constrained-sampling-0-drop-shadow" height="130%" width="130%"><fedropshadow dx="4" dy="4" stdDeviation="0" flood-opacity="0.06" flood-color="#000000"></fedropshadow></filter></defs><defs><filter id="constrained-sampling-0-drop-shadow-small" height="150%" width="150%"><fedropshadow dx="2" dy="2" stdDeviation="0" flood-opacity="0.06" flood-color="#000000"></fedropshadow></filter></defs><linearGradient id="constrained-sampling-0-gradient" gradientUnits="objectBoundingBox" x1="0%" y1="0%" x2="100%" y2="0%"><stop offset="0%" stop-color="#2A2A35" stop-opacity="1"></stop><stop offset="100%" stop-color="#44CFFF" stop-opacity="1"></stop></linearGradient></svg></div><figcaption>What honoring <code data-hk="000000010000000000004000010b26500">strict</code> actually takes: provider capability, a strict-schema budget with priorities, per-dialect normalization, and a client-side repair path—none of which an opaque pass-through struct can provide.</figcaption></figure>

扩展声明意图——严格程度、语法、优先级。推理层负责能力、预算、方言归一化、回退、修复和最终传输格式。

### 纠错式推理

推理库还需要：

1. 修复格式错误的 JSON。
2. 检测 Gemini、DeepSeek 等模型的重复循环。
3. 解析各模型的输出方言；结构化输出泄漏到文本时，合成为规范的 `tool_call` 和 `think` 块。

<figure data-hk="000000010000000000004000010b270"><img src="https://stencil.so/blog/harness-playbook/leaked-toolcall-wild.png" width="807" height="374" alt="A leaked tool call rendered as prose in a chat transcript because the model's dialect was not parsed into a tool_call block" loading="lazy"><figcaption>由于模型方言未被解析成 tool_call 块，泄漏的工具调用被当作普通文本渲染。</figcaption></figure>

工具调用方面的细节，可以看我的[前一篇文章](https://blog.can.ac/2026/08/03/the-minutiae-of-tool-calling/)。支持一个提供商或模型，不只是接上 URL，还得处理它的个体怪癖。

提供商适配器能打开流，不代表它已经完整。只有在遇到畸形 JSON、重复、泄漏的推理内容或模型特有的工具调用方言时，框架其余部分仍能收到一个规范轮次，适配才算完成。

### 压缩应该调度，而不是临界触发

这里，天真的设计恰好也带来了最糟的体验：用户最投入的时候，却要等待整个会话中最大的一次请求。

除了 **[Snapcompact](https://stencil.so/blog/snapcompact)** 这样的方法，还有很大改进空间。

<figure data-hk="000000010000000000004000010b277"><img src="https://stencil.so/blog/harness-playbook/compaction-wait.png" width="560" height="55" alt="Claude's chat interface showing a spinner, a 43% progress bar, and the text: Compacting our conversation so we can keep chatting. This takes about 1-2 minutes." loading="lazy"><figcaption>连前沿模型实验室交付的也是这种朴素设计。</figcaption></figure>

更好的做法，是在距离上限约 10% 时，提前试探性启动压缩。相当于把对话分成两个并发版本：一边让用户和模型继续工作，另一边由模型压缩对话。

<figure data-hk="000000010000000000004000010b279"><img src="https://stencil.so/blog/harness-playbook/compaction-async.png" width="977" height="77" alt="omp's status line: model GPT-5.6-Sol, working directory pi, git branch main, and a context gauge at 3% of a 1M window with two tick marks placed short of the limit." loading="lazy"><figcaption>看到那个层叠图标了吗？它显示了提前启动压缩的时机。</figcaption></figure>

收到压缩结果后，再把它拼接进另一分支。这样还能保持工作势头：模型不会因历史里只剩一条交接消息而困惑，而是能看到那些它本来就*应该*完成的进展。

除了提示词，还有几种值得考虑的方法：

- **远程压缩**：由提供商在服务端完成。OpenAI API 返回一个不透明状态 blob；由于服务端能访问解密后的思考内容，可以显著缓解上下文损失。
- **交接**：不要让模型“总结”，试着让它“交接”工作。
- **Shake**：完全本地执行，直接裁掉历史中体积较大的工具结果。

注意，这也应该体现在 UI 渲染与请求渲染的抽象差异中。用户查看历史时，会希望所有消息仍保持原样；但对模型而言，那些消息已经不存在了。因此，构造请求时，应把提示词历史中的每个条目建模为一个归约步骤 `fn(this, req) -> req`，并在 `<Handoff>` 的实现中处理。

### 用小型本地模型处理框架内部工作

微型本地模型超级有用！即使你只用前沿模型工作，我也建议内嵌一个 `tiny` 模型，尤其可以看看 LiquidAI 的模型。分类、生成标题、翻译、判断用户对对话进展是否满意等小任务，都能省下大量延迟和费用。当然还有 TTS／STT，本地已经可以获得业界领先的表现。

这不是第二个“智能体”，而是一项低成本的内部能力，用来处理不该支付前沿模型延迟和费用的小任务。

兼容性和修复集中处理后，常驻工具接口就能保持精简。下一章讨论的是：什么值得在每次请求中占据一个 schema，什么绝对不值得。

<a id="the-tool-surface"></a>

## 工具接口

运行时一章定义了工作如何执行，推理一章定义了 schema 如何适配模型和提供商。现在终于可以问产品层面的问题：哪些操作值得占用模型的常驻语法？

### 每个 schema 都有成本

向模型提供大多数工具的最好方式，是**根本不把它们放进常驻工具列表**。

前阵子，有人抱怨 omp 在同一个任务上比 codex 慢——不是 token 用量，而是实际耗时。我本以为这没什么实质问题，没想到竟然是真的，甚至接近两倍！

<figure data-hk="000000010000000000004000010b294"><svg data-hk="000000010000000000004000010b2950" viewBox="0 0 720 406" role="img" aria-label="Median wall time and prefix size for six harness variants: omp stock with no fixes runs 86.2s at 25.1k tokens, dropping to 59.5s after a todo-batching fix, 45.4s after the /xdev rewrite cuts wire tool defs from 23 to 15, and 36.6s at a lean 5-tool floor; codex-cli and pi references sit near 42.2s and 37.0s" style="width:100%;height:auto;font-family:'BerkeleyMono Nerd Font', 'Berkeley Mono', ui-monospace, monospace"><rect x="196" y="10" width="18" height="8" fill="#44CFFF"></rect><text x="220" y="18" font-size="10" fill="#A3A3AC">MEDIAN WALL, SECONDS (sol:med)</text><rect x="464" y="13" width="18" height="3" fill="#63636D"></rect><text x="488" y="18" font-size="10" fill="#A3A3AC">PREFIX, K TOKENS</text><line data-hk="000000010000000000004000010b29510" x1="196" y1="30" x2="196" y2="382" stroke="#15151A" stroke-width="1"></line><text data-hk="000000010000000000004000010b29511" x="196" y="398" text-anchor="middle" font-size="10" fill="#63636D">0s</text><line data-hk="000000010000000000004000010b29512" x1="308.17391304347825" y1="30" x2="308.17391304347825" y2="382" stroke="#15151A" stroke-width="1"></line><text data-hk="000000010000000000004000010b29513" x="308.17391304347825" y="398" text-anchor="middle" font-size="10" fill="#63636D">20s</text><line data-hk="000000010000000000004000010b29514" x1="420.3478260869565" y1="30" x2="420.3478260869565" y2="382" stroke="#15151A" stroke-width="1"></line><text data-hk="000000010000000000004000010b29515" x="420.3478260869565" y="398" text-anchor="middle" font-size="10" fill="#63636D">40s</text><line data-hk="000000010000000000004000010b29516" x1="532.5217391304348" y1="30" x2="532.5217391304348" y2="382" stroke="#15151A" stroke-width="1"></line><text data-hk="000000010000000000004000010b29517" x="532.5217391304348" y="398" text-anchor="middle" font-size="10" fill="#63636D">60s</text><line data-hk="000000010000000000004000010b29518" x1="644.695652173913" y1="30" x2="644.695652173913" y2="382" stroke="#15151A" stroke-width="1"></line><text data-hk="000000010000000000004000010b29519" x="644.695652173913" y="398" text-anchor="middle" font-size="10" fill="#63636D">80s</text><g data-hk="000000010000000000004000010b29520"><text x="186" y="58" text-anchor="end" font-size="11" fill="#F5F5F6">omp · stock, no fixes</text><text x="186" y="71" text-anchor="end" font-size="9" fill="#63636D">23 defs · 12–16 turns</text><rect x="196" y="48" width="483.4695652173914" height="12" fill="#44CFFF"></rect><text x="685.4695652173914" y="58" font-size="11" fill="#F5F5F6">86.2s</text><rect x="196" y="65" width="417.79354838709673" height="3" fill="#63636D"></rect><text x="619.7935483870967" y="70" font-size="9" fill="#63636D">25.1k tok</text></g><g data-hk="000000010000000000004000010b29523"><text x="186" y="116" text-anchor="end" font-size="11" fill="#F5F5F6">omp · todo-batched</text><text x="186" y="129" text-anchor="end" font-size="9" fill="#63636D">23 defs, r9 · 6–8 turns</text><rect x="196" y="106" width="333.71739130434776" height="12" fill="#44CFFF"></rect><text x="535.7173913043478" y="116" font-size="11" fill="#F5F5F6">59.5s</text><rect x="196" y="123" width="417.79354838709673" height="3" fill="#63636D"></rect><text x="619.7935483870967" y="128" font-size="9" fill="#63636D">25.1k tok</text><text data-hk="000000010000000000004000010b295250" x="712" y="94" text-anchor="end" font-size="10" fill="#F5B04A">↓ −26.7s · todo-batching fix</text></g><g data-hk="000000010000000000004000010b29526"><text x="186" y="174" text-anchor="end" font-size="11" fill="#F5F5F6">omp · /xdev default</text><text x="186" y="187" text-anchor="end" font-size="9" fill="#63636D">15 defs, r11 · 6–8 turns</text><rect x="196" y="164" width="254.63478260869562" height="12" fill="#44CFFF"></rect><text x="456.6347826086956" y="174" font-size="11" fill="#F5F5F6">45.4s</text><rect x="196" y="181" width="342.89032258064515" height="3" fill="#63636D"></rect><text x="544.8903225806451" y="186" font-size="9" fill="#63636D">20.6k tok</text><text data-hk="000000010000000000004000010b295280" x="712" y="152" text-anchor="end" font-size="10" fill="#F5B04A">↓ −14.1s · 23→15 wire defs</text></g><g data-hk="000000010000000000004000010b29529"><text x="186" y="232" text-anchor="end" font-size="11" fill="#F5F5F6">omp · lean floor</text><text x="186" y="245" text-anchor="end" font-size="9" fill="#63636D">5 tools, r11 · 4–6 turns</text><rect x="196" y="222" width="205.2782608695652" height="12" fill="#44CFFF"></rect><text x="407.2782608695652" y="232" font-size="11" fill="#F5F5F6">36.6s</text><rect x="196" y="239" width="251.34193548387094" height="3" fill="#63636D"></rect><text x="453.34193548387094" y="244" font-size="9" fill="#63636D">15.1k tok</text><text data-hk="000000010000000000004000010b2952a110" x="712" y="210" text-anchor="end" font-size="10" fill="#F5B04A">↓ −8.8s · essential-5 only</text></g><g data-hk="000000010000000000004000010b2952a12"><text x="186" y="290" text-anchor="end" font-size="11" fill="#F5F5F6">codex-cli 0.144 (reference)</text><text x="186" y="303" text-anchor="end" font-size="9" fill="#63636D">3 tools · 4 turns</text><rect x="196" y="280" width="236.68695652173915" height="12" fill="#A3A3AC"></rect><text x="438.68695652173915" y="290" font-size="11" fill="#F5F5F6">42.2s</text><rect x="196" y="297" width="204.73548387096776" height="3" fill="#63636D"></rect><text x="406.73548387096776" y="302" font-size="9" fill="#63636D">9.6–12.3k tok</text></g><g data-hk="000000010000000000004000010b2952a15"><text x="186" y="348" text-anchor="end" font-size="11" fill="#F5F5F6">pi (reference)</text><text x="186" y="361" text-anchor="end" font-size="9" fill="#63636D">~5 tiny-schema tools · 6 turns</text><rect x="196" y="338" width="207.52173913043475" height="12" fill="#A3A3AC"></rect><text x="409.52173913043475" y="348" font-size="11" fill="#F5F5F6">37.0s</text><rect x="196" y="355" width="93.21290322580643" height="3" fill="#63636D"></rect><text x="295.21290322580643" y="360" font-size="9" fill="#63636D">5.6k tok</text></g></svg><figcaption>Median wall (thick bar, seconds) and request prefix (thin bar, k tokens) per variant · task <code data-hk="000000010000000000004000010b29600">sol</code>, median of 6 runs, fresh session each · cyan = omp variants, grey = external references · annotations are deltas vs the row above.</figcaption></figure>

罪魁祸首是工具列表。限制为五个核心工具后，耗时就变成 `36.6s`，快于 Codex 的 `42.2s` 和 Pi 的 `37.0s`。为什么？工具语法！即使对模型只是文本描述，对大多数前沿模型提供商来说，它也会实际参与 token 生成过程，促使模型始终输出有效 JSON——这还不算描述本身消耗的 token。

不能因为模型可能会需要，就认为加一个工具是零成本收益；这也是动态工具发现背后的思路。但动态方式一改变工具列表，就会使缓存失效，所以我们并不太喜欢它。

Pi 有一点做对了，我们一直赞同：MCP 的设计很糟，不该进入常驻工具层。那怎么同时满足想用 Figma MCP 的用户，以及模型推理的约束？

动态工具发现避开了常驻语法成本，却在每次列表变化时让缓存失效。更好的目标，是稳定而极小的语法，再通过普通组合方式触达长尾能力。

### 把长尾能力放在稳定接口后面

来认识 `dyn` CLI！当然，它不是真正的独立 CLI，而是我们的 Bash 实现暴露的内置命令。它给模型提供稳定的发现协议，既能方便地从 Bash 调用，也能在 `Eval` 中作为 Python 函数使用。

```jsx
dyn
dyn --q github
dyn github/list_prs --state open | jq '.[] | .title'
cat query.sql | dyn database/query - --params limit=5
dyn image_gen "blueprint of a frog" > result.json
```

找到感兴趣的工具后，和工具搜索一样，用 `--help` 获取详情：

```jsx
$ dyn github/create_pr --help
dyn github/create_pr <title> [OPTIONS]

Arguments:
  <title>

Options:
  -d, --draft / --no-draft
  -r, --reviewers <TEXT>[,…]  (repeatable)
  -p, --pr-meta.priority <INTEGER>
  -m, --pr-meta.notify / --no-pr-meta.notify
  -j, --json <JSON>
  -h, --help
```

这些自然都是从 JSON schema 自动生成的；光有 schema，就足够生成一套好用的 CLI 映射。

面对大输入时，这种方式尤其方便：

```jsx
dyn database/query "SELECT 1"       # literal
dyn database/query @query.sql       # file contents
cat query.sql | dyn database/query - # stdin
```

还得处理一个边界情况：返回图像的工具怎么办？omp 通过什么给你显示图像？Sixel 或 Kitty 协议，对吧？那就在 `Bash` 工具中解析相同输出，并把图像附上！顺便还能通过 ssh 查看远程图像，不错。

如果这些操作都属于同一个 API，还有第二种选择：暴露代码接口。Browser 保留 `open` / `run` / `close`，在持久化标签页上执行代码；Computer 在持久会话中暴露 `desktop`、`wait` 和 `assert`。只需一个稳定 schema，在一次调用内部组合操作。**有限操作集用 schema，开放式操作集用代码接口。**

两种形式服务于不同形态的 API。有限操作集可以继续使用 schema；开放式操作集则更适合代码或命令接口，在单次调用中组合多个操作。两者都不要求发现工具后再修改常驻列表。

### 契约规范：意图与版本

契约中有个小改动值得一提：每个工具都获得一个 `i` 意图参数。它在参数流式传入时到达，因此 `renderCall` 可以在调用完成前，展示模型认为自己正在做什么。日志也能获得可读摘要，不必让每个工具各自发明 `reason` / `purpose`。

大家应该**给工具加版本号**。

这样运行轨迹就好用得多：可以解析频繁变化的工具 I/O，评估成功率随时间的变化，而不必猜测每次调用究竟来自哪个版本的契约。

名称、版本、意图、输入、输出、诊断和用量，都是协议数据。一旦轨迹用于评估或修复，对其中任何一项靠猜，都是本可避免的技术债。

### 功能深厚的内置工具

小型工具列表能成立，前提是原语的广度来自统一语义，而不是把不相关功能塞进同一个 switch。omp 的内置工具就是很好的例子。

#### Read：把资源转成可用表示

`omp` 里最无聊的工具，实际上囊括了其他框架可能拆成 20 个工具的能力。

- 可以读取目录，不必另设 `Ls`。
- 读取 `.ipynb` 文件，默认就有易读输出，不必再加 `ReadNotebook`。
- `.pdf`、`.docx`、`.pptx`、`.xlsx`、`.epub`？返回提取后的 Markdown。
- `.cpuprofil, .sample.txt`？没错，返回性能瓶颈摘要。
- `.sqlite`、`.sqlite3`、`.db`、`.db3`？可以列出表、检查 schema 和行，甚至查询。
- 图像返回图像本身；不使用视觉时则返回元数据。预览 SVG，加上 `:img`。
- 无需解压就能寻址归档内容，不仅支持 ZIP 和 TAR，也支持 JAR、wheel 和 ASAR。
- 同样的投影适用于 `http://...` 在线资源，按需读取范围；普通网页则像 `web_fetch` 一样转换成 Markdown。

这并不是为了显得聪明而搞多态。从模型角度看，它们全是同一种操作：

> 把这个资源转成最适合我理解和推理的表示形式。

对于代码，它还能返回结构摘要，用省略号替代大型声明体。模型不必仅为找到类 `X`，就把整个大文件拖进上下文。

需要关注原始字节时，`:raw` 可以绕过投影。`:conflicts` 则为每个未解决的合并冲突块返回一行，不必让模型在整个文件里翻找。

范围可以没有结束位置、按长度指定，也可以互不连续：

```jsx
:50
:50-
:50-200
:50+150
:5-16,960-973
:raw:50-100
:50-100:raw
```

还有这些非 Web URL：

```jsx
artifact://<id>
agent://<id>
history://<id>
issue://123
pr://123/diff/2
skill://react
rule://foo
memory://...
local://...
vault://...
security://...
omp://...
xd://browser
ssh://host/path
mcp://...
```

仓库信息、MCP 资源、子智能体会话记录、技能、记忆、本地临时空间、omp 文档，甚至通过 SSH 访问的远程机器，都能纳入同一个内部 URL 子系统。我们推荐这种设计。

`Read` 也会处理不那么显眼的恢复逻辑：依据唯一的工作区路径后缀，修正错误的绝对路径；在 Windows 上展开 `~`；避免其他浪费轮次的路径错误。

它能不能只写成这样？

```jsx
return await Bun.file(path).text();
```

能。然后扩展作者会自己实现读取器，或者模型寻找 shell 变通方案；与此同时，框架又会用 `web_fetch` 等不同名字暴露形态相近的能力。

这不是更少的复杂性，而是同样的复杂性被复制到 shell 命令、提示词、扩展和失败的工具调用里。没人负责，每个人都略有不同地实现其中 30%。

`Read` 复杂，是为了让读取不复杂。

复杂性由一个地方负责。操作保持稳定，资源特定的投影放在其后。

#### Bash：理解策略的命令语言

Bash 工具不该只是调用外部 Bash。听起来很疯。

omp 在进程内提供完整的 bash 解析器、解释器，以及全套 coreutils。这个选择很好，原因很简单：

- 保留模型的肌肉记忆。它可以继续用 `grep`；由于 omp 就是解释器，我们能拦截命令，将适合的参数路由到 ripgrep 引擎。谁也不必在 `AGENTS.md` 里消耗上下文，苦求模型改用 `rg`。
- 几乎免费获得跨平台能力。不需要 WSL 或 Git Bash：omp 在 Windows 上就能在进程内执行大多数 Bash 调用。无需多言。
- 控制台状态跨调用保留，包括变量、退出码、`$!` 等。

当 Claude 发来这样的调用时，更有意思的优势就出现了：

```typescript
INC="…/10.0.22621.0"; declare -A R
for d in um shared ucrt; do while IFS= read -r f; do b="${f##*/}"; R["${b,,}"]="$f"; done \
  < <(find "$INC/$d" -maxdepth 1 -type f -name "*.[hH]"); done
n=0
while IFS= read -r ref; do case "$ref" in */*) continue;; esac; r="${R[${ref,,}]:-}"; \
  [ -n "$r" ] || continue; rd="${r%/*}"; rn="${r##*/}"; \
  if [ "$ref" != "$rn" ] && [ ! -e "$rd/$ref" ]; then ln -s "$rn" "$rd/$ref"; n=$((n+1)); fi; \
done < <(grep -rhoiE "#[[:space:]]*include[[:space:]]*<[^>]+>" "$INC/um" "$INC/shared" "$INC/ucrt" \
  | sed -E "s/.*<([^>]+)>.*/\1/" | sort -u)
```

你能在 5 秒内说出它在做什么吗？如果你说能，那你在撒谎。

不管你对工具审批持什么看法，这都很糟：没人会认真读。Anthropic 最近的研究也指向同样结论，auto mode——让另一个 Claude 读取命令——明显胜过人类。

omp 自己解释命令时，可以等执行到 `ln` 的那一刻才询问；之前的操作全是只读。如果用户已允许写入该目录，连这次询问也能省掉。

这让运行框架不再像给“Bash”过安检，而是审批具体能力：“我可以用 Git 推送吗？”`find`、`cat`、`ln` 等常用命令在进程内运行，在需要时才查询访问模型，并继承用户已有的读写策略。

主机解释常用命令，意味着审批可以发生在真正重要的能力边界：`git push`、工作区外写入、网络请求，而不是一串难以阅读的 shell 字符串边界。第三章的运行时策略由此可以被强制执行，同时保留模型的 shell 肌肉记忆。

#### AutoQA：给智能体一条报缺陷的路径

我们创建分叉一个月后就加入了这个工具，比 Anthropic 在自家产品中加入类似功能还早。

你通常会提供某个渠道，让用户报告产品问题，对吧？这就是面向智能体的对应版本。它让你完全自动地收集：工具哪些地方好用，哪些地方令人困惑，哪些行为看起来有错。

报告质量确实不算*出色*。例如，Codex 没有正确重命名东西时，就爱把文件被外部修改的问题归咎于 `Read` 或 LSP 工具——*不是我的错，去问 TypeScript 那帮人*。不过，这类报告很容易过滤。过滤之后，就能获得大量有价值的信号，知道哪些工具失败、如何改进。

AutoQA 让工具设计与上线后的实际行为形成闭环。它有噪声，但剔除明显误归因之后，就能揭示：哪个操作让模型困惑，哪种投影隐藏了必要数据，哪些修复该由运行框架承担。

现在，工具有了受限运行时、稳定的发现接口和结构化状态。只是为了安全地显示这些状态，不该还要求每个工具作者——往往就是 Claude——都成为终端渲染和安全专家。


<a id="the-interface"></a>

## 界面

- **267 秒 → 90 毫秒**：单个会话的渲染时间。
- **13%**：性能采样中，一个 `.includes` 调用占用的 CPU 比例。
- **98.7 秒**：花在 `wrapAnsi` 重新换行上的时间。
- **0 张**：该会话中的图像数量。

会话 DOM 和工具状态流，让每个客户端获得相同事实。但它们本身并不会自动产生安全、快速、一致的界面。渲染器仍可能把这些事实变成反复解析的字符串、扩展各自的样式约定，以及无法挽回的回滚缓冲区缺陷。

### omp 给我们的教训：字符串开销会层层放大

这其实是我最早向 [pi-mono](https://github.com/earendil-works/pi/pull/1084) 提交的几个 PR 之一所处理的问题。修改之前，如果对 Pi 执行整个任务的过程做性能分析，再查看 CPU 用量榜，榜单几乎全被——你猜对了——渲染器占据！

<figure data-hk="000000010000000000004000010b361"><canvas data-hk="000000010000000000004000010b3620" aria-hidden=""></canvas><figcaption>Pi 会话的 CPU 性能分析，几乎由渲染器主导：自身耗时矩形树图。仅字符串扫描（红色）就消耗了会话的五分之一。原站中可悬停方块查看对应代码。译注：该图为依赖原站脚本的交互式画布，静态译文不包含其交互显示，请<a href="https://stencil.so/blog/harness-playbook#the-interface">前往原文查看</a>。</figcaption></figure>

作为 TypeScript CLI，有些成本难以避免。光是字符串内部使用 UTF-16，就意味着每一帧都得经历相对昂贵的转码，除非你像个狂人一样，用 Uint8Array 到处传递文本。

但让成本层层放大的，是契约本身。想嵌入一个子组件？现在你得处理：

- 清理这个 `string`，并丢弃 ANSI 转义序列，或解析时跳过它们。
- 处理每一行的填充、截断和尺寸计算。

图像还可能以 base64 文本混在某一行里，这就更糟了。仅检查一行是否为图像行的 `.includes`，就占了整个会话 CPU 周期的 20%。（译注：本章开头的摘要写 13%，此处正文写 20%；原文未解释统计口径差异，译文保留两处数字。）账单可不小——而且这个会话根本没有图像！

这还只是 JavaScript 一侧的图表。在这种设计下，渲染管线成了反复折腾堆内存的机器：不停分配、拆解、丢弃字符串和字符串数组；拼接、切分、截断、填充，每一步都重复。真不妙。

同一契约还让扩展缺少共同设计语言。只要用过*任何* Pi 扩展，你就知道，除了让 Clawd 逐个重做样式、再自己维护，没有办法让它们遵循共同规范。

没有契约规定该不该用圆角边框、能不能用 Nerd Font 图标、会不会用你喜欢的颜色表达操作语义。你会发现：

- 99% 的时候，它只做最低限度的工作，也就是截断或折行，所有工具都成了难以区分的灰色矩形。
- 1% 的时候，它过于努力地追求花哨，与你其余极简配置格格不入。

Pi 目录中的一个社区渲染器，展示了这种契约会怎样影响最终呈现给用户的内容：

```jsx
  if (cq.sources.length > 0) {
    lines.push("");
    for (const s of cq.sources) {
      const domain = s.url.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
      const title = s.title.length > 50 ? s.title.slice(0, 47) + "..." : s.title;
      lines.push(theme.fg("muted", ` \u25b8 ${title}`) + theme.fg("dim", ` \u00b7 ${domain}`));
    }
  }
  lines.push("");
} else {
  const textContent = result.content.find((c) => c.type === "text")?.text || "";
  const preview = textContent.length > 500 ? textContent.slice(0, 500) + "..." : textContent;
  for (const line of preview.split("\n")) lines.push(theme.fg("dim", line));
}

if (details?.fetchUrls?.length) {
  if (details.curated) {
    lines.push(theme.fg("muted", `Fetching ${details.fetchUrls.length} URLs in background`));
  } else {
    lines.push(theme.fg("muted", "Fetching:"));
    for (const u of details.fetchUrls.slice(0, 5)) {
      const display = u.length > 60 ? u.slice(0, 57) + "..." : u;
      lines.push(theme.fg("dim", "  " + display));
    }
    if (details.fetchUrls.length > 5) lines.push(theme.fg("dim", `  ... and ${details.fetchUrls.length - 5} more`));
  }
}
```

这里的问题不少：

1. 它按码点而不是可见宽度切文本，因此一旦把终端缩到 40 列以下，就会越出本行，把下面的内容撞乱。
2. 它不知道终端宽度，所以即便空间充足，仍然给你省略号！
3. 最重要的是，它无视 Pi 组件的第一条规则，没有清理外部输入。因此，抓取的内容只要送来合适的 ANSI 转义序列，就能把整个 UI 换成一张鸭子图片。[当然](https://www.sentinelone.com/vulnerability-database/cve-2023-32712/)[不可能](https://socprime.com/active-threats/cve-2025-55752/)[再干](https://github.com/boxdot/gurk-rs/issues/384)[其他坏事](https://www.packetlabs.net/posts/weaponizing-ansi-escape-sequences/)啦！

把复杂性推给毫无防备的开发者——往往就是 Claude——自然会出现这种事。

每次被要求“帮忙做个工具 UI”时，LLM 不会记得运行框架的所有内部细节。说实话，有时我也不想记，而冒烟测试依然会判定它可用。

性能、安全和一致性问题，都来自同一个原因：一段已经渲染好的字符串，同时被当作布局树、样式树、内容、传输载体和终端程序。

### omp² 的改变：单遍处理原语

最底层的调用者——除非你来提交 PR，否则不是你——把 *RichText* `(Style, String)` 推入传给它们的抽象管线 `(&mut impl Out)`。

这把 267 秒的渲染时间降到了 90 毫秒：

<figure data-hk="000000010000000000004000010b381"><svg data-hk="000000010000000000004000010b38200" viewBox="0 0 1000 772" role="img" aria-label="Render pipeline: before, N + N·M buffers per frame; after, a single-pass sink with an O(cache) RichText replay" font-family="var(--st-font-sketch)"><defs><pattern id="pl-dots" width="22" height="22" patternUnits="userSpaceOnUse"><circle cx="11" cy="11" r="1.1" fill="#2E333C"></circle></pattern></defs><rect width="1000" height="772" fill="#121419"></rect><rect width="1000" height="772" fill="url(#pl-dots)"></rect><text data-hk="000000010000000000004000010b3820100" x="500" y="48" font-size="26" fill="#DBD8CF" text-anchor="middle" letter-spacing="2" stroke="#DBD8CF" stroke-width="0.8">RENDER ONCE, REPLAY FOREVER</text><path data-hk="000000010000000000004000010b3820110" d="M219.6 59.1C397.5 59 594.7 60 780.9 60.3M219.2 59.6C460.8 61 638.4 61.7 780.3 59.7" fill="none" stroke="#DBD8CF" stroke-width="2" stroke-linecap="round"></path><text data-hk="000000010000000000004000010b382020" x="48" y="112" font-size="16" fill="#F4644A" stroke="#F4644A" stroke-width="0.8">before</text><text data-hk="000000010000000000004000010b382030" x="130" y="112" font-size="13" fill="#9AA2AD">render(): string[]</text><rect data-hk="000000010000000000004000010b382040" x="49.5" y="145.5" width="117" height="39" rx="0" fill="#1A1E25"></rect><path data-hk="000000010000000000004000010b382041" d="M49.1 142.5C84.8 145.1 135.5 143.9 167.3 142.7M48.2 145.4C86.1 145.8 136.9 144.6 168.3 143.4M169.4 143.6C167.5 159.8 168.6 181.4 166.8 186.7M168.2 143.8C168.6 161.6 168.8 173.4 167.9 186.6M168.7 185.7C127.9 187 86.1 185.6 48.1 184.6M169.3 184.6C108.4 187.1 81.8 186.9 47.2 186.7M48.3 185.7C47.3 170.6 47.3 153.6 48.6 142.9M48.5 186.2C47.2 165 48.2 156 47.8 141.5" fill="none" stroke="#F4644A" stroke-width="1.5" stroke-linecap="round"></path><text data-hk="000000010000000000004000010b382050" x="108" y="170" font-size="14" fill="#DBD8CF" text-anchor="middle">string[]</text><rect data-hk="000000010000000000004000010b382060" x="249.5" y="145.5" width="117" height="39" rx="0" fill="#1A1E25"></rect><path data-hk="000000010000000000004000010b382061" d="M246.4 143C284.1 142.9 330.4 144.1 367 142.8M246.6 143.1C285 146 345.1 144.9 369.5 143.4M367.8 144.3C369 160.1 367.8 173.6 368.9 185.4M367.8 142.9C370.1 158 367.8 177.8 367 185.9M369.4 186.8C319.3 186.9 282.3 187.7 246 185M369.3 185C327.2 187.7 266.7 187.5 245.3 187M248.5 186.6C246.7 167.8 246.8 152.3 248.9 143.8M248.4 187.3C248.3 168.9 249.1 157.8 248 144.1" fill="none" stroke="#F4644A" stroke-width="1.5" stroke-linecap="round"></path><text data-hk="000000010000000000004000010b382070" x="308" y="170" font-size="14" fill="#DBD8CF" text-anchor="middle">string[]'</text><rect data-hk="000000010000000000004000010b382080" x="449.5" y="145.5" width="117" height="39" rx="0" fill="#1A1E25"></rect><path data-hk="000000010000000000004000010b382081" d="M446.4 143.3C507.3 143 544.8 143.4 568 144M447.4 144.8C494.6 141.9 545.4 144.1 567.9 145.2M566.5 142.2C568.8 157.1 567.5 178.5 566.8 186.2M567.8 143.3C566.9 163.3 568.8 175.9 569.4 186.8M570.6 185.9C514.5 185.4 465.5 187.9 445.9 186.2M568.6 184.9C533.4 187.9 479.4 185.7 447.6 186.7M449.1 189.6C447.9 166.6 447.4 158.5 448 141.4M448.4 187.8C449.7 169.5 446.3 149.5 449 142.6" fill="none" stroke="#F4644A" stroke-width="1.5" stroke-linecap="round"></path><text data-hk="000000010000000000004000010b382090" x="508" y="170" font-size="14" fill="#DBD8CF" text-anchor="middle">string[]''</text><rect data-hk="000000010000000000004000010b3820a100" x="649.5" y="145.5" width="117" height="39" rx="0" fill="#1A1E25"></rect><path data-hk="000000010000000000004000010b3820a101" d="M645.6 142.7C694.7 143.5 743.6 143.6 771 143.5M647.6 145.5C692.6 143.1 748.3 143.8 771.5 144.8M768.8 142C766.7 157.1 767.9 177.4 768.6 186.3M766.6 142.2C769.4 163.3 766.7 178 768.9 186M770.3 187.3C730.3 185 680.4 185.8 645.4 186.6M770.8 186.3C713.4 187.7 687.5 186.4 645.3 186.4M646.7 188.1C646.9 174 648.7 151.2 646.6 144.2M647.4 187.2C648.9 169.7 649.1 154.6 649.4 142" fill="none" stroke="#F4644A" stroke-width="1.5" stroke-linecap="round"></path><text data-hk="000000010000000000004000010b3820a110" x="708" y="170" font-size="14" fill="#DBD8CF" text-anchor="middle">string[]'''</text><rect data-hk="000000010000000000004000010b3820a120" x="849.5" y="145.5" width="101" height="39" rx="0" fill="#1A1E25"></rect><path data-hk="000000010000000000004000010b3820a121" d="M847.7 143.8C896.3 143.1 927.1 143.1 955.3 143.8M847.3 143.2C895.9 143.2 923.7 144 953 145.5M951.6 143.8C952.3 162 950.1 174.1 951.3 187.3M951.3 142.4C953.9 156.5 952.2 177.8 952.3 187.1M953.2 185.8C908.7 186.9 868.1 184.9 847.6 186.8M953.5 187.4C912.4 183.1 882.2 184.6 846.4 186.2M848.9 186.8C847 168 847.9 152 848.4 145M848.1 186.6C847.3 166.2 848.6 150 847.5 142.9" fill="none" stroke="#F4644A" stroke-width="1.5" stroke-linecap="round"></path><text data-hk="000000010000000000004000010b3820a130" x="900" y="163" font-size="13" fill="#DBD8CF" text-anchor="middle">parent</text><text data-hk="000000010000000000004000010b3820a140" x="900" y="179" font-size="13" fill="#DBD8CF" text-anchor="middle">string[]</text><path data-hk="000000010000000000004000010b3820a150" d="M167.2 164.2C200 164.2 218.3 165.7 243.4 166.1M168.9 165C200.2 164.7 220.5 164.1 244.2 163.1M243.9 164.8C239.9 166.8 236.4 168.2 234.1 169.7M243.7 165.2C239.2 167.5 237.4 168.1 233.9 169.4M243.7 165C239.9 163.6 237.6 162.2 233.8 160.6M243.8 164.8C240.3 164 236.6 161.5 233.7 160.5" fill="none" stroke="#DBD8CF" stroke-width="1.5" stroke-linecap="round"></path><path data-hk="000000010000000000004000010b3820a160" d="M367.5 163.8C400.9 165.7 427.8 164.5 443.8 162.6M367.1 165C406.6 164.6 421.7 167.2 443.5 166.4M444.3 165.1C440.6 166.4 435.6 168.8 433.8 169.8M444.1 164.8C438.7 167.2 435.5 168.7 433.8 169.8M444.1 165.3C440 163.2 435.8 161.2 433.7 160.2M443.8 164.9C439.8 163.6 437.2 162.1 434.1 160.2" fill="none" stroke="#DBD8CF" stroke-width="1.5" stroke-linecap="round"></path><path data-hk="000000010000000000004000010b3820a170" d="M567.1 164.3C598.6 165 623.4 164.8 644.9 163.1M567.9 164.9C597.6 165.2 618.8 166.3 645.9 166.1M644.1 165.2C640.1 166.6 635.5 168.6 634.1 169.7M644.2 165.3C639.4 166.9 637.1 168.8 633.6 169.2M643.7 165.1C639.7 163.1 637 162.2 634.1 160.8M644.2 164.7C639.3 162.8 635.7 160.8 633.9 160.5" fill="none" stroke="#DBD8CF" stroke-width="1.5" stroke-linecap="round"></path><path data-hk="000000010000000000004000010b3820a180" d="M766.4 166.5C803.9 164.4 823.9 164.7 842.8 164.7M767.7 163.7C796.3 164.3 825 162.6 844.4 164M844 165.3C839.3 166.4 836.9 168.3 833.7 169.3M844.2 165.3C839.3 167.5 836.3 168.9 833.8 169.4M843.8 165.1C840.4 163.1 837.2 162.1 834.3 160.4M843.8 165.2C839.5 162.9 835.9 161.5 834.1 160.6" fill="none" stroke="#DBD8CF" stroke-width="1.5" stroke-linecap="round"></path><text data-hk="000000010000000000004000010b3820a190" x="206" y="138" font-size="13" fill="#F4644A" text-anchor="middle" transform="rotate(-1.5 206 138)">parse</text><text data-hk="000000010000000000004000010b3820a200" x="406" y="138" font-size="13" fill="#F4644A" text-anchor="middle" transform="rotate(1 406 138)">wrap</text><text data-hk="000000010000000000004000010b3820a210" x="606" y="138" font-size="13" fill="#F4644A" text-anchor="middle" transform="rotate(-1 606 138)">pad</text><text data-hk="000000010000000000004000010b3820a220" x="806" y="138" font-size="13" fill="#F4644A" text-anchor="middle" transform="rotate(1.5 806 138)">concat</text><text data-hk="000000010000000000004000010b3820a230" x="206" y="202" font-size="13" fill="#F4644A" text-anchor="middle">alloc</text><text data-hk="000000010000000000004000010b3820a240" x="406" y="202" font-size="13" fill="#F4644A" text-anchor="middle">alloc</text><text data-hk="000000010000000000004000010b3820a250" x="606" y="202" font-size="13" fill="#F4644A" text-anchor="middle">alloc</text><text data-hk="000000010000000000004000010b3820a260" x="806" y="202" font-size="13" fill="#F4644A" text-anchor="middle">alloc</text><text data-hk="000000010000000000004000010b3820a270" x="48" y="236" font-size="13" fill="#9AA2AD">N components × M transforms — every buffer re-parsed, re-measured, thrown away. Every frame.</text><path data-hk="000000010000000000004000010b3820a280" d="M47.4 274.6C427.3 271.2 639.7 275.7 950.7 273.2M46.7 272.6C455.2 275.1 638.7 274.8 952.1 274.4" fill="none" stroke="#9AA2AD" stroke-width="1" stroke-linecap="round"></path><text data-hk="000000010000000000004000010b3820a290" x="48" y="324" font-size="16" fill="#4ADE80" stroke="#4ADE80" stroke-width="0.8">after</text><text data-hk="000000010000000000004000010b3820a300" x="122" y="324" font-size="13" fill="#9AA2AD">push run(style, &amp;str) into a sink</text><text data-hk="000000010000000000004000010b3820a310" x="48" y="392" font-size="14" fill="#DBD8CF">markdown</text><text data-hk="000000010000000000004000010b3820a320" x="48" y="422" font-size="14" fill="#DBD8CF">latex · syntax</text><text data-hk="000000010000000000004000010b3820a330" x="48" y="452" font-size="14" fill="#44CFFF">decompose(ansi)</text><text data-hk="000000010000000000004000010b3820a340" x="48" y="480" font-size="13" fill="#9AA2AD">external text, parsed once</text><path data-hk="000000010000000000004000010b3820a350" d="M179 389Q221.2 396.8 235.5 405.4L249.8 414.1M181 388.5Q220.8 397.1 234.8 405.3L248.9 413.4M250.2 413.9C246.5 413.2 241.8 413.2 239.4 412.3M249.9 414.3C245.1 413.3 242.7 413.4 238.9 412.6M250.3 413.7C247.7 411.2 245.9 407.1 244.2 404.9M250.2 413.9C247.4 410.1 245 406.8 244 404.9" fill="none" stroke="#4ADE80" stroke-width="1.5" stroke-linecap="round"></path><path data-hk="000000010000000000004000010b3820a360" d="M176.1 418.9C203.8 417.9 230.2 416.6 249.6 417.8M178.5 417C202 418.6 234.3 418.9 250.7 419.3M249.9 418.9C245.4 421 242 422.6 239.8 423.6M250.1 419.1C246.6 420.3 243.3 421.9 240.1 423.5M250.2 419.1C245.1 416.8 241.2 415 240.3 414.2M249.7 418.8C245.7 417.4 242 415.7 240 414.7" fill="none" stroke="#4ADE80" stroke-width="1.5" stroke-linecap="round"></path><path data-hk="000000010000000000004000010b3820a370" d="M185.1 448.3Q223 441.4 235.9 432.9L248.7 424.3M187.1 448.9Q222.7 440.9 236.2 432L249.7 423.1M250.3 424C247.7 426.7 245.3 431.3 243.7 432.9M249.8 424.2C247.9 427.2 244.9 431.6 243.9 433.5M249.7 424.2C245.2 424.7 242.5 425.5 239.3 425.5M250.1 424C246.3 424.7 240.9 425.4 238.9 425.4" fill="none" stroke="#4ADE80" stroke-width="1.5" stroke-linecap="round"></path><rect data-hk="000000010000000000004000010b3820a380" x="257.5" y="397.5" width="313" height="45" rx="0" fill="#1A1E25"></rect><path data-hk="000000010000000000004000010b3820a381" d="M254.5 396C407.3 397.3 478.5 394.3 573.3 396.3M254.5 395.3C400.3 396.1 519 394.1 573 396.4M570.7 393.8C573 409.5 574.3 431.4 573.1 444.7M571.7 394.5C572.7 419.5 573.6 433.7 572.5 445.5M574.8 444.5C422.5 443.4 302.4 443.5 254.9 442.9M574 444.6C456 441.5 359 440.5 255.2 443.6M254.8 444.3C254.9 427.7 257.6 403.7 257 394.9M255.8 445.4C255.5 428.3 257.1 408.8 255.3 395" fill="none" stroke="#44CFFF" stroke-width="1.5" stroke-linecap="round"></path><path data-hk="000000010000000000004000010b3820a390" d="M362.9 398.3C363.8 413.4 361.5 427.3 363.4 440.8M363 396.9C363.1 412.7 362.2 429 362.6 441.8" fill="none" stroke="#44CFFF" stroke-width="1" stroke-linecap="round" stroke-dasharray="6 5"></path><path data-hk="000000010000000000004000010b3820a400" d="M467.9 398.9C468.1 414.4 468.4 425.8 469.4 442.9M467.5 396.6C466.6 419.5 467.9 434.4 467.2 441.1" fill="none" stroke="#44CFFF" stroke-width="1" stroke-linecap="round" stroke-dasharray="6 5"></path><text data-hk="000000010000000000004000010b3820a410" x="309" y="426" font-size="13.5" fill="#44CFFF" text-anchor="middle">.wrap(w)</text><text data-hk="000000010000000000004000010b3820a420" x="415" y="426" font-size="13.5" fill="#44CFFF" text-anchor="middle">.clip(w,'…')</text><text data-hk="000000010000000000004000010b3820a430" x="520" y="426" font-size="13.5" fill="#44CFFF" text-anchor="middle">.restyle(f)</text><text data-hk="000000010000000000004000010b3820a440" x="414" y="472" font-size="13" fill="#4ADE80" text-anchor="middle" transform="rotate(-0.7 414 472)">single pass · no intermediate row buffers</text><path data-hk="000000010000000000004000010b3820a450" d="M572.4 418C614.2 419.7 640.4 421.7 661 421.4M571.5 422.1C604.9 421.8 635.5 420.1 659 418.6M660.1 420.3C657.3 421.3 653.1 423.4 649.7 424.7M660.4 420C655.9 422 651.6 423.3 649.7 424.3M659.9 420C654.8 418.3 652.5 417 650.2 415.7M659.9 419.7C656.2 418.2 653.2 416.9 649.8 415.9" fill="none" stroke="#4ADE80" stroke-width="1.5" stroke-linecap="round"></path><path data-hk="000000010000000000004000010b3820a460" d="M791.1 420.4C820.6 419.4 842.9 420.8 869.6 421.6M792.7 420.9C824.5 422 851.1 418.2 867.8 422M868.3 420.2C863.8 421.7 860.4 423.4 858.3 424.6M867.7 420C864.9 421.7 860.9 422.8 857.7 424.3M868.1 420.1C864.8 418.8 860.2 416.6 858.3 415.5M868.1 420.2C863.2 417.8 861.1 417 858.2 415.7" fill="none" stroke="#4ADE80" stroke-width="1.5" stroke-linecap="round"></path><rect data-hk="000000010000000000004000010b3820a470" x="665.5" y="397.5" width="121" height="45" rx="0" fill="#1A1E25"></rect><path data-hk="000000010000000000004000010b3820a471" d="M663.6 396.4C706.6 395.4 757.7 393.6 788.3 396.3M662 395.5C717.6 397.4 768.2 397 788.7 397.2M788.8 393.8C790.3 408.7 789.3 431.1 786.6 444M788.2 393.1C788.5 419 787.1 429.4 789.1 444.7M788.7 443.6C738.8 445 701.8 443.3 661.8 444.9M788.7 443.5C742.1 445.4 704.9 442.6 662.1 443.3M664.1 444.4C664 423.2 664.5 406.9 665.3 394.7M662.5 446.7C664 420.2 662.8 407 664.5 392.9" fill="none" stroke="#DBD8CF" stroke-width="1.5" stroke-linecap="round"></path><text data-hk="000000010000000000004000010b3820a480" x="726" y="426" font-size="14" fill="#DBD8CF" text-anchor="middle" stroke="#DBD8CF" stroke-width="0.8">Frame</text><text data-hk="000000010000000000004000010b3820a490" x="830" y="410" font-size="13" fill="#9AA2AD" text-anchor="middle">diff</text><rect data-hk="000000010000000000004000010b3820a500" x="873.5" y="397.5" width="77" height="45" rx="0" fill="#1A1E25"></rect><path data-hk="000000010000000000004000010b3820a501" d="M872.9 395.9C896 396.5 927.3 396.4 955 396.7M873 396C900.9 397.4 932.6 396 953.4 395.4M953.3 397C952.9 410.1 951 432.4 952.1 443.2M952.7 395.4C953 417.8 952.5 427.9 951.2 443.9M954.4 443.1C925.4 445.8 882.8 444.4 870.7 444.7M952.7 444.5C929.4 446.3 883.8 444.8 869.4 442.8M870.9 444.8C871.9 427.7 870.9 409.1 873.2 393.8M871.5 446.7C871.8 425.4 870.7 409.4 871.2 395" fill="none" stroke="#4ADE80" stroke-width="1.5" stroke-linecap="round"></path><text data-hk="000000010000000000004000010b3820a510" x="912" y="426" font-size="14" fill="#4ADE80" text-anchor="middle" stroke="#4ADE80" stroke-width="0.8">stdout</text><text data-hk="000000010000000000004000010b3820a520" x="952" y="472" font-size="13" fill="#9AA2AD" text-anchor="end">ANSI written here, once</text><path data-hk="000000010000000000004000010b3820a530" d="M615.1 419Q607.6 481.4 586.6 498.3Q565.6 515.1 543.1 530.1L520.5 545.2M613.2 419Q607.1 481.7 586.8 498.7Q566.5 515.8 542.8 530.4L519.1 544.9M520.1 544.3C522.6 540 524 537.9 526.2 534.8M519.7 543.7C522.9 540.6 525.4 536.6 526.5 535.1M520 543.8C525.5 543.7 528.7 542.6 530.6 542.3M519.7 543.8C524.1 544 527.7 543 530.6 542.4" fill="none" stroke="#F5B04A" stroke-width="1.5" stroke-linecap="round"></path><text data-hk="000000010000000000004000010b3820a540" x="628" y="498" font-size="13" fill="#F5B04A" transform="rotate(-2 628 498)">.tee(cache)</text><rect data-hk="000000010000000000004000010b3820a550" x="257.5" y="545.5" width="313" height="121" rx="0" fill="#1A1E25"></rect><path data-hk="000000010000000000004000010b3820a551" d="M254.2 543.7C362 542 521.3 543.3 573.1 544M255.4 542.8C351.7 541.4 510.2 547 572.5 543.7M572.4 543.4C571.6 588 571.1 643.7 572.4 667.4M572.9 542.6C572.8 589.7 570.8 624.8 570.8 669.3M574.7 668.1C446.3 668.8 323.5 668.4 255.1 668.6M573 669C468.1 664.4 320.1 670 254.6 667M255.5 668.2C256.2 614.7 257.6 585.2 257.3 542.3M255.9 669.2C257 609.7 254.5 564.1 256.2 540.9" fill="none" stroke="#F5B04A" stroke-width="1.5" stroke-linecap="round"></path><text data-hk="000000010000000000004000010b3820a560" x="280" y="576" font-size="15" fill="#F5B04A" stroke="#F5B04A" stroke-width="0.8">RichText</text><text data-hk="000000010000000000004000010b3820a570" x="280" y="604" font-size="13.5" fill="#DBD8CF">pool: String</text><text data-hk="000000010000000000004000010b3820a580" x="280" y="626" font-size="13.5" fill="#DBD8CF">runs: [(Style, ..end)]</text><text data-hk="000000010000000000004000010b3820a590" x="280" y="648" font-size="13.5" fill="#DBD8CF">rows: [(run_end, width)]</text><text data-hk="000000010000000000004000010b3820a600" x="256" y="694" font-size="13" fill="#9AA2AD">clear() keeps capacity — streaming re-renders allocate nothing</text><path data-hk="000000010000000000004000010b3820a610" d="M575.1 606.4Q675.8 596.8 699.2 558.9Q722.7 520.9 724.7 485L726.7 449.2M575.6 607Q676.1 597 699.5 559.5Q722.9 522.1 724.3 485.4L725.7 448.8M726.1 449.9C727.6 454.5 729.3 458.6 729.8 460.3M726.1 449.6C727.4 454.7 728.8 457.2 729.8 460M725.9 450.3C724.1 453.2 722.9 456.3 721.3 459.8M726.3 450.1C723.9 454.3 721.7 458.5 721.2 459.6" fill="none" stroke="#F5B04A" stroke-width="1.5" stroke-linecap="round" stroke-dasharray="6 5"></path><text data-hk="000000010000000000004000010b3820a620" x="746" y="566" font-size="13" fill="#F5B04A" transform="rotate(-1 746 566)">replay()</text><text data-hk="000000010000000000004000010b3820a630" x="746" y="584" font-size="13" fill="#9AA2AD">next frame, no re-render</text><path data-hk="000000010000000000004000010b3820a640" d="M48.8 717.8C459.1 721 764.8 719.3 952 718.1M47 718.8C378.3 718.9 635.3 718.9 952.6 717.4" fill="none" stroke="#9AA2AD" stroke-width="1" stroke-linecap="round"></path><text data-hk="000000010000000000004000010b3820a650" x="500" y="750" font-size="15.5" fill="#DBD8CF" text-anchor="middle"><tspan data-hk="000000010000000000004000010b3820a651" fill="#F4644A">N + N·M buffers per frame</tspan>&nbsp;&nbsp;-&gt;&nbsp;&nbsp;<tspan data-hk="000000010000000000004000010b3820a652" fill="#4ADE80">O(cache)</tspan></text></svg><figcaption>Before: <code data-hk="000000010000000000004000010b38300">render(): string[]</code> — N components × M transforms, every buffer re-parsed, re-measured, and re-allocated, every frame. After: RichText runs stream through the abstract pipeline in a single pass into the frame diff.</figcaption></figure>

临时对象、ANSI 解析、字素处理：在帧渲染器以下的每一层里，**统统消失**！显然就该如此。

既然可以流式写入填充，再写一行组件内容，如此重复，为什么还要先给整个组件补齐再往下传？既然可以在省略号之后直接停止消费流，或在变换过程中自行分行，为什么要让你先把 255 行 diff 全部彩色渲染出来，再 `.slice(0, 3)`，只为截成另一个字符串缓冲区数组？

底层原语统一负责测量和变换。高层永远不该解析 ANSI，去重新发现自己刚刚输出的结构。

### 类型化组件模型

接下来，`string[]` 会被真正的组件模型替代。高层调用者只需堆叠盒子，让 LSP 为自己指路：

<figure data-hk="000000010000000000004000010b389"><img src="https://stencil.so/blog/harness-playbook/component-model-lint.png" width="817" height="139" alt="Editor showing omp² component markup where nesting a &lt;text&gt; element inside &lt;text&gt; is flagged: elements are not allowed inside &lt;text&gt;" loading="lazy"><figcaption>标记语言具有类型约束：在 <code data-hk="000000010000000000004000010b39000">&lt;text&gt;</code> 内嵌套元素，会在编辑时触发 lint 错误，而不是到运行时才把画面弄坏。</figcaption></figure>

<figure data-hk="000000010000000000004000010b391"><img src="https://stencil.so/blog/harness-playbook/component-markup-render.png" width="845" height="308" alt="omp² TUI rendering markup live: a box with a title row, an icon, a horizontal magenta-to-cyan gradient on text, and a rendered LaTeX fraction one half" loading="lazy"><figcaption>输入标记，输出画面：<code data-hk="000000010000000000004000010b39200">&lt;box&gt;</code>、<code data-hk="000000010000000000004000010b39300">&lt;row&gt;</code>/<code data-hk="000000010000000000004000010b39400">&lt;col&gt;</code>、<code data-hk="000000010000000000004000010b39500">&lt;ico:new/&gt;</code> 图标、水平 <code data-hk="000000010000000000004000010b39600">magenta..cyan</code> 渐变，以及由 <code data-hk="000000010000000000004000010b39700">$$ \frac{1}{2} $$</code> 实时渲染的 ½。</figcaption></figure>

我可能不喜欢写前端，但我可太喜欢好的抽象了。只需 `(Element, Props, Children)`，再搭配一个布局引擎，相比之下就已经美妙得多。

DOM 一章承诺，任何参与者都能渲染一个工具元素。下面就是这个承诺的具体样子。

这是 `Read` 组件的模样。还不错，对吧？

```jsx
<box bc=muted>
	<row kind=title gap=1>
		<text>•</text>
		<text bold>Read</text>
		<a href={input.path}>{input.label}</a>
		{#if status=error}<badge tone=error>exit {code}</badge>{/if}
	</row>
	{#if result.head}<pre lang={result.lang} wrap=word start={result.start}>{result.head}</pre>{/if}
	{#if @expanded}
		{#if result.blob}<pre lang={result.lang} numbers start={result.start} blob={result.blob}></pre>{/if}
	{/if}
	{#each diag as d}<callout tone={d.severity}>{d.msg}</callout>{/each}
	{#if result.src}
		<hr title="Output"/>
		<row gap=1 fg=muted>
			<text>⟨Resolved path:</text>
			<text>{result.src}⟩</text>
		</row>
	{/if}
	{@render usage}
</box>
```

工具作者描述结构和语义。TUI、Web 客户端、快照测试和远程检查器，决定如何在自己的界面上布局这些结构。

### 展示策略属于渲染器

组件模型免费带来两个有用特性：

1. `<ico:new/>` 为每个插件提供方便的图标，同时尊重用户选择 ASCII、Unicode 还是 Nerd Font。边框也一样。
2. 语义颜色不再需要把主题对象穿过每个渲染器。Claude 可以请求 `info`，而不是挑一个字面颜色，再祈祷它适合用户主题。

<figure data-hk="000000010000000000004000010b406"><img src="https://stencil.so/blog/harness-playbook/theme-gradient-markup.png" width="867" height="195" alt="omp² markup using border=round bc=info and fg=red..blue, rendered as a rounded box in the theme's info color with a gradient glyph" loading="lazy"><figcaption><code data-hk="000000010000000000004000010b40700">border=round bc="info"</code> 解析为主题中的语义颜色；<code data-hk="000000010000000000004000010b40800">fg="red..blue"</code> 表示渐变。不需要到处传递主题对象。</figcaption></figure>

文本流的节奏也需要统一管理。Claude 和 Codex 输出分块的节奏很不一样：一个每次几个词，另一个每次几个字符。抹平这些差异，会改变框架给人的响应速度感受：持续运动看起来是在推进，突然喷出一段再停住则不是。嘿。

语义图标、边框、颜色、截断和流式节奏，现在都有唯一负责人。扩展请求 `info`、`error` 或 `<ico:new/>`，不必把主题对象穿过每个函数，也不用替所有用户选择 Nerd Font 字形。

### 验证是界面的一部分

在当下这套玩法中，投入产出比最高、又几乎不额外花钱的事情，就是让智能体为任何交互式 TUI／GUI 实现调试协议。如果“怎么验证”不明确、没定义，智能体就会另走旁路，做出一个貌似验证的东西——多数情况下，就是新建一个其实没检查什么的测试文件。

提前定义“验证”意味着什么，并提供方便的使用形式，就能大幅降低摩擦，让验证真正成为开发循环的一部分。

<figure data-hk="000000010000000000004000010b414"><img src="https://stencil.so/blog/harness-playbook/tui-debug-tool.png" width="722" height="523" alt="Two TUI Debug tool calls: one injects eight synthetic key events into a session named chat, the other dumps the headless layout tree with component names, positions, and focusable flags" loading="lazy"></figure>

具体形式不重要，也随时可以调整：自定义工具、Python 包或 API 都行。但必须提供某种非破坏性、离屏、支持多实例的*东西*，防止智能体重新定义——通常是降低——成功标准。

换句话说，调试协议成为“这个 UI 是什么”的机器可读定义，而不只是测试辅助工具。

### 会话记录是一种协议

TUI 真正不可能做到的事，是 GitHub 上没有任何抱怨它坏了的 issue。人们总会对自己不了解的事抱有理想化期待。不幸的是，很多人不知道，他们想要的完美 TUI 体验根本不可能实现：无论组件位于哪里，都永远完全最新，并且能动态修改。

#### 块

我们把规范会话记录定义为一个块列表。每个块生成文本行，并经历以下生命周期：

活跃（active）→ 定稿（finalized）→ 提交（committed）

块 *i* 存活时，展示当前快照 *Wi*，它是一个行数组。定稿时，冻结为不可变快照 *Fi*。

块有两种模式：

- 可变：每个新快照都可以整体替换前一个，例如旋转指示器和进度。快照是推测性的，永远不会进入历史；只有 *Fi* 会。
- 仅追加：快照只增不减，每个快照都是下一个的前缀，最后一个快照也是 *Fi* 的前缀，例如流式文本。

当块超过分配给它的视口空间时，这种区别很重要。可变快照不能提前进入历史，因为后续更新可能替换它，那就得把已经滚走的行拽回来。助手思考内容这样的仅追加块，只会扩展稳定前缀，所以该前缀可以立即开始提交。

#### 终端

宽为 *W*、高为 *H* 的终端有两个缓冲区：

- *V*：视口，包含 *H* 行可见内容。
- *S*：原生回滚缓冲区，无界、仅追加。

技术上，我们可以清空并重写回滚缓冲区，但那会导致用户经常抱怨的行为；因此，不这样做现在成为不变量。

折行函数 *wrapW* 将逻辑行转换为物理行，取决于当前宽度。视口下方没有可寻址区域。写过底部会让终端滚动，并把顶部行不可逆地推入 *S*。

逻辑历史 *L* 以未折行的行保存，因此与宽度无关：按块顺序排列的已提交最终快照，每个恰好出现一次，再加上当前流式块已经放行的部分。令 *c* 为最后一个已提交块，*j = c+1*：

L = F1 · F2 ⋯ Fc · Wj\[1..ej\]

其中 *ej* 表示流式队首块已经写入历史的行数。除非块 *j* 正在以仅追加模式流式输出，否则 *ej = 0*。

因此：

- 已提交的最终快照，按块顺序连续出现，恰好一次。
- 可变的推测快照永远不进入 *L*。
- 仅追加的队首块可以在仍然流式输出时，逐行进入 *L*。
- 定稿本身不写入任何内容。
- 提交只追加 *Fj* 中尚未输出的行。

#### 调整尺寸

调整尺寸不会改变任何逻辑状态：所有 *Wi*、*Fi* 和 *c* 都保持不变。只重新计算折行和视口空间分配。已经进入原生回滚缓冲区的行不能重写，因此必须为它们明确选择一种策略：

- 保留（Preserve）：保留终端模拟器已经折行的历史。
- 追加（Append）：追加重新渲染的历史，可能产生重复物理行。
- 重建（Rebuild）：开启新的物理显示纪元，并把历史回放进去。

这些规则分开了三种容易混淆的东西：视口内可变的展示、与宽度无关的逻辑历史，以及不可逆的原生终端行。把它们命名之后，调整尺寸和流式输出就成为策略选择，而不是口口相传的玄学。

### 为不可能的部分写规范

为什么要让你经历这一大段“数学”？因为这个算法极其复杂，很难验证它是否合理。上一次迭代，我们不得不写模糊测试器，才达到稳定状态。这一次，我想避免重走老路。

于是，我们用 [TLA+](https://lamport.azurewebsites.net/tla/tla.html) 对上述行为建模，要求迭代修改块的提交与定稿处理，直到所有明确规定的不变量都满足。

现在，如果真想改点东西，比如放手提交部分内容，或禁止块截断，我们有一份可以更新的参考规范，也有一个极其简单的办法知道修改能否成立；失败时还会给出反例。

论文与完整的 `ElasticSlots.tla` 源码位于[附录 B](#appendix-b-elastic-speculative-slots)。

### 这解锁了什么

例行炫耀一下，然后继续！*现在如果有人抱怨 TUI 坏了，我就能给他一个形式化证明，解释为什么它修不了。太好了。*

<figure data-hk="000000010000000000004000010b447"><img src="https://stencil.so/blog/harness-playbook/tui-flex.png" width="923" height="482" alt="The omp² TUI: a command palette overlay above a list of live worker shards, a session rail with diff stats, a status bar, and an inline image thumbnail" loading="lazy"><figcaption>任务执行中的 omp² TUI：实时并行分片上方的命令面板、带逐文件 diff 统计的会话侧栏，以及内嵌图像缩略图——每个元素都是同一条流式管线上的组件。</figcaption></figure>

TUI、Web 客户端和远程检查器可以布局不同，但事实不能不同。工具作者描述语义状态，组件系统负责展示，会话记录协议负责恰好一次的历史。

又是同一个设计动作：把难以维持的不变量下沉到能够强制执行它的层。实现所用的技术栈应该强化这些不变量，而不是邀请每位贡献者——以及每个编程智能体——发明局部风格。

<a id="the-stack"></a>

## 技术栈

前几章讲的是架构。语言选择决定了，当下一个“好心”的局部特例出现时，代码库会在它与架构之间设置多大阻力。当大量实现由智能体生成，而它们学到的是各生态的默认习惯和毛病时，这一点尤其重要。

### 语言选择就是架构

**眼下，除非不得不与前端代码打交道，否则 TypeScript 是个糟糕的选择。**

如今启动项目，最有影响力的决定之一，就是选对工具。三年前，要是看到文章这样开头，我大概已经开始吐槽了。但……如果你不信，试着给 Claude 完全相同的提示词，描述一个想做的小组件。

再把 macOS（Swift）换成 Linux（Qt/JS）。前者会给你一个玻璃质感的小组件，看起来天生属于这个操作系统；后者会给你一个矩形，UI 元素互相重叠，交互选择令人怀疑，让你觉得自己刚看完定义 UI 所需的 XML schema，正在第一次尝试编译。

当然，提示方式有影响，你也确实可以写得更详细。但过一阵你会发现，无论怎么做，一边总能几乎不费力地胜过另一边。macOS 历来有件事做得好：强迫开发者遵循一致的设计风格。这对 LLM 同样有效。

重点不是 Swift 自带品味而 JavaScript 没有，而是默认值、标准库、规范项目结构、编译器反馈和生态约定，会成为生成代码的先验。一门允许二十种局部风格都同样正常的语言，等于要求模型还没碰到产品问题，就先做二十个选择。

### TypeScript 会变成你自己的语言

遗憾的是，我曾经喜欢 TypeScript 的一点，恰恰是它最后总会变成*你自己的*语言：

- 用 `camelCase` 还是 `snake_case`？或者干脆把库叫 `$`？
- 写跨越 200 行的泛型，还是一个泛型也不用？
- 用 `Buffer` 还是 `Uint8Array`？
- 用 Zod 还是 Typebox？
- 用 `Array<T>` 还是 `T[]`？
- 用 ESM 还是 CJS？扩展名呢，`.ejs, .cjs, .mjs, .js?`
- 用 TypeScript 还是 JSDoc？
- 用类，还是坚持对象？甚至 `new function()`？
- 要不要默认导出？
- 用星号重新导出，还是逐项命名？
- 用 `private foo` 还是 `#foo`？
- 用 `module/index.ts` 还是 `module.ts`？
- 用 `const x = () => ..` 还是 `function x() {`？
- 用 `function x(args)` 还是 `function x(...args)`？
- 如果选后者，用 `...args: any[]` 还是 `...args: unknown[]`？
- 用 `const X = 1`、`enum E { X = 1 }`，还是 `const enum E { X = 1 }`？

你看，我在人生中最强的只写不读语言——C++——上花了十年，所以确实能从中找到乐趣。但当必须在 Zod 与 Typebox 之间选择时，你那位“初级同事”只会自己写一个所谓的 `isRecord`。能直接联合类型，为什么用泛型？能加个 `typeof` 分情况，为什么在脑子里确保每条分支对两种类型都有效？为什么用类，不就是对象和原型吗？

也许是世上糟糕的 JS 代码实在太多，也许是模型训练时吞下了一堆压缩代码，但我已经厌倦了。考虑到同一个“初级同事”还能发现 Linux 零日漏洞，换作是我，就不会再指望*对的模型*或*对的代码质量工具*，也不会继续费劲绕圈子。

也许 EffectJS 会改变这一点。我认为最终 Go 会在这里胜出，尤其是 WASM 的 GC 提案定稿之后，原因类似 Swift 在设计上占优的原因，再加上编译速度和交叉编译的便利。不过，有些场景需要更底层的系统语言，所以我们在这里选择了 Rust。

智能体仍经常需要引导，因为它们总走通向目标的最短路径：不处理复杂借用，改为分配副本；不用 `thiserror`，改为传递字符串错误。但 `std` 加上 `serde` 生态，已经提供了它们工作所需的大部分东西，编译器也提供了相当程度的安全保障，于是就这么定了。

### 扩展使用 Python

下一项决定，是要不要为了可扩展性把 TS 请回来。我们说不，主要因为：

1. 智能体能写出不错的 Python，顺理成章也就能写出不错的扩展。
2. 想用很小的体积做出符合规范的 JS *运行时*，基本不可能，感谢 Locale；而没有生态，还不如用 Lua。
3. 扩展占运行时间甚至不到 1%，没什么必要上 JIT。
4. 内嵌完整 Python 运行时，就能保证 `eval` 开箱即用，而不是要求用户安装 py3，却始终无法在交付的工作流里可靠依赖它。
5. Python 代码原生就能检查自己的 AST。这正是运行时一章中 `@remote` 设计能够成立的原因。

运行时一章介绍了 `@remote` 边界。Python 的自省和属性模型让这个边界好用：SDK 能检查函数、打包相关源码，并在沙盒运行时执行，不必让每位扩展作者手写 RPC。

自带运行时，也让 `Eval` 成为可靠的内置能力，而不是只有用户碰巧安装了兼容 Python 才能工作的功能。

<a id="closing-notes"></a>

## 结语

开篇的问题是：“可是，为什么？”直接回答就是：上述每一章，都是一类已有数十年经验积累的软件问题——复制、沙盒隔离、配置、调度、协议兼容、实时渲染，以及语言和运行时设计。

omp² 仍在依照这份文档构建，各部分进度从已经上线到仍在思考不等。我们真诚感谢每一位愿意尝试它、并分享各种精彩用法的人：从让 omp 运营软件工厂，到让它直接在所在手机上为自己构建相机应用。

你们塑造了 omp，我们相信未来也会同样有趣！

* * *

<a id="appendix-a-state-failures-in-the-official-examples"></a>

## 附录 A：官方示例中的状态故障

状态一章按类别概述了这些故障。本附录保留原始证据：源码链接、最小代码片段，以及复现视频。

这不是理论上的指控。我们检查了 78 个官方扩展示例：60 个无状态；17 个有状态的示例中，只有两个正确。

#### 1\. `/fork` 还没来得及使用，检查点就已被清空：`git-checkpoint.ts`

[源码](https://github.com/earendil-works/pi/blob/853a80d26c90a14c1886f0ebb8ffaae133ca2185/packages/coding-agent/examples/extensions/git-checkpoint.ts#L11-L51)：缺少持久的检查点所有权；`/fork` 在空闲时调用，而 `agent_settled` 已经清空唯一保存 stash 引用的映射。

```jsx
const checkpoints = new Map<string, string>();
// …
pi.on("agent_settled", async () => {
  checkpoints.clear();
});
```

<figure data-hk="000000010000000000004000010b485"><video src="https://stencil.so/blog/harness-playbook/bugs/git-checkpoint.mp4" width="1000" height="684" autoplay="" loop="" muted="" playsinline=""></video></figure>

#### 2\. 会话树导航不恢复状态：`plan-mode/index.ts`

[源码](https://github.com/earendil-works/pi/blob/853a80d26c90a14c1886f0ebb8ffaae133ca2185/packages/coding-agent/examples/extensions/plan-mode/index.ts#L340-L352)：缺少 `session_tree` 和 `getBranch()`；回退后计划模式及其工具限制仍生效，恢复会话却可能让废弃分支的快照复活。

```jsx
const entries = ctx.sessionManager.getEntries();
const planModeEntry = entries
  .filter((e) => e.type === "custom" && e.customType === "plan-mode")
  .pop();
```

<figure data-hk="000000010000000000004000010b489"><video src="https://stencil.so/blog/harness-playbook/bugs/plan-mode.mp4" width="1000" height="684" autoplay="" loop="" muted="" playsinline=""></video></figure>

#### 3\. 计数器不会统计历史：`status-line.ts`

[源码](https://github.com/earendil-works/pi/blob/853a80d26c90a14c1886f0ebb8ffaae133ca2185/packages/coding-agent/examples/extensions/status-line.ts#L10-L23)：缺少按分支推导的逻辑；从第 3 轮回退到第 1 轮，下一轮却显示 4，而恢复会话又从零开始。

```jsx
let turnCount = 0;
// …
pi.on("turn_start", async (_event, ctx) => {
  turnCount++;
```

<figure data-hk="000000010000000000004000010b493"><video src="https://stencil.so/blog/harness-playbook/bugs/status-line.mp4" width="1000" height="684" autoplay="" loop="" muted="" playsinline=""></video></figure>

#### 4\. 动态添加的工具在回退后保留，恢复会话后却消失：`dynamic-tools.ts`

[源码](https://github.com/earendil-works/pi/blob/853a80d26c90a14c1886f0ebb8ffaae133ca2185/packages/coding-agent/examples/extensions/dynamic-tools.ts#L25-L33)：`/add-echo-tool echo_branch` 只写入运行中的扩展注册表；`/tree` 不会重启注册表，所以回退保留工具，但 `--continue` 会新建注册表，工具便消失了。

```jsx
const registeredToolNames = new Set<string>();
// …
registeredToolNames.add(name);
pi.registerTool({
```

<figure data-hk="000000010000000000004000010b497"><video src="https://stencil.so/blog/harness-playbook/bugs/dynamic-tools.mp4" width="1000" height="684" autoplay="" loop="" muted="" playsinline=""></video></figure>

#### 5\. 废弃分支的存档回来了：`snake.ts`

[源码](https://github.com/earendil-works/pi/blob/853a80d26c90a14c1886f0ebb8ffaae133ca2185/packages/coding-agent/examples/extensions/snake.ts#L320-L328)：恢复时扫描整个会话文件；在分支 A 保存，回退到保存之前，再打开 `/snake`，已废弃的存档就会回来。

```jsx
const entries = ctx.sessionManager.getEntries();
for (let i = entries.length - 1; i >= 0; i--) {
  const entry = entries[i];
  if (entry.type === "custom" && entry.customType === SNAKE_SAVE_TYPE) {
```

<figure data-hk="000000010000000000004000010b501"><video src="https://stencil.so/blog/harness-playbook/bugs/snake.mp4" width="1000" height="684" autoplay="" loop="" muted="" playsinline=""></video></figure>

#### 6\. “最后一条消息”指的是文件里的最后一条：`bookmark.ts`

[源码](https://github.com/earendil-works/pi/blob/853a80d26c90a14c1886f0ebb8ffaae133ca2185/packages/coding-agent/examples/extensions/bookmark.ts#L19-L25)：缺少 `getBranch()`；回退后，`/bookmark` 可能给废弃分支上用户看不到的助手消息加标签。

```jsx
const entries = ctx.sessionManager.getEntries();
for (let i = entries.length - 1; i >= 0; i--) {
  const entry = entries[i];
  if (entry.type === "message" && entry.message.role === "assistant") {
```

<figure data-hk="000000010000000000004000010b505"><video src="https://stencil.so/blog/harness-playbook/bugs/bookmark.mp4" width="1000" height="684" autoplay="" loop="" muted="" playsinline=""></video></figure>

#### 7\. 回退到发现之前，`Calculator` 仍然活跃：`kimi-deferred-tools.ts`

[源码](https://github.com/earendil-works/pi/blob/853a80d26c90a14c1886f0ebb8ffaae133ca2185/packages/coding-agent/examples/extensions/kimi-deferred-tools.ts#L47-L60)：`tool_search` 激活 `Calculator`，却没有 `session_tree` 处理器重新推导活跃列表；导航回发现工具之前，`Calculator` 仍然活跃。

```jsx
const active = pi.getActiveTools();
const added = active.includes("Calculator") ? [] : ["Calculator"];
if (added.length > 0) pi.setActiveTools([...active, ...added]);
// Missing: session_tree → derive active tools from selected branch.
```

<figure data-hk="000000010000000000004000010b509"><video src="https://stencil.so/blog/harness-playbook/bugs/kimi-deferred-tools.mp4" width="1000" height="684" autoplay="" loop="" muted="" playsinline=""></video></figure>

#### 8\. 切换会话会提交工作树：`auto-commit-on-exit.ts`

[源码](https://github.com/earendil-works/pi/blob/853a80d26c90a14c1886f0ebb8ffaae133ca2185/packages/coding-agent/examples/extensions/auto-commit-on-exit.ts#L11-L42)：缺少仅用于进程退出的边界；`/new`、`/resume` 和 `/fork` 都会触发 `session_shutdown`，进而暂存并提交有未提交变更的工作树。

```jsx
pi.on("session_shutdown", async (_event, ctx) => {
  // …
  await pi.exec("git", ["add", "-A"]);
  await pi.exec("git", ["commit", "-m", commitMessage]);
});
```

<figure data-hk="000000010000000000004000010b513"><video src="https://stencil.so/blog/harness-playbook/bugs/auto-commit-on-exit.mp4" width="1000" height="684" autoplay="" loop="" muted="" playsinline=""></video></figure>

#### 9\. 实时状态与恢复状态不一致：`tic-tac-toe.ts`

[恢复逻辑](https://github.com/earendil-works/pi/blob/853a80d26c90a14c1886f0ebb8ffaae133ca2185/packages/coding-agent/examples/extensions/tic-tac-toe.ts#L631-L645)；[用户落子](https://github.com/earendil-works/pi/blob/853a80d26c90a14c1886f0ebb8ffaae133ca2185/packages/coding-agent/examples/extensions/tic-tac-toe.ts#L802-L810)：重建只接受工具结果，用户落子却使用 custom 条目；如果在 X 落子后、O 落子前崩溃，X 就会消失。

```jsx
if (entry.type !== "message") continue;
if (msg.role !== "toolResult") continue;
// User moves take a different path:
pi.appendEntry(SAVE_TYPE, getBoardDetails());
```

<figure data-hk="000000010000000000004000010b517"><video src="https://stencil.so/blog/harness-playbook/bugs/tic-tac-toe.mp4" width="1000" height="684" autoplay="" loop="" muted="" playsinline=""></video></figure>

<a id="appendix-b-elastic-speculative-slots"></a>

## 附录 B：弹性推测槽位

界面一章把协议及结论放在主线内容中。本附录提供论文，以及用于检查会话记录不变量的完整 [TLA+](https://lamport.azurewebsites.net/tla/tla.html) 模型。

<figure data-hk="000000010000000000004000010b520"><a href="https://stencil.so/blog/harness-playbook/elastic-slots.pdf" target="_blank" rel="noopener"><img src="https://stencil.so/blog/harness-playbook/elastic-slots-p1.png" width="1082" height="1400" alt="First page of the Elastic Speculative Slots paper: a formally verified rendering protocol for streaming concurrent output blocks through a bounded terminal viewport into append-only scrollback" loading="lazy"></a><figcaption>《Elastic Speculative Slots》论文：三层契约、安全性定理和有条件的进展结论，与下方完整规范一一对应。点击查看完整 PDF。</figcaption></figure>

ElasticSlots.tla — 完整规范

```jsx
---- MODULE ElasticSlots ----
\* =========================================================================
\* Elastic Speculative Slots: a formally verified rendering protocol for
\* streaming concurrent output blocks through a bounded terminal viewport
\* into append-only scrollback.
\*
\* Three decoupled layers, related by invariants (see ELASTIC_SLOTS2.tex):
\*   1. semantic block state   (phase/mode/want/final/emitted per block)
\*   2. logical history ledger (`history`: width-independent, exactly-once)
\*   3. physical native rows   (`native`: width-rendered, source-tagged)
\* =========================================================================
EXTENDS Naturals, Sequences, FiniteSets, TLC
\* Naturals: arithmetic; Sequences: <<>>/Len/SubSeq/\o; FiniteSets:
\* Cardinality/IsFiniteSet; TLC: model-checking utilities.

CONSTANTS N, H, MaxResizes, MaxLive, RowValues, SnapshotValues,
          NoFinal, Placeholder, Blank, OverflowMarker
\* N            : number of block identities (blocks are 1..N, in commit order)
\* H            : maximum viewport (live transcript) height, in rows
\* MaxResizes   : bound on resize events (keeps the state space finite)
\* MaxLive      : uncommitted-block count that constitutes "pressure"
\* RowValues    : finite row alphabet (what a semantic line of output "is")
\* SnapshotValues: finite universe of block contents (sequences of rows)
\* NoFinal      : sentinel "this block has no final snapshot yet"
\* Placeholder  : synthetic viewport row shown for an empty slot
\* Blank        : synthetic viewport row for unused screen space
\* OverflowMarker: synthetic viewport row summarizing hidden older blocks

ASSUME
    ∧ N ∈ ℕ \ {0}                                  \* at least one block
    ∧ H ∈ ℕ \ {0}                                  \* viewport can be nonempty
    ∧ MaxResizes ∈ ℕ                               \* zero resizes is allowed
    ∧ MaxLive ∈ ℕ \ {0}                            \* pressure threshold >= 1
    ∧ IsFiniteSet(RowValues)                           \* finite row alphabet
    ∧ RowValues ≠ {}                                   \* ... and nonempty
    ∧ IsFiniteSet(SnapshotValues)                      \* finite snapshot universe
    ∧ SnapshotValues ⊆ Seq(RowValues)          \* snapshots are row sequences
    ∧ ⟨⟩ ∈ SnapshotValues                          \* the empty snapshot exists
    ∧ (∃ snapshot ∈ SnapshotValues : Len(snapshot) = 1)  \* a length-1 snapshot exists
    ∧ (∃ snapshot ∈ SnapshotValues : Len(snapshot) > 1)  \* a longer one exists too
    ∧ NoFinal ∉ SnapshotValues                    \* sentinel distinct from real data
    ∧ Placeholder ∉ RowValues                     \* synthetic rows are not
    ∧ Blank ∉ RowValues                           \* ... confusable with
    ∧ OverflowMarker ∉ RowValues                  \* ... semantic rows,
    ∧ Placeholder ≠ Blank                              \* and are pairwise
    ∧ Placeholder ≠ OverflowMarker                     \* distinct from
    ∧ Blank ≠ OverflowMarker                           \* each other.

Blocks ≜ 1‥N                                          \* the block identities
ModelRows ≜ {"row-a", "row-b"}                         \* tiny concrete row alphabet for TLC
ModelSnapshots ≜                                       \* a richer snapshot universe (unused by the shipped cfg)
    {⟨⟩,                                              \* empty block
     ⟨"row-a"⟩,                                       \* one-liner
     ⟨"row-b"⟩,                                       \* one-liner, other row
     ⟨"row-a", "row-b"⟩,                              \* two distinct rows
     ⟨"row-b", "row-a"⟩,                              \* order matters
     ⟨"row-a", "row-b", "row-a"⟩}                     \* length three, with repeat
SmallModelSnapshots ≜ {⟨⟩, ⟨"row-a"⟩, ⟨"row-a", "row-b"⟩}  \* the cfg's universe: lengths 0, 1, 2

WidthValues ≜ {"Wide", "Narrow"}                       \* two-point abstraction of terminal width
ResizeModes ≜ {"Preserve", "Append", "Rebuild"}        \* policy chosen at a width-changing resize
ReplayModes ≜ {"None", "Append", "Rebuild"}            \* pending replay (None = no replay in flight)
BlockModes ≜ {"Undeclared", "Mutable", "AppendOnly"}   \* presentation contract, fixed at Create
Phases ≜ {"Absent", "Queued", "Active", "Finalized", "Committed"}  \* block lifecycle, monotone left-to-right
StopReasons ≜ {"Running", "Graceful", "Detach", "WriteFailure"}    \* why the host stopped (Running = it hasn't)
NativeSources ≜ {"Append", "Retire", "Replay", "Resize", "FailedWrite", "Exit"}  \* provenance tag on every native row
CellRows ≜ RowValues ∪ {Placeholder, Blank, OverflowMarker}     \* what a viewport cell may display
Cells ≜ [owner : 0‥N, row : CellRows]                 \* a viewport cell: owning block (0 = chrome) + row
TaggedRows ≜ [owner : Blocks, row : RowValues]         \* a ledger row: semantic, width-independent
NativeRows ≜ [source : NativeSources, owner : 0‥N, row : CellRows, width : WidthValues]
\* a native row: provenance source, owner, rendered row, and the width it was rendered at

SnapshotLengths ≜ {Len(snapshot) : snapshot ∈ SnapshotValues}  \* set of occurring snapshot lengths
MaxSnapshotLength ≜                                    \* L_max: the longest snapshot length
    CHOOSE maximum ∈ SnapshotLengths :                \* (CHOOSE is fine here: the maximum
        ∀ length ∈ SnapshotLengths : length ≤ maximum  \*  of a finite set is unique)
MaxFailureRows ≜ 2 * N * MaxSnapshotLength             \* K_max: upper bound on one physical write batch
                                                        \* (factor 2 = worst-case Narrow doubling)

BlankCell ≜ [owner ↦ 0, row ↦ Blank]               \* the unused-screen-space cell
OverflowCell ≜ [owner ↦ 0, row ↦ OverflowMarker]   \* the "N older blocks hidden" summary cell

\* -------------------------------------------------------------------------
\* State variables (one tuple entry per column of Table 1 in the paper).
\* -------------------------------------------------------------------------
VARIABLES c, phase, mode, want, final, emitted, alloc, target,
          history, native, width, height, resizes, epoch,
          replayMode, replayCursor, replayEnd, replayPartial,
          replayPrepared, replayCut,
          flush, shutdown, running, stopReason
\* c              : commit frontier -- blocks 1..c are committed (retired)
\* phase          : lifecycle phase per block
\* mode           : Mutable / AppendOnly contract per block
\* want           : current speculative snapshot per block
\* final          : frozen final snapshot per block (NoFinal until finalized)
\* emitted        : rows of the head block already streamed into history
\* alloc          : painted slot height per block (rows on screen now)
\* target         : requested slot height per block (animation target)
\* history        : the logical ledger (layer 2)
\* native         : the physical scrollback of the current epoch (layer 3)
\* width, height  : current terminal geometry
\* resizes        : how many resizes happened (bounded by MaxResizes)
\* epoch          : display epoch; Rebuild resets native and bumps this
\* replayMode     : pending replay policy (None / Append / Rebuild)
\* replayCursor   : first committed block to replay (invariantly 1 while replaying)
\* replayEnd      : last committed block to replay (= c at replay start)
\* replayPartial  : how many stable head rows to replay
\* replayPrepared : replay frame computed and cut fixed (gates the scheduler)
\* replayCut      : rows of the replay frame that must scroll into native
\* flush          : explicit "retire everything" request (never reset)
\* shutdown       : graceful shutdown initiated
\* running        : host still alive; every action requires it
\* stopReason     : why we stopped (Running while alive)

vars ≜ ⟨c, phase, mode, want, final, emitted, alloc, target,
          history, native, width, height, resizes, epoch,
          replayMode, replayCursor, replayEnd, replayPartial,
          replayPrepared, replayCut,
          flush, shutdown, running, stopReason⟩
\* the full variable tuple, used for stuttering ([Next]_vars) and UNCHANGED

Maximum(left, right) ≜ IF left ≥ right THEN left ELSE right  \* max of two naturals

\* -------------------------------------------------------------------------
\* Width rendering: the two-point abstraction of soft-wrap reflow.
\* -------------------------------------------------------------------------
RECURSIVE DoubleRows(_)
DoubleRows(snapshot) ≜                                 \* Narrow rendering:
    IF Len(snapshot) = 0 THEN ⟨⟩                      \* empty stays empty;
    ELSE ⟨Head(snapshot), Head(snapshot)⟩ ∘ DoubleRows(Tail(snapshot))
    \* every semantic row occupies TWO physical rows (models a wrapped line)

Render(snapshot, wx) ≜ IF wx = "Wide" THEN snapshot ELSE DoubleRows(snapshot)
\* rho_omega: Wide = identity, Narrow = row doubling; prefix-monotone by construction

Tag(i, snapshot) ≜                                     \* tg_i: stamp each row with its owner
    [j ∈ 1‥Len(snapshot) ↦ [owner ↦ i, row ↦ snapshot[j]]]

SnapshotSlice(snapshot, lo, hi) ≜                      \* s[lo..hi], empty when lo > hi
    IF lo > hi THEN ⟨⟩ ELSE SubSeq(snapshot, lo, hi)

TagSlice(i, snapshot, lo, hi) ≜ Tag(i, SnapshotSlice(snapshot, lo, hi))  \* owner-tagged slice

NativeTag(source, i, snapshot, wx) ≜                   \* ntg: render at width wx, then tag
    [j ∈ 1‥Len(Render(snapshot, wx)) ↦             \* one native row per RENDERED row
        [source ↦ source, owner ↦ i,                \* provenance + owner
         row ↦ Render(snapshot, wx)[j], width ↦ wx]]  \* rendered row + width it used
NativeTagSlice(source, i, snapshot, lo, hi, wx) ≜      \* native-tag a semantic slice
    NativeTag(source, i, SnapshotSlice(snapshot, lo, hi), wx)

NativeCells(source, cells, wx) ≜                       \* lift screen cells to native rows
    [j ∈ 1‥Len(cells) ↦                            \* (used when the emulator itself
        [source ↦ source, owner ↦ cells[j].owner,   \*  pushes viewport rows into
         row ↦ cells[j].row, width ↦ wx]]           \*  scrollback, e.g. on resize/exit)

PrefixOf(sequence, count) ≜ [j ∈ 1‥count ↦ sequence[j]]  \* first `count` elements

\* -------------------------------------------------------------------------
\* The logical ledger as a FUNCTION of state (invariant ECH says
\* `history` always equals CommittedRows(c, final) \o PartialHeadRows).
\* -------------------------------------------------------------------------
RECURSIVE CommittedRows(_, _)
CommittedRows(k, finals) ≜                             \* C(k): finals of blocks 1..k,
    IF k = 0 THEN ⟨⟩                                  \* tagged, concatenated in
    ELSE CommittedRows(k - 1, finals) ∘ Tag(k, finals[k])  \* block (= commit) order

RECURSIVE TaggedRange(_, _, _)
TaggedRange(lo, hi, finals) ≜                          \* tagged finals of blocks lo..hi
    IF lo > hi THEN ⟨⟩                                \* (empty range allowed)
    ELSE Tag(lo, finals[lo]) ∘ TaggedRange(lo + 1, hi, finals)

RECURSIVE NativeRange(_, _, _, _, _)
NativeRange(source, lo, hi, finals, wx) ≜              \* same, but width-rendered and
    IF lo > hi THEN ⟨⟩                                \* source-tagged for `native`
    ELSE NativeTag(source, lo, finals[lo], wx)
         ∘ NativeRange(source, lo + 1, hi, finals, wx)

RetirementRows(lo, hi, finals, firstEmitted) ≜         \* logical retirement batch:
    IF lo > hi THEN ⟨⟩                                \* head block lo contributes only
    ELSE TagSlice(lo, finals[lo], firstEmitted + 1, Len(finals[lo]))  \* its UNstreamed suffix,
         ∘ TaggedRange(lo + 1, hi, finals)             \* later blocks contribute in full

NativeRetirementRows(source, lo, hi, finals, firstEmitted, wx) ≜
    IF lo > hi THEN ⟨⟩                                \* physical twin of RetirementRows:
    ELSE NativeTagSlice(                                \* the same rows,
             source,                                    \* provenance-tagged
             lo,                                        \* (Retire on success,
             finals[lo],                                \*  FailedWrite on failure),
             firstEmitted + 1,                          \* starting after the already-
             Len(finals[lo]),                           \* streamed head prefix,
             wx                                         \* rendered at the current width
         )
         ∘ NativeRange(source, lo + 1, hi, finals, wx) \* then full later finals

FinalizedRange(lo, hi) ≜                               \* "blocks lo..hi are all Finalized"
    ∀ i ∈ lo‥hi : phase[i] = "Finalized"            \* (a retirement batch precondition)

Unemitted(snapshot, i, emission) ≜                     \* U_i(s): the part of s not yet
    IF mode[i] = "AppendOnly"                           \* streamed into history --
    THEN SnapshotSlice(snapshot, emission[i] + 1, Len(snapshot))  \* suffix for append-only,
    ELSE snapshot                                       \* everything for mutable blocks

\* -------------------------------------------------------------------------
\* Live-viewport geometry: who is presented, who is visible, how much
\* space is reserved. All operators take the ambient tuple explicitly so
\* that action guards can evaluate them at SUCCESSOR values.
\* -------------------------------------------------------------------------
Presented(ph, finals, emission, i, wx) ≜               \* block i occupies viewport iff
    ∨ ph[i] = "Active"                                 \* it is actively producing, or
    ∨ ∧ ph[i] = "Finalized"                           \* it is finalized AND still has
     ∧ Len(Render(Unemitted(finals[i], i, emission), wx)) > 0  \* unstreamed content to show

PresentedSet(ph, finals, emission, wx) ≜               \* the set of presented blocks
    {i ∈ Blocks : Presented(ph, finals, emission, i, wx)}
PresentedCount(ph, finals, emission, wx) ≜             \* pi: how many are presented
    Cardinality(PresentedSet(ph, finals, emission, wx))
Overflow(ph, finals, emission, wx, hx) ≜               \* ovf: more presented blocks
    PresentedCount(ph, finals, emission, wx) > hx       \* than viewport rows
SummaryRows(ph, finals, emission, wx, hx) ≜            \* sigma: one summary row is
    IF hx > 0 ∧ Overflow(ph, finals, emission, wx, hx) THEN 1 ELSE 0  \* shown iff overflowing (and h>0)

NewerPresented(ph, finals, emission, wx, i) ≜          \* how many presented blocks are
    Cardinality({                                       \* NEWER (higher index) than i --
        j ∈ Blocks :                                  \* used to privilege recency
            j > i ∧ Presented(ph, finals, emission, j, wx)
    })

VisiblePresented(ph, finals, emission, wx, hx, i) ≜    \* vis(i): presented AND, under
    ∧ Presented(ph, finals, emission, i, wx)           \* overflow, among the hx-1
    ∧ IF Overflow(ph, finals, emission, wx, hx)        \* newest presented blocks
       THEN ∧ hx > 0                                   \* (one row is sacrificed to
            ∧ NewerPresented(ph, finals, emission, wx, i) < hx - 1  \* the summary marker)
       ELSE TRUE                                        \* no overflow: presented = visible

RECURSIVE AllocationTotal(_, _)
AllocationTotal(al, i) ≜                               \* sum of painted heights,
    IF i > N THEN 0 ELSE al[i] + AllocationTotal(al, i + 1)  \* blocks i..N

RECURSIVE ReservationTotal(_, _, _)
ReservationTotal(al, requested, i) ≜                   \* Res: each block is charged
    IF i > N THEN 0                                     \* max(painted, requested) --
    ELSE Maximum(al[i], requested[i]) + ReservationTotal(al, requested, i + 1)
    \* growth pays up front, shrink keeps its old charge until painted

AllocationStateOK(al, requested, ph, finals, emission, wx, hx) ≜  \* A_OK: allocation admissibility
    ∧ al ∈ [Blocks → 0‥H]                          \* painted heights in range
    ∧ requested ∈ [Blocks → 0‥H]                   \* requested heights in range
    ∧ ∀ i ∈ Blocks :
           IF VisiblePresented(ph, finals, emission, wx, hx, i)
           THEN IF ph[i] = "Active"
                THEN ∧ al[i] ∈ 1‥H                  \* visible active: painted >= 1,
                     ∧ requested[i] ∈ 1‥H           \* target >= 1 (may differ: animating)
                ELSE ∧ al[i] ∈ 1‥H                  \* visible finalized: painted >= 1,
                     ∧ requested[i] = al[i]            \* and frozen (no more animation)
           ELSE ∧ al[i] = 0                            \* invisible blocks hold
                ∧ requested[i] = 0                     \* no space at all
    ∧ ReservationTotal(al, requested, 1)               \* reservation invariant:
       + SummaryRows(ph, finals, emission, wx, hx) ≤ hx  \* reservations + summary fit in h

CanonicalAllocation(ph, finals, emission, wx, hx) ≜    \* kappa: the safe default --
    [i ∈ Blocks ↦                                   \* one row per visible block,
        IF VisiblePresented(ph, finals, emission, wx, hx, i) THEN 1 ELSE 0]  \* zero otherwise

SnapshotHeight(ph, wants, finals, i, wx) ≜             \* dm(i): row demand of block i
    CASE ph[i] = "Active" →
             Maximum(1, Len(Render(Unemitted(wants[i], i, emitted), wx)))  \* live: >= 1 row
      □ ph[i] = "Queued" →
             Maximum(1, Len(Render(Unemitted(wants[i], i, emitted), wx)))  \* queued demands space too
      □ ph[i] = "Finalized" →
             Len(Render(Unemitted(finals[i], i, emitted), wx))  \* finalized: exactly its unstreamed rows
      □ OTHER → 0                                     \* absent/committed demand nothing

RECURSIVE FullRows(_, _, _, _, _)
FullRows(ph, wants, finals, wx, i) ≜                   \* D: total row demand of
    IF i > N THEN 0                                     \* blocks i..N
    ELSE SnapshotHeight(ph, wants, finals, i, wx)
         + FullRows(ph, wants, finals, wx, i + 1)

CreatedCount ≜ Cardinality({i ∈ Blocks : phase[i] ≠ "Absent"})  \* gamma: how many blocks exist

PartialHeadExists ≜                                    \* PH: the head block (c+1) has
    ∧ c < CreatedCount                                 \* been created,
    ∧ mode[c + 1] = "AppendOnly"                       \* is append-only,
    ∧ phase[c + 1] ∈ {"Active", "Finalized"}         \* is live,
    ∧ emitted[c + 1] > 0                               \* and has streamed some rows

PartialHeadRows ≜                                      \* A(c): the head's streamed
    IF PartialHeadExists                                \* prefix as tagged ledger rows
    THEN TagSlice(c + 1, want[c + 1], 1, emitted[c + 1])  \* (prefix of `want`, stable by
    ELSE ⟨⟩                                           \*  the append-only contract)

RowPressure ≜ FullRows(phase, want, final, width, 1) > height  \* demand exceeds viewport
Pressure ≜                                             \* pressure = row pressure OR
    ∨ RowPressure                                      \* too many uncommitted
    ∨ CreatedCount - c ≥ MaxLive                      \* blocks piling up
RetirementRequested ≜ flush ∨ Pressure                \* Req: when retirement may fire
Replaying ≜ replayMode ≠ "None"                        \* a replay is in flight

PreviewSource(i) ≜                                     \* what a slot displays:
    IF phase[i] = "Active"                              \* live blocks show their
    THEN Unemitted(want[i], i, emitted)                 \* unstreamed speculation,
    ELSE Unemitted(final[i], i, emitted)                \* others their unstreamed final

PreviewCell(i, snapshot) ≜                             \* the representative cell of a slot:
    LET rendered ≜ Render(snapshot, width) IN          \* render at current width;
    [owner ↦ i,
     row ↦ IF Len(rendered) = 0                       \* empty content shows the
             THEN Placeholder                           \* placeholder row, otherwise
             ELSE rendered[Len(rendered)]]              \* the LAST rendered row (tail view)

Repeat(value, count) ≜ [j ∈ 1‥count ↦ value]      \* value^count as a sequence
Slot(i, snapshot, allocation) ≜ Repeat(PreviewCell(i, snapshot), allocation)
\* a slot = its preview cell repeated alloc[i] times (abstracting the real tail window)

RECURSIVE PresentedCells(_)
PresentedCells(i) ≜                                    \* all slots, ascending block
    IF i > N THEN ⟨⟩                                  \* order (newest at the bottom,
    ELSE (IF alloc[i] = 0 THEN ⟨⟩ ELSE Slot(i, PreviewSource(i), alloc[i]))  \* next to the cursor);
         ∘ PresentedCells(i + 1)                       \* zero-alloc blocks contribute nothing

Screen ≜                                               \* Q: the whole viewport, top to bottom:
    Repeat(
        BlankCell,                                      \* blank filler first,
        height - AllocationTotal(alloc, 1) - SummaryRows(phase, final, emitted, width, height)
    )                                                   \* (exactly the unclaimed rows)
    ∘ (IF SummaryRows(phase, final, emitted, width, height) = 1
        THEN ⟨OverflowCell⟩                           \* then the overflow summary if any,
        ELSE ⟨⟩)
    ∘ PresentedCells(1)                                \* then the block slots

\* -------------------------------------------------------------------------
\* Replay geometry: what a width-changing resize must re-render.
\* -------------------------------------------------------------------------
ReplayRows ≜                                           \* R: the full replay frame --
    IF ¬Replaying
    THEN ⟨⟩                                           \* nothing when no replay pending
    ELSE NativeRange("Replay", replayCursor, replayEnd, final, width)  \* committed finals 1..c
         ∘ (IF replayPartial = 0                       \* re-rendered at the NEW width,
             THEN ⟨⟩                                  \* plus the head's already-
             ELSE NativeTagSlice(                       \* streamed stable prefix
                     "Replay",                          \* (if it had streamed rows
                     replayEnd + 1,                     \*  at resize time) --
                     want[replayEnd + 1],               \* prefix of want, immutable
                     1,                                 \* under the append-only
                     replayPartial,                     \* contract, so stable while
                     width                              \* the replay is in flight
                  ))

ReplayRoom ≜                                           \* how many blank rows the
    Cardinality({j ∈ 1‥height : Screen[j] = BlankCell})  \* viewport can absorb scroll-free

RequiredReplayCut ≜                                    \* cut*: replay rows that do NOT
    IF Len(ReplayRows) > ReplayRoom THEN Len(ReplayRows) - ReplayRoom ELSE 0
    \* fit in the blank region and must scroll into native scrollback

PreparedReplayTail ≜                                   \* the part painted bottom-first
    IF replayPrepared                                   \* into blank rows (no scroll);
    THEN SnapshotSlice(ReplayRows, replayCut + 1, Len(ReplayRows))  \* only meaningful once
    ELSE ⟨⟩                                           \* the frame is prepared

Prefix(left, right) ≜                                  \* left is a prefix of right
    ∧ Len(left) ≤ Len(right)                          \* (the partial order behind the
    ∧ ∀ j ∈ 1‥Len(left) : left[j] = right[j]       \*  append-only contract)

NoEarlierQueued(i) ≜ ∀ j ∈ 1‥(i - 1) : phase[j] ≠ "Queued"  \* FIFO admission guard

\* =========================================================================
\* Initial state: nothing created, full-height wide viewport, empty
\* histories, no replay, host running.
\* =========================================================================
Init ≜
    ∧ c = 0                                            \* nothing committed
    ∧ phase = [i ∈ Blocks ↦ "Absent"]              \* no block exists
    ∧ mode = [i ∈ Blocks ↦ "Undeclared"]           \* no contract chosen
    ∧ want = [i ∈ Blocks ↦ ⟨⟩]                   \* empty speculation
    ∧ final = [i ∈ Blocks ↦ NoFinal]               \* nothing finalized
    ∧ emitted = [i ∈ Blocks ↦ 0]                   \* nothing streamed
    ∧ alloc = [i ∈ Blocks ↦ 0]                     \* no slot painted
    ∧ target = [i ∈ Blocks ↦ 0]                    \* no slot requested
    ∧ history = ⟨⟩                                   \* empty ledger (= CommittedRows(0,...))
    ∧ native = ⟨⟩                                    \* empty scrollback
    ∧ width = "Wide"                                   \* initial geometry:
    ∧ height = H                                       \* wide, full height
    ∧ resizes = 0                                      \* no resizes yet
    ∧ epoch = 0                                        \* first display epoch
    ∧ replayMode = "None"                              \* no replay pending
    ∧ replayCursor = 0                                 \* replay window empty
    ∧ replayEnd = 0
    ∧ replayPartial = 0
    ∧ replayPrepared = FALSE                           \* no frame prepared
    ∧ replayCut = 0
    ∧ flush = FALSE                                    \* no flush requested
    ∧ shutdown = FALSE                                 \* not shutting down
    ∧ running = TRUE                                   \* host alive
    ∧ stopReason = "Running"                           \* ... and not stopped

\* =========================================================================
\* Actions. Every guard conjoins `running`; most also require ~shutdown.
\* =========================================================================

Create(declaration) ≜                                  \* a new block is declared
    ∧ running                                          \* host alive
    ∧ ¬shutdown                                        \* no new work during shutdown
    ∧ CreatedCount < N                                 \* an identity is still free
    ∧ phase[CreatedCount + 1] = "Absent"               \* blocks are created contiguously
    ∧ declaration ∈ {"Mutable", "AppendOnly"}        \* contract chosen now, forever
    ∧ phase' = [phase EXCEPT ![CreatedCount + 1] = "Queued"]  \* enters the queue
    ∧ mode' = [mode EXCEPT ![CreatedCount + 1] = declaration] \* contract recorded
    ∧ UNCHANGED ⟨c, want, final, emitted, alloc, target, history, native,
                   width, height, resizes, epoch,
                   replayMode, replayCursor, replayEnd, replayPartial,
                   replayPrepared, replayCut,
                   flush, shutdown, running, stopReason⟩  \* pure bookkeeping: no paint, no history

Admit(i) ≜                                             \* a queued block gets a live slot
    ∧ running                                          \* host alive
    ∧ ¬shutdown                                        \* not during shutdown
    ∧ phase[i] = "Queued"                              \* must be waiting
    ∧ NoEarlierQueued(i)                               \* FIFO: no older block still queued
    ∧ LET newPhase ≜ [phase EXCEPT ![i] = "Active"]   \* candidate successor phase,
           newAlloc ≜ [alloc EXCEPT ![i] = 1]          \* with a fresh 1-row slot
           newTarget ≜ [target EXCEPT ![i] = 1]        \* painted and requested
       IN ∧ ¬Overflow(newPhase, final, emitted, width, height)  \* admission may NOT overflow --
          ∧ AllocationStateOK(newAlloc, newTarget, newPhase, final, emitted, width, height)
          \* ... and the new slot must fit the reservation invariant; otherwise the
          \* block simply stays queued (denied, not summarized)
          ∧ phase' = newPhase                          \* commit the candidate state
          ∧ alloc' = newAlloc
          ∧ target' = newTarget
    ∧ UNCHANGED ⟨c, mode, want, final, emitted, history, native, width, height,
                   resizes, epoch, replayMode, replayCursor, replayEnd, replayPartial,
                   replayPrepared, replayCut,
                   flush, shutdown, running, stopReason⟩  \* repaint only: histories untouched

Update(i, snapshot) ≜                                  \* speculation evolves
    ∧ running                                          \* host alive
    ∧ ¬shutdown                                        \* not during shutdown
    ∧ phase[i] ∈ {"Queued", "Active"}                \* only unfinalized blocks change
    ∧ (mode[i] = "Mutable" ∨ Prefix(want[i], snapshot))  \* THE append-only contract:
    \* mutable blocks may replace their content arbitrarily; append-only
    \* blocks may only extend it (old rows are immutable)
    ∧ snapshot ≠ want[i]                               \* no stuttering updates
    ∧ want' = [want EXCEPT ![i] = snapshot]            \* the only writer of speculation
    ∧ UNCHANGED ⟨c, phase, mode, final, emitted, alloc, target, history, native,
                   width, height, resizes, epoch,
                   replayMode, replayCursor, replayEnd, replayPartial,
                   replayPrepared, replayCut,
                   flush, shutdown, running, stopReason⟩  \* repaint only

RequestAllocation(newTarget) ≜                         \* the app asks for new slot heights
    ∧ running                                          \* host alive
    ∧ ¬shutdown                                        \* not during shutdown
    ∧ AllocationStateOK(alloc, newTarget, phase, final, emitted, width, height)
    \* admissible against the CURRENT paint: max(painted, newly-requested)
    \* must fit, so every later animation frame is pre-paid (dominance)
    ∧ newTarget ≠ target                               \* no stuttering requests
    ∧ target' = newTarget                              \* targets change; paint doesn't yet
    ∧ UNCHANGED ⟨c, phase, mode, want, final, emitted, alloc, history, native,
                   width, height, resizes, epoch,
                   replayMode, replayCursor, replayEnd, replayPartial,
                   replayPrepared, replayCut,
                   flush, shutdown, running, stopReason⟩  \* nothing visible happens yet

BridgeHeight(sampled, requested) ≜                     \* B(a,t): next painted height
    IF sampled < requested THEN requested               \* growth jumps straight to target;
    ELSE IF sampled > 2 ∧ requested = 1 THEN 2         \* a deep shrink (>2 -> 1) pauses at 2
    ELSE requested                                      \* all other shrinks are direct
    \* the 2-row bridge frame makes deep collapses read as contractions, not snaps

ApplyAllocation(i) ≜                                   \* one animation frame is painted
    ∧ running                                          \* host alive
    ∧ ¬shutdown                                        \* not during shutdown
    ∧ phase[i] = "Active"                              \* only active slots animate
    ∧ alloc[i] ≠ target[i]                             \* something to do
    ∧ LET nextHeight ≜ BridgeHeight(alloc[i], target[i])  \* bridged next height
           newAlloc ≜ [alloc EXCEPT ![i] = nextHeight]
       IN ∧ AllocationStateOK(newAlloc, target, phase, final, emitted, width, height)
          \* always satisfiable along a bridge: B never raises max(alloc, target)
          ∧ alloc' = newAlloc                          \* paint the frame
    ∧ UNCHANGED ⟨c, phase, mode, want, final, emitted, target, history, native,
                   width, height, resizes, epoch,
                   replayMode, replayCursor, replayEnd, replayPartial,
                   replayPrepared, replayCut,
                   flush, shutdown, running, stopReason⟩  \* repaint only

FinalizeActive(i, snapshot) ≜                          \* a live block completes
    ∧ running                                          \* host alive
    ∧ ¬shutdown                                        \* not during shutdown
    ∧ phase[i] = "Active"                              \* it was producing
    ∧ (mode[i] = "Mutable" ∨ Prefix(want[i], snapshot))  \* final must honor the contract
    ∧ LET newPhase ≜ [phase EXCEPT ![i] = "Finalized"]
           newFinal ≜ [final EXCEPT ![i] = snapshot]   \* the final value, frozen forever
           newAlloc ≜ CanonicalAllocation(newPhase, newFinal, emitted, width, height)
       IN ∧ phase' = newPhase                          \* lifecycle advances
          ∧ want' = [want EXCEPT ![i] = snapshot]      \* want converges to final
          ∧ final' = newFinal                          \* (invariant: final = want)
          ∧ alloc' = newAlloc                          \* ALL slots collapse to canonical
          ∧ target' = newAlloc                         \* 1-row previews: finished content
    ∧ UNCHANGED ⟨c, mode, emitted, history, native, width, height,  \* no longer animates
                   resizes, epoch, replayMode, replayCursor, replayEnd, replayPartial,
                   replayPrepared, replayCut,
                   flush, shutdown, running, stopReason⟩  \* repaint only: nothing retires yet

FinalizeQueued(i, snapshot) ≜                          \* a block completes WITHOUT ever
    ∧ running                                          \* having held a slot (finished
    ∧ ¬shutdown                                        \* before space freed up)
    ∧ phase[i] = "Queued"                              \* straight from the queue
    ∧ (mode[i] = "Mutable" ∨ Prefix(want[i], snapshot))  \* same contract check
    ∧ LET newPhase ≜ [phase EXCEPT ![i] = "Finalized"]
           newWant ≜ [want EXCEPT ![i] = snapshot]
           newFinal ≜ [final EXCEPT ![i] = snapshot]
           newAlloc ≜ CanonicalAllocation(newPhase, newFinal, emitted, width, height)
       IN ∧ phase' = newPhase                          \* note: THIS transition may cause
          ∧ want' = newWant                            \* overflow (a hidden block becomes
          ∧ final' = newFinal                          \* presented) -- summarization, not
          ∧ alloc' = newAlloc                          \* denial, handles it here
          ∧ target' = newAlloc
    ∧ UNCHANGED ⟨c, mode, emitted, history, native, width, height,
                   resizes, epoch, replayMode, replayCursor, replayEnd, replayPartial,
                   replayPrepared, replayCut,
                   flush, shutdown, running, stopReason⟩  \* repaint only

AppendStable ≜                                         \* natural streaming: ONE stable row
    ∧ running                                          \* of the append-only HEAD block
    ∧ ¬shutdown                                        \* scrolls into both histories
    ∧ ¬Replaying                                       \* never interleaves with replay
    ∧ c < CreatedCount                                 \* a head block exists
    ∧ mode[c + 1] = "AppendOnly"                       \* only append-only blocks stream
    ∧ phase[c + 1] ∈ {"Active", "Finalized"}         \* and only while live
    ∧ RowPressure                                      \* only under ROW pressure: with
    \* room to spare, stable rows stay in the viewport (still repositionable)
    ∧ emitted[c + 1] < Len(want[c + 1])                \* a stable row remains to stream
    ∧ LET next ≜ emitted[c + 1] + 1                   \* index of the row to emit
           newEmitted ≜ [emitted EXCEPT ![c + 1] = next]
           newAlloc ≜ CanonicalAllocation(phase, final, newEmitted, width, height)
       IN ∧ history' = history ∘ TagSlice(c + 1, want[c + 1], next, next)  \* ledger += 1 semantic row
          ∧ native' =
                 native
                 ∘ NativeTagSlice("Append", c + 1, want[c + 1], next, next, width)
          \* native += the same row, rendered (1 or 2 physical rows), tagged Append
          ∧ emitted' = newEmitted                      \* the stable frontier advances
          ∧ alloc' = newAlloc                          \* layout recanonicalizes (the
          ∧ target' = newAlloc                         \* streamed row left the viewport)
    ∧ UNCHANGED ⟨c, phase, mode, want, final,
                   width, height, resizes, epoch,
                   replayMode, replayCursor, replayEnd, replayPartial,
                   replayPrepared, replayCut,
                   flush, shutdown, running, stopReason⟩  \* frontier c itself does not move

CompleteAppendOnly ≜                                   \* the fully-streamed head commits
    ∧ running                                          \* host alive
    \* (deliberately NO ~shutdown: draining the head stays possible while
    \*  shutting down)
    ∧ ¬Replaying                                       \* never during replay
    ∧ c < CreatedCount                                 \* head exists
    ∧ mode[c + 1] = "AppendOnly"                       \* head is append-only
    ∧ phase[c + 1] = "Finalized"                       \* head is done
    ∧ emitted[c + 1] = Len(final[c + 1])               \* every row already streamed
    ∧ LET newPhase ≜ [phase EXCEPT ![c + 1] = "Committed"]
           newEmitted ≜ [emitted EXCEPT ![c + 1] = 0]  \* emitted counter retires with it
           newAlloc ≜ CanonicalAllocation(newPhase, final, newEmitted, width, height)
       IN ∧ c' = c + 1                                 \* frontier advances: PURE
          ∧ phase' = newPhase                          \* bookkeeping -- every row is
          ∧ emitted' = newEmitted                      \* already in both histories,
          ∧ alloc' = newAlloc                          \* so nothing is written
          ∧ target' = newAlloc
    ∧ UNCHANGED ⟨mode, want, final, history, native, width, height,
                   resizes, epoch, replayMode, replayCursor, replayEnd, replayPartial,
                   replayPrepared, replayCut,
                   flush, shutdown, running, stopReason⟩  \* note: history unchanged!

BeginFlush ≜                                           \* someone asks for full retirement
    ∧ running                                          \* host alive
    ∧ ¬flush                                           \* idempotent: set once,
    ∧ flush' = TRUE                                    \* never reset
    ∧ UNCHANGED ⟨c, phase, mode, want, final, emitted, alloc, target,
                   history, native, width, height, resizes, epoch,
                   replayMode, replayCursor, replayEnd, replayPartial,
                   replayPrepared, replayCut,
                   shutdown, running, stopReason⟩      \* a pure request: no effect yet

RetireSuccess(batchEnd) ≜                              \* in-order retirement of a batch
    ∧ running                                          \* host alive
    ∧ ¬Replaying                                       \* never during replay
    ∧ batchEnd ∈ (c + 1)‥N                          \* batch = blocks c+1 .. batchEnd
    ∧ FinalizedRange(c + 1, batchEnd)                  \* ... ALL of them finalized
    ∧ RetirementRequested                              \* only under flush or pressure
    ∧ history' =
           history ∘ RetirementRows(c + 1, batchEnd, final, emitted[c + 1])
    \* ledger += head's unstreamed suffix, then later finals in full
    \* (emitted[c+1] is the only possibly-nonzero emitted counter)
    ∧ native' =
           native
           ∘ NativeRetirementRows(                     \* native += the same rows,
                  "Retire",                             \* tagged Retire, rendered at
                  c + 1,                                \* the current width; realized
                  batchEnd,                             \* on a real terminal as ONE
                  final,                                \* streamed write (paper,
                  emitted[c + 1],                       \* Lemma "streaming
                  width                                 \* realization")
              )
    ∧ LET newPhase ≜ [i ∈ Blocks ↦
                            IF i ≤ batchEnd THEN "Committed" ELSE phase[i]]  \* batch commits
           newEmitted ≜ [i ∈ Blocks ↦
                              IF i ≤ batchEnd THEN 0 ELSE emitted[i]]  \* counters reset
           newAlloc ≜ CanonicalAllocation(newPhase, final, newEmitted, width, height)
       IN ∧ c' = batchEnd                              \* frontier jumps to batch end
          ∧ phase' = newPhase
          ∧ emitted' = newEmitted
          ∧ alloc' = newAlloc                          \* retired slots disappear;
          ∧ target' = newAlloc                         \* survivors recanonicalize
    ∧ UNCHANGED ⟨mode, want, final, width, height, resizes, epoch,
                   replayMode, replayCursor, replayEnd, replayPartial,
                   replayPrepared, replayCut,
                   flush, shutdown, running, stopReason⟩  \* finals themselves are untouched

RetireFailure(batchEnd, count) ≜                       \* the SAME write, torn partway:
    ∧ running                                          \* same enabling conditions
    ∧ ¬Replaying                                       \* as RetireSuccess ...
    ∧ batchEnd ∈ (c + 1)‥N
    ∧ FinalizedRange(c + 1, batchEnd)
    ∧ RetirementRequested
    ∧ LET rows ≜
              NativeRetirementRows(                     \* the batch that WOULD have
                  "FailedWrite",                        \* been written, tagged
                  c + 1,                                \* FailedWrite for forensics
                  batchEnd,
                  final,
                  emitted[c + 1],
                  width
              )
       IN ∧ count ∈ 0‥Len(rows)                     \* the terminal accepted `count`
          ∧ native' = native ∘ PrefixOf(rows, count)  \* rows: an arbitrary PREFIX --
          \* never reordered, never a row from outside the batch
    ∧ running' = FALSE                                 \* fail-stop: the host halts;
    ∧ stopReason' = "WriteFailure"                     \* no retry path exists, so
    ∧ UNCHANGED ⟨c, phase, mode, want, final, emitted, alloc, target, history,
                   width, height, resizes, epoch,
                   replayMode, replayCursor, replayEnd, replayPartial, replayPrepared, replayCut, flush, shutdown⟩
    \* CRITICAL: c and history do NOT advance -- the ledger never lies about
    \* what committed, so duplication/reordering after failure is impossible

Resize(newWidth, newHeight, resizePolicy, pushed) ≜    \* terminal geometry changes
    ∧ running                                          \* host alive
    ∧ ¬shutdown                                        \* not during shutdown
    ∧ resizes < MaxResizes                             \* bounded (finite model)
    ∧ newWidth ∈ WidthValues                         \* new geometry and the
    ∧ newHeight ∈ 0‥H                               \* policy for native history
    ∧ resizePolicy ∈ ResizeModes
    ∧ newWidth ≠ width ∨ newHeight ≠ height           \* an actual change
    ∧ pushed ∈ 0‥Len(Screen)                        \* emulator may scroll 0..h top
    \* viewport rows into scrollback during the resize (e.g. height shrink)
    ∧ LET widthChanged ≜ newWidth ≠ width
           effectiveMode ≜ IF widthChanged THEN resizePolicy ELSE "Preserve"
           \* height-only resizes never replay: rendered rows are still valid
           pushedRows ≜ NativeCells("Resize", PrefixOf(Screen, pushed), width)
           \* rows pushed by the emulator, tagged Resize, at the OLD width
           beginReplay ≜ effectiveMode ≠ "Preserve" ∧ (c > 0 ∨ PartialHeadExists)
           \* replay only if there is committed/streamed content to re-render
           newPhase ≜ phase                            \* lifecycle is untouched
           newAlloc ≜ CanonicalAllocation(newPhase, final, emitted, newWidth, newHeight)
       IN ∧ width' = newWidth                          \* adopt the new geometry
          ∧ height' = newHeight
          ∧ resizes' = resizes + 1                     \* burn one resize budget
          ∧ alloc' = newAlloc                          \* layout recanonicalizes at
          ∧ target' = newAlloc                         \* the new geometry
          ∧ native' = IF effectiveMode = "Rebuild"
                        THEN ⟨⟩                       \* Rebuild: native display is wiped ...
                        ELSE native ∘ pushedRows       \* else: record what the emulator pushed
          ∧ epoch' = IF effectiveMode = "Rebuild" THEN epoch + 1 ELSE epoch
          \* ... and the display epoch increments (native monotonicity is epoch-scoped)
          ∧ replayMode' =
                 IF beginReplay THEN effectiveMode      \* start a replay,
                 ELSE IF Replaying THEN replayMode ELSE "None"  \* or keep/clear the old one
          ∧ replayCursor' =
                 IF beginReplay THEN 1                  \* replay window = committed
                 ELSE IF Replaying THEN replayCursor ELSE 0     \* blocks 1..c
          ∧ replayEnd' =
                 IF beginReplay THEN c
                 ELSE IF Replaying THEN replayEnd ELSE 0
          ∧ replayPartial' =
                 IF beginReplay
                 THEN IF PartialHeadExists THEN emitted[c + 1] ELSE 0  \* plus the streamed head prefix
                 ELSE IF Replaying THEN replayPartial ELSE 0
          ∧ replayPrepared' = FALSE                    \* ANY resize invalidates a
          ∧ replayCut' = 0                             \* previously prepared frame
    ∧ UNCHANGED ⟨c, phase, mode, want, final, emitted, history,
                   flush, shutdown, running, stopReason⟩
    \* resize logical-neutrality: ledger, frontier, and semantics never move

PrepareReplay ≜                                        \* compute the replay frame
    ∧ running                                          \* host alive
    ∧ Replaying                                        \* a replay is pending
    ∧ ¬replayPrepared                                  \* and not yet prepared
    ∧ replayPrepared' = TRUE                           \* freeze the frame NOW:
    ∧ replayCut' = RequiredReplayCut                   \* cut = rows that must scroll
    \* from here the scheduler gate (see Next) admits ONLY the two replay
    \* writes, so the sampled cut cannot be invalidated by interleaving
    ∧ UNCHANGED ⟨c, phase, mode, want, final, emitted, alloc, target,
                   history, native, width, height, resizes, epoch,
                   replayMode, replayCursor, replayEnd, replayPartial,
                   flush, shutdown, running, stopReason⟩  \* pure computation: no write yet

ReplaySynchronousSuccess ≜                             \* the single buffered write lands
    ∧ running                                          \* host alive
    ∧ Replaying                                        \* replay pending
    ∧ replayPrepared                                   \* frame prepared (gate open)
    ∧ native' = native ∘ PrefixOf(ReplayRows, replayCut)  \* exactly `cut` rows scroll into
    \* native; the tail was painted into blank rows (no scroll, no history)
    ∧ replayMode' = "None"                             \* replay fully drains:
    ∧ replayCursor' = 0                                \* all replay state returns
    ∧ replayEnd' = 0                                   \* to its idle shape
    ∧ replayPartial' = 0
    ∧ replayPrepared' = FALSE
    ∧ replayCut' = 0
    ∧ UNCHANGED ⟨c, phase, mode, want, final, emitted, alloc, target,
                   history, width, height, resizes, epoch,
                   flush, shutdown, running, stopReason⟩  \* logically neutral: ledger untouched

ReplaySynchronousFailure(count) ≜                      \* the same write, torn partway
    ∧ running                                          \* host alive
    ∧ Replaying                                        \* replay pending
    ∧ replayPrepared                                   \* frame prepared
    ∧ count ∈ 0‥replayCut                           \* an arbitrary prefix of the
    ∧ native' = native ∘ PrefixOf(ReplayRows, count)  \* scrolled portion landed
    ∧ running' = FALSE                                 \* fail-stop, as with
    ∧ stopReason' = "WriteFailure"                     \* RetireFailure: halt, no retry
    ∧ UNCHANGED ⟨c, phase, mode, want, final, emitted, alloc, target, history,
                   width, height, resizes, epoch,
                   replayMode, replayCursor, replayEnd, replayPartial,
                   replayPrepared, replayCut,
                   flush, shutdown⟩                    \* ledger and frontier still truthful

BeginGracefulShutdown ≜                                \* wind-down begins
    ∧ running                                          \* host alive
    ∧ ¬shutdown                                        \* only once
    ∧ LET newPhase ≜ [i ∈ Blocks ↦
                            IF phase[i] = "Absent" THEN "Absent"     \* never-created stay absent;
                            ELSE IF i ≤ c THEN "Committed" ELSE "Finalized"]  \* all live work freezes
           newFinal ≜ [i ∈ Blocks ↦
                            IF phase[i] = "Absent" THEN NoFinal      \* absent: still no final;
                            ELSE IF i ≤ c ∨ phase[i] = "Finalized"
                            THEN final[i]               \* already-frozen finals kept;
                            ELSE want[i]]               \* queued/active freeze AT their
           newAlloc ≜ CanonicalAllocation(newPhase, newFinal, emitted, width, height)
       IN ∧ phase' = newPhase                          \* current speculation (f := w)
          ∧ final' = newFinal
          ∧ alloc' = newAlloc                          \* layout collapses to canonical
          ∧ target' = newAlloc
    ∧ flush' = TRUE                                    \* permanent flush: everything
    ∧ shutdown' = TRUE                                 \* must drain, then exit
    ∧ UNCHANGED ⟨c, mode, want, emitted, history, native, width, height,
                   resizes, epoch, replayMode, replayCursor, replayEnd, replayPartial,
                   replayPrepared, replayCut,
                   running, stopReason⟩                \* nothing retires in this step itself

GracefulExit(push) ≜                                   \* clean exit after full drain
    ∧ running                                          \* host alive
    ∧ shutdown                                         \* shutdown was initiated,
    ∧ ¬Replaying                                       \* replay has drained,
    ∧ c = CreatedCount                                 \* and EVERY block committed
    ∧ push ∈ 0‥1                                    \* optionally scroll one last row
    ∧ push = 0 ∨ height > 0                           \* (only if a viewport row exists)
    ∧ running' = FALSE                                 \* host stops
    ∧ stopReason' = "Graceful"                         \* ... cleanly
    ∧ native' = IF push = 0
                 THEN native                            \* either no final scroll, or the
                 ELSE native ∘ NativeCells("Exit", ⟨Screen[1]⟩, width)
                 \* top viewport row scrolls out (restoring the shell prompt),
                 \* tagged Exit
    ∧ UNCHANGED ⟨c, phase, mode, want, final, emitted, alloc, target, history,
                   width, height, resizes, epoch,
                   replayMode, replayCursor, replayEnd, replayPartial, replayPrepared, replayCut, flush, shutdown⟩

DetachExit(push) ≜                                     \* abandon ship: exit NOW,
    ∧ running                                          \* uncommitted work is dropped
    ∧ ¬shutdown                                        \* (a detach, not a shutdown)
    ∧ push ∈ 0‥1                                    \* same optional final scroll
    ∧ push = 0 ∨ height > 0
    ∧ running' = FALSE                                 \* host stops
    ∧ stopReason' = "Detach"
    ∧ native' = IF push = 0
                 THEN native
                 ELSE native ∘ NativeCells("Exit", ⟨Screen[1]⟩, width)
    ∧ UNCHANGED ⟨c, phase, mode, want, final, emitted, alloc, target, history,
                   width, height, resizes, epoch,
                   replayMode, replayCursor, replayEnd, replayPartial, replayPrepared, replayCut, flush, shutdown⟩
    \* ECH guarantees `history` holds exactly the committed content at detach

\* -------------------------------------------------------------------------
\* Existentially closed action wrappers (for fairness and Next).
\* -------------------------------------------------------------------------
RetireSuccessAction ≜ ∃ batchEnd ∈ Blocks : RetireSuccess(batchEnd)  \* some batch retires
RetireFailureAction ≜                                  \* some batch write fails at
    ∃ batchEnd ∈ Blocks :                            \* some prefix length
        ∃ count ∈ 0‥MaxFailureRows : RetireFailure(batchEnd, count)
ReplaySynchronousFailureAction ≜                       \* replay write fails at some
    ∃ count ∈ 0‥MaxFailureRows : ReplaySynchronousFailure(count)  \* prefix length

\* -------------------------------------------------------------------------
\* The scheduler gate: once a replay frame is prepared, the ONLY possible
\* steps are the replay write landing or failing. This is what the word
\* "synchronous" means, and it is what keeps replayCut = RequiredReplayCut
\* stable (nothing may repaint in between).
\* -------------------------------------------------------------------------
Next ≜
    IF replayPrepared
    THEN ReplaySynchronousSuccess ∨ ReplaySynchronousFailureAction  \* gate closed: write or die
    ELSE ∨ ∃ declaration ∈ {"Mutable", "AppendOnly"} : Create(declaration)  \* gate open:
         ∨ ∃ i ∈ Blocks : Admit(i)                                          \* any protocol
         ∨ ∃ i ∈ Blocks, snapshot ∈ SnapshotValues : Update(i, snapshot)  \* step may fire
         ∨ ∃ newTarget ∈ [Blocks → 0‥H] : RequestAllocation(newTarget)
         ∨ ∃ i ∈ Blocks : ApplyAllocation(i)
         ∨ ∃ i ∈ Blocks, snapshot ∈ SnapshotValues : FinalizeActive(i, snapshot)
         ∨ ∃ i ∈ Blocks, snapshot ∈ SnapshotValues : FinalizeQueued(i, snapshot)
         ∨ AppendStable
         ∨ CompleteAppendOnly
         ∨ BeginFlush
         ∨ RetireSuccessAction
         ∨ RetireFailureAction
         ∨ ∃ newWidth ∈ WidthValues, newHeight ∈ 0‥H,
               resizePolicy ∈ ResizeModes, pushed ∈ 0‥H :
                Resize(newWidth, newHeight, resizePolicy, pushed)
         ∨ PrepareReplay
         ∨ BeginGracefulShutdown
         ∨ ∃ push ∈ 0‥1 : GracefulExit(push)
         ∨ ∃ push ∈ 0‥1 : DetachExit(push)

Spec ≜
    ∧ Init                                             \* start in the initial state,
    ∧ □[Next]_vars                                    \* take Next steps (or stutter),
    ∧ WF_vars(RetireSuccessAction)                     \* and don't ignore forever:
    ∧ WF_vars(PrepareReplay)                           \* retirement, replay preparation,
    ∧ WF_vars(ReplaySynchronousSuccess)                \* the replay write,
    ∧ WF_vars(AppendStable)                            \* head streaming,
    ∧ WF_vars(CompleteAppendOnly)                      \* and head commitment.
    \* Weak fairness: an action enabled forever is eventually taken. Failures
    \* and exits are NOT fair -- they may happen, but are never forced.

\* =========================================================================
\* Invariants (checked by TLC in every reachable state).
\* =========================================================================

TypeOK ≜                                               \* T: every variable in range
    ∧ c ∈ 0‥N                                       \* frontier within block ids
    ∧ phase ∈ [Blocks → Phases]                     \* valid phase per block
    ∧ mode ∈ [Blocks → BlockModes]                  \* valid mode per block
    ∧ want ∈ [Blocks → SnapshotValues]              \* speculation from the universe
    ∧ final ∈ [Blocks → SnapshotValues ∪ {NoFinal}]  \* final or the sentinel
    ∧ emitted ∈ [Blocks → 0‥MaxSnapshotLength]     \* emitted counter bounded
    ∧ alloc ∈ [Blocks → 0‥H]                       \* painted heights bounded
    ∧ target ∈ [Blocks → 0‥H]                      \* requested heights bounded
    ∧ history ∈ Seq(TaggedRows)                      \* ledger rows well-formed
    ∧ native ∈ Seq(NativeRows)                       \* native rows well-formed
    ∧ width ∈ WidthValues                            \* geometry in range
    ∧ height ∈ 0‥H
    ∧ resizes ∈ 0‥MaxResizes                        \* resize budget respected
    ∧ epoch ∈ 0‥MaxResizes                          \* epochs only at resizes
    ∧ replayMode ∈ ReplayModes                       \* replay state in range
    ∧ replayCursor ∈ 0‥(N + 1)                      \* (loose bound; really 0 or 1)
    ∧ replayEnd ∈ 0‥N
    ∧ replayPartial ∈ 0‥MaxSnapshotLength
    ∧ replayPrepared ∈ BOOLEAN
    ∧ replayCut ∈ 0‥MaxFailureRows                  \* cut bounded by max batch size
    ∧ flush ∈ BOOLEAN
    ∧ shutdown ∈ BOOLEAN
    ∧ running ∈ BOOLEAN
    ∧ stopReason ∈ StopReasons

LifecycleShape ≜                                       \* LS: blocks form three bands --
    ∧ c ≤ CreatedCount                                \* can't commit the uncreated
    ∧ ∀ i ∈ 1‥c :                                  \* band 1: 1..c
           ∧ phase[i] = "Committed"                    \* all committed,
           ∧ mode[i] ∈ {"Mutable", "AppendOnly"}     \* with a declared mode
    ∧ ∀ i ∈ (c + 1)‥CreatedCount :                 \* band 2: live blocks
           ∧ phase[i] ∈ {"Queued", "Active", "Finalized"}
           ∧ mode[i] ∈ {"Mutable", "AppendOnly"}
    ∧ ∀ i ∈ (CreatedCount + 1)‥N :                 \* band 3: not yet created
           ∧ phase[i] = "Absent"
           ∧ mode[i] = "Undeclared"

SnapshotDiscipline ≜                                   \* SD: finals exist exactly for
    ∀ i ∈ Blocks :                                   \* finalized/committed blocks,
        IF phase[i] ∈ {"Finalized", "Committed"}
        THEN ∧ final[i] ∈ SnapshotValues             \* are real snapshots,
             ∧ final[i] = want[i]                      \* and equal the last speculation
        ELSE final[i] = NoFinal                         \* everyone else: the sentinel

EmissionDiscipline ≜                                   \* ED: streaming is head-only --
    ∧ ∀ i ∈ Blocks :
           ∧ emitted[i] ≤ Len(want[i])                \* never emitted more than exists
           ∧ (mode[i] ≠ "AppendOnly" ⇒ emitted[i] = 0)  \* mutable blocks never stream
           ∧ (emitted[i] > 0 ⇒
                  ∧ i = c + 1                          \* only the HEAD may have
                  ∧ phase[i] ∈ {"Active", "Finalized"})  \* streamed rows, and only live
    ∧ (PartialHeadExists ⇒ emitted[c + 1] ≤ Len(want[c + 1]))  \* (redundant safety belt)

Capacity ≜ AllocationStateOK(alloc, target, phase, final, emitted, width, height)
\* CAP: the reservation invariant holds of the ACTUAL alloc/target at all times

ExactCommittedHistory ≜ history = CommittedRows(c, final) ∘ PartialHeadRows
\* ECH, the central equation: the ledger IS the committed finals in block
\* order, plus the head's streamed prefix -- no dupes, no gaps, no reorders

NoPrematureHistory ≜                                   \* every ledger row is owned by
    ∀ j ∈ 1‥Len(history) :
        LET owner ≜ history[j].owner IN
        ∨ ∧ owner ∈ 1‥c                            \* a committed block, or
         ∧ phase[owner] = "Committed"
        ∨ ∧ PartialHeadExists                         \* the streaming head --
         ∧ owner = c + 1                              \* speculation NEVER leaks

ScreenCapacity ≜                                       \* the screen is exactly right:
    ∧ Screen ∈ Seq(Cells)                            \* well-formed cells,
    ∧ Len(Screen) = height                             \* exactly `height` of them,
    ∧ ∀ i ∈ Blocks :
           Cardinality({j ∈ 1‥height : Screen[j].owner = i}) = alloc[i]  \* each block owns alloc[i] rows,
    ∧ Cardinality({j ∈ 1‥height : Screen[j] = OverflowCell})
       = SummaryRows(phase, final, emitted, width, height)  \* the summary row appears iff overflowing,
    ∧ Cardinality({j ∈ 1‥height : Screen[j] = BlankCell})
       = height - AllocationTotal(alloc, 1)
         - SummaryRows(phase, final, emitted, width, height)  \* the rest is blank -- accounts balance

ReplayShape ≜                                          \* RS: replay bookkeeping is sane
    ∧ (replayMode = "None" ⇒                          \* idle: all replay state zeroed
           ∧ replayCursor = 0
           ∧ replayEnd = 0
                     ∧ replayPartial = 0
          ∧ ¬replayPrepared
          ∧ replayCut = 0)
    ∧ (replayMode ≠ "None" ⇒                          \* in flight: window is 1..replayEnd
                     ∧ replayCursor = 1
           ∧ replayEnd ∈ 0‥c                        \* over COMMITTED blocks only,
                     ∧ replayPartial ≤ MaxSnapshotLength
          ∧ IF replayPrepared
             THEN ∧ replayCut = RequiredReplayCut      \* prepared: the sampled cut is
                  ∧ Len(PreparedReplayTail) ≤ ReplayRoom  \* still exact (the gate!) and
             ELSE replayCut = 0)                        \* the tail fits the blank region

NativeSourceSafety ≜                                   \* NSS: provenance never lies --
    ∀ j ∈ 1‥Len(native) :
        LET owner ≜ native[j].owner IN
        ∧ (native[j].source = "Retire" ⇒              \* Retire rows: from blocks that
               ∧ owner ∈ 1‥c                        \* really are committed
               ∧ phase[owner] = "Committed")
        ∧ (native[j].source ∈ {"Append", "Replay"} ⇒  \* streamed/replayed rows: from
               ∧ owner ∈ Blocks                        \* committed blocks or the
               ∧ (∨ owner ∈ 1‥c                      \* append-only head -- never
                  ∨ ∧ owner = c + 1                    \* from mutable speculation
                    ∧ mode[owner] = "AppendOnly"))
        ∧ (native[j].source = "FailedWrite" ⇒ stopReason = "WriteFailure")  \* failure rows only after failing
        ∧ (native[j].source = "Exit" ⇒ ¬running)      \* exit rows only after exiting

\* =========================================================================
\* Temporal (action and liveness) properties.
\* =========================================================================

HistoryExtension ≜ Prefix(history, history')           \* one step never rewrites the ledger
HistoryMonotonicity ≜ □[HistoryExtension]_vars        \* ... in ANY step: append-only forever

NativeEpochStep ≜                                      \* per step, native either
    IF epoch' = epoch
    THEN Prefix(native, native')                        \* grows at the end (same epoch)
    ELSE ∧ epoch' = epoch + 1                          \* or is wiped exactly when the
         ∧ native' = ⟨⟩                              \* epoch increments (Rebuild)
NativeEpochDiscipline ≜ □[NativeEpochStep]_vars       \* holds of every step

FinalsStayFixed ≜                                      \* finals are immutable:
    ∀ i ∈ Blocks :
        phase[i] ∈ {"Finalized", "Committed"} ⇒ final'[i] = final[i]
FinalImmutability ≜ □[FinalsStayFixed]_vars           \* once frozen, frozen forever

AppendOnlyPrefixStep ≜                                 \* the append-only contract as
    ∀ i ∈ Blocks :                                   \* an action property:
        (mode[i] = "AppendOnly" ∧ phase[i] ∈ {"Queued", "Active"})
        ⇒ Prefix(want[i], want'[i])                    \* want only ever extends
AppendOnlyMonotonicity ≜ □[AppendOnlyPrefixStep]_vars

ResizeKeepsLogicalHistoryStep ≜                        \* resize logical-neutrality:
    (width' ≠ width ∨ height' ≠ height) ⇒             \* a geometry change moves
        ∧ history' = history                           \* NONE of the semantic state --
        ∧ c' = c                                       \* not the ledger, not the
        ∧ mode' = mode                                 \* frontier, not modes,
        ∧ want' = want                                 \* speculation,
        ∧ final' = final                               \* finals,
        ∧ emitted' = emitted                           \* or streamed counters
ResizeKeepsLogicalHistory ≜ □[ResizeKeepsLogicalHistoryStep]_vars

FailedWriteStops ≜ □(                                 \* fail-stop: a write failure
    stopReason = "WriteFailure" ⇒ ¬running             \* and a live host never coexist
)

StoppedStep ≜ ¬running ⇒ UNCHANGED vars               \* a stopped host is frozen:
StoppedQuiescence ≜ □[StoppedStep]_vars               \* every later step stutters

AllFinalized ≜                                         \* every created block is done
    ∀ i ∈ 1‥CreatedCount : phase[i] ∈ {"Finalized", "Committed"}
AllCommitted ≜                                         \* everything retired, and the
    ∧ c = CreatedCount                                 \* ledger is exactly the
    ∧ history = CommittedRows(c, final)                \* committed finals

FlushLiveness ≜                                        \* drain guarantee: finalized +
    (AllFinalized ∧ flush ∧ shutdown ∧ running ∧ ¬Replaying)  \* flushing + shutting down
    ↝ (AllCommitted ∨ ¬running)                       \* eventually fully commits (or halts)

ReplayLiveness ≜ (Replaying ∧ running) ↝ (¬Replaying ∨ ¬running)
\* every replay eventually drains (or the host halts trying)

QueuedDemand ≜ ∃ i ∈ Blocks : phase[i] = "Queued"   \* someone is waiting for space
QueuedPressureRetirement ≜                             \* pressure + queued demand
    ∀ i ∈ Blocks :                                   \* eventually sweeps a finalized
        (∧ running                                     \* head block into history:
         ∧ ¬Replaying
         ∧ c = i - 1                                   \* i is the head,
         ∧ phase[i] = "Finalized"                      \* it is done,
         ∧ Pressure                                    \* space is scarce,
         ∧ QueuedDemand)                               \* and someone needs it
        ↝ (c ≥ i ∨ ¬running)                         \* => i eventually commits (or halt)
    \* NB: this needs MaxLive small enough that queued demand implies
    \* PERSISTENT count pressure; pure row pressure alone can evaporate
    \* (see the paper's sharpness remark)

====
```

<!-- End of article. -->
