# Revision Notes

- basedOnDraft: yes
- changes applied:
  - 基于修复后的提取器（iframe/video 保留机制）重新提取原文：source.md 现在原生包含 2 个 Cloudflare Stream 视频嵌入（Doom 演示、When is Kitesurf better? 演示），无需手动补丁。
  - 译稿沿用此前复查过的修订：伪表格列标签中文化（指标/预热池/相对值）、相对值表达改为「消耗比 Chromium 少 X×」、「nerd snipe」纯意译、higher parametric knowledge 改为「参数量更大、内置知识更多」；数值与单位（ms/MiB/×）保持不变。
  - 04-critique.md 中 emphasis-spacing WARN 已核实为 CJK 加粗前后空格导致的误报，lint.report.json score 100、issues 为空。
- unresolved issues: 无。结构（标题/链接/代码块/figure/视频）与 source 完全对齐，56 个链接、10 个 figure、2 个代码块、2 个视频嵌入原样保留。
