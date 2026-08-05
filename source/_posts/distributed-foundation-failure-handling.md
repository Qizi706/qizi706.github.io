---
title: 分布式基础：故障处理
date: 2026-07-14 15:30:00
categories:
  - [分布式]
tags:
  - [分布式]
  - [故障处理]
  - [容错]
  - [KV Cache]
---

## 背景

前面已经学习了几组基础：

```text
操作系统、网络、并发与存储。
RPC 和远程调用。
状态机、分片、路由与元数据。
副本和一致性。
```

这些内容让我们能理解：

```text
系统为什么会慢。
远程调用为什么会失败。
BlockGroup 如何建模成状态机。
数据如何通过分片和路由找到。
副本之间为什么需要一致性。
```

接下来要学习的是故障处理。

分布式系统和单机系统最大的区别之一是：故障是常态，不是例外。

在单机程序里，一个函数失败可能直接返回错误；但在分布式系统里，故障往往是不完整、不确定、局部发生的。例如：

```text
请求超时，但服务端可能已经执行成功。
节点没有响应，但它可能只是网络抖动。
迁移任务失败，但目标节点可能已经复制了一半数据。
旧 primary 恢复后，可能还以为自己有写权限。
客户端拿着旧路由访问已经迁移走的 BlockGroup。
```

这篇文章的目标是：理解分布式系统里会发生哪些故障，以及 KV Cache / BlockGroup 系统应该如何恢复、隔离和降级。

<!--more-->

## 学习目标

这一组需要掌握：

```text
故障模型
节点宕机
进程崩溃
网络分区
网络抖动
慢节点
超时
重试
降级
心跳 heartbeat
故障检测 failure detector
lease
fencing token
epoch
failover
repair task
补偿机制
```

这一组的目标是：能设计“失败后系统怎么恢复”。

对 KV Cache 场景，尤其要能回答：

```text
worker 挂了，它持有的 BlockGroup 怎么办？
迁移到一半失败怎么办？
调度器以为 cache 在 A，但实际已经迁到 B 怎么办？
请求取消后 ref_count 没释放怎么办？
节点恢复后带着旧 epoch 继续写怎么办？
远端 cache 读不到时，是重试、等待、重算还是降级？
```

## 故障模型

设计故障处理前，先要明确系统假设会遇到哪些故障。

常见故障包括：

```text
节点宕机：机器不可用。
进程崩溃：服务退出，但机器可能还活着。
网络分区：一部分节点之间互相不可达。
网络抖动：请求偶尔超时或延迟很高。
慢节点：节点没挂，但响应非常慢。
磁盘故障：读写失败或数据损坏。
GPU 故障：显存错误、驱动异常、设备不可用。
数据损坏：checksum 不匹配、版本错乱。
资源耗尽：CPU、内存、显存、连接池、线程池耗尽。
```

不同故障需要不同处理方式。

例如：

```text
节点宕机：需要 failover。
网络抖动：可能需要 retry。
慢节点：需要 timeout、限流或隔离。
数据损坏：需要 checksum、重新复制或重算。
资源耗尽：需要降级、拒绝请求或释放资源。
```

故障处理的关键不是“永远不失败”，而是失败后能保持正确性，并尽可能恢复可用性。

## 故障不是二元状态

很多初学者容易把节点状态理解成：

```text
alive
dead
```

但真实系统里，节点状态经常更复杂：

```text
正常。
短暂变慢。
只能访问部分节点。
能收请求但处理很慢。
能读本地数据但无法访问远端。
进程活着但线程池满了。
GPU 不可用但 CPU 服务还在。
```

所以“没有响应”不等于“已经死了”。

例如：

```text
node_a 没有回复 heartbeat。
```

可能是：

```text
node_a 宕机。
node_a 网络断了。
node_a CPU 被打满。
node_a 正在 GC 或阻塞。
heartbeat 包丢了。
监控链路有问题。
```

因此故障检测通常只能给出怀疑，而不是绝对证明。

## Heartbeat

`heartbeat` 是心跳，用来判断节点是否仍然活跃。

典型方式是：

```text
node_a 定期向 coordinator 上报心跳。
coordinator 记录 node_a 最近一次心跳时间。
如果超过阈值没收到心跳，就认为 node_a suspicious 或 unavailable。
```

心跳内容可以包括：

```text
node_id
timestamp
service_version
cpu_usage
memory_usage
gpu_memory_usage
active_requests
block_group_count
migration_task_count
health_status
```

对 KV Cache 系统来说，心跳不仅用于判断节点是否活着，还可以用于调度：

```text
这个节点 GPU HBM 是否充足？
是否有大量迁移任务？
远端读延迟是否升高？
是否应该继续调度请求到这个节点？
```

## Failure Detector

`failure detector` 是故障检测器。

它根据心跳、请求失败率、延迟、连接状态等信息判断节点健康程度。

一个简单的状态机可以是：

```text
HEALTHY
SUSPECTED
UNAVAILABLE
RECOVERING
```

含义：

```text
HEALTHY：节点正常。
SUSPECTED：怀疑异常，但还未完全摘除。
UNAVAILABLE：认为不可用，不再调度请求。
RECOVERING：节点恢复中，需要重新同步状态。
```

不要一超时就立刻判死。更稳妥的做法是：

```text
连续多次心跳失败才进入 SUSPECTED。
错误率持续升高才降低权重。
确认不可用后再进入 UNAVAILABLE。
恢复后先进入 RECOVERING，不立刻承接全部流量。
```

这可以避免网络抖动导致频繁误判。

## Timeout

故障处理里，timeout 是最基础的机制。

没有 timeout，故障会扩散：

```text
远端服务卡住。
调用方一直等待。
线程或协程被占用。
连接池被耗尽。
上游队列堆积。
更多请求超时。
```

在 KV Cache 场景中，例如：

```text
get_block_group(bg_1, epoch=10)
```

如果远端 cache manager 没有响应，本地 worker 不能无限等待。

它需要在 timeout 后选择：

```text
重试。
刷新元数据。
从其他副本读取。
重新计算。
等待一小段时间。
返回错误。
```

不同路径对应不同业务取舍。

## Retry

重试可以处理短暂故障，但也会放大故障。

适合重试：

```text
短暂网络抖动。
连接被重置。
服务端返回临时错误。
接口是幂等的。
上游还有足够时间。
```

不适合盲目重试：

```text
下游已经过载。
写操作不是幂等。
请求体很大。
上游剩余时间很短。
重试会重复迁移或重复释放资源。
```

KV Cache 的写操作通常要带：

```text
epoch
operation_id
request_id
```

这样才能支持安全重试。

例如：

```text
migrate(block_group_id, src, dst, epoch, operation_id)
evict(block_group_id, epoch, operation_id)
pin(block_group_id, request_id, epoch)
unpin(block_group_id, request_id, epoch)
```

## 慢节点

慢节点比直接宕机更麻烦。

因为它没有完全失败，但会拖慢整个系统。

例如：

```text
某个 cache manager 还能响应，但 P99 很高。
某个 metadata replica 能返回，但延迟远高于其他节点。
某个 worker GPU 正常，但 CPU 线程池排队严重。
```

慢节点会造成：

```text
请求堆积。
batch 被慢请求拖住。
重试增加。
连接池耗尽。
调度误判。
尾延迟升高。
```

处理方式包括：

```text
设置 timeout。
降低调度权重。
把节点标记为 SUSPECTED。
限制发往该节点的并发。
对慢请求做 hedged request。
必要时摘除节点。
```

`hedged request` 是指同一个请求等待一段时间还没返回时，向另一个副本再发一个请求，谁先返回用谁。

它能降低尾延迟，但会增加系统负载，所以要谨慎使用。

## 网络分区

网络分区是指集群被分成多个互相不可达的部分。

例如：

```text
node_a、node_b 能互相访问。
node_c、node_d 能互相访问。
但两组之间网络不通。
```

网络分区最危险的地方是：不同分区都可能认为自己是正确的。

例如：

```text
node_a 是 primary。
node_a 和 metadata server 失联。
metadata server 选 node_b 为新 primary。
node_a 仍然以为自己是 primary。
```

这就是脑裂风险。

解决思路：

```text
关键写入必须经过多数派或权威元数据服务。
primary 必须持有有效 lease。
写操作必须带 epoch/fencing token。
旧 epoch 写入必须被拒绝。
```

## Lease

`lease` 是租约。

它表示某个节点在一段时间内拥有某种权限。

例如：

```text
worker_a owns bg_1 until time T
```

在租约有效期内，worker_a 可以作为 owner 写入状态。

租约过期后，必须续约成功才能继续写。

Lease 可以减少频繁协调，但它依赖时间，因此要小心：

```text
不同机器时钟可能有偏差。
网络延迟不稳定。
GC 或卡顿可能导致节点误以为 lease 仍然有效。
```

所以关键系统里通常还会配合 epoch 或 fencing token。

## Fencing Token

`fencing token` 用来防止旧 owner 继续写。

它通常是一个单调递增的数字。

例如：

```text
worker_a 获得 bg_1 owner，token=10。
worker_a 失联。
worker_b 获得 bg_1 owner，token=11。
worker_a 恢复后继续写，携带 token=10。
服务端发现 token=10 < current_token=11，拒绝写入。
```

这和前面学习的 epoch 是同一个思想。

在 KV Cache 系统里，下面操作都应该带 epoch 或 fencing token：

```text
迁移 BlockGroup。
淘汰 BlockGroup。
切换 primary。
更新 location。
更新 owner。
释放旧副本。
```

## Failover

`failover` 是故障切换。

当 primary 或 owner 不可用时，系统需要选出新的 primary 或 owner。

一个简化流程：

```text
1. failure detector 发现 node_a 不可用。
2. metadata server 标记 node_a 为 UNAVAILABLE。
3. 查找 node_a 上负责的 BlockGroup。
4. 对每个 BlockGroup 选择健康副本 node_b。
5. 提升 node_b 为 primary/owner。
6. epoch += 1。
7. 更新路由和元数据。
8. 拒绝旧 epoch 写入。
9. 后台修复缺失副本。
```

Failover 的关键问题是：

```text
新 primary 是否有最新数据？
旧 primary 恢复后怎么办？
客户端旧路由如何失效？
正在执行的迁移任务如何处理？
ref_count 和 pin_count 如何恢复？
```

这些都需要状态机和元数据配合。

## Repair Task

`repair task` 是后台修复任务。

它负责处理异常和不一致状态。

例如：

```text
MIGRATING_OUT 停留太久。
MIGRATING_IN 没有完成。
metadata 记录有副本，但节点本地找不到。
节点恢复后本地存在旧 epoch 数据。
replica checksum 不一致。
ref_count 长时间不归零。
```

Repair task 的处理方式可能是：

```text
回滚状态。
继续完成迁移。
删除旧副本。
重建副本。
刷新元数据。
重新计算 KV Cache。
标记 FAILED 并等待人工排查。
```

Repair task 是分布式系统很重要的一层，因为不是所有失败都能在请求路径上同步处理完。

## 补偿机制

补偿机制用于处理“部分成功”的操作。

例如迁移：

```text
1. 元数据改成 MIGRATING_OUT。
2. 数据复制到目标节点。
3. 更新 location 失败。
```

这时系统不能假装没发生，也不能简单重试所有步骤。

可以补偿：

```text
删除目标临时数据。
把状态回滚到 LOCAL。
或者继续完成 location 更新。
```

选择哪种补偿方式，取决于当前状态和系统策略。

设计补偿机制时要注意：

```text
补偿操作也要幂等。
补偿操作也要带 epoch。
补偿失败后要能再次补偿。
补偿过程要记录 operation_id。
```

## 降级

降级是指系统无法按理想路径服务时，使用较低质量但更可控的方式继续运行。

KV Cache 场景中的降级方式包括：

```text
远端 cache 读不到时重新计算。
长上下文请求被拒绝或缩短。
暂停后台迁移。
暂停预热副本。
降低 batch size。
只使用本地 cache。
跳过非关键 cache 复用。
把请求转移到健康节点。
```

降级要明确优先级：

```text
正确性优先。
在线请求优先于后台任务。
低延迟请求优先于可延迟任务。
关键元数据优先于统计指标。
```

不能为了可用性破坏正确性。

例如：

```text
读不到正确 epoch 的 BlockGroup，不能随便读旧副本。
```

更好的选择可能是：

```text
刷新元数据。
读健康副本。
重新计算。
返回可重试错误。
```

## Worker 挂了怎么办？

假设 worker_a 挂了，它上面有一些 BlockGroup。

需要区分几种情况：

```text
BlockGroup 只有一份，在 worker_a。
BlockGroup 有健康副本。
BlockGroup 正在迁移。
BlockGroup 被某个请求 pin 住。
BlockGroup 只是本地缓存，可以重算。
```

处理方式不同：

```text
有健康副本：切换 primary/owner。
没有副本但可重算：标记 miss，后续重新计算。
正在迁移：repair task 检查源和目标状态。
被 pin 住：请求可能已经失败，需要释放或超时清理 pin。
只是本地缓存：删除元数据或标记 EVICTED。
```

不能简单地把 worker_a 上所有数据都认为丢失，也不能简单认为恢复后都可用。

恢复后要检查：

```text
epoch 是否过期。
数据 checksum 是否正确。
本地状态是否和 metadata server 一致。
是否有旧 operation 未完成。
```

## 迁移到一半失败怎么办？

迁移失败是 KV Cache 系统中最典型的故障场景。

简化迁移流程：

```text
LOCAL
-> MIGRATING_OUT
-> copy data
-> MIGRATING_IN
-> update location
-> LOCAL on target
-> release old replica
```

失败点包括：

```text
源节点设置 MIGRATING_OUT 后崩溃。
目标节点设置 MIGRATING_IN 后空间不足。
数据复制到一半网络中断。
目标校验失败。
location 更新成功，但源副本释放失败。
客户端仍然访问旧位置。
```

处理原则：

```text
源副本不要过早删除。
迁移任务必须有 operation_id。
每一步状态变更都带 epoch。
目标数据校验成功后才能切换 location。
中间态超时后由 repair task 修复。
客户端收到 STALE_METADATA 后刷新路由。
```

一种保守策略：

```text
如果目标未完成校验：回滚到源位置。
如果目标已完成校验但 location 未更新：继续完成切换。
如果 location 已切换但源未释放：延迟释放源副本。
如果源和目标都不可信：标记 FAILED，尝试从副本恢复或重算。
```

## 请求取消后资源怎么释放？

在线推理中，请求可能被取消：

```text
用户断开连接。
上游超时。
调度器取消任务。
worker 执行失败。
```

如果请求取消后没有释放资源，会出现：

```text
ref_count 不归零。
pin_count 不归零。
BlockGroup 长期不能淘汰。
GPU HBM 泄漏。
调度器认为资源还被占用。
```

处理方式：

```text
请求上下文记录所有 pin/ref。
请求结束时统一 unpin/unref。
unpin/unref 接口幂等。
后台扫描超时 request_id。
对长时间 pin 的对象告警。
```

例如：

```text
pin(bg_1, request_id=req_1, epoch=10)
unpin(bg_1, request_id=req_1, epoch=10)
```

重复 unpin 不应该导致计数变成负数。

## 节点恢复后怎么办？

节点恢复后不能立刻承接流量。

它本地可能保存着旧状态：

```text
旧 epoch 的 BlockGroup。
未完成的迁移任务。
已经被 metadata server 移除的副本。
旧 primary 身份。
过期路由缓存。
```

恢复流程可以是：

```text
1. 节点进入 RECOVERING。
2. 清空或冻结本地旧路由缓存。
3. 向 metadata server 拉取当前节点应持有的数据列表。
4. 对本地数据做 epoch/version/checksum 校验。
5. 删除过期副本。
6. 恢复缺失副本。
7. 确认健康后进入 HEALTHY。
```

恢复期间，旧 epoch 写入必须被拒绝。

## 常见错误设计

### 一次超时就判定节点死亡

错误做法：

```text
一次 heartbeat 超时 -> node dead
```

问题是网络抖动会造成误判。

更好的方式：

```text
多次失败后进入 SUSPECTED。
结合 RPC 错误率、延迟、心跳综合判断。
确认后再进入 UNAVAILABLE。
```

### 旧 owner 恢复后继续写

错误做法：

```text
worker 恢复后直接继续执行旧任务。
```

问题是 owner 可能已经转移。

更好的方式：

```text
写操作必须带 epoch/fencing token。
恢复后先重新同步元数据。
旧 epoch 写入全部拒绝。
```

### 中间态没有修复任务

错误做法：

```text
MIGRATING_OUT 失败后一直停在那里。
```

问题是 BlockGroup 长期不可用。

更好的方式：

```text
repair task 定期扫描中间态。
根据 operation_id、epoch 和实际数据状态决定回滚或继续。
```

### 请求取消不释放 pin

错误做法：

```text
请求失败后直接返回，不执行 unpin。
```

问题是资源泄漏。

更好的方式：

```text
请求上下文统一清理。
unpin 幂等。
后台扫描超时 request_id。
```

### 降级读旧副本

错误做法：

```text
最新副本读不到，就随便读一个旧副本。
```

问题是可能破坏正确性。

更好的方式：

```text
先校验 epoch/version。
旧副本只能在语义允许时使用。
不允许时重算或返回错误。
```

## 如何排查故障处理问题？

### 日志字段

日志中最好带上：

```text
request_id
operation_id
block_group_id
node_id
owner
epoch
state
old_state
new_state
failure_reason
retry_count
timeout_ms
lease_expire_time
fencing_token
```

### 指标

可以关注：

```text
heartbeat_timeout_count
node_suspected_count
node_unavailable_count
failover_count
failover_latency
repair_task_count
repair_task_failure_count
migration_timeout_count
stale_epoch_reject_count
lease_expired_count
fencing_reject_count
request_cancel_count
pin_leak_count
degraded_request_count
```

### 排查问题

遇到故障时，可以问：

```text
故障是节点宕机、网络抖动，还是慢节点？
failure detector 是什么时候标记异常的？
是否发生 failover？
epoch 是否递增？
旧 owner 是否还有写入？
中间态是否被 repair task 处理？
客户端是否刷新过元数据？
请求取消后 pin/ref 是否释放？
是否触发降级？降级是否破坏正确性？
```

## 面向 KV Cache 的检查清单

看组内代码或设计文档时，可以检查：

```text
1. 系统定义了哪些故障模型？
2. heartbeat 上报哪些字段？
3. failure detector 是否区分 HEALTHY、SUSPECTED、UNAVAILABLE、RECOVERING？
4. 远程调用是否有 timeout？
5. retry 是否只用于幂等操作？
6. 是否存在 retry storm 风险？
7. owner/primary 切换时 epoch 是否递增？
8. 旧 owner 写入是否会被 fencing 拒绝？
9. 迁移中间态是否有超时修复？
10. repair task 是否幂等？
11. 请求取消后 pin/ref 是否释放？
12. 节点恢复后是否先进入 RECOVERING？
13. 本地旧副本是否做 epoch/version/checksum 校验？
14. 降级策略是否优先保证正确性？
15. 在线请求和后台任务是否有不同优先级？
```

## 推荐学习顺序

这一组可以按下面顺序学：

```text
1. 故障模型：先知道系统可能怎么失败。
2. timeout 和 retry：理解请求失败的基本处理。
3. heartbeat：理解节点健康信息如何上报。
4. failure detector：理解如何从怀疑到摘除节点。
5. 慢节点：理解为什么慢比挂更麻烦。
6. 网络分区：理解脑裂风险。
7. lease 和 fencing token：理解如何限制旧 owner。
8. failover：理解 primary/owner 如何切换。
9. repair task：理解中间态如何恢复。
10. 补偿机制：理解部分成功后如何收尾。
11. 降级：理解故障时如何保正确性和可用性。
12. 结合 KV Cache 分析 worker 挂、迁移失败、请求取消、节点恢复。
```

最后要能把一次故障讲完整：

```text
故障发生在哪里？
系统如何发现？
如何避免误判？
是否需要 failover？
epoch 是否递增？
旧 owner 如何被 fencing？
中间态如何 repair？
请求如何降级或失败？
资源如何释放？
指标和日志如何证明恢复成功？
```

## 总结

故障处理是分布式系统从“能跑”走向“可靠”的关键。

对 KV Cache 和 BlockGroup 系统来说，最重要的是建立几个意识：

```text
1. 超时不等于失败，没响应不等于死亡。
2. 故障检测只能怀疑，不能证明。
3. 旧 owner 恢复后不能继续写，必须用 epoch/fencing 限制。
4. 迁移、淘汰、恢复都要有中间态和 repair task。
5. 请求取消后必须释放 pin/ref，避免资源泄漏。
6. 降级不能破坏正确性。
7. 节点恢复后要重新同步元数据，不能直接接流量。
```

掌握故障处理之后，下一步可以继续学习缓存策略、迁移淘汰、调度和负载均衡。这些内容会更偏性能和资源效率，但它们都建立在状态正确和故障可恢复的基础上。
