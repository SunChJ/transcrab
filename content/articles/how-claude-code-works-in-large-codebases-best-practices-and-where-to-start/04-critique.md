# Critique Notes

- has-h1: PASS
- code-fence-balanced: PASS
- emphasis-spacing: WARN (检测到可能的 ** 空白问题)
- table-rows: INFO (none)

- factual accuracy: PASS。保留原文结构、图像 HTML、链接、术语和部署建议，没有增加原文之外的事实。
- terminology drift: PASS。Claude Code、CLAUDE.md、hooks、skills、plugins、MCP、LSP、subagents 等关键术语保持一致；harness 首次译为“运行框架（harness）”。
- readability issues: PASS。已按企业工程读者语气处理，避免直译腔；critique 的 emphasis-spacing 为启发式误报，lint score 为 100。
