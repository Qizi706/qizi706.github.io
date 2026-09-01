---
title: '现代 C++ 长期学习计划：从工程熟练到语言专家'
description: '结合分布式缓存工作场景，为自己制定一条三年现代 C++ 学习路线：系统掌握语言语义、标准库、模板、并发内存模型、编译链接、ABI、性能工具和标准阅读，并用实验、源码、文章与季度验收持续推进。'
pubDate: '2026-09-02T20:00:00+08:00'
categories:
  - 'C/C++'
tags:
  - 'C++特性'
  - 'C++工程'
  - '学习路线'
draft: false
mathjax: false
---

## 背景：这次要学习的是语言本身

我当前的工作内容与分布式缓存有关，日常会接触异步请求、对象生命周期、并发访问、内存分配、RPC、性能优化和故障处理。这些问题都能帮助我练习 `C++`，但我的目标不只是“掌握写一个分布式缓存所需要的 C++”。

我希望建立一套完整、稳定、能够迁移到任何领域的现代 `C++` 知识体系：

```text
语言语义：准确理解一段 C++ 代码的含义
标准库：理解组件的契约、复杂度与失效规则
泛型编程：设计约束清晰、可维护的模板接口
并发模型：证明线程之间为何能够观察到某些写入
编译实现：理解源码怎样经过编译、链接形成程序
工程验证：用测试、Sanitizer、调试器和 Profile 验证判断
标准演进：能够阅读标准条款、缺陷报告和语言提案
```

分布式缓存是实践场，不是知识边界。这份计划的最终目标，是从一个能够熟练使用 `C++` 的工程师，成长为能够解释、验证和教授语言规则的 `C++` 专家。

## 目标边界

### 标准范围

学习范围覆盖 `C++11` 到 `C++23`：

- 理解 `C++11` 以来现代语言机制为什么出现，以及它们替代了什么旧写法；
- 以 `C++20` 建立主体知识体系；
- 掌握 `C++23` 中已经获得工具链支持、对工程有实际价值的能力；
- 跟踪 `C++26`，但不把尚未稳定或尚未广泛实现的特性放到主线里；
- 能够阅读和维护 `C++03`、`C++11` 风格的历史代码，并安全地现代化。

截至制定计划时，`C++23` 已经发布，`C++26` 仍处于标准化进程中，具体状态以 [ISO C++ Current Status](https://isocpp.org/std/status) 为准。

### “掌握”分为五级

以后不再用“我看过了”表示完成。每个知识点都按下面五级记录：

```text
L1 识别：看到概念时知道它解决什么问题。
L2 使用：能在普通业务代码中正确使用。
L3 推理：不运行代码也能推导主要语义和边界。
L4 验证：能用标准条款、实验和工具证明结论。
L5 教授：能写成文章，解释反例，并回答进一步追问。
```

主干知识至少达到 `L4`，高频核心知识达到 `L5`，才能计入最终目标。

### 三个阶段目标

#### 阶段 A：可靠的现代 C++ 工程师

能够稳定写出所有权明确、异常安全、没有明显未定义行为的代码，熟练使用标准库和工程工具。

#### 阶段 B：高级 C++ 工程师

能够分析生命周期、重载、模板、并发同步、ODR、ABI 和性能成本，能够设计长期维护的公共接口。

#### 阶段 C：接近语言专家

能够判断争议代码属于良定义、未定义、未指定、实现定义还是非良构；能够查询标准条款、比较编译器行为、阅读标准库实现并构造最小复现。

“完全掌握”不是记住所有标准库 API，也不是会写最复杂的模板。真正的标准是：面对陌生问题时，有一套可靠的方法得到正确结论。

## 学习方法：解释、预测、验证、输出

只读书会产生熟悉感，只写项目又容易留下语义盲区。每个主题都执行同一个闭环。

### 第一步：建立解释模型

先用教材或高质量文章理解问题背景，再用自己的话回答：

```text
这个机制解决什么问题？
它的适用条件是什么？
语言保证了什么？
实现可以自由决定什么？
最常见的错误是什么？
```

### 第二步：在运行前预测

为主题编写最小代码，编译之前先记录：

- 是否能够通过编译；
- 选择哪个重载；
- 推导出的完整类型；
- 构造、复制、移动和析构发生几次；
- 是否存在未定义行为；
- 不同优化级别下哪些结论不能改变。

预测错误比“运行后看懂输出”更有学习价值，因为错误能够暴露心智模型中的缺口。

### 第三步：多层验证

按问题需要使用不同工具：

```text
编译器诊断              -> 语法、类型和约束
static_assert / concepts -> 编译期性质
GCC + Clang              -> 发现实现差异和错误假设
Clang AST                -> 名字查找、隐式转换和实例化
Compiler Explorer        -> 汇编与优化结果
ASan / UBSan / TSan      -> 内存、未定义行为和数据竞争
gdb / lldb               -> 运行时状态
perf / heap profiler     -> 时间、分配和缓存成本
标准草案                 -> 语言语义的最终依据
```

[C++ 标准草案](https://eel.is/c++draft/)用于解决精确语义问题；[C++ Core Guidelines](https://isocpp.github.io/CppCoreGuidelines/CppCoreGuidelines)用于检查接口、资源管理、类型安全和并发实践。二者用途不同，不能互相代替。

### 第四步：形成永久产物

每个主题至少留下三种产物：

1. 一组可重复运行的最小实验；
2. 一张知识卡片，记录规则、反例、标准条款和工程场景；
3. 一篇阶段总结或对已有文章的修订。

计划建立一个独立的 `cpp-semantics-lab`，而不是把所有实验混在业务代码中：

```text
cpp-semantics-lab/
  initialization/
  lifetime/
  value-categories/
  overload-resolution/
  templates/
  exceptions/
  containers/
  atomics/
  odr/
  abi/
  undefined-behavior/
```

每个实验统一记录：

```text
问题：我想验证什么？
预测：编译和运行结果应该是什么？
结果：GCC、Clang 和不同标准版本的实际表现。
依据：cppreference 页面、标准条款或编译器文档。
结论：哪些是标准保证，哪些是实现细节？
应用：它会在哪类真实代码中出现？
```

## 三年总路线

三年只是建立完整体系的第一个周期，不代表三年后停止学习。每年解决一个层次的问题：

```text
第一年：准确理解源码
第二年：理解程序如何实现和运行
第三年：理解语言如何定义和演进
```

## 第一年：语言语义与标准库

第一年的目标是消除“会写但解释不清”的部分。年底时，我应该能够对普通单线程代码进行逐表达式的类型、生命周期和异常安全分析。

### 第一季度：类型、初始化、资源管理与值类别

#### 第 1 月：类型系统与初始化

学习内容：

- 基础类型、整数提升、常用算术转换；
- `const`、引用、指针、数组和函数类型；
- `auto`、`decltype`、`decltype(auto)`；
- 直接初始化、复制初始化、列表初始化、聚合初始化；
- narrowing conversion；
- 作用域、名字隐藏、namespace 和 using declaration。

验收任务：

- 为 30 个声明和初始化表达式写出完整类型；
- 比较 `{}`、`()`、`=` 初始化的候选函数差异；
- 写一篇“C++ 初始化模型”文章，而不是只列语法。

#### 第 2 月：类、RAII 与特殊成员函数

学习内容：

- 类不变量、构造、析构、成员初始化顺序；
- copy/move constructor 与 assignment；
- special member function 的隐式生成、删除和抑制；
- Rule of Zero、Three、Five；
- RAII、所有权和借用关系；
- `unique_ptr`、`shared_ptr`、`weak_ptr` 的精确语义。

验收任务：

- 实现一个文件描述符的 `unique_resource`；
- 解释自定义析构函数为什么可能影响移动操作生成；
- 分析 `shared_ptr` control block、aliasing constructor 和循环引用。

#### 第 3 月：值类别、移动与完美转发

学习内容：

- lvalue、xvalue、prvalue；
- temporary materialization；
- 引用折叠与 forwarding reference；
- `std::move`、`std::forward`；
- guaranteed copy elision；
- moved-from object 的有效但未指定状态；
- `noexcept` 对标准容器搬迁策略的影响。

已有的[《C++ 完美转发》](/blog/perfect-forwarding/)将作为第一篇回炉文章：修正“有名字就是左值”这类便于入门但不够精确的表述，补齐表达式类别、模板推导和引用折叠的严格模型。

第一季度出口标准：看到一段涉及对象传递的代码，能够准确区分变量类型、表达式类别、对象身份和生命周期。

### 第二季度：生命周期、转换、重载与对象模型

#### 第 4 月：对象生命周期

学习内容：

- storage、object、lifetime 的区别；
- 自动、静态、线程和动态存储期；
- 完整对象、子对象、基类子对象；
- 临时对象与生命周期延长；
- placement new、union active member；
- implicit-lifetime type；
- 指针、引用、迭代器失效。

验收任务是在 50 个短例子中判断引用是否悬空，并为每个结论写出原因，而不是只看 Sanitizer 是否报错。

#### 第 5 月：隐式转换与重载决议

学习内容：

- 标准转换和用户定义转换；
- viable function 与 best viable function；
- cv/ref qualification；
- conversion constructor 和 conversion operator；
- ADL、hidden friend；
- 默认参数、初始化列表和 operator rewriting。

验收任务是手工写出 20 组重载决议过程，并与 Clang AST 对照。

#### 第 6 月：继承、多态与对象布局

学习内容：

- overriding、overloading、name hiding；
- 虚析构、对象切片、RTTI；
- 多继承和虚继承；
- 构造、析构期间的动态分派；
- standard-layout、trivial、trivially copyable；
- vtable、padding 和 ABI 作为常见实现，而不是语言保证；
- dynamic polymorphism、static polymorphism 和 type erasure 的选择。

第二季度出口标准：能够独立审查异步回调、`string_view`、Lambda 捕获和容器扩容后的生命周期问题。

### 第三季度：模板、Concepts 与编译期编程

#### 第 7 月：模板推导与名字查找

学习内容：

- function/class/variable template；
- template argument deduction；
- dependent name；
- `typename` 与 `template` disambiguator；
- two-phase lookup；
- specialization、partial specialization；
- CTAD 和 deduction guide。

#### 第 8 月：SFINAE、type traits 与参数包

学习内容：

- substitution failure；
- `enable_if`；
- detection idiom；
- type traits；
- parameter pack；
- fold expression；
- tag dispatch；
- 模板错误信息和编译时间控制。

#### 第 9 月：Concepts 与常量求值

学习内容：

- requires expression；
- constraints normalization 与 subsumption；
- constrained overload；
- 语法约束与语义约束；
- `constexpr`、`consteval`、`constinit`；
- compile-time 与 runtime 边界。

本季度配合阅读《C++ Templates: The Complete Guide》第 2 版，但所有重要结论都必须落到实验和标准条款。出口任务是设计一个小型泛型库：约束明确、错误信息可读、没有不必要的模板技巧。

### 第四季度：标准库契约、错误模型与分配器

#### 第 10 月：容器、迭代器与算法

学习内容：

- sequence、associative、unordered container；
- 容器复杂度保证；
- 引用、指针和迭代器失效；
- iterator category 与 iterator concept；
- algorithm 的前置条件和复杂度；
- comparator 必须满足的关系。

#### 第 11 月：Ranges 与 vocabulary types

学习内容：

- view 的惰性求值和所有权；
- borrowed range 与 dangling；
- projection、CPO；
- `span`、`string_view`；
- `optional`、`variant`、`any`、`expected`；
- `tuple`、结构化绑定、`chrono`、`filesystem`、`format`。

#### 第 12 月：异常安全与 allocator

学习内容：

- 栈展开与异常对象；
- basic、strong、nothrow guarantee；
- commit/rollback 设计；
- destructor 与 `noexcept`；
- `allocator_traits`；
- allocator propagation；
- `std::pmr`；
- 异常、错误码和 `expected` 的边界。

第一年综合验收：实现一个简化但正确的 `vector` 或 `small_vector`，明确其对象生命周期、allocator 行为、迭代器失效规则和异常保证。

## 第二年：并发、工具链、实现与性能

第二年的目标是从“源码语义”进入“程序实现”。年底时，我应该能够解释并验证并发可见性、二进制形成过程和关键性能成本。

### 第五季度：C++ 并发内存模型

#### 第 13 月：线程同步基础

- thread、`jthread`、mutex、shared mutex；
- condition variable 的谓词模式；
- spurious wakeup；
- future、promise、latch、barrier、semaphore；
- shutdown、取消和异常传播。

#### 第 14 月：原子操作与内存序

- data race 的严格定义；
- sequenced-before、synchronizes-with、happens-before；
- modification order；
- relaxed、acquire、release、acq_rel、seq_cst；
- release sequence、fence、atomic RMW。

#### 第 15 月：并发结构与对象回收

- deadlock、livelock、starvation；
- lock-free、wait-free、obstruction-free；
- ABA；
- false sharing；
- hazard pointer、epoch reclamation 的基本思想；
- 对并发结构做线性化点分析。

出口任务：实现有界阻塞队列和一个教学用途的 SPSC 队列。测试既要运行 TSan，也要写出同步关系和正确性说明。TSan 没有报告不等于算法已经被证明正确。

### 第六季度：编译、链接、ODR 与 ABI

#### 第 16 月：翻译单元与名字可见性

- preprocessing；
- declaration 与 definition；
- translation unit；
- internal/external/module linkage；
- inline function/variable；
- ODR；
- 模板实例化和显式实例化。

#### 第 17 月：链接与二进制

- object file、section、symbol、relocation；
- static/dynamic library；
- name mangling；
- symbol visibility；
- weak symbol；
- vtable、RTTI、exception ABI；
- calling convention 和二进制兼容。

#### 第 18 月：构建系统与 Modules

- target-based CMake；
- compile commands、生成器和依赖传播；
- Debug、Release、LTO；
- 安装、导出和包配置；
- Modules 的语义、构建图和现实支持情况。

已有的[《C++ 项目构建工具学习路线》](/blog/cpp-build-tools/)作为入口，但这一季度要继续深入到编译器和链接器，而不是停在命令用法。

出口任务：从源文件开始，使用 `nm`、`readelf`、`objdump` 或对应平台工具解释一个带模板、虚函数、异常和动态库的程序如何形成。

### 第七季度：阅读标准库实现

#### 第 19 月：基础容器与所有权组件

选择 libc++ 或 libstdc++ 作为主线，跟踪：

- `vector`；
- `string`；
- `unique_ptr`；
- `shared_ptr`；
- allocator traits。

#### 第 20 月：高层抽象

继续阅读：

- `optional`；
- `variant`；
- `function`；
- Ranges 中一个 view；
- coroutine support 中的基础类型。

#### 第 21 月：复现与对照

为学习用途实现简化版：

```text
unique_resource
small_vector
optional
function_ref 或 type-erased callable
generator 或 task
```

出口不是实现得比标准库好，而是能解释标准库为什么需要大量 traits、压缩存储、异常分支和兼容处理。

### 第八季度：性能模型与工具

#### 第 22 月：硬件与运行时成本

- cache hierarchy、cache line、TLB；
- branch prediction；
- alignment、padding、false sharing；
- allocation、fragmentation；
- NUMA；
- syscall、page fault、context switch。

#### 第 23 月：测量方法

- 正确编写 benchmark；
- warmup、重复次数、噪声和置信度；
- CPU profile、heap profile、lock profile；
- 汇编和编译器优化报告；
- 避免 dead-code elimination；
- 区分吞吐、平均延迟和尾延迟。

#### 第 24 月：综合性能分析

选择工作中的一条非敏感真实路径，只使用允许保留的数据和代码，完成一次从假设、指标、Profile、修改到回归验证的闭环。输出必须说明：

```text
瓶颈在哪里？
证据是什么？
语言抽象产生了什么成本？
优化是否改变了语义或接口？
收益能否在不同负载下重复？
```

## 第三年：标准、编译器与专家输出

第三年的目标是具备处理语言边界问题的能力，不再完全依赖二手解释。

### 第九季度：学习阅读标准

#### 第 25 月：标准语言与行为分类

- normative wording、note、example；
- shall、ill-formed、IFNDR；
- undefined、unspecified、implementation-defined；
- requirement、precondition、postcondition；
- 如何从 cppreference 定位到标准章节。

#### 第 26 月：核心语言条款

围绕已经学过的主题阅读标准，而不是从第一页顺序背诵：

```text
basic
dcl
expr
class
over
temp
except
```

#### 第 27 月：标准库措辞与缺陷报告

- 阅读一个容器和一个并发组件的规范；
- 理解 Mandates、Constraints、Expects、Effects；
- 跟踪相关 Defect Report；
- 比较不同标准版本措辞变化。

出口任务：完成 20 个争议代码案例。每个案例必须给出行为分类、推导过程、标准依据和编译器结果。

### 第十季度：现代 C++ 演进史

#### 第 28 月：C++11 与 C++14

重点理解移动语义、Lambda、智能指针、原子、类型推导和通用 Lambda解决了哪些历史问题。

#### 第 29 月：C++17 与 C++20

重点理解 guaranteed copy elision、vocabulary types、fold expression、Ranges、Concepts、coroutine、`span` 和 `jthread` 对编程模型的改变。

#### 第 30 月：C++23 与 C++26 跟踪

- 掌握项目工具链已经支持的 C++23 能力；
- 使用 feature-test macro，而不是假设编译器已经完整支持；
- 每月选择一份与当前主线有关的 WG21 提案；
- 区分已经发布、已经进入草案、仅有提案和实验实现。

出口任务：选择一个现代特性，从动机、提案、规范措辞、编译器实现和工程使用五个角度写专题文章。

### 第十一季度：编译器视角

#### 第 31 月：Clang AST 与语义分析

- AST dump；
- implicit cast；
- overload candidate；
- template instantiation；
- synthesized special member function；
- coroutine transformation。

#### 第 32 月：IR 与代码生成

- LLVM IR 基础；
- 对象布局、虚调用和异常展开；
- inlining、devirtualization、vectorization；
- optimization remark；
- source、AST、IR、assembly 之间的对应。

#### 第 33 月：最小复现与编译器问题

从真实问题中提炼最小代码：

- 删除业务依赖；
- 保留触发条件；
- 比较多个版本和编译器；
- 检查标准支持状态和已有 issue；
- 区分代码错误、扩展行为、实现限制和编译器缺陷。

出口任务：完成至少一个高质量编译器或标准库问题分析；不强求真的找到编译器 bug，但要求达到可以提交 issue 的证据质量。

### 第十二季度：综合设计、贡献与教学

#### 第 34 月：公共库设计

设计一个小型、可复用的现代 C++ 库，要求包含：

- 清晰的 ownership 与 lifetime；
- Concepts 或明确的类型要求；
- 错误模型和异常保证；
- ABI 与版本策略；
- 单元测试、属性测试、Sanitizer 和 benchmark；
- 完整文档和反例。

#### 第 35 月：外部评审与贡献

- 请高级工程师进行设计评审；
- 为成熟开源项目阅读 issue 和 pull request；
- 尝试文档、测试或小型修复贡献；
- 根据评审意见修订自己的知识模型。

#### 第 36 月：综合答辩

最终不以考试分数作为结束，而以一组公开、可复核的能力证明作为验收：

- 一套系统化语言笔记；
- 一个可重复运行的语义实验仓库；
- 一组现代 C++ 专题文章；
- 一份标准库源码阅读报告；
- 一个并发正确性说明；
- 一个编译链接与 ABI 分析；
- 一个经过评审的小型公共库；
- 一次 60–90 分钟的完整技术分享。

## 前十二周启动计划

三年计划最终要从本周开始。第一个季度按下面的节奏执行：

| 周次     | 主题                  | 必须完成的产物                                   |
| -------- | --------------------- | ------------------------------------------------ |
| 第 1 周  | 建立基线与实验仓库    | GCC/Clang、C++20/23、警告、Sanitizer、CTest 配置 |
| 第 2 周  | cv、引用、指针、数组  | 20 个类型推导实验和知识卡片                      |
| 第 3 周  | `auto`、`decltype`    | 20 个推导案例，解释每条规则                      |
| 第 4 周  | 初始化体系            | `{}`、`()`、`=`、initializer_list 对照文章       |
| 第 5 周  | 构造、析构与成员顺序  | 构造析构跟踪实验                                 |
| 第 6 周  | 特殊成员函数          | Rule of Zero/Five 条件矩阵                       |
| 第 7 周  | 表达式和值类别        | lvalue/xvalue/prvalue 分类实验                   |
| 第 8 周  | 移动、复制消除        | 构造次数预测与多标准版本对照                     |
| 第 9 周  | 转发引用与引用折叠    | 重写完美转发文章                                 |
| 第 10 周 | RAII 与智能指针       | `unique_resource` 实现和异常测试                 |
| 第 11 周 | 异常安全与 `noexcept` | 为一个容器操作写出强保证分析                     |
| 第 12 周 | 第一轮复盘            | 闭卷推导、季度文章、下季度缺口清单               |

如果某周工作繁忙，可以顺延，但不能用“阅读完成”代替产物，也不能同时开启多个没有收尾的主题。

## 固定执行节奏

### 每周 8–12 小时

```text
2 小时：教材和主题导读
2 小时：cppreference 与标准条款
3 小时：最小实验和工具验证
2 小时：标准库源码或工作代码复盘
1 小时：知识卡片、文章或技术分享
```

如果一周只有 5 小时，优先保留“实验、验证、输出”，减少材料阅读量。

### 每月四步

```text
第 1 周：建立主题地图
第 2 周：掌握正常用法
第 3 周：研究边界、反例和实现
第 4 周：综合实现、文章与闭卷验收
```

### 每季度固定交付

- 30–50 个最小语义实验；
- 1 篇完整专题文章；
- 1 份源码阅读记录；
- 1 个小型实现；
- 1 次不看资料的口头讲解；
- 1 份知识分级表，标记哪些达到 `L3/L4/L5`。

每隔 `1、7、30、90` 天回看核心知识卡片。复习重点不是重新阅读，而是重新预测案例、解释反例。

## 如何使用分布式缓存工作场景

工作内容不是学习边界，但可以为抽象规则提供最严格的现实检验。

| C++ 主题               | 分布式缓存中的练习场                   | 必须追问的问题                     |
| ---------------------- | -------------------------------------- | ---------------------------------- |
| 生命周期与所有权       | request context、cache entry、异步回调 | 回调执行时对象是否仍然存活？       |
| `span` / `string_view` | 协议解析、buffer view                  | 底层 buffer 何时移动或释放？       |
| 智能指针               | entry sharing、后台淘汰                | 引用计数保护的是对象还是业务状态？ |
| 原子与内存序           | 状态机、引用计数、并发索引             | 哪条边建立了 happens-before？      |
| allocator / `pmr`      | 热路径、小对象和内存池                 | 优化了分配次数还是只隐藏了成本？   |
| 协程                   | RPC、I/O、迁移任务                     | 挂起帧、取消和异常由谁管理？       |
| 异常与错误模型         | RPC 和存储边界                         | 错误是否跨越 ABI、线程或进程边界？ |
| ABI 与 ODR             | 动态库、灰度和混合版本                 | 接口改变后旧二进制还能否安全运行？ |
| 性能分析               | 查找、淘汰、迁移路径                   | 结论来自 Profile 还是来自直觉？    |

工作代码不能直接复制到学习仓库；所有实验都使用独立、最小、不包含内部信息的复现。

## 最终验收清单

三年后，如果下面大部分问题仍然只能凭经验回答，就不能认为目标已经达到。

### 语言语义

- 能为复杂声明写出完整类型；
- 能区分变量类型、表达式类别、对象身份和存储位置；
- 能分析临时对象、引用延长和悬空；
- 能手工完成主要的重载决议与模板推导；
- 能说明隐式生成或删除特殊成员函数的原因；
- 能区分语言保证和常见 ABI 实现。

### 标准库与泛型

- 能说明常用容器的复杂度、失效和异常保证；
- 能设计 allocator-aware 类型；
- 能识别 view 与借用对象的生命周期；
- 能使用 Concepts 表达接口要求；
- 能阅读一个标准库组件的主要实现；
- 能写出约束清楚、诊断合理的泛型库。

### 并发

- 能严格定义 data race；
- 能画出 synchronizes-with 与 happens-before；
- 能说明每一个非默认内存序为什么足够；
- 能识别 ABA、伪共享和对象回收问题；
- 能区分 TSan 通过与算法正确性证明。

### 工具链与性能

- 能定位 ODR、symbol、linkage 和 ABI 问题；
- 能从 source 追踪到 AST、IR 和 assembly；
- 能熟练使用 Sanitizer、调试器和 Profile；
- 能设计不会被优化器破坏的 benchmark；
- 能用证据解释时间、空间和二进制成本。

### 标准与输出

- 能在标准草案中找到相关规则；
- 能判断 undefined、unspecified、implementation-defined 和 IFNDR；
- 能阅读一份 WG21 提案及其动机；
- 能构造高质量最小复现；
- 能把复杂机制讲给其他高级工程师，并回答追问。

## 学习资料：简中优先，中英双轨

我不排斥英文读物，但如果有质量可靠、容易访问的简体中文互联网资料，会优先用中文建立第一遍理解。进入精确语义、模板、并发内存模型、ABI 和标准提案后，再回到英文原文校验。

这不是把同一个主题重复学两遍，而是让两类资料承担不同职责：

```text
简中教程：快速建立地图，降低第一次理解的语言负担。
中文参考：日常查询术语、语法和标准库接口。
英文教材：深入解释设计、边界和推导过程。
标准原文：裁决精确语义。
编译器文档：解释具体工具链和实现行为。
源码与实验：验证自己的理解。
```

### 第一层：简体中文互联网资料

#### 中文 cppreference

[cppreference 中文版](https://zh.cppreference.com/cpp)作为日常查询入口。它覆盖核心语言、标准库、并发库、标准版本和编译器支持，适合在实验前快速定位概念。

使用方式：

- 从中文页面建立概念地图；
- 保留页面中的英文术语和标准章节编号；
- 对生命周期、求值顺序、内存模型等精细问题，再打开英文页面和标准草案；
- 不把 cppreference 当教程从第一页顺序阅读，也不把它当 ISO 标准本身。

#### 《现代 C++ 教程：高速上手 C++11/14/17/20》

[在线中文版](https://changkun.de/modern-cpp/zh-cn/00-preface/)适合第一季度快速扫描现代特性，也可以按版本回查。作者把它定位为“快速上手”而非进阶语言规范，因此它负责建立地图，不能替代模板专著、并发专著和标准条款。

使用方式：第一遍只标记“陌生、模糊、已掌握”三个状态，把陌生主题放入语义实验仓库，不以读完章节作为验收。

#### C++ Core Guidelines 中文翻译

[《C++ 核心指导方针》简中翻译](https://github.com/lynnboy/CppCoreGuidelines-zh-CN)适合学习接口设计、RAII、所有权、类型安全、错误处理和并发实践。

它是持续演进文档的人工翻译，可能落后于英文原版。因此阅读一条规则时，顺手保留规则编号，例如 `R.1`、`C.20`、`CP.2`；准备写文章或参与设计评审时，再对照[英文最新版](https://isocpp.github.io/CppCoreGuidelines/CppCoreGuidelines)。

#### Microsoft Learn 简体中文 C++ 文档

[Microsoft C++ 语言参考](https://learn.microsoft.com/zh-cn/cpp/cpp/cpp-language-reference?view=msvc-170)覆盖类型、转换、声明、表达式、类、模板、异常、预处理器和构建工具，适合补充中文解释以及学习 MSVC 的诊断、编译和链接行为。

需要注意其中同时包含 ISO C++、MSVC 实现和 Microsoft 扩展。阅读时必须区分：

```text
标准 C++ 规则
MSVC 对标准的实现
Microsoft 平台扩展
```

#### 自己的文章

本站文章不是一次性输出，而是个人知识库。学习新主题时优先检查旧文章：

- 如果核心模型错误，直接修订；
- 如果原文适合入门但不够精确，增加“严格模型”章节；
- 如果主题已经变得过大，再拆出高级篇；
- 在文末记录验证所用标准版本和编译器版本。

这种方式可以避免文章数量增长很快，但旧理解永久停留在入门阶段。

### 第二层：中文书与中文译本

中文书不按数量堆积，每个阶段只选择一本主教材：

| 阶段       | 中文材料选择                                               | 使用边界                                                             |
| ---------- | ---------------------------------------------------------- | -------------------------------------------------------------------- |
| 基础查漏   | 《C++ Primer》第 5 版中文版                                | 适合类型、类、标准库和模板基础，标准范围主要停在 C++11               |
| 现代惯用法 | 《Effective Modern C++》中文版                             | 深入 C++11/14 的类型推导、移动、智能指针和 Lambda，不代表 C++20 全貌 |
| 模板       | 《C++ Templates: The Complete Guide》第 2 版中文版或英文版 | 作为第三季度主教材，必须配合代码实验                                 |
| 并发       | 《C++ Concurrency in Action》第 2 版中文版或英文版         | 作为第五季度主教材，重点推导内存模型                                 |

如果中文译法导致困惑，立即回到英文关键词搜索。书中的代码也必须在当前编译器和目标标准下重新验证，不能因为出版物写过就默认结论永久成立。

### 第三层：英文核心读物

英文资料按问题使用，不追求同时通读：

1. 《A Tour of C++》第 3 版：建立 `C++20` 的整体地图；
2. 《C++ Templates: The Complete Guide》第 2 版：模板推导、实例化、SFINAE 和泛型设计；
3. 《C++ Concurrency in Action》第 2 版：线程库、原子操作和内存模型；
4. 《Embracing Modern C++ Safely》：细查现代特性的收益、风险和迁移边界；
5. CppCon 的 `Back to Basics` 系列：选择与当季主题一致的演讲，不把看视频当作完成；
6. libc++、libstdc++ 源码：第二年起逐组件阅读。

英文读物的笔记保留双语术语。例如：

```text
生存期 lifetime
存储期 storage duration
值类别 value category
实质化转换 temporary materialization conversion
重载决议 overload resolution
依赖名 dependent name
约束归一化 constraint normalization
先发生于 happens-before
单一定义规则 One Definition Rule / ODR
```

这样既能用中文复述，也能直接搜索英文标准、提案、编译器 issue 和源码注释。

### 第四层：英文一手资料

遇到精确问题时，按下面顺序升级资料：

```text
中文 cppreference
→ 英文 cppreference
→ C++ 标准草案
→ Defect Report / WG21 提案
→ 编译器实现与 issue
```

主要入口：

- [英文 cppreference](https://en.cppreference.com/w/)：语言与标准库导航；
- [C++ 标准草案](https://eel.is/c++draft/)：精确语义依据；
- [WG21 Papers](https://www.open-std.org/jtc1/sc22/wg21/docs/papers/)：语言设计和演进；
- [Clang 文档](https://clang.llvm.org/docs/)：AST、诊断、Sanitizer 和编译器行为；
- [GCC 文档](https://gcc.gnu.org/onlinedocs/)：GCC 选项、扩展和实现细节；
- [Itanium C++ ABI](https://itanium-cxx-abi.github.io/cxx-abi/)：Linux 常见 C++ ABI 的实现约定；
- [CMake 官方教程](https://cmake.org/cmake/help/latest/guide/tutorial/)：构建系统主线。

### 每个阶段怎样搭配资料

| 学习阶段         | 第一遍                        | 深入                                | 裁决与验证                  |
| ---------------- | ----------------------------- | ----------------------------------- | --------------------------- |
| 类型、初始化、类 | 现代 C++ 中文教程、C++ Primer | A Tour of C++、Effective Modern C++ | cppreference、编译器实验    |
| 生命周期、重载   | 中文 cppreference             | 英文 cppreference、专题文章         | 标准草案、Clang AST         |
| 模板与 Concepts  | 中文快速地图                  | C++ Templates                       | 标准草案、GCC/Clang 对照    |
| 标准库           | 中文 cppreference             | 英文 cppreference、实现源码         | 标准库条款、测试            |
| 并发             | 中文译本辅助                  | C++ Concurrency in Action           | 标准草案、litmus test、TSan |
| 编译与 ABI       | Microsoft Learn 中文文档      | GCC/Clang/ABI 英文文档              | object file、符号和汇编实验 |
| 标准演进         | 中文文章辅助理解背景          | WG21 提案原文                       | 标准措辞、实现状态与 issue  |

教材负责解释，cppreference 负责导航，标准负责裁决，编译器负责实验，生产代码负责暴露真实问题。中文资料降低第一遍理解成本，英文原文负责保留精度，任何单一材料都不能承担全部角色。

## 计划如何保持有效

这份路线不是一次写完后不再变化的清单。每个季度末都要做一次修订：

```text
哪些主题只达到 L2，原因是什么？
哪些知识已经能在工作中稳定使用？
哪些实验暴露了错误的心智模型？
哪些文章需要修订，而不是继续新增？
下一季度是否需要缩小范围、提高验证深度？
```

每年重新检查编译器支持、标准进展和工作环境，但不因新特性打乱主线。

最终希望获得的不是“学完 C++”的幻觉，而是一种长期稳定的能力：看到代码时能推理，遇到争议时能验证，设计接口时能说明取舍，发现错误时能追到语言、实现和运行环境的边界，并把结论清楚地教给别人。
