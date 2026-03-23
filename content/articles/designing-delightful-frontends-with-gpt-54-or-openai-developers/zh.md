---
title: GPT-5.4 前端设计指南
date: '2026-03-23T01:58:35.808Z'
sourceUrl: 'https://developers.openai.com/blog/designing-delightful-frontends-with-gpt-5-4'
lang: zh
---
GPT-5.4 比其前代产品更擅长 Web 开发——能生成更具视觉吸引力和更具野心的前端。值得注意的是，我们在训练 GPT-5.4 时重点加强了 UI 能力和图像使用。在正确的引导下，该模型可以生成生产就绪的前端，其中包含细腻的笔触、精心设计的交互和精美的图像。

Web 设计产出的结果涵盖了极广的范畴。优秀的设计在克制与创新之间取得平衡——既借鉴经受住时间考验的模式，又引入新颖的元素。GPT-5.4 已经学习了这种广泛的设计方法，并理解构建网站的多种不同方式。

当提示词（Prompts）描述不足时，模型通常会退回到训练数据中高频出现的模式。其中一些是经过验证的规范，但许多只是我们想要避免的、过度代表的习惯。其结果通常是合理且功能性的，但可能会趋向于平庸的结构、薄弱的视觉层级，以及未能达到我们脑海中所构思的设计选择。

本指南解释了引导 GPT-5.4 打造你愿景中设计的实用技巧。

 Your browser does not support the video tag.

## 模型改进

虽然 GPT-5.4 在[多个维度](https://openai.com/index/introducing-gpt-5-4/)上都有提升，但对于前端工作，我们专注于三个实际的收益：

*   在整个设计过程中具有更强的图像理解能力
*   生成的应用程序和网站在功能上更完整
*   更好地使用工具来检查、测试和验证其自身的工作

### 图像理解与工具使用

GPT-5.4 经过训练，可以原生使用图像搜索和图像生成工具，使其能够将视觉推理直接纳入设计过程。为了获得最佳效果，请指示模型在选择最终资产之前，先生成情绪板（Mood board）或几个视觉选项。

你可以通过明确描述图像应捕获的属性（例如风格、色调、构图或氛围）来引导模型参考高质量的视觉素材。你还应该在提示词中加入指令，引导模型重复使用先前生成的图像、调用图像生成工具创建新视觉效果，或在需要时引用特定的外部图像。

```
Default to using any uploaded/pre-generated images. Otherwise use the image generation tool to create visually stunning image artifacts. Do not reference or link to web images unless the user explicitly asks for them.
```

### 功能改进

该模型经过训练，可以开发更完整、功能更稳健的应用。预计该模型在长程任务中会更加可靠。你以前认为不可能实现的视频游戏和复杂的交互体验，现在只需一两次对话即可成真。

### 计算机使用能力与验证

GPT-5.4 是我们第一个针对计算机使用能力（Computer Use）进行训练的主线模型。它可以原生导航界面，结合 Playwright 等工具，它可以反复检查自己的工作、验证行为并完善实现——从而实现更长、更自主的开发工作流。

观看我们的[发布视频](https://openai.com/index/introducing-gpt-5-4/?video=1170427106%20)以查看这些能力的实际应用。

Playwright 对于前端开发特别有价值。它允许模型检查渲染后的页面、测试多个视口、导航应用流，并检测状态或导航问题。提供 Playwright 工具或技能可以显著提高 GPT-5.4 生成精致、功能完整界面的可能性。凭借改进的图像理解，它还为模型提供了一种视觉验证其工作的方法，并检查其是否与提供的参考 UI 相匹配。

## 实用技巧快速入门

如果你只打算采用本文档中的少数实践，请从以下几点开始：

1.  开始时选择较低的推理强度（Reasoning level）。
2.  预先定义你的设计系统和约束（即字体、色调、布局）。
3.  提供视觉参考或情绪板（即附加屏幕截图），为模型提供视觉护栏。
4.  预先定义叙事或内容策略，以指导模型的内容创作。

这是一个入门提示词。

```
## Frontend tasks

When doing frontend design tasks, avoid generic, overbuilt layouts.

**Use these hard rules:**
- One composition: The first viewport must read as one composition, not a dashboard (unless it's a dashboard).
- Brand first: On branded pages, the brand or product name must be a hero-level signal, not just nav text or an eyebrow. No headline should overpower the brand.
- Brand test: If the first viewport could belong to another brand after removing the nav, the branding is too weak.
- Typography: Use expressive, purposeful fonts and avoid default stacks (Inter, Roboto, Arial, system).
- Background: Don't rely on flat, single-color backgrounds; use gradients, images, or subtle patterns to build atmosphere.
- Full-bleed hero only: On landing pages and promotional surfaces, the hero image should be a dominant edge-to-edge visual plane or background by default. Do not use inset hero images, side-panel hero images, rounded media cards, tiled collages, or floating image blocks unless the existing design system clearly requires it.
- Hero budget: The first viewport should usually contain only the brand, one headline, one short supporting sentence, one CTA group, and one dominant image. Do not place stats, schedules, event listings, address blocks, promos, "this week" callouts, metadata rows, or secondary marketing content in the first viewport.
- No hero overlays: Do not place detached labels, floating badges, promo stickers, info chips, or callout boxes on top of hero media.
- Cards: Default: no cards. Never use cards in the hero. Cards are allowed only when they are the container for a user interaction. If removing a border, shadow, background, or radius does not hurt interaction or understanding, it should not be a card.
- One job per section: Each section should have one purpose, one headline, and usually one short supporting sentence.
- Real visual anchor: Imagery should show the product, place, atmosphere, or context. Decorative gradients and abstract backgrounds do not count as the main visual idea.
- Reduce clutter: Avoid pill clusters, stat strips, icon rows, boxed promos, schedule snippets, and multiple competing text blocks.
- Use motion to create presence and hierarchy, not noise. Ship at least 2-3 intentional motions for visually led work.
- Color & Look: Choose a clear visual direction; define CSS variables; avoid purple-on-white defaults. No purple bias or dark mode bias.
- Ensure the page loads properly on both desktop and mobile.
- For React code, prefer modern patterns including useEffectEvent, startTransition, and useDeferredValue when appropriate if used by the team. Do not add useMemo/useCallback by default unless already used; follow the repo's React Compiler guidance.

Exception: If working within an existing website or design system, preserve the established patterns, structure, and visual language.
```

## 实现更好设计的技术

### 从设计原则开始

定义约束，例如一个 H1 标题、不超过六个部分、最多两种字体、一种强调色，以及一个首屏以上的核心 CTA。

### 提供视觉参考

参考截图或情绪板可以帮助模型推断布局节奏、字体比例、间距系统和图像处理方式。下面是 GPT-5.4 生成自己的情绪板供用户审阅的示例。

![Example mood board used to guide GPT-5.4 toward a cohesive visual direction](https://cdn.openai.com/devhub/blog/codex_moodboard.png)

*受纽约咖啡文化和 Y2K 美学启发，在 Codex 中使用 GPT-5.4 创建的情绪板*

### 将页面结构化为叙事

典型的营销页面结构：

1.  首屏 (Hero) —— 建立身份和承诺
2.  辅助图像 —— 展示场景或环境
3.  产品细节 —— 解释产品价值
4.  社会证明 —— 建立公信力
5.  最终 CTA —— 将兴趣转化为行动

### 指示遵循设计系统

鼓励模型在构建早期建立清晰的设计系统。定义核心设计令牌（Tokens），如 `background`、`surface`、`primary text`、`muted text` 和 `accent`，以及字体的角色，如 `display`、`headline`、`body` 和 `caption`。这种结构有助于模型在整个应用中生成一致且可扩展的 UI 模式。

对于大多数 Web 项目，从熟悉的栈开始（如 **React 和 Tailwind**）效果很好。GPT-5.4 在使用这些工具时表现尤为强劲，从而更容易快速迭代并获得精致的结果。

动效和分层 UI 元素可能会引入复杂性，特别是当固定或悬浮组件与主要内容交互时。在处理动画、遮罩或装饰层时，加入鼓励安全布局行为的引导会很有帮助。例如：

```
Keep fixed or floating UI elements from overlapping text, buttons, or other key content across screen sizes. Place them in safe areas, behind primary content where appropriate, and maintain sufficient spacing.
```

### 降低推理强度

对于较简单的网站，推理并非越多越好。在实践中，**低和中等推理强度通常会带来更强大的前端效果**，帮助模型保持快速、专注且不易过度思考，同时仍为更具野心的设计留出调高推理强度的空间。

### 将设计扎根于真实内容

为模型提供真实的文案、产品背景或清晰的项目目标，是改进前端结果最简单的方法之一。这些背景信息有助于它选择正确的站点结构，塑造更清晰的章节级叙事，并编写更具可信度的消息，而不是退回到平庸的占位符模式。

## 使用 Frontend Skill 整合一切

为了帮助人们在通用前端任务中充分利用 GPT-5.4，我们还准备了一个专门的 [`frontend-skill`](https://github.com/openai/skills/tree/main/skills/.curated/frontend-skill)，你可以在下面找到。它为模型提供了关于结构、品味和交互模式的更强引导，帮助它开箱即用地生成更精致、更有针对性且令人愉悦的设计。

Frontend Skill

```
---
name: frontend-skill
description: Use when the task asks for a visually strong landing page, website, app, prototype, demo, or game UI. This skill enforces restrained composition, image-led hierarchy, cohesive content structure, and tasteful motion while avoiding generic cards, weak branding, and UI clutter.
---

# Frontend skill

Use this skill when the quality of the work depends on art direction, hierarchy, restraint, imagery, and motion rather than component count.

Goal: ship interfaces that feel deliberate, premium, and current. Default toward award-level composition: one big idea, strong imagery, sparse copy, rigorous spacing, and a small number of memorable motions.

## Working Model

Before building, write three things:

- visual thesis: one sentence describing mood, material, and energy
- content plan: hero, support, detail, final CTA
- interaction thesis: 2-3 motion ideas that change the feel of the page

Each section gets one job, one dominant visual idea, and one primary takeaway or action.

## Beautiful Defaults

- Start with composition, not components.
- Prefer a full-bleed hero or full-canvas visual anchor.
- Make the brand or product name the loudest text.
- Keep copy short enough to scan in seconds.
- Use whitespace, alignment, scale, cropping, and contrast before adding chrome.
- Limit the system: two typefaces max, one accent color by default.
- Default to cardless layouts. Use sections, columns, dividers, lists, and media blocks instead.
- Treat the first viewport as a poster, not a document.

## Landing Pages

Default sequence:

1. Hero: brand or product, promise, CTA, and one dominant visual
2. Support: one concrete feature, offer, or proof point
3. Detail: atmosphere, workflow, product depth, or story
4. Final CTA: convert, start, visit, or contact

Hero rules:

- One composition only.
- Full-bleed image or dominant visual plane.
- Canonical full-bleed rule: on branded landing pages, the hero itself must run edge-to-edge with no inherited page gutters, framed container, or shared max-width; constrain only the inner text/action column.
- Brand first, headline second, body third, CTA fourth.
- No hero cards, stat strips, logo clouds, pill soup, or floating dashboards by default.
- Keep headlines to roughly 2-3 lines on desktop and readable in one glance on mobile.
- Keep the text column narrow and anchored to a calm area of the image.
- All text over imagery must maintain strong contrast and clear tap targets.

If the first viewport still works after removing the image, the image is too weak. If the brand disappears after hiding the nav, the hierarchy is too weak.

Viewport budget:

- If the first screen includes a sticky/fixed header, that header counts against the hero. The combined header + hero content must fit within the initial viewport at common desktop and mobile sizes.
- When using `100vh`/`100svh` heroes, subtract persistent UI chrome (`calc(100svh - header-height)`) or overlay the header instead of stacking it in normal flow.

## Apps

Default to Linear-style restraint:

- calm surface hierarchy
- strong typography and spacing
- few colors
- dense but readable information
- minimal chrome
- cards only when the card is the interaction

For app UI, organize around:

- primary workspace
- navigation
- secondary context or inspector
- one clear accent for action or state

Avoid:

- dashboard-card mosaics
- thick borders on every region
- decorative gradients behind routine product UI
- multiple competing accent colors
- ornamental icons that do not improve scanning

If a panel can become plain layout without losing meaning, remove the card treatment.

## Imagery

Imagery must do narrative work.

- Use at least one strong, real-looking image for brands, venues, editorial pages, and lifestyle products.
- Prefer in-situ photography over abstract gradients or fake 3D objects.
- Choose or crop images with a stable tonal area for text.
- Do not use images with embedded signage, logos, or typographic clutter fighting the UI.
- Do not generate images with built-in UI frames, splits, cards, or panels.
- If multiple moments are needed, use multiple images, not one collage.

The first viewport needs a real visual anchor. Decorative texture is not enough.

## Copy

- Write in product language, not design commentary.
- Let the headline carry the meaning.
- Supporting copy should usually be one short sentence.
- Cut repetition between sections.
- do not include prompt language or design commentary into the UI
- Give every section one responsibility: explain, prove, deepen, or convert.

If deleting 30 percent of the copy improves the page, keep deleting.

## Utility Copy For Product UI

When the work is a dashboard, app surface, admin tool, or operational workspace, default to utility copy over marketing copy.

- Prioritize orientation, status, and action over promise, mood, or brand voice.
- Start with the working surface itself: KPIs, charts, filters, tables, status, or task context. Do not introduce a hero section unless the user explicitly asks for one.
- Section headings should say what the area is or what the user can do there.
- Good: "Selected KPIs", "Plan status", "Search metrics", "Top segments", "Last sync".
- Avoid aspirational hero lines, metaphors, campaign-style language, and executive-summary banners on product surfaces unless specifically requested.
- Supporting text should explain scope, behavior, freshness, or decision value in one sentence.
- If a sentence could appear in a homepage hero or ad, rewrite it until it sounds like product UI.
- If a section does not help someone operate, monitor, or decide, remove it.
- Litmus check: if an operator scans only headings, labels, and numbers, can they understand the page immediately?

## Motion

Use motion to create presence and hierarchy, not noise.

Ship at least 2-3 intentional motions for visually led work:

- one entrance sequence in the hero
- one scroll-linked, sticky, or depth effect
- one hover, reveal, or layout transition that sharpens affordance

Prefer Framer Motion when available for:

- section reveals
- shared layout transitions
- scroll-linked opacity, translate, or scale shifts
- sticky storytelling
- carousels that advance narrative, not just fill space
- menus, drawers, and modal presence effects

Motion rules:

- noticeable in a quick recording
- smooth on mobile
- fast and restrained
- consistent across the page
- removed if ornamental only

## Hard Rules

- No cards by default.
- No hero cards by default.
- No boxed or center-column hero when the brief calls for full bleed.
- No more than one dominant idea per section.
- No section should need many tiny UI devices to explain itself.
- No headline should overpower the brand on branded pages.
- No filler copy.
- No split-screen hero unless text sits on a calm, unified side.
- No more than two typefaces without a clear reason.
- No more than one accent color unless the product already has a strong system.

## Reject These Failures

- Generic SaaS card grid as the first impression
- Beautiful image with weak brand presence
- Strong headline with no clear action
- Busy imagery behind text
- Sections that repeat the same mood statement
- Carousel with no narrative purpose
- App UI made of stacked cards instead of layout

## Litmus Checks

- Is the brand or product unmistakable in the first screen?
- Is there one strong visual anchor?
- Can the page be understood by scanning headlines only?
- Does each section have one job?
- Are cards actually necessary?
- Does motion improve hierarchy or atmosphere?
- Would the design still feel premium if all decorative shadows were removed?
```

通过在 Codex 应用内运行以下命令来安装 `frontend-skill`：

```
$skill-installer frontend-skill
```

以下是在 Frontend Design 技能帮助下生成的一些示例网站。

### 落地页 (Landing Pages)

### 游戏 (Games)

### 仪表盘 (Dashboards)

## 核心要点

当提示词提供清晰的设计约束、视觉参考、结构化叙事和定义的设计系统时，GPT-5.4 能够生成高质量的前端界面。

我们希望这些技术能帮助你构建更具特色、设计更精良的应用。

如果你想分享一个完全由 GPT-5.4 和诸如 [Codex](http://developers.openai.com/codex) 等编码代理生成的项目，请提交你的应用到我们的 [画廊 (Showcase)](http://developers.openai.com/showcase) 中展示。
