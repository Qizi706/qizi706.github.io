# M2-A1 空白工作表：Query Head 轴变换

状态：**Archived · 未填写模板**。本页公开历史练习的题目与记录框架，不包含本站维护者的预测、失败或答案。

> 请只在自己的副本中填写。本站维护者的已填写版本保存在私人作答仓库。

## 学习契约

```text
Question: 怎样把 [B,T,H*D_head] 拆成 [B,H,T,D_head]，并证明轴顺序和元素映射正确？
Prediction:
Time box:
Artifact:
Acceptance:
```

## 固定输入与运行前预测

```text
B=2, T=4, H=5, D_head=3
输入 Shape：
reshape 后 Shape：
swapaxes 后 Shape：

选择一个非零坐标 [b=?,h=?,t=?,d=?]：
它在扁平输入中的最后一维下标：
对应关系：

reshape 是 View 还是 Copy：
swapaxes 是 View 还是 Copy：
最终结果是否与输入共享 Buffer：
理由：
```

## 最小接口

```python
def split_heads(projected: np.ndarray, num_heads: int) -> np.ndarray:
    ...
```

## 先写测试

```text
Shape 测试：
非零坐标元素映射测试：
np.shares_memory 测试：
非法输入测试：
第一次失败信息：
```

## 运行后记录

```text
实际 Output Shape：
实际坐标映射：
实际内存共享关系：
预测与观察的差异：
修正后的规则：
定向测试：
完整回归：
闭卷解释：
```

## 验收

- [ ] Shape 正确。
- [ ] 至少一个非零坐标匹配独立元素映射。
- [ ] 内存共享关系与解释一致。
- [ ] 非法维度与 Head 配置明确失败。
- [ ] 关闭代码后能重新推导轴顺序。
