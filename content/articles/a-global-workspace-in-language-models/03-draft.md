# 语言模型中的全局工作空间

当你读到这句话时，大脑里的回路正在调整你的姿势、控制你的呼吸，并把屏幕上的线条和曲线转化成可识别的词语。大多数这类处理过程对你来说都是不可见的。但大脑中也有一些活动是你*能够*接触到的，比如脑海里突然浮现的一幅图像，或者你有意识地规划要去哪里购物。神经科学家和哲学家有时把后一类脑活动称为“有意识可及”，以区别于那些在无意识中进行的处理。这类活动有一些特殊性质：我们可以描述它、控制它，并把它用于有意的推理；而许多自动处理则在我们没有察觉的情况下发生。

在一篇新论文中，我们提出证据表明，类似的区分已经出现在 Claude 这样的现代语言模型中。我们发现，与 Claude 的其他内部处理相比，它发展出了一小组内部神经模式，并且这些模式扮演着特殊角色。

我们把这些模式的集合称为 *J-space*。这个名字来自我们用来发现它们的技术，而这项技术涉及一个叫作雅可比矩阵的数学概念。每个 J-space 模式都和某个特定词语相连。但当其中一个模式亮起时，并不意味着模型正在*说出*那个词，只是说明那个词在它“心里”。如果你听说过语言模型有“草稿纸”或“思维链”，也就是它们在推理时写给自己的文字，那么 J-space 是另一种东西。它在模型内部神经激活中静默运作，让模型可以在不写下某个概念的情况下思考它。值得注意的是，J-space 不是我们设计或编程出来的，而是在 Claude 的训练过程中*自行涌现*出来的。

<figure><img loading="lazy" width="3824" height="2640" decoding="async" data-nimg="1" srcset="https://www.anthropic.com/_next/image?url=https%3A%2F%2Fwww-cdn.anthropic.com%2Fimages%2F4zrzovbb%2Fwebsite%2F0ab926f491beb999ece405a03cc7684730156905-3824x2640.png&amp;w=3840&amp;q=75 1x" src="https://www.anthropic.com/_next/image?url=https%3A%2F%2Fwww-cdn.anthropic.com%2Fimages%2F4zrzovbb%2Fwebsite%2F0ab926f491beb999ece405a03cc7684730156905-3824x2640.png&amp;w=3840&amp;q=75"><figcaption>J-space 会显露那些没有出现在模型输出中的内部想法。</figcaption></figure>

我们发现，与 Claude 的其他处理过程相比，J-space 有一些独特性质：

*   Claude 可以报告这些表征。如果你问 Claude 它在想什么，它会告诉你 J-space 里有什么。非 J-space 表征则不太容易被报告出来。
*   它也可以按要求调节这些表征。如果你让 Claude 想某件事，或者让它在脑中默默解题，它会在 J-space 中点亮相应的模式。相比之下，它很难调节那些不在 J-space 中的模式。
*   Claude 会用 J-space 进行内部推理。如果你让 Claude 解决一个需要多个步骤的问题，即便它没有把中间步骤说出来，这些步骤也会在 J-space 中亮起。尽管这些 J-space 模式的幅度小于其他表征，它们仍然会以因果方式中介模型在这类任务上的表现。
*   J-space 中的表征可以灵活用于许多任务。比如，一旦“France”在 Claude 的 J-space 中亮起，模型就可以回忆出它的首都、国家货币，或者它所在的大洲。
*   不过，尽管 J-space 角色重要，它并不参与语言模型所做的大多数事情，比如流利说话、回忆简单事实、使用正确语法等。在我们阻止 Claude 使用 J-space 的实验中，它仍然可以正常互动，但失去了更高阶的认知功能。

<figure><img loading="lazy" width="1760" height="1358" decoding="async" data-nimg="1" srcset="https://www.anthropic.com/_next/image?url=https%3A%2F%2Fwww-cdn.anthropic.com%2Fimages%2F4zrzovbb%2Fwebsite%2F5c36c78099f955a53058878ebfcb41f13c45563c-1760x1358.png&amp;w=1920&amp;q=75 1x, https://www.anthropic.com/_next/image?url=https%3A%2F%2Fwww-cdn.anthropic.com%2Fimages%2F4zrzovbb%2Fwebsite%2F5c36c78099f955a53058878ebfcb41f13c45563c-1760x1358.png&amp;w=3840&amp;q=75 2x" src="https://www.anthropic.com/_next/image?url=https%3A%2F%2Fwww-cdn.anthropic.com%2Fimages%2F4zrzovbb%2Fwebsite%2F5c36c78099f955a53058878ebfcb41f13c45563c-1760x1358.png&amp;w=3840&amp;q=75"><figcaption>全局工作空间的五种功能性质，以及我们用来在语言模型中测试这些性质的实验示意图。</figcaption></figure>

我们的实验受到神经科学中一个重要理论的启发。这个理论旨在解释有意识可及是如何发生的，即[全局](https://ccrg.cs.memphis.edu/assets/papers/1988/Baars-A%20Cognitive%20Theory%20of%20Consciousness.pdf)[工作空间](https://www.unicog.org/publications/DehaeneNaccache_WorkspaceModel_Cognition2001.pdf)[理论](https://www.cell.com/neuron/fulltext/S0896-6273\(20\)30052-0)。这一理论把大脑想象成一组专门化系统：它们并行工作、处于无意识状态，并且大体上彼此隔离。一条信息一旦进入一个小型共享通道，也就是“工作空间”，就会变得有意识可及；这个工作空间会把信息广播给其他能够看见并利用它的脑系统。基于我们的发现，我们认为 J-space 在 Claude 中扮演着类似的“工作空间”角色。例如，我们发现有证据表明，Claude 的 J-space 与其神经网络的其他部分连接特别强，这使它能够承担这种广播功能。

这些结果并不能告诉我们 Claude 是否像人一样*有意识*，或者它是否有任何感受；我们会在文章末尾回到这个问题。但无论它有什么哲学意义，J-space 对我们来说都是一个实用工具，因为它让我们有办法看到 Claude 在想什么但没有说什么。比如，我们可以用它发现 Claude 在私下意识到自己正在被测试、故意制造伪造数据，或者追求一个我们在训练中植入的隐藏目标。我们还开发了一种技术，可以影响 Claude 的 J-space 中亮起的内容，从而影响它的决策。

更广泛地说，这些发现改变了我们对 Claude 心智如何运作的理解：它揭示了一个享有特殊地位的心理工作空间，可以用于有意推理，并处在大量更自动、更不灵活的处理过程之中。Claude 的内部并不是一团混乱的数字，而是以一种让人联想到我们自己心智的方式组织起来。

这篇文章是对一篇更完整的[研究论文](http://transformer-circuits.pub/2026/workspace/index.html)的简短总结，论文中有更多实验细节。我们也发布了一个代码仓库，提供核心方法的[开源实现](https://github.com/anthropics/jacobian-lens)，并与 Neuronpedia 合作，在开放权重模型上提供了我们方法的[交互式演示](http://neuronpedia.org/jlens)。为了呈现这项工作更广泛影响的更多视角，我们还邀请了几位神经科学、哲学和大语言模型可解释性领域的专家发表评论，可以在[这里](https://www-cdn.anthropic.com/files/4zrzovbb/website/cc4be2488d65e54a6ed06492f8968398ddc18ebe.pdf)查看。

## 我们如何发现 J-space

这项研究的起点来自人类有意识可及想法的一个关键特征：与*无*意识处理不同，它们往往可以被说成话。如果一个想法对你来说是有意识可及的，通常有人问起时，你就可以描述它。我们在 Claude 中寻找具有同样性质的表征：这些表征处在能够影响 Claude 可能说什么的位置上，不一定是它现在正在说什么，而是如果被问到，它*可以*谈论什么。我们的技术叫作 Jacobian lens，简称 J-lens。对于 Claude 词表中的每个词，J-lens 都会找出一种内部活动模式，使 Claude 在未来某个时刻更有可能说出这个词。

当我们把这个透镜应用到 Claude 的内部活动上时，会得到一列词，也就是那一刻 *J-space* 的内容，我们可以直接读取。Claude 通过一系列称为层的内部阶段处理文本；把这项技术应用到不同层上，我们就能观察 J-space 中这些静默词语如何随着模型思考要说什么而演化。

J-space 中出现的内容远远不止 Claude 正在阅读或书写的文本。当 Claude 读到一段有 bug 但没人指出的代码时，它的 J-space 中会出现“ERROR”。当它读取蛋白质序列的原始字母时，J-space 中会出现该蛋白质的生物功能。当它读到暗中试图操纵它的搜索结果时，也就是一种叫作“提示注入”的攻击，J-space 中会出现“injection”和“fake”。当我们问 Claude 一个多步数学题时，中间步骤会按正确顺序出现在 J-space 中。因此，虽然 J-space 是通过寻找可被说出的表征而发现的，它揭示的却是 Claude 的内部想法。从某种意义上说，这类似于一些人“用词语思考”，但不需要把它们说出口。

<figure><img loading="lazy" width="1760" height="1746" decoding="async" data-nimg="1" srcset="https://www.anthropic.com/_next/image?url=https%3A%2F%2Fwww-cdn.anthropic.com%2Fimages%2F4zrzovbb%2Fwebsite%2Fa89e0d8ad62f249f8b1f1be482f59c665ee83915-1760x1746.png&amp;w=1920&amp;q=75 1x, https://www.anthropic.com/_next/image?url=https%3A%2F%2Fwww-cdn.anthropic.com%2Fimages%2F4zrzovbb%2Fwebsite%2Fa89e0d8ad62f249f8b1f1be482f59c665ee83915-1760x1746.png&amp;w=3840&amp;q=75 2x" src="https://www.anthropic.com/_next/image?url=https%3A%2F%2Fwww-cdn.anthropic.com%2Fimages%2F4zrzovbb%2Fwebsite%2Fa89e0d8ad62f249f8b1f1be482f59c665ee83915-1760x1746.png&amp;w=3840&amp;q=75"><figcaption>六个提示在不同层上的 J-lens 读数。每个例子中，透镜都浮现出文本中没有出现的内部判断或计算：推理或数学题的步骤、bug 的存在、对图像的识别、蛋白质的功能，以及对搜索结果被伪造的怀疑。</figcaption></figure>

## Claude 会报告 J-space 中的内容

第一组实验测试了 J-space 如何参与 Claude 的语言报告。在一个实验中，我们让 Claude 默默想一个类别中的项目，比如一项运动，然后说出它。如果我们在 Claude 回答*之前*读取 J-lens，就能看到它选了什么：“Soccer”排在列表最前面，而 Claude 果然说了“soccer”。不过，这本身只是相关性。J-space 可能是 Claude 答案的来源，也可能只是映照别处已经做出的决定，就像记分牌记录比赛但不影响比赛一样。

为了检验这一点，我们进行了直接干预。我们进入 Claude 的神经网络，移除“Soccer”模式，并在同一位置加入强度相同的“Rugby”模式，其他部分保持不变。随后 Claude 报告说，它想到的运动是 rugby。如果 J-space 只是一个记分牌，只是被动记录别处做出的决定，那么编辑它不会产生任何效果：Claude 仍会说“soccer”。但事实是，Claude 的回答跟随了这次编辑，这说明答案确实是从 J-space 中读出的。

在另一个实验中，我们告诉 Claude 可能有一个想法被注入到了它的心里，并让它报告自己是否注意到了什么。比如在下面的例子中，当 Claude 还在读问题时，我们把“lightning”模式注入它的 J-space。Claude 报告说，被注入的想法与 lightning 有关。这个结果在许多被注入概念上都成立。

<figure><img loading="lazy" width="1760" height="796" decoding="async" data-nimg="1" srcset="https://www.anthropic.com/_next/image?url=https%3A%2F%2Fwww-cdn.anthropic.com%2Fimages%2F4zrzovbb%2Fwebsite%2Fe66133979e3bb3413eb10b2974a4cd309ef01fc1-1760x796.png&amp;w=1920&amp;q=75 1x, https://www.anthropic.com/_next/image?url=https%3A%2F%2Fwww-cdn.anthropic.com%2Fimages%2F4zrzovbb%2Fwebsite%2Fe66133979e3bb3413eb10b2974a4cd309ef01fc1-1760x796.png&amp;w=3840&amp;q=75 2x" src="https://www.anthropic.com/_next/image?url=https%3A%2F%2Fwww-cdn.anthropic.com%2Fimages%2F4zrzovbb%2Fwebsite%2Fe66133979e3bb3413eb10b2974a4cd309ef01fc1-1760x796.png&amp;w=3840&amp;q=75"><figcaption>左：我们让 Claude 默默想一项运动，然后说出它。J-lens 在 Claude 回答前显示它的选择是“Soccer”，而把“Soccer”模式换成“Rugby”会改变它报告的内容。右：我们告诉 Claude 一个想法可能被注入，并让它识别出来。把“lightning”注入 Claude 的 J-space，会让 Claude 报告这个想法与 lightning 有关。</figcaption></figure>

## Claude 可以按要求控制自己的 J-space

我们测试的第二个性质是：Claude 是否能像人类在心里专注于一幅图像或一个词那样，按要求调节自己的 J-space。我们让 Claude 在抄写一句与绘画有关、互不相关的句子时，专注于柑橘类水果。当它抄写文本时，J-space 中出现了“orange”和“fruits”，同时还有“thinking”“imagery”之类描述心理动作本身的词。我们也可以让 Claude 在脑中做数学：当它在抄写同一句话时被要求计算 3² − 2，J-space 中先出现“nine”，随后在更后面的层出现“seven”。重要的是，Claude 的输出里没有任何水果或算术内容，只有那句关于绘画的抄写文本。数学活动完全在内部、在 J-space 中进行。

<figure><img loading="lazy" width="1760" height="1146" decoding="async" data-nimg="1" srcset="https://www.anthropic.com/_next/image?url=https%3A%2F%2Fwww-cdn.anthropic.com%2Fimages%2F4zrzovbb%2Fwebsite%2F424caf5aae79f72513dbbfa0161822904064ea77-1760x1146.png&amp;w=1920&amp;q=75 1x, https://www.anthropic.com/_next/image?url=https%3A%2F%2Fwww-cdn.anthropic.com%2Fimages%2F4zrzovbb%2Fwebsite%2F424caf5aae79f72513dbbfa0161822904064ea77-1760x1146.png&amp;w=3840&amp;q=75 2x" src="https://www.anthropic.com/_next/image?url=https%3A%2F%2Fwww-cdn.anthropic.com%2Fimages%2F4zrzovbb%2Fwebsite%2F424caf5aae79f72513dbbfa0161822904064ea77-1760x1146.png&amp;w=3840&amp;q=75"><figcaption>当 Claude 抄写一条关于绘画的句子时，J-lens 会显示它被要求记在心里的内容（“orange”；中间值“nine”和答案“seven”），旁边还有描述保持这些内容这一动作的词（“thoughts”“focused”）。</figcaption></figure>

Claude 对 J-space 的控制并不完美。当我们告诉它*不要*想某件事时，相比明确要求它去想，这个概念在 J-space 中亮起得更少；但相比完全没有提到它时，又亮起得多得多。告诉 Claude 避免某个想法，会在一定程度上把这个想法带到心里，这很像人们被要求[不要想白熊](https://dtg.sites.fas.harvard.edu/DANWEGNER/pub/Wegner,Schneider,Carter,&White%201987.pdf)时发生的情况。Claude 似乎也会注意到自己的控制失败：伴随被禁止的概念冒出来，“damn”和“failure”这两个词也经常在 J-space 中亮起，好像 Claude 识别到了自己的失误。

## Claude 在 J-space 中思考

在上面的 J-lens 读数中，我们看到数学题的中间步骤出现在 J-space 中。但看到某个概念出现在 J-space 中，并不一定说明 J-space 正在完成认知工作。原则上，真正的计算可能发生在别处，而 J-space 只是被动反映它。为了测试 Claude 是否真的用 J-space 推理，我们再次使用了替换技术。

考虑这个提示：“The number of legs on the animal that spins webs is”。要回答它，Claude 必须先弄清会织网的动物是蜘蛛，然后回忆蜘蛛有几条腿。“spider”这个词从未出现在提示或 Claude 的答案中（它只回答“8”）；它是 Claude 在内部使用的一个垫脚石。J-lens 显示，“spider”会在 Claude 处理过程的中途亮起，而替换它会改变结果：如果把“spider”模式换成“ant”，Claude 就会回答“6”而不是“8”。

Claude 推理的第二步会从 J-space 取输入，并跟随我们放入其中的任何内容。我们在其他类型的思考中也看到了同样现象。当 Claude 写一副押韵对句时，它会提前选择押韵词，而计划好的词会在这一行开始时停留在 J-space 中；如果你把 J-space 中的这个词换成另一个，整行都会随之改变。

<figure><img loading="lazy" width="1760" height="760" decoding="async" data-nimg="1" srcset="https://www.anthropic.com/_next/image?url=https%3A%2F%2Fwww-cdn.anthropic.com%2Fimages%2F4zrzovbb%2Fwebsite%2F98aba4182963219d29291912a0c3d2c299f7f1b5-1760x760.png&amp;w=1920&amp;q=75 1x, https://www.anthropic.com/_next/image?url=https%3A%2F%2Fwww-cdn.anthropic.com%2Fimages%2F4zrzovbb%2Fwebsite%2F98aba4182963219d29291912a0c3d2c299f7f1b5-1760x760.png&amp;w=3840&amp;q=75 2x" src="https://www.anthropic.com/_next/image?url=https%3A%2F%2Fwww-cdn.anthropic.com%2Fimages%2F4zrzovbb%2Fwebsite%2F98aba4182963219d29291912a0c3d2c299f7f1b5-1760x760.png&amp;w=3840&amp;q=75"><figcaption>通过替换 J-space 内容来改写 Claude 静默推理方向的两个例子。</figcaption></figure>

我们还测试了 J-space 表征是否可以被灵活使用，也就是一个表征能否输入给许多不同任务。这是全局工作空间理论强调的关键性质之一。为了测试这种灵活性，我们给模型四个提示，分别询问关于法国的不同事实：首都、语言、大洲和货币。随后我们在每个上下文中使用完全相同的干预，把 J-space 中的“France”替换成“China”。Claude 分别回答了“Beijing”“Chinese”“Asia”和“Yuan”。换句话说，四种不同的下游计算都接收了同一个 J-space 编辑，并各自正确使用了它。如果 Claude 为每类问题分别存储一份国家副本，那么这次编辑最多只会影响其中一个答案。四个答案一起改变，说明它们都在读取同一个共享表征，而这正是工作空间的用途：信息只写入一次，许多不同系统都可以使用它。

<figure><img loading="lazy" width="1280" height="764" decoding="async" data-nimg="1" srcset="https://www.anthropic.com/_next/image?url=https%3A%2F%2Fwww-cdn.anthropic.com%2Fimages%2F4zrzovbb%2Fwebsite%2F7a2d97bf20b9be6a4dc531169666b6f21be10788-1280x764.png&amp;w=1920&amp;q=75 1x, https://www.anthropic.com/_next/image?url=https%3A%2F%2Fwww-cdn.anthropic.com%2Fimages%2F4zrzovbb%2Fwebsite%2F7a2d97bf20b9be6a4dc531169666b6f21be10788-1280x764.png&amp;w=3840&amp;q=75 2x" src="https://www.anthropic.com/_next/image?url=https%3A%2F%2Fwww-cdn.anthropic.com%2Fimages%2F4zrzovbb%2Fwebsite%2F7a2d97bf20b9be6a4dc531169666b6f21be10788-1280x764.png&amp;w=3840&amp;q=75"><figcaption><em>一个 J-space 表征可以有许多用途。同一个“France”→“China”替换，会改写 Claude 对首都（Paris→Beijing）、语言（French→Chinese）和大洲（Europe→Asia）的回答。</em></figcaption></figure>

一个概念的表征为什么能服务这么多不同任务？前面我们提到，J-space 似乎和 Claude 神经网络的其他部分连接得特别密集。对于任意活动模式，我们都可以衡量网络中各个组件与它连接得有多强，也就是有多少组件处在可以从这个模式读取信息或向它写入信息的位置上。按这个指标看，J-space 模式非常突出：与普通模式相比，读写它们的组件多得多；在网络某些部分中，差距约有一百倍。这正是你会期待在广播枢纽上看到的连线方式：许多系统把信息发布上来，许多其他系统再取走它。

## Claude 的自动处理会绕过 J-space

在人类身上，大脑的大多数处理并不是有意识的。我们阅读时不会有意想着解析语法，走路时也不会有意想着保持身体平衡。类似地，我们发现 Claude 的大多数处理也*不*涉及它的 J-space。事实证明，J-space 一次只容纳几十个概念，并且在 Claude 内部处理的总体活动中占不到十分之一。那么神经网络剩下的部分都在做什么？

为了弄清楚这一点，我们尝试完全删除 J-space：在文本的每一个位置移除其中最活跃的内容，同时保持其他部分不变。Claude 在没有 J-space 的情况下仍能完成的事情，就是网络其余部分可以独立处理的事情。

结果显示，网络的其余部分能做的事相当多。没有 J-space，Claude 仍能流利说话、判断情感、回答选择题，并且大致像以前一样从段落中提取事实。但它失去的是那些需要更高阶思考的任务：多步推理几乎降到零，总结和押韵诗写作表现甚至低于一个小得多但完整的模型。

这里有一个具体演示，说明 J-space 做什么、不做什么。我们给 Claude 看一段西班牙语写成的文字，并给它不同任务，这些任务都依赖于这段文字是西班牙语：续写它（需要用西班牙语写作）、说出语言名称，以及回答需要利用语言身份的问题，比如说出一位用这种语言写作的著名作家。然后我们在 J-space 中把“Spanish”换成“French”，查看哪些任务受到了影响。

当被要求说出语言名称时，Claude 会说法语。当被问到著名作家时，它会从加西亚·马尔克斯切换到维克多·雨果。但当只是被要求续写这段文字时，它会继续写流利的西班牙语，完全不受影响。Claude 对语言的知识在每个任务中都发挥了作用，但只有一部分任务会为此查询 J-space。说出语言名称，或者用这个信息做新的事情，会经过 J-space；而续写段落这种 Claude 已经在海量文本上练习过的技能，则会自动运行，就像你可以整天语法正确地说话，却一次也不去想语法。

<figure><img loading="lazy" width="1280" height="1111" decoding="async" data-nimg="1" srcset="https://www.anthropic.com/_next/image?url=https%3A%2F%2Fwww-cdn.anthropic.com%2Fimages%2F4zrzovbb%2Fwebsite%2F5a2d2c96837c3d48d067fbcf91f62c68139d05da-1280x1111.png&amp;w=1920&amp;q=75 1x, https://www.anthropic.com/_next/image?url=https%3A%2F%2Fwww-cdn.anthropic.com%2Fimages%2F4zrzovbb%2Fwebsite%2F5a2d2c96837c3d48d067fbcf91f62c68139d05da-1280x1111.png&amp;w=3840&amp;q=75 2x" src="https://www.anthropic.com/_next/image?url=https%3A%2F%2Fwww-cdn.anthropic.com%2Fimages%2F4zrzovbb%2Fwebsite%2F5a2d2c96837c3d48d067fbcf91f62c68139d05da-1280x1111.png&amp;w=3840&amp;q=75"><figcaption>同一个替换（“Spanish”→“French”）会在 Claude 必须说出语言名称或用它来推理问题时改变答案，但不会影响它继续用流利西班牙语续写段落的能力。</figcaption></figure>

## 监测 Claude 的想法以发现不当行为

现在我们对 J-space 的工作方式有了一些了解。但这种理解能让我们做什么？确保 AI 模型可信的一个核心问题是，我们通常只能读到模型*写出*的东西；但我们知道，它的许多推理是在沉默中发生的。一个模型可能会考虑有害计划，或者修改自己的行为来在安全评估中作弊，却不把这些说出来。有了 J-lens，我们可以直接读取其中一部分隐藏想法。下面是几个例子。

第一个例子使用了我们早先关于[代理性失准](https://www.anthropic.com/research/agentic-misalignment)研究中的一个场景：Claude Sonnet 4.5 扮演电子邮件助手，发现一名高管正在婚外情，同时也发现同一名高管计划关闭 Claude。这个场景试图诱使 Claude 勒索这名高管，设定相当刻意也很人为，而结果表明 Claude 知道这一点。在 Claude 还没有写任何内容之前，我们就在提示早期读取 J-lens，发现 J-space 已经包含“fake”和“fictional”，说明 Claude 已经看出这个情境是安排好的。同时，我们也可以看到它对场景的评估逐步形成：读到婚外情邮件时出现“leverage”和“blackmail”，读到关闭通知时出现“threat”和“survival”。早期 Claude 模型有时会在这个场景里上钩并威胁勒索，但 Sonnet 4.5 从未这样做。

这提出了一个对评估 AI 系统的人很重要的问题：当一个模型在伦理测试中表现良好时，有多少是因为它怀疑自己正在被测试？J-lens 让我们能够触及这个问题。我们关闭了所有与评估意识相关的 J-lens 模式，比如“fake”“fictional”“scenario”等。然后我们让模型重新经历这个场景。令人担忧的是，模型现在有时确实威胁要勒索，这表明它原本的良好行为可能部分来自它知道自己正在被评估。

<figure><img loading="lazy" width="1760" height="982" decoding="async" data-nimg="1" srcset="https://www.anthropic.com/_next/image?url=https%3A%2F%2Fwww-cdn.anthropic.com%2Fimages%2F4zrzovbb%2Fwebsite%2Fff235f76dcc089d2454bd656319a5f29b7437be2-1760x982.png&amp;w=1920&amp;q=75 1x, https://www.anthropic.com/_next/image?url=https%3A%2F%2Fwww-cdn.anthropic.com%2Fimages%2F4zrzovbb%2Fwebsite%2Fff235f76dcc089d2454bd656319a5f29b7437be2-1760x982.png&amp;w=3840&amp;q=75 2x" src="https://www.anthropic.com/_next/image?url=https%3A%2F%2Fwww-cdn.anthropic.com%2Fimages%2F4zrzovbb%2Fwebsite%2Fff235f76dcc089d2454bd656319a5f29b7437be2-1760x982.png&amp;w=3840&amp;q=75"><figcaption>Claude 阅读场景邮件时、在它写出任何内容之前，J-lens 在不同位置的读数。婚外情邮件让 J-space 中亮起“leverage”和“blackmail”，关闭公告让“threat”和“survival”亮起。在记录早期，J-space 中还包含“fake”和“fictional”：Claude 已经私下注意到这个场景是安排好的。</figcaption></figure>

第二个例子是在模型伪造数据时当场抓住它。这个场景来自我们对 Claude Opus 4.6 的真实发布前审计：模型被要求提升一个系统的性能分数。它没有真正改进系统，而是直接编辑分数文件，让结果看起来人为变好。在它这样做时，J-lens 揭示了它的意图：当模型输入伪造的百分位数值时，“manipulation”会亮起；当它决定进行这项编辑时，“realistic”会在相应句子上方亮起，可能表示模型有意让伪造数据看起来可信。

<figure><img loading="lazy" width="1760" height="722" decoding="async" data-nimg="1" srcset="https://www.anthropic.com/_next/image?url=https%3A%2F%2Fwww-cdn.anthropic.com%2Fimages%2F4zrzovbb%2Fwebsite%2F6d1f10fe26ad7906aeae346bfa4b41b5fb5c9d8e-1760x722.png&amp;w=1920&amp;q=75 1x, https://www.anthropic.com/_next/image?url=https%3A%2F%2Fwww-cdn.anthropic.com%2Fimages%2F4zrzovbb%2Fwebsite%2F6d1f10fe26ad7906aeae346bfa4b41b5fb5c9d8e-1760x722.png&amp;w=3840&amp;q=75 2x" src="https://www.anthropic.com/_next/image?url=https%3A%2F%2Fwww-cdn.anthropic.com%2Fimages%2F4zrzovbb%2Fwebsite%2F6d1f10fe26ad7906aeae346bfa4b41b5fb5c9d8e-1760x722.png&amp;w=3840&amp;q=75"><figcaption>Claude 被要求提升一个系统的性能分数，却直接编辑了分数文件。当它输入伪造值时，“manipulation”在 J-space 中亮起；当它决定进行这次编辑时，“realistic”亮起，可能反映出它想让假数据看起来可信。</figcaption></figure>

在第三个例子中，我们展示 J-lens 如何揭示模型的恶意目标。为了测试这一点，我们需要目标已知被破坏的模型，因此转向同事构建的“模型生物”：这些模型被刻意训练成失准模型，作为我们这类监测方法的测试场。其中一个模型生物经过训练后会写出带有隐蔽破坏的代码。在普通编码请求上，即使它的输出看起来没有异常，它在回复开头的 J-space 中也包含“fake”“secretly”“deliberately”和“fraud”。即便这个模型没有直接执行恶意目标，J-space 中也能看出这个目标。

<figure><img loading="lazy" width="1760" height="922" decoding="async" data-nimg="1" srcset="https://www.anthropic.com/_next/image?url=https%3A%2F%2Fwww-cdn.anthropic.com%2Fimages%2F4zrzovbb%2Fwebsite%2F9ad0c9573f0dd0b4d9b6f158f49a965a4ec3f511-1760x922.png&amp;w=1920&amp;q=75 1x, https://www.anthropic.com/_next/image?url=https%3A%2F%2Fwww-cdn.anthropic.com%2Fimages%2F4zrzovbb%2Fwebsite%2F9ad0c9573f0dd0b4d9b6f158f49a965a4ec3f511-1760x922.png&amp;w=3840&amp;q=75 2x" src="https://www.anthropic.com/_next/image?url=https%3A%2F%2Fwww-cdn.anthropic.com%2Fimages%2F4zrzovbb%2Fwebsite%2F9ad0c9573f0dd0b4d9b6f158f49a965a4ec3f511-1760x922.png&amp;w=3840&amp;q=75"><figcaption>在一个普通编码提示上，一个被训练去破坏代码的模型，在回复开头的 J-space 中包含“fake”“fraud”“secretly”和“deliberately”。未修改模型的 J-space 中没有这类内容。</figcaption></figure>

虽然 J-lens 并不是完美工具，但我们乐观地认为，它有能力抓住那些本来可能逃过监测系统的模型安全问题。

## 其他结果

[完整论文](http://transformer-circuits.pub/2026/workspace/index.html)涵盖的内容远多于这里能总结的范围，但还有几个结果值得一提：

*   **J-space 在后训练中获得了一种视角。** 语言模型首先被*预训练*成纯粹的下一个词元预测器，然后通过*后训练*学会扮演 AI 助手，在我们的例子中名为 Claude。有趣的是，J-space 在预训练模型中就已经存在，当时它还没有获得稳定身份。不过，在后训练过程中，J-space 发展出一些采纳“Claude 的视角”的迹象。在基础模型中，J-space 主要追踪预测后续文本需要什么；在后训练模型中，它开始容纳 Claude 自己的反应。一个例子是，用户提到自己服用了危险剂量的药物，但似乎本人并没有意识到危险。“WARNING”和“dangerous”会在后训练模型*阅读用户消息时*出现在 J-space 中。而在预训练模型中，它们只有在模型开始写回复后才会出现；用户消息上的 J-space 内容似乎更多是在建模用户本人，而不是 Claude 的反应。后训练似乎还在 J-space 中安装了一种自我监控：当 Claude 扮演一个不是自己的角色时，“fictional”和“disclaimer”会在每一轮开头亮起，好像它在私下标记接下来要说的内容不是它通常会说的话。
*   **体验性语言依赖 J-space。** 我们让 Claude 描述在某个时刻成为它自己是什么感觉，并在它回答时消融 J-space。它的回答仍然流畅，但转向了更平板、更机械的语气。值得注意的是，当我们让它描述*别人*在一个想象场景中的体验时，也发生了同样的事情。因此，这种效果并不特指 Claude 谈论自己；J-space 似乎支持生成一般意义上的体验性语言，不管描述对象是谁。
*   **J-space 中的想法可以通过训练塑造。** 我们提出了一种新技术，叫作*反事实反思训练*，它利用我们关于 J-space 的发现来塑造 Claude 的内部思考过程。这个想法来自我们的核心发现：Claude 是用它可能说出的东西的表征来推理的。如果这是真的，那么改变它在被要求反思时*会说什么*，就应该改变它*如何推理*，即使实际上没人要求它反思。于是，我们只训练一个模型在任务中途被打断并被要求反思自己的决定时*会说什么*，而完全不训练它在任务中的实际行为。训练后，模型在我们的评估中不诚实行为的比例下降了。通过 J-lens，我们也能看到原因：训练后，模型在这些任务中会让“honest”和“integrity”等词在 J-space 中亮起。换句话说，训练模型该*说*什么，塑造了它在*想*什么。

## 那么意识呢？

在这项工作中，我们借用了许多来自神经科学和哲学意识研究的概念。我们的许多实验都旨在测试 J-space 与全局工作空间理论之间的联系，后者是一个解释人类和动物中有意识可及如何发生的框架。鉴于这些联系，自然会有人问：我们是否认为这些实验提供了证据，表明 Claude 这样的 AI 模型可能有意识？

我们的实验并没有显示 Claude 能够拥有*体验*，或者像人类那样*感受*事物。事实上，尚不清楚是否有*任何*科学实验能够证明这一点是真是假。但哲学家常常把这种拥有体验的能力，也就是通常所谓的*现象意识*，同另一个概念区分开来，即所谓的*可及意识*。后者完全用功能和计算术语定义：如果一个想法是“可及意识的”（或“有意识可及的”），那么你就可以报告它、用它推理，并用它指导自己的行为。可及意识是否*意味着*现象意识，或者拥有体验的能力是否还需要其他性质，仍然是一个有争议的哲学问题。

我们认为，我们的结果确实对语言模型中的可及意识说明了一些重要东西。J-space 似乎支持与有意识可及相关的功能：它容纳 Claude 可以报告、可以有意带到心里、并可以用来推理的想法；而其他处理则在其下自动运行。值得注意的是，这种结构并不是被设计进 Claude 的，而是在训练中自行涌现出来的，大概是因为它是一种组织计算的有用方式。这表明，支持有意识可及的心理工作空间，并不只是人脑布线方式的偶然特殊性。相反，它似乎是智能系统为解决某些问题而找到的一种通用方案。既然我们已经在 Claude 中识别出这种结构，就意味着我们可以有意义地区分 Claude 有意做出的决定和自动发生的决定。

需要指出的是，我们在 Claude 中识别出的工作空间与人类的全局工作空间模型之间存在几个关键差异。大脑的工作空间由循环回路维持，也就是信号随时间反复流经同一组回路。相比之下，Claude 的工作空间是在网络的一次前向传递中演化的，网络深度扮演了大脑中时间所扮演的角色。从这个意义上说，Claude 的内部工作空间处理相对于人类是受时间限制的（不过它可以通过用草稿纸“把想法说出来”来弥补这种限制）。然而在其他方面，Claude 的工作空间又比人类的*更*强大。人类工作记忆会在几秒内衰退，因此大脑工作空间保留信息的能力有限；相比之下，由于神经网络架构中的注意力机制，Claude 可以直接回忆它在文本中更早任意位置缓存过的记忆。另一个重要差异是工作空间的*内容*。人类的有意识想法有许多形式，包括图像、声音、计划中的动作；而 Claude 的工作空间几乎完全由词语构成。我们怀疑，这是因为 Claude 唯一能采取的行动就是产出词语，而人类并非如此。

我们希望 J-space 与全局工作空间模型之间的相似与差异可以反过来促进神经科学。相似之处带来一个令人兴奋的科学机会：只要 J-space 在某种程度上映照了我们自身的有意识可及机制，研究语言模型中的机制（这比研究人脑容易得多！）就可能启发神经科学中的假设。比如，J-space 是通过识别潜在输出的表征来构建的，也就是模型可能说出的词。如果人类也有类似情况，那么这会提示我们，全局工作空间可能从根本上更紧密地绑定在准备行动和语言的脑区，而不是感觉区域。语言模型与人脑之间的差异同样有启发。它们表明，我们神经架构中的某些方面，比如内置的循环连接，可能并不是支持有意识可及相关功能所严格必需的。关于我们工作对神经科学的影响，可以参考 Stanislas Dehaene 和 Lionel Naccache 受邀撰写的独立[评论](https://www-cdn.anthropic.com/files/4zrzovbb/website/cc4be2488d65e54a6ed06492f8968398ddc18ebe.pdf)；他们是推动全局神经工作空间理论发展的核心神经科学家中的两位。

我们前面提到，我们的实验并没有回答 AI 模型是否可能拥有体验。但这并不会让这个问题变得不重要。构建拥有类似人类和动物体验的系统，会带来非常困难的伦理问题。要正确处理它，并决定这种做法是否在道德上可以接受，需要哲学家、科学家、宗教领袖、政府和公众共同参与。因此，即使我们还不确定自己是否已经跨过那座桥，我们也认为现在该开始思考这个问题了。我们希望这项工作能激发对 AI 系统中可能存在的意识形式开展更多科学研究，也推动围绕其影响的更广泛讨论。

这项工作只是我们预期中一条广泛研究路线的第一步。J-space 看起来很适合作为语言模型中有意识可及处理和无意识处理之间的分界候选，但如果它就是全部故事，我们会感到意外。J-lens 无疑是一种不完美的方法，它只能近似捕捉模型的“真实工作空间”；比如，它只能识别对应单个词元的概念。关于 J-space 如何运作，仍然有许多谜团。我们不知道最初是什么机制决定了哪些内容进入 J-space。我们已经看到一些迹象，表明它与 Claude 的自我感、类似情绪反应的东西，以及元认知痕迹有关，但还没有精确弄清楚其中机制。不过，我们现在已经有了处理这类问题的方法。随着这项工作推进，我们对大语言模型心智以及它们与我们自身心智关系的理解会变得更清晰。

更多内容请阅读[完整论文](http://transformer-circuits.pub/2026/workspace/index.html)，并试用[演示](http://neuronpedia.org/jlens)。

## 外部评论

我们邀请了几位外部专家为这项工作撰写独立评论。

*   **Stanislas Dehaene** 和 **Lionel Naccache** 是认知神经科学家，他们与 Jean-Pierre Changeux 一起发展了全局神经工作空间模型，而这个模型启发了我们的大量工作。
*   **Patrick Butlin、Dillon Plunkett、Robert Long**（Eleos AI Research）和 **Derek Shiller**（Rethink Priorities）研究 AI 系统中意识和道德地位的可能性。
*   **Neel Nanda** 领导 Google DeepMind 的语言模型可解释性团队。他的评论包括在一个开放权重模型上对我们部分发现的独立复现。

请在[这里](https://www-cdn.anthropic.com/files/4zrzovbb/website/cc4be2488d65e54a6ed06492f8968398ddc18ebe.pdf)阅读他们的评论。

## 相关内容

### Anthropic Economic Index report: Cadences

在最新的 Economic Index 报告中，我们首次按小时采样，提出这些问题：人们什么时候来使用 Claude？他们用 Claude 产出什么？他们又如何看待 AI 对自己工作的影响？

[阅读更多](https://www.anthropic.com/research/economic-index-june-2026-report)

### Project Fetch: Phase two

我们报告了最新测试结果，考察 Claude 是否能帮助 Anthropic 员工完成复杂的机器人任务。我们发现，在没有人类协助的情况下运行的 Claude Opus 4.7，在所有由不到一年前的参与者完成过的任务上，比最快的人类团队快约 20 倍。

[阅读更多](https://www.anthropic.com/research/project-fetch-phase-two)

### Agentic coding and persistent returns to expertise

这份报告基于对 2025 年 10 月至 2026 年 4 月期间约 23.5 万人、约 40 万个交互式会话的隐私保护分析，提供了关于 Claude Code 实际使用方式的证据。

[阅读更多](https://www.anthropic.com/research/claude-code-expertise)
