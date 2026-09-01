# M2-C 工作表：Cached MHA

状态：**Current · 未填写模板**。当前任务与评分命令以 [assignments/m2-c-cached-mha.md](../assignments/m2-c-cached-mha.md) 为准；阶段依赖见[阶段 2 路线页](/learning/phase-2/)。

> 本文件是网站公开的空白模板。下载者可以在自己的副本中填写；本站维护者必须填写私人作答仓库中的同名文件，不得把答案写回这里。

## 学习合同

```text
Question: 怎样证明逐 Token 追加 K/V 后，每一步 Cached Output 都等于完整前缀重算的最后一个位置？

Prediction: 运行前填写每一步 Cache、Weight、Output Shape，以及修改一个 Batch/Head 后允许变化的切片。

Action: 先写逐位置等价、Cache 内容、隔离与契约测试，再实现动态 Cache 追加。

Artifact: src/inference_lab/multi_head_attention.py
          tests/test_multi_head_attention.py
          checkoffs/m2-c-cached-mha.md

Acceptance: 全部位置数值等价；Shape、Cache 内容、旧 Cache 不变、隔离、非法输入和 M2-B 回归全部通过。

Next decision: 全部门禁通过后进入 M2-D GQA；否则只修正 M2-C。
```

## 运行前预测

固定：

```text
B=2, H=3, T=4, D_head=5
完整 Q/K/V: [2,3,4,5]
当前 Q/K/V: [2,3,1,5]
```

关闭实现文件后填写：

```text
t=0 时旧 Cache：
t=0 时新 K/V Cache Shape：
t=0 时 Weight Shape：
t=0 时 Output Shape：

t=1 时旧 Cache Shape：
t=1 时新 K/V Cache Shape：
t=1 时 Weight Shape：
t=1 时 Output Shape：

一般第 t 步的新 Cache Shape：
一般第 t 步的 Weight Shape：
一般第 t 步的 Output Shape：

K 应沿哪个 Axis 追加：
Softmax 应沿哪个 Axis：
为什么单步 Decode 不需要显式 Causal Mask：
为什么只缓存 K/V，不缓存 Q：
```

隔离性预测：

```text
只修改当前 K/V[b,h]，哪些新 Cache 切片允许变化：
只修改当前 Q[b,h]，哪些 Output/Weight 切片允许变化：
调用下一步后，传入的旧 Cache 是否应被原地修改：
```

## 定向阅读

只读 Hugging Face [Caching](https://huggingface.co/docs/transformers/main/cache_explanation) 中 Cache update、Attention mask 与逐 Token Shape 的段落：

```text
它确认了哪条预测：
它修正了哪条预测：
```

## 第一次失败

在实现前运行 `make m2-c`，原样记录第一条失败：

```text
命令：
失败信息：
失败发生在 Shape / Cache 更新 / Score / Softmax / Value / 返回顺序 / 输入契约中的哪一层：
```

## 逐位置等价记录

```text
t=0 Cached Output 与 Full-Recompute 最后位置：
t=1 Cached Output 与 Full-Recompute 最后位置：
t=2 Cached Output 与 Full-Recompute 最后位置：
t=3 Cached Output 与 Full-Recompute 最后位置：

每一步 Cache 是否等于原始 K/V 前缀：
每一步 Weight 最后一维是否和为 1：
旧 Cache 是否保持不变：
Batch/Head 是否隔离：
触发的非法配置：
```

## 运行后记录

```text
第一次修正后的规则：
定向测试：
完整评分：
已完成能力回归：

闭卷解释：为什么 Cached Decode 每步只计算一个 Query，但仍需要读取全部历史 K/V：
闭卷解释：为什么 Cached 与 Full-Recompute 应数值等价，却不代表两者性能相同：
```

## M2-C 验收

**待完成**

- 运行前 Shape、Axis 与隔离性预测已保存。
- 定向阅读留下确认或修正。
- 每个位置的 Cached Output/Weight 与完整前缀重算的最后位置数值等价。
- 每一步 K/V Cache Shape 和内容正确，旧 Cache 没有被原地修改。
- Batch/Head 隔离和输入契约测试通过。
- M2-B 与已完成能力的回归保持通过。
- 关闭代码后能解释 Cache 更新、可见范围和计算量边界。

全部通过后进入 **M2-D GQA Head 映射**；任一项未通过时继续修正 M2-C。
