---
title: C++ 八股卡片
description: 每张卡片只回答一个问题，从一句话答案一路追问到汇编、dump 和标准条款，用来在面试前检查哪些知识点还停留在背结论。
pubDate: 2026-10-28
categories: ['C/C++']
tags: [cpp, interview]
draft: true
---

## 怎么用这些卡片

- 一张卡片只回答一个问题，答案分三层：一句话结论、机制、证据。
- 写的时候不翻文章。写不出来的地方再去查，并在标题后面加上“（卡住过）”，复习时优先看这些。
- 复习时先只看问题，口头答完再展开对照。能答到“到底层”那一层才算过。
- “要点”是这张卡片必须覆盖的内容，答案里漏了哪一条，就说明那一块还没吃透。

## W2：对象模型与类型推导

### 1. 为什么基类析构函数要写成 virtual？

要点：静态类型决定调用哪个析构函数；deleting destructor 在虚表里的槽位；基类不在偏移 0 时，`free` 拿到错误的地址；[expr.delete]/3。

<details>
<summary>展开答案</summary>

- **一句话**：
- **往下一层**：
- **到底层**：
- **追问**：
- **出处**：[对象内存布局 · 第 8 节](/blog/cpp-object-layout/)

</details>

### 2. 虚函数调用的过程是什么？成本在哪里？

要点：`mov` 读 vptr、`jmp [rax+16]`；两次依赖的内存读取；间接跳转；挡住内联；`final` 去虚化。

<details>
<summary>展开答案</summary>

- **一句话**：
- **往下一层**：
- **到底层**：
- **追问**：
- **出处**：[对象内存布局 · 第 9 节](/blog/cpp-object-layout/)

</details>

### 3. 多继承下，this 是怎么调整的？

要点：两个 vptr；`offset_to_top`；thunk 中的 `add rdi, -16`；指针转换要判空，引用转换不用。

<details>
<summary>展开答案</summary>

- **一句话**：
- **往下一层**：
- **到底层**：
- **追问**：
- **出处**：[对象内存布局 · 第 6、7 节](/blog/cpp-object-layout/)

</details>

### 4. sizeof 怎么算？怎样让结构体变小？

要点：两条对齐规则；末尾填充；按对齐值从大到小重排；`Record` 从 24 降到 16。

<details>
<summary>展开答案</summary>

- **一句话**：
- **往下一层**：
- **到底层**：
- **追问**：
- **出处**：[对象内存布局 · 第 2 节](/blog/cpp-object-layout/)

</details>

### 5. 空类为什么占 1 字节？什么时候可以不占空间？

要点：不同对象的地址必须不同；空基类优化（EBO）；C++20 的 `[[no_unique_address]]`。

<details>
<summary>展开答案</summary>

- **一句话**：
- **往下一层**：
- **到底层**：
- **追问**：
- **出处**：[对象内存布局 · 第 3 节](/blog/cpp-object-layout/)

</details>

### 6. 派生类的成员什么时候能放进基类的尾部填充？

要点：`dsize`；Itanium ABI 中 POD for the purpose of layout 的条件；与 `memcpy` 兼容的原因。

<details>
<summary>展开答案</summary>

- **一句话**：
- **往下一层**：
- **到底层**：
- **追问**：
- **出处**：[对象内存布局 · 第 5 节](/blog/cpp-object-layout/)

</details>

### 7. auto 推导和模板推导有什么区别？

要点：两者规则基本相同；花括号初始化时 `auto` 推出 `std::initializer_list`；按值推导丢掉顶层 const 和引用。

<details>
<summary>展开答案</summary>

- **一句话**：
- **往下一层**：
- **到底层**：
- **追问**：
- **出处**：[C++ 类型推导](/blog/cpp-type-deduction/)

</details>

### 8. decltype(x) 和 decltype((x)) 有什么区别？

要点：只有一个名字时照抄声明；其他表达式按值类别决定，左值得到 `T&`；`decltype(auto)` 返回局部变量时的悬垂引用。

<details>
<summary>展开答案</summary>

- **一句话**：
- **往下一层**：
- **到底层**：
- **追问**：
- **出处**：[C++ 类型推导](/blog/cpp-type-deduction/)

</details>
