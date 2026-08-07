# 认识 Kitesurf：在 Cloudflare Workers 的 V8 isolate 中运行的智能体优先浏览器

我们是否应该打造自己的浏览器？这是多年来 Cloudflare 内部每隔几个月就会冒出来的问题之一。不出所料，这类问题总会引发长长的讨论串，附上无数理由和令人信服的论据，说明我们为什么应该做。浏览器显然是我们在电脑上每天使用的最重要软件；它可以说是互联网的操作系统。我们是一家致力于帮助[构建更好的互联网](https://www.cloudflare.com/about-overview/)的公司——谁会不想接受打造一款新浏览器的挑战呢？

但我们始终没能在这项事业的技术难度与它所能解决的独特问题之间找到平衡。于是，这个想法一次又一次被搁置。直到现在。

有件神奇的事情发生了：我们到达了一个临界点——我们[开发者平台](https://developers.cloudflare.com/)上一系列强大的技术进步成为现实，而与此同时，AI 智能体的兴起和对新型浏览器的需求也变得至关重要。

在 Workers 中运行 [WebAssembly（Wasm）](https://developers.cloudflare.com/workers/runtime-apis/webassembly/)如今已经非常成熟。[动态 Workers](https://developers.cloudflare.com/dynamic-workers/)、[基于 SQLite 的 Durable Objects](https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/)、[Worker 到 Worker 的 RPC](https://developers.cloudflare.com/workers/runtime-apis/rpc/)、[service bindings](https://developers.cloudflare.com/workers/runtime-apis/bindings/service-bindings/)、更高的 [NodeJS 兼容性](https://developers.cloudflare.com/workers/runtime-apis/nodejs/)和更高的[限制额度](https://developers.cloudflare.com/workers/platform/limits/)等原语，为以前根本不可能实现的、更宏大更复杂的应用打开了大门。

我们的无头浏览器自动化 API 产品 [Browser Run](https://developers.cloudflare.com/browser-run/) 随着 AI 的兴起取得了巨大增长。智能体需要浏览器来执行许多任务，而且在很多情况下没有浏览器就无法成功。

但这里有个问题——像 Chromium 这样的浏览器引擎是为人类而非智能体构建的，它们带有 AI 模型根本不需要的开销。它们消耗大量内存和算力，以至于为每个智能体提供独立实例的成本高得令人望而却步，这使得 Web 的很大一部分只有参数量更大、内置知识更多、最先进也最昂贵的 AI 模型才能使用，同时把许多其他智能体应用拒之门外。

我们应该给*所有*智能体一个在 AI 模型最看重的方面表现出色的浏览器，即使这意味着在仅对人类有用的方面做减法。例如：

*   AI 不在乎标签页、主题、浏览器扩展或跨设备同步。它在乎的是 token 数量、上下文窗口、可扩展性、性能和成本。
*   结构化、机器可读的内容很重要，但视觉上的尽善尽美、流畅的 60fps 滚动并不重要。只要 CSS 解析稍有偏差或渲染并非像素级完美，智能体都能接受。
*   在 AI 使用浏览器的场景下，威胁模型是不同的。提示注入（prompt injection）和工具安全等新问题才是首要优先级。

面对这些认知，12 周前我们再次问自己：我们应该打造自己的浏览器吗？这一次，答案是全体一致的：**是的！**

今天我们宣布 **Kitesurf**——一款专门为智能体构建、**完全运行在 Workers 之上**的新浏览器，在 beta 期间可于 [Browser Run](https://developers.cloudflare.com/browser-run/) 免费使用。

对于截图和 HTML 提取等常见智能体任务，Kitesurf 在 CPU 和内存消耗上远比 Chromium 高效。下面就是我们的构建历程。系好安全带，接下来会相当硬核——但我们保证会讲得有趣。

## 一切如何开始

Kitesurf 的起点和 Cloudflare 许多伟大想法一样。有人发现了某个有意思的东西，然后不知不觉间，他们就会用一个看似不可能却又极具吸引力的想法，把团队其他人勾进这个深坑。

我们的最初灵感来自 [obscura](https://github.com/h4ckf0r0day/obscura)，一个用 Rust 编写的、面向 AI 自动化的无头引擎，号称“没有 Chrome、没有 Node.js、没有任何依赖”。

<figure data-astro-cid-7nvefuv6=""><p><img src="https://blog.cloudflare.com/_image?href=https%3A%2F%2Fblog.cloudflare.com%2F_emdash%2Fapi%2Fmedia%2Ffile%2F01KZBKVDEMTPBSVB5R6APWE6BN.png&amp;w=715&amp;h=550&amp;f=webp&amp;fit=cover&amp;position=center" srcset="https://blog.cloudflare.com/_image?href=https%3A%2F%2Fblog.cloudflare.com%2F_emdash%2Fapi%2Fmedia%2Ffile%2F01KZBKVDEMTPBSVB5R6APWE6BN.png&amp;w=640&amp;h=492&amp;f=webp&amp;fit=cover&amp;position=center 640w, https://blog.cloudflare.com/_image?href=https%3A%2F%2Fblog.cloudflare.com%2F_emdash%2Fapi%2Fmedia%2Ffile%2F01KZBKVDEMTPBSVB5R6APWE6BN.png&amp;w=715&amp;h=550&amp;f=webp&amp;fit=cover&amp;position=center 715w, https://blog.cloudflare.com/_image?href=https%3A%2F%2Fblog.cloudflare.com%2F_emdash%2Fapi%2Fmedia%2Ffile%2F01KZBKVDEMTPBSVB5R6APWE6BN.png&amp;w=750&amp;h=577&amp;f=webp&amp;fit=cover&amp;position=center 750w, https://blog.cloudflare.com/_image?href=https%3A%2F%2Fblog.cloudflare.com%2F_emdash%2Fapi%2Fmedia%2Ffile%2F01KZBKVDEMTPBSVB5R6APWE6BN.png&amp;w=828&amp;h=637&amp;f=webp&amp;fit=cover&amp;position=center 828w, https://blog.cloudflare.com/_image?href=https%3A%2F%2Fblog.cloudflare.com%2F_emdash%2Fapi%2Fmedia%2Ffile%2F01KZBKVDEMTPBSVB5R6APWE6BN.png&amp;w=1080&amp;h=831&amp;f=webp&amp;fit=cover&amp;position=center 1080w, https://blog.cloudflare.com/_image?href=https%3A%2F%2Fblog.cloudflare.com%2F_emdash%2Fapi%2Fmedia%2Ffile%2F01KZBKVDEMTPBSVB5R6APWE6BN.png&amp;w=1280&amp;h=985&amp;f=webp&amp;fit=cover&amp;position=center 1280w, https://blog.cloudflare.com/_image?href=https%3A%2F%2Fblog.cloudflare.com%2F_emdash%2Fapi%2Fmedia%2Ffile%2F01KZBKVDEMTPBSVB5R6APWE6BN.png&amp;w=1430&amp;h=1100&amp;f=webp&amp;fit=cover&amp;position=center 1430w" alt="unnamed.png" loading="lazy" decoding="async" data-image-placeholder-media="true" data-lightbox-src="/_image?href=https%3A%2F%2Fblog.cloudflare.com%2F_emdash%2Fapi%2Fmedia%2Ffile%2F01KZBKVDEMTPBSVB5R6APWE6BN.png&amp;w=1920&amp;h=1476&amp;f=webp" data-lightbox-width="1920" data-lightbox-height="1476" data-astro-cid-7nvefuv6="true" sizes="(min-width: 715px) 715px, 100vw" data-astro-image="constrained" data-astro-image-fit="cover" data-astro-image-pos="center" width="715" height="550"></p></figure>

然后，在 AI 智能体的帮助下，我们尝试把它移植到 Workers。一开始效果并不好。但一旦我们给了 AI 一个扎实的计划和清晰的成功定义——详细到足以让智能体无限循环迭代，并在需要时提问——它真的成功了。
这个（勉强能跑的）概念验证让我们惊叹不已，于是我们决定让团队放手去大干一场。

### 设计决策

以下是我们开工前做出的一些设计决策。

**测试、测试、再测试**

我们清楚，从原型走向一个能在生产环境中大规模处理任务、真正可用的完整浏览器，需要大量的工作和迭代。我们不否认，用 AI 加速这个过程是关键。但在如此复杂的项目中，如何在保持代码与结果质量可控的同时不牺牲速度？答案是尽可能多地提供测试。

于是我们引入了 [Web Platform Tests](https://github.com/web-platform-tests/wpt)（WPT），这是一套理想的方案：一整套详尽的成功标准，为 AI 智能体提供了评估特性符合度的清晰目标。我们精心挑选了要分配给智能体的特性及其顺序，让人专注于架构工作和审查智能体的方案。

然而，WPT 测试也有其局限：它们衡量的是对 [W3C](https://www.w3.org/) 标准的符合度，而非浏览器渲染真实网站并与之交互的能力。为了弥合这个差距，我们实现了集成测试与视觉回归测试的组合——它在真实网站上对 Chromium 和 Kitesurf 同时运行多步骤 [Puppeteer](https://pptr.dev/) 测试，不仅比较断言结果，还在每一步对比渲染输出，以暴露任何不期望的差异。

**尽可能使用 Rust**

Cloudflare 一直在努力为 Workers 中的 [WebAssembly（Wasm）](https://developers.cloudflare.com/workers/runtime-apis/webassembly/)提供出色支持。这很棒，因为我们可以使用高性能的 C、C++ 和 Rust 包并将其编译为 Wasm。如果使用 Emscripten（举例）及其层层 mock 依赖，编译出的二进制会又大又慢。

因此，我们尽可能选用原生 Rust，并使用 [wasm-bindgen](https://developers.cloudflare.com/workers/languages/rust/#javascript-plumbing-wasm-bindgen) 直接编译到 WebAssembly，从而避免不必要的模拟层，尽可能贴近硬件运行，并且[稳定可靠](https://blog.cloudflare.com/making-rust-workers-reliable/)。

**异常处理**

浏览器必须渲染整个不可靠、有时甚至充满敌意的 Web，且绝不能丢掉它正在处理的页面，所以异常处理不只是代码卫生——它是应用在面对糟糕输入时不至于彻底崩溃的生存之道。

因此我们事先定下一条铁律：任何失败都降级为空白帧或缺失元素，绝不能变成一场死掉的会话。在每个边界捕获异常，默认回到安全而空的状态，并记录足够的日志用于诊断。

**隔离**

与在你笔记本上运行浏览器（访问的是你信任的站点，站点之间共享一些资源可以接受）不同，智能体面对的是任务所要求的任何东西：来自任意来源的任意代码。

所以我们基于这样一个假设来构建这个浏览器：每次页面加载都是不可信输入，每个会话都从全新状态开始。每个组件都被隔离，只能访问其功能所严格必需的资源。

<figure data-astro-cid-7nvefuv6=""><p><img src="https://blog.cloudflare.com/_image?href=https%3A%2F%2Fblog.cloudflare.com%2F_emdash%2Fapi%2Fmedia%2Ffile%2F01KZ9Z89XF1C6TRP798HF5XRCW.png&amp;w=715&amp;h=205&amp;f=webp&amp;fit=cover&amp;position=center" srcset="https://blog.cloudflare.com/_image?href=https%3A%2F%2Fblog.cloudflare.com%2F_emdash%2Fapi%2Fmedia%2Ffile%2F01KZ9Z89XF1C6TRP798HF5XRCW.png&amp;w=640&amp;h=183&amp;f=webp&amp;fit=cover&amp;position=center 640w, https://blog.cloudflare.com/_image?href=https%3A%2F%2Fblog.cloudflare.com%2F_emdash%2Fapi%2Fmedia%2Ffile%2F01KZ9Z89XF1C6TRP798HF5XRCW.png&amp;w=715&amp;h=205&amp;f=webp&amp;fit=cover&amp;position=center 715w, https://blog.cloudflare.com/_image?href=https%3A%2F%2Fblog.cloudflare.com%2F_emdash%2Fapi%2Fmedia%2Ffile%2F01KZ9Z89XF1C6TRP798HF5XRCW.png&amp;w=750&amp;h=215&amp;f=webp&amp;fit=cover&amp;position=center 750w, https://blog.cloudflare.com/_image?href=https%3A%2F%2Fblog.cloudflare.com%2F_emdash%2Fapi%2Fmedia%2Ffile%2F01KZ9Z89XF1C6TRP798HF5XRCW.png&amp;w=828&amp;h=237&amp;f=webp&amp;fit=cover&amp;position=center 828w, https://blog.cloudflare.com/_image?href=https%3A%2F%2Fblog.cloudflare.com%2F_emdash%2Fapi%2Fmedia%2Ffile%2F01KZ9Z89XF1C6TRP798HF5XRCW.png&amp;w=1080&amp;h=310&amp;f=webp&amp;fit=cover&amp;position=center 1080w, https://blog.cloudflare.com/_image?href=https%3A%2F%2Fblog.cloudflare.com%2F_emdash%2Fapi%2Fmedia%2Ffile%2F01KZ9Z89XF1C6TRP798HF5XRCW.png&amp;w=1280&amp;h=367&amp;f=webp&amp;fit=cover&amp;position=center 1280w, https://blog.cloudflare.com/_image?href=https%3A%2F%2Fblog.cloudflare.com%2F_emdash%2Fapi%2Fmedia%2Ffile%2F01KZ9Z89XF1C6TRP798HF5XRCW.png&amp;w=1430&amp;h=410&amp;f=webp&amp;fit=cover&amp;position=center 1430w" alt="BLOG-3466 3.png" loading="lazy" decoding="async" data-image-placeholder-media="true" data-lightbox-src="/_image?href=https%3A%2F%2Fblog.cloudflare.com%2F_emdash%2Fapi%2Fmedia%2Ffile%2F01KZ9Z89XF1C6TRP798HF5XRCW.png&amp;w=1920&amp;h=549&amp;f=webp" data-lightbox-width="1920" data-lightbox-height="549" data-astro-cid-7nvefuv6="true" sizes="(min-width: 715px) 715px, 100vw" data-astro-image="constrained" data-astro-image-fit="cover" data-astro-image-pos="center" width="715" height="205"></p></figure>

这与 Cloudflare Workers 简直是天作之合，后者的[安全模型](https://developers.cloudflare.com/workers/reference/security-model/#isolation)本身就围绕设计上的隔离构建。但平台只给了我们 isolate 之间的边界。我们仍必须在应用层面贯彻同样的原则：决定每个组件被允许触碰什么，并确保没有任何东西泄漏到它不该跨越的页面之外。

**尽可能无状态**

状态是让故障变得昂贵的根源——如果无需重建任何东西，从崩溃中恢复就只是重新起一个会话并重放请求。无状态组件天生可抛弃、可并行：一旦卡住就杀掉，一次跑一千个，按需扩缩容而不是一直保持热状态。这与自动化场景完美契合——负载是突发的，而最便宜的做法就是按用量计费、用完即消失的工作。简而言之，**凡是能做到无状态的组件，就应该无状态**。

## 我们如何构建它

带着周密的计划、大量的测试和良好的工具环境，我们准备好超越最初的概念验证，正式开工了。以下就是 Kitesurf 中一个请求的极高层次生命周期，直到今天依然如此：

<figure data-astro-cid-7nvefuv6=""><p><img src="https://blog.cloudflare.com/_image?href=https%3A%2F%2Fblog.cloudflare.com%2F_emdash%2Fapi%2Fmedia%2Ffile%2F01KZ9Z8A7NX68CP9DHW93JAHJX.png&amp;w=715&amp;h=497&amp;f=webp&amp;fit=cover&amp;position=center" srcset="https://blog.cloudflare.com/_image?href=https%3A%2F%2Fblog.cloudflare.com%2F_emdash%2Fapi%2Fmedia%2Ffile%2F01KZ9Z8A7NX68CP9DHW93JAHJX.png&amp;w=640&amp;h=445&amp;f=webp&amp;fit=cover&amp;position=center 640w, https://blog.cloudflare.com/_image?href=https%3A%2F%2Fblog.cloudflare.com%2F_emdash%2Fapi%2Fmedia%2Ffile%2F01KZ9Z8A7NX68CP9DHW93JAHJX.png&amp;w=715&amp;h=497&amp;f=webp&amp;fit=cover&amp;position=center 715w, https://blog.cloudflare.com/_image?href=https%3A%2F%2Fblog.cloudflare.com%2F_emdash%2Fapi%2Fmedia%2Ffile%2F01KZ9Z8A7NX68CP9DHW93JAHJX.png&amp;w=750&amp;h=521&amp;f=webp&amp;fit=cover&amp;position=center 750w, https://blog.cloudflare.com/_image?href=https%3A%2F%2Fblog.cloudflare.com%2F_emdash%2Fapi%2Fmedia%2Ffile%2F01KZ9Z8A7NX68CP9DHW93JAHJX.png&amp;w=828&amp;h=576&amp;f=webp&amp;fit=cover&amp;position=center 828w, https://blog.cloudflare.com/_image?href=https%3A%2F%2Fblog.cloudflare.com%2F_emdash%2Fapi%2Fmedia%2Ffile%2F01KZ9Z8A7NX68CP9DHW93JAHJX.png&amp;w=1080&amp;h=751&amp;f=webp&amp;fit=cover&amp;position=center 1080w, https://blog.cloudflare.com/_image?href=https%3A%2F%2Fblog.cloudflare.com%2F_emdash%2Fapi%2Fmedia%2Ffile%2F01KZ9Z8A7NX68CP9DHW93JAHJX.png&amp;w=1280&amp;h=890&amp;f=webp&amp;fit=cover&amp;position=center 1280w, https://blog.cloudflare.com/_image?href=https%3A%2F%2Fblog.cloudflare.com%2F_emdash%2Fapi%2Fmedia%2Ffile%2F01KZ9Z8A7NX68CP9DHW93JAHJX.png&amp;w=1430&amp;h=994&amp;f=webp&amp;fit=cover&amp;position=center 1430w" alt="BLOG-3466 4.png" loading="lazy" decoding="async" data-image-placeholder-media="true" data-lightbox-src="/_image?href=https%3A%2F%2Fblog.cloudflare.com%2F_emdash%2Fapi%2Fmedia%2Ffile%2F01KZ9Z8A7NX68CP9DHW93JAHJX.png&amp;w=1920&amp;h=1335&amp;f=webp" data-lightbox-width="1920" data-lightbox-height="1335" data-astro-cid-7nvefuv6="true" sizes="(min-width: 715px) 715px, 100vw" data-astro-image="constrained" data-astro-image-fit="cover" data-astro-image-pos="center" width="715" height="497"></p></figure>

让我们深入探讨让 Kitesurf 运转起来的三大组件：Engine、PageScript 和 PageRenderer。

### 从源站获取内容

要渲染一个不可信的网页，浏览器必须从互联网上获取任意资源——图片、字体、CSS、JavaScript 和 Wasm 文件。这是浏览器能做的最危险的操作之一。

Kitesurf 通过唯一一个组件 SandboxOutbound worker 来完成这一切，除此之外没有任何组件能直接触网——这一点由 Dynamic Workers 强制保证。Engine 用它来引导页面启动，获取主文档及其脚本；PageScript 则获取其余一切：样式表、图片、字体以及页面自身的 fetch() 调用。

我们用 SandboxOutbound 来强制实施 [CORS](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/CORS)、注入浏览器形态的请求头、过滤响应，并让每个页面的 cookie 留在各自的 jar 里。任何不符合我们策略的请求都会得到 403——每个组件都恰好获得它所需的网络访问，不多一分。

<figure data-astro-cid-7nvefuv6=""><p><img src="https://blog.cloudflare.com/_image?href=https%3A%2F%2Fblog.cloudflare.com%2F_emdash%2Fapi%2Fmedia%2Ffile%2F01KZ9Z8AAR723T5KJCNQ547FAV.png&amp;w=715&amp;h=395&amp;f=webp&amp;fit=cover&amp;position=center" srcset="https://blog.cloudflare.com/_image?href=https%3A%2F%2Fblog.cloudflare.com%2F_emdash%2Fapi%2Fmedia%2Ffile%2F01KZ9Z8AAR723T5KJCNQ547FAV.png&amp;w=640&amp;h=354&amp;f=webp&amp;fit=cover&amp;position=center 640w, https://blog.cloudflare.com/_image?href=https%3A%2F%2Fblog.cloudflare.com%2F_emdash%2Fapi%2Fmedia%2Ffile%2F01KZ9Z8AAR723T5KJCNQ547FAV.png&amp;w=715&amp;h=395&amp;f=webp&amp;fit=cover&amp;position=center 715w, https://blog.cloudflare.com/_image?href=https%3A%2F%2Fblog.cloudflare.com%2F_emdash%2Fapi%2Fmedia%2Ffile%2F01KZ9Z8AAR723T5KJCNQ547FAV.png&amp;w=750&amp;h=414&amp;f=webp&amp;fit=cover&amp;position=center 750w, https://blog.cloudflare.com/_image?href=https%3A%2F%2Fblog.cloudflare.com%2F_emdash%2Fapi%2Fmedia%2Ffile%2F01KZ9Z8AAR723T5KJCNQ547FAV.png&amp;w=828&amp;h=457&amp;f=webp&amp;fit=cover&amp;position=center 828w, https://blog.cloudflare.com/_image?href=https%3A%2F%2Fblog.cloudflare.com%2F_emdash%2Fapi%2Fmedia%2Ffile%2F01KZ9Z8AAR723T5KJCNQ547FAV.png&amp;w=1080&amp;h=597&amp;f=webp&amp;fit=cover&amp;position=center 1080w, https://blog.cloudflare.com/_image?href=https%3A%2F%2Fblog.cloudflare.com%2F_emdash%2Fapi%2Fmedia%2Ffile%2F01KZ9Z8AAR723T5KJCNQ547FAV.png&amp;w=1280&amp;h=707&amp;f=webp&amp;fit=cover&amp;position=center 1280w, https://blog.cloudflare.com/_image?href=https%3A%2F%2Fblog.cloudflare.com%2F_emdash%2Fapi%2Fmedia%2Ffile%2F01KZ9Z8AAR723T5KJCNQ547FAV.png&amp;w=1430&amp;h=790&amp;f=webp&amp;fit=cover&amp;position=center 1430w" alt="BLOG-3466 5.png" loading="lazy" decoding="async" data-image-placeholder-media="true" data-lightbox-src="/_image?href=https%3A%2F%2Fblog.cloudflare.com%2F_emdash%2Fapi%2Fmedia%2Ffile%2F01KZ9Z8AAR723T5KJCNQ547FAV.png&amp;w=1920&amp;h=1060&amp;f=webp" data-lightbox-width="1920" data-lightbox-height="1060" data-astro-cid-7nvefuv6="true" sizes="(min-width: 715px) 715px, 100vw" data-astro-image="constrained" data-astro-image-fit="cover" data-astro-image-pos="center" width="715" height="395"></p></figure>

### Engine

Engine 是 Kitesurf 唯一对外公开的组件。它处理 Chrome DevTools 协议（CDP）的 WebSocket 和 HTTP REST API，提供一个对内部测试有用的落地页，而最重要的是，它存储每个会话的状态。所有其他组件都是无状态的。

<figure data-astro-cid-7nvefuv6=""><p><img src="https://blog.cloudflare.com/_image?href=https%3A%2F%2Fblog.cloudflare.com%2F_emdash%2Fapi%2Fmedia%2Ffile%2F01KZ9Z8AHPEVW2VZK1VM59SZHW.png&amp;w=715&amp;h=457&amp;f=webp&amp;fit=cover&amp;position=center" srcset="https://blog.cloudflare.com/_image?href=https%3A%2F%2Fblog.cloudflare.com%2F_emdash%2Fapi%2Fmedia%2Ffile%2F01KZ9Z8AHPEVW2VZK1VM59SZHW.png&amp;w=640&amp;h=409&amp;f=webp&amp;fit=cover&amp;position=center 640w, https://blog.cloudflare.com/_image?href=https%3A%2F%2Fblog.cloudflare.com%2F_emdash%2Fapi%2Fmedia%2Ffile%2F01KZ9Z8AHPEVW2VZK1VM59SZHW.png&amp;w=715&amp;h=457&amp;f=webp&amp;fit=cover&amp;position=center 715w, https://blog.cloudflare.com/_image?href=https%3A%2F%2Fblog.cloudflare.com%2F_emdash%2Fapi%2Fmedia%2Ffile%2F01KZ9Z8AHPEVW2VZK1VM59SZHW.png&amp;w=750&amp;h=479&amp;f=webp&amp;fit=cover&amp;position=center 750w, https://blog.cloudflare.com/_image?href=https%3A%2F%2Fblog.cloudflare.com%2F_emdash%2Fapi%2Fmedia%2Ffile%2F01KZ9Z8AHPEVW2VZK1VM59SZHW.png&amp;w=828&amp;h=529&amp;f=webp&amp;fit=cover&amp;position=center 828w, https://blog.cloudflare.com/_image?href=https%3A%2F%2Fblog.cloudflare.com%2F_emdash%2Fapi%2Fmedia%2Ffile%2F01KZ9Z8AHPEVW2VZK1VM59SZHW.png&amp;w=1080&amp;h=690&amp;f=webp&amp;fit=cover&amp;position=center 1080w, https://blog.cloudflare.com/_image?href=https%3A%2F%2Fblog.cloudflare.com%2F_emdash%2Fapi%2Fmedia%2Ffile%2F01KZ9Z8AHPEVW2VZK1VM59SZHW.png&amp;w=1280&amp;h=818&amp;f=webp&amp;fit=cover&amp;position=center 1280w, https://blog.cloudflare.com/_image?href=https%3A%2F%2Fblog.cloudflare.com%2F_emdash%2Fapi%2Fmedia%2Ffile%2F01KZ9Z8AHPEVW2VZK1VM59SZHW.png&amp;w=1430&amp;h=914&amp;f=webp&amp;fit=cover&amp;position=center 1430w" alt="BLOG-3466 6.png" loading="lazy" decoding="async" data-image-placeholder-media="true" data-lightbox-src="/_image?href=https%3A%2F%2Fblog.cloudflare.com%2F_emdash%2Fapi%2Fmedia%2Ffile%2F01KZ9Z8AHPEVW2VZK1VM59SZHW.png&amp;w=1920&amp;h=1227&amp;f=webp" data-lightbox-width="1920" data-lightbox-height="1227" data-astro-cid-7nvefuv6="true" sizes="(min-width: 715px) 715px, 100vw" data-astro-image="constrained" data-astro-image-fit="cover" data-astro-image-pos="center" width="715" height="457"></p></figure>

使用 CDP 的好处是客户端兼容性：[Puppeteer](https://developers.cloudflare.com/browser-run/puppeteer/)、Playwright、chrome-remote-interface 以及真正的 Chrome DevTools 前端。把它们指向 Kitesurf，它们都能直接工作。Browser Run 也正是这样[工作](https://developers.cloudflare.com/browser-run/cdp/)的（这为什么重要，后文会详述）。

与名字给人的印象相反，Engine 实际上是 Kitesurf 各组件中最简单的一个。有意思的部分还在后面。

### PageScript

PageScript 很好地展示了我们新 Workers 特性的威力：这里用的是 [Dynamic Workers](https://developers.cloudflare.com/dynamic-workers/)。在它出现之前，Kitesurf 根本不可能实现。

下面是 PageScript 内部工作原理的简化示意图。

<figure data-astro-cid-7nvefuv6=""><p><img src="https://blog.cloudflare.com/_image?href=https%3A%2F%2Fblog.cloudflare.com%2F_emdash%2Fapi%2Fmedia%2Ffile%2F01KZ9Z8A7714HEP695P6HKY8GD.png&amp;w=715&amp;h=324&amp;f=webp&amp;fit=cover&amp;position=center" srcset="https://blog.cloudflare.com/_image?href=https%3A%2F%2Fblog.cloudflare.com%2F_emdash%2Fapi%2Fmedia%2Ffile%2F01KZ9Z8A7714HEP695P6HKY8GD.png&amp;w=640&amp;h=290&amp;f=webp&amp;fit=cover&amp;position=center 640w, https://blog.cloudflare.com/_image?href=https%3A%2F%2Fblog.cloudflare.com%2F_emdash%2Fapi%2Fmedia%2Ffile%2F01KZ9Z8A7714HEP695P6HKY8GD.png&amp;w=715&amp;h=324&amp;f=webp&amp;fit=cover&amp;position=center 715w, https://blog.cloudflare.com/_image?href=https%3A%2F%2Fblog.cloudflare.com%2F_emdash%2Fapi%2Fmedia%2Ffile%2F01KZ9Z8A7714HEP695P6HKY8GD.png&amp;w=750&amp;h=340&amp;f=webp&amp;fit=cover&amp;position=center 750w, https://blog.cloudflare.com/_image?href=https%3A%2F%2Fblog.cloudflare.com%2F_emdash%2Fapi%2Fmedia%2Ffile%2F01KZ9Z8A7714HEP695P6HKY8GD.png&amp;w=828&amp;h=375&amp;f=webp&amp;fit=cover&amp;position=center 828w, https://blog.cloudflare.com/_image?href=https%3A%2F%2Fblog.cloudflare.com%2F_emdash%2Fapi%2Fmedia%2Ffile%2F01KZ9Z8A7714HEP695P6HKY8GD.png&amp;w=1080&amp;h=489&amp;f=webp&amp;fit=cover&amp;position=center 1080w, https://blog.cloudflare.com/_image?href=https%3A%2F%2Fblog.cloudflare.com%2F_emdash%2Fapi%2Fmedia%2Ffile%2F01KZ9Z8A7714HEP695P6HKY8GD.png&amp;w=1280&amp;h=580&amp;f=webp&amp;fit=cover&amp;position=center 1280w, https://blog.cloudflare.com/_image?href=https%3A%2F%2Fblog.cloudflare.com%2F_emdash%2Fapi%2Fmedia%2Ffile%2F01KZ9Z8A7714HEP695P6HKY8GD.png&amp;w=1430&amp;h=648&amp;f=webp&amp;fit=cover&amp;position=center 1430w" alt="BLOG-3466 7.png" loading="lazy" decoding="async" data-image-placeholder-media="true" data-lightbox-src="/_image?href=https%3A%2F%2Fblog.cloudflare.com%2F_emdash%2Fapi%2Fmedia%2Ffile%2F01KZ9Z8A7714HEP695P6HKY8GD.png&amp;w=1920&amp;h=869&amp;f=webp" data-lightbox-width="1920" data-lightbox-height="869" data-astro-cid-7nvefuv6="true" sizes="(min-width: 715px) 715px, 100vw" data-astro-image="constrained" data-astro-image-fit="cover" data-astro-image-pos="center" width="715" height="324"></p></figure>

每一个新页面或进程外 iframe（[OOPIF](https://www.chromium.org/developers/design-documents/oop-iframes/)）都会用 Dynamic Workers 启动一个处理页面会话的长期存活 PageScript isolate，其中包含一个干净的 [globalThis](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/globalThis) 和 [DOM](https://developer.mozilla.org/en-US/docs/Web/API/Document_Object_Model) document 对象。

随后，DOM 对象会被填入解析 HTML 文档和运行全部 JavaScript 脚本的结果。解析 HTML 和 CSS 时，我们使用 [Blitz](https://github.com/DioxusLabs/blitz)（一个模块化渲染引擎）和 [Stylo](https://github.com/servo/stylo)（Firefox 的高性能 CSS 解析器）的部分代码，两者都用 Rust 编写。

对于找到的每个 &lt;script&gt; 标签或 .wasm 文件，我们在同一个 isolate 内运行对应的 JavaScript 和 WebAssembly 代码。

**是的，但 eval 怎么办？**

你可能会问，[eval](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/eval) 怎么办？eval 处理起来更棘手，因为出于[安全原因](https://developers.cloudflare.com/workers/runtime-apis/web-standards/#javascript-standards)，我们目前仍不支持在 Workers 中原生执行 eval。我们也不能再启动一个 isolate 来处理它，因为那样它就无法访问 globalThis。

我们的解决方案是使用 [Boa JS](https://boajs.dev/)，一个用 Rust 编写的 ECMAScript 引擎，在 Workers 上编译并运行。我们本质上是在一个运行时之上再跑一个运行时，这听起来不太理想，事实也确实如此，但它足以应付代码中偶尔出现的 eval。将来 Workers 原生支持 eval 后，我们会从 Boa 迁移出去。

### PageRenderer

这个组件主要负责根据计算出的页面对象生成真正的像素。它是这样工作的：

<figure data-astro-cid-7nvefuv6=""><p><img src="https://blog.cloudflare.com/_image?href=https%3A%2F%2Fblog.cloudflare.com%2F_emdash%2Fapi%2Fmedia%2Ffile%2F01KZ9Z8AR04KBNA79NHBQYG562.png&amp;w=715&amp;h=338&amp;f=webp&amp;fit=cover&amp;position=center" srcset="https://blog.cloudflare.com/_image?href=https%3A%2F%2Fblog.cloudflare.com%2F_emdash%2Fapi%2Fmedia%2Ffile%2F01KZ9Z8AR04KBNA79NHBQYG562.png&amp;w=640&amp;h=303&amp;f=webp&amp;fit=cover&amp;position=center 640w, https://blog.cloudflare.com/_image?href=https%3A%2F%2Fblog.cloudflare.com%2F_emdash%2Fapi%2Fmedia%2Ffile%2F01KZ9Z8AR04KBNA79NHBQYG562.png&amp;w=715&amp;h=338&amp;f=webp&amp;fit=cover&amp;position=center 715w, https://blog.cloudflare.com/_image?href=https%3A%2F%2Fblog.cloudflare.com%2F_emdash%2Fapi%2Fmedia%2Ffile%2F01KZ9Z8AR04KBNA79NHBQYG562.png&amp;w=750&amp;h=355&amp;f=webp&amp;fit=cover&amp;position=center 750w, https://blog.cloudflare.com/_image?href=https%3A%2F%2Fblog.cloudflare.com%2F_emdash%2Fapi%2Fmedia%2Ffile%2F01KZ9Z8AR04KBNA79NHBQYG562.png&amp;w=828&amp;h=391&amp;f=webp&amp;fit=cover&amp;position=center 828w, https://blog.cloudflare.com/_image?href=https%3A%2F%2Fblog.cloudflare.com%2F_emdash%2Fapi%2Fmedia%2Ffile%2F01KZ9Z8AR04KBNA79NHBQYG562.png&amp;w=1080&amp;h=511&amp;f=webp&amp;fit=cover&amp;position=center 1080w, https://blog.cloudflare.com/_image?href=https%3A%2F%2Fblog.cloudflare.com%2F_emdash%2Fapi%2Fmedia%2Ffile%2F01KZ9Z8AR04KBNA79NHBQYG562.png&amp;w=1280&amp;h=605&amp;f=webp&amp;fit=cover&amp;position=center 1280w, https://blog.cloudflare.com/_image?href=https%3A%2F%2Fblog.cloudflare.com%2F_emdash%2Fapi%2Fmedia%2Ffile%2F01KZ9Z8AR04KBNA79NHBQYG562.png&amp;w=1430&amp;h=676&amp;f=webp&amp;fit=cover&amp;position=center 1430w" alt="BLOG-3466 8.png" loading="lazy" decoding="async" data-image-placeholder-media="true" data-lightbox-src="/_image?href=https%3A%2F%2Fblog.cloudflare.com%2F_emdash%2Fapi%2Fmedia%2Ffile%2F01KZ9Z8AR04KBNA79NHBQYG562.png&amp;w=1920&amp;h=907&amp;f=webp" data-lightbox-width="1920" data-lightbox-height="907" data-astro-cid-7nvefuv6="true" sizes="(min-width: 715px) 715px, 100vw" data-astro-image="constrained" data-astro-image-fit="cover" data-astro-image-pos="center" width="715" height="338"></p></figure>

PageRenderer 与 Engine Worker 以循环方式协同工作。每当引擎需要一个帧时，PageRenderer 就从 PageScript 获取页面对象（也称为 scene），从 [Static Assets](https://developers.cloudflare.com/workers/static-assets/) 获取内部字体和图片，将一切栅格化到图像缓冲区，然后以客户端可显示的形式（如 JPEG/PNG 或 PDF）把缓冲区返回给引擎。

这里很大一部分魔法由 Blitz 的另一个模块 [blitz-paint](https://github.com/DioxusLabs/blitz/tree/main/packages/blitz-paint) 完成，它又借助 Parley 来把字符塑形为字形、选择字体以及把文本断成行。

**Workers 内置的 RPC 系统：同一个应用，多个 isolate**

Cloudflare Workers 有[内置的远程过程调用（RPC）系统](https://blog.cloudflare.com/javascript-native-rpc/)，允许你在其他 Worker 上调用方法、在它们之间传递对象，以及调用这些对象上的方法。你不必操心 API schema、类型或身份认证，直接调用 remoteFunction(...params) 即可。你既能受益于远程 Worker 的隔离和资源，又能保留用 JavaScript 在本地调用其所有函数的便利。

Kitesurf 就用上了这套 RPC 系统：Engine Worker 通过一次 RPC 调用从 PageRenderer Worker 调用 renderFrame()，拿到一张 PNG 作为结果。由于渲染器不持有页面状态（只有一个可抛弃的缓存），引擎可以在任何 RPC 调用失败或卡住时安全地杀掉并重启它——这让每次渲染请求都自包含、可重试，其 isolate 廉价且用完即弃。

## Kitesurf 已通过 215,000+ 项 WPT 测试，且仍在增长

Kitesurf 是真的能跑。它已经通过了大约 215,000+ 项 [WPT 测试](https://github.com/web-platform-tests/wpt)，而且我们每周都在增加数百项通过的测试。下面你可以看到自项目启动以来到最新版本的演进过程：

<figure data-astro-cid-7nvefuv6=""><p><img src="https://blog.cloudflare.com/_image?href=https%3A%2F%2Fblog.cloudflare.com%2F_emdash%2Fapi%2Fmedia%2Ffile%2F01KZ9Z8A1TZBWVWDT3XZQR7AB1.png&amp;w=715&amp;h=367&amp;f=webp&amp;fit=cover&amp;position=center" srcset="https://blog.cloudflare.com/_image?href=https%3A%2F%2Fblog.cloudflare.com%2F_emdash%2Fapi%2Fmedia%2Ffile%2F01KZ9Z8A1TZBWVWDT3XZQR7AB1.png&amp;w=640&amp;h=329&amp;f=webp&amp;fit=cover&amp;position=center 640w, https://blog.cloudflare.com/_image?href=https%3A%2F%2Fblog.cloudflare.com%2F_emdash%2Fapi%2Fmedia%2Ffile%2F01KZ9Z8A1TZBWVWDT3XZQR7AB1.png&amp;w=715&amp;h=367&amp;f=webp&amp;fit=cover&amp;position=center 715w, https://blog.cloudflare.com/_image?href=https%3A%2F%2Fblog.cloudflare.com%2F_emdash%2Fapi%2Fmedia%2Ffile%2F01KZ9Z8A1TZBWVWDT3XZQR7AB1.png&amp;w=750&amp;h=385&amp;f=webp&amp;fit=cover&amp;position=center 750w, https://blog.cloudflare.com/_image?href=https%3A%2F%2Fblog.cloudflare.com%2F_emdash%2Fapi%2Fmedia%2Ffile%2F01KZ9Z8A1TZBWVWDT3XZQR7AB1.png&amp;w=828&amp;h=425&amp;f=webp&amp;fit=cover&amp;position=center 828w, https://blog.cloudflare.com/_image?href=https%3A%2F%2Fblog.cloudflare.com%2F_emdash%2Fapi%2Fmedia%2Ffile%2F01KZ9Z8A1TZBWVWDT3XZQR7AB1.png&amp;w=1080&amp;h=554&amp;f=webp&amp;fit=cover&amp;position=center 1080w, https://blog.cloudflare.com/_image?href=https%3A%2F%2Fblog.cloudflare.com%2F_emdash%2Fapi%2Fmedia%2Ffile%2F01KZ9Z8A1TZBWVWDT3XZQR7AB1.png&amp;w=1280&amp;h=657&amp;f=webp&amp;fit=cover&amp;position=center 1280w, https://blog.cloudflare.com/_image?href=https%3A%2F%2Fblog.cloudflare.com%2F_emdash%2Fapi%2Fmedia%2Ffile%2F01KZ9Z8A1TZBWVWDT3XZQR7AB1.png&amp;w=1430&amp;h=734&amp;f=webp&amp;fit=cover&amp;position=center 1430w" alt="BLOG-3466 9.png" loading="lazy" decoding="async" data-image-placeholder-media="true" data-lightbox-src="/_image?href=https%3A%2F%2Fblog.cloudflare.com%2F_emdash%2Fapi%2Fmedia%2Ffile%2F01KZ9Z8A1TZBWVWDT3XZQR7AB1.png&amp;w=1920&amp;h=986&amp;f=webp" data-lightbox-width="1920" data-lightbox-height="986" data-astro-cid-7nvefuv6="true" sizes="(min-width: 715px) 715px, 100vw" data-astro-image="constrained" data-astro-image-fit="cover" data-astro-image-pos="center" width="715" height="367"></p></figure>

值得注意的是，对智能体重要的浏览器部分（如 CSS、DOM、HTML、selection、SVG 和 XHR）已经有了不错的覆盖率。即使是像 streams 这样在智能体场景下可能不那么重要的东西，现在也有了像样的支持。

<figure data-astro-cid-7nvefuv6=""><p><img src="https://blog.cloudflare.com/_image?href=https%3A%2F%2Fblog.cloudflare.com%2F_emdash%2Fapi%2Fmedia%2Ffile%2F01KZ9Z8AF7AB8HWYJJ0DZCRK5X.png&amp;w=715&amp;h=584&amp;f=webp&amp;fit=cover&amp;position=center" srcset="https://blog.cloudflare.com/_image?href=https%3A%2F%2Fblog.cloudflare.com%2F_emdash%2Fapi%2Fmedia%2Ffile%2F01KZ9Z8AF7AB8HWYJJ0DZCRK5X.png&amp;w=640&amp;h=523&amp;f=webp&amp;fit=cover&amp;position=center 640w, https://blog.cloudflare.com/_image?href=https%3A%2F%2Fblog.cloudflare.com%2F_emdash%2Fapi%2Fmedia%2Ffile%2F01KZ9Z8AF7AB8HWYJJ0DZCRK5X.png&amp;w=715&amp;h=584&amp;f=webp&amp;fit=cover&amp;position=center 715w, https://blog.cloudflare.com/_image?href=https%3A%2F%2Fblog.cloudflare.com%2F_emdash%2Fapi%2Fmedia%2Ffile%2F01KZ9Z8AF7AB8HWYJJ0DZCRK5X.png&amp;w=750&amp;h=613&amp;f=webp&amp;fit=cover&amp;position=center 750w, https://blog.cloudflare.com/_image?href=https%3A%2F%2Fblog.cloudflare.com%2F_emdash%2Fapi%2Fmedia%2Ffile%2F01KZ9Z8AF7AB8HWYJJ0DZCRK5X.png&amp;w=828&amp;h=676&amp;f=webp&amp;fit=cover&amp;position=center 828w, https://blog.cloudflare.com/_image?href=https%3A%2F%2Fblog.cloudflare.com%2F_emdash%2Fapi%2Fmedia%2Ffile%2F01KZ9Z8AF7AB8HWYJJ0DZCRK5X.png&amp;w=1080&amp;h=882&amp;f=webp&amp;fit=cover&amp;position=center 1080w, https://blog.cloudflare.com/_image?href=https%3A%2F%2Fblog.cloudflare.com%2F_emdash%2Fapi%2Fmedia%2Ffile%2F01KZ9Z8AF7AB8HWYJJ0DZCRK5X.png&amp;w=1280&amp;h=1045&amp;f=webp&amp;fit=cover&amp;position=center 1280w, https://blog.cloudflare.com/_image?href=https%3A%2F%2Fblog.cloudflare.com%2F_emdash%2Fapi%2Fmedia%2Ffile%2F01KZ9Z8AF7AB8HWYJJ0DZCRK5X.png&amp;w=1430&amp;h=1168&amp;f=webp&amp;fit=cover&amp;position=center 1430w" alt="BLOG-3466 10.png" loading="lazy" decoding="async" data-image-placeholder-media="true" data-lightbox-src="/_image?href=https%3A%2F%2Fblog.cloudflare.com%2F_emdash%2Fapi%2Fmedia%2Ffile%2F01KZ9Z8AF7AB8HWYJJ0DZCRK5X.png&amp;w=1838&amp;h=1502&amp;f=webp" data-lightbox-width="1838" data-lightbox-height="1502" data-astro-cid-7nvefuv6="true" sizes="(min-width: 715px) 715px, 100vw" data-astro-image="constrained" data-astro-image-fit="cover" data-astro-image-pos="center" width="715" height="584"></p></figure>

性能方面，Kitesurf 表现相当不错。下面是五次 Browser Run [quick-action](https://developers.cloudflare.com/browser-run/quick-actions/) 运行在 [14 个 URL 语料](https://kitesurf.cloudflare.app/corpus.txt)上的中位数，对比 Chromium 与 Kitesurf。

**指标**

**Kitesurf**

**Chromium（预热池）**

**Kitesurf 相对值**

CPU：截图

380 ms

1,173 ms

CPU 消耗比 Chromium 少 3.1×

CPU：HTML 提取

229 ms

877 ms

CPU 消耗比 Chromium 少 3.8×

内存：截图

57.8 MiB

271.0 MiB

内存消耗比 Chromium 少 4.7×

内存：HTML 提取

39.4 MiB

273.7 MiB

内存消耗比 Chromium 少 7.0×

墙钟时间：截图

1,148 ms

637 ms

比 Chromium 慢 1.8×

墙钟时间：HTML 提取

820 ms

472 ms

比 Chromium 慢 1.7×

秒表之争是 Chromium 赢了，因为一个已经见过这个页面的 [JIT](https://en.wikipedia.org/wiki/Just-in-time_compilation) 总能打败冷启动的软件渲染器——而且今天它确实做到了，大约快 1.7 倍。这个差距大部分来自栅格化以及 JPEG/PNG 编码，我们会持续优化。

但在真正决定你账单的内存和 CPU 上，Kitesurf 比 Chromium 省了 3–7 倍。更少的内存意味着我们可以运行更多会话、更好地扩展，并从根本上同时降低我们的成本和你的成本。

### 最重要的测试：Kitesurf 跑起了 Doom

我们在设计决策中强调了测试的重要性，但众所周知，无论你有多少测试，一个项目只有跑起 Doom 才算真正完成。下面就是 Kitesurf 运行我们几年前那个小 Doom [实验](https://blog.cloudflare.com/doom-multiplayer-workers/)里的 [https://silentspacemarine.com/](https://silentspacemarine.com/) 的画面。

<div class="video-wrap" style="position:relative;width:100%;padding-top:74.63%;margin:1.2rem 0;border-radius:10px;overflow:hidden;background:#000"><iframe src="https://customer-eq7kiuol0tk9chox.cloudflarestream.com/d0e3d78d3f2135f2a0f42cb6a882d110/iframe?preload=true&amp;loop=true&amp;autoplay=true&amp;poster=https%3A%2F%2Fcustomer-eq7kiuol0tk9chox.cloudflarestream.com%2Fd0e3d78d3f2135f2a0f42cb6a882d110%2Fthumbnails%2Fthumbnail.jpg%3Ftime%3D%26height%3D600" loading="lazy" style="border:none;position:absolute;top:0;left:0;height:100%;width:100%" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen="true"></iframe></div>

### 今天就在 Browser Run 里试试

你现在就可以在 Browser Run 中试用 Kitesurf，**beta 期间免费**，受每账户[限额](https://developers.cloudflare.com/browser-run/limits/)约束。

[Browser Run CDP 端点](https://developers.cloudflare.com/browser-run/cdp/)现在支持将 Kitesurf 作为选项，所以你现有的客户端 [Puppeteer](https://developers.cloudflare.com/browser-run/puppeteer/)、[Playwright](https://playwright.dev/)、[chrome-remote-interface](https://www.npmjs.com/package/chrome-remote-interface)，或任何会说 MCP 和 CDP 的 AI 智能体，都已经可以直接使用。你只需在我们的端点上加上 `browser=kitesurf` 参数。

例如，要在 Opencode 中使用 Kitesurf，请参阅我们开发者文档中的 [Using with MCP clients (CDP)](https://developers.cloudflare.com/browser-run/cdp/mcp-clients/)，并使用以下配置：

```jsx
{
  "mcp": {
    "kitesurf": {
      "type": "local",
      "command": [
        "npx",
        "-y",
        "chrome-devtools-mcp@latest",
        "--wsEndpoint=wss://api.cloudflare.com/client/v4/accounts/<ACCOUNT_ID>/browser-run/devtools/browser?browser=kitesurf",
        "--wsHeaders={\"Authorization\":\"Bearer <API_TOKEN>\"}"
      ],
      "enabled": true
    }
  }
}
```

另一种使用 Kitesurf 的方式是 [Browser Run 的 Quick Actions](https://developers.cloudflare.com/browser-run/quick-actions/)。同样，只需在 quick action 端点上加上 `browser=kitesurf` 即可。例如，如果你想快速截取一张 Wikipedia 的截图，这样就能搞定：

```jsx
curl -X POST 'https://api.cloudflare.com/client/v4/accounts/<accountId>/browser-run/screenshot?browser=kitesurf' \
  -H 'Authorization: Bearer <apiToken>' \
  -H 'Content-Type: application/json' \
  -d '{
    "url": "https://example.com"
  }' \
  --output "screenshot.png"
```

**配合 Chrome DevTools 使用 Kitesurf Playground**

另一个开始探索 Kitesurf 的选项是使用我们的[公开 playground](https://kitesurf.cloudflare.app/)。你可以输入任意 URL，看看 Kitesurf 如何渲染页面并与之交互。

playground 一个有趣的特性是我们在 UI 中注入了 Chrome DevTools，因此你可以在 Kitesurf 渲染页面时检查展开后的 DOM 元素、阅读控制台消息并观察网络活动。更有意思的是，我们实现了 [Memory 面板](https://developer.chrome.com/docs/devtools/memory)所需的 CDP 指令，用于报告每个 isolate（包括 frames）的 WebAssembly 占用，让你清楚了解每个页面消耗的资源。

<figure data-astro-cid-7nvefuv6=""><p><img src="https://blog.cloudflare.com/_image?href=https%3A%2F%2Fblog.cloudflare.com%2F_emdash%2Fapi%2Fmedia%2Ffile%2F01KZ9Z8AT4Q5YVBA4A3HPFSQGB.png&amp;w=715&amp;h=518&amp;f=webp&amp;fit=cover&amp;position=center" srcset="https://blog.cloudflare.com/_image?href=https%3A%2F%2Fblog.cloudflare.com%2F_emdash%2Fapi%2Fmedia%2Ffile%2F01KZ9Z8AT4Q5YVBA4A3HPFSQGB.png&amp;w=640&amp;h=464&amp;f=webp&amp;fit=cover&amp;position=center 640w, https://blog.cloudflare.com/_image?href=https%3A%2F%2Fblog.cloudflare.com%2F_emdash%2Fapi%2Fmedia%2Ffile%2F01KZ9Z8AT4Q5YVBA4A3HPFSQGB.png&amp;w=715&amp;h=518&amp;f=webp&amp;fit=cover&amp;position=center 715w, https://blog.cloudflare.com/_image?href=https%3A%2F%2Fblog.cloudflare.com%2F_emdash%2Fapi%2Fmedia%2Ffile%2F01KZ9Z8AT4Q5YVBA4A3HPFSQGB.png&amp;w=750&amp;h=543&amp;f=webp&amp;fit=cover&amp;position=center 750w, https://blog.cloudflare.com/_image?href=https%3A%2F%2Fblog.cloudflare.com%2F_emdash%2Fapi%2Fmedia%2Ffile%2F01KZ9Z8AT4Q5YVBA4A3HPFSQGB.png&amp;w=828&amp;h=600&amp;f=webp&amp;fit=cover&amp;position=center 828w, https://blog.cloudflare.com/_image?href=https%3A%2F%2Fblog.cloudflare.com%2F_emdash%2Fapi%2Fmedia%2Ffile%2F01KZ9Z8AT4Q5YVBA4A3HPFSQGB.png&amp;w=1080&amp;h=782&amp;f=webp&amp;fit=cover&amp;position=center 1080w, https://blog.cloudflare.com/_image?href=https%3A%2F%2Fblog.cloudflare.com%2F_emdash%2Fapi%2Fmedia%2Ffile%2F01KZ9Z8AT4Q5YVBA4A3HPFSQGB.png&amp;w=1280&amp;h=927&amp;f=webp&amp;fit=cover&amp;position=center 1280w, https://blog.cloudflare.com/_image?href=https%3A%2F%2Fblog.cloudflare.com%2F_emdash%2Fapi%2Fmedia%2Ffile%2F01KZ9Z8AT4Q5YVBA4A3HPFSQGB.png&amp;w=1430&amp;h=1036&amp;f=webp&amp;fit=cover&amp;position=center 1430w" alt="BLOG-3466 12.png" loading="lazy" decoding="async" data-image-placeholder-media="true" data-lightbox-src="/_image?href=https%3A%2F%2Fblog.cloudflare.com%2F_emdash%2Fapi%2Fmedia%2Ffile%2F01KZ9Z8AT4Q5YVBA4A3HPFSQGB.png&amp;w=1920&amp;h=1391&amp;f=webp" data-lightbox-width="1920" data-lightbox-height="1391" data-astro-cid-7nvefuv6="true" sizes="(min-width: 715px) 715px, 100vw" data-astro-image="constrained" data-astro-image-fit="cover" data-astro-image-pos="center" width="715" height="518"></p></figure>

关于如何在 Browser Run 中使用 Kitesurf 的全部细节，请查阅我们的[开发者文档](https://developers.cloudflare.com/browser-run/)。

### 什么时候 Kitesurf 更合适？

截至目前，Kitesurf 能正确渲染 [TodoMVC](https://todomvc.com/)（vanilla、React、Vue、Angular、Preact）、Wikipedia、Hacker News、Cloudflare Blog 以及 Cloudflare dashboard 的大部分页面。我们将持续改进 Kitesurf，提高 WPT 测试通过率，以提升对更复杂网页的兼容性。

<div class="video-wrap" style="position:relative;width:100%;padding-top:74.63%;margin:1.2rem 0;border-radius:10px;overflow:hidden;background:#000"><iframe src="https://customer-eq7kiuol0tk9chox.cloudflarestream.com/87f957139f360dbd005c4538510eb152/iframe?preload=true&amp;loop=true&amp;autoplay=true&amp;poster=https%3A%2F%2Fcustomer-eq7kiuol0tk9chox.cloudflarestream.com%2F87f957139f360dbd005c4538510eb152%2Fthumbnails%2Fthumbnail.jpg%3Ftime%3D%26height%3D600" loading="lazy" style="border:none;position:absolute;top:0;left:0;height:100%;width:100%" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen="true"></iframe></div>

Kitesurf 非常适合需要渲染页面、但能接受不使用功能完整、像素级完美的 Chromium 这一取舍的 AI 智能体。对于依赖一次性 [Quick Actions](https://developers.cloudflare.com/browser-run/quick-actions/)（如从页面提取内容或生成 PDF、截图）且站点兼容的自动化和应用来说，它同样出色。

可以把 Kitesurf 想象成一个临时的、完全隔离的、无状态的引擎，只为一个任务存续期间而存在，并且能在突发的、AI 驱动的工作负载下良好扩展。

### Kitesurf 暂时还做不到什么

如果你需要播放视频、渲染 WebGL、用真实 TLS 指纹协商 bot 挑战握手，或者启动一个需要持久状态的十分钟认证会话——Kitesurf 目前还不是合适的选择。直接用 Browser Run 的默认选项（由 Chromium 驱动）即可。

判断某个站点是否兼容 Kitesurf 的最好办法就是试试看。你可以通过 API 来试，或者更快一点，在我们的[公开 playground](https://kitesurf.cloudflare.app/) 里试。

探索 DevTools 各面板，看看幕后发生了什么，尤其注意控制台和内存指标。

### 未来方向

Kitesurf 只有十二周大。第一次提交是在五月。以下是我们正在积极推进的一些事项：

*   **更完善的 CDP 覆盖。** Kitesurf 实现了 CDP 协议的一个子集——足以覆盖大多数智能体和自动化工具的需求，包括稳健的 DOM 和网络检查——我们会继续扩展其能力，力求尽可能完整。
*   **渲染保真度**，针对截图和 PDF，因为我们知道 LLM 常常能从图像中获得比底层文本更好的效果。
*   **WPT 覆盖率。** 我们正在快速迭代，在 Kitesurf 走向生产就绪的路上增加更多 Web API、通过更多 WPT 测试。
*   **效率。** 我们始终在跑 CPU、内存和墙钟时间基准，并与开发者平台的其他团队紧密合作，让 Kitesurf 尽可能经济高效。

## 结语

感谢你读到这里——我们知道这是一篇又长又硬核的技术博客，但希望它足够有趣。我们写得如此详细，是因为我们深知打造一款新浏览器有多重要，又多复杂，哪怕它是一款非常专用的浏览器。

Kitesurf 还处于早期阶段，但我们想尽快把它开放给你，并从你的反馈中学习。团队将持续以高频更新积极改进它，重点聚焦性能、效率和兼容性。

最后一件事：等我们准备好后，会开源 Kitesurf——希望很快。我们的目标是，如果客户愿意，任何人都能把自己的 Kitesurf 版本部署到自己的账户上。

那么，去 [playground](https://kitesurf.cloudflare.app/) 试试吧，关注我们的 [changelog](https://developers.cloudflare.com/browser-run/changelog/)，并来 [Discord](https://discord.com/invite/cloudflaredev) 和团队聊聊。分享你的体验、给我们反馈；我们一直都在听。
