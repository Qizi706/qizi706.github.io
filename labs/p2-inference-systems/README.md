# P2 推理系统 Lab：公开 Starter

这是当前 **M2-C · Cached Multi-Head Attention** 的公开 Starter。网站和下载包提供当前未完成任务、历史任务书、所有 Gate 的空白工作表、公开评分器，以及运行当前任务所需的最小起点。

个人实现、已填写 Checkoff、第一次失败和历史实验结果不保存在本站仓库；它们由独立的私人 Git 仓库管理。

## 下载并开始

```bash
curl -LO https://zqwiki.cn/labs/p2-inference-systems.tar.gz
tar -xzf p2-inference-systems.tar.gz
cd p2-inference-systems
make setup
make grade
```

下载后可以直接编辑 `src/`、`tests/` 和本地工作表。当前 Starter 已保留 M2-A1、M2-A2 与 M2-B 的最小可运行前置能力，并在尚未实现的 M2-C 处失败。

当前任务书：[M2-C · Cached Multi-Head Attention](assignments/m2-c-cached-mha.md)。阶段依赖与状态从 [AI Infra 实验路线](/learning/)进入。

## 本站维护者的私人仓库

本站工作区中的 `.work/` 本身是一个独立 Git 仓库。所有实际作答都在其中完成：

```bash
cd labs/p2-inference-systems/.work
make setup
make grade
make test
git status
```

不要把 `.work/` 中的源码、测试、Checkoff 或结果复制回本站仓库。需要远端备份时，只为它连接私有 Git 远端。

## 公开文件边界

| 路径                                        | 公开内容                    |
| ------------------------------------------- | --------------------------- |
| `assignments/m2-b-causal-attention.md`      | M2-B 历史任务书             |
| `assignments/m2-c-cached-mha.md`            | 当前未完成任务              |
| `checkoffs/*.md`                            | 当前与历史 Gate 的空白模板  |
| `src/inference_lab/multi_head_attention.py` | M2-B 前置能力与 M2-C `TODO` |
| `tests/test_multi_head_attention.py`        | 前置能力回归测试            |
| `grader_tests/test_m2_c_cached_mha.py`      | 当前任务公开评分器          |

`lab.json` 使用 `task-archive` 发布策略。历史任务书和空白工作表可以公开；每份工作表都由不可变哈希保护。构建门禁会拒绝未登记模板、私人 `results/` 与 `.work/` 内容。

修改公开材料后运行：

```bash
cd ../..
npm run labs:check
npm run labs:publish
```
