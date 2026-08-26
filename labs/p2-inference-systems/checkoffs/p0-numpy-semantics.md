# P0 工作表：Python / NumPy 对象与 Buffer 语义

定位：这是已经关闭的 P0 **历史工作表**，保存 NumPy 语义实验的预测、观察和验收记录，不是当前实验任务书。当前任务从[阶段 2 路线页](/learning/phase-2/)进入。

## 学习问题

名称绑定、浅复制、基础切片、Advanced Indexing、`swapaxes` 与
`concatenate` 分别怎样影响对象身份、Shape、Stride、数据 Buffer、修改传播与分配？这些行为怎样映射到当前 Attention / KV Cache 实现？

## 证据说明

“原始预测”保留第一次运行前笔记中真实出现过的判断，包括错误和不精确表述。没有明确写下的维度标记为 **未记录**，不按事后答案冒充预测。

实验文件：`examples/p0_numpy_array_semantics.py`。每个 ndarray Case 都通过
`make_array()` 获得独立输入，避免前一个 Case 的写入污染后一个 Case。

## Case 1：Python 名称绑定

### 原始预测

- `a` 与 `b` “共享内存”，通过 `b` 执行 `append` 会改变 `a`。
- 是否分配新容器：未明确记录。

### 观察

- `a is b` 为 `True`。
- `b.append(3)` 后，`a` 与 `b` 都是 `[1, 2, 3]`。

### 判定

- **行为预测成立，术语需要修正。**

### 机制与修正规则

`b = a` 不复制 List，也不创建第二个 List 容器；它让两个名称绑定同一个对象。因此通过任一名称进行的原地修改都能从另一个名称观察到。这里应说“绑定同一对象”，不要借用 ndarray 的“共享数据 Buffer”术语。

## Case 2：Python 浅复制

### 原始预测

- `a.copy()` 是深复制。
- 修改传播和嵌套对象身份：未明确记录。

### 观察

- `a is b` 为 `False`：外层 List 是两个对象。
- 向 `b` 的外层追加 `[3]` 不会改变 `a` 的长度。
- `a[0] is b[0]` 为 `True`；通过 `b[0].append(9)` 修改嵌套 List 时，`a[0]` 也发生变化。

### 判定

- **Refuted。** `list.copy()` 是浅复制，不是深复制。

### 机制与修正规则

浅复制创建新的外层容器，但把原容器中的元素引用放入新容器。外层结构的修改不传播；对共享可变元素的原地修改会传播。只有递归复制嵌套对象才属于深复制。

## Case 3：NumPy 基础切片

### 原始预测

- `x[:, 0:1, :]` 与 `x` 共享数据。
- Shape 在早期源码注释中写成 `(2, 1, 3)`，早期笔记中写成 `(2, 1, 4)`，记录不一致。
- 修改传播、Stride 和 View 对象分配：未完整记录。

### 观察

- `x.shape == (2, 3, 4)`，`view.shape == (2, 1, 4)`。
- `np.shares_memory(x, view)` 为 `True`。
- 写入 `view[0, 0, 0] = 999` 后，`x[0, 0, 0] == 999`。
- 当前 `int64` C-order 输入中，`x.strides` 与 `view.strides` 都是 `(96, 32, 8)`。

### 判定

- **共享关系成立；Shape 的原始记录部分 Refuted。**

### 机制与修正规则

基础切片创建新的 ndarray View 对象，但不复制元素 Buffer。View 使用 Shape、Stride 和偏移描述自己怎样解释同一块数据，因此元素写入会传播到 `x`。“没有新数据 Buffer”不等于“没有创建任何对象”。

`reshape` 也不能笼统描述成“只修改 Stride”：它会尽量返回 View，但在无法用新的 Shape / Stride 表示目标布局时可能复制。

## Case 4：NumPy Advanced Indexing

### 原始预测

- `x[[0, 1]]` 的 Shape 是 `(2, 2, 4)`。
- Advanced Indexing 会复制，修改结果不会传播到 `x`。
- 分配新数据 Buffer：由“会复制”隐含预测，但未单独记录。

### 观察

- `copied.shape == (2, 3, 4)`。
- `np.shares_memory(x, copied)` 为 `False`。
- 写入 `copied[0, 0, 0] = 999` 后，`x[0, 0, 0]` 仍为 `0`。

### 判定

- **Shape Refuted；复制和修改隔离 Supported。**

### 机制与修正规则

索引数组 `[0, 1]` 作用于 axis 0，其自身 Shape `(2,)` 构成结果的索引维度，未被索引的 axis 1 和 axis 2 保留为 `(3, 4)`，所以结果为 `(2, 3, 4)`。Advanced Indexing 生成包含所选元素的新数组和独立数据 Buffer，修改结果不会污染原数组。

## Case 5：NumPy `swapaxes`

### 原始预测

- Shape 为 `(2, 4, 3)`。
- 不复制数据并共享 Buffer。
- “因为共享内存，所以 Stride 改变。”

### 观察

- Shape 从 `(2, 3, 4)` 变成 `(2, 4, 3)`。
- Stride 从 `(96, 32, 8)` 变成 `(96, 8, 32)`。
- `np.shares_memory(x, swapped)` 为 `True`。
- 写入 `swapped[0, 0, 1]` 会修改映射位置 `x[0, 1, 0]`。

### 判定

- **Shape、共享关系和修改传播 Supported；Stride 的因果解释 Refuted。**

### 机制与修正规则

`swapaxes(x, -1, -2)` 交换最后两个轴的含义，所以相应的 Shape 项和 Stride 项一起交换；底层元素没有重新排列。结果是共享 Buffer 的 View，这不是 Stride 改变的原因，而是同一次轴变换产生的另一个结果。

View 不复制数据不代表访问没有成本：交换后按某个轴遍历可能不再连续，降低缓存局部性；下游库也可能为了满足内核布局要求进行额外处理。是否真的发生额外复制需要对具体下游调用测量，不能仅从 View 推断。

## Case 6：NumPy `concatenate`

### 原始预测

- `np.concatenate([x, x], axis=0)` 的 Shape 是 `(4, 3, 4)`。
- 结果不与 `x` 共享 Buffer，会发生复制。
- 原始理由是“否则拼接语义会混乱”，机制解释不足。

### 观察

- `joined.shape == (4, 3, 4)`。
- `np.shares_memory(x, joined)` 为 `False`。
- 写入 `joined[0, 0, 0] = 999` 后，`x[0, 0, 0]` 仍为 `0`。

### 判定

- **Shape、复制和修改隔离 Supported；原始机制解释需要修正。**

### 机制与修正规则

默认调用需要构造能容纳两个输入的新输出数组，因此分配新的目标 Buffer，并把输入元素复制进去。结果不共享输入 Buffer，修改结果不会传播到输入。

## 与当前 Attention / KV Cache 的映射

- `x[:, t:t+1, :]` 是基础切片：它选择当前 Token，同时保留长度为 1 的 Sequence 轴；该选择本身是 View，不复制输入数据 Buffer。
- `np.swapaxes(k_cache, -1, -2)` 交换 `T` 与 `D_k` 两个轴，使 `q_t @ K^T` 的内维匹配；它本身是 View，但新的访问布局可能影响下游矩阵乘法。
- Dynamic KV Cache 每个 Decode Step 都用 `concatenate` 构造更长的 K/V Buffer。第 `t` 步需要复制与当前 Cache 长度同阶的数据，累计数据移动量包含 `1 + 2 + ... + T`，因此随序列长度呈二次增长。更完整地说，复制规模与 `B × T² × (D_k + D_v)` 同阶。
- Advanced Indexing 当前不在 Attention 热路径中，但若以后用索引数组选择 Batch 或 Token，需要把隐式复制计入正确性和 Benchmark 解释。

上述结论只解释 Python / NumPy Toy Lab 的内存行为，不能直接外推为 vLLM / GPU 内核的实际复制次数或性能结论。

## 原始输出

运行命令：

```bash
uv run python examples/p0_numpy_array_semantics.py
```

```text
case 1: Python name binding
a: [1, 2, 3]
b: [1, 2, 3]
same object: True

case 2: Python shallow copy
a: [[1, 9], [2]]
b: [[1, 9], [2], [3]]
same outer object: False
same nested object: True

case 3: NumPy basic slicing
x shape: (2, 3, 4)
view shape: (2, 1, 4)
x strides: (96, 32, 8)
view strides: (96, 32, 8)
shares buffer: True
mutation reached x: 999

case 4: NumPy advanced indexing
x shape: (2, 3, 4)
copied shape: (2, 3, 4)
shares buffer: False
original value: 0
copied value: 999

case 5: NumPy swapaxes
x shape: (2, 3, 4)
swapped shape: (2, 4, 3)
x strides: (96, 32, 8)
swapped strides: (96, 8, 32)
shares buffer: True
mutation reached mapped x element: 999

case 6: NumPy concatenate
x shape: (2, 3, 4)
joined shape: (4, 3, 4)
shares buffer: False
original value: 0
joined value: 999
```

## P0 验收状态

**已完成**

- 六个 Case 都保留了原始预测或明确标记“未记录”。
- 六个 Case 都定义了可观察结果和断言。
- 至少一个预测错误得到解释和修正。
- 已区分名称绑定、浅复制、View、Copy、Stride 和数据 Buffer 分配。
- 已指出修改传播边界和可能增加 Benchmark 成本的操作。
- 闭卷口述：不看代码解释六个 Case，并回答它们怎样映射到 Attention / KV Cache。

P0 已通过闭卷口述，进入 M2。
