---
title: C++ 完美转发
date: 2026-05-13 18:48:17
categories:
  - [C/C++]
tags:
  - [C++特性]
---

在理解了左值、右值和移动语义之后，继续学习一下完美转发，这些概念都看过很多次，但是每隔一段时间都会有一定遗忘，现在写下这篇文章记录一下这部分内容，方便下次复习。

<!--more-->

**完美转发就是：在模板函数里，把参数原来的“左值/右值属性”原封不动地传给另一个函数。**

它通常和这三个东西一起出现：

```cpp
T&&
std::forward<T>(x)
引用折叠
```

我们一步步来。

## 1. 先理解左值和右值

### 1.1 左值 lvalue

简单说：

> 有名字、能取地址、可以反复使用的对象，通常是左值。

```cpp
int x = 10;
```

这里 `x` 是左值。

```cpp
int y = x;
```

`x` 仍是左值。

---

### 1.2 右值 rvalue

简单说：

> 临时值、没有名字、马上就要销毁的值，通常是右值。

```cpp
10
x + 1
std::string("hello")
```

这些都是右值。

例如：

```cpp
std::string s = std::string("hello");
```

`std::string("hello")` 是一个临时对象，是右值。

---

## 2. 左值引用和右值引用

### 2.1 左值引用

```cpp
int x = 10;
int &ref = x;
```

`int&` 只能绑定到左值。

```cpp
int &a = 10; // 错误，10 是右值
```

---

### 2.2 右值引用

```cpp
int &&rref = 10;
```

`int&&` 可以绑定到右值。

```cpp
int x = 10;
int &&r = x; // 错误，x 是左值
```

但是注意一个非常重要的点：

```cpp
int &&r = 10;
```

虽然 `r` 的类型是 `int&&`，但是：

> 变量 `r` 本身是左值。

因为 r 有名字，可以取地址，可以反复使用。

```cpp
int &&r = 10;

// r 是左值
```

这一点后面特别关键，如果不理解这个知识，对完美转发的理解会比较困难（分不清是左值还是右值）。

---

## 3. 为什么需要完美转发？

假设我们有两个重载函数：

```cpp
#include <iostream>
using namespace std;

void process(int &x) {
    cout << "process lvalue\n";
}

void process(int &&x) {
    cout << "process rvalue\n";
}
```

现在直接调用：

```cpp
int a = 10;

process(a);   // lvalue
process(20);  // rvalue
```

输出：

```text
process lvalue
process rvalue
```

这就是预期的结果，没问题。

---

现在我们写一个包装函数：

```cpp
template <typename T>
void wrapper(T x) {
    process(x);
}
```

调用：

```cpp
int a = 10;

wrapper(a);
wrapper(20);
```

我们希望它输出：

```text
process lvalue
process rvalue
```

但实际会输出：

```text
process lvalue
process lvalue
```

为什么？

因为在 wrapper 里面：

```cpp
void wrapper(T x) {
    process(x);
}
```

`x` 是一个有名字的变量。

有名字就是左值。

所以不管你传进来的是左值还是右值，在函数里面 x 都是左值。

---

## 4. 完美转发

我们希望：

```cpp
wrapper(a);
```

里面调用：

```cpp
process(左值);
```

我们也希望：

```cpp
wrapper(20);
```

里面调用：

```cpp
process(右值);
```

但是普通写法会把所有参数都变成左值。

所以我们需要一种机制：

{% note info %}
传进来是左值，就继续当左值传出去；
传进来是右值，就继续当右值传出去。
{% endnote %}

这就是 **完美转发**。

---

### 4.1 完美转发标准写法

```cpp
template <typename T>
void wrapper(T &&x) {
  process(std::forward<T>(x));
}
```

重点是两个部分：

```cpp
T &&x

std::forward<T>(x)
```

这两个必须配套使用。

---

完整代码：

```cpp
#include <iostream>
#include <utility>
using namespace std;

void process(int &x) {
    cout << "process lvalue\n";
}

void process(int &&x) {
    cout << "process rvalue\n";
}

template <typename T>
void wrapper(T &&x) {
    process(std::forward<T>(x));
}

int main() {
    int a = 10;

    wrapper(a);   // process lvalue
    wrapper(20);  // process rvalue

    return 0;
}
```

输出：

```text
process lvalue
process rvalue
```

---

## 5. `T&&` 在模板里不是普通右值引用

这是最容易混的点。

当看到：

```cpp
template <typename T>
void wrapper(T &&x)
```

可能会以为 `x` 是右值引用。

但在模板参数推导场景下，T&& 有特殊含义，它叫**转发引用 forwarding reference**，也常被叫作**万能引用 universal reference**，它既可以接左值，也可以接右值。

---

## 6. `T&&` 怎么接左值？

看这个调用：

```cpp
int a = 10;
wrapper(a);
```

`a` 是左值，这时模板推导会把 `T` 推导成 `int&`。所以 `T&&` 会变成 `int& &&`，接下来发生引用折叠：

```cpp
int& &&  -> int&
```

所以最终函数参数类型是：

```cpp
int &x
```

因此可以接左值。

---

## 7. `T&&` 怎么接右值？

调用：

```cpp
wrapper(20);
```

`20` 是右值。

这时模板推导：

```cpp
T = int
```

所以：

```cpp
T&& -> int&&
```

最终函数参数类型是右值引用。

---

## 8. 引用折叠规则

这里在刚开始了解的时候感觉很迷惑，但其实不用背一大堆，记住一句话就够：

{% note info %}
只要有一个 &，结果就是 &；只有 && && 才是 &&。
{% endnote %}

完整规则：

```cpp
T&  &   -> T&
T&  &&  -> T&
T&& &   -> T&
T&& &&  -> T&&
```

简单记：

```text
左值引用优先
```

---

## 9. `std::forward` 到底做了什么？

前面说过：

```cpp
template <typename T>
void wrapper(T &&x) {
    process(x);
}
```

这里的 `x` 本身是有名字的变量，所以它永远是左值，所以我们需要：

```cpp
std::forward<T>(x)
```

它的作用是：

> 根据 `T` 的推导结果，决定把 `x` 转成左值还是右值。

如果传进来的是左值：

```cpp
int a = 10;
wrapper(a);
```

此时传入的变量 `a` 是左值，因此 `T = int&`，所以 `std::forward<T>(x)` 结果仍然是左值。

---

如果传进来的是右值：

```cpp
wrapper(20);
```

此时传入的 `20` 是右值，因此 `T = int`，所以 `std::forward<T>(x)` 结果变成右值

> std::forward<T>(x) 是“有条件的 move”：
> 原来是右值，才转成右值；原来是左值，就保持左值。

## 10. `std::move` 和 `std::forward` 的区别

`std::move(x)` 会无条件把 `x` 转成右值，它不管 x 原来是什么。

```cpp
template <typename T>
void wrapper(T &&x) {
    process(std::move(x));
}
```

这样的代码无论传入的是左值还是右值，都会被 `std::move` 强行转换成右值，于是可能调用右值版本，甚至把外部对象资源偷走。

---

`std::forward` 是有条件地转发，会保留传进来的参数的所有属性。

## 11. 一个很直观的例子：构造对象

假设有一个类：

```cpp
#include <iostream>
#include <string>
using namespace std;

class Person {
public:
    Person(const string &name) {
        cout << "copy string\n";
    }

    Person(string &&name) {
        cout << "move string\n";
    }
};
```

如果直接调用：

```cpp
string s = "Alice";

Person p1(s);             // copy string
Person p2(string("Bob")); // move string
```

没问题。

---

现在写一个工厂函数：

```cpp
template <typename T>
Person createPerson(T &&name) {
    return Person(std::forward<T>(name));
}
```

调用：

```cpp
string s = "Alice";

auto p1 = createPerson(s);              // copy string
auto p2 = createPerson(string("Bob"));  // move string
```

结果也没有问题，这就是完美转发的意义，它让工厂函数不破坏参数原来的属性。

如果工厂函数不使用 `std::forward`，那么 `p1` 和 `p2` 都会调用拷贝构造，右值信息丢失了。

---

## 12. 什么时候 `T&&` 不是万能引用？

```cpp
// 是万能引用
template <typename T>
void f(T&& x);
```

```cpp
// 不是万能引用，就是普通的右值引用
void f(int&& x);
```

```cpp
template <typename T>
class Box {
public:
    void f(T&& x);
};
```

这里要小心，如果 `T` 是类模板参数，不是在函数调用时由 `f` 推导出来的，那么 `T&&` 不一定是转发引用。

例如：

```cpp
Box<int> b;
b.f(10);  // T 已经固定为 int，所以 int&&
```

它不是通过 `f` 推导出来的。

如果想让成员函数里使用转发引用，要写成：

```cpp
template <typename T>
class Box {
public:
    template <typename U>
    void f(U&& x) {
        // U&& 才是转发引用
    }
};
```

---

## 13. 最后以一个完整的观察代码结束

```cpp
#include <iostream>
#include <utility>
using namespace std;

void func(int &x) {
    cout << "lvalue\n";
}

void func(int &&x) {
    cout << "rvalue\n";
}

template <typename T>
void badWrapper(T &&x) {
    func(x);
}

template <typename T>
void goodWrapper(T &&x) {
    func(std::forward<T>(x));
}

int main() {
    int a = 10;

    badWrapper(a);   // lvalue
    badWrapper(20);  // lvalue

    goodWrapper(a);  // lvalue
    goodWrapper(20); // rvalue
}
```
