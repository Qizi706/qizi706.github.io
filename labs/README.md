# Labs

这里是博客实验的唯一事实源。源码、测试、原始数据和实验记录在这里维护；`public/labs/` 是生成区，不直接编辑。

## 目录契约

每个 `labs/<slug>/` 必须提供 `lab.json`：

- `publish` 是公开文件白名单；未列出的目录默认不发布。
- `checks.required` 声明构建前必须存在的证据。
- `checks.csvRows` 固定关键原始数据的行数。
- `progress` 可选；当前学习 Lab 用它向主页和 About 提供统一进度。

本地 `.venv`、缓存、临时输出和隐藏文件可以留在 Lab 内，但不能加入发布白名单。发布器还会拒绝符号链接，避免文件越过 Lab 边界。

## 日常操作

```bash
# 修改 Lab 后先检查 manifest 与证据
npm run labs:check

# 生成 public/labs/、原始文件副本与确定性 tar.gz
npm run labs:publish

# 完整站点门禁
npm run check
npm run build
```

`npm run dev`、`npm run build` 都会先刷新发布区。实验本身仍在各自的 `labs/<slug>/` 中运行；发布过程只复制已有证据，不重新执行 Benchmark。

## 新增 Lab

1. 建立 `labs/<slug>/lab.json` 与最小 `README.md`。
2. 只把明确可公开的顶层路径加入 `publish`。
3. 为关键脚本、原始数据和说明文件增加 `checks.required`。
4. 运行 `npm run labs:check && npm run labs:publish`。
5. 打开 `/labs/<slug>/`；通用路由会自动生成目录页、UTF-8 Viewer 与整包下载。
