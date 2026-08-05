---
title: C++ 类型转换：从 C 风格强转到四种 cast
date: 2026-05-22 20:39:00
categories:
  - [C/C++]
tags:
  - [C++特性]
---

在 C++ 中，类型转换是一个很常见但也很容易写出隐患的知识点。对于初学者来说，最熟悉的可能是 C 风格强转：

```cpp
int x = (int)3.14;
```

但是在 C++ 项目中，更推荐使用 C++ 提供的四种显式类型转换：

```cpp
static_cast<T>(expr);
dynamic_cast<T>(expr);
const_cast<T>(expr);
reinterpret_cast<T>(expr);
```

它们分别表达不同的转换意图，比 C 风格强转更清晰，也更容易在代码审查和调试时发现问题。

本文会从 C 风格强转的问题开始，依次介绍 `static_cast`、`dynamic_cast`、`const_cast` 和 `reinterpret_cast` 的使用场景、底层含义以及常见坑。

<!--more-->

## 1. 为什么不推荐 C 风格强转？

C 风格强转写法如下：

```cpp
double d = 3.14;
int x = (int)d;
```

这种写法简单，但问题是：**语义不明确**。

在 C++ 中，C 风格强转可能同时包含多种转换行为，例如：

```cpp
const int a = 10;
int *p = (int *)&a;
```

这段代码不仅把 `const int*` 转成了 `int*`，还去掉了 `const` 限定。也就是说，它可能同时做了类似 `const_cast` 和其他指针转换的事情。

C++ 更推荐把转换意图写清楚：

```cpp
static_cast<int>(d);
const_cast<int *>(&a);
reinterpret_cast<std::uintptr_t>(ptr);
```

这种代码可以立刻看出：你是在做普通类型转换、去掉 const，还是在做底层二进制解释。

因此不推荐 C 风格强转的原因就是：

> C 风格强转太粗暴，C++ cast 更明确。

---

## 2. static_cast：最常用的普通类型转换

`static_cast` 是 C++ 中最常见的类型转换。

它适合用于：

1. 基本类型转换；
2. 避免整数除法；
3. 继承体系中的向上转型；
4. 在程序员保证安全的情况下做向下转型；
5. `void*` 和具体类型指针之间的转换；
6. 枚举和整数之间的转换。

### 2.1 基本类型转换

```cpp
double d = 3.14;
int x = static_cast<int>(d);
```

结果是：

```cpp
x == 3
```

小数部分会被截断。

再比如：

```cpp
int a = 10;
double b = static_cast<double>(a);
```

这是非常普通的数值类型转换。

---

### 2.2 避免整数除法

```cpp
int a = 3;
int b = 2;

double c = a / b;
```

这里 `a / b` 会先进行整数除法，所以结果是：

```cpp
1
```

正确写法是：

```cpp
double c = static_cast<double>(a) / b;
```

结果是：

```cpp
1.5
```

这也是 `static_cast` 在项目代码和算法题中很常见的用法。

---

### 2.3 继承体系中的转换

假设有如下继承关系：

```cpp
class Base {};
class Derived : public Base {};
```

#### 子类转父类：安全

```cpp
Derived d;
Base *pb = static_cast<Base *>(&d);
```

这是安全的。因为 `Derived` 对象中一定包含一个 `Base` 子对象。

这种转换叫做向上转型，也叫 `upcast`。

实际上，这种情况下通常不需要显式写 `static_cast`：

```cpp
Base *pb = &d;
```

编译器会自动完成。

---

#### 父类转子类：可能危险

```cpp
Base *pb = new Derived;
Derived*pd = static_cast<Derived *>(pb);
```

这段代码在逻辑上是正确的，因为 `pb` 实际指向的是 `Derived` 对象。

但如果是这样：

```cpp
Base *pb = new Base;
Derived *pd = static_cast<Derived *>(pb);
```

编译器可能允许，但这是危险的。因为 `pb` 实际指向的不是 `Derived` 对象，后续通过 `pd` 访问派生类成员会导致未定义行为。

因此要记住：

> `static_cast` 做向下转型时，不会进行运行时类型检查。

如果你不确定父类指针实际指向什么类型，应该使用 `dynamic_cast`。

---

### 2.4 void\* 转具体类型指针

```cpp
int x = 10;
void *p = &x;

int *ip = static_cast<int *>(p);
```

这是允许的。

但前提是：

> 你必须保证 `p` 原来确实指向一个 `int` 对象。

如果它原来指向的是 `double`，却被你转成 `int*`，那访问结果就是错误的。

---

### 2.5 static_cast 总结

`static_cast` 适合普通、明确、编译期可判断的转换。

{% note info %}
`static_cast` 主要用于普通类型转换，例如基本类型转换、子类到父类转换、`void*` 和具体指针之间的转换等。它是编译期转换，不做运行时类型检查，所以在父类向子类转换时需要程序员保证对象真实类型正确。
{% endnote %}

---

## 3. dynamic_cast：带运行时检查的类型转换

`dynamic_cast` 主要用于继承体系中的安全向下转型。

它和 `static_cast` 最大的区别是：

> `dynamic_cast` 会在运行时检查对象的真实类型。

如果转换失败，指针会得到 `nullptr`，引用会抛出 `std::bad_cast`。

### 3.1 指针转换

```cpp
class Base {
public:
    virtual ~Base() = default;
};

class Derived : public Base {
public:
    void func() {}
};
```

注意这里 `Base` 里面有一个虚函数。

这是因为：

> dynamic_cast 要求基类是多态类型，也就是至少有一个虚函数。

例如：

```cpp
Base *pb = new Derived;

Derived *pd = dynamic_cast<Derived *>(pb);

if (pd != nullptr) {
    pd->func();
}
```

这里转换成功，因为 `pb` 实际指向的是 `Derived` 对象。

但如果是这样：

```cpp
Base *pb = new Base;

Derived *pd = dynamic_cast<Derived *>(pb);

if (pd == nullptr) {
    // 转换失败
}
```

这里转换失败，`pd` 会变成 `nullptr`。

---

### 3.2 引用转换

引用没有 `nullptr`，所以转换失败时会抛异常：

```cpp
Base b;

try {
    Derived &d = dynamic_cast<Derived &>(b);
} catch (const std::bad_cast &e) {
    // 转换失败
}
```

所以实际项目中，`dynamic_cast` 更常见的是用于指针。

---

### 3.3 dynamic_cast 总结

{% note info %}
`dynamic_cast` 主要用于继承体系中的安全向下转型。它会进行运行时类型检查，转换失败时，指针返回`nullptr`，引用抛出 `std::bad_cast`。使用它的前提是基类必须是多态类型，也就是至少有一个虚函数。
{% endnote %}

---

## 4. const_cast：去掉 const 限定

`const_cast` 主要用于去掉或者添加 `const`、`volatile` 限定。

它最常见的用法是：

```cpp
const int *p;
int *q = const_cast<int *>(p);
```

也就是说，它可以把 `const int*` 转成 `int*`。

但是要注意：

> `const_cast` 只能改变 `const` 或 `volatile` 属性，不能改变*类型本身*。

例如下面这种是不允许的：

```cpp
const int *p;
double *q = const_cast<double *>(p);
```

因为这已经不是单纯去掉 `const` 了，而是把 `int*` 转成了 `double*`。

---

### 4.1 原对象不是 const：可以修改

```cpp
int x = 10;

const int *p = &x;

int *q = const_cast<int *>(p);

*q = 20;
```

这段代码是可以的。

虽然 `p` 的类型是 `const int*`，但是它指向的原始对象 `x` 本身不是 `const`。

所以通过 `const_cast` 去掉 `const` 后，再修改 `x` 是合法的。

最终结果是：

```cpp
x == 20
```

---

### 4.2 原对象是 const：不能修改

但如果原对象本身就是 `const`，情况就不一样了：

```cpp
const int x = 10;

const int *p = &x;

int *q = const_cast<int *>(p);

*q = 20;
```

这段代码是危险的。

虽然 `const_cast` 可以通过编译，但是修改一个真正的 `const` 对象会导致未定义行为。

也就是说：

> `const_cast` 只能去掉类型上的 `const`，不能改变对象本身是不是 `const`。

---

### 4.3 const_cast 的常见场景

`const_cast` 在普通业务代码里不应该频繁出现。

它比较常见的场景是：调用一些历史遗留的 C 接口。

例如有一个函数：

```cpp
void print(char *s);
```

但是我们手里有一个 `const char*`：

```cpp
const char *str = "hello";
```

如果确定 `print` 函数内部不会修改字符串，有些代码可能会这样写：

```cpp
print(const_cast<char *>(str));
```

但这种写法仍然需要小心。

因为如果 `print` 内部真的修改了字符串，就可能产生问题。

---

### 4.4 const_cast 总结

`const_cast` 的作用很单一，就是处理 `const` 和 `volatile` 限
定。

{% note info %}
`const_cast` 主要用于去掉或者添加 `const`、`volatile` 限定。它不能改变对象的真实类型，也不能安全地修改一个本来就是`const` 的对象。如果原对象本身是 `const`，去掉 `const` 后再修改会导致未定义行为。
{% endnote %}

---

## 5. reinterpret_cast：最底层的重新解释

`reinterpret_cast` 是四种 `cast` 中最危险的一种。

它的含义是：

> 把一段内存按照另一种类型重新解释。

它不会做类型检查，也不会做安全保证。

常见用法包括：

1. 指针和整数之间的转换；
2. 不相关指针类型之间的转换；
3. 底层系统编程中对内存地址的处理。

---

### 5.1 指针转整数

```cpp
#include <cstdint>

int x = 10;

int *p = &x;

std::uintptr_t addr = reinterpret_cast<std::uintptr_t>(p);
```

这里把 `int*` 转成了一个整数类型。

`std::uintptr_t` 是一个无符号整数类型，它可以用来保存指针的值。

这种写法通常用于打印地址、保存地址，或者做一些底层调试。

---

### 5.2 整数转指针

反过来也可以把整数转回指针：

```cpp
int *p2 = reinterpret_cast<int *>(addr);
```

如果 `addr` 原来确实是从一个有效的 `int*` 转换过来的，那么再转回去通常是可以使用的。

但如果这个整数只是随便写的：

```cpp
std::uintptr_t addr = 12345;

int *p = reinterpret_cast<int *>(addr);
```

这就非常危险。

因为 `12345` 不一定是一个有效地址，访问 `p` 可能会导致程序崩溃。

---

### 5.3 不相关指针类型之间的转换

```cpp
int x = 10;

int *p = &x;

char *cp = reinterpret_cast<char *>(p);
```

这里把 `int*` 转成了 `char*`。

这种转换不是普通的类型转换，而是把同一段内存换一种方式解释。

如果通过 `char*` 按字节查看 `x` 的内容，是可以理解的：

```cpp
for (int i = 0; i < sizeof(int); ++i) {
    // 查看每一个字节
}
```

但如果随便把一个类型的指针转成另一个完全无关的类型，再去访问，就很容易出现未定义行为。

例如：

```cpp
int x = 10;

double *p = reinterpret_cast<double *>(&x);

*p = 3.14;
```

这段代码就是错误的。

因为 `x` 本来是一个 `int` 对象，却被当成 `double` 对象来访问。

---

### 5.4 reinterpret_cast 总结

`reinterpret_cast` 表达的是非常底层的转换意图。

它不是把对象变成另一个类型，而是把同一段内存按照另一个类型来解释。

{% note info %}
`reinterpret_cast` 主要用于底层指针转换，例如指针和整数之间的转换、不相关指针类型之间的转换等。它几乎不提供安全检查，普通业务代码中应该尽量避免使用。看到 `reinterpret_cast` 时，需要重点检查它是否真的有必要。
{% endnote %}

---

## 6. 四种 cast 对比

四种 `cast` 的使用场景可以简单总结成下面这样：

| 类型转换 | 主要用途 | 是否运行时检查 | 危险程度 |
| --- | --- | --- | --- |
| `static_cast` | 普通类型转换 | 否 | 较低 |
| `dynamic_cast` | 继承体系中的安全向下转型 | 是 | 较低 |
| `const_cast` | 去掉或者添加 `const`、`volatile` | 否 | 中等 |
| `reinterpret_cast` | 底层二进制重新解释 | 否 | 较高 |

如果用一句话来记：

> 能用 `static_cast` 就不要用 C 风格强转；需要运行时检查就用`dynamic_cast`；只处理`const` 就用 `const_cast`；不到底层代码不要轻易用 `reinterpret_cast`。
