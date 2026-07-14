---
title: Rewriting Bun in Rust
date: '2026-07-09T08:18:46.066Z'
sourceUrl: 'https://bun.com/blog/bun-in-rust'
lang: source
---
Disclosure: Bun was acquired by Anthropic in December 2025. I and others on the Bun team work at Anthropic. I used a pre-release version of Claude Fable 5 for much of the Rust rewrite.

Bun started as a line-for-line port of esbuild's JavaScript & TypeScript transpiler from Go to Zig. I wrote my first line of Zig on [April 16, 2021](https://github.com/ziglang/zig/issues/8575). I bet on Zig after seeing the single-page [Zig Language Reference](https://ziglang.org/documentation/master/) on Hacker News and getting really excited about the low-level control and care for performance.

From the start, Bun's scope was massive:

*   JavaScript, TypeScript, and CSS transpiler, minifier, and bundler
*   npm-compatible package manager
*   Jest-like test runner
*   Node.js & TypeScript-compatible module resolution
*   HTTP/1.1 & WebSocket client
*   Node.js API implementations like `fs`, `net`, `tls`, and dozens of other modules

The initial version of Bun was written by me in 1 year, in a cramped Oakland apartment, pre-LLM, in Zig. The default outcome for ambitiously-scoped projects like Bun is joining the graveyard of dead side projects on a GitHub profile page. Zig made Bun possible. I would never have been able to build this much in 1 year if it wasn't for Zig.

Nowadays, Bun's CLI gets over 22 million monthly downloads. Popular tools like Claude Code and OpenCode bet on Bun as their runtime. Vercel, Railway, DigitalOcean and more have 1st-party support for Bun.

Bun's scope has also been a challenge for stability. Here's a small sample of bugs we fixed in Bun v1.3.14:

*   heap-use-after-free crash in `node:zlib` when calling `.reset()` on a zlib, Brotli, or Zstd stream while an async `.write()` is still in progress on the threadpool
*   use-after-free crash in `node:zlib` when an `onerror` callback issued a re-entrant `write()` followed by `close()` on native handles
*   use-after-free crashes in `node:http2` when re-entrant JS callbacks (e.g. `session.request()` inside a timeout listener, an options getter, or a write callback) triggered a hashmap rehash, invalidating internal stream pointers
*   use-after-free in `UDPSocket.send()` and `sendMany()` where user code in `valueOf()` or `toString()` callbacks could detach an `ArrayBuffer` between payload capture and the actual send
*   crash and out-of-bounds read in `Buffer#copy` and `Buffer#fill` when a `valueOf` callback detaches or resizes the underlying `ArrayBuffer` during argument coercion
*   heap out-of-bounds write in `UDPSocket.sendMany()` when the socket's connection state changed mid-iteration via user JS callbacks
*   memory leak in `crypto.scrypt` where the callback and protected password/salt buffers were never released when the output buffer allocation failed
*   `SSLWrapper.init` leaked the strdup'd passphrase on error paths
*   memory leak in `tlsSocket.setSession()` where each call leaked one `SSL_SESSION` (~6.5 KB per call) due to a missing `SSL_SESSION_free` after `d2i_SSL_SESSION`
*   memory leak where `fs.watch()` watchers were never garbage collected after `.close()`, caused by a reference count underflow that permanently pinned each watcher as a GC root
*   double-free crash in the CSS parser when `background-clip` had vendor prefixes and multi-layer backgrounds
*   `DuplexUpgradeContext` was never freed — a full leak per `tls.connect({ socket: duplex })`
*   race condition crash in `MessageEvent` where the GC marker thread could observe a torn variant in `m_data` during concurrent access from a `BroadcastChannel` or `MessagePort`

We could have kept fixing these kinds of bugs one-off in perpetuity, but we owe it to our users counting on us to do better than that, and systematically prevent these kinds of bugs from recurring.

### [What we were already doing](#what-we-were-already-doing)

*   We patched the Zig compiler to add Address Sanitizer support. We run our test suite with ASAN on every commit.
*   We ship Zig safety-checked ReleaseSafe builds on Windows
*   We fuzz Bun's runtime APIs 24/7 using [Fuzzilli](https://github.com/googleprojectzero/fuzzilli), the JavaScript engine fuzzer used by V8 & JavaScriptCore
*   We have a whole lot of end-to-end memory leak tests

This is more than many projects do.

## [Just be really smart and don't make mistakes?](#just-be-really-smart-and-don-t-make-mistakes)

Our bugfix list felt bad and I was tired of going to sleep worrying about crashes in Bun. I don't blame Zig for that - other users of Zig don't have the bugs we had, and mixing GC with manually-managed memory is an uncommon enough thing for software to need that no language really designs for it. We wouldn't have gotten this far if not for Zig, and I'll always be grateful. Until very recently, programming language choice was a one-way decision for a project like Bun.

JavaScript is a garbage-collected language and modern JavaScript engines like JavaScriptCore (and V8) have strict rules around exception handling and the garbage collector. Zig, like C, doesn't manage memory for you and this is a tradeoff that for many projects is a great reason to use Zig. Zig does not have constructors/destructors, and most cleanup is expected to be written out explicitly at each call site with `defer`.

For Bun, correctly handling the lifetimes of garbage-collected values and manually-managed values has been a major source of stability issues - most often small memory leaks and occasionally, crashes. Every memory allocation has to be meticulously reviewed. Where do these bytes get freed? How do we ensure it only gets freed once? Did we check for JavaScript exceptions properly? Is this garbage-collected pointer visible to the conservative stack scanner? Is this garbage collected memory or manually managed memory?

For stability issues, knowing as early as possible is best. Fuzzing happens after code is merged. CI happens when code is pushed. Runtime safety checks & address sanitizer happens when code is run (hopefully in development, before CI).

One common way to reduce this class of issue is to ensure cleanup code is always run exactly once for code that needs it. Zig is designed to be a simple language with no hidden control flow, and so it prefers the explicit `defer` keyword to run code at the end of a scope over C++'s implicit ~Destructor or Rust's implicit `Drop`.

Language

Cleanup

Zig

`defer`, `errdefer`

C++

~Destructor, &&Move

Rust

Drop

For Zig code, when exactly should we be running the cleanup code? If we're passing the same `*T` to many different functions, how do we know when it's no longer accessible and can be cleaned up? How does it work when some functions need to continue to reference the memory after the function is called? Our current approach is a mix of:

*   arena lifetimes, where the scope of when it's accessible is clear (parser state doesn't escape the calling function and so AST nodes are a good choice there)
*   reference-counting
*   pay really close attention

Many projects opt to answer these kinds of questions through a style guide. TigerBeetle's [TigerStyle](https://tigerstyle.dev/) is an example in Zig and Google's 31,000 word [C++ style guide](https://google.github.io/styleguide/cppguide.html) is another. The challenge with style guides is enforcement. How do you make sure the style guide is followed? Historically, code review was the answer with best-effort enforcement via linters & static analyzers.

Having a rigid style guide with clear ownership expectations explicitly spelled out in the type system was a real option for Bun. Since Zig has no operator overloading, we would likely end up with a lot of code looking something like this:

```jsx
fn foo(a_ptr: SharedPtr(TCPSocket)) !void {
  const a: *TCPSocket = a_ptr.get();
  defer a_ptr.deref();

  const b = try do_something_with_a(a);
  defer b.deref();

  // ...
}
```

This is less ergonomic than the Zig we expect:

```jsx
fn foo(a: *TCPSocket) !void {
  const b = try do_something_with_a(a);
  // ...
}
```

## [What about C/C++?](#what-about-c-c)

About 20% of Bun's code is written in C++ and Bun embeds several C/C++ libraries:

*   JavaScriptCore, the JavaScript engine that powers Safari
*   uWebSockets & usockets - our HTTP/WebSocket server, and event loop
*   lshpack & lsquic - `HPACK` and HTTP/3 libraries
*   BoringSSL, Google's OpenSSL fork
*   SQLite

C++ instead of Zig would be a reasonable choice for Bun. We would get constructors & destructors. We could delete lots of `extern "C"` wrapper code.

But, we would still be reliant on style guides enforced through code review, and even with ASAN, memory corruption and memory leaks would still happen.

## [Why Rust?](#why-rust)

A large percentage of bugs from that list are use-after-free, double-free, and "forgot to free" in an error path. In safe Rust, these are compiler errors and RAII-like automatic cleanup with `Drop`. Compiler errors are a better feedback loop than a style guide.

Historically, rewrites are a terrible idea. Excluding comments, Bun is 535,496 lines of Zig. A rewrite in another language would take a small team of engineers a full year. It would mean freezing bugfixes, security fixes or feature development for that time. The least risky approach to getting something shippable would be a mechanical port from Zig to Rust, with the minimal number of behavioral changes, using the exact same test suite we already use for testing Bun.

Fortunately, Bun's own test suite is written in TypeScript which means it doesn't depend on the runtime's programming language.

A year of zero user-facing impact is not a realistic option we could consider. So, enforcement through code-style to fix stability issues was our best bet, and was our plan when we added Rust-inspired [smart pointers](https://github.com/oven-sh/bun/blob/3a79bd746b11601c9db970b608c73f0b9f96ac81/src/ptr/shared.zig#L569) to Bun's codebase.

But honestly, I didn't want to do it. Homegrown smart pointers offer worse ergonomics than Rust, with none of the guarantees.

What if, instead, I spend a week testing if Anthropic's new model can rewrite Bun in Rust?

At first, I didn't expect it to work. A few days in, a high % of the test suite started passing and I saw how much the new Rust code matched up with the original Zig codebase. My opinion went from "this is worth trying" to "I'm going to merge this".

## [Claude, rewrite Bun in Rust.](#claude-rewrite-bun-in-rust)

There are a lot of ways to do a terrible job of this. For example, prompting Claude "Rewrite Bun in Rust. Don't make any mistakes." and then praying it would work is not what I did.

Think about how a person would do this. The first big question is:

Incremental rewrite? Or, everything all at once?

In my experience porting esbuild's transpiler from Go to Zig for the initial version of Bun (without LLMs), everything all at once is better. An incremental rewrite adds temporary code that you hope gets deleted eventually, and would be painful in the short-medium term.

The second big question: how?

How do we keep Bun in Rust the same Bun as before, with the same architecture, performance, and feature-set while also getting the language features of Rust like the borrow checker? How do we ensure the team can still maintain it after the rewrite?

Do the rewrite that looks like we transpiled our Zig code to Rust. We can gradually refactor it to reduce `unsafe` usage and look more like idiomatic Rust after Bun v1.4 ships.

Those are the only two big questions. Everything else is tactics.

## [Loops that write & review code](#loops-that-write-review-code)

A lot of day-to-day engineering work as software engineers can be over-simplified into loops.

```jsx
// Pseudocode, not real code:
let task;
while ((task = todoList.pop())) {
  const result = task();
  const feedback = await Promise.all([review(result), review(result)]);
  await apply(feedback, result);
}
```

A `task` has some context associated with it (a Jira ticket, a GitHub issue, etc). The `result` is the code you wrote to fix it. Code reviewer(s) `review` the changes to check for regressions & correctness. And then you address the feedback.

I rewrote Bun in Rust using about 50 dynamic workflows in Claude Code run continuously over the course of 11 days.

Each dynamic workflow was a loop like this - a workflow for:

*   Generate a porting guide mapping Zig patterns & types to Rust patterns & types
*   Mechanically port every `.zig` file to a `.rs` file, matching the PORTING.md and LIFETIMES.tsv
*   Fix every crate's compiler errors
*   Get subcommands like `bun test` or `bun build` to work
*   Get every test in Bun's entire test suite to pass
*   Several large refactors and cleanup passes

For most of those 11 days (and after), I monitored workflows - manually reading the outputs to check for issues and bugs, and prompting Claude to edit the loop to fix things.

How do you review a PR with +1 million lines added? How do you start to build the confidence needed to responsibly merge large quantities of LLM-authored code?

A language-independent test suite with a million assertions, adversarial code review and when something does go wrong, fixing the process that generates the code instead of hand-fixing the code.

### [Adversarial review](#adversarial-review)

Adversarial review asks Claude (in a separate context window) to exhaustively come up with reasons why the changes create bugs or do not work.

#### Split context windows

Usually with humans, the person reviewing the code is not the person who authored the code. The person writing the code wants to merge the code, which can bias their actions to ship before it's ready.

Claude is the same way. The Claude that wrote the code wants the code to get accepted. The Claude that reviews wants to find issues in the code.

1 implementer, 2 or more adversarial reviewers per implementer. The reviewer's only job: find bugs & reasons why the code does not work. The implementer doesn't review. The reviewer doesn't implement.

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

uv\_close is asynchronous: libuv keeps the raw handle pointer until the next loop tick, then calls on\_pipe\_close, which frees the allocation. But \`pipe\` is a Box that drops at the end of this match arm — libuv is left holding freed memory, and the close callback then frees it a second time. Use-after-free, then double-free.

✻

Box::leak(pipe).close(Subprocess::on\_pipe\_close)

f0a454376c7 · win-review: js\_bun\_spawn\_bindings.rs leak Box<uv::Pipe> before async uv\_close to avoid UAF/double-free in on\_pipe\_close

Three bugs the adversarial reviewers actually caught — every cited commit carries its review attribution in the subject line. All three compiled; all three looked plausible. The reviewer is a second Claude in its own context window: it gets the diff and nothing else — none of the implementer's reasoning — and is told to find the way it's wrong. Code is condensed from the cited commits; same bugs, same fixes.

## [What does this look like?](#what-does-this-look-like)

If you're about to do something big and expensive, it saves time and money to de-risk it first.

### [Prep work](#prep-work)

Before writing any code, I spent about 3 hours talking to Claude about how to map patterns from our Zig codebase closely to Rust. Claude serialized this discussion into a `PORTING.md` document, which ended up on [Hacker News](https://news.ycombinator.com/item?id=48016880).

The next question: how do you add Rust lifetimes to code that manually manages memory?

That's where I prompted Claude something like this:

Me: Let's kick off a dynamic workflow to analyze the proper lifetimes of every struct field in the codebase. This workflow should read every struct field within every single file and trace the control flow. First, look for struct fields with complex lifetimes to express in Rust, then propose a lifetime for that field, then use 2 adversarial review agents to review that lifetime, then apply any feedback and serialize into a LIFETIMES.tsv for other claudes to look at.

Then a round of adversarial reviews on the `PORTING.md` and the `LIFETIMES.tsv` together to fix any conflicting suggestions and double check everything. I also manually read over it.

### [Trial run](#trial-run)

Before asking Claude to translate all 1,448 .zig files to .rs files, I started with just 3. For each of the 3 files, 1 implementer wrote the new `.rs` file, 2 adversarial reviewers checked the `.rs` file matched the behavior of the `.zig` file and that it followed the `PORTING.md` & `LIFETIMES.tsv`. After that, 1 fixer applied any suggestions.

### [False starts](#false-starts)

I asked Claude to loop the workflow on all 1,448 .zig files, and about 2 minutes in, one Claude ran `git stash` before committing. Another ran `git stash pop`. And then `git reset HEAD --hard`. They were stepping on each other! And if I put each Claude into a separate worktree, I would run out of disk space because Bun's git repository is too big and eventually the changes will need to be compiled and seen together.

So, I asked Claude to edit the workflow to instruct Claude to never run `git stash` or `git reset` or any `git` command that doesn't commit a specific file at once. No `cargo` either. No slow commands at all.

Then, Claude resumed the workflows. And it was working! Too slowly, so I split it into just 4 workflow shards each with their own worktree (4 worktrees total), each running 16 claudes committing and pushing files.

### [Finally writing the code](#finally-writing-the-code)

Thanks to all the parallelization & this prep work, at peak Claude wrote about 1,300 lines of code per minute. Every line of code was reviewed by two separate adversarial reviewers (also Claude) and went through a round of fixes before committing. Absolutely none of it worked yet.

11 days × 24 hours · PDT

6,502 commits

1695 commits/hour

<svg viewBox="0 0 556 257" role="img" aria-label="Commits per hour across the 11 days of the rewrite"><text x="52" y="15" font-size="12" fill="#6b7280">12am</text><text x="178" y="15" font-size="12" fill="#6b7280">6am</text><text x="304" y="15" font-size="12" fill="#6b7280">12pm</text><text x="430" y="15" font-size="12" fill="#6b7280">6pm</text><g><text x="44" y="38" font-size="12" text-anchor="end" fill="#6b7280">May 4</text><rect x="52" y="24" width="19" height="19" rx="4" fill="#16181f"></rect><rect x="73" y="24" width="19" height="19" rx="4" fill="#16181f"></rect><rect x="94" y="24" width="19" height="19" rx="4" fill="#16181f"></rect><rect x="115" y="24" width="19" height="19" rx="4" fill="#16181f"></rect><rect x="136" y="24" width="19" height="19" rx="4" fill="#16181f"></rect><rect x="157" y="24" width="19" height="19" rx="4" fill="#16181f"></rect><rect x="178" y="24" width="19" height="19" rx="4" fill="#16181f"></rect><rect x="199" y="24" width="19" height="19" rx="4" fill="rgb(106,40,164)" data-t="7" data-n="6"><title>May 4, 7am–8am PDT — 6 commits, +89,278 lines</title></rect><rect x="220" y="24" width="19" height="19" rx="4" fill="rgb(88,37,141)" data-t="8" data-n="2"><title>May 4, 8am–9am PDT — 2 commits, +50,742 lines</title></rect><rect x="241" y="24" width="19" height="19" rx="4" fill="rgb(80,36,130)" data-t="9" data-n="1"><title>May 4, 9am–10am PDT — 1 commit, +28,149 lines</title></rect><rect x="262" y="24" width="19" height="19" rx="4" fill="#16181f"></rect><rect x="283" y="24" width="19" height="19" rx="4" fill="rgb(80,36,130)" data-t="11" data-n="1"><title>May 4, 11am–12pm PDT — 1 commit, +39,752 lines</title></rect><rect x="304" y="24" width="19" height="19" rx="4" fill="rgb(94,38,149)" data-t="12" data-n="3"><title>May 4, 12pm–1pm PDT — 3 commits, +251,616 lines</title></rect><rect x="325" y="24" width="19" height="19" rx="4" fill="rgb(88,37,141)" data-t="13" data-n="2"><title>May 4, 1pm–2pm PDT — 2 commits, +161,724 lines</title></rect><rect x="346" y="24" width="19" height="19" rx="4" fill="#16181f"></rect><rect x="367" y="24" width="19" height="19" rx="4" fill="rgb(94,38,149)" data-t="15" data-n="3"><title>May 4, 3pm–4pm PDT — 3 commits, +136,381 lines</title></rect><rect x="388" y="24" width="19" height="19" rx="4" fill="#16181f"></rect><rect x="409" y="24" width="19" height="19" rx="4" fill="rgb(103,39,160)" data-t="17" data-n="5"><title>May 4, 5pm–6pm PDT — 5 commits, +895 lines</title></rect><rect x="430" y="24" width="19" height="19" rx="4" fill="rgb(103,39,160)" data-t="18" data-n="5"><title>May 4, 6pm–7pm PDT — 5 commits, +17,027 lines</title></rect><rect x="451" y="24" width="19" height="19" rx="4" fill="rgb(80,36,130)" data-t="19" data-n="1"><title>May 4, 7pm–8pm PDT — 1 commit, +106 lines</title></rect><rect x="472" y="24" width="19" height="19" rx="4" fill="#16181f"></rect><rect x="493" y="24" width="19" height="19" rx="4" fill="rgb(127,37,161)" data-t="21" data-n="13"><title>May 4, 9pm–10pm PDT — 13 commits, +11,661 lines</title></rect><rect x="514" y="24" width="19" height="19" rx="4" fill="#16181f"></rect><rect x="535" y="24" width="19" height="19" rx="4" fill="rgb(106,40,164)" data-t="23" data-n="6"><title>May 4, 11pm–12am PDT — 6 commits, +8,516 lines</title></rect></g><g><text x="44" y="59" font-size="12" text-anchor="end" fill="#6b7280">May 5</text><rect x="52" y="45" width="19" height="19" rx="4" fill="rgb(116,39,165)" data-t="24" data-n="9"><title>May 5, 12am–1am PDT — 9 commits, +1,381 lines</title></rect><rect x="73" y="45" width="19" height="19" rx="4" fill="rgb(109,40,168)" data-t="25" data-n="7"><title>May 5, 1am–2am PDT — 7 commits, +1,577 lines</title></rect><rect x="94" y="45" width="19" height="19" rx="4" fill="rgb(99,39,154)" data-t="26" data-n="4"><title>May 5, 2am–3am PDT — 4 commits, +2,035 lines</title></rect><rect x="115" y="45" width="19" height="19" rx="4" fill="rgb(99,39,154)" data-t="27" data-n="4"><title>May 5, 3am–4am PDT — 4 commits, +7,808 lines</title></rect><rect x="136" y="45" width="19" height="19" rx="4" fill="rgb(80,36,130)" data-t="28" data-n="1"><title>May 5, 4am–5am PDT — 1 commit, +2,796 lines</title></rect><rect x="157" y="45" width="19" height="19" rx="4" fill="rgb(88,37,141)" data-t="29" data-n="2"><title>May 5, 5am–6am PDT — 2 commits, +29,370 lines</title></rect><rect x="178" y="45" width="19" height="19" rx="4" fill="#16181f"></rect><rect x="199" y="45" width="19" height="19" rx="4" fill="#16181f"></rect><rect x="220" y="45" width="19" height="19" rx="4" fill="rgb(88,37,141)" data-t="32" data-n="2"><title>May 5, 8am–9am PDT — 2 commits, +7,076 lines</title></rect><rect x="241" y="45" width="19" height="19" rx="4" fill="rgb(88,37,141)" data-t="33" data-n="2"><title>May 5, 9am–10am PDT — 2 commits, +308 lines</title></rect><rect x="262" y="45" width="19" height="19" rx="4" fill="#16181f"></rect><rect x="283" y="45" width="19" height="19" rx="4" fill="rgb(88,37,141)" data-t="35" data-n="2"><title>May 5, 11am–12pm PDT — 2 commits, +1,643 lines</title></rect><rect x="304" y="45" width="19" height="19" rx="4" fill="rgb(99,39,154)" data-t="36" data-n="4"><title>May 5, 12pm–1pm PDT — 4 commits, +1,452 lines</title></rect><rect x="325" y="45" width="19" height="19" rx="4" fill="rgb(80,36,130)" data-t="37" data-n="1"><title>May 5, 1pm–2pm PDT — 1 commit, +2,142 lines</title></rect><rect x="346" y="45" width="19" height="19" rx="4" fill="rgb(99,39,154)" data-t="38" data-n="4"><title>May 5, 2pm–3pm PDT — 4 commits, +7,787 lines</title></rect><rect x="367" y="45" width="19" height="19" rx="4" fill="rgb(88,37,141)" data-t="39" data-n="2"><title>May 5, 3pm–4pm PDT — 2 commits, +5,835 lines</title></rect><rect x="388" y="45" width="19" height="19" rx="4" fill="rgb(80,36,130)" data-t="40" data-n="1"><title>May 5, 4pm–5pm PDT — 1 commit, +3,417 lines</title></rect><rect x="409" y="45" width="19" height="19" rx="4" fill="rgb(99,39,154)" data-t="41" data-n="4"><title>May 5, 5pm–6pm PDT — 4 commits, +3,960 lines</title></rect><rect x="430" y="45" width="19" height="19" rx="4" fill="rgb(99,39,154)" data-t="42" data-n="4"><title>May 5, 6pm–7pm PDT — 4 commits, +9,179 lines</title></rect><rect x="451" y="45" width="19" height="19" rx="4" fill="rgb(99,39,154)" data-t="43" data-n="4"><title>May 5, 7pm–8pm PDT — 4 commits, +1,983 lines</title></rect><rect x="472" y="45" width="19" height="19" rx="4" fill="rgb(99,39,154)" data-t="44" data-n="4"><title>May 5, 8pm–9pm PDT — 4 commits, +18,902 lines</title></rect><rect x="493" y="45" width="19" height="19" rx="4" fill="rgb(176,29,143)" data-t="45" data-n="43"><title>May 5, 9pm–10pm PDT — 43 commits, +40,650 lines</title></rect><rect x="514" y="45" width="19" height="19" rx="4" fill="rgb(231,71,108)" data-t="46" data-n="139"><title>May 5, 10pm–11pm PDT — 139 commits, +64,842 lines</title></rect><rect x="535" y="45" width="19" height="19" rx="4" fill="rgb(231,72,107)" data-t="47" data-n="141"><title>May 5, 11pm–12am PDT — 141 commits, +34,814 lines</title></rect></g><g><text x="44" y="80" font-size="12" text-anchor="end" fill="#6b7280">May 6</text><rect x="52" y="66" width="19" height="19" rx="4" fill="rgb(191,34,135)" data-t="48" data-n="60"><title>May 6, 12am–1am PDT — 60 commits, +10,417 lines</title></rect><rect x="73" y="66" width="19" height="19" rx="4" fill="rgb(248,126,72)" data-t="49" data-n="296"><title>May 6, 1am–2am PDT — 296 commits, +38,530 lines</title></rect><rect x="94" y="66" width="19" height="19" rx="4" fill="rgb(248,129,70)" data-t="50" data-n="306"><title>May 6, 2am–3am PDT — 306 commits, +18,836 lines</title></rect><rect x="115" y="66" width="19" height="19" rx="4" fill="rgb(242,93,93)" data-t="51" data-n="196"><title>May 6, 3am–4am PDT — 196 commits, +10,245 lines</title></rect><rect x="136" y="66" width="19" height="19" rx="4" fill="rgb(206,49,125)" data-t="52" data-n="86"><title>May 6, 4am–5am PDT — 86 commits, +2,655 lines</title></rect><rect x="157" y="66" width="19" height="19" rx="4" fill="rgb(134,36,159)" data-t="53" data-n="16"><title>May 6, 5am–6am PDT — 16 commits, +289 lines</title></rect><rect x="178" y="66" width="19" height="19" rx="4" fill="#16181f"></rect><rect x="199" y="66" width="19" height="19" rx="4" fill="#16181f"></rect><rect x="220" y="66" width="19" height="19" rx="4" fill="rgb(103,39,160)" data-t="56" data-n="5"><title>May 6, 8am–9am PDT — 5 commits, +264 lines</title></rect><rect x="241" y="66" width="19" height="19" rx="4" fill="rgb(252,171,64)" data-t="57" data-n="458"><title>May 6, 9am–10am PDT — 458 commits, +16,409 lines</title></rect><rect x="262" y="66" width="19" height="19" rx="4" fill="rgb(253,224,71)" data-t="58" data-n="695"><title>May 6, 10am–11am PDT — 695 commits, +44,000 lines</title></rect><rect x="283" y="66" width="19" height="19" rx="4" fill="rgb(214,56,119)" data-t="59" data-n="102"><title>May 6, 11am–12pm PDT — 102 commits, +21,972 lines</title></rect><rect x="304" y="66" width="19" height="19" rx="4" fill="rgb(140,35,156)" data-t="60" data-n="19"><title>May 6, 12pm–1pm PDT — 19 commits, +2,891 lines</title></rect><rect x="325" y="66" width="19" height="19" rx="4" fill="rgb(94,38,149)" data-t="61" data-n="3"><title>May 6, 1pm–2pm PDT — 3 commits, +56 lines</title></rect><rect x="346" y="66" width="19" height="19" rx="4" fill="#16181f"></rect><rect x="367" y="66" width="19" height="19" rx="4" fill="rgb(193,37,134)" data-t="63" data-n="64"><title>May 6, 3pm–4pm PDT — 64 commits, +3,606 lines</title></rect><rect x="388" y="66" width="19" height="19" rx="4" fill="rgb(246,117,78)" data-t="64" data-n="264"><title>May 6, 4pm–5pm PDT — 264 commits, +60,132 lines</title></rect><rect x="409" y="66" width="19" height="19" rx="4" fill="rgb(246,118,78)" data-t="65" data-n="268"><title>May 6, 5pm–6pm PDT — 268 commits, +40,953 lines</title></rect><rect x="430" y="66" width="19" height="19" rx="4" fill="rgb(247,122,75)" data-t="66" data-n="281"><title>May 6, 6pm–7pm PDT — 281 commits, +16,283 lines</title></rect><rect x="451" y="66" width="19" height="19" rx="4" fill="rgb(245,115,80)" data-t="67" data-n="258"><title>May 6, 7pm–8pm PDT — 258 commits, +26,654 lines</title></rect><rect x="472" y="66" width="19" height="19" rx="4" fill="rgb(249,135,67)" data-t="68" data-n="327"><title>May 6, 8pm–9pm PDT — 327 commits, +16,599 lines</title></rect><rect x="493" y="66" width="19" height="19" rx="4" fill="rgb(200,42,129)" data-t="69" data-n="74"><title>May 6, 9pm–10pm PDT — 74 commits, +8,331 lines</title></rect><rect x="514" y="66" width="19" height="19" rx="4" fill="rgb(136,36,158)" data-t="70" data-n="17"><title>May 6, 10pm–11pm PDT — 17 commits, +2,200 lines</title></rect><rect x="535" y="66" width="19" height="19" rx="4" fill="rgb(122,38,163)" data-t="71" data-n="11"><title>May 6, 11pm–12am PDT — 11 commits, +3,590 lines</title></rect></g><g><text x="44" y="101" font-size="12" text-anchor="end" fill="#6b7280">May 7</text><rect x="52" y="87" width="19" height="19" rx="4" fill="rgb(136,36,158)" data-t="72" data-n="17"><title>May 7, 12am–1am PDT — 17 commits, +6,577 lines</title></rect><rect x="73" y="87" width="19" height="19" rx="4" fill="rgb(146,34,154)" data-t="73" data-n="22"><title>May 7, 1am–2am PDT — 22 commits, +8,718 lines</title></rect><rect x="94" y="87" width="19" height="19" rx="4" fill="rgb(144,34,155)" data-t="74" data-n="21"><title>May 7, 2am–3am PDT — 21 commits, +11,392 lines</title></rect><rect x="115" y="87" width="19" height="19" rx="4" fill="rgb(186,30,139)" data-t="75" data-n="53"><title>May 7, 3am–4am PDT — 53 commits, +6,476 lines</title></rect><rect x="136" y="87" width="19" height="19" rx="4" fill="rgb(160,32,149)" data-t="76" data-n="31"><title>May 7, 4am–5am PDT — 31 commits, +2,356 lines</title></rect><rect x="157" y="87" width="19" height="19" rx="4" fill="rgb(116,39,165)" data-t="77" data-n="9"><title>May 7, 5am–6am PDT — 9 commits, +1,787 lines</title></rect><rect x="178" y="87" width="19" height="19" rx="4" fill="rgb(99,39,154)" data-t="78" data-n="4"><title>May 7, 6am–7am PDT — 4 commits, +580 lines</title></rect><rect x="199" y="87" width="19" height="19" rx="4" fill="rgb(103,39,160)" data-t="79" data-n="5"><title>May 7, 7am–8am PDT — 5 commits, +181 lines</title></rect><rect x="220" y="87" width="19" height="19" rx="4" fill="#16181f"></rect><rect x="241" y="87" width="19" height="19" rx="4" fill="#16181f"></rect><rect x="262" y="87" width="19" height="19" rx="4" fill="#16181f"></rect><rect x="283" y="87" width="19" height="19" rx="4" fill="rgb(94,38,149)" data-t="83" data-n="3"><title>May 7, 11am–12pm PDT — 3 commits, +421 lines</title></rect><rect x="304" y="87" width="19" height="19" rx="4" fill="rgb(80,36,130)" data-t="84" data-n="1"><title>May 7, 12pm–1pm PDT — 1 commit, +13 lines</title></rect><rect x="325" y="87" width="19" height="19" rx="4" fill="rgb(103,39,160)" data-t="85" data-n="5"><title>May 7, 1pm–2pm PDT — 5 commits, +248 lines</title></rect><rect x="346" y="87" width="19" height="19" rx="4" fill="rgb(116,39,165)" data-t="86" data-n="9"><title>May 7, 2pm–3pm PDT — 9 commits, +2,131 lines</title></rect><rect x="367" y="87" width="19" height="19" rx="4" fill="rgb(184,28,140)" data-t="87" data-n="51"><title>May 7, 3pm–4pm PDT — 51 commits, +3,207 lines</title></rect><rect x="388" y="87" width="19" height="19" rx="4" fill="rgb(188,32,137)" data-t="88" data-n="56"><title>May 7, 4pm–5pm PDT — 56 commits, +2,647 lines</title></rect><rect x="409" y="87" width="19" height="19" rx="4" fill="rgb(238,78,103)" data-t="89" data-n="159"><title>May 7, 5pm–6pm PDT — 159 commits, +2,787 lines</title></rect><rect x="430" y="87" width="19" height="19" rx="4" fill="rgb(174,30,144)" data-t="90" data-n="42"><title>May 7, 6pm–7pm PDT — 42 commits, +1,590 lines</title></rect><rect x="451" y="87" width="19" height="19" rx="4" fill="rgb(179,29,142)" data-t="91" data-n="46"><title>May 7, 7pm–8pm PDT — 46 commits, +4,170 lines</title></rect><rect x="472" y="87" width="19" height="19" rx="4" fill="rgb(185,29,139)" data-t="92" data-n="52"><title>May 7, 8pm–9pm PDT — 52 commits, +2,113 lines</title></rect><rect x="493" y="87" width="19" height="19" rx="4" fill="rgb(154,33,151)" data-t="93" data-n="27"><title>May 7, 9pm–10pm PDT — 27 commits, +1,585 lines</title></rect><rect x="514" y="87" width="19" height="19" rx="4" fill="rgb(154,33,151)" data-t="94" data-n="27"><title>May 7, 10pm–11pm PDT — 27 commits, +2,231 lines</title></rect><rect x="535" y="87" width="19" height="19" rx="4" fill="rgb(159,32,149)" data-t="95" data-n="30"><title>May 7, 11pm–12am PDT — 30 commits, +4,987 lines</title></rect></g><g><text x="44" y="122" font-size="12" text-anchor="end" fill="#6b7280">May 8</text><rect x="52" y="108" width="19" height="19" rx="4" fill="rgb(154,33,151)" data-t="96" data-n="27"><title>May 8, 12am–1am PDT — 27 commits, +1,196 lines</title></rect><rect x="73" y="108" width="19" height="19" rx="4" fill="rgb(130,37,160)" data-t="97" data-n="14"><title>May 8, 1am–2am PDT — 14 commits, +904 lines</title></rect><rect x="94" y="108" width="19" height="19" rx="4" fill="rgb(113,39,167)" data-t="98" data-n="8"><title>May 8, 2am–3am PDT — 8 commits, +536 lines</title></rect><rect x="115" y="108" width="19" height="19" rx="4" fill="rgb(127,37,161)" data-t="99" data-n="13"><title>May 8, 3am–4am PDT — 13 commits, +253 lines</title></rect><rect x="136" y="108" width="19" height="19" rx="4" fill="rgb(94,38,149)" data-t="100" data-n="3"><title>May 8, 4am–5am PDT — 3 commits, +771 lines</title></rect><rect x="157" y="108" width="19" height="19" rx="4" fill="rgb(132,36,159)" data-t="101" data-n="15"><title>May 8, 5am–6am PDT — 15 commits, +1,545 lines</title></rect><rect x="178" y="108" width="19" height="19" rx="4" fill="rgb(125,38,162)" data-t="102" data-n="12"><title>May 8, 6am–7am PDT — 12 commits, +1,965 lines</title></rect><rect x="199" y="108" width="19" height="19" rx="4" fill="rgb(130,37,160)" data-t="103" data-n="14"><title>May 8, 7am–8am PDT — 14 commits, +1,866 lines</title></rect><rect x="220" y="108" width="19" height="19" rx="4" fill="rgb(187,31,138)" data-t="104" data-n="55"><title>May 8, 8am–9am PDT — 55 commits, +3,622 lines</title></rect><rect x="241" y="108" width="19" height="19" rx="4" fill="rgb(166,31,147)" data-t="105" data-n="35"><title>May 8, 9am–10am PDT — 35 commits, +4,778 lines</title></rect><rect x="262" y="108" width="19" height="19" rx="4" fill="rgb(80,36,130)" data-t="106" data-n="1"><title>May 8, 10am–11am PDT — 1 commit, +0 lines</title></rect><rect x="283" y="108" width="19" height="19" rx="4" fill="#16181f"></rect><rect x="304" y="108" width="19" height="19" rx="4" fill="rgb(80,36,130)" data-t="108" data-n="1"><title>May 8, 12pm–1pm PDT — 1 commit, +116 lines</title></rect><rect x="325" y="108" width="19" height="19" rx="4" fill="rgb(88,37,141)" data-t="109" data-n="2"><title>May 8, 1pm–2pm PDT — 2 commits, +66 lines</title></rect><rect x="346" y="108" width="19" height="19" rx="4" fill="rgb(116,39,165)" data-t="110" data-n="9"><title>May 8, 2pm–3pm PDT — 9 commits, +1,071 lines</title></rect><rect x="367" y="108" width="19" height="19" rx="4" fill="rgb(153,33,152)" data-t="111" data-n="26"><title>May 8, 3pm–4pm PDT — 26 commits, +1,691 lines</title></rect><rect x="388" y="108" width="19" height="19" rx="4" fill="rgb(138,35,157)" data-t="112" data-n="18"><title>May 8, 4pm–5pm PDT — 18 commits, +2,751 lines</title></rect><rect x="409" y="108" width="19" height="19" rx="4" fill="rgb(88,37,141)" data-t="113" data-n="2"><title>May 8, 5pm–6pm PDT — 2 commits, +97 lines</title></rect><rect x="430" y="108" width="19" height="19" rx="4" fill="rgb(88,37,141)" data-t="114" data-n="2"><title>May 8, 6pm–7pm PDT — 2 commits, +135 lines</title></rect><rect x="451" y="108" width="19" height="19" rx="4" fill="rgb(122,38,163)" data-t="115" data-n="11"><title>May 8, 7pm–8pm PDT — 11 commits, +1,763 lines</title></rect><rect x="472" y="108" width="19" height="19" rx="4" fill="rgb(142,35,156)" data-t="116" data-n="20"><title>May 8, 8pm–9pm PDT — 20 commits, +5,272 lines</title></rect><rect x="493" y="108" width="19" height="19" rx="4" fill="rgb(125,38,162)" data-t="117" data-n="12"><title>May 8, 9pm–10pm PDT — 12 commits, +952 lines</title></rect><rect x="514" y="108" width="19" height="19" rx="4" fill="rgb(88,37,141)" data-t="118" data-n="2"><title>May 8, 10pm–11pm PDT — 2 commits, +334 lines</title></rect><rect x="535" y="108" width="19" height="19" rx="4" fill="rgb(106,40,164)" data-t="119" data-n="6"><title>May 8, 11pm–12am PDT — 6 commits, +2,033 lines</title></rect></g><g><text x="44" y="143" font-size="12" text-anchor="end" fill="#6b7280">May 9</text><rect x="52" y="129" width="19" height="19" rx="4" fill="rgb(116,39,165)" data-t="120" data-n="9"><title>May 9, 12am–1am PDT — 9 commits, +387 lines</title></rect><rect x="73" y="129" width="19" height="19" rx="4" fill="rgb(116,39,165)" data-t="121" data-n="9"><title>May 9, 1am–2am PDT — 9 commits, +723 lines</title></rect><rect x="94" y="129" width="19" height="19" rx="4" fill="rgb(113,39,167)" data-t="122" data-n="8"><title>May 9, 2am–3am PDT — 8 commits, +98 lines</title></rect><rect x="115" y="129" width="19" height="19" rx="4" fill="rgb(193,36,134)" data-t="123" data-n="63"><title>May 9, 3am–4am PDT — 63 commits, +2,538 lines</title></rect><rect x="136" y="129" width="19" height="19" rx="4" fill="rgb(122,38,163)" data-t="124" data-n="11"><title>May 9, 4am–5am PDT — 11 commits, +8,861 lines</title></rect><rect x="157" y="129" width="19" height="19" rx="4" fill="rgb(99,39,154)" data-t="125" data-n="4"><title>May 9, 5am–6am PDT — 4 commits, +42 lines</title></rect><rect x="178" y="129" width="19" height="19" rx="4" fill="rgb(94,38,149)" data-t="126" data-n="3"><title>May 9, 6am–7am PDT — 3 commits, +2,616 lines</title></rect><rect x="199" y="129" width="19" height="19" rx="4" fill="rgb(106,40,164)" data-t="127" data-n="6"><title>May 9, 7am–8am PDT — 6 commits, +6,993 lines</title></rect><rect x="220" y="129" width="19" height="19" rx="4" fill="rgb(80,36,130)" data-t="128" data-n="1"><title>May 9, 8am–9am PDT — 1 commit, +3,705 lines</title></rect><rect x="241" y="129" width="19" height="19" rx="4" fill="rgb(122,38,163)" data-t="129" data-n="11"><title>May 9, 9am–10am PDT — 11 commits, +199 lines</title></rect><rect x="262" y="129" width="19" height="19" rx="4" fill="#16181f"></rect><rect x="283" y="129" width="19" height="19" rx="4" fill="rgb(80,36,130)" data-t="131" data-n="1"><title>May 9, 11am–12pm PDT — 1 commit, +23 lines</title></rect><rect x="304" y="129" width="19" height="19" rx="4" fill="rgb(99,39,154)" data-t="132" data-n="4"><title>May 9, 12pm–1pm PDT — 4 commits, +5,012 lines</title></rect><rect x="325" y="129" width="19" height="19" rx="4" fill="rgb(109,40,168)" data-t="133" data-n="7"><title>May 9, 1pm–2pm PDT — 7 commits, +2,080 lines</title></rect><rect x="346" y="129" width="19" height="19" rx="4" fill="rgb(106,40,164)" data-t="134" data-n="6"><title>May 9, 2pm–3pm PDT — 6 commits, +924 lines</title></rect><rect x="367" y="129" width="19" height="19" rx="4" fill="rgb(103,39,160)" data-t="135" data-n="5"><title>May 9, 3pm–4pm PDT — 5 commits, +248 lines</title></rect><rect x="388" y="129" width="19" height="19" rx="4" fill="rgb(136,36,158)" data-t="136" data-n="17"><title>May 9, 4pm–5pm PDT — 17 commits, +508 lines</title></rect><rect x="409" y="129" width="19" height="19" rx="4" fill="rgb(88,37,141)" data-t="137" data-n="2"><title>May 9, 5pm–6pm PDT — 2 commits, +135 lines</title></rect><rect x="430" y="129" width="19" height="19" rx="4" fill="rgb(99,39,154)" data-t="138" data-n="4"><title>May 9, 6pm–7pm PDT — 4 commits, +822 lines</title></rect><rect x="451" y="129" width="19" height="19" rx="4" fill="rgb(80,36,130)" data-t="139" data-n="1"><title>May 9, 7pm–8pm PDT — 1 commit, +7 lines</title></rect><rect x="472" y="129" width="19" height="19" rx="4" fill="#16181f"></rect><rect x="493" y="129" width="19" height="19" rx="4" fill="#16181f"></rect><rect x="514" y="129" width="19" height="19" rx="4" fill="#16181f"></rect><rect x="535" y="129" width="19" height="19" rx="4" fill="#16181f"></rect></g><g><text x="44" y="164" font-size="12" text-anchor="end" fill="#6b7280">May 10</text><rect x="52" y="150" width="19" height="19" rx="4" fill="rgb(99,39,154)" data-t="144" data-n="4"><title>May 10, 12am–1am PDT — 4 commits, +497 lines</title></rect><rect x="73" y="150" width="19" height="19" rx="4" fill="rgb(88,37,141)" data-t="145" data-n="2"><title>May 10, 1am–2am PDT — 2 commits, +35 lines</title></rect><rect x="94" y="150" width="19" height="19" rx="4" fill="rgb(80,36,130)" data-t="146" data-n="1"><title>May 10, 2am–3am PDT — 1 commit, +131 lines</title></rect><rect x="115" y="150" width="19" height="19" rx="4" fill="rgb(88,37,141)" data-t="147" data-n="2"><title>May 10, 3am–4am PDT — 2 commits, +322 lines</title></rect><rect x="136" y="150" width="19" height="19" rx="4" fill="rgb(80,36,130)" data-t="148" data-n="1"><title>May 10, 4am–5am PDT — 1 commit, +3 lines</title></rect><rect x="157" y="150" width="19" height="19" rx="4" fill="rgb(80,36,130)" data-t="149" data-n="1"><title>May 10, 5am–6am PDT — 1 commit, +26 lines</title></rect><rect x="178" y="150" width="19" height="19" rx="4" fill="rgb(88,37,141)" data-t="150" data-n="2"><title>May 10, 6am–7am PDT — 2 commits, +81 lines</title></rect><rect x="199" y="150" width="19" height="19" rx="4" fill="rgb(80,36,130)" data-t="151" data-n="1"><title>May 10, 7am–8am PDT — 1 commit, +5 lines</title></rect><rect x="220" y="150" width="19" height="19" rx="4" fill="rgb(99,39,154)" data-t="152" data-n="4"><title>May 10, 8am–9am PDT — 4 commits, +78 lines</title></rect><rect x="241" y="150" width="19" height="19" rx="4" fill="rgb(80,36,130)" data-t="153" data-n="1"><title>May 10, 9am–10am PDT — 1 commit, +1 lines</title></rect><rect x="262" y="150" width="19" height="19" rx="4" fill="rgb(88,37,141)" data-t="154" data-n="2"><title>May 10, 10am–11am PDT — 2 commits, +128 lines</title></rect><rect x="283" y="150" width="19" height="19" rx="4" fill="rgb(80,36,130)" data-t="155" data-n="1"><title>May 10, 11am–12pm PDT — 1 commit, +4 lines</title></rect><rect x="304" y="150" width="19" height="19" rx="4" fill="rgb(88,37,141)" data-t="156" data-n="2"><title>May 10, 12pm–1pm PDT — 2 commits, +413 lines</title></rect><rect x="325" y="150" width="19" height="19" rx="4" fill="rgb(80,36,130)" data-t="157" data-n="1"><title>May 10, 1pm–2pm PDT — 1 commit, +25 lines</title></rect><rect x="346" y="150" width="19" height="19" rx="4" fill="rgb(103,39,160)" data-t="158" data-n="5"><title>May 10, 2pm–3pm PDT — 5 commits, +327 lines</title></rect><rect x="367" y="150" width="19" height="19" rx="4" fill="rgb(106,40,164)" data-t="159" data-n="6"><title>May 10, 3pm–4pm PDT — 6 commits, +1,172 lines</title></rect><rect x="388" y="150" width="19" height="19" rx="4" fill="rgb(99,39,154)" data-t="160" data-n="4"><title>May 10, 4pm–5pm PDT — 4 commits, +752 lines</title></rect><rect x="409" y="150" width="19" height="19" rx="4" fill="rgb(94,38,149)" data-t="161" data-n="3"><title>May 10, 5pm–6pm PDT — 3 commits, +227 lines</title></rect><rect x="430" y="150" width="19" height="19" rx="4" fill="rgb(88,37,141)" data-t="162" data-n="2"><title>May 10, 6pm–7pm PDT — 2 commits, +242 lines</title></rect><rect x="451" y="150" width="19" height="19" rx="4" fill="rgb(80,36,130)" data-t="163" data-n="1"><title>May 10, 7pm–8pm PDT — 1 commit, +306 lines</title></rect><rect x="472" y="150" width="19" height="19" rx="4" fill="rgb(80,36,130)" data-t="164" data-n="1"><title>May 10, 8pm–9pm PDT — 1 commit, +54 lines</title></rect><rect x="493" y="150" width="19" height="19" rx="4" fill="rgb(88,37,141)" data-t="165" data-n="2"><title>May 10, 9pm–10pm PDT — 2 commits, +75 lines</title></rect><rect x="514" y="150" width="19" height="19" rx="4" fill="rgb(80,36,130)" data-t="166" data-n="1"><title>May 10, 10pm–11pm PDT — 1 commit, +134 lines</title></rect><rect x="535" y="150" width="19" height="19" rx="4" fill="rgb(103,39,160)" data-t="167" data-n="5"><title>May 10, 11pm–12am PDT — 5 commits, +103 lines</title></rect></g><g><text x="44" y="185" font-size="12" text-anchor="end" fill="#6b7280">May 11</text><rect x="52" y="171" width="19" height="19" rx="4" fill="rgb(88,37,141)" data-t="168" data-n="2"><title>May 11, 12am–1am PDT — 2 commits, +150 lines</title></rect><rect x="73" y="171" width="19" height="19" rx="4" fill="rgb(99,39,154)" data-t="169" data-n="4"><title>May 11, 1am–2am PDT — 4 commits, +398 lines</title></rect><rect x="94" y="171" width="19" height="19" rx="4" fill="rgb(88,37,141)" data-t="170" data-n="2"><title>May 11, 2am–3am PDT — 2 commits, +364 lines</title></rect><rect x="115" y="171" width="19" height="19" rx="4" fill="rgb(94,38,149)" data-t="171" data-n="3"><title>May 11, 3am–4am PDT — 3 commits, +44 lines</title></rect><rect x="136" y="171" width="19" height="19" rx="4" fill="rgb(109,40,168)" data-t="172" data-n="7"><title>May 11, 4am–5am PDT — 7 commits, +9,367 lines</title></rect><rect x="157" y="171" width="19" height="19" rx="4" fill="#16181f"></rect><rect x="178" y="171" width="19" height="19" rx="4" fill="rgb(88,37,141)" data-t="174" data-n="2"><title>May 11, 6am–7am PDT — 2 commits, +43 lines</title></rect><rect x="199" y="171" width="19" height="19" rx="4" fill="rgb(88,37,141)" data-t="175" data-n="2"><title>May 11, 7am–8am PDT — 2 commits, +149 lines</title></rect><rect x="220" y="171" width="19" height="19" rx="4" fill="rgb(119,38,164)" data-t="176" data-n="10"><title>May 11, 8am–9am PDT — 10 commits, +2,171 lines</title></rect><rect x="241" y="171" width="19" height="19" rx="4" fill="rgb(134,36,159)" data-t="177" data-n="16"><title>May 11, 9am–10am PDT — 16 commits, +2,047 lines</title></rect><rect x="262" y="171" width="19" height="19" rx="4" fill="rgb(138,35,157)" data-t="178" data-n="18"><title>May 11, 10am–11am PDT — 18 commits, +3,356 lines</title></rect><rect x="283" y="171" width="19" height="19" rx="4" fill="rgb(116,39,165)" data-t="179" data-n="9"><title>May 11, 11am–12pm PDT — 9 commits, +861 lines</title></rect><rect x="304" y="171" width="19" height="19" rx="4" fill="rgb(94,38,149)" data-t="180" data-n="3"><title>May 11, 12pm–1pm PDT — 3 commits, +412 lines</title></rect><rect x="325" y="171" width="19" height="19" rx="4" fill="rgb(125,38,162)" data-t="181" data-n="12"><title>May 11, 1pm–2pm PDT — 12 commits, +2,978 lines</title></rect><rect x="346" y="171" width="19" height="19" rx="4" fill="rgb(237,77,103)" data-t="182" data-n="157"><title>May 11, 2pm–3pm PDT — 157 commits, +10,700 lines</title></rect><rect x="367" y="171" width="19" height="19" rx="4" fill="rgb(134,36,159)" data-t="183" data-n="16"><title>May 11, 3pm–4pm PDT — 16 commits, +1,346 lines</title></rect><rect x="388" y="171" width="19" height="19" rx="4" fill="rgb(94,38,149)" data-t="184" data-n="3"><title>May 11, 4pm–5pm PDT — 3 commits, +78 lines</title></rect><rect x="409" y="171" width="19" height="19" rx="4" fill="rgb(173,30,144)" data-t="185" data-n="41"><title>May 11, 5pm–6pm PDT — 41 commits, +2,568 lines</title></rect><rect x="430" y="171" width="19" height="19" rx="4" fill="rgb(187,31,138)" data-t="186" data-n="55"><title>May 11, 6pm–7pm PDT — 55 commits, +4,912 lines</title></rect><rect x="451" y="171" width="19" height="19" rx="4" fill="rgb(186,30,139)" data-t="187" data-n="53"><title>May 11, 7pm–8pm PDT — 53 commits, +3,475 lines</title></rect><rect x="472" y="171" width="19" height="19" rx="4" fill="rgb(162,32,148)" data-t="188" data-n="32"><title>May 11, 8pm–9pm PDT — 32 commits, +1,732 lines</title></rect><rect x="493" y="171" width="19" height="19" rx="4" fill="rgb(179,29,142)" data-t="189" data-n="46"><title>May 11, 9pm–10pm PDT — 46 commits, +4,506 lines</title></rect><rect x="514" y="171" width="19" height="19" rx="4" fill="rgb(178,29,142)" data-t="190" data-n="45"><title>May 11, 10pm–11pm PDT — 45 commits, +1,711 lines</title></rect><rect x="535" y="171" width="19" height="19" rx="4" fill="rgb(185,29,139)" data-t="191" data-n="52"><title>May 11, 11pm–12am PDT — 52 commits, +10,850 lines</title></rect></g><g><text x="44" y="206" font-size="12" text-anchor="end" fill="#6b7280">May 12</text><rect x="52" y="192" width="19" height="19" rx="4" fill="rgb(159,32,149)" data-t="192" data-n="30"><title>May 12, 12am–1am PDT — 30 commits, +3,760 lines</title></rect><rect x="73" y="192" width="19" height="19" rx="4" fill="rgb(149,34,153)" data-t="193" data-n="24"><title>May 12, 1am–2am PDT — 24 commits, +9,443 lines</title></rect><rect x="94" y="192" width="19" height="19" rx="4" fill="rgb(173,30,144)" data-t="194" data-n="41"><title>May 12, 2am–3am PDT — 41 commits, +1,635 lines</title></rect><rect x="115" y="192" width="19" height="19" rx="4" fill="rgb(171,30,145)" data-t="195" data-n="39"><title>May 12, 3am–4am PDT — 39 commits, +788 lines</title></rect><rect x="136" y="192" width="19" height="19" rx="4" fill="rgb(154,33,151)" data-t="196" data-n="27"><title>May 12, 4am–5am PDT — 27 commits, +651 lines</title></rect><rect x="157" y="192" width="19" height="19" rx="4" fill="rgb(148,34,154)" data-t="197" data-n="23"><title>May 12, 5am–6am PDT — 23 commits, +779 lines</title></rect><rect x="178" y="192" width="19" height="19" rx="4" fill="rgb(80,36,130)" data-t="198" data-n="1"><title>May 12, 6am–7am PDT — 1 commit, +137,576 lines</title></rect><rect x="199" y="192" width="19" height="19" rx="4" fill="rgb(88,37,141)" data-t="199" data-n="2"><title>May 12, 7am–8am PDT — 2 commits, +81 lines</title></rect><rect x="220" y="192" width="19" height="19" rx="4" fill="rgb(88,37,141)" data-t="200" data-n="2"><title>May 12, 8am–9am PDT — 2 commits, +75 lines</title></rect><rect x="241" y="192" width="19" height="19" rx="4" fill="rgb(88,37,141)" data-t="201" data-n="2"><title>May 12, 9am–10am PDT — 2 commits, +130 lines</title></rect><rect x="262" y="192" width="19" height="19" rx="4" fill="rgb(103,39,160)" data-t="202" data-n="5"><title>May 12, 10am–11am PDT — 5 commits, +160 lines</title></rect><rect x="283" y="192" width="19" height="19" rx="4" fill="rgb(88,37,141)" data-t="203" data-n="2"><title>May 12, 11am–12pm PDT — 2 commits, +20 lines</title></rect><rect x="304" y="192" width="19" height="19" rx="4" fill="rgb(80,36,130)" data-t="204" data-n="1"><title>May 12, 12pm–1pm PDT — 1 commit, +2 lines</title></rect><rect x="325" y="192" width="19" height="19" rx="4" fill="rgb(159,32,149)" data-t="205" data-n="30"><title>May 12, 1pm–2pm PDT — 30 commits, +2,677 lines</title></rect><rect x="346" y="192" width="19" height="19" rx="4" fill="rgb(173,30,144)" data-t="206" data-n="41"><title>May 12, 2pm–3pm PDT — 41 commits, +7,022 lines</title></rect><rect x="367" y="192" width="19" height="19" rx="4" fill="rgb(99,39,154)" data-t="207" data-n="4"><title>May 12, 3pm–4pm PDT — 4 commits, +200 lines</title></rect><rect x="388" y="192" width="19" height="19" rx="4" fill="rgb(154,33,151)" data-t="208" data-n="27"><title>May 12, 4pm–5pm PDT — 27 commits, +1,423 lines</title></rect><rect x="409" y="192" width="19" height="19" rx="4" fill="rgb(140,35,156)" data-t="209" data-n="19"><title>May 12, 5pm–6pm PDT — 19 commits, +1,055 lines</title></rect><rect x="430" y="192" width="19" height="19" rx="4" fill="rgb(88,37,141)" data-t="210" data-n="2"><title>May 12, 6pm–7pm PDT — 2 commits, +380 lines</title></rect><rect x="451" y="192" width="19" height="19" rx="4" fill="rgb(88,37,141)" data-t="211" data-n="2"><title>May 12, 7pm–8pm PDT — 2 commits, +84 lines</title></rect><rect x="472" y="192" width="19" height="19" rx="4" fill="#16181f"></rect><rect x="493" y="192" width="19" height="19" rx="4" fill="rgb(109,40,168)" data-t="213" data-n="7"><title>May 12, 9pm–10pm PDT — 7 commits, +273 lines</title></rect><rect x="514" y="192" width="19" height="19" rx="4" fill="rgb(94,38,149)" data-t="214" data-n="3"><title>May 12, 10pm–11pm PDT — 3 commits, +230 lines</title></rect><rect x="535" y="192" width="19" height="19" rx="4" fill="rgb(109,40,168)" data-t="215" data-n="7"><title>May 12, 11pm–12am PDT — 7 commits, +319 lines</title></rect></g><g><text x="44" y="227" font-size="12" text-anchor="end" fill="#6b7280">May 13</text><rect x="52" y="213" width="19" height="19" rx="4" fill="rgb(88,37,141)" data-t="216" data-n="2"><title>May 13, 12am–1am PDT — 2 commits, +133 lines</title></rect><rect x="73" y="213" width="19" height="19" rx="4" fill="rgb(130,37,160)" data-t="217" data-n="14"><title>May 13, 1am–2am PDT — 14 commits, +2,177 lines</title></rect><rect x="94" y="213" width="19" height="19" rx="4" fill="rgb(125,38,162)" data-t="218" data-n="12"><title>May 13, 2am–3am PDT — 12 commits, +685 lines</title></rect><rect x="115" y="213" width="19" height="19" rx="4" fill="#16181f"></rect><rect x="136" y="213" width="19" height="19" rx="4" fill="rgb(119,38,164)" data-t="220" data-n="10"><title>May 13, 4am–5am PDT — 10 commits, +657 lines</title></rect><rect x="157" y="213" width="19" height="19" rx="4" fill="rgb(80,36,130)" data-t="221" data-n="1"><title>May 13, 5am–6am PDT — 1 commit, +687 lines</title></rect><rect x="178" y="213" width="19" height="19" rx="4" fill="rgb(122,38,163)" data-t="222" data-n="11"><title>May 13, 6am–7am PDT — 11 commits, +380 lines</title></rect><rect x="199" y="213" width="19" height="19" rx="4" fill="rgb(125,38,162)" data-t="223" data-n="12"><title>May 13, 7am–8am PDT — 12 commits, +5,247 lines</title></rect><rect x="220" y="213" width="19" height="19" rx="4" fill="rgb(130,37,160)" data-t="224" data-n="14"><title>May 13, 8am–9am PDT — 14 commits, +1,051 lines</title></rect><rect x="241" y="213" width="19" height="19" rx="4" fill="rgb(109,40,168)" data-t="225" data-n="7"><title>May 13, 9am–10am PDT — 7 commits, +680 lines</title></rect><rect x="262" y="213" width="19" height="19" rx="4" fill="rgb(119,38,164)" data-t="226" data-n="10"><title>May 13, 10am–11am PDT — 10 commits, +412 lines</title></rect><rect x="283" y="213" width="19" height="19" rx="4" fill="rgb(106,40,164)" data-t="227" data-n="6"><title>May 13, 11am–12pm PDT — 6 commits, +314 lines</title></rect><rect x="304" y="213" width="19" height="19" rx="4" fill="rgb(119,38,164)" data-t="228" data-n="10"><title>May 13, 12pm–1pm PDT — 10 commits, +2,980 lines</title></rect><rect x="325" y="213" width="19" height="19" rx="4" fill="rgb(80,36,130)" data-t="229" data-n="1"><title>May 13, 1pm–2pm PDT — 1 commit, +0 lines</title></rect><rect x="346" y="213" width="19" height="19" rx="4" fill="rgb(94,38,149)" data-t="230" data-n="3"><title>May 13, 2pm–3pm PDT — 3 commits, +439 lines</title></rect><rect x="367" y="213" width="19" height="19" rx="4" fill="#16181f"></rect><rect x="388" y="213" width="19" height="19" rx="4" fill="#16181f"></rect><rect x="409" y="213" width="19" height="19" rx="4" fill="rgb(109,40,168)" data-t="233" data-n="7"><title>May 13, 5pm–6pm PDT — 7 commits, +114 lines</title></rect><rect x="430" y="213" width="19" height="19" rx="4" fill="rgb(99,39,154)" data-t="234" data-n="4"><title>May 13, 6pm–7pm PDT — 4 commits, +605 lines</title></rect><rect x="451" y="213" width="19" height="19" rx="4" fill="#16181f"></rect><rect x="472" y="213" width="19" height="19" rx="4" fill="#16181f"></rect><rect x="493" y="213" width="19" height="19" rx="4" fill="rgb(80,36,130)" data-t="237" data-n="1"><title>May 13, 9pm–10pm PDT — 1 commit, +13 lines</title></rect><rect x="514" y="213" width="19" height="19" rx="4" fill="rgb(80,36,130)" data-t="238" data-n="1"><title>May 13, 10pm–11pm PDT — 1 commit, +48 lines</title></rect><rect x="535" y="213" width="19" height="19" rx="4" fill="rgb(80,36,130)" data-t="239" data-n="1"><title>May 13, 11pm–12am PDT — 1 commit, +8 lines</title></rect></g><g><text x="44" y="248" font-size="12" text-anchor="end" fill="#6b7280">May 14</text><rect x="52" y="234" width="19" height="19" rx="4" fill="rgb(80,36,130)" data-t="240" data-n="1"><title>May 14, 12am–1am PDT — 1 commit, +150 lines</title></rect><rect x="73" y="234" width="19" height="19" rx="4" fill="#16181f"></rect><rect x="94" y="234" width="19" height="19" rx="4" fill="#16181f"></rect><rect x="115" y="234" width="19" height="19" rx="4" fill="#16181f"></rect><rect x="136" y="234" width="19" height="19" rx="4" fill="#16181f"></rect><rect x="157" y="234" width="19" height="19" rx="4" fill="#16181f"></rect><rect x="178" y="234" width="19" height="19" rx="4" fill="#16181f"></rect><rect x="199" y="234" width="19" height="19" rx="4" fill="#16181f"></rect><rect x="220" y="234" width="19" height="19" rx="4" fill="#16181f"></rect><rect x="241" y="234" width="19" height="19" rx="4" fill="#16181f"></rect><rect x="262" y="234" width="19" height="19" rx="4" fill="#16181f"></rect><rect x="283" y="234" width="19" height="19" rx="4" fill="#16181f"></rect><rect x="304" y="234" width="19" height="19" rx="4" fill="#16181f"></rect><rect x="325" y="234" width="19" height="19" rx="4" fill="#16181f"></rect><rect x="346" y="234" width="19" height="19" rx="4" fill="#16181f"></rect><rect x="367" y="234" width="19" height="19" rx="4" fill="#16181f"></rect><rect x="388" y="234" width="19" height="19" rx="4" fill="#16181f"></rect><rect x="409" y="234" width="19" height="19" rx="4" fill="#16181f"></rect><rect x="430" y="234" width="19" height="19" rx="4" fill="#16181f"></rect><rect x="451" y="234" width="19" height="19" rx="4" fill="#16181f"></rect><rect x="472" y="234" width="19" height="19" rx="4" fill="#16181f"></rect><rect x="493" y="234" width="19" height="19" rx="4" fill="#16181f"></rect><rect x="514" y="234" width="19" height="19" rx="4" fill="#16181f"></rect><rect x="535" y="234" width="19" height="19" rx="4" fill="#16181f"></rect></g></svg>

Every commit on the port branch (merges excluded), bucketed by hour. Peak hour: 695 commits.

Notice the inconsistent timing? I forgot to increase the default IOPS on the EC2 instance this ran on. One slow `grep` command was all it took to freeze disk reads & writes for minutes.

### [Compiler errors as a work queue](#compiler-errors-as-a-work-queue)

After writing all the code, I asked Claude to write a workflow fixing every compiler error. We went crate-by-crate.

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

How phase D worked, replayed from its 1,610 real commits (May 6, PDT): cargo check wrote ≈16,000 errors to a file, grouped by crate; the workflow divvied them up among 64 Claudes — 16 loops across 4 worktrees, each one Claude fixing, two reviewing, one applying. Every chip is a batch of real commits: it lands on its actual crate and only then do the counters move. Error lines are real commit subjects.

The trickiest class of error was cyclical dependencies.

Our Zig codebase was one compilation unit (effectively one crate). I wanted to split the new Rust codebase into ~100 crates so the Rust would compile faster, but this needed to avoid cyclical dependencies while minimizing changes compared to the original Zig implementation. [My PR](https://github.com/oven-sh/bun/pull/30224) to do this immediately before starting the Rust rewrite was insufficient. Instead of starting over, I ran another workflow to classify where the code with cyclical dependencies should go and write it all down - and then another workflow to do the refactor.

Fixing the cyclical dependencies revealed about 16,000 compiler errors. A massive number for 1 human, but not a crazy number for 64 claudes at once.

To maximize parallelism, the workflow looped over each crate.

*   For each crate, run `cargo check`, group the output by file and save the errors to a file
*   Fix all the compiler errors within that crate
*   2 adversarial reviewers for the crate's changes
*   1 fixer applies the fixes

To prevent claudes from stepping on each other, `cargo check` only ran at the very start and like the other runs, no `git` until the end.

#### Another false start

Claude interpreted "let's get all the crates to compile" as "stub out the functions with compilation errors". Claude also started adding suspiciously long explanatory comments to document workarounds, so I added this rule for the adversarial reviewers to reject:

If you need a paragraph-long comment to justify why the workaround is OK, the code is wrong — fix the code.

One prompt edit and a few hours later, these things stopped happening.

### [Smoke tests](#smoke-tests)

Models love saying "smoke tests"

Once `cargo check` passed, getting it to compile and run `bun --version` was next. It had linker errors. Then, it panicked immediately on start.

The next goal was to get it to run `bun test <file>`. Once that worked, we could start running tests! Time for another workflow, looping over bun CLI subcommands:

*   Save each failing stacktrace to a file along with its subcommand
*   For each failing stacktrace grouped by subcommand, have 1 Claude fix
*   2 adversarial reviewers
*   1 fixer applies the suggestions

### [Get the test suite passing locally](#get-the-test-suite-passing-locally)

This workflow looped on test files.

Run about 100 random test files sharded to one of 4 worktrees by folder in the codebase. For each failing test, save the stacktrace & errors to a file, 1 implementer proposes a fix, 2 adversarial reviewers, then 1 fixer applies.

#### Even more false starts

Our test suite has lots of memory leak tests and a handful of integration tests that can take more than a minute - for example: a test that runs `next dev` and checks hot module reloading can pick up on changes 100 times. Several of these tests timeout in debug builds.

We also have stress tests that exhaust the max number of TCP sockets on the machine, tests that read & write gigabytes to disk, and tests that spawn ~10k processes.

This needed stronger isolation than "please", so we used `systemd-run` (cgroups) to limit memory & CPU usage and isolate pid namespaces. The machine ran out of disk space and crashed several times anyway.

### [Get the test suite passing in CI](#get-the-test-suite-passing-in-ci)

Two days after the first CI run, the failing list was down from 972 test files to 23. A day and a half after that, Linux went fully green — and for the first time, it felt like this Rust rewrite was actually going to work.

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

Every CI build's test shards, by platform, across 135 builds that ran tests (420 mined from BuildKite). Bright green: every shard passed. Dim green: no failures, but the run was cut short (superseded). Red: at least one shard failed. Each lane is stamped when its full suite first passes — Linux's 60 shards were green almost a full day before Windows. Platforms kept wobbling red until the last failing tests fell; the final all-green build was #54202.

The rest of the time leading up to merging it was straightforward. A workflow that looped on fixing CI test failures for each platform until there were no more test failures. Several workflows for Windows-related cleanup, to deduplicate code, to reduce unsafe usage, and to generally clean up some code.

### [Merging the Rust rewrite](#merging-the-rust-rewrite)

Once 100% of Bun's test suite passed in CI on all platforms (and I manually verified the tests were in fact running and not being skipped), I ran a bunch of commands locally to test things - and then I pressed the merge button.

Merging into `main` isn't a versioned release. At this point, I was confident enough to move forward and commit to the rewrite, but not yet confident enough to release it.

### [Stats](#stats)

At peak, we were running 4 of these workflows at once each in a separate worktree, each with 16 Claudes per workflow. About 64 Claudes at a time.

git log · claude/phase-a-portpeak: 58 commits in one minute

0

commits

+0

lines written, rewrites included

Mon, May 4, 7:05 AM PDT

<svg viewBox="0 0 760 130" role="img" aria-label="Commits over the 11 days, colored by new code vs deletion"><rect x="0.00" y="100.10" width="2.10" height="9.90" fill="rgb(243,114,183)"></rect><rect x="2.70" y="105.96" width="2.10" height="4.04" fill="rgb(244,114,182)"></rect><rect x="5.41" y="104.28" width="2.10" height="5.72" fill="rgb(242,115,184)"></rect><rect x="13.52" y="104.28" width="2.10" height="5.72" fill="rgb(244,114,182)"></rect><rect x="16.23" y="104.28" width="2.10" height="5.72" fill="rgb(244,114,182)"></rect><rect x="18.93" y="105.96" width="2.10" height="4.04" fill="rgb(244,114,182)"></rect><rect x="21.64" y="105.96" width="2.10" height="4.04" fill="rgb(228,119,196)"></rect><rect x="24.34" y="104.28" width="2.10" height="5.72" fill="rgb(244,114,182)"></rect><rect x="27.05" y="105.96" width="2.10" height="4.04" fill="rgb(244,114,182)"></rect><rect x="29.75" y="105.96" width="2.10" height="4.04" fill="rgb(244,114,182)"></rect><rect x="32.46" y="101.92" width="2.10" height="8.08" fill="rgb(210,125,212)"></rect><rect x="35.16" y="100.96" width="2.10" height="9.04" fill="rgb(218,122,205)"></rect><rect x="37.86" y="105.96" width="2.10" height="4.04" fill="rgb(167,139,250)"></rect><rect x="43.27" y="103.00" width="2.10" height="7.00" fill="rgb(237,116,188)"></rect><rect x="45.98" y="97.22" width="2.10" height="12.78" fill="rgb(146,151,248)"></rect><rect x="51.39" y="100.10" width="2.10" height="9.90" fill="rgb(221,122,203)"></rect><rect x="54.09" y="103.00" width="2.10" height="7.00" fill="rgb(183,134,236)"></rect><rect x="56.80" y="97.88" width="2.10" height="12.12" fill="rgb(172,137,246)"></rect><rect x="59.50" y="100.10" width="2.10" height="9.90" fill="rgb(183,134,236)"></rect><rect x="62.21" y="104.28" width="2.10" height="5.72" fill="rgb(150,148,248)"></rect><rect x="64.91" y="103.00" width="2.10" height="7.00" fill="rgb(144,151,248)"></rect><rect x="67.62" y="104.28" width="2.10" height="5.72" fill="rgb(165,140,250)"></rect><rect x="70.32" y="104.28" width="2.10" height="5.72" fill="rgb(148,149,248)"></rect><rect x="81.14" y="104.28" width="2.10" height="5.72" fill="rgb(239,116,186)"></rect><rect x="83.84" y="104.28" width="2.10" height="5.72" fill="rgb(194,130,226)"></rect><rect x="91.96" y="104.28" width="2.10" height="5.72" fill="rgb(149,149,248)"></rect><rect x="94.66" y="101.92" width="2.10" height="8.08" fill="rgb(166,140,250)"></rect><rect x="97.37" y="105.96" width="2.10" height="4.04" fill="rgb(151,148,249)"></rect><rect x="100.07" y="101.92" width="2.10" height="8.08" fill="rgb(182,134,237)"></rect><rect x="102.78" y="104.28" width="2.10" height="5.72" fill="rgb(233,118,192)"></rect><rect x="108.19" y="103.00" width="2.10" height="7.00" fill="rgb(183,134,236)"></rect><rect x="110.89" y="104.28" width="2.10" height="5.72" fill="rgb(234,117,191)"></rect><rect x="113.59" y="104.28" width="2.10" height="5.72" fill="rgb(155,146,249)"></rect><rect x="116.30" y="100.10" width="2.10" height="9.90" fill="rgb(51,202,239)"></rect><rect x="119.00" y="103.00" width="2.10" height="7.00" fill="rgb(189,132,231)"></rect><rect x="121.71" y="101.92" width="2.10" height="8.08" fill="rgb(220,122,203)"></rect><rect x="124.41" y="74.54" width="2.10" height="35.46" fill="rgb(191,131,229)"></rect><rect x="127.12" y="66.29" width="2.10" height="43.71" fill="rgb(181,134,238)"></rect><rect x="129.82" y="67.81" width="2.10" height="42.19" fill="rgb(188,132,231)"></rect><rect x="132.53" y="78.70" width="2.10" height="31.30" fill="rgb(172,137,246)"></rect><rect x="135.23" y="45.34" width="2.10" height="64.66" fill="rgb(168,139,249)"></rect><rect x="137.94" y="51.16" width="2.10" height="58.84" fill="rgb(168,139,250)"></rect><rect x="140.64" y="53.86" width="2.10" height="56.14" fill="rgb(152,147,249)"></rect><rect x="143.35" y="59.04" width="2.10" height="50.96" fill="rgb(177,136,241)"></rect><rect x="146.05" y="75.71" width="2.10" height="34.29" fill="rgb(168,139,249)"></rect><rect x="148.75" y="90.20" width="2.10" height="19.80" fill="rgb(132,158,247)"></rect><rect x="151.46" y="105.96" width="2.10" height="4.04" fill="rgb(72,190,241)"></rect><rect x="159.57" y="96.60" width="2.10" height="13.40" fill="rgb(172,137,246)"></rect><rect x="162.28" y="24.75" width="2.10" height="85.25" fill="rgb(163,141,250)"></rect><rect x="164.98" y="8.00" width="2.10" height="102.00" fill="rgb(164,141,250)"></rect><rect x="167.69" y="59.52" width="2.10" height="50.48" fill="rgb(119,165,246)"></rect><rect x="170.39" y="91.04" width="2.10" height="18.96" fill="rgb(221,121,202)"></rect><rect x="173.10" y="97.88" width="2.10" height="12.12" fill="rgb(192,131,228)"></rect><rect x="175.80" y="104.28" width="2.10" height="5.72" fill="rgb(165,140,250)"></rect><rect x="181.21" y="96.00" width="2.10" height="14.00" fill="rgb(206,126,215)"></rect><rect x="183.91" y="56.84" width="2.10" height="53.16" fill="rgb(176,136,242)"></rect><rect x="186.62" y="44.71" width="2.10" height="65.29" fill="rgb(146,150,248)"></rect><rect x="189.32" y="47.92" width="2.10" height="62.08" fill="rgb(163,141,250)"></rect><rect x="192.03" y="49.78" width="2.10" height="60.22" fill="rgb(148,149,248)"></rect><rect x="194.73" y="52.99" width="2.10" height="57.01" fill="rgb(133,158,247)"></rect><rect x="197.44" y="37.26" width="2.10" height="72.74" fill="rgb(145,151,248)"></rect><rect x="200.14" y="68.98" width="2.10" height="41.02" fill="rgb(150,148,248)"></rect><rect x="202.85" y="97.88" width="2.10" height="12.12" fill="rgb(192,131,228)"></rect><rect x="205.55" y="91.93" width="2.10" height="18.07" fill="rgb(192,131,228)"></rect><rect x="208.26" y="99.31" width="2.10" height="10.69" fill="rgb(162,142,250)"></rect><rect x="210.96" y="94.88" width="2.10" height="15.12" fill="rgb(123,163,246)"></rect><rect x="213.67" y="92.38" width="2.10" height="17.62" fill="rgb(125,162,246)"></rect><rect x="216.37" y="91.48" width="2.10" height="18.52" fill="rgb(175,136,243)"></rect><rect x="219.07" y="91.48" width="2.10" height="18.52" fill="rgb(200,128,221)"></rect><rect x="221.78" y="80.30" width="2.10" height="29.70" fill="rgb(183,134,236)"></rect><rect x="224.48" y="95.43" width="2.10" height="14.57" fill="rgb(188,132,232)"></rect><rect x="227.19" y="98.57" width="2.10" height="11.43" fill="rgb(194,130,226)"></rect><rect x="229.89" y="100.96" width="2.10" height="9.04" fill="rgb(191,131,229)"></rect><rect x="232.60" y="101.92" width="2.10" height="8.08" fill="rgb(172,137,246)"></rect><rect x="235.30" y="105.96" width="2.10" height="4.04" fill="rgb(203,127,219)"></rect><rect x="246.12" y="104.28" width="2.10" height="5.72" fill="rgb(242,115,184)"></rect><rect x="248.83" y="105.96" width="2.10" height="4.04" fill="rgb(185,133,234)"></rect><rect x="251.53" y="105.96" width="2.10" height="4.04" fill="rgb(231,118,194)"></rect><rect x="254.23" y="98.57" width="2.10" height="11.43" fill="rgb(211,125,211)"></rect><rect x="256.94" y="100.10" width="2.10" height="9.90" fill="rgb(139,154,247)"></rect><rect x="259.64" y="83.81" width="2.10" height="26.19" fill="rgb(205,127,217)"></rect><rect x="262.35" y="80.03" width="2.10" height="29.97" fill="rgb(180,135,238)"></rect><rect x="265.05" y="72.74" width="2.10" height="37.26" fill="rgb(180,135,238)"></rect><rect x="267.76" y="69.18" width="2.10" height="40.82" fill="rgb(119,165,246)"></rect><rect x="270.46" y="86.43" width="2.10" height="23.57" fill="rgb(146,150,248)"></rect><rect x="273.17" y="82.89" width="2.10" height="27.11" fill="rgb(64,195,241)"></rect><rect x="275.87" y="85.09" width="2.10" height="24.91" fill="rgb(34,211,238)"></rect><rect x="278.58" y="90.62" width="2.10" height="19.38" fill="rgb(200,128,221)"></rect><rect x="281.28" y="91.93" width="2.10" height="18.07" fill="rgb(169,138,248)"></rect><rect x="283.99" y="88.61" width="2.10" height="21.39" fill="rgb(135,156,247)"></rect><rect x="286.69" y="89.39" width="2.10" height="20.61" fill="rgb(146,150,248)"></rect><rect x="289.40" y="92.38" width="2.10" height="17.62" fill="rgb(210,125,212)"></rect><rect x="292.10" y="94.88" width="2.10" height="15.12" fill="rgb(189,132,231)"></rect><rect x="294.80" y="98.57" width="2.10" height="11.43" fill="rgb(151,147,249)"></rect><rect x="297.51" y="105.96" width="2.10" height="4.04" fill="rgb(229,119,195)"></rect><rect x="300.21" y="94.88" width="2.10" height="15.12" fill="rgb(202,128,219)"></rect><rect x="302.92" y="105.96" width="2.10" height="4.04" fill="rgb(244,114,182)"></rect><rect x="305.62" y="94.35" width="2.10" height="15.65" fill="rgb(156,145,249)"></rect><rect x="308.33" y="96.00" width="2.10" height="14.00" fill="rgb(133,157,247)"></rect><rect x="311.03" y="97.22" width="2.10" height="12.78" fill="rgb(152,147,249)"></rect><rect x="313.74" y="93.83" width="2.10" height="16.17" fill="rgb(158,144,249)"></rect><rect x="316.44" y="79.49" width="2.10" height="30.51" fill="rgb(139,154,247)"></rect><rect x="319.15" y="91.04" width="2.10" height="18.96" fill="rgb(165,140,250)"></rect><rect x="327.26" y="105.96" width="2.10" height="4.04" fill="rgb(222,121,202)"></rect><rect x="329.96" y="105.96" width="2.10" height="4.04" fill="rgb(172,137,245)"></rect><rect x="332.67" y="100.96" width="2.10" height="9.04" fill="rgb(178,135,240)"></rect><rect x="335.37" y="95.43" width="2.10" height="14.57" fill="rgb(76,188,242)"></rect><rect x="338.08" y="91.48" width="2.10" height="18.52" fill="rgb(161,142,249)"></rect><rect x="340.78" y="94.88" width="2.10" height="15.12" fill="rgb(142,152,248)"></rect><rect x="343.49" y="103.00" width="2.10" height="7.00" fill="rgb(217,123,206)"></rect><rect x="346.19" y="104.28" width="2.10" height="5.72" fill="rgb(188,132,232)"></rect><rect x="348.90" y="99.31" width="2.10" height="10.69" fill="rgb(162,142,250)"></rect><rect x="351.60" y="100.10" width="2.10" height="9.90" fill="rgb(148,149,248)"></rect><rect x="354.31" y="92.85" width="2.10" height="17.15" fill="rgb(176,136,242)"></rect><rect x="357.01" y="96.60" width="2.10" height="13.40" fill="rgb(101,175,244)"></rect><rect x="359.72" y="105.96" width="2.10" height="4.04" fill="rgb(207,126,215)"></rect><rect x="362.42" y="100.96" width="2.10" height="9.04" fill="rgb(198,129,223)"></rect><rect x="365.12" y="100.10" width="2.10" height="9.90" fill="rgb(192,131,228)"></rect><rect x="367.83" y="100.10" width="2.10" height="9.90" fill="rgb(191,131,229)"></rect><rect x="370.53" y="97.22" width="2.10" height="12.78" fill="rgb(201,128,220)"></rect><rect x="373.24" y="99.31" width="2.10" height="10.69" fill="rgb(177,136,241)"></rect><rect x="375.94" y="78.96" width="2.10" height="31.04" fill="rgb(173,137,245)"></rect><rect x="378.65" y="100.10" width="2.10" height="9.90" fill="rgb(198,129,222)"></rect><rect x="381.35" y="95.43" width="2.10" height="14.57" fill="rgb(109,171,245)"></rect><rect x="384.06" y="105.96" width="2.10" height="4.04" fill="rgb(198,129,223)"></rect><rect x="386.76" y="104.28" width="2.10" height="5.72" fill="rgb(148,149,248)"></rect><rect x="389.47" y="100.96" width="2.10" height="9.04" fill="rgb(105,172,244)"></rect><rect x="392.17" y="104.28" width="2.10" height="5.72" fill="rgb(201,128,220)"></rect><rect x="394.88" y="96.60" width="2.10" height="13.40" fill="rgb(177,136,241)"></rect><rect x="402.99" y="105.96" width="2.10" height="4.04" fill="rgb(206,126,216)"></rect><rect x="405.69" y="103.00" width="2.10" height="7.00" fill="rgb(93,179,243)"></rect><rect x="408.40" y="99.31" width="2.10" height="10.69" fill="rgb(203,127,219)"></rect><rect x="411.10" y="100.96" width="2.10" height="9.04" fill="rgb(183,134,236)"></rect><rect x="413.81" y="100.10" width="2.10" height="9.90" fill="rgb(190,131,229)"></rect><rect x="416.51" y="105.96" width="2.10" height="4.04" fill="rgb(208,126,214)"></rect><rect x="419.22" y="93.34" width="2.10" height="16.66" fill="rgb(211,125,211)"></rect><rect x="421.92" y="104.28" width="2.10" height="5.72" fill="rgb(239,116,187)"></rect><rect x="424.63" y="103.00" width="2.10" height="7.00" fill="rgb(240,115,185)"></rect><rect x="427.33" y="105.96" width="2.10" height="4.04" fill="rgb(175,137,243)"></rect><rect x="430.04" y="105.96" width="2.10" height="4.04" fill="rgb(244,114,182)"></rect><rect x="443.56" y="105.96" width="2.10" height="4.04" fill="rgb(244,114,182)"></rect><rect x="446.26" y="101.92" width="2.10" height="8.08" fill="rgb(230,119,194)"></rect><rect x="448.97" y="105.96" width="2.10" height="4.04" fill="rgb(77,188,242)"></rect><rect x="451.67" y="105.96" width="2.10" height="4.04" fill="rgb(212,124,210)"></rect><rect x="454.38" y="104.28" width="2.10" height="5.72" fill="rgb(221,122,202)"></rect><rect x="457.08" y="105.96" width="2.10" height="4.04" fill="rgb(34,211,238)"></rect><rect x="462.49" y="104.28" width="2.10" height="5.72" fill="rgb(244,114,182)"></rect><rect x="465.20" y="105.96" width="2.10" height="4.04" fill="rgb(189,132,231)"></rect><rect x="467.90" y="105.96" width="2.10" height="4.04" fill="rgb(191,131,229)"></rect><rect x="470.60" y="101.92" width="2.10" height="8.08" fill="rgb(202,128,219)"></rect><rect x="473.31" y="105.96" width="2.10" height="4.04" fill="rgb(140,153,248)"></rect><rect x="476.01" y="104.28" width="2.10" height="5.72" fill="rgb(208,126,214)"></rect><rect x="481.42" y="103.00" width="2.10" height="7.00" fill="rgb(201,128,220)"></rect><rect x="486.83" y="105.96" width="2.10" height="4.04" fill="rgb(230,118,194)"></rect><rect x="489.54" y="104.28" width="2.10" height="5.72" fill="rgb(194,130,226)"></rect><rect x="492.24" y="99.31" width="2.10" height="10.69" fill="rgb(130,159,247)"></rect><rect x="494.95" y="101.92" width="2.10" height="8.08" fill="rgb(226,120,198)"></rect><rect x="497.65" y="103.00" width="2.10" height="7.00" fill="rgb(193,130,227)"></rect><rect x="500.36" y="104.28" width="2.10" height="5.72" fill="rgb(215,124,208)"></rect><rect x="503.06" y="105.96" width="2.10" height="4.04" fill="rgb(201,128,220)"></rect><rect x="505.77" y="104.28" width="2.10" height="5.72" fill="rgb(211,125,211)"></rect><rect x="508.47" y="105.96" width="2.10" height="4.04" fill="rgb(198,129,223)"></rect><rect x="513.88" y="103.00" width="2.10" height="7.00" fill="rgb(221,122,202)"></rect><rect x="516.58" y="104.28" width="2.10" height="5.72" fill="rgb(140,153,248)"></rect><rect x="519.29" y="104.28" width="2.10" height="5.72" fill="rgb(184,134,235)"></rect><rect x="521.99" y="103.00" width="2.10" height="7.00" fill="rgb(178,135,240)"></rect><rect x="524.70" y="103.00" width="2.10" height="7.00" fill="rgb(205,127,216)"></rect><rect x="527.40" y="104.28" width="2.10" height="5.72" fill="rgb(87,182,243)"></rect><rect x="530.11" y="104.28" width="2.10" height="5.72" fill="rgb(127,161,246)"></rect><rect x="532.81" y="104.28" width="2.10" height="5.72" fill="rgb(237,116,188)"></rect><rect x="535.52" y="100.10" width="2.10" height="9.90" fill="rgb(120,165,246)"></rect><rect x="538.22" y="105.96" width="2.10" height="4.04" fill="rgb(178,135,240)"></rect><rect x="540.93" y="104.28" width="2.10" height="5.72" fill="rgb(194,130,226)"></rect><rect x="543.63" y="105.96" width="2.10" height="4.04" fill="rgb(198,129,222)"></rect><rect x="546.33" y="104.28" width="2.10" height="5.72" fill="rgb(212,124,210)"></rect><rect x="549.04" y="97.22" width="2.10" height="12.78" fill="rgb(189,132,230)"></rect><rect x="551.74" y="94.88" width="2.10" height="15.12" fill="rgb(171,138,246)"></rect><rect x="554.45" y="92.38" width="2.10" height="17.62" fill="rgb(170,138,247)"></rect><rect x="557.15" y="100.10" width="2.10" height="9.90" fill="rgb(84,184,242)"></rect><rect x="559.86" y="103.00" width="2.10" height="7.00" fill="rgb(170,138,248)"></rect><rect x="562.56" y="97.88" width="2.10" height="12.12" fill="rgb(210,125,212)"></rect><rect x="565.27" y="100.10" width="2.10" height="9.90" fill="rgb(200,128,221)"></rect><rect x="567.97" y="59.36" width="2.10" height="50.64" fill="rgb(160,143,249)"></rect><rect x="570.68" y="101.92" width="2.10" height="8.08" fill="rgb(201,128,220)"></rect><rect x="573.38" y="96.00" width="2.10" height="14.00" fill="rgb(141,153,248)"></rect><rect x="576.09" y="93.34" width="2.10" height="16.66" fill="rgb(163,141,250)"></rect><rect x="578.79" y="78.96" width="2.10" height="31.04" fill="rgb(173,137,245)"></rect><rect x="581.49" y="90.62" width="2.10" height="19.38" fill="rgb(157,145,249)"></rect><rect x="584.20" y="80.58" width="2.10" height="29.42" fill="rgb(171,138,246)"></rect><rect x="586.90" y="87.14" width="2.10" height="22.86" fill="rgb(190,132,230)"></rect><rect x="589.61" y="86.09" width="2.10" height="23.91" fill="rgb(171,138,247)"></rect><rect x="592.31" y="91.93" width="2.10" height="18.07" fill="rgb(152,147,249)"></rect><rect x="595.02" y="82.00" width="2.10" height="28.00" fill="rgb(82,185,242)"></rect><rect x="597.72" y="84.12" width="2.10" height="25.88" fill="rgb(141,153,248)"></rect><rect x="600.43" y="88.24" width="2.10" height="21.76" fill="rgb(149,149,248)"></rect><rect x="603.13" y="94.35" width="2.10" height="15.65" fill="rgb(179,135,240)"></rect><rect x="605.84" y="90.62" width="2.10" height="19.38" fill="rgb(101,175,244)"></rect><rect x="608.54" y="84.76" width="2.10" height="25.24" fill="rgb(172,137,245)"></rect><rect x="611.25" y="86.78" width="2.10" height="23.22" fill="rgb(154,146,249)"></rect><rect x="613.95" y="89.00" width="2.10" height="21.00" fill="rgb(160,143,249)"></rect><rect x="616.65" y="95.43" width="2.10" height="14.57" fill="rgb(161,142,249)"></rect><rect x="619.36" y="100.96" width="2.10" height="9.04" fill="rgb(177,136,241)"></rect><rect x="622.06" y="104.28" width="2.10" height="5.72" fill="rgb(231,118,193)"></rect><rect x="624.77" y="105.96" width="2.10" height="4.04" fill="rgb(238,116,188)"></rect><rect x="627.47" y="105.96" width="2.10" height="4.04" fill="rgb(206,126,215)"></rect><rect x="630.18" y="104.28" width="2.10" height="5.72" fill="rgb(232,118,193)"></rect><rect x="632.88" y="100.96" width="2.10" height="9.04" fill="rgb(182,134,237)"></rect><rect x="635.59" y="105.96" width="2.10" height="4.04" fill="rgb(116,166,245)"></rect><rect x="638.29" y="104.28" width="2.10" height="5.72" fill="rgb(140,153,248)"></rect><rect x="641.00" y="94.35" width="2.10" height="15.65" fill="rgb(219,122,204)"></rect><rect x="643.70" y="89.79" width="2.10" height="20.21" fill="rgb(182,134,237)"></rect><rect x="646.41" y="87.50" width="2.10" height="22.50" fill="rgb(87,183,243)"></rect><rect x="649.11" y="101.92" width="2.10" height="8.08" fill="rgb(177,136,241)"></rect><rect x="651.81" y="89.00" width="2.10" height="21.00" fill="rgb(185,133,234)"></rect><rect x="657.22" y="92.38" width="2.10" height="17.62" fill="rgb(182,134,237)"></rect><rect x="659.93" y="104.28" width="2.10" height="5.72" fill="rgb(163,141,250)"></rect><rect x="662.63" y="104.28" width="2.10" height="5.72" fill="rgb(141,153,248)"></rect><rect x="670.75" y="97.22" width="2.10" height="12.78" fill="rgb(193,131,227)"></rect><rect x="673.45" y="104.28" width="2.10" height="5.72" fill="rgb(197,129,224)"></rect><rect x="676.16" y="100.10" width="2.10" height="9.90" fill="rgb(211,125,211)"></rect><rect x="678.86" y="105.96" width="2.10" height="4.04" fill="rgb(240,115,186)"></rect><rect x="681.57" y="95.43" width="2.10" height="14.57" fill="rgb(177,136,241)"></rect><rect x="684.27" y="103.00" width="2.10" height="7.00" fill="rgb(34,211,238)"></rect><rect x="686.98" y="97.22" width="2.10" height="12.78" fill="rgb(171,138,247)"></rect><rect x="689.68" y="105.96" width="2.10" height="4.04" fill="rgb(244,114,182)"></rect><rect x="692.38" y="97.88" width="2.10" height="12.12" fill="rgb(197,129,224)"></rect><rect x="695.09" y="105.96" width="2.10" height="4.04" fill="rgb(177,136,241)"></rect><rect x="697.79" y="96.60" width="2.10" height="13.40" fill="rgb(188,132,232)"></rect><rect x="700.50" y="96.00" width="2.10" height="14.00" fill="rgb(187,133,232)"></rect><rect x="705.91" y="94.88" width="2.10" height="15.12" fill="rgb(197,129,223)"></rect><rect x="708.61" y="99.31" width="2.10" height="10.69" fill="rgb(166,139,250)"></rect><rect x="711.32" y="97.22" width="2.10" height="12.78" fill="rgb(188,132,232)"></rect><rect x="714.02" y="100.10" width="2.10" height="9.90" fill="rgb(34,211,238)"></rect><rect x="716.73" y="97.88" width="2.10" height="12.12" fill="rgb(224,121,200)"></rect><rect x="719.43" y="104.28" width="2.10" height="5.72" fill="rgb(34,211,238)"></rect><rect x="722.14" y="105.96" width="2.10" height="4.04" fill="rgb(241,115,185)"></rect><rect x="724.84" y="104.28" width="2.10" height="5.72" fill="rgb(148,149,248)"></rect><rect x="732.95" y="99.31" width="2.10" height="10.69" fill="rgb(34,211,238)"></rect><rect x="735.66" y="103.00" width="2.10" height="7.00" fill="rgb(137,155,247)"></rect><rect x="738.36" y="105.96" width="2.10" height="4.04" fill="rgb(96,177,244)"></rect><rect x="749.18" y="104.28" width="2.10" height="5.72" fill="rgb(227,119,197)"></rect><rect x="751.89" y="105.96" width="2.10" height="4.04" fill="rgb(223,121,200)"></rect><rect x="754.59" y="105.96" width="2.10" height="4.04" fill="rgb(172,137,246)"></rect><g><line x1="4" y1="0" x2="4" y2="110" stroke="#6b7280" stroke-dasharray="3 3"></line><text x="9" y="125" font-size="11.5" fill="#9ca3af" text-anchor="start">first 100-file draft batch</text></g><g><line x1="338.9639781108732" y1="0" x2="338.9639781108732" y2="110" stroke="#6b7280" stroke-dasharray="3 3"></line><text x="338.9639781108732" y="125" font-size="11.5" fill="#9ca3af" text-anchor="middle">PR #30412 opened</text></g><g><line x1="756" y1="0" x2="756" y2="110" stroke="#6b7280" stroke-dasharray="3 3"></line><text x="751" y="125" font-size="11.5" fill="#9ca3af" text-anchor="end">merged</text></g><line x1="0" y1="0" x2="0" y2="110" stroke="#ffffff" stroke-width="2"></line></svg>

All 6,502 commits (merges excluded), replayed. Pink bars are mostly new code; cyan bars are mostly deletion. The line counter counts every rewrite along the way — the diff that landed was +1,009,272. The log is real commit messages.

#### 0 tests skipped or deleted

11 days (May 3 → merged May 14) · 6,778 commits

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

Pre-merge, this took 5.9 billion uncached input tokens, 690 million output tokens, and 72 billion cached input token reads — around $165,000 at API pricing. By hand, I think this would've taken 3 engineers with full context on the codebase about a year, during which time we wouldn't be able to improve Node.js compatibility, fix bugs, fix security issues or implement new features. We never would've done that. The realistic alternative was to do nothing and keep fixing the bugs at the top of this post forever.

This is the bleeding edge of what's possible today. I used a pre-release version of [Claude Fable 5](https://www.anthropic.com/news/claude-fable-5-mythos-5), a Mythos-class model. Claude Code's dynamic workflows kept 64 Claudes running for 11 days (I would've had to write my own harness to pull this off otherwise).

### [The work continues](#the-work-continues)

Since merging the Rust port, we've completed 11 rounds of security review from [Claude Code Security](https://claude.com/product/claude-security) and addressed the findings.

We've also added 24/7 coverage-guided fuzzing of every parser in Bun — JavaScript, TypeScript, JSX, CSS, JSON5, JSONC, TOML, YAML, Markdown, INI, Bun Shell scripts, semver ranges, .patch files, and CSS colors. The fuzzer automatically sends the bugs it finds to Claude to submit a PR reproducing & fixing, and humans review the PRs. So far, it's executed our parsers 100 billion times which has led to around 15 PRs.

At the time of writing, about 4% of Bun's Rust code sits inside an `unsafe` block (~13,000 `unsafe` keywords across ~27,000 lines / ~780,000 lines), and 78% of those blocks are a single line — a pointer that came from C++, or one call into a C library. I expect this number to go down over time as we refactor from a faithful Zig port (which had no greppable `unsafe` keyword) to idiomatic Rust, but we are going to continue using C & C++ libraries like JavaScriptCore so it will always have more `unsafe` than pure Rust projects.

### [Porting mistakes](#porting-mistakes)

The focus of the Rust rewrite is stability, but it would be impossible to ship a massive change like this and introduce zero regressions.

This rewrite introduced 19 known regressions, each of which has been fixed.

Most of the regressions came from code that's syntactically identical in both languages but semantically different.

#### Side effect inside `debug_assert!`

These two snippets look similar but behave differently. Zig's `assert` is a function, so its argument runs in every build. Rust's `debug_assert!` is a macro, so in release builds the whole expression is erased, including the `insert_stale` call.

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

`insert_stale` adds a file to the frontend dev server's hot reload graph. In release builds it stopped running, and HMR broke in certain cases for projects with HTML routes that use React while a hot reloaded file gets invalidated: `Cannot destructure property 'isLikelyComponentType' of 'k'`. Debug builds worked. [#30678](https://github.com/oven-sh/bun/issues/30678)

#### Slices of odd length

Bun's Zig helper `reinterpretSlice(u16, bytes)` (predating builtin casts supporting slices) used `@divTrunc` and ignored a trailing odd byte. `bytemuck::cast_slice` panics on it instead. `Blob.text()` on a UTF-16 byte order mark followed by an odd number of bytes stopped returning a string and panicked the process. We went back to ignoring the odd byte: `&buf[..buf.len() & !1]`. [#31188](https://github.com/oven-sh/bun/issues/31188)

#### Bounds checks

On macOS & Linux, we compiled Bun's Zig code with `ReleaseFast`, which removes bounds checks. Rust's release builds keep them.

Bun's module resolver interns long filenames into a global list that spills into overflow blocks. The original Zig code sized each block at `count / 4`, or 2048. The port left a placeholder:

```jsx
/// ... so use a nonzero stand-in until Phase B threads the
/// per-instantiation value through.
pub const BSS_OVERFLOW_BLOCK_SIZE: usize = 64;
```

That lowered the ceiling from 8.4 million interned filenames to 270,272, which real projects hit, and made a `ptrs[4095]` off-by-one we ported from Zig reachable. Rust panicked instead of writing past the end. Zig would also panic in this case, if we used `ReleaseSafe` (we only did on Windows). [#31503](https://github.com/oven-sh/bun/issues/31503)

#### `comptime` format strings

`Output.pretty` rewrites `<r>` and `<d>` color markers into ANSI escapes. In Zig, `fmt` is `comptime`, so the markers are gone before the arguments are substituted. Rust functions don't have comptime parameters, so `Output::pretty` only ever saw the finished string, and rewrote markers over the arguments too.

```jsx
// Zig:
pub inline fn pretty(comptime fmt: string, args: anytype) void;
Output.pretty("<r>{f}<r>", .{hyperlink});

// Rust:
pub fn pretty(payload: impl PrettyFmtInput);
Output::pretty(format_args!("<r>{}<r>", hyperlink));
```

`bun update -i` prints package names as [OSC 8](https://gist.github.com/egmontkob/eb114294efbcd5adb1944c9f3cb5feda) hyperlinks, terminated by `ESC \`. That backslash sits right before the `<` of the trailing `<r>`, the marker parser eats it, and the `r` prints as text.

<figure><a target="_blank" href="https://bun.com/images/update-interactive-r.png"><img src="https://bun.com/images/update-interactive-r.png" caption="it should say oxfmt, not oxfmtr"></a><figcaption>it should say oxfmt, not oxfmtr</figcaption></figure>

In Rust it has to be a macro: `bun_core::pretty!("<r>{}<r>", hyperlink)`. [#30693](https://github.com/oven-sh/bun/issues/30693)

## [Bun is better in Rust](#bun-is-better-in-rust)

So far, Bun v1.4.0 fixes 128 bugs that reproduce in v1.3.14. These range from memory leaks to crashes to miscolored help text.

### [Reduced memory usage](#reduced-memory-usage)

Rust has a powerful language-level tool for cleaning up memory: `Drop`. When `Drop` is implemented, the `drop` function is automatically called every time the value goes out of scope.

```jsx
impl Drop for Bytes {
    fn drop(&mut self) {
        if !self.pinned.is_empty() {
            JSC__JSValue__unpinArrayBuffer(self.pinned);
        }
    }
}
```

In Zig, `defer` can be used to run code at the end of a scope:

```jsx
const bytes: ArrayBuffer = try .fromPinned(global, value);
defer bytes.unpin();
```

In Zig, `defer` needs to be added to every individual call site that might need cleanup. It's easy to end up forgetting to clean up (a memory leak), or to run cleanup code twice in rarely-reached error handling code (a double-free). In Rust, `Drop` runs automatically when the value is no longer accessible - trading "no hidden control flow" for preventing a common footgun.

`Drop` fixed several memory leaks in Bun related to file paths in error handling code.

#### We fixed every instrumentable memory leak

We improved Bun's [LeakSanitizer](https://clang.llvm.org/docs/LeakSanitizer.html) integration to track all [native code memory allocations](https://github.com/oven-sh/bun/pull/30875).

Here's an example: every in-process `Bun.build()` call leaked several megabytes of memory — parsed source text and AST symbol tables that outlived the build they belonged to.

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

In Bun v1.3.14, every build leaks about 3 MB, forever — tools like dev servers that bundle on every request eventually run out of memory. In Bun v1.4.0, memory levels off:

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

A [previous attempt](https://github.com/oven-sh/bun/pull/24741) to do this in Zig was not merged because the lack of an equivalent of Drop made it more difficult to feel confident merging.

### [Smaller binary size](#smaller-binary-size)

The initial changes in the Rust rewrite reduced binary size by 3.8 MB on Windows, 5.5 MB on macOS, and 6.8 MB on Linux. This is largely because we used too much `comptime` in our Zig code.

After that initial shrinkage, the team explored more opportunities for binary size reduction using linker optimizations like Identical Code Folding, removing unused data from ICU, and lazily decompressing small parts of libicu with a zstd dictionary on-demand.

Combined with the Rust rewrite, ICU changes, and identical code folding, **Bun's binary size shrinks by ~20%** on Linux & Windows.

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

### [Reduced stack space usage](#reduced-stack-space-usage)

The TOML parser, and all of the other recursive-descent parsers in Bun (JSON, YAML, JavaScript, TypeScript, and more) now use less stack space.

This caused some test failures before merging the Rust rewrite:

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

Rust's LLVM IR codegen emits LLVM's [`llvm.lifetime.start`](https://llvm.org/docs/LangRef.html#llvm-lifetime-start-intrinsic) and [`llvm.lifetime.end`](https://llvm.org/docs/LangRef.html#llvm-lifetime-end-intrinsic) intrinsics for stack variables when they are no longer in use, which lets LLVM reuse stack space slots. This lets large functions with nested scopes use significantly less stack space.

Previously, we manually worked around [an open issue](https://github.com/ziglang/zig/issues/23475) by [refactoring particularly large functions](https://github.com/oven-sh/bun/pull/15993) into many smaller functions.

### [2% - 5% faster](#2-5-faster)

Rust supports cross-language link-time optimization between C/C++ and Rust, which enables inlining across programming languages (how cool is that!!).

We benchmarked Bun v1.3.14 against Bun v1.4.0 on Linux x64 (EC2, Xeon Platinum 8488C). HTTP throughput measured with [oha](https://github.com/hatoo/oha) against hello-world servers, app workloads measured with [hyperfine](https://github.com/sharkdp/hyperfine).

**HTTP throughput (req/s, avg of 3 rounds)**

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

**Apps / CLI (hyperfine)**

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

Prisma launched the [Prisma Compute](https://www.prisma.io/blog/bun-rust-rewrite-prisma-compute) public beta on Bun's Rust rewrite.

"We ran into memory leaks and a connection pool that couldn't recover after a VM was paused and resumed. When the Rust rewrite appeared, we tested it against the same failure modes. It handled them perfectly." - Alexey Orlenko

Claude Code v2.1.181 (released June 17th) and later use the Rust port of Bun. Startup got 10% faster on Linux but otherwise, barely anyone noticed. Boring is good.

<figure><a target="_blank" href="https://bun.com/images/claude-code-rust-bun-startup.png"><img src="https://bun.com/images/claude-code-rust-bun-startup.png" alt="Claude Code startup time from production telemetry (Linux p50): v2.1.179 at 517ms vs v2.1.181, the first release on Rust Bun, at 464ms — 10% faster"></a></figure>

## [Shipping](#shipping)

Bun v1.3.14 was the last version of Bun written in Zig. Bun v1.4.0 will be the first version of Bun written in Rust. It's available in canary now - please report any issues you find:

```jsx
bun upgrade --canary
```

## [Maintainability](#maintainability)

For myself and the team, our new Rust codebase feels very similar to the old Zig codebase. For example, here's a snippet of the original Zig code and the new Rust code:

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

Anyone who understands the original Zig code understands the mechanically translated Rust code. I reviewed the original Rust rewrite PR by checking the adversarial code review agents were correctly catching discrepancies between the Zig code and the Rust code, that they were ensuring the porting guide and lifetime guide were being followed, and also manually reading a lot of the code myself side-by-side with the Zig vs Rust.

## [What's next](#what-s-next)

Bun v1.4 makes Bun faster, smaller, use less memory and gives the team incredibly powerful tools for systematically improving stability going forward: Rust's borrow checker, Miri (which runs for a growing chunk of code in CI), LeakSanitizer, and 24/7 coverage-guided fuzzing for parsers. There's still [more to refactor](https://bun.com/bun-unsafe-audit), but things are off to a great start.

This Rust rewrite would've taken a team of engineers with full-context on the codebase a year of work. With 1 engineer using Fable & closely monitoring Claude Code, we went from start to 100% of the test suite passing on all platforms in 11 days.

One engineer can do a lot more today than a year ago.
