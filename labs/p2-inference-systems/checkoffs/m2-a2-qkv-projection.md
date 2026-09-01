# M2-A2 空白工作表：Q/K/V 投影与输入契约

状态：**Archived · 未填写模板**。本页公开历史练习的题目与记录框架，不包含本站维护者的预测、失败或答案。

> 请只在自己的副本中填写。本站维护者的已填写版本保存在私人作答仓库。

## 学习契约

```text
Question: 同一个 Head 拆分规则怎样约束 Q/K/V，并在错误 Shape 进入矩阵乘法或 reshape 前拒绝它？
Prediction:
Time box:
Artifact:
Acceptance:
```

## 固定配置与运行前预测

```text
B=2, T=5, D_model=7
H_q=4, H_kv=2, D_head=3

X Shape：
W_q Shape：
W_k Shape：
W_v Shape：
Q Shape：
K Shape：
V Shape：

投影是否创建新 Buffer：
split_heads 是否与投影结果共享 Buffer：
理由：
```

选择至少两个非零坐标，写出独立标量求和：

```text
Q[b=?,h=?,t=?,d=?]：
K[b=?,h=?,t=?,d=?]：
V[b=?,h=?,t=?,d=?]：
```

## 输入契约预测

| Case                       | 应在何处失败 | 预期异常     |
| -------------------------- | ------------ | ------------ |
| X 不是三维                 |              | `ValueError` |
| Weight 不是二维            |              | `ValueError` |
| Weight 输入宽度不匹配      |              | `ValueError` |
| 投影宽度不能被 Head 数整除 |              | `ValueError` |
| Q/K/V 的 D_head 不一致     |              | `ValueError` |

## 定向阅读记录

```text
NumPy matmul 确认或修正了：
NumPy reshape 确认或修正了：
NumPy transpose / swapaxes 确认或修正了：
```

## 运行后记录

```text
实际 Q/K/V Shape：
独立坐标 Oracle：
Buffer 关系：
第一次失败信息：
修正后的规则：
定向测试：
完整回归：
闭卷 Shape 推导：
```

## 验收

- [ ] Q/K/V Shape 与轴语义正确。
- [ ] 至少两个非零坐标匹配独立标量 Oracle。
- [ ] 五类非法配置在矩阵乘法或 reshape 前失败。
- [ ] A1 回归保持通过。
- [ ] 关闭代码后能重新推导所有 Shape。
