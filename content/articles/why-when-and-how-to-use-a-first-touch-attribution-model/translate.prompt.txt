你是一个翻译助手。请把下面的 Markdown 内容翻译成简体中文。
[TransCrab Translation Profile]
- mode: auto
- audience: technical
- style: technical
- auto-resolved-mode: refined
- auto-resolved-audience: technical
- auto-resolved-style: technical
- auto-reasons: 公开发布默认使用 refined 流程，优先质量与稳定性；检测到代码块或表格，判定为技术主题
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
**This blog post has made $0 (as of 7/17/23).**

Depending on how long ago it was published, that figure should serve as either commentary on the unpredictable futility of content marketing, or as an incredible proof point of the success of content marketing. Hopefully the latter.

Because this took a long time to write! And even though I *mostly* wrote it because I hope that you will read it, enjoy it, and learn something valuable from it…

I also *sort of* wrote it because I hope that after doing all that, you might try out Hex, and maybe some day even start paying us some money.

But without the ability to calculate exactly how many people paid for Hex as a result of this blog, we cannot answer the two most important questions to ask of any marketing activity: “Was it worth it?” and “What should we do differently next time?”

This blog post details the efficient way we built a first-touch marketing attribution model at Hex, why we decided to do it this way, and how you can build your own.

## What even is marketing attribution?

Marketing attribution is the process of assigning credit to the activities that drive a customer to convert. There are lots of tools and services you can purchase to do marketing attribution, but if you want the most control over the solution, developing one on your own with SQL is probably the right approach.

There are many different ways to do marketing attribution, but most of them fall into two different categories; single touch and multi touch attribution. Within those two categories, there are many different ways to actually attribute credit in your model.

Here are a few common ways:

*   First-touch attribution - 100% of the attribution goes to the first touch
*   Last-touch attribution - 100% of the attribution goes to the last touch
*   Linear attribution - The attribution is split evenly between all touches
*   Weighted multi-touch attribution - The attribution is split between all the touches, but each touch is weighted differently.

And no, [it’s not fake](https://twitter.com/very_demanda/status/1377620755148636161?s=20). Although I suppose we did kind of just make it up.

## How we landed on first-touch attribution

Attribution is a highly debated topic, filled with many spicy takes. Often times building an attribution model can turn into a huge time sink, so as an analyst it is very important to prioritize ***speed-to-value*** with your resources.

If you are building your own attribution model, the method of attribution you choose will be dictated by your current data ecosystem. One of the foundational pieces to most of those attribution models is something called ***web sessions***.

*   Web sessions represent a period in time, that a user interacts with your web site or app.
*   They are typically defined by a series of page views or other actions.

At Hex, we had not developed a model that turned our web traffic into sessions.

That brought us to an important inflection point in the process. We needed to decide if we were going to shift gears and build a sessions model, or find a way to continue to move quickly to provide value.

So we decided to go with a first-touch model. It aligned with our top-of-funnel focus, and allowed us to quickly provide some value and insight into where our conversions are coming.

## Okay, let’s build that model!

**1\. Categorize traffic into channels**

Our site traffic comes from many sources, so it is important to group traffic into categories. This is done by using a combination of referrer information and utm attributes to determine these channels.

This article has a great overview of the different types of channels [https://support.similarweb.com/hc/en-us/articles/360000807449-Marketing-Channels](https://support.similarweb.com/hc/en-us/articles/360000807449-Marketing-Channels)

You will likely end up doing something like this in your ETL process for each of channel:

Copy

```
when utm_medium in ('social', 'social media')	or (utm_medium is null		and (contains(referrer_host, 't.co')			or contains(referrer_host, 'twitter')		  or contains(referrer_host, 'linkedin')		  or contains(referrer_host, 'facebook')		 ) 	)then 'organic social'
```

**2\. Match users to their traffic**

Once our traffic is categorized into channels, we need to be able to match users to their pre-signup visits. This process is commonly referred to as ***user stitching, identity stitching or member resolution.*** I will just refer to it as user stitching.

User stitching is the process of enriching your web traffic or user actions with user data once you know the identity of that user.

Most modern companies have a tool they use for event tracking. Those tools typically issue a UUID for each unique visitor. For converted users, we have our own internal UUID as well. Once a conversion event happens, we can map those UUIDs to each other.

We turned this into a model that can be consumed by our web page models, and we can then use this pairing to match a user to their traffic that predates their signups

Copy

```
select distinct  anonymous_id -- id from your event tracking tool  , hex_user_idfrom events
```

In the SQL that builds our web page models, we can then join in this mapping model to create a new field that we can later use in the attribution model.

`, coalesce(user_mapping.hex_user_id, page_view.anonymous_id) as individual_identifier`

We have now created this field called `individual_identifier` on all of our page views that will be a users Hex user id if we have matched them with their traffic.

Once you have done this you have laid the ground work for your first-touch attribution, and all that’s left is driving off into the sunset

**3\. Create the final model**

In the Hex product, multiple users can be in the same workspace, but for this use case we want to limit our analysis to just users who created a new workspace. We can do this by getting the first user in each workspace.

Copy

```
with workspace_creating_user as (	select 	  user_id		, user_created_at		, workspace_id	from users	qualify row_number() over(partition by workspace_id asc) = 1)
```

Then, we can do something very similar to get the first page view for a user,

Copy

```
first_touch_page_view as (	select 		individual_identifier		, page_viewed_at		, cat_channel_group  from page_views	qualify row_number() over(partition by individual_identifier asc) = 1)
```

Finally we can join these two together, and that will give us a first-touch attribution model that we can use to quantify the most impactful sources of our customers

Copy

```
select 	user_id	, user_created_at	, workspace_id	, page_viewed_at as first_touch_at	, cat_channel_group as first_touch_channelfrom workspace_creating_userjoin first_touch_page_view	on workspace_creating_user.user_id 		 = first_touch_page_view.individual_identifier
```

## Now it is time to put your new model to use!

In our case, we wanted to know which channels most of our signups were coming from, and we also wanted to set up some reporting to monitor that over time. The quickest way to get an idea of this is by doing something like signups over time by first-touch channel.

<figcaption>Attribution— signups chart</figcaption>

Another metric that many people measure is Conversion to Signup by these different channels. If you are sinking money into one channel, but it is not resulting in many conversions, resources may need to be reallocated to target users who typically come in through a different flow

There can be a lot of nuance in conversion rates that people don’t always consider. I could probably write an entire article about that. But for now some things to keep top of mind are the volumes of your denominators and time to conversion.

One simple rate to look at is a forward looking conversion rate. Something like this:

<figcaption>Attribution blog— Conversion rate</figcaption>

When doing forward looking conversions, I like to time bound that story. I do this typically by adding some context like a “Conversion Rate in 30 Days” line. You can still see the all time conversion rate, but conversions that have really long tails are hard to predict and action against. So the 30 day time bound serves as a leading indicator of the trend.

Backwards looking conversion rates are another way to do conversion, but I will save that for another day.

## Final thoughts

Building a first-touch attribution model is not something an analyst would likely consider their magnum opus, but it may be what best serves your stakeholders in the interim until you can build a more sophisticated model.

To recap:

*   If you are asked to build a marketing attribution model, you first have to decide which type of model you can build with the resources you have.
*   If you do settle on first-touch attribution, remember this is a huge leap from nothing to something very actionable.
*   Remember; you are the one closest to the data, and it is your responsibility to deliver the best speed-to-value solution you can with the resources you have.
