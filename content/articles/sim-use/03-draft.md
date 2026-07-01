# sim-use：让 Agent 拥有眼睛和双手的开发工具

你好，我是 LINE 应用开发 SBU AI Developer Experience 团队的 onevcat（王巍）。最近我一直在做一些工具，希望把 AI Agent 纳入开发与验证的循环之中。

本文会以我们开发并开源的 [`sim-use`](https://github.com/lycorp-jp/sim-use) 为例，介绍在移动开发中要让“由 Agent 来验证”真正成立，需要怎样选择技术，以及其中一些设计上的取舍。

如果你在过去半年里用过 Agent 写代码，大概已经经历过这样的循环：

```plaintext
写 prompt → Agent 产出结果 → 自己运行应用
  → 验证 / 截图 / 告诉 Agent 哪里不满意
  → Agent 修正 → 再运行 → 再截图 …
```

“写代码”这件事，已经有很大一部分可以交给 Agent 了。但对 UI 应用来说，确认**“验证”**本身是否正确尤其困难。Agent 可以在几分钟内生成大量看起来像样的 Swift 或 Kotlin，但写完以后，最多也就是跑一跑单元测试，然后就停在那里。它需要等你运行应用、亲眼查看、指出哪里不对，再根据这些反馈继续修正。这是一种相当低效的开发方式。

本文要介绍的 [`sim-use`](https://github.com/lycorp-jp/sim-use)，正是我们为解决这个问题而做的工具。它是一个跨平台 CLI，让 Agent 能够在 iOS 和 Android 上高效、准确地“看见画面、点击元素、验证结果”。它已经作为开源项目发布。

我会先说明为什么这个问题值得投入，然后通过 5 个技术判断，介绍内部一些有意思但并不显而易见的设计和实现细节。

## 1\. 背景：Agent 时代里，代码生产与产品验证的脱节

行业里有一个粗略但不容忽视的判断：**未来 5 年产生的代码量，将超过过去所有年份产生代码量的总和**。你可以不相信这个具体数字，但方向已经很清楚：Agent 正在快速吞掉软件开发中“生产”这一侧。

但“生产”只是开发循环的一半。代码只有经过验证，才会成为产品。传统的验证方式（工程师手动操作确认、CI 中跑功能测试、发布前由 QA 团队测试）原本就是开发流程里成本最高、速度最慢的一环。如果上游的代码生成速度提升 10 倍，下游验证的瓶颈也会被放大 10 倍。

更麻烦的是，**在移动应用开发里，由于成熟工具链不足，再加上移动平台本身比 Web 更封闭，这个问题会被进一步放大。**

### 1.1 前端 Agent 近乎“作弊”的优势

如果你做 Web，应该会感觉 Agent 在前端场景里已经能把验证循环闭合得还不错。原因很简单。

*   Agent 可以轻松直接拿到 **DOM**。它是结构化的、可遍历的，本身就是一棵带有语义的树。
*   浏览器有成熟的自动化工具（Playwright、Puppeteer 等），selector 也足够稳定。
*   控制台日志、网络请求等各种信号都可以作为文本读取。

DOM 本身就是 Agent 的“天然语料”。像 `<button id="login">` 这样的东西不需要视觉理解，它已经是结构化数据。Agent 写完代码后，可以自己运行、自己点击、自己确认。这个循环非常短。

### 1.2 移动端的“黑盒”处境

到了移动端，问题立刻变了样。

*   iOS 和 Android 都是相对封闭的环境，没有对外公开的“DOM 等价物”。
*   现在常见的两类方案各有特点和优势，但也都有尚未充分满足的需求。
    *   **截图 + 多模态模型**：成本高、速度慢，对长尾控件的识别能力有限；点击坐标需要从截图中计算，容易偏移且不稳定；多模态调用的成本也会迅速膨胀。
    *   **dump UI tree 给 Agent 看**：UIAutomator / AccessibilityService / iOS 的 AX API 的原始输出动辄就是数十甚至数百 KB 的 JSON，用得不好会带来惊人的 token 消耗，而且**经常拿不到 UI 元素**（这一点后面会详细说明）。

结果就是，如果 Agent 看不清画面，就无法自己完成验证；如果它无法自己验证，开发者就会被拉回那种“写 prompt、等产物、手动运行应用”的低效循环里。

**让 Agent 高效、准确、可靠、快速地具备对应用的视觉与操作能力**，几乎决定了 Agent 能承担多少验证工作，也决定了真实开发中的速度上限。我们认为，这是未来软件开发时代里最值得解决的问题之一。一旦这个循环跑起来，Agent 开发才会真正进入更完整的形态。

这就是 `sim-use` 要解决的问题。

**`sim-use` 是一个跨平台 CLI，让 Agent 能像人一样操作 iOS 模拟器、Android 模拟器或真机。**

它主要做 4 件事。

1.  **看见**：把应用当前画面翻译成紧凑、Agent 友好的文本格式，我们称之为 `outline`。
2.  **点击**：通过 outline 中的 `@N`、`#id` 等短 selector，让 Agent 和人都能轻松选中元素并触发交互。
3.  **输入文字 / 手势 / 截图 / 录屏 / 多点触控 / 按键事件**……提供覆盖各类操作与证据保全的一组命令，也提供面向 Agent 审计和其他系统集成的接口。
4.  **跨平台**：iOS 和 Android 使用同一套命令、同一套 selector、同一套 JSON 输出格式，同一份验证逻辑可以复用于多个平台。

工具的整体构成，是以一个 Swift 编写、面向 macOS 的 CLI 为中心，并配有用于提速的常驻 daemon；两端平台则分别这样驱动：iOS 侧通过 Facebook 的 idb（FBSimulatorControl）连接模拟器，UI 观测从 CoreSimulator 的 `AccessibilityPlatformTranslation` 获取 accessibility tree，输入则通过注入 HID 事件完成。Android 侧则通过一个 bridge APK 操作设备：它在设备上运行 `AccessibilityService`，并通过 `adb forward` 暴露 HTTP API。

实际使用大致如下：

```bash
sim-use ui --device <iOS-UDID-or-Android-emulator>
```
```plaintext
# 输出
App: LINE Dev  402x874

[Top  y<120]
  @6  Button  "Keep memo"  #keepButton
  @7  Button  "Notifications"  #notificationButton
  …

[Content  y=120..754]
  @10  Button  "Sato's profile"
  @12  Image  "Profile image"  #profileView
  …

[Bottom  y>=754]
  @39  RadioButton  "Home"  #homeTab  selected
  @40  RadioButton  "Chats, 22 new items"  #chatTab
  @41  RadioButton  "Shopping"  #commerceTab
  @42  RadioButton  "News"  #newsTab
  @43  RadioButton  "MINI"  #miniTab
```

多数情况下，一个画面会被压缩到只有几百个 token，Agent 可以瞬间把握画面结构。它通过文本理解 UI，并执行操作。

```bash
sim-use tap "@10"
sim-use type "hello world"
sim-use swipe --from-x 200 --from-y 800 --to-x 200 --to-y 400
sim-use record-video --output ./demo.mp4
```

最后，再通过一次 `ui` 命令获取新的画面状态，进行断言并决定下一步操作。如此反复，直到达成目标，或拿到所需的验证证据。

本文不会浅尝辄止地介绍 `sim-use` 的用法，而是想更深入地讲讲它背后那些我们认为值得分享的“技术决策”和“实现细节”。

## 3\. 技术幕后（一）：Outline —— 为 Agent 准备的一种“方言”

Agent 首先需要的是“看见画面”。最直观的做法，是把 accessibility tree 整棵 dump 成 JSON 交给它。结构清楚、内容完整、也容易 parse。我们最开始也是这么做的，直到第一次在 LINE 新闻页面上试验。返回结果是 **24 KB、pretty-print 后超过 1,600 行**的 JSON。

24 KB 对普通工程来说不算什么，但对 Agent 很麻烦。在一次验证循环里，`sim-use ui` 会被调用几十次，每次输出都会混进上下文。走两三步之后，上下文就会被 UI tree 塞满，噪声开始让 Agent 忘记此前的对话。聪明的 Agent 可能会在吃过几次亏后自己接 `head`，或者写脚本整理数据，但这依赖特定的上下文结构（例如预先定义好的 skill）或 Agent 的自我修正。为 Agent 准备一个舒服的工作环境，才是让它高效处理问题的关键。

于是我们在 CLI 层做了一种紧凑的文本 DSL 输出，叫作 `outline`。同一个 LINE 新闻页面，dump 后变成 **1.2 KB、不到 30 行**，token 消耗降到原来的 1/20。实际输出大致如下：

```plaintext
[Top y<120]
  @1 Button "Back" (24,60 88x44)
  @2 StaticText "News" (152,68 96x28)
[Content y=120..H-120]
  @3 #1 Cell "Top story headline …" (0,120 393x180)
  @4 #2 Cell "Second story …" (0,308 393x180)
  …
[Bottom y≥H-120]
  @9 Button "Tab Home" (0,790 98x44)
```

<figure><img src="https://vos.line-scdn.net/landpress-content-v2-vcfc68aynwenkh3bno0ixfx8/c48d51b1cfb3406eaa4a1d8f2de6ae06.png?updatedAt=1781582879000" alt="图 1：Outline 压缩前后的对比。同一个 LINE 新闻页面。JSON 24 KB / 1,600 行 vs Outline 1.2 KB / 28 行" width="1000" height="auto"><figcaption>图 1：同一个 LINE 新闻页面。JSON 是 24 KB / 1,600 行，outline 是 1.2 KB / 28 行。token 消耗降到 1/20。</figcaption></figure>

### 3.1 不只是压缩 —— Outline 的设计原则

Outline 不只是压缩。当然，“把 JSON 变小”也是目的之一，但更重要的是**让 Agent 更容易阅读**。这个定位带来了几个具体的设计选择，而每一个选择都是踩过坑后留下来的。

第一个，也是最简单、最根本的设计，是**字节级稳定性**。所有坐标都用 `Int(rounded())` 取整，元素按 `(center-y, x)` 确定性排序，所以同一个画面 dump 两次，结果一定在字节层面一致。这意味着 Agent 可以直接对两个 dump 做文本 diff。“点击前”和“点击后”发生了什么变化会一目了然，需要处理的数据也更少，这对快速推理非常重要。

第二个是 selector 的设计。你可能已经注意到，`ui` 的输出提供了三种简写：`@N` 是当前快照中的第 N 个元素，`#N` 是“页面主列表中的第 N 个 cell”，用于列表型 UI，`#<id>` 则直接引用 accessibility tree 自身持有的稳定 ID，可以跨 dump 复用。这个 DSL 最初的目的，是减少 Agent 需要输入的字符数。`sim-use tap "@5"` 比 `sim-use tap --label "Login Button" --container "MainView"` 简洁得多。但有意思的是，不只是 Agent，**人也很爱用它**。手动调试失败案例时，看着输出敲 `tap @10`，比拼一串很长的 selector 快得多。并且在人与人、人与 Agent 的沟通中，outline 也显著降低了描述问题的难度。

第三个是**克制**。Outline 只严格写出 accessibility tree 已经声明的东西，不发明语义。一组按钮就是 “Button × 5”，不会擅自命名为 “NavBar” 或 “CategoryTabs”。这种纪律来自一个判断：Agent 看到“位于底部、横向排列、role 都是 RadioButton”，自己会推断那是 tab bar。但如果工具替它起名，一旦猜错（例如把一组 RadioButton 标成 SegmentedControl，而实际行为不同），Agent 反而会被带偏。这体现了固定工具与 LLM 智能之间的一种微妙平衡。我们不让工具猜测，而是让 Agent 自己推断并理解画面意图。

唯一例外，是输出顶部的 `[Top y<120]` / `[Content]` / `[Bottom y≥H-120]` 三个区域划分。它们是唯一的“语义提示”，之所以保留，是因为这三个区域在移动 UI 上足够稳定（status bar、内容区、tab bar）。这类提示几乎不会错，成本也很低。

最后一点，是**不要为了跨平台而强行统一**。iOS 上，我们按 `(center-y, x)` 对元素排序。一排按钮即使高度不同，也通常以中心线对齐，因此按中心线排序最稳定。但 Android 的 `AccessibilityNodeInfo.bounds` 会把容器的 padding 也包含进去，如果也按中心线排序，父节点反而可能插到子节点中间。所以 Android 侧改为按 `(top-y, x)`。这是一个小调整，却能让 outline 的顺序更合理，更符合 UI 在画面上的真实顺序。跨平台并不意味着“把一侧的设计强塞给另一侧”，而是要给平台差异留出空间。

### 3.2 不只是看见，还要能指向 —— 列表检测

`#N` 这个 selector 看起来简单，背后却藏着一个并不显然的问题：**运行时要如何识别页面的“主列表”？**

最直接的办法，是让用户指定容器：“这是聊天列表”“这是新闻 feed”。但这会违背“Agent 不需要预先知道结构”的前提。于是我们做了启发式自动检测。它会扫过页面，找出所有“看起来像列表”的元素簇，按可信度排序，得分最高的一组就是 `#N` 默认指向的列表。

检测会并行走两条路径。一条看高度，寻找高度一致的一组兄弟节点（好友列表或 table cell 是典型形态）。另一条看间距，寻找“行间距大致一致”的一组节点（例如新闻 feed 或聊天列表，这类布局的 cell 高度可能不一致，但节奏一致）。然后用一个朴素乘法打分：`cellCount × consistency × roleBonus × widthBonus`。不需要训练，也不需要调权重，最高分的簇胜出。如果多个列表共存（例如 LINE 的转发对象选择页里同时有“好友列表”和“群组列表”），第二高的列表也会被识别，并获得 `#N@2` 这个 selector。

<figure><img src="https://vos.line-scdn.net/landpress-content-v2-vcfc68aynwenkh3bno0ixfx8/1fdd755fd27b4ef0a90856b5c0d99d9f.png?updatedAt=1781582899000" alt="图 2：多个列表共存时 #N 与 #N@2 selector 的实际表现" width="1000" height="auto"><figcaption>图 2：LINE 的转发对象选择页中同时存在好友列表和群组列表。得分最高的好友列表获得 <code>#N</code>，群组列表自动落到 <code>#N@2</code>。</figcaption></figure>

**演示视频：多个列表共存时 #N 与 #N@2 selector 的实际表现**

对 Agent 来说，这意味着“点击聊天列表第 3 行”这样的自然语言，现在可以不经过视觉识别、推理、坐标计算等中间步骤，直接对应到 `tap #3`。验证脚本也不再被硬编码坐标（会随设备偏移）或特定 label（会随多语言变化）绑死。它适配的是“页面在运行时呈现的主列表”，无论这个列表今天有 5 个 cell 还是 20 个 cell，也不关心每个 cell 的具体 label 是什么。在这类 selector 之下，E2E 测试会稳定得多。

## 4\. 技术幕后（二）：让看不见的元素“出现” —— Quadtree 探测

iOS 自动化里有一个很头疼的现象：在 `AccessibilityPlatformTranslation` 框架下，有些节点的内容拿不到。例如，**UITabBar 返回的 `accessibilityChildren` 是空的**。画面底部明明有 4 个 tab 按钮，但遍历 accessibility tree 时，那个 `AXGroup` 下面什么都没有。WebView 也类似，iOS 26 的 “Liquid Glass” 设计、各种自定义 overlay、SwiftUI 搭出的非标准控件，也经常会触发这个问题。

更奇怪的是，这并不是 API 完全坏了。同一个元素，沿着 `accessibilityChildren` 遍历找不到，但用 `objectAtPoint:` 却能命中。你给 iOS 一个坐标，它能告诉你那里有什么；但你让它枚举某个容器里有哪些子元素，它就忽略你。这是一个存在已久的行为，很多开发者都被迫和它相处。

我们想要的是完整的 accessibility tree。于是问题变成了：**如何用 hit-test 找出普通遍历难以到达的元素？**

最朴素的想法是密集采样。把容器的整个 frame 当成画布，用很小的间隔（比如 10pt）撒探测点，在每个点上做一次 hit-test，收集所有命中的元素并去重。逻辑上没问题，但成本无法接受。`objectAtPoint:` 每次都是一次 XPC 跨进程往返，从 sim-use 进程到模拟器进程再回来，每次都要几毫秒。一个 400×800 的画布按 10pt 间隔采样，就是 3,200 次 hit-test，耗时会到数十秒量级，无法满足实用的响应性能。

`ui` 是循环中最关键的一环，所以**“如何聪明地下探针”**很重要。我们的解法是**自适应四叉树（quadtree）**。

四叉树（quadtree）是计算几何中的经典手法。核心想法是把二维区域自顶向下递归地四等分，直到满足某个停止条件。游戏里会用它做碰撞检测剪枝，地图渲染里会用它组织瓦片。我们使用的是一种变体，专门适配“回收漏掉的元素”这个问题。首先在容器 frame 上铺一层 160×80 的粗网格，在每个网格中心做一次 `objectAtPoint:`。命中的元素会被记录下来，它的 bounding rect 会被标记为“已覆盖”。没有命中的格子，要么真的是空白，要么跨在几个小元素之间的缝隙上，因此会继续四分探测。这个细分有上限：每个粗格最多分裂 16 次（Phase 1）或 6 次（Phase 2），并且不会小于 `--min-cell-size`（默认 14pt），避免在真正空白区域里无限耗下去。

这里有一个容易误解的点。当 seed cell 命中一个小元素后，cell 剩余部分会被切成最多 4 个矩形（命中区域上下两条、左右两条），重新 push 到探测队列继续处理。换句话说，命中并不会吃掉整个 seed cell，只会覆盖命中元素自己的 bounding rect。它周围可能漏掉的兄弟元素，仍然有机会被继续探测。代码里把这一步称作 "opportunistic remainder subdivide"。

整体形态是一棵从粗到细的树。元素密集的地方树更深，空白区域树更浅。accessibility tree 已经列举过的东西会作为“已知”直接跳过，只有可能存在漏网元素的区域才会深入探测。也就是说，**我们只在关键位置使用昂贵的 XPC hit-test，而不是均匀撒满整张画布**。

<figure><img src="https://vos.line-scdn.net/landpress-content-v2-vcfc68aynwenkh3bno0ixfx8/3f6dbd33ce5c4c3ea65be03be8996c14.png?updatedAt=1781675859000" alt="图 3：Quadtree 探测的 4 个阶段。从空 AX 容器恢复出所有 tab 按钮" width="1600" height="1200"><figcaption>图 3：UITabBar 的 <code>accessibilityChildren</code> 为空，但 quadtree 探测会先铺粗 seed 网格；命中后标为已覆盖（命中部分以外的剩余条带会回到队列继续探测）；nil 则四分细化。最终能够找出全部 4 个 tab 按钮。</figcaption></figure>

真实场景里，元素漏掉大致分为两种模式，分别在不同阶段（Phase）处理。**Phase 1 是空容器恢复**。如果父节点的 children 为空，但视觉上显然不为空（UITabBar 是典型症状），就把整个 frame 交给 quadtree。**Phase 2 是死角扫描**。父节点有 children，但只覆盖了一部分。例如 nav bar 返回了左上角的 back button，却找不到右上角的 menu button。我们会从容器 frame 中减去所有已知元素覆盖的部分，把剩下的“死角矩形”（只处理尺寸至少 60×60、面积至少 10,000 pt² 的矩形）再次交给 quadtree。Phase 2 使用了一点几何上的技巧（**水平条带切分 + 矩形减法**），比通用多边形减法容易写得多，也很适合“元素几乎都是矩形，且大致水平排列”的移动 UI 输入分布。

为了让这个抽象算法真正可用，我们做了一些朴素的工程优化。最重要的是**用长方形而不是正方形作为 seed**。移动 UI 元素几乎都比高更宽。nav link、文章标题、列表行、文本标签，都是横向条带。早期我们直接用正方形 seed，效率很差；把初始 seed 改成 160×80 后，在相同功能覆盖率下，LINE 新闻页面的探测次数和 wall time 下降了 20%，seed cell 从 45 个减少到 27 个。相比同面积正方形 seed，它在保持同等可探测率的同时，可以让一次典型复杂页面的总耗时缩短约 30%。

另一个优化是 **XPC 调用前的“已知区域预跳过（剪枝）”**。既然 XPC 是最贵的部分，accessibility tree 已经知道的格子就不该再问一次。我们维护了一个 `CoveredSet`，如果某个 seed cell 的中心点已经落在已知元素范围内（带 2pt 容差），就直接跳过。还有一个看似不重要、实际影响很大的参数：`--min-cell-size`。我们把它从 20 降到 14，让 status bar 上的 SSID 图标、tab bar 上的小 badge、设置页右侧的小箭头都能被识别出来。代价是延迟中位数从 470ms 增加到 520ms（+11%，约 50ms），但 Agent 经常需要点击这些小图标，所以这 50ms 值得付出。

最后一点是去重。早期的 `sim-use ui` 在“聊天详情顶部 nav”这类位置，偶尔会返回重复的合成元素。原因是 UIKit 会把同一个容器藏在多个兄弟 `AXGroup` 里，从每个 `AXGroup` 往下探测时，都会命中同一组真实元素。最早的去重逻辑只在单次 probe 调用范围内生效，需要提升到整个遍历的全局作用域。做法是让 `SeenIdentitySet` 贯穿整次 walk，每次命中元素就记录 identity，再次碰到就跳过。最终代码改动只有 8 行，但背后是只有在实地验证与反复试错后才会显现出来的情况。

## 5\. 技术幕后（三）：抹掉 200ms —— Daemon 架构

`sim-use` 是 CLI。CLI 很直观，但有一个不太显眼的成本：**每次调用都会启动新进程，所有“重”的初始化都必须重做一遍**。

对 iOS 来说，这种“重”包括模拟器框架初始化和 accessibility 子系统初始化，加起来稳定消耗约 200ms。对 Android 来说，则包括 `BridgeClient` 启动、auth token 缓存、`adb forward` 端口准备，整体约 150ms。单次看不明显，但 Agent 在一次验证循环里会调用 `sim-use` 几十次，冷启动开销很快就会成为主导成本。

我们的解法是：**为每台设备启动一个常驻进程**。host 上运行一个基于 Unix domain socket 的 daemon 服务，客户端执行命令时直接通过 socket 转发。第一次调用时 fork-exec daemon，并等待 socket 启动（5s 超时）；后续所有命令都走 hot path。所有重初始化成本只需要支付一次。空闲 600s 后它会自动退出，不留下垃圾。

效果是，iOS 的每次 `sim-use ui` 能省下约 200ms（基本上冷启动只发生一次），Android 的单次调用则从约 150ms 压缩到 10ms。Android 侧提升这么大，是因为 `BridgeClient` 周边处理比普通 adb 命令更重，常驻化带来的收益更明显。

但这也带来了维护成本，例如 **daemon 引入的一些正确性问题**。

第一个问题是：**二进制升级后，daemon 仍然用旧逻辑运行**。用户刚刚 `brew upgrade` 到新版本，下一次调用却仍然打到旧代码运行中的 daemon 上。行为不一致，bug 复现不了，人开始怀疑自己。我们的解法是客户端在每次调用前先发 `_ping`，把 daemon 报告的 `simUseVersion` 与当前二进制版本对比；如果不一致，就 shutdown，让 `invoke` 重新 spawn。Ping 本身约 0.4ms，和约 280ms 的 `sim-use ui` 相比可以忽略。

第二个问题是：**daemon 不知情时模拟器已经被关掉**。比如 `xcrun simctl shutdown`，或者用户直接退出 Simulator.app。daemon 还握着 `FBSimulator` handle，下一条命令就会崩溃。我们让 daemon 自己检测模拟器状态，一旦发现已关闭，就主动退出并返回 `staleSimulator` 错误。这里有个不太显眼的小设计：iOS 在不同状态下会吐出不同的低层错误字符串（已关闭、未启动、正在启动，措辞都不同）。我们不会把原始 NSError 描述直接抛给用户，而是识别这些情况，把它们统一包装成可恢复错误，让 Agent 收到错误时有足够信息判断下一步该做什么（例如自动尝试重启模拟器）。

第三个问题是：**stdin 输入与 daemon 设计冲突**。像 `sim-use ios type --stdin` 这样的命令需要从用户终端读取输入，但 daemon 的 stdin 指向 /dev/null，无法读取。修复很简单：允许命令声明 `daemonBypass` 标志，绕过 daemon，直接 in-process 执行。这是 daemon 带来的一类新麻烦：**并不是所有命令都适合走 daemon**，有些命令必须保留逃生通道。

Daemon 处理的问题，和前面几节很不一样。Outline 和 Quadtree 都在解决“如何让 Agent 看清楚”，更接近产品判断。Daemon 是纯性能问题，但它也体现了一种非常常见的工程节奏：提速很容易，**提速之后还要让系统在各种边界条件下保持正确**，才是真正费工夫的部分。

## 6\. 技术幕后（四）：同一套命令，两个世界 —— 跨平台设计

`sim-use` 最初只支持 iOS 模拟器。等这套设计在 iOS 上稳定跑起来后，我们才开始加入 Android backend。iOS 走 FBSimulatorControl，Android 走 bridge APK + `adb forward`，两者底层完全不同。但对 LINE 来说，iOS 和 Android 工程师协作开发是日常状态，所以从一开始我们的目标就是：**两端的命令表面看起来像同一个工具**。这样 Agent 不需要分别学习两套平台 API，也能把面向最终应用开发的实践积累和复用起来。

最重要的设计判断其实很简单：**让命令自己判断设备类型，用户和 Agent 默认都不需要传 `--platform` 这样的参数**。自主识别设备是最容易的部分。`PlatformRouter` 用 3 条规则判断设备标识符：iOS 模拟器是标准的 `8-4-4-4-12` UUID 形式；Android 模拟器以 `emulator-` 开头；Android 真机是 ASCII serial（4 到 32 个字符，且必须包含数字）。

前两条很自然，第三条里的“必须包含数字”是一种防御性设计。如果用户输入 `--device foo` 这种拼写错误，走到 Android 路径后，`adb -s foo` 会等 5 秒超时才返回错误；但如果流向 iOS 路径，就能立刻给出清晰错误。“错误能多快让人意识到问题”是我们写规则时经常做的小判断之一。Agent 和人不同，处理一次含糊错误的成本要高得多。一次失败的工具调用，可能就会触发一次完整的 LLM 推理，消耗几千 token 上下文。尽早、尽可能具体地暴露错误，是 Agent 向 CLI 设计中很值得坚持的原则。

Android backend 与 iOS 的命令面 1:1 对齐后，我们做了一件不太常见的事：**有意从顶层命令面移除了 5 个 iOS 专用命令**。它们是 `key`、`key-combo`、`key-sequence`、`stream-video`、`batch`。这些命令仍然存在，但只能通过 `sim-use ios <verb>` 调用，不再出现在顶层 `--help` 中。旧命令为了兼容仍保留，但会以 exit `64`（`EX_USAGE`）退出，并附上一行迁移提示。

原因很简单：`sim-use --help` 里列出的东西，应该全部都真正能在两个平台上使用。用户读到 `tap`、`type`、`swipe` 时，应该可以放心编写跨平台脚本，而不用担心“哦，这其实只有 iOS 才有”。

这有点反直觉。很多项目把“向后兼容”视作第一价值，命令面也会慢慢膨胀。增加很容易，删除很难。在过去主要面向人类用户开发和运维的语境里，这么做是对的。但时代变了，如果要为当下的软件开发方式设计工具，agent friendly 会越来越重要。**对为 Agent 准备的工具来说，“命令面诚实”比“命令面稳定”更重要。** Agent 不会怀着对历史命名的怀旧去使用工具。它只会被那些“看起来能用，实际却不能用”的命令绊倒。每一个这样的命令，都会带来一次额外错误处理、一次额外 fallback prompt，以及一次本可以避免的 token 消耗。

## 7\. 技术幕后（五）：增加手指 —— 多点触控的技术验证

我们想给 `sim-use` 增加一个“双指缩放”命令。需求看起来不大（pinch、rotate、双指 long-press）。但开发过程却是我最难忘的一段。原因很简单：它不太像正经工程，更像是“逆向工程 + 实验 + 一行灵感”。

起点是 [facebook/idb#514](https://github.com/facebook/idb/issues/514) 这个 issue。它创建于 2020 年，标题大意是“idb 什么时候支持双指手势”。在我们动手之前，它已经被搁置了**6 年**。不是没人想做。Meta 自己也试过，他们采用的是“5 参数调用 + 手动 patch packet 字节”的路线。它能动，但很脆弱：SimulatorKit 的二进制只要变一次，那个硬编码 offset 就可能失效。我们想找一个更稳定的入口。

转机来自 `SimulatorKit.framework` 里的私有符号 `IndigoHIDMessageForMouseNSEvent`。idb 上游使用的是它的 5 参数调用形式，单指足够。但如果用 9 参数形式调用同一个符号：

```plaintext
IndigoHIDMessageForMouseNSEvent(p0, p1, target, eventType, direction,
                                1.0, 1.0, widthPoints, heightPoints)
```

它会生成**结构完全不同的 packet**，也就是一个真正的 two-payload Indigo packet，并正确初始化两个 finger slot 的 state bits。5 参数版并不是不能多点触控，而是根本没有初始化第二个 finger slot，所以 iOS 侧只看得到一根手指。一旦切到 9 参数版，SimulatorKit 自己就会生成正确的 packet 结构，不再需要任何硬编码字节 offset。同一个 patch 在 iOS 18.6 和 iOS 26.2 上都能直接工作。

但真正有意思的部分，是把这个 primitive 接到顶层命令之后才开始的。技术验证阶段，我们以为最难的是“让 iOS 识别两根手指”。结果真正难的是“让 iOS 识别出正确的手势”。

第一个发现是：**iOS 不数事件数量**。我们原以为 Down 和 Up 之间必须塞很多 Move，才能被识别为连续手势；但即使 `steps=1`（一次 Down、一次 Move、一次 Up），iOS 也会把它当成完整拖拽。手势识别器看的是 **finger identifier 的连续性**，不是事件数量。这直接简化了顶层 API。我们不需要为每种手势构造不同复杂度的事件流，一个 primitive 就够了。

第二个发现更有意思。如果把 start 和 end 设成同一个点，结果**不是 no-op，而是一次双指点击**。Maps 实际上会响应它并缩小一级。这意味着 pinch、rotate、双指点击、双指 long-press 这 4 个命令，本质上都是同一个 multi-touch primitive，在不同 `duration` 和 endpoint 几何条件下的特化。我们最终在 CLI 中也是这样组织的：一个底层 primitive，加上几个 preset。

第三个发现让我们卡了两天。线性插值的 rotate，在转到 90° 时，两根手指的中点间距会缩到 71%；转到 180° 时会直接缩到 0。`UIRotationGestureRecognizer` 看到中点间距持续变化，会把它误认为混入了 pinch 手势。因此要正确 **rotate**，手势必须沿圆弧插值。一个看似无关紧要的几何简化（直线还是圆弧），到了识别器面前就变成了二选一的问题。

到这里，技术验证基本结束，pinch 和 rotate 都能在 iOS 18 / iOS 26 上稳定完成 zoom in/out 和旋转。但在把它接入产品的过程中，我们又被识别器教育了两次。

第一次是 rotate 的速度。按默认的 270°/0.5s 运行时，iOS 大约会追到 360°（`UIRotationGestureRecognizer` 内置了惯性），Android 反而只能追到约 210°（`dispatchGesture` 受帧率限制）。两者都不精确，但巧的是，两端“手感舒服”的速度几乎重合，大约是 180°/s。我们最终把 rotate 的默认 duration 改成了根据旋转角度自适应的值，把角速度稳定在这个范围内，让两端识别器都能干净地跟上。

第二次是 `--radius`。默认值 80 在 iOS 模拟器上是屏幕宽度的 20%，可以正常工作。但切到 1080+ px 的 Android 模拟器后，它只有屏幕宽度的 7%，**低于常见设备的 rotate 阈值，于是会静默失败**。没有错误信息，只是看起来毫无反应。修复只是一行：`max(80, min(w, h) * 0.15)`。但这种 bug，往往只有分别在两台不同设备上实际跑过才会注意到。单平台开发者很可能把一个“看起来在另一边也能跑，实际上并没有正常工作”的工具直接发布出去。

这一点也和前面几节不同。Outline DSL 是面向 Agent 的产品判断，Quadtree 探测是为了绕过 API 限制的工程承接，Daemon 是性能问题。它们都是“计划内产生”的东西。Multi-touch 这件事，更像是在工程实践里不断改进的结果，必须贴近开发一线才能推进。

## 8\. 最后：为什么开源

`sim-use` 并不是一个全新的想法，但我们相信，它能帮助推进并解决移动开发中 Agent 循环的验证环节。Cameron Cooke 的 [AXe](https://github.com/cameroncooke/axe) 是起点，行业里也有 Appium、idb、Maestro 等工具。我们站在前人的肩膀上，做了几件具体的事。

*   **把首要目标从“脚本能跑”改为“让 Agent 高效消化 UI”**。Outline DSL 正是这一点的直接结果。
*   **承认 iOS / Android 的 accessibility API 都会漏东西**，并用具体的几何 / hit-test 算法补上这些缺口。
*   **不把跨平台理解成“把一侧设计复制到另一侧”**，而是通过统一命令面 + 平台特定实现 + “surface honesty”的纪律，让 Agent 真正能够编写跨平台脚本。
*   **足够轻量，也非常容易上手**。安装一个 7MB 的二进制，再加上几百行 SKILL.md，就能补上 Agent 开发中最后一块验证拼图，把人类开发者从重复验证中释放出来，转向其他更有意义的思考。

`sim-use` 已经在 [GitHub 上公开](https://github.com/lycorp-jp/sim-use)。如果本文能让你对它内部的设计取舍形成一些直观理解，那就太好了。如果你也在做移动 + AI，欢迎提交 issue 或 PR。

Agent 写代码的速度，本质上会受限于它验证自己所写代码的速度。在移动端，至少今天，这个限制依然真实存在。

我们希望 `sim-use` 能让这个限制变得小一点。
