---
title: Introducing GPT-5.3-Codex-Spark
date: '2026-08-05T05:43:26.721Z'
sourceUrl: 'https://openai.com/index/introducing-gpt-5-3-codex-spark/'
lang: source
---
*An ultra-fast model for real-time coding in Codex.*

Today, we’re releasing a research preview of GPT-5.3-Codex-Spark, a smaller version of GPT-5.3-Codex, and our first model designed for real-time coding. Codex-Spark marks the first milestone in our partnership with Cerebras, which [we announced in January](https://openai.com/index/cerebras-partnership/). Codex-Spark is optimized to feel near-instant when served on ultra-low latency hardware—delivering more than 1000 tokens per second while remaining highly capable for real-world coding tasks.

We’re sharing Codex-Spark on Cerebras as a research preview to ChatGPT Pro users so that developers can start experimenting early while we work with Cerebras to ramp up datacenter capacity, harden the end-to-end user experience, and deploy our larger frontier models.

Our latest frontier models have shown particular strengths in their ability to do long-running tasks, working autonomously for hours, days or weeks without intervention. Codex-Spark is our first model designed specifically for working with Codex in real-time—making targeted edits, reshaping logic, or refining interfaces and seeing results immediately. With Codex-Spark, Codex now supports both long-running, ambitious tasks and getting work done in the moment.

We hope to learn from how developers use it and incorporate feedback as we continue to expand access.

At launch, Codex-Spark has a 128k context window and is text-only. During the research preview, Codex-Spark will have its own rate limits and usage will not count towards standard rate limits. However, when demand is high, you may see limited access or temporary queuing as we balance reliability across users.

## Speed and intelligence

Codex-Spark is optimized for interactive work where latency matters as much as intelligence. You can collaborate with the model in real time, interrupting or redirecting it as it works, and rapidly iterate with near-instant responses. Because it’s tuned for speed, Codex-Spark keeps its default working style lightweight: it makes minimal, targeted edits and doesn’t automatically run tests unless you ask it to.

## Coding

Codex-Spark is a highly capable small model optimized for fast inference. On SWE-Bench Pro and Terminal-Bench 2.0, two benchmarks evaluating agentic software engineering capability, GPT-5.3-Codex-Spark demonstrates strong performance while accomplishing the tasks in a fraction of the time compared to GPT-5.3-Codex.

<figure><figcaption>SWE-Bench Pro: accuracy and estimated task duration by model and reasoning effort.</figcaption><table><thead><tr><th>Model</th><th>Reasoning effort</th><th>Accuracy</th><th>Task duration (minutes)</th></tr></thead><tbody><tr><td>GPT-5.3-Codex-Spark</td><td>low</td><td>47%</td><td>1.03</td></tr><tr><td>GPT-5.3-Codex-Spark</td><td>medium</td><td>49%</td><td>1.68</td></tr><tr><td>GPT-5.3-Codex-Spark</td><td>high</td><td>50%</td><td>2.05</td></tr><tr><td>GPT-5.3-Codex-Spark</td><td>xhigh</td><td>51%</td><td>2.29</td></tr><tr><td>GPT-5.3-Codex</td><td>low</td><td>51%</td><td>3.13</td></tr><tr><td>GPT-5.3-Codex</td><td>medium</td><td>53%</td><td>4.64</td></tr><tr><td>GPT-5.3-Codex</td><td>high</td><td>56%</td><td>8.88</td></tr><tr><td>GPT-5.3-Codex</td><td>xhigh</td><td>57%</td><td>16.29</td></tr><tr><td>GPT-5.1-Codex-mini</td><td>low</td><td>46%</td><td>4.61</td></tr><tr><td>GPT-5.1-Codex-mini</td><td>medium</td><td>48%</td><td>6.03</td></tr><tr><td>GPT-5.1-Codex-mini</td><td>high</td><td>49%</td><td>7.09</td></tr></tbody></table><p>Duration is estimated as the sum of (1) output generation time (output tokens ÷ sampling speed), (2) prefill time (prefill tokens ÷ prefill speed), (3) total tool execution time, and (4) total network overhead.</p></figure>

<figure><figcaption>Terminal-Bench 2.0 accuracy.</figcaption><table><thead><tr><th>Model</th><th>Accuracy</th></tr></thead><tbody><tr><td>GPT-5.3-Codex-Spark</td><td>58.4%</td></tr><tr><td>GPT-5.3-Codex</td><td>77.3%</td></tr><tr><td>GPT-5.1-Codex-mini</td><td>46.1%</td></tr></tbody></table></figure>

## Latency improvements for all models

As we trained Codex-Spark, it became apparent that model speed was just part of the equation for real-time collaboration—we also needed to reduce latency across the full request-response pipeline. We implemented end-to-end latency improvements in our harness that will benefit all models.

Under the hood, we streamlined how responses stream from client to server and back, rewrote key pieces of our inference stack, and reworked how sessions are initialized so that the first visible token appears sooner and Codex stays responsive as you iterate. Through the introduction of a persistent WebSocket connection and targeted optimizations inside of Responses API, we reduced overhead per client/server roundtrip by 80%, per-token overhead by 30%, and time-to-first-token by 50%.

The WebSocket path is enabled for Codex-Spark by default and will become the default for all models soon.

## Powered by Cerebras

Codex-Spark runs on Cerebras’ [Wafer Scale Engine 3](https://www.cerebras.ai/chip)—a purpose-built AI accelerator for high-speed inference giving Codex a latency-first serving tier. We partnered with Cerebras to add this low-latency path to the same production serving stack as the rest of our fleet, so it works seamlessly across Codex and sets us up to support future models.

> “What excites us most about GPT-5.3-Codex-Spark is partnering with OpenAI and the developer community to discover what fast inference makes possible—new interaction patterns, new use cases, and a fundamentally different model experience. This preview is just the beginning.”

— Sean Lie, CTO and Co-Founder of Cerebras

GPUs remain foundational across our training and inference pipelines and deliver the most cost effective tokens for broad usage. Cerebras complements that foundation by excelling at workflows that demand extremely low latency, tightening the end-to-end loop so Codex feels more responsive as you iterate. GPUs and Cerebras can be combined for single workloads to reach the best performance.

## Availability & details

Codex-Spark is rolling out today as a research preview for ChatGPT Pro users in the latest versions of the Codex app, CLI, and VS Code extension. Because it runs on specialized low-latency hardware, usage is governed by a separate rate limit that may adjust based on demand during the research preview. In addition, we are making Codex-Spark available in the API for a small set of design partners to understand how developers want to integrate Codex-Spark into their products.

We’ll expand access over the coming weeks as we continue tuning our integration under real workloads.

Codex-Spark is currently text-only at a 128k context window and is the first in a family of ultra-fast models. As we learn more with the developer community about where fast models shine for coding, we’ll introduce even more capabilities—including larger models, longer context lengths, and multimodal input.

Codex-Spark includes the same safety training as our mainline models, including cyber-relevant training. We evaluated Codex-Spark as part of our standard deployment process, which includes baseline evaluations for cyber and other capabilities, and determined that it does not have a plausible chance of reaching our Preparedness Framework threshold for high capability in cybersecurity or biology.

## What’s next

Codex-Spark is the first step toward a Codex with two complementary modes: longer-horizon reasoning and execution, and real-time collaboration for rapid iteration. Over time, the modes will blend—Codex can keep you in a tight interactive loop while delegating longer-running work to sub-agents in the background, or fanning out tasks to many models in parallel when you want breadth and speed, so you don’t have to choose a single mode up front.

As models become more capable, interaction speed becomes a clear bottleneck. Ultra-fast inference tightens that loop, making Codex feel more natural to use and expanding what’s possible for anyone turning an idea into working software.
