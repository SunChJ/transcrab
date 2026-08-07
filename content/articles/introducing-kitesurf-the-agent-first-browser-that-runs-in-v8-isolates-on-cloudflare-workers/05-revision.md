# Revision Notes

- basedOnDraft: yes
- changes applied:
  - **补回 2 个 Cloudflare Stream 视频嵌入**：复核原文页面发现 Doom 演示与 "When is Kitesurf better?" 两处各有一个 `<iframe>` 视频（cloudflarestream.com），原始提取未保留，导致页面结尾/小节处"戛然而止"。已在 source.md、03-draft.md、zh.md 中补齐（标准 16:9 视频容器，iframe 参数与原文一致）。
  - 伪表格列标签中文化：**Metric**→**指标**、**Chromium (warm pool)**→**Chromium（预热池）**、**Kitesurf, relative**→**Kitesurf 相对值**；六行指标项（CPU/Memory/Wall time）及相对值说明译为中文，数值与单位（ms/MiB/×）保持不变。
  - 相对值表达修正：「节省 X 倍」改为「消耗比 Chromium 少 X×」，消除中文歧义。
  - "nerd snipe"（用技术难题勾住）改为纯意译「把团队其他人勾进这个深坑」，去除中英混排。
  - "higher parametric knowledge" 由「参数知识更强」改为「参数量更大、内置知识更多」。
  - 04-critique.md 中 emphasis-spacing WARN 已核实为 CJK 加粗前后空格导致的误报，lint.report.json score 100、issues 为空，无需修改。
- unresolved issues: 无。结构（标题/链接/代码块/figure/视频）与原文对齐，56 个链接、10 个 figure、2 个代码块、2 个视频嵌入原样保留。
