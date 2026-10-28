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
- 卡片按学习顺序排列，前面的卡片是后面的基础。
- 复习时先只看问题和要点，口头答完再展开对照。能答到“到底层”那一层才算过。
- 答不上来的卡片，在标题后面加上“（卡住过）”，下次复习时优先看。
- 答案里的输出都来自对应文章中的实验：Apple clang 21，arm64 macOS；汇编用 `-target x86_64-linux-gnu` 生成。

## W2：对象模型与类型推导

### 1. auto 推导和模板推导有什么区别？

要点：两者规则基本相同；花括号初始化时 `auto` 推出 `std::initializer_list`；按值推导丢掉引用和顶层 const。

<details>
<summary>展开答案</summary>

- **一句话**：`auto` 推导就是模板实参推导，`auto` 相当于模板参数 `T`，左边的 `auto`、`auto&`、`auto&&` 相当于函数参数的写法。唯一的区别在花括号：`auto x = {1, 2}` 推出 `std::initializer_list<int>`，而把 `{1, 2}` 传给 `template<class T> void f(T)` 会推导失败。
- **往下一层**：三种写法对应三套规则。
  - `auto`（按值）：创建一个新对象，丢掉引用和顶层 const；数组和函数退化成指针。
  - `auto&`：保留 const，数组不退化，能推出 `int (&)[3]` 这样的数组引用。
  - `auto&&`（转发引用）：初始化表达式是左值时得到 `T&`，是右值时得到 `T&&`，靠的是引用折叠。
- **到底层**：标准 [dcl.type.auto.deduct] 规定，`auto` 先替换成一个虚构的模板参数，再按模板推导的规则来推；遇到复制列表初始化（`= {…}`）时，把模式换成 `std::initializer_list<U>`。顶层 const 只描述对象本身，所以 `const char* const levels[] = {…}; auto p = levels;` 得到 `const char* const*`：数组退化成指针后，`p` 本身成了新对象，但它指向的元素仍是 `const char* const`，这一层 const 不能丢。验证方法是 `static_assert(std::is_same_v<decltype(p), const char* const*>)`。
- **追问**：
  - `auto x{1}` 是什么类型？C++17 起，直接列表初始化只允许一个元素，推出 `int`。
  - 函数返回类型写 `auto`，能 `return {1, 2}` 吗？不能，返回类型推导不走 `initializer_list` 这条分支，编译报错。
  - 为什么不用 `typeid(x).name()` 查推导结果？`typeid` 会丢掉引用和顶层 const，看不出差别。
- **出处**：[C++ 类型推导 · 第 2、3、5 节](/blog/cpp-type-deduction/)

</details>

### 2. decltype(x) 和 decltype((x)) 有什么区别？

要点：只有一个名字时照抄声明；其他表达式按值类别决定，左值得到 `T&`；`decltype(auto)` 返回 `(local)` 时会悬空。

<details>
<summary>展开答案</summary>

- **一句话**：`decltype(x)` 查的是名字 `x` 的声明类型；`decltype((x))` 里多了一层括号，`(x)` 不再是名字而是表达式，按值类别算类型。`x` 是左值，所以 `int x` 时 `decltype((x))` 是 `int&`。
- **往下一层**：`decltype` 有两条规则。
  - 括号里只有一个名字（或 `obj.member` 这样的成员访问）：照抄它的声明类型，声明是 `int&` 就得到 `int&`。
  - 其他表达式：左值得到 `T&`，将亡值得到 `T&&`，纯右值得到 `T`。
  - `decltype(auto)` 就是用这两条规则处理初始化表达式或 `return` 表达式。
- **到底层**：规则见标准 [dcl.type.decltype]。括号这个差别在 `decltype(auto)` 返回值上最危险：`return (entry.payload);` 返回 `const std::string&`，而去掉括号返回的是 `std::string` 副本；`return (local);` 返回 `int&`，函数结束后 `local` 已经销毁，调用方拿到的是悬空引用。
- **追问**：
  - `decltype(auto)` 什么时候真正有用？写包装函数时，原样转发被包装函数的返回类型，原函数返回引用，包装后也返回引用。
  - `decltype` 会对括号里的表达式求值吗？不会，它是不求值操作数，但表达式仍然要能通过编译。
  - 能写 `const decltype(auto)` 或 `decltype(auto)&` 吗？不能，`decltype(auto)` 必须单独作为完整的类型使用。
- **出处**：[C++ 类型推导 · 第 6、7 节](/blog/cpp-type-deduction/)

</details>

### 3. sizeof 怎么算？怎样让结构体变小？

要点：两条对齐规则；末尾填充；按对齐值从大到小重排；`Record` 从 24 降到 16。

<details>
<summary>展开答案</summary>

- **一句话**：每个成员放在满足自己对齐要求的第一个偏移上，结构体的大小再补齐到最大对齐值的整数倍。按对齐值从大到小排列成员，填充通常最少。
- **往下一层**：
  - 规则一：成员的偏移必须是它的 `alignof` 的整数倍，不够就在前面插填充。
  - 规则二：结构体的对齐值是所有成员对齐值的最大值，`sizeof` 向上补齐到它的整数倍。
  - 末尾也要补，是为了数组：`arr[1]` 的地址等于 `&arr[0] + sizeof`，必须让 `arr[1]` 的每个成员同样对齐。
- **到底层**：`struct Record { bool valid; double score; int count; bool dirty; };` 用 `clang++ -Xclang -fdump-record-layouts` 打印：`valid` 在 0，`score` 在 8，`count` 在 16，`dirty` 在 20，`sizeof` 为 24，其中 `valid` 后有 7 字节、末尾有 3 字节填充。重排成 `double score; int count; bool valid; bool dirty;` 后，偏移依次为 0、8、12、13，`sizeof` 变成 16。一百万个元素的数组，就是 24 MB 和 16 MB 的区别。
- **追问**：
  - 编译器为什么不自动重排？标准 [class.mem] 要求同一访问级别的成员按声明顺序递增地址，读写二进制文件、和 C 共享结构体定义的代码都依赖这个顺序。
  - `alignas(64)` 有什么用？把对象撑满一条 cache line，避免两个线程频繁修改的变量互相干扰（false sharing）。但 64 不是通用答案：本文的实验机器 cache line 是 128 字节。
- **出处**：[对象内存布局 · 第 2 节](/blog/cpp-object-layout/)

</details>

### 4. 空类为什么占 1 字节？什么时候可以不占空间？

要点：不同对象的地址必须不同；空基类优化（EBO）；C++20 的 `[[no_unique_address]]`。

<details>
<summary>展开答案</summary>

- **一句话**：C++ 要求不同的对象有不同的地址，空类如果大小为 0，`Empty arr[2]` 的两个元素地址就会相同，所以 `sizeof(Empty)` 至少是 1。作为基类时，空基类优化允许它不占空间；C++20 起，成员加上 `[[no_unique_address]]` 也可以不占空间。
- **往下一层**：
  - 作为成员：`struct D { Empty e; int i; };` 里，`e` 占 1 字节，再加 3 字节填充，`sizeof(D)` 是 8。
  - 作为基类：`struct E : Empty { int i; };` 里，`Empty` 子对象和 `i` 共用偏移 0，`sizeof(E)` 是 4。
  - 加上属性：`struct D2 { [[no_unique_address]] Empty e; int i; };`，`e` 和 `i` 共用偏移 0，`sizeof(D2)` 也是 4。
- **到底层**：三者的 `-fdump-record-layouts` 输出分别是 `e` 在 0、`i` 在 4（`D`），`Empty (base)` 和 `i` 都在 0（`E`），`e` 和 `i` 都在 0（`D2`）。标准依据是 [intro.object]（不同对象地址不同）和 [dcl.attr.nouniqueaddr]。
- **追问**：
  - 标准库在哪里用到了 EBO？`std::unique_ptr` 的默认删除器是空类，借助 EBO，`unique_ptr<T>` 和裸指针一样大，都是 8 字节。
  - EBO 什么时候失效？空基类和第一个成员是同一类型时。`struct S : Empty { Empty e; int i; };` 中，两个 `Empty` 子对象必须有不同的地址，基类在 0，`e` 只能放在 1，`sizeof(S)` 是 8 而不是 4。
- **出处**：[对象内存布局 · 第 3 节](/blog/cpp-object-layout/)

</details>

### 5. 派生类的成员什么时候能放进基类的尾部填充？

要点：`dsize`；Itanium ABI 中 POD for the purpose of layout 的条件；与 `memcpy` 兼容的原因。

<details>
<summary>展开答案</summary>

- **一句话**：基类不是“C 风格的简单结构体”时可以。Itanium ABI 让派生类成员从基类的 `dsize`（去掉末尾填充后的大小）开始放，而不是从 `sizeof` 开始放；但如果基类是 POD for the purpose of layout，就不允许复用。
- **往下一层**：
  - `Shape`（vptr + `int id`）的 `sizeof` 是 16，`dsize` 是 12；`struct Tagged : Shape { int tag; };` 把 `tag` 放在偏移 12，`sizeof(Tagged)` 仍是 16，而不是直觉上的 24。
  - 对比：`struct P { int x; char c; };` 是简单结构体，`struct Q : P { char d; };` 的 `d` 只能放在 8，`sizeof(Q)` 是 12；给基类加一个用户提供的构造函数 `P2() {}`，`Q2` 的 `d` 就能放进偏移 5，`sizeof(Q2)` 变成 8。
- **到底层**：原因是兼容 C 的 `memcpy` 习惯。C 风格结构体可能被整个复制，比如 `memcpy(&q, &other, sizeof(P))`；如果派生类成员住在 `P` 的填充里，复制基类部分时会把派生类的数据覆盖掉。所以 ABI 只对“不像 C 结构体”的基类放开复用，具体条件见 [Itanium C++ ABI: POD for the purpose of layout](https://itanium-cxx-abi.github.io/cxx-abi/abi.html#POD)。
- **追问**：
  - 多继承里也会发生吗？会，`Stream` 的 `buffered` 放在偏移 28，就住进了 `Writer` 子对象末尾的填充里。
  - 这是标准规定的吗？不是，是 Itanium ABI（Linux、macOS 上的 GCC 和 Clang）的规定，MSVC 的布局规则不同。
- **出处**：[对象内存布局 · 第 5 节](/blog/cpp-object-layout/)

</details>

### 6. 多继承下，this 是怎么调整的？

要点：两个 vptr；`offset_to_top`；thunk 中的 `add rdi, -16`；指针转换要判空，引用转换不用。

<details>
<summary>展开答案</summary>

- **一句话**：第二个基类子对象不在偏移 0，转换成它的指针时要加上偏移；反过来，通过它调用派生类的虚函数时，虚表里放的是一个 thunk，先把 `this` 减回对象开头，再执行真正的函数。
- **往下一层**：`struct Stream : Reader, Writer`，两个基类都有虚函数。
  - 布局：`Reader` 是主基类，在偏移 0，和 `Stream` 共用一个 vptr；`Writer` 在偏移 16，带着自己的 vptr。一个 `Stream` 对象里有两个 vptr。
  - 转换：`Writer* w = &s;` 时 `w` 比 `&s` 大 16；但 `w == &s` 为真，因为比较前 `&s` 也被转换成了 `Writer*`。
  - 虚表：`Stream` 的虚表是两张表拼起来的。第二部分给 `Writer` 子对象用，开头是 `offset_to_top (-16)`，每一项都标着 `this adjustment: -16`。
- **到底层**：x86-64 上 `this` 通过 `rdi` 传递，thunk 的汇编是：

  ```text
  non-virtual thunk to Stream::write():
  	add	rdi, -16
  	jmp	flush(Stream&)@PLT
  ```

  指针转换还要判空，空指针转换后必须仍然是空指针，不能变成 `0x10`：

  ```text
  to_writer_ptr(Stream*):
  	lea	rax, [rdi + 16]
  	test	rdi, rdi
  	cmove	rax, rdi
  	ret
  ```

  引用不可能为空，`to_writer_ref` 只有一条 `lea`。
- **追问**：
  - `offset_to_top` 有什么用？`dynamic_cast<void*>` 靠它从任意子对象找回完整对象的开头。
  - 单继承就一定不用调整吗？不一定。基类没有虚函数、只有派生类有时，`Derived` 的 vptr 占了偏移 0，基类被挤到偏移 8，单继承也要加 8。
  - 调换基类顺序会怎样？变成 `Stream : Writer, Reader`，`Writer` 成为主基类放在 0，需要调整的就变成了 `Reader`。
- **出处**：[对象内存布局 · 第 5、6、7 节](/blog/cpp-object-layout/)

</details>

### 7. 虚函数调用的过程是什么？成本在哪里？

要点：`mov` 读 vptr、`jmp [rax+16]`；两次依赖的内存读取；间接跳转；挡住内联；`final` 去虚化。

<details>
<summary>展开答案</summary>

- **一句话**：先从对象开头读出 vptr，再从虚表的固定槽位读出函数地址，最后间接跳转过去。真正的成本主要不在这两条指令，而在于编译器不知道调用目标，没法内联。
- **往下一层**：
  - 每个多态对象开头有一个 vptr，指向本类的虚表；虚表每个类只有一份。
  - 派生类覆盖虚函数时，替换同一个槽位里的函数；新增的虚函数追加在末尾。槽位顺序不变，所以拿着 `Shape&` 调用时，编译器只需要知道“去第几个槽位取”。
  - 槽位从 vptr 指向的位置开始数：两个析构函数（complete 和 deleting）占前两个，`area` 是第三个，偏移 16。
- **到底层**：

  ```text
  call_virtual(Shape const&):
  	mov	rax, qword ptr [rdi]
  	jmp	qword ptr [rax + 16]
  ```

  `mov` 读出 vptr，`jmp` 从 vptr + 16 取函数地址并跳转（这里是尾调用，所以是 `jmp` 不是 `call`）。成本有三部分：
  - 两次相互依赖的内存读取，第二次要等第一次完成；虚表不在缓存里时代价更大。
  - 间接跳转依赖 CPU 的间接分支预测，同一调用点的对象类型来回变化时容易预测失败。
  - 挡住内联，后续的常量传播、向量化等优化也随之失效，这一点往往影响最大。
- **追问**：
  - 怎样让编译器去虚化？给类加 `final`：`struct Square final : Shape`，`call_final` 的汇编只剩一条 `jmp Square::area() const@PLT`，不再查表。直接对局部对象调用、编译器能确定动态类型时也会去虚化。
  - 热路径上怎么替代虚函数？用 CRTP 静态多态，在编译期确定调用目标。这部分的 benchmark 对比还没做，放在模板专题。
- **出处**：[对象内存布局 · 第 4、9 节](/blog/cpp-object-layout/)

</details>

### 8. 为什么基类析构函数要写成 virtual？

要点：静态类型决定调用哪个析构函数；deleting destructor 在虚表里的槽位；基类不在偏移 0 时，`free` 拿到错误的地址；[expr.delete]/3。

<details>
<summary>展开答案</summary>

- **一句话**：通过基类指针 `delete` 派生类对象时，只有析构函数是虚函数，才能找到对象的实际类型，正确地析构整个对象并释放正确的地址；否则是未定义行为。
- **往下一层**：
  - 析构函数不是虚函数时，`delete p` 只看 `p` 的静态类型 `Base*`，直接调用 `~Base`。实验输出只有 `~Base`，`~Derived` 没有执行，派生类里的 `std::string` 等成员就泄漏了。
  - 析构函数是虚函数时，虚表里有两个析构函数槽位：complete destructor 只析构对象，deleting destructor 析构后再释放内存。`delete p` 调用的是 deleting destructor，它由对象的实际类型提供，知道完整对象从哪里开始、有多大。
- **到底层**：没有虚析构时，`delete p` 编译成把 `p` 原样交给 `operator delete`：

  ```text
  mov	esi, 4
  jmp	operator delete(void*, unsigned long)@PLT
  ```

  有虚析构时，变成一次虚调用，取第二个槽位（deleting destructor）：

  ```text
  mov	rax, qword ptr [rdi]
  jmp	qword ptr [rax + 8]
  ```

  最严重的情况：`struct Base { int x; }; struct Derived : Base { virtual void f() {} };`，`Base` 被挤到偏移 8，`new` 返回 `...8b0`，`delete` 拿到的是 `...8b8`，进程在 `libsystem_malloc` 的 `free` 路径里触发 trap，退出码 133（SIGTRAP）。标准 [expr.delete]/3 规定：静态类型和动态类型不同时，静态类型必须有虚析构函数，否则行为未定义。
- **追问**：
  - 编译器会提醒吗？基类有虚函数时，Clang 的 `-Wall` 会给出 `-Wdelete-non-abstract-non-virtual-dtor` 警告；基类完全没有虚函数时，`-Wall -Wextra` 都不会警告。
  - 不打算多态删除的基类怎么写？把析构函数设为 `protected` 且非虚，`delete p` 直接编译失败（`calling a protected destructor of class 'Base'`）。
  - 通过非主基类指针 `delete` 时，怎么找到对象开头？虚表第二部分的 deleting destructor 槽位放的是 thunk，先把 `this` 调回对象开头。
- **出处**：[对象内存布局 · 第 8 节](/blog/cpp-object-layout/)

</details>
