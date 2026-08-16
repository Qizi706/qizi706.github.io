# Phase 2 Lab：Causal Attention 与 KV Cache

这个实验为阶段 2 的 KV Cache 学习提供最小、可复现的机制证据：先实现单头 Causal Attention，再验证增量 KV Cache 与完整前缀重算数值等价，最后测量动态拼接和预分配两种缓存策略的成本。

阶段文档：[LLM 推理优化的系统视角：从机制地图到可证伪实验](/blog/llm-inference-optimization-system-view/)

## 实验问题

1. KV Cache 为什么能够减少自回归 Decode 的重复计算？
2. 复用历史 K/V 是否会改变 Attention 输出？
3. 使用 `np.concatenate` 扩展缓存会引入多少分配与复制成本？
4. 序列增长时，计算收益和逻辑缓存容量分别怎样变化？

## 三条实现路径

- `decode_without_cache`：每一步重算完整前缀，只保留最后一个位置的输出；
- `cached_attention`：只计算新 token 的 Q/K/V，通过 `np.concatenate` 扩展 K/V；
- `cached_attention_preallocated`：预分配完整 K/V Buffer，按位置原地写入。

实现入口：[`src/attention_kv_caceh/test_toy_attention.py`](./src/attention_kv_caceh/test_toy_attention.py)

## 环境

| 项目        | 设置                                         |
| ----------- | -------------------------------------------- |
| CPU         | AMD Ryzen 7 9700X，8 Core / 16 Thread        |
| Python      | CPython 3.14.7                               |
| NumPy       | 2.5.2                                        |
| BLAS        | OpenBLAS 0.3.34，实验时固定为单线程          |
| Tensor      | `float64`，单 Head，Batch Size = 1           |
| Dimension   | `d_model = d_q = d_k = d_v = 64`             |
| Sequence    | 16 / 32 / 64 / 128 / 256                     |
| Random Seed | 42                                           |
| Timing      | Warm-up 3 次，正式运行 30 次，报告耗时中位数 |

## 复现

```bash
cd public/labs/attention-kv-caceh
uv sync

OPENBLAS_NUM_THREADS=1 OMP_NUM_THREADS=1 \
  uv run python src/attention_kv_caceh/test_toy_attention.py
```

计时前会先执行正确性验证：

```python
assert np.allclose(expected, concat_output, atol=1e-8)
assert np.allclose(expected, preallocated_output, atol=1e-8)
```

只有三条路径输出等价时，性能结果才有效。

## 结果

| $T$ | No Cache / ms | Concatenate Cache / ms | Preallocated Cache / ms | No Cache / Preallocated |
| --: | ------------: | ---------------------: | ----------------------: | ----------------------: |
|  16 |         0.231 |                  0.175 |                   0.148 |                   1.56x |
|  32 |         0.546 |                  0.310 |                   0.283 |                   1.93x |
|  64 |         1.733 |                  0.637 |                   0.576 |                   3.01x |
| 128 |         7.330 |                  1.353 |                   1.172 |                   6.25x |
| 256 |        50.525 |                  3.294 |                   2.648 |                  19.08x |

结论：

- KV Cache 与 No Cache 在所有测试长度上数值等价；
- 随着序列增长，No Cache 的重复前缀计算增长更快；
- 预分配始终快于动态拼接，在 `T=256` 时减少约 19.6% 的 Cache 路径耗时；
- 当前 K/V 均为 `(T, 64)` 的 `float64` Tensor，逻辑缓存为 `T KiB`，随序列长度线性增长。

## 异常与修正

未限制 BLAS 线程的第一轮测试中，`T=256` 的 No Cache 耗时为 113.663 ms，表面加速达到 44.5x。固定 OpenBLAS 与 OMP 为单线程后，该项下降到 50.525 ms，而 Cache 路径变化较小。

这说明原结果混入了 BLAS 执行策略与线程调度成本。文档采用固定线程后的结果，不把某次 Microbenchmark 倍数外推为真实模型或 GPU Serving 的固定收益。

## 适用边界

当前实验仅覆盖 CPU、NumPy、单 Head、Batch Size 1 和单层 Attention，不包含：

- Multi-Head Attention、MQA 或 GQA；
- 多层 Transformer 与 MLP；
- GPU Kernel、显存带宽和 Kernel Launch；
- Continuous Batching、PagedAttention 与真实请求调度。

下一步将缓存形状扩展为 `[B, H_kv, T, D_head]`，验证完整 KV 容量公式，再进入真实 Serving 工作负载实验。
