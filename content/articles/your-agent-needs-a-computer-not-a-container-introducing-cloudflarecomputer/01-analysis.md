# Analysis Notes

- sourceTitle: Your agent needs a computer, not a container — introducing @cloudflare/computer
- sourceUrl: https://blog.cloudflare.com/cloudflare-computer/
- requestedMode: auto
- executionMode: refined
- terminology: 保留 @cloudflare/computer、@cloudflare/think、Cloudflare Workers、Durable Objects、Cloudflare Containers、Workspace、Code Mode、AI SDK、FUSE、just-bash、dynamic worker 等名称；isolate 保留英文并按语境解释为轻量隔离实例，agent harness 统一译为“智能体运行框架”，compute primitive 译为“计算原语”，backend 译为“执行后端”。
- audience-fit: 面向构建大规模智能体系统的 Cloudflare/Workers 开发者；保留横向/纵向扩展、按需容器、共享文件系统、执行后端、安全审计和完整 TypeScript 示例。
- tone/style risks: 保持早期预览发布稿的工程语气；不把实验性开源库写成成熟 GA 产品，不夸大“无需容器”——目标是让容器仅承担不足 10% 的工作，当前仍为 Linux/npm/原生二进制提供容器后端。

> Fill this file during translation analysis; keep it concise and actionable.
