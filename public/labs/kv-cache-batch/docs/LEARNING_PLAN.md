# 阶段 2 学习执行手册：从 Batch 到真实 vLLM Serving

这份文件是阶段 2 的唯一执行清单。实验文章负责解释结果，本文件负责回答“现在具体做什么、做到什么程度才可以继续”。

不要因为阅读完一节就勾选完成。只有对应的代码、测试、原始数据、解释与验收条件全部满足，任务才算完成。

## 0. 当前状态

### 已有证据

- [x] 实现 No Cache、Dynamic KV Cache 与 Preallocated KV Cache。
- [x] 三条路径与 Full Recompute Oracle 逐位置数值等价。
- [x] 实现固定 `B=2` 的 Sequential 与 Batched Decode。
- [x] Batched 输出、K Cache、V Cache 的 Shape 通过测试。
- [x] 保存固定 `B=2` 的 300 条 Batch Length Scan 原始计时样本。
- [x] 能解释 Batch 摊薄 Python/NumPy 调用开销，但不消除 Attention 工作。
- [x] M0 结果已经回写阶段 2 实验文章。
- [x] `B=1/2/4/8` 全部通过独立 Oracle、Shape 与状态隔离检查。
- [x] M1 保存 240 条原始样本，并从 Raw CSV 生成汇总、两张曲线和 Knee 分析。
- [x] M1 结果与证据边界已经回写实验文章。

### 当前缺口

- [ ] `examples/numpy_array_semantics.py` 已覆盖六类操作，但尚未保存事前预测、实际输出、差异解释和口述验收。
- [ ] Cache Strategy 当前只保留汇总结果；若需要逐样本复现，必须重新生成独立的 `results/cache-strategy/raw.csv`，不能与其他实验共用文件。
- [ ] 尚未实现 MHA/GQA 与 KV 容量对照。
- [ ] 尚未重新冻结真实 vLLM 环境。
- [ ] 尚无真实 Serving 的 Concurrency、Scheduler、Prefix Reuse 与源码证据。

### 当前唯一主任务

```text
完成 P0 NumPy 语义记录与口述验收
  -> 进入 M2 Shape 契约
  -> 实现 MHA/GQA Head 映射与 KV 容量对照
```

P0 通过验收前不进入 M2；M2 通过验收前不开始真实 Serving 实验。

## 1. 阶段 2 的掌握标准

阶段 2 完成时，我必须同时达到五个层次：

1. **Explained**：不看文章也能解释 Batch、KV Cache、MHA/GQA、TTFT、TPOT、ITL 和 Scheduler Budget。
2. **Implemented**：能独立修改 Attention、Batch、Cache 与实验 Harness，并处理 Shape 和状态隔离。
3. **Measured**：能控制变量、保存原始数据、报告分位数，并区分吞吐与延迟。
4. **Reviewed**：能用测试、内置工具、服务端 Metrics 或他人复现挑战自己的结论。
5. **Transferred**：换一个模型、Backend 或硬件后，仍能重新预测、实验和定位差异。

只完成文章或代码，不等于掌握。

## 2. 每次学习都使用同一个契约

开始任何实验前，新建或补充一段记录：

```text
Question:
Prediction:
Time box:
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

- [ ] 一次只改变一个主变量。
- [ ] 预测在运行实验之前写下。
- [ ] 正确性检查在计时之前完成，不进入计时区间。
- [ ] 输入、权重、随机种子和环境在对照组之间保持一致。
- [ ] 保留全部原始样本，不只保存平均数或中位数。
- [ ] 报告 P50/P95；在线 Serving 还要报告 P99。
- [ ] 异常样本先保留并解释，不因图形不好看而删除。
- [ ] 客户端相关性不能直接写成 Scheduler 因果。
- [ ] 没有证据时使用 `Inconclusive` 或 `Not reached`。

## 3. 总路线

| ID  | 任务                      | 当前状态    | 直接产物                           |
| --- | ------------------------- | ----------- | ---------------------------------- |
| M0  | Cache、预分配、固定 `B=2` | Completed   | 测试、300 条长度扫描样本、实验文章 |
| P0  | Python/NumPy 语义         | Completed   | 六个可预测的小实验                 |
| M1  | Batch Size 曲线           | Completed   | `B=1/2/4/8` 原始数据与曲线         |
| M2  | MHA/GQA 与 KV 容量        | In progress | 正确性测试与容量表                 |
| S0  | vLLM 环境与可观测性       | Pending     | 环境快照与 Capability Matrix       |
| S1  | 单并发稳态基线            | Pending     | 三轮详细 Serving 结果              |
| S2  | Input Length              | Pending     | TTFT/TPOT/E2E/KV 曲线              |
| S3  | Client Concurrency        | Pending     | 吞吐饱和点与尾延迟                 |
| S4  | Scheduler Budget          | Pending     | 配置上限与实际调度对照             |
| S5  | Mixed Prefill/Decode      | Pending     | Long Prefill 与 ITL 时间线         |
| S6  | Prefix Reuse              | Pending     | Prefix Hit 与 TTFT 对照            |
| R0  | 固定版本源码追踪          | Pending     | 状态机、调用链与验证性复跑         |
| F0  | 综合、复现与反馈          | Pending     | 复现包与两篇文章终稿               |

---

# Gate P0：Python/NumPy 语义热身

预计时间：120 分钟。

目标不是学完 Python，而是能在运行前预测当前 Lab 中的对象共享、View/Copy、Shape、Stride 和分配行为。

文件：`examples/numpy_array_semantics.py`

明日记录产物：`docs/NUMPY_SEMANTICS_NOTES.md`。只在写下事前预测后创建内容，不提前生成空文件充当进度。

## P0.1 已完成部分

- [x] `b = a`：两个名称绑定同一个 List。
- [x] `a.copy()`：Flat List 得到独立的浅复制容器。
- [x] `x[:, 0:1, :]`：基础切片与原 ndarray 共享 Buffer。

## P0.2 Advanced Indexing

运行前先写下对 Shape、内存共享和修改传播的预测，再追加：

```python
copied = x[[0, 1]]
copied[0, 0, 0] = 999

print("advanced shape:", copied.shape)
print("advanced shares:", np.shares_memory(x, copied))
print("original value:", x[0, 0, 0])
```

必须回答：

- [ ] `copied.shape` 是什么？
- [ ] 为什么 Advanced Indexing 产生 Copy？
- [ ] 修改 `copied` 为什么不会污染 `x`？

## P0.3 `swapaxes`

```python
swapped = np.swapaxes(x, -1, -2)

print("x shape:", x.shape)
print("swapped shape:", swapped.shape)
print("x strides:", x.strides)
print("swapped strides:", swapped.strides)
print("swap shares:", np.shares_memory(x, swapped))
```

必须回答：

- [ ] Shape 为什么从 `[2, 3, 4]` 变成 `[2, 4, 3]`？
- [ ] 数据有没有重新排列？
- [ ] Stride 为什么改变？
- [ ] View 没有复制数据，为什么仍可能影响访问性能？

## P0.4 `concatenate`

```python
joined = np.concatenate([x, x], axis=0)

print("joined shape:", joined.shape)
print("concatenate shares:", np.shares_memory(x, joined))
```

必须回答：

- [ ] 结果 Shape 是什么？
- [ ] 为什么 `concatenate` 需要新 Buffer？
- [ ] Dynamic KV Cache 每个 Decode Step 调用它会产生什么累计成本？

## P0.5 运行

```bash
cd /home/celeb/Programming/blogs/astro-site/public/labs/kv-cache-batch
uv run python examples/numpy_array_semantics.py
```

## P0 Acceptance

- [ ] 六个实验在运行前都有明确预测。
- [ ] 实际结果与预测逐项对照。
- [ ] 至少解释一个预测错误；如果没有错误，主动修改一个实验制造错误假设。
- [ ] 能脱离代码解释名称绑定、浅复制、View、Copy、Stride 与分配。
- [ ] 能指出哪些操作会污染原数组，哪些操作会给 Benchmark 增加复制成本。

通过后立即进入 M2，不继续阅读完整 Python 教程。

---

# Gate M1：Batch Size 曲线

状态：**Completed（2026-08-18）**。240 条原始样本、正确性测试、汇总公式测试、两张曲线与 Knee 分析均已通过验收。

核心问题：固定 `T=128` 时，Batch Size 从 1 增加到 8，会怎样改变 Batch Wall Time、每 Sequence 摊销成本与总吞吐？

预计三次学习，每次 90～150 分钟。

## M1-A：预测与正确性测试

### A1. 写下预测

在运行实验前，把以下预测写进 README：

```text
H1：B 增大时，Batch Wall Time 会增加。
H2：Positions/s 会提高，但不会保持线性增长。
H3：Batch Wall Time / B 会下降，因为固定开销被摊薄。
H4：B=8 以内可能没有明确拐点；若没有，只能写 Not reached。
```

- [x] 每条预测都写明可能推翻它的结果。
- [x] 不先运行 Benchmark 偷看趋势。

### A2. 确认 M0 基线

```bash
OPENBLAS_NUM_THREADS=1 OMP_NUM_THREADS=1 \
  uv run python -m unittest discover -s tests -v
```

- [x] 现有基线测试全部通过；当前测试总数为 6。
- [x] 目录重命名和 Import 已通过测试与 Astro 构建验证。

### A3. 增加多 Batch Size 测试

在 `tests/test_attention.py` 增加：

```python
def test_batched_path_matches_oracle_for_batch_size_scan(self) -> None:
    ...
```

实现顺序：

1. [x] 构造最大输入 `[8, T, D_model]`。
2. [x] 依次取 `x[:1]`、`x[:2]`、`x[:4]`、`x[:8]`。
3. [x] 每个 B 使用 `decode_without_cache` 逐 Sequence 生成 Oracle。
4. [x] 调用 `batched_cached_attention`。
5. [x] 使用 `subTest(batch_size=B)` 标记当前 Case。
6. [x] 使用 `assert_allclose` 检查数值。
7. [x] 检查以下 Shape：

```text
output:  [B, T, D_v]
K cache: [B, T, D_k]
V cache: [B, T, D_v]
```

### M1-A Acceptance

- [x] `B=1/2/4/8` 全部与独立 Oracle 等价。
- [x] 每个 B 的 Output/K/V Shape 正确。
- [x] 能解释为什么只检查 Shape 无法证明 Batch 间没有状态泄漏。
- [x] 任何 Oracle 失败时停止计时并先修复。

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

- [x] B=1 的输入也是 B=8 的第一个 Sequence。
- [x] 所有 B 共享同一组权重。
- [x] `.copy()` 隔离不同实验输入的状态。

### B4. 随机化 B 的运行顺序

```python
execution_order = list(BATCH_SIZES)
rng.shuffle(execution_order)
```

- [x] 保存实际运行顺序；当前 `raw.csv` 为 `4 → 1 → 8 → 2`。
- [x] 输出汇总时按 B 排序。
- [x] 不因顺序随机化而重新生成不同输入。

### B5. 正确性门禁放在计时之前

```text
construct input
  -> independent Oracle
  -> batched execution
  -> Shape assertions
  -> assert_allclose
  -> benchmark
```

- [x] 输入和权重在计时区间外创建。
- [x] Oracle 不进入计时。
- [x] 每次被测函数内部重新创建自己的 Cache。

### B6. 测量两条路径

每个 B 测量：

```text
sequential_cached_attention
batched_cached_attention
```

每条路径：

- [x] 每条 Path Warm-up 10 次；3 次 Warm-up 已验证不足以消除启动漂移。
- [x] 正式计时 30 次。
- [x] 使用 `experiment="batch_size_scan"` 记录。
- [x] 保存所有样本，不只打印 Median。

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

- [x] 得到 240。
- [x] 每个 `(B, path)` 都恰好有 30 条记录。
- [x] 没有 NaN、负耗时或缺失组。

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

- [x] 图只从原始 CSV 生成。
- [x] 图标题包含 `T=128`、dtype、BLAS Thread。
- [x] 不手工复制汇总数字进绘图脚本。

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

- [x] 所有 B 通过 Oracle 与 Shape 检查。
- [x] 原始 CSV 有 240 条完整样本。
- [x] 能区分 Batch Wall Time、摊销成本、Positions/s 与请求延迟。
- [x] 能解释为什么 Batch 加速不会达到 B 倍。
- [x] 能说明当前实验不是 Continuous Batching。
- [x] 结果和证据边界已回写实验文章。

产物：

```text
results/batch-size-scan/
├── raw.csv
├── summary.csv
├── batch-latency-percentiles.svg
├── positions-throughput.svg
└── knee-analysis.md
```

实验前预测保存在 README 的“下一步”记录中，没有在运行后补写一个伪装成事前记录的 `prediction.md`。

通过后不继续扫描更大的 B，进入 M2。

---

# Gate M2：MHA/GQA 与 KV 容量

预计三至四次学习。

目标不是实现完整 Transformer，而是掌握真实模型中 Query Head、KV Head 与 Cache 容量的关系。

## M2-A：固定 Shape 契约

新增：

```text
src/kv_cache_batch/multi_head.py
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

- [ ] 每个 Axis 都写明语义。
- [ ] 不使用所有维度都相等的输入掩盖 Axis 错误。

## M2-B：实现无 Cache MHA Oracle

顺序：

1. [ ] 投影 Q/K/V。
2. [ ] 把 Head 维放到 Sequence 前。
3. [ ] 每个 Head 独立计算 Causal Score。
4. [ ] 添加 Causal Mask。
5. [ ] 沿历史 Token Axis 做 Softmax。
6. [ ] 与 V 相乘。
7. [ ] 必要时合并 Head。

先只实现 `H_q=H_kv`。

测试：

- [ ] 每个 Head 使用自己的 K/V。
- [ ] 不同 Batch 不共享状态。
- [ ] Future Token 不可见。
- [ ] 修改一个 Head 的数据不会污染其他 Head。

## M2-C：实现 Cached MHA

```text
t=0 -> append first K/V
t=1 -> attend K/V[0:2]
...
t=T-1 -> attend K/V[0:T]
```

- [ ] 每个位置与 Full Recompute Oracle 对照。
- [ ] 所有位置通过前不测性能。
- [ ] Cache Shape 始终保持 `[B, H_kv, current_T, D_head]`。

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

- [ ] 不同 KV Head 使用不同测试数据。
- [ ] 非法 Head 数量触发明确异常。
- [ ] Query Head 到 KV Head 的映射有独立测试。

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

- [ ] `actual_bytes == formula_bytes`。
- [ ] 固定其他变量时，GQA 逻辑 KV 字节为 MHA 的四分之一。
- [ ] 结论只写状态量减少，不外推为延迟或质量提高四倍。

## M2 Acceptance

- [ ] Full Recompute 与 Cached Decode 等价。
- [ ] 非法 Head 配置测试通过。
- [ ] Batch 与 Head 状态隔离测试通过。
- [ ] 实测字节与公式精确一致。
- [ ] 结果写入容量 CSV 和 MHA/GQA 对照表。

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

- [ ] 日期、OS、CPU/GPU/统一内存。
- [ ] Python 版本与环境路径。
- [ ] vLLM Core 版本或 Commit。
- [ ] Metal Plugin 版本或 Commit。
- [ ] 模型仓库、Revision、dtype、量化方式。

## S0.2 保存本机帮助

```bash
vllm serve --help=all
vllm bench serve --help
```

后续命令以本机帮助为准，不用最新版网页参数代替实际版本。

## S0.3 保存完整启动命令

至少包含：

- [ ] 模型路径与 Served Model Name。
- [ ] dtype、量化与最大上下文。
- [ ] `max_num_seqs`。
- [ ] `max_num_batched_tokens`。
- [ ] Prefix Cache 与 Chunked Prefill 配置。
- [ ] Backend/Plugin 参数和环境变量。

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

- [ ] `bench serve`。
- [ ] `max_num_seqs`。
- [ ] `max_num_batched_tokens`。
- [ ] Chunked Prefill。
- [ ] Prefix Caching。
- [ ] Prometheus Metrics。

参数被 CLI 接受不等于 Backend 实际使用。

## S0 Acceptance

- [ ] 另一个人只看产物目录就能启动相同服务。
- [ ] 不支持的能力明确标成 `Unsupported`。
- [ ] 无法观察的状态明确标成 `Unobservable`。

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

- [ ] `run-1` 独立 Warm-up、详细结果、Metrics。
- [ ] `run-2` 独立 Warm-up、详细结果、Metrics。
- [ ] `run-3` 独立 Warm-up、详细结果、Metrics。
- [ ] 保存失败、超时与输出提前结束的请求。

## S1.3 检查稳定性

比较：

- [ ] Request Throughput。
- [ ] Output Token Throughput。
- [ ] TTFT P50/P95/P99。
- [ ] TPOT P50/P95/P99。
- [ ] ITL P50/P95/P99。
- [ ] E2E P50/P95/P99。

差异明显时优先检查模型编译、温度/功耗、系统负载、实际 Token 数、Fallback 和提前停止。

## S1 Acceptance

- [ ] 三轮结果达到可解释的稳定性。
- [ ] 每个汇总值可追溯到每请求记录。
- [ ] 指标定义与内置工具保持一致。

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

- [ ] 实际 Prompt Token 数。
- [ ] TTFT、TPOT、ITL、E2E。
- [ ] Input/Output Token Throughput。
- [ ] 服务端 KV Usage。

必须回答：

- [ ] Input Length 首先影响 Prefill 还是 Decode？
- [ ] TTFT 是否随输入增长？
- [ ] TPOT 是否也变化？
- [ ] KV Usage 是否增长？
- [ ] 没有 KV 指标时，哪些结论只能是相关性？

## S2 Acceptance

- [ ] 三组只改变 Input Length。
- [ ] 曲线可回溯到单请求记录。
- [ ] 无服务端 KV 证据时，KV 因果写成 `Inconclusive`。

---

# Gate S3：Client Concurrency

固定 Input/Output、模型、Scheduler、请求数和到达模式。

```text
max_concurrency = 1, 2, 4, 8, 16
```

记录：

- [ ] Request Throughput。
- [ ] Input Token Throughput。
- [ ] Output Token Throughput。
- [ ] TTFT/TPOT/ITL/E2E P50/P95/P99。
- [ ] Running/Waiting Requests。
- [ ] KV Usage。

预先定义饱和点：

```text
并发提高一级后：
Output Token Throughput 增幅 < 10%
并且至少一个 P95 延迟恶化 > 20%
```

## S3 Acceptance

- [ ] 找到操作性饱和点，或明确写 `Not reached`。
- [ ] 能区分 Client Concurrency、Server Batch 和单轮 Scheduled Sequences。
- [ ] 不使用一个“吞吐”混写 Request/Input Token/Output Token Throughput。

---

# Gate S4：Scheduler Budget

使用 S3 中能稳定产生 Waiting Requests 的负载。

## S4.1 只扫描 `max_num_seqs`

- [ ] 选择较小值、默认值、较大值。
- [ ] 每个配置重启服务。
- [ ] 保存完整启动命令和日志。
- [ ] 客户端负载保持不变。

## S4.2 恢复后只扫描 `max_num_batched_tokens`

- [ ] 恢复 `max_num_seqs`。
- [ ] 选择较小值、默认值、较大值。
- [ ] 每个配置重启服务并保存日志。

## S4 Acceptance

- [ ] Backend 没有忽略参数。
- [ ] 工作负载实际触及被扫描限制。
- [ ] Waiting Requests 足够形成调度压力。
- [ ] KV 容量没有先成为限制，或已明确记录。
- [ ] 无法证明时使用 `Inconclusive`，不写“调大参数无效”。

---

# Gate S5：Mixed Prefill/Decode

问题：一个长 Prompt 到来时，是否会干扰正在 Decode 的短请求？

## S5.1 先实现模拟 Async Harness

使用 `asyncio.sleep()` 模拟：

- [ ] 多个短请求。
- [ ] Semaphore Concurrency Gate。
- [ ] 延迟注入的长请求。
- [ ] Arrival/Admission/First Token/Token/Finish 时间戳。

必须能解释 Task、Event Loop、Semaphore，以及 Client Concurrency 为什么不是 Server Batch。

## S5.2 替换为真实流式 HTTP

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

## S5.3 构造混合负载

```text
short: input=128, output=128
long:  input=2048, output=32
```

1. [ ] 先让短请求稳定 Decode。
2. [ ] 延迟注入一个长 Prompt。
3. [ ] 保存长请求 Arrival。
4. [ ] 对齐短请求 ITL 时间线。
5. [ ] 独立重复至少三次。

## S5.4 Chunked Prefill 对照

只有 S0 证明开关生效时才比较：

```text
Chunked Prefill off
Chunked Prefill on
```

其他变量全部保持不变。

## S5 Acceptance

- [ ] ITL 尖峰能在至少三次复跑中重现。
- [ ] 尖峰与长请求 Arrival 对齐。
- [ ] 只有开关被确认生效时才归因于 Chunked Prefill。

---

# Gate S6：Prefix Reuse

固定总 Input Length、Output Length、并发和请求数。

```text
A: random prefix
B: shared 512-token prefix
```

每组：

- [ ] 独立准备 Cache 状态。
- [ ] 保存真实 Token IDs 或 JSONL。
- [ ] 保存 Prefix Query/Hit Metrics。
- [ ] 保存 TTFT 分布。
- [ ] 保存实际输入与输出长度。

## S6 Acceptance

- [ ] 两组总输入长度一致。
- [ ] 实验组有 Prefix Hit 证据。
- [ ] 主要结论落在重复 Prefill 与 TTFT。
- [ ] 不把它写成 Decode 同比例加速。
- [ ] 只有 TTFT 改善却无命中证据时，结论保持相关性。

---

# Gate R0：固定版本源码追踪

不追最新版目录，使用 S0 中实际运行的 Core 与 Plugin 版本。

## R0.1 找到源码

```bash
python -c 'import inspect, vllm; print(inspect.getfile(vllm))'
```

- [ ] 记录 Core Commit。
- [ ] 记录 Plugin Commit。
- [ ] 记录实际 Package 路径。

## R0.2 选择一个已复现现象

优先选择：

- [ ] S3 吞吐饱和。
- [ ] S4 Budget 生效或不生效。
- [ ] S5 ITL 尖峰。
- [ ] S6 Prefix Hit。

不要脱离实验漫游源码。

## R0.3 追一条请求

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

- [ ] Waiting 何时进入 Running？
- [ ] Prefill 与 Decode 如何消费预算？
- [ ] KV Block 在哪里分配、追加、复用、释放？
- [ ] `max_num_seqs` 在哪里读取？
- [ ] `max_num_batched_tokens` 在哪里约束调度？
- [ ] 请求完成或取消怎样影响下一轮？
- [ ] Metal Plugin 替换或限制了哪一层？

## R0.4 回到实验验证

至少执行一个验证动作：

- [ ] 缩小 Token Budget。
- [ ] 改变请求到达方式。
- [ ] 开启详细日志。
- [ ] 构造能进入目标分支的负载。

源码阅读本身不算完成。

## R0 Acceptance

- [ ] 源码链路能解释一个已复现指标变化。
- [ ] 至少保留一个仍可能成立的替代解释。
- [ ] 完成一次验证性复跑。

---

# Gate F0：综合、复现与阶段完成

最终目录：

```text
results/serving/
├── environment/
├── workloads/
├── raw/
├── metrics/
├── processed/
├── plots/
├── source-trace.md
├── anomalies.md
└── reproduction.md
```

## F0.1 交叉检查

- [ ] 使用内置 `bench serve` 对照一次自定义聚合。
- [ ] 对最异常的一组结果独立复跑。
- [ ] 保留失败和超时请求。
- [ ] 让另一个人或隔离环境复现一组核心结果。

## F0.2 结论矩阵

每条预测只能标成：

```text
Supported
Refuted
Inconclusive
```

并写明：

- [ ] 版本。
- [ ] 硬件。
- [ ] 模型。
- [ ] Backend。
- [ ] 工作负载边界。

## F0.3 更新两篇文章

- [ ] 系统文章回写真实 Scheduler/KV/Runner 机制。
- [ ] 实验文章回写全部数据、异常、限制和结论矩阵。
- [ ] 所有结果链接到真实产物，不创建空链接充当进度。

## F0.4 最终答辩

不看文章回答：

1. Batch 为什么提高吞吐却可能恶化延迟？
2. Client Concurrency 与 Server Batch 有什么区别？
3. KV Cache 节省了什么，又增加了什么？
4. Dynamic Cache 为什么可能慢于 Preallocated Cache？
5. MHA 与 GQA 的 KV 容量为什么不同？
6. TTFT、TPOT、ITL、E2E 分别测量什么？
7. Input Length 主要影响 Prefill 还是 Decode？
8. Scheduler Budget 什么时候才会生效？
9. 参数被接受为什么不等于 Backend 实际使用？
10. Prefix Cache 为什么主要改善重复 Prefill？
11. 如何证明 ITL 尖峰来自 Long Prefill？
12. 如何从客户端指标追到 Scheduler 和固定版本源码？

## F0.5 Transfer Gate

换一个模型、Backend 或硬件，重新完成：

- [ ] 写下哪些趋势应该保留。
- [ ] 写下哪些趋势可能变化。
- [ ] 重新冻结环境。
- [ ] 复跑一组基线和一组压力实验。
- [ ] 用差异修正原有机制模型。

完成 Transfer Gate 后，阶段 2 才达到掌握标准。

---

# 四周建议安排

| 周      | 学习内容   | 可见产物                              |
| ------- | ---------- | ------------------------------------- |
| 第 1 周 | P0、M1、M2 | Batch 曲线、MHA/GQA、KV 容量表        |
| 第 2 周 | S0、S1、S2 | 环境快照、稳态基线、Input Length 曲线 |
| 第 3 周 | S3、S4、S5 | 饱和点、Scheduler Budget、干扰时间线  |
| 第 4 周 | S6、R0、F0 | Prefix 对照、源码链路、两篇文章终稿   |

这只是顺序建议，不是按日期强行推进。某个 Gate 未通过时留在当前 Gate，修复任务定义、测试或观测能力，不通过增加阅读量掩盖问题。

# 现在立即执行

当前只做以下三项：

1. [ ] 完成 `examples/numpy_array_semantics.py` 的 Advanced Indexing、`swapaxes`、`concatenate`。
2. [ ] 为 `B=1/2/4/8` 增加正确性测试。
3. [ ] 在 README 写下 M1 四条预测及其反证条件。

三项完成后，先审查 P0 与 M1-A；不要提前实现 M2。

# 主要参考

- [Python Data Structures](https://docs.python.org/3/tutorial/datastructures.html)
- [NumPy Copies and Views](https://numpy.org/doc/stable/user/basics.copies.html)
- [NumPy Broadcasting](https://numpy.org/doc/stable/user/basics.broadcasting.html)
- [vLLM CLI Guide](https://docs.vllm.ai/en/latest/cli/)
- [vLLM bench serve](https://docs.vllm.ai/en/latest/cli/bench/serve/)
- [vLLM serve arguments](https://docs.vllm.ai/en/latest/cli/serve/)
- [vLLM Metrics](https://docs.vllm.ai/en/stable/design/metrics/)
- [vLLM Automatic Prefix Caching](https://docs.vllm.ai/en/latest/design/prefix_caching/)
