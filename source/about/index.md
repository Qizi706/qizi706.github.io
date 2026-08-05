---
title: about
date: 2025-12-29 21:59:55
---

### 我是谁(Who am I)

---

我是周权，就读于中国科学技术大学软件学院，研究生二年级。对底层技术痴迷，喜爱研究 Linux 系统(Arch)，熟悉 C/C++ 语言，目前在国内某大厂实习，工作内容是分布式存储。

Github: [Qizi706](https://github.com/Qizi706)

<br/>
<br/>

### 个人项目

---

#### MIT 6.s081 基于 RISC-V 指令集架构的操作系统内核

时间：2026年2月 - 2026年4月 个人项目

_C, Linux_

**项目描述**：本项目以基于RISC-V指令集架构的微型操作系统xv6 为基础，对其内存管理，进程管理，文件系统，中断处理等模块进行扩展与优化。

**主要工作：**

1. 实现 xv6 独立内核页表与用户页表映射机制，掌握 trampoline、trapframe 与页表切换流程，完善内核访问用户虚拟地址的数据拷贝路径
2. 基于 page fault 实现 lazy allocation 与 copy-on-write fork，维护物理页引用计数，减少 fork 时不必要的物理页复制
3. 扩展 trap 与 syscall 机制，实现 alarm 系统调用，支持用户态定时回调注册与恢复执行上下文
4. 实现非抢占式用户级线程库，支持线程创建、上下文保存/恢复与协作式调度，对比理解 xv6 内核进程调度与上下文切换机制
5. 扩展 xv6 文件系统，支持三级间接索引与软链接；实现 mmap/munmap，支持文件页按需映射与回写

#### CMU15-445 基于C++开发的支持简单 SQL 操作的单机数据库

时间：2025年11月 - 2025年12月 个人项目

_C++, Linux_

**项目描述：**这是一个面向磁盘的数据库管理系统（DBMS），名为 bustub。实现了缓冲池管理，B+ 树数据库索引，SQL 查询的操作执行器，多版本并发控制等。

**主要工作：**

1. 实现线程安全 BufferPoolManager，维护 page_id 到 frame_id 的映射、pin count、dirty flag 与页面换入换出流程
2. 实现 LRU-K 页面替换器，根据页面历史访问时间戳选择 victim frame，并与 Buffer Pool 的 evictable 状态协同工作
3. 实现支持并发访问的 B+Tree 索引，支持搜索、插入、删除、节点 split/merge/redistribution，以及基于叶节点链表的有序迭代器
4. 基于 Volcano Iterator 模型实现查询执行器，统一 Init/Next 接口，支持 Scan、Join、Aggregation、Sort、Limit、Distinct 及增删改算子
5. 实现规则优化器，将索引列等值谓词下的 SeqScan 改写为 IndexScan，并将等值连接条件下的 NestedLoopJoin 改写为 HashJoin
6. 实现基于 MVCC 的事务模块，通过版本链和 undo log 支持快照隔离下的并发读写

### 2026年7月-2026年8月中学习内容

<input type="checkbox" onclick="return false;" /> <sp/> AI Infra 全局认知(2 周)

学习内容：

1. LLM 训练和推理的区别。
2. LLM Serving 的基本链路。
3. prefill 和 decode 的区别。
4. KV Cache 是什么，为什么会成为推理系统瓶颈。
5. 吞吐、延迟、TTFT、TPOT、显存利用率这些指标。
6. AI Infra 的主要模块：模型、推理引擎、调度器、KV Cache、GPU、网络、存储、监控。
实践任务：
7. 跑通一个本地小模型推理。
8. 跑通一次 vLLM 服务。
9. 用不同输入长度、输出长度测试响应时间变化。
阶段产出：
《LLM 推理系统从请求到返回的完整链路》笔记
通过标准：
你能讲清楚一个请求进入 LLM Serving 系统后，经历 tokenizer、prefill、KV Cache、decode、scheduler、返回结果的完整过程。

读物：

**理解 LLM 和 Transformer**

1. [Jay Alammar: The Illustrated Transformer](https://jalammar.github.io/illustrated-transformer/)
2. [Jay Alammar: The Illustrated GPT-2](https://jalammar.github.io/illustrated-gpt2/)

**理解推理和生成**

1. [Hugging Face: How to generate text](https://huggingface.co/blog/how-to-generate)
2. [Hugging Face Transformers 文档：Text generation](https://huggingface.co/docs/transformers/main/en/llm_tutorial)

**理解 KV Cache**

1. [Hugging Face: KV Cache explained](https://huggingface.co/docs/transformers/main/en/cache_explanation)
2. [Hugging Face: Optimizing inference](https://huggingface.co/docs/transformers/main/en/llm_optims)

**理解 LLM Serving 的核心矛盾**

1. [vLLM 官方博客：vLLM: Easy, Fast, and Cheap LLM Serving with PagedAttention](https://blog.vllm.ai/2023/06/20/vllm.html)
2. [vLLM 文档：Paged Attention](https://docs.vllm.ai/en/latest/design/kernel/paged_attention.html)

**理解性能指标**

1. [NVIDIA NIM: LLM Benchmarking Metrics](https://docs.nvidia.com/nim/benchmarking/llm/latest/metrics.html)

读的时候不要追求全懂，只需要能说清楚下面这条链路：

```text
  用户输入 prompt
  -> tokenizer 变成 token
  -> prefill 处理整段 prompt
  -> 生成 KV Cache
  -> decode 每次生成一个新 token
  -> 每生成一个 token 都会更新 KV Cache
  -> serving 系统通过 batching 和调度提高吞吐
  -> KV Cache 占用显存，所以需要 PagedAttention 这类管理机制
```
