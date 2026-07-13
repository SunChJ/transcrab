你是一个翻译助手。请把下面的 Markdown 内容翻译成简体中文。
[TransCrab Translation Profile]
- mode: auto
- audience: business
- style: business
- auto-resolved-mode: refined
- auto-resolved-audience: business
- auto-resolved-style: business
- auto-reasons: 公开发布默认使用 refined 流程，优先质量与稳定性；商业关键词命中较高，判定为 business
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
TLDR: OpenAI just published the official playbook for prompting the GPT-5.6 model family - I translated it.

Master these principles, and GPT-5.6 becomes 10x more powerful and efficient.

This article is the plain-English version of OpenAI's guidance, translated so you don't have to wade through the developer docs yourself.

Here's everything you need to know.

Table of Contents

I: What's Changed in GPT-5.6
II: How to Prompt GPT-5.6 Properly
III: New Features 
IV: Optimal Prompting Framework for GPT-5.6
V: Caveats with GPT-5.6

For reference, this is the resource I've translated. Feel free to review it in depth and verify my analysis:

[https://developers.openai.com/api/docs/guides/latest-model](https://developers.openai.com/api/docs/guides/latest-model)

## I: What's Changed in GPT-5.6

A brief overview of the fundamental changes in GPT-5.6, important context before you touch a single prompt.

1. It's Dramatically More Token-Efficient

GPT-5.6 reaches frontier-level performance while using fewer output tokens than prior models.

2. It Reads Your Intent Better

GPT-5.6 can infer the underlying goal and the appropriate level of effort without you spelling out every step. You still need to state your constraints, approval boundaries, and success criteria explicitly, but the model needs less hand-holding to get there.

3. Responses Are Shorter by Default

This is one of the biggest behavioral shifts. GPT-5.6 responses run shorter than prior models across the board: fewer generic intros, fewer speculative branches, shorter lists, and less repetition between the answer and the reasoning behind it.

4. Design and Frontend Judgment Improved

GPT-5.6 produces more polished, usable websites and applications, with noticeably stronger layout, visual hierarchy, and design judgment.

5. New Reasoning & Execution Modes

GPT-5.6 introduces a new max reasoning effort (beyond xhigh) for the hardest tasks, plus an entirely new Pro Mode (more on these later).

6. Tool Calling Got a New Execution Path

GPT-5.6 can write and run its own lightweight programs to call tools, process results, and filter intermediate output, called Programmatic Tool Calling.

7. Multi-Agent Coordination (Beta)

A single GPT-5.6 instance can now coordinate multiple subagents in parallel and synthesize their results, similar to ultra mode in Codex.

![](https://pbs.twimg.com/media/HMz6P5-a8AEeP8H.jpg)

## II: How to Prompt GPT-5.6 Properly

1. Use Shorter Prompts

This is the single biggest adjustment you need to make.

In OpenAI's internal evaluations, they found that replacing long, explicit system prompts with minimal prompts improved scores by ~15%, while reducing total tokens by 60%+.

2. Define Autonomy & Permissions Clearly

GPT-5.6 can be proactive and persistent, which means you need to define what level of action each request actually authorizes.

When using GPT-5.6, just be clear with where you want the model to stop and what it actually has authorization to pursue.

One important note: don't repeat "ask first," "do not mutate," or "wait for approval" throughout your prompt. Repetition can actually trigger unnecessary permission checks, even for safe, expected actions.

3. Avoid Generic Instructions

Use prioritization instructions - this tells GPT-5.6 your underlying goals.

Example: If you want shorter responses, don't say "be shorter," instead say "lead with the conclusion."

4. Tone

GPT-5.6 doesn't meaningfully improve when you tell it to "be friendlier" or "more empathetic."

Generic warmth instructions no longer move the needle the way they did with previous models.

Instead, be concrete:

TONE PROMPT EXAMPLE

5. Keep Structure Lightweight

GPT-5.6 benefits from a small amount of task-specific structure, a lightweight outline, not a full response template imposed on every answer.

Add narrow constraints only if your own testing proves you actually need them.

TLDR: Less is genuinely more with GPT-5.6. Shorter prompts, clearer permission boundaries instead of repeated warnings, specific instructions instead of vague ones. Over-engineering your prompt is now more likely to hurt than help.

## III: New Features

Overview of all the new features shipped with GPT-5.6

1. Pro Mode
Pro Mode works with any GPT-5.6 model (Sol, Terra, or Luna) and any of its supported reasoning effort levels.

You don't switch to a separate "Pro" model; you just keep your existing model choice and add the Pro Mode setting on top of it.

2.    ChatGPT Work

ChatGPT Work is OpenAI's direct competitor to Claude Cowork.

Work mode is separate from the regular ChatGPT chat and is meant to automate real workflows in your industry.

![](https://pbs.twimg.com/media/HMz_hoEaAAEFWgo.jpg)

3.     GPT-Live

OpenAI's new advanced voice prompting.

More fluent conversations, live language translations & more

4.     New Reasoning Effort

GPT-5.6 now supports six reasoning effort levels:

None, Low, Medium, High, xHigh, and Max. The new one is max, sitting above xhigh for the most complex tasks.

You can change reasoning efforts directly in the model selector in ChatGPT.

5.     Hosted Sites

A new way to share ideas.

Sites is accessed through ChatGPT Work on the web, or through Work/Codex mode in the ChatGPT desktop app.

## IV: Optimal Prompting Framework for GPT-5.6

The exact framework to use for most prompts, combining everything from the sections above:

Step 1: Pick Your Model

GPT-5.6 comes in three tiers:

- Sol: Use for your hardest tasks
- Terra: Daily driver
- Luna: Fastest and most affordable - built for high-volume workloads
Step 2: Set Your Reasoning Effort

None/Low: Basic prompts

Medium: Default (for prompts involving things like MCP calls, API calls, etc.)

High or xHigh: Complex tasks

Max: Last resort (for extremely complex work)

Step 3: Decide If You Need Pro Mode

Separate from the reasoning effort.

Reserve it for tasks where a marginal gain in quality genuinely matters.

Step 4: Build the Prompt

Every high-quality GPT-5.6 prompt has four components:

1. Outcome: What does done actually look like
2. Constraints: Approval boundaries, what must not happen, scope
3. Evidence/success criteria: What proof or format confirms it's correct
4. Autonomy policy: What the model can do without asking first
Put together, it looks like this:

OPTIMAL PROMPT STRUCTURE

Step 5: Keep Things Short

Once you've built the prompt, cut it down and remove what isn't 100% necessary.

## V: Caveats with GPT-5.6

- Cache writes cost more now. Billed at 1.25x the uncached input rate.
- PTC isn't always the right call. Skip it when one call is sufficient.
- Pro Mode costs more. All the extra background work gets billed at standard token rates.
- Sites' deployment URLs are always production. No separate staging step by default. Save a version first if you want to review before going live.
- GPT-5.4 is being retired July 23. GPT-5.5 stays available. Best to migrate now rather than waiting.
- Old GPT-5.5 prompts may not transfer cleanly. Ask GPT-5.6 to rewrite your workflows so the new 5.6 models can work more efficiently.
## Closing

I hope you've found this GPT-5.6 masterclass helpful.

If you did, be sure to follow me here @aiedge_ - Every week, I post several guides covering the hottest topics in AI, and I have exciting GPT-5.6 content in the works.

If you enjoy AI content in a written format, feel free to subscribe to my free AI newsletter.

I genuinely believe it's the best AI newsletter in the game. Covering: AI news, real workflows I'm building, AI tips & more.

By joining, you also get free access to my AI assets library, where I post AI skills, prompts & more.

Subscribe and read the archive for free here:

https://newsletter.aiedgehq.co/

![](https://pbs.twimg.com/media/HM0E-BzaoAAgx4U.jpg)

100% free, no spam ever & unsub anytime
