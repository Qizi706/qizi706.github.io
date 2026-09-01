# M2-C Assignment：Cached Multi-Head Attention

这份任务书只回答“现在做什么、编辑哪里、怎样验收”。跨阶段依赖统一从 [AI Infra 实验路线](/learning/)查看；当前预测与运行记录填写在 [`checkoffs/m2-c-cached-mha.md`](../checkoffs/m2-c-cached-mha.md)。

```text
M2-A1 Head 轴（Completed）
  -> M2-A2 Q/K/V 投影（Completed）
  -> M2-B 无 Cache MHA Oracle（Completed）
  -> M2-C Cached MHA（Current）
  -> M2-D GQA Head 映射
```

当前练习只增加单步 Decode 的 Cache 更新。M2-B 的 Full-Recompute Attention 已作为可运行起点保留；个人实现、历史测试和已填写工作表仍只存在私人作答仓库。

<div class="required">
<p class="header">当前任务：M2-C · Cached MHA</p>
<p>实现一次只接收一个新 Token 的 Cached Attention，让每一步输出与完整前缀重算的最后一个位置等价。不要提前加入 GQA、Head 合并、Output Projection 或性能测量。</p>
</div>

## 获取代码并确认起点

```bash
cd labs/p2-inference-systems
make setup
make test
make grade
```

初始状态应当是：已完成能力的回归测试通过，M2-C 评分在 `TODO` 处失败。

只运行当前练习：

```bash
make m2-c
./grade-lab m2-c
make GRADEFLAGS=m2-c grade
```

## 固定接口

编辑 `src/inference_lab/multi_head_attention.py` 中的函数：

```python
def cached_multi_head_attention(
    q: np.ndarray,
    k: np.ndarray,
    v: np.ndarray,
    k_cache: np.ndarray | None = None,
    v_cache: np.ndarray | None = None,
) -> tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
    ...
```

当前步输入：

```text
Q/K/V:       [B,H,1,D_head]
旧 K/V Cache: [B,H,past_T,D_head]，第一步时二者都为 None
```

返回顺序固定为：

```text
Output:      [B,H,1,D_head]
Weight:      [B,H,1,past_T+1]
新 K Cache:  [B,H,past_T+1,D_head]
新 V Cache:  [B,H,past_T+1,D_head]
```

## 必须保持的语义

- 当前 K/V 只沿 Token Axis 追加一次，历史 Cache 的内容与顺序不能改变。
- 当前 Query 只与追加后的完整 K Cache 计算 Score，并用 Weight 聚合完整 V Cache。
- 第 `t` 步输出必须与 `multi_head_causal_attention(Q[:,:,:t+1], K[:,:,:t+1], V[:,:,:t+1])` 的最后一个 Query 位置数值等价。
- 单步 Decode 的 Cache 中没有未来 Token，因此不需要再构造严格上三角 Causal Mask。
- Batch 与 Head 是独立的前导轴，修改一个切片不能污染其他切片。
- 本练习使用动态追加；调用后不得原地改写传入的旧 Cache。

## 输入契约

在拼接或矩阵乘法前检查并抛出 `ValueError`：

- Q/K/V 不是四维，或三者 Shape 不相同；
- 当前 Token Axis 不是 1，或 Batch/Head/D_head 为空；
- 只提供 K Cache 或只提供 V Cache；
- K/V Cache 不是四维、Shape 不相同，或 Batch/Head/D_head 与当前输入不匹配。

不要在本 Gate 支持多 Token Prefill、不同 Query/KV Head 数、预分配 Cache 或原地更新。

## 建议实现顺序

1. 关闭实现文件，在工作表填写 `t=0`、`t=1` 与一般第 `t` 步的 Shape。
2. 先写循环 Decode 测试，用 M2-B Full-Recompute Output 的最后一个位置作为 Oracle。
3. 再检查每一步 Cache Shape 和内容是否等于输入前缀。
4. 添加 Batch/Head 隔离、旧 Cache 不变和非法输入测试。
5. 最后实现输入契约、K/V 追加、Score、稳定 Softmax 与 `Weight @ V`。

如果卡住，按顺序检查：

- `np.concatenate((old_cache, current), axis=-2)` 是否只沿 Token Axis 追加；
- `swapaxes(new_k_cache, -1, -2)` 是否得到 `[B,H,D_head,current_T]`；
- Softmax 是否沿 Weight 的最后一个历史 Token Axis；
- 返回顺序是否为 `output, weights, new_k_cache, new_v_cache`。

## 验收命令

```bash
make m2-c
make grade
make test
git diff --check
```

公开评分覆盖：逐位置 Full-Recompute 等价、Cache/Weight/Output Shape 与内容、旧 Cache 不变、Batch/Head 隔离和非法输入契约。`make grade` 只评分当前未完成的 M2-C；`make test` 运行已完成能力的公开回归。

<div class="warning">
<p><strong>停止条件：</strong>所有位置和全部回归通过，并完成私人工作表的闭卷解释后，才进入 M2-D GQA。任一项失败时只修正 Cache 语义。</p>
</div>

## 公开与私人边界

网站只发布本任务书、空白工作表、带 M2-C `TODO` 的 Starter、已完成能力的最小回归和当前公开评分器。本站维护者的实现、额外测试、第一次失败与填写后的工作表继续保存在 `.work/` 私人仓库中。
