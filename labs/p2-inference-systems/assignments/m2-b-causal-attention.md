# M2-B Assignment：Multi-Head Causal Attention

这份任务书只回答“现在做什么、编辑哪里、怎样验收”。跨阶段路线与所有 Gate 的依赖统一从 [AI Infra 实验路线](/learning/)查看；Phase 2 的完整路线位于[阶段 2 路线页](/learning/phase-2/)。

当前 Lab 用最小 NumPy 实现建立 Attention Oracle：先把投影结果拆成多个 Head，再完成 Q/K/V 投影，最后实现不带 KV Cache 的 Multi-Head Causal Attention。完成它之后，Cached MHA、GQA 和真实 Serving 实验才有可信的数值基线。

```text
Phase 1 Checkoff
  → P0 NumPy 语义
  → M0 Single-Head KV Cache
  → M1 Batch Size Curve
  → M2-A1 Head 轴
  → M2-A2 Q/K/V 投影
  → M2-B 无 Cache MHA  ← 当前
  → M2-C Cached MHA
  → M2-D GQA
  → M2-E KV 容量
  → S0 真实 vLLM 环境
```

## 先分清几份材料

这些文件不是几份并列的手册，它们位于同一条执行链上：

| 你要回答的问题                 | 应该打开的材料                                                                | 职责                                     |
| ------------------------------ | ----------------------------------------------------------------------------- | ---------------------------------------- |
| 当前位于哪一层？               | [阶段 2 路线页](/learning/phase-2/)                                           | 依赖、状态、交付、Checkoff 与下一层      |
| 现在具体做什么？               | 本 README                                                                     | 当前任务、允许修改的范围、命令与评分     |
| 怎样审计阶段边界？             | [阶段 2 路线页](/learning/phase-2/)                                           | 依赖、状态、交付与停止条件               |
| 空白工作表在哪里？             | [`checkoffs/m2-b-causal-attention.md`](../checkoffs/m2-b-causal-attention.md) | 公开模板，不保存本站维护者的答案         |
| 我的答案和证据记在哪里？       | 私人作答仓库中的同名文件                                                      | 实现、失败记录、Checkoff 与结果           |
| 机制与结果怎样解释？           | [阶段 2 路线页](/learning/phase-2/)中的文章区                                 | 系统文章解释机制，实验文章总结已完成证据 |

正常路径是：**路线页定位 → Assignment 执行 → M2-B 工作表记录 → 实现与测试 → results 验收**。只有需要审计详细实验协议或停止条件时，才打开总计划。

当前练习是 **M2-B**。M2-A1 与 M2-A2 已作为可运行的起点保留；M2-B 故意只有输入契约和 `TODO`，初次评分失败是正常状态。

<div class="required">
<p class="header">当前任务：M2-B · 无 Cache MHA Oracle</p>
<p>只编辑 <code>src/inference_lab/multi_head_attention.py</code> 和自己的测试记录。让每个 Batch、每个 Head 独立完成 Scaled Dot-Product Causal Attention；不要提前加入 KV Cache、GQA、Head 合并或 Output Projection。</p>
</div>

## 获取代码并启动 Lab

如果已经在本站仓库中：

<pre>
$ <kbd>cd labs/p2-inference-systems</kbd>
$ <kbd>make setup</kbd>
$ <kbd>make grade</kbd>
</pre>

如果从网站单独下载：

<pre>
$ <kbd>curl -LO https://zqwiki.cn/labs/p2-inference-systems.tar.gz</kbd>
$ <kbd>tar -xzf p2-inference-systems.tar.gz</kbd>
$ <kbd>cd p2-inference-systems</kbd>
$ <kbd>make setup</kbd>
$ <kbd>make grade</kbd>
</pre>

初始评分应该呈现这个状态：

<pre>
$ <kbd>make grade</kbd>
== m2-a1: PASS (20/20) ==
== m2-a2: PASS (20/20) ==
== m2-b: FAIL (0/60) ==

Score: 40/100
Still working: m2-b
</pre>

只运行当前练习可以使用任一命令：

<pre>
$ <kbd>make m2-b</kbd>
$ <kbd>./grade-lab m2-b</kbd>
$ <kbd>make GRADEFLAGS=m2-b grade</kbd>
</pre>

<kbd>make test</kbd> 只运行已经完成的回归测试，因此在 M2-B 尚未实现时仍应通过。<kbd>make grade</kbd> 代表整份作业的当前完成度，会在 `TODO` 处失败。

## 评分方式

| Exercise | 内容                                         | 分值 | 定向命令              |
| -------- | -------------------------------------------- | ---: | --------------------- |
| M2-A1    | `split_heads` Shape、坐标映射与内存共享      |   20 | <kbd>make m2-a1</kbd> |
| M2-A2    | Q/K/V 投影、GQA Shape 契约与非法输入         |   20 | <kbd>make m2-a2</kbd> |
| M2-B     | Score、Causal Mask、Softmax、Oracle 与隔离性 |   60 | <kbd>make m2-b</kbd>  |

公开评分测试位于 [`grader_tests/test_m2_b_causal_attention.py`](../grader_tests/test_m2_b_causal_attention.py)。先根据任务说明写自己的最小测试；卡住时再逐级查看工作表、错误输出和公开评分测试，不要直接从测试倒推并粘贴实现。

## 已完成的起点

### M2-A1：拆分 Head

`split_heads(projected, num_heads)` 已把 `[B,T,H×D_head]` 转换为 `[B,H,T,D_head]`，并通过 Shape、坐标映射与内存共享测试：

<pre>
$ <kbd>make m2-a1</kbd>
Ran 3 tests
OK
== m2-a1: PASS (20/20) ==
</pre>

### M2-A2：投影 Q/K/V

`project_qkv(...)` 已接受 `X=[B,T,D_model]` 和三个二维权重，返回带显式 Head 轴的 Q/K/V，并在矩阵乘法或 `reshape` 前检查非法配置：

<pre>
$ <kbd>make m2-a2</kbd>
Ran 3 tests
OK
== m2-a2: PASS (20/20) ==
</pre>

这里保留 A1/A2 只是为了提供 M2-B 的可信起点；它们的个人预测、失败与验收历史只保存在私人作答仓库。

## M2-B：实现无 Cache MHA（当前）

编辑函数：

```python
def multi_head_causal_attention(
    q: np.ndarray,
    k: np.ndarray,
    v: np.ndarray,
) -> tuple[np.ndarray, np.ndarray]:
    """Return per-head output and attention weights without a KV cache."""
```

输入 Q/K/V 都是 `[B,H,T,D_head]`。返回值顺序固定为 `output, weights`：

```text
weights  [B,H,T,T]
output   [B,H,T,D_head]
```

你的实现必须满足：

- Score 使用 `Q @ K^T`，并除以 `sqrt(D_head)`。
- 位置 `i` 只能看到 `0..i`，严格上三角的 Weight 必须为 0。
- Softmax 沿最后一个历史 Token 轴计算，并使用减最大值的稳定写法。
- Batch 与 Head 只是前导维，任何运算都不能把它们混在一起。
- 非四维输入、不同 Shape、空 Batch/Head/Token/Head Width 必须抛出 `ValueError`。
- 本练习只返回逐 Head Output 与 Weight，不合并 Head。

### 建议步骤

先关闭实现文件。下载者可在自己的副本中填写 [`checkoffs/m2-b-causal-attention.md`](../checkoffs/m2-b-causal-attention.md)；本站维护者必须填写私人作答仓库中的同名文件，不能修改公开模板。然后在私人仓库的 `tests/test_multi_head_attention.py` 中写一个不调用生产函数的标量 Oracle，保存第一次失败，再完成 `TODO`。

如果需要提示，请按这个顺序展开：

- Hint 1：`np.matmul` 把最后两个轴当矩阵，前面的 `[B,H]` 是独立的堆叠维度。
- Hint 2：严格未来位置可由 `np.triu(..., k=1)` 标出。
- Hint 3：应用 Mask 后再做 Softmax；最大值、求和都必须保留最后一维以便广播。
- Hint 4：先让 `make m2-b` 的 Shape 和契约错误消失，再处理数值 Oracle 与隔离性。

完成后应该看到：

<pre>
$ <kbd>make m2-b</kbd>
Ran 5 tests
OK
== m2-b: PASS (60/60) ==

Score: 60/60
All selected exercises passed.
</pre>

## 完成检查

<div class="warning">
<p><strong>M2-B 定向评分通过后，运行整份作业和历史回归：</strong></p>
<pre>
$ <kbd>make grade</kbd>
$ <kbd>make test</kbd>
$ <kbd>git diff --check</kbd>
</pre>
<p>最终评分必须是 <code>Score: 100/100</code>。然后回到私人作答仓库的 M2-B 工作表填写第一次失败、修正规则与闭卷解释；只有验收清单全部完成，才进入 M2-C Cached MHA。网站上的同名页面始终保持为空白模板。</p>
</div>

## 文件布局

```text
p2-inference-systems/
├── README.md                 # 下载、启动和公开/私有边界
├── lab.json                 # 发布白名单与证据门禁
├── Makefile                 # setup、回归与单项评分入口
├── grade-lab       # 公开评分脚本
├── assignments/
│   └── m2-b-causal-attention.md       # 当前任务书
├── checkoffs/
│   └── m2-b-causal-attention.md       # 空白模板
├── grader_tests/
│   └── test_m2_b_causal_attention.py          # M2-B 公开验收测试
├── src/inference_lab/
│   └── multi_head_attention.py        # M2-A1/A2 起点与 M2-B TODO
└── tests/
    └── test_multi_head_attention.py   # 前置能力回归
```

已完成任务的源码、工作表和原始证据由私人作答仓库管理，不进入本站发布包。
