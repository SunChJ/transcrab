# Critique Notes

- has-h1: PASS
- code-fence-balanced: PASS
- emphasis-spacing: WARN (CJK 加粗前后空格误报，lint 实际 score 100，无真实问题)
- table-rows: INFO (none，原文为列式布局的伪表格，已按同样式保留)

- factual accuracy: PASS。性能表数字与 source 完全一致（380/1,173 ms·3.1×；229/877 ms·3.8×；57.8/271.0 MiB·4.7×；39.4/273.7 MiB·7.0×；1,148/637 ms·1.8×；820/472 ms·1.7×）；「215,000+ WPT 测试」「12 周」「May 首次提交」「3–7 倍」等关键数值核对一致；全部 56 个链接、10 个 figure、2 个代码块原样保留。
- media completeness: FIXED。复核原文发现 Doom 演示与 When is Kitesurf better? 两处各有一个 Cloudflare Stream 视频 iframe，原始提取未保留，已在 source.md/03-draft.md/zh.md 中补齐并验证构建渲染。
- terminology drift: PASS。产品/API 名（Kitesurf、Browser Run、Workers、Dynamic Workers、CDP、Puppeteer、Playwright、WPT、Blitz、Stylo、Boa JS、wasm-bindgen、Engine/PageScript/PageRenderer、SandboxOutbound、Quick Actions、Static Assets、MCP）全部保留；「栅格化」「提示注入」「隔离」「墙钟时间」等术语前后一致。
- readability issues: 伪表格的列标签（**Metric**、**Kitesurf, relative** 等）已在 final 阶段中文化以提升可读性；相对值表达改为「消耗比 Chromium 少 X×」消除歧义；其余长句已按中文语序重组。
