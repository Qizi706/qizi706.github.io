# Lab M2：Multi-Head Causal Attention

这个 Lab 用最小 NumPy 实现建立 Attention Oracle：先把投影结果拆成多个 Head，再完成 Q/K/V 投影，最后实现不带 KV Cache 的 Multi-Head Causal Attention。完成它之后，Cached MHA、GQA 和真实 Serving 实验才有可信的数值基线。

当前练习是 **M2-B**。M2-A1 与 M2-A2 已作为可运行的起点保留；M2-B 故意只有输入契约和 `TODO`，初次评分失败是正常状态。

<div class="required">
<p class="header">当前任务：M2-B · 无 Cache MHA Oracle</p>
<p>只编辑 <code>src/kv_cache_lab/multi_head.py</code> 和自己的测试记录。让每个 Batch、每个 Head 独立完成 Scaled Dot-Product Causal Attention；不要提前加入 KV Cache、GQA、Head 合并或 Output Projection。</p>
</div>

## 获取代码并启动 Lab

如果已经在本站仓库中：

<pre>
$ <kbd>cd labs/kv-cache-batch</kbd>
$ <kbd>make setup</kbd>
$ <kbd>make grade</kbd>
</pre>

如果从网站单独下载：

<pre>
$ <kbd>curl -LO https://zqwiki.cn/labs/kv-cache-batch.tar.gz</kbd>
$ <kbd>tar -xzf kv-cache-batch.tar.gz</kbd>
$ <kbd>cd kv-cache-batch</kbd>
$ <kbd>make setup</kbd>
$ <kbd>make grade</kbd>
</pre>

初始评分应该呈现这个状态：

<pre>
$ <kbd>make grade</kbd>
== m2-a1: PASS (20/20) ==
== m2-a2: PASS (20/20) ==
== m2-b: FAIL (0/60) ==

Score: 40/100
Still working: m2-b
</pre>

只运行当前练习可以使用任一命令：

<pre>
$ <kbd>make m2-b</kbd>
$ <kbd>./grade-lab-kv-cache m2-b</kbd>
$ <kbd>make GRADEFLAGS=m2-b grade</kbd>
</pre>

<kbd>make test</kbd> 只运行已经完成的回归测试，因此在 M2-B 尚未实现时仍应通过。<kbd>make grade</kbd> 代表整份作业的当前完成度，会在 `TODO` 处失败。

## 评分方式

| Exercise | 内容 | 分值 | 定向命令 |
| --- | --- | ---: | --- |
| M2-A1 | `split_heads` Shape、坐标映射与内存共享 | 20 | <kbd>make m2-a1</kbd> |
| M2-A2 | Q/K/V 投影、GQA Shape 契约与非法输入 | 20 | <kbd>make m2-a2</kbd> |
| M2-B | Score、Causal Mask、Softmax、Oracle 与隔离性 | 60 | <kbd>make m2-b</kbd> |

公开评分测试位于 [`grader_tests/test_m2_b.py`](./grader_tests/test_m2_b.py)。先根据任务说明写自己的最小测试；卡住时再逐级查看工作表、错误输出和公开评分测试，不要直接从测试倒推并粘贴实现。

## M2-A1：拆分 Head（已完成）

编辑文件：[`src/kv_cache_lab/multi_head.py`](./src/kv_cache_lab/multi_head.py)

`split_heads(projected, num_heads)` 把 `[B,T,H×D_head]` 转换为 `[B,H,T,D_head]`。实现必须保留元素映射，并且输出与输入共享内存。

运行后应该看到：

<pre>
$ <kbd>make m2-a1</kbd>
Ran 3 tests
OK
== m2-a1: PASS (20/20) ==
</pre>

## M2-A2：投影 Q/K/V（已完成）

编辑文件：[`src/kv_cache_lab/multi_head.py`](./src/kv_cache_lab/multi_head.py)

`project_qkv(...)` 接受 `X=[B,T,D_model]` 和三个二维权重，返回带显式 Head 轴的 Q/K/V。Query Head 数可以不同于 KV Head 数，但三者的 `D_head` 必须相同；非法配置要在矩阵乘法或 `reshape` 前抛出 `ValueError`。

运行后应该看到：

<pre>
$ <kbd>make m2-a2</kbd>
Ran 3 tests
OK
== m2-a2: PASS (20/20) ==
</pre>

## M2-B：实现无 Cache MHA（当前）

编辑函数：

```python
def multi_head_causal_attention(
    q: np.ndarray,
    k: np.ndarray,
    v: np.ndarray,
) -> tuple[np.ndarray, np.ndarray]:
    """Return per-head output and attention weights without a KV cache."""
```

输入 Q/K/V 都是 `[B,H,T,D_head]`。返回值顺序固定为 `output, weights`：

```text
weights  [B,H,T,T]
output   [B,H,T,D_head]
```

你的实现必须满足：

1. Score 使用 `Q @ K^T`，并除以 `sqrt(D_head)`。
2. 位置 `i` 只能看到 `0..i`，严格上三角的 Weight 必须为 0。
3. Softmax 沿最后一个历史 Token 轴计算，并使用减最大值的稳定写法。
4. Batch 与 Head 只是前导维，任何运算都不能把它们混在一起。
5. 非四维输入、不同 Shape、空 Batch/Head/Token/Head Width 必须抛出 `ValueError`。
6. 本练习只返回逐 Head Output 与 Weight，不合并 Head。

### 建议步骤

先关闭实现文件，在 [`docs/gates/M2.md`](./docs/gates/M2.md) 中写出 Score、Mask、Weight、Output 的 Shape 和 Softmax Axis。然后在 `tests/test_multi_head.py` 中写一个不调用生产函数的标量 Oracle，保存第一次失败，再完成 `TODO`。

如果需要提示，请按这个顺序展开：

- Hint 1：`np.matmul` 把最后两个轴当矩阵，前面的 `[B,H]` 是独立的堆叠维度。
- Hint 2：严格未来位置可由 `np.triu(..., k=1)` 标出。
- Hint 3：应用 Mask 后再做 Softmax；最大值、求和都必须保留最后一维以便广播。
- Hint 4：先让 `make m2-b` 的 Shape 和契约错误消失，再处理数值 Oracle 与隔离性。

完成后应该看到：

<pre>
$ <kbd>make m2-b</kbd>
Ran 5 tests
OK
== m2-b: PASS (60/60) ==

Score: 60/60
All selected exercises passed.
</pre>

## 完成检查

<div class="warning">
<p><strong>M2-B 定向评分通过后，运行整份作业和历史回归：</strong></p>
<pre>
$ <kbd>make grade</kbd>
$ <kbd>make test</kbd>
$ <kbd>git diff --check</kbd>
</pre>
<p>最终评分必须是 <code>Score: 100/100</code>。然后回到 <a href="/labs/kv-cache-batch/read/docs/gates/M2/">M2 工作表</a>填写第一次失败、修正规则与闭卷解释；只有验收清单全部完成，才进入 M2-C Cached MHA。</p>
</div>

## 文件布局

```text
kv-cache-batch/
├── Makefile                  # setup、回归与单项评分入口
├── grade-lab-kv-cache        # 类 6.828 的公开评分脚本
├── grader_tests/
│   └── test_m2_b.py          # M2-B 公开验收测试
├── src/kv_cache_lab/
│   ├── multi_head.py         # M2-A1/A2 实现与 M2-B TODO
│   ├── attention.py          # 已完成的单 Head / KV Cache 实验
│   └── benchmark.py          # 计时与原始 CSV 输出
├── tests/                    # 已完成任务的回归测试
├── docs/
│   ├── PLAN.md               # 阶段 2 总路线
│   └── gates/M2.md           # 预测、记录与验收工作表
└── results/                  # 已完成实验的原始数据与图表
```

## 已完成实验：实现路径与证据

下面保留 M0、P0 与 M1 的实验设计和原始证据，供完成 M2 后比较；它们不是 M2-B 的答案。

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

<pre>
$ <kbd>cd labs/kv-cache-batch</kbd>
$ <kbd>uv sync</kbd>

$ <kbd>OPENBLAS_NUM_THREADS=1 OMP_NUM_THREADS=1 \
  uv run python -m unittest discover -s tests -v</kbd>

$ <kbd>OPENBLAS_NUM_THREADS=1 OMP_NUM_THREADS=1 \
  uv run kv-cache-batch \
  --experiment batch-size \
  --csv results/batch-size-scan/raw.csv</kbd>

$ <kbd>OPENBLAS_NUM_THREADS=1 OMP_NUM_THREADS=1 \
  uv run kv-cache-batch-summary \
  --input results/batch-size-scan/raw.csv \
  --output-dir results/batch-size-scan \
  --sequence-length 128 \
  --dtype float64 \
  --blas-threads 1</kbd>
</pre>

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

P0 与 M1 已完成：NumPy 语义记录通过验收，Batch Size 的原始样本、汇总、两张独立曲线和 Knee 判断都可从 `raw.csv` 重建。M2-A1 与 M2-A2 也已完成：`split_heads` 和 `project_qkv` 已通过 Shape、元素映射、内存共享与输入契约测试；A2 定向 6 项、完整 12 项回归测试通过，并完成闭卷 Shape 推导。

当前唯一任务是 **M2-B**：先固定 `H_q=H_kv`，对已经拆成 `[B,H,T,D_head]` 的 Q/K/V 实现无 Cache Scaled Dot-Product Causal Attention。具体预测、120 分钟顺序和验收清单见 [`docs/gates/M2.md`](docs/gates/M2.md)。

**预测：**

```text
B-H1：固定 B=2、H=3、T=4、D_head=5，
      Score/Weight Shape 为 [2,3,4,4]，逐 Head Output Shape 为 [2,3,4,5]。
B-H2：修改位置 i 之后的 K/V，不会改变位置 i 及之前的输出。
B-H3：修改一个 Head 或一个 Batch 的输入，只会改变对应切片；
      Softmax 只沿最后一个历史 Token Axis 归一化。
```

M2-B 只实现 Score、Causal Mask、Softmax 和逐 Head `Weight @ V`；本轮不合并 Head，不实现 KV Cache、GQA Head 映射或 Output Projection。B 通过后进入 M2-C Cached MHA。
