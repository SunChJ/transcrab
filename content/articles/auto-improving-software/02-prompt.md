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
- 若正文中出现形如 @@FIGURE_SVG_001@@ 的占位符，必须原样保留（不要改写、不要删除、不要移动）。
- **必须同时翻译标题**：请先输出一行 Markdown 一级标题（以 "# " 开头），作为译文标题。
- 然后空一行，再输出译文正文（不要再重复标题）。
- 只输出翻译结果本身，不要附加解释、不要加前后缀。
---
Coding agents have changed how we build software. Now they're changing how we improve it. Today I'll share an agent platform that coding agents build, run, and improve on their own.

The entire agent development lifecycle is covered by five prompts:

- Create. Scaffolds a new agent.
- Improve. Hardens an existing agent against its own spec.
- Extend. Adds new capabilities to an existing agent.
- Hill Climb. Runs the eval suite, diagnoses failures, fixes what's in scope.
- Review. Sweeps the repo for drift between docs, code, and config.
The "Improve → Hill Climb" loop recursively improves my agents with minimal oversight. It's hard to imagine doing this manually.

FYI, this auto-improvement loop is only possible because the environment is designed for it. Agent code, traces, logs, eval suite, and the live software all live in one place so a coding agent can rip end-to-end.

It works because we control the stack

Most software can't auto-improve because its inputs and outputs are scattered across tools. To run the auto-improvement loop, a coding agent has to piece together data from three different tools, each behind its own auth, with its own way of doing things.

Theoretically possible. In practice, too much friction.

My codebase is specifically designed for auto-improvement. For example, claude code can test an agent, then PASS or FAIL by reading the sessions, traces, and logs. If the agent fails, it edits the agent and runs it again.

Three things make this possible:

1. Every action is exposed as an API. Running an agent, reading a session, running an eval. Every key action can be run using cURL or bash.
2. Data is colocated. Sessions and traces live in our Postgres database. A coding agent can trigger a run and read what came out without leaving its environment.
3. Logs over everything. The entire platform runs locally on Docker. The coding agent reads live logs and makes updates as needed. The test → review loop is ~5s. Logs are the real-time feedback loop that unlocks everything.
Agent platforms are the first category of software where the actions, data, and the iteration tool all sit close enough that a coding agent can test end-to-end, make code changes, and test again until the agent improves. Meaning the platform that hosts the loop is the first thing the loop improves.

Agent Development Lifecycle

Next I'll show you how Claude Code runs my agent platform.

## 1. Create an agent

To create a new agent, I open Claude Code and type:

Run create-new-agent.md in a new branch.

Claude starts by asking a few questions about what the agent should do, which tools it needs. It then searches the Agno docs via MCP for the right toolkit, generates the agent file, registers it in app/main.py, restarts the container, and smoke-tests via cURL. 5-10 minutes from prompt to agent.

Because the platform takes care of everything, I'm building agents I never would have bothered with before. An agent that summarizes overnight Slack messages, an agent that drafts my weekly update, an agent that highlights important issues in the repo. None of these would have survived a multi-day project. All of them fit into a coffee break.

## 2. Improve an agent

To improve an existing agent, I type:

Run improve-agent.md on code-search agent.

Claude reads the agent's INSTRUCTIONS and derives 8-12 probes from them. Some golden-path. Some edge cases. Some tool-selection. A couple of adversarial ones thrown in: prompt injections, malformed input, attempts to pull the agent off-purpose.

It runs each probe against the live container via cURL. Reads the response. Reads the tool calls from the container logs. Judges PASS or FAIL against what the INSTRUCTIONS actually promise.

For every failure it picks a lever. Tighten a rule. Add a rule. Swap a tool. Bump num_history_runs. Whatever fits the failure mode. It edits agents/<slug>.py, hot-reloads, and re-runs only the probes that failed.

Then it iterates. Capped at five rounds. Stops earlier if everything passes.

Zero input from me beyond kicking off the task. This used to take a day of manually clicking things around and now its fully automated.

## 3. Extend an agent

To add capabilities to an existing agent, I type:

Run extend-agent.md on code-search agent.

Extend runs with me in the driver's seat. I describe a change: add a tool, refine a prompt, fix a bug. Claude executes. The Agno docs MCP is loaded so toolkit research is grounded in the real API.

Claude makes the changes. Runs smoke-tests. Each iteration is one small, verified step. Changes stay surgical and get tested in isolation.

## 4. Hill Climb

Over time we collect a lot of evals, and it would be a shame to fix failures manually. I simply type:

Run eval-and-improve.md.

Hill Climb runs the eval suite, diagnoses every failure, and fixes what's in scope. Failure types map to fix locations: missing rule in INSTRUCTIONS, hallucination, wrong tool fired, overspecified rubric. For each failure Claude picks the right lever, edits, and re-runs only the failing case. Once everything is green it re-runs the full suite to catch regressions.

The eval suite is two files. evals/cases.py declares the cases. Each case is one input plus a rubric (what a correct response looks like) and optionally an expected tool call. Built on Agno's AgentAsJudgeEval and ReliabilityEval.

Improve catches out-of-distribution failures. Hill Climb makes sure in-distribution cases continue to pass. The two work very well together.

## 5. Review

Because the repo is managed primarily by coding agents, it moves fast. To bring everything up to speed, I type:

Run review-and-improve.md.

Claude sweeps the whole repo for drift between docs, code, and config. Every agent file on disk should be registered in app/main.py. Every env var the code reads should be in example.env and the AGENTS.md. Every path in a markdown doc should still exist. Every script should do what's claimed.

Mechanical drift gets auto-fixed in place: a renamed file, a missing entry in example.env, a new agent missing from the architecture diagram. Anything bigger gets flagged with a recommended next step.

Best run before a release or after a refactor. The kind of work that's tedious for a human and trivial for a coding agent that can read every file in the repo.

Drift between docs and code has always been a tax on production software. Now it costs nothing.

Why Agent Platforms?

Agent platforms are the perfect testing ground for this pattern.

1. Greenfield. Agent platforms are relatively new and can be designed for coding agents from the get go.
2. Workflow is clear. We know how to improve an agent: run it, read the logs, grade the response, edit, run again.
3. The loop is actually useful. For regular software, optimizing an API endpoint doesn't really make sense. For agents, each round of improvement is real, measurable, and adds value.
Set the platform up right and you can build any agent on top of it: use the create workflow to go from idea to agent, the improve workflow to harden the agent, the extend workflow to add new capabilities, lock them up using evals and then hill-climb against them.

Keep the entire repo in sync using the review-and-improve workflow.

It's almost impossible to do this by hand.

My Auto Improving Agent Platform

Here's a link to my auto-improving agent platform: [agent-platform-railway](https://github.com/agno-agi/agent-platform-railway).

It's a starter codebase for an agent platform you can run locally using docker or on Railway. The prompts are in the docs/ folder. Clone, configure, and you're running agents in 10 minutes.

Follow the [README](https://github.com/agno-agi/agent-platform-railway) for the full setup guide, and [Agno Docs](https://docs.agno.com/) for reference.

Auto-improving software

I've been running this loop for a few weeks and it continues to surprise me.

Agent instructions tightened by half a sentence. A docstring brought in sync with code. The platform is a little cleaner every time I run it.

I can see a world where all software works like this. A coding agent managing your platform end-to-end, fixing things small enough you'd never have prioritized them. Thanks for reading!

Ashpreet

Built with 🧡 using[ Agn](https://github.com/agno-agi/agno)o.
