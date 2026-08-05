---
title: 分布式基础：RPC 和远程调用
date: 2026-07-07 10:30:00
categories:
  - [分布式]
tags:
  - [分布式]
  - [RPC]
  - [网络]
  - [系统设计]
---

## 背景

学习分布式系统时，一个非常重要的转变是：不能再把函数调用理解成本地调用。

在单机程序里，调用一个函数通常是：

```text
参数已经在本地内存里。
函数要么返回结果，要么抛出异常。
调用成本很低。
失败边界相对清晰。
```

但在分布式系统里，调用另一个模块经常意味着通过网络访问另一台机器上的服务。这时一次“函数调用”会变成：

```text
序列化请求
通过网络发送
远端排队
远端执行
序列化响应
通过网络返回
本地反序列化
```

因此，远程调用不是本地调用。它更慢，也更容易失败。

对训练-推理一体存储和 `KV Cache` 系统来说，RPC 会出现在很多关键路径上：

```text
worker 查询 metadata server。
scheduler 调度 model worker。
cache manager 读取远端 block group。
cache manager 迁移 block group。
worker pin/unpin 某份 KV Cache。
后台任务淘汰或预取 cache。
```

这一篇重点学习第二组基础：`RPC` 和远程调用。

<!--more-->

## 学习目标

这一组基础的目标是理解：

```text
为什么分布式接口都要考虑 timeout、retry 和幂等。
```

需要掌握：

```text
RPC 是什么
请求/响应模型
序列化和反序列化
timeout
retry
幂等
限流
熔断
连接池
```

最关键的一句话是：

```text
远程调用失败，不代表服务端没有执行。
```

这句话是理解 RPC 失败语义的核心。

## RPC 是什么？

`RPC` 是 Remote Procedure Call，远程过程调用。

它的目标是让调用远程服务像调用本地函数一样方便。例如本地代码看起来像：

```text
metadata = get_block_group_metadata(block_group_id)
```

但实际执行时，可能发生了：

```text
1. 客户端把 block_group_id 序列化成请求。
2. 请求通过网络发送到 metadata server。
3. metadata server 查找元数据。
4. metadata server 把结果序列化成响应。
5. 响应通过网络返回客户端。
6. 客户端反序列化得到 metadata。
```

RPC 框架屏蔽了很多细节，但不能消除远程调用的本质问题：

```text
网络可能超时。
请求可能丢失。
响应可能丢失。
服务端可能崩溃。
服务端可能执行成功但客户端不知道。
服务端可能很慢。
客户端可能重试。
重试可能导致重复执行。
```

所以 RPC 的重点不是“怎么像本地调用一样写代码”，而是“知道它绝对不是本地调用”。

## 请求/响应模型

最常见的 RPC 是请求/响应模型：

```text
client -> request -> server
client <- response <- server
```

例如：

```text
get_block_group(block_group_id, epoch)
```

正常路径是：

```text
1. client 发送请求。
2. server 收到请求。
3. server 执行读取。
4. server 返回响应。
5. client 得到结果。
```

但真实系统里，异常路径更多：

```text
client 发不出去。
request 在网络中丢失。
server 收到了，但还没执行就崩溃。
server 执行成功了，但 response 丢了。
server 执行太慢，client 超时。
client 超时后重试，server 收到两次请求。
```

所以设计 RPC 接口时，不能只考虑正常返回，还要考虑调用方不知道服务端到底执行到哪一步。

## 序列化和反序列化

远程调用要跨进程、跨机器传输数据，所以内存里的对象不能直接发送，必须先编码成字节流。

这个过程叫序列化：

```text
object -> bytes
```

接收方再把字节流恢复成对象：

```text
bytes -> object
```

常见序列化方式包括：

```text
JSON
Protocol Buffers
Thrift
FlatBuffers
MessagePack
```

不同方式有不同取舍：

```text
JSON：可读性好，但体积大、解析慢。
Protobuf：体积小、速度快，适合服务间通信。
Thrift：常用于跨语言 RPC。
FlatBuffers：可减少反序列化开销，适合性能敏感场景。
```

在 KV Cache 场景中，一般不会把巨大的 K/V tensor 直接用普通 JSON 传输。RPC 请求里更常传：

```text
block_group_id
location
epoch
token_range
size_bytes
checksum
metadata
```

真正的大块数据可能通过专门的数据通道传输，例如：

```text
RDMA
对象存储
共享内存
文件
GPU Direct
专门的 streaming channel
```

因此要区分两类数据：

```text
控制面数据：元数据、状态、命令，适合 RPC。
数据面数据：大块 KV Cache 内容，通常需要更高效的数据传输方式。
```

这个区分很重要。不要把所有东西都塞进普通 RPC，否则很容易让控制面被大数据传输拖垮。

## 远程调用为什么会失败？

本地函数调用失败时，通常能比较明确地知道发生了什么。

远程调用失败时，最大的问题是：客户端经常不知道服务端是否执行过。

例如：

```text
evict_block_group(bg_1) 超时
```

可能发生了四种情况：

```text
1. 请求没发到服务端。
2. 服务端执行了，但响应丢了。
3. 服务端正在执行，还没返回。
4. 服务端执行失败。
```

从客户端视角看，这些情况可能都表现为：

```text
timeout
```

但它们的后果完全不同。

如果客户端简单重试：

```text
evict_block_group(bg_1)
evict_block_group(bg_1)
```

服务端可能执行两次。对于查询类接口，这通常没问题；但对于修改状态的接口，重复执行可能带来错误。

所以分布式接口设计必须考虑：

```text
这个接口能不能重试？
重复调用是否安全？
如果服务端已经执行成功，客户端重试应该返回什么？
如果请求过期了，服务端是否应该拒绝？
```

## Timeout：超时

远程调用必须设置超时。

没有超时会导致：

```text
请求一直等待。
线程或协程被占用。
连接池被耗尽。
上游请求堆积。
故障扩散到其他模块。
```

例如 worker 读取远端 block group：

```text
get_block_group(block_group_id, epoch)
```

如果远端节点卡住，而本地没有 timeout，那么 decode 请求会一直等待，进而拖慢整个 batch。

### 超时时间怎么设置？

超时时间不能随便写一个固定值，要结合调用路径和业务目标。

需要考虑：

```text
这个调用在不在在线请求关键路径上？
调用失败后是否可以重试？
重试是否会造成更大延迟？
下游服务正常 P99 是多少？
上游请求整体超时时间是多少？
```

一个基本原则是：

```text
下游 timeout 不能超过上游剩余时间。
```

例如一次推理请求整体最多允许 2 秒，而某个远程 cache 读取已经消耗了 1.8 秒，那么这个 RPC 不应该再设置 1 秒超时。

### 超时不是取消

客户端 timeout 只代表客户端不等了，不代表服务端停止执行。

这点非常重要。

例如：

```text
migrate(block_group_id=bg_1, src=A, dst=B, epoch=10)
```

客户端 500ms 后超时，但服务端可能还在迁移。客户端如果立刻发起新的迁移任务，就可能和旧任务冲突。

因此服务端需要能识别同一个操作，客户端也需要能查询操作状态。

## Retry：重试

重试可以提高成功率，但也可能放大故障。

适合重试的情况：

```text
临时网络抖动。
连接被对端关闭。
服务端短暂过载。
请求没有明显副作用。
接口是幂等的。
```

不适合盲目重试的情况：

```text
非幂等写操作。
下游已经严重过载。
上游剩余时间不足。
请求体很大，重试成本高。
重试会触发重复迁移或重复释放。
```

### 重试风暴

如果大量客户端同时发现下游变慢，然后一起重试，就会形成重试风暴。

这会让本来已经变慢的服务更慢。

常见缓解方式：

```text
限制最大重试次数。
指数退避。
增加随机抖动 jitter。
只对部分错误重试。
使用重试预算 retry budget。
下游过载时快速失败。
```

例如：

```text
第一次失败后等待 10ms。
第二次失败后等待 20ms。
第三次失败后等待 40ms。
每次等待时间加一点随机抖动。
```

### 重试要带请求 ID

重试时最好带上唯一请求 ID 或操作 ID：

```text
operation_id = "migrate-bg_1-epoch_10-A-to-B"
```

服务端可以用它识别重复请求：

```text
如果操作已经成功，直接返回成功结果。
如果操作正在执行，返回 in_progress 或等待。
如果操作失败，返回失败原因。
```

这比每次都创建一个新操作安全得多。

## 幂等

幂等的意思是：同一个操作执行一次和执行多次，最终效果相同。

例如：

```text
set_state(bg_1, EVICTED)
```

执行多次结果仍然是 `EVICTED`。

但下面这种操作不是天然幂等：

```text
ref_count += 1
```

如果客户端重试两次，`ref_count` 就可能多加一次。

### 查询类接口

查询类接口通常天然幂等：

```text
get_metadata(block_group_id)
get_location(block_group_id)
get_state(block_group_id)
```

重复查询不会改变系统状态。

### 写入类接口

写入类接口需要特别设计。

例如淘汰接口不应该只写成：

```text
evict(block_group_id)
```

更好的形式是：

```text
evict(block_group_id, epoch, operation_id)
```

这样服务端可以判断：

```text
epoch 是否仍然是当前版本？
operation_id 是否已经执行过？
block group 当前状态是否允许 evict？
如果已经是 EVICTED，是否可以直接返回成功？
```

### pin/unpin 的幂等设计

`pin` 和 `unpin` 很容易出错。

如果接口是：

```text
pin(block_group_id)
unpin(block_group_id)
```

那么重试可能导致计数错误。

更好的方式是带上 `request_id`：

```text
pin(block_group_id, request_id)
unpin(block_group_id, request_id)
```

服务端维护：

```text
block_group_id -> pinned_request_set
```

这样：

```text
同一个 request_id pin 多次，只算一次。
同一个 request_id unpin 多次，只释放一次。
```

这种设计比简单的 `pin_count += 1`、`pin_count -= 1` 更适合分布式重试场景。

### migrate 的幂等设计

迁移接口也需要幂等：

```text
migrate(block_group_id, src, dst, epoch, operation_id)
```

服务端处理时应该检查：

```text
block_group_id 是否存在？
epoch 是否匹配？
当前 location 是否仍然是 src？
目标是否已经是 dst？
operation_id 是否已经执行过？
当前状态是否允许迁移？
```

如果客户端重试同一个 `operation_id`，服务端不应该启动两次迁移，而应该返回同一个操作的状态。

## 限流

限流是为了保护系统，避免请求量超过服务能力。

常见限流维度：

```text
按服务限流。
按用户或租户限流。
按接口限流。
按 block group 迁移流量限流。
按远端节点限流。
```

在 KV Cache 系统里，限流尤其重要，因为某些操作很重：

```text
远端读取大 block group。
跨节点迁移 cache。
从 SSD 拉取冷数据。
批量淘汰和释放。
```

如果不限制，后台迁移任务可能抢占在线 decode 的网络带宽和存储带宽。

### 常见限流算法

常见算法包括：

```text
计数器：固定窗口内限制请求数。
滑动窗口：比固定窗口更平滑。
漏桶：以固定速率处理请求。
令牌桶：允许一定突发，但整体速率受限。
```

对于在线服务，令牌桶很常见：

```text
系统按固定速率生成 token。
请求要先拿到 token 才能执行。
token 桶允许短时间突发。
桶空了就等待或拒绝。
```

KV Cache 迁移可以设计独立的 token：

```text
migration_bytes_token
remote_read_qps_token
ssd_read_iops_token
```

这样可以限制后台任务，不让它们影响在线请求。

## 熔断

熔断是为了避免持续调用已经异常的下游。

如果某个服务持续超时，客户端继续打请求只会浪费资源，并加重下游压力。

熔断器通常有三种状态：

```text
CLOSED：正常调用。
OPEN：熔断，直接失败。
HALF_OPEN：半开，放少量请求探测恢复情况。
```

例如 remote cache manager 连续超时，客户端可以进入 OPEN 状态：

```text
后续请求不再访问这个远端节点。
调度器把请求转移到其他节点。
必要时走重新计算或降级路径。
```

一段时间后进入 HALF_OPEN：

```text
只放少量请求访问远端。
如果成功率恢复，再切回 CLOSED。
如果仍然失败，继续 OPEN。
```

熔断的目标不是解决下游故障，而是限制故障扩散。

## 连接池

RPC 通常会复用连接，而不是每次请求都新建连接。

连接池的作用是：

```text
减少 TCP 建连成本。
减少 TLS 握手成本。
控制并发连接数量。
复用已有连接提高吞吐。
```

但连接池也可能成为瓶颈。

需要关注：

```text
连接池大小。
每条连接上的并发请求数。
连接是否健康。
空闲连接是否回收。
连接上的请求是否出现队头阻塞。
```

例如某个 worker 到 metadata server 的连接池太小，所有请求都排队等连接，即使 metadata server 本身很空，P99 也会变差。

### 队头阻塞

队头阻塞是指前面的慢请求挡住后面的请求。

如果多个 RPC 共用一条连接，而协议或实现不能很好地并发处理响应，就可能出现：

```text
请求 A 很慢。
请求 B 本来很快。
但 B 排在 A 后面，必须等待。
```

这会显著影响尾延迟。

所以性能敏感服务要关注连接池、协议多路复用和请求排队情况。

## 控制面和数据面

在 KV Cache 系统里，需要区分控制面和数据面。

控制面负责：

```text
元数据查询。
状态更新。
调度命令。
迁移任务创建。
pin/unpin。
evict。
```

数据面负责：

```text
真实 KV Cache 数据传输。
大块 tensor 复制。
GPU HBM 和 CPU Memory 之间搬运。
跨节点传输 block group。
SSD 读写。
```

RPC 更适合控制面。数据面如果也完全依赖普通 RPC，很容易出现：

```text
大响应占满连接。
控制请求被大数据传输阻塞。
序列化开销过高。
内存拷贝过多。
P99 变差。
```

所以一种常见设计是：

```text
RPC 负责发命令和返回元数据。
数据传输走专门的数据通道。
RPC response 里返回数据位置、token、offset、checksum。
客户端再通过数据通道拉取或写入。
```

例如：

```text
prepare_get_block_group(block_group_id, epoch)
-> 返回 remote_addr、size、checksum、transfer_token

transfer_data(remote_addr, size, transfer_token)
-> 传输真实 KV 数据
```

这样可以减少控制面被大数据传输拖慢的风险。

## KV Cache 接口设计示例

下面用几个接口把前面的概念串起来。

### 查询元数据

```text
get_metadata(block_group_id)
```

特点：

```text
查询类接口，天然幂等。
需要 timeout。
可以短重试。
客户端可以缓存结果，但要关注 epoch。
```

返回值可以包括：

```text
block_group_id
location
state
epoch
size_bytes
token_range
```

### 读取 block group

```text
get_block_group(block_group_id, epoch, request_id)
```

需要考虑：

```text
epoch 不匹配时拒绝或返回最新元数据。
block group 正在 MIGRATING 时如何处理。
远端读取是否超时。
是否允许重试。
大数据是否走数据面传输。
```

如果 block group 当前状态是 `MIGRATING_OUT`，服务端可以选择：

```text
等待迁移完成。
返回 RETRY_LATER。
返回新 location。
拒绝读取并要求客户端刷新元数据。
```

### 淘汰 block group

```text
evict(block_group_id, epoch, operation_id)
```

服务端应该检查：

```text
epoch 是否匹配。
pin_count 是否为 0。
ref_count 是否为 0。
当前 state 是否允许 evict。
operation_id 是否已经执行过。
```

如果已经被淘汰：

```text
state == EVICTED
```

那么重复调用可以直接返回成功。这就是幂等。

### 迁移 block group

```text
migrate(block_group_id, src, dst, epoch, operation_id)
```

这个接口要特别小心，因为迁移是长操作。

可以把它拆成两类接口：

```text
start_migrate(...)
get_migrate_status(operation_id)
```

这样客户端超时后，不必盲目重试迁移，而是先查询这个 `operation_id` 的状态。

可能的状态：

```text
PENDING
RUNNING
SUCCEEDED
FAILED
CANCELLED
```

### pin/unpin

```text
pin(block_group_id, request_id, epoch)
unpin(block_group_id, request_id, epoch)
```

服务端可以维护：

```text
pinned_request_set
```

这样 pin 和 unpin 都可以做到幂等：

```text
同一个 request_id 重复 pin，不重复增加 pin_count。
同一个 request_id 重复 unpin，不重复减少 pin_count。
```

这对超时重试非常重要。

## 常见错误设计

### 把远程调用当成本地调用

错误做法：

```text
result = remote_call()
use(result)
```

但没有考虑：

```text
timeout 怎么办？
失败是否重试？
重试是否幂等？
下游过载怎么办？
调用是否会卡住线程？
```

### 写接口不带版本

错误做法：

```text
evict(block_group_id)
```

问题是服务端不知道客户端看到的是不是旧状态。

更好的方式：

```text
evict(block_group_id, epoch, operation_id)
```

### pin/unpin 只操作计数

错误做法：

```text
pin_count += 1
pin_count -= 1
```

问题是请求超时重试会导致计数不准。

更好的方式：

```text
pin(block_group_id, request_id)
unpin(block_group_id, request_id)
```

由服务端维护请求集合，再计算 pin_count。

### 大数据走普通 RPC

错误做法：

```text
get_block_group(...)
-> response 里直接塞几百 MB KV Cache
```

问题是：

```text
序列化开销大。
内存拷贝多。
控制面连接被占满。
小请求被大响应阻塞。
P99 变差。
```

更好的方式是控制面和数据面分离。

## 如何排查 RPC 问题？

RPC 问题通常需要看指标和日志。

### 指标

常见指标包括：

```text
rpc_qps
rpc_error_rate
rpc_timeout_count
rpc_retry_count
rpc_latency_p50
rpc_latency_p99
rpc_inflight_requests
rpc_queue_length
connection_pool_in_use
connection_pool_wait_time
circuit_breaker_state
rate_limited_count
```

KV Cache 相关 RPC 还可以看：

```text
get_metadata_latency
get_block_group_latency
migrate_start_latency
migrate_status_latency
evict_latency
pin_latency
unpin_latency
remote_read_timeout_count
```

### 日志

日志里最好带上：

```text
request_id
operation_id
block_group_id
src_node
dst_node
epoch
rpc_method
timeout_ms
retry_count
error_code
latency_ms
```

如果没有这些字段，排查问题时很难判断：

```text
这是第一次请求还是重试？
服务端有没有执行过？
客户端看到的是哪个 epoch？
迁移操作是否重复提交？
超时发生在哪个节点？
```

## 面向 KV Cache 的 RPC 检查清单

看组内代码或设计文档时，可以用下面的问题检查：

```text
1. 这个远程调用是否在在线请求关键路径上？
2. 是否设置了 timeout？
3. timeout 是否小于上游剩余时间？
4. 失败后是否 retry？
5. retry 是否有最大次数、退避和 jitter？
6. 被 retry 的接口是否幂等？
7. 写接口是否带 epoch/version？
8. 长操作是否有 operation_id？
9. pin/unpin 是否按 request_id 幂等？
10. 大块 KV 数据是否和控制面 RPC 分离？
11. 是否有限流保护下游？
12. 下游连续失败时是否熔断？
13. 连接池是否可能成为瓶颈？
14. 日志里是否包含 request_id、operation_id、block_group_id 和 epoch？
```

## 推荐学习顺序

这一组基础可以按下面顺序学：

```text
1. RPC 是什么：理解远程调用和本地调用的区别。
2. 请求/响应模型：理解正常路径和异常路径。
3. 序列化：理解对象如何变成网络字节流。
4. timeout：理解为什么不能无限等待。
5. retry：理解为什么重试既有用也危险。
6. 幂等：理解为什么写接口要能承受重复请求。
7. operation_id：理解长操作如何去重和查询状态。
8. 限流：理解如何保护下游。
9. 熔断：理解如何限制故障扩散。
10. 连接池：理解 RPC 并发和排队。
11. 控制面/数据面分离：理解大块 KV 数据为什么不适合普通 RPC。
12. 结合 KV Cache 设计 evict/migrate/pin/unpin 接口。
```

最后一步最重要。不要只停留在 RPC 框架怎么用，而是要能设计出可靠的接口：

```text
evict(block_group_id, epoch, operation_id)
migrate(block_group_id, src, dst, epoch, operation_id)
pin(block_group_id, request_id, epoch)
unpin(block_group_id, request_id, epoch)
```

然后逐个回答：

```text
这个接口能不能重试？
重复请求会不会改变结果？
客户端超时后服务端是否可能还在执行？
服务端如何识别重复操作？
旧 epoch 的请求是否会被拒绝？
失败后客户端应该查状态、重试还是刷新元数据？
```

## 总结

RPC 是分布式系统里最基础、也最容易被低估的一层。

它看起来像函数调用，但本质上是跨网络、跨进程、跨故障边界的通信。

对 KV Cache 和 Block Group 管理来说，RPC 设计的重点不是“能调通”，而是：

```text
1. 每个远程调用都必须有 timeout。
2. 不是所有失败都能安全 retry。
3. 能 retry 的接口必须尽量幂等。
4. 写接口要带 epoch/version，防止旧状态写入。
5. 长操作要带 operation_id，避免重复执行。
6. pin/unpin 要按 request_id 去重，避免计数错乱。
7. 大块 KV 数据最好和控制面 RPC 分离。
8. 限流和熔断是保护系统的必要机制。
```

掌握这些之后，再学习元数据、一致性、故障恢复和调度时，会更容易理解为什么分布式系统不能只写正常路径。
