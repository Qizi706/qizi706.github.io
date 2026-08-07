# ~/qizi706 博客写作指南

这个博客使用 Astro Content Collections 管理文章。所有文章都放在：

```text
src/content/blog/
```

文件名会成为文章 slug，Frontmatter 中的第一个分类会成为 URL 的第一段。例如：

```text
src/content/blog/linux-process.md
categories: ['OS']
                    ↓
/os/linux-process/
```

分类会自动转换为小写、适合 URL 的形式；没有分类的文章会放在
`/uncategorized/<slug>/` 下。调整第一个分类会同时改变文章地址，发布后应避免随意修改。

## 快速开始

复制下面的模板，新建 `src/content/blog/文章名.md`：

```md
---
title: '文章标题'
description: '一两句话概括文章内容，用于文章列表和 SEO。'
pubDate: '2026-08-06T12:00:00+08:00'
categories:
  - 'OS'
tags:
  - 'Linux'
  - 'Kernel'
draft: true
mathjax: false
---

这里写开场介绍。

## 第一节

这里写正文。

## 第二节

继续写正文。
```

建议在写作期间保持 `draft: true`，完成后改成 `false`。草稿不会出现在文章列表中，也不会生成公开文章页面。

## Frontmatter 字段

每篇文章开头的 `---` 区域是 Frontmatter：

| 字段          | 必填 | 说明                                      |
| ------------- | :--: | ----------------------------------------- |
| `title`       |  是  | 文章标题                                  |
| `description` |  是  | 文章摘要，用于列表和页面元数据            |
| `pubDate`     |  是  | 发布时间，建议使用带 `+08:00` 的 ISO 时间 |
| `updatedDate` |  否  | 最后更新时间，格式与 `pubDate` 相同       |
| `categories`  |  否  | 分类数组，会生成可筛选的分类归档          |
| `tags`        |  否  | 标签数组                                  |
| `draft`       |  否  | 默认 `false`；设为 `true` 时不发布        |
| `mathjax`     |  否  | 文章使用数学公式时设为 `true`             |
| `heroImage`   |  否  | 文章头图，必须引用 `src` 中的本地图片     |

分类和标签必须写成 YAML 数组，即使只有一个值：

```yaml
categories:
  - 'C/C++'
tags:
  - 'C++ 特性'
```

头图示例（路径相对于当前文章）：

```yaml
heroImage: '../../assets/blog-placeholder-1.jpg'
```

## Markdown 正文

文章支持标准 Markdown：

```md
## 二级标题

普通段落包含 **粗体**、_斜体_、`inline code` 和 [链接](https://example.com)。

- 无序列表
- 第二项

1. 有序列表
2. 第二项

> 普通引用内容
```

文章总标题已经由 Frontmatter 中的 `title` 生成，所以正文建议从 `##` 开始，不要重复写 `# 文章标题`。

### 代码块

在代码围栏后写语言名称即可启用语法高亮：

````md
```cpp
#include <iostream>

int main() {
    std::cout << "hello, world\n";
}
```
````

常见语言名称包括 `cpp`、`c`、`rust`、`go`、`python`、`javascript`、`typescript`、`bash`、`lua` 和 `text`。代码字体统一使用 Fira Mono。

### 图片

文章图片建议放在 `public/assets/` 的独立目录中：

```text
public/assets/linux-process/process-tree.png
```

然后在文章中从网站根目录引用：

```md
![Linux 进程树](/assets/linux-process/process-tree.png)
```

图片会保持原始比例显示，不带黑框、圆角或阴影。请填写有意义的替代文本，方便无障碍阅读，也便于图片加载失败时辨认内容。

如果需要控制图片尺寸、对齐方式或裁切模式，请使用 `.mdx` 和 `ArticleImage`：

```mdx
import ArticleImage from '../../components/ArticleImage.astro';

<ArticleImage
	src="/assets/linux-process/process-tree.png"
	alt="Linux 进程树"
	width={560}
	maxWidth="100%"
	align="center"
	fit="contain"
	caption="进程之间的父子关系"
/>
```

`width`、`height` 和 `maxWidth` 可以使用数字（按像素处理）或 CSS
尺寸字符串。`align` 支持 `left`、`center`、`right`，`fit` 支持
`contain`、`cover`、`fill`、`none` 和 `scale-down`。

### 提示块

支持以下五种提示块：`NOTE`、`TIP`、`IMPORTANT`、`WARNING`、`CAUTION`。

```md
> [!NOTE]
> 这里是一条补充说明。

> [!WARNING]
> 这里说明一个容易踩坑的地方。
```

### 数学公式

使用公式时，将 Frontmatter 中的 `mathjax` 设为 `true`：

```md
行内公式：$E = mc^2$

块级公式：

$$
T(n) = O(n \log n)
$$
```

公式实际由 KaTeX 在构建时渲染；`mathjax` 字段用于标记这篇文章包含数学内容。

### 静态图表

图表使用 SVG 或普通图片实现，存放到 `public/assets/<文章名>/` 后按普通 Markdown 图片引用：

```md
![从源码到可执行文件的构建流程](/assets/cpp-build-tools/build-flow.svg)
```

优先使用 SVG：文字和线条在高分屏上保持清晰，页面也不需要加载额外的客户端图表渲染器。

## 使用 SlideCard

`SlideCard` 是项目内置的文章卡片组件。使用组件的文章必须采用 `.mdx` 后缀：

```text
src/content/blog/course-notes.mdx
```

在 MDX 中可以直接使用组件，不需要手动 `import`：

````mdx
<SlideCard title="进程与线程">

## 进程是什么？

- 进程拥有独立地址空间
- 线程共享进程资源

```cpp
std::thread worker(task);
worker.join();
```

</SlideCard>
````

使用时注意：

- `<SlideCard>` 与正文之间保留空行，Markdown 才能稳定解析。
- `title` 是卡片顶部标题，可以省略。
- 一个组件只生成一张卡片；需要多张时写多个 `<SlideCard>`。
- 普通 `#` 标题不会自动生成卡片。
- `.md` 适合普通文章；需要 `SlideCard` 等组件时才使用 `.mdx`。

## 使用 CoreCard 和 Note

只能在 `.mdx` 文章中使用，并且不需要手动导入。

`CoreCard` 会显示 💻 图标；`CodeCard` 是完全相同的别名：

```mdx
<CoreCard
  title="Crazy OS"
  href="https://example.com/crazy-os"
  path="virtualization/crazy-os"
>

这是项目或代码示例的简介。标题和第一段会保持在同一行。

</CoreCard>
```

`Note` 会显示 📝 图标，适合总结和阅读材料：

```mdx
<Note title="Takeaways" name="takeaways">

操作系统通过虚拟内存为每个进程提供独立的地址空间。

</Note>

<Note title="阅读材料" name="readings">

- 第 12 章 - Dialogue
- 第 13 章 - Address Spaces

</Note>
```

可用属性：

- `CoreCard` / `CodeCard`：`title`、`href`、`path`、`class`。
- `Note`：`title`、`name`、`class`。
- `title` 可以省略，此时可以在组件内部自行编写标题和内容。

## 使用 ReasoningLoop

`ReasoningLoop` 用来表现“提出候选 → 验证 → 反馈 → 更正”的循环。它不是全局
MDX 组件，需要在文章中手动导入：

```mdx
import ReasoningLoop from '../../components/ReasoningLoop.astro';

export const reasoningStages = [
	{ label: '猜想', description: '根据约束与经验提出候选解。' },
	{ label: '验证', description: '使用证明、反例或实验检查候选解。' },
	{ label: '反馈', description: '定位候选解与事实之间的偏差。' },
	{ label: '更正', description: '保留有效部分并进入下一轮。' },
];

<ReasoningLoop steps={reasoningStages} />
```

每个步骤必须包含 `label` 和 `description`。组件会在窄屏中提供横向滚动，避免节点内容挤压或溢出。

## 本地预览

首次拉取项目后安装依赖：

```sh
npm install
```

按项目约定，以后台模式启动开发服务器：

```sh
astro dev --background
```

默认访问地址为 `http://localhost:4321`。管理后台服务器：

```sh
astro dev status
astro dev logs
astro dev stop
```

如果系统没有全局 `astro` 命令，可以通过项目依赖执行同样的命令：

```sh
npm run astro -- dev --background
npm run astro -- dev status
npm run astro -- dev logs
npm run astro -- dev stop
```

## 发布前检查

完成文章后：

1. 将 `draft` 改为 `false`。
2. 检查标题、摘要、分类、标签和图片替代文本。
3. 如果用了公式，确认 `mathjax` 开关为 `true`。
4. 运行类型与内容检查：

   ```sh
   npm exec astro check
   ```

5. 执行生产构建：

   ```sh
   npm run build
   ```

构建后的静态网站位于 `dist/`。

## 发布到 GitHub Pages

网站通过仓库根目录的 `.github/workflows/deploy.yml` 发布。工作流监听
`astro` 分支，因此完成检查后提交并推送即可触发部署：

```sh
git switch astro
git add .
git commit -m "[ASTRO]add: article title"
git push origin astro
```

随后在仓库的
[Deploy to GitHub Pages](https://github.com/Qizi706/qizi706.github.io/actions/workflows/deploy.yml)
页面查看构建与部署状态。仓库 `Settings → Pages → Build and deployment → Source`
应设置为 `GitHub Actions`。

如果 push 后没有产生新的 workflow run：

1. 使用 `git status --short --branch` 确认当前是 `astro`，并且已经同步到 `origin/astro`。
2. 查看 [GitHub Status](https://www.githubstatus.com/)，确认 Actions 和 Pages 均为 `Operational`。
3. 服务正常时，可以创建一个不修改文件的提交重新触发：

   ```sh
   git commit --allow-empty -m "chore: retrigger deploy"
   git push origin astro
   ```

工作流包含 `workflow_dispatch`，但 GitHub 只有在 workflow 文件存在于仓库默认分支时才显示
`Run workflow`。若按钮不可见，可以继续使用 `astro` 分支的 push 自动触发，或将该
workflow 同步到默认分支。

## 常见问题

### 为什么文章没有出现在列表里？

检查 `draft` 是否仍为 `true`，并确认 Frontmatter 字段通过了 `npm exec astro check`。

### 为什么 SlideCard 是空的？

确认文件后缀是 `.mdx`，组件开始和结束标签之间有空行，并且闭合标签拼写为 `</SlideCard>`。

### Markdown 和 MDX 应该选哪个？

- 只写文字、图片、代码或公式：使用 `.md`。
- 需要在正文中使用 `SlideCard`、`ArticleImage`、`ReasoningLoop` 等 Astro 组件：使用 `.mdx`。

MDX 包含 Markdown 的主要写法，但同时会解析 JSX/组件语法，因此正文中的 `<`、`>` 和 `{}` 需要更加谨慎。

## 相关文档

- [Astro Content Collections](https://docs.astro.build/en/guides/content-collections/)
- [Astro Components](https://docs.astro.build/en/basics/astro-components/)
- [Astro Markdown](https://docs.astro.build/en/guides/markdown-content/)
- [Astro MDX](https://docs.astro.build/en/guides/integrations-guide/mdx/)
- [Deploy Astro to GitHub Pages](https://docs.astro.build/en/guides/deploy/github/)
