# M1 空白工作表：Batch Size 曲线

状态：**Archived · 未填写模板**。本页只公开历史实验的记录框架，不包含本站维护者的预测、原始样本、结果或结论。

> 请只在自己的副本中填写。本站维护者的已填写版本与原始数据保存在私人作答仓库。

## Question

固定 `T=128` 时，Batch Size 从 `1` 增加到 `2/4/8`，Batched Decode 的整批延迟、摊销成本和输出位置吞吐如何变化？哪个点开始不再得到至少 10% 的相邻吞吐收益？

## 运行前预测

```text
H1：
可能推翻 H1 的结果：

H2：
可能推翻 H2 的结果：

H3：
可能推翻 H3 的结果：

H4：
可能推翻 H4 的结果：
```

## Correctness Gate

```text
Oracle：
输入 Shape：
Batch 内状态隔离检查：
计时前测试结果：
```

## Measurement Contract

```text
控制变量：
固定变量：
Batch Size：1 / 2 / 4 / 8
每组 Warm-up：
每组 Samples：
运行顺序随机化方法：
BLAS Thread：
原始数据路径：
```

## Result

| B   | Batch P50 | Batch P95 | P50 / B | Positions/s | 相邻吞吐增幅 |
| --- | --------- | --------- | ------- | ----------- | ------------ |
| 1   |           |           |         |             |              |
| 2   |           |           |         |             |              |
| 4   |           |           |         |             |              |
| 8   |           |           |         |             |              |

```text
Knee：
第一次失败或异常：
修正规则：
```

## Evidence and Boundary

```text
原始样本行数：
汇总是否完全由 Raw CSV 重建：
曲线是否完全由 Raw CSV 生成：
结论：
不能外推到真实 Serving 的内容：
下一步：
```
