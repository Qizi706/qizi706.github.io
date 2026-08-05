---
title: 分布式基础：缓存策略、迁移与淘汰
date: 2026-07-14 16:30:00
categories:
  - [分布式]
tags:
  - [分布式]
  - [缓存]
  - [迁移]
  - [淘汰]
  - [KV Cache]
---

## 背景

前面已经学习了几组基础：

```text
操作系统、网络、并发与存储。
RPC 和远程调用。
状态机、分片、路由与元数据。
副本和一致性。
故障处理。
```

这些内容更偏系统正确性：对象状态要清楚，远程调用要可靠，副本要一致，故障后要能恢复。

接下来进入更贴近 KV Cache 工作内容的一组：缓存策略、迁移与淘汰。

KV Cache 系统的核心矛盾是：

```text
GPU HBM 很快，但容量小。
CPU Memory 容量更大，但访问慢。
SSD 容量更大，但延迟更高。
远端存储可以扩展容量，但网络访问更贵。
```

所以系统必须不断做决策：

```text
哪些 KV Cache 应该留在 GPU HBM？
哪些可以下沉到 CPU Memory？
哪些可以放到 SSD 或远端？
哪些应该预取回来？
哪些应该淘汰？
哪些不能动，因为正在被请求使用？
```

这篇文章的目标是：理解 KV Cache / BlockGroup 系统如何在多级存储之间做取舍，以及迁移和淘汰为什么必须和状态机、元数据、ref_count、pin_count、epoch 一起设计。

<!--more-->

## 学习目标

这一组需要掌握：

```text
cache hit / miss
多级缓存
cache placement
cache migration
cache eviction
cache prefetch
LRU
LFU
TTL
Cost-aware eviction
watermark
pin/ref_count
热点和冷数据
迁移成本
重算成本
局部性
```

对 KV Cache 场景，要能回答：

```text
显存满了，应该删哪个 BlockGroup？
远端有 cache，本地没有，要不要拉回来？
请求马上要 decode，cache 却正在迁移，怎么办？
以 block 还是 block group 为单位迁移？
什么时候从 GPU HBM 下沉到 CPU Memory？
什么时候从 CPU Memory 下沉到 SSD？
哪些 cache 不能淘汰？
如何根据 ref_count 和 pin_count 判断是否安全？
```

## Cache Hit 和 Cache Miss

缓存系统最基础的两个概念是：

```text
cache hit：要访问的数据在缓存里。
cache miss：要访问的数据不在缓存里。
```

在 KV Cache 场景里，假设 worker 要读取 `bg_1`：

```text
如果 bg_1 在本地 GPU HBM：本地热缓存命中。
如果 bg_1 在本地 CPU Memory：本地温缓存命中，但需要搬回 GPU。
如果 bg_1 在远端节点：本地 miss，需要远程读取。
如果 bg_1 在 SSD：本地 miss 到慢层，需要加载。
如果 bg_1 已经被淘汰：彻底 miss，可能需要重算。
```

不同 miss 的成本不一样。

可以粗略理解为：

```text
GPU HBM hit：最快。
CPU Memory hit：需要跨 PCIe/NVLink 搬运。
Local SSD hit：需要 I/O，延迟更高。
Remote Memory hit：需要网络。
Remote SSD hit：网络 + 存储，成本更高。
Evicted miss：需要重新计算或返回失败。
```

因此 cache hit rate 不能只看一个总数，还要区分命中的层级。

## 多级缓存

KV Cache 管理通常不是单层缓存，而是多级缓存。

常见层级：

```text
GPU HBM
CPU Memory
Local SSD
Remote GPU HBM
Remote CPU Memory
Remote SSD / Distributed Storage
```

每一层的特点不同：

```text
GPU HBM：最快，容量最小，最贵。
CPU Memory：容量较大，速度比 HBM 慢。
Local SSD：容量大，适合冷数据。
Remote Memory：可扩展，但受网络影响。
Remote SSD：容量更大，延迟更高。
```

多级缓存的核心问题是 placement：

```text
某个 BlockGroup 当前应该放在哪一层？
```

这个决策要考虑：

```text
访问频率。
未来是否很快会访问。
BlockGroup 大小。
重算成本。
迁移成本。
当前 HBM 水位。
请求优先级。
是否正在 decode。
```

## Block 和 BlockGroup 的粒度选择

KV Cache 可以按 block 管理，也可以按 BlockGroup 管理。

```text
block：粒度小，适合细粒度分配和释放。
BlockGroup：粒度更大，适合调度、迁移、淘汰和预取。
```

如果完全按 block 管理：

```text
优点：非常灵活。
缺点：元数据多，调度开销大，迁移请求碎片化。
```

如果完全按很大的 BlockGroup 管理：

```text
优点：元数据少，迁移和预取更容易批量处理。
缺点：不够精细，可能把仍然有用的数据一起淘汰。
```

所以 BlockGroup 的设计要匹配访问局部性：

```text
经常一起访问的 block 放在同一个 group。
生命周期相近的 block 放在同一个 group。
迁移和淘汰时希望一起处理的 block 放在同一个 group。
```

粒度设计会直接影响后面的迁移和淘汰质量。

## Cache Placement

`cache placement` 是决定缓存放在哪里。

对一个 BlockGroup，可以有这些位置：

```text
GPU HBM
CPU Memory
SSD
Remote Memory
Remote SSD
Evicted
```

一个简单规则可以是：

```text
正在 decode 使用：放 GPU HBM。
短期可能再次访问：放 CPU Memory。
重算成本高但短期不访问：放 SSD 或远端。
重算成本低且空间紧张：直接淘汰。
```

更实际的决策通常要打分。

例如：

```text
placement_score = access_probability
                + recompute_cost
                + priority
                + locality_value
                - size_cost
                - migration_cost
```

这个公式不是固定实现，只是表达一种思路：

```text
越可能访问、越难重算、优先级越高、局部性越强，越应该放在快层。
越大、迁移越贵、短期越冷，越适合下沉或淘汰。
```

## Cache Migration

迁移是把缓存从一个位置移动到另一个位置。

常见迁移方向：

```text
GPU HBM -> CPU Memory
CPU Memory -> GPU HBM
CPU Memory -> SSD
SSD -> CPU Memory
Local Node -> Remote Node
Remote Node -> Local Node
```

迁移发生的原因：

```text
GPU HBM 不够，需要下沉。
请求即将访问，需要上升。
节点负载过高，需要迁出。
调度器把请求调到另一个节点。
节点即将下线，需要 drain。
副本修复需要复制数据。
```

迁移看起来只是数据拷贝，但在分布式系统里它是一个状态操作。

它至少涉及：

```text
数据复制。
元数据更新。
状态切换。
版本校验。
失败恢复。
源副本释放。
客户端旧路由刷新。
```

## 迁移状态机

一个简化的迁移状态机：

```text
LOCAL
-> MIGRATING_OUT
-> REMOTE

REMOTE
-> MIGRATING_IN
-> LOCAL
```

更完整一些：

```text
LOCAL
MIGRATING_OUT
MIGRATING_IN
REMOTE
EVICTING
EVICTED
FAILED
```

迁移时要注意：

```text
只有允许迁移的状态才能迁移。
pin_count > 0 通常不能迁移。
ref_count > 0 时迁移要非常谨慎。
每次状态变化都要带 epoch。
迁移任务要有 operation_id。
目标校验成功后才能切换 location。
源副本不能过早删除。
```

一个保守流程：

```text
1. 选择要迁移的 block_group_id。
2. 检查 state、epoch、ref_count、pin_count。
3. CAS state: LOCAL -> MIGRATING_OUT。
4. 目标节点创建 MIGRATING_IN。
5. 复制数据。
6. 校验 size、checksum、token_range、epoch。
7. 更新 metadata: location -> target，epoch += 1。
8. 目标状态变为 LOCAL。
9. 源节点延迟释放旧副本。
```

## 迁移成本

迁移不是免费的。

成本包括：

```text
网络带宽。
PCIe/NVLink 带宽。
CPU 拷贝开销。
GPU HBM 拷贝开销。
序列化和校验开销。
目标空间占用。
元数据更新成本。
对在线请求的干扰。
```

如果迁移太频繁，会出现：

```text
网络带宽被占满。
在线 decode 延迟升高。
cache 还没用上就又被迁走。
后台任务影响前台请求。
P99 变差。
```

因此迁移要有节制。

常见控制方式：

```text
限制并发迁移任务数。
限制迁移总带宽。
后台迁移低优先级。
只迁移预计收益大于成本的 BlockGroup。
对热点数据避免频繁来回迁移。
```

## Cache Prefetch

`prefetch` 是预取：在真正访问前，提前把数据拉到更快的位置。

例如：

```text
预测 bg_1 很快会被 decode 使用。
提前从 CPU Memory 拉到 GPU HBM。
真正访问时就能 hit。
```

预取的好处：

```text
降低关键路径延迟。
减少在线请求等待。
提高 GPU 利用率。
```

预取的问题：

```text
预测不准会浪费带宽和 HBM。
预取太多会挤掉真正热的数据。
后台预取可能影响在线请求。
```

KV Cache 中可以基于这些信号预取：

```text
请求即将进入 decode。
调度器已经确定 worker。
block group 是连续 token range 的下一段。
历史访问模式显示即将使用。
系统 prompt cache 被大量复用。
```

预取也要和 pin/ref_count 配合：

```text
预取完成不代表一定 pin。
只有真正进入请求关键路径时才 pin。
预取数据如果长期不用，仍然可以淘汰。
```

## Cache Eviction

淘汰是当空间不够时，选择一部分缓存释放。

KV Cache 淘汰的难点是：不能只看“最近有没有用”。

还要看：

```text
是否正在被请求使用。
是否被 pin。
是否有 ref_count。
是否可重算。
重算成本高不高。
是否还有其他副本。
是否属于高优先级请求。
是否很快会再次访问。
```

基本安全规则：

```text
pin_count > 0：不能淘汰。
ref_count > 0：不能释放。
state = MIGRATING：不能直接淘汰。
state = EVICTING：不要重复淘汰。
state = EVICTED：重复 evict 返回成功。
```

淘汰本身也应该是状态机：

```text
LOCAL
-> EVICTING
-> EVICTED
```

如果淘汰过程中又被访问，可以考虑：

```text
取消淘汰，回到 LOCAL。
拒绝新读，让请求 miss。
等待淘汰完成后从下一级恢复。
```

但无论选择哪种策略，都必须明确状态转移规则。

## LRU

`LRU` 是 Least Recently Used，淘汰最近最少使用的数据。

思想：

```text
最近访问过的数据，未来可能还会访问。
很久没访问的数据，未来访问概率较低。
```

优点：

```text
简单。
工程上常用。
适合有时间局部性的访问模式。
```

缺点：

```text
不能识别访问频率。
一次扫描可能污染缓存。
不考虑数据大小。
不考虑重算成本。
不考虑迁移成本。
```

在 KV Cache 中，单纯 LRU 不一定够用。

例如：

```text
一个很大的 BlockGroup 最近访问过一次，但未来不再访问。
一个较小的系统 prompt cache 很久没访问，但未来可能被大量复用。
```

LRU 可能做出错误选择。

## LFU

`LFU` 是 Least Frequently Used，淘汰访问频率最低的数据。

优点：

```text
能保留高频热点数据。
适合长期热点明显的场景。
```

缺点：

```text
历史热点可能已经不热。
计数维护有开销。
需要衰减机制。
```

KV Cache 中，LFU 可以用于系统 prompt cache、共享前缀 cache 等长期复用数据。

但对单个会话的临时 KV Cache，LFU 未必合适，因为它的生命周期可能很短。

## TTL

`TTL` 是 Time To Live，超过一定时间就过期。

适合：

```text
会话级缓存。
临时预取数据。
不希望长期占空间的数据。
```

例如：

```text
request 结束后，相关 BlockGroup 保留 30s。
如果 30s 内没有复用，就淘汰。
```

TTL 的问题：

```text
TTL 太短：复用机会变少。
TTL 太长：占用空间过多。
不同业务可能需要不同 TTL。
```

TTL 通常不能单独使用，要和 LRU、优先级、空间水位一起用。

## Cost-aware Eviction

对 KV Cache 来说，更合理的是 cost-aware eviction。

它不只看最近访问时间，还看综合成本。

可以考虑：

```text
size_bytes：占用空间。
last_access_time：最近访问。
access_count：访问频率。
recompute_cost：重算成本。
migration_cost：迁移成本。
priority：请求或租户优先级。
replica_count：是否还有副本。
future_access_probability：未来访问概率。
locality_value：和当前调度的局部性。
```

一个简化打分：

```text
evict_score = coldness
            + size_cost
            + low_priority
            + low_recompute_cost
            - future_access_probability
            - locality_value
```

含义：

```text
越冷、越大、优先级越低、越容易重算，越适合淘汰。
未来越可能访问、局部性价值越高，越不适合淘汰。
```

实际系统不一定写成一个公式，但思想是一样的：淘汰决策要考虑成本。

## Watermark

`watermark` 是水位线。

常见设计：

```text
high watermark：达到高水位开始淘汰。
low watermark：降到低水位停止淘汰。
```

例如：

```text
GPU HBM 使用率 > 90%：开始淘汰。
GPU HBM 使用率 < 75%：停止淘汰。
```

为什么需要两个水位？

如果只有一个阈值，系统可能频繁抖动：

```text
达到 90% -> 淘汰一点 -> 低于 90% -> 停止
又分配一点 -> 达到 90% -> 再淘汰
```

高低水位可以减少频繁触发。

不同层级都可以有水位：

```text
GPU HBM watermark
CPU Memory watermark
SSD watermark
Remote Store watermark
```

## 热点问题

热点是缓存系统里的常见问题。

热点可能来自：

```text
某个系统 prompt 被大量复用。
某个长会话占用大量 KV Cache。
某个模型突然请求量升高。
某个租户流量激增。
某个节点持有太多热 BlockGroup。
```

热点会导致：

```text
单节点网络打满。
HBM 长期高水位。
元数据 key 被频繁访问。
迁移任务排队。
P99 延迟升高。
```

处理方式：

```text
增加只读副本。
热点 BlockGroup 复制到更多节点。
调度时考虑 cache locality。
对热点租户限流。
把大 BlockGroup 拆分。
调整分片策略。
```

热点不能靠感觉判断，要看指标。

## 迁移、淘汰和调度的关系

迁移和淘汰不能单独看，它们会影响调度。

例如：

```text
worker_a GPU 空闲，但需要的 cache 在 worker_b。
把请求调到 worker_a，需要远程拉取 cache。
把请求调到 worker_b，可以复用本地 cache，但 GPU 较忙。
```

调度器要权衡：

```text
计算等待时间。
cache 迁移成本。
cache locality。
GPU HBM 余量。
网络带宽。
请求优先级。
```

有时候“最空闲的 GPU”不是最好的选择。

如果 cache 很大，调到已有 cache 的节点可能更快。

## 一次 BlockGroup 访问路径

假设 worker 要读取 `bg_1`：

```text
1. 查询本地路由缓存。
2. 发现 bg_1 在本地 GPU HBM。
3. 检查 state 和 epoch。
4. ref_count += 1。
5. 读取 KV Cache。
6. ref_count -= 1。
```

这是理想路径。

如果本地 HBM miss：

```text
1. 查询元数据服务。
2. 发现 bg_1 在本地 CPU Memory。
3. 判断是否值得搬到 GPU HBM。
4. 如果值得，发起迁移。
5. 迁移完成后读取。
```

如果远端才有：

```text
1. 查询元数据服务。
2. 发现 bg_1 在 remote node。
3. 判断读取远端、迁移本地，还是重新计算。
4. 发起数据传输。
5. 校验 epoch/checksum。
6. 更新本地缓存。
7. 读取。
```

每一步都可能失败，所以它和前面学习的 RPC、状态机、元数据、故障处理是连在一起的。

## 常见错误设计

### 只用 LRU

错误做法：

```text
显存满了，直接淘汰最久没访问的 BlockGroup。
```

问题：

```text
不考虑重算成本。
不考虑大小。
不考虑未来访问。
不考虑是否有副本。
不考虑请求优先级。
```

更好的方式：

```text
LRU 作为基础信号，再结合 cost-aware 策略。
```

### 不检查 pin/ref_count 就淘汰

错误做法：

```text
if memory_usage > threshold:
    evict(bg_1)
```

问题：

```text
bg_1 可能正在被 decode 使用。
```

更好的方式：

```text
只有 state 允许，且 ref_count == 0，pin_count == 0，才能释放。
```

### 迁移过程中直接切路由

错误做法：

```text
开始复制数据后，立刻把 location 改成目标节点。
```

问题：

```text
目标数据可能还没复制完整。
客户端可能读到脏数据。
```

更好的方式：

```text
目标校验成功后再切换 location。
```

### 源副本过早删除

错误做法：

```text
location 一切到目标节点，源节点马上删除数据。
```

问题：

```text
客户端可能还持有旧路由。
目标节点可能刚切换就故障。
```

更好的方式：

```text
源副本延迟释放。
旧 epoch 请求返回 STALE_METADATA。
确认安全后再删除。
```

### 后台迁移影响在线请求

错误做法：

```text
后台迁移不限制带宽。
```

问题：

```text
在线 decode 远程读取变慢。
P99 延迟升高。
```

更好的方式：

```text
后台任务限流。
在线请求优先。
迁移有独立带宽预算。
```

## 如何排查缓存问题？

### 指标

需要关注：

```text
cache_hit_rate
cache_miss_rate
cache_hit_rate_by_tier
gpu_hbm_used_bytes
cpu_memory_used_bytes
ssd_used_bytes
eviction_count
eviction_latency
migration_count
migration_bytes
migration_latency
prefetch_count
prefetch_hit_rate
remote_read_latency
stale_metadata_count
pin_count
ref_count
watermark_trigger_count
```

### 日志字段

日志里最好有：

```text
request_id
operation_id
block_group_id
state
epoch
source_tier
target_tier
source_node
target_node
size_bytes
ref_count
pin_count
eviction_reason
migration_reason
latency_ms
```

### 排查问题

当 P99 变差时，可以问：

```text
cache hit rate 是否下降？
miss 主要发生在哪一层？
是否大量从远端读？
是否大量从 SSD 拉取？
是否触发频繁淘汰？
是否后台迁移占用带宽？
是否 BlockGroup 太大导致迁移慢？
是否 pin_count 长期不释放？
是否调度没有考虑 cache locality？
```

## 面向 KV Cache 的检查清单

看组内代码或设计文档时，可以检查：

```text
1. 是否区分 GPU HBM、CPU Memory、SSD、Remote Store？
2. cache hit rate 是否按层级统计？
3. BlockGroup 粒度如何确定？
4. placement 策略考虑哪些因素？
5. 迁移是否有状态机？
6. 迁移是否带 epoch 和 operation_id？
7. 目标校验成功前是否禁止切换 location？
8. 源副本是否延迟释放？
9. 淘汰前是否检查 ref_count 和 pin_count？
10. 淘汰是否幂等？
11. 是否有 high/low watermark？
12. 后台迁移和预取是否限流？
13. 是否有 cost-aware eviction？
14. 预取命中率是否可观测？
15. 调度是否考虑 cache locality？
```

## 推荐学习顺序

这一组可以按下面顺序学：

```text
1. cache hit / miss：理解缓存命中和未命中的成本差异。
2. 多级缓存：理解 HBM、CPU Memory、SSD、Remote Store。
3. Block 和 BlockGroup 粒度：理解管理粒度。
4. cache placement：理解数据应该放在哪里。
5. cache migration：理解数据如何移动。
6. 迁移状态机：理解迁移为什么不是简单拷贝。
7. prefetch：理解提前拉取和预测风险。
8. eviction：理解空间不足时删谁。
9. LRU、LFU、TTL：理解基础淘汰策略。
10. cost-aware eviction：理解 KV Cache 为什么需要综合打分。
11. watermark：理解水位触发和抖动控制。
12. 热点处理：理解高频数据和局部性。
13. 结合调度：理解为什么 cache locality 会影响调度决策。
```

最后要能回答：

```text
这个 BlockGroup 现在应该放在哪一层？
如果显存满了，应该淘汰谁？
这个 BlockGroup 能不能迁移？
迁移收益是否大于成本？
预取是否值得？
远端读取、迁移本地、重新计算，哪个更好？
```

## 总结

缓存策略、迁移与淘汰，是 KV Cache 系统里最贴近性能和资源效率的一组内容。

核心不是简单地“命中就快，未命中就慢”，而是要理解多级存储之间的取舍：

```text
HBM 快但小。
CPU Memory 大但慢。
SSD 更大但延迟高。
远端存储可扩展但受网络影响。
迁移能提升局部性，但有成本。
淘汰能释放空间，但可能增加 miss 或重算。
预取能降低延迟，但预测错误会浪费资源。
```

对 BlockGroup 来说，最重要的原则是：

```text
1. 正在使用的数据不能淘汰。
2. 迁移和淘汰必须经过状态机。
3. 每次关键状态变化都要带 epoch。
4. 源副本不要过早删除。
5. 淘汰策略要考虑重算成本、大小、热度、优先级和局部性。
6. 后台任务不能抢占在线请求资源。
```

掌握这一组之后，下一步可以继续学习调度和负载均衡。因为缓存放在哪里、请求调到哪里、是否迁移数据，本质上是一个联合决策问题。
