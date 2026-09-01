# P0 空白工作表：Python / NumPy 对象与 Buffer 语义

状态：**Archived · 未填写模板**。本页公开历史练习的问题与记录框架，不包含本站维护者的预测、观察或答案；当前任务从[阶段 2 路线页](/learning/phase-2/)进入。

> 请只在自己的副本中填写。本站维护者的已填写版本保存在私人作答仓库，不会发布到网站。

## 学习问题

名称绑定、浅复制、基础切片、Advanced Indexing、`swapaxes` 与 `concatenate` 分别怎样影响对象身份、Shape、Stride、数据 Buffer、修改传播与分配？

## 通用记录格式

每个 Case 都在运行前填写预测，运行后再填写观察与修正规则：

```text
对象身份预测：
Shape / Stride 预测：
是否共享 Buffer：
修改是否传播：
是否发生新分配：

实际观察：
判定：Binding / View / Copy / Allocation
修正后的规则：
```

## Case 1：Python 名称绑定

```text
操作：y = x
预测：
观察：
判定与解释：
```

## Case 2：Python 浅复制

```text
操作：copy.copy(container)
外层对象预测：
嵌套可变对象预测：
观察：
判定与解释：
```

## Case 3：NumPy 基础切片

```text
操作：view = x[:, 1:]
Shape / Stride 预测：
Buffer 与修改传播预测：
观察：
判定与解释：
```

## Case 4：NumPy Advanced Indexing

```text
操作：selected = x[[0, 1]]
Shape 预测：
Buffer 与修改传播预测：
观察：
判定与解释：
```

## Case 5：NumPy swapaxes

```text
操作：swapped = np.swapaxes(x, -1, -2)
Shape / Stride 预测：
Buffer 与修改传播预测：
观察：
判定与解释：
```

## Case 6：NumPy concatenate

```text
操作：joined = np.concatenate((left, right), axis=...)
Shape 预测：
是否分配新 Buffer：
观察：
判定与解释：
```

## Attention / KV Cache 映射

```text
reshape / swapaxes 对 Head 轴意味着什么：
Dynamic Cache 的 concatenate 意味着什么：
哪些 NumPy 结论不能直接外推到 GPU / vLLM：
```

## 验收

- [ ] 六个 Case 都保存了运行前预测。
- [ ] 每个 Case 都记录了对象身份、Shape、Stride、Buffer 与修改传播。
- [ ] 能区分 Binding、View、Copy 与新分配。
- [ ] 能把规则映射回 Attention / KV Cache，但不越过 CPU / NumPy 证据边界。
