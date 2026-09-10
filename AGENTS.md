## Development

Before validation, check whether port 4321 is already in use. If the dev server
is running there, inspect it directly; do not rebuild or start another server.

Start the dev server in foreground mode:

```
npm run dev
```

Stop the server with `Ctrl-C` in the same terminal.

## Writing Style and Preferences

### 已明确的偏好

- 全站列表使用 Markdown `-` 或 HTML `<ul>`，统一呈现圆点。弃用 `1.`、`2.`、`3.` 等有序列表标记；历史 Markdown 编号列表在渲染时统一转为圆点。
- 本地检查优先复用 4321 端口上的开发服务，具体遵循上面的 Development 约定。
- 终端对话中的数学表达使用可直接阅读的纯文本，具体遵循下面的 Terminal Math Formatting；文章中的公式按网站的 KaTeX 约定处理。

### 从现有文章归纳的默认写法

以下是从现有文章整理的写作参考，不是每篇文章必须套用的模板。用户当次的明确要求优先；历史文章和 README 中的旧用法不覆盖已确认的新偏好。

- 以中文讲解为主，保留准确、常见的英文技术术语。新概念先解释含义；代码标识符、命令和路径使用行内代码。
- 从一个具体问题、熟悉的代码片段或可观察现象进入主题，让读者先知道为什么需要理解它。围绕当前问题展开，不先堆概念、术语或架构清单。
- 由浅入深：先说明常用情形，再建立机制或语义模型，随后补充会影响实际使用的边界、反例和取舍。解释结果如何得到，以及它会影响哪个工程决定。
- 根据文章说明读者需要的基础和本文范围。已经会写代码的读者更需要补齐“为什么”，不必每篇从基础语法重新讲起，也不为追求全面而扩展无关主题。
- 用相连的短段落推进推理，语言具体、自然。可以使用提问、Quiz、少量幽默和第一人称反思；保留作者探索与修正的过程，不编造作者经历或已经完成的实验。
- 将“猜想 → 验证 → 反馈 → 更正”作为适合实践文章的组织方式。让例子、反例、测试或测量支撑结论，避免只给口诀、口号或没有来由的流程要求。
- 代码示例尽量小而完整，说明关键输入、预期行为和必要前提。区分可独立运行的程序、分组片段与伪代码；实验命令交代执行目录、依赖和观察方法。
- 区分语言规则、直觉类比、推导结论和实际测量。版本相关的规则说明版本基线；性能结论交代环境、变量与指标口径，示意数字不能写成实测结果。
- 概念讲解与较长的实验记录可以拆成互相链接、可独立阅读的文章。结尾留下能复用的判断方法、适用边界或自然衔接的下一步。

### 排版与素材

- 正文从 `##` 开始，文章总标题由 Frontmatter 生成。标题描述具体问题或内容，摘要说明本文解决什么问题。
- 并列要点使用圆点列表，对比和映射使用表格，推理过程用段落串联。代码围栏标明语言；只为关键判断加粗。
- 延续文章已有的普通 Markdown 或 MDX 形式。需要卡片时复用 `SlideCard`、`Note`、`CoreCard` / `CodeCard`：卡片围绕一个问题组织，笔记承载补充、判断或阅读材料，代码卡片关联示例与项目。不要为了统一外观把所有段落都改成卡片。
- 图片和图表服务于解释，可以沿用现有文章中适量的示意图与幽默配图。优先复用项目素材和 `ArticleImage`，图片放在对应文章的 `src/assets/` 目录，填写有意义的替代文本；简单静态技术图优先 SVG。
- 关键技术依据尽量链接到对应的官方文档、标准条款、论文或源码。链接放在相关解释附近，延伸阅读说明各资料能解决什么问题。
- 保持已有文章链接、资源路径和元数据的连续性，修改前核对实际路由实现与内容配置，不根据过时示例猜测文章地址。

## Terminal Math Formatting

- 终端对话不使用 LaTeX 数学定界符；短公式放在行内代码中，长公式和推导使用 `text` 代码块，每行一个公式。
- 优先使用可读的 Unicode 或纯文本，如 `a × b`、`x ≤ n`、`√n`。下标不清晰时使用 `mu`、`sigma`、`W_up`、`hidden_size` 等明确名称。
- 分数写成 `(numerator) / (denominator)`，复杂幂写成 `x^(n)`，张量形状写成 `X: [batch, sequence, hidden]`。
- 多步推导使用 `(E1)`、`(E2)` 等标签，并用文字解释每步变换。
- 用户明确要求 LaTeX 或需要提供 Markdown / LaTeX 文档源码时，在代码块内提供相应源码，必要时附终端可读版本。编辑网站文章时保留其公式语法，含公式的文章设置 `mathjax: true`。

## Documentation

Full documentation: https://docs.astro.build

Consult these guides before working on related tasks:

- [Adding pages, dynamic routes, or middleware](https://docs.astro.build/en/guides/routing/)
- [Working with Astro components](https://docs.astro.build/en/basics/astro-components/)
- [Using React, Vue, Svelte, or other framework components](https://docs.astro.build/en/guides/framework-components/)
- [Adding or managing content](https://docs.astro.build/en/guides/content-collections/)
- [Adding styles or using Tailwind](https://docs.astro.build/en/guides/styling/)
- [Supporting multiple languages](https://docs.astro.build/en/guides/internationalization/)
