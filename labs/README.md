# Labs：实现、Starter 与证据目录

这里是 AI Infra 实验的 Starter、实现边界与证据事实源。完整顺序从[实验路线总入口](/learning/)查看；本目录不再承担第二份路线。

## 实验材料怎样连接

```text
/learning/                   跨阶段 Syllabus：先学什么、依赖什么
  ├── /learning/phase-1/     Phase 1：请求链路与本地 Serving 基线
  │     └── serving-baseline 已完成的复现包
  └── /learning/phase-2/     Phase 2：机制、调度与性能工程
        └── kv-cache-batch   当前 Lab 与后续实验事实源
```

每个 Lab 统一使用下面的职责分层：

| 材料                              | 只回答什么                            | 不负责什么         |
| --------------------------------- | ------------------------------------- | ------------------ |
| 路线页                            | 当前位于哪一层，通过后解锁什么        | 不保存实现细节     |
| Lab `README.md`                   | 怎样下载、启动以及文件位于哪里        | 不随当前 Gate 重写 |
| `assignments/<gate>.md`           | 当前任务怎样执行和评分                | 不重复完整阶段路线 |
| `docs/gates/`                     | 预测、第一次失败、修正规则和 Checkoff | 不充当任务说明     |
| `src/` 与 `tests/`                | 实现与自动验收                        | 不替代实验解释     |
| `results/`、`logs/`、`responses/` | 原始证据与可重建派生结果              | 不用叙事覆盖事实   |
| 文章                              | 机制教材或完成后的实验报告            | 不跟踪今天的进度   |

正常执行链固定为：**路线页定位 → Assignment 执行 → Gate 工作表记录 → 测试/结果验收 → Checkoff → 下一模块**。

## 发布契约

每个 `labs/<slug>/` 必须提供只描述发布契约的 `lab.json`：

- `publish` 是公开文件白名单；未列出的目录默认不发布。
- `usage` 驱动网站 Lab 首页：`evidence` 展示复现包用法，`starter` 额外声明当前任务、公开源码与私人源码边界。
- `checks.required` 声明构建前必须存在的证据。
- `checks.csvRows` 固定关键原始数据的行数。
- 路线、当前状态和页面展示数据统一放在 `src/data/lab-roadmap/`，禁止写入 `lab.json`。
- 公开 `src/` 可以作为未完成 Starter；维护者的本地实现必须放入被忽略的 `.work/`。

本地 `.venv`、`.work`、缓存、临时输出和隐藏文件可以留在 Lab 内，但不能加入发布白名单。发布器拒绝私有路径和符号链接，避免答案泄露或文件越过 Lab 边界。

## 维护命令

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

- 先在实验路线中定义 Prerequisite、Question、Artifact、Checkoff 和 Unlocks。
- 建立 `labs/<slug>/lab.json`、稳定的 `README.md` 与 `assignments/`，在 `usage` 中声明网站使用入口。
- 只把明确可公开的顶层路径加入 `publish`。
- 为关键脚本、原始数据和说明文件增加 `checks.required`。
- 运行 `npm run labs:check && npm run labs:publish`。
- 打开 `/labs/<slug>/`；发布器会生成使用说明、目录页和整包下载，Markdown 由通用 `read` 路由渲染，其余文件直接打开原始产物。
