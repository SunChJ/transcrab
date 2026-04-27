# 为什么、何时以及如何使用首次触点归因模型

**截至 2023 年 7 月 17 日，这篇博客文章带来了 0 美元收入。**

根据它发布距今的时间长短，这个数字要么可以看作是对内容营销那种不可预测且徒劳一面的注脚，要么也可以成为内容营销成功的一条绝佳证据。希望是后者。

因为这篇文章真的花了很久才写完！而且，虽然我写它的主要原因是希望你会读它、喜欢它，并从中学到有价值的东西……

但我也有那么一点点希望，在做完这些之后，你会试试 Hex，甚至某一天开始付钱给我们。

不过，如果我们无法精确计算有多少人是因为这篇博客而购买了 Hex，我们就无法回答任何营销活动中最重要的两个问题：“这值得吗？”以及“下一次我们应该做些什么不同的事？”

这篇博客会介绍我们在 Hex 高效构建首次触点营销归因模型的方式、为什么选择这种做法，以及你如何构建自己的模型。

## 营销归因到底是什么？

营销归因，是把促成客户转化的活动分配功劳的过程。你可以买到很多用于营销归因的工具和服务，但如果你想对方案拥有最大控制权，那么用 SQL 自己开发一套，可能就是正确的做法。

营销归因有很多不同方法，但大多数可以分成两类：单触点归因和多触点归因。在这两类之下，又有很多实际分配功劳的方式。

这里有几种常见方式：

* 首次触点归因：100% 的归因分配给第一个触点
* 末次触点归因：100% 的归因分配给最后一个触点
* 线性归因：归因在所有触点之间平均分配
* 加权多触点归因：归因在所有触点之间分配，但每个触点的权重不同

而且，不，[这不是假的](https://twitter.com/very_demanda/status/1377620755148636161?s=20)。虽然我承认，我们也算是某种程度上把它“发明”出来了。

## 我们为什么选择首次触点归因

归因是一个争议很大的话题，里面充满了各种火药味十足的观点。构建归因模型往往很容易变成一个巨大的时间黑洞，所以作为分析师，用手头资源优先追求 ***speed-to-value***（尽快产出价值）非常重要。

如果你要构建自己的归因模型，选择哪种归因方法，会取决于你当前的数据生态。多数归因模型中，有一个基础组成部分叫做 ***web sessions***（网页会话）。

* 网页会话表示用户与你的网站或应用交互的一段时间。
* 它通常由一系列页面浏览或其他行为来定义。

在 Hex，我们当时还没有开发出把网站流量转换为会话的模型。

于是流程走到了一个重要分岔口：我们需要决定，是不是要切换方向去构建会话模型，还是找到一种方式继续快速推进、提供价值。

所以我们决定采用首次触点模型。它符合我们对漏斗顶部的关注，也让我们能够快速提供一些价值，并洞察转化来源。

## 好，开始构建这个模型！

**1\. 将流量归类到渠道**

我们的网站流量来自很多来源，因此把流量分组到不同类别中很重要。通常可以结合 referrer 信息和 utm 属性来判断这些渠道。

这篇文章很好地概述了不同渠道类型：[https://support.similarweb.com/hc/en-us/articles/360000807449-Marketing-Channels](https://support.similarweb.com/hc/en-us/articles/360000807449-Marketing-Channels)

你最后很可能会在 ETL 流程中，针对每个渠道做类似这样的处理：

Copy

```
when utm_medium in ('social', 'social media')
	or (utm_medium is null		and (contains(referrer_host, 't.co')			or contains(referrer_host, 'twitter')		  or contains(referrer_host, 'linkedin')		  or contains(referrer_host, 'facebook')		 ) 	)then 'organic social'
```

**2\. 将用户与他们的流量匹配起来**

当流量已经被归类到渠道之后，我们需要能把用户和他们注册前的访问匹配起来。这个过程通常被称为 ***user stitching、identity stitching 或 member resolution***。这里我就称它为 user stitching（用户拼接）。

用户拼接，是在你知道某个用户身份之后，用用户数据丰富网站流量或用户行为的过程。

大多数现代公司都会使用某种事件追踪工具。这些工具通常会给每个唯一访客发放一个 UUID。对于已经转化的用户，我们内部也会有自己的 UUID。一旦发生转化事件，我们就可以把这些 UUID 互相映射起来。

我们把它做成了一个可供网页模型消费的模型，然后就可以使用这组配对，把用户匹配到他们注册之前的流量上。

Copy

```
select distinct  anonymous_id -- id from your event tracking tool  , hex_user_idfrom events
```

在构建网页模型的 SQL 中，我们随后可以 join 这个映射模型，创建一个新字段，之后在归因模型中使用。

`, coalesce(user_mapping.hex_user_id, page_view.anonymous_id) as individual_identifier`

现在，我们已经在所有 page views 上创建了一个叫做 `individual_identifier` 的字段。如果我们已经把某个用户和他的流量匹配上，这个字段就是该用户的 Hex user id。

完成这一步之后，你已经为首次触点归因打好了基础，剩下的就是驶向夕阳了。

**3\. 创建最终模型**

在 Hex 产品中，多个用户可以处在同一个 workspace 中，但在这个用例里，我们只想把分析范围限定在创建了新 workspace 的用户。我们可以通过获取每个 workspace 中的第一个用户来实现。

Copy

```
with workspace_creating_user as (	select 	  user_id		, user_created_at		, workspace_id	from users	qualify row_number() over(partition by workspace_id asc) = 1)
```

然后，我们可以用非常类似的方式获取某个用户的第一个页面浏览：

Copy

```
first_touch_page_view as (	select 		individual_identifier		, page_viewed_at		, cat_channel_group  from page_views	qualify row_number() over(partition by individual_identifier asc) = 1)
```

最后，把这两者 join 到一起，就能得到一个首次触点归因模型，用来量化最有影响力的客户来源。

Copy

```
select 	user_id	, user_created_at	, workspace_id	, page_viewed_at as first_touch_at	, cat_channel_group as first_touch_channelfrom workspace_creating_userjoin first_touch_page_view	on workspace_creating_user.user_id 		 = first_touch_page_view.individual_identifier
```

## 现在，是时候使用你的新模型了！

在我们的案例中，我们想知道大多数注册来自哪些渠道，也想建立一些报表，随时间监控这些变化。最快了解这一点的方法，是做一个类似“按首次触点渠道拆分的注册量随时间变化”的分析。

<figcaption>Attribution— signups chart</figcaption>

另一个很多人会衡量的指标，是不同渠道的 Conversion to Signup（转化为注册）。如果你在某个渠道投入了资金，但它并没有带来多少转化，那么可能就需要重新分配资源，把目标转向那些通常通过其他路径进入的用户。

转化率里有很多细微差别，人们并不总是会考虑到。我大概可以专门写一整篇文章讲这个。但眼下，最需要放在心上的，是分母规模以及转化所需时间。

一个简单可看的比率，是前向转化率。大概像这样：

<figcaption>Attribution blog— Conversion rate</figcaption>

在做前向转化时，我喜欢给这个故事加上时间边界。通常我会加上一些上下文，比如一条“30 天内转化率”的线。你仍然可以看到全周期转化率，但那些长尾非常长的转化很难预测，也很难据此行动。因此，30 天这个时间边界可以作为趋势的领先指标。

后向转化率也是另一种做转化分析的方式，不过这个就留到下次再说。

## 最后的想法

构建首次触点归因模型，可能不是分析师心中的传世杰作，但在你能构建更复杂模型之前，它也许正是最能服务利益相关方的临时方案。

总结一下：

* 如果你被要求构建一个营销归因模型，首先必须决定，在现有资源下你能构建哪种模型。
* 如果你最终选择首次触点归因，请记住：从没有模型到拥有一个可行动的模型，这已经是一次巨大的跃迁。
* 记住：你是离数据最近的人，你有责任在手头资源范围内，交付尽可能快地产生价值的最佳方案。
