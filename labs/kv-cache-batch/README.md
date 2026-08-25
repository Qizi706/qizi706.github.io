# KV Cache / Batch / MHA Lab

这是一个可下载、可评分、可复查的 AI Infra 实验包。公开目录中的 `src/` 始终是 **Starter**：它只包含开始当前任务所需的基础实现和刻意保留的 `TODO`，不会从维护者的本地实现自动更新。

当前任务是 [M2-B · Multi-Head Causal Attention](assignments/m2-b.md)。完整依赖与状态从 [AI Infra 实验路线](/learning/)进入。

## 下载者：直接使用公开 Starter

```bash
curl -LO https://zqwiki.cn/labs/kv-cache-batch.tar.gz
tar -xzf kv-cache-batch.tar.gz
cd kv-cache-batch
make setup
make grade
```

下载后直接编辑 `src/`。当前 Starter 预期通过 M2-A1/M2-A2，并在尚未实现的 M2-B 处失败。

## 仓库维护者：使用私有工作区

在本站仓库中，不要直接把个人实现写入公开 `src/`。第一次开始本地实现时运行：

```bash
cd labs/kv-cache-batch
make setup
make private-setup
make source-status
```

`make private-setup` 会把公开 Starter 复制到 `.work/src/`。此后 `make test`、`make grade` 和各 Gate 评分命令会自动使用 `.work/src/`；`.work/` 被 Git 忽略，也不在发布白名单中。

命令不会覆盖已有 `.work/`。公开发布前可以用下面的命令确认 Starter 与私有实现的边界：

```bash
make source-status
cd ../..
npm run labs:check
npm run labs:publish
```

## 文件职责

| 路径                      | 职责                                  |
| ------------------------- | ------------------------------------- |
| `lab.json`                | 公开文件白名单与证据门禁              |
| `assignments/`            | 每个 Gate 的任务范围、提示与评分命令  |
| `docs/roadmap.md`         | 阶段范围、依赖、验收和停止条件        |
| `docs/gates/`             | 预测、第一次失败、修正规则与 Checkoff |
| `src/`                    | 可公开下载的 Starter，不保存本地答案  |
| `.work/src/`              | 维护者本地实现，永不发布              |
| `tests/`、`grader_tests/` | 回归测试与公开评分                    |
| `results/`                | 原始数据和可重建的派生结果            |

执行链固定为：**路线页定位 → Assignment 执行 → Gate 工作表记录 → 测试与 results 验收 → Checkoff**。
