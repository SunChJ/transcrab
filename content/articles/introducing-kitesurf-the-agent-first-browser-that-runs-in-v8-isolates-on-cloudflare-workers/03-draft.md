# 隆重推出 Kitesurf：在 Cloudflare Workers 的 V8 隔离实例中运行、以智能体为先的浏览器

我们该打造自己的浏览器吗？多年来，这个问题每隔几个月就会在 Cloudflare 内部出现一次。不出所料，它总会引发长篇讨论，大家列出各种理由，用颇具说服力的论据说明我们为什么应该这么做。浏览器显然是我们每天在电脑上使用的最重要的软件；甚至可以说，它就是互联网的操作系统。Cloudflare 的使命是帮助[构建更好的互联网](https://www.cloudflare.com/about-overview/)——谁会不想接受打造一款新浏览器的挑战呢？

但我们始终没能在这项工作的技术难度与它能解决的独特问题之间找到平衡。于是，这个想法一次又一次被束之高阁。直到现在。

奇妙的事情发生了：我们的[开发者平台](https://developers.cloudflare.com/)迎来了一系列强大技术进展，并跨过了关键临界点；与此同时，AI 智能体开始兴起，对一种新型浏览器的需求也变得至关重要。

如今，在 Workers 中运行 [WebAssembly（Wasm）](https://developers.cloudflare.com/workers/runtime-apis/webassembly/)的技术已经非常成熟。[Dynamic Workers](https://developers.cloudflare.com/dynamic-workers/)、[基于 SQLite 的 Durable Objects](https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/)、[Worker 间 RPC](https://developers.cloudflare.com/workers/runtime-apis/rpc/)、[Service Bindings](https://developers.cloudflare.com/workers/runtime-apis/bindings/service-bindings/)，以及更高的 [Node.js 兼容性](https://developers.cloudflare.com/workers/runtime-apis/nodejs/)和更宽松的[限制](https://developers.cloudflare.com/workers/platform/limits/)，都为更具雄心、更加复杂的应用打开了大门——这些应用过去根本无法实现。

随着 AI 兴起，我们的无头浏览器自动化 API 产品 [Browser Run](https://developers.cloudflare.com/browser-run/) 也取得了惊人的增长。智能体需要借助浏览器来完成许多任务；很多时候，没有浏览器，它们就无法成功。

但问题也随之而来：Chromium 之类的浏览器引擎是为人类而非智能体打造的，其中包含 AI 模型根本不需要的额外开销。它们消耗大量内存与算力，为每个智能体分别提供一个实例的成本高得难以承受。这使得 Web 的很大一部分只有参数知识更多、最先进也最昂贵的 AI 模型才有能力使用，同时将许多其他智能体应用拒之门外。

我们应该为*所有*智能体提供一款浏览器：它要擅长 AI 模型真正看重的事情，哪怕因此精简掉那些只对人类有用的能力。例如：

*   AI 不在乎标签页、主题、浏览器扩展或跨设备同步。它在乎的是 token 数量、上下文窗口、可扩展性、性能和成本。
*   结构化、机器可读的内容很重要，但完美的视觉效果和流畅的 60 fps 滚动并不重要。即便 CSS 解析略有偏差，或渲染没有做到像素级完美，智能体也完全可以接受。
*   AI 使用浏览器时面对的威胁模型有所不同。提示词注入和工具安全等新问题才是最高优先级。

意识到这些之后，12 周前我们再次问自己：我们该打造自己的浏览器吗？这一次，答案全票通过：**是的！**

今天，我们正式发布 **Kitesurf**：一款专为智能体打造、**完全运行在 Workers 之上**的新浏览器。测试期间可在 [Browser Run](https://developers.cloudflare.com/browser-run/) 中免费使用。

在截图和 HTML 提取等常见智能体任务中，Kitesurf 的 CPU 与内存使用效率显著高于 Chromium。接下来，我们将讲述它的诞生过程。系好安全带，下面的内容会很技术——但我们保证，它同样有趣。

## 起点

和 Cloudflare 的许多绝妙创意一样，Kitesurf 的故事始于某个人发现了一件有趣的事。转眼之间，他就用一个看似不可能、却极具吸引力的点子对团队其他人完成了一次“技术狙击”。

最初的灵感来自 [obscura](https://github.com/h4ckf0r0day/obscura)：一个用 Rust 编写、面向 AI 自动化的无头引擎，号称“没有 Chrome、没有 Node.js、没有依赖”。

<figure data-astro-cid-7nvefuv6=""><p><img src="https://blog.cloudflare.com/_image?href=https%3A%2F%2Fblog.cloudflare.com%2F_emdash%2Fapi%2Fmedia%2Ffile%2F01KZBKVDEMTPBSVB5R6APWE6BN.png&amp;w=715&amp;h=550&amp;f=webp&amp;fit=cover&amp;position=center" srcset="https://blog.cloudflare.com/_image?href=https%3A%2F%2Fblog.cloudflare.com%2F_emdash%2Fapi%2Fmedia%2Ffile%2F01KZBKVDEMTPBSVB5R6APWE6BN.png&amp;w=640&amp;h=492&amp;f=webp&amp;fit=cover&amp;position=center 640w, https://blog.cloudflare.com/_image?href=https%3A%2F%2Fblog.cloudflare.com%2F_emdash%2Fapi%2Fmedia%2Ffile%2F01KZBKVDEMTPBSVB5R6APWE6BN.png&amp;w=715&amp;h=550&amp;f=webp&amp;fit=cover&amp;position=center 715w, https://blog.cloudflare.com/_image?href=https%3A%2F%2Fblog.cloudflare.com%2F_emdash%2Fapi%2Fmedia%2Ffile%2F01KZBKVDEMTPBSVB5R6APWE6BN.png&amp;w=750&amp;h=577&amp;f=webp&amp;fit=cover&amp;position=center 750w, https://blog.cloudflare.com/_image?href=https%3A%2F%2Fblog.cloudflare.com%2F_emdash%2Fapi%2Fmedia%2Ffile%2F01KZBKVDEMTPBSVB5R6APWE6BN.png&amp;w=828&amp;h=637&amp;f=webp&amp;fit=cover&amp;position=center 828w, https://blog.cloudflare.com/_image?href=https%3A%2F%2Fblog.cloudflare.com%2F_emdash%2Fapi%2Fmedia%2Ffile%2F01KZBKVDEMTPBSVB5R6APWE6BN.png&amp;w=1080&amp;h=831&amp;f=webp&amp;fit=cover&amp;position=center 1080w, https://blog.cloudflare.com/_image?href=https%3A%2F%2Fblog.cloudflare.com%2F_emdash%2Fapi%2Fmedia%2Ffile%2F01KZBKVDEMTPBSVB5R6APWE6BN.png&amp;w=1280&amp;h=985&amp;f=webp&amp;fit=cover&amp;position=center 1280w, https://blog.cloudflare.com/_image?href=https%3A%2F%2Fblog.cloudflare.com%2F_emdash%2Fapi%2Fmedia%2Ffile%2F01KZBKVDEMTPBSVB5R6APWE6BN.png&amp;w=1430&amp;h=1100&amp;f=webp&amp;fit=cover&amp;position=center 1430w" alt="unnamed.png" loading="lazy" decoding="async" data-image-placeholder-media="true" data-lightbox-src="/_image?href=https%3A%2F%2Fblog.cloudflare.com%2F_emdash%2Fapi%2Fmedia%2Ffile%2F01KZBKVDEMTPBSVB5R6APWE6BN.png&amp;w=1920&amp;h=1476&amp;f=webp" data-lightbox-width="1920" data-lightbox-height="1476" data-astro-cid-7nvefuv6="true" sizes="(min-width: 715px) 715px, 100vw" data-astro-image="constrained" data-astro-image-fit="cover" data-astro-image-pos="center" width="715" height="550"></p></figure>

随后，我们借助一个 AI 智能体，尝试把它移植到 Workers。起初效果并不好。但当我们为 AI 提供了扎实的计划和清晰的成功标准——具体到足以让智能体不断循环，并在需要时提问——它真的跑起来了。  
这个勉强能用的概念验证让我们大为震撼，于是决定放手让团队大展身手。

### 设计决策

在正式动手之前，我们做出了以下几项设计决策。

**测试、测试、还是测试**

我们知道，要把原型变成一款真正可用、能够在生产环境中大规模执行任务的完整浏览器，需要大量工作和反复迭代。不可否认，利用 AI 加速这个过程至关重要。但在如此复杂的项目中，怎样才能既用 AI 保持开发速度，又控制好代码与结果的质量？答案是：提供尽可能多的测试。

于是我们采用了 [Web Platform Tests](https://github.com/web-platform-tests/wpt)（WPT），这几乎是理想配置：这套庞大的成功标准测试集为 AI 智能体提供了清晰的目标，用于评估各项功能是否符合规范。我们精心挑选要分配给智能体的功能并安排顺序，让人类可以专注于架构工作，以及审查智能体采用的方案。

不过，WPT 的能力也有边界：它们衡量的是对 [W3C](https://www.w3.org/) 标准的符合程度，而不是浏览器渲染真实网站并与之交互的能力。为了弥合这道鸿沟，我们结合了集成测试与视觉回归测试：在真实网站上分别针对 Chromium 和 Kitesurf 运行多步骤 [Puppeteer](https://pptr.dev/) 测试，不仅比较测试断言，还会渲染每一步的输出，从而突出显示任何非预期差异。

**尽可能使用 Rust**

Cloudflare 长期致力于在 Workers 中为 [WebAssembly（Wasm）](https://developers.cloudflare.com/workers/runtime-apis/webassembly/)提供出色支持。这样一来，我们便能使用高性能的 C、C++ 和 Rust 软件包，并将其编译为 Wasm。若使用 Emscripten 等工具及其层层模拟的依赖，编译产物可能变得臃肿而缓慢。

因此，我们决定尽可能使用原生 Rust，并通过 [wasm-bindgen](https://developers.cloudflare.com/workers/languages/rust/#javascript-plumbing-wasm-bindgen) 直接编译为 WebAssembly，从而避开不必要的模拟层，以尽可能接近硬件的方式[可靠运行](https://blog.cloudflare.com/making-rust-workers-reliable/)。

**异常处理**

浏览器必须渲染整个不可靠、甚至有时充满恶意的 Web，同时绝不能丢掉当前承载的页面。因此，异常处理不只是代码卫生问题，更是应用如何在面对错误输入时存活下来，而不是直接崩溃的关键。

所以我们一开始就定下一条规则：任何故障都只能降级为空白帧或缺失的元素，绝不能导致会话死亡。在每个边界捕获故障，默认返回安全的空结果，并记录足够的信息用于诊断。

**隔离**

在笔记本电脑上使用浏览器时，你通常访问的是自己信任的网站，站点之间共享一些资源也可以接受；智能体则不同，它会被派往任务要求的任何地方，面对来自任意源的任意代码。

因此，我们在构建这款浏览器时假定：每次加载的页面都是不可信输入，每个会话都从全新状态开始。所有组件彼此隔离，并且只能访问完成自身功能所严格必需的资源。

<figure data-astro-cid-7nvefuv6=""><p><img src="https://blog.cloudflare.com/_image?href=https%3A%2F%2Fblog.cloudflare.com%2F_emdash%2Fapi%2Fmedia%2Ffile%2F01KZ9Z89XF1C6TRP798HF5XRCW.png&amp;w=715&amp;h=205&amp;f=webp&amp;fit=cover&amp;position=center" srcset="https://blog.cloudflare.com/_image?href=https%3A%2F%2Fblog.cloudflare.com%2F_emdash%2Fapi%2Fmedia%2Ffile%2F01KZ9Z89XF1C6TRP798HF5XRCW.png&amp;w=640&amp;h=183&amp;f=webp&amp;fit=cover&amp;position=center 640w, https://blog.cloudflare.com/_image?href=https%3A%2F%2Fblog.cloudflare.com%2F_emdash%2Fapi%2Fmedia%2Ffile%2F01KZ9Z89XF1C6TRP798HF5XRCW.png&amp;w=715&amp;h=205&amp;f=webp&amp;fit=cover&amp;position=center 715w, https://blog.cloudflare.com/_image?href=https%3A%2F%2Fblog.cloudflare.com%2F_emdash%2Fapi%2Fmedia%2Ffile%2F01KZ9Z89XF1C6TRP798HF5XRCW.png&amp;w=750&amp;h=215&amp;f=webp&amp;fit=cover&amp;position=center 750w, https://blog.cloudflare.com/_image?href=https%3A%2F%2Fblog.cloudflare.com%2F_emdash%2Fapi%2Fmedia%2Ffile%2F01KZ9Z89XF1C6TRP798HF5XRCW.png&amp;w=828&amp;h=237&amp;f=webp&amp;fit=cover&amp;position=center 828w, https://blog.cloudflare.com/_image?href=https%3A%2F%2Fblog.cloudflare.com%2F_emdash%2Fapi%2Fmedia%2Ffile%2F01KZ9Z89XF1C6TRP798HF5XRCW.png&amp;w=1080&amp;h=310&amp;f=webp&amp;fit=cover&amp;position=center 1080w, https://blog.cloudflare.com/_image?href=https%3A%2F%2Fblog.cloudflare.com%2F_emdash%2Fapi%2Fmedia%2Ffile%2F01KZ9Z89XF1C6TRP798HF5XRCW.png&amp;w=1280&amp;h=367&amp;f=webp&amp;fit=cover&amp;position=center 1280w, https://blog.cloudflare.com/_image?href=https%3A%2F%2Fblog.cloudflare.com%2F_emdash%2Fapi%2Fmedia%2Ffile%2F01KZ9Z89XF1C6TRP798HF5XRCW.png&amp;w=1430&amp;h=410&amp;f=webp&amp;fit=cover&amp;position=center 1430w" alt="BLOG-3466 3.png" loading="lazy" decoding="async" data-image-placeholder-media="true" data-lightbox-src="/_image?href=https%3A%2F%2Fblog.cloudflare.com%2F_emdash%2Fapi%2Fmedia%2Ffile%2F01KZ9Z89XF1C6TRP798HF5XRCW.png&amp;w=1920&amp;h=549&amp;f=webp" data-lightbox-width="1920" data-lightbox-height="549" data-astro-cid-7nvefuv6="true" sizes="(min-width: 715px) 715px, 100vw" data-astro-image="constrained" data-astro-image-fit="cover" data-astro-image-pos="center" width="715" height="205"></p></figure>

这看起来与 Cloudflare Workers 堪称绝配，因为它的[安全模型](https://developers.cloudflare.com/workers/reference/security-model/#isolation)在设计上就以隔离为基础。但平台只能为我们提供隔离实例之间的边界。我们仍须在应用层贯彻同一原则：决定每个组件可以接触什么，并确保不该跨页面泄露的内容绝不会泄露。

**尽可能保持无状态**

状态会让故障变得昂贵——如果没有任何东西需要重建，那么从崩溃中恢复只需启动一个新实例并重放请求。无状态组件天生即可随时丢弃、并行运行：一旦停滞就将其终止，同时运行一千个也无妨；按需调整规模，而不必维持预热状态。这与自动化任务完美契合：负载往往突发到来，最经济的做法就是启动工作单元，只为实际用量付费，并让它在完成后消失。简而言之，**只要组件可以无状态，就应该无状态**。

## 我们如何构建 Kitesurf

有了完善的计划、大量测试和良好的工具环境，我们终于可以越过最初的概念验证，正式开始构建。下面是 Kitesurf 从那时沿用至今、非常高层次的请求生命周期：

<figure data-astro-cid-7nvefuv6=""><p><img src="https://blog.cloudflare.com/_image?href=https%3A%2F%2Fblog.cloudflare.com%2F_emdash%2Fapi%2Fmedia%2Ffile%2F01KZ9Z8A7NX68CP9DHW93JAHJX.png&amp;w=715&amp;h=497&amp;f=webp&amp;fit=cover&amp;position=center" srcset="https://blog.cloudflare.com/_image?href=https%3A%2F%2Fblog.cloudflare.com%2F_emdash%2Fapi%2Fmedia%2Ffile%2F01KZ9Z8A7NX68CP9DHW93JAHJX.png&amp;w=640&amp;h=445&amp;f=webp&amp;fit=cover&amp;position=center 640w, https://blog.cloudflare.com/_image?href=https%3A%2F%2Fblog.cloudflare.com%2F_emdash%2Fapi%2Fmedia%2Ffile%2F01KZ9Z8A7NX68CP9DHW93JAHJX.png&amp;w=715&amp;h=497&amp;f=webp&amp;fit=cover&amp;position=center 715w, https://blog.cloudflare.com/_image?href=https%3A%2F%2Fblog.cloudflare.com%2F_emdash%2Fapi%2Fmedia%2Ffile%2F01KZ9Z8A7NX68CP9DHW93JAHJX.png&amp;w=750&amp;h=521&amp;f=webp&amp;fit=cover&amp;position=center 750w, https://blog.cloudflare.com/_image?href=https%3A%2F%2Fblog.cloudflare.com%2F_emdash%2Fapi%2Fmedia%2Ffile%2F01KZ9Z8A7NX68CP9DHW93JAHJX.png&amp;w=828&amp;h=576&amp;f=webp&amp;fit=cover&amp;position=center 828w, https://blog.cloudflare.com/_image?href=https%3A%2F%2Fblog.cloudflare.com%2F_emdash%2Fapi%2Fmedia%2Ffile%2F01KZ9Z8A7NX68CP9DHW93JAHJX.png&amp;w=1080&amp;h=751&amp;f=webp&amp;fit=cover&amp;position=center 1080w, https://blog.cloudflare.com/_image?href=https%3A%2F%2Fblog.cloudflare.com%2F_emdash%2Fapi%2Fmedia%2Ffile%2F01KZ9Z8A7NX68CP9DHW93JAHJX.png&amp;w=1280&amp;h=890&amp;f=webp&amp;fit=cover&amp;position=center 1280w, https://blog.cloudflare.com/_image?href=https%3A%2F%2Fblog.cloudflare.com%2F_emdash%2Fapi%2Fmedia%2Ffile%2F01KZ9Z8A7NX68CP9DHW93JAHJX.png&amp;w=1430&amp;h=994&amp;f=webp&amp;fit=cover&amp;position=center 1430w" alt="BLOG-3466 4.png" loading="lazy" decoding="async" data-image-placeholder-media="true" data-lightbox-src="/_image?href=https%3A%2F%2Fblog.cloudflare.com%2F_emdash%2Fapi%2Fmedia%2Ffile%2F01KZ9Z8A7NX68CP9DHW93JAHJX.png&amp;w=1920&amp;h=1335&amp;f=webp" data-lightbox-width="1920" data-lightbox-height="1335" data-astro-cid-7nvefuv6="true" sizes="(min-width: 715px) 715px, 100vw" data-astro-image="constrained" data-astro-image-fit="cover" data-astro-image-pos="center" width="715" height="497"></p></figure>

接下来，让我们深入了解支撑 Kitesurf 运转的三个主要组件：Engine、PageScript 和 PageRenderer。

### 从源站获取资源

为了渲染不可信网页，浏览器必须从互联网上获取任意资源——图片、字体、CSS、JavaScript 和 Wasm 文件。这是浏览器能够执行的最危险操作之一。

Kitesurf 只通过一个组件执行此操作：SandboxOutbound Worker。借助 Dynamic Workers 的强制约束，其他任何组件都无法直接访问网络。Engine 用它来启动页面，获取主文档及其脚本；PageScript 则用它获取其余所有内容：样式表、图片、字体，以及页面自身发起的 `fetch()` 调用。

我们通过 SandboxOutbound 强制执行 [CORS](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/CORS)、注入符合浏览器特征的请求头、过滤响应，并将每个页面的 Cookie 分别保存在独立容器中。任何不符合策略的请求都会收到 403——每个组件只能获得它所需的确切网络访问能力，不多也不少。

<figure data-astro-cid-7nvefuv6=""><p><img src="https://blog.cloudflare.com/_image?href=https%3A%2F%2Fblog.cloudflare.com%2F_emdash%2Fapi%2Fmedia%2Ffile%2F01KZ9Z8AAR723T5KJCNQ547FAV.png&amp;w=715&amp;h=395&amp;f=webp&amp;fit=cover&amp;position=center" srcset="https://blog.cloudflare.com/_image?href=https%3A%2F%2Fblog.cloudflare.com%2F_emdash%2Fapi%2Fmedia%2Ffile%2F01KZ9Z8AAR723T5KJCNQ547FAV.png&amp;w=640&amp;h=354&amp;f=webp&amp;fit=cover&amp;position=center 640w, https://blog.cloudflare.com/_image?href=https%3A%2F%2Fblog.cloudflare.com%2F_emdash%2Fapi%2Fmedia%2Ffile%2F01KZ9Z8AAR723T5KJCNQ547FAV.png&amp;w=715&amp;h=395&amp;f=webp&amp;fit=cover&amp;position=center 715w, https://blog.cloudflare.com/_image?href=https%3A%2F%2Fblog.cloudflare.com%2F_emdash%2Fapi%2Fmedia%2Ffile%2F01KZ9Z8AAR723T5KJCNQ547FAV.png&amp;w=750&amp;h=414&amp;f=webp&amp;fit=cover&amp;position=center 750w, https://blog.cloudflare.com/_image?href=https%3A%2F%2Fblog.cloudflare.com%2F_emdash%2Fapi%2Fmedia%2Ffile%2F01KZ9Z8AAR723T5KJCNQ547FAV.png&amp;w=828&amp;h=457&amp;f=webp&amp;fit=cover&amp;position=center 828w, https://blog.cloudflare.com/_image?href=https%3A%2F%2Fblog.cloudflare.com%2F_emdash%2Fapi%2Fmedia%2Ffile%2F01KZ9Z8AAR723T5KJCNQ547FAV.png&amp;w=1080&amp;h=597&amp;f=webp&amp;fit=cover&amp;position=center 1080w, https://blog.cloudflare.com/_image?href=https%3A%2F%2Fblog.cloudflare.com%2F_emdash%2Fapi%2Fmedia%2Ffile%2F01KZ9Z8AAR723T5KJCNQ547FAV.png&amp;w=1280&amp;h=707&amp;f=webp&amp;fit=cover&amp;position=center 1280w, https://blog.cloudflare.com/_image?href=https%3A%2F%2Fblog.cloudflare.com%2F_emdash%2Fapi%2Fmedia%2Ffile%2F01KZ9Z8AAR723T5KJCNQ547FAV.png&amp;w=1430&amp;h=790&amp;f=webp&amp;fit=cover&amp;position=center 1430w" alt="BLOG-3466 5.png" loading="lazy" decoding="async" data-image-placeholder-media="true" data-lightbox-src="/_image?href=https%3A%2F%2Fblog.cloudflare.com%2F_emdash%2Fapi%2Fmedia%2Ffile%2F01KZ9Z8AAR723T5KJCNQ547FAV.png&amp;w=1920&amp;h=1060&amp;f=webp" data-lightbox-width="1920" data-lightbox-height="1060" data-astro-cid-7nvefuv6="true" sizes="(min-width: 715px) 715px, 100vw" data-astro-image="constrained" data-astro-image-fit="cover" data-astro-image-pos="center" width="715" height="395"></p></figure>

### Engine

Engine 是 Kitesurf 唯一面向外部的组件。它处理 Chrome DevTools Protocol（CDP）的 WebSocket 与 HTTP REST API，提供一个便于内部测试的着陆页；最重要的是，它还存储每个会话的状态。其他所有组件都是无状态的。

<figure data-astro-cid-7nvefuv6=""><p><img src="https://blog.cloudflare.com/_image?href=https%3A%2F%2Fblog.cloudflare.com%2F_emdash%2Fapi%2Fmedia%2Ffile%2F01KZ9Z8AHPEVW2VZK1VM59SZHW.png&amp;w=715&amp;h=457&amp;f=webp&amp;fit=cover&amp;position=center" srcset="https://blog.cloudflare.com/_image?href=https%3A%2F%2Fblog.cloudflare.com%2F_emdash%2Fapi%2Fmedia%2Ffile%2F01KZ9Z8AHPEVW2VZK1VM59SZHW.png&amp;w=640&amp;h=409&amp;f=webp&amp;fit=cover&amp;position=center 640w, https://blog.cloudflare.com/_image?href=https%3A%2F%2Fblog.cloudflare.com%2F_emdash%2Fapi%2Fmedia%2Ffile%2F01KZ9Z8AHPEVW2VZK1VM59SZHW.png&amp;w=715&amp;h=457&amp;f=webp&amp;fit=cover&amp;position=center 715w, https://blog.cloudflare.com/_image?href=https%3A%2F%2Fblog.cloudflare.com%2F_emdash%2Fapi%2Fmedia%2Ffile%2F01KZ9Z8AHPEVW2VZK1VM59SZHW.png&amp;w=750&amp;h=479&amp;f=webp&amp;fit=cover&amp;position=center 750w, https://blog.cloudflare.com/_image?href=https%3A%2F%2Fblog.cloudflare.com%2F_emdash%2Fapi%2Fmedia%2Ffile%2F01KZ9Z8AHPEVW2VZK1VM59SZHW.png&amp;w=828&amp;h=529&amp;f=webp&amp;fit=cover&amp;position=center 828w, https://blog.cloudflare.com/_image?href=https%3A%2F%2Fblog.cloudflare.com%2F_emdash%2Fapi%2Fmedia%2Ffile%2F01KZ9Z8AHPEVW2VZK1VM59SZHW.png&amp;w=1080&amp;h=690&amp;f=webp&amp;fit=cover&amp;position=center 1080w, https://blog.cloudflare.com/_image?href=https%3A%2F%2Fblog.cloudflare.com%2F_emdash%2Fapi%2Fmedia%2Ffile%2F01KZ9Z8AHPEVW2VZK1VM59SZHW.png&amp;w=1280&amp;h=818&amp;f=webp&amp;fit=cover&amp;position=center 1280w, https://blog.cloudflare.com/_image?href=https%3A%2F%2Fblog.cloudflare.com%2F_emdash%2Fapi%2Fmedia%2Ffile%2F01KZ9Z8AHPEVW2VZK1VM59SZHW.png&amp;w=1430&amp;h=914&amp;f=webp&amp;fit=cover&amp;position=center 1430w" alt="BLOG-3466 6.png" loading="lazy" decoding="async" data-image-placeholder-media="true" data-lightbox-src="/_image?href=https%3A%2F%2Fblog.cloudflare.com%2F_emdash%2Fapi%2Fmedia%2Ffile%2F01KZ9Z8AHPEVW2VZK1VM59SZHW.png&amp;w=1920&amp;h=1227&amp;f=webp" data-lightbox-width="1920" data-lightbox-height="1227" data-astro-cid-7nvefuv6="true" sizes="(min-width: 715px) 715px, 100vw" data-astro-image="constrained" data-astro-image-fit="cover" data-astro-image-pos="center" width="715" height="457"></p></figure>

使用 CDP 的优势在于客户端兼容性：[Puppeteer](https://developers.cloudflare.com/browser-run/puppeteer/)、Playwright、chrome-remote-interface，乃至真正的 Chrome DevTools 前端，都可以直接连接 Kitesurf 并正常工作。这也是 Browser Run 的[工作方式](https://developers.cloudflare.com/browser-run/cdp/)（稍后会进一步解释这点为什么重要）。

与名字给人的印象相反，Engine 其实是 Kitesurf 最简单的组件。真正有趣的部分还在后面。

### PageScript

PageScript 很好地展现了 Workers 新功能的强大之处——这里指的是 [Dynamic Workers](https://developers.cloudflare.com/dynamic-workers/)。在此之前，Kitesurf 根本不可能实现。

下面是一张 PageScript 内部工作方式的简化示意图。

<figure data-astro-cid-7nvefuv6=""><p><img src="https://blog.cloudflare.com/_image?href=https%3A%2F%2Fblog.cloudflare.com%2F_emdash%2Fapi%2Fmedia%2Ffile%2F01KZ9Z8A7714HEP695P6HKY8GD.png&amp;w=715&amp;h=324&amp;f=webp&amp;fit=cover&amp;position=center" srcset="https://blog.cloudflare.com/_image?href=https%3A%2F%2Fblog.cloudflare.com%2F_emdash%2Fapi%2Fmedia%2Ffile%2F01KZ9Z8A7714HEP695P6HKY8GD.png&amp;w=640&amp;h=290&amp;f=webp&amp;fit=cover&amp;position=center 640w, https://blog.cloudflare.com/_image?href=https%3A%2F%2Fblog.cloudflare.com%2F_emdash%2Fapi%2Fmedia%2Ffile%2F01KZ9Z8A7714HEP695P6HKY8GD.png&amp;w=715&amp;h=324&amp;f=webp&amp;fit=cover&amp;position=center 715w, https://blog.cloudflare.com/_image?href=https%3A%2F%2Fblog.cloudflare.com%2F_emdash%2Fapi%2Fmedia%2Ffile%2F01KZ9Z8A7714HEP695P6HKY8GD.png&amp;w=750&amp;h=340&amp;f=webp&amp;fit=cover&amp;position=center 750w, https://blog.cloudflare.com/_image?href=https%3A%2F%2Fblog.cloudflare.com%2F_emdash%2Fapi%2Fmedia%2Ffile%2F01KZ9Z8A7714HEP695P6HKY8GD.png&amp;w=828&amp;h=375&amp;f=webp&amp;fit=cover&amp;position=center 828w, https://blog.cloudflare.com/_image?href=https%3A%2F%2Fblog.cloudflare.com%2F_emdash%2Fapi%2Fmedia%2Ffile%2F01KZ9Z8A7714HEP695P6HKY8GD.png&amp;w=1080&amp;h=489&amp;f=webp&amp;fit=cover&amp;position=center 1080w, https://blog.cloudflare.com/_image?href=https%3A%2F%2Fblog.cloudflare.com%2F_emdash%2Fapi%2Fmedia%2Ffile%2F01KZ9Z8A7714HEP695P6HKY8GD.png&amp;w=1280&amp;h=580&amp;f=webp&amp;fit=cover&amp;position=center 1280w, https://blog.cloudflare.com/_image?href=https%3A%2F%2Fblog.cloudflare.com%2F_emdash%2Fapi%2Fmedia%2Ffile%2F01KZ9Z8A7714HEP695P6HKY8GD.png&amp;w=1430&amp;h=648&amp;f=webp&amp;fit=cover&amp;position=center 1430w" alt="BLOG-3466 7.png" loading="lazy" decoding="async" data-image-placeholder-media="true" data-lightbox-src="/_image?href=https%3A%2F%2Fblog.cloudflare.com%2F_emdash%2Fapi%2Fmedia%2Ffile%2F01KZ9Z8A7714HEP695P6HKY8GD.png&amp;w=1920&amp;h=869&amp;f=webp" data-lightbox-width="1920" data-lightbox-height="869" data-astro-cid-7nvefuv6="true" sizes="(min-width: 715px) 715px, 100vw" data-astro-image="constrained" data-astro-image-fit="cover" data-astro-image-pos="center" width="715" height="324"></p></figure>

每个新页面或进程外 iframe（[OOPIF](https://www.chromium.org/developers/design-documents/oop-iframes/)）都会使用 Dynamic Workers 启动一个长生命周期的 PageScript 隔离实例来处理页面会话；其中包含一个干净的 [globalThis](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/globalThis)，以及 [DOM](https://developer.mozilla.org/en-US/docs/Web/API/Document_Object_Model) 文档对象。

随后，DOM 对象会填入解析 HTML 文档并执行全部 JavaScript 脚本所得的结果。解析 HTML 和 CSS 时，我们使用了模块化渲染引擎 [Blitz](https://github.com/DioxusLabs/blitz) 的部分组件，以及 Firefox 用 Rust 编写的高性能 CSS 解析器 [Stylo](https://github.com/servo/stylo)。

对于找到的每个 &lt;script&gt; 标签或 .wasm 文件，我们都在同一个隔离实例中运行其中的 JavaScript 或 WebAssembly 代码。

**没错，但还有 eval**

你可能会问，[eval](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/eval) 怎么办？eval 的处理更加棘手，因为出于[安全原因](https://developers.cloudflare.com/workers/runtime-apis/web-standards/#javascript-standards)，Workers 仍不原生支持 eval。我们也无法另启一个隔离实例来处理，因为它无法访问 `globalThis`。

我们的解决方案是使用 [Boa JS](https://boajs.dev/)——一个以 Rust 编写的 ECMAScript 引擎——将其编译并运行在 Workers 上。实质上，我们是在一个运行时之上再执行另一个运行时。听起来并不理想，事实也确实如此，但它足以处理代码中偶尔出现的 eval。未来 Workers 支持原生 eval 后，我们将弃用 Boa。

### PageRenderer

这个组件主要负责根据计算完成的页面对象生成真正的像素。其工作方式如下：

<figure data-astro-cid-7nvefuv6=""><p><img src="https://blog.cloudflare.com/_image?href=https%3A%2F%2Fblog.cloudflare.com%2F_emdash%2Fapi%2Fmedia%2Ffile%2F01KZ9Z8AR04KBNA79NHBQYG562.png&amp;w=715&amp;h=338&amp;f=webp&amp;fit=cover&amp;position=center" srcset="https://blog.cloudflare.com/_image?href=https%3A%2F%2Fblog.cloudflare.com%2F_emdash%2Fapi%2Fmedia%2Ffile%2F01KZ9Z8AR04KBNA79NHBQYG562.png&amp;w=640&amp;h=303&amp;f=webp&amp;fit=cover&amp;position=center 640w, https://blog.cloudflare.com/_image?href=https%3A%2F%2Fblog.cloudflare.com%2F_emdash%2Fapi%2Fmedia%2Ffile%2F01KZ9Z8AR04KBNA79NHBQYG562.png&amp;w=715&amp;h=338&amp;f=webp&amp;fit=cover&amp;position=center 715w, https://blog.cloudflare.com/_image?href=https%3A%2F%2Fblog.cloudflare.com%2F_emdash%2Fapi%2Fmedia%2Ffile%2F01KZ9Z8AR04KBNA79NHBQYG562.png&amp;w=750&amp;h=355&amp;f=webp&amp;fit=cover&amp;position=center 750w, https://blog.cloudflare.com/_image?href=https%3A%2F%2Fblog.cloudflare.com%2F_emdash%2Fapi%2Fmedia%2Ffile%2F01KZ9Z8AR04KBNA79NHBQYG562.png&amp;w=828&amp;h=391&amp;f=webp&amp;fit=cover&amp;position=center 828w, https://blog.cloudflare.com/_image?href=https%3A%2F%2Fblog.cloudflare.com%2F_emdash%2Fapi%2Fmedia%2Ffile%2F01KZ9Z8AR04KBNA79NHBQYG562.png&amp;w=1080&amp;h=511&amp;f=webp&amp;fit=cover&amp;position=center 1080w, https://blog.cloudflare.com/_image?href=https%3A%2F%2Fblog.cloudflare.com%2F_emdash%2Fapi%2Fmedia%2Ffile%2F01KZ9Z8AR04KBNA79NHBQYG562.png&amp;w=1280&amp;h=605&amp;f=webp&amp;fit=cover&amp;position=center 1280w, https://blog.cloudflare.com/_image?href=https%3A%2F%2Fblog.cloudflare.com%2F_emdash%2Fapi%2Fmedia%2Ffile%2F01KZ9Z8AR04KBNA79NHBQYG562.png&amp;w=1430&amp;h=676&amp;f=webp&amp;fit=cover&amp;position=center 1430w" alt="BLOG-3466 8.png" loading="lazy" decoding="async" data-image-placeholder-media="true" data-lightbox-src="/_image?href=https%3A%2F%2Fblog.cloudflare.com%2F_emdash%2Fapi%2Fmedia%2Ffile%2F01KZ9Z8AR04KBNA79NHBQYG562.png&amp;w=1920&amp;h=907&amp;f=webp" data-lightbox-width="1920" data-lightbox-height="907" data-astro-cid-7nvefuv6="true" sizes="(min-width: 715px) 715px, 100vw" data-astro-image="constrained" data-astro-image-fit="cover" data-astro-image-pos="center" width="715" height="338"></p></figure>

PageRenderer 与 Engine Worker 循环协作。每当 Engine 需要一帧画面时，PageRenderer 会从 PageScript 获取页面对象（也称为 scene），通过 [Static Assets](https://developers.cloudflare.com/workers/static-assets/) 获取内部字体和图片，将所有内容光栅化为图像缓冲区，再以客户端可以显示的 JPEG/PNG 或 PDF 等格式将缓冲区返回给 Engine。

这里的大量魔法由 Blitz 的另一个模块 [blitz-paint](https://github.com/DioxusLabs/blitz/tree/main/packages/blitz-paint) 完成；它又使用 Parley 将字符塑形成字形、选择字体，并对文本进行换行。

**Workers 内置 RPC 系统：同一应用，多个隔离实例**

Cloudflare Workers 提供[内置远程过程调用（RPC）系统](https://blog.cloudflare.com/javascript-native-rpc/)，允许你调用其他 Worker 上的方法、在它们之间传递对象，并继续调用这些对象上的方法。你无需操心 API schema、类型或身份验证，只要调用 `remoteFunction(...params)`，它就能工作。你既能享受远程 Worker 的隔离性和资源，又不会失去在本地通过 JavaScript 访问其全部函数的便利。

Kitesurf 正是这样使用 RPC 系统：Engine Worker 通过一次 RPC 调用 PageRenderer Worker 的 `renderFrame()`，并获得 PNG 结果。由于渲染器不持有页面状态（只有可随时丢弃的缓存），一旦 RPC 调用失败或卡住，Engine 就可以安全地终止并重启它——从而让每个渲染请求都自包含、可重试，其隔离实例既廉价又可随时丢弃。

## Kitesurf 已通过 215,000 多项 WPT 测试，而且还在增长

Kitesurf 确实能用。它已经通过约 215,000 多项 [WPT 测试](https://github.com/web-platform-tests/wpt)，而且每周还会新增数百项通过的测试。下图展示了从项目启动至今，通过测试数随版本演进的情况：

<figure data-astro-cid-7nvefuv6=""><p><img src="https://blog.cloudflare.com/_image?href=https%3A%2F%2Fblog.cloudflare.com%2F_emdash%2Fapi%2Fmedia%2Ffile%2F01KZ9Z8A1TZBWVWDT3XZQR7AB1.png&amp;w=715&amp;h=367&amp;f=webp&amp;fit=cover&amp;position=center" srcset="https://blog.cloudflare.com/_image?href=https%3A%2F%2Fblog.cloudflare.com%2F_emdash%2Fapi%2Fmedia%2Ffile%2F01KZ9Z8A1TZBWVWDT3XZQR7AB1.png&amp;w=640&amp;h=329&amp;f=webp&amp;fit=cover&amp;position=center 640w, https://blog.cloudflare.com/_image?href=https%3A%2F%2Fblog.cloudflare.com%2F_emdash%2Fapi%2Fmedia%2Ffile%2F01KZ9Z8A1TZBWVWDT3XZQR7AB1.png&amp;w=715&amp;h=367&amp;f=webp&amp;fit=cover&amp;position=center 715w, https://blog.cloudflare.com/_image?href=https%3A%2F%2Fblog.cloudflare.com%2F_emdash%2Fapi%2Fmedia%2Ffile%2F01KZ9Z8A1TZBWVWDT3XZQR7AB1.png&amp;w=750&amp;h=385&amp;f=webp&amp;fit=cover&amp;position=center 750w, https://blog.cloudflare.com/_image?href=https%3A%2F%2Fblog.cloudflare.com%2F_emdash%2Fapi%2Fmedia%2Ffile%2F01KZ9Z8A1TZBWVWDT3XZQR7AB1.png&amp;w=828&amp;h=425&amp;f=webp&amp;fit=cover&amp;position=center 828w, https://blog.cloudflare.com/_image?href=https%3A%2F%2Fblog.cloudflare.com%2F_emdash%2Fapi%2Fmedia%2Ffile%2F01KZ9Z8A1TZBWVWDT3XZQR7AB1.png&amp;w=1080&amp;h=554&amp;f=webp&amp;fit=cover&amp;position=center 1080w, https://blog.cloudflare.com/_image?href=https%3A%2F%2Fblog.cloudflare.com%2F_emdash%2Fapi%2Fmedia%2Ffile%2F01KZ9Z8A1TZBWVWDT3XZQR7AB1.png&amp;w=1280&amp;h=657&amp;f=webp&amp;fit=cover&amp;position=center 1280w, https://blog.cloudflare.com/_image?href=https%3A%2F%2Fblog.cloudflare.com%2F_emdash%2Fapi%2Fmedia%2Ffile%2F01KZ9Z8A1TZBWVWDT3XZQR7AB1.png&amp;w=1430&amp;h=734&amp;f=webp&amp;fit=cover&amp;position=center 1430w" alt="BLOG-3466 9.png" loading="lazy" decoding="async" data-image-placeholder-media="true" data-lightbox-src="/_image?href=https%3A%2F%2Fblog.cloudflare.com%2F_emdash%2Fapi%2Fmedia%2Ffile%2F01KZ9Z8A1TZBWVWDT3XZQR7AB1.png&amp;w=1920&amp;h=986&amp;f=webp" data-lightbox-width="1920" data-lightbox-height="986" data-astro-cid-7nvefuv6="true" sizes="(min-width: 715px) 715px, 100vw" data-astro-image="constrained" data-astro-image-fit="cover" data-astro-image-pos="center" width="715" height="367"></p></figure>

值得注意的是，浏览器中对智能体至关重要的部分（例如 CSS、DOM、HTML、文本选择、SVG 和 XHR）已经具备良好的覆盖率。甚至连流这类在智能体场景中可能没那么重要的功能，如今也得到了相当不错的支持。

<figure data-astro-cid-7nvefuv6=""><p><img src="https://blog.cloudflare.com/_image?href=https%3A%2F%2Fblog.cloudflare.com%2F_emdash%2Fapi%2Fmedia%2Ffile%2F01KZ9Z8AF7AB8HWYJJ0DZCRK5X.png&amp;w=715&amp;h=584&amp;f=webp&amp;fit=cover&amp;position=center" srcset="https://blog.cloudflare.com/_image?href=https%3A%2F%2Fblog.cloudflare.com%2F_emdash%2Fapi%2Fmedia%2Ffile%2F01KZ9Z8AF7AB8HWYJJ0DZCRK5X.png&amp;w=640&amp;h=523&amp;f=webp&amp;fit=cover&amp;position=center 640w, https://blog.cloudflare.com/_image?href=https%3A%2F%2Fblog.cloudflare.com%2F_emdash%2Fapi%2Fmedia%2Ffile%2F01KZ9Z8AF7AB8HWYJJ0DZCRK5X.png&amp;w=715&amp;h=584&amp;f=webp&amp;fit=cover&amp;position=center 715w, https://blog.cloudflare.com/_image?href=https%3A%2F%2Fblog.cloudflare.com%2F_emdash%2Fapi%2Fmedia%2Ffile%2F01KZ9Z8AF7AB8HWYJJ0DZCRK5X.png&amp;w=750&amp;h=613&amp;f=webp&amp;fit=cover&amp;position=center 750w, https://blog.cloudflare.com/_image?href=https%3A%2F%2Fblog.cloudflare.com%2F_emdash%2Fapi%2Fmedia%2Ffile%2F01KZ9Z8AF7AB8HWYJJ0DZCRK5X.png&amp;w=828&amp;h=676&amp;f=webp&amp;fit=cover&amp;position=center 828w, https://blog.cloudflare.com/_image?href=https%3A%2F%2Fblog.cloudflare.com%2F_emdash%2Fapi%2Fmedia%2Ffile%2F01KZ9Z8AF7AB8HWYJJ0DZCRK5X.png&amp;w=1080&amp;h=882&amp;f=webp&amp;fit=cover&amp;position=center 1080w, https://blog.cloudflare.com/_image?href=https%3A%2F%2Fblog.cloudflare.com%2F_emdash%2Fapi%2Fmedia%2Ffile%2F01KZ9Z8AF7AB8HWYJJ0DZCRK5X.png&amp;w=1280&amp;h=1045&amp;f=webp&amp;fit=cover&amp;position=center 1280w, https://blog.cloudflare.com/_image?href=https%3A%2F%2Fblog.cloudflare.com%2F_emdash%2Fapi%2Fmedia%2Ffile%2F01KZ9Z8AF7AB8HWYJJ0DZCRK5X.png&amp;w=1430&amp;h=1168&amp;f=webp&amp;fit=cover&amp;position=center 1430w" alt="BLOG-3466 10.png" loading="lazy" decoding="async" data-image-placeholder-media="true" data-lightbox-src="/_image?href=https%3A%2F%2Fblog.cloudflare.com%2F_emdash%2Fapi%2Fmedia%2Ffile%2F01KZ9Z8AF7AB8HWYJJ0DZCRK5X.png&amp;w=1838&amp;h=1502&amp;f=webp" data-lightbox-width="1838" data-lightbox-height="1502" data-astro-cid-7nvefuv6="true" sizes="(min-width: 715px) 715px, 100vw" data-astro-image="constrained" data-astro-image-fit="cover" data-astro-image-pos="center" width="715" height="584"></p></figure>

从性能来看，Kitesurf 的表现相当不错。下方数据来自 Browser Run [Quick Actions](https://developers.cloudflare.com/browser-run/quick-actions/) 的五次运行，覆盖一个包含 [14 个 URL 的语料集](https://kitesurf.cloudflare.app/corpus.txt)，展示了 Chromium 与 Kitesurf 各项指标的中位数。

**指标**

**Kitesurf**

**Chromium（预热池）**

**Kitesurf 相对表现**

CPU：截图

380 ms

1,173 ms

CPU 用量比 Chromium 少 3.1 倍

CPU：HTML 提取

229 ms

877 ms

比 Chromium 少 3.8 倍

内存：截图

57.8 MiB

271.0 MiB

比 Chromium 少 4.7 倍

内存：HTML 提取

39.4 MiB

273.7 MiB

比 Chromium 少 7.0 倍

墙钟时间：截图

1,148 ms

637 ms

比 Chromium 慢 1.8 倍

墙钟时间：HTML 提取

820 ms

472 ms

比 Chromium 慢 1.7 倍

Chromium 在计时成绩上胜出，因为已经见过当前页面的 [JIT](https://en.wikipedia.org/wiki/Just-in-time_compilation) 总会击败冷启动的软件渲染器——目前大约快 1.7 倍。差距主要来自光栅化和 JPEG/PNG 编码，我们会继续优化这些环节。

但在真正决定账单的内存与 CPU 方面，Kitesurf 胜过 Chromium，其用量仅为后者的约三分之一至七分之一。更少的内存意味着我们可以运行更多会话、更好地扩展，并从根本上降低我们和你的成本。

### 最重要的测试：Kitesurf 能运行 Doom

我们在设计决策中强调了测试的重要性，但大家都知道，无论测试做得多么充分，一个项目只有能运行 Doom 才算真正完成。下面就是 Kitesurf 运行 [https://silentspacemarine.com/](https://silentspacemarine.com/) 的画面，它来自我们几年前做的一个小型 Doom [实验](https://blog.cloudflare.com/doom-multiplayer-workers/)。

<div class="video-wrap" style="position:relative;width:100%;padding-top:74.63%;margin:1.2rem 0;border-radius:10px;overflow:hidden;background:#000"><iframe src="https://customer-eq7kiuol0tk9chox.cloudflarestream.com/d0e3d78d3f2135f2a0f42cb6a882d110/iframe?preload=true&amp;loop=true&amp;autoplay=true&amp;poster=https%3A%2F%2Fcustomer-eq7kiuol0tk9chox.cloudflarestream.com%2Fd0e3d78d3f2135f2a0f42cb6a882d110%2Fthumbnails%2Fthumbnail.jpg%3Ftime%3D%26height%3D600" loading="lazy" style="border:none;position:absolute;top:0;left:0;height:100%;width:100%" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen="true"></iframe></div>

### 立即在 Browser Run 中试用

现在就可以通过 Browser Run 试用 Kitesurf，**测试期间免费开放**，但受每个账户的[使用限制](https://developers.cloudflare.com/browser-run/limits/)约束。

[Browser Run CDP 端点](https://developers.cloudflare.com/browser-run/cdp/)现在已将 Kitesurf 作为可选项，因此，你现有的 [Puppeteer](https://developers.cloudflare.com/browser-run/puppeteer/)、[Playwright](https://playwright.dev/)、[chrome-remote-interface](https://www.npmjs.com/package/chrome-remote-interface) 客户端，或任何同时支持 MCP 与 CDP 的 AI 智能体，都能直接使用它。你只需在我们的端点中加入 `browser=kitesurf` 参数。

例如，若要在 Opencode 中使用 Kitesurf，请参阅开发者文档中的[与 MCP 客户端配合使用（CDP）](https://developers.cloudflare.com/browser-run/cdp/mcp-clients/)，并采用以下配置：

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

另一种方式是使用 [Browser Run 的 Quick Actions](https://developers.cloudflare.com/browser-run/quick-actions/)。同样，只需在 Quick Action 端点中加入 `browser=kitesurf` 即可。例如，如果你需要快速截取 Wikipedia 页面，下面的请求就能完成任务：

```jsx
curl -X POST 'https://api.cloudflare.com/client/v4/accounts/<accountId>/browser-run/screenshot?browser=kitesurf' \
  -H 'Authorization: Bearer <apiToken>' \
  -H 'Content-Type: application/json' \
  -d '{
    "url": "https://example.com"
  }' \
  --output "screenshot.png"
```

**通过 Chrome DevTools 使用 Kitesurf Playground**

你也可以通过我们的[公开 Playground](https://kitesurf.cloudflare.app/) 开始探索 Kitesurf。在其中输入任意 URL，就能查看 Kitesurf 如何渲染该页面并与之交互。

这个 Playground 有一项很有意思的功能：我们把 Chrome DevTools 注入了 UI，因此你可以检查展开的 DOM 元素、阅读控制台消息，并在 Kitesurf 渲染页面时观察网络活动。更有趣的是，我们实现了 [Memory 面板](https://developer.chrome.com/docs/devtools/memory)所需的 CDP 指令，用它来报告每个隔离实例（包括各个 frame）的 WebAssembly 内存占用，从而清楚了解每个页面正在消耗的资源。

<figure data-astro-cid-7nvefuv6=""><p><img src="https://blog.cloudflare.com/_image?href=https%3A%2F%2Fblog.cloudflare.com%2F_emdash%2Fapi%2Fmedia%2Ffile%2F01KZ9Z8AT4Q5YVBA4A3HPFSQGB.png&amp;w=715&amp;h=518&amp;f=webp&amp;fit=cover&amp;position=center" srcset="https://blog.cloudflare.com/_image?href=https%3A%2F%2Fblog.cloudflare.com%2F_emdash%2Fapi%2Fmedia%2Ffile%2F01KZ9Z8AT4Q5YVBA4A3HPFSQGB.png&amp;w=640&amp;h=464&amp;f=webp&amp;fit=cover&amp;position=center 640w, https://blog.cloudflare.com/_image?href=https%3A%2F%2Fblog.cloudflare.com%2F_emdash%2Fapi%2Fmedia%2Ffile%2F01KZ9Z8AT4Q5YVBA4A3HPFSQGB.png&amp;w=715&amp;h=518&amp;f=webp&amp;fit=cover&amp;position=center 715w, https://blog.cloudflare.com/_image?href=https%3A%2F%2Fblog.cloudflare.com%2F_emdash%2Fapi%2Fmedia%2Ffile%2F01KZ9Z8AT4Q5YVBA4A3HPFSQGB.png&amp;w=750&amp;h=543&amp;f=webp&amp;fit=cover&amp;position=center 750w, https://blog.cloudflare.com/_image?href=https%3A%2F%2Fblog.cloudflare.com%2F_emdash%2Fapi%2Fmedia%2Ffile%2F01KZ9Z8AT4Q5YVBA4A3HPFSQGB.png&amp;w=828&amp;h=600&amp;f=webp&amp;fit=cover&amp;position=center 828w, https://blog.cloudflare.com/_image?href=https%3A%2F%2Fblog.cloudflare.com%2F_emdash%2Fapi%2Fmedia%2Ffile%2F01KZ9Z8AT4Q5YVBA4A3HPFSQGB.png&amp;w=1080&amp;h=782&amp;f=webp&amp;fit=cover&amp;position=center 1080w, https://blog.cloudflare.com/_image?href=https%3A%2F%2Fblog.cloudflare.com%2F_emdash%2Fapi%2Fmedia%2Ffile%2F01KZ9Z8AT4Q5YVBA4A3HPFSQGB.png&amp;w=1280&amp;h=927&amp;f=webp&amp;fit=cover&amp;position=center 1280w, https://blog.cloudflare.com/_image?href=https%3A%2F%2Fblog.cloudflare.com%2F_emdash%2Fapi%2Fmedia%2Ffile%2F01KZ9Z8AT4Q5YVBA4A3HPFSQGB.png&amp;w=1430&amp;h=1036&amp;f=webp&amp;fit=cover&amp;position=center 1430w" alt="BLOG-3466 12.png" loading="lazy" decoding="async" data-image-placeholder-media="true" data-lightbox-src="/_image?href=https%3A%2F%2Fblog.cloudflare.com%2F_emdash%2Fapi%2Fmedia%2Ffile%2F01KZ9Z8AT4Q5YVBA4A3HPFSQGB.png&amp;w=1920&amp;h=1391&amp;f=webp" data-lightbox-width="1920" data-lightbox-height="1391" data-astro-cid-7nvefuv6="true" sizes="(min-width: 715px) 715px, 100vw" data-astro-image="constrained" data-astro-image-fit="cover" data-astro-image-pos="center" width="715" height="518"></p></figure>

有关如何通过 Browser Run 使用 Kitesurf 的全部细节，请查阅我们的[开发者文档](https://developers.cloudflare.com/browser-run/)。

### Kitesurf 在哪些场景中更出色？

截至目前，Kitesurf 已能正确渲染 [TodoMVC](https://todomvc.com/)（原生 JavaScript、React、Vue、Angular、Preact）、Wikipedia、Hacker News、Cloudflare Blog，以及 Cloudflare Dashboard 的大部分页面。我们会继续改进 Kitesurf，提高 WPT 测试通过率，从而增强对更复杂网页的兼容性。

<div class="video-wrap" style="position:relative;width:100%;padding-top:74.63%;margin:1.2rem 0;border-radius:10px;overflow:hidden;background:#000"><iframe src="https://customer-eq7kiuol0tk9chox.cloudflarestream.com/87f957139f360dbd005c4538510eb152/iframe?preload=true&amp;loop=true&amp;autoplay=true&amp;poster=https%3A%2F%2Fcustomer-eq7kiuol0tk9chox.cloudflarestream.com%2F87f957139f360dbd005c4538510eb152%2Fthumbnails%2Fthumbnail.jpg%3Ftime%3D%26height%3D600" loading="lazy" style="border:none;position:absolute;top:0;left:0;height:100%;width:100%" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen="true"></iframe></div>

如果 AI 智能体需要渲染页面，同时可以接受不使用功能完备、像素级精确的 Chromium 浏览器所带来的取舍，Kitesurf 会非常合适。对于兼容的网站，它也很适用于依赖一次性 [Quick Actions](https://developers.cloudflare.com/browser-run/quick-actions/) 的自动化和应用，例如提取页面内容，或生成 PDF 与截图。

可以把 Kitesurf 看作一个临时、完全隔离且无状态的引擎：它只在任务执行期间存在，并能很好地应对突发的 AI 驱动型工作负载。

### Kitesurf 目前还不能做什么

如果你需要播放视频、渲染 WebGL、使用真实 TLS 指纹完成 Bot Challenge 握手，或启动一个需要持久状态、长达十分钟的认证会话，那么 Kitesurf 目前还不适合。直接使用 Browser Run 由 Chromium 驱动的默认选项即可。

要判断某个网站是否兼容 Kitesurf，最好的办法就是亲自尝试。你可以使用 API；更快捷的方式则是在我们的[公开 Playground](https://kitesurf.cloudflare.app/) 中试用。

打开各个 DevTools 面板，看看幕后发生了什么，尤其要关注控制台和内存指标。

### 下一步

Kitesurf 诞生仅 12 周，第一次提交是在今年 5 月。我们正在积极推进以下工作：

*   **更完善的 CDP 覆盖。** Kitesurf 实现了 CDP 协议的一个子集，已经足以满足大多数智能体与自动化工具的需求，包括可靠的 DOM 和网络检查能力；我们会继续扩展，尽可能完整地覆盖其功能。
*   **提高截图和 PDF 的渲染保真度。** 因为我们知道，相比底层文本，LLM 往往能从图像中获得更好的效果。
*   **扩展 WPT 覆盖。** 我们正在快速迭代，加入更多 Web API 并通过更多 WPT 测试，推动 Kitesurf 达到生产就绪状态。
*   **提升效率。** 我们会持续运行 CPU、内存和墙钟时间基准测试，并与开发者平台的其他团队密切合作，让 Kitesurf 尽可能经济高效。

## 结语

感谢你一路读到这里——我们知道这是一篇漫长而技术密集的博客，但希望它同样有趣。我们之所以深入细节，是因为我们非常清楚：打造一款新浏览器，即便用途非常专一，也既重要又复杂，绝不能轻率对待。

Kitesurf 仍处于早期阶段，但我们希望尽早向你开放，并从反馈中学习。团队会频繁更新，围绕性能、效率和兼容性积极改进它。

最后还有一件事：准备就绪后，我们会将 Kitesurf 开源——希望这一天很快到来。我们的目标是，让任何有需要的客户都能在自己的账户中部署自己的 Kitesurf。

欢迎前往 [Playground](https://kitesurf.cloudflare.app/) 亲自试用，关注我们的[更新日志](https://developers.cloudflare.com/browser-run/changelog/)，并在 [Discord](https://discord.com/invite/cloudflaredev) 与团队交流。分享你的使用体验并向我们发送反馈；我们会认真倾听。
