---
title: C++ 线程库
date: 2026-05-20 15:54:46
categories:
  - [C/C++]
tags:
  - [C++特性]
---

## C++ 线程库解决什么问题？

C++11 开始，标准库正式引入多线程支持，主要提供：

```cpp
#include <thread>
#include <mutex>
#include <shared_mutex>
#include <condition_variable>
#include <future>
#include <atomic>
```

它解决的问题包括：

```text
1. 创建和管理线程
2. 保护共享数据
3. 线程之间通信
4. 等待异步任务结果
5. 无锁原子操作
```

C++ 线程库不是直接操作 Linux pthread，而是在标准层面提供了一套跨平台接口。

<!--more-->

## std::thread：创建线程

最基础的线程类是 `std::thread`：

```cpp
#include <iostream>
#include <thread>

void work() {
    std::cout << "hello from thread\n";
}

int main() {
    std::thread t(work);

    t.join();

    return 0;
}
```

`std::thread t(work);` 创建一个新线程执行 `work`，`t.join` 表示主线程等待子线程执行结束。

### join() 和 detach()

线程创建后，必须处理它的生命周期。

如上面的 `t.join()` 表示，当前线程等待 `t` 执行完

`t.detach()` 让线程后台运行，和当前 `std::thread` 对象分离，但是 detach() 很危险，因为线程后台运行时，如果访问了已经销毁的局部变量，就会出问题。

例如：

```cpp
void bad() {
    int x = 10;

    std::thread t([&] {
        std::cout << x << std::endl;
    });

    t.detach();
}
```

`bad()` 返回后，`x` 已经销毁，后台线程再访问 `x` 就是悬空引用。

### std::thread 析构前必须 join 或 detach

这是一个很重要的坑：

```cpp
void f() {
    std::thread t([] {
        std::cout << "hello\n";
    });
}
```

这段代码会导致程序终止，因为 `std::thread` 对象析构时，如果线程仍然是 `joinable` 状态，标准库会调用：

```cpp
std::terminate();
```

正确的写法是：

```cpp
void f() {
    std::thread t([] {
        std::cout << "hello\n";
    });

    t.join();
}
```

判断线程是否还可以 `join`：

```cpp
if (t.joinable()) {
    t.join();
}
```

## std::jthread：C++20 更安全的线程

这是 C++20 引入的特性，相比 `std::thread` 的优势是：

1. 析构时自动 join
2. 支持协作式停止 stop_token

示例：

```cpp
#include <iostream>
#include <thread>

void work() {
    std::cout << "hello from jthread\n";
}

int main() {
    std::jthread t(work); //这里不需要手动 join()，std::jthread 析构时会自动等待线程结束。

    return 0;
}
```

{% note info %}
std::thread 更基础，但容易忘记 join()；std::jthread 是 C++20 提供的更安全线程封装。
{% endnote %}

## 为什么需要锁？

多个线程访问同一个共享变量时，可能出现数据竞争，这是很基本的概念：

```cpp
#include <iostream>
#include <thread>

int counter = 0;

void add() {
    for (int i = 0; i < 100000; ++i) {
        ++counter;
    }
}

int main() {
    std::thread t1(add);
    std::thread t2(add);

    t1.join();
    t2.join();

    std::cout << counter << std::endl;
}
```

预期的结果输出是 `200000`，但实际不一定，因为 `++count` 不是原子操作，它大致包含：

```text
1. 读取 counter
2. 加 1
3. 写回 counter
```

两个线程同时执行时可能互相覆盖结果，这就是数据竞争。

## std::mutex：互斥锁

解决共享数据竞争最常见的方式是互斥锁：

```cpp
#include <iostream>
#include <thread>
#include <mutex>

int counter = 0;
std::mutex mtx;

void add() {
    for (int i = 0; i < 100000; ++i) {
        mtx.lock();
        ++counter;
        mtx.unlock();
    }
}

int main() {
    std::thread t1(add);
    std::thread t2(add);

    t1.join();
    t2.join();

    std::cout << counter << std::endl;
}
```

但是手动 lock() / unlock() 有风险，如果在临界区中抛出异常：

```cpp
mtx.lock();
// 出现异常
mtx.unlock();
```

锁可能永远无法释放，所以 C++ 更推荐 RAII 风格的锁管理器。

## std::lock_guard

`lock_guard` 是最简单的 RAII 锁：

```cpp
void add() {
    for (int i = 0; i < 100000; ++i) {
        std::lock_guard<std::mutex> lock(mtx);
        ++counter;
    }
}
```

它的逻辑是构造时加锁，析构时自动释放，不需要手动 `unlock`，它适合的场景是：锁一个 `mutex` ，作用域结束自动释放。

## std::unique_lock

`unique_lock` 比 `lock_guard` 更灵活，它支持：

```cpp
/*
1. 延迟加锁
2. 手动 unlock
3. 转移所有权
4. 配合 condition_variable
*/
std::unique_lock<std::mutex> lock(mtx);

// 可以手动解锁
lock.unlock();

// 也可以重新加锁
lock.lock();
```

它最大的常见用途是配合条件变量：

```cpp
std::condition_variable cv;
std::mutex mtx;
bool ready = false;

void worker() {
    std::unique_lock<std::mutex> lock(mtx);

    cv.wait(lock, [] {
        return ready;
    });

    std::cout << "worker running\n";
}
```

{% note info %}

### 为什么条件变量需要 unique_lock？

因为 `cv.wait(lock)` 需要在等待时临时释放锁，被唤醒后再重新加锁。`lock_guard` 做不到这个操作。
{% endnote %}

## std::scoped_lock

scoped_lock 是 C++17 引入的锁管理器，它可以同时锁多个 mutex，并避免死锁：

```cpp
std::mutex m1;
std::mutex m2;

void f() {
    std::scoped_lock lock(m1, m2);

    // 同时持有 m1 和 m2
}
```

如果两个线程分别按照下面的情况加锁，就可能造成死锁：

```cpp
// 线程 A
lock m1
lock m2

// 线程 B
lock m2
lock m1
```

`std::scoped_lock lock(m1, m2);` 内部会使用安全的多锁算法，避免这种加锁顺序导致的死锁。

简单比较：

| 工具          | 特点                               |
| ------------- | ---------------------------------- |
| `lock_guard`  | 最简单，锁一个 mutex               |
| `unique_lock` | 最灵活，可手动解锁，可配合条件变量 |
| `scoped_lock` | 可一次锁多个 mutex，避免多锁死锁   |

## std::shared_mutex 和读写锁

普通 std::mutex 是独占锁，一次只有一个线程能进入临界区。但很多场景是读多写少，多个线程同时读是安全的，但必须写独占。

C++17 提供 `std::shared_mutex` 配合 `std::unique_lock` 就可以实现这个场景：

```cpp
#include <shared_mutex>
#include <unordered_map>
#include <string>

std::unordered_map<std::string, int> cache;
std::shared_mutex mtx;

int get(const std::string& key) {
    std::shared_lock lock(mtx);  // 共享读锁

    auto it = cache.find(key);
    if (it != cache.end()) {
        return it->second;
    }

    return -1;
}

void set(const std::string& key, int value) {
    std::unique_lock lock(mtx);  // 独占写锁

    cache[key] = value;
}

/*
多个 get 可以并发执行
set 会独占锁
set 执行时不能有其他读或写
*/
```

适合读多写少的缓存、配置表、路由表等场景。

## std::condition_variable：线程间等待和通知

条件变量用于：

> 一个线程等待某个条件成立，另一个线程修改条件后通知它。

经典生产者消费者模型：

```cpp
#include <iostream>
#include <queue>
#include <thread>
#include <mutex>
#include <condition_variable>

std::queue<int> q;
std::mutex mtx;
std::condition_variable cv;

void producer() {
    for (int i = 0; i < 10; ++i) {
        {
            std::lock_guard<std::mutex> lock(mtx);
            q.push(i);
        }

        cv.notify_one();
    }
}

void consumer() {
    for (int i = 0; i < 10; ++i) {
        std::unique_lock<std::mutex> lock(mtx);

        cv.wait(lock, [] {
            return !q.empty();
        });

        int value = q.front();
        q.pop();

        std::cout << value << std::endl;
    }
}

int main() {
    std::thread t1(producer);
    std::thread t2(consumer);

    t1.join();
    t2.join();
}
```

### 为什么 wait 要用 while / 谓词？

```cpp
cv.wait(lock, [] {
    return !q.empty();
});
```

等价于：

```cpp
while (q.empty()) {
    cv.wait(lock);
}
```

不能简单写：

```cpp
if (q.empty()) {
    cv.wait(lock);
}
```

之前的 [xv6 Multithread 实验](http://localhost:4000/2026/03/27/6-s081-lab6/#%E4%B8%89barrier-moderate) 中提到过这一点，这里就简单说一下原因：

> 1. 可能虚假唤醒
> 2. 被唤醒后条件未必成立
> 3. 多个线程被唤醒后，资源可能被别人先拿走

所以条件变量永远要搭配条件检查。

## notify_one 和 notify_all

条件变量有两个通知接口：

```cpp
cv.notify_one(); //唤醒一个等待线程
cv.notify_all(); //唤醒所有等待线程
```

## std::atomic：原子操作

如果只是简单计数，可以不用 mutex，而用 `std::mutex`：

```cpp
#include <atomic>
#include <iostream>
#include <thread>

std::atomic<int> counter{0};

void add() {
    for (int i = 0; i < 100000; ++i) {
        ++counter;
    }
}

int main() {
    std::thread t1(add);
    std::thread t2(add);

    t1.join();
    t2.join();

    std::cout << counter.load() << std::endl;
}
```

`std::atomic<int>` 保证 `++count` 是原子操作，不会被其他线程打断。

适合：

> 计数器
> 状态标记
> 引用计数
> 无锁队列中的基础原语

但注意 `atomic` 不等于万能。复杂临界区仍然需要 `mutex`。

### atomic 局限性

`atomic` 并不能保证目标变量是线程安全的，只能保证单个属性的单独读或单独者写是安全的，对于复合操作无法保证线程安全，例如下面的代码：

```cpp
#include <atomic>
#include <iostream>
#include <thread>

std::atomic<int> count{0};

void foo() {
    for (int i = 0; i < 1000; i++) {
      count = count + 1;
    }
}

int main() {
    std::thread t1(foo);
    std::thread t2(foo);

    t1.join();
    t2.join();

    std::cout << count << std::endl;

    return 0;
}
```

在 `foo` 函数中，每次循环先读取 `count` 的值，然后再 `+1` 赋值回去，虽然读取和赋值都是原子操作，但是两个原子操作形成的复合操作无法保证原子性。

例如：

```cpp
t1 读取到 count = 0
t2 读取到 count = 0
t1 进行赋值操作 count = 1
t2 进行赋值操作 count = 1

结果获取到了错误值 count = 1（正确值为 2）
```

## atomic 和 mutex 怎么选？

简单规则：

| 场景                 | 选择                 |
| -------------------- | -------------------- |
| 单个整数计数         | `std::atomic<int>`   |
| bool 状态标记        | `std::atomic<bool>`  |
| 多个变量需要保持一致 | `std::mutex`         |
| 复杂容器修改         | `std::mutex`         |
| 生产者消费者阻塞等待 | `condition_variable` |
| 读多写少             | `shared_mutex`       |

例如：

```cpp
std::atomic<bool> stop{false};
```

适合做停止标志。

但如果要同时修改两个变量：

```cpp
x++;
y++;
```

并且要求它们一致，就应该用 mutex 保护整个临界区。

## std::future 和 std::async

有时候我们只是想异步执行一个任务，并拿到结果，可以用： `std::async` 和 `std::future`，例如：

```cpp
#include <future>
#include <iostream>

int calculate() {
    return 42;
}

int main() {
    std::future<int> fut = std::async(std::launch::async, calculate);

    int result = fut.get();

    std::cout << result << std::endl;
}
```

`std::async(std::launch::async, calculate);` 表示异步执行 `calculate`，`fut.get()` 会等待结果返回。

适合：

> 异步任务
> 一次性结果获取
> 不想手动管理 thread

## std::promise 和 std::future

`promise` 用于一个线程主动设置结果，另一个线程通过 `future` 获取结果。

```cpp
#include <future>
#include <iostream>
#include <thread>

void worker(std::promise<int> p) {
    p.set_value(100);
}

int main() {
    std::promise<int> p;
    std::future<int> f = p.get_future();

    std::thread t(worker, std::move(p));

    std::cout << f.get() << std::endl;

    t.join();
}
```

可以理解为：`promise` 生产结果，`future` 消费结果。

## 结尾

以下是一个完整的线程库应用示例：线程安全队列

```cpp
#include <condition_variable>
#include <mutex>
#include <queue>
#include <optional>

template <typename T>
class ThreadSafeQueue {
public:
    void push(T value) {
        {
            std::lock_guard<std::mutex> lock(mtx_);
            q_.push(std::move(value));
        }

        cv_.notify_one();
    }

    T wait_and_pop() {
        std::unique_lock<std::mutex> lock(mtx_);

        cv_.wait(lock, [this] {
            return !q_.empty();
        });

        T value = std::move(q_.front());
        q_.pop();

        return value;
    }

    std::optional<T> try_pop() {
        std::lock_guard<std::mutex> lock(mtx_);

        if (q_.empty()) {
            return std::nullopt;
        }

        T value = std::move(q_.front());
        q_.pop();

        return value;
    }

private:
    std::queue<T> q_;
    std::mutex mtx_;
    std::condition_variable cv_;
};
```
