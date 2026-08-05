---
title: 分布式基础：状态机、分片、路由与元数据
date: 2026-07-07 16:30:00
categories:
  - [分布式]
tags:
  - [分布式]
  - [状态机]
  - [并发]
  - [元数据]
  - [KV Cache]
---

## 背景

前面学习了两组基础：

```text
第一组：操作系统、网络、并发与存储。
第二组：RPC 和远程调用。
```

这两组解决的是底层问题：系统为什么会慢、远程调用为什么会失败、为什么接口要考虑 `timeout`、`retry` 和幂等。

接下来这一组更贴近 KV Cache 系统本身：

```text
第三组：并发状态和状态机。
第四组：分片、路由和元数据。
```

之所以把这两组放在一起，是因为它们在真实系统里经常不能分开看。

以 `BlockGroup` 为例，它不仅是一组 KV Cache block 的集合，还是一个有生命周期、有位置、有 owner、有版本的分布式对象。系统不仅要知道它是什么状态，还要知道它在哪里、谁能修改它、客户端看到的位置是不是最新的。

这一篇的目标是：能把一个分布式对象的生命周期讲清楚，并理解一个请求如何找到它需要的 KV Cache。

<!--more-->

## 学习目标

这一组需要掌握：

```text
状态机
状态转移
并发读写
CAS
锁
版本号
epoch
引用计数
pin/unpin
哈希分片
一致性哈希
Range 分片
路由表
元数据服务
本地元数据缓存
元数据失效
```

放到 KV Cache 场景里，最核心的问题是：

```text
这个 block group 当前在哪里？
它现在是什么状态？
谁拥有它？
谁能修改它？
它能不能读？
它能不能迁移？
它能不能淘汰？
客户端看到的位置是不是旧的？
迁移过程中路由怎么更新？
```

这些问题的答案，最终都会落到状态机和元数据设计上。

## 为什么要先学状态机？

分布式系统里很多 bug 都不是算法 bug，而是状态 bug。

例如：

```text
一个 block group 正在迁移，另一个线程把它淘汰了。
一个请求正在读取 cache，后台任务释放了这块内存。
源节点认为迁移失败，目标节点认为迁移成功。
客户端拿着旧路由继续访问旧 owner。
旧 owner 恢复后继续写状态，覆盖了新 owner 的结果。
```

这些问题的共同点是：对象状态没有定义清楚，状态转移没有被保护。

所以学习分布式对象时，第一步不是先看它怎么存，而是先问：

```text
这个对象有哪些状态？
状态之间怎么转移？
哪些状态允许读？
哪些状态允许写？
哪些状态允许迁移？
哪些状态允许淘汰？
失败后进入什么状态？
谁有权改变状态？
```

## BlockGroup 是一个状态对象

在 KV Cache 系统里，`Block` 通常表示一段连续 token 的 K/V 数据，`BlockGroup` 则是一组访问模式相近、生命周期相近的 block。

可以简单理解为：

```text
Block：KV Cache 的基本存储单元。
BlockGroup：调度、迁移、淘汰和生命周期管理的逻辑单位。
```

一个 BlockGroup 至少包含两类信息：

```text
数据本身：一组 block 的 K/V 内容。
元数据：位置、状态、epoch、ref_count、pin_count、owner 等。
```

很多时候，KV 数据本身生成后不再修改，可以近似看作 immutable；但元数据会频繁变化。

例如：

```text
block_group_id = bg_1
location = node_a / gpu_0 / HBM
state = LOCAL
epoch = 10
ref_count = 2
pin_count = 1
owner = worker_a
```

系统真正复杂的地方，往往在这些元数据状态上。

## BlockGroup 的状态机

一个简化的 BlockGroup 状态机可以是：

```text
CREATED
LOCAL
PINNED
MIGRATING_OUT
MIGRATING_IN
REMOTE
EVICTING
EVICTED
FAILED
```

这些状态的含义可以这样理解：

```text
CREATED：元数据已创建，但数据可能还未完全写入。
LOCAL：数据在本地，可以正常访问。
PINNED：正在被请求使用，不能淘汰，通常也不能随意迁移。
MIGRATING_OUT：正在从本节点迁出。
MIGRATING_IN：正在迁入本节点。
REMOTE：数据不在本地，需要远程访问或拉取。
EVICTING：正在淘汰或释放。
EVICTED：已经被淘汰，不再可读。
FAILED：进入异常状态，需要后台修复或重新计算。
```

状态机的价值在于：它把系统行为变成明确规则。

例如：

```text
LOCAL 可以读。
PINNED 可以读，但不能淘汰。
MIGRATING_OUT 是否可以读，要看系统策略。
MIGRATING_IN 通常不能直接读，除非迁入完成。
EVICTING 通常不能发起新读。
EVICTED 不能读，只能 miss、重算或从远端恢复。
FAILED 不能直接使用，需要修复。
```

## 状态转移

有了状态，还要定义状态之间允许怎么转移。

例如：

```text
CREATED -> LOCAL
LOCAL -> PINNED
PINNED -> LOCAL
LOCAL -> MIGRATING_OUT
MIGRATING_OUT -> REMOTE
REMOTE -> MIGRATING_IN
MIGRATING_IN -> LOCAL
LOCAL -> EVICTING
EVICTING -> EVICTED
任意中间态 -> FAILED
FAILED -> LOCAL
FAILED -> EVICTED
```

不是所有转移都应该被允许。

例如：

```text
PINNED -> EVICTED 通常不应该允许。
EVICTED -> LOCAL 需要重新加载或重新计算，不能直接改状态。
MIGRATING_OUT -> EVICTING 需要非常小心，否则可能迁移和释放冲突。
REMOTE -> EVICTED 要确认本地是否只是元数据引用，不能误删远端数据。
```

状态转移最好集中管理，而不是散落在各个函数里。

例如可以抽象成：

```text
transition(block_group_id, from_state, to_state, epoch)
```

服务端检查：

```text
当前 state 是否等于 from_state？
当前 epoch 是否匹配？
from_state -> to_state 是否被允许？
调用方是否是当前 owner？
```

如果检查失败，就拒绝更新。

## 哪些状态可以读？

读能力可以按状态定义：

```text
CREATED：通常不能读，数据还不完整。
LOCAL：可以读。
PINNED：可以读。
MIGRATING_OUT：可选，可以读源，也可以要求刷新路由。
MIGRATING_IN：通常不能读，除非迁入完成。
REMOTE：不能本地读，需要远程读或拉取。
EVICTING：通常拒绝新读。
EVICTED：不能读。
FAILED：不能读，需要修复或重算。
```

这里没有唯一标准，取决于系统设计。

例如 `MIGRATING_OUT` 有两种策略：

```text
策略一：迁移期间仍允许从源节点读，迁移完成后切换路由。
策略二：迁移期间拒绝新读，让客户端等待或刷新路由。
```

策略一可用性更好，但源节点释放旧副本要更谨慎。策略二状态更简单，但可能增加请求延迟。

## 哪些状态可以迁移？

迁移通常只应该从稳定状态发起。

比较安全的规则是：

```text
LOCAL 且 pin_count == 0：可以迁移。
REMOTE：本地没有数据，不需要迁出，但可以发起拉取。
PINNED：不迁移，避免影响正在使用的请求。
EVICTING / EVICTED：不迁移。
FAILED：先修复，再决定是否迁移。
```

实际系统可能允许 pinned 数据迁移，但需要更复杂的协议，例如读写双路径、引用转移、迁移期间冻结状态等。

初学阶段可以先掌握保守设计：正在使用的数据不迁移，正在迁移的数据不淘汰。

## 哪些状态可以淘汰？

淘汰比迁移更危险，因为淘汰意味着释放数据。

基本规则可以是：

```text
LOCAL 且 ref_count == 0 且 pin_count == 0：可以淘汰。
REMOTE：本地没有数据，可以释放本地占位或元数据缓存。
PINNED：不能淘汰。
MIGRATING_OUT / MIGRATING_IN：不能直接淘汰。
EVICTING：已经在淘汰中，不重复发起。
EVICTED：已经淘汰，重复 evict 应该返回成功。
FAILED：由修复任务决定释放还是恢复。
```

注意最后一点：`EVICTED` 再次收到 `evict` 请求时，最好返回成功。这是幂等设计。

## 引用计数 ref_count

`ref_count` 表示当前有多少使用者正在引用这个 block group。

例如：

```text
decode 请求开始读取 block group：ref_count += 1
decode 请求读取结束：ref_count -= 1
```

规则通常是：

```text
ref_count > 0：不能释放。
ref_count == 0：可以考虑淘汰，但还要看 pin_count 和状态。
```

`ref_count` 必须原子更新，否则可能出现读释放冲突。

典型错误：

```text
线程 A 准备读取 bg_1。
线程 B 看到 ref_count == 0，开始释放 bg_1。
线程 A 还没来得及增加 ref_count，就读到了已释放的数据。
```

所以读请求通常要先通过一个受保护的流程获取引用：

```text
1. 加锁或 CAS 检查 state。
2. 如果 state 允许读，ref_count += 1。
3. 解锁。
4. 执行读取。
5. 读取完成后 ref_count -= 1。
```

## pin/unpin

`pin` 表示把某个 block group 固定住，防止它被淘汰，通常也防止它被迁移。

它适合这些场景：

```text
一个请求即将进入 decode，需要保证相关 KV Cache 不被释放。
迁移任务需要确保源数据在复制完成前不被淘汰。
预取任务希望短时间保留一批热数据。
```

`pin/unpin` 不能简单设计成：

```text
pin_count += 1
pin_count -= 1
```

因为 RPC 可能超时重试，重复执行会导致计数错误。

更好的方式是：

```text
pin(block_group_id, request_id, epoch)
unpin(block_group_id, request_id, epoch)
```

服务端维护：

```text
block_group_id -> pinned_request_set
```

这样同一个 `request_id` 重复 pin 只算一次，重复 unpin 也只释放一次。

## CAS

`CAS` 是 Compare-And-Swap，比较并交换。

它的语义可以理解为：

```text
如果当前值等于 expected，就把它改成 new_value。
否则修改失败。
```

在状态机里，CAS 很适合做条件更新。

例如：

```text
CAS(state, LOCAL, MIGRATING_OUT)
```

含义是：

```text
只有当前 state 仍然是 LOCAL 时，才能改成 MIGRATING_OUT。
如果已经被其他线程改成 PINNED 或 EVICTING，则迁移失败。
```

但分布式场景里，只比较 state 还不够，通常还要比较 epoch：

```text
CAS((state, epoch), (LOCAL, 10), (MIGRATING_OUT, 11))
```

这样可以避免旧请求覆盖新状态。

## 版本号和 epoch

`version` 或 `epoch` 用来表示状态版本。

每次关键状态变化时，epoch 递增：

```text
LOCAL(epoch=10)
-> MIGRATING_OUT(epoch=11)
-> REMOTE(epoch=12)
```

客户端发起写操作时必须携带自己看到的 epoch：

```text
evict(block_group_id=bg_1, epoch=10)
```

服务端检查当前 epoch：

```text
如果 current_epoch != request_epoch，拒绝请求。
```

这样可以防止旧客户端、旧 owner、旧迁移任务继续写入。

## 旧 owner 恢复后还能不能继续写？

不能直接继续写。

这是分布式系统里非常关键的问题。

例如：

```text
1. worker A 是 bg_1 的 owner，epoch=10。
2. A 因为网络抖动和集群失联。
3. 系统把 bg_1 的 owner 转移给 worker B，epoch=11。
4. A 恢复后，以为自己还是 owner，继续写 bg_1 状态。
```

如果没有 epoch 或 fencing token，A 可能覆盖 B 的新状态。

正确做法是：

```text
每次 owner 变化，epoch 递增。
所有写操作必须携带 epoch。
元数据服务只接受当前 epoch 的写入。
旧 epoch 的写入直接拒绝。
```

这就是 fencing 的基本思想。

## 迁移失败怎么办？

迁移是长操作，失败是常态。

例如迁移流程：

```text
1. bg_1: LOCAL(epoch=10)
2. 源节点设置 MIGRATING_OUT(epoch=11)
3. 目标节点设置 MIGRATING_IN(epoch=11)
4. 拷贝数据
5. 校验数据
6. 更新 location
7. 源节点释放旧副本
```

失败可能发生在任何一步：

```text
源节点设置状态后崩溃。
目标节点空间不足。
数据拷贝到一半网络断开。
目标校验失败。
元数据更新成功，但源节点释放失败。
客户端仍然持有旧路由。
```

一种保守处理方式是：

```text
迁移开始前记录 operation_id。
迁移状态写入元数据。
源副本延迟删除。
目标校验成功后再更新 location。
客户端发现 epoch 不匹配时刷新元数据。
后台 repair 任务扫描 MIGRATING 状态并修复。
```

中间态不能无限停留。系统需要后台任务处理这些状态：

```text
MIGRATING_OUT 超时：回滚到 LOCAL，或继续完成迁移。
MIGRATING_IN 超时：清理目标临时数据，或重新拉取。
元数据和实际数据不一致：以元数据 epoch 为准做修复。
```

## 淘汰过程中又被访问怎么办？

淘汰过程中被访问也很常见。

例如：

```text
1. bg_1 ref_count=0，pin_count=0，被选中淘汰。
2. 状态从 LOCAL 变成 EVICTING。
3. 一个新的 decode 请求需要读取 bg_1。
```

这时有几种策略：

```text
策略一：拒绝新读，让请求 miss 或重新计算。
策略二：取消淘汰，把状态改回 LOCAL。
策略三：等待淘汰完成，再从下一级存储拉回。
```

哪种策略更好，取决于系统目标。

在线推理通常更关注延迟，所以如果淘汰还没真正释放数据，取消淘汰可能更合适。但这要求淘汰状态机能支持回滚。

一个保守状态转移可以是：

```text
LOCAL -> EVICTING
EVICTING -> LOCAL
EVICTING -> EVICTED
```

但前提是：

```text
数据还没释放时才能回滚。
数据一旦释放，只能进入 EVICTED。
回滚和释放必须互斥。
```

## 为什么要学分片？

当数据放不下一台机器，就要分片。

分片要解决的问题是：

```text
给定一个 key，应该去哪个节点找数据？
```

在 KV Cache 系统中，这个 key 可能是：

```text
block_id
block_group_id
request_id
session_id
model_id
layer_id
token_range
```

分片策略决定了数据如何分布，也决定了负载、迁移成本和故障影响面。

## 哈希分片

最简单的方式是：

```text
node = hash(key) % N
```

优点：

```text
实现简单。
数据分布相对均匀。
查询路径清晰。
```

缺点：

```text
节点数量 N 改变时，大量 key 会重新映射。
扩容或缩容会触发大量迁移。
不容易表达物理拓扑和负载差异。
```

如果用 `block_group_id` 做哈希分片：

```text
node = hash(block_group_id) % N
```

系统可以快速找到某个 group 的默认归属节点。但如果节点扩容，很多 group 的位置都可能变化。

## 一致性哈希

一致性哈希把 key 和节点都映射到一个环上。key 顺时针找到的第一个节点，就是它的归属节点。

它的优点是：

```text
增加或删除节点时，只影响环上的一小段 key。
比 hash(key) % N 更适合缓存系统扩缩容。
可以通过虚拟节点改善负载均衡。
```

它适合这些场景：

```text
cache 节点会动态扩缩容。
允许少量数据迁移。
希望路由计算比较简单。
```

但一致性哈希也不是万能的。

在 KV Cache 场景中，如果某些 block group 特别大或特别热，单纯靠一致性哈希仍然可能产生热点。

所以还需要结合：

```text
节点负载。
GPU HBM 余量。
网络拓扑。
请求局部性。
block group 热度。
迁移成本。
```

## Range 分片

Range 分片按照 key 的范围切分。

例如：

```text
[0, 1000)      -> node A
[1000, 2000)   -> node B
[2000, 3000)   -> node C
```

优点：

```text
适合范围查询。
方便按时间、token range、sequence range 组织数据。
有利于顺序扫描和批量迁移。
```

缺点：

```text
容易产生热点。
范围切分不均时，部分节点压力过大。
需要 split/merge 机制维护范围。
```

KV Cache 中，如果按 token range 组织 block group，Range 分片可以让连续 token 的 cache 更容易放在一起。

但如果某些长上下文请求特别多，相关 range 可能成为热点。

## 分片维度怎么选？

KV Cache 的分片维度不是固定的。

可以按：

```text
按 request/session 分片：同一个请求的数据尽量放一起。
按 block_group_id 分片：实现简单，分布较均匀。
按 layer 分片：配合 pipeline parallelism 或模型层级调度。
按 model_id 分片：隔离不同模型。
按租户分片：做资源隔离。
按 token range 分片：保留连续访问局部性。
```

不同维度的取舍：

```text
按请求分片：局部性好，但长请求可能很大。
按 block_group 分片：负载均衡较好，但一次请求可能跨多个节点。
按 layer 分片：适合模型并行，但路由更复杂。
按模型分片：隔离性好，但热门模型容易形成热点。
按 token range 分片：顺序访问友好，但需要处理长序列热点。
```

一个好的分片策略要同时考虑：

```text
访问局部性。
负载均衡。
迁移成本。
故障影响面。
元数据复杂度。
调度策略。
```

## 路由表

分片之后，系统需要知道数据在哪里。这个信息通常通过路由表表达。

一个简化路由表可以是：

```text
block_group_id -> node_id
block_group_id -> device_id
block_group_id -> memory_tier
block_group_id -> epoch
block_group_id -> state
```

例如：

```text
bg_1 -> node_a / gpu_0 / HBM / epoch=10 / LOCAL
bg_2 -> node_b / cpu_memory / epoch=7 / REMOTE
bg_3 -> node_c / ssd / epoch=3 / EVICTED
```

客户端访问 `bg_1` 时，先查路由：

```text
1. bg_1 在 node_a。
2. 数据在 gpu_0 HBM。
3. 当前 epoch=10。
4. 当前状态 LOCAL，可以读。
```

然后客户端发起读取：

```text
get_block_group(bg_1, epoch=10)
```

如果服务端发现当前 epoch 已经不是 10，就说明客户端路由过期，需要刷新元数据。

## 元数据服务

元数据服务维护系统的事实来源。

在 KV Cache 中，元数据可能包括：

```text
block_id -> block_group_id
block_group_id -> node_id
block_group_id -> device_id
block_group_id -> memory_tier
block_group_id -> state
block_group_id -> epoch
block_group_id -> owner
block_group_id -> ref_count
block_group_id -> pin_count
request_id -> block_group_list
```

它回答的问题是：

```text
数据在哪里？
数据现在是什么状态？
谁是 owner？
当前版本是多少？
这个请求需要哪些 block group？
```

元数据服务需要更强的一致性，因为它决定系统行为。

例如：

```text
block group 当前 owner 是谁。
block group 当前 epoch 是多少。
block group 是否可以被淘汰。
block group 是否正在迁移。
```

这些状态如果错了，可能导致读错位置、重复迁移、误删 cache 或旧 owner 写入。

## 本地元数据缓存

每次访问都查元数据服务会很慢，所以客户端通常会缓存元数据。

例如 worker 本地缓存：

```text
bg_1 -> node_a / gpu_0 / HBM / epoch=10
```

这样下一次访问 `bg_1` 时，不用再远程查询 metadata server。

但本地缓存会带来一个问题：

```text
缓存可能过期。
```

例如：

```text
1. worker 本地缓存 bg_1 在 node_a，epoch=10。
2. bg_1 被迁移到 node_b，epoch=11。
3. worker 继续向 node_a 读取 bg_1。
```

如果没有校验，worker 就会访问旧位置。

所以本地元数据缓存必须配合：

```text
epoch 校验。
TTL。
主动失效通知。
访问失败后刷新。
```

## 元数据失效

元数据失效有几种方式。

### TTL

给缓存一个过期时间。

```text
bg_1 route cache TTL = 100ms
```

优点：

```text
实现简单。
不需要服务端主动通知。
```

缺点：

```text
TTL 内可能读到旧路由。
TTL 太短会增加 metadata server 压力。
TTL 太长会增加过期风险。
```

### 主动失效

元数据变化时，服务端通知客户端删除旧缓存。

例如：

```text
bg_1 location changed: node_a -> node_b
notify clients invalidate bg_1
```

优点：

```text
旧缓存失效更及时。
可以降低错误路由概率。
```

缺点：

```text
客户端列表难维护。
通知可能丢失。
通知顺序可能乱。
实现复杂度更高。
```

### 版本校验

每次请求都带上 epoch：

```text
get_block_group(bg_1, epoch=10)
```

服务端检查当前 epoch：

```text
如果 current_epoch == 10，正常处理。
如果 current_epoch > 10，返回 STALE_METADATA。
```

客户端收到 `STALE_METADATA` 后重新查元数据。

版本校验是非常关键的兜底机制。即使 TTL 或主动失效没有及时生效，也能防止旧路由继续写状态。

## 迁移过程中路由怎么更新？

迁移是状态机和元数据最容易出问题的地方。

一种简化流程：

```text
1. bg_1 当前在 node_a，state=LOCAL，epoch=10。
2. 调度器决定迁移到 node_b。
3. 元数据更新为 state=MIGRATING_OUT，epoch=11。
4. node_b 创建临时状态 MIGRATING_IN，epoch=11。
5. node_a 将数据复制到 node_b。
6. node_b 校验数据成功。
7. 元数据更新 location=node_b，state=LOCAL，epoch=12。
8. node_a 延迟释放旧副本。
```

迁移期间，客户端可能看到不同状态。

如果客户端拿着旧路由访问 node_a：

```text
get_block_group(bg_1, epoch=10)
```

node_a 可以返回：

```text
STALE_METADATA(current_epoch=11)
```

客户端重新查询元数据后，发现正在迁移，可以选择：

```text
等待迁移完成。
继续从源节点读。
转向目标节点。
重新计算。
```

不同系统会有不同策略，但核心原则是：

```text
路由更新必须和 epoch 绑定。
客户端必须能识别旧路由。
源副本不要过早删除。
中间态必须能被后台修复。
```

## 数据在哪里？

这是路由和元数据要回答的第一个问题。

一个 block group 可能在：

```text
本地 GPU HBM。
本地 CPU Memory。
本地 SSD。
远端 GPU HBM。
远端 CPU Memory。
远端 SSD。
已经被淘汰。
正在迁移。
```

所以 location 不应该只是一个简单的 `node_id`。

更完整的 location 可以包括：

```text
node_id
device_id
memory_tier
offset
size_bytes
replica_role
```

例如：

```text
node_id = node_a
device_id = gpu_0
memory_tier = HBM
offset = 1024MB
size_bytes = 256MB
replica_role = primary
```

## 谁说了算？

分布式系统里必须明确事实来源。

对于 BlockGroup 元数据，通常应该有一个权威来源：

```text
metadata server
```

worker 本地缓存、scheduler 缓存、cache manager 本地索引都只能是副本或缓存。

如果出现冲突，例如：

```text
metadata server 说 bg_1 在 node_b，epoch=12。
node_a 本地还认为 bg_1 在自己这里，epoch=10。
```

应该以 metadata server 的高版本状态为准。

这也是为什么 epoch 很重要：它让系统能够比较哪个状态更新。

## 客户端看到的是不是旧位置？

客户端几乎一定可能看到旧位置。

原因包括：

```text
本地缓存未失效。
迁移刚刚完成。
失效通知丢失。
网络延迟导致消息乱序。
客户端长时间没有刷新路由。
```

所以系统不能假设客户端永远拿到最新位置。

更现实的设计是：

```text
允许客户端缓存路由。
请求携带 epoch。
服务端拒绝旧 epoch 请求。
客户端收到 STALE_METADATA 后刷新。
```

也就是说，缓存可以过期，但过期缓存不能破坏正确性。

## 一个请求如何找到 KV Cache？

假设 worker 需要读取 `bg_1`。

路径可能是：

```text
1. worker 查询本地路由缓存。
2. 如果命中，拿到 node_id、device_id、memory_tier、epoch。
3. worker 向对应 cache manager 发起 get_block_group(bg_1, epoch)。
4. cache manager 检查 state 和 epoch。
5. 如果可以读，返回数据或数据通道信息。
6. 如果 epoch 过期，返回 STALE_METADATA。
7. worker 重新查 metadata server。
8. metadata server 返回新 location、state、epoch。
9. worker 根据新状态决定读取、等待、拉取或重算。
```

这条路径串起了：

```text
本地元数据缓存。
路由表。
元数据服务。
epoch 校验。
状态机。
RPC。
数据读取。
```

所以一个请求“找到 KV Cache”不是简单 map 查询，而是一套带版本、状态和失败处理的流程。

## 一个简化的 BlockGroup 元数据结构

可以用下面的结构帮助理解：

```text
BlockGroupMetadata {
    block_group_id
    model_id
    request_id
    layer_id
    token_range
    block_list

    node_id
    device_id
    memory_tier
    offset
    size_bytes

    state
    epoch
    owner
    ref_count
    pin_count

    last_access_time
    access_count
    priority
}
```

这里可以分成三类：

```text
身份信息：block_group_id、model_id、request_id、layer_id、token_range。
位置信息：node_id、device_id、memory_tier、offset、size_bytes。
状态信息：state、epoch、owner、ref_count、pin_count。
```

其中状态信息最需要并发保护，位置信息最容易因为迁移而过期。

## 常见错误设计

### 状态没有中间态

错误做法：

```text
LOCAL -> REMOTE
```

中间没有 `MIGRATING_OUT` 或 `MIGRATING_IN`。

问题是迁移过程中系统不知道数据处于什么阶段。

更好的方式：

```text
LOCAL -> MIGRATING_OUT -> REMOTE
REMOTE -> MIGRATING_IN -> LOCAL
```

### 写状态不带 epoch

错误做法：

```text
set_state(bg_1, EVICTED)
```

问题是旧 owner 也可以写。

更好的方式：

```text
set_state(bg_1, from_state=EVICTING, to_state=EVICTED, epoch=12)
```

### ref_count 和 pin_count 不是原子更新

错误做法：

```text
if ref_count == 0:
    free(block_group)
```

但没有锁或 CAS 保护。

问题是另一个线程可能正在增加引用。

更好的方式：

```text
在同一个临界区里检查 state、ref_count、pin_count，并更新状态。
```

### 本地缓存路由但不校验 epoch

错误做法：

```text
route = local_cache[bg_1]
send_request(route.node)
```

问题是路由可能过期。

更好的方式：

```text
route = local_cache[bg_1]
send_request(route.node, bg_1, route.epoch)
```

服务端校验 epoch，过期则返回 `STALE_METADATA`。

### 迁移完成后立刻删除源副本

错误做法：

```text
更新元数据到 node_b 后，node_a 立即删除数据。
```

问题是客户端可能还拿着旧路由访问 node_a。

更保守的方式：

```text
源副本延迟删除。
旧 epoch 请求返回 STALE_METADATA。
一段时间后或确认没有旧引用后再释放。
```

## 如何排查状态和路由问题？

状态和路由问题通常需要同时看日志、指标和元数据快照。

### 日志字段

日志里最好带上：

```text
request_id
operation_id
block_group_id
old_state
new_state
epoch
old_location
new_location
owner
ref_count
pin_count
error_code
```

否则排查迁移、淘汰和旧路由问题会很困难。

### 指标

可以关注：

```text
metadata_query_latency
metadata_update_latency
metadata_stale_count
route_cache_hit_rate
route_cache_stale_count
state_transition_failure_count
cas_failure_count
block_group_migrating_count
block_group_evicting_count
stale_epoch_reject_count
repair_task_count
```

### 常见排查问题

遇到一次读失败，可以问：

```text
客户端看到的 epoch 是多少？
服务端当前 epoch 是多少？
block group 当前 state 是什么？
客户端访问的是不是旧 location？
是否正在迁移？
ref_count 和 pin_count 是否异常？
是否有旧 owner 写入被拒绝？
是否有后台 repair 任务处理过这个 group？
```

## 面向 KV Cache 的检查清单

看组内代码或设计文档时，可以用下面的问题检查：

```text
1. BlockGroup 有哪些状态？
2. 每个状态是否有明确含义？
3. 哪些状态可以读？
4. 哪些状态可以迁移？
5. 哪些状态可以淘汰？
6. 状态转移是否合法校验？
7. 状态更新是否带 epoch？
8. owner 变化时 epoch 是否递增？
9. 旧 epoch 写入是否会被拒绝？
10. ref_count 是否原子更新？
11. pin/unpin 是否按 request_id 幂等？
12. 迁移失败是否有中间态恢复机制？
13. 淘汰过程中被访问是否有明确策略？
14. 分片 key 是什么？
15. 路由表是否包含 state 和 epoch？
16. 本地元数据缓存如何失效？
17. 客户端访问旧位置时如何刷新路由？
18. 元数据服务是不是事实来源？
```

## 推荐学习顺序

这一组可以按下面顺序学：

```text
1. 状态机：理解对象生命周期。
2. 状态转移：定义哪些变化合法。
3. 锁和 CAS：保护并发状态更新。
4. ref_count 和 pin/unpin：保护正在使用的数据。
5. version/epoch：防止旧请求和旧 owner 写入。
6. BlockGroup 迁移状态机：理解中间态和失败恢复。
7. BlockGroup 淘汰状态机：理解释放和回滚。
8. 哈希分片：理解最基础的数据分布。
9. 一致性哈希：理解扩缩容时减少迁移。
10. Range 分片：理解范围访问和热点。
11. 路由表：理解请求如何找到数据。
12. 元数据服务：理解谁是事实来源。
13. 本地元数据缓存：理解性能和过期风险。
14. 元数据失效：理解 TTL、主动通知和 epoch 校验。
```

最后要把这些内容串成一条链路：

```text
BlockGroup 创建
-> 写入元数据
-> 分片决定归属
-> 路由表记录位置
-> 客户端缓存路由
-> 请求携带 epoch 读取
-> 状态机判断是否可读
-> 迁移时更新 state/location/epoch
-> 客户端发现旧路由后刷新
-> ref_count/pin_count 归零后淘汰
```

如果能把这条链路讲清楚，就说明已经初步理解了分布式对象的生命周期。

## 总结

并发状态、状态机、分片、路由和元数据，是 KV Cache 系统里非常核心的一组基础。

状态机回答：

```text
这个对象现在能做什么？
```

元数据回答：

```text
这个对象在哪里？谁拥有它？当前版本是多少？
```

分片和路由回答：

```text
给定一个 key，应该去哪里找？
```

对 BlockGroup 来说，最重要的是建立下面几个意识：

```text
1. BlockGroup 是有生命周期的状态对象。
2. 状态转移必须被保护，不能随意修改。
3. ref_count 和 pin_count 决定数据是否能释放或迁移。
4. epoch 用来防止旧 owner 和旧客户端写入。
5. 路由可以缓存，但必须能识别过期。
6. 元数据服务应该是事实来源。
7. 迁移和淘汰都必须有中间态和失败恢复机制。
```

掌握这些之后，再学习一致性、副本、故障恢复和调度，会更容易理解为什么分布式系统设计总是围绕状态、版本和所有权展开。
