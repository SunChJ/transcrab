# Revision Notes

- basedOnDraft: yes
- changes applied:
  - 视频展示适配优化：视频容器改为标准响应式结构（`.video-wrap`，`position:relative;width:100%;padding-top:74.63%`），iframe 铺满容器（`width:100%;height:100%`）。比例来自探测视频真实宽高比（804×600，约 4:3），取代 Cloudflare 原始布局的 `padding-top:53.46%`+`width:84%`（该布局依赖 Cloudflare 外部 CSS 的 `position:relative`，提取后丢失导致 iframe 绝对定位错位）。
  - 清理了先前手动补丁残留的嵌套 video-wrap（56.25% 外层 + 53.46% 内层），统一为单层标准容器。
  - 基于修复后的提取器（iframe/video 保留 + 真实比例探测）重新提取原文；提取器新增 `probeVideoAspectRatio`（poster JPEG/PNG 头解析）与 `computeEmbedPaddingTop`（探测优先，回退容器推导/16:9），站点 CSS 增加 `.video-wrap` 兜底样式。
  - 修复裸 `<script>` 文本吞页问题（`&lt;script&gt;` 转义）。
  - 译稿沿用此前复查过的修订：伪表格列标签中文化、相对值表达「消耗比 Chromium 少 X×」、「nerd snipe」纯意译等；数值与单位保持不变。
  - 04-critique.md 中 emphasis-spacing WARN 已核实为 CJK 加粗前后空格导致的误报，lint.report.json score 100、issues 为空。
- unresolved issues: 无。结构（标题/链接/代码块/figure/视频）与 source 完全对齐，56 个链接、10 个 figure、2 个代码块、2 个视频嵌入原样保留。
