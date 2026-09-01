# M0 空白工作表：Single-Head Attention 与 KV Cache

状态：**Archived · 未填写模板**。本页公开历史实验的问题与记录框架，不包含本站维护者的实现、测量结果或结论。

> 请只在自己的副本中填写。本站维护者的实现、测试与原始样本保存在私人作答仓库。

## Question

No Cache、Dynamic KV Cache 与 Preallocated KV Cache 怎样保持逐位置数值等价？Cache 的 Shape、有效长度与 Buffer 行为分别是什么？

## 运行前预测

```text
No Cache 每一步重新计算的范围：
Dynamic Cache 每一步追加的对象：
Preallocated Cache 每一步更新的范围：

第 t 步 K Cache Shape：
第 t 步 V Cache Shape：
第 t 步 Output Shape：

三条路径是否应数值等价：
Dynamic concatenate 是否分配新 Buffer：
Preallocated update 是否保持原 Buffer：
```

## Correctness Oracle

```text
Full-Recompute Oracle：
输入配置：
随机种子：
比较容差：
逐位置比较方法：
第一次失败信息：
修正后的规则：
```

## Cache Shape 与状态隔离

```text
Dynamic K/V Cache Shape：
Preallocated K/V Storage Shape：
有效长度：
Batch 内不同 Sequence 是否隔离：
修改一个 Sequence 后允许变化的切片：
```

## Measurement Contract

```text
控制变量：Sequence Length
固定变量：
Warm-up：
Samples：
BLAS Thread：
原始数据路径：
```

## 运行后记录

```text
No Cache 与 Oracle：
Dynamic Cache 与 Oracle：
Preallocated Cache 与 Oracle：
Buffer 观察：
性能趋势：
证据边界：
```

## 验收

- [ ] 三条路径逐位置匹配 Full-Recompute Oracle。
- [ ] K/V Cache Shape 与有效长度正确。
- [ ] Batch / Sequence 状态互不污染。
- [ ] 正确性检查位于计时之前。
- [ ] 性能结论不越过 CPU / NumPy 与固定输入边界。
