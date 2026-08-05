# 发布 Cloudflare Wallets：面向智能体互联网的可编程钱包

如今，AI 智能体想要试用新的 API 并不容易。它们往往必须先应付为人类而非智能体设计的登录页面，再联系人工添加支付方式、生成 API 密钥，最后还要弄清楚如何调用 API。

这一流程对智能体来说格外困难，原因有二：智能体没有可用于注册 API 的稳定标识，也没有原生的 API 支付方式。由于缺少这两项能力，它们往往难以顺利接入软件，限制了智能体商业的发展。AI 智能体常常干脆放弃这些任务，把注册、添加支付方式和生成 API 密钥重新交还给人类。这使智能体很难试用并比较大量 API。

为解决这一问题，我们推出了 Cloudflare Wallets。从今天起，你可以为自己的账户[申领 Cloudflare Wallet 钱包标识](https://cloudflare.pay/)，获得一个唯一用户名，从而更好地与商家建立联系。不久之后，你将能设置并使用 Cloudflare Wallet 来支付 API 和内容费用。

本月早些时候，我们发布了 [Monetization Gateway](https://blog.cloudflare.com/monetization-gateway/)，帮助 Cloudflare 客户通过自己的网站和应用获得收入。Monetization Gateway 将支持使用 [x402 协议](https://www.x402.org/)进行小额支付，该协议可以把付款附加到 HTTP 请求上。这些小额支付可以覆盖从 AI 推理、数据到内容等多种用途。如果你想为 Monetization Gateway 背后的服务及其他[兼容 x402 的端点](https://developers.cloudflare.com/agents/tools/payments/x402/)付款或收款，就需要一个钱包。

Cloudflare Wallets 将让你能够存储稳定币、购买服务，并在整个 Web 上接收资金。每个拥有钱包的账户还可以为其智能体创建 Virtual Wallets，让它们购买 API、MCP Tools、内容等。你可以为 Virtual Wallets 设置约束规则（例如额度、允许列表和单笔交易上限），帮助智能体安全地使用你账户中的资金。这样一来，智能体便能以较低的操作阻力、在风险可控的前提下试用众多 API。钱包用户也可以选择分享自己的 Cloudflare Wallet 钱包标识，在与商家互动时获得稳定身份。

## 构建双边智能体市场

Cloudflare 的 [Monetization Gateway](https://blog.cloudflare.com/monetization-gateway/) 将允许符合条件的 Cloudflare 客户无需人工介入，直接向智能体买家销售内容、API 等资源。但要让这一市场真正发展起来，智能体还需要更多工具，以机器原生的方式向商家购买服务。Wallets 将为 Cloudflare 的 Agents SDK 增加又一项工具，让 AI 智能体可以通过小额支付轻松购买所需的 API 和内容。

Cloudflare Wallets 将分为两类：Account Wallets 和 Virtual Wallets。

**Account Wallets** 面向 Cloudflare 账户的所有者和用户。用户可以为其充值，把一定的消费权限委托给由智能体管理的 Virtual Wallets，并在需要时提取资金。

相比之下，**Virtual Wallets** 专为智能体设计，通过 API 密钥运行。在 Virtual Wallet 中，智能体可以按所获权限使用资金，其最高支出受 Account Wallet 所有者设置的限额约束。这一框架让智能体无需持续取得人工批准，就能代表用户自主行动，同时限制其超额消费的能力。

<figure><p><img src="https://blog.cloudflare.com/_image?href=https%3A%2F%2Fblog.cloudflare.com%2F_emdash%2Fapi%2Fmedia%2Ffile%2F01KZ517G703TJNQB9WCE3VG3BY.png&amp;w=715&amp;h=557&amp;f=webp&amp;fit=cover&amp;position=center" alt="BLOG-3406 2.png"></p></figure>

## 自由探索

Virtual Wallets 令人期待，是因为它能让智能体发挥所长：探索几十乃至数百项服务，并为特定使用场景找到最佳选择。通过 x402 进行稳定币小额支付后，智能体无需账户也能轻松试用 API，以很低的阻力测试新选项。Virtual Wallets 的支出上限旨在让人类能够放心地让智能体在安全额度内自主探索。这些上限看似约束，实际上却反而赋予智能体更多自由。如果智能体只负责 10 美元的资金，你对其支出的担忧自然会少于它负责 1,000 美元时。若试用一次 API 只需几美分，10 美元就足以探索和评估大量选项。

当你或你的智能体选定要使用的 API 后，你在 Account Wallet 中设置的策略将成为 Virtual Wallets 的成本控制措施。想给每位员工每周 100 美元的 AI 推理预算？只需为 Account Wallet 配置适当的余额，再为每位员工创建一只应用该规则的 Virtual Wallet。任何超出其 Virtual Wallet 限额的人，都可以向有权修改 Account Wallet 的人员申请人工例外批准。

我们希望 Account Wallets 能够轻松设置既灵活又明确的支出策略，而不需要每天主动监控。当出现异常情况（例如支出速度出乎意料地快）时，人员可以审查并确认一切是否按预期运行。如果支出确属有意为之，Account Wallet 管理员可以提高限额，或批准一次性注入资金。如果支出并非出于本意，那么为 Virtual Wallets 添加资金时采用的支出策略就通过设置上限发挥了作用。

我们正在努力让这些钱包的充值和使用尽可能简单。我们会先在支持的地区提供简便的资金转入和转出方式；符合条件的用户也可以选择用稳定币自行充值。互联网不会在一夜之间彻底转变，但如今 [Web 上的大部分流量](https://radar.cloudflare.com/)已经由机器人驱动，我们很高兴能为智能体和商家提供一流的智能体商业工具。

## 不止于支付

允许人类把权限委托给智能体，使其轻松买卖服务，是一个很好的起点。但商家与智能体互动时，并不总能清楚看到这种委托关系。如今，当一个智能体访问你的网站时，即使它代表某个人或某个组织行事，你对这个“用户”可能仍知之甚少。这种归属信息的缺失给许多传统 Web 商业模式带来了挑战。向人类或组织提供一周免费试用或注册赠金很容易；但如果智能体没有稳定身份，而且一个人可以创建几十个受其控制的智能体，就很难向智能体提供同样的优惠。

我们通过 [cloudflare.pay](https://cloudflare.pay/) 将钱包与 Cloudflare 账户关联，来解决这一问题。[cloudflare.pay](https://cloudflare.pay/) 将允许智能体选择是否表明身份，因为它们的身份来自账户的授权委托。例如，一个研究智能体可以使用 [research.example.cloudflare.pay](http://research.example.cloudflare.pay/) 这一地址，让商家知道它来自某个特定组织。这种方式可以让智能体保持一致且持久的身份，为各方带来更好的体验。智能体完全可以自行选择是否声明身份；企业也可以自行决定是否优先与已知身份的智能体交易。

## 智能体标识应便于人类阅读

我们认为，人们对待智能体的方式将类似于对待 VPN：身份不明并不意味着天然不可信，但它需要提供更多证明。为此，我们推出了 [Turnstile](https://www.cloudflare.com/products/turnstile/)，也在 [Bot Management](https://www.cloudflare.com/products/bot-management/) 中开展了其他机器人检测工作。我们的身份基础能力将建立在这些既有成果之上。例如，[Web Bot Auth](https://developers.cloudflare.com/bots/reference/bot-verification/web-bot-auth/) 已允许智能体通过密钥对注册身份；与 Cloudflare Wallets 关联的标识则能让这组密钥对变得便于人类阅读。

我们知道，智能体身份标准变化很快，因此希望保持方案简单。我们要为不易阅读的密钥对提供一个便于人类阅读的标识，就像 [DNS](https://www.cloudflare.com/learning/dns/what-is-dns/) 把 URL 与 IP 地址对应起来一样。我们无意定义某种特定模式或其他验证系统，只想让身份便于记忆、易于声明。随着 [x402 Foundation](https://blog.cloudflare.com/x402/) 的相关倡议逐步建立用于丰富智能体身份的信息模式，我们会努力采用这些标准，也希望鼓励其他参与者这样做。

## 智能体商业的未来

Cloudflare 希望提供智能体商业成功所需的全部基础构件。Monetization Gateway 将让卖家无需搭建传统支付基础设施也能获得收入；Wallets 将让买家可以通过智能体、无需人工介入地完成付款；身份能力则让商家能够与主动表明身份的买家沟通，或强制要求买家提供身份。

这些基础构件将共同为互联网打造一个无需人工介入的市场。如果你对此感兴趣并希望参与其中，[现在就可以申领你的钱包标识](https://cloudflare.pay/)。我们期待看到你会构建什么，又会如何将它变现。
