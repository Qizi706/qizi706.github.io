# Phase 2 Lab：Causal Attention、KV Cache 与 Batched Decode

这个 Lab 用最小 NumPy 实现验证三个问题：KV Cache 是否保持 Attention 语义、缓存分配策略如何改变耗时，以及把两个独立 Sequence 放进同一个 Batch 后实际节省了什么。

阶段 2 后续任务的逐步操作、命令、产物和验收条件见 [`docs/LEARNING_PLAN.md`](./docs/LEARNING_PLAN.md)。

阶段文档：[LLM 推理优化的系统视角：从 KV Cache 到调度](/blog/llm-inference-optimization-system-view/)

## 实验问题与预测

1. 增量 KV Cache 与每步重算完整前缀是否逐位置数值等价？
2. `np.concatenate` 的反复分配和复制是否会让动态 Cache 慢于预分配？
3. 两个等长 Sequence 共享一次 Batched 执行后，总耗时是否低于顺序执行两次？
4. 当 Sequence 变长时，Batch 的相对加速为什么可能下降？

实验前的预测：Cache 路径应保持数值等价；预分配应减少动态扩容成本；`B=2` 应减少 Python/NumPy 调用和分配次数，但不会减少 Attention 的总 FLOPs，因此加速不会稳定达到 2x，并会随长序列计算占比上升而收窄。

## 项目结构

```text
kv-cache-batch/
├── docs/
│   └── LEARNING_PLAN.md   # 阶段 2 的逐步执行与验收手册
├── examples/
│   └── numpy_array_semantics.py # NumPy View、Copy、Stride 与分配练习
├── src/kv_cache_batch/
│   ├── attention.py       # Attention、KV Cache 与 Batched Decode 实现
│   ├── benchmark.py       # 正确性门禁、计时和原始 CSV 输出
│   └── summarize_batch_size.py # Batch Size 汇总、曲线和 Knee 分析
├── tests/
│   ├── test_attention.py  # 独立数值与 Shape 测试
│   └── test_summarize_batch_size.py # 汇总公式与 Knee 判定测试
└── results/
    ├── batch-length-scan/
    │   └── raw.csv        # 固定 B=2 的 300 条长度扫描原始样本
    └── batch-size-scan/
        ├── raw.csv        # M1 Batch Size Scan 的 240 条原始样本
        ├── summary.csv    # C3 汇总与相邻吞吐增幅
        ├── batch-latency-percentiles.svg # C4 Batch P50/P95 曲线
        ├── positions-throughput.svg # C4 Positions/s 曲线
        └── knee-analysis.md # C5 Knee 与证据边界
```

实现入口：

- [`attention.py`](./src/kv_cache_batch/attention.py)
- [`benchmark.py`](./src/kv_cache_batch/benchmark.py)
- [`summarize_batch_size.py`](./src/kv_cache_batch/summarize_batch_size.py)
- [`test_attention.py`](./tests/test_attention.py)
- [`test_summarize_batch_size.py`](./tests/test_summarize_batch_size.py)
- [`batch-length-scan/raw.csv`](./results/batch-length-scan/raw.csv)
- [`batch-size-scan/raw.csv`](./results/batch-size-scan/raw.csv)
- [`batch-size-scan/summary.csv`](./results/batch-size-scan/summary.csv)
- [`batch-size-scan/knee-analysis.md`](./results/batch-size-scan/knee-analysis.md)

## 实现路径

### 单 Sequence Cache 实验

- `decode_without_cache`：每一步重算完整前缀，只保留最后一个位置的输出；
- `cached_attention`：只计算新 token 的 Q/K/V，通过 `np.concatenate` 扩展 K/V；
- `cached_attention_preallocated`：预分配完整 K/V Buffer，按位置原地写入。

### 两个 Sequence 的执行实验

- `sequential_cached_attention`：在 Python 中分别执行两个 Sequence，作为计时基线；
- `batched_cached_attention`：把输入组织为 `[B, T, D_model]`，每个 Decode Step 用一次 NumPy 调用处理两个 Sequence；
- K/V Cache 形状为 `[B, T, D_k]` 和 `[B, T, D_v]`，Batch 维不会参与 Sequence 内的 Attention。

在第 `t` 个 Decode Step，核心 Shape 为：

| Tensor     | Shape             |
| ---------- | ----------------- |
| `x_t`      | `[B, 1, D_model]` |
| `q_t`      | `[B, 1, D_k]`     |
| `k_cache`  | `[B, t+1, D_k]`   |
| `scores`   | `[B, 1, t+1]`     |
| `output_t` | `[B, 1, D_v]`     |

## 环境与控制变量

| 项目        | 设置                                                  |
| ----------- | ----------------------------------------------------- |
| CPU         | AMD Ryzen 7 9700X，8 Core / 16 Thread                 |
| Python      | CPython 3.14.7                                        |
| NumPy       | 2.5.2                                                 |
| BLAS        | OpenBLAS 0.3.34，实验时固定为单线程                   |
| Tensor      | `float64`，单 Head                                    |
| Batch       | Cache 为 1；Length Scan 为 2；Size Scan 为 1/2/4/8    |
| Dimension   | `d_model = d_k = d_v = 64`                            |
| Sequence    | Length Scan 为 16/32/64/128/256；Size Scan 固定为 128 |
| Random Seed | 42                                                    |
| Timing      | 每条 Path Warm-up 10 次，正式运行 30 次               |

Cache Strategy 与 Batch Length 实验扫描 Sequence Length；Batch Size 实验固定 `T=128`，扫描 `B∈{1,2,4,8}`。模型权重、维度、dtype、线程数和随机种子保持不变。Batch Size v1 使用 3 次 Warm-up 时，首个运行组合仍有明显下降漂移，因此 v2 将每条 Path 的 Warm-up 提高到 10 次。

## 复现

```bash
cd public/labs/kv-cache-batch
uv sync

OPENBLAS_NUM_THREADS=1 OMP_NUM_THREADS=1 \
  uv run python -m unittest discover -s tests -v

OPENBLAS_NUM_THREADS=1 OMP_NUM_THREADS=1 \
  uv run kv-cache-batch \
  --experiment batch-size \
  --csv results/batch-size-scan/raw.csv

OPENBLAS_NUM_THREADS=1 OMP_NUM_THREADS=1 \
  uv run kv-cache-batch-summary \
  --input results/batch-size-scan/raw.csv \
  --output-dir results/batch-size-scan \
  --sequence-length 128 \
  --dtype float64 \
  --blas-threads 1
```

正确性测试刻意使用 `d_k=3`、`d_v=5`，避免 K/V Shape 错误被相同维度掩盖。Benchmark 在计时前还会分别以完整前缀重算作为 Oracle：

```python
np.testing.assert_allclose(expected, dynamic_output, atol=1e-8)
np.testing.assert_allclose(expected, preallocated_output, atol=1e-8)
np.testing.assert_allclose(expected, actual, atol=1e-8)
```

只有正确性门禁通过后才输出性能结果。

## 结果

### KV Cache 策略

| $T$ | No Cache / ms | Concatenate Cache / ms | Preallocated Cache / ms | No Cache / Preallocated |
| --: | ------------: | ---------------------: | ----------------------: | ----------------------: |
|  16 |         0.271 |                  0.194 |                   0.180 |                   1.51x |
|  32 |         0.567 |                  0.307 |                   0.282 |                   2.01x |
|  64 |         1.740 |                  0.648 |                   0.577 |                   3.02x |
| 128 |         7.765 |                  1.366 |                   1.174 |                   6.61x |
| 256 |        40.592 |                  3.083 |                   2.509 |                  16.18x |

- 三条路径在所有长度上逐位置数值等价；
- No Cache 的完整前缀重算随长度增长得更快；
- `T=256` 时，预分配比动态拼接减少约 18.6% 的 Cache 路径耗时；
- 单 Sequence 的 K/V 逻辑容量为 `2 × T × 64 × 8 bytes = T KiB`。

### 两个 Sequence：顺序执行与 Batched 执行

| $T$ | Sequential / ms | Batch / ms | Speedup | Positions / s |
| --: | --------------: | ---------: | ------: | ------------: |
|  16 |           0.303 |      0.180 |  1.687x |       178,072 |
|  32 |           0.618 |      0.374 |  1.653x |       171,096 |
|  64 |           1.274 |      0.791 |  1.611x |       161,871 |
| 128 |           2.688 |      1.793 |  1.499x |       142,755 |
| 256 |           6.109 |      4.540 |  1.346x |       112,788 |

`Sequential / ms` 和 `Batch / ms` 都包含两个 Sequence 的完整 Decode。`Positions / s` 按 `B × T / Batch Time` 计算，只表示这个 Toy 实验处理输出位置的速率，不等于真实 Serving 的 Token Throughput。

Batch 路径减少了 Python 循环、NumPy 调用和数组分配次数，但两个 Sequence 的 Q/K/V、Attention Score 和输出计算仍然存在。节省的调度开销大致随 $T$ 线性增长，而 Attention 与动态 Cache 复制的累计工作接近 $O(T^2)$，因此加速从约 1.69x 收窄到 1.35x。

### Batch Size Scan：固定 `T=128`

| $B$ | Batch P50 / ms | Batch P95 / ms | P50/B / ms | Positions/s | Sequential/Batch |
| --: | -------------: | -------------: | ---------: | ----------: | ---------------: |
|   1 |          1.442 |          1.467 |      1.442 |      88,750 |           0.938x |
|   2 |          1.789 |          1.808 |      0.894 |     143,129 |           1.521x |
|   4 |          2.627 |          2.673 |      0.657 |     194,928 |           2.045x |
|   8 |          5.264 |          5.312 |      0.658 |     194,513 |           2.064x |

![Batch P50 与 P95](/labs/kv-cache-batch/results/batch-size-scan/batch-latency-percentiles.svg)

![Batch Positions/s](/labs/kv-cache-batch/results/batch-size-scan/positions-throughput.svg)

相邻一级 B 的吞吐增幅为：

| B 变化 | Positions/s Gain |
| -----: | ---------------: |
|  1 → 2 |           61.27% |
|  2 → 4 |           36.19% |
|  4 → 8 |           -0.21% |

操作性定义为 `gain(B) < 10%` 时收益明显收窄，因此当前扫描得到 **Knee: B=8**。Batch Wall Time 从 1.442 ms 增长到 5.264 ms；`P50/B` 在 B=4 降至 0.657 ms 后不再改善；Positions/s 在 B=4 后进入平台。这里的 Knee 只描述当前 CPU/NumPy Toy Workload，不是 vLLM Scheduler 或 GPU 的通用最优 Batch Size。

## 异常、噪声与证据边界

未固定 BLAS 线程的早期实验曾把 No Cache 的表面加速放大到 40x 以上。当前结果固定 OpenBLAS 与 OMP 为单线程，并保留每次计时样本；亚毫秒结果仍容易受系统噪声影响，因此结论关注可复现趋势，不把某一行的精确倍数外推。

Batch Size Scan 使用 3 次 Warm-up 时，首个运行组合的前 5 次与后 5 次中位数相差约 28.2%。当前 `raw.csv` 已按每条 Path Warm-up 10 次的协议重新生成：实际 B 执行顺序为 `4 → 1 → 8 → 2`，8 个 `(B, path)` 分组的最大前后漂移降至 1.29%，每组均包含 30 条有效样本。

当前实验只覆盖 CPU、NumPy、单 Head、等长 Sequence、`B∈{1,2,4,8}` 和单层 Attention。它没有实现：

- Multi-Head Attention、MQA 或 GQA；
- 不同长度 Sequence 的 Padding、Mask 或动态退出；
- GPU Kernel、显存带宽和 Kernel Launch；
- Continuous Batching、PagedAttention 与真实请求调度。

这个 Lab 证明的是 Cache 复用、分配策略和最小 Batched 执行机制，不代表真实 vLLM/GPU Serving 的固定收益。

## 下一步

M1 已完成：原始样本、汇总、两张独立曲线和 Knee 判断都可从 `raw.csv` 重建。下一步进入 M2，把张量扩展为 `[B, H_kv, T, D_head]`，验证 MHA/GQA 的 Head 映射与 KV 容量公式。

**预测：**

```text
H1：B 增大时，Batch Wall Time 会增加。
H2：Positions/s 会提高，但不会保持线性增长。
H3：Batch Wall Time / B 会下降，因为固定开销被摊薄。
H4：B=8 以内可能没有明确拐点；若没有，只能写 Not reached。
```

实际结果在 `B=8` 首次满足相邻吞吐增幅低于 10%，因此本次不是 `Not reached`，而是 `Knee: B=8`。
