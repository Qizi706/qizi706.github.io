---
title: 分布式基础：初步学习路径
date: 2026-07-06 15:59:28
categories:
  - [分布式]
tags:
  - [分布式]
  - [算法]
---

## 背景

刚开始实习时，组内方向是训练-推理一体存储，尤其是围绕 `KV Cache` 做存储、调度、迁移或复用，那么“分布式”不是一个单独的理论章节，而是会贯穿在每一次请求、每一份缓存、每一次节点故障和每一个性能指标里。

我目前的目标不是一下子掌握所有分布式系统，而是先建立一张够用的地图：

```text
1. 计算任务为什么要分布到多台机器上？
2. 数据为什么要分片、复制和迁移？
3. 多副本之间如何保证一致性？
4. 节点故障、网络抖动、慢节点出现时系统如何继续工作？
5. KV Cache 这种数据在训练和推理场景下有什么特殊性？
```

这篇博客先从这些问题出发，总结作为初学者最应该掌握的分布式基础。

<!--more-->

## 为什么 KV Cache 会遇到分布式问题？

大模型推理中，`KV Cache` 保存的是 Transformer Attention 计算中已经生成 token 的 Key 和 Value。对于自回归生成任务，后续 token 可以复用历史 token 的 K/V，避免重复计算。

它的特点是：

```text
1. 数据量大：长上下文、多 batch、多并发请求都会迅速放大 KV Cache 占用。
2. 访问频繁：每生成一个 token 都可能访问历史 KV。
3. 生命周期复杂：有的请求很快结束，有的会长时间占用缓存。
4. 强依赖位置：KV Cache 往往和某个模型层、某个序列、某个设备上的计算绑定。
5. 成本敏感：GPU HBM 很贵，KV Cache 放哪里、何时迁移、何时淘汰都会影响吞吐和延迟。
```

当单机 GPU 显存无法承载全部请求，系统就需要把计算和缓存放到多张卡、多台机器，甚至多级存储中。这时就进入了典型的分布式系统问题：数据如何分布、如何找到、如何迁移、如何保持一致、故障时如何恢复。

## 第一个月应该掌握的分布式知识地图

我认为可以按下面这条主线学习：

```text
网络通信 -> RPC -> 分片与路由 -> 副本与一致性 -> 共识与元数据
         -> 故障处理 -> 调度与负载均衡 -> 可观测性 -> 性能优化
```

这条线不是严格的先后关系，但它基本覆盖了一个分布式存储/推理系统每天都会遇到的问题。

## 网络通信基础

分布式系统的第一层现实是：跨机器通信远比本地函数调用慢，也更容易失败。

需要先理解几个基本概念：

```text
延迟 latency：一次请求从发出到收到响应的时间。
吞吐 throughput：单位时间内能处理多少数据或请求。
带宽 bandwidth：单位时间内网络最多传输多少数据。
尾延迟 tail latency：P99、P999 这类极端慢请求的延迟。
```

在 KV Cache 场景里，尾延迟非常重要。推理服务往往面向在线请求，一个请求卡住可能会拖慢整个 batch，甚至影响调度器继续合批。

### TCP、RDMA 和 GPU 通信

普通服务里，常见通信基于 TCP。大模型训练和推理系统里，还经常会看到：

```text
RDMA：绕过内核、低延迟、高带宽的远程内存访问。
NCCL：多 GPU 通信库，常用于 all-reduce、broadcast、all-gather 等集合通信。
InfiniBand/RoCE：高性能网络方案。
GPUDirect RDMA：让网卡直接访问 GPU 显存，减少 CPU 拷贝。
```

不要求第一个月就能调优这些组件，但至少要知道：在训练和推理一体系统里，网络不是透明的。KV Cache 如果频繁跨机迁移，就会受到网络带宽和延迟的强约束。

## RPC：远程调用不是本地调用

`RPC` 是 Remote Procedure Call，也就是像调用本地函数一样调用远程服务。

但是远程调用和本地调用有本质区别：

```text
1. 远程调用可能超时。
2. 请求可能发出去了，但响应丢了。
3. 服务端可能执行成功，但客户端以为失败。
4. 重试可能导致重复执行。
5. 网络分区时，双方可能都无法确认对方状态。
```

所以设计 RPC 接口时要关注：

```text
超时 timeout：不能无限等待。
重试 retry：失败后是否重试，重试几次。
幂等 idempotent：重复请求是否会产生副作用。
限流 rate limit：避免下游被打爆。
熔断 circuit breaker：下游异常时快速失败，保护系统。
```

对于 KV Cache 服务，典型 RPC 可能包括：

```text
put_cache(seq_id, layer_id, block_id, data)
get_cache(seq_id, layer_id, block_id)
move_cache(src_node, dst_node, cache_id)
evict_cache(cache_id)
pin_cache(cache_id)
unpin_cache(cache_id)
```

其中 `move_cache`、`evict_cache`、`pin_cache` 这类操作尤其需要想清楚幂等性。例如客户端重试一次 `evict_cache`，系统不应该因为缓存已经被删而进入异常状态。

## 分片：数据如何分布到多台机器？

当一台机器放不下所有数据，就需要分片。分片的核心问题是：给定一个 key，应该去哪个节点找？

常见方式有三类。

### 哈希分片

最简单的方式是：

```text
node = hash(key) % N
```

优点是实现简单，数据分布相对均匀。缺点是节点数量 `N` 变化时，大量 key 的归属会改变，导致大规模数据迁移。

### 一致性哈希

一致性哈希把节点和 key 都映射到一个环上，key 顺时针找到第一个节点。增加或删除节点时，只影响环上一小段 key。

它适合缓存系统，因为缓存节点扩缩容比较常见。

### Range 分片

Range 分片按照 key 的范围切分，例如：

```text
[0, 1000)      -> node A
[1000, 2000)   -> node B
[2000, 3000)   -> node C
```

优点是方便范围扫描，缺点是容易出现热点。例如某一段 key 被频繁访问，就会打爆某个节点。

### KV Cache 的分片维度

KV Cache 的 key 通常不只是一个简单字符串，它可能由多个维度组成：

```text
model_id
request_id / session_id
sequence_id
layer_id
head_id
block_id
token_range
```

因此分片策略也有很多选择：

```text
按请求分片：同一个请求的 cache 尽量放在一起，访问简单。
按 layer 分片：不同层的 cache 分到不同设备，配合 pipeline parallelism。
按 block 分片：长序列切成块，方便迁移和淘汰。
按租户/模型分片：隔离不同业务或不同模型。
```

一个好的分片策略通常要同时考虑：

```text
1. 访问局部性：计算在哪里，cache 最好也在哪里。
2. 负载均衡：不能让少数节点承载绝大多数请求。
3. 迁移成本：扩缩容或调度变化时，搬运数据不能太贵。
4. 故障影响面：单个节点挂掉时，影响的请求越少越好。
```

### Block Group：比 block 更高一层的管理单位

在 KV Cache 系统里，最小的数据管理单位常常是 `block`。一个 block 可以表示一段连续 token 的 K/V，例如第 0 到 15 个 token、第 16 到 31 个 token。这样做的好处是：长序列不用一次性分配一整块连续空间，而是可以按 block 逐步增长、复用和释放。

但是如果系统只管理单个 block，会遇到几个问题：

```text
1. 元数据太碎：一个长上下文请求可能对应大量 block。
2. 调度成本高：每次迁移、淘汰、查询都要处理很多小对象。
3. 局部性难保证：相邻 block 可能被打散到很多节点，访问时网络开销变大。
4. 状态管理复杂：每个 block 都维护 pin、ref_count、version，开销较高。
```

因此很多系统会引入 `Block Group`，把一组逻辑上相关、访问模式相近的 block 作为一个更大的管理单位。

可以简单理解为：

```text
block：KV Cache 的基本存储单元。
block group：一组 block 的逻辑集合，也是调度、迁移、淘汰、预取时更常用的管理单位。
```

一个 block group 可能按照下面这些维度组织：

```text
同一个 request/session 的一段连续 token。
同一个 layer 的多个连续 block。
同一个 prefill 阶段产生的一批 block。
未来 decode 阶段很可能一起访问的一组 block。
具有相同生命周期或相同优先级的一组 block。
```

举个简化例子：

```text
request_id = req_1
sequence length = 128
block size = 16 tokens

block_0: token [0, 16)
block_1: token [16, 32)
block_2: token [32, 48)
block_3: token [48, 64)
block_4: token [64, 80)
block_5: token [80, 96)
block_6: token [96, 112)
block_7: token [112, 128)

block_group_0: block_0, block_1, block_2, block_3
block_group_1: block_4, block_5, block_6, block_7
```

这样调度器或 Cache Manager 可以以 group 为单位做决策。例如 `block_group_0` 最近一直被访问，就把它 pin 在 GPU HBM；`block_group_1` 暂时不会访问，就可以迁移到 CPU memory 或 remote store。

### Block Group 解决什么问题？

`Block Group` 的核心价值是降低管理粒度和访问粒度之间的矛盾。

单个 block 粒度细，适合内存分配和局部释放；但系统决策通常不希望太细，否则元数据、RPC、锁竞争和调度开销都会上升。

以 group 为单位可以带来几个好处：

```text
1. 降低元数据开销：group 维护公共状态，block 只保留必要索引。
2. 提升访问局部性：一起访问的 block 尽量放在同一节点或同一存储层。
3. 减少迁移次数：迁移一组 block，而不是为每个 block 单独发起迁移。
4. 改善淘汰决策：根据 group 的整体热度、大小、重算成本做判断。
5. 简化生命周期管理：请求结束、取消或切换阶段时，可以批量释放。
```

但是 group 不能无限大。group 太大会导致：

```text
1. 迁移成本变高，一次搬运太多数据。
2. 淘汰不够精细，可能把仍然有用的 block 一起淘汰。
3. 负载均衡变差，大 group 容易形成热点。
4. 内存碎片和空间浪费变严重。
```

因此 block group 的设计本质上是一个粒度权衡：

```text
block 太小：灵活，但管理开销大。
group 太大：管理简单，但调度和淘汰不够精细。
合适的 group：让经常一起访问、一起迁移、一起释放的数据放在一起。
```

### Block Group 的常见元数据

一个 block group 通常需要维护这些字段：

```text
block_group_id：group 的唯一标识。
model_id：所属模型。
request_id / session_id：所属请求或会话。
layer_id：所属模型层。
token_range：覆盖的 token 范围。
block_list：包含哪些 block。
location：当前所在节点、设备和存储层。
state：当前状态，例如 LOCAL、MIGRATING、REMOTE、EVICTED。
version / epoch：状态版本，用于处理并发更新和过期写入。
ref_count：引用计数，判断是否仍被使用。
pin_count：pin 计数，防止正在使用的数据被淘汰。
last_access_time：最近访问时间，用于 LRU。
access_count：访问次数，用于 LFU 或热度判断。
recompute_cost：重算成本，用于淘汰决策。
size_bytes：占用空间。
priority：优先级。
```

其中最关键的是 `state`、`version/epoch`、`ref_count` 和 `pin_count`。

例如当一个 group 正在从 GPU 迁移到 CPU 时，状态可能从：

```text
LOCAL
-> MIGRATING_OUT
-> REMOTE
```

如果这时有 decode 请求要读取它，就必须根据状态决定：

```text
等待迁移完成。
取消迁移，继续在本地读取。
从目标位置读取。
重新计算。
```

这个决策必须和 version/epoch 绑定，否则旧的迁移任务可能覆盖新的状态。

## 路由与元数据

分片之后，系统必须知道每份数据在哪里。这个信息就是元数据。

KV Cache 系统里可能维护类似这样的映射：

```text
cache_id -> node_id
cache_id -> device_id
cache_id -> memory_tier
cache_id -> block_state
block_id -> block_group_id
block_group_id -> group_location
block_group_id -> group_state
request_id -> cache_block_list
request_id -> block_group_list
```

其中 `memory_tier` 可能表示：

```text
GPU HBM
CPU Memory
Local SSD
Remote Memory
Remote SSD
```

元数据服务需要解决的问题：

```text
1. 元数据本身如何高可用？
2. 元数据更新和数据迁移如何保持一致？
3. 客户端缓存了旧路由怎么办？
4. 多个调度器同时修改同一份 cache 状态怎么办？
```

这就引出了一致性和共识问题。

## 副本：为什么要复制数据？

副本的目的主要有两个：

```text
1. 高可用：某个节点挂了，还有其他副本可以继续服务。
2. 读扩展：多个副本可以分摅读请求。
```

但是副本会带来一致性问题。比如同一个 `cache_id` 在 A、B 两个节点都有副本，如果 A 更新了，B 还没更新，那么客户端读 B 就会读到旧数据。

在 KV Cache 场景中，要先区分数据类型：

```text
不可变 cache：某个 token range 的 K/V 一旦生成就不再修改。
可变状态：cache 的位置、引用计数、pin 状态、生命周期状态会变化。
```

这一区分很重要。KV 数据本身很多时候可以看作 immutable block，而元数据状态是 mutable 的。对不可变数据，复制相对容易；对可变元数据，必须认真处理一致性。

## 一致性模型

一致性回答的是：多个副本存在时，读写操作应该表现出什么语义？

### 强一致性

强一致性要求读操作总能读到最近一次成功写入的结果。

优点是语义简单，缺点是性能和可用性成本更高。跨机强一致往往需要等待多个副本确认。

适合：

```text
元数据主状态
任务归属
cache 所有权
引用计数
资源配额
```

### 最终一致性

最终一致性允许短时间内读到旧数据，但只要没有新的写入，副本最终会收敛到相同状态。

适合：

```text
统计指标
非关键缓存副本
异步预热数据
可重算的数据
```

### 读写一致性

更细的模型还包括：

```text
Read Your Writes：自己写入后，自己后续一定能读到。
Monotonic Reads：同一个客户端不会先读到新值，再读到旧值。
Causal Consistency：有因果关系的操作按因果顺序可见。
```

对于推理服务，用户请求内部通常需要比较强的语义。例如同一个 request 的 KV Cache 已经生成了前 100 个 token，后续 decode 阶段不能读到只包含前 80 个 token 的旧状态。

## CAP 与 PACELC

CAP 说的是，在网络分区发生时，一个分布式系统不能同时满足：

```text
C：Consistency，一致性。
A：Availability，可用性。
P：Partition tolerance，分区容忍性。
```

现实系统必须容忍网络分区，所以关键取舍通常是：分区发生时优先一致性还是可用性。

但 CAP 只讨论故障时的取舍，不够完整。`PACELC` 更贴近日常系统设计：

```text
P: if Partition occurs
A/C: choose Availability or Consistency
E: Else, normally
L/C: choose Latency or Consistency
```

也就是说，即使没有网络分区，系统也经常要在低延迟和强一致之间取舍。

KV Cache 场景中，常见选择是：

```text
元数据：更偏一致性。
数据块副本：根据是否可重算，可能偏可用性或低延迟。
监控指标：最终一致即可。
在线请求路径：通常优先低延迟，但不能破坏请求正确性。
```

## 共识算法：Raft/Paxos 解决什么问题？

共识算法解决的是：多个节点如何对同一个操作顺序达成一致。

典型问题：

```text
谁是 leader？
某个 cache block 当前归谁管理？
某个请求是否已经被调度到某个 worker？
某个节点是否已经被判定为不可用？
```

常见共识算法包括 `Paxos` 和 `Raft`。工程上更常见的是 Raft，因为它更容易理解和实现。

Raft 的核心角色：

```text
Leader：处理写请求，复制日志。
Follower：接受 leader 的日志。
Candidate：选举过程中的候选者。
```

Raft 的核心机制：

```text
1. Leader election：选主。
2. Log replication：日志复制。
3. Commit index：多数派确认后提交。
4. Term：任期，用来识别过期 leader。
```

在实际工作中，不一定要自己实现 Raft，但要理解 etcd、ZooKeeper、Consul 这类系统为什么可以作为可靠元数据存储或分布式协调服务。

## Leader、Lease 和 Fencing

很多分布式系统会有 leader，例如一个调度器 leader 负责分配请求，一个元数据 leader 负责处理写入。

但是 leader 会遇到一个经典问题：旧 leader 以为自己还是 leader。

例如：

```text
1. 节点 A 是 leader。
2. A 因为 GC 或网络抖动卡住。
3. 系统选出 B 作为新 leader。
4. A 恢复后继续对外写元数据。
```

这会导致脑裂。解决方式通常包括：

```text
Lease：leader 只有在租约有效期内才能工作。
Fencing token：每次选主产生递增 token，下游只接受最新 token 的写入。
Epoch：给每一轮所有权变化分配版本号。
```

KV Cache 调度中，如果 cache block 的所有权会转移，那么 `epoch` 或 `fencing token` 非常重要。否则旧 owner 可能在迁移后继续写状态，覆盖新 owner 的结果。

## 时间、时钟和顺序

分布式系统不能轻易相信机器本地时间。

原因是：

```text
1. 不同机器的时钟可能不一致。
2. NTP 同步也有误差。
3. 网络延迟不确定。
4. “先看到”不一定代表“先发生”。
```

需要理解三个概念：

```text
物理时钟：机器上的真实时间。
逻辑时钟：用递增计数表达事件顺序。
Lamport Clock：如果 A happens-before B，则 clock(A) < clock(B)。
Vector Clock：能表达更细的并发关系，但成本更高。
```

工程中更常见的是版本号、epoch、递增 revision。例如：

```text
cache_metadata.version += 1
owner_epoch += 1
placement_revision += 1
```

这些字段可以帮助系统判断某个状态更新是否过期。

## 故障模型

分布式系统设计必须先问：我们假设会发生什么故障？

常见故障包括：

```text
节点宕机：机器直接不可用。
进程崩溃：服务退出，但机器还在。
网络分区：节点之间互相不可达。
网络抖动：请求偶尔超时或变慢。
慢节点：节点没挂，但响应非常慢。
磁盘故障：本地数据损坏或读写失败。
GPU 故障：设备不可用、显存错误、驱动异常。
数据损坏：bit flip、错误写入、版本错乱。
```

KV Cache 系统还会遇到一些更具体的问题：

```text
GPU 显存不足导致 cache 分配失败。
某个 worker 仍在 decode，但其 cache 被错误淘汰。
cache 迁移过程中源节点或目标节点故障。
调度器认为 cache 在 A，实际已经迁移到 B。
请求取消后，cache 引用计数没有正确释放。
```

这些问题大多不是靠单个算法解决，而是靠状态机设计、幂等接口、超时重试、版本校验、后台修复和监控告警一起解决。

## 可用性：超时、重试和降级

系统不可能保证所有依赖永远正常，所以要设计失败路径。

### 超时

每个远程调用都应该有明确超时。没有超时的调用会把线程、连接、协程或请求上下文卡死。

### 重试

重试可以提高成功率，但也可能放大故障。

需要注意：

```text
1. 只对幂等操作安全重试。
2. 使用指数退避，避免同时重试造成流量尖峰。
3. 设置最大重试次数。
4. 区分快速失败和慢失败。
```

### 降级

如果远程 KV Cache 不可用，系统可以考虑：

```text
重新计算 cache。
只使用本地 cache。
拒绝长上下文请求。
降低 batch size。
把请求迁移到健康节点。
返回明确错误，让上层重试。
```

降级策略取决于业务目标：是优先保正确性、优先低延迟，还是优先吞吐。

## 负载均衡和调度

训练和推理系统里的调度比普通 Web 服务复杂，因为任务和资源强绑定。

调度器需要考虑：

```text
GPU 显存余量
GPU 利用率
KV Cache 已占用大小
请求上下文长度
decode 阶段预计剩余长度
模型副本位置
cache 是否已经在某个节点上
网络拓扑
节点健康状态
```

常见策略：

```text
Round Robin：轮询，简单但不感知负载。
Least Loaded：选择负载最低节点。
Power of Two Choices：随机选两个节点，再选更空的。
Locality-aware Scheduling：优先选择已有 cache 的节点。
Cost-based Scheduling：估算计算、迁移、等待成本后决策。
```

KV Cache 场景下，调度不应该只看 GPU 当前空不空，还要看 cache 的位置。把请求调度到没有 cache 的节点，可能需要跨机拉取大量 KV，反而更慢。

## 热点问题

热点是分布式系统里非常常见的性能问题。

热点可能来自：

```text
某个模型特别热门。
某个长会话持续占用大量 cache。
某个租户请求量突然升高。
某个分片承载了过多活跃序列。
某个元数据 key 被高频更新。
```

常见处理方式：

```text
1. 拆分热点 key。
2. 增加只读副本。
3. 本地缓存元数据。
4. 对热点请求限流。
5. 重新分片或迁移部分数据。
6. 把全局锁改成细粒度锁或无锁结构。
```

判断热点不能靠感觉，要看指标。比如单节点 QPS、P99 延迟、GPU HBM 使用率、网络出入带宽、cache 命中率、迁移流量等。

## 数据迁移

KV Cache 迁移是训练-推理一体存储里很核心的问题。

迁移可能发生在：

```text
GPU 显存不足，需要把 cache 下沉到 CPU 或 SSD。
请求被调度到其他节点，需要把 cache 搬过去。
某个节点负载过高，需要迁出部分 cache。
节点即将下线，需要 drain。
推理阶段需要复用训练阶段产生的中间状态。
```

迁移要考虑：

```text
一致性：迁移过程中读写请求怎么办？
原子性：不能出现源和目标都认为自己拥有，或都认为没有。
性能：迁移不能占满网络，影响在线请求。
失败恢复：迁移中断后如何回滚或继续？
版本：客户端拿着旧位置访问怎么办？
```

一种常见状态机可以是：

```text
LOCAL
MIGRATING_OUT
MIGRATING_IN
REMOTE
EVICTING
EVICTED
```

每次状态变化都带上版本号。客户端访问时，如果发现版本过期，需要重新拉取元数据。

如果系统引入了 `Block Group`，迁移通常会优先以 group 为单位决策，而不是完全以单个 block 为单位决策。

原因是 decode 阶段访问 KV Cache 往往有连续性。把同一个 group 内的 block 一起迁移，可以减少远程访问次数，也能降低元数据更新频率。

一个简化的 group 迁移流程可以是：

```text
1. Scheduler 或 Cache Manager 选择要迁移的 block_group_id。
2. 检查 group 的 pin_count 和 ref_count，确认它是否允许迁移。
3. 将 group_state 从 LOCAL 改为 MIGRATING_OUT，并递增 epoch。
4. 将 group 内 block 数据复制到目标节点或目标存储层。
5. 目标节点校验 block 数量、大小、checksum 和 epoch。
6. 元数据更新为新 location，并将 group_state 改为 REMOTE 或 LOCAL。
7. 源节点延迟释放旧副本，避免客户端持有旧路由时立即读失败。
```

这里要注意：group 迁移不是简单的批量拷贝，而是一个带状态的分布式操作。它至少要回答几个问题：

```text
group 内部分 block 迁移成功，部分失败怎么办？
迁移期间新的 decode 请求应该读源位置还是目标位置？
源节点释放旧副本前要等待多久？
客户端拿着旧 epoch 访问时如何重定向？
迁移任务重试时如何避免重复创建副本？
```

一种保守做法是让元数据中的 `block_group_id -> location/epoch/state` 成为事实来源。客户端每次发现 epoch 不匹配，就重新查询元数据，而不是继续相信本地缓存的路由。

## 缓存淘汰

缓存淘汰解决的是：空间不够时删谁？

常见策略：

```text
LRU：淘汰最近最少使用的数据。
LFU：淘汰访问频率最低的数据。
FIFO：先进入的先淘汰。
TTL：超过生存时间就淘汰。
Cost-aware：综合大小、重算成本、迁移成本、未来访问概率。
```

KV Cache 的淘汰更复杂，因为有些 cache 正在被 decode 使用，不能删；有些 cache 虽然暂时不用，但重算成本很高。

因此通常需要：

```text
pin/unpin：正在使用的 cache 被 pin 住，不能淘汰。
reference count：引用计数为 0 才能释放。
priority：不同请求或租户有不同优先级。
watermark：显存达到高水位触发淘汰，降到低水位停止。
```

引入 `Block Group` 后，淘汰策略也可以从单个 block 上升到 group 级别。这样可以避免只淘汰了某个 group 中的一小部分 block，结果后续访问仍然需要频繁跨层读取，局部性被破坏。

一个 group 级别的淘汰打分可以考虑：

```text
score = group_size
      + coldness
      + migration_cost
      - recompute_cost
      - priority
      - locality_value
```

这不是固定公式，而是表达一种思路：

```text
越大、越冷、越容易迁移的 group，越适合淘汰或下沉。
重算成本越高、优先级越高、局部性价值越高的 group，越应该保留。
pin_count > 0 的 group 不能淘汰。
ref_count > 0 的 group 通常不能直接释放，只能降级或延迟处理。
```

因此，Block Group 会直接影响缓存淘汰的质量。好的 group 划分能让淘汰更接近“删掉未来最不需要的一组数据”，差的 group 划分则可能导致误删热点 block 或保留大量冷数据。

## 训练-推理一体的特殊点

训练和推理对系统的要求不一样。

训练更关注：

```text
吞吐
大规模并行
checkpoint
梯度同步
容错恢复
资源利用率
```

推理更关注：

```text
首 token 延迟 TTFT
每 token 延迟 TPOT
整体吞吐
尾延迟
cache 命中率
请求隔离
```

训练-推理一体会让两类目标同时出现。例如：

```text
训练产生的数据是否能被推理复用？
推理的 KV Cache 是否能跨请求复用？
训练和推理是否共享同一套存储层？
在线推理是否会被训练任务挤占带宽和显存？
同一个模型不同版本的 cache 如何隔离？
```

这里需要特别关注资源隔离和优先级。在线推理通常对延迟敏感，不能被后台训练任务的大流量写入拖垮。

## 常见分布式算法和组件

第一个月不需要手写所有算法，但要知道它们解决什么问题。

### Raft/Paxos

解决多节点对操作顺序达成一致的问题，常用于元数据、选主、配置管理。

### Gossip

节点之间随机交换信息，最终让集群内所有节点知道某些状态。适合传播节点健康、负载、成员信息。

### Consistent Hashing

解决缓存和分片系统扩缩容时的数据迁移问题。

### Two Phase Commit

`2PC` 用来做分布式事务提交，分为 prepare 和 commit 两个阶段。它能保证多个参与者要么都提交，要么都不提交，但阻塞风险和性能成本较高。

KV Cache 系统通常会尽量避免把在线路径做成重型分布式事务，而是通过状态机、幂等操作、补偿任务来降低复杂度。

### Leader Election

选出一个节点负责全局协调。常依赖 etcd/ZooKeeper/Consul 实现。

### Heartbeat 和 Failure Detector

通过心跳判断节点是否健康。但要注意：心跳超时只能说明“暂时联系不上”，不一定说明对方真的死了。

## 可观测性

分布式系统排查问题非常依赖可观测性。需要掌握三类工具：

```text
Metrics：指标，例如 QPS、延迟、错误率、显存使用率。
Logs：日志，用来还原事件细节。
Traces：链路追踪，用来观察请求经过了哪些服务。
```

KV Cache 相关指标可以包括：

```text
cache_hit_rate
cache_miss_rate
cache_eviction_count
cache_migration_bytes
cache_migration_latency
cache_pin_count
cache_ref_count
gpu_memory_used_bytes
cpu_memory_used_bytes
remote_read_latency
metadata_update_latency
request_ttft
request_tpot
p99_decode_latency
```

日志里最好带上统一的关联字段：

```text
request_id
session_id
cache_id
block_id
model_id
node_id
device_id
epoch
revision
```

否则线上问题发生时，很难把一次请求、一次 cache 迁移、一次元数据更新串起来。

## 我应该如何学习？

第一个月可以按“问题驱动”的方式学习，不必一开始就啃完所有分布式论文。

### 第一阶段：能看懂系统在做什么

重点掌握：

```text
RPC、超时、重试、幂等
分片、路由、元数据
副本、一致性、最终一致
心跳、故障检测、leader
基本监控指标
```

目标是能看懂组内文档和代码里的核心词汇。

### 第二阶段：能分析一个请求路径

尝试画出一次推理请求的完整路径：

```text
client
-> gateway
-> scheduler
-> model worker
-> KV Cache manager
-> local/remote storage
-> metadata service
```

然后问自己：

```text
请求的 cache key 是什么？
cache 放在哪里？
如果 miss 了怎么办？
如果节点挂了怎么办？
如果 cache 正在迁移怎么办？
如果元数据是旧的怎么办？
```

### 第三阶段：能定位性能瓶颈

重点关注：

```text
P50/P99/P999 延迟
首 token 延迟
每 token 延迟
cache 命中率
显存水位
网络带宽
迁移流量
队列长度
调度等待时间
```

性能问题通常不是单点原因，而是调度、网络、显存、元数据和请求模式共同作用的结果。

## 一个 KV Cache 系统的简化设计

可以先用一个简单模型帮助理解：

```text
Metadata Server：
  维护 cache_id -> location/version/state

Scheduler：
  根据模型、请求长度、cache 位置、GPU 负载选择 worker

Worker：
  执行 prefill/decode，并向 Cache Manager 读写 KV Cache

Cache Manager：
  管理本地 GPU/CPU/SSD cache，负责淘汰和迁移

Remote Store：
  存放被下沉或共享的 cache block
```

一次 cache 读取可能是：

```text
1. Worker 根据 request_id 和 token range 生成 cache_id。
2. 先查本地 Cache Manager。
3. 本地 miss，则查 Metadata Server。
4. Metadata Server 返回 cache 位置和 version。
5. Worker 从远端拉取 cache。
6. 拉取成功后放入本地，并更新本地索引。
```

这里每一步都可能失败，所以要考虑：

```text
元数据查不到：cache 不存在还是元数据过期？
远程拉取超时：重试还是重新计算？
拉取过程中 cache 被迁移：如何发现 version 不一致？
本地空间不足：淘汰谁？
请求取消：已经拉取的 cache 如何释放？
```

## 学习时容易忽略的点

### 分布式 bug 往往是状态 bug

很多问题不是算法不懂，而是状态没有定义清楚。例如：

```text
cache block 到底有哪些状态？
谁有权修改状态？
状态变化是否有版本号？
失败后是重试、回滚还是补偿？
后台任务和在线请求是否会同时修改？
```

### 不要只看平均延迟

平均延迟会掩盖尾延迟。在线推理尤其要看 P99，因为用户感受到的是慢请求，而不是平均值。

### 本地缓存会带来一致性问题

为了性能，客户端经常会缓存元数据。但元数据一旦更新，本地缓存就可能变旧。需要有版本校验、TTL 或 invalidation 机制。

### 故障检测不是故障证明

心跳超时不等于节点死亡。一个节点可能只是网络慢、GC 卡顿或 CPU 被打满。所以涉及所有权转移时，需要 fencing token 或 epoch 防止旧节点恢复后继续写。

## 面向实习工作的检查清单

后续看组内代码或文档时，我可以用下面的问题自查：

```text
1. 这个模块维护了什么状态？
2. 状态的 owner 是谁？
3. 状态是否有版本号或 epoch？
4. 远程调用是否设置了 timeout？
5. 失败后是否会 retry？retry 是否幂等？
6. 数据如何分片？扩缩容时如何迁移？
7. 是否有副本？副本之间是什么一致性？
8. 元数据存在哪里？如何保证高可用？
9. cache 正在迁移时，读写请求如何处理？
10. cache 被淘汰时，如何避免删掉正在使用的数据？
11. 节点故障后，如何恢复请求和 cache？
12. 有没有指标能证明系统正常工作？
13. P99 延迟变差时，应该先看哪些指标？
```

## 总结

对刚开始实习的我来说，分布式基础不应该只停留在 Raft、Paxos、CAP 这些名词上，而要和实际系统里的问题对应起来。

在训练-推理一体存储和 KV Cache 场景下，最核心的是：

```text
1. 数据怎么分布：分片、路由、元数据。
2. 数据怎么可靠：副本、一致性、故障恢复。
3. 数据怎么高效：局部性、调度、迁移、淘汰。
4. 状态怎么正确：版本、epoch、幂等、状态机。
5. 问题怎么定位：metrics、logs、traces。
```

掌握这些之后，再继续深入具体算法、系统实现和论文，会更容易把知识和真实工作联系起来。
