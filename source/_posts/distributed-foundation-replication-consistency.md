---
title: 分布式基础：副本和一致性
date: 2026-07-14 10:30:00
categories:
  - [分布式]
tags:
  - [分布式]
  - [副本]
  - [一致性]
  - [KV Cache]
---

## 背景

前面已经学习了几组基础：

```text
第一组：操作系统、网络、并发与存储。
第二组：RPC 和远程调用。
第三组：状态机、分片、路由与元数据。
```

这些内容解决了几个问题：

```text
系统为什么会慢？
远程调用为什么会失败？
BlockGroup 有哪些状态？
数据如何分片？
请求如何通过路由和元数据找到 KV Cache？
```

接下来要学习的是副本和一致性。

在分布式系统里，数据通常不会只放一份。只放一份会有明显问题：

```text
节点挂了，数据就不可用了。
单个节点读压力太大。
迁移或维护时没有备用数据。
网络抖动时请求容易失败。
```

所以系统会把数据复制到多个节点，这就是副本。

但副本一旦出现，就会带来另一个问题：

```text
多个副本之间如何保持一致？
```

对 KV Cache 和 BlockGroup 来说，这个问题尤其重要。因为 KV 数据本身、位置信息、状态信息、引用计数、pin 状态，对一致性的要求并不一样。

<!--more-->

## 学习目标

这一组需要掌握：

```text
副本是什么
为什么需要副本
主副本和从副本
读副本和写副本
同步复制
异步复制
强一致性
最终一致性
读写一致性
Quorum
脏读、旧读、写冲突
KV Cache 中数据和元数据的一致性区别
```

这一组的目标是：能够判断哪些数据必须强一致，哪些数据可以最终一致，以及副本读写会带来什么风险。

## 为什么需要副本？

副本的目的主要有三个。

### 高可用

如果数据只有一份，节点挂了就无法访问。

例如：

```text
bg_1 只在 node_a。
node_a 宕机。
worker 无法读取 bg_1。
请求失败或只能重新计算。
```

如果有副本：

```text
bg_1 primary 在 node_a。
bg_1 replica 在 node_b。
node_a 宕机后，可以从 node_b 读取或提升 node_b 为新的 primary。
```

这能提高系统可用性。

### 读扩展

如果很多请求都读取同一份数据，单个节点可能成为热点。

例如：

```text
某个系统 prompt 的 KV Cache 被大量请求复用。
所有请求都去 node_a 读取。
node_a 网络和内存带宽被打满。
```

如果有多个只读副本，就可以分担读压力：

```text
node_a
node_b
node_c
```

不同请求可以读不同副本。

### 故障恢复和迁移缓冲

副本还可以用于节点维护、迁移和故障恢复。

例如：

```text
node_a 即将下线。
先把重要 block group 复制到 node_b。
确认副本完整后，再切换路由。
最后释放 node_a 上的数据。
```

这样可以减少迁移期间的数据不可用时间。

## 副本带来的问题

副本不是免费午餐。

它会带来几个问题：

```text
1. 写入要同步到哪些副本？
2. 读请求可以读任意副本吗？
3. 如果副本之间数据不一样，谁是对的？
4. 主副本挂了，谁能接管？
5. 旧主恢复后还能不能继续写？
6. 副本落后时，能不能对外提供读取？
7. 副本修复期间，路由和元数据如何更新？
```

这些问题合起来，就是一致性问题。

## KV 数据和元数据要分开看

在 KV Cache 系统里，首先要区分两类数据：

```text
KV 数据本身
BlockGroup 元数据
```

KV 数据本身通常是：

```text
某个 layer、某段 token range 的 Key/Value tensor。
生成后很少修改。
可以近似看作 immutable block。
```

BlockGroup 元数据通常包括：

```text
location
state
epoch
owner
ref_count
pin_count
replica_list
primary_replica
```

这些元数据会频繁变化。

这个区别非常关键：

```text
KV 数据本身可以更偏缓存语义。
元数据状态必须更严格。
```

例如，一个已经生成好的 KV block，如果多个副本内容完全一样，那么读哪个副本都可以。

但 `owner`、`epoch`、`state`、`ref_count` 这类元数据如果不一致，就可能造成严重问题：

```text
旧 owner 继续写。
正在使用的 cache 被淘汰。
迁移过程被重复执行。
客户端读到旧位置。
两个节点都认为自己是 primary。
```

所以学习一致性时，要先问：这份数据是内容数据，还是控制状态？

## 主从副本

最常见的副本模型是主从副本。

```text
Primary：主副本，负责处理写入。
Replica：从副本，复制 primary 的数据。
```

写入路径：

```text
client -> primary -> replicas
```

读取路径可以有两种：

```text
client -> primary
client -> replica
```

如果所有读都走 primary，一致性更容易保证，但 primary 压力更大。

如果读可以走 replica，读扩展能力更好，但可能读到旧数据。

### KV Cache 中的主从副本

对于 BlockGroup，可以这样建模：

```text
block_group_id = bg_1
primary = node_a
replicas = [node_b, node_c]
epoch = 10
state = LOCAL
```

如果要修改状态，例如迁移或淘汰，应该由 primary 或元数据服务协调。

例如：

```text
evict(bg_1, epoch=10)
```

这个请求不能随便发给任意 replica 执行，否则可能出现：

```text
node_b 删除了副本。
node_a 还认为副本存在。
metadata server 还把 node_b 写在 replica_list 里。
```

所以对元数据更新，要有明确的写入 owner。

## 同步复制

同步复制是指写入必须等待副本确认，才算成功。

例如：

```text
client -> primary
primary -> replica_1
primary -> replica_2
replica_1 ack
replica_2 ack
primary -> client success
```

优点：

```text
副本更一致。
primary 故障后，副本更可能拥有最新数据。
读副本更安全。
```

缺点：

```text
写延迟更高。
可用性更差，只要副本慢就会拖慢写入。
吞吐更低。
```

在 KV Cache 场景里，同步复制适合关键元数据，比如：

```text
owner
epoch
state
primary_replica
```

这些状态一旦错了，可能影响正确性。

## 异步复制

异步复制是指 primary 写入成功后先返回，再后台复制到其他副本。

例如：

```text
client -> primary
primary local write success
primary -> client success
primary later -> replica_1
primary later -> replica_2
```

优点：

```text
写延迟低。
吞吐更高。
对慢副本不敏感。
```

缺点：

```text
副本可能落后。
primary 故障时可能丢失最新写入。
读 replica 可能读到旧数据。
```

在 KV Cache 场景里，异步复制适合：

```text
非关键 cache 副本。
预热数据。
可重算数据。
统计指标。
访问热度。
```

如果某个 KV block 可以重新计算，那么它对一致性的要求可以低一些。

## 强一致性

强一致性要求系统表现得像只有一份数据。

更直观地说：

```text
一次写入成功后，后续读一定能读到这次写入。
```

例如：

```text
metadata server 更新 bg_1 location = node_b，epoch=11。
之后任何客户端查询 bg_1，都应该看到 node_b 和 epoch=11。
```

强一致性的优点是语义简单，系统更容易推理。

缺点是性能和可用性成本更高。

强一致性适合：

```text
owner
epoch
state
primary_replica
ref_count
pin_count
资源配额
任务归属
```

这些状态如果读到旧值，可能导致错误行为。

## 最终一致性

最终一致性允许短时间内不同副本不一致，但如果没有新的写入，最终会收敛到相同状态。

例如：

```text
node_a 记录 bg_1 access_count = 100。
node_b 暂时记录 access_count = 90。
后台同步后，两个节点最终合并成一致结果。
```

最终一致性适合：

```text
访问统计。
热度估计。
监控指标。
非关键副本。
可以重算的 cache。
异步预热数据。
```

最终一致性的问题是：应用层必须能接受短时间不一致。

例如访问热度晚一点同步，通常没问题；但 `epoch` 晚一点同步，就可能出大问题。

## 读写一致性

除了强一致和最终一致，还有一些更细的读写语义。

### Read Your Writes

自己写入后，自己后续一定能读到。

例如：

```text
worker pin(bg_1, request_id=req_1) 成功。
worker 后续查询 bg_1，必须看到 req_1 已经 pin 住。
```

如果做不到，worker 可能刚 pin 完，下一步又看到 `pin_count=0`，导致错误淘汰。

### Monotonic Reads

同一个客户端不会先读到新值，再读到旧值。

例如：

```text
第一次读到 bg_1 epoch=11。
第二次不应该又读到 epoch=10。
```

否则客户端状态会倒退。

### Causal Consistency

有因果关系的操作，要按因果顺序可见。

例如：

```text
先完成迁移 bg_1: node_a -> node_b。
再释放 node_a 旧副本。
```

客户端不能先看到旧副本释放，再看到迁移完成，否则会出现短时间不可读。

## Quorum

`Quorum` 是一种常见的多副本读写方式。

假设有 `N` 个副本：

```text
W：写入需要成功的副本数。
R：读取需要读取的副本数。
```

如果满足：

```text
R + W > N
```

那么读集合和写集合一定有交集，理论上可以读到最新写入。

例如：

```text
N = 3
W = 2
R = 2
R + W = 4 > 3
```

写入至少写 2 个副本，读取至少读 2 个副本，这两个集合一定重叠。

### Quorum 的代价

Quorum 能提高一致性，但也有代价：

```text
读写延迟更高。
需要处理多个副本返回不同版本。
慢副本会影响尾延迟。
实现复杂度更高。
```

在 KV Cache 场景中，Quorum 更适合元数据或关键状态，不一定适合大块 KV 数据。

因为 KV 数据很大，如果每次读取都从多个副本读并比较，成本太高。

## 旧读、脏读和写冲突

副本系统常见问题包括旧读、脏读和写冲突。

### 旧读

旧读是指读到了过期数据。

例如：

```text
bg_1 已经迁移到 node_b，epoch=11。
客户端从 replica 读到旧 location=node_a，epoch=10。
```

解决方式：

```text
读请求携带 epoch。
服务端拒绝旧 epoch。
客户端收到 STALE_METADATA 后刷新。
```

### 脏读

脏读是指读到了未提交或未完成的数据。

例如：

```text
bg_1 正在 MIGRATING_IN。
目标节点数据只复制了一半。
客户端直接从目标节点读取。
```

这会读到不完整数据。

解决方式：

```text
中间态不可读。
目标节点校验完成后再切换状态。
读取前检查 state。
```

### 写冲突

写冲突是指多个节点同时修改同一份状态。

例如：

```text
scheduler A 发起迁移 bg_1。
scheduler B 同时发起淘汰 bg_1。
```

解决方式：

```text
状态机限制合法转移。
CAS 检查 state 和 epoch。
只有 owner 可以写。
元数据服务集中处理关键状态更新。
```

## KV Cache 中哪些需要强一致？

在 KV Cache 系统里，下面这些状态通常需要强一致或接近强一致：

```text
block_group_id -> owner
block_group_id -> epoch
block_group_id -> state
block_group_id -> primary_replica
block_group_id -> location
block_group_id -> ref_count
block_group_id -> pin_count
request_id -> active_block_group_list
```

原因是这些状态会影响正确性。

例如：

```text
owner 错了：旧 owner 可能继续写。
epoch 错了：旧请求可能覆盖新状态。
state 错了：正在迁移的数据可能被读或被删。
location 错了：客户端访问旧位置。
ref_count 错了：正在使用的数据可能被释放。
pin_count 错了：正在使用的数据可能被淘汰。
```

这些状态不适合随便最终一致。

## 哪些可以最终一致？

下面这些数据可以更偏最终一致：

```text
access_count
last_access_time
cache_hit_count
cache_miss_count
eviction_count
migration_bytes
replica_health_score
预热副本进度
非关键只读副本列表
```

这些数据即使短时间不准确，通常也不会破坏请求正确性。

例如：

```text
access_count 晚一点同步，最多影响淘汰策略。
cache_hit_count 晚一点同步，最多影响监控展示。
预热副本进度短暂不一致，最多影响是否提前使用副本。
```

但要注意：最终一致的数据也可能影响策略。如果策略过度依赖不准确数据，也会导致性能问题。

## BlockGroup 副本设计示例

一个 BlockGroup 的副本元数据可以设计成：

```text
BlockGroupReplicaMetadata {
    block_group_id
    epoch
    state
    primary_replica
    replica_list
    committed_version
    replica_versions
    checksum
}
```

例如：

```text
block_group_id = bg_1
epoch = 12
state = LOCAL
primary_replica = node_b
replica_list = [node_b, node_c, node_d]
committed_version = 8
replica_versions = {
    node_b: 8,
    node_c: 8,
    node_d: 7
}
checksum = xxx
```

这里可以看到：

```text
node_b 和 node_c 已经是最新版本。
node_d 落后一版。
```

如果读请求要求强一致，就不能直接读 `node_d`。

如果读请求只是访问可重算的非关键 cache，可能允许读 node_d，但要做好版本校验。

## 副本读写路径

### 写路径

以更新 BlockGroup location 为例：

```text
1. client 发起 update_location(bg_1, node_b, epoch=12)。
2. metadata primary 检查 epoch 和 owner。
3. metadata primary 写本地日志。
4. metadata primary 同步到多数派副本。
5. 多数派确认后提交。
6. 返回 client success。
```

这条路径更偏强一致。

### 读路径

读元数据可以有不同策略：

```text
强一致读：读 primary 或读 quorum。
快速读：读本地缓存或 follower。
带校验读：读缓存，但请求实际数据时带 epoch。
```

在性能敏感系统里，常见做法是：

```text
读路径尽量快。
写路径保证关键状态正确。
读请求携带 epoch 做兜底校验。
```

这样可以在性能和正确性之间取得平衡。

## 副本落后怎么办？

副本落后是常态。

原因可能包括：

```text
网络抖动。
副本节点负载高。
复制队列堆积。
节点短暂不可用。
磁盘或远端存储变慢。
```

系统需要维护副本状态：

```text
HEALTHY
LAGGING
REBUILDING
UNAVAILABLE
```

如果副本落后：

```text
不把它作为强一致读对象。
不把它提升为 primary。
后台补齐缺失数据。
必要时从 replica_list 中移除。
```

对于 KV Cache 数据副本，还要校验：

```text
version
size_bytes
checksum
token_range
layer_id
```

否则可能读到错的数据。

## Primary 故障怎么办？

如果 primary 挂了，系统需要选出新的 primary。

关键问题是：

```text
谁有资格成为新的 primary？
新的 primary 是否拥有最新数据？
旧 primary 恢复后如何处理？
```

一个保守规则是：

```text
只有拥有最新 committed_version 的副本才能成为 primary。
primary 切换时 epoch 必须递增。
旧 primary 恢复后，必须先向 metadata server 确认当前 epoch。
旧 epoch 的写入必须被拒绝。
```

例如：

```text
node_a 是 primary，epoch=10。
node_a 故障。
node_b 被提升为 primary，epoch=11。
node_a 恢复。
node_a 携带 epoch=10 写入，被拒绝。
```

这和前面学习的 fencing 是同一个思想。

## 副本和迁移的关系

迁移和副本很像，但目标不同。

副本：

```text
为了高可用、读扩展和容错，保留多份数据。
```

迁移：

```text
为了改变数据位置，通常最终只保留目标位置或新的副本集合。
```

但迁移过程中经常会临时产生副本。

例如：

```text
bg_1 从 node_a 迁移到 node_b。
复制完成但路由未切换前，node_a 和 node_b 都有数据。
路由切换后，node_b 成为 primary。
node_a 延迟释放旧副本。
```

这段时间内，系统必须明确：

```text
谁是 primary？
哪个 epoch 最新？
读请求应该读哪里？
旧副本什么时候能删？
```

否则迁移很容易变成副本一致性问题。

## 副本和淘汰的关系

如果有副本，淘汰也不能只看本地。

例如：

```text
node_a 想淘汰 bg_1。
metadata 里记录 bg_1 有 3 个副本。
node_a 是 primary。
```

如果 node_a 直接删除，可能导致 primary 消失。

淘汰前应该检查：

```text
这个副本是不是 primary？
删除后副本数是否仍满足要求？
是否还有健康副本？
metadata 是否先更新？
是否有请求正在读取？
```

如果要删除 primary，通常需要先切主：

```text
node_a primary -> node_b primary
epoch += 1
确认 node_b 可用
再删除 node_a 副本
```

## 常见错误设计

### 把所有副本都当成一样

错误做法：

```text
replica_list = [node_a, node_b, node_c]
任意节点都可以读写。
```

问题是写冲突很难处理。

更好的方式：

```text
明确 primary。
只有 primary 或元数据服务能处理关键写入。
replica 只负责读或复制。
```

### 从落后副本读取关键状态

错误做法：

```text
从任意 replica 读取 bg_1 epoch。
```

问题是可能读到旧 epoch。

更好的方式：

```text
关键状态读 primary、quorum，或者读后做 epoch 校验。
```

### 元数据最终一致

错误做法：

```text
owner、epoch、state 通过异步同步，短时间不一致也接受。
```

问题是这些状态影响正确性。

更好的方式：

```text
关键元数据强一致。
非关键统计指标最终一致。
```

### 副本修复不校验版本

错误做法：

```text
发现副本缺失，直接从任意节点拷贝一份。
```

问题是可能拷贝旧版本。

更好的方式：

```text
修复时校验 epoch、version、checksum 和 committed_version。
```

### primary 切换不递增 epoch

错误做法：

```text
node_a primary -> node_b primary，但 epoch 不变。
```

问题是旧 primary 恢复后无法识别自己已经过期。

更好的方式：

```text
每次 primary/owner 变化，epoch 必须递增。
```

## 如何排查副本和一致性问题？

### 日志字段

日志中最好带上：

```text
request_id
operation_id
block_group_id
epoch
version
primary_replica
replica_id
replica_state
committed_version
read_version
write_version
checksum
error_code
```

### 指标

可以关注：

```text
replica_lag
replica_lag_bytes
replica_lag_seconds
replica_rebuild_count
replica_rebuild_latency
primary_failover_count
stale_read_count
stale_epoch_reject_count
quorum_read_latency
quorum_write_latency
replication_queue_length
replication_error_count
```

### 排查问题

遇到读错、读不到、迁移异常时，可以问：

```text
客户端读的是 primary 还是 replica？
这个 replica 的 version 是多少？
metadata 的 committed_version 是多少？
客户端携带的 epoch 是多少？
服务端当前 epoch 是多少？
副本是否处于 LAGGING 或 REBUILDING？
primary 是否发生过切换？
旧 primary 是否有写入被拒绝？
读取的数据 checksum 是否匹配？
```

## 面向 KV Cache 的检查清单

看组内代码或设计文档时，可以检查：

```text
1. 哪些数据有副本？
2. 副本是为了高可用、读扩展，还是迁移缓冲？
3. 是否区分 KV 数据和元数据？
4. 哪些元数据必须强一致？
5. 哪些指标或统计可以最终一致？
6. 是否有 primary_replica？
7. 只有谁能写关键状态？
8. replica 落后时是否还能对外读？
9. 读 replica 时是否校验 epoch/version？
10. primary 故障后如何选新 primary？
11. primary 切换是否递增 epoch？
12. 旧 primary 恢复后写入是否会被拒绝？
13. 迁移过程中的临时副本什么时候释放？
14. 淘汰副本前是否检查副本数和 primary 身份？
15. 副本修复是否校验 checksum？
```

## 推荐学习顺序

这一组可以按下面顺序学：

```text
1. 副本的目的：高可用、读扩展、故障恢复。
2. 主从副本：理解 primary 和 replica。
3. 同步复制：理解一致性和写延迟。
4. 异步复制：理解性能和落后副本。
5. 强一致性：理解关键状态为什么不能错。
6. 最终一致性：理解统计和非关键副本为什么可以放松。
7. 读写一致性：理解 Read Your Writes、Monotonic Reads。
8. Quorum：理解 R/W/N 的基本关系。
9. 旧读、脏读、写冲突：理解副本系统常见错误。
10. KV Cache 中区分数据和元数据。
11. BlockGroup 副本元数据设计。
12. primary 故障和 epoch/fencing。
13. 副本、迁移和淘汰之间的关系。
```

最后要能回答下面的问题：

```text
这个字段如果读到旧值，会不会影响正确性？
这个副本落后时，还能不能提供读取？
这个写操作应该写几个副本才算成功？
primary 挂了，哪个副本可以接管？
旧 primary 恢复后，如何防止它继续写？
```

## 总结

副本解决的是可用性、读扩展和故障恢复问题；一致性解决的是多个副本之间如何保持正确语义的问题。

对 KV Cache 和 BlockGroup 来说，最重要的是区分：

```text
KV 数据本身：很多时候是不可变、可重算、可异步复制的。
元数据状态：owner、epoch、state、location、ref_count、pin_count 通常必须更严格。
```

核心判断标准是：

```text
如果这个字段短时间不一致，会不会导致读错、写错、误删或旧 owner 写入？
```

如果会，就应该偏强一致；如果只是影响统计、热度或策略精度，可以考虑最终一致。

掌握副本和一致性之后，再继续学习故障处理、调度和负载均衡，会更容易理解系统为什么要设计 heartbeat、failure detector、failover、repair task 和降级策略。
