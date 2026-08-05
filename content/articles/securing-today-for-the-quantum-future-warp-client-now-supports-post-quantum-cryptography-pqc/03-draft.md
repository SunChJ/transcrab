# 立足当下，守护量子未来：WARP 客户端现已支持后量子密码学（PQC）

互联网目前正向[后量子密码学（PQC）](https://www.cloudflare.com/pqc/)迁移，为“Q-Day”做准备——届时，量子计算机将能够破解支撑所有现代计算机系统的经典密码学。美国[国家标准与技术研究院（NIST）](https://www.nist.gov/)已经意识到此次迁移的紧迫性，并宣布必须在 [2030 年前弃用经典密码算法，到 2035 年全面禁止使用](https://csrc.nist.gov/pubs/ir/8547/ipd)，其中包括 [RSA](https://en.wikipedia.org/wiki/RSA_cryptosystem) 和椭圆曲线密码学（[ECC](https://blog.cloudflare.com/a-relatively-easy-to-understand-primer-on-elliptic-curve-cryptography/)）。

Cloudflare 的进度远远领先于 NIST 的时间表。如今，发送到 Cloudflare 网络、由人类产生的互联网流量中，已有超过 [45%](https://radar.cloudflare.com/adoption-and-usage?cf_history_state=%7B%22guid%22%3A%22C255D9FF78CD46CDA4F76812EA68C350%22%2C%22historyId%22%3A20%2C%22targetId%22%3A%22583662CE97724FCE7A7C0844276279FE%22%7D#post-quantum-encryption-adoption) 使用后量子加密。我们相信，安全且保护隐私的互联网应当免费向所有人开放，因此正努力让所有[产品](https://blog.cloudflare.com/post-quantum-cryptography-ga/)都支持 PQC，[无需专用硬件](https://blog.cloudflare.com/you-dont-need-quantum-hardware/)，也[不向客户和最终用户收取额外费用](https://blog.cloudflare.com/post-quantum-crypto-should-be-free/)。

因此，我们很自豪地宣布，[Cloudflare WARP 客户端](https://developers.cloudflare.com/warp-client/)现在支持后量子密钥协商——无论是免费的消费者版 WARP 客户端 [1.1.1.1](https://one.one.one.one/)，还是企业版 WARP 客户端 [Cloudflare One Agent](https://developers.cloudflare.com/cloudflare-one/connections/connect-devices/warp/download-warp/)，均已支持。

## 使用 WARP 客户端建立后量子隧道

WARP 客户端升级到后量子密钥协商后，可以立即保护最终用户的互联网流量，使其免受[“先收集、后解密”攻击](https://en.wikipedia.org/wiki/Harvest_now,_decrypt_later)。它的价值非常明确：通过 WARP 客户端的后量子 MASQUE 隧道传输互联网流量，网络流量便会立即获得后量子加密保护——即使隧道内的各条连接本身尚未升级到后量子密码学，也同样如此。

其工作原理如下。

作为 [Cloudflare One Zero Trust](https://developers.cloudflare.com/cloudflare-one/) 平台的一部分，[Cloudflare One Agent](https://developers.cloudflare.com/cloudflare-one/connections/connect-devices/warp/download-warp/)（我们的企业版 WARP 客户端）在将员工连接到企业内部资源时，现在能为网络流量提供[端到端后量子加密](https://blog.cloudflare.com/post-quantum-zero-trust/)。如下图所示，来自 WARP 客户端的流量先封装进采用后量子加密的 [MASQUE](https://blog.cloudflare.com/zero-trust-warp-with-a-masque/)（[基于 QUIC 加密的多路复用应用基底，Multiplexed Application Substrate over QUIC Encryption](https://datatracker.ietf.org/wg/masque/about/)）隧道，再发送到 Cloudflare 的[全球网络](https://www.cloudflare.com/network/)（链路 1）。随后，Cloudflare 全球网络通过另一组后量子加密隧道转发流量（链路 2），最后使用 [cloudflared agent](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/) 在企业资源附近建立一条采用[后量子加密](https://blog.cloudflare.com/post-quantum-tunnel/)的 Cloudflare [Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/)，把流量送达企业内部资源（链路 3）。

<figure><p><img src="https://blog.cloudflare.com/_image?href=https%3A%2F%2Fblog.cloudflare.com%2F_emdash%2Fapi%2Fmedia%2Ffile%2F01KW4907EHFQK943YQ2SJ51KDY.png&amp;w=715&amp;h=242&amp;f=webp&amp;fit=cover&amp;position=center" alt="BLOG-2967 image 1"></p></figure>

*我们已将 [Cloudflare One Agent](https://developers.cloudflare.com/cloudflare-one/connections/connect-devices/warp/download-warp/) 升级到后量子密钥协商，为发送到企业内部资源的流量提供端到端后量子保护。*

当最终用户[安装](https://developers.cloudflare.com/learning-paths/secure-internet-traffic/connect-devices-networks/install-agent/)消费者版 WARP 客户端（[1.1.1.1](https://one.one.one.one/)）后，WARP 客户端会把用户的网络流量封装进采用后量子加密的 [MASQUE](https://blog.cloudflare.com/zero-trust-warp-with-a-masque/) 隧道。如下图所示，流量前往 Cloudflare [全球网络](https://www.cloudflare.com/network/)的途中由 MASQUE 隧道保护（链路 1）。随后，Cloudflare 全球网络利用后量子加密隧道，把流量送到尽可能靠近最终目的地的位置（链路 2）。最后，流量通过公共互联网转发至源服务器，也就是最终目的地。最后一段连接（链路 3）可能采用后量子加密，也可能没有：如果源服务器不支持 PQ，它就不是 PQ 连接；如果源服务器已经升级到 PQC，并且最终用户通过支持 PQC 的客户端（如 Chrome、Edge 或 Firefox）连接，它就是 PQ 连接。未来，只要源服务器位于 Cloudflare 后方且支持 PQ 连接，[Automatic SSL/TLS](https://blog.cloudflare.com/automatically-secure) 就能确保整条连接采用 PQ，即使用户的浏览器本身不支持也不例外。

<figure><p><img src="https://blog.cloudflare.com/_image?href=https%3A%2F%2Fblog.cloudflare.com%2F_emdash%2Fapi%2Fmedia%2Ffile%2F01KW49FM1HA8E030PJRYYRFXB2.png&amp;w=715&amp;h=266&amp;f=webp&amp;fit=cover&amp;position=center" alt="BLOG-2967 image 2"></p></figure>

*消费者版 WARP 客户端（[1.1.1.1](https://one.one.one.one/)）现已升级到后量子密钥协商。*

## 密码学现状

在深入介绍 WARP 客户端的升级细节之前，我们先回顾一下迁移到 PQC 所涉及的不同密码学原语。

密钥协商是一种让两个或多个参与方通过不安全通信信道建立共享密钥的方法。此后，这个共享密钥可用于加密并验证后续通信。[传输层安全协议（TLS）](https://www.cloudflare.com/learning/ssl/transport-layer-security-tls/)中的经典密钥协商通常采用[椭圆曲线 Diffie-Hellman（ECDH）](https://blog.cloudflare.com/a-relatively-easy-to-understand-primer-on-elliptic-curve-cryptography/)算法，而量子计算机可以利用 [Shor 算法](https://en.wikipedia.org/wiki/Shor%27s_algorithm)攻破它。

我们今天就需要部署[**后量子密钥协商**](https://blog.cloudflare.com/post-quantum-key-encapsulation/)，以阻止[“先收集、后解密”攻击](https://en.wikipedia.org/wiki/Harvest_now,_decrypt_later)：攻击者今天收集加密数据，等未来强大的量子计算机问世后再将其解密。任何机构，只要所处理的数据在十年后仍可能具有价值——例如[政府](https://www.cloudflare.com/cloudflare-for-government/)、[金融机构](https://www.cloudflare.com/banking-and-financial-services/)、[医疗组织](https://www.cloudflare.com/healthcare/)等——都应部署 PQ 密钥协商来防范此类攻击。

这正是我们将 WARP 客户端升级到后量子密钥协商的原因。

后量子密钥协商已经相当成熟，性能也很出色。我们的[实验](https://blog.cloudflare.com/pq-2024/#ml-kem-versus-x25519)表明，在 [TLS 1.3](https://www.cloudflare.com/learning/ssl/why-use-tls-1.3/) 上以混合模式部署后量子模块格密码密钥封装机制（[ML-KEM](https://csrc.nist.gov/pubs/fips/203/final)）算法，即与经典 ECDH 并行运行，其性能实际上优于在 [TLS 1.2](https://www.cloudflare.com/learning/ssl/why-use-tls-1.3/) 上使用经典密码学。

<figure><p><img src="https://blog.cloudflare.com/_image?href=https%3A%2F%2Fblog.cloudflare.com%2F_emdash%2Fapi%2Fmedia%2Ffile%2F01KW480SMCA3D0ZR5TE1R8CZYB.png&amp;w=715&amp;h=419&amp;f=webp&amp;fit=cover&amp;position=center" alt="BLOG-2674 Image 2"></p></figure>

*我们网络上超过三分之一的人工流量使用 TLS 1.3 和混合后量子密钥协商（上方截图中显示为 X25519MLKEM768）。事实上，如果你使用 Chrome、Edge 或 Firefox 浏览器，此刻很可能正通过 PQ 加密连接阅读这篇博客。*

相比之下，TLS 和互联网公钥基础设施（PKI）所使用的**后量子数字签名与证书**仍在[标准化](https://datatracker.ietf.org/doc/draft-ietf-lamps-dilithium-certificates/)过程中。要防止主动攻击者利用量子计算机伪造数字证书或签名，再冒充可信服务器解密或操纵通信，就需要使用 [PQ 签名和证书](https://blog.cloudflare.com/another-look-at-pq-signatures/)。据我们所知，这类攻击者尚未出现，因此后量子签名和证书还没有在整个互联网上广泛部署。我们尚未将 WARP 客户端升级到 [PQ 签名和证书](https://blog.cloudflare.com/another-look-at-pq-signatures/)，但计划很快完成这项工作。

## 独特挑战：升级 WARP 客户端的 PQC

Cloudflare 走在 [PQC 迁移](https://blog.cloudflare.com/tag/post-quantum/)的前沿，但升级 WARP 客户端时，我们遇到了另一类挑战。服务器完全由我们控制，随时可以热修复；WARP 客户端却直接运行在最终用户的设备上。事实上，它运行在数百万台我们无法控制的最终用户设备上。这一本质区别意味着，WARP 客户端的每一次更新都必须首次发布就正确运行，不容有失。

更具挑战的是，我们需要在五种不同操作系统（Windows、macOS、Linux、iOS 和 Android/ChromeOS）上支持 WARP 客户端，同时还要确保消费者版 1.1.1.1 WARP 客户端与 Cloudflare One Agent 都具有一致性和可靠性。此外，WARP 客户端依赖相当新的 [MASQUE 协议](https://datatracker.ietf.org/doc/rfc9298/)；业界直到 2022 年 8 月才将其标准化。因此，我们必须格外谨慎，确保升级到后量子密钥协商不会暴露 MASQUE 协议本身潜藏的缺陷或不稳定因素。

所有这些挑战都意味着，WARP 客户端需要缓慢而谨慎地迁移到 PQC，同时我们还要满足希望立即启用 PQC 的客户。为此，我们采用了三项技术：

1. 临时允许 PQC 降级；
2. 在 WARP 客户端用户群中逐步推出；以及
3. 提供[移动设备管理（MDM）](https://en.wikipedia.org/wiki/Mobile_device_management)覆盖配置。

下面逐项深入说明。

### 临时允许 PQC 降级

在向 WARP 客户端的 MASQUE 推出 PQ 密钥协商时，我们要确保客户端不会因为错误、中间盒，或 PQC 迁移所触发的潜在实现缺陷而难以连接。要实现这种稳健性，一种方法是在客户端无法协商 PQ 连接时，让它降级到经典密码连接。

要真正理解这一策略，我们需要回顾**密码学降级**的概念。在密码学中，**降级攻击**是指攻击者迫使系统放弃安全的密码算法，转而采用更旧、更不安全，甚至未加密的方案，使攻击者得以窥探通信内容。因此，新部署 PQ 加密时的标准做法是：如果客户端和服务器*双方*都支持 PQ 加密，攻击者就不应有办法把它们的连接降级为经典加密。

为了防止降级攻击，我们应确保：客户端和服务器都支持 PQC，但无法协商出 PQC 连接时，连接直接失败。然而，这虽然能阻止降级攻击，却会给稳健性带来问题。

我们无法同时兼得稳健性（即 PQC 失败时，允许客户端降级为经典连接）和抗降级安全性（即客户端支持 PQC 后，禁止降级到经典密码学），必须二选一。因此，我们采用了分阶段方案。

* **第一阶段：自动 PQC 降级。** 开始时，我们优先保证稳健性，代价是暂不提供抗降级攻击能力。在这一阶段，我们支持自动 PQC 降级：如果客户端无法协商 PQC 连接，它会降级到经典密码学。这样，即使 PQC 引入缺陷或其他不稳定因素，客户端也会自动降级到经典密码学，最终用户不会遇到问题。（注意：MASQUE 只在用户登录时建立一条存续时间很长的 TLS 连接，因此最终用户不太可能察觉降级。）
* **第二阶段：具备抗降级能力的 PQC。** 等部署稳定、且我们确信没有问题干扰 PQC 后，就会优先保证抗降级安全性，而非稳健性。在这一阶段，如果客户端无法协商 PQC 连接，连接会直接失败，从而抵御降级攻击。

为实现这一分阶段方案，我们引入了一个 API 标志，由客户端根据它来决定如何发起 TLS 握手。该标志有三种状态：

* **No PQC：** 客户端仅使用经典密码学发起 TLS 握手。
* **PQC downgrades allowed：** 客户端使用后量子密钥协商发起 TLS 握手。如果 PQC 握手协商失败，客户端会降级到经典密码学。该状态支持我们部署的第一阶段。
* **PQC only：** 客户端使用后量子密钥协商密码学发起 TLS 握手。如果 PQC 握手协商失败，连接即告失败。该状态支持我们部署的第二阶段。

WARP [桌面版 2025.5.893.0](https://developers.cloudflare.com/changelog/2025-06-30-warp-windows-ga/)、[iOS 版 1.11](https://developers.cloudflare.com/changelog/2025-06-30-warp-ga-ios/)和 [Android 版 2.4.2](https://developers.cloudflare.com/changelog/2025-06-30-warp-ga-android/)均支持后量子密钥协商以及这一 API 标志。

框架确定后，下一个问题就是：这一分阶段方案应采用怎样的时间安排？

### 在 WARP 客户端用户群中逐步推出

为了限制 PQC 迁移触发错误或潜在实现缺陷的风险，我们在 WARP 客户端用户群中逐步推出 PQC。

部署的第一阶段优先考虑稳健性，而非抗降级攻击能力。因此，最初我们把整个客户端用户群的 API 标志设为“No PQC”，然后分批为客户端启用“PQC downgrades allowed”。在此过程中，我们会监控是否有客户端从 PQC 降级到经典密码学。截至本文撰写时，我们已经为所有消费者版 WARP（1.1.1.1）客户端完成第一阶段部署，预计在 2025 年底前完成 Cloudflare One Agent 的第一阶段部署。

第一阶段不应发生降级；事实上，出现降级意味着可能存在需要修复的潜在问题。如果你在使用 WARP 客户端时遇到疑似与 PQC 有关的问题，可以通过 WARP 客户端界面中的反馈按钮告知我们（点击应用右上角的错误图标）。企业用户也可以针对 Cloudflare One Agent 提交支持工单。

我们计划在 2026 年夏季前后进入第二阶段：把 API 标志设为“PQC only”，以提供抗降级攻击能力。

### MDM 覆盖配置

最后，我们知道有些客户可能不愿等待我们完成这次谨慎的 PQC 升级。因此，这些客户现在就可以启用 PQC。

我们为 Cloudflare One Agent 构建了一个[移动设备管理（MDM）](https://en.wikipedia.org/wiki/Mobile_device_management)覆盖配置。MDM 让组织能够集中管理、监控并保护访问企业资源的移动设备；它适用于多类设备，并非仅限移动设备。Cloudflare One Agent 的覆盖配置允许有权管理设备的管理员启用 PQC。要使用 [MDM 后量子覆盖配置](https://developers.cloudflare.com/cloudflare-one/connections/connect-devices/warp/deployment/mdm-deployment/parameters/#enable_post_quantum)，请把 ‘enable\_post\_quantum’ MDM 标志设为 true。该标志的优先级高于前文介绍的 API 标志信号，会启用不允许降级的 PQC。在此设置下，客户端只会协商 PQC 连接；如果 PQC 协商失败，连接也会失败，从而提供抗降级攻击能力。

## 密码套件、FIPS 与 FedRAMP

[联邦风险与授权管理计划（FedRAMP）](https://www.cloudflare.com/learning/privacy/what-is-fedramp/)是美国政府为保护云端联邦数据而制定的标准。[Cloudflare 已取得 FedRAMP 认证](https://cf-assets.www.cloudflare.com/slt3lc6tev37/7wOGN7Ua9rvgzlQAwlFZ6y/324506e91b62aa4de55bcb2ceb5d8ee8/Cloudflare-s_Unique_FedRAMP_Architecture.pdf)，该认证要求我们在 FIPS 边界内的某些产品中使用符合 [FIPS](https://csrc.nist.gov/glossary/term/federal_information_processing_standard)（联邦信息处理标准）的密码套件。

由于 WARP 客户端位于 Cloudflare [FedRAMP](https://www.fedramp.gov/) 认证的 FIPS 边界内，我们必须确保它使用符合 FIPS 的密码学。对于 FIPS 边界内的内部链路（连接两端均由 Cloudflare 控制），我们目前采用一种混合密钥协商：一方面使用基于 P256 椭圆曲线且符合 FIPS 的 ECDH，另一方面并行使用 ML-KEM-768 的早期版本（我们在 ML-KEM 标准最终定稿前便开始使用它）。这一密钥协商名为 P256Kyber768Draft00。你可以在 WARP 客户端中使用 `warp-cli tunnel stats` 工具，查看该密码套件的实际运行情况。以下是启用 PQC 时的示例：

<figure><p><img src="https://blog.cloudflare.com/_image?href=https%3A%2F%2Fblog.cloudflare.com%2F_emdash%2Fapi%2Fmedia%2Ffile%2F01KW44RKN8GYT6V4RPR13R646E.png&amp;w=706&amp;h=536&amp;f=webp&amp;fit=cover&amp;position=center" alt="BLOG-2967 image 4"></p></figure>

以下是未启用 PQC 时的示例：

<figure><p><img src="https://blog.cloudflare.com/_image?href=https%3A%2F%2Fblog.cloudflare.com%2F_emdash%2Fapi%2Fmedia%2Ffile%2F01KW46969B37P1G3RNFMXK0JS3.png&amp;w=696&amp;h=548&amp;f=webp&amp;fit=cover&amp;position=center" alt="BLOG-2967 image 5"></p></figure>

## 面向所有人的 PQC 隧道

我们认为，PQC 应当惠及每一个人：[不需要专用硬件](https://blog.cloudflare.com/you-dont-need-quantum-hardware/)，也[不额外收费](https://blog.cloudflare.com/post-quantum-crypto-should-be-free/)。为此，我们很自豪能够分担互联网升级到 PQC 的重任。

一种强有力的策略是，使用后量子密钥协商保护的隧道，批量保护互联网流量免受“先收集、后解密”攻击——即使通过隧道发送的各条连接尚未升级到 PQC，也同样有效。最终，我们还会升级这些隧道，使其支持后量子签名和证书，以阻止 Q-Day 之后掌握量子计算机的对手发动主动攻击。

这种分阶段方案与互联网标准的发展保持同步。使用隧道还能为客户和最终用户内置*密码敏捷性*，让他们无需大幅改造架构，便能轻松适应密码学格局的变化。

Cloudflare WARP 客户端只是我们升级到后量子密钥协商的最新一种隧道技术。现在，你就可以在个人设备上通过免费的消费者版 WARP 客户端 [1.1.1.1](https://one.one.one.one/) 免费试用；企业设备则可以使用我们面向 50 人以下团队的[免费零信任服务](https://dash.cloudflare.com/sign-up/zero-trust)，或付费的[企业零信任或 SASE 订阅](https://www.cloudflare.com/plans/zero-trust-services/)。只需[下载](https://developers.cloudflare.com/cloudflare-one/connections/connect-devices/warp/download-warp/)客户端，将其安装到 Windows、Linux、macOS、iOS 或 Android/ChromeOS 设备上，即可开始用 PQC 保护网络流量。
