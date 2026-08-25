# 阶段 2 总路线与验收：LLM 推理核心知识与 vLLM 性能实验

这份文件是 2026.08.12—2026.09.12 阶段 2 的范围、依赖和验收标准，不是当前练习的逐步操作说明。目标是在一个月内理解推理系统的核心矛盾，并用真实 vLLM 实验解释调度、显存、Batching 与 KV Cache 如何共同决定吞吐和延迟。

本文明确区分“阶段 2 核心完成”和“进阶扩展”。不要因为阅读完一节就标记为完成；也不要让源码追踪、混合负载或跨环境迁移无限推迟原定的一月交付。

## 怎样使用这份计划

阶段 2 的材料按职责分层，不需要从头到尾同时打开：

| 需要                     | 唯一入口                            | 这份材料不负责什么                   |
| ------------------------ | ----------------------------------- | ------------------------------------ |
| 查看当前 Gate 和入口     | [阶段 2 共学页](/learning/phase-2/) | 不保存实现细节和原始证据             |
| 执行当前练习             | [`README.md`](../README.md)         | 不展开完整阶段路线和历史实验         |
| 查看依赖、验收和停止条件 | 本计划                              | 不重复当前练习的命令、提示和填写记录 |
| 填写预测、失败与结果     | [`docs/gates/M2.md`](gates/M2.md)   | 不定义阶段范围，也不充当教程         |
| 审计已经产生的证据       | [`results/`](../results) 与测试     | 不用叙事代替原始数据                 |

正常执行链是：**共学页定位当前 Gate → README 执行 → Gate 工作表记录 → 测试与 results 验收**。系统文章解释机制，实验文章总结已经完成的证据；两者都不决定当前进度。

## 0. 当前路线快照

### 已有证据

- 实现 No Cache、Dynamic KV Cache 与 Preallocated KV Cache。
- 三条路径与 Full Recompute Oracle 逐位置数值等价。
- 实现固定 `B=2` 的 Sequential 与 Batched Decode。
- Batched 输出、K Cache、V Cache 的 Shape 通过测试。
- 保存固定 `B=2` 的 300 条 Batch Length Scan 原始计时样本。
- 能解释 Batch 摊薄 Python/NumPy 调用开销，但不消除 Attention 工作。
- M0 结果已经回写阶段 2 中间机制实验文章。
- `B=1/2/4/8` 全部通过独立 Oracle、Shape 与状态隔离检查。
- M1 保存 240 条原始样本，并从 Raw CSV 生成汇总、两张曲线和 Knee 分析。
- M1 结果与证据边界已经回写实验文章。
- M2-A1 已完成 Head 轴变换的 Shape、非零坐标映射和内存共享验证。
- M2-A2 已完成 Q/K/V 投影、两个非零坐标 Oracle、五类非法配置与闭卷 Shape 推导。

### 当前缺口

- Cache Strategy 的历史测量支持 H2，但当前复现状态为 `Inconclusive`：450 条逐样本数据未保留。若要重新验证，必须生成独立的 `results/cache-strategy/raw.csv`，不能与其他实验共用文件，也不能把新测量冒充原始样本。
- 尚未实现 MHA/GQA 与 KV 容量对照。
- 尚未重新冻结真实 vLLM 环境。
- 尚无真实 vLLM 的 TTFT、TPOT、吞吐、显存、Input Length、Client Concurrency 与 Scheduler Budget 证据。
- 十个核心知识点已有文章说明，但还没有完成阶段末闭卷口述与实测交叉检查。
- Mixed Prefill/Decode、Prefix Reuse、源码追踪与跨环境迁移属于进阶扩展，不计入当前核心缺口。

### 当前唯一主任务

```text
M2-A1 Query Head 轴变换（Completed）
  -> M2-A2 Q/K/V 投影与输入契约（Completed）
  -> M2-B 无 Cache MHA Oracle（Current）
  -> M2-C Cached MHA
```

M2-B 通过验收前不进入 KV Cache 或 GQA 映射；M2 通过后立即进入 S0，不继续扩建 Toy Transformer。核心路线固定为：

```text
M2 -> S0 -> S1 -> S2 -> S3 -> S4 -> F0
```

## 1. 原始目标与两条完成线

### 1.1 一个月核心目标

核心问题不是“哪个模型跑分最高”，而是：

> 为什么 LLM Serving 不是单纯“模型越快越好”，而是调度、显存、Batching 与 KV Cache 共同决定系统性能？

阶段 2 的最终产出固定为：

> 《vLLM 推理性能实验：并发、Batch Size 与输入长度如何影响吞吐和延迟》

标题中的 Batch Size 只是对外表达。实验内部必须区分 Client Concurrency、Active Sequences、`max_num_seqs`、`max_num_batched_tokens` 与每轮实际 Scheduled Sequences。

### 1.2 十个核心知识点

| 原始要求                      | 当前证据                                          | 阶段末还要补什么                    |
| ----------------------------- | ------------------------------------------------- | ----------------------------------- |
| Transformer 推理流程          | 请求链路文章已解释完整请求与 Forward 路径         | 闭卷画出 Prefill/Decode 状态转换    |
| Attention 为什么需要 KV Cache | M0 已实现 No Cache、Dynamic 与 Preallocated Cache | 用真实 KV Usage 对照逻辑公式        |
| Prefill 为什么计算密集        | 系统文章已解释并行处理 Prompt                     | S2 用 Input Length 与 TTFT 验证     |
| Decode 为什么受内存和调度影响 | Toy Decode 已实现；带宽与调度机制已解释           | S3/S4 对齐 TPOT、Queue 与 Scheduler |
| Batch Size 对吞吐和延迟的影响 | M1 已完成 `B=1/2/4/8` Toy 曲线                    | S3/S4 验证真实动态 Batch            |
| Continuous Batching           | 系统文章已解释迭代级加入与退出                    | S3/S4 观察实际 Running/Waiting      |
| Prefix Caching                | 系统文章解释复用对象与边界                        | 核心阶段只需闭卷解释；S6 实验为扩展 |
| Speculative Decoding          | 已有候选生成、并行验证与分布保持说明              | 闭卷解释收益条件与拒绝成本          |
| Chunked Prefill               | 系统文章解释拆分 Prefill 的收益与竞争             | 核心阶段只需闭卷解释；S5 实验为扩展 |
| 显存组成                      | 已区分权重、KV、激活、Workspace 与 Runtime 开销   | S1–S4 保存可观测值和不可观测边界    |

文章是 `Explained` 的证据，不自动等于掌握。F0 必须在不看文章时重新回答，并用 S0–S4 的真实产物校正概念模型。

### 1.3 阶段 2 核心完成

只有同时满足下面五项，才标记 **Phase 2 Core Complete**：

1. **Explained**：闭卷解释上表十个核心知识点，以及 TTFT、TPOT、吞吐和显存指标。
2. **Implemented**：M2 的 MHA/GQA、Cache 等价性和 KV 容量公式通过正确性门禁；到此停止扩展 Toy Transformer。
3. **Measured**：完成 S0–S4，分别控制 Input Length、Client Concurrency 与 Scheduler Budget，保留每请求数据、服务端指标和内存记录。
4. **Reviewed**：至少用内置 `bench serve`、独立复跑和原始数据重建挑战一次汇总结论。
5. **Delivered**：完成最终 vLLM 性能文章；每条结论注明版本、模型、Backend、硬件、负载与证据边界。

### 1.4 进阶扩展

下面内容有价值，但不阻塞一个月核心交付：

- S5：Mixed Prefill/Decode 与 Chunked Prefill 对照；
- S6：Prefix Reuse 实验；
- R0：固定版本 Scheduler/KV/Runner 源码追踪；
- T0：换模型、Backend 或硬件后的迁移复跑。

`Reviewed` 的外部反馈和 `Transferred` 的跨环境验证在进阶扩展中继续提高证据等级，不能反向把尚未完成的 S0–S4 写成已掌握。

## 2. 每次学习都使用同一个契约

开始任何实验前，新建或补充一段记录：

```text
Question:
Prediction:
Time box:
Pre-read:
Controlled variable:
Fixed variables:
Action:
Artifact:
Acceptance:
Feedback source:
Result:
What changed:
Next decision:
```

执行顺序固定为：

```text
question
  -> prediction
  -> minimum necessary reading
  -> correctness Oracle
  -> implementation
  -> warm-up and repeated measurement
  -> raw artifact
  -> explanation
  -> review
  -> correction or next gate
```

### 通用实验纪律

执行实验时需逐项满足：

- 一次只改变一个主变量。
- 预测在运行实验之前写下。
- 前置阅读只选择会在当天第一段代码中使用的官方文档，默认不超过 15 分钟，并记录它确认或修正了哪条预测。
- 正确性检查在计时之前完成，不进入计时区间。
- 输入、权重、随机种子和环境在对照组之间保持一致。
- 保留全部原始样本，不只保存平均数或中位数。
- 报告 P50/P95；在线 Serving 还要报告 P99。
- 异常样本先保留并解释，不因图形不好看而删除。
- 客户端相关性不能直接写成 Scheduler 因果。
- 没有证据时使用 `Inconclusive` 或 `Not reached`。

## 3. 总路线

### 核心路线：一个月内完成

| ID  | 任务                      | 当前状态    | 直接产物                                  |
| --- | ------------------------- | ----------- | ----------------------------------------- |
| M0  | Cache、预分配、固定 `B=2` | Completed   | 测试、300 条长度扫描样本、机制实验文章    |
| P0  | Python/NumPy 语义         | Completed   | 六个可预测的小实验                        |
| M1  | Batch Size 曲线           | Completed   | `B=1/2/4/8` 原始数据与曲线                |
| M2  | MHA/GQA 与 KV 容量        | In progress | 正确性测试与容量表                        |
| S0  | vLLM 环境与可观测性       | Pending     | 环境快照与 Capability Matrix              |
| S1  | 单并发稳态与内存基线      | Pending     | 三轮 Serving 结果与显存组成表             |
| S2  | Input Length              | Pending     | TTFT/TPOT/E2E/KV/Memory 曲线              |
| S3  | Client Concurrency        | Pending     | 吞吐饱和点、尾延迟与内存压力              |
| S4  | Scheduler Budget          | Pending     | 配置上限、实际调度 Batch 与客户端指标对照 |
| F0  | 核心综合与阶段产出        | Pending     | vLLM 性能文章、复现包、结论矩阵与闭卷答辩 |

### 进阶扩展：不阻塞核心完成

| ID  | 任务                    | 当前状态 | 直接产物                     |
| --- | ----------------------- | -------- | ---------------------------- |
| S5  | Mixed Prefill/Decode    | Optional | Long Prefill 与 ITL 时间线   |
| S6  | Prefix Reuse            | Optional | Prefix Hit 与 TTFT 对照      |
| R0  | 固定版本源码追踪        | Optional | 状态机、调用链与验证性复跑   |
| T0  | 跨模型/Backend/硬件迁移 | Optional | 第二环境预测、复跑与差异解释 |

---

# Gate P0：Python/NumPy 语义热身

状态：**Completed（2026-08-19）**。

六个实验已保留运行前预测、实际结果、差异解释与断言；能够脱离代码解释 Binding、浅复制、基础切片、Advanced Indexing、`swapaxes`、`concatenate`、Stride 与 Buffer 分配，并把这些语义映射回 Attention/KV Cache。

完整记录见 [`docs/gates/P0.md`](gates/P0.md)，可执行例子见 [`examples/numpy_array_semantics.py`](../examples/numpy_array_semantics.py)。P0 已关闭，不再追加脱离当前主线的 Python 练习。

---

# Gate M1：Batch Size 曲线

状态：**Completed（2026-08-18）**。240 条原始样本、正确性测试、汇总公式测试、两张曲线与 Knee 分析均已通过验收。

核心问题：固定 `T=128` 时，Batch Size 从 1 增加到 8，会怎样改变 Batch Wall Time、每 Sequence 摊销成本与总吞吐？

预计三次学习，每次 90～150 分钟。

## M1-A：预测与正确性测试

### A1. 写下预测

运行前预测保存在 [`docs/gates/M1.md`](gates/M1.md)。当时冻结的内容是：

```text
H1：B 增大时，Batch Wall Time 会增加。
H2：Positions/s 会提高，但不会保持线性增长。
H3：Batch Wall Time / B 会下降，因为固定开销被摊薄。
H4：B=8 以内可能没有明确拐点；若没有，只能写 Not reached。
```

**已完成**

- 每条预测都写明可能推翻它的结果。
- 不先运行 Benchmark 偷看趋势。

### A2. 确认 M0 基线

```bash
OPENBLAS_NUM_THREADS=1 OMP_NUM_THREADS=1 \
  uv run python -m unittest discover -s tests -v
```

**已完成**

- 现有基线测试全部通过；当前测试总数为 6。
- 目录重命名和 Import 已通过测试与 Astro 构建验证。

### A3. 增加多 Batch Size 测试

在 `tests/test_attention.py` 增加：

```python
def test_batched_path_matches_oracle_for_batch_size_scan(self) -> None:
    ...
```

实现顺序：

**已完成**

1. 构造最大输入 `[8, T, D_model]`。
2. 依次取 `x[:1]`、`x[:2]`、`x[:4]`、`x[:8]`。
3. 每个 B 使用 `decode_without_cache` 逐 Sequence 生成 Oracle。
4. 调用 `batched_cached_attention`。
5. 使用 `subTest(batch_size=B)` 标记当前 Case。
6. 使用 `assert_allclose` 检查数值。
7. 检查以下 Shape：

```text
output:  [B, T, D_v]
K cache: [B, T, D_k]
V cache: [B, T, D_v]
```

### M1-A Acceptance

**已完成**

- `B=1/2/4/8` 全部与独立 Oracle 等价。
- 每个 B 的 Output/K/V Shape 正确。
- 能解释为什么只检查 Shape 无法证明 Batch 间没有状态泄漏。
- 任何 Oracle 失败时停止计时并先修复。

## M1-B：扩展 Benchmark

### B1. 保留旧实验

当前 `run_batch_benchmark(rows, batch_size=2)` 表示：

```text
固定 B=2，扫描 T
```

不要删除或改写它。新增：

```python
run_batch_size_benchmark(rows)
```

表示：

```text
固定 T=128，扫描 B
```

### B2. 增加常量

```python
BATCH_SIZES = (1, 2, 4, 8)
BATCH_SCAN_SEQUENCE_LENGTH = 128
```

### B3. 保持输入公平

只生成一次最大输入：

```python
x_max = rng.normal(
    size=(
        max(BATCH_SIZES),
        BATCH_SCAN_SEQUENCE_LENGTH,
        d_model,
    )
)
```

每个 B 使用：

```python
x = x_max[:batch_size].copy()
```

**已完成**

- B=1 的输入也是 B=8 的第一个 Sequence。
- 所有 B 共享同一组权重。
- `.copy()` 隔离不同实验输入的状态。

### B4. 随机化 B 的运行顺序

```python
execution_order = list(BATCH_SIZES)
rng.shuffle(execution_order)
```

**已完成**

- 保存实际运行顺序；当前 `raw.csv` 为 `4 → 1 → 8 → 2`。
- 输出汇总时按 B 排序。
- 不因顺序随机化而重新生成不同输入。

### B5. 正确性门禁放在计时之前

```text
construct input
  -> independent Oracle
  -> batched execution
  -> Shape assertions
  -> assert_allclose
  -> benchmark
```

**已完成**

- 输入和权重在计时区间外创建。
- Oracle 不进入计时。
- 每次被测函数内部重新创建自己的 Cache。

### B6. 测量两条路径

每个 B 测量：

```text
sequential_cached_attention
batched_cached_attention
```

每条路径：

**已完成**

- 每条 Path Warm-up 10 次；3 次 Warm-up 已验证不足以消除启动漂移。
- 正式计时 30 次。
- 使用 `experiment="batch_size_scan"` 记录。
- 保存所有样本，不只打印 Median。

### B7. 增加 CLI 实验选择

建议支持：

```text
--experiment all
--experiment cache
--experiment batch-length
--experiment batch-size
```

目标命令：

```bash
OPENBLAS_NUM_THREADS=1 OMP_NUM_THREADS=1 \
  uv run kv-cache-batch \
  --experiment batch-size \
  --csv results/batch-size-scan/raw.csv
```

Batch Size Scan 不能覆盖 `results/batch-length-scan/raw.csv`；每个实验必须拥有独立的结果目录。

## M1-C：汇总、曲线与解释

### C1. 计算指标

每个 B、每条路径计算：

```python
p50_ms = median(samples)
p95_ms = float(np.percentile(samples, 95))
```

Batched 路径额外计算：

```python
per_sequence_ms = p50_ms / batch_size

positions_per_second = (
    batch_size
    * sequence_length
    / (p50_ms / 1_000)
)

speedup = sequential_p50_ms / batched_p50_ms
```

术语边界：

- `Batch Wall Time`：整个 Batch 完成所需时间。
- `Wall Time / B`：每 Sequence 的摊销成本。
- `Positions/s`：Toy Lab 的总体处理速率。
- `Wall Time / B` 不是在线请求延迟。

### C2. 审计原始数据

预期：

```text
4 Batch Size × 2 Path × 30 Samples = 240 Rows
```

```bash
rg -c '^batch_size_scan,' results/batch-size-scan/raw.csv
```

**已完成**

- 得到 240。
- 每个 `(B, path)` 都恰好有 30 条记录。
- 没有 NaN、负耗时或缺失组。

### C3. 汇总表

```text
B | Batch P50 | Batch P95 | P50/B | Positions/s | Sequential/Batch
```

产物：[`results/batch-size-scan/summary.csv`](../results/batch-size-scan/summary.csv)。所有字段由 `kv-cache-batch-summary` 从 `raw.csv` 计算。

### C4. 生成两张独立曲线

不要用双轴图隐藏尺度差异。分别画：

1. `B -> Batch P50/P95`
2. `B -> Positions/s`

如果需要 Matplotlib：

```bash
uv add --dev matplotlib
```

**已完成**

- 图只从原始 CSV 生成。
- 图标题包含 `T=128`、dtype、BLAS Thread。
- 不手工复制汇总数字进绘图脚本。

### C5. 判断收益收窄

```text
gain(B) = throughput(B) / throughput(previous_B) - 1
```

操作性定义：相邻一级 B 的吞吐增幅低于 10%，认为收益明显收窄。

如果 `B<=8` 未满足：

```text
Knee: Not reached in B <= 8
```

当前原始数据计算得到：

```text
gain(2) = 61.27%
gain(4) = 36.19%
gain(8) = -0.21%
Knee: B=8
```

### M1 Acceptance

**已完成**

- 所有 B 通过 Oracle 与 Shape 检查。
- 原始 CSV 有 240 条完整样本。
- 能区分 Batch Wall Time、摊销成本、Positions/s 与请求延迟。
- 能解释为什么 Batch 加速不会达到 B 倍。
- 能说明当前实验不是 Continuous Batching。
- 结果和证据边界已回写实验文章。

产物：

```text
results/batch-size-scan/
├── raw.csv
├── summary.csv
├── batch-latency-percentiles.svg
├── positions-throughput.svg
└── knee-analysis.md
```

实验前预测最初保存在当时的 README，现已原样迁移到 M1 历史工作表；迁移只改变存放位置，没有按运行结果改写内容。

通过后不继续扫描更大的 B，进入 M2。

---

# Gate M2：MHA/GQA 与 KV 容量

按 A1、A2、B、C、D、E 六个小 Gate 推进；A1 与 A2 已完成，当前只执行 B。

目标不是实现完整 Transformer，而是掌握真实模型中 Query Head、KV Head 与 Cache 容量的关系。

### M2 子任务状态

| 子任务 | 状态      | 当前证据或缺口                                     |
| ------ | --------- | -------------------------------------------------- |
| M2-A1  | Completed | 3 项 Head 轴测试与当时完整 9 项回归测试通过        |
| M2-A2  | Completed | A2 定向 6 项、完整 12 项回归与闭卷 Shape 推导通过  |
| M2-B   | Current   | 待实现 `H_q=H_kv` 的无 Cache MHA 与独立标量 Oracle |
| M2-C   | Pending   | 等 B 通过后实现 Cached MHA                         |
| M2-D   | Pending   | 等 C 通过后实现 GQA Head 映射                      |
| M2-E   | Pending   | 等 D 通过后验证 MHA/GQA KV 容量公式与生成对照表    |

M2 整体仍是 **In progress**。M2-A1 与 M2-A2 已完成；`Current` 只表示当前应该执行 M2-B，不表示整个 M2 已经通过验收。

## M2-A1：Query Head 轴变换

状态：**Completed（2026-08-20 学习窗口，2026-08-21 提交证据）**。

已实现 `split_heads(projected, num_heads)`，将 `[B, T, H × D_head]` 变成 `[B, H, T, D_head]`。实际测试使用 `B=2, T=4, H=5, D_head=3`，避免所有维度相等掩盖轴错误。

**已完成**

- 为 `B/H/T/D_head` 写明轴语义。
- Shape 测试通过。
- 非零坐标元素映射 Oracle 通过。
- `split_heads` 结果与输入共享数据 Buffer。
- A1 定向测试与完整 9 项回归测试通过。

预测、首次失败、修正规则与闭卷验收保存在 [`docs/gates/M2.md`](gates/M2.md)。A1 已关闭，不再把后续 Q/K/V 投影计入 A1 完成状态。

## M2-A2：Q/K/V 投影与输入契约

状态：**Completed（2026-08-25）**。

`project_qkv` 已实现 Q/K/V 投影与 Head 拆分，`split_heads` 会在 `reshape` 前检查输入维度、Head 数与整除关系。A2 使用互不相等的关键维度，避免 Shape 偶然相等掩盖轴错误。

计划新增或修改：

```text
src/kv_cache_lab/multi_head.py
tests/test_multi_head.py
```

Shape：

```text
X: [B, T, D_model]
Q: [B, H_q,  T, D_head]
K: [B, H_kv, T, D_head]
V: [B, H_kv, T, D_head]
```

测试使用不相等的维度：

```text
B=2, T=5, D_model=7, H_q=4, H_kv=2, D_head=3
```

**已完成**

- 运行前的权重 Shape、Q/K/V Shape、Buffer 与非零坐标预测已保存。
- 三处定向阅读各留下了一句对预测的确认或修正。
- `project_qkv` 已实现，并得到 `Q=[2,4,5,3]`、`K/V=[2,2,5,3]`。
- 至少两个非零坐标的独立元素 Oracle 通过。
- 输入维度、Head 数、整除关系、权重宽度与 `D_head` 五类非法配置明确失败。
- A1 测试与完整 12 项回归测试保持通过。
- 运行后结果、首次失败、修正规则与闭卷推导已回写 [`docs/gates/M2.md`](gates/M2.md)。

A2 七项门禁已经关闭。历史预测与第一次非法配置失败继续保留，不因通过验收而改写。

## M2-B：实现无 Cache MHA Oracle

状态：**Current**。

前置条件已满足：M2-A2 已提供通过 Shape、元素与非法配置测试的 Q/K/V。这里不重复测试投影，也不提前实现 Cache、GQA Head 映射、Head 合并或 Output Projection。

固定参数：

```text
B=2, H_q=H_kv=3, T=4, D_head=5
Q/K/V:       [2,3,4,5]
Score/Weight: [2,3,4,4]
Output:       [2,3,4,5]
```

顺序：

**待完成**

1. 用 `Q @ swapaxes(K, -1, -2) / sqrt(D_head)` 独立计算每个 Batch/Head 的 Score。
2. 添加上三角 Causal Mask，让 Future Token 权重为零。
3. 只沿最后一个历史 Token Axis 做稳定 Softmax。
4. 用 `Weight @ V` 得到逐 Head Output。
5. 返回逐 Head Output 与 Weight；本 Gate 不合并 Head。

先只实现 `H_q=H_kv`。

测试：

**待完成**

- Score、Weight 与 Output Shape 正确。
- 至少两个非零坐标匹配不调用待测函数的独立标量 Oracle。
- 每行 Weight 在最后一维和为 1，且 Future Token 权重为 0。
- 修改 Future Token 不改变当前位置及之前的输出。
- 修改一个 Head 或一个 Batch 不污染其他切片。
- Q/K/V 不是四维或关键轴不匹配时，在矩阵乘法前抛出 `ValueError`。
- A2 与完整回归测试保持通过。
- 关闭代码后能重新推导 Score、Weight、Output Shape，并解释缩放与 Softmax Axis。

预测、120 分钟执行顺序与运行记录填写在 [`docs/gates/M2.md`](gates/M2.md)。全部通过后进入 M2-C；任一项失败时只修正 M2-B。

## M2-C：实现 Cached MHA

```text
t=0 -> append first K/V
t=1 -> attend K/V[0:2]
...
t=T-1 -> attend K/V[0:T]
```

**待完成**

- 每个位置与 Full Recompute Oracle 对照。
- 所有位置通过前不测性能。
- Cache Shape 始终保持 `[B, H_kv, current_T, D_head]`。

## M2-D：实现 GQA 映射

固定：

```text
H_q=8
H_kv=2
group_size=4
```

映射：

```text
query head 0,1,2,3 -> kv head 0
query head 4,5,6,7 -> kv head 1
```

必须检查：

```python
if h_q % h_kv != 0:
    raise ValueError(...)
```

**待完成**

- 不同 KV Head 使用不同测试数据。
- 非法 Head 数量触发明确异常。
- Query Head 到 KV Head 的映射有独立测试。

## M2-E：验证容量公式

```text
KV bytes = 2 × B × H_kv × T × D_head × dtype bytes
```

分别验证：

```text
MHA: H_q=8, H_kv=8
GQA: H_q=8, H_kv=2
```

```python
actual_bytes = k_cache.nbytes + v_cache.nbytes
```

**待完成**

- `actual_bytes == formula_bytes`。
- 固定其他变量时，GQA 逻辑 KV 字节为 MHA 的四分之一。
- 结论只写状态量减少，不外推为延迟或质量提高四倍。

## M2 Acceptance

**待完成**

- Full Recompute 与 Cached Decode 等价。
- 非法 Head 配置测试通过。
- Batch 与 Head 状态隔离测试通过。
- 实测字节与公式精确一致。
- 结果写入容量 CSV 和 MHA/GQA 对照表。

M2 后停止扩展 NumPy Toy Transformer。不要继续实现完整 MLP、Tokenizer 或 Sampling。

---

# Gate S0：冻结真实 vLLM 环境

预计一至两次学习。

阶段 1 的环境快照不能自动代表当前状态。必须重新采集实际版本与 Backend 能力。

建议产物：

```text
results/serving/s0/
├── environment.txt
├── versions.txt
├── server-command.txt
├── serve-help.txt
├── bench-help.txt
├── startup.log
├── health.txt
├── models.json
├── metrics.txt
└── capabilities.md
```

## S0.1 版本与环境

```bash
python --version
vllm --version
vllm collect-env
```

记录：

**待完成**

- 日期、OS、CPU/GPU/统一内存。
- Python 版本与环境路径。
- vLLM Core 版本或 Commit。
- Metal Plugin 版本或 Commit。
- 模型仓库、Revision、dtype、量化方式。

## S0.2 保存本机帮助

```bash
vllm serve --help=all
vllm bench serve --help
```

后续命令以本机帮助为准，不用最新版网页参数代替实际版本。

## S0.3 保存完整启动命令

至少包含：

**待完成**

- 模型路径与 Served Model Name。
- dtype、量化与最大上下文。
- `max_num_seqs`。
- `max_num_batched_tokens`。
- Prefix Cache 与 Chunked Prefill 配置。
- Backend/Plugin 参数和环境变量。

## S0.4 验证端点

```bash
curl -fsS http://127.0.0.1:8000/health
curl -fsS http://127.0.0.1:8000/v1/models
curl -fsS http://127.0.0.1:8000/metrics
```

## S0.5 Capability Matrix

```text
Capability | Supported | Argument accepted | Log confirmed | Metrics visible
```

至少检查：

**待完成**

- `bench serve`。
- `max_num_seqs`。
- `max_num_batched_tokens`。
- Chunked Prefill。
- Prefix Caching。
- Prometheus Metrics。

参数被 CLI 接受不等于 Backend 实际使用。

## S0 Acceptance

**待完成**

- 另一个人只看产物目录就能启动相同服务。
- 不支持的能力明确标成 `Unsupported`。
- 无法观察的状态明确标成 `Unobservable`。

不通过就不进入性能扫描。

---

# Gate S1：单并发稳态基线

预计两次学习。

## S1.1 固定负载

```text
input_len=128
output_len=64
num_prompts=64
max_concurrency=1
request_rate=inf
seed=42
warmups=8
```

模板必须先与 S0 保存的本机帮助对照：

```bash
vllm bench serve \
  --backend openai-chat \
  --base-url http://127.0.0.1:8000 \
  --endpoint /v1/chat/completions \
  --model <served-model-name> \
  --dataset-name random \
  --input-len 128 \
  --output-len 64 \
  --num-prompts 64 \
  --request-rate inf \
  --max-concurrency 1 \
  --num-warmups 8 \
  --seed 42 \
  --save-result \
  --save-detailed \
  --percentile-metrics ttft,tpot,itl,e2el \
  --metric-percentiles 50,95,99 \
  --result-dir results/serving/s1/run-1
```

## S1.2 独立运行三轮

**待完成**

- `run-1` 独立 Warm-up、详细结果、Metrics。
- `run-2` 独立 Warm-up、详细结果、Metrics。
- `run-3` 独立 Warm-up、详细结果、Metrics。
- 保存失败、超时与输出提前结束的请求。

## S1.3 检查稳定性

比较：

**待完成**

- Request Throughput。
- Output Token Throughput。
- TTFT P50/P95/P99。
- TPOT P50/P95/P99。
- ITL P50/P95/P99。
- E2E P50/P95/P99。

差异明显时优先检查模型编译、温度/功耗、系统负载、实际 Token 数、Fallback 和提前停止。

## S1.4 建立显存组成基线

不要把“总显存减去权重”直接写成 KV Cache。为每个可见内存量记录来源、采样时刻和证据等级：

| 组成                    | 记录方式                                  | 结果要求                      |
| ----------------------- | ----------------------------------------- | ----------------------------- |
| 模型权重                | 模型配置、dtype/量化与加载日志            | 实测值优先；估算值写明公式    |
| KV Cache                | Block 数、Block Size、KV Usage 或启动日志 | 与 M2 逻辑公式分层对照        |
| 激活                    | Backend 指标或峰值差分                    | 不可拆分时标记 `Unobservable` |
| 临时 Buffer / Workspace | 启动日志、Profiler 或峰值差分             | 不与激活重复计数              |
| Runtime 保留与碎片      | 加载前后、Warm-up 前后和稳态峰值          | 说明统一内存或设备显存口径    |

至少保存“服务启动前、模型加载后、Warm-up 后、稳态运行峰值”四个时刻。当前 Backend 无法拆分某一项时，保留总量与可观测边界，不用猜测填表。

## S1 Acceptance

**待完成**

- 三轮结果达到可解释的稳定性。
- 每个汇总值可追溯到每请求记录。
- 指标定义与内置工具保持一致。
- 完成权重、KV Cache、激活、临时 Buffer 与 Runtime 开销的显存组成表；不可观测项已明确标记。

---

# Gate S2：Input Length

只改变输入长度：

```text
input_len = 128, 512, 2048
output_len = 64
max_concurrency = 1
```

每个长度独立运行三轮。

记录：

**待完成**

- 实际 Prompt Token 数。
- TTFT、TPOT、ITL、E2E。
- Input/Output Token Throughput。
- 服务端 KV Usage。
- 每组长度的稳态与峰值内存，以及它与 KV Usage 的差异。

必须回答：

**待完成**

- Input Length 首先影响 Prefill 还是 Decode？
- TTFT 是否随输入增长？
- TPOT 是否也变化？
- KV Usage 是否增长？
- 没有 KV 指标时，哪些结论只能是相关性？

## S2 Acceptance

**待完成**

- 三组只改变 Input Length。
- 曲线可回溯到单请求记录。
- 无服务端 KV 证据时，KV 因果写成 `Inconclusive`。

---

# Gate S3：Client Concurrency

固定 Input/Output、模型、Scheduler、请求数和到达模式。

```text
max_concurrency = 1, 2, 4, 8, 16
```

记录：

**待完成**

- Request Throughput。
- Input Token Throughput。
- Output Token Throughput。
- TTFT/TPOT/ITL/E2E P50/P95/P99。
- Running/Waiting Requests。
- KV Usage。
- 稳态与峰值内存。

预先定义饱和点：

```text
并发提高一级后：
Output Token Throughput 增幅 < 10%
并且至少一个 P95 延迟恶化 > 20%
```

## S3 Acceptance

**待完成**

- 找到操作性饱和点，或明确写 `Not reached`。
- 能区分 Client Concurrency、Server Batch 和单轮 Scheduled Sequences。
- 不使用一个“吞吐”混写 Request/Input Token/Output Token Throughput。

---

# Gate S4：Scheduler Budget

使用 S3 中能稳定产生 Waiting Requests 的负载。

## S4.1 只扫描 `max_num_seqs`

**待完成**

- 选择较小值、默认值、较大值。
- 每个配置重启服务。
- 保存完整启动命令和日志。
- 客户端负载保持不变。

## S4.2 恢复后只扫描 `max_num_batched_tokens`

**待完成**

- 恢复 `max_num_seqs`。
- 选择较小值、默认值、较大值。
- 每个配置重启服务并保存日志。

## S4 Acceptance

**待完成**

- Backend 没有忽略参数。
- 工作负载实际触及被扫描限制。
- Waiting Requests 足够形成调度压力。
- KV 容量没有先成为限制，或已明确记录。
- 每个 Scheduler 配置保留实际 Scheduled Sequences/Token 数和峰值内存；无法观测时明确标记。
- 无法证明时使用 `Inconclusive`，不写“调大参数无效”。

核心路线到这里停止增加变量，直接进入 F0。下面的 S5、S6 与 R0 是进阶扩展，不是完成原始阶段 2 的前置条件。

---

# Gate F0：原始阶段产出与核心完成

核心路线从 S4 直接进入 F0；不要求先完成 S5、S6 或 R0。

最终目录至少包含：

```text
results/serving/
├── environment/
├── workloads/
├── raw/
├── metrics/
├── processed/
├── plots/
├── anomalies.md
└── reproduction.md
```

## F0.1 交叉检查

**待完成**

- 使用内置 `bench serve` 对照一次自定义聚合。
- 对最异常的一组结果独立复跑。
- 保留失败和超时请求。
- 从 Raw JSON/CSV 重新生成至少一张核心曲线。
- 逐项检查显存组成表中的实测、估算与 `Unobservable` 标签。

## F0.2 核心结论矩阵

每条预测只能标成 `Supported`、`Refuted` 或 `Inconclusive`，并写明版本、硬件、模型、Backend 与工作负载边界。

| 原始问题                                          | 必须使用的证据                                  |
| ------------------------------------------------- | ----------------------------------------------- |
| 输入变长怎样影响 Prefill、TTFT、TPOT 与 KV 占用？ | S2 每请求结果、KV Usage 与内存记录              |
| 并发增加怎样改变吞吐、排队与尾延迟？              | S3 吞吐/延迟分位数与 Running/Waiting            |
| “Batch Size”在动态 Serving 中到底指什么？         | S3/S4 的 Client Concurrency、预算与实际调度对照 |
| 调度预算何时提高吞吐，何时只增加竞争？            | S4 配置、日志、服务端状态与客户端指标           |
| 权重、KV、激活和临时 Buffer 怎样共同占用显存？    | S1 基线与 S2–S4 峰值内存表                      |
| Toy Batch 结论哪些迁移到 vLLM，哪些失效？         | M1 与 S3/S4 的同概念、不同系统对照              |

## F0.3 阶段产出

**待完成**

- 系统文章只保留机制模型，并用真实 S0–S4 证据修正边界。
- 当前《LLM 推理机制实验》继续作为 Toy Lab 中间产出，不改写成 GPU/vLLM 结果。
- 使用真实 vLLM 数据完成《vLLM 推理性能实验：并发、Batch Size 与输入长度如何影响吞吐和延迟》。
- 最终文章包含 Question、Prediction、环境、受控变量、Raw Evidence、曲线、异常、限制和 Next Decision。
- 文件真正产生后再添加文章与产物链接，不创建空链接充当完成进度。

## F0.4 最终闭卷答辩

不看文章回答：

1. Transformer 推理的 Prefill 与 Decode 分别执行什么？
2. Attention 为什么需要 KV Cache，它节省了什么又增加了什么？
3. Prefill 为什么更容易利用并行计算？
4. Decode 为什么更容易受内存带宽、Batching 和调度影响？
5. Client Concurrency、Active Sequences、Scheduler Budget 与实际 Batch 有什么区别？
6. Continuous Batching 怎样提高设备利用率，又会引入什么竞争？
7. Prefix Caching 复用了什么，为什么主要影响重复 Prefill？
8. Speculative Decoding 怎样提出并验证候选，收益取决于什么？
9. Chunked Prefill 为什么可能改善 Decode ITL，又会付出什么代价？
10. 模型权重、激活、KV Cache、临时 Buffer 与 Runtime 开销怎样组成显存占用？
11. TTFT、TPOT、ITL、E2E 和三种 Throughput 分别测量什么？
12. 为什么 LLM Serving 不是单纯“模型越快越好”？

## F0 Acceptance

**待完成**

- M2 与 S0–S4 的 Acceptance 全部通过。
- 最终 vLLM 性能文章和复现目录真实存在。
- 每个核心结论都能回到原始请求、服务端状态或明确的 `Inconclusive` 边界。
- 闭卷答辩能够连接调度、显存、Batching、KV Cache、吞吐与延迟。

满足以上四项后，阶段 2 标记为 **Core Complete**。S5、S6、R0 和 T0 尚未完成不影响这个状态。

---

# 进阶扩展：系统现象与源码因果

只有核心路线进度允许，或 F0 已完成后，才继续下面四项。它们不能挤占 S0–S4 和最终 vLLM 性能文章。

## Gate S5：Mixed Prefill/Decode

问题：一个长 Prompt 到来时，是否会干扰正在 Decode 的短请求？

### S5.1 先实现模拟 Async Harness

使用 `asyncio.sleep()` 模拟：

**待完成**

- 多个短请求。
- Semaphore Concurrency Gate。
- 延迟注入的长请求。
- Arrival/Admission/First Token/Token/Finish 时间戳。

必须能解释 Task、Event Loop、Semaphore，以及 Client Concurrency 为什么不是 Server Batch。

### S5.2 替换为真实流式 HTTP

每个请求保存 JSONL：

```json
{
	"request_id": "...",
	"arrival_ns": 0,
	"sent_ns": 0,
	"first_token_ns": 0,
	"token_times_ns": [],
	"finish_ns": 0,
	"status": "ok"
}
```

### S5.3 构造混合负载

```text
short: input=128, output=128
long:  input=2048, output=32
```

**待完成**

1. 先让短请求稳定 Decode。
2. 延迟注入一个长 Prompt。
3. 保存长请求 Arrival。
4. 对齐短请求 ITL 时间线。
5. 独立重复至少三次。

### S5.4 Chunked Prefill 对照

只有 S0 证明开关生效时才比较：

```text
Chunked Prefill off
Chunked Prefill on
```

其他变量全部保持不变。

### S5 Acceptance

**待完成**

- ITL 尖峰能在至少三次复跑中重现。
- 尖峰与长请求 Arrival 对齐。
- 只有开关被确认生效时才归因于 Chunked Prefill。

---

## Gate S6：Prefix Reuse

固定总 Input Length、Output Length、并发和请求数。

```text
A: random prefix
B: shared 512-token prefix
```

每组：

**待完成**

- 独立准备 Cache 状态。
- 保存真实 Token IDs 或 JSONL。
- 保存 Prefix Query/Hit Metrics。
- 保存 TTFT 分布。
- 保存实际输入与输出长度。

### S6 Acceptance

**待完成**

- 两组总输入长度一致。
- 实验组有 Prefix Hit 证据。
- 主要结论落在重复 Prefill 与 TTFT。
- 不把它写成 Decode 同比例加速。
- 只有 TTFT 改善却无命中证据时，结论保持相关性。

---

## Gate R0：固定版本源码追踪

不追最新版目录，使用 S0 中实际运行的 Core 与 Plugin 版本。

### R0.1 找到源码

```bash
python -c 'import inspect, vllm; print(inspect.getfile(vllm))'
```

**待完成**

- 记录 Core Commit。
- 记录 Plugin Commit。
- 记录实际 Package 路径。

### R0.2 选择一个已复现现象

优先选择：

**待完成**

- S3 吞吐饱和。
- S4 Budget 生效或不生效。
- S5 ITL 尖峰。
- S6 Prefix Hit。

不要脱离实验漫游源码。

### R0.3 追一条请求

```text
API admission
  -> request/sequence state
  -> Waiting/Running transition
  -> scheduler budget
  -> KV block allocate/append/free
  -> model runner
  -> output/finish/cancel
```

每层记录：

```text
file
function/class
input state
output state
invariant
related metric
```

必须回答：

**待完成**

- Waiting 何时进入 Running？
- Prefill 与 Decode 如何消费预算？
- KV Block 在哪里分配、追加、复用、释放？
- `max_num_seqs` 在哪里读取？
- `max_num_batched_tokens` 在哪里约束调度？
- 请求完成或取消怎样影响下一轮？
- Metal Plugin 替换或限制了哪一层？

### R0.4 回到实验验证

至少执行一个验证动作：

**待完成**

- 缩小 Token Budget。
- 改变请求到达方式。
- 开启详细日志。
- 构造能进入目标分支的负载。

源码阅读本身不算完成。

### R0 Acceptance

**待完成**

- 源码链路能解释一个已复现指标变化。
- 至少保留一个仍可能成立的替代解释。
- 完成一次验证性复跑。

---

## Gate T0：跨环境迁移（进阶扩展）

换一个模型、Backend 或硬件，重新完成：

**待完成**

- 写下哪些趋势应该保留。
- 写下哪些趋势可能变化。
- 重新冻结环境。
- 复跑一组基线和一组压力实验。
- 用差异修正原有机制模型。

T0 达到 `Transferred`，但不反向改变阶段 2 的一个月核心完成日期。

# 四周核心安排

| 时间        | 核心任务         | 可见产物                                       |
| ----------- | ---------------- | ---------------------------------------------- |
| 08.12–08.18 | M0、P0、M1       | Cache/Batch 实现、Raw CSV、曲线与中间机制文章  |
| 08.19–08.25 | M2-A1/A2，启动 B | Head 轴、Q/K/V 投影契约与无 Cache MHA 工作表   |
| 08.26–09.01 | 完成 M2、S0、S1  | MHA/GQA 容量表、环境快照与单并发稳态基线       |
| 09.02–09.08 | S2、S3、S4       | 输入长度、并发饱和点与 Scheduler Budget 对照   |
| 09.09–09.12 | F0               | 结论矩阵、复现包、闭卷答辩与最终 vLLM 性能文章 |

核心路线按依赖推进，但时间不足时首先缩小每个变量的扫描范围，不能用 S5/S6/R0/T0 挤占 S0–S4。某个 Gate 未通过时降低结论强度或修复观测能力，不通过增加阅读量掩盖问题。

# 主要参考

- [Python Data Structures](https://docs.python.org/3/tutorial/datastructures.html)
- [NumPy Copies and Views](https://numpy.org/doc/stable/user/basics.copies.html)
- [NumPy Broadcasting](https://numpy.org/doc/stable/user/basics.broadcasting.html)
- [vLLM CLI Guide](https://docs.vllm.ai/en/latest/cli/)
- [vLLM bench serve](https://docs.vllm.ai/en/latest/cli/bench/serve/)
- [vLLM serve arguments](https://docs.vllm.ai/en/latest/cli/serve/)
- [vLLM Metrics](https://docs.vllm.ai/en/stable/design/metrics/)
- [vLLM Automatic Prefix Caching](https://docs.vllm.ai/en/latest/design/prefix_caching/)
- [Accelerating Large Language Model Decoding with Speculative Sampling](https://arxiv.org/abs/2302.01318)
- [站内投机解码机制说明](/blog/conjecture-verification-practice/)
