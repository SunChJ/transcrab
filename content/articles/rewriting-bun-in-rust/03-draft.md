# 用 Rust 重写 Bun

披露：Bun 于 2025 年 12 月被 Anthropic 收购。我和 Bun 团队的其他成员现在都在 Anthropic 工作。在这次 Rust 重写的大部分过程中，我使用了 Claude Fable 5 的预发布版本。

Bun 最初是把 esbuild 的 JavaScript 和 TypeScript 转译器从 Go 逐行移植到 Zig。我在 [2021 年 4 月 16 日](https://github.com/ziglang/zig/issues/8575)写下了第一行 Zig。当时我在 Hacker News 上看到单页的 [Zig Language Reference](https://ziglang.org/documentation/master/)，被它对底层控制和性能的重视打动，于是押注了 Zig。

从一开始，Bun 的范围就非常大：

*   JavaScript、TypeScript 和 CSS 的转译器、压缩器和打包器
*   兼容 npm 的包管理器
*   类似 Jest 的测试运行器
*   兼容 Node.js 和 TypeScript 的模块解析
*   HTTP/1.1 和 WebSocket 客户端
*   `fs`、`net`、`tls` 以及几十个其他 Node.js API 模块的实现

Bun 的初版是我在一个狭小的 Oakland 公寓里，用 Zig 花 1 年写出来的，那时还没有 LLM。像 Bun 这种范围野心很大的项目，默认结局往往是躺进 GitHub 个人页上一堆死掉 side project 的坟场。Zig 让 Bun 成为了可能。如果没有 Zig，我绝不可能在 1 年里做出这么多东西。

今天，Bun CLI 每月下载量超过 2200 万。Claude Code 和 OpenCode 这样的流行工具选择 Bun 作为运行时。Vercel、Railway、DigitalOcean 等平台也都提供了对 Bun 的一方支持。

Bun 的范围也一直给稳定性带来挑战。下面是我们在 Bun v1.3.14 中修复的一小部分 bug：

*   在 threadpool 上仍有异步 `.write()` 进行时，对 zlib、Brotli 或 Zstd stream 调用 `.reset()`，会导致 `node:zlib` 中的 heap-use-after-free 崩溃
*   `onerror` 回调对 native handle 发起重入的 `write()` 后又调用 `close()`，导致 `node:zlib` 中的 use-after-free 崩溃
*   `node:http2` 中，重入的 JS 回调（例如 timeout listener、options getter 或 write callback 里调用 `session.request()`）触发 hashmap rehash，使内部 stream 指针失效，导致 use-after-free 崩溃
*   `UDPSocket.send()` 和 `sendMany()` 中，用户代码在 `valueOf()` 或 `toString()` 回调里可以在捕获 payload 和真正发送之间 detach 一个 `ArrayBuffer`，导致 use-after-free
*   `Buffer#copy` 和 `Buffer#fill` 中，`valueOf` 回调在参数强制转换期间 detach 或 resize 底层 `ArrayBuffer`，导致崩溃和越界读取
*   `UDPSocket.sendMany()` 中，用户 JS 回调在迭代中途改变 socket 连接状态，导致 heap 越界写入
*   `crypto.scrypt` 中，如果输出 buffer 分配失败，callback 和受保护的 password/salt buffer 从未释放，导致内存泄漏
*   `SSLWrapper.init` 在错误路径上泄漏了 strdup 出来的 passphrase
*   `tlsSocket.setSession()` 中，由于 `d2i_SSL_SESSION` 后缺少 `SSL_SESSION_free`，每次调用都会泄漏一个 `SSL_SESSION`（每次约 6.5 KB）
*   `fs.watch()` watcher 在 `.close()` 后从未被垃圾回收：引用计数下溢让每个 watcher 永久固定为 GC root
*   CSS parser 在 `background-clip` 同时有 vendor prefix 和多层背景时发生 double-free 崩溃
*   `DuplexUpgradeContext` 从未释放，导致每次 `tls.connect({ socket: duplex })` 都完整泄漏一次
*   `MessageEvent` 中的竞态崩溃：GC marker thread 在来自 `BroadcastChannel` 或 `MessagePort` 的并发访问期间，可能观察到 `m_data` 中被撕裂的 variant

我们当然可以永远一个一个地修这些 bug，但依赖我们的用户值得更好的结果：我们应该系统性地防止这类 bug 反复出现。

### [我们已经在做什么](#what-we-were-already-doing)

*   我们 patch 了 Zig 编译器，加入 Address Sanitizer 支持。每次提交都会用 ASAN 跑测试套件。
*   我们在 Windows 上发布启用 Zig safety check 的 ReleaseSafe 构建
*   我们用 [Fuzzilli](https://github.com/googleprojectzero/fuzzilli) 7x24 fuzz Bun 的 runtime API；这是 V8 和 JavaScriptCore 使用的 JavaScript engine fuzzer
*   我们有大量端到端内存泄漏测试

这已经比很多项目做得更多了。

## [只要足够聪明、不要犯错就行？](#just-be-really-smart-and-don-t-make-mistakes)

那份 bugfix 列表让我很难受。我也厌倦了睡前还在担心 Bun 会崩溃。我不怪 Zig，其他 Zig 用户并没有我们遇到的这些 bug，而把 GC 和手动管理内存混在一起，本来就是软件里少见到足以让语言专门为它设计的需求。如果没有 Zig，我们走不到今天，我也会一直感谢它。直到很近之前，对 Bun 这样的项目来说，编程语言选择还是一条单行道。

JavaScript 是一门带垃圾回收的语言，JavaScriptCore（以及 V8）这样的现代 JavaScript 引擎对异常处理和垃圾回收器有严格规则。Zig 和 C 一样，不替你管理内存；对很多项目来说，这种取舍正是使用 Zig 的好理由。Zig 没有构造函数/析构函数，大多数清理逻辑都预期在每个调用点用 `defer` 显式写出来。

对 Bun 来说，正确处理垃圾回收值和手动管理值的生命周期，一直是稳定性问题的主要来源，最常见的是小内存泄漏，偶尔是崩溃。每一次内存分配都必须仔细 review：这些字节在哪里释放？怎么保证只释放一次？JavaScript 异常有没有正确检查？这个 GC 指针对 conservative stack scanner 可见吗？这块内存是 GC 管理的，还是手动管理的？

对稳定性问题来说，越早知道越好。Fuzzing 发生在代码合并之后。CI 发生在代码 push 之后。运行时 safety check 和 address sanitizer 发生在代码运行时（理想情况下是在开发阶段、CI 之前）。

减少这类问题的常见方法之一，是确保需要清理的代码永远恰好运行一次。Zig 被设计成一门简单、没有隐藏控制流的语言，所以它更偏向用显式的 `defer` 关键字在作用域结束时运行代码，而不是 C++ 隐式的 ~Destructor 或 Rust 隐式的 `Drop`。

Language

Cleanup

Zig

`defer`, `errdefer`

C++

~Destructor, &&Move

Rust

Drop

对 Zig 代码来说，我们到底应该在什么时候运行清理代码？如果把同一个 `*T` 传给很多不同函数，怎么知道它已经不再可访问，可以清理了？如果某些函数在被调用后还需要继续引用那段内存，又该怎么办？我们目前的方法是几种东西混在一起：

*   arena 生命周期：可访问范围很清楚时使用（parser state 不会逃出调用函数，因此 AST node 很适合）
*   引用计数
*   非常非常小心

很多项目选择用 style guide 回答这类问题。TigerBeetle 的 [TigerStyle](https://tigerstyle.dev/) 是 Zig 中的一个例子，Google 31000 词的 [C++ style guide](https://google.github.io/styleguide/cppguide.html) 是另一个例子。style guide 的挑战在于执行。你怎么确保 style guide 被遵守？历史上，答案是 code review，再辅以 linter 和 static analyzer 的 best-effort 检查。

对 Bun 来说，写一份严格的 style guide，并把清晰的 ownership 预期显式编码进类型系统，确实是一个现实选择。由于 Zig 没有 operator overloading，我们很可能最终会得到大量类似这样的代码：

```jsx
fn foo(a_ptr: SharedPtr(TCPSocket)) !void {
  const a: *TCPSocket = a_ptr.get();
  defer a_ptr.deref();

  const b = try do_something_with_a(a);
  defer b.deref();

  // ...
}
```

这比我们期望的 Zig 写法更不顺手：

```jsx
fn foo(a: *TCPSocket) !void {
  const b = try do_something_with_a(a);
  // ...
}
```

## [那 C/C++ 呢？](#what-about-c-c)

Bun 大约 20% 的代码是 C++，并且 Bun 嵌入了几个 C/C++ 库：

*   JavaScriptCore，Safari 背后的 JavaScript 引擎
*   uWebSockets 和 usockets，我们的 HTTP/WebSocket server 和 event loop
*   lshpack 和 lsquic，`HPACK` 和 HTTP/3 库
*   BoringSSL，Google 的 OpenSSL fork
*   SQLite

对 Bun 来说，用 C++ 代替 Zig 会是一个合理选择。我们会得到构造函数和析构函数，也可以删除大量 `extern "C"` wrapper 代码。

但是，我们仍然会依赖通过 code review 执行的 style guide。即使用了 ASAN，内存破坏和内存泄漏仍然会发生。

## [为什么是 Rust？](#why-rust)

上面那份列表里的大量 bug 都是 use-after-free、double-free，以及错误路径上“忘记 free”。在 safe Rust 里，这些都是编译器错误，并且 `Drop` 会提供类似 RAII 的自动清理。编译器错误比 style guide 有更好的反馈循环。

历史上，重写通常是个糟糕主意。不算注释，Bun 有 535496 行 Zig。用另一门语言重写，需要一个小工程师团队花整整一年。这意味着在这段时间里冻结 bugfix、安全修复或功能开发。想得到一个可发布版本，风险最低的方法是从 Zig 到 Rust 做机械式移植，尽量少改行为，并使用我们已经用于测试 Bun 的同一套测试套件。

幸运的是，Bun 自己的测试套件是用 TypeScript 写的，这意味着它不依赖 runtime 的实现语言。

一年没有任何用户可见影响不是我们能考虑的现实选项。所以，通过 code style 强制约束来修稳定性问题，是我们最好的选择；这也是我们给 Bun 代码库加入 Rust 风格 [smart pointer](https://github.com/oven-sh/bun/blob/3a79bd746b11601c9db970b608c73f0b9f96ac81/src/ptr/shared.zig#L569) 时的计划。

但说实话，我不想这么做。自研 smart pointer 的 ergonomics 比 Rust 更差，却没有 Rust 的保证。

如果我换个方向，花一周测试 Anthropic 的新模型能不能把 Bun 重写成 Rust 呢？

一开始，我并不期待它能成功。几天后，测试套件开始有很高比例通过，我也看到新的 Rust 代码和原来的 Zig 代码库高度对应。我的看法从“这值得一试”变成了“我要把它 merge 进去”。

## [Claude，把 Bun 重写成 Rust。](#claude-rewrite-bun-in-rust)

有很多方法可以把这件事做得很糟。比如 prompt Claude：“Rewrite Bun in Rust. Don't make any mistakes.” 然后祈祷它能工作。这不是我做的事。

想想一个人会怎么做。第一个大问题是：

增量重写？还是一次性全部重写？

以我当初在没有 LLM 的情况下，把 esbuild 的 transpiler 从 Go 移植到 Zig 来做 Bun 初版的经验看，一次性全部重写更好。增量重写会加入临时代码，你希望它们最终被删除，但在短期到中期都会很痛苦。

第二个大问题是：怎么做？

我们怎样让 Rust 版 Bun 仍然是以前那个 Bun，保持同样的架构、性能和功能集，同时获得 Rust 的 borrow checker 等语言特性？怎样确保团队在重写后仍然能够维护它？

做一次看起来像把 Zig 代码转译成 Rust 的重写。Bun v1.4 发布后，我们可以逐步重构，减少 `unsafe` 使用，让它更像惯用 Rust。

大的问题只有这两个。其他都是战术。

## [写代码和 review 代码的循环](#loops-that-write-review-code)

软件工程师的大量日常工程工作，都可以被过度简化成循环。

```jsx
// Pseudocode, not real code:
let task;
while ((task = todoList.pop())) {
  const result = task();
  const feedback = await Promise.all([review(result), review(result)]);
  await apply(feedback, result);
}
```

一个 `task` 带着一些上下文（Jira ticket、GitHub issue 等）。`result` 是你为修它写的代码。code reviewer 调用 `review` 检查变更是否引入回归、是否正确。然后你处理反馈。

我用 Claude Code 中大约 50 个 dynamic workflow 持续运行了 11 天，把 Bun 重写成了 Rust。

每个 dynamic workflow 都是这样的循环，例如：

*   生成一份 porting guide，把 Zig pattern 和 type 映射到 Rust pattern 和 type
*   机械式地把每个 `.zig` 文件移植成 `.rs` 文件，遵循 PORTING.md 和 LIFETIMES.tsv
*   修复每个 crate 的编译错误
*   让 `bun test` 或 `bun build` 这样的子命令工作
*   让 Bun 的完整测试套件全部通过
*   几个大型重构和清理 pass

在这 11 天的大部分时间里（以及之后），我都在监控 workflow：手动阅读输出，检查问题和 bug，并 prompt Claude 修改循环来修复问题。

你要怎么 review 一个新增超过 100 万行的 PR？你要如何建立足够信心，负责任地合并大量 LLM 写出的代码？

答案是：一个和语言无关、拥有百万级断言的测试套件；adversarial code review；以及当问题发生时，修复生成代码的流程，而不是手动修代码。

### [Adversarial review](#adversarial-review)

Adversarial review 会要求 Claude（在单独的 context window 中）穷尽式地提出这些变更会产生 bug 或无法工作的理由。

#### 拆分 context window

通常对人来说，review 代码的人不是写代码的人。写代码的人想把代码 merge 进去，这可能让他们倾向于在代码还没准备好时就发出去。

Claude 也是这样。写代码的 Claude 想让代码被接受。review 的 Claude 想找出代码里的问题。

每个 implementer 配 2 个或更多 adversarial reviewer。reviewer 的唯一任务是：找 bug，找代码为什么不能工作的理由。implementer 不 review。reviewer 不 implement。

✻ claude code · dynamic workflowadversarial review3 of the many bugs adversarial review caught before merge

bug 1 of 3 · the async close

✻claudeimplementer

its context: the .zig original, the port plan, its own reasoning

✻claudeadversarial reviewer

its context: only the diff. told to assume the code is wrong.

✻

src/runtime/api/bun/js\_bun\_spawn\_bindings.rs · compiles clean

for stdio in \[spawned\_stdout, spawned\_stderr\] {

match stdio {

StdioResult::Buffer(mut pipe) \=> {

// pipe: Box<uv::Pipe> — hand it to libuv to close

pipe.close(Subprocess::on\_pipe\_close)

}

StdioResult::Fd(fd) \=> fd.close(),

StdioResult::Unavailable \=> {}

}

}

✻

uv\_close 是异步的：libuv 会一直持有 raw handle pointer，直到下一个 loop tick，然后调用 on\_pipe\_close 释放这次分配。但 `pipe` 是一个 Box，它会在这个 match arm 结束时 drop。于是 libuv 手里留下了已经释放的内存，而 close callback 又会再释放一次。先 use-after-free，再 double-free。

✻

Box::leak(pipe).close(Subprocess::on\_pipe\_close)

f0a454376c7 · win-review: js\_bun\_spawn\_bindings.rs leak Box<uv::Pipe> before async uv\_close to avoid UAF/double-free in on\_pipe\_close

这是 adversarial reviewer 真正抓到的三个 bug。每个被引用的 commit subject 里都带着 review attribution。这三个 bug 都能编译，三个看起来都合理。reviewer 是另一个 Claude，运行在自己的 context window 里：它只拿到 diff，除此之外什么都没有，不知道 implementer 的推理；它被要求找出代码错在哪里。这里的代码从引用 commit 中压缩而来，bug 和修复是同一个。

## [这看起来是什么样？](#what-does-this-look-like)

如果你准备做一件又大又贵的事，先降低风险能省时间也省钱。

### [准备工作](#prep-work)

在写任何代码之前，我花了大约 3 个小时和 Claude 讨论如何把我们 Zig 代码库里的 pattern 尽量贴近地映射到 Rust。Claude 把这次讨论序列化成一份 `PORTING.md` 文档，后来还上了 [Hacker News](https://news.ycombinator.com/item?id=48016880)。

下一个问题是：怎样给手动管理内存的代码加上 Rust lifetime？

这时我大概这样 prompt Claude：

我：让我们启动一个 dynamic workflow，分析代码库里每个 struct field 的正确 lifetime。这个 workflow 应该读取每个文件里的每个 struct field，并追踪控制流。首先找出那些在 Rust 中难以表达复杂 lifetime 的 struct field，然后为这个 field 提出一个 lifetime，再用 2 个 adversarial review agent review 这个 lifetime，然后应用所有反馈，并序列化成 LIFETIMES.tsv，供其他 Claude 查看。

然后对 `PORTING.md` 和 `LIFETIMES.tsv` 一起做一轮 adversarial review，修复所有互相冲突的建议，并再次检查所有内容。我也手动读了一遍。

### [试运行](#trial-run)

在要求 Claude 把全部 1448 个 .zig 文件翻译成 .rs 文件之前，我先只试了 3 个文件。对这 3 个文件中的每一个，1 个 implementer 写新的 `.rs` 文件，2 个 adversarial reviewer 检查这个 `.rs` 文件是否和 `.zig` 文件行为一致，且是否遵循 `PORTING.md` 和 `LIFETIMES.tsv`。之后，1 个 fixer 应用所有建议。

### [几次误启动](#false-starts)

我让 Claude 在全部 1448 个 .zig 文件上循环跑 workflow。大约 2 分钟后，一个 Claude 在 commit 前运行了 `git stash`。另一个运行了 `git stash pop`。然后又来了 `git reset HEAD --hard`。它们互相踩脚了！如果我把每个 Claude 放进单独的 worktree，又会用光磁盘空间，因为 Bun 的 git 仓库太大，而且最终这些变更还需要一起编译和观察。

所以，我让 Claude 修改 workflow，指示 Claude 永远不要运行 `git stash` 或 `git reset`，也不要运行任何不能一次性 commit 特定文件的 `git` 命令。也不要跑 `cargo`。完全不要跑慢命令。

然后 Claude 恢复了 workflow。它开始工作了！只是太慢，所以我把它拆成 4 个 workflow shard，每个 shard 有自己的 worktree（总共 4 个 worktree），每个 shard 运行 16 个 Claude 来提交和 push 文件。

### [终于开始写代码](#finally-writing-the-code)

得益于所有这些并行化和准备工作，在峰值时 Claude 每分钟写下大约 1300 行代码。每一行代码都由两个独立的 adversarial reviewer（也是 Claude）review，并在提交前经过一轮修复。当时它们完全不能工作。

11 days × 24 hours · PDT

6,502 commits

1695 commits/hour

<svg viewBox="0 0 556 257" role="img" aria-label="Commits per hour across the 11 days of the rewrite"><text x="52" y="15" font-size="12" fill="#6b7280">12am</text><text x="178" y="15" font-size="12" fill="#6b7280">6am</text><text x="304" y="15" font-size="12" fill="#6b7280">12pm</text><text x="430" y="15" font-size="12" fill="#6b7280">6pm</text><g><text x="44" y="38" font-size="12" text-anchor="end" fill="#6b7280">May 4</text><rect x="52" y="24" width="19" height="19" rx="4" fill="#16181f"></rect><rect x="73" y="24" width="19" height="19" rx="4" fill="#16181f"></rect><rect x="94" y="24" width="19" height="19" rx="4" fill="#16181f"></rect><rect x="115" y="24" width="19" height="19" rx="4" fill="#16181f"></rect><rect x="136" y="24" width="19" height="19" rx="4" fill="#16181f"></rect><rect x="157" y="24" width="19" height="19" rx="4" fill="#16181f"></rect><rect x="178" y="24" width="19" height="19" rx="4" fill="#16181f"></rect><rect x="199" y="24" width="19" height="19" rx="4" fill="rgb(106,40,164)" data-t="7" data-n="6"><title>May 4, 7am–8am PDT — 6 commits, +89,278 lines</title></rect><rect x="220" y="24" width="19" height="19" rx="4" fill="rgb(88,37,141)" data-t="8" data-n="2"><title>May 4, 8am–9am PDT — 2 commits, +50,742 lines</title></rect><rect x="241" y="24" width="19" height="19" rx="4" fill="rgb(80,36,130)" data-t="9" data-n="1"><title>May 4, 9am–10am PDT — 1 commit, +28,149 lines</title></rect><rect x="262" y="24" width="19" height="19" rx="4" fill="#16181f"></rect><rect x="283" y="24" width="19" height="19" rx="4" fill="rgb(80,36,130)" data-t="11" data-n="1"><title>May 4, 11am–12pm PDT — 1 commit, +39,752 lines</title></rect><rect x="304" y="24" width="19" height="19" rx="4" fill="rgb(94,38,149)" data-t="12" data-n="3"><title>May 4, 12pm–1pm PDT — 3 commits, +251,616 lines</title></rect><rect x="325" y="24" width="19" height="19" rx="4" fill="rgb(88,37,141)" data-t="13" data-n="2"><title>May 4, 1pm–2pm PDT — 2 commits, +161,724 lines</title></rect><rect x="346" y="24" width="19" height="19" rx="4" fill="#16181f"></rect><rect x="367" y="24" width="19" height="19" rx="4" fill="rgb(94,38,149)" data-t="15" data-n="3"><title>May 4, 3pm–4pm PDT — 3 commits, +136,381 lines</title></rect><rect x="388" y="24" width="19" height="19" rx="4" fill="#16181f"></rect><rect x="409" y="24" width="19" height="19" rx="4" fill="rgb(103,39,160)" data-t="17" data-n="5"><title>May 4, 5pm–6pm PDT — 5 commits, +895 lines</title></rect><rect x="430" y="24" width="19" height="19" rx="4" fill="rgb(103,39,160)" data-t="18" data-n="5"><title>May 4, 6pm–7pm PDT — 5 commits, +17,027 lines</title></rect><rect x="451" y="24" width="19" height="19" rx="4" fill="rgb(80,36,130)" data-t="19" data-n="1"><title>May 4, 7pm–8pm PDT — 1 commit, +106 lines</title></rect><rect x="472" y="24" width="19" height="19" rx="4" fill="#16181f"></rect><rect x="493" y="24" width="19" height="19" rx="4" fill="rgb(127,37,161)" data-t="21" data-n="13"><title>May 4, 9pm–10pm PDT — 13 commits, +11,661 lines</title></rect><rect x="514" y="24" width="19" height="19" rx="4" fill="#16181f"></rect><rect x="535" y="24" width="19" height="19" rx="4" fill="rgb(106,40,164)" data-t="23" data-n="6"><title>May 4, 11pm–12am PDT — 6 commits, +8,516 lines</title></rect></g><g><text x="44" y="59" font-size="12" text-anchor="end" fill="#6b7280">May 5</text><rect x="52" y="45" width="19" height="19" rx="4" fill="rgb(116,39,165)" data-t="24" data-n="9"><title>May 5, 12am–1am PDT — 9 commits, +1,381 lines</title></rect><rect x="73" y="45" width="19" height="19" rx="4" fill="rgb(109,40,168)" data-t="25" data-n="7"><title>May 5, 1am–2am PDT — 7 commits, +1,577 lines</title></rect><rect x="94" y="45" width="19" height="19" rx="4" fill="rgb(99,39,154)" data-t="26" data-n="4"><title>May 5, 2am–3am PDT — 4 commits, +2,035 lines</title></rect><rect x="115" y="45" width="19" height="19" rx="4" fill="rgb(99,39,154)" data-t="27" data-n="4"><title>May 5, 3am–4am PDT — 4 commits, +7,808 lines</title></rect><rect x="136" y="45" width="19" height="19" rx="4" fill="rgb(80,36,130)" data-t="28" data-n="1"><title>May 5, 4am–5am PDT — 1 commit, +2,796 lines</title></rect><rect x="157" y="45" width="19" height="19" rx="4" fill="rgb(88,37,141)" data-t="29" data-n="2"><title>May 5, 5am–6am PDT — 2 commits, +29,370 lines</title></rect><rect x="178" y="45" width="19" height="19" rx="4" fill="#16181f"></rect><rect x="199" y="45" width="19" height="19" rx="4" fill="#16181f"></rect><rect x="220" y="45" width="19" height="19" rx="4" fill="rgb(88,37,141)" data-t="32" data-n="2"><title>May 5, 8am–9am PDT — 2 commits, +7,076 lines</title></rect><rect x="241" y="45" width="19" height="19" rx="4" fill="rgb(88,37,141)" data-t="33" data-n="2"><title>May 5, 9am–10am PDT — 2 commits, +308 lines</title></rect><rect x="262" y="45" width="19" height="19" rx="4" fill="#16181f"></rect><rect x="283" y="45" width="19" height="19" rx="4" fill="rgb(88,37,141)" data-t="35" data-n="2"><title>May 5, 11am–12pm PDT — 2 commits, +1,643 lines</title></rect><rect x="304" y="45" width="19" height="19" rx="4" fill="rgb(99,39,154)" data-t="36" data-n="4"><title>May 5, 12pm–1pm PDT — 4 commits, +1,452 lines</title></rect><rect x="325" y="45" width="19" height="19" rx="4" fill="rgb(80,36,130)" data-t="37" data-n="1"><title>May 5, 1pm–2pm PDT — 1 commit, +2,142 lines</title></rect><rect x="346" y="45" width="19" height="19" rx="4" fill="rgb(99,39,154)" data-t="38" data-n="4"><title>May 5, 2pm–3pm PDT — 4 commits, +7,787 lines</title></rect><rect x="367" y="45" width="19" height="19" rx="4" fill="rgb(88,37,141)" data-t="39" data-n="2"><title>May 5, 3pm–4pm PDT — 2 commits, +5,835 lines</title></rect><rect x="388" y="45" width="19" height="19" rx="4" fill="rgb(80,36,130)" data-t="40" data-n="1"><title>May 5, 4pm–5pm PDT — 1 commit, +3,417 lines</title></rect><rect x="409" y="45" width="19" height="19" rx="4" fill="rgb(99,39,154)" data-t="41" data-n="4"><title>May 5, 5pm–6pm PDT — 4 commits, +3,960 lines</title></rect><rect x="430" y="45" width="19" height="19" rx="4" fill="rgb(99,39,154)" data-t="42" data-n="4"><title>May 5, 6pm–7pm PDT — 4 commits, +9,179 lines</title></rect><rect x="451" y="45" width="19" height="19" rx="4" fill="rgb(99,39,154)" data-t="43" data-n="4"><title>May 5, 7pm–8pm PDT — 4 commits, +1,983 lines</title></rect><rect x="472" y="45" width="19" height="19" rx="4" fill="rgb(99,39,154)" data-t="44" data-n="4"><title>May 5, 8pm–9pm PDT — 4 commits, +18,902 lines</title></rect><rect x="493" y="45" width="19" height="19" rx="4" fill="rgb(176,29,143)" data-t="45" data-n="43"><title>May 5, 9pm–10pm PDT — 43 commits, +40,650 lines</title></rect><rect x="514" y="45" width="19" height="19" rx="4" fill="rgb(231,71,108)" data-t="46" data-n="139"><title>May 5, 10pm–11pm PDT — 139 commits, +64,842 lines</title></rect><rect x="535" y="45" width="19" height="19" rx="4" fill="rgb(231,72,107)" data-t="47" data-n="141"><title>May 5, 11pm–12am PDT — 141 commits, +34,814 lines</title></rect></g><g><text x="44" y="80" font-size="12" text-anchor="end" fill="#6b7280">May 6</text><rect x="52" y="66" width="19" height="19" rx="4" fill="rgb(191,34,135)" data-t="48" data-n="60"><title>May 6, 12am–1am PDT — 60 commits, +10,417 lines</title></rect><rect x="73" y="66" width="19" height="19" rx="4" fill="rgb(248,126,72)" data-t="49" data-n="296"><title>May 6, 1am–2am PDT — 296 commits, +38,530 lines</title></rect><rect x="94" y="66" width="19" height="19" rx="4" fill="rgb(248,129,70)" data-t="50" data-n="306"><title>May 6, 2am–3am PDT — 306 commits, +18,836 lines</title></rect><rect x="115" y="66" width="19" height="19" rx="4" fill="rgb(242,93,93)" data-t="51" data-n="196"><title>May 6, 3am–4am PDT — 196 commits, +10,245 lines</title></rect><rect x="136" y="66" width="19" height="19" rx="4" fill="rgb(206,49,125)" data-t="52" data-n="86"><title>May 6, 4am–5am PDT — 86 commits, +2,655 lines</title></rect><rect x="157" y="66" width="19" height="19" rx="4" fill="rgb(134,36,159)" data-t="53" data-n="16"><title>May 6, 5am–6am PDT — 16 commits, +289 lines</title></rect><rect x="178" y="66" width="19" height="19" rx="4" fill="#16181f"></rect><rect x="199" y="66" width="19" height="19" rx="4" fill="#16181f"></rect><rect x="220" y="66" width="19" height="19" rx="4" fill="rgb(103,39,160)" data-t="56" data-n="5"><title>May 6, 8am–9am PDT — 5 commits, +264 lines</title></rect><rect x="241" y="66" width="19" height="19" rx="4" fill="rgb(252,171,64)" data-t="57" data-n="458"><title>May 6, 9am–10am PDT — 458 commits, +16,409 lines</title></rect><rect x="262" y="66" width="19" height="19" rx="4" fill="rgb(253,224,71)" data-t="58" data-n="695"><title>May 6, 10am–11am PDT — 695 commits, +44,000 lines</title></rect><rect x="283" y="66" width="19" height="19" rx="4" fill="rgb(214,56,119)" data-t="59" data-n="102"><title>May 6, 11am–12pm PDT — 102 commits, +21,972 lines</title></rect><rect x="304" y="66" width="19" height="19" rx="4" fill="rgb(140,35,156)" data-t="60" data-n="19"><title>May 6, 12pm–1pm PDT — 19 commits, +2,891 lines</title></rect><rect x="325" y="66" width="19" height="19" rx="4" fill="rgb(94,38,149)" data-t="61" data-n="3"><title>May 6, 1pm–2pm PDT — 3 commits, +56 lines</title></rect><rect x="346" y="66" width="19" height="19" rx="4" fill="#16181f"></rect><rect x="367" y="66" width="19" height="19" rx="4" fill="rgb(193,37,134)" data-t="63" data-n="64"><title>May 6, 3pm–4pm PDT — 64 commits, +3,606 lines</title></rect><rect x="388" y="66" width="19" height="19" rx="4" fill="rgb(246,117,78)" data-t="64" data-n="264"><title>May 6, 4pm–5pm PDT — 264 commits, +60,132 lines</title></rect><rect x="409" y="66" width="19" height="19" rx="4" fill="rgb(246,118,78)" data-t="65" data-n="268"><title>May 6, 5pm–6pm PDT — 268 commits, +40,953 lines</title></rect><rect x="430" y="66" width="19" height="19" rx="4" fill="rgb(247,122,75)" data-t="66" data-n="281"><title>May 6, 6pm–7pm PDT — 281 commits, +16,283 lines</title></rect><rect x="451" y="66" width="19" height="19" rx="4" fill="rgb(245,115,80)" data-t="67" data-n="258"><title>May 6, 7pm–8pm PDT — 258 commits, +26,654 lines</title></rect><rect x="472" y="66" width="19" height="19" rx="4" fill="rgb(249,135,67)" data-t="68" data-n="327"><title>May 6, 8pm–9pm PDT — 327 commits, +16,599 lines</title></rect><rect x="493" y="66" width="19" height="19" rx="4" fill="rgb(200,42,129)" data-t="69" data-n="74"><title>May 6, 9pm–10pm PDT — 74 commits, +8,331 lines</title></rect><rect x="514" y="66" width="19" height="19" rx="4" fill="rgb(136,36,158)" data-t="70" data-n="17"><title>May 6, 10pm–11pm PDT — 17 commits, +2,200 lines</title></rect><rect x="535" y="66" width="19" height="19" rx="4" fill="rgb(122,38,163)" data-t="71" data-n="11"><title>May 6, 11pm–12am PDT — 11 commits, +3,590 lines</title></rect></g><g><text x="44" y="101" font-size="12" text-anchor="end" fill="#6b7280">May 7</text><rect x="52" y="87" width="19" height="19" rx="4" fill="rgb(136,36,158)" data-t="72" data-n="17"><title>May 7, 12am–1am PDT — 17 commits, +6,577 lines</title></rect><rect x="73" y="87" width="19" height="19" rx="4" fill="rgb(146,34,154)" data-t="73" data-n="22"><title>May 7, 1am–2am PDT — 22 commits, +8,718 lines</title></rect><rect x="94" y="87" width="19" height="19" rx="4" fill="rgb(144,34,155)" data-t="74" data-n="21"><title>May 7, 2am–3am PDT — 21 commits, +11,392 lines</title></rect><rect x="115" y="87" width="19" height="19" rx="4" fill="rgb(186,30,139)" data-t="75" data-n="53"><title>May 7, 3am–4am PDT — 53 commits, +6,476 lines</title></rect><rect x="136" y="87" width="19" height="19" rx="4" fill="rgb(160,32,149)" data-t="76" data-n="31"><title>May 7, 4am–5am PDT — 31 commits, +2,356 lines</title></rect><rect x="157" y="87" width="19" height="19" rx="4" fill="rgb(116,39,165)" data-t="77" data-n="9"><title>May 7, 5am–6am PDT — 9 commits, +1,787 lines</title></rect><rect x="178" y="87" width="19" height="19" rx="4" fill="rgb(99,39,154)" data-t="78" data-n="4"><title>May 7, 6am–7am PDT — 4 commits, +580 lines</title></rect><rect x="199" y="87" width="19" height="19" rx="4" fill="rgb(103,39,160)" data-t="79" data-n="5"><title>May 7, 7am–8am PDT — 5 commits, +181 lines</title></rect><rect x="220" y="87" width="19" height="19" rx="4" fill="#16181f"></rect><rect x="241" y="87" width="19" height="19" rx="4" fill="#16181f"></rect><rect x="262" y="87" width="19" height="19" rx="4" fill="#16181f"></rect><rect x="283" y="87" width="19" height="19" rx="4" fill="rgb(94,38,149)" data-t="83" data-n="3"><title>May 7, 11am–12pm PDT — 3 commits, +421 lines</title></rect><rect x="304" y="87" width="19" height="19" rx="4" fill="rgb(80,36,130)" data-t="84" data-n="1"><title>May 7, 12pm–1pm PDT — 1 commit, +13 lines</title></rect><rect x="325" y="87" width="19" height="19" rx="4" fill="rgb(103,39,160)" data-t="85" data-n="5"><title>May 7, 1pm–2pm PDT — 5 commits, +248 lines</title></rect><rect x="346" y="87" width="19" height="19" rx="4" fill="rgb(116,39,165)" data-t="86" data-n="9"><title>May 7, 2pm–3pm PDT — 9 commits, +2,131 lines</title></rect><rect x="367" y="87" width="19" height="19" rx="4" fill="rgb(184,28,140)" data-t="87" data-n="51"><title>May 7, 3pm–4pm PDT — 51 commits, +3,207 lines</title></rect><rect x="388" y="87" width="19" height="19" rx="4" fill="rgb(188,32,137)" data-t="88" data-n="56"><title>May 7, 4pm–5pm PDT — 56 commits, +2,647 lines</title></rect><rect x="409" y="87" width="19" height="19" rx="4" fill="rgb(238,78,103)" data-t="89" data-n="159"><title>May 7, 5pm–6pm PDT — 159 commits, +2,787 lines</title></rect><rect x="430" y="87" width="19" height="19" rx="4" fill="rgb(174,30,144)" data-t="90" data-n="42"><title>May 7, 6pm–7pm PDT — 42 commits, +1,590 lines</title></rect><rect x="451" y="87" width="19" height="19" rx="4" fill="rgb(179,29,142)" data-t="91" data-n="46"><title>May 7, 7pm–8pm PDT — 46 commits, +4,170 lines</title></rect><rect x="472" y="87" width="19" height="19" rx="4" fill="rgb(185,29,139)" data-t="92" data-n="52"><title>May 7, 8pm–9pm PDT — 52 commits, +2,113 lines</title></rect><rect x="493" y="87" width="19" height="19" rx="4" fill="rgb(154,33,151)" data-t="93" data-n="27"><title>May 7, 9pm–10pm PDT — 27 commits, +1,585 lines</title></rect><rect x="514" y="87" width="19" height="19" rx="4" fill="rgb(154,33,151)" data-t="94" data-n="27"><title>May 7, 10pm–11pm PDT — 27 commits, +2,231 lines</title></rect><rect x="535" y="87" width="19" height="19" rx="4" fill="rgb(159,32,149)" data-t="95" data-n="30"><title>May 7, 11pm–12am PDT — 30 commits, +4,987 lines</title></rect></g><g><text x="44" y="122" font-size="12" text-anchor="end" fill="#6b7280">May 8</text><rect x="52" y="108" width="19" height="19" rx="4" fill="rgb(154,33,151)" data-t="96" data-n="27"><title>May 8, 12am–1am PDT — 27 commits, +1,196 lines</title></rect><rect x="73" y="108" width="19" height="19" rx="4" fill="rgb(130,37,160)" data-t="97" data-n="14"><title>May 8, 1am–2am PDT — 14 commits, +904 lines</title></rect><rect x="94" y="108" width="19" height="19" rx="4" fill="rgb(113,39,167)" data-t="98" data-n="8"><title>May 8, 2am–3am PDT — 8 commits, +536 lines</title></rect><rect x="115" y="108" width="19" height="19" rx="4" fill="rgb(127,37,161)" data-t="99" data-n="13"><title>May 8, 3am–4am PDT — 13 commits, +253 lines</title></rect><rect x="136" y="108" width="19" height="19" rx="4" fill="rgb(94,38,149)" data-t="100" data-n="3"><title>May 8, 4am–5am PDT — 3 commits, +771 lines</title></rect><rect x="157" y="108" width="19" height="19" rx="4" fill="rgb(132,36,159)" data-t="101" data-n="15"><title>May 8, 5am–6am PDT — 15 commits, +1,545 lines</title></rect><rect x="178" y="108" width="19" height="19" rx="4" fill="rgb(125,38,162)" data-t="102" data-n="12"><title>May 8, 6am–7am PDT — 12 commits, +1,965 lines</title></rect><rect x="199" y="108" width="19" height="19" rx="4" fill="rgb(130,37,160)" data-t="103" data-n="14"><title>May 8, 7am–8am PDT — 14 commits, +1,866 lines</title></rect><rect x="220" y="108" width="19" height="19" rx="4" fill="rgb(187,31,138)" data-t="104" data-n="55"><title>May 8, 8am–9am PDT — 55 commits, +3,622 lines</title></rect><rect x="241" y="108" width="19" height="19" rx="4" fill="rgb(166,31,147)" data-t="105" data-n="35"><title>May 8, 9am–10am PDT — 35 commits, +4,778 lines</title></rect><rect x="262" y="108" width="19" height="19" rx="4" fill="rgb(80,36,130)" data-t="106" data-n="1"><title>May 8, 10am–11am PDT — 1 commit, +0 lines</title></rect><rect x="283" y="108" width="19" height="19" rx="4" fill="#16181f"></rect><rect x="304" y="108" width="19" height="19" rx="4" fill="rgb(80,36,130)" data-t="108" data-n="1"><title>May 8, 12pm–1pm PDT — 1 commit, +116 lines</title></rect><rect x="325" y="108" width="19" height="19" rx="4" fill="rgb(88,37,141)" data-t="109" data-n="2"><title>May 8, 1pm–2pm PDT — 2 commits, +66 lines</title></rect><rect x="346" y="108" width="19" height="19" rx="4" fill="rgb(116,39,165)" data-t="110" data-n="9"><title>May 8, 2pm–3pm PDT — 9 commits, +1,071 lines</title></rect><rect x="367" y="108" width="19" height="19" rx="4" fill="rgb(153,33,152)" data-t="111" data-n="26"><title>May 8, 3pm–4pm PDT — 26 commits, +1,691 lines</title></rect><rect x="388" y="108" width="19" height="19" rx="4" fill="rgb(138,35,157)" data-t="112" data-n="18"><title>May 8, 4pm–5pm PDT — 18 commits, +2,751 lines</title></rect><rect x="409" y="108" width="19" height="19" rx="4" fill="rgb(88,37,141)" data-t="113" data-n="2"><title>May 8, 5pm–6pm PDT — 2 commits, +97 lines</title></rect><rect x="430" y="108" width="19" height="19" rx="4" fill="rgb(88,37,141)" data-t="114" data-n="2"><title>May 8, 6pm–7pm PDT — 2 commits, +135 lines</title></rect><rect x="451" y="108" width="19" height="19" rx="4" fill="rgb(122,38,163)" data-t="115" data-n="11"><title>May 8, 7pm–8pm PDT — 11 commits, +1,763 lines</title></rect><rect x="472" y="108" width="19" height="19" rx="4" fill="rgb(142,35,156)" data-t="116" data-n="20"><title>May 8, 8pm–9pm PDT — 20 commits, +5,272 lines</title></rect><rect x="493" y="108" width="19" height="19" rx="4" fill="rgb(125,38,162)" data-t="117" data-n="12"><title>May 8, 9pm–10pm PDT — 12 commits, +952 lines</title></rect><rect x="514" y="108" width="19" height="19" rx="4" fill="rgb(88,37,141)" data-t="118" data-n="2"><title>May 8, 10pm–11pm PDT — 2 commits, +334 lines</title></rect><rect x="535" y="108" width="19" height="19" rx="4" fill="rgb(106,40,164)" data-t="119" data-n="6"><title>May 8, 11pm–12am PDT — 6 commits, +2,033 lines</title></rect></g><g><text x="44" y="143" font-size="12" text-anchor="end" fill="#6b7280">May 9</text><rect x="52" y="129" width="19" height="19" rx="4" fill="rgb(116,39,165)" data-t="120" data-n="9"><title>May 9, 12am–1am PDT — 9 commits, +387 lines</title></rect><rect x="73" y="129" width="19" height="19" rx="4" fill="rgb(116,39,165)" data-t="121" data-n="9"><title>May 9, 1am–2am PDT — 9 commits, +723 lines</title></rect><rect x="94" y="129" width="19" height="19" rx="4" fill="rgb(113,39,167)" data-t="122" data-n="8"><title>May 9, 2am–3am PDT — 8 commits, +98 lines</title></rect><rect x="115" y="129" width="19" height="19" rx="4" fill="rgb(193,36,134)" data-t="123" data-n="63"><title>May 9, 3am–4am PDT — 63 commits, +2,538 lines</title></rect><rect x="136" y="129" width="19" height="19" rx="4" fill="rgb(122,38,163)" data-t="124" data-n="11"><title>May 9, 4am–5am PDT — 11 commits, +8,861 lines</title></rect><rect x="157" y="129" width="19" height="19" rx="4" fill="rgb(99,39,154)" data-t="125" data-n="4"><title>May 9, 5am–6am PDT — 4 commits, +42 lines</title></rect><rect x="178" y="129" width="19" height="19" rx="4" fill="rgb(94,38,149)" data-t="126" data-n="3"><title>May 9, 6am–7am PDT — 3 commits, +2,616 lines</title></rect><rect x="199" y="129" width="19" height="19" rx="4" fill="rgb(106,40,164)" data-t="127" data-n="6"><title>May 9, 7am–8am PDT — 6 commits, +6,993 lines</title></rect><rect x="220" y="129" width="19" height="19" rx="4" fill="rgb(80,36,130)" data-t="128" data-n="1"><title>May 9, 8am–9am PDT — 1 commit, +3,705 lines</title></rect><rect x="241" y="129" width="19" height="19" rx="4" fill="rgb(122,38,163)" data-t="129" data-n="11"><title>May 9, 9am–10am PDT — 11 commits, +199 lines</title></rect><rect x="262" y="129" width="19" height="19" rx="4" fill="#16181f"></rect><rect x="283" y="129" width="19" height="19" rx="4" fill="rgb(80,36,130)" data-t="131" data-n="1"><title>May 9, 11am–12pm PDT — 1 commit, +23 lines</title></rect><rect x="304" y="129" width="19" height="19" rx="4" fill="rgb(99,39,154)" data-t="132" data-n="4"><title>May 9, 12pm–1pm PDT — 4 commits, +5,012 lines</title></rect><rect x="325" y="129" width="19" height="19" rx="4" fill="rgb(109,40,168)" data-t="133" data-n="7"><title>May 9, 1pm–2pm PDT — 7 commits, +2,080 lines</title></rect><rect x="346" y="129" width="19" height="19" rx="4" fill="rgb(106,40,164)" data-t="134" data-n="6"><title>May 9, 2pm–3pm PDT — 6 commits, +924 lines</title></rect><rect x="367" y="129" width="19" height="19" rx="4" fill="rgb(103,39,160)" data-t="135" data-n="5"><title>May 9, 3pm–4pm PDT — 5 commits, +248 lines</title></rect><rect x="388" y="129" width="19" height="19" rx="4" fill="rgb(136,36,158)" data-t="136" data-n="17"><title>May 9, 4pm–5pm PDT — 17 commits, +508 lines</title></rect><rect x="409" y="129" width="19" height="19" rx="4" fill="rgb(88,37,141)" data-t="137" data-n="2"><title>May 9, 5pm–6pm PDT — 2 commits, +135 lines</title></rect><rect x="430" y="129" width="19" height="19" rx="4" fill="rgb(99,39,154)" data-t="138" data-n="4"><title>May 9, 6pm–7pm PDT — 4 commits, +822 lines</title></rect><rect x="451" y="129" width="19" height="19" rx="4" fill="rgb(80,36,130)" data-t="139" data-n="1"><title>May 9, 7pm–8pm PDT — 1 commit, +7 lines</title></rect><rect x="472" y="129" width="19" height="19" rx="4" fill="#16181f"></rect><rect x="493" y="129" width="19" height="19" rx="4" fill="#16181f"></rect><rect x="514" y="129" width="19" height="19" rx="4" fill="#16181f"></rect><rect x="535" y="129" width="19" height="19" rx="4" fill="#16181f"></rect></g><g><text x="44" y="164" font-size="12" text-anchor="end" fill="#6b7280">May 10</text><rect x="52" y="150" width="19" height="19" rx="4" fill="rgb(99,39,154)" data-t="144" data-n="4"><title>May 10, 12am–1am PDT — 4 commits, +497 lines</title></rect><rect x="73" y="150" width="19" height="19" rx="4" fill="rgb(88,37,141)" data-t="145" data-n="2"><title>May 10, 1am–2am PDT — 2 commits, +35 lines</title></rect><rect x="94" y="150" width="19" height="19" rx="4" fill="rgb(80,36,130)" data-t="146" data-n="1"><title>May 10, 2am–3am PDT — 1 commit, +131 lines</title></rect><rect x="115" y="150" width="19" height="19" rx="4" fill="rgb(88,37,141)" data-t="147" data-n="2"><title>May 10, 3am–4am PDT — 2 commits, +322 lines</title></rect><rect x="136" y="150" width="19" height="19" rx="4" fill="rgb(80,36,130)" data-t="148" data-n="1"><title>May 10, 4am–5am PDT — 1 commit, +3 lines</title></rect><rect x="157" y="150" width="19" height="19" rx="4" fill="rgb(80,36,130)" data-t="149" data-n="1"><title>May 10, 5am–6am PDT — 1 commit, +26 lines</title></rect><rect x="178" y="150" width="19" height="19" rx="4" fill="rgb(88,37,141)" data-t="150" data-n="2"><title>May 10, 6am–7am PDT — 2 commits, +81 lines</title></rect><rect x="199" y="150" width="19" height="19" rx="4" fill="rgb(80,36,130)" data-t="151" data-n="1"><title>May 10, 7am–8am PDT — 1 commit, +5 lines</title></rect><rect x="220" y="150" width="19" height="19" rx="4" fill="rgb(99,39,154)" data-t="152" data-n="4"><title>May 10, 8am–9am PDT — 4 commits, +78 lines</title></rect><rect x="241" y="150" width="19" height="19" rx="4" fill="rgb(80,36,130)" data-t="153" data-n="1"><title>May 10, 9am–10am PDT — 1 commit, +1 lines</title></rect><rect x="262" y="150" width="19" height="19" rx="4" fill="rgb(88,37,141)" data-t="154" data-n="2"><title>May 10, 10am–11am PDT — 2 commits, +128 lines</title></rect><rect x="283" y="150" width="19" height="19" rx="4" fill="rgb(80,36,130)" data-t="155" data-n="1"><title>May 10, 11am–12pm PDT — 1 commit, +4 lines</title></rect><rect x="304" y="150" width="19" height="19" rx="4" fill="rgb(88,37,141)" data-t="156" data-n="2"><title>May 10, 12pm–1pm PDT — 2 commits, +413 lines</title></rect><rect x="325" y="150" width="19" height="19" rx="4" fill="rgb(80,36,130)" data-t="157" data-n="1"><title>May 10, 1pm–2pm PDT — 1 commit, +25 lines</title></rect><rect x="346" y="150" width="19" height="19" rx="4" fill="rgb(103,39,160)" data-t="158" data-n="5"><title>May 10, 2pm–3pm PDT — 5 commits, +327 lines</title></rect><rect x="367" y="150" width="19" height="19" rx="4" fill="rgb(106,40,164)" data-t="159" data-n="6"><title>May 10, 3pm–4pm PDT — 6 commits, +1,172 lines</title></rect><rect x="388" y="150" width="19" height="19" rx="4" fill="rgb(99,39,154)" data-t="160" data-n="4"><title>May 10, 4pm–5pm PDT — 4 commits, +752 lines</title></rect><rect x="409" y="150" width="19" height="19" rx="4" fill="rgb(94,38,149)" data-t="161" data-n="3"><title>May 10, 5pm–6pm PDT — 3 commits, +227 lines</title></rect><rect x="430" y="150" width="19" height="19" rx="4" fill="rgb(88,37,141)" data-t="162" data-n="2"><title>May 10, 6pm–7pm PDT — 2 commits, +242 lines</title></rect><rect x="451" y="150" width="19" height="19" rx="4" fill="rgb(80,36,130)" data-t="163" data-n="1"><title>May 10, 7pm–8pm PDT — 1 commit, +306 lines</title></rect><rect x="472" y="150" width="19" height="19" rx="4" fill="rgb(80,36,130)" data-t="164" data-n="1"><title>May 10, 8pm–9pm PDT — 1 commit, +54 lines</title></rect><rect x="493" y="150" width="19" height="19" rx="4" fill="rgb(88,37,141)" data-t="165" data-n="2"><title>May 10, 9pm–10pm PDT — 2 commits, +75 lines</title></rect><rect x="514" y="150" width="19" height="19" rx="4" fill="rgb(80,36,130)" data-t="166" data-n="1"><title>May 10, 10pm–11pm PDT — 1 commit, +134 lines</title></rect><rect x="535" y="150" width="19" height="19" rx="4" fill="rgb(103,39,160)" data-t="167" data-n="5"><title>May 10, 11pm–12am PDT — 5 commits, +103 lines</title></rect></g><g><text x="44" y="185" font-size="12" text-anchor="end" fill="#6b7280">May 11</text><rect x="52" y="171" width="19" height="19" rx="4" fill="rgb(88,37,141)" data-t="168" data-n="2"><title>May 11, 12am–1am PDT — 2 commits, +150 lines</title></rect><rect x="73" y="171" width="19" height="19" rx="4" fill="rgb(99,39,154)" data-t="169" data-n="4"><title>May 11, 1am–2am PDT — 4 commits, +398 lines</title></rect><rect x="94" y="171" width="19" height="19" rx="4" fill="rgb(88,37,141)" data-t="170" data-n="2"><title>May 11, 2am–3am PDT — 2 commits, +364 lines</title></rect><rect x="115" y="171" width="19" height="19" rx="4" fill="rgb(94,38,149)" data-t="171" data-n="3"><title>May 11, 3am–4am PDT — 3 commits, +44 lines</title></rect><rect x="136" y="171" width="19" height="19" rx="4" fill="rgb(109,40,168)" data-t="172" data-n="7"><title>May 11, 4am–5am PDT — 7 commits, +9,367 lines</title></rect><rect x="157" y="171" width="19" height="19" rx="4" fill="#16181f"></rect><rect x="178" y="171" width="19" height="19" rx="4" fill="rgb(88,37,141)" data-t="174" data-n="2"><title>May 11, 6am–7am PDT — 2 commits, +43 lines</title></rect><rect x="199" y="171" width="19" height="19" rx="4" fill="rgb(88,37,141)" data-t="175" data-n="2"><title>May 11, 7am–8am PDT — 2 commits, +149 lines</title></rect><rect x="220" y="171" width="19" height="19" rx="4" fill="rgb(119,38,164)" data-t="176" data-n="10"><title>May 11, 8am–9am PDT — 10 commits, +2,171 lines</title></rect><rect x="241" y="171" width="19" height="19" rx="4" fill="rgb(134,36,159)" data-t="177" data-n="16"><title>May 11, 9am–10am PDT — 16 commits, +2,047 lines</title></rect><rect x="262" y="171" width="19" height="19" rx="4" fill="rgb(138,35,157)" data-t="178" data-n="18"><title>May 11, 10am–11am PDT — 18 commits, +3,356 lines</title></rect><rect x="283" y="171" width="19" height="19" rx="4" fill="rgb(116,39,165)" data-t="179" data-n="9"><title>May 11, 11am–12pm PDT — 9 commits, +861 lines</title></rect><rect x="304" y="171" width="19" height="19" rx="4" fill="rgb(94,38,149)" data-t="180" data-n="3"><title>May 11, 12pm–1pm PDT — 3 commits, +412 lines</title></rect><rect x="325" y="171" width="19" height="19" rx="4" fill="rgb(125,38,162)" data-t="181" data-n="12"><title>May 11, 1pm–2pm PDT — 12 commits, +2,978 lines</title></rect><rect x="346" y="171" width="19" height="19" rx="4" fill="rgb(237,77,103)" data-t="182" data-n="157"><title>May 11, 2pm–3pm PDT — 157 commits, +10,700 lines</title></rect><rect x="367" y="171" width="19" height="19" rx="4" fill="rgb(134,36,159)" data-t="183" data-n="16"><title>May 11, 3pm–4pm PDT — 16 commits, +1,346 lines</title></rect><rect x="388" y="171" width="19" height="19" rx="4" fill="rgb(94,38,149)" data-t="184" data-n="3"><title>May 11, 4pm–5pm PDT — 3 commits, +78 lines</title></rect><rect x="409" y="171" width="19" height="19" rx="4" fill="rgb(173,30,144)" data-t="185" data-n="41"><title>May 11, 5pm–6pm PDT — 41 commits, +2,568 lines</title></rect><rect x="430" y="171" width="19" height="19" rx="4" fill="rgb(187,31,138)" data-t="186" data-n="55"><title>May 11, 6pm–7pm PDT — 55 commits, +4,912 lines</title></rect><rect x="451" y="171" width="19" height="19" rx="4" fill="rgb(186,30,139)" data-t="187" data-n="53"><title>May 11, 7pm–8pm PDT — 53 commits, +3,475 lines</title></rect><rect x="472" y="171" width="19" height="19" rx="4" fill="rgb(162,32,148)" data-t="188" data-n="32"><title>May 11, 8pm–9pm PDT — 32 commits, +1,732 lines</title></rect><rect x="493" y="171" width="19" height="19" rx="4" fill="rgb(179,29,142)" data-t="189" data-n="46"><title>May 11, 9pm–10pm PDT — 46 commits, +4,506 lines</title></rect><rect x="514" y="171" width="19" height="19" rx="4" fill="rgb(178,29,142)" data-t="190" data-n="45"><title>May 11, 10pm–11pm PDT — 45 commits, +1,711 lines</title></rect><rect x="535" y="171" width="19" height="19" rx="4" fill="rgb(185,29,139)" data-t="191" data-n="52"><title>May 11, 11pm–12am PDT — 52 commits, +10,850 lines</title></rect></g><g><text x="44" y="206" font-size="12" text-anchor="end" fill="#6b7280">May 12</text><rect x="52" y="192" width="19" height="19" rx="4" fill="rgb(159,32,149)" data-t="192" data-n="30"><title>May 12, 12am–1am PDT — 30 commits, +3,760 lines</title></rect><rect x="73" y="192" width="19" height="19" rx="4" fill="rgb(149,34,153)" data-t="193" data-n="24"><title>May 12, 1am–2am PDT — 24 commits, +9,443 lines</title></rect><rect x="94" y="192" width="19" height="19" rx="4" fill="rgb(173,30,144)" data-t="194" data-n="41"><title>May 12, 2am–3am PDT — 41 commits, +1,635 lines</title></rect><rect x="115" y="192" width="19" height="19" rx="4" fill="rgb(171,30,145)" data-t="195" data-n="39"><title>May 12, 3am–4am PDT — 39 commits, +788 lines</title></rect><rect x="136" y="192" width="19" height="19" rx="4" fill="rgb(154,33,151)" data-t="196" data-n="27"><title>May 12, 4am–5am PDT — 27 commits, +651 lines</title></rect><rect x="157" y="192" width="19" height="19" rx="4" fill="rgb(148,34,154)" data-t="197" data-n="23"><title>May 12, 5am–6am PDT — 23 commits, +779 lines</title></rect><rect x="178" y="192" width="19" height="19" rx="4" fill="rgb(80,36,130)" data-t="198" data-n="1"><title>May 12, 6am–7am PDT — 1 commit, +137,576 lines</title></rect><rect x="199" y="192" width="19" height="19" rx="4" fill="rgb(88,37,141)" data-t="199" data-n="2"><title>May 12, 7am–8am PDT — 2 commits, +81 lines</title></rect><rect x="220" y="192" width="19" height="19" rx="4" fill="rgb(88,37,141)" data-t="200" data-n="2"><title>May 12, 8am–9am PDT — 2 commits, +75 lines</title></rect><rect x="241" y="192" width="19" height="19" rx="4" fill="rgb(88,37,141)" data-t="201" data-n="2"><title>May 12, 9am–10am PDT — 2 commits, +130 lines</title></rect><rect x="262" y="192" width="19" height="19" rx="4" fill="rgb(103,39,160)" data-t="202" data-n="5"><title>May 12, 10am–11am PDT — 5 commits, +160 lines</title></rect><rect x="283" y="192" width="19" height="19" rx="4" fill="rgb(88,37,141)" data-t="203" data-n="2"><title>May 12, 11am–12pm PDT — 2 commits, +20 lines</title></rect><rect x="304" y="192" width="19" height="19" rx="4" fill="rgb(80,36,130)" data-t="204" data-n="1"><title>May 12, 12pm–1pm PDT — 1 commit, +2 lines</title></rect><rect x="325" y="192" width="19" height="19" rx="4" fill="rgb(159,32,149)" data-t="205" data-n="30"><title>May 12, 1pm–2pm PDT — 30 commits, +2,677 lines</title></rect><rect x="346" y="192" width="19" height="19" rx="4" fill="rgb(173,30,144)" data-t="206" data-n="41"><title>May 12, 2pm–3pm PDT — 41 commits, +7,022 lines</title></rect><rect x="367" y="192" width="19" height="19" rx="4" fill="rgb(99,39,154)" data-t="207" data-n="4"><title>May 12, 3pm–4pm PDT — 4 commits, +200 lines</title></rect><rect x="388" y="192" width="19" height="19" rx="4" fill="rgb(154,33,151)" data-t="208" data-n="27"><title>May 12, 4pm–5pm PDT — 27 commits, +1,423 lines</title></rect><rect x="409" y="192" width="19" height="19" rx="4" fill="rgb(140,35,156)" data-t="209" data-n="19"><title>May 12, 5pm–6pm PDT — 19 commits, +1,055 lines</title></rect><rect x="430" y="192" width="19" height="19" rx="4" fill="rgb(88,37,141)" data-t="210" data-n="2"><title>May 12, 6pm–7pm PDT — 2 commits, +380 lines</title></rect><rect x="451" y="192" width="19" height="19" rx="4" fill="rgb(88,37,141)" data-t="211" data-n="2"><title>May 12, 7pm–8pm PDT — 2 commits, +84 lines</title></rect><rect x="472" y="192" width="19" height="19" rx="4" fill="#16181f"></rect><rect x="493" y="192" width="19" height="19" rx="4" fill="rgb(109,40,168)" data-t="213" data-n="7"><title>May 12, 9pm–10pm PDT — 7 commits, +273 lines</title></rect><rect x="514" y="192" width="19" height="19" rx="4" fill="rgb(94,38,149)" data-t="214" data-n="3"><title>May 12, 10pm–11pm PDT — 3 commits, +230 lines</title></rect><rect x="535" y="192" width="19" height="19" rx="4" fill="rgb(109,40,168)" data-t="215" data-n="7"><title>May 12, 11pm–12am PDT — 7 commits, +319 lines</title></rect></g><g><text x="44" y="227" font-size="12" text-anchor="end" fill="#6b7280">May 13</text><rect x="52" y="213" width="19" height="19" rx="4" fill="rgb(88,37,141)" data-t="216" data-n="2"><title>May 13, 12am–1am PDT — 2 commits, +133 lines</title></rect><rect x="73" y="213" width="19" height="19" rx="4" fill="rgb(130,37,160)" data-t="217" data-n="14"><title>May 13, 1am–2am PDT — 14 commits, +2,177 lines</title></rect><rect x="94" y="213" width="19" height="19" rx="4" fill="rgb(125,38,162)" data-t="218" data-n="12"><title>May 13, 2am–3am PDT — 12 commits, +685 lines</title></rect><rect x="115" y="213" width="19" height="19" rx="4" fill="#16181f"></rect><rect x="136" y="213" width="19" height="19" rx="4" fill="rgb(119,38,164)" data-t="220" data-n="10"><title>May 13, 4am–5am PDT — 10 commits, +657 lines</title></rect><rect x="157" y="213" width="19" height="19" rx="4" fill="rgb(80,36,130)" data-t="221" data-n="1"><title>May 13, 5am–6am PDT — 1 commit, +687 lines</title></rect><rect x="178" y="213" width="19" height="19" rx="4" fill="rgb(122,38,163)" data-t="222" data-n="11"><title>May 13, 6am–7am PDT — 11 commits, +380 lines</title></rect><rect x="199" y="213" width="19" height="19" rx="4" fill="rgb(125,38,162)" data-t="223" data-n="12"><title>May 13, 7am–8am PDT — 12 commits, +5,247 lines</title></rect><rect x="220" y="213" width="19" height="19" rx="4" fill="rgb(130,37,160)" data-t="224" data-n="14"><title>May 13, 8am–9am PDT — 14 commits, +1,051 lines</title></rect><rect x="241" y="213" width="19" height="19" rx="4" fill="rgb(109,40,168)" data-t="225" data-n="7"><title>May 13, 9am–10am PDT — 7 commits, +680 lines</title></rect><rect x="262" y="213" width="19" height="19" rx="4" fill="rgb(119,38,164)" data-t="226" data-n="10"><title>May 13, 10am–11am PDT — 10 commits, +412 lines</title></rect><rect x="283" y="213" width="19" height="19" rx="4" fill="rgb(106,40,164)" data-t="227" data-n="6"><title>May 13, 11am–12pm PDT — 6 commits, +314 lines</title></rect><rect x="304" y="213" width="19" height="19" rx="4" fill="rgb(119,38,164)" data-t="228" data-n="10"><title>May 13, 12pm–1pm PDT — 10 commits, +2,980 lines</title></rect><rect x="325" y="213" width="19" height="19" rx="4" fill="rgb(80,36,130)" data-t="229" data-n="1"><title>May 13, 1pm–2pm PDT — 1 commit, +0 lines</title></rect><rect x="346" y="213" width="19" height="19" rx="4" fill="rgb(94,38,149)" data-t="230" data-n="3"><title>May 13, 2pm–3pm PDT — 3 commits, +439 lines</title></rect><rect x="367" y="213" width="19" height="19" rx="4" fill="#16181f"></rect><rect x="388" y="213" width="19" height="19" rx="4" fill="#16181f"></rect><rect x="409" y="213" width="19" height="19" rx="4" fill="rgb(109,40,168)" data-t="233" data-n="7"><title>May 13, 5pm–6pm PDT — 7 commits, +114 lines</title></rect><rect x="430" y="213" width="19" height="19" rx="4" fill="rgb(99,39,154)" data-t="234" data-n="4"><title>May 13, 6pm–7pm PDT — 4 commits, +605 lines</title></rect><rect x="451" y="213" width="19" height="19" rx="4" fill="#16181f"></rect><rect x="472" y="213" width="19" height="19" rx="4" fill="#16181f"></rect><rect x="493" y="213" width="19" height="19" rx="4" fill="rgb(80,36,130)" data-t="237" data-n="1"><title>May 13, 9pm–10pm PDT — 1 commit, +13 lines</title></rect><rect x="514" y="213" width="19" height="19" rx="4" fill="rgb(80,36,130)" data-t="238" data-n="1"><title>May 13, 10pm–11pm PDT — 1 commit, +48 lines</title></rect><rect x="535" y="213" width="19" height="19" rx="4" fill="rgb(80,36,130)" data-t="239" data-n="1"><title>May 13, 11pm–12am PDT — 1 commit, +8 lines</title></rect></g><g><text x="44" y="248" font-size="12" text-anchor="end" fill="#6b7280">May 14</text><rect x="52" y="234" width="19" height="19" rx="4" fill="rgb(80,36,130)" data-t="240" data-n="1"><title>May 14, 12am–1am PDT — 1 commit, +150 lines</title></rect><rect x="73" y="234" width="19" height="19" rx="4" fill="#16181f"></rect><rect x="94" y="234" width="19" height="19" rx="4" fill="#16181f"></rect><rect x="115" y="234" width="19" height="19" rx="4" fill="#16181f"></rect><rect x="136" y="234" width="19" height="19" rx="4" fill="#16181f"></rect><rect x="157" y="234" width="19" height="19" rx="4" fill="#16181f"></rect><rect x="178" y="234" width="19" height="19" rx="4" fill="#16181f"></rect><rect x="199" y="234" width="19" height="19" rx="4" fill="#16181f"></rect><rect x="220" y="234" width="19" height="19" rx="4" fill="#16181f"></rect><rect x="241" y="234" width="19" height="19" rx="4" fill="#16181f"></rect><rect x="262" y="234" width="19" height="19" rx="4" fill="#16181f"></rect><rect x="283" y="234" width="19" height="19" rx="4" fill="#16181f"></rect><rect x="304" y="234" width="19" height="19" rx="4" fill="#16181f"></rect><rect x="325" y="234" width="19" height="19" rx="4" fill="#16181f"></rect><rect x="346" y="234" width="19" height="19" rx="4" fill="#16181f"></rect><rect x="367" y="234" width="19" height="19" rx="4" fill="#16181f"></rect><rect x="388" y="234" width="19" height="19" rx="4" fill="#16181f"></rect><rect x="409" y="234" width="19" height="19" rx="4" fill="#16181f"></rect><rect x="430" y="234" width="19" height="19" rx="4" fill="#16181f"></rect><rect x="451" y="234" width="19" height="19" rx="4" fill="#16181f"></rect><rect x="472" y="234" width="19" height="19" rx="4" fill="#16181f"></rect><rect x="493" y="234" width="19" height="19" rx="4" fill="#16181f"></rect><rect x="514" y="234" width="19" height="19" rx="4" fill="#16181f"></rect><rect x="535" y="234" width="19" height="19" rx="4" fill="#16181f"></rect></g></svg>

port branch 上的每个 commit（排除 merge）按小时分桶。峰值小时：695 个 commit。

注意时间分布不均吗？我忘了提高运行它的 EC2 instance 的默认 IOPS。一个慢 `grep` 命令就足以让磁盘读写卡住好几分钟。

### [把编译错误当作工作队列](#compiler-errors-as-a-work-queue)

写完所有代码后，我让 Claude 写一个 workflow 来修复每个编译错误。我们按 crate 一个一个推进。

✻ claude code · dynamic workflow

≈16,000 errors left

Wed, May 6, 12:40 AM PDT

errors.txt0 fix commits

error: deref \*mut EventLoop before field access

error: js\_parser/ast/E.rs: port json\_stringify for Number/BigInt/RegExp

error: NodeHTTPResponse.rs: wire JSNodeHTTPResponse cached accessors vi

error\[E0034\]: multiple applicable items in scope

error: test\_command.rs: wire coverage façade to bun\_sourcemap\_jsc::code

error: bundler/ungate\_support.rs: un-gate bun\_css shim to real ::bun\_cs

error: dns.rs: implement pending\_cache\_for/get\_key/get\_or\_put\_into\_reso

error: css/css\_parser.rs: port DefineShorthand contract, parse\_bundler,

error: runtime/crypto/mod.rs: create\_crypto\_error delegates to boringss

error: bun\_core/fmt.rs: implement format\_ip reborrow (offset-based slic

error: event\_loop/EventLoopTimer.rs: port Timespec::ns from bun.zig

divvied up · 64 claudes

worktree 1

→→

→→

→→

→→

worktree 2

→→

→→

→→

→→

worktree 3

→→

→→

→→

→→

worktree 4

→→

→→

→→

→→

1 fixes2 review1 applies

→ commits land per crate

Phase D 的工作方式，按它真实的 1610 个 commit 回放（5 月 6 日，PDT）：cargo check 把约 16000 条错误写入文件，按 crate 分组；workflow 把它们分给 64 个 Claude：4 个 worktree 上共 16 个循环，每个循环 1 个 Claude 修复、2 个 review、1 个应用。每个 chip 都是一批真实 commit：它们落在实际 crate 上，随后计数器才移动。错误行是真实的 commit subject。

最棘手的一类错误是循环依赖。

我们的 Zig 代码库是一个编译单元（实际上就是一个 crate）。我想把新的 Rust 代码库拆成大约 100 个 crate，这样 Rust 编译更快；但这需要避免循环依赖，同时尽量少偏离原 Zig 实现。我在开始 Rust 重写前立刻提交的[这个 PR](https://github.com/oven-sh/bun/pull/30224)并不充分。我没有推倒重来，而是又跑了一个 workflow，用来分类有循环依赖的代码应该放在哪里，并全部写下来；然后再跑另一个 workflow 执行重构。

修复循环依赖暴露了大约 16000 个编译错误。对 1 个人来说这是巨量；对 64 个 Claude 同时工作来说，并不离谱。

为了最大化并行度，workflow 会按每个 crate 循环：

*   对每个 crate 运行 `cargo check`，按文件分组输出并把错误保存到文件
*   修复这个 crate 内的所有编译错误
*   2 个 adversarial reviewer review 这个 crate 的变更
*   1 个 fixer 应用修复

为了防止 Claude 互相踩脚，`cargo check` 只在最开始运行；和其他运行一样，直到最后才允许 `git`。

#### 又一次误启动

Claude 把“让所有 crate 编译通过”理解成了“把有编译错误的函数 stub 掉”。Claude 还开始加入可疑地长的解释性注释来说明 workaround，所以我给 adversarial reviewer 加了这条拒绝规则：

如果你需要一整段注释来证明 workaround 没问题，那代码就是错的，修代码。

改了一次 prompt，几个小时后，这些情况就不再发生了。

### [Smoke test](#smoke-tests)

模型很爱说“smoke tests”。

一旦 `cargo check` 通过，下一步就是让它能编译并运行 `bun --version`。它先是有 linker error。然后一启动就 panic。

下一个目标是让它能运行 `bun test <file>`。一旦这能工作，我们就可以开始跑测试了！于是又来了一个 workflow，围绕 bun CLI 子命令循环：

*   把每个失败 stacktrace 连同它的子命令保存到文件
*   对按子命令分组的每个失败 stacktrace，让 1 个 Claude 修复
*   2 个 adversarial reviewer
*   1 个 fixer 应用建议

### [让测试套件在本地通过](#get-the-test-suite-passing-locally)

这个 workflow 围绕测试文件循环。

随机运行大约 100 个测试文件，按代码库文件夹分片到 4 个 worktree 中的一个。对每个失败测试，保存 stacktrace 和错误到文件，1 个 implementer 提出修复，2 个 adversarial reviewer，然后 1 个 fixer 应用。

#### 更多误启动

我们的测试套件有很多内存泄漏测试，也有少数集成测试可能运行超过一分钟，例如一个运行 `next dev` 并检查 hot module reloading 是否能连续 100 次拾取变更的测试。其中一些测试在 debug build 中会 timeout。

我们还有会耗尽机器最大 TCP socket 数的压力测试、读写数 GB 磁盘的测试，以及会 spawn 大约 1 万个进程的测试。

这需要比“拜托了”更强的隔离，所以我们用 `systemd-run`（cgroups）限制内存和 CPU 使用，并隔离 pid namespace。即便如此，机器还是几次用光磁盘空间并崩溃。

### [让测试套件在 CI 中通过](#get-the-test-suite-passing-in-ci)

第一次 CI 运行两天后，失败列表从 972 个测试文件降到 23 个。又过了一天半，Linux 全绿了。也是第一次，这次 Rust 重写真的让人感觉会成功。

✻ claude code · dynamic workflowbuildkite · the race to green, by platformWindows finished last · May 11, 6:23 AM PDT

6 / 6 platforms green

build #54202 · Thu, May 14, 12:23 AM PDT

macOS x64 · 2 shards

<svg viewBox="0 0 700 22" preserveAspectRatio="none"><line x1="0" y1="11" x2="700" y2="11" stroke="#1c2029"></line><rect x="0.0" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778279462072"><title>build #52897: shard failures</title></rect><rect x="9.2" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778285617159"><title>build #52932: shard failures</title></rect><rect x="10.6" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778286539080"><title>build #52934: shard failures</title></rect><rect x="13.7" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778288639709"><title>build #52938: shard failures</title></rect><rect x="16.4" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778290397797"><title>build #52944: shard failures</title></rect><rect x="19.8" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778292667177"><title>build #52946: shard failures</title></rect><rect x="22.3" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778294381769"><title>build #52949: shard failures</title></rect><rect x="35.3" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778303035730"><title>build #52975: shard failures</title></rect><rect x="49.5" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778312565917"><title>build #52998: shard failures</title></rect><rect x="56.4" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778317155949"><title>build #53007: shard failures</title></rect><rect x="67.5" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778324572426"><title>build #53015: shard failures</title></rect><rect x="75.5" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778329907188"><title>build #53026: shard failures</title></rect><rect x="79.3" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778332457458"><title>build #53027: shard failures</title></rect><rect x="90.9" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778340231453"><title>build #53035: shard failures</title></rect><rect x="97.0" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778344309177"><title>build #53041: shard failures</title></rect><rect x="109.6" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778352753314"><title>build #53047: shard failures</title></rect><rect x="115.5" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778356673879"><title>build #53056: shard failures</title></rect><rect x="128.9" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778365599534"><title>build #53077: shard failures</title></rect><rect x="139.5" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778372723849"><title>build #53090: shard failures</title></rect><rect x="144.7" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778376165815"><title>build #53095: shard failures</title></rect><rect x="149.5" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778379391821"><title>build #53106: shard failures</title></rect><rect x="153.1" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778381814145"><title>build #53109: shard failures</title></rect><rect x="182.8" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778401647585"><title>build #53123: shard failures</title></rect><rect x="188.5" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778405457180"><title>build #53127: shard failures</title></rect><rect x="194.5" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778409511638"><title>build #53130: shard failures</title></rect><rect x="198.4" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778412078888"><title>build #53131: shard failures</title></rect><rect x="208.6" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778418905195"><title>build #53133: shard failures</title></rect><rect x="211.0" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778420530193"><title>build #53134: shard failures</title></rect><rect x="220.4" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778426824913"><title>build #53143: shard failures</title></rect><rect x="224.6" y="5" width="3.7" height="12" rx="1.5" fill="#22c55e" data-t="1778429599152"><title>build #53149: all shards passed</title></rect><rect x="230.5" y="5" width="3.7" height="12" rx="1.5" fill="#22c55e" data-t="1778433522519"><title>build #53159: all shards passed</title></rect><rect x="237.0" y="5" width="3.7" height="12" rx="1.5" fill="#22c55e" data-t="1778437887371"><title>build #53164: all shards passed</title></rect><rect x="240.5" y="5" width="3.7" height="12" rx="1.5" fill="#22c55e" data-t="1778440258026"><title>build #53167: all shards passed</title></rect><rect x="246.1" y="5" width="3.7" height="12" rx="1.5" fill="#22c55e" data-t="1778443972675"><title>build #53172: all shards passed</title></rect><rect x="250.9" y="5" width="3.7" height="12" rx="1.5" fill="#22c55e" data-t="1778447201783"><title>build #53176: all shards passed</title></rect><rect x="261.3" y="5" width="3.7" height="12" rx="1.5" fill="#22c55e" data-t="1778454131412"><title>build #53194: all shards passed</title></rect><rect x="270.5" y="5" width="3.7" height="12" rx="1.5" fill="#22c55e" data-t="1778460291189"><title>build #53208: all shards passed</title></rect><rect x="279.7" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778466465334"><title>build #53213: shard failures</title></rect><rect x="283.6" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778469027411"><title>build #53214: shard failures</title></rect><rect x="291.6" y="5" width="3.7" height="12" rx="1.5" fill="#166534" data-t="1778474403042"><title>build #53216: no failures (partial run)</title></rect><rect x="294.7" y="5" width="3.7" height="12" rx="1.5" fill="#22c55e" data-t="1778476492555"><title>build #53222: all shards passed</title></rect><rect x="299.9" y="5" width="3.7" height="12" rx="1.5" fill="#166534" data-t="1778479944641"><title>build #53229: no failures (partial run)</title></rect><rect x="306.5" y="5" width="3.7" height="12" rx="1.5" fill="#22c55e" data-t="1778484359935"><title>build #53241: all shards passed</title></rect><rect x="317.6" y="5" width="3.7" height="12" rx="1.5" fill="#22c55e" data-t="1778491758512"><title>build #53265: all shards passed</title></rect><rect x="321.3" y="5" width="3.7" height="12" rx="1.5" fill="#22c55e" data-t="1778494219216"><title>build #53271: all shards passed</title></rect><rect x="330.9" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778500686033"><title>build #53304: shard failures</title></rect><rect x="338.6" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778505787528"><title>build #53327: shard failures</title></rect><rect x="342.2" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778508246393"><title>build #53340: shard failures</title></rect><rect x="358.4" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778519059056"><title>build #53401: shard failures</title></rect><rect x="367.2" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778524908434"><title>build #53431: shard failures</title></rect><rect x="387.1" y="5" width="3.7" height="12" rx="1.5" fill="#22c55e" data-t="1778538232085"><title>build #53491: all shards passed</title></rect><rect x="390.3" y="5" width="3.7" height="12" rx="1.5" fill="#22c55e" data-t="1778540351128"><title>build #53503: all shards passed</title></rect><rect x="467.1" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778591726306"><title>build #53748: shard failures</title></rect><rect x="472.5" y="5" width="3.7" height="12" rx="1.5" fill="#22c55e" data-t="1778595358796"><title>build #53753: all shards passed</title></rect><rect x="494.2" y="5" width="3.7" height="12" rx="1.5" fill="#22c55e" data-t="1778609844754"><title>build #53787: all shards passed</title></rect><rect x="499.9" y="5" width="3.7" height="12" rx="1.5" fill="#22c55e" data-t="1778613619808"><title>build #53811: all shards passed</title></rect><rect x="533.7" y="5" width="3.7" height="12" rx="1.5" fill="#166534" data-t="1778636255241"><title>build #53933: no failures (partial run)</title></rect><rect x="538.7" y="5" width="3.7" height="12" rx="1.5" fill="#22c55e" data-t="1778639560231"><title>build #53952: all shards passed</title></rect><rect x="554.4" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778650067725"><title>build #53983: shard failures</title></rect><rect x="559.7" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778653591179"><title>build #53992: shard failures</title></rect><rect x="564.0" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778656476983"><title>build #53999: shard failures</title></rect><rect x="578.1" y="5" width="3.7" height="12" rx="1.5" fill="#22c55e" data-t="1778665925729"><title>build #54012: all shards passed</title></rect><rect x="584.3" y="5" width="3.7" height="12" rx="1.5" fill="#22c55e" data-t="1778670072856"><title>build #54015: all shards passed</title></rect><rect x="588.4" y="5" width="3.7" height="12" rx="1.5" fill="#22c55e" data-t="1778672784257"><title>build #54017: all shards passed</title></rect><rect x="591.8" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778675062708"><title>build #54022: shard failures</title></rect><rect x="597.4" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778678848858"><title>build #54026: shard failures</title></rect><rect x="604.3" y="5" width="3.7" height="12" rx="1.5" fill="#22c55e" data-t="1778683462751"><title>build #54033: all shards passed</title></rect><rect x="610.8" y="5" width="3.7" height="12" rx="1.5" fill="#22c55e" data-t="1778687784994"><title>build #54040: all shards passed</title></rect><rect x="616.4" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778691529170"><title>build #54047: shard failures</title></rect><rect x="619.9" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778693845953"><title>build #54049: shard failures</title></rect><rect x="626.1" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778698037702"><title>build #54057: shard failures</title></rect><rect x="632.0" y="5" width="3.7" height="12" rx="1.5" fill="#22c55e" data-t="1778701929104"><title>build #54064: all shards passed</title></rect><rect x="634.9" y="5" width="3.7" height="12" rx="1.5" fill="#22c55e" data-t="1778703903947"><title>build #54074: all shards passed</title></rect><rect x="642.8" y="5" width="3.7" height="12" rx="1.5" fill="#22c55e" data-t="1778709170760"><title>build #54093: all shards passed</title></rect><rect x="658.2" y="5" width="3.7" height="12" rx="1.5" fill="#166534" data-t="1778719478067"><title>build #54144: no failures (partial run)</title></rect><rect x="663.4" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778722963662"><title>build #54161: shard failures</title></rect><rect x="681.1" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778734794539"><title>build #54186: shard failures</title></rect><rect x="684.9" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778737331124"><title>build #54189: shard failures</title></rect><rect x="687.8" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778739258833"><title>build #54196: shard failures</title></rect><rect x="694.0" y="1" width="8.2" height="20" rx="2.5" fill="#22c55e" stroke="#86efac" stroke-width="1" data-t="1778743400428"><title>build #54202: all shards passed</title></rect></svg>

✓

Linux arm64 · 60 shards

<svg viewBox="0 0 700 22" preserveAspectRatio="none"><line x1="0" y1="11" x2="700" y2="11" stroke="#1c2029"></line><rect x="10.6" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778286539080"><title>build #52934: shard failures</title></rect><rect x="13.7" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778288639709"><title>build #52938: shard failures</title></rect><rect x="16.4" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778290397797"><title>build #52944: shard failures</title></rect><rect x="31.1" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778300246226"><title>build #52969: shard failures</title></rect><rect x="35.3" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778303035730"><title>build #52975: shard failures</title></rect><rect x="40.1" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778306256146"><title>build #52980: shard failures</title></rect><rect x="42.7" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778308011445"><title>build #52988: shard failures</title></rect><rect x="46.4" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778310457038"><title>build #52996: shard failures</title></rect><rect x="49.5" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778312565917"><title>build #52998: shard failures</title></rect><rect x="56.4" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778317155949"><title>build #53007: shard failures</title></rect><rect x="62.5" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778321238178"><title>build #53013: shard failures</title></rect><rect x="64.9" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778322833822"><title>build #53014: shard failures</title></rect><rect x="67.5" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778324572426"><title>build #53015: shard failures</title></rect><rect x="75.5" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778329907188"><title>build #53026: shard failures</title></rect><rect x="79.3" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778332457458"><title>build #53027: shard failures</title></rect><rect x="84.2" y="5" width="3.7" height="12" rx="1.5" fill="#166534" data-t="1778335776717"><title>build #53031: no failures (partial run)</title></rect><rect x="86.3" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778337168723"><title>build #53032: shard failures</title></rect><rect x="90.9" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778340231453"><title>build #53035: shard failures</title></rect><rect x="97.0" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778344309177"><title>build #53041: shard failures</title></rect><rect x="109.6" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778352753314"><title>build #53047: shard failures</title></rect><rect x="115.5" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778356673879"><title>build #53056: shard failures</title></rect><rect x="120.5" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778359988345"><title>build #53059: shard failures</title></rect><rect x="128.9" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778365599534"><title>build #53077: shard failures</title></rect><rect x="134.6" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778369422049"><title>build #53083: shard failures</title></rect><rect x="136.6" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778370783670"><title>build #53086: shard failures</title></rect><rect x="139.5" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778372723849"><title>build #53090: shard failures</title></rect><rect x="144.7" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778376165815"><title>build #53095: shard failures</title></rect><rect x="149.5" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778379391821"><title>build #53106: shard failures</title></rect><rect x="153.1" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778381814145"><title>build #53109: shard failures</title></rect><rect x="182.8" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778401647585"><title>build #53123: shard failures</title></rect><rect x="188.5" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778405457180"><title>build #53127: shard failures</title></rect><rect x="194.5" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778409511638"><title>build #53130: shard failures</title></rect><rect x="198.4" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778412078888"><title>build #53131: shard failures</title></rect><rect x="208.6" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778418905195"><title>build #53133: shard failures</title></rect><rect x="211.0" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778420530193"><title>build #53134: shard failures</title></rect><rect x="215.7" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778423666121"><title>build #53135: shard failures</title></rect><rect x="220.4" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778426824913"><title>build #53143: shard failures</title></rect><rect x="224.6" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778429599152"><title>build #53149: shard failures</title></rect><rect x="230.5" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778433522519"><title>build #53159: shard failures</title></rect><rect x="237.0" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778437887371"><title>build #53164: shard failures</title></rect><rect x="240.5" y="5" width="3.7" height="12" rx="1.5" fill="#22c55e" data-t="1778440258026"><title>build #53167: all shards passed</title></rect><rect x="246.1" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778443972675"><title>build #53172: shard failures</title></rect><rect x="250.9" y="5" width="3.7" height="12" rx="1.5" fill="#22c55e" data-t="1778447201783"><title>build #53176: all shards passed</title></rect><rect x="258.4" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778452219686"><title>build #53188: shard failures</title></rect><rect x="261.3" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778454131412"><title>build #53194: shard failures</title></rect><rect x="270.5" y="5" width="3.7" height="12" rx="1.5" fill="#22c55e" data-t="1778460291189"><title>build #53208: all shards passed</title></rect><rect x="277.0" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778464603443"><title>build #53212: shard failures</title></rect><rect x="279.7" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778466465334"><title>build #53213: shard failures</title></rect><rect x="283.6" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778469027411"><title>build #53214: shard failures</title></rect><rect x="291.6" y="5" width="3.7" height="12" rx="1.5" fill="#22c55e" data-t="1778474403042"><title>build #53216: all shards passed</title></rect><rect x="294.7" y="5" width="3.7" height="12" rx="1.5" fill="#22c55e" data-t="1778476492555"><title>build #53222: all shards passed</title></rect><rect x="299.9" y="5" width="3.7" height="12" rx="1.5" fill="#22c55e" data-t="1778479944641"><title>build #53229: all shards passed</title></rect><rect x="303.9" y="5" width="3.7" height="12" rx="1.5" fill="#166534" data-t="1778482647190"><title>build #53236: no failures (partial run)</title></rect><rect x="306.5" y="5" width="3.7" height="12" rx="1.5" fill="#22c55e" data-t="1778484359935"><title>build #53241: all shards passed</title></rect><rect x="314.2" y="5" width="3.7" height="12" rx="1.5" fill="#22c55e" data-t="1778489494954"><title>build #53260: all shards passed</title></rect><rect x="317.6" y="5" width="3.7" height="12" rx="1.5" fill="#22c55e" data-t="1778491758512"><title>build #53265: all shards passed</title></rect><rect x="321.3" y="5" width="3.7" height="12" rx="1.5" fill="#22c55e" data-t="1778494219216"><title>build #53271: all shards passed</title></rect><rect x="325.1" y="5" width="3.7" height="12" rx="1.5" fill="#166534" data-t="1778496772834"><title>build #53280: no failures (partial run)</title></rect><rect x="329.0" y="5" width="3.7" height="12" rx="1.5" fill="#166534" data-t="1778499376993"><title>build #53298: no failures (partial run)</title></rect><rect x="330.9" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778500686033"><title>build #53304: shard failures</title></rect><rect x="338.6" y="5" width="3.7" height="12" rx="1.5" fill="#22c55e" data-t="1778505787528"><title>build #53327: all shards passed</title></rect><rect x="342.2" y="5" width="3.7" height="12" rx="1.5" fill="#22c55e" data-t="1778508246393"><title>build #53340: all shards passed</title></rect><rect x="349.5" y="5" width="3.7" height="12" rx="1.5" fill="#166534" data-t="1778513130215"><title>build #53360: no failures (partial run)</title></rect><rect x="362.2" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778521581361"><title>build #53419: shard failures</title></rect><rect x="367.2" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778524908434"><title>build #53431: shard failures</title></rect><rect x="377.7" y="5" width="3.7" height="12" rx="1.5" fill="#166534" data-t="1778531962718"><title>build #53458: no failures (partial run)</title></rect><rect x="384.4" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778536408926"><title>build #53485: shard failures</title></rect><rect x="387.1" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778538232085"><title>build #53491: shard failures</title></rect><rect x="390.3" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778540351128"><title>build #53503: shard failures</title></rect><rect x="393.9" y="5" width="3.7" height="12" rx="1.5" fill="#166534" data-t="1778542762197"><title>build #53514: no failures (partial run)</title></rect><rect x="408.6" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778552598988"><title>build #53570: shard failures</title></rect><rect x="415.7" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778557345511"><title>build #53583: shard failures</title></rect><rect x="422.1" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778561602880"><title>build #53599: shard failures</title></rect><rect x="467.1" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778591726306"><title>build #53748: shard failures</title></rect><rect x="472.5" y="5" width="3.7" height="12" rx="1.5" fill="#22c55e" data-t="1778595358796"><title>build #53753: all shards passed</title></rect><rect x="483.6" y="5" width="3.7" height="12" rx="1.5" fill="#166534" data-t="1778602780943"><title>build #53762: no failures (partial run)</title></rect><rect x="494.2" y="5" width="3.7" height="12" rx="1.5" fill="#166534" data-t="1778609844754"><title>build #53787: no failures (partial run)</title></rect><rect x="499.9" y="5" width="3.7" height="12" rx="1.5" fill="#22c55e" data-t="1778613619808"><title>build #53811: all shards passed</title></rect><rect x="512.7" y="5" width="3.7" height="12" rx="1.5" fill="#166534" data-t="1778622195213"><title>build #53852: no failures (partial run)</title></rect><rect x="516.6" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778624776274"><title>build #53863: shard failures</title></rect><rect x="524.4" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778630013811"><title>build #53893: shard failures</title></rect><rect x="530.0" y="5" width="3.7" height="12" rx="1.5" fill="#22c55e" data-t="1778633735611"><title>build #53914: all shards passed</title></rect><rect x="533.7" y="5" width="3.7" height="12" rx="1.5" fill="#22c55e" data-t="1778636255241"><title>build #53933: all shards passed</title></rect><rect x="538.7" y="5" width="3.7" height="12" rx="1.5" fill="#22c55e" data-t="1778639560231"><title>build #53952: all shards passed</title></rect><rect x="554.4" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778650067725"><title>build #53983: shard failures</title></rect><rect x="559.7" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778653591179"><title>build #53992: shard failures</title></rect><rect x="564.0" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778656476983"><title>build #53999: shard failures</title></rect><rect x="576.0" y="5" width="3.7" height="12" rx="1.5" fill="#166534" data-t="1778664548965"><title>build #54008: no failures (partial run)</title></rect><rect x="578.1" y="5" width="3.7" height="12" rx="1.5" fill="#22c55e" data-t="1778665925729"><title>build #54012: all shards passed</title></rect><rect x="584.3" y="5" width="3.7" height="12" rx="1.5" fill="#22c55e" data-t="1778670072856"><title>build #54015: all shards passed</title></rect><rect x="588.4" y="5" width="3.7" height="12" rx="1.5" fill="#22c55e" data-t="1778672784257"><title>build #54017: all shards passed</title></rect><rect x="591.8" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778675062708"><title>build #54022: shard failures</title></rect><rect x="597.4" y="5" width="3.7" height="12" rx="1.5" fill="#22c55e" data-t="1778678848858"><title>build #54026: all shards passed</title></rect><rect x="601.5" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778681561823"><title>build #54030: shard failures</title></rect><rect x="604.3" y="5" width="3.7" height="12" rx="1.5" fill="#22c55e" data-t="1778683462751"><title>build #54033: all shards passed</title></rect><rect x="610.8" y="5" width="3.7" height="12" rx="1.5" fill="#22c55e" data-t="1778687784994"><title>build #54040: all shards passed</title></rect><rect x="616.4" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778691529170"><title>build #54047: shard failures</title></rect><rect x="619.9" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778693845953"><title>build #54049: shard failures</title></rect><rect x="623.5" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778696265100"><title>build #54055: shard failures</title></rect><rect x="626.1" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778698037702"><title>build #54057: shard failures</title></rect><rect x="632.0" y="5" width="3.7" height="12" rx="1.5" fill="#22c55e" data-t="1778701929104"><title>build #54064: all shards passed</title></rect><rect x="634.9" y="5" width="3.7" height="12" rx="1.5" fill="#22c55e" data-t="1778703903947"><title>build #54074: all shards passed</title></rect><rect x="640.2" y="5" width="3.7" height="12" rx="1.5" fill="#166534" data-t="1778707416598"><title>build #54083: no failures (partial run)</title></rect><rect x="642.8" y="5" width="3.7" height="12" rx="1.5" fill="#22c55e" data-t="1778709170760"><title>build #54093: all shards passed</title></rect><rect x="658.2" y="5" width="3.7" height="12" rx="1.5" fill="#22c55e" data-t="1778719478067"><title>build #54144: all shards passed</title></rect><rect x="663.4" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778722963662"><title>build #54161: shard failures</title></rect><rect x="681.1" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778734794539"><title>build #54186: shard failures</title></rect><rect x="684.9" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778737331124"><title>build #54189: shard failures</title></rect><rect x="687.8" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778739258833"><title>build #54196: shard failures</title></rect><rect x="694.0" y="1" width="8.2" height="20" rx="2.5" fill="#22c55e" stroke="#86efac" stroke-width="1" data-t="1778743400428"><title>build #54202: all shards passed</title></rect></svg>

✓

Linux x64 · 60 shards

<svg viewBox="0 0 700 22" preserveAspectRatio="none"><line x1="0" y1="11" x2="700" y2="11" stroke="#1c2029"></line><rect x="10.6" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778286539080"><title>build #52934: shard failures</title></rect><rect x="13.7" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778288639709"><title>build #52938: shard failures</title></rect><rect x="16.4" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778290397797"><title>build #52944: shard failures</title></rect><rect x="31.1" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778300246226"><title>build #52969: shard failures</title></rect><rect x="35.3" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778303035730"><title>build #52975: shard failures</title></rect><rect x="42.7" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778308011445"><title>build #52988: shard failures</title></rect><rect x="46.4" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778310457038"><title>build #52996: shard failures</title></rect><rect x="49.5" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778312565917"><title>build #52998: shard failures</title></rect><rect x="56.4" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778317155949"><title>build #53007: shard failures</title></rect><rect x="62.5" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778321238178"><title>build #53013: shard failures</title></rect><rect x="64.9" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778322833822"><title>build #53014: shard failures</title></rect><rect x="67.5" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778324572426"><title>build #53015: shard failures</title></rect><rect x="75.5" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778329907188"><title>build #53026: shard failures</title></rect><rect x="79.3" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778332457458"><title>build #53027: shard failures</title></rect><rect x="86.3" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778337168723"><title>build #53032: shard failures</title></rect><rect x="88.8" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778338800634"><title>build #53033: shard failures</title></rect><rect x="90.9" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778340231453"><title>build #53035: shard failures</title></rect><rect x="97.0" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778344309177"><title>build #53041: shard failures</title></rect><rect x="109.6" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778352753314"><title>build #53047: shard failures</title></rect><rect x="115.5" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778356673879"><title>build #53056: shard failures</title></rect><rect x="120.5" y="5" width="3.7" height="12" rx="1.5" fill="#166534" data-t="1778359988345"><title>build #53059: no failures (partial run)</title></rect><rect x="128.9" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778365599534"><title>build #53077: shard failures</title></rect><rect x="134.6" y="5" width="3.7" height="12" rx="1.5" fill="#166534" data-t="1778369422049"><title>build #53083: no failures (partial run)</title></rect><rect x="136.6" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778370783670"><title>build #53086: shard failures</title></rect><rect x="139.5" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778372723849"><title>build #53090: shard failures</title></rect><rect x="144.7" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778376165815"><title>build #53095: shard failures</title></rect><rect x="149.5" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778379391821"><title>build #53106: shard failures</title></rect><rect x="153.1" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778381814145"><title>build #53109: shard failures</title></rect><rect x="182.8" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778401647585"><title>build #53123: shard failures</title></rect><rect x="188.5" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778405457180"><title>build #53127: shard failures</title></rect><rect x="194.5" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778409511638"><title>build #53130: shard failures</title></rect><rect x="198.4" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778412078888"><title>build #53131: shard failures</title></rect><rect x="208.6" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778418905195"><title>build #53133: shard failures</title></rect><rect x="211.0" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778420530193"><title>build #53134: shard failures</title></rect><rect x="215.7" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778423666121"><title>build #53135: shard failures</title></rect><rect x="220.4" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778426824913"><title>build #53143: shard failures</title></rect><rect x="224.6" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778429599152"><title>build #53149: shard failures</title></rect><rect x="230.5" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778433522519"><title>build #53159: shard failures</title></rect><rect x="237.0" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778437887371"><title>build #53164: shard failures</title></rect><rect x="240.5" y="5" width="3.7" height="12" rx="1.5" fill="#22c55e" data-t="1778440258026"><title>build #53167: all shards passed</title></rect><rect x="246.1" y="5" width="3.7" height="12" rx="1.5" fill="#22c55e" data-t="1778443972675"><title>build #53172: all shards passed</title></rect><rect x="250.9" y="5" width="3.7" height="12" rx="1.5" fill="#22c55e" data-t="1778447201783"><title>build #53176: all shards passed</title></rect><rect x="258.4" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778452219686"><title>build #53188: shard failures</title></rect><rect x="261.3" y="5" width="3.7" height="12" rx="1.5" fill="#22c55e" data-t="1778454131412"><title>build #53194: all shards passed</title></rect><rect x="270.5" y="5" width="3.7" height="12" rx="1.5" fill="#22c55e" data-t="1778460291189"><title>build #53208: all shards passed</title></rect><rect x="277.0" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778464603443"><title>build #53212: shard failures</title></rect><rect x="279.7" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778466465334"><title>build #53213: shard failures</title></rect><rect x="283.6" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778469027411"><title>build #53214: shard failures</title></rect><rect x="291.6" y="5" width="3.7" height="12" rx="1.5" fill="#22c55e" data-t="1778474403042"><title>build #53216: all shards passed</title></rect><rect x="294.7" y="5" width="3.7" height="12" rx="1.5" fill="#22c55e" data-t="1778476492555"><title>build #53222: all shards passed</title></rect><rect x="299.9" y="5" width="3.7" height="12" rx="1.5" fill="#22c55e" data-t="1778479944641"><title>build #53229: all shards passed</title></rect><rect x="303.9" y="5" width="3.7" height="12" rx="1.5" fill="#166534" data-t="1778482647190"><title>build #53236: no failures (partial run)</title></rect><rect x="306.5" y="5" width="3.7" height="12" rx="1.5" fill="#22c55e" data-t="1778484359935"><title>build #53241: all shards passed</title></rect><rect x="314.2" y="5" width="3.7" height="12" rx="1.5" fill="#22c55e" data-t="1778489494954"><title>build #53260: all shards passed</title></rect><rect x="317.6" y="5" width="3.7" height="12" rx="1.5" fill="#22c55e" data-t="1778491758512"><title>build #53265: all shards passed</title></rect><rect x="321.3" y="5" width="3.7" height="12" rx="1.5" fill="#22c55e" data-t="1778494219216"><title>build #53271: all shards passed</title></rect><rect x="325.1" y="5" width="3.7" height="12" rx="1.5" fill="#166534" data-t="1778496772834"><title>build #53280: no failures (partial run)</title></rect><rect x="330.9" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778500686033"><title>build #53304: shard failures</title></rect><rect x="338.6" y="5" width="3.7" height="12" rx="1.5" fill="#22c55e" data-t="1778505787528"><title>build #53327: all shards passed</title></rect><rect x="342.2" y="5" width="3.7" height="12" rx="1.5" fill="#22c55e" data-t="1778508246393"><title>build #53340: all shards passed</title></rect><rect x="349.5" y="5" width="3.7" height="12" rx="1.5" fill="#166534" data-t="1778513130215"><title>build #53360: no failures (partial run)</title></rect><rect x="362.2" y="5" width="3.7" height="12" rx="1.5" fill="#166534" data-t="1778521581361"><title>build #53419: no failures (partial run)</title></rect><rect x="367.2" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778524908434"><title>build #53431: shard failures</title></rect><rect x="377.7" y="5" width="3.7" height="12" rx="1.5" fill="#166534" data-t="1778531962718"><title>build #53458: no failures (partial run)</title></rect><rect x="384.4" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778536408926"><title>build #53485: shard failures</title></rect><rect x="387.1" y="5" width="3.7" height="12" rx="1.5" fill="#22c55e" data-t="1778538232085"><title>build #53491: all shards passed</title></rect><rect x="390.3" y="5" width="3.7" height="12" rx="1.5" fill="#22c55e" data-t="1778540351128"><title>build #53503: all shards passed</title></rect><rect x="393.9" y="5" width="3.7" height="12" rx="1.5" fill="#166534" data-t="1778542762197"><title>build #53514: no failures (partial run)</title></rect><rect x="408.6" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778552598988"><title>build #53570: shard failures</title></rect><rect x="415.7" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778557345511"><title>build #53583: shard failures</title></rect><rect x="422.1" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778561602880"><title>build #53599: shard failures</title></rect><rect x="467.1" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778591726306"><title>build #53748: shard failures</title></rect><rect x="472.5" y="5" width="3.7" height="12" rx="1.5" fill="#22c55e" data-t="1778595358796"><title>build #53753: all shards passed</title></rect><rect x="480.7" y="5" width="3.7" height="12" rx="1.5" fill="#166534" data-t="1778600809451"><title>build #53759: no failures (partial run)</title></rect><rect x="491.7" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778608147954"><title>build #53781: shard failures</title></rect><rect x="494.2" y="5" width="3.7" height="12" rx="1.5" fill="#166534" data-t="1778609844754"><title>build #53787: no failures (partial run)</title></rect><rect x="499.9" y="5" width="3.7" height="12" rx="1.5" fill="#22c55e" data-t="1778613619808"><title>build #53811: all shards passed</title></rect><rect x="516.6" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778624776274"><title>build #53863: shard failures</title></rect><rect x="524.4" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778630013811"><title>build #53893: shard failures</title></rect><rect x="530.0" y="5" width="3.7" height="12" rx="1.5" fill="#22c55e" data-t="1778633735611"><title>build #53914: all shards passed</title></rect><rect x="533.7" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778636255241"><title>build #53933: shard failures</title></rect><rect x="538.7" y="5" width="3.7" height="12" rx="1.5" fill="#22c55e" data-t="1778639560231"><title>build #53952: all shards passed</title></rect><rect x="554.4" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778650067725"><title>build #53983: shard failures</title></rect><rect x="559.7" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778653591179"><title>build #53992: shard failures</title></rect><rect x="564.0" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778656476983"><title>build #53999: shard failures</title></rect><rect x="576.0" y="5" width="3.7" height="12" rx="1.5" fill="#166534" data-t="1778664548965"><title>build #54008: no failures (partial run)</title></rect><rect x="578.1" y="5" width="3.7" height="12" rx="1.5" fill="#22c55e" data-t="1778665925729"><title>build #54012: all shards passed</title></rect><rect x="584.3" y="5" width="3.7" height="12" rx="1.5" fill="#22c55e" data-t="1778670072856"><title>build #54015: all shards passed</title></rect><rect x="588.4" y="5" width="3.7" height="12" rx="1.5" fill="#22c55e" data-t="1778672784257"><title>build #54017: all shards passed</title></rect><rect x="591.8" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778675062708"><title>build #54022: shard failures</title></rect><rect x="597.4" y="5" width="3.7" height="12" rx="1.5" fill="#22c55e" data-t="1778678848858"><title>build #54026: all shards passed</title></rect><rect x="601.5" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778681561823"><title>build #54030: shard failures</title></rect><rect x="604.3" y="5" width="3.7" height="12" rx="1.5" fill="#22c55e" data-t="1778683462751"><title>build #54033: all shards passed</title></rect><rect x="610.8" y="5" width="3.7" height="12" rx="1.5" fill="#166534" data-t="1778687784994"><title>build #54040: no failures (partial run)</title></rect><rect x="616.4" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778691529170"><title>build #54047: shard failures</title></rect><rect x="619.9" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778693845953"><title>build #54049: shard failures</title></rect><rect x="623.5" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778696265100"><title>build #54055: shard failures</title></rect><rect x="626.1" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778698037702"><title>build #54057: shard failures</title></rect><rect x="632.0" y="5" width="3.7" height="12" rx="1.5" fill="#22c55e" data-t="1778701929104"><title>build #54064: all shards passed</title></rect><rect x="634.9" y="5" width="3.7" height="12" rx="1.5" fill="#22c55e" data-t="1778703903947"><title>build #54074: all shards passed</title></rect><rect x="640.2" y="5" width="3.7" height="12" rx="1.5" fill="#166534" data-t="1778707416598"><title>build #54083: no failures (partial run)</title></rect><rect x="642.8" y="5" width="3.7" height="12" rx="1.5" fill="#22c55e" data-t="1778709170760"><title>build #54093: all shards passed</title></rect><rect x="658.2" y="5" width="3.7" height="12" rx="1.5" fill="#22c55e" data-t="1778719478067"><title>build #54144: all shards passed</title></rect><rect x="663.4" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778722963662"><title>build #54161: shard failures</title></rect><rect x="681.1" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778734794539"><title>build #54186: shard failures</title></rect><rect x="684.9" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778737331124"><title>build #54189: shard failures</title></rect><rect x="687.8" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778739258833"><title>build #54196: shard failures</title></rect><rect x="694.0" y="1" width="8.2" height="20" rx="2.5" fill="#22c55e" stroke="#86efac" stroke-width="1" data-t="1778743400428"><title>build #54202: all shards passed</title></rect></svg>

✓

macOS arm64 · 4 shards

<svg viewBox="0 0 700 22" preserveAspectRatio="none"><line x1="0" y1="11" x2="700" y2="11" stroke="#1c2029"></line><rect x="0.0" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778279462072"><title>build #52897: shard failures</title></rect><rect x="7.9" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778284727443"><title>build #52929: shard failures</title></rect><rect x="9.2" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778285617159"><title>build #52932: shard failures</title></rect><rect x="16.4" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778290397797"><title>build #52944: shard failures</title></rect><rect x="35.3" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778303035730"><title>build #52975: shard failures</title></rect><rect x="46.4" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778310457038"><title>build #52996: shard failures</title></rect><rect x="49.5" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778312565917"><title>build #52998: shard failures</title></rect><rect x="56.4" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778317155949"><title>build #53007: shard failures</title></rect><rect x="62.5" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778321238178"><title>build #53013: shard failures</title></rect><rect x="64.9" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778322833822"><title>build #53014: shard failures</title></rect><rect x="67.5" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778324572426"><title>build #53015: shard failures</title></rect><rect x="75.5" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778329907188"><title>build #53026: shard failures</title></rect><rect x="79.3" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778332457458"><title>build #53027: shard failures</title></rect><rect x="86.3" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778337168723"><title>build #53032: shard failures</title></rect><rect x="90.9" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778340231453"><title>build #53035: shard failures</title></rect><rect x="97.0" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778344309177"><title>build #53041: shard failures</title></rect><rect x="109.6" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778352753314"><title>build #53047: shard failures</title></rect><rect x="115.5" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778356673879"><title>build #53056: shard failures</title></rect><rect x="120.5" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778359988345"><title>build #53059: shard failures</title></rect><rect x="128.9" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778365599534"><title>build #53077: shard failures</title></rect><rect x="144.7" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778376165815"><title>build #53095: shard failures</title></rect><rect x="153.1" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778381814145"><title>build #53109: shard failures</title></rect><rect x="182.8" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778401647585"><title>build #53123: shard failures</title></rect><rect x="188.5" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778405457180"><title>build #53127: shard failures</title></rect><rect x="194.5" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778409511638"><title>build #53130: shard failures</title></rect><rect x="198.4" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778412078888"><title>build #53131: shard failures</title></rect><rect x="208.6" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778418905195"><title>build #53133: shard failures</title></rect><rect x="211.0" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778420530193"><title>build #53134: shard failures</title></rect><rect x="215.7" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778423666121"><title>build #53135: shard failures</title></rect><rect x="220.4" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778426824913"><title>build #53143: shard failures</title></rect><rect x="224.6" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778429599152"><title>build #53149: shard failures</title></rect><rect x="230.5" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778433522519"><title>build #53159: shard failures</title></rect><rect x="237.0" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778437887371"><title>build #53164: shard failures</title></rect><rect x="240.5" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778440258026"><title>build #53167: shard failures</title></rect><rect x="246.1" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778443972675"><title>build #53172: shard failures</title></rect><rect x="250.9" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778447201783"><title>build #53176: shard failures</title></rect><rect x="258.4" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778452219686"><title>build #53188: shard failures</title></rect><rect x="261.3" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778454131412"><title>build #53194: shard failures</title></rect><rect x="270.5" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778460291189"><title>build #53208: shard failures</title></rect><rect x="277.0" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778464603443"><title>build #53212: shard failures</title></rect><rect x="279.7" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778466465334"><title>build #53213: shard failures</title></rect><rect x="283.6" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778469027411"><title>build #53214: shard failures</title></rect><rect x="291.6" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778474403042"><title>build #53216: shard failures</title></rect><rect x="294.7" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778476492555"><title>build #53222: shard failures</title></rect><rect x="299.9" y="5" width="3.7" height="12" rx="1.5" fill="#166534" data-t="1778479944641"><title>build #53229: no failures (partial run)</title></rect><rect x="303.9" y="5" width="3.7" height="12" rx="1.5" fill="#166534" data-t="1778482647190"><title>build #53236: no failures (partial run)</title></rect><rect x="306.5" y="5" width="3.7" height="12" rx="1.5" fill="#22c55e" data-t="1778484359935"><title>build #53241: all shards passed</title></rect><rect x="317.6" y="5" width="3.7" height="12" rx="1.5" fill="#22c55e" data-t="1778491758512"><title>build #53265: all shards passed</title></rect><rect x="321.3" y="5" width="3.7" height="12" rx="1.5" fill="#166534" data-t="1778494219216"><title>build #53271: no failures (partial run)</title></rect><rect x="325.1" y="5" width="3.7" height="12" rx="1.5" fill="#166534" data-t="1778496772834"><title>build #53280: no failures (partial run)</title></rect><rect x="330.9" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778500686033"><title>build #53304: shard failures</title></rect><rect x="338.6" y="5" width="3.7" height="12" rx="1.5" fill="#166534" data-t="1778505787528"><title>build #53327: no failures (partial run)</title></rect><rect x="342.2" y="5" width="3.7" height="12" rx="1.5" fill="#166534" data-t="1778508246393"><title>build #53340: no failures (partial run)</title></rect><rect x="349.5" y="5" width="3.7" height="12" rx="1.5" fill="#166534" data-t="1778513130215"><title>build #53360: no failures (partial run)</title></rect><rect x="352.9" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778515399035"><title>build #53368: shard failures</title></rect><rect x="354.8" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778516670577"><title>build #53379: shard failures</title></rect><rect x="355.8" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778517294294"><title>build #53383: shard failures</title></rect><rect x="358.4" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778519059056"><title>build #53401: shard failures</title></rect><rect x="367.2" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778524908434"><title>build #53431: shard failures</title></rect><rect x="377.7" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778531962718"><title>build #53458: shard failures</title></rect><rect x="387.1" y="5" width="3.7" height="12" rx="1.5" fill="#166534" data-t="1778538232085"><title>build #53491: no failures (partial run)</title></rect><rect x="390.3" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778540351128"><title>build #53503: shard failures</title></rect><rect x="408.6" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778552598988"><title>build #53570: shard failures</title></rect><rect x="415.7" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778557345511"><title>build #53583: shard failures</title></rect><rect x="422.1" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778561602880"><title>build #53599: shard failures</title></rect><rect x="424.4" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778563196849"><title>build #53601: shard failures</title></rect><rect x="467.1" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778591726306"><title>build #53748: shard failures</title></rect><rect x="472.5" y="5" width="3.7" height="12" rx="1.5" fill="#22c55e" data-t="1778595358796"><title>build #53753: all shards passed</title></rect><rect x="478.4" y="5" width="3.7" height="12" rx="1.5" fill="#166534" data-t="1778599274328"><title>build #53757: no failures (partial run)</title></rect><rect x="480.7" y="5" width="3.7" height="12" rx="1.5" fill="#166534" data-t="1778600809451"><title>build #53759: no failures (partial run)</title></rect><rect x="494.2" y="5" width="3.7" height="12" rx="1.5" fill="#166534" data-t="1778609844754"><title>build #53787: no failures (partial run)</title></rect><rect x="499.9" y="5" width="3.7" height="12" rx="1.5" fill="#22c55e" data-t="1778613619808"><title>build #53811: all shards passed</title></rect><rect x="538.7" y="5" width="3.7" height="12" rx="1.5" fill="#166534" data-t="1778639560231"><title>build #53952: no failures (partial run)</title></rect><rect x="559.7" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778653591179"><title>build #53992: shard failures</title></rect><rect x="564.0" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778656476983"><title>build #53999: shard failures</title></rect><rect x="573.7" y="5" width="3.7" height="12" rx="1.5" fill="#166534" data-t="1778662957716"><title>build #54007: no failures (partial run)</title></rect><rect x="578.1" y="5" width="3.7" height="12" rx="1.5" fill="#22c55e" data-t="1778665925729"><title>build #54012: all shards passed</title></rect><rect x="584.3" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778670072856"><title>build #54015: shard failures</title></rect><rect x="588.4" y="5" width="3.7" height="12" rx="1.5" fill="#22c55e" data-t="1778672784257"><title>build #54017: all shards passed</title></rect><rect x="591.8" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778675062708"><title>build #54022: shard failures</title></rect><rect x="597.4" y="5" width="3.7" height="12" rx="1.5" fill="#166534" data-t="1778678848858"><title>build #54026: no failures (partial run)</title></rect><rect x="601.5" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778681561823"><title>build #54030: shard failures</title></rect><rect x="604.3" y="5" width="3.7" height="12" rx="1.5" fill="#22c55e" data-t="1778683462751"><title>build #54033: all shards passed</title></rect><rect x="610.8" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778687784994"><title>build #54040: shard failures</title></rect><rect x="616.4" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778691529170"><title>build #54047: shard failures</title></rect><rect x="619.9" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778693845953"><title>build #54049: shard failures</title></rect><rect x="623.5" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778696265100"><title>build #54055: shard failures</title></rect><rect x="626.1" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778698037702"><title>build #54057: shard failures</title></rect><rect x="632.0" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778701929104"><title>build #54064: shard failures</title></rect><rect x="634.9" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778703903947"><title>build #54074: shard failures</title></rect><rect x="642.8" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778709170760"><title>build #54093: shard failures</title></rect><rect x="663.4" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778722963662"><title>build #54161: shard failures</title></rect><rect x="681.1" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778734794539"><title>build #54186: shard failures</title></rect><rect x="684.9" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778737331124"><title>build #54189: shard failures</title></rect><rect x="687.8" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778739258833"><title>build #54196: shard failures</title></rect><rect x="694.0" y="1" width="8.2" height="20" rx="2.5" fill="#22c55e" stroke="#86efac" stroke-width="1" data-t="1778743400428"><title>build #54202: all shards passed</title></rect></svg>

✓

Windows x64 · 8 shards

<svg viewBox="0 0 700 22" preserveAspectRatio="none"><line x1="0" y1="11" x2="700" y2="11" stroke="#1c2029"></line><rect x="139.5" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778372723849"><title>build #53090: shard failures</title></rect><rect x="143.1" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778375091875"><title>build #53094: shard failures</title></rect><rect x="144.7" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778376165815"><title>build #53095: shard failures</title></rect><rect x="149.5" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778379391821"><title>build #53106: shard failures</title></rect><rect x="153.1" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778381814145"><title>build #53109: shard failures</title></rect><rect x="182.8" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778401647585"><title>build #53123: shard failures</title></rect><rect x="188.5" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778405457180"><title>build #53127: shard failures</title></rect><rect x="194.5" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778409511638"><title>build #53130: shard failures</title></rect><rect x="198.4" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778412078888"><title>build #53131: shard failures</title></rect><rect x="208.6" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778418905195"><title>build #53133: shard failures</title></rect><rect x="211.0" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778420530193"><title>build #53134: shard failures</title></rect><rect x="215.7" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778423666121"><title>build #53135: shard failures</title></rect><rect x="220.4" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778426824913"><title>build #53143: shard failures</title></rect><rect x="224.6" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778429599152"><title>build #53149: shard failures</title></rect><rect x="230.5" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778433522519"><title>build #53159: shard failures</title></rect><rect x="237.0" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778437887371"><title>build #53164: shard failures</title></rect><rect x="240.5" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778440258026"><title>build #53167: shard failures</title></rect><rect x="246.1" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778443972675"><title>build #53172: shard failures</title></rect><rect x="250.9" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778447201783"><title>build #53176: shard failures</title></rect><rect x="258.4" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778452219686"><title>build #53188: shard failures</title></rect><rect x="261.3" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778454131412"><title>build #53194: shard failures</title></rect><rect x="270.5" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778460291189"><title>build #53208: shard failures</title></rect><rect x="277.0" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778464603443"><title>build #53212: shard failures</title></rect><rect x="279.7" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778466465334"><title>build #53213: shard failures</title></rect><rect x="283.6" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778469027411"><title>build #53214: shard failures</title></rect><rect x="291.6" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778474403042"><title>build #53216: shard failures</title></rect><rect x="294.7" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778476492555"><title>build #53222: shard failures</title></rect><rect x="299.9" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778479944641"><title>build #53229: shard failures</title></rect><rect x="303.9" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778482647190"><title>build #53236: shard failures</title></rect><rect x="306.5" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778484359935"><title>build #53241: shard failures</title></rect><rect x="314.2" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778489494954"><title>build #53260: shard failures</title></rect><rect x="317.6" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778491758512"><title>build #53265: shard failures</title></rect><rect x="321.3" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778494219216"><title>build #53271: shard failures</title></rect><rect x="325.1" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778496772834"><title>build #53280: shard failures</title></rect><rect x="329.0" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778499376993"><title>build #53298: shard failures</title></rect><rect x="330.9" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778500686033"><title>build #53304: shard failures</title></rect><rect x="338.6" y="5" width="3.7" height="12" rx="1.5" fill="#22c55e" data-t="1778505787528"><title>build #53327: all shards passed</title></rect><rect x="342.2" y="5" width="3.7" height="12" rx="1.5" fill="#22c55e" data-t="1778508246393"><title>build #53340: all shards passed</title></rect><rect x="349.5" y="5" width="3.7" height="12" rx="1.5" fill="#166534" data-t="1778513130215"><title>build #53360: no failures (partial run)</title></rect><rect x="362.2" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778521581361"><title>build #53419: shard failures</title></rect><rect x="367.2" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778524908434"><title>build #53431: shard failures</title></rect><rect x="377.7" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778531962718"><title>build #53458: shard failures</title></rect><rect x="380.3" y="5" width="3.7" height="12" rx="1.5" fill="#166534" data-t="1778533702436"><title>build #53470: no failures (partial run)</title></rect><rect x="384.4" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778536408926"><title>build #53485: shard failures</title></rect><rect x="387.1" y="5" width="3.7" height="12" rx="1.5" fill="#166534" data-t="1778538232085"><title>build #53491: no failures (partial run)</title></rect><rect x="390.3" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778540351128"><title>build #53503: shard failures</title></rect><rect x="393.9" y="5" width="3.7" height="12" rx="1.5" fill="#166534" data-t="1778542762197"><title>build #53514: no failures (partial run)</title></rect><rect x="404.2" y="5" width="3.7" height="12" rx="1.5" fill="#166534" data-t="1778549638977"><title>build #53565: no failures (partial run)</title></rect><rect x="408.6" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778552598988"><title>build #53570: shard failures</title></rect><rect x="422.1" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778561602880"><title>build #53599: shard failures</title></rect><rect x="465.4" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778590593483"><title>build #53745: shard failures</title></rect><rect x="467.1" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778591726306"><title>build #53748: shard failures</title></rect><rect x="472.5" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778595358796"><title>build #53753: shard failures</title></rect><rect x="478.4" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778599274328"><title>build #53757: shard failures</title></rect><rect x="480.7" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778600809451"><title>build #53759: shard failures</title></rect><rect x="483.6" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778602780943"><title>build #53762: shard failures</title></rect><rect x="486.6" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778604734330"><title>build #53769: shard failures</title></rect><rect x="491.7" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778608147954"><title>build #53781: shard failures</title></rect><rect x="494.2" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778609844754"><title>build #53787: shard failures</title></rect><rect x="497.4" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778611997341"><title>build #53808: shard failures</title></rect><rect x="499.9" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778613619808"><title>build #53811: shard failures</title></rect><rect x="512.7" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778622195213"><title>build #53852: shard failures</title></rect><rect x="516.6" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778624776274"><title>build #53863: shard failures</title></rect><rect x="521.6" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778628181820"><title>build #53883: shard failures</title></rect><rect x="524.4" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778630013811"><title>build #53893: shard failures</title></rect><rect x="530.0" y="5" width="3.7" height="12" rx="1.5" fill="#22c55e" data-t="1778633735611"><title>build #53914: all shards passed</title></rect><rect x="533.7" y="5" width="3.7" height="12" rx="1.5" fill="#22c55e" data-t="1778636255241"><title>build #53933: all shards passed</title></rect><rect x="538.7" y="5" width="3.7" height="12" rx="1.5" fill="#22c55e" data-t="1778639560231"><title>build #53952: all shards passed</title></rect><rect x="551.3" y="5" width="3.7" height="12" rx="1.5" fill="#166534" data-t="1778647974163"><title>build #53973: no failures (partial run)</title></rect><rect x="554.4" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778650067725"><title>build #53983: shard failures</title></rect><rect x="559.7" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778653591179"><title>build #53992: shard failures</title></rect><rect x="564.0" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778656476983"><title>build #53999: shard failures</title></rect><rect x="568.0" y="5" width="3.7" height="12" rx="1.5" fill="#166534" data-t="1778659156536"><title>build #54002: no failures (partial run)</title></rect><rect x="570.2" y="5" width="3.7" height="12" rx="1.5" fill="#166534" data-t="1778660672953"><title>build #54004: no failures (partial run)</title></rect><rect x="573.7" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778662957716"><title>build #54007: shard failures</title></rect><rect x="576.0" y="5" width="3.7" height="12" rx="1.5" fill="#166534" data-t="1778664548965"><title>build #54008: no failures (partial run)</title></rect><rect x="578.1" y="5" width="3.7" height="12" rx="1.5" fill="#22c55e" data-t="1778665925729"><title>build #54012: all shards passed</title></rect><rect x="584.3" y="5" width="3.7" height="12" rx="1.5" fill="#22c55e" data-t="1778670072856"><title>build #54015: all shards passed</title></rect><rect x="588.4" y="5" width="3.7" height="12" rx="1.5" fill="#22c55e" data-t="1778672784257"><title>build #54017: all shards passed</title></rect><rect x="591.8" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778675062708"><title>build #54022: shard failures</title></rect><rect x="597.4" y="5" width="3.7" height="12" rx="1.5" fill="#22c55e" data-t="1778678848858"><title>build #54026: all shards passed</title></rect><rect x="601.5" y="5" width="3.7" height="12" rx="1.5" fill="#22c55e" data-t="1778681561823"><title>build #54030: all shards passed</title></rect><rect x="604.3" y="5" width="3.7" height="12" rx="1.5" fill="#22c55e" data-t="1778683462751"><title>build #54033: all shards passed</title></rect><rect x="610.8" y="5" width="3.7" height="12" rx="1.5" fill="#22c55e" data-t="1778687784994"><title>build #54040: all shards passed</title></rect><rect x="616.4" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778691529170"><title>build #54047: shard failures</title></rect><rect x="619.9" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778693845953"><title>build #54049: shard failures</title></rect><rect x="623.5" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778696265100"><title>build #54055: shard failures</title></rect><rect x="626.1" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778698037702"><title>build #54057: shard failures</title></rect><rect x="632.0" y="5" width="3.7" height="12" rx="1.5" fill="#22c55e" data-t="1778701929104"><title>build #54064: all shards passed</title></rect><rect x="634.9" y="5" width="3.7" height="12" rx="1.5" fill="#22c55e" data-t="1778703903947"><title>build #54074: all shards passed</title></rect><rect x="640.2" y="5" width="3.7" height="12" rx="1.5" fill="#22c55e" data-t="1778707416598"><title>build #54083: all shards passed</title></rect><rect x="642.8" y="5" width="3.7" height="12" rx="1.5" fill="#22c55e" data-t="1778709170760"><title>build #54093: all shards passed</title></rect><rect x="658.2" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778719478067"><title>build #54144: shard failures</title></rect><rect x="663.4" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778722963662"><title>build #54161: shard failures</title></rect><rect x="681.1" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778734794539"><title>build #54186: shard failures</title></rect><rect x="684.9" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778737331124"><title>build #54189: shard failures</title></rect><rect x="687.8" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778739258833"><title>build #54196: shard failures</title></rect><rect x="694.0" y="1" width="8.2" height="20" rx="2.5" fill="#22c55e" stroke="#86efac" stroke-width="1" data-t="1778743400428"><title>build #54202: all shards passed</title></rect></svg>

✓

Windows arm64 · 8 shards

<svg viewBox="0 0 700 22" preserveAspectRatio="none"><line x1="0" y1="11" x2="700" y2="11" stroke="#1c2029"></line><rect x="139.5" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778372723849"><title>build #53090: shard failures</title></rect><rect x="144.7" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778376165815"><title>build #53095: shard failures</title></rect><rect x="149.5" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778379391821"><title>build #53106: shard failures</title></rect><rect x="153.1" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778381814145"><title>build #53109: shard failures</title></rect><rect x="182.8" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778401647585"><title>build #53123: shard failures</title></rect><rect x="188.5" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778405457180"><title>build #53127: shard failures</title></rect><rect x="194.5" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778409511638"><title>build #53130: shard failures</title></rect><rect x="198.4" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778412078888"><title>build #53131: shard failures</title></rect><rect x="211.0" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778420530193"><title>build #53134: shard failures</title></rect><rect x="215.7" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778423666121"><title>build #53135: shard failures</title></rect><rect x="224.6" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778429599152"><title>build #53149: shard failures</title></rect><rect x="230.5" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778433522519"><title>build #53159: shard failures</title></rect><rect x="237.0" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778437887371"><title>build #53164: shard failures</title></rect><rect x="240.5" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778440258026"><title>build #53167: shard failures</title></rect><rect x="246.1" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778443972675"><title>build #53172: shard failures</title></rect><rect x="250.9" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778447201783"><title>build #53176: shard failures</title></rect><rect x="258.4" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778452219686"><title>build #53188: shard failures</title></rect><rect x="261.3" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778454131412"><title>build #53194: shard failures</title></rect><rect x="270.5" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778460291189"><title>build #53208: shard failures</title></rect><rect x="277.0" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778464603443"><title>build #53212: shard failures</title></rect><rect x="279.7" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778466465334"><title>build #53213: shard failures</title></rect><rect x="283.6" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778469027411"><title>build #53214: shard failures</title></rect><rect x="291.6" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778474403042"><title>build #53216: shard failures</title></rect><rect x="294.7" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778476492555"><title>build #53222: shard failures</title></rect><rect x="299.9" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778479944641"><title>build #53229: shard failures</title></rect><rect x="303.9" y="5" width="3.7" height="12" rx="1.5" fill="#166534" data-t="1778482647190"><title>build #53236: no failures (partial run)</title></rect><rect x="306.5" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778484359935"><title>build #53241: shard failures</title></rect><rect x="314.2" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778489494954"><title>build #53260: shard failures</title></rect><rect x="317.6" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778491758512"><title>build #53265: shard failures</title></rect><rect x="321.3" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778494219216"><title>build #53271: shard failures</title></rect><rect x="330.9" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778500686033"><title>build #53304: shard failures</title></rect><rect x="338.6" y="5" width="3.7" height="12" rx="1.5" fill="#22c55e" data-t="1778505787528"><title>build #53327: all shards passed</title></rect><rect x="342.2" y="5" width="3.7" height="12" rx="1.5" fill="#22c55e" data-t="1778508246393"><title>build #53340: all shards passed</title></rect><rect x="349.5" y="5" width="3.7" height="12" rx="1.5" fill="#166534" data-t="1778513130215"><title>build #53360: no failures (partial run)</title></rect><rect x="362.2" y="5" width="3.7" height="12" rx="1.5" fill="#166534" data-t="1778521581361"><title>build #53419: no failures (partial run)</title></rect><rect x="367.2" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778524908434"><title>build #53431: shard failures</title></rect><rect x="377.7" y="5" width="3.7" height="12" rx="1.5" fill="#166534" data-t="1778531962718"><title>build #53458: no failures (partial run)</title></rect><rect x="384.4" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778536408926"><title>build #53485: shard failures</title></rect><rect x="387.1" y="5" width="3.7" height="12" rx="1.5" fill="#166534" data-t="1778538232085"><title>build #53491: no failures (partial run)</title></rect><rect x="390.3" y="5" width="3.7" height="12" rx="1.5" fill="#166534" data-t="1778540351128"><title>build #53503: no failures (partial run)</title></rect><rect x="422.1" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778561602880"><title>build #53599: shard failures</title></rect><rect x="467.1" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778591726306"><title>build #53748: shard failures</title></rect><rect x="472.5" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778595358796"><title>build #53753: shard failures</title></rect><rect x="478.4" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778599274328"><title>build #53757: shard failures</title></rect><rect x="480.7" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778600809451"><title>build #53759: shard failures</title></rect><rect x="483.6" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778602780943"><title>build #53762: shard failures</title></rect><rect x="494.2" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778609844754"><title>build #53787: shard failures</title></rect><rect x="497.4" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778611997341"><title>build #53808: shard failures</title></rect><rect x="499.9" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778613619808"><title>build #53811: shard failures</title></rect><rect x="512.7" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778622195213"><title>build #53852: shard failures</title></rect><rect x="516.6" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778624776274"><title>build #53863: shard failures</title></rect><rect x="521.6" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778628181820"><title>build #53883: shard failures</title></rect><rect x="524.4" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778630013811"><title>build #53893: shard failures</title></rect><rect x="530.0" y="5" width="3.7" height="12" rx="1.5" fill="#166534" data-t="1778633735611"><title>build #53914: no failures (partial run)</title></rect><rect x="533.7" y="5" width="3.7" height="12" rx="1.5" fill="#22c55e" data-t="1778636255241"><title>build #53933: all shards passed</title></rect><rect x="538.7" y="5" width="3.7" height="12" rx="1.5" fill="#22c55e" data-t="1778639560231"><title>build #53952: all shards passed</title></rect><rect x="554.4" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778650067725"><title>build #53983: shard failures</title></rect><rect x="559.7" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778653591179"><title>build #53992: shard failures</title></rect><rect x="564.0" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778656476983"><title>build #53999: shard failures</title></rect><rect x="573.7" y="5" width="3.7" height="12" rx="1.5" fill="#166534" data-t="1778662957716"><title>build #54007: no failures (partial run)</title></rect><rect x="578.1" y="5" width="3.7" height="12" rx="1.5" fill="#22c55e" data-t="1778665925729"><title>build #54012: all shards passed</title></rect><rect x="584.3" y="5" width="3.7" height="12" rx="1.5" fill="#22c55e" data-t="1778670072856"><title>build #54015: all shards passed</title></rect><rect x="588.4" y="5" width="3.7" height="12" rx="1.5" fill="#22c55e" data-t="1778672784257"><title>build #54017: all shards passed</title></rect><rect x="591.8" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778675062708"><title>build #54022: shard failures</title></rect><rect x="597.4" y="5" width="3.7" height="12" rx="1.5" fill="#22c55e" data-t="1778678848858"><title>build #54026: all shards passed</title></rect><rect x="601.5" y="5" width="3.7" height="12" rx="1.5" fill="#166534" data-t="1778681561823"><title>build #54030: no failures (partial run)</title></rect><rect x="604.3" y="5" width="3.7" height="12" rx="1.5" fill="#22c55e" data-t="1778683462751"><title>build #54033: all shards passed</title></rect><rect x="610.8" y="5" width="3.7" height="12" rx="1.5" fill="#22c55e" data-t="1778687784994"><title>build #54040: all shards passed</title></rect><rect x="616.4" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778691529170"><title>build #54047: shard failures</title></rect><rect x="619.9" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778693845953"><title>build #54049: shard failures</title></rect><rect x="623.5" y="5" width="3.7" height="12" rx="1.5" fill="#166534" data-t="1778696265100"><title>build #54055: no failures (partial run)</title></rect><rect x="626.1" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778698037702"><title>build #54057: shard failures</title></rect><rect x="632.0" y="5" width="3.7" height="12" rx="1.5" fill="#22c55e" data-t="1778701929104"><title>build #54064: all shards passed</title></rect><rect x="634.9" y="5" width="3.7" height="12" rx="1.5" fill="#22c55e" data-t="1778703903947"><title>build #54074: all shards passed</title></rect><rect x="640.2" y="5" width="3.7" height="12" rx="1.5" fill="#166534" data-t="1778707416598"><title>build #54083: no failures (partial run)</title></rect><rect x="642.8" y="5" width="3.7" height="12" rx="1.5" fill="#22c55e" data-t="1778709170760"><title>build #54093: all shards passed</title></rect><rect x="658.2" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778719478067"><title>build #54144: shard failures</title></rect><rect x="663.4" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778722963662"><title>build #54161: shard failures</title></rect><rect x="681.1" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778734794539"><title>build #54186: shard failures</title></rect><rect x="684.9" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778737331124"><title>build #54189: shard failures</title></rect><rect x="687.8" y="2" width="3.7" height="18" rx="1.5" fill="#ef4444" data-t="1778739258833"><title>build #54196: shard failures</title></rect><rect x="694.0" y="1" width="8.2" height="20" rx="2.5" fill="#22c55e" stroke="#86efac" stroke-width="1" data-t="1778743400428"><title>build #54202: all shards passed</title></rect></svg>

✓

跨 135 次实际运行测试的 CI build（从 BuildKite 的 420 个 build 中挖出）中，每个平台的每个 test shard。亮绿色：每个 shard 都通过。暗绿色：没有失败，但运行被提前截断（被 superseded）。红色：至少一个 shard 失败。每条泳道都标注了它的完整套件第一次通过的时间。Linux 的 60 个 shard 比 Windows 早了将近一天全绿。各个平台一直会抖成红色，直到最后几个失败测试消失；最终全绿的 build 是 #54202。

合并前剩下的时间就很直接了。一个 workflow 按平台循环修复 CI 测试失败，直到没有测试失败为止。还有几个 workflow 做 Windows 相关清理、去重代码、减少 unsafe 使用，以及整体清理一些代码。

### [合并 Rust 重写](#merging-the-rust-rewrite)

当 Bun 的测试套件在 CI 的所有平台上 100% 通过后（我也手动确认测试确实在运行，没有被 skip），我在本地跑了一堆命令测试，然后按下了 merge 按钮。

合并到 `main` 不是版本化发布。到这个节点，我已经足够有信心继续推进，并承诺采用这次重写；但还没有足够信心发布它。

### [统计数据](#stats)

峰值时，我们同时运行 4 个这样的 workflow，每个 workflow 在单独的 worktree 中，每个 workflow 有 16 个 Claude。大约同时运行 64 个 Claude。

git log · claude/phase-a-portpeak: 58 commits in one minute

0

commits

+0

lines written, rewrites included

Mon, May 4, 7:05 AM PDT

<svg viewBox="0 0 760 130" role="img" aria-label="Commits over the 11 days, colored by new code vs deletion"><rect x="0.00" y="100.10" width="2.10" height="9.90" fill="rgb(243,114,183)"></rect><rect x="2.70" y="105.96" width="2.10" height="4.04" fill="rgb(244,114,182)"></rect><rect x="5.41" y="104.28" width="2.10" height="5.72" fill="rgb(242,115,184)"></rect><rect x="13.52" y="104.28" width="2.10" height="5.72" fill="rgb(244,114,182)"></rect><rect x="16.23" y="104.28" width="2.10" height="5.72" fill="rgb(244,114,182)"></rect><rect x="18.93" y="105.96" width="2.10" height="4.04" fill="rgb(244,114,182)"></rect><rect x="21.64" y="105.96" width="2.10" height="4.04" fill="rgb(228,119,196)"></rect><rect x="24.34" y="104.28" width="2.10" height="5.72" fill="rgb(244,114,182)"></rect><rect x="27.05" y="105.96" width="2.10" height="4.04" fill="rgb(244,114,182)"></rect><rect x="29.75" y="105.96" width="2.10" height="4.04" fill="rgb(244,114,182)"></rect><rect x="32.46" y="101.92" width="2.10" height="8.08" fill="rgb(210,125,212)"></rect><rect x="35.16" y="100.96" width="2.10" height="9.04" fill="rgb(218,122,205)"></rect><rect x="37.86" y="105.96" width="2.10" height="4.04" fill="rgb(167,139,250)"></rect><rect x="43.27" y="103.00" width="2.10" height="7.00" fill="rgb(237,116,188)"></rect><rect x="45.98" y="97.22" width="2.10" height="12.78" fill="rgb(146,151,248)"></rect><rect x="51.39" y="100.10" width="2.10" height="9.90" fill="rgb(221,122,203)"></rect><rect x="54.09" y="103.00" width="2.10" height="7.00" fill="rgb(183,134,236)"></rect><rect x="56.80" y="97.88" width="2.10" height="12.12" fill="rgb(172,137,246)"></rect><rect x="59.50" y="100.10" width="2.10" height="9.90" fill="rgb(183,134,236)"></rect><rect x="62.21" y="104.28" width="2.10" height="5.72" fill="rgb(150,148,248)"></rect><rect x="64.91" y="103.00" width="2.10" height="7.00" fill="rgb(144,151,248)"></rect><rect x="67.62" y="104.28" width="2.10" height="5.72" fill="rgb(165,140,250)"></rect><rect x="70.32" y="104.28" width="2.10" height="5.72" fill="rgb(148,149,248)"></rect><rect x="81.14" y="104.28" width="2.10" height="5.72" fill="rgb(239,116,186)"></rect><rect x="83.84" y="104.28" width="2.10" height="5.72" fill="rgb(194,130,226)"></rect><rect x="91.96" y="104.28" width="2.10" height="5.72" fill="rgb(149,149,248)"></rect><rect x="94.66" y="101.92" width="2.10" height="8.08" fill="rgb(166,140,250)"></rect><rect x="97.37" y="105.96" width="2.10" height="4.04" fill="rgb(151,148,249)"></rect><rect x="100.07" y="101.92" width="2.10" height="8.08" fill="rgb(182,134,237)"></rect><rect x="102.78" y="104.28" width="2.10" height="5.72" fill="rgb(233,118,192)"></rect><rect x="108.19" y="103.00" width="2.10" height="7.00" fill="rgb(183,134,236)"></rect><rect x="110.89" y="104.28" width="2.10" height="5.72" fill="rgb(234,117,191)"></rect><rect x="113.59" y="104.28" width="2.10" height="5.72" fill="rgb(155,146,249)"></rect><rect x="116.30" y="100.10" width="2.10" height="9.90" fill="rgb(51,202,239)"></rect><rect x="119.00" y="103.00" width="2.10" height="7.00" fill="rgb(189,132,231)"></rect><rect x="121.71" y="101.92" width="2.10" height="8.08" fill="rgb(220,122,203)"></rect><rect x="124.41" y="74.54" width="2.10" height="35.46" fill="rgb(191,131,229)"></rect><rect x="127.12" y="66.29" width="2.10" height="43.71" fill="rgb(181,134,238)"></rect><rect x="129.82" y="67.81" width="2.10" height="42.19" fill="rgb(188,132,231)"></rect><rect x="132.53" y="78.70" width="2.10" height="31.30" fill="rgb(172,137,246)"></rect><rect x="135.23" y="45.34" width="2.10" height="64.66" fill="rgb(168,139,249)"></rect><rect x="137.94" y="51.16" width="2.10" height="58.84" fill="rgb(168,139,250)"></rect><rect x="140.64" y="53.86" width="2.10" height="56.14" fill="rgb(152,147,249)"></rect><rect x="143.35" y="59.04" width="2.10" height="50.96" fill="rgb(177,136,241)"></rect><rect x="146.05" y="75.71" width="2.10" height="34.29" fill="rgb(168,139,249)"></rect><rect x="148.75" y="90.20" width="2.10" height="19.80" fill="rgb(132,158,247)"></rect><rect x="151.46" y="105.96" width="2.10" height="4.04" fill="rgb(72,190,241)"></rect><rect x="159.57" y="96.60" width="2.10" height="13.40" fill="rgb(172,137,246)"></rect><rect x="162.28" y="24.75" width="2.10" height="85.25" fill="rgb(163,141,250)"></rect><rect x="164.98" y="8.00" width="2.10" height="102.00" fill="rgb(164,141,250)"></rect><rect x="167.69" y="59.52" width="2.10" height="50.48" fill="rgb(119,165,246)"></rect><rect x="170.39" y="91.04" width="2.10" height="18.96" fill="rgb(221,121,202)"></rect><rect x="173.10" y="97.88" width="2.10" height="12.12" fill="rgb(192,131,228)"></rect><rect x="175.80" y="104.28" width="2.10" height="5.72" fill="rgb(165,140,250)"></rect><rect x="181.21" y="96.00" width="2.10" height="14.00" fill="rgb(206,126,215)"></rect><rect x="183.91" y="56.84" width="2.10" height="53.16" fill="rgb(176,136,242)"></rect><rect x="186.62" y="44.71" width="2.10" height="65.29" fill="rgb(146,150,248)"></rect><rect x="189.32" y="47.92" width="2.10" height="62.08" fill="rgb(163,141,250)"></rect><rect x="192.03" y="49.78" width="2.10" height="60.22" fill="rgb(148,149,248)"></rect><rect x="194.73" y="52.99" width="2.10" height="57.01" fill="rgb(133,158,247)"></rect><rect x="197.44" y="37.26" width="2.10" height="72.74" fill="rgb(145,151,248)"></rect><rect x="200.14" y="68.98" width="2.10" height="41.02" fill="rgb(150,148,248)"></rect><rect x="202.85" y="97.88" width="2.10" height="12.12" fill="rgb(192,131,228)"></rect><rect x="205.55" y="91.93" width="2.10" height="18.07" fill="rgb(192,131,228)"></rect><rect x="208.26" y="99.31" width="2.10" height="10.69" fill="rgb(162,142,250)"></rect><rect x="210.96" y="94.88" width="2.10" height="15.12" fill="rgb(123,163,246)"></rect><rect x="213.67" y="92.38" width="2.10" height="17.62" fill="rgb(125,162,246)"></rect><rect x="216.37" y="91.48" width="2.10" height="18.52" fill="rgb(175,136,243)"></rect><rect x="219.07" y="91.48" width="2.10" height="18.52" fill="rgb(200,128,221)"></rect><rect x="221.78" y="80.30" width="2.10" height="29.70" fill="rgb(183,134,236)"></rect><rect x="224.48" y="95.43" width="2.10" height="14.57" fill="rgb(188,132,232)"></rect><rect x="227.19" y="98.57" width="2.10" height="11.43" fill="rgb(194,130,226)"></rect><rect x="229.89" y="100.96" width="2.10" height="9.04" fill="rgb(191,131,229)"></rect><rect x="232.60" y="101.92" width="2.10" height="8.08" fill="rgb(172,137,246)"></rect><rect x="235.30" y="105.96" width="2.10" height="4.04" fill="rgb(203,127,219)"></rect><rect x="246.12" y="104.28" width="2.10" height="5.72" fill="rgb(242,115,184)"></rect><rect x="248.83" y="105.96" width="2.10" height="4.04" fill="rgb(185,133,234)"></rect><rect x="251.53" y="105.96" width="2.10" height="4.04" fill="rgb(231,118,194)"></rect><rect x="254.23" y="98.57" width="2.10" height="11.43" fill="rgb(211,125,211)"></rect><rect x="256.94" y="100.10" width="2.10" height="9.90" fill="rgb(139,154,247)"></rect><rect x="259.64" y="83.81" width="2.10" height="26.19" fill="rgb(205,127,217)"></rect><rect x="262.35" y="80.03" width="2.10" height="29.97" fill="rgb(180,135,238)"></rect><rect x="265.05" y="72.74" width="2.10" height="37.26" fill="rgb(180,135,238)"></rect><rect x="267.76" y="69.18" width="2.10" height="40.82" fill="rgb(119,165,246)"></rect><rect x="270.46" y="86.43" width="2.10" height="23.57" fill="rgb(146,150,248)"></rect><rect x="273.17" y="82.89" width="2.10" height="27.11" fill="rgb(64,195,241)"></rect><rect x="275.87" y="85.09" width="2.10" height="24.91" fill="rgb(34,211,238)"></rect><rect x="278.58" y="90.62" width="2.10" height="19.38" fill="rgb(200,128,221)"></rect><rect x="281.28" y="91.93" width="2.10" height="18.07" fill="rgb(169,138,248)"></rect><rect x="283.99" y="88.61" width="2.10" height="21.39" fill="rgb(135,156,247)"></rect><rect x="286.69" y="89.39" width="2.10" height="20.61" fill="rgb(146,150,248)"></rect><rect x="289.40" y="92.38" width="2.10" height="17.62" fill="rgb(210,125,212)"></rect><rect x="292.10" y="94.88" width="2.10" height="15.12" fill="rgb(189,132,231)"></rect><rect x="294.80" y="98.57" width="2.10" height="11.43" fill="rgb(151,147,249)"></rect><rect x="297.51" y="105.96" width="2.10" height="4.04" fill="rgb(229,119,195)"></rect><rect x="300.21" y="94.88" width="2.10" height="15.12" fill="rgb(202,128,219)"></rect><rect x="302.92" y="105.96" width="2.10" height="4.04" fill="rgb(244,114,182)"></rect><rect x="305.62" y="94.35" width="2.10" height="15.65" fill="rgb(156,145,249)"></rect><rect x="308.33" y="96.00" width="2.10" height="14.00" fill="rgb(133,157,247)"></rect><rect x="311.03" y="97.22" width="2.10" height="12.78" fill="rgb(152,147,249)"></rect><rect x="313.74" y="93.83" width="2.10" height="16.17" fill="rgb(158,144,249)"></rect><rect x="316.44" y="79.49" width="2.10" height="30.51" fill="rgb(139,154,247)"></rect><rect x="319.15" y="91.04" width="2.10" height="18.96" fill="rgb(165,140,250)"></rect><rect x="327.26" y="105.96" width="2.10" height="4.04" fill="rgb(222,121,202)"></rect><rect x="329.96" y="105.96" width="2.10" height="4.04" fill="rgb(172,137,245)"></rect><rect x="332.67" y="100.96" width="2.10" height="9.04" fill="rgb(178,135,240)"></rect><rect x="335.37" y="95.43" width="2.10" height="14.57" fill="rgb(76,188,242)"></rect><rect x="338.08" y="91.48" width="2.10" height="18.52" fill="rgb(161,142,249)"></rect><rect x="340.78" y="94.88" width="2.10" height="15.12" fill="rgb(142,152,248)"></rect><rect x="343.49" y="103.00" width="2.10" height="7.00" fill="rgb(217,123,206)"></rect><rect x="346.19" y="104.28" width="2.10" height="5.72" fill="rgb(188,132,232)"></rect><rect x="348.90" y="99.31" width="2.10" height="10.69" fill="rgb(162,142,250)"></rect><rect x="351.60" y="100.10" width="2.10" height="9.90" fill="rgb(148,149,248)"></rect><rect x="354.31" y="92.85" width="2.10" height="17.15" fill="rgb(176,136,242)"></rect><rect x="357.01" y="96.60" width="2.10" height="13.40" fill="rgb(101,175,244)"></rect><rect x="359.72" y="105.96" width="2.10" height="4.04" fill="rgb(207,126,215)"></rect><rect x="362.42" y="100.96" width="2.10" height="9.04" fill="rgb(198,129,223)"></rect><rect x="365.12" y="100.10" width="2.10" height="9.90" fill="rgb(192,131,228)"></rect><rect x="367.83" y="100.10" width="2.10" height="9.90" fill="rgb(191,131,229)"></rect><rect x="370.53" y="97.22" width="2.10" height="12.78" fill="rgb(201,128,220)"></rect><rect x="373.24" y="99.31" width="2.10" height="10.69" fill="rgb(177,136,241)"></rect><rect x="375.94" y="78.96" width="2.10" height="31.04" fill="rgb(173,137,245)"></rect><rect x="378.65" y="100.10" width="2.10" height="9.90" fill="rgb(198,129,222)"></rect><rect x="381.35" y="95.43" width="2.10" height="14.57" fill="rgb(109,171,245)"></rect><rect x="384.06" y="105.96" width="2.10" height="4.04" fill="rgb(198,129,223)"></rect><rect x="386.76" y="104.28" width="2.10" height="5.72" fill="rgb(148,149,248)"></rect><rect x="389.47" y="100.96" width="2.10" height="9.04" fill="rgb(105,172,244)"></rect><rect x="392.17" y="104.28" width="2.10" height="5.72" fill="rgb(201,128,220)"></rect><rect x="394.88" y="96.60" width="2.10" height="13.40" fill="rgb(177,136,241)"></rect><rect x="402.99" y="105.96" width="2.10" height="4.04" fill="rgb(206,126,216)"></rect><rect x="405.69" y="103.00" width="2.10" height="7.00" fill="rgb(93,179,243)"></rect><rect x="408.40" y="99.31" width="2.10" height="10.69" fill="rgb(203,127,219)"></rect><rect x="411.10" y="100.96" width="2.10" height="9.04" fill="rgb(183,134,236)"></rect><rect x="413.81" y="100.10" width="2.10" height="9.90" fill="rgb(190,131,229)"></rect><rect x="416.51" y="105.96" width="2.10" height="4.04" fill="rgb(208,126,214)"></rect><rect x="419.22" y="93.34" width="2.10" height="16.66" fill="rgb(211,125,211)"></rect><rect x="421.92" y="104.28" width="2.10" height="5.72" fill="rgb(239,116,187)"></rect><rect x="424.63" y="103.00" width="2.10" height="7.00" fill="rgb(240,115,185)"></rect><rect x="427.33" y="105.96" width="2.10" height="4.04" fill="rgb(175,137,243)"></rect><rect x="430.04" y="105.96" width="2.10" height="4.04" fill="rgb(244,114,182)"></rect><rect x="443.56" y="105.96" width="2.10" height="4.04" fill="rgb(244,114,182)"></rect><rect x="446.26" y="101.92" width="2.10" height="8.08" fill="rgb(230,119,194)"></rect><rect x="448.97" y="105.96" width="2.10" height="4.04" fill="rgb(77,188,242)"></rect><rect x="451.67" y="105.96" width="2.10" height="4.04" fill="rgb(212,124,210)"></rect><rect x="454.38" y="104.28" width="2.10" height="5.72" fill="rgb(221,122,202)"></rect><rect x="457.08" y="105.96" width="2.10" height="4.04" fill="rgb(34,211,238)"></rect><rect x="462.49" y="104.28" width="2.10" height="5.72" fill="rgb(244,114,182)"></rect><rect x="465.20" y="105.96" width="2.10" height="4.04" fill="rgb(189,132,231)"></rect><rect x="467.90" y="105.96" width="2.10" height="4.04" fill="rgb(191,131,229)"></rect><rect x="470.60" y="101.92" width="2.10" height="8.08" fill="rgb(202,128,219)"></rect><rect x="473.31" y="105.96" width="2.10" height="4.04" fill="rgb(140,153,248)"></rect><rect x="476.01" y="104.28" width="2.10" height="5.72" fill="rgb(208,126,214)"></rect><rect x="481.42" y="103.00" width="2.10" height="7.00" fill="rgb(201,128,220)"></rect><rect x="486.83" y="105.96" width="2.10" height="4.04" fill="rgb(230,118,194)"></rect><rect x="489.54" y="104.28" width="2.10" height="5.72" fill="rgb(194,130,226)"></rect><rect x="492.24" y="99.31" width="2.10" height="10.69" fill="rgb(130,159,247)"></rect><rect x="494.95" y="101.92" width="2.10" height="8.08" fill="rgb(226,120,198)"></rect><rect x="497.65" y="103.00" width="2.10" height="7.00" fill="rgb(193,130,227)"></rect><rect x="500.36" y="104.28" width="2.10" height="5.72" fill="rgb(215,124,208)"></rect><rect x="503.06" y="105.96" width="2.10" height="4.04" fill="rgb(201,128,220)"></rect><rect x="505.77" y="104.28" width="2.10" height="5.72" fill="rgb(211,125,211)"></rect><rect x="508.47" y="105.96" width="2.10" height="4.04" fill="rgb(198,129,223)"></rect><rect x="513.88" y="103.00" width="2.10" height="7.00" fill="rgb(221,122,202)"></rect><rect x="516.58" y="104.28" width="2.10" height="5.72" fill="rgb(140,153,248)"></rect><rect x="519.29" y="104.28" width="2.10" height="5.72" fill="rgb(184,134,235)"></rect><rect x="521.99" y="103.00" width="2.10" height="7.00" fill="rgb(178,135,240)"></rect><rect x="524.70" y="103.00" width="2.10" height="7.00" fill="rgb(205,127,216)"></rect><rect x="527.40" y="104.28" width="2.10" height="5.72" fill="rgb(87,182,243)"></rect><rect x="530.11" y="104.28" width="2.10" height="5.72" fill="rgb(127,161,246)"></rect><rect x="532.81" y="104.28" width="2.10" height="5.72" fill="rgb(237,116,188)"></rect><rect x="535.52" y="100.10" width="2.10" height="9.90" fill="rgb(120,165,246)"></rect><rect x="538.22" y="105.96" width="2.10" height="4.04" fill="rgb(178,135,240)"></rect><rect x="540.93" y="104.28" width="2.10" height="5.72" fill="rgb(194,130,226)"></rect><rect x="543.63" y="105.96" width="2.10" height="4.04" fill="rgb(198,129,222)"></rect><rect x="546.33" y="104.28" width="2.10" height="5.72" fill="rgb(212,124,210)"></rect><rect x="549.04" y="97.22" width="2.10" height="12.78" fill="rgb(189,132,230)"></rect><rect x="551.74" y="94.88" width="2.10" height="15.12" fill="rgb(171,138,246)"></rect><rect x="554.45" y="92.38" width="2.10" height="17.62" fill="rgb(170,138,247)"></rect><rect x="557.15" y="100.10" width="2.10" height="9.90" fill="rgb(84,184,242)"></rect><rect x="559.86" y="103.00" width="2.10" height="7.00" fill="rgb(170,138,248)"></rect><rect x="562.56" y="97.88" width="2.10" height="12.12" fill="rgb(210,125,212)"></rect><rect x="565.27" y="100.10" width="2.10" height="9.90" fill="rgb(200,128,221)"></rect><rect x="567.97" y="59.36" width="2.10" height="50.64" fill="rgb(160,143,249)"></rect><rect x="570.68" y="101.92" width="2.10" height="8.08" fill="rgb(201,128,220)"></rect><rect x="573.38" y="96.00" width="2.10" height="14.00" fill="rgb(141,153,248)"></rect><rect x="576.09" y="93.34" width="2.10" height="16.66" fill="rgb(163,141,250)"></rect><rect x="578.79" y="78.96" width="2.10" height="31.04" fill="rgb(173,137,245)"></rect><rect x="581.49" y="90.62" width="2.10" height="19.38" fill="rgb(157,145,249)"></rect><rect x="584.20" y="80.58" width="2.10" height="29.42" fill="rgb(171,138,246)"></rect><rect x="586.90" y="87.14" width="2.10" height="22.86" fill="rgb(190,132,230)"></rect><rect x="589.61" y="86.09" width="2.10" height="23.91" fill="rgb(171,138,247)"></rect><rect x="592.31" y="91.93" width="2.10" height="18.07" fill="rgb(152,147,249)"></rect><rect x="595.02" y="82.00" width="2.10" height="28.00" fill="rgb(82,185,242)"></rect><rect x="597.72" y="84.12" width="2.10" height="25.88" fill="rgb(141,153,248)"></rect><rect x="600.43" y="88.24" width="2.10" height="21.76" fill="rgb(149,149,248)"></rect><rect x="603.13" y="94.35" width="2.10" height="15.65" fill="rgb(179,135,240)"></rect><rect x="605.84" y="90.62" width="2.10" height="19.38" fill="rgb(101,175,244)"></rect><rect x="608.54" y="84.76" width="2.10" height="25.24" fill="rgb(172,137,245)"></rect><rect x="611.25" y="86.78" width="2.10" height="23.22" fill="rgb(154,146,249)"></rect><rect x="613.95" y="89.00" width="2.10" height="21.00" fill="rgb(160,143,249)"></rect><rect x="616.65" y="95.43" width="2.10" height="14.57" fill="rgb(161,142,249)"></rect><rect x="619.36" y="100.96" width="2.10" height="9.04" fill="rgb(177,136,241)"></rect><rect x="622.06" y="104.28" width="2.10" height="5.72" fill="rgb(231,118,193)"></rect><rect x="624.77" y="105.96" width="2.10" height="4.04" fill="rgb(238,116,188)"></rect><rect x="627.47" y="105.96" width="2.10" height="4.04" fill="rgb(206,126,215)"></rect><rect x="630.18" y="104.28" width="2.10" height="5.72" fill="rgb(232,118,193)"></rect><rect x="632.88" y="100.96" width="2.10" height="9.04" fill="rgb(182,134,237)"></rect><rect x="635.59" y="105.96" width="2.10" height="4.04" fill="rgb(116,166,245)"></rect><rect x="638.29" y="104.28" width="2.10" height="5.72" fill="rgb(140,153,248)"></rect><rect x="641.00" y="94.35" width="2.10" height="15.65" fill="rgb(219,122,204)"></rect><rect x="643.70" y="89.79" width="2.10" height="20.21" fill="rgb(182,134,237)"></rect><rect x="646.41" y="87.50" width="2.10" height="22.50" fill="rgb(87,183,243)"></rect><rect x="649.11" y="101.92" width="2.10" height="8.08" fill="rgb(177,136,241)"></rect><rect x="651.81" y="89.00" width="2.10" height="21.00" fill="rgb(185,133,234)"></rect><rect x="657.22" y="92.38" width="2.10" height="17.62" fill="rgb(182,134,237)"></rect><rect x="659.93" y="104.28" width="2.10" height="5.72" fill="rgb(163,141,250)"></rect><rect x="662.63" y="104.28" width="2.10" height="5.72" fill="rgb(141,153,248)"></rect><rect x="670.75" y="97.22" width="2.10" height="12.78" fill="rgb(193,131,227)"></rect><rect x="673.45" y="104.28" width="2.10" height="5.72" fill="rgb(197,129,224)"></rect><rect x="676.16" y="100.10" width="2.10" height="9.90" fill="rgb(211,125,211)"></rect><rect x="678.86" y="105.96" width="2.10" height="4.04" fill="rgb(240,115,186)"></rect><rect x="681.57" y="95.43" width="2.10" height="14.57" fill="rgb(177,136,241)"></rect><rect x="684.27" y="103.00" width="2.10" height="7.00" fill="rgb(34,211,238)"></rect><rect x="686.98" y="97.22" width="2.10" height="12.78" fill="rgb(171,138,247)"></rect><rect x="689.68" y="105.96" width="2.10" height="4.04" fill="rgb(244,114,182)"></rect><rect x="692.38" y="97.88" width="2.10" height="12.12" fill="rgb(197,129,224)"></rect><rect x="695.09" y="105.96" width="2.10" height="4.04" fill="rgb(177,136,241)"></rect><rect x="697.79" y="96.60" width="2.10" height="13.40" fill="rgb(188,132,232)"></rect><rect x="700.50" y="96.00" width="2.10" height="14.00" fill="rgb(187,133,232)"></rect><rect x="705.91" y="94.88" width="2.10" height="15.12" fill="rgb(197,129,223)"></rect><rect x="708.61" y="99.31" width="2.10" height="10.69" fill="rgb(166,139,250)"></rect><rect x="711.32" y="97.22" width="2.10" height="12.78" fill="rgb(188,132,232)"></rect><rect x="714.02" y="100.10" width="2.10" height="9.90" fill="rgb(34,211,238)"></rect><rect x="716.73" y="97.88" width="2.10" height="12.12" fill="rgb(224,121,200)"></rect><rect x="719.43" y="104.28" width="2.10" height="5.72" fill="rgb(34,211,238)"></rect><rect x="722.14" y="105.96" width="2.10" height="4.04" fill="rgb(241,115,185)"></rect><rect x="724.84" y="104.28" width="2.10" height="5.72" fill="rgb(148,149,248)"></rect><rect x="732.95" y="99.31" width="2.10" height="10.69" fill="rgb(34,211,238)"></rect><rect x="735.66" y="103.00" width="2.10" height="7.00" fill="rgb(137,155,247)"></rect><rect x="738.36" y="105.96" width="2.10" height="4.04" fill="rgb(96,177,244)"></rect><rect x="749.18" y="104.28" width="2.10" height="5.72" fill="rgb(227,119,197)"></rect><rect x="751.89" y="105.96" width="2.10" height="4.04" fill="rgb(223,121,200)"></rect><rect x="754.59" y="105.96" width="2.10" height="4.04" fill="rgb(172,137,246)"></rect><g><line x1="4" y1="0" x2="4" y2="110" stroke="#6b7280" stroke-dasharray="3 3"></line><text x="9" y="125" font-size="11.5" fill="#9ca3af" text-anchor="start">first 100-file draft batch</text></g><g><line x1="338.9639781108732" y1="0" x2="338.9639781108732" y2="110" stroke="#6b7280" stroke-dasharray="3 3"></line><text x="338.9639781108732" y="125" font-size="11.5" fill="#9ca3af" text-anchor="middle">PR #30412 opened</text></g><g><line x1="756" y1="0" x2="756" y2="110" stroke="#6b7280" stroke-dasharray="3 3"></line><text x="751" y="125" font-size="11.5" fill="#9ca3af" text-anchor="end">merged</text></g><line x1="0" y1="0" x2="0" y2="110" stroke="#ffffff" stroke-width="2"></line></svg>

全部 6502 个 commit（排除 merge）的回放。粉色柱主要是新增代码；青色柱主要是删除。行数计数会把中间每次重写都算进去，最终落地的 diff 是 +1009272。日志是真实 commit message。

#### 0 个测试被跳过或删除

11 天（5 月 3 日 → 5 月 14 日合并）· 6778 个 commit

Platform

expect() calls

Tests

Files

Debian 13 x64

1,386,826

60,624

4,174

macOS 14 arm64

1,259,953

58,850

4,175

Windows 2019 x64

1,007,544

57,337

4,173

合并前，这花掉了 59 亿 uncached input token、6.9 亿 output token，以及 720 亿 cached input token read，按 API 定价大约是 16.5 万美元。如果手工做，我认为需要 3 个对代码库有完整上下文的工程师大约一年；在那段时间里，我们无法改进 Node.js 兼容性、修 bug、修安全问题或实现新功能。我们绝不会这么做。现实中的替代方案，就是什么都不做，然后永远继续修这篇文章开头列出的那些 bug。

这是今天可能性边界上最前沿的东西。我使用了 [Claude Fable 5](https://www.anthropic.com/news/claude-fable-5-mythos-5) 的预发布版本，这是一个 Mythos-class 模型。Claude Code 的 dynamic workflow 让 64 个 Claude 连续运行了 11 天（否则我就得自己写 harness 才能做到）。

### [工作还在继续](#the-work-continues)

自从合并 Rust port 后，我们已经完成了 [Claude Code Security](https://claude.com/product/claude-security) 的 11 轮安全 review，并处理了发现的问题。

我们还给 Bun 的每个 parser 加上了 7x24 coverage-guided fuzzing：JavaScript、TypeScript、JSX、CSS、JSON5、JSONC、TOML、YAML、Markdown、INI、Bun Shell scripts、semver ranges、.patch files 和 CSS colors。fuzzer 会自动把发现的 bug 发给 Claude，由它提交复现和修复 PR，然后由人类 review PR。到目前为止，它已经执行我们的 parser 1000 亿次，带来了大约 15 个 PR。

在写作时，Bun 的 Rust 代码大约 4% 位于 `unsafe` block 中（在约 780000 行里，有约 13000 个 `unsafe` keyword，分布在约 27000 行），其中 78% 的 block 只有一行：一个来自 C++ 的 pointer，或一次对 C library 的调用。随着我们从忠实的 Zig port（它没有可 grep 的 `unsafe` keyword）重构为惯用 Rust，我预计这个数字会随时间下降；但我们会继续使用 JavaScriptCore 这样的 C 和 C++ 库，所以它永远会比纯 Rust 项目有更多 `unsafe`。

### [移植错误](#porting-mistakes)

Rust 重写的重点是稳定性，但发布这么大的变更，不引入任何回归是不可能的。

这次重写引入了 19 个已知回归，每个都已经修复。

大多数回归来自两门语言中语法完全相同、语义却不同的代码。

#### `debug_assert!` 里的副作用

这两个片段看起来相似，但行为不同。Zig 的 `assert` 是函数，所以它的参数在每个 build 中都会运行。Rust 的 `debug_assert!` 是 macro，所以在 release build 中，整个表达式都会被擦除，包括 `insert_stale` 调用。

```jsx
// Zig:
if (dev.framework.react_fast_refresh) |rfr| {
    assert(try dev.client_graph.insertStale(rfr.import_source, false) == IncrementalGraph(.client).react_refresh_index);
}

// Rust:
if let Some(rfr) = &dev.framework.react_fast_refresh {
    debug_assert!(dev.client_graph.insert_stale(&rfr.import_source, false)? == react_refresh_index);
}
```

`insert_stale` 会把一个文件加入 frontend dev server 的 hot reload graph。在 release build 中它不再运行，于是 HMR 在某些情况下坏掉：带有使用 React 的 HTML route 的项目中，当一个 hot reloaded 文件被 invalidated 时，会出现 `Cannot destructure property 'isLikelyComponentType' of 'k'`。Debug build 是正常的。[#30678](https://github.com/oven-sh/bun/issues/30678)

#### 奇数长度的 slice

Bun 的 Zig helper `reinterpretSlice(u16, bytes)`（早于 builtin cast 支持 slice）使用 `@divTrunc`，会忽略末尾多出来的奇数字节。`bytemuck::cast_slice` 则会 panic。`Blob.text()` 在遇到 UTF-16 byte order mark 后接奇数个字节时，不再返回字符串，而是让进程 panic。我们改回了忽略那个奇数字节：`&buf[..buf.len() & !1]`。[#31188](https://github.com/oven-sh/bun/issues/31188)

#### Bounds check

在 macOS 和 Linux 上，我们用 `ReleaseFast` 编译 Bun 的 Zig 代码，这会移除 bounds check。Rust 的 release build 会保留它们。

Bun 的 module resolver 会把长文件名 intern 到一个全局列表里，溢出后进入 overflow block。原来的 Zig 代码把每个 block 大小设为 `count / 4`，也就是 2048。移植时留下了一个 placeholder：

```jsx
/// ... so use a nonzero stand-in until Phase B threads the
/// per-instantiation value through.
pub const BSS_OVERFLOW_BLOCK_SIZE: usize = 64;
```

这把上限从 840 万个 interned filename 降到了 270272 个，真实项目会撞到；同时也让我们从 Zig 移植过来的 `ptrs[4095]` off-by-one 变得可达。Rust 没有写越界，而是 panic 了。如果我们使用 `ReleaseSafe`，Zig 在这种情况下也会 panic（我们只在 Windows 上这么做）。[#31503](https://github.com/oven-sh/bun/issues/31503)

#### `comptime` format string

`Output.pretty` 会把 `<r>` 和 `<d>` 颜色 marker 改写成 ANSI escape。在 Zig 中，`fmt` 是 `comptime`，所以 marker 在参数替换前就消失了。Rust function 没有 comptime 参数，所以 `Output::pretty` 只能看到完成后的字符串，也会把参数里的 marker 一起改写。

```jsx
// Zig:
pub inline fn pretty(comptime fmt: string, args: anytype) void;
Output.pretty("<r>{f}<r>", .{hyperlink});

// Rust:
pub fn pretty(payload: impl PrettyFmtInput);
Output::pretty(format_args!("<r>{}<r>", hyperlink));
```

`bun update -i` 会把 package name 打印成 [OSC 8](https://gist.github.com/egmontkob/eb114294efbcd5adb1944c9f3cb5feda) hyperlink，并用 `ESC \` 结束。那个反斜杠正好在尾部 `<r>` 的 `<` 前面，marker parser 吃掉了它，于是 `r` 被作为文本打印出来。

<figure><a target="_blank" href="https://bun.com/images/update-interactive-r.png"><img src="https://bun.com/images/update-interactive-r.png" caption="it should say oxfmt, not oxfmtr"></a><figcaption>it should say oxfmt, not oxfmtr</figcaption></figure>

在 Rust 中，它必须是 macro：`bun_core::pretty!("<r>{}<r>", hyperlink)`。[#30693](https://github.com/oven-sh/bun/issues/30693)

## [Rust 版 Bun 更好了](#bun-is-better-in-rust)

到目前为止，Bun v1.4.0 修复了 128 个可以在 v1.3.14 中复现的 bug，范围从内存泄漏到崩溃，再到帮助文本颜色错误。

### [内存使用减少](#reduced-memory-usage)

Rust 有一个强大的语言级内存清理工具：`Drop`。实现了 `Drop` 后，每当值离开作用域，`drop` 函数都会自动调用。

```jsx
impl Drop for Bytes {
    fn drop(&mut self) {
        if !self.pinned.is_empty() {
            JSC__JSValue__unpinArrayBuffer(self.pinned);
        }
    }
}
```

在 Zig 中，`defer` 可用于在作用域结束时运行代码：

```jsx
const bytes: ArrayBuffer = try .fromPinned(global, value);
defer bytes.unpin();
```

在 Zig 中，`defer` 需要添加到每一个可能需要清理的调用点。很容易最后忘了清理（内存泄漏），或者在很少走到的错误处理代码里把清理代码运行两次（double-free）。在 Rust 中，`Drop` 会在值不再可访问时自动运行，用“隐藏控制流”换掉一个常见 footgun。

`Drop` 修复了 Bun 中多个和错误处理代码中文件路径有关的内存泄漏。

#### 我们修复了每一个可 instrument 的内存泄漏

我们改进了 Bun 的 [LeakSanitizer](https://clang.llvm.org/docs/LeakSanitizer.html) 集成，用来追踪所有 [native code memory allocation](https://github.com/oven-sh/bun/pull/30875)。

这里有个例子：每次进程内调用 `Bun.build()` 都会泄漏数 MB 内存，也就是属于这次 build 的 parsed source text 和 AST symbol table，在 build 结束后仍然活着。

```jsx
// Bundle the same 60-module project 2,000 times in one process
for (let i = 0; i < 2_000; i++) {
  await Bun.build({
    entrypoints: ["./index.js"],
    minify: true,
    sourcemap: "external",
  });
}
```

在 Bun v1.3.14 中，每次 build 都会永久泄漏大约 3 MB。像 dev server 这种每个 request 都会 bundle 的工具，最终会耗尽内存。在 Bun v1.4.0 中，内存会趋于平稳：

Builds

Bun v1.3.14

Bun v1.4.0

500

1,914 MB

526 MB

1,000

3,506 MB

586 MB

1,500

5,097 MB

608 MB

2,000

6,745 MB

609 MB

此前有一次在 Zig 中做这件事的[尝试](https://github.com/oven-sh/bun/pull/24741)没有 merge，因为缺少等价于 Drop 的机制，让人更难有信心合并。

### [二进制体积更小](#smaller-binary-size)

Rust 重写的初始变更让 Windows 上的二进制体积减少了 3.8 MB，macOS 上减少 5.5 MB，Linux 上减少 6.8 MB。这主要是因为我们在 Zig 代码里用了太多 `comptime`。

初始缩小之后，团队继续探索更多减少二进制体积的机会，例如 Identical Code Folding 这样的 linker optimization、移除 ICU 中未使用的数据，以及用 zstd dictionary 按需懒解压 libicu 的小部分内容。

结合 Rust 重写、ICU 变更和 identical code folding，**Bun 的二进制体积在 Linux 和 Windows 上缩小了约 20%**。

Version

Platform

Size

Bun v1.4.0 (canary)

Windows

76 MB

Bun v1.3.14

Windows

94 MB

Bun v1.4.0 (canary)

Linux

70 MB

Bun v1.3.14

Linux

88 MB

### [栈空间使用减少](#reduced-stack-space-usage)

TOML parser，以及 Bun 中所有其他 recursive-descent parser（JSON、YAML、JavaScript、TypeScript 等），现在使用的栈空间都更少了。

这在合并 Rust 重写前导致了一些测试失败：

```jsx
bun test v1.3.14-canary.1 (e99311e58)
.......

105 | });
106 |
107 | it("Bun.TOML.parse throws on deeply nested inline tables instead of crashing", () => {
108 |   const depth = 25_000;
109 |   const deepToml = "a = " + "{ b = ".repeat(depth) + "1" + " }".repeat(depth);
110 |   expect(() => Bun.TOML.parse(deepToml)).toThrow(RangeError);
                                               ^
error: expect(received).toThrow(expected)

Expected constructor: RangeError

Received function did not throw
Received value: {
  a: {
    b: {
      b: {
        b: {
          b: {
            b: {
              b: {
                b: {
                  b: [Object ...],
                },
              },
            },
          },
        },
      },
    },
  },
}

      at <anonymous> (/var/lib/buildkite-agent/build/test/js/bun/resolve/toml/toml.test.js:110:42)

✗ Bun.TOML.parse throws on deeply nested inline tables instead of crashing [2907.64ms]
```

Rust 的 LLVM IR codegen 会在 stack variable 不再使用时发出 LLVM 的 [`llvm.lifetime.start`](https://llvm.org/docs/LangRef.html#llvm-lifetime-start-intrinsic) 和 [`llvm.lifetime.end`](https://llvm.org/docs/LangRef.html#llvm-lifetime-end-intrinsic) intrinsic，让 LLVM 可以复用栈空间 slot。这让带有嵌套作用域的大函数显著减少栈空间使用。

此前，我们通过把特别大的函数[重构成许多小函数](https://github.com/oven-sh/bun/pull/15993)，手动绕过 [一个未解决的问题](https://github.com/ziglang/zig/issues/23475)。

### [快 2% 到 5%](#2-5-faster)

Rust 支持 C/C++ 和 Rust 之间的跨语言 link-time optimization，这让跨语言 inline 成为可能（这也太酷了！）。

我们在 Linux x64（EC2，Xeon Platinum 8488C）上对 Bun v1.3.14 和 Bun v1.4.0 做了基准测试。HTTP throughput 用 [oha](https://github.com/hatoo/oha) 压测 hello-world server，app workload 用 [hyperfine](https://github.com/sharkdp/hyperfine) 测量。

**HTTP throughput（req/s，3 轮平均）**

server

Bun v1.3.14

Bun v1.4.0

Δ

Bun.serve

169.6k

177.7k

+4.8%

node:http

103.8k

108.5k

+4.5%

Elysia

158.9k

163.3k

+2.8%

express

64.5k

66.6k

+3.2%

fastify

91.5k

95.9k

+4.8%

**Apps / CLI（hyperfine）**

workload

Bun v1.3.14

Bun v1.4.0

Δ

next build

13.62 s

13.03 s

+4.5%

vite build (tsc + vite)

1.69 s

1.65 s

+2.2%

tsc -b --force

0.94 s

0.89 s

+4.7%

## [Production](#production)

Prisma 在 Bun 的 Rust 重写版上发布了 [Prisma Compute](https://www.prisma.io/blog/bun-rust-rewrite-prisma-compute) public beta。

“我们遇到过内存泄漏，以及一个连接池在 VM pause 后 resume 时无法恢复的问题。Rust 重写出现后，我们用同样的 failure mode 测试了它。它处理得非常完美。”——Alexey Orlenko

Claude Code v2.1.181（6 月 17 日发布）及之后的版本使用 Rust port 的 Bun。在 Linux 上启动速度快了 10%，除此之外几乎没人注意到。无聊是好事。

<figure><a target="_blank" href="https://bun.com/images/claude-code-rust-bun-startup.png"><img src="https://bun.com/images/claude-code-rust-bun-startup.png" alt="Claude Code startup time from production telemetry (Linux p50): v2.1.179 at 517ms vs v2.1.181, the first release on Rust Bun, at 464ms — 10% faster"></a></figure>

## [发布](#shipping)

Bun v1.3.14 是最后一个用 Zig 写的 Bun 版本。Bun v1.4.0 会是第一个用 Rust 写的 Bun 版本。它现在已经在 canary 中可用，请报告你发现的任何问题：

```jsx
bun upgrade --canary
```

## [可维护性](#maintainability)

对我和团队来说，新的 Rust 代码库感觉和旧的 Zig 代码库非常相似。例如，下面是原 Zig 代码和新 Rust 代码的一段：

```jsx
pub fn canMergeSymbols(
    scope: *Scope,
    existing: Symbol.Kind,
    new: Symbol.Kind,
    comptime is_typescript_enabled: bool,
) SymbolMergeResult {
    if (existing == .unbound) {
        return .replace_with_new;
    }

    if (comptime is_typescript_enabled) {
        // In TypeScript, imports are allowed to silently collide with symbols within
        // the module. Presumably this is because the imports may be type-only:
        //
        //   import {Foo} from 'bar'
        //   class Foo {}
        //
        if (existing == .import) {
            return .replace_with_new;
        }

        // ...
    }

    // ...
}
```

```jsx
pub fn can_merge_symbol_kinds<const IS_TYPESCRIPT_ENABLED: bool>(
    scope_kind: Kind,
    existing: symbol::Kind,
    new: symbol::Kind,
) -> SymbolMergeResult {

    if existing == symbol::Kind::Unbound {
        return SymbolMergeResult::ReplaceWithNew;
    }

    if IS_TYPESCRIPT_ENABLED {
        // In TypeScript, imports are allowed to silently collide with symbols within
        // the module. Presumably this is because the imports may be type-only:
        //
        //   import {Foo} from 'bar'
        //   class Foo {}
        //
        if existing == symbol::Kind::Import {
            return SymbolMergeResult::ReplaceWithNew;
        }

        // ...
    }

    // ...
}
```

任何理解原 Zig 代码的人，也能理解机械翻译出来的 Rust 代码。我 review 原始 Rust 重写 PR 的方式，是检查 adversarial code review agent 是否正确抓到了 Zig 代码和 Rust 代码之间的差异，是否确保 porting guide 和 lifetime guide 被遵循，同时我也自己把很多代码按 Zig vs Rust 并排手动读了一遍。

## [下一步](#what-s-next)

Bun v1.4 让 Bun 更快、更小、使用更少内存，并给团队提供了极其强大的工具来系统性地改进未来稳定性：Rust 的 borrow checker、Miri（CI 中正在覆盖越来越多代码）、LeakSanitizer，以及针对 parser 的 7x24 coverage-guided fuzzing。还有[更多内容需要重构](https://bun.com/bun-unsafe-audit)，但开局很好。

如果由一个对代码库有完整上下文的工程师团队来做，这次 Rust 重写会花一年。借助 Fable，并由 1 个工程师密切监控 Claude Code，我们从开始到所有平台上 100% 测试套件通过，只用了 11 天。

今天，一个工程师能做的事比一年前多得多。
