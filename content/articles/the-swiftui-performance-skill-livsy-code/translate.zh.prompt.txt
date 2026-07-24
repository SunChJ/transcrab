你是一个翻译助手。请把下面的 Markdown 内容翻译成简体中文。
[TransCrab Translation Profile]
- mode: auto
- audience: general
- style: conversational
- auto-resolved-mode: refined
- auto-resolved-audience: general
- auto-resolved-style: conversational
- auto-reasons: 公开发布默认使用 refined 流程，优先质量与稳定性；生活叙事关键词命中较高，判定为 life；篇幅较长，refined 可降低术语漂移与结构风险
- pipeline: analyze -> translate -> review -> revise
- 执行策略：自动判断（auto）。
- 发布流程固定按 refined 质量标准执行。
- 你需要根据主题（technology/business/life）自动选择最合适的翻译风格与语气。
要求：
- 保留 Markdown 结构（标题/列表/引用/表格/链接）。
- 代码块、命令、URL、文件路径保持原样，不要翻译。
- 若正文中出现形如 @@FIGURE_SVG_001@@ 的占位符，必须原样保留（不要改写、不要删除、不要移动）。
- **必须同时翻译标题**：请先输出一行 Markdown 一级标题（以 "# " 开头），作为译文标题。
- 然后空一行，再输出译文正文（不要再重复标题）。
- 只输出翻译结果本身，不要附加解释、不要加前后缀。
---
Greetings, traveler!

AI agent skills are small instruction packages that teach an agent how to work in a specific area. They can describe rules, workflows, project conventions, review checklists, references, and examples. In practice, a skill turns general AI assistance into something more focused.

This article is part of the series about agent skills. If you want the broader picture, I covered the idea in more detail [here](https://livsycode.com/best-practices/ai-agent-skills-for-ios-development/).

This time, I want to show a more practical example: a SwiftUI performance skill.

Instead of asking an agent to “review SwiftUI performance” and hoping it remembers every important detail, we give it a structured skill. The skill explains what to look for, which patterns are risky, which APIs matter, and how to reason about performance without jumping to random micro-optimizations.

## SKILL.md

The SwiftUI performance skill is built for one narrow job: reviewing SwiftUI code when update behavior matters.

This is not a general SwiftUI helper. It is not for syntax questions, styling, UIKit-only performance, or a random Instruments walkthrough. The skill should be used when the problem is connected to SwiftUI updates: unnecessary invalidation, unstable identity, broad state reads, expensive work in `body`, heavy rows, scrolling hitches, layout cost, drawing cost, animation hitches, or lifecycle work started from the wrong place.

The `description` at the top of `SKILL.md` does a lot of work here. In OpenAI Codex, a skill can be selected explicitly by the user, or implicitly when the task matches the skill description. That means the description has to be specific enough to trigger at the right moment, but also strict enough to avoid false positives. This skill does that well: it lists the SwiftUI performance cases where it should apply, then names the cases where it should not.

The main idea of the skill is change locality.

Before suggesting a fix, the agent has to answer three questions:

1.  What changed?
2.  Which views depend on that change?
3.  How much UI work happens because of it?

That is a good SwiftUI mental model. Many SwiftUI performance issues are not caused by one obviously slow line of code. They come from a small state change that invalidates too much UI, a view that reads a model that is too broad, an identity that changes when it should stay stable, or a row that performs work every time SwiftUI recomputes the view tree.

The skill then turns that mental model into a review workflow. It tells the agent to inspect identity first, then body cost, broad dependencies, state lifetime, list structure, closure-heavy inputs, layout and drawing cost, async lifecycle, and profiling only when confirmation is useful. This order matters because it keeps the review close to the code path. The agent should not jump straight to a large architecture rewrite when a smaller fix can make the update path more local.

The evidence rule is another important part of the skill. It forces the agent to separate static review findings, likely risks, hypotheses, measured results, user-provided evidence, and tool-generated evidence. That prevents a common failure mode in performance discussions: inventing numbers. The skill can say that a parent view reads a whole model and may invalidate a large part of the screen. It cannot claim that the issue costs 500 ms unless that number came from a real measurement.

In day-to-day use, this skill works best when the prompt gives the agent a concrete SwiftUI code path. For example, a screen with slow scrolling, a row that updates too often, a view model that invalidates the whole screen, or a pagination trigger that fires more than expected. The agent can then apply the review format from `SKILL.md`: identify the main issue, explain why it matters in SwiftUI, estimate the risk, suggest a targeted refactor, add code when useful, and say what should be measured if the finding needs confirmation.

The skill also gives the agent a list of red flags. Some are obvious, like `.id(UUID())`, index-based identity in mutable collections, or sorting inside `body`. Others are easier to miss: broad computed properties that hide many state reads, custom bindings where a key-path binding would work, many non-visual closures stored in row views, or heavy shadows and overlays repeated across every row.

The refactor guidance stays practical. Keep identity stable. Move expensive transformations out of `body`. Prepare render-ready models before repeated rendering paths. Move state closer to the component that owns it. Split large views by dependency, not just by file size. Use `.equatable()` only when visual equality is clear and cheaper than recomputing. Use `.task(id:)` when work is tied to changing input and should cancel and restart automatically.

That last point is the tone of the whole skill: no magic fixes. `.equatable()`, caching, memoization, UIKit fallbacks, and profiling tools are all useful in the right place, but the agent has to explain the SwiftUI cause first.

The `SKILL.md` file is only the entry point. It defines the scope, review model, evidence rules, and response format. The deeper details live in references. Each reference handles one part of SwiftUI performance, such as identity and state, Observation, body cost, lists and pagination, closures and bindings, layout and drawing, async lifecycle, and profiling validation.

## Async lifecycle and MainActor

This reference covers the place where SwiftUI lifecycle and Swift concurrency meet.

Its main point is simple: async work in SwiftUI should have a clear owner and a stable trigger. A task should start because of a meaningful lifecycle event or user action, not because `body` happened to run again.

That is why the reference draws a hard line around `body`. SwiftUI can evaluate `body` many times, so starting `Task { ... }` there turns rendering into a source of side effects. Loading should usually live in `.task`, `.task(id:)`, `.refreshable`, an explicit action, or a model-owned task when the work must outlive one view appearance.

The reference also explains when to use `.task(id:)`. It fits work that should cancel and restart when a semantic input changes, such as an account ID, search query, selected tab, filter, route, or document ID. The ID should be stable and meaningful. Random IDs, timestamps, or values changed by the task itself can create accidental restarts.

Another big part is cancellation. Swift cancellation is cooperative, so a canceled task may keep running until it checks cancellation. For SwiftUI, the dangerous part is committing old results into visible state. Search, pagination, fast tab switching, and detail screens all need stale-result protection. A task should check cancellation before updating UI state, and often also verify that the active input is still the same.

The MainActor section is especially important for SwiftUI apps. A `@MainActor` view model is often the right place for UI state, but it should not become a dumping ground for heavy synchronous work. Sorting, filtering, parsing, formatting, and render-model creation can block interaction if they run on the main actor during a hot path. The final UI mutation should stay on the MainActor, but heavy preparation should move away from it when the data is safe to transfer.

The reference also calls out row lifecycle and pagination. Row `.onAppear` is not a reliable “first visible” event. Rows can appear multiple times during scrolling, filtering, refresh, navigation, or identity changes. Pagination logic needs guards for already loading, next page availability, requested page keys, refresh overlap, cancellation, and stale triggers. For large lists, a footer or sentinel view can be cleaner than attaching lifecycle work to every row.

In practice, this reference teaches the agent to ask a few direct questions: what starts the async work, can it restart by accident, can duplicate work happen, can an older task overwrite a newer result, and is too much work running on the main actor?

The preferred fix is usually small. Make the trigger stable. Make the operation idempotent. Handle cancellation separately from real errors. Guard against stale commits. Batch UI state updates instead of mutating visible collections item by item.

This is a good example of how the skill avoids generic advice like “SwiftUI is slow.” The problem has to be named more precisely: duplicate tasks, unstable task restarts, stale commits, main-actor transformation work, or too many UI invalidations after async updates.

## Body cost and render models

This reference covers a very common SwiftUI performance problem: too much work happens while the view is being rendered.

A SwiftUI `body` should describe UI. It should not behave like a data preparation pipeline. The reference focuses on work that can accidentally move into the render path: sorting, filtering, grouping, mapping, formatting, parsing, image preparation, expensive computed properties, and repeated render model construction.

The important nuance is that the reference does not ban all transformations inside views. A small `.formatted(...)` call in a static screen is usually fine. The risk appears when the same work runs often, touches many items, happens during scrolling or typing, allocates many temporary values, or runs on the main actor during interaction.

The reference also separates two different problems. Dependency scope controls how often a view updates. Body cost controls how much work happens when it updates. Splitting a view helps only if it moves expensive work out of the updating part of the tree or places that work behind a narrower dependency boundary. Moving a heavy pipeline from `body` into a computed property does not fix anything if `body` still reads it every time.

The preferred pattern is to prepare render-ready models when inputs change. A row model can contain stable identity, display strings, flags, labels, and lightweight styling state. Then SwiftUI can render simple values instead of rebuilding formatted text, sorted arrays, grouped sections, or display-specific models on every update.

This is especially useful for feeds, dashboards, financial rows, catalog grids, timelines, search results, and other repeated content where raw domain data is not ready for display. It should not be applied mechanically to every small view. Render models make sense when they remove repeated work or make invalidation easier to reason about.

The MainActor part matters too. UI-facing state usually belongs on the MainActor, but heavy synchronous preparation should not run there on a hot path if it can be moved safely. For large pure transformations, the better flow is: receive raw data, prepare display models away from the main actor, then commit one compact UI state update. The reference is careful here: making a helper `async` does not automatically move CPU work off the main actor.

For validation, the reference points to Time Profiler, the SwiftUI instrument, Allocations, signposts, timestamps, and XCTest performance tests. The agent should use these when the cost is suspected but not obvious. It should not claim numeric savings without measurement.

In practice, this reference teaches the agent to ask: does `body` mostly assemble prepared values, or does it rebuild the data needed to render them? If the answer is the second one, the fix is usually to move work to the moment when the input changes, prepare stable render models, and keep the final UI update small.

## Closures, bindings, and equatable views

This reference is about keeping SwiftUI view inputs easy to reason about.

The core idea is to separate visual data from behavior, especially in large lists, complex rows, forms, menus, swipe actions, and frequently updating parents. A row can contain visual inputs like text, flags, IDs, colors, and render models. It can also contain behavior: closures, gestures, action handlers, custom bindings, and swipe actions. Those behavioral inputs are harder to compare, easier to over-capture, and easier to misuse as a hidden dependency path.

The reference is careful not to overstate the problem. Closures are normal in SwiftUI. A closure does not automatically make a row redraw. The issue appears when repeated views store many non-visual closures, capture large models, or mix simple visual rendering with noisy action routing.

A practical fix is to keep the row itself focused on visual input and attach actions at a stable boundary when it makes the code clearer. For example, a purely visual row can receive a render model, while tap gestures or swipe actions capture only a stable model reference and a row ID. That does not remove closures from the SwiftUI tree, but it makes row values cleaner and creates a better boundary if `.equatable()` is used later.

The same logic applies to custom bindings. `Binding(get:set:)` is not bad by itself, but it can hide work inside the render path. If a key-path binding expresses the same relationship, it is usually clearer. Custom bindings are better reserved for real transformation, validation, optional handling, clamping, or routing through a model method. In Observation-based models, `@Bindable` and key-path bindings keep editable state relationships explicit.

The `.equatable()` guidance is also intentionally narrow. It is useful only when the view has clear visual inputs, equality is complete, and checking equality is cheaper than recomputing the body. It should not be used as a blanket fix for broad invalidation. If a view reads hidden state, depends on environment values, stores changing closures, or omits visible state from equality, `.equatable()` can make the update behavior harder to trust.

For complex rows, the reference prefers Equatable render models. That keeps equality close to the data that actually affects rendering: title, subtitle, formatted amount, status flags, visibility, layout-affecting values, and similar display-ready fields.

In practice, this reference teaches the agent to avoid lazy advice like “remove closures” or “add `.equatable()`.” The better review question is more specific: are visual input, action routing, binding logic, and equality boundaries clear enough that SwiftUI updates can be understood and validated?

## Identity and state

This reference focuses on one of the most important SwiftUI questions: can SwiftUI preserve the right identity across updates?

SwiftUI views are temporary value descriptions. State does not live inside the view value itself. SwiftUI keeps state by attaching it to identity in the view hierarchy. That identity usually comes from structural position, concrete view type, and explicit IDs in places like `ForEach` or `.id(...)`.

This matters because accidental identity changes can create both correctness and performance problems. Text fields can lose input. Focus can disappear. Row expansion state can move to the wrong item. `.task` work can restart. Animations can reset. SwiftUI may recreate more of the tree than the code author expected.

The reference starts with structural identity. Two branches can look visually similar but still produce different SwiftUI structure. That is fine when the UI really has different states. It becomes risky when the same conceptual component should keep local state and only change values. In that case, value-based modifiers are often safer than swapping structure at runtime.

The same warning applies to custom conditional modifier helpers. They are convenient, but they can hide structural changes behind a fluent API. If the condition changes while the view is alive, the subtree may get a different identity. That can reset `@State`, `@FocusState`, `@StateObject`, lifecycle work, gestures, or animations. The reference does not ban these helpers. It asks the agent to check whether the condition is static, intentional, or dangerous for local state.

Explicit `.id(...)` is treated as an identity boundary, not a refresh button. It is useful when a subtree should intentionally reset for a different entity, or when defining scroll targets and known lifecycle boundaries. It is risky when the ID is unstable, such as `.id(UUID())`, because the view gets a new identity on every update.

For collections, the rule is stable data identity. `ForEach` should not use offsets or indices for mutable, filterable, reorderable, or pageable collections. Existing rows can then inherit state from the wrong item after insertion, deletion, filtering, or reordering. IDs should come from the data and should be stable, unique, and cheap.

The state section is just as practical. `@State` is for local value state owned by a stable view identity. It should not be used as an accidental cache of parent input. If a `@State` value is initialized from an input, it behaves like an initial snapshot. That is correct for a local draft, but wrong if the view should always reflect later parent changes.

The reference also clarifies model ownership. A view that creates and owns an `ObservableObject` should use `@StateObject`. A view that receives an object owned elsewhere should use `@ObservedObject`. That is an ownership and lifetime rule, not a claim that one wrapper is simply “faster.” For iOS 17 and later, a view-owned `@Observable` model can be stored in `@State`, while `@Bindable` is used when the child needs editable bindings into that model.

In practice, this reference teaches the agent to review identity before reaching for lower-level optimizations. If identity is unstable, SwiftUI may reset state, restart work, or associate state with the wrong row. The fix is usually not complicated: use stable IDs, make `.id(...)` intentional, keep local state attached to a stable subtree, and choose the state wrapper that matches real ownership.

## Layout, drawing, and animation

This reference covers the visual side of SwiftUI performance: layout, drawing, compositing, and animation.

Its goal is not to remove shadows, masks, blurs, gradients, transitions, or polished motion from the UI. The goal is to keep their cost proportional to the surface where they are used. A blur on one card is very different from a blur, mask, shadow, overlay, and animated material in every row of a long list.

The reference starts by classifying the problem. Is the hitch caused by layout work, drawing work, compositing work, animation scope, or unrelated main-thread CPU that happens during a visual update? That distinction matters because “SwiftUI diffing” is not always the cause of a visual delay.

Modifier chains are one review target. A long chain is not automatically bad, but it becomes suspicious when repeated many times or updated frequently. Effects like `background`, `overlay`, `mask`, `clipShape`, `shadow`, `blur`, `drawingGroup()`, and `compositingGroup()` should be reviewed carefully in hot paths.

`GeometryReader` gets the same balanced treatment. It is useful when a view really needs container size or coordinates. The risk appears when geometry reads are placed inside every row, written into broad observable state, or used in feedback loops where measurement changes state, state changes layout, and layout changes measurement again. When possible, geometry should be read at a stable container boundary or replaced with simpler layout APIs.

Preference keys are useful for child-to-parent measurement, but they can also create extra update cycles. The reference recommends keeping preference values small, reducing them intentionally, avoiding per-row preferences when a container-level value is enough, and guarding tiny floating-point changes before writing them back into state.

The visual effects section is about compositing pressure. Repeated dynamic shadows, animated blur, nested masks, translucent materials, large clipped images, and complex overlays can become expensive, especially during scrolling or animation. The reference does not say “never use them.” It says to simplify hot paths where the design allows it, apply expensive effects at coarser boundaries, and validate when the effect is suspected to cause visible hitches.

`drawingGroup()` and `compositingGroup()` are treated as deliberate tools, not magic fixes. They can help in some complex vector drawing cases, but they can also move cost into offscreen rendering, memory, and texture work. The skill should never recommend `drawingGroup()` mechanically for every row.

For dense drawing, the reference points to `Canvas`. It fits charts, waveforms, heat maps, sparklines, dense particles, and other visuals where many tiny elements update together and do not need to be separate SwiftUI views. At the same time, `Canvas` is not a replacement for normal interactive controls, because drawn elements do not automatically get individual SwiftUI identity, accessibility, hit testing, or state lifecycle.

The animation guidance is mostly about scope. Broad implicit animation on a large container can animate unrelated state changes and make too much UI participate in one transaction. The reference prefers animating specific values close to the component that visually changes. It also distinguishes layout-affecting animation from compositor-friendly animation. Opacity and transforms are often cheaper than animating size, text layout, blur, masks, shadows, or gradients, but even they can hitch when the animated subtree is heavy.

In practice, this reference teaches the agent to describe visual performance problems precisely. Instead of saying “use fewer modifiers,” the agent should say which part is risky: geometry inside every row, preference feedback into broad state, dense subviews that could be one `Canvas`, broad animation scope, or repeated compositing effects in scrolling content.

## Lists, pagination, and rows

This reference focuses on one of the easiest places to make SwiftUI slow: large, growing, or frequently updating collections.

The main idea is update locality. A good list makes it obvious what changed: one row, one page, one footer, one selected item, or one filtered result. If every append, filter, sort, or small state change makes SwiftUI reconcile a large unstable structure, scrolling and pagination become fragile.

The reference starts from the symptom, not from a preferred container. Scroll hitches, duplicate page loads, slow appends, memory growth, unrelated row updates, and search lag can have different causes. The agent should connect the symptom to a likely hot path before suggesting a refactor.

It also avoids the common advice to replace `List` with `LazyVStack` by default. `List`, `LazyVStack`, and `VStack` are not interchangeable. `List` is usually better when the screen needs native long-list behavior, selection, editing, swipe actions, accessibility behavior, and platform row styling. `LazyVStack` gives more layout control for custom feeds and card layouts, but lazy construction is not the same thing as UIKit-style cell reuse. `VStack` belongs to small fixed content, not long dynamic lists.

Identity is the next major point. Large collections need stable, cheap IDs from the data. Offset-based identity is risky when rows can be inserted, deleted, filtered, sorted, or paginated, because state can move to the wrong row. Computed IDs like `var id: UUID { UUID() }` are even worse because every access creates a new identity.

Rows should be cheap to build. Formatting, sorting child data, image preparation, icon lookup, database reads, long modifier chains, overlays, masks, shadows, blurs, custom bindings, and heavy menus can all become visible when repeated across many rows. The reference does not ban these things. It asks whether they happen in a hot path and whether the row could instead render a prepared row model.

Pagination gets special treatment. A flat array append is often fine when rows are simple and identity is stable. It becomes suspicious when profiling shows append hitches, old rows are rebuilt, or heavy row work runs during pagination. In that case, stable page or section models can make the changed unit clearer. The point is not to use `Section` as a magic fix. The point is to preserve a real page boundary when it helps SwiftUI and the developer reason about what changed.

The reference also warns against deriving pages inside `body`. Chunking a flat array into page sections during rendering can allocate new page values, create unstable identity, and hide the real pagination boundary. Pages, visible rows, filters, sorting, and formatted row models should be prepared when input changes, not rebuilt while SwiftUI renders the list.

Pagination triggers are another common source of bugs. Row `.onAppear` is not a reliable one-time event. It can fire repeatedly during scrolling, navigation, filtering, refresh, or view reconstruction. A safer approach is a guarded `.task(id:)`, a footer, or a sentinel view. The model method should be idempotent and check loading state, next-page availability, already requested page keys, active filter or search context, and cancellation before committing visible state.

The reference also keeps background work realistic. Moving row preparation off the main actor can help, but it does not make the work free. If background processing saturates the CPU while the user scrolls, responsiveness can still suffer. The final UI update should be compact, and heavy preparation should move off the main actor only when the data is safe to transfer and the work is large enough to justify it.

In practice, this reference teaches the agent to review lists as update paths, not just containers. The right question is: when data changes, how much list structure has to be rebuilt, how expensive are the rows, how stable is identity, and can pagination update one clear unit instead of disturbing the whole screen?

## Observation and dependencies

This reference covers dependency scope: which state a view reads, and how far a state change travels through the SwiftUI tree.

The main goal is local invalidation. A state change should affect the smallest useful part of the UI. If only a header needs `model.title`, the whole screen should not become sensitive to `title` unless the parent really needs that value too.

The reference is careful with language. SwiftUI updates are driven by more than one thing: dependencies, identity, environment, transactions, animations, and parent updates. So the agent should not say “this view redraws only when this property changes.” A better phrasing is: “this view reads `model.name`, so changes to `model.name` can re-evaluate this view through that dependency.”

One important distinction is `ObservableObject` versus Observation. With `ObservableObject` and `@Published`, views often observe at object granularity. A child that visually needs only `name` may still observe the whole view model. With Observation on iOS 17 and later, property reads can be tracked more precisely, so a child that reads `model.name` does not need to depend on every property of the same model through that read alone.

But Observation is not a magic fix. If a large parent still reads many properties before passing values down, the parent owns those dependencies. The reference introduces the idea of dependency islands: small subtrees that own the reads for a specific part of observable state. Sometimes passing values is better. Sometimes passing an observable model is better. The choice depends on where the dependency should live.

Environment values get the same treatment. An environment read is also a dependency. Reading a broad app model from a tiny presentational view can hide the real update path. For reusable views, explicit values or smaller models often make the dependency easier to audit.

Computed properties are another source of hidden dependencies. A view may appear to read one value, such as `headerTitle`, while that computed property internally reads `user`, `accounts`, and `marketState`. If the question is dependency scope, the agent should reveal those hidden reads. If the question is CPU work inside the computed property, the body cost reference is a better fit.

The collection guidance is also practical. A badge that reads the whole `messages` array just to show unread count depends on the whole collection and may also perform repeated work. A prepared aggregate like `unreadCount` can narrow the dependency, but only if the model keeps it consistent with the source data.

For migration, the reference recommends `@Observable` for new SwiftUI-facing models on iOS 17 and later when the project does not need Combine-based observation or older deployment support. View-owned `@Observable` models can live in `@State`, and `@Bindable` should be used only where a view actually needs bindings. Existing `ObservableObject` code should not be replaced blindly when Combine, UIKit consumers, older OS support, or existing `objectWillChange` behavior matter.

In practice, this reference teaches the agent to ask a simple question before refactoring: where is the state read? If a broad parent reads data that only a child displays, move the read down. If a child should stay presentational, pass a narrow value. If the dependency should belong to a small subtree, create a dependency island. The best design is the one that makes the dependency visible.

## Profiling and validation

This reference is about evidence.

It is used when the task involves Instruments traces, `xctrace` output, signpost logs, XCTest benchmarks, MetricKit payloads, screen recordings, memory graphs, console logs, or other performance artifacts. Its role is not to replace code review. Its role is to confirm or reject a specific SwiftUI performance hypothesis.

The central rule is strict: do not claim that something was measured unless real evidence exists. A suspicious row body is a static risk. A repeated `_printChanges()` log is a debug signal. A Time Profiler trace, signpost interval, XCTest metric, memory graph, or MetricKit payload is evidence. These levels should not be mixed.

That rule matters because performance discussions often jump too quickly from “this looks risky” to “this causes a 200 ms hitch.” The reference prevents that. Without a trace, benchmark, log, or user-provided measurement, the agent should describe a risk or hypothesis and explain how to validate it.

The reference also forces the agent to define a scenario before profiling. “The app feels slow” is not enough. A useful scenario names the screen, starting state, exact action, data size, device or simulator, OS version, build configuration, and symptom. For example: open a feed with 2,000 rows, type five characters into search, and check whether rows update on every keystroke.

Tool choice depends on the question. The SwiftUI instrument helps with body updates and update scope. Time Profiler helps find main-thread CPU work, formatters, sorters, mappers, parsers, image work, and expensive app symbols. Animation Hitches and Core Animation help with visible stutter, scroll jank, compositing pressure, masks, shadows, blurs, and large animated surfaces. Allocations helps with temporary arrays, strings, formatter creation, render model rebuilds, and wrapper churn. Memory Graph helps when the issue is retention, leaked view models, retained tasks, closures, publishers, streams, delegates, or caches.

The reference treats signposts as phase markers, not as magic measurements. A signpost around a state mutation can align app-level events with Instruments timelines. It does not, by itself, measure the full SwiftUI reconciliation, layout, drawing, or rendering cost.

MetricKit is treated as production evidence, but not as a local profiler. It can show trends in hangs, responsiveness, memory, CPU, energy, launch time, and diagnostics across app versions or device classes. It usually tells where to investigate, not which SwiftUI line to change.

The before-and-after loop is intentionally simple: define one scenario, capture a baseline, form one hypothesis, apply one targeted refactor, run the same scenario again, and compare the same metrics. The reference discourages changing several things at once because that makes the result hard to interpret.

In practice, this reference teaches the agent to make SwiftUI performance claims falsifiable. If profiling shows long body updates, inspect dependencies, identity, and body cost. If Time Profiler shows formatting on the main thread during scroll, move formatting out of the render path. If pagination append creates a spike, inspect page boundaries, row cost, and final main-actor mutation. If a screen recording shows jank but no trace exists, turn it into a reproducible profiling scenario instead of guessing the cause.

## Conclusion

A SwiftUI performance skill works best when it does not try to be a huge prompt with every possible rule inside it.

The main `SKILL.md` file should define the mental model, scope, review order, evidence rules, and response format. The references should cover deeper topics separately: identity, dependencies, body cost, lists, closures, layout, async lifecycle, and profiling.

This structure makes the agent more useful in real code reviews. Instead of giving generic advice like “split the view” or “use Instruments,” it can ask better questions:

What changed?  
Which view depends on that change?  
Is identity stable?  
Is state attached to the right lifetime?  
Is `body` doing too much work?  
Are rows cheap enough?  
Is async work tied to a stable lifecycle?  
Is the finding measured, or only a hypothesis?

That is the real value of a performance skill. It does not make the agent magically correct. It gives the agent a narrower path to follow, with fewer chances to jump to vague explanations or unsupported numbers.

For SwiftUI, this matters a lot. Performance problems are often hidden in update behavior: a broad state read, unstable identity, repeated formatting, row lifecycle work, or an animation that affects more UI than expected. A good skill keeps the review close to those causes.

The full SwiftUI performance skill is available on [GitHub](https://github.com/Livsy90/iOS-Performance-Agent-Skills).
