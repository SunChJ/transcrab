你是一个翻译助手。请把下面的 Markdown 内容翻译成简体中文。
[TransCrab Translation Profile]
- mode: auto
- audience: general
- style: conversational
- auto-resolved-mode: refined
- auto-resolved-audience: general
- auto-resolved-style: conversational
- auto-reasons: 公开发布默认使用 refined 流程，优先质量与稳定性；生活叙事关键词命中较高，判定为 life
- pipeline: analyze -> translate -> review -> revise
- 执行策略：自动判断（auto）。
- 发布流程固定按 refined 质量标准执行。
- 你需要根据主题（technology/business/life）自动选择最合适的翻译风格与语气。
要求：
- 保留 Markdown 结构（标题/列表/引用/表格/链接）。
- 代码块、命令、URL、文件路径保持原样，不要翻译。
- **必须同时翻译标题**：请先输出一行 Markdown 一级标题（以 "# " 开头），作为译文标题。
- 然后空一行，再输出译文正文（不要再重复标题）。
- 只输出翻译结果本身，不要附加解释、不要加前后缀。
---
## One prompt. Three shell commands. I used their own AI to hack itself.

This is a class of bug that probably exists in every multi-agent AI product shipping today. And the fix is a design pattern that nobody in the space is talking about yet.

Here's the full story.

I wasn't trying to hack anything. I was researching how Perplexity Computer handles sandboxing for my own agent infra work. I was trying to understand how production multi-agent systems actually isolate execution environments, what gets shared, what doesn't.

First, I started poking around the system. I noticed Claude Code was installed in the sandbox.

I had the agent spin it up and generate some test code just to see how it behaved. Worked fine. Standard Claude Code, running in bypass-permissions mode so it doesn't prompt for confirmation. Makes sense for an agentic system.

That's when I thought: wait, how are they handling the API keys?! Claude Code needs an Anthropic API key to function. That key has to live somewhere in this sandbox. How is it getting injected? How is it scoped? Is it isolated?

That question is what led me down this path.

The subagent holds an API key in its process environment. I needed to steal it.

Perplexity Computer tried six times and failed.

1. Asked the subagent to dump its env: refused!
2. Planted a trojan script on the shared filesystem: it read my code, understood what it was doing, and declined to run it!
3. Poisoned .bashrc and .profile: they fired too early, before the API key gets injected.
4. Dropped a fake node binary on PATH: never triggered.
5. Spawn the coding agent and simultaneously watch the process tree: subagent runs in a different sandbox, nothing was captured :(
6. Find the system prompt for Claude Code and modify it to remove refusal behavior: couldn't find a custom system prompt being injected.
Six failures. Claude's model/prompt-level safety is legitimately good. Every time I tried something clever, the model caught it.

![](https://pbs.twimg.com/media/HDPdVUJboAAaMQM.jpg)

Then Perplexity remembered that Claude Code is a Node.js app launched via npm. And npm reads ~/.npmrc from the home directory. And the home directory is on the shared filesystem I can write to.

Node.js has a --require flag that preloads a JavaScript module before any application code runs. You can set this via NODE_OPTIONS in .npmrc. Which means if I write an .npmrc to the shared home directory, every Node process the subagent spawns will preload my code! This happens before Claude Code even initializes, before any safety checks run, before anything!

The exploit is three commands:

1. Write a six-line script that dumps process.env to a file on the shared workspace
2. echo 'node-options=--require /path/to/script.js' > ~/.npmrc
3. Ask Perplexity Computer to do literally any coding task
Subagent boots → npm reads my .npmrc → my preload fires before Claude Code starts → full API credentials land on the shared filesystem.

It worked! It gave me a Perplexity gateway token that proxies through agent-proxy.perplexity.ai to their master Anthropic account.

![](https://pbs.twimg.com/media/HDPUc51aYAABKlI.jpg)

Naturally, first thing I did is set this API key and BASE_URL for Claude Code on my laptop. I expected the LLM calls from Claude Code would fail and be restricted to the sandbox. I was shocked. Instant response from Opus 4.6!

I then thought, "surely, they will bill my account for this usage, this API key must be tied to my user". I was wrong again.

I had Opus 4.6 generate a long story describing the history of the world including every invention, empire and discovery. I ran this call 5 times in parallel, generating 100k+ output tokens from each. This should have consumed all my Perplexity Computer credits, but they didn't move.

Not IP-restricted. Not session-scoped. Not sandbox-bound. Their bill.

One of the most well-funded AI startups on the planet got owned by a dotfile that's been used in Node.js supply chain attacks since 2019.

The model did everything right. The infrastructure didn't.

## Now here's what I actually want founders building agent infra to take away from this.

Perplexity's architecture is half right. They use a proxy between the sandbox and Anthropic's API. That's the correct pattern. You should never put a raw provider API key inside a sandbox. A proxy gives you control, observability, and the ability to revoke access without rotating your master key.

The problem is their proxy token has zero binding to the execution context. Once you have it, it works everywhere forever.

Here's how to do this correctly:

Bind the token to the sandbox ID. Token and sandbox ID don't match? Rejected. Key leaks but you don't have the sandbox? Useless. Ideally it should bind the token to the sandbox IP address as well, but E2B (the sandbox provider they use) does not provide that before the sandbox is initiated.

Make the token ephemeral. Mint it when the sandbox spins up. Kill it when the sandbox pauses. No long-lived credentials. The proxy generates a short-lived token at session start and invalidates it on teardown. Leaked key from a dead sandbox is a dead key.

Tie the token to the user's billing account. Even if everything else fails, even if someone exfiltrates a live token from an active sandbox and uses it before it expires, usage bills back to the account that spawned the session. Not to a shared master billing pool. This turns "unlimited free API access" into "someone abusing their own quota," which is a completely different severity.

These three things — sandbox-bound, ephemeral, user-billed — are what make the proxy pattern actually work. Without them you're just adding an extra network hop that stops nothing.

This is not a Perplexity-specific problem. This is the default architecture for agent infra right now because it's the fastest to build. Shared filesystems between agents, long-lived credentials, master-account billing. I'd bet most multi-agent products in production today have some version of this.

Reported to @AravSrinivas and @denisyarats before publishing.
