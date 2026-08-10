---
title: '分布式基础：调度和负载均衡'
description: '背景 前面已经学习了几组基础： 这些内容已经覆盖了一个 KV Cache 系统的很多核心问题： 接下来要学习的是调度和负载均衡。 调度解决的问题是： 负载均衡解决的问题是： 在普通 Web 服务里，负载均衡可能只是把请求均匀打到多台机器。但在训练-推理一体存储和 KV Cache 场景里，调度要复杂得多。 因为请...'
pubDate: '2026-07-23T10:30:00+08:00'
categories:
  - '分布式'
tags:
  - '调度'
  - '负载均衡'
  - 'KV Cache'
draft: false
mathjax: false
---

## 背景

前面已经学习了几组基础：

```text
操作系统、网络、并发与存储。
RPC 和远程调用。
状态机、分片、路由与元数据。
副本和一致性。
故障处理。
缓存策略、迁移与淘汰。
```

这些内容已经覆盖了一个 KV Cache 系统的很多核心问题：

```text
数据在哪里？
状态是否正确？
远程调用是否可靠？
故障后如何恢复？
缓存应该留在 HBM、CPU Memory、SSD，还是远端？
显存满了应该淘汰谁？
```

接下来要学习的是调度和负载均衡。

调度解决的问题是：

```text
一个请求应该交给哪个节点、哪个 worker、哪张 GPU 来处理？
```

负载均衡解决的问题是：

```text
如何避免某些节点过载，而另一些节点空闲？
```

在普通 Web 服务里，负载均衡可能只是把请求均匀打到多台机器。但在训练-推理一体存储和 KV Cache 场景里，调度要复杂得多。

因为请求不是无状态的。它会和模型副本、GPU HBM、KV Cache 位置、上下文长度、batch、网络拓扑绑定在一起。

## 学习目标

这一组需要掌握：

```text
调度是什么
负载均衡是什么
Round Robin
Least Loaded
Power of Two Choices
Locality-aware Scheduling
Cost-based Scheduling
队列
优先级
资源隔离
背压
热点处理
调度和 KV Cache locality 的关系
```

对 KV Cache 场景，要能回答：

```text
请求应该调到空闲 GPU，还是调到已有 KV Cache 的 GPU？
如果目标节点没有 cache，要不要迁移 cache？
上下文很长的请求会不会拖慢 batch？
某个 worker GPU 空，但 HBM 已经很紧张，还能调度吗？
后台迁移会不会影响在线请求？
某个模型特别热门时，如何避免热点？
```

这一组的目标是：理解为什么“把请求发给最空闲的节点”不一定是最优。

## 调度不只是负载均衡

负载均衡通常关注请求如何分摊到多个节点。

例如：

```text
node_a 当前 10 个请求。
node_b 当前 3 个请求。
node_c 当前 5 个请求。
```

直觉上，新的请求应该发给 `node_b`。

但在 KV Cache 场景里，事情不这么简单。

假设：

```text
node_a 当前请求多，但目标请求需要的 KV Cache 已经在 node_a。
node_b 当前很空，但没有目标 KV Cache。
```

如果把请求发给 `node_b`，可能需要：

```text
从 node_a 远程读取 cache。
或者把 cache 从 node_a 迁移到 node_b。
或者重新计算 cache。
```

这些成本可能比排队等待更高。

所以调度要同时考虑：

```text
计算资源是否空闲。
KV Cache 是否本地命中。
迁移成本多大。
网络是否拥塞。
GPU HBM 是否足够。
请求是否延迟敏感。
```

## 推理请求的阶段

大模型推理通常可以粗略分为两个阶段：

```text
prefill
decode
```

### Prefill

`prefill` 处理输入 prompt，计算初始 KV Cache。

特点：

```text
计算量大。
和输入长度强相关。
可以并行处理较多 token。
会生成一批 KV Cache。
首 token 延迟 TTFT 受它影响很大。
```

### Decode

`decode` 自回归生成后续 token，每次生成一个或少量 token。

特点：

```text
每一步都要读取历史 KV Cache。
对 KV Cache 访问频繁。
单步计算相对小，但会重复很多轮。
每 token 延迟 TPOT 很重要。
```

这两个阶段的调度目标不同。

```text
prefill 更关注计算吞吐和首 token 延迟。
decode 更关注持续低延迟和 KV Cache locality。
```

如果调度器不区分阶段，很容易做出不合适的决策。

## 调度要看哪些资源？

在 KV Cache 推理系统里，调度器至少要看这些资源：

```text
GPU 利用率
GPU HBM 剩余容量
CPU Memory 剩余容量
网络带宽
PCIe/NVLink 带宽
当前 batch 大小
请求队列长度
模型副本位置
KV Cache 位置
BlockGroup 状态
节点健康状态
```

还要看请求本身：

```text
模型 ID
输入长度
预计输出长度
上下文长度
请求优先级
租户信息
是否已有可复用 KV Cache
是否需要跨节点读取 cache
```

所以调度器的输入不是一个简单的 QPS 数字，而是一组资源状态和请求特征。

## Round Robin

`Round Robin` 是轮询。

例如有三个 worker：

```text
worker_a
worker_b
worker_c
```

请求按顺序分配：

```text
req_1 -> worker_a
req_2 -> worker_b
req_3 -> worker_c
req_4 -> worker_a
```

优点：

```text
实现简单。
不需要复杂状态。
请求量大且请求成本相近时效果还可以。
```

缺点：

```text
不感知 worker 当前负载。
不感知请求大小。
不感知 GPU HBM。
不感知 KV Cache 位置。
不感知慢节点。
```

在 KV Cache 场景里，单纯轮询通常不够。

因为请求成本差异很大：

```text
短 prompt 和长 prompt 成本不同。
已有 KV Cache 和没有 KV Cache 成本不同。
decode 10 个 token 和 decode 1000 个 token 成本不同。
```

## Least Loaded

`Least Loaded` 是选择当前负载最低的节点。

负载可以用很多指标表示：

```text
当前请求数。
队列长度。
GPU 利用率。
HBM 使用率。
正在 decode 的序列数。
预计剩余 token 数。
```

优点：

```text
比轮询更感知当前系统状态。
能避免明显的请求堆积。
```

缺点：

```text
负载指标不好定义。
调度器需要频繁获取 worker 状态。
状态可能过期。
只看负载可能忽略 cache locality。
```

例如：

```text
worker_a 负载 70%，但有目标 KV Cache。
worker_b 负载 30%，但没有目标 KV Cache。
```

如果只看负载，会选择 `worker_b`。

但如果迁移 cache 成本很高，实际可能 `worker_a` 更合适。

## Power of Two Choices

`Power of Two Choices` 是一个简单但很实用的策略。

流程：

```text
随机选两个 worker。
比较它们的负载。
选择更空的那个。
```

它的优点是：

```text
比纯随机好很多。
比全局找最小负载开销低。
适合大规模集群。
```

缺点是：

```text
仍然需要负载指标。
不天然感知 KV Cache locality。
随机选中的两个 worker 可能都不是 cache 最优位置。
```

在 KV Cache 系统里，可以做一个改造：

```text
候选 worker 不是完全随机，而是优先从 cache 所在节点、模型副本所在节点、健康节点中选。
```

这样可以把简单策略和局部性结合起来。

## Locality-aware Scheduling

`Locality-aware Scheduling` 是局部性感知调度。

核心思想是：

```text
计算在哪里，数据最好也在哪里。
```

对 KV Cache 来说，就是：

```text
请求需要的 BlockGroup 在哪里，尽量把请求调到那里。
```

局部性可以分层：

```text
同一张 GPU：最好。
同一台机器的另一张 GPU：可能需要 GPU 间拷贝。
同一台机器 CPU Memory：需要搬到 GPU。
同机 SSD：更慢。
远端 GPU/CPU/SSD：需要网络。
已淘汰：需要重算。
```

调度器可以为不同位置设置不同成本：

```text
local_hbm_cost = 0
local_cpu_cost = 10
local_ssd_cost = 50
remote_memory_cost = 80
remote_ssd_cost = 150
recompute_cost = 200
```

这些数字不是固定值，只是表达相对成本。

## Cost-based Scheduling

`Cost-based Scheduling` 是基于成本的调度。

它把一个候选 worker 的总成本估出来，然后选成本最低的。

一个简化打分：

```text
total_cost = compute_wait_cost
           + cache_access_cost
           + migration_cost
           + memory_pressure_cost
           + network_cost
           + risk_cost
           - locality_gain
```

含义：

```text
compute_wait_cost：排队等待计算的成本。
cache_access_cost：访问 KV Cache 的成本。
migration_cost：迁移 cache 的成本。
memory_pressure_cost：显存压力成本。
network_cost：网络传输成本。
risk_cost：节点健康风险。
locality_gain：本地命中的收益。
```

例如：

```text
worker_a:
  GPU 比较忙
  但 KV Cache 在本地 HBM

worker_b:
  GPU 很空
  但需要跨节点迁移 2GB cache
```

调度器不应该只看 GPU 空闲度，而要比较总成本。

如果迁移 2GB cache 会显著增加延迟，`worker_a` 可能更好。

## 队列

调度系统通常会有队列。

队列可能存在于多个层级：

```text
gateway 队列
scheduler 队列
worker 队列
GPU batch 队列
cache migration 队列
metadata update 队列
```

队列的作用是缓冲请求，但队列过长会增加延迟。

需要关注：

```text
队列长度。
等待时间。
队列中请求的优先级。
是否存在队头阻塞。
是否有长请求拖住短请求。
```

在推理系统里，长上下文请求可能导致队头阻塞。

例如：

```text
一个超长 prefill 请求排在前面。
后面很多短请求等待。
```

可能需要：

```text
按请求类型拆队列。
短请求优先。
长请求限流。
prefill 和 decode 分开调度。
```

## 优先级

不是所有请求都同等重要。

优先级可以来自：

```text
业务等级。
租户等级。
交互式请求和离线请求。
短请求和长请求。
在线 decode 和后台迁移。
```

一般来说：

```text
在线请求优先于后台任务。
decode 关键路径优先于预取。
高优先级租户优先于普通租户。
健康恢复任务可能优先于普通预热任务。
```

但优先级也要避免饿死低优先级任务。

例如后台迁移长期没有机会执行，可能导致 HBM 压力越来越大。

所以优先级系统通常需要：

```text
限额。
配额。
老化 aging。
最大等待时间。
```

## 资源隔离

多租户系统需要资源隔离。

否则一个租户的长上下文请求可能占满：

```text
GPU HBM
网络带宽
metadata server QPS
迁移队列
worker 线程池
```

常见隔离方式：

```text
按租户限制 QPS。
按租户限制 HBM 使用量。
按租户限制并发请求数。
按租户限制迁移带宽。
为关键业务保留资源池。
```

KV Cache 系统尤其要限制：

```text
单个租户占用的 BlockGroup 数量。
单个租户占用的 HBM/CPU Memory/SSD。
单个租户触发的远程读取和迁移流量。
```

资源隔离的目标不是追求绝对公平，而是防止一个业务把整个系统拖垮。

## 背压

`backpressure` 是背压。

当下游处理不过来时，上游不能无限制继续发送请求。

例如：

```text
worker 队列过长。
cache migration 队列过长。
metadata server 更新延迟升高。
远端读取 P99 变差。
```

这时上游应该：

```text
减少发往该节点的请求。
降低调度权重。
拒绝部分低优先级请求。
暂停后台迁移。
返回可重试错误。
```

没有背压会导致：

```text
队列无限增长。
请求超时堆积。
重试风暴。
整个系统延迟恶化。
```

背压是负载均衡的重要组成部分。

## 热点调度

热点可能来自：

```text
热门模型。
热门系统 prompt。
大量请求复用同一份 prefix cache。
某个租户流量突然增加。
某个节点持有太多热 BlockGroup。
```

热点处理方式：

```text
增加模型副本。
增加热点 KV Cache 副本。
把热点 BlockGroup 复制到更多节点。
调度时优先分散热点请求。
对热点租户限流。
拆分过大的 BlockGroup。
```

这里要注意：复制热点 cache 可以提升读扩展能力，但也会带来副本一致性和内存占用问题。

所以热点处理不是单纯“多复制几份”，而是要考虑：

```text
副本是否值得。
副本放在哪里。
副本是否会占用太多 HBM。
副本什么时候回收。
```

## 调度和迁移的取舍

调度器经常要面对一个问题：

```text
移动请求，还是移动数据？
```

例如：

```text
请求当前在 worker_a 排队。
它需要的 KV Cache 在 worker_b。
worker_c 很空，但没有 KV Cache。
```

可能的选择：

```text
把请求调到 worker_b，利用 cache locality。
把 cache 从 worker_b 迁移到 worker_c。
让 worker_c 远程读取 worker_b 的 cache。
重新计算 cache。
继续在 worker_a 等待。
```

每个选择都有成本。

```text
调到 worker_b：可能排队更久。
迁移到 worker_c：消耗网络和 HBM。
远程读取：增加 decode 延迟。
重新计算：消耗计算资源。
继续等待：增加排队延迟。
```

调度器要做的是比较这些成本，而不是只看当前谁最空。

## Batch 调度

推理系统常常会把多个请求合成 batch，提高 GPU 利用率。

batch 调度要考虑：

```text
请求长度是否相近。
decode 步数是否相近。
KV Cache 是否都在本地。
是否会被某个慢请求拖住。
是否会导致 HBM 爆掉。
```

batch 太小：

```text
GPU 利用率低。
吞吐差。
```

batch 太大：

```text
单请求延迟可能变高。
HBM 压力增大。
长尾请求拖慢整个 batch。
```

KV Cache 场景里，batch 调度还要考虑：

```text
batch 内请求的 KV Cache 是否都能放下。
是否需要跨节点拉取大量 cache。
是否有请求正在等待迁移完成。
```

## Prefill 和 Decode 分离调度

有些系统会把 prefill 和 decode 分开调度。

原因是它们的资源特征不同：

```text
prefill 更偏计算密集。
decode 更依赖 KV Cache 访问和低延迟。
```

分离后可以：

```text
prefill worker 专注处理长 prompt。
decode worker 专注低延迟生成。
prefill 生成 KV Cache 后迁移或交接给 decode worker。
```

但这会带来新的问题：

```text
prefill 和 decode 之间如何交接 KV Cache？
KV Cache 要不要迁移？
交接时元数据如何更新？
请求如何保持连续性？
```

所以 prefill/decode 分离本质上又回到了前面学过的状态机、元数据、迁移和一致性。

## 调度器状态是否可靠？

调度器依赖 worker 上报状态。

但这些状态可能过期。

例如：

```text
worker 上报 HBM 剩余 10GB。
调度器根据这个信息分配一个请求。
但实际 worker 已经被其他请求占用了 8GB。
```

所以调度器要处理状态陈旧问题。

常见做法：

```text
worker 定期 heartbeat 上报状态。
调度时预留 safety margin。
worker 本地做最终资源检查。
分配失败时返回明确错误。
调度器刷新 worker 状态后重试或换节点。
```

不要假设调度器看到的状态永远准确。

## 常见错误设计

### 只看请求数

错误做法：

```text
哪个 worker 请求数少，就调到哪里。
```

问题：

```text
请求成本差异很大。
长上下文请求和短请求不能等价。
有 KV Cache 和没有 KV Cache 成本不同。
```

更好的方式：

```text
用预计计算成本、KV Cache 成本、显存压力一起评估。
```

### 只看 GPU 利用率

错误做法：

```text
哪个 GPU 空，就调到哪个 GPU。
```

问题：

```text
目标 GPU 可能没有 KV Cache。
迁移成本可能很高。
HBM 可能不足。
网络可能拥塞。
```

更好的方式：

```text
同时考虑 cache locality、HBM 水位和迁移成本。
```

### 忽略状态陈旧

错误做法：

```text
调度器完全相信上一次 heartbeat。
```

问题：

```text
worker 状态可能已经变化。
```

更好的方式：

```text
调度器做估算，worker 本地做最终校验。
```

### 后台任务和在线请求同等优先级

错误做法：

```text
后台迁移和在线 decode 共用资源，不区分优先级。
```

问题：

```text
后台任务可能拖慢在线请求 P99。
```

更好的方式：

```text
在线请求优先。
后台任务限流。
资源池隔离。
```

### 调度和缓存策略分离

错误做法：

```text
调度器只管选 worker。
cache manager 只管迁移和淘汰。
两者互相不知道对方决策。
```

问题：

```text
调度器可能把请求调到没有 cache 的节点。
cache manager 可能淘汰即将被调度使用的 cache。
```

更好的方式：

```text
调度器感知 cache locality。
cache manager 感知请求优先级和未来访问。
```

## 如何排查调度问题？

### 指标

需要关注：

```text
scheduler_qps
scheduler_latency
scheduler_queue_length
worker_queue_length
gpu_utilization
gpu_hbm_used_bytes
batch_size
batch_wait_time
request_ttft
request_tpot
p99_decode_latency
cache_local_hit_rate
remote_cache_read_count
cache_migration_triggered_by_schedule
schedule_reject_count
worker_assignment_failure_count
```

### 日志字段

日志里最好有：

```text
request_id
model_id
tenant_id
selected_worker
candidate_workers
schedule_reason
estimated_compute_cost
estimated_cache_cost
estimated_migration_cost
cache_location
cache_state
gpu_hbm_available
queue_length
priority
```

### 排查问题

当延迟升高时，可以问：

```text
请求是在 scheduler 排队，还是 worker 排队？
调度是否考虑了 cache locality？
是否大量请求被调到没有 cache 的节点？
是否因为 HBM 不足触发迁移或淘汰？
是否某个 worker 持有热点 cache 形成热点？
batch 是否被长请求拖慢？
prefill 和 decode 是否互相干扰？
后台迁移是否抢占在线请求带宽？
```

## 面向 KV Cache 的检查清单

看组内代码或设计文档时，可以检查：

```text
1. 调度器使用哪些负载指标？
2. 是否区分 prefill 和 decode？
3. 是否考虑 KV Cache location？
4. 是否考虑 BlockGroup state？
5. 是否考虑 GPU HBM 剩余容量？
6. 是否考虑网络带宽和远端读取成本？
7. 是否支持 locality-aware scheduling？
8. 是否有 cost-based score？
9. worker 状态过期时如何处理？
10. worker 本地是否做最终资源校验？
11. 后台迁移是否低优先级？
12. 是否有背压机制？
13. 是否有租户级资源隔离？
14. 热点模型或热点 cache 如何扩散？
15. 调度失败后是重试、换节点，还是返回错误？
```

## 推荐学习顺序

这一组可以按下面顺序学：

```text
1. 调度和负载均衡的区别。
2. 推理请求的 prefill / decode 阶段。
3. 调度需要观察哪些资源。
4. Round Robin：理解最简单的分配。
5. Least Loaded：理解负载感知。
6. Power of Two Choices：理解低成本近似负载均衡。
7. Locality-aware Scheduling：理解数据局部性。
8. Cost-based Scheduling：理解综合成本打分。
9. 队列和优先级：理解排队和任务区分。
10. 资源隔离和背压：理解如何保护系统。
11. 热点调度：理解热门模型和热门 cache。
12. Batch 调度：理解吞吐和延迟取舍。
13. Prefill/Decode 分离调度：理解阶段化调度。
14. 结合 KV Cache 分析请求调度路径。
```

最后要能回答：

```text
这个请求应该调到哪里？
为什么不是调到最空的 GPU？
如果 cache 不在目标节点，要远程读、迁移，还是重算？
当前调度决策会不会导致 HBM 爆掉？
这个请求会不会拖慢 batch？
后台迁移会不会影响在线 P99？
```

## 总结

调度和负载均衡解决的是“请求去哪里执行”的问题。

在 KV Cache 系统里，这个问题不能只看节点是否空闲。更重要的是综合考虑：

```text
GPU 计算资源。
GPU HBM 容量。
KV Cache 位置。
BlockGroup 状态。
迁移成本。
网络成本。
请求阶段。
请求优先级。
节点健康状态。
```

对我当前学习来说，最重要的认识是：

```text
1. 最空闲的节点不一定是最优节点。
2. 有 cache locality 的节点可能更适合执行请求。
3. 调度、迁移、淘汰不是独立模块，三者会互相影响。
4. 后台任务必须让位于在线请求。
5. 调度器看到的状态可能过期，worker 本地还要做最终校验。
6. 好的调度策略应该在吞吐、延迟、局部性和资源隔离之间做权衡。
```

掌握调度和负载均衡之后，下一步可以继续学习可观测性。因为调度策略是否有效，最终要靠指标、日志和链路追踪来验证。
