# M2-A2 工作表：Q/K/V 投影与输入契约

状态：**已完成**。本页只保存 M2-A2 的预测、第一次失败、修正规则和 Checkoff。

阶段依赖见 [roadmap.md](../roadmap.md)，下一步是 [M2-B](m2-b-causal-attention.md)。

### 学习契约

```text
Question: 同一个 Head 拆分规则怎样同时约束 Q/K/V，并在错误 Shape 进入 reshape 前拒绝它？
Prediction: 固定参数会得到 Q=[2,4,5,3]、K/V=[2,2,5,3]；投影创建 Buffer，拆 Head 保持共享；非法配置在 reshape 前失败
Time box: 120 min
Pre-read: NumPy matmul Shape、Copies/Views、unittest subTest/assertRaises（共 15 min）
Action: 先写契约测试，再实现 Q/K/V 投影，并为 split_heads 增加最小输入校验
Artifact: multi_head_attention.py、test_multi_head_attention.py 与本节运行记录组成的一份 A2 证据包
Acceptance: 正例 Shape 与元素 Oracle 通过，非法配置明确失败，完整回归测试通过
Feedback source: unittest 失败信息、手算元素 Oracle 与完整测试套件
Result:
What changed:
Next decision:
```

### 运行前先写出契约

固定使用不相等的维度，避免轴放错后仍得到碰巧正确的 Shape：

```text
B = 2
T = 5
D_model = 7
H_q = 4
H_kv = 2
D_head = 3
```

不运行 NumPy，先填写：

```text
X Shape   = [2, 5, 7]
W_q Shape = [7, 12]
W_k Shape = [7, 6]
W_v Shape = [7, 6]

Q Shape = [2, 4, 5, 3]
K Shape = [2, 2, 5, 3]
V Shape = [2, 2, 5, 3]
```

再写下两条预测：

```text
X @ W_q 是否创建新 Buffer，理由：创建，因为会产生一个与原本不同的张量。
split_heads 是否继续与投影结果共享内存，理由：不创建，可以直接修改固定 stride 来表示
```

最后选取 Q、K 各一个非零坐标，写出它在扁平投影结果中的索引。不要用所有坐标都为零的样例。

```text
Q:
  [0, 1, 4, 1] -> [0, 4, 4]
K:
  [0, 1, 4, 1] -> [0, 4, 4]
V:
  [0, 1, 4, 1] -> [0, 4, 4]
```

### 前置阅读：只读会立刻用到的三处

先保存上面的预测，再用 **15 分钟**定向阅读：

- [NumPy `matmul`](https://numpy.org/doc/stable/reference/generated/numpy.matmul.html)：只看 `(n,k),(k,m)->(n,m)`、N 维输入和不匹配时的 `ValueError`。
- [NumPy Copies and Views](https://numpy.org/doc/stable/user/basics.copies.html)：只看 View、Copy 与 `reshape` 小节，回答投影和拆 Head 是否共享 Buffer。
- Python `unittest`：只看 [`subTest`](https://docs.python.org/3/library/unittest.html#distinguishing-test-iterations-using-subtests) 与 [`assertRaises`](https://docs.python.org/3/library/unittest.html#unittest.TestCase.assertRaises)，用于组织五类非法输入。

每份材料只写一句“它改变或确认了哪条预测”。15 分钟到点就进入测试，不继续扩展阅读清单。

- `matmul` 就是矩阵乘法，与 `dot` 不同。
- View 和 Copy 的区别不能死记每一种变换定式，主要看固定 stride 是否能满足表现。
- subtest 主要用于参数会变化的同类 test，前面的 test 失败，后续的 test 也会执行。

### 只实现这一层接口

在 `src/inference_lab/multi_head_attention.py` 中新增：

```python
def project_qkv(
    x: np.ndarray,
    w_q: np.ndarray,
    w_k: np.ndarray,
    w_v: np.ndarray,
    num_query_heads: int,
    num_kv_heads: int,
) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Project X and return Q/K/V with explicit Head axes."""
```

同时让 `split_heads` 在 `reshape` 前检查最小契约：输入必须是三维数组、Head 数必须为正、最后一维必须能被 Head 数整除。`project_qkv` 还需要拒绝输入宽度与权重不匹配，以及 Q/K/V 推导出的 `D_head` 不一致。

这一轮禁止加入：

- Score 矩阵、Softmax 与 Causal Mask；
- KV Cache；
- Query Head 到 KV Head 的 GQA 映射；
- 性能 Benchmark。

### 先写可以失败的测试

在 `tests/test_multi_head_attention.py` 中增加三组证据：

- **Shape 契约**：使用固定参数，分别检查 Q、K、V 的四维 Shape。
- **元素 Oracle**：使用可手算的输入与权重，至少检查 Q、K 各一个非零坐标，排除仅 Shape 正确。
- **非法配置**：用一个表驱动测试覆盖输入不是三维、Head 数非正、投影宽度不能整除、权重输入宽度不匹配和 Q/K/V 的 `D_head` 不一致，并断言抛出 `ValueError`。

先看到新增测试因缺少实现而失败，再写最小代码使其通过；不要把 `project_qkv` 自己的输出当作 Oracle。

### 120 分钟执行顺序

- **15 min**：关闭 A1 代码，填写固定 Shape、两条 Buffer 预测和两个坐标映射。
- **15 min**：完成三处定向阅读，每处只写一句对预测的修正或确认。
- **25 min**：只写三组契约测试，并保存第一次失败信息。
- **30 min**：实现 `split_heads` 校验与 `project_qkv`，不进入 Attention 计算。
- **15 min**：根据失败信息修正 Shape 或校验边界，不扩大接口。
- **10 min**：运行 A2 定向测试和完整回归测试。
- **10 min**：关闭代码重新写出 Q/K/V Shape 推导，并填写结果、差异与下一步判断。

### 验证命令

```bash
OPENBLAS_NUM_THREADS=1 \
OMP_NUM_THREADS=1 \
PYTHONPATH=src \
uv run python -m unittest discover -s tests -p 'test_multi_head_attention.py' -v

OPENBLAS_NUM_THREADS=1 \
OMP_NUM_THREADS=1 \
PYTHONPATH=src \
uv run python -m unittest discover -s tests -v
```

### 运行后记录

```text
实际 Q/K/V Shape：
                 Q Shape = [2, 4, 5, 3]
                 K Shape = [2, 2, 5, 3]
                 V Shape = [2, 2, 5, 3]
元素映射是否成立：成立。
触发的非法配置与异常：一开始没对实现进行合法性检查，导致无法进行非法配置检测。
第一次失败信息：ERROR: test_invalid_contracts_raise_value_error (test_multi_head.TestMultiHeadContractValidation.test_invalid_contracts_raise_value_error) (case='projected_not_3d')
错误属于哪一层：输入契约
修正后的规则：先检查输入是否符合，如果不符合就抛出 ValueError。
A2 定向测试：6/6 通过。
完整回归测试：12/12 通过。
闭卷 Shape 推导：
  X=[2,5,7]
  W_q=[7,12]
  W_k/W_v=[7,6]
  Q_flat=[2,5,12]
  K_flat/V_flat=[2,5,6]
  Q=[2,4,5,3]
  K/V=[2,2,5,3]
口述修正：GQA 中 Q 与 K/V 的完整 Shape 不必相同；必须一致的是 D_head。
          H_q != H_kv 时还要先完成 Query Head 到 KV Head 的分组映射。
```

### A2 验收

**已完成**

- 运行前预测与坐标映射已保存。
- 三处前置阅读各留下了一句对预测的确认或修正。
- Q/K/V Shape 测试使用了互不相等的关键维度并通过。
- 至少两个非零坐标的独立元素 Oracle 通过。
- 五类非法配置都在 `reshape` 前抛出 `ValueError`。
- A1 测试与完整测试套件保持通过。
- 关闭代码后，能重新推导权重宽度与 Q/K/V 输出 Shape。

A2 已于 **2026-08-25** 通过全部门禁，当前进入 **M2-B**。
