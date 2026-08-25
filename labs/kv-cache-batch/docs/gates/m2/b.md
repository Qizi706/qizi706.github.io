# M2-B 工作表：无 Cache MHA Oracle

状态：**Current**。当前任务与评分命令以 [assignments/m2-b.md](../../../assignments/m2-b.md) 为准；阶段依赖与停止条件见 [docs/roadmap.md](../../roadmap.md)。

### 学习合同

```text
Question: 给定 Q/K/V=[B,H,T,D_head]，怎样证明批量矩阵乘法没有混合 Batch 或 Head，并且每个位置只能读取历史 Token？

Prediction: 运行前填写 Score、Weight、Output Shape，Softmax Axis，以及 Future Token、Head、Batch 三种修改各会影响哪个切片。

Action: 先写独立 Oracle 与隔离性测试，再实现 H_q=H_kv 的无 Cache MHA。

Artifact: src/kv_cache_lab/multi_head.py
          tests/test_multi_head.py
          grader_tests/test_m2_b.py
          docs/gates/m2/b.md

Acceptance: Shape、独立标量 Oracle、Causal Mask、归一化、隔离性、非法 Shape 与完整回归全部通过；最后关闭代码重做推导。

Feedback: unittest 的第一次失败、手算非零坐标、完整回归和闭卷解释。

Next decision: 全部通过后进入 M2-C Cached MHA；否则只修正 M2-B。
```

### 本轮边界

- 只处理 `H_q = H_kv`，不做 GQA Head 映射。
- 输入使用 M2-A2 已产生的四维 Q/K/V，不重复实现投影。
- 返回逐 Head Output 与 Weight，不合并 Head，不做 Output Projection。
- 不创建或追加 KV Cache，不计时，不讨论性能收益。

### 固定输入与运行前预测

固定互不相等的关键维度：

```text
B=2, H=3, T=4, D_head=5
Q/K/V Shape = [2,3,4,5]
```

先关闭 `multi_head.py`，填写：

```text
K 转置最后两轴后的 Shape：
Score = Q @ K^T 的 Shape：
除以 sqrt(D_head) 改变 Shape 吗：
Causal Mask 的 Shape：
Softmax 应沿哪个 Axis：
Weight 的 Shape：
Output = Weight @ V 的 Shape：

修改 K/V[b,h,j] 且 j>i，对 Output[b,h,i] 的预测：
修改 Q/K/V[b,h]，对其他 Head 与其他 Batch 的预测：
```

再选择两个非零坐标，写出求和范围；至少一个坐标必须满足 `i > 0`：

```text
Score[b=?,h=?,i=?,j=?] =
Output[b=?,h=?,i=?,d=?] =
```

### 15 分钟前置阅读

只读本轮第一段实现会使用的内容，每处留一句确认或修正：

- Harvard [The Annotated Transformer](https://nlp.seas.harvard.edu/annotated-transformer/)：只看 Scaled Dot-Product Attention 的缩放原因、Mask 位置、Softmax 轴，以及 Multi-Head Attention 第 2 步。
- NumPy [`matmul`](https://numpy.org/doc/stable/reference/generated/numpy.matmul.html)：只看 stacks of matrices 如何把最后两维当矩阵，并保留 `[B,H]` 前导维。
- NumPy [`triu`](https://numpy.org/doc/stable/reference/generated/numpy.triu.html)：只看 `k=1` 如何选出严格上三角。

```text
Annotated Transformer 确认或修正了：
matmul 确认或修正了：
triu 确认或修正了：
```

### 先写会失败的测试

在 `tests/test_multi_head.py` 新增测试，Oracle 不得调用待测函数或生产 `softmax`：

- Shape：检查 Score/Weight 与逐 Head Output 的 Shape。
- 元素：用标量循环独立计算至少两个非零坐标的 Score、Weight 与 Output。
- Causal：检查 Weight 严格上三角为 0；修改 Future K/V 后，当前位置及之前的 Output 不变。
- 隔离：修改一个 Head 或一个 Batch，只允许对应切片变化。
- 契约：用表驱动测试覆盖输入不是四维、Q/K/V 的 Batch/Head/Token/D_head 不匹配，以及空 Token/Head Width，并断言在矩阵乘法前抛出 `ValueError`。

第一次失败必须原样保存在“运行后记录”，不能在实现通过后补写一个更好看的错误。

### 最小实现边界

先实现一个可观察的教育接口：

```python
def multi_head_causal_attention(
    q: np.ndarray,
    k: np.ndarray,
    v: np.ndarray,
) -> tuple[np.ndarray, np.ndarray]:
    """Return per-head output and attention weights without a KV cache."""
```

核心 Shape 路径固定为：

```text
Q/K/V              [B,H,T,D_head]
swapaxes(K,-1,-2)  [B,H,D_head,T]
Score/Weight        [B,H,T,T]
Output              [B,H,T,D_head]
```

必须使用数值稳定 Softmax：先减去最后一维最大值，再 `exp` 和归一化。不要加入 Cached Decode、GQA 映射、`merge_heads` 或 Output Projection。

### 120 分钟执行顺序

- **10 min**：填写 Shape、坐标、Softmax Axis 与隔离性预测。
- **15 min**：完成三处定向阅读，各留一句确认或修正。
- **30 min**：先写五组测试并保存第一次失败。
- **30 min**：实现输入契约、Score、Mask、稳定 Softmax 与 `Weight @ V`。
- **15 min**：只根据失败信息修正 Axis、Mask 或输入边界。
- **10 min**：运行 M2-B 定向测试与完整回归。
- **10 min**：关闭代码，重做坐标推导并解释缩放与归一化轴。

### 验证命令

先运行当前练习的公开评分：

```bash
make m2-b
```

通过后再运行整份作业和已完成任务的回归：

```bash
make grade
make test
```

`make m2-b`、`./grade-lab-kv-cache m2-b` 与
`make GRADEFLAGS=m2-b grade` 等价。公开评分器固定 BLAS 线程并从
`grader_tests/test_m2_b.py` 验证 Shape、标量 Oracle、Mask、归一化、隔离性和输入契约。

### 运行后记录

```text
实际 Score/Weight/Output Shape：
两个独立坐标 Oracle：
Future Token 是否不可见：
Head/Batch 是否隔离：
触发的非法配置：
第一次失败信息：
错误属于 Score / Mask / Softmax Axis / Value / 输入契约中的哪一层：
修正后的规则：
定向测试：
完整回归：
闭卷解释：为什么除以 sqrt(D_head)，Softmax 为什么沿最后一个 Axis：
```

### M2-B 验收

**待完成**

- 运行前 Shape、坐标、Softmax Axis 与隔离性预测已保存。
- 三处前置阅读各留下一句确认或修正。
- Score、Weight 与逐 Head Output Shape 测试通过。
- 至少两个非零坐标匹配独立标量 Oracle。
- Future Token 权重为 0，且 Weight 沿最后一维和为 1。
- Future Token、Head 与 Batch 隔离测试通过。
- 非法 Q/K/V Shape 在矩阵乘法前抛出 `ValueError`。
- A2 与完整测试套件保持通过。
- 关闭代码后能重做 Shape/坐标推导，并解释缩放与 Softmax Axis。

全部通过后进入 **M2-C Cached MHA**；任一项未通过时继续修正 M2-B，不提前实现 Cache 或 GQA。
