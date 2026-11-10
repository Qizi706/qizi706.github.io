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
- 答案里的输出都来自实验：Apple clang 21，arm64 macOS；汇编用 `-target x86_64-linux-gnu` 生成。卡片 1–9、12–14、16–18 的实验在对应文章里，卡片 15、20–30 的实测写在卡片里，其中卡片 15、23–30 的内容也整理进了[智能指针文章](/blog/cpp-smart-pointers/)，卡片 10、11 没有对应文章。这些结果都在 clang 21 和 GCC 16 上一致（卡片 26 的 TSan 实验只在 clang 上跑，`atomic<shared_ptr>` 两者不同，卡片里有说明；卡片 30 的耗时来自智能指针文章第 7 节在 Apple M5 Pro 上的测量）。卡片 13、15 要包含标准库头文件，汇编改在本机 arm64 上用 `-O2` 生成。体系结构相关的卡片单独放在[体系结构八股卡片](/blog/architecture-interview-cards/)。

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

### 9. 圆括号和花括号初始化有什么区别？

要点：花括号禁止窄化、避开 most vexing parse；非空花括号优先选 initializer-list 构造函数；`vector(10, 20)` 和 `{10, 20}` 不同；传参数用 `()`，传内容用 `{}`。

<details>
<summary>展开答案</summary>

- **一句话**：圆括号走普通重载决议；花括号多了两条规则：不允许窄化，而且只要类有可行的 initializer-list 构造函数，就优先选它。所以 `std::vector<int> v1(10, 20)` 是 10 个 `20`，`v2{10, 20}` 是两个元素。
- **往下一层**：
  - 花括号的好处：禁止窄化（`int x{3.5}` 报错）；能写在类内默认成员初值里，`int c(0);` 不行；不会被解析成函数声明。
  - 花括号的代价：第一轮只问“列表元素能不能隐式转换成 initializer_list 的元素类型”，能就选中，不比较谁更匹配。
  - 选中之后窄化失败会直接报错，不回退。只有元素完全无法转换时，才进入第二轮考虑普通构造函数。
  - 空花括号 `T{}`：类有默认构造函数时走值初始化，不走列表构造函数。
- **到底层**：规则是 [over.match.list] 的两阶段选择。`Widget(int, bool)` 和 `Widget(std::initializer_list<long double>)` 同时存在时，`Widget a(10, true)` 输出 `Widget(int, bool)`，`Widget b{10, true}` 输出 `initializer_list<long double>`，尽管前者是精确匹配。把元素类型换成 `std::string`，`int` 和 `bool` 都转换不了，`{10, true}` 才回到 `(int, bool)`。
- **追问**：
  - 想调用列表构造函数并传空列表怎么写？`Buffer({})`。`Buffer{{}}` 得到的是一个元素 `0`，内层 `{}` 被当成一个元素。《Effective Modern C++》条款 7 把两者都写成传空列表，这里以实测为准。
  - 什么是 most vexing parse？`Widget w(Timer());` 声明的是函数，参数是“返回 `Timer` 的无参函数”。改成 `Widget w{Timer{}};`。
  - `make_unique<vector<int>>(10, 20)` 有几个元素？10 个，它内部用圆括号转发。
  - 给已有的类加 initializer-list 构造函数有什么风险？旧的花括号调用可能改变含义，`Buffer{3}` 就从三个零变成了一个元素 `3`。
- **出处**：[C++ 对象初始化 · 第 3、5、7 节](/blog/cpp-initialization/)，《Effective Modern C++》条款 7

</details>

### 10. nullptr 为什么比 NULL 好？

要点：`0` 和 `NULL` 是整数；重载选错或有歧义；经过模板推导后不再是空指针常量；`std::nullptr_t` 能转换成任意指针，不能转换成整数。

<details>
<summary>展开答案</summary>

- **一句话**：`0` 和 `NULL` 的类型是整数，只是字面量 `0` 可以当空指针常量用；`nullptr` 的类型是 `std::nullptr_t`，本身就表示空指针。它在重载决议和模板推导里都不会被当成整数。
- **往下一层**：
  - 重载：有 `f(int)`、`f(bool)`、`f(void*)` 时，`f(0)` 调用 `f(int)`，`f(nullptr)` 调用 `f(void*)`。
  - `f(NULL)` 取决于 `NULL` 的定义，本机是 `__null`，clang 和 GCC 都报重载歧义。
  - 模板：`template<class F, class P> void call(F fn, P p) { fn(p); }`，`g` 接收 `int*`。`g(0)` 能编译，`call(g, 0)` 不能：`P` 推导成 `int`，`p` 已经是普通的 `int` 变量，不是字面量 `0`。`call(g, nullptr)` 可以。
- **到底层**：空指针常量（null pointer constant）的定义在 [conv.ptr]：值为零的整数字面量，或 `std::nullptr_t` 类型的纯右值。整数字面量经过推导就变成变量，失去了这个身份；`nullptr_t` 类型的变量则保持类型，仍然能转换成任意指针。`using nullptr_t = decltype(nullptr)`，`sizeof(std::nullptr_t)` 等于 `sizeof(void*)`，本机都是 8。
- **追问**：
  - `int i = nullptr;` 能编译吗？不能，`nullptr` 不能转换成整数。
  - `bool b = nullptr;` 呢？不能，只允许直接初始化 `bool b{nullptr}`，结果是 `false`，clang 还会给出 `-Wnull-conversion` 警告。
  - 为什么这个问题和完美转发有关？转发函数也是模板，`0` 和 `NULL` 转发过去就是整数，这是完美转发失败的一类情形。
- **出处**：《Effective Modern C++》条款 8，标准 [conv.ptr]

</details>

### 11. enum class 和普通 enum 有什么区别？

要点：名字不污染外层作用域；不隐式转换成整数；默认底层类型 `int`，可以指定；能前置声明；`uint8_t` 打印时会变成字符。

<details>
<summary>展开答案</summary>

- **一句话**：`enum class` 的枚举值要写 `Side::Buy`，不会泄漏到外层作用域，也不会隐式转换成整数；底层类型默认是 `int`，所以不需要定义就能前置声明。
- **往下一层**：
  - 作用域：`enum C { red }; int red = 1;` 报重定义，换成 `enum class` 就合法。
  - 类型安全：`int x = S::A;` 和 `S::A == 0` 都编译失败，要转换就写 `static_cast`。同类型枚举值之间可以比较大小。
  - 大小：普通 `enum` 不指定底层类型时由实现决定，本机 `enum Old { Oa }` 是 4 字节，取值超出 `int` 的 `enum Big { X = 1LL << 40 }` 是 8 字节。`enum class` 默认 4 字节，指定 `: std::uint8_t` 后是 1 字节。
  - 前置声明：`enum class Fwd;` 合法，`enum U;` 不合法，要写成 `enum U : int;`。编译器必须知道大小。前置声明能减少头文件依赖。
- **到底层**：底层类型直接影响布局。同一个订单结构体，用默认的 `int` 底层类型和 `std::uint8_t` 对比：

  ```cpp
  struct Order { std::uint64_t id; double price; std::uint32_t qty; Side side; Status status; };
  ```

  `-fdump-record-layouts` 显示，默认底层类型时 `side` 在 20、`status` 在 24，`sizeof` 为 32；换成 `std::uint8_t` 后 `side` 在 20、`status` 在 21，`sizeof` 为 24。规则见标准 [dcl.enum]。
- **追问**：
  - 普通 `enum` 还有用吗？需要隐式转成整数时写起来方便，比如当数组下标；但类型安全上要自己负责。
  - `enum class Side : std::uint8_t { Sell = 66 }` 用 `std::cout` 打印 `static_cast<std::uint8_t>(Side::Sell)` 输出什么？输出 `B`，`uint8_t` 被当成字符。写成 `+static_cast<std::uint8_t>(...)` 才输出 `66`。C++23 可以用 `std::to_underlying`，打印时同样要注意这个问题。
  - `static_cast<Side>(200)` 合法吗？合法。有固定底层类型时，底层类型的所有值都是有效的枚举值，所以 `switch` 不能假设只有列出的那几个值。
- **出处**：《Effective Modern C++》条款 10，标准 [dcl.enum]

</details>

## W3：移动语义与值类别

### 12. 左值、将亡值、纯右值怎么区分？

要点：值类别属于表达式，不属于变量；按“是否指向具体对象”和“资源能否拿走”两个问题分类；右值引用变量的名字是左值；用 `decltype((e))` 验证。

<details>
<summary>展开答案</summary>

- **一句话**：每个表达式都有值类别，由两个问题决定：它是否指向一个具体的对象，这个对象的资源能不能拿走。指向对象且不能拿走是左值，指向对象且能拿走是将亡值（xvalue），不指向具体对象的是纯右值（prvalue）。
- **往下一层**：
  - 左值：`x`、`*p`、`v[0]`、`++x`、`x = 3`、`"hi"`、返回 `int&` 的函数调用。
  - 将亡值：`std::move(x)`、`static_cast<int&&>(x)`、返回 `int&&` 的函数调用、`S{}.m`。
  - 纯右值：`7`、`x + 1`、`x++`、`nullptr`、`S{}`、返回 `int` 的函数调用。
  - 左值和将亡值合称 glvalue，都指向对象；将亡值和纯右值合称 rvalue，都可以被移动。
  - 声明类型和值类别是两件事：`int&& r = 2;` 中 `r` 的类型是 `int&&`，表达式 `r` 却是左值。
- **到底层**：`decltype((e))` 把值类别写进类型，左值得到 `T&`，将亡值得到 `T&&`，纯右值得到 `T`。用偏特化把它打印出来，`r` 输出 `lvalue`，`std::move(x)` 和 `S{}.m` 输出 `xvalue`，`S{}` 输出 `prvalue`。`S{}.m` 是将亡值，是因为 C++17 起纯右值不再直接是临时对象：访问成员时需要一个真实存在的对象，纯右值经过临时量实质化（temporary materialization）变成将亡值。标准见 [basic.lval] 和 [conv.rval]。
- **追问**：
  - 为什么右值引用参数在函数里是左值？函数体里可能多次使用它，如果自动当右值，第一次使用就可能把它搬空。右值引用只表示调用方允许移动，真正移动要自己写 `std::move`。
  - “有名字就是左值”对吗？两个方向都有例外：枚举项和非类型模板参数有名字，却是纯右值；`*p`、`"hi"` 没有名字，却是左值。
  - 值类别影响哪些事？重载决议（`const T&` 还是 `T&&`）、`decltype` 的结果、能不能对表达式取地址。
- **出处**：[C++ 移动语义 · 第 2 节](/blog/cpp-move-semantics/)

</details>

### 13. std::move 做了什么？

要点：只是一次 `static_cast`，把表达式变成将亡值；运行时没有指令；真正移动的是之后选中的移动构造或移动赋值；`const` 对象 move 后仍然拷贝。

<details>
<summary>展开答案</summary>

- **一句话**：`std::move` 不移动任何东西，它无条件地把实参转换成右值引用，让表达式变成将亡值。重载决议因此能选中移动构造函数或移动赋值运算符，资源是在那里被拿走的。
- **往下一层**：
  - 实现只有一行：`return static_cast<std::remove_reference_t<T>&&>(t);`。参数是转发引用，左值和右值都能接收；`remove_reference_t` 保证返回的一定是 `T&&`，不会因为引用折叠变成 `T&`。
  - 对 `int` 这样没有资源的类型，`int y = std::move(x);` 就是一次复制，之后 `x` 仍然是 `1`。
  - 对 `const std::string s`，`std::move(s)` 的类型是 `const std::string&&`，接不住非 `const` 的移动构造函数，只能匹配拷贝构造函数，编译也不报错。
- **到底层**：在 arm64 上用 `-O2` 编译 `std::string&& cast(std::string& s) { return std::move(s); }`，clang 和 GCC 生成的函数体都只有一条 `ret`，和返回 `&s` 的函数完全一样：引用就是地址，转换前后地址不变，只有编译期的类型变了。
- **追问**：
  - 被移动后的对象处于什么状态？标准库的约定是“有效但未指定”，可以赋新值、析构，也可以调用没有前置条件的函数（如 `size()`、`clear()`），但不能假设它的值。本机 libc++ 和 libstdc++ 中被移动的 `std::string` 都变成空串，长短字符串都一样，但这是实现行为。
  - `Bad(String&& v) : s(v) {}` 为什么是拷贝？`v` 是左值，要写 `s(std::move(v))`。
  - `return std::move(local);` 好不好？不好，它让 NRVO 失效，多出一次移动；直接 `return local;` 时，NRVO 做不了也会自动按右值处理。
  - `std::move` 和 `std::forward` 怎么选？参数是 `T&&` 右值引用时用 `std::move`；参数是转发引用、实参可能是左值时用 `std::forward<T>`。
- **出处**：[C++ 移动语义 · 第 4、5 节](/blog/cpp-move-semantics/)，《Effective Modern C++》条款 23、25

</details>

### 14. 移动构造不加 noexcept，vector 扩容为什么会退化成拷贝？

要点：`push_back` 的强异常保证；移动到一半失败无法回滚；`std::move_if_noexcept`；实测分配次数从 100 万变成约 205 万。

<details>
<summary>展开答案</summary>

- **一句话**：`vector` 扩容要保证强异常安全，失败时原数据不变。拷贝失败可以丢掉新内存回滚，移动失败时旧元素已经被搬空，回不去了。所以只有移动构造函数声明为 `noexcept`，`vector` 才敢用移动，否则用拷贝。
- **往下一层**：
  - 扩容时 `vector` 用 `std::move_if_noexcept` 选择搬迁方式：移动构造是 `noexcept`，或者类型根本不能拷贝，就移动；否则拷贝。
  - 只能移动的类型（拷贝构造被删除）即使移动可能抛异常，也只能移动，这时放弃强保证。
  - 扩容在新内存上**构造**元素，看的是移动构造函数的 `noexcept`，和移动赋值无关。
- **到底层**：用一个 37 字符的字符串类型向空 `vector` 插入 100 万个元素，容量逐次翻倍，搬迁总数是 `2^20 - 1 = 1048575`。移动构造加 `noexcept` 时，搬迁全是 move，堆分配 1000000 次；不加时搬迁全是 copy，堆分配 2048575 次。耗时分别是 15–17 ms 和 33–36 ms（Apple M5 Pro，`-O2`，7 次取最小值，区间两端分别来自 GCC 16 和 Apple clang 21）。分配次数是确定的，耗时比例只代表这台机器和这个字符串长度。
- **追问**：
  - `= default` 的移动构造是 `noexcept` 吗？编译器根据成员和基类判断，所有成员的移动构造都是 `noexcept` 时才是。可以写 `static_assert(std::is_nothrow_move_constructible_v<T>)` 守住。
  - `noexcept` 函数里真的抛了异常会怎样？异常不会传出去，直接调用 `std::terminate`。
  - 移动赋值和 `swap` 要不要 `noexcept`？要。`std::swap` 是否 `noexcept` 取决于移动构造和移动赋值；copy-and-swap 写法的赋值运算符也依赖 `swap` 不抛异常。
  - 为什么移动通常不会抛异常？移动只交换指针和大小，不分配内存；所以移动构造里不要为被移动的对象重新分配一个空缓冲区。
- **出处**：[C++ 移动语义 · 第 6 节](/blog/cpp-move-semantics/)，《Effective Modern C++》条款 14

</details>

### 15. 为什么 unique_ptr 和裸指针一样大？

要点：默认删除器是空类；空基类优化或 `[[no_unique_address]]`；函数指针删除器变成 16 字节；解引用和裸指针生成相同的指令；按值传参不完全免费。

<details>
<summary>展开答案</summary>

- **一句话**：`unique_ptr<T, D>` 要保存一个指针和一个删除器。默认删除器 `std::default_delete<T>` 是空类，标准库借助空基类优化（或 C++20 的 `[[no_unique_address]]`）让它不占空间，所以只剩一个指针，8 字节。解引用和裸指针一样，没有额外开销。
- **往下一层**：在 arm64 macOS 上，clang（libc++）和 GCC 16（libstdc++）测出的大小相同：

  | 类型 | `sizeof` |
  | --- | --- |
  | `int*` | 8 |
  | `unique_ptr<int>` | 8 |
  | `unique_ptr<int, 无状态函数对象>`，含无捕获 lambda | 8 |
  | `unique_ptr<int, void(*)(int*)>` | 16 |
  | `unique_ptr<int, 带一个 int 成员的函数对象>` | 16 |
  | `unique_ptr<int, std::function<void(int*)>>` | 40 |
  | `shared_ptr<int>` | 16 |

  删除器有状态时就要占空间：函数指针要保存地址，加上对齐就是 16 字节。
- **到底层**：用 `-O2` 编译 `int f(const std::unique_ptr<int>& p) { return *p; }`，生成两条 `ldr`：先从引用处读出指针，再读出 `int`。这和 `int g(int* const& p) { return *p; }` 完全相同，`unique_ptr` 本身没有带来额外指令。

  按值传参时情况不同。Itanium ABI 规定，有非平凡析构函数的类型不能放在寄存器里传递，`int take(std::unique_ptr<int> p)` 收到的是对象的地址，同样要读两次内存；析构（也就是 `delete`）由调用方在调用结束后执行。裸指针版本 `int take(int* p)` 的指针直接放在寄存器里，`delete` 在函数内部执行。所以说 `unique_ptr` 零开销，指的是大小和访问，不包括按值传参的调用约定。
- **追问**：
  - 怎样让自定义删除器不增加大小？用无状态的函数对象或无捕获 lambda，而不是函数指针。C++20 起无捕获 lambda 可以默认构造，`unique_ptr<FILE, decltype([](FILE* f) { std::fclose(f); })>` 仍然是 8 字节。
  - 自己实现带删除器的 `UniquePtr`，怎么做到不占空间？把成员写成 `[[no_unique_address]] Deleter d_;`，或者让类继承 `Deleter`。原理见卡片 4。
  - `shared_ptr` 为什么是 16 字节？它保存两个指针：一个指向对象，一个指向控制块，控制块里有引用计数和删除器。
- **出处**：卡片 4，标准 [unique.ptr.single]，《Effective Modern C++》条款 18

</details>

### 16. std::forward 怎么实现？为什么必须显式写 `<T>`？

要点：`static_cast<T&&>(t)` 加引用折叠；实参的值类别只保存在外层推导出的 `T` 里；参数写成 `remove_reference_t<T>&` 是不可推导语境，漏写 `<T>` 直接编译失败。

<details>
<summary>展开答案</summary>

- **一句话**：`std::forward<T>(x)` 是有条件的 `move`：外层实参原本是左值，结果仍是左值；原本是右值，结果转成右值。和 `std::move` 一样，它只是编译期的类型转换，运行时没有指令。
- **往下一层**：简化实现只有一行：

  ```cpp
  template <class T>
  T&& forward(std::remove_reference_t<T>& t) noexcept {
      return static_cast<T&&>(t);
  }
  ```

  以 `template<class T> void wrap(T&& x) { sink(std::forward<T>(x)); }` 为例，推导链路如下：

  ```text
  wrap(s)，s 是左值 std::string
    (E1) T = std::string&                 转发引用接收左值
    (E2) static_cast<std::string& &&>(x)  折叠为 std::string&
    (E3) sink 收到左值，选中拷贝

  wrap(std::string{})，实参是右值
    (E1) T = std::string                  转发引用接收右值
    (E2) static_cast<std::string&&>(x)    得到将亡值
    (E3) sink 收到右值，选中移动
  ```

  整条链路只用到三条规则：转发引用的推导（左值推出 `X&`，右值推出 `X`）；引用折叠（出现一个 `&` 就是 `&`）；具名变量是左值。
- **到底层**：在 `wrap` 内部，`x` 永远是左值，实参原本的值类别只保存在 `T` 里，所以必须把 `T` 显式传给 `forward`。参数写成 `remove_reference_t<T>&` 有两个作用：
  - 它是不可推导语境，漏写 `<T>` 会编译失败。如果写成普通的 `T&`，`forward(x)` 会推出 `T = std::string`，悄悄把左值转成右值。
  - `T` 是 `X&` 或 `X` 时，参数都是 `X&`，总能绑定左值 `x`。

  标准见 [forward]、[temp.deduct.call]/3 和 [dcl.ref]/6。
- **追问**：
  - `std::move` 的实现里为什么要加 `remove_reference_t`？如果写成 `static_cast<T&&>(t)`，传入左值时 `T = X&`，结果折叠成 `X&`，没有转成右值。
  - 为什么不能用 `forward` 全面代替 `move`？`forward` 要写类型实参，写成 `std::forward<X&>(x)` 也能编译，结果是悄悄拷贝。名字还表达意图：`move` 表示“可以拿走”，`forward` 表示“按原来的值类别转交”。
  - 完整的 `std::forward` 还有第二个重载，接收右值，用 `static_assert` 拒绝把右值转成左值引用。只有直接写 `std::forward<X>(make())` 时才会用到它。
  - 泛型 lambda 的 `auto&&` 没有可写的 `T`，怎么转发？写成 `std::forward<decltype(x)>(x)`，或者在 C++20 里写 `[]<class T>(T&& x)`。
- **出处**：[C++ 移动语义 · 第 8 节](/blog/cpp-move-semantics/)，《Effective Modern C++》条款 23、28

</details>

### 17. 怎样判断 `T&&` 是转发引用还是右值引用？

要点：两个条件缺一不可，一是本次调用发生类型推导，二是形式恰好是 `T&&` 或 `auto&&`；`const T&&`、`vector<T>&&` 和类模板成员 `push_back(T&&)` 都只是右值引用。

<details>
<summary>展开答案</summary>

- **一句话**：转发引用必须同时满足两个条件：这次调用或初始化会推导 `T`；参数的形式恰好是 `T&&`（或 `auto&&`），不能带任何修饰。少一个条件，就只是普通的右值引用。
- **往下一层**：

  | 写法 | 推导了吗 | 形式恰好是 `T&&` 吗 | 结论 |
  | --- | --- | --- | --- |
  | `auto&& a = f();` | 是 | 是 | 转发引用 |
  | `template<class T> void g(const T&&)` | 是 | 否，多了 `const` | 右值引用 |
  | `template<class T> void h(std::vector<T>&&)` | 是 | 否 | 右值引用 |
  | `vector<T>::push_back(T&&)` | 否，`T` 在类实例化时已经确定 | 是 | 右值引用 |
  | `template<class... Args> void emplace_back(Args&&...)` | 是，每次调用都推导 | 是 | 转发引用 |

  `const T&&` 和 `vector<T>&&` 中的 `T` 照样要推导，它们不算转发引用，是因为形式不对，而不是因为“类型已经确定”。
- **到底层**：标准 [temp.deduct.call]/3 只对“无 cv 限定的模板参数的右值引用”开了特殊规则：实参是左值时，`T` 推导成左值引用。只有满足这个形式，左值实参才能绑定上来，再经过引用折叠得到 `X&`。其他形式没有这条特殊规则，左值实参直接推导失败或匹配失败。
- **追问**：
  - 一个参数只接收 `std::string`，为什么书里还建议把 `setName` 写成模板 `T&&`，而不是写 `const std::string&` 和 `std::string&&` 两个重载？调用 `w.setName("Adela Novak")` 时，重载版本要先构造一个临时 `std::string`，再移动赋值，最后析构这个临时对象。模板版本把 `const char(&)[12]` 原样转发，直接调用 `string::operator=(const char*)`。参数有 n 个时，重载版本还需要 2^n 个函数。
  - 模板版本的代价是什么？转发引用几乎能精确匹配任何实参，会抢走重载。比如 `Person` 有模板构造函数时，拷贝一个非 `const` 的 `Person`，选中的是模板。C++20 可以用 `requires std::constructible_from<std::string, T>` 约束它。
  - 加了这个约束就安全了吗？不一定。如果 `Person` 有 `operator std::string() const`，`constructible_from<std::string, Person&>` 也成立，非 `const` 拷贝又会选中模板，而且能编译通过，名字从转换结果构造出来，劫持变成静默的。派生类 `SpecialPerson` 的拷贝构造里写 `: Person(rhs)` 也一样，模板对 `const SpecialPerson&` 是精确匹配，基类拷贝构造需要派生类到基类的转换。再加一条 `!std::derived_from<std::decay_t<T>, Person>` 才能排除这两种情况。用 `decay_t` 是为了去掉引用和 cv，用 `derived_from` 而不是 `is_same` 是为了连派生类一起排除。clang 和 GCC 16 在 `-std=c++20` 下的结果一致。
  - 为什么右值引用参数在函数里要写 `move`，转发引用参数要写 `forward`？右值引用参数一定绑定右值，可以无条件转换；转发引用参数可能绑定调用方的左值，无条件 `move` 会偷走调用方的资源。两者都只在最后一次使用时写。
- **出处**：[C++ 移动语义 · 第 8 节](/blog/cpp-move-semantics/)，[C++ 类型推导](/blog/cpp-type-deduction/)，《Effective Modern C++》条款 24–27

</details>

### 18. return 的时候要不要写 std::move？

要点：返回局部变量不写，靠保证的复制消除、NRVO 和自动移动三层兜底；`return std::move(local)` 会让 NRVO 失效；C++20 起按值返回右值引用参数也会自动移动，C++17 下 GCC 16 会拷贝。

<details>
<summary>展开答案</summary>

- **一句话**：返回局部变量时不要写 `std::move`。对象省略不掉时，`return 变量名` 也会先把它当右值处理，最差也是一次移动。只有 `return` 后面不是一个可以自动移动的名字时，才需要显式写。
- **往下一层**：

  | 写法 | 实际发生 | 原因 |
  | --- | --- | --- |
  | `return String("x");` | 不拷贝也不移动 | 保证的复制消除，C++17 起 |
  | `String s; return s;` | 通常不拷贝也不移动 | NRVO，允许但不保证 |
  | `if (b) return x; return y;` | move | 省略不了，自动按右值处理 |
  | `return std::move(s);` | move | 不再是变量名，NRVO 失效 |
  | `return b ? x : y;` | copy | 条件表达式不是变量名，不触发自动移动 |
  | 参数 `String&& s`，`return s;` | C++20 起 move | 自动移动扩展到右值引用参数 |
  | 局部对象的成员，`return h.m;` | copy | `h.m` 不是变量名，要写 `std::move(h.m)` |

- **到底层**：标准 [class.copy.elision] 规定了两件事：什么情况允许省略构造，也就是 NRVO 的条件；省略不了时，哪些 `return` 表达式先按右值进行重载决议。C++20 把右值引用参数纳入后一类（[P1825](https://wg21.link/p1825)）。实测 `-std=c++17` 时，按值返回右值引用参数，GCC 16 对右值实参执行 copy，Apple clang 21 仍是 move。需要兼容旧标准的代码，要显式写 `std::move` 或 `std::forward`。`return std::move(local);` 会触发 clang 和 GCC 的 `-Wpessimizing-move` 警告。
- **追问**：
  - 《Effective Modern C++》条款 25 为什么建议 `Matrix operator+(Matrix&& lhs, const Matrix& rhs)` 写 `return std::move(lhs);`？书以 C++14 为背景，那时 `lhs` 是引用参数，不能 NRVO，也不在自动移动的范围内，`return lhs;` 会拷贝。C++20 起直接写 `return lhs;` 就会移动。这是规则变了，不是优化器变聪明了。
  - 返回类型能不能写成 `String&&`，以免产生新对象？如果引用的是函数里的局部对象，函数返回时对象已经销毁，调用方拿到的是悬空引用。返回 `String&&` 只适合把参数原样交回，比如 `String&& f(String&& s) { return std::move(s); }`，在 C++20 下，这里只写 `return s;` 会编译失败；C++23 的 P2266 把这种情况也改成了按将亡值处理。
  - 按值返回转发引用参数怎么写？写 `return std::forward<T>(x);`。C++20 起只写 `return x;` 结果相同，写 `forward` 是为了表明意图。
- **出处**：[C++ 移动语义 · 第 5 节](/blog/cpp-move-semantics/)，卡片 13，《Effective Modern C++》条款 25

</details>

### 19. 移动一定比拷贝快吗？

要点：不一定。类型没有生成移动操作、对象的数据直接存在对象内部（`std::array`、SSO 短字符串、平凡类型）、移动构造不是 `noexcept` 而调用方需要强异常保证，这三类情况里移动要么不发生，要么不比拷贝快。

<details>
<summary>展开答案</summary>

- **一句话**：移动快，是因为能把堆上的资源"偷"过来，只复制指针。没有可偷的资源，或者根本没调用到移动，就不会更快。
- **往下一层**：

  | 情况 | 例子 | 结果 |
  | --- | --- | --- |
  | 没有移动操作 | 用户声明了拷贝构造、拷贝赋值或析构函数的类 | 隐式移动不会生成，`std::move` 之后退回拷贝 |
  | 数据在对象内部 | `std::array<T, N>` | 只能逐个元素移动，O(n) |
  | 数据在对象内部 | SSO 短字符串 | 字符就存在 `string` 对象里，没有指针可偷 |
  | 数据在对象内部 | `int`、`double` 等平凡类型 | 移动就是拷贝 |
  | 移动用不上 | 移动构造不是 `noexcept`，比如 `vector` 扩容 | 为了强异常保证改用拷贝，见卡片 14 |
  | 源是左值 | `T b = a;` | 没写 `std::move`，本来就是拷贝 |

- **到底层**：隐式移动构造只在用户没有声明拷贝构造、拷贝赋值、移动赋值和析构函数时生成（[class.copy.ctor]/8）。只写了一个析构函数，类就失去了隐式移动，而且编译不会报错。
- **追问**：
  - 写泛型代码时该怎么假设？《Effective Modern C++》条款 29 的建议是：不知道具体类型时，假设移动不存在、不便宜、用不上；类型确定支持廉价移动时，再依赖它。
  - 怎样检查一个类型能不能高效移动？`static_assert(std::is_nothrow_move_constructible_v<T>)` 能确认可以不抛异常地移动；"便宜不便宜"还要看它的数据是不是在堆上。
- **出处**：[C++ 移动语义](/blog/cpp-move-semantics/)，卡片 14，《Effective Modern C++》条款 29

</details>

### 20. 完美转发什么时候会失败？

要点：五种情况：花括号初始化列表、用 `0` / `NULL` 当空指针、只声明没定义的 `static const` 整型成员、重载函数名或函数模板名、位域。前两种和后两种是推导不出或推导错了类型；第三种是引用需要地址，链接时才报错。

<details>
<summary>展开答案</summary>

- **一句话**：转发函数的参数是 `T&&`，所以只要"T 推导不出来"、"推导出的类型不对"或"实参不能绑定到引用"，转发就会失败，而直接调用目标函数却能成功。
- **往下一层**：

  | 实参 | 失败原因 | 改法 |
  | --- | --- | --- |
  | `{1, 2, 3}` | 花括号列表没有类型，是非推导语境 | `auto il = {1, 2, 3}; fwd(il);` |
  | `0`、`NULL` | 推导成整型，不再是空指针常量 | 用 `nullptr` |
  | 只声明的 `static const` 成员 | 引用要绑定对象，需要定义，链接时报 undefined symbol | 在 .cpp 里补定义，或改成 `constexpr` / `inline` |
  | 重载函数名 | 名字本身没有类型，T 推导不出 | 先存进指定类型的函数指针，或 `static_cast` |
  | 位域 | 非 `const` 引用不能绑定到位域 | 先复制到普通变量再转发 |

- **到底层**：第三种最容易答错。`static const std::size_t N = 28;` 只是声明。按值传 `f(W::N)` 时编译器直接用 28，不需要 `N` 有地址；按引用传 `fwd(W::N)` 时要绑定到 `N` 这个对象，构成 ODR-use，必须有定义。实测 Apple clang 21 在 `-O0` 下报 `Undefined symbols ... "W::N"`，`-O2` 下可能碰巧链接成功，不能依赖。而 `fwd(28)` 和 `fwd(+W::N)` 都能通过：实参是纯右值，引用绑定时编译器会在调用者的栈上造一个临时对象。
- **追问**：
  - C++17 以后还有第三种问题吗？`static constexpr` 数据成员隐式是 `inline`，类内声明即定义，没有问题；但 `static const`（不是 constexpr）仍然只是声明，`-std=c++17` 下照样链接失败。
  - 和完美转发无关也会出现吗？会。`v.push_back(W::N)` 的参数是 `const T&`，同样会链接失败。
  - 位域为什么能传给 `const T&` 参数？`const` 引用可以绑定到一个临时副本，编译器会先复制位域的值；转发引用推导出的是非 `const` 左值引用，不行。
- **出处**：《Effective Modern C++》条款 30

</details>

### 21. push_back 和 emplace_back 有什么区别？

要点：`push_back` 接收一个现成的对象，再拷贝或移动进容器；`emplace_back` 接收构造参数，直接在容器的缓冲区里构造。但 `emplace_back(T{...})` 传的是现成对象，照样会移动一次。

<details>
<summary>展开答案</summary>

- **一句话**：emplace 要传构造参数，不要传对象；传对象时它和 `push_back` 效果一样。
- **往下一层**：假设 `Tracer` 有构造函数 `Tracer(int, std::string)`：

  | 写法 | 实际发生 | 移动次数 |
  | --- | --- | --- |
  | `v.push_back(Tracer{1, "a"})` | 先造临时对象，再移动进去 | 1 |
  | `v.emplace_back(Tracer{1, "a"})` | 同上，`Args` 推导成 `Tracer`，转发给移动构造 | 1 |
  | `v.emplace_back(1, "a")` | 在缓冲区里直接调用 `Tracer(1, "a")` | 0 |

  这里的移动不是复制省略能省掉的：`Tracer{}` 先要绑定到引用参数上，已经实质化成临时对象，目标位置又在 vector 的缓冲区里。

- **到底层**：用一个计数拷贝和移动的 `Tracer` 实测（clang 和 GCC 16，`-std=c++20`），对空 vector `push_back(Tracer{})` 10 次，容量按 1、2、4、8、16 增长：

  | 情况 | copies | moves |
  | --- | --- | --- |
  | 移动构造不加 `noexcept` | 15 | 10 |
  | 加 `noexcept` | 0 | 25 |
  | 先 `reserve(10)` | 0 | 10 |
  | `reserve(10)` 后改用 `emplace_back()` | 0 | 0 |

  10 次移动来自每次放入新元素；15 是扩容时搬运的旧元素 1 + 2 + 4 + 8。`noexcept` 决定搬运旧元素用拷贝还是移动，`reserve` 消除搬运，`emplace_back` 传构造参数消除放入新元素的那次移动。

- **追问**：
  - `= default` 的移动构造是 `noexcept` 吗？取决于成员：所有成员和基类的移动构造都是 `noexcept` 时才是。只有 `std::string` 成员的类是。
  - `emplace_back` 有什么坑？它会调用 `explicit` 构造函数，比如 `std::vector<std::unique_ptr<int>> v; v.emplace_back(new int(1));` 能编译，但如果 `emplace_back` 在分配新内存时抛异常，这个裸指针就泄漏了；`push_back(std::make_unique<int>(1))` 没有这个问题。
  - 低延迟代码里怎么用？已知元素个数就先 `reserve`，构造元素用 `emplace_back` 传参数，热路径上不发生扩容和多余的移动。
- **出处**：卡片 14，《Effective Modern C++》条款 42

</details>

### 22. 字符串参数该用 string_view、const string&、string 还是 string&&？

要点：只读用 `string_view`；要存一份就按值传 `string` 再 `move`；要修改调用方的字符串用 `string&`；`string&&` 只在想强制调用方交出所有权时用。`string_view` 不拥有内容，也不保证以 `'\0'` 结尾。

<details>
<summary>展开答案</summary>

- **一句话**：先问函数要对字符串做什么：只读、存一份、还是修改调用方的那份。三种用途各有最合适的写法，不存在一种到处都最好的参数类型。
- **往下一层**：用一个超过 SSO 长度的字符串，统计构造成员 `std::string n` 时调用 `operator new` 的次数（包括实参临时对象的分配）：

  | 参数写法 | 传左值 `s` | 传临时对象 `std::string(...)` | 传字面量 |
  | --- | --- | --- | --- |
  | `const std::string&`，再拷贝给成员 | 1 | 2 | 2 |
  | `std::string` 按值，再 `move` 给成员 | 1 | 1 | 1 |
  | `std::string_view`，再构造成员 | 1 | 2 | 1 |
  | `std::string&&`，再 `move` 给成员 | 编译错误 | 1 | 1 |

  只读的函数，传字面量时 `const std::string&` 要先构造一个临时 `string`，分配 1 次；`string_view` 是 0 次。

  要存一份时，按值传参在三种实参下都只分配 1 次，代价是多一次移动；`const&` 碰到临时对象和字面量都会多分配一次；`string_view` 碰到临时对象时没法“偷”它的缓冲区，只能再拷贝一次。
- **到底层**：`string_view` 只有一个指针和一个长度，16 字节，可平凡复制，按 SysV x86-64 和 AAPCS64 的调用约定都放在两个寄存器里传递。它不拥有内容，下面的代码在临时字符串销毁后读取：

  ```cpp
  std::string a = "a string that is definitely longer than SSO";
  std::string_view sv = a + "!";   // 临时对象在这一行结束时销毁
  std::printf("%c\n", sv[0]);
  ```

  clang 编译时给出 `-Wdangling-gsl` 警告，ASan 运行时报 `heap-use-after-free`。另外，`sv.data()` 不保证以 `'\0'` 结尾，不能直接传给 `printf("%s")`、`fopen` 这类 C 接口；需要传给这类接口时，参数用 `const std::string&`，调用 `c_str()`。
- **追问**：
  - 按值传参总是更好吗？不是。给已有的成员赋值时，成员原来的容量够用，`n = s` 直接复用缓冲区，实测 0 次分配；按值版本 `n = std::move(s)` 要先构造参数，1 次分配。按值传参适合“构造时存一份”的场景，频繁调用的 setter 用 `const&` 可能更省。
  - `string&&` 版本为什么不接受左值？右值引用不能绑定到左值，调用方必须写 `std::move(s)`，这正好表达了“我把所有权交给你”。
  - 拿到 `const` 的东西想修改，能用 `const_cast` 吗？只有原对象本身不是 `const` 时才不是未定义行为，而且会让读代码的人无法相信 `const`。真需要修改，就改成接收 `string` 或 `string&`。
- **出处**：卡片 19，《Effective Modern C++》条款 41，[cppreference: std::basic_string_view](https://en.cppreference.com/w/cpp/string/basic_string_view)

</details>

## W4：智能指针与资源管理

### 23. make_shared 和 shared_ptr(new T) 有什么区别？

要点：`make_shared` 把对象和控制块放在一次分配里，`new` 的写法要两次；代价是只要还有 `weak_ptr`，整块内存就不能释放；不能指定删除器，也调用不了私有构造函数。

<details>
<summary>展开答案</summary>

- **一句话**：`shared_ptr` 需要一个控制块存引用计数。`shared_ptr<T>(new T)` 先分配对象，再分配控制块，一共两次；`make_shared<T>()` 一次分配一块内存，同时放下控制块和对象，访问时局部性也更好。
- **往下一层**：用替换的全局 `operator new` / `operator delete` 计数，对象是 1000 字节的 `Big`，clang 和 GCC 16 结果相同：

  | 情况 | 分配次数 | 最后一个 `shared_ptr` 释放时 | `weak_ptr` 释放时 |
  | --- | --- | --- | --- |
  | `shared_ptr<Big>(new Big)` | 2 | 析构对象，释放 1 块（对象） | 释放 1 块（控制块） |
  | `make_shared<Big>()` | 1 | 析构对象，释放 0 块 | 释放 1 块（整块） |

  `make_shared` 的对象和控制块在同一块内存里，对象已经析构，但只要 `weak_ptr` 还在，它就要读控制块里的计数，这块内存就不能还回去。对象很大、`weak_ptr` 活得很久时，这会占住内存。
- **到底层**：控制块里有两个计数：`shared_count` 降到 0 时析构对象，`weak_count` 降到 0 时释放控制块。两次分配时，对象所在的那块可以先释放；一次分配时，只能等两个计数都归零。
- **追问**：
  - `f(std::shared_ptr<A>(new A), g())` 会泄漏吗？C++17 之前可能会：编译器可以先执行 `new A`，再执行 `g()`，`g()` 抛异常时 `A` 就泄漏了。C++17 规定每个参数的初始化不会和其他参数交错（[expr.call]），这个问题已经消失，但 `make_shared` 仍然是更简单的写法。
  - 什么时候不能用 `make_shared`？要自定义删除器时；构造函数是 `private`、只能由类自己的工厂函数调用时；想用花括号初始化时（`make_shared` 内部用圆括号）。
  - `make_unique` 有什么好处？`unique_ptr` 没有控制块，好处只剩不写 `new`，以及和 `make_shared` 风格一致。
- **出处**：《Effective Modern C++》条款 21，[util.smartptr.shared.create]

</details>

### 24. 为什么 unique_ptr 的删除器是模板参数，shared_ptr 不是？

要点：`unique_ptr` 追求零开销，删除器写进类型里，无状态删除器不占空间，调用能内联；`shared_ptr` 已经有控制块，就把删除器类型擦除后存进控制块，删除器不同的 `shared_ptr<T>` 仍是同一个类型。

<details>
<summary>展开答案</summary>

- **一句话**：这是两种开销取舍。`unique_ptr` 要和裸指针一样小、一样快，所以删除器是类型的一部分；`shared_ptr` 本来就要在堆上分配控制块，多存一个删除器几乎不增加成本，换来的是类型更统一。
- **往下一层**：用 `fopen` 打开的文件要用 `fclose` 关闭，这是最常见的自定义删除器。clang 和 GCC 16 实测：

  | 写法 | `sizeof` | 类型 |
  | --- | --- | --- |
  | `shared_ptr<FILE>(f, 无捕获 lambda)` | 16 | `shared_ptr<FILE>` |
  | `shared_ptr<FILE>(f, &fclose)` | 16 | `shared_ptr<FILE>`，和上一行能放进同一个 `vector` |
  | `unique_ptr<FILE, 无捕获 lambda>` | 8 | 和下一行是不同的类型 |
  | `unique_ptr<FILE, int(*)(FILE*)>` | 16 | |

  `unique_ptr` 的大小随删除器变化，原理见卡片 15。
- **到底层**：`shared_ptr` 的构造函数本身是模板 `template<class Y, class D> shared_ptr(Y* p, D d)`，它在构造时创建一个知道 `Y` 和 `D` 的控制块，这个控制块继承自一个公共基类，基类有一个虚函数负责销毁对象。`shared_ptr<T>` 只保存指向基类的指针，所以类型里不需要出现 `D`，代价是销毁时多一次虚函数调用。

  同样的机制还记住了构造时的真实类型 `Y`：`shared_ptr<Base>(new Derived)` 在 `~Base` 不是虚函数时也会调用 `~Derived`，`shared_ptr<void>(new Derived)` 也一样；`unique_ptr<Base>(new Derived)` 只调用 `~Base`，这是未定义行为。实测两种编译器都是这样。
- **追问**：
  - 那基类析构函数还需要写成 `virtual` 吗？需要。只要有人用 `Base*` 裸指针构造 `shared_ptr`，或者改用 `unique_ptr`，就会出错。不要依赖这个副作用，见卡片 8。
  - `shared_ptr` 想换删除器，需要改类型吗？不需要，这正是它适合放进接口和容器的原因。
  - 自己实现带删除器的 `UniquePtr`，删除器放哪？作为模板参数，用 `[[no_unique_address]]` 成员保存。
- **出处**：卡片 8、15，《Effective Modern C++》条款 18、19

</details>

### 25. 手写 shared_ptr 最容易错在哪？

要点：拷贝构造的参数要写 `const&`；拷贝赋值要能处理自赋值；构造函数里分配计数器失败时，要删掉传进来的指针；多线程下计数要用原子操作；测试要覆盖每个特殊成员函数。

<details>
<summary>展开答案</summary>

- **一句话**：功能写对不难，难的是边界：`const` 对象能不能拷贝、`a = a` 会不会出事、分配失败会不会泄漏。面试官会一个一个追问。
- **往下一层**：下面这个朴素版本有两个错误：

  ```cpp
  template <class T> struct Naive {
    T* p_; std::size_t* cnt_;
    explicit Naive(T* p) : p_(p), cnt_(new std::size_t(1)) {}   // new 抛异常时 p 泄漏
    Naive(const Naive& o) : p_(o.p_), cnt_(o.cnt_) { ++*cnt_; }
    Naive& operator=(const Naive& o) {                            // 没处理自赋值
      release(); p_ = o.p_; cnt_ = o.cnt_; ++*cnt_; return *this;
    }
    ~Naive() { release(); }
    void release() { if (--*cnt_ == 0) { delete p_; delete cnt_; } }
  };
  ```

  实测结果（clang 和 GCC 16）：

  | 问题 | 怎么触发 | 结果 |
  | --- | --- | --- |
  | 构造函数泄漏 | 让第二次 `operator new` 抛 `bad_alloc` | 捕获异常后，被管理的对象还活着 1 个 |
  | 自赋值 | 计数为 1 时执行 `a = a` | ASan 报 `heap-use-after-free`，位置在 `operator=` |
  | 拷贝构造参数写成 `Naive&` | `const Naive<int> a(...); Naive<int> b(a);` | 编译错误 `no matching constructor` |

  修正版本：

  ```cpp
  explicit Fixed(T* p) {
    std::unique_ptr<T> hold(p);      // 计数器分配成功之前，由 hold 负责 p
    cnt_ = new std::size_t(1);
    p_ = hold.release();
  }
  Fixed& operator=(Fixed o) noexcept {  // 按值传参，再交换
    std::swap(p_, o.p_); std::swap(cnt_, o.cnt_); return *this;
  }
  ```

  修正后，同样的注入失败下存活对象为 0，`a = a` 正常，计数为 2。
- **到底层**：标准要求 `shared_ptr(Y* p)` 在分配控制块失败时执行 `delete p` 再抛出异常（[util.smartptr.shared.const]），手写版要满足同样的保证。拷贝再交换写法把“可能失败的拷贝”放在修改 `*this` 之前，自赋值时 `o` 是一份副本，计数先加 1 再减 1，所以安全。自赋值检查要比较地址 `this != &o`，不是比较 `*this == o`。
- **追问**：
  - 用 `unique_ptr` 保护传进来的指针，会不会显得奇怪？不会。实现 `shared_ptr` 时用 `unique_ptr` 管理中间状态很正常，只是不能在实现 `unique_ptr` 时这样做。
  - 测试要测哪些？构造、拷贝构造、拷贝赋值（包括自赋值）、析构各一次，并打印计数或用计数器类型确认对象只析构一次。只编译通过不算测过。
  - 多线程版本要改什么？计数改成 `std::atomic<std::size_t>`，见卡片 26。
- **出处**：《Effective Modern C++》条款 19，[util.smartptr.shared.const]

</details>

### 26. shared_ptr 是线程安全的吗？

要点：引用计数的增减是原子的，所以不同线程各自拷贝、销毁同一对象的不同 `shared_ptr` 是安全的；多个线程读写同一个 `shared_ptr` 变量不安全；它指向的对象也不受保护。

<details>
<summary>展开答案</summary>

- **一句话**：`shared_ptr` 只保证控制块是线程安全的，不保证 `shared_ptr` 变量本身，也不保证它指向的对象。
- **往下一层**：两个线程各循环 1 万次，用 clang 的 ThreadSanitizer（`-fsanitize=thread`）检查：

  | 操作 | TSan |
  | --- | --- |
  | 各自从全局 `g` 拷贝出局部 `shared_ptr` | 没有报告 |
  | 都给全局 `g` 赋新值 | 报告 data race |
  | 各自拷贝，再写 `local->v` | 报告 data race |

  第一种只修改控制块里的原子计数；第二种修改的是 `g` 自己的两个指针成员，这不是原子操作；第三种修改的是指向的对象，`shared_ptr` 不管。
- **到底层**：标准规定，不同 `shared_ptr` 实例即使共享所有权，也可以被不同线程同时修改（[util.smartptr.shared]）；同一个实例的并发修改则和普通对象一样会形成数据竞争。要让多个线程读写同一个 `shared_ptr` 变量，可以加锁，或用 C++20 的 `std::atomic<std::shared_ptr<T>>`。实测 GCC 16 能编译，`is_lock_free()` 返回 0，内部用锁实现；Apple clang 21 自带的 libc++ 还没有这个特化，编译时 `static_assert` 失败。
- **追问**：
  - 热路径上 `shared_ptr` 有什么开销？每次拷贝和销毁都是一次原子读改写，多个核同时拷贝同一个对象时，控制块所在的 cache line 会在核之间来回传递；`make_shared` 以外的写法还要多一次分配。只读使用时按 `const&` 传，不要按值传。
  - C++20 之前怎么原子地读写 `shared_ptr`？用 `std::atomic_load(&sp)`、`std::atomic_store(&sp, v)` 这些自由函数，它们在 C++20 被标为弃用。
- **出处**：[util.smartptr.shared]、[util.smartptr.atomic]，《C++ Concurrency in Action》第 5 章

</details>

### 27. Pimpl 用 unique_ptr 时，为什么析构函数要定义在 .cpp 里？

要点：头文件里的 `Impl` 是不完整类型；隐式析构函数是内联的，在销毁 `Widget` 的文件里生成；`default_delete` 用 `static_assert` 检查 `sizeof(Impl)`，类型不完整就报错；析构、构造、移动构造、移动赋值都要放到 `.cpp` 里 `Impl` 的定义之后；`shared_ptr` 没有这个问题。

<details>
<summary>展开答案</summary>

- **一句话**：`unique_ptr<Impl>` 在析构的地方才生成 `delete` 的代码，那里必须看得到 `Impl` 的定义。头文件只声明 `~Widget();`，在 `widget.cpp` 里 `Impl` 的定义之后写 `Widget::~Widget() = default;`，函数体就生成在 `Impl` 完整的地方。
- **往下一层**：`widget.h` 里只有 `struct Impl;` 和 `std::unique_ptr<Impl> impl_;`，`main.cpp` 只包含 `widget.h`，构造、移动并销毁 `Widget`。clang 21 和 GCC 16 的结果相同：

  | 头文件里的写法 | 编译 `main.cpp` |
  | --- | --- |
  | 不声明析构函数 | 报错 `invalid application of 'sizeof' to an incomplete type 'Widget::Impl'` |
  | 声明 `~Widget()` 和两个移动操作，都在 `.cpp` 里 `= default` | 通过，运行正常 |
  | 同上，但构造函数写成内联的 `Widget() {}` | 同样报错 |
  | 同上，但 `Widget(Widget&&) noexcept = default;` 写在头文件里 | 同样报错 |
  | 同上，但 `Widget& operator=(Widget&&) noexcept = default;` 写在头文件里 | 同样报错 |
  | 改用 `shared_ptr<Impl>`，不声明析构函数 | 通过，运行正常 |

  GCC 的报错是 `to incomplete type`，少一个 `an`。构造函数中途抛异常时要销毁已经构造好的成员，移动赋值要释放 `*this` 原来的 `Impl`，所以它们和析构函数一样会用到 `~unique_ptr<Impl>`。
- **到底层**：完整还是不完整，取决于某个翻译单元的某个位置有没有见过定义。`main.cpp` 从头到尾都没见过 `Impl` 的定义。直接 `delete` 一个不完整类型能编译，clang 和 GCC 都只给 `-Wdelete-incomplete` 警告，运行时 `~Impl` 不执行。[expr.delete] 规定：被删除的对象在删除处是不完整类型，而完整类型有非平凡析构函数或类专属的释放函数时，行为未定义。C++26 通过 P3144 把它改成了编译错误，clang 21 用 `-std=c++2c` 编译时报 `cannot delete pointer to incomplete type 'Impl'`。

  `default_delete<T>` 要求 `T` 是完整类型（[unique.ptr.dltr.dflt]）。两个标准库都在 `delete` 之前 `static_assert` 一个含 `sizeof(T)` 的条件，libc++ 写的是 `sizeof(T) >= 0`，libstdc++ 写的是 `sizeof(T) > 0`。条件本身总是成立，起作用的是对不完整类型求 `sizeof` 会编译失败，未定义行为就提前成了编译错误。
- **追问**：
  - 在 `main.cpp` 里先 `#include "widget.cpp"`，让 `Impl` 变完整行不行？编译能过，链接失败。`widget.cpp` 自己也会被编译一次，`Widget::value()` 等函数就有了两份定义，两种编译器都报 `duplicate symbol`，违反单一定义规则。
  - `Widget` 要能拷贝怎么办？`unique_ptr` 不能拷贝，隐式拷贝构造函数被删除，clang 报 `call to implicitly-deleted copy constructor`。在 `.cpp` 里自己写深拷贝：`Widget::Widget(const Widget& o) : impl_(std::make_unique<Impl>(*o.impl_)) {}`，实测拷贝后两个对象各自修改，互不影响。
  - `shared_ptr` 为什么不需要？它在创建时就把删除方式记进控制块。创建发生在 `widget.cpp` 的 `make_shared<Impl>()` 里，那里 `Impl` 是完整的；销毁时只调用记好的删除函数，原理见卡片 24。
  - 既然 `shared_ptr` 省事，Pimpl 为什么还用 `unique_ptr`？实现对象只属于一个 `Widget`，不值得付控制块分配和原子计数的开销。
- **出处**：卡片 24，《Effective Modern C++》条款 22，[expr.delete]、[unique.ptr.dltr.dflt]，P3144

</details>

### 28. 同一个裸指针交给两个 shared_ptr 会怎样？enable_shared_from_this 解决什么？

要点：从裸指针构造 `shared_ptr` 会新建控制块；两个控制块各自计数，对象被删两次；成员函数要交出自己的 `shared_ptr` 时，继承 `enable_shared_from_this` 并调用 `shared_from_this()`；调用时对象必须已经被 `shared_ptr` 持有，否则抛 `std::bad_weak_ptr`，在构造函数里调用也一样。

<details>
<summary>展开答案</summary>

- **一句话**：一个对象只能有一个控制块。`make_shared`、从裸指针构造、从 `unique_ptr` 构造会新建控制块；拷贝 `shared_ptr` 或从 `weak_ptr` 构造会共用原来的。`shared_from_this()` 属于后一种，它借对象里藏着的一个 `weak_ptr` 找到已有的控制块。
- **往下一层**：clang 21 和 GCC 16 的结果相同：

  | 代码 | 结果 |
  | --- | --- |
  | `Widget* raw = new Widget; std::shared_ptr<Widget> a(raw), b(raw);` | `use_count` 都是 1，`~Widget` 打印两次，ASan 报 `attempting double-free`；不开 ASan 时，进程被 macOS 的 `malloc` 检查终止 |
  | `make_shared<Session>()` 之后，成员函数里 `active.push_back(shared_from_this())` | `use_count = 2`，共用一个控制块 |
  | 栈上的 `Session local; local.start();` | 抛 `std::bad_weak_ptr` |
  | 构造函数里调用 `shared_from_this()` | 抛 `std::bad_weak_ptr`；构造完成后再调用就正常 |
  | `class S : std::enable_shared_from_this<S>`，没写 `public` | 用 `make_shared` 创建后调用，仍然抛 `std::bad_weak_ptr` |

- **到底层**：`enable_shared_from_this<T>` 里有一个 `weak_ptr<T>` 成员，标准里叫 `weak_this`，只用于说明。`shared_ptr` 的构造函数为一个对象新建控制块时，如果对象的类型有一个无歧义、可访问的 `enable_shared_from_this` 基类，就顺手让 `weak_this` 指向这个控制块（[util.smartptr.shared.const]）。`shared_from_this()` 返回 `shared_ptr<T>(weak_this)`，`weak_this` 已过期时这个构造函数抛 `bad_weak_ptr`（[util.smartptr.enab]）。

  表里后三种情况都是 `weak_this` 为空：栈上的对象从来没有控制块；构造函数执行时，`make_shared` 还没来得及设置 `weak_this`；`class` 默认私有继承，基类不可访问，构造 `shared_ptr` 时不会设置它。C++17 之前，在没有 `shared_ptr` 持有时调用 `shared_from_this()` 是未定义行为，C++17 起才规定抛异常。
- **追问**：
  - 怎样保证对象一定被 `shared_ptr` 持有？把构造函数设为 `private`，只提供返回 `shared_ptr` 的静态工厂。这时 `make_shared` 调不了私有构造函数，工厂里要写 `std::shared_ptr<T>(new T(...))`，多一次分配，见卡片 23。
  - 不想处理异常怎么办？C++17 的 `weak_from_this()` 返回 `weak_ptr`，对象没有被持有时得到空的 `weak_ptr`。实测栈上对象的 `weak_from_this().expired()` 是 1，被 `make_shared` 持有的对象是 0。
  - 异步回调里为什么常写 `shared_from_this()`？回调执行时对象可能已经被释放。回调捕获一份 `shared_ptr`，对象至少活到回调结束；只想在对象还在时执行，就捕获 `weak_from_this()`，在回调里先 `lock()`。
- **出处**：卡片 23，《Effective Modern C++》条款 19，[util.smartptr.shared.const]、[util.smartptr.enab]

</details>

### 29. weak_ptr 解决什么问题？为什么不能先 expired 再 lock？

要点：`weak_ptr` 只增加弱引用计数，不延长对象寿命；使用前用 `lock()` 换成 `shared_ptr`；`lock()` 把检查和加计数合成一个原子操作，`expired()` 之后再 `lock()` 有竞态；用来打破 `shared_ptr` 的循环引用。

<details>
<summary>展开答案</summary>

- **一句话**：`weak_ptr` 能回答“对象还在不在”，在的话临时成为主人，但它自己不拥有对象。典型用途是循环引用里不该拥有对方的那一边，以及缓存、观察者这类“对象没了就算了”的场景。
- **往下一层**：clang 21 和 GCC 16 的输出相同。先让 `w = sp`，再让 `sp` 离开作用域，前后各打印一次：

  ```text
  use_count = 1, expired = 0
  lock -> 42
  use_count = 0, expired = 1
  lock -> nullptr
  ```

  `w = sp` 之后强引用计数仍是 1。对象析构之后，`w` 还能安全地报告过期，因为控制块还在。

  父子节点互相持有，离开作用域时：

  | `Child::parent` 的类型 | 离开前 `parent.use_count()` | 离开作用域后 |
  | --- | --- | --- |
  | `shared_ptr<Parent>` | 2 | 两个析构函数都没执行，两个对象泄漏 |
  | `weak_ptr<Parent>` | 1 | `~Parent`、`~Child` 依次执行 |

- **到底层**：控制块里有强、弱两个计数。强计数归零时析构对象，弱计数也归零时才释放控制块。标准规定 `lock()` 返回 `expired() ? shared_ptr<T>() : shared_ptr<T>(*this)`，而且整个过程原子地执行（[util.smartptr.weak.obs]）。libstdc++ 用一个比较交换循环实现它：读出强计数，为 0 就返回空；不为 0 就尝试把它加 1，期间被别的线程改了就重读。

  分开写的 `if (!w.expired()) w.lock()->f();` 在两次调用之间，别的线程可能释放了最后一个 `shared_ptr`，`lock()` 返回空指针，解引用就崩溃。正确写法是 `if (auto p = w.lock()) p->f();`，`p` 活着的这段时间，对象一定不会被析构。
- **追问**：
  - 循环里哪一边用 `weak_ptr`？看谁拥有谁。父节点拥有子节点，子节点只需要能找到父节点，所以 `Child::parent` 用 `weak_ptr`。
  - `weak_ptr` 会不会让内存晚释放？对象是 `make_shared` 创建的就会：对象已经析构，但它和控制块在同一块内存里，要等最后一个 `weak_ptr` 销毁才能释放，见卡片 23。
  - `expired()` 还有用吗？有，适合只需要知道“已经没了”的地方，比如清理缓存里失效的条目。它返回 `false`，不能保证下一刻对象还在。
  - 多线程下能用 `use_count()` 做判断吗？不能，它只是某一瞬间的值，读完就可能变了。
- **出处**：卡片 23，《Effective Modern C++》条款 20，[util.smartptr.weak.obs]

</details>

### 30. 函数参数该写 shared_ptr、unique_ptr 还是引用？

要点：按函数对所有权做什么来选；只使用对象就传 `T&`、`const T&` 或 `T*`；接管所有权就按值传 `unique_ptr`；要保存一份就按值传 `shared_ptr` 再 `move`；按值传 `shared_ptr` 每次都是一对原子操作；传引用时要防止对象在调用中途被释放。

<details>
<summary>展开答案</summary>

- **一句话**：智能指针出现在参数里，表达的是“这个函数要对所有权做什么”。函数只是用一下对象，参数里就不该出现智能指针。
- **往下一层**：GotW #91 和 C++ Core Guidelines R.30–R.37 给出的写法：

  | 函数要做什么 | 参数写法 |
  | --- | --- |
  | 只使用对象 | `Widget&` 或 `const Widget&`；可能为空时用 `Widget*` |
  | 接管所有权 | `std::unique_ptr<Widget>` 按值，调用方写 `std::move` |
  | 可能让调用方的指针改指别的对象 | `std::unique_ptr<Widget>&` |
  | 保存一份，共享所有权 | `std::shared_ptr<Widget>` 按值，函数里 `std::move` 进成员 |
  | 也许保存，也许不保存 | `const std::shared_ptr<Widget>&`，需要保存时再拷贝 |

  按值传的代价来自[智能指针文章](/blog/cpp-smart-pointers/)第 7 节的测量，环境是 Apple M5 Pro、`-O2`。单线程循环调用时，参数是按值的 `shared_ptr`，每次 3.17 ns（clang）、3.14 ns（GCC 16）；换成 `const shared_ptr&` 或 `const Payload&`，都是 0.44 ns。8 个线程同时拷贝再销毁同一个 `shared_ptr`，每次 114.75 ns（clang）、249.89 ns（GCC 16）；各自拷贝自己的 `shared_ptr` 时只有 3.71 ns、3.49 ns。按值传参做的正是这一对操作。

  “保存一份”的写法，clang 和 GCC 16 实测：传左值 `a` 时，`a.use_count()` 变成 2，恰好拷贝一次；传 `std::move(b)` 时，`b` 变空，成员的计数是 1，一次拷贝都没有。
- **到底层**：`shared_ptr` 和 `unique_ptr` 都有非平凡的析构函数。按 Itanium C++ ABI，按值传参时调用方在栈上放一个临时对象，传它的地址，调用返回后由调用方析构，见卡片 15。所以按值传一次 `shared_ptr`，拷贝时原子加 1，析构时原子减 1；多个线程拷贝同一个对象时，还会争抢控制块所在的 cache line，见卡片 26。移动构造只是把两个指针偷过来、把源置空，不碰计数。
- **追问**：
  - 传 `const Widget&` 就一定安全吗？不一定。`render(*g_current)` 执行中途如果调用了替换 `g_current` 的函数，旧对象被释放，参数 `w` 就悬空了，两种编译器下 ASan 都报 `heap-use-after-free`。在调用链入口先 `auto pinned = g_current;`，再 `render(*pinned)`，就能正常运行。Core Guidelines 的 R.37 讲的就是这种情况。
  - `const std::unique_ptr<Widget>&` 做参数有意义吗？几乎没有。函数既不能转移也不能重置它，只能使用对象，不如直接传 `const Widget&` 或 `Widget*`，调用方也不必非得用 `unique_ptr`。
  - 工厂函数返回什么？返回 `unique_ptr`。调用方需要共享时可以直接转成 `shared_ptr`，反过来不行。
- **出处**：卡片 15、26，Herb Sutter，[GotW #91: Smart Pointer Parameters](https://herbsutter.com/2013/06/05/gotw-91-solution-smart-pointer-parameters/)，[C++ Core Guidelines：资源管理](https://isocpp.github.io/CppCoreGuidelines/CppCoreGuidelines#S-resource)

</details>
