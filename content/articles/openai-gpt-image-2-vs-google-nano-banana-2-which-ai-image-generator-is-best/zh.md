---
title: OpenAI GPT Image 2 对比 Google Nano Banana 2：哪个 AI 图像生成器更强？
date: '2026-05-08T02:36:14.843Z'
sourceUrl: 'https://decrypt.co/366408/openai-gpt-image-2-vs-google-nano-banana-2-review'
lang: zh
---
#### 简而言之

*   GPT Image 2 于 4 月下旬发布，具备原生推理能力，并且在任何文字系统中的文本准确率都极高。
*   Nano Banana 2 在动漫插画、航拍空间构图和结构化信息设计上胜出。
*   GPT Image 2 在照片真实感、排版文字和签名书法上占据优势。

OpenAI 最近发布 GPT Image 2 时，低调得像是很清楚结果会自己说话的人。没有 keynote。没有 hype cycle。只有一个模型页面，主要是作品 gallery，以及 Image Arena 上领先目前所有可用模型 242 分的成绩——这是该排行榜有史以来最大领先幅度。

这个时间点很有针对性。上次我们观察 AI 图像生成顶端模型时，[Google 的 Nano Banana 2](https://decrypt.co/359274/google-nano-banana-2-new-king-ai-image-generation) 刚刚夺冠，我们还让它和 ByteDance 的 Seedream 5 Lite 做了一场七项对决。Seedream 在价格和空间保真度上表现不错。Nano Banana 2 在速度和文字渲染上胜出。然后 OpenAI 进场了。

GPT Image 2——模型标识符为 gpt-image-2，运行在 GPT-5.4 backbone 上——是 OpenAI 第一个在架构中内建原生推理的图像模型。在画出任何东西之前，它会研究、规划，并推理图像结构。

OpenAI 还退役了 DALL-E 3 和 GPT Image 1.5，两者都将在 5 月 12 日关闭。这不是一次更新，而是一次替换。

我们沿用了此前 [Nano Banana 对比 Seedream](https://decrypt.co/359700/image-ai-leap-google-bytedances-latest-models) 时使用的七项测试框架，看看实际发生了什么变化，以及 Google 现任冠军是否还能守住总冠军。

## GPT Image 2 提供了什么

头号特性是文字。OpenAI 声称它在拉丁、CJK、印地语和孟加拉语文字系统中，字符级准确率约为 99%。这不是相较旧模型的小幅提升——文字渲染一直是让 AI 图像生成器显得像玩具的地方：扭曲招牌、无意义字体、互相渗开的字母。

GPT Image 2 看起来基本解决了这个问题。

该模型支持最高 4K 分辨率，并能从单个 prompt 生成最多八张连贯图片，在整个 batch 中保持角色和物体一致。最后这一点——batch consistency——是生产工作流里的新 primitive。儿童书出版商和运行多格式 campaign 的 agency，现在拥有了一个此前不存在的工具。

访问方式分层。Instant Mode 把核心质量跃升带给所有 ChatGPT 用户，包括免费层用户。Thinking Mode——模型在生成前会推理、网页搜索并自检——仅限 Plus、Pro 和 Business 订阅者。官方 API 将在 5 月初向开发者开放。

在那之前，直接访问需要通过 ChatGPT 或第三方代理，每张图大约 0.01–0.03 美元。OpenAI 基于 token 的 API 定价为每百万 input tokens 8 美元、每百万 output image tokens 30 美元——在等效分辨率层级下，略低于 Nano Banana 2 每百万 output tokens 60 美元的价格。

## 测试 GPT Image 2 对比 Nano Banana 2：谁赢？

### 真实感：屋顶建筑师测试

prompt 要求生成一张电影感肖像：一位 32 岁女性建筑师，日落时分站在屋顶上，同时约束外套颜色、眼镜类型、右手拿着一卷蓝图、golden hour 光线、50mm 景深模拟、film grain，以及 4:5 竖向画幅。每一个元素都是可能失败的独立约束。

GPT Image 2 相比前代产出了令人印象深刻的结果，不过人物凝视中仍有那种有时很容易识别出来的典型 AI 情绪。城市天际线的 bokeh 表现得像真实 50mm f/1.8。风衣面料有可触摸的重量感。皮肤呈现自然雀斑纹理，有真实的 subsurface scattering，而不是美容训练 diffusion 模型常见的光滑合成质感。蓝图也如要求一样拿在右手。

Nano Banana 2 生成了一张合格肖像，但看起来像合成图。夕阳饱和度比真实 golden hour 略高。皮肤在该分辨率下也非常自然，但她的凝视更真实、更自然。不过没有 film grain，而且她拿的是几张不同蓝图，而不是一卷蓝图。图像实际上与之前测试中的结果非常相似，说明在给定不同约束时，该模型创意略显不足。

**胜者：Nano Banana 2**

### 艺术与绘画：文艺复兴天文学家

这个 prompt 要求生成接近伦勃朗风格的艺术作品，并包含三种相互竞争的光源——温暖烛光、冷色月光，以及绿色生物发光罐——它们要在杂乱的石质天文台中正确混合。它还要求一份具体桌面物品清单、一只一只爪子为白色的猫，以及可见的油画笔触纹理。

GPT Image 2 把光线物理做对了。每个光源都在表面投下自己的色温。天鹅绒长袍袖口有磨损，骷髅被用作书挡，巨册上有可以解释为手写文字的内容，黑猫带着一只白爪，映在有彗星的天空前。整体读起来像真实油画，而不是渲染图。

不过，GPT Image 2 展现了一个可能在下一代模型前持续存在的缺陷：当参数太多时，模型会过度锐化图像，并生成大量 artifacts，严重降低质量。这大概相当于 GPT Image 1 被嘲讽的“piss filter”，只是属于这一代新模型。

Nano Banana 2 生成了美丽的东西——但类型错了。它更接近高端奇幻卡牌插画，而不是油画。绘画感较浅，巨册文字有真实字母但不是可读文字，猫有两只白爪而不是一只。画面过曝，但光源都有被正确表现。

**胜者：GPT Image 2**

### 插画：动漫灵媒

这是 Nano Banana 2 强势反击的地方。prompt 要求生成一张 Ufotable 风格的 anime key visual——Ufotable 是《鬼灭之刃》和《Fate/Zero》背后的工作室——并包含具体技术要求：带墨线粗细变化的 cel shading、身体逐渐转化为能量、subsurface skin glow、九尾狐、带有可读汉字的御札书法，以及新海诚式紫色、琥珀色和玫瑰色黄昏绘画背景。

Nano Banana 2 交付了整场七项评测中可能最好的单张输出。cel shading 有正确的墨线粗细变化。尾巴发光且清晰存在。御札上的汉字可识别。黄昏渐变准确。构图读起来像真正的剧场海报。

相比之下，GPT Image 2 生成的是动漫拼贴。线条干净，能量溶解效果正确，樱花 bokeh 不错——但 Ufotable 的 subsurface skin glow 缺失，九尾狐被缩减成一个有实体尾巴的伙伴，其他尾巴看起来不一样。

同样，在这类艺术图中，过度锐化和 artifacts 很明显，图像视觉上并不讨喜。

**胜者：Nano Banana 2**

### 字体与风格理解：签名设计测试

两个模型都看到了来自专业 lettering service 的参考样例——一种带有可控复杂度的华丽草书签名风格——然后被要求用这种美学为 “José Lanz” 设计签名：抽象但可读。

GPT Image 2 生成了干净流畅的草书，有正确的环形上升笔画，呈现在纹理纸张上，并带有 embossed letterpress 效果。它完全能读作 “José Lanz”，但也经过风格化。批评点是：它太安全了。参考材料比 GPT 生成的东西更有能量、更交缠。但这是一个可用交付物，并且正确模仿了参考。

Nano Banana 2 尝试匹配华丽复杂度，却生成了不可读的潦草涂写。参考作品的吸引力在于可控混乱——看似狂野的环线最终会解析成可读字母形态。Gemini 变得狂野，却失去了可读性。它还复现了该服务的水印，这在任何专业语境里都是 IP 风险。

**胜者：GPT Image 2，而且优势很大**

### 空间意识：蒸汽朋克航拍

这是一个要求很高的构图 prompt，指示不同物体出现在特定位置：从三分之四航拍视角观看一座巨大的蒸汽朋克钟楼城市，包含五个景深平面、空气雾化渐变，以及分布在场景中的六个具体可读文字元素——包括四个钟面，每个都用罗马数字显示不同时间。

Nano Banana 2 在这一项略胜。它的航拍几何更有说服力——三分之四视角真的像三分之四，而不是倾斜的正面视角。五个景深平面分离清楚，空气雾化随距离正确增强，湿鹅卵石上的报纸纹理很出色。元素被正确表现，文字也可读，但并非所有行都出现在场景中。

GPT Image 2 把六个文字元素都做对了，所有钟面也正确，但中景的景深平面部分坍塌，钟楼显示了四个不同时间的钟。它也更准确地表现了文字——例如 gargoyle 展示了写着 “Sector 7: Condemned” 的文件，而 Nano Banana Pro 没有表现出来。

同样，需要考虑的大量参数似乎降低了图像质量，触发了过度锐化效果，类似在 Stable Diffusion 中使用过强 LoRA。

**胜者：Nano Banana 2**

### 文字密度：Kellerman's Hardware 场景

这是最苛刻的文字召回测试：凌晨 2 点的粗粝城市路口，每个表面都有可读文案——ghost sign、chrome bubble letters 涂鸦、店面 vinyl lettering、带条形码的演唱会海报、下面撕裂露出的另一层内容、金属雨棚上的 embossed 字母、纸板手写字、路缘 stencil text，以及贴满 sticker 的公用电话，上面包含 “ANSWERS TO MOCHI.” 等具体文案。

GPT Image 2 交付了近乎完美的元素召回。所有指定文字元素都存在且可读。ghost sign 的 drop-shadow fade 和 peeling texture 非常出色。钠蒸汽灯色偏准确——那种真实钠蒸汽路灯特有的绿琥珀色，而不是泛泛的琥珀色。湿沥青反射也很有说服力。

Nano Banana 2 也表现很强，但丢了一些具体性。“STILL HERE” 涂鸦用了 outline bubble letters，而不是 chrome-fill。撕裂海报露出部分不完整。钠蒸汽色偏更普通。prompt 中若干元素没有在渲染中保留下来。尽管如此，由于 GPT Image 2 的过度锐化缺陷，它在视觉上比 GPT Image 2 的结果更讨喜。

**胜者：GPT Image 2，因为 prompt adherence 更好**

### Agentic research：比特币时间线

这个类别测试的是另一件事——不是渲染质量，而是编辑判断和信息架构。两个模型都有能力在渲染图像前激活 agent 做研究和调查，因此我们对它们进行了比较。

prompt 要求生成一张宽屏 [Bitcoin](https://decrypt.co/resources/what-is-bitcoin-four-minute-instant-guide-explainer) 历史时间线，风格为儿童绘画，同时对信息准确性有严格质量要求。

GPT Image 2 把它当成一项信息图委托来处理。输出使用水平时间线，上方是按颜色编码的年份标记和插画槽，下方是每个事件的解释文字。日期具体：白皮书是 2008 年 10 月 31 日；创世区块是 2009 年 1 月 3 日；Pizza Day 是 2010 年 5 月 22 日。Mt. Gox 条目正确写出丢失 850,000 BTC。事件从 2008 到 2024 年均匀分布。

Nano Banana 2 的输出更有魅力——用蜿蜒道路隐喻 Bitcoin 的波动旅程确实聪明——但第一人称标题 “My Bitcoin Timeline” 对一篇信息作品来说很奇怪。2020–2024 部分在视觉上拥挤，不同时代的信息密度也不均衡。

**结论：平局。Nano Banana 视觉更讨喜，但 GPT Image 2 的输出信息更多**

### 图像编辑：客厅改造

这个测试衡量的是不同于纯生成的能力：模型如何读取一个既有空间，并在保持锚定于这个特定房间的同时改造它。它更接近 staging app 或室内建筑师工具需要做的事。

*Prompt：这是我客厅的照片。让它更现代、更极简。把地板换成白色大理石，用风格一致的镜子装饰正面墙，让整体美学更现代、更悦目：*

GPT Image 2 的输出立刻能看出是同一个房间。门在相同位置。智能锁还在。墙面艺术组合、吊挂植物、搁板——全部保留。

该模型的 redesign 选择也确实符合 prompt：它把混杂的镜子组合换成了带灯的三联画式设计，形成 focal wall，面板后方的暖色 LED halo 是真实的室内设计手法。镜子中的反射也确实匹配参考，这是一种有趣实现。

不过，它没有对地板做出修改。

Gemini 的输出因为光线更真实，所以看起来更写实，但它和原始房间的关系更混乱。比如，它把“use mirrors”这条指令理解得太字面，在镜子上又放镜子。混合画框风格（有金色、有黄铜、形状不同）也明确违背了 “cohesive style” 指令。

它看起来像是模型只在自己标记为可编辑的特定区域上应用了 inpainting layer。透视也略有偏差。

**胜者：GPT Image 2，因为它的选择更好。逐步修改单个元素，比指导 Gemini 修改它创造出的所有元素更容易**

## 结论

GPT Image 2 在多数类别中获胜：真实感、古典艺术、签名书法、图像编辑和文字密度。Nano Banana 2 在动漫插画、空间构图和结构化信息设计上胜出。不过，在长 prompts 上，Nano Banana 2 是更一致的模型。

总体而言，只要你给 ChatGPT 足够的创意自由，避免触发锐化效果，它的结果会美观、真实，并且在文字上很强。不过两个模型质量非常接近，好的 prompting 策略可能会让结果偏向任一方。

GPT Image 2 可能是最容易从零上手的模型，但 Nano Banana 2 配合合适的 prompting 技术和迭代，也能产出优秀结果；根据使用场景，它可能看起来更专业、更 polished。

### Daily Debrief Newsletter

每天从当前头条新闻开始，还包括原创专题、播客、视频等。
