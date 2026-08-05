---
title: C++ 项目构建工具学习路线：从 Make 到 CMake
date: 2026-07-23 16:00:00
categories:
  - [C/C++]
tags:
  - [C++工程]
  - [构建工具]
  - [CMake]
---

之前做过 `15445 Bustub`、`6.s081 xv6` 这类项目，其实已经接触过构建工具了。

比如在 `xv6` 里经常执行：

```bash
make qemu
make grade
```

在 `Bustub` 里经常执行：

```bash
mkdir build
cd build
cmake ..
make -j
```

但如果只是照着项目文档跑命令，很容易形成一种感觉：

> 我会用这些命令，但不知道它们到底在帮我做什么。

这篇文章想系统学习一下现代 `C++` 项目的构建工具，重点是把 `Make`、`CMake`、`Ninja`、依赖管理这些东西放在同一张图里理解。

<!--more-->

## 构建工具到底解决什么问题？

先不考虑工具，一个最小的 `C++` 程序可能这样编译：

```bash
g++ main.cpp -o main
```

但真实项目不会只有一个文件。它通常会有：

```text
头文件
源文件
第三方库
编译选项
链接选项
测试程序
benchmark
不同平台
Debug / Release 模式
代码生成
安装规则
```

所以构建工具本质上解决的是：

```text
从一堆源文件、配置和依赖，稳定地生成最终产物。
```

最终产物可能是：

```text
可执行文件
静态库
动态库
测试二进制
编译数据库 compile_commands.json
安装目录
打包产物
```

{% note info %}
构建工具不是 `C++` 语法的一部分，而是工程的一部分。它负责把“怎么把代码变成能运行的东西”这件事固定下来。
{% endnote %}

## 先理解编译过程

学习 `Make` 和 `CMake` 之前，要先理解 `C++` 项目的基本构建流程。

一个简单项目：

```text
demo/
  include/
    add.h
  src/
    add.cpp
    main.cpp
```

`include/add.h`：

```cpp
#pragma once

int add(int a, int b);
```

`src/add.cpp`：

```cpp
#include "add.h"

int add(int a, int b) {
    return a + b;
}
```

`src/main.cpp`：

```cpp
#include <iostream>

#include "add.h"

int main() {
    std::cout << add(1, 2) << std::endl;
    return 0;
}
```

如果不用构建工具，可以手动编译：

```bash
mkdir -p build
g++ -std=c++20 -Iinclude -c src/add.cpp -o build/add.o
g++ -std=c++20 -Iinclude -c src/main.cpp -o build/main.o
g++ build/add.o build/main.o -o build/demo
```

这里其实分成了两步：

```text
compile: .cpp -> .o
link:    .o   -> executable
```

`-Iinclude` 表示告诉编译器去哪里找头文件。

`-std=c++20` 表示使用 `C++20` 标准。

`-c` 表示只编译，不链接。

最后一步把多个 `.o` 文件链接成可执行文件。

所以构建工具做的第一件事就是把这些命令自动化。

## 头文件和源文件的关系

刚开始学构建系统时，很容易以为：

```text
.h 和 .cpp 是一一对应的。
```

但从编译器视角看，不是这样。

编译器真正编译的是 `.cpp` 文件。每个 `.cpp` 文件加上它 `#include` 进来的所有头文件，形成一个编译单元，也叫 `translation unit`。

例如：

```text
main.cpp
  -> iostream
  -> add.h
```

`main.cpp` 被编译时，`add.h` 的内容会被预处理器展开进去。

因此，头文件变化也可能导致 `.cpp` 需要重新编译。

这就是构建工具需要追踪依赖的原因：

```text
main.cpp 依赖 add.h
add.cpp  依赖 add.h
```

如果 `add.h` 变了，`main.cpp` 和 `add.cpp` 对应的 `.o` 都应该重新生成。

## Make：把命令和依赖写清楚

`Make` 是非常经典的构建工具。它的核心思想是：

```text
目标文件依赖哪些文件。
如果依赖比目标更新，就执行对应命令。
```

一个最小的 `Makefile`：

```makefile
CXX := g++
CXXFLAGS := -std=c++20 -Iinclude -Wall -Wextra

build/demo: build/main.o build/add.o
	$(CXX) build/main.o build/add.o -o build/demo

build/main.o: src/main.cpp include/add.h
	mkdir -p build
	$(CXX) $(CXXFLAGS) -c src/main.cpp -o build/main.o

build/add.o: src/add.cpp include/add.h
	mkdir -p build
	$(CXX) $(CXXFLAGS) -c src/add.cpp -o build/add.o

.PHONY: clean
clean:
	rm -rf build
```

执行：

```bash
make
```

`make` 会默认构建第一个目标，也就是 `build/demo`。

这条规则：

```makefile
build/demo: build/main.o build/add.o
	$(CXX) build/main.o build/add.o -o build/demo
```

意思是：

```text
想得到 build/demo，必须先有 build/main.o 和 build/add.o。
如果它们不存在，或者它们比 build/demo 更新，就执行下面的链接命令。
```

这里最关键的语法是：

```makefile
target: prerequisites
	recipe
```

也就是：

```text
目标: 依赖
	生成目标的命令
```

注意 `recipe` 前面通常必须是 `tab`，不是普通空格。

{% note info %}
`Make` 的核心不是“运行脚本”，而是“维护一张依赖图”。它知道哪些文件过期了，只重新构建必要的部分。
{% endnote %}

## xv6 里的 Makefile 在做什么？

`6.s081 xv6` 里直接用 `make qemu`，背后大致包含几类工作：

```text
编译 kernel 代码。
编译 user 程序。
把 user 程序打包进文件系统镜像。
链接 kernel。
启动 qemu。
```

所以 `make qemu` 不是一个单纯的“运行 qemu”命令，它会先确保内核、用户程序、文件系统镜像都已经是最新的。

这也解释了为什么改了某个 `.c` 文件后，再执行 `make qemu`，它不一定会全部重编译，而是只重编译受影响的部分。

在这类教学项目里，直接写 `Makefile` 很合适，因为：

```text
项目结构固定。
目标平台固定。
构建规则需要显式展示。
很多步骤不是标准 C++ 项目流程，比如生成镜像、启动模拟器。
```

## Make 的局限

`Make` 很直接，但大型 `C++` 项目完全手写 `Makefile` 会遇到很多问题：

```text
跨平台困难。
依赖库查找麻烦。
头文件依赖维护麻烦。
Debug / Release 配置容易混乱。
不同编译器选项差异很大。
项目拆成多个库后规则重复。
IDE 和语言服务器支持不够直接。
```

例如一个项目要同时支持：

```text
Linux + GCC
macOS + Clang
Windows + MSVC
Ninja
Unix Makefiles
Visual Studio
```

这时如果只用手写 `Makefile`，复杂度会很快上升。

于是现代 `C++` 项目通常会引入 `CMake`。

## CMake：生成构建系统的构建系统

`CMake` 不是直接替代编译器，也不一定直接替代 `make`。

更准确地说：

```text
CMake 是 meta build system。
```

它读取 `CMakeLists.txt`，然后生成真正执行构建的后端文件。

例如：

```text
CMakeLists.txt
  -> Unix Makefiles
  -> Ninja files
  -> Visual Studio project
  -> Xcode project
```

所以平时执行：

```bash
cmake ..
make -j
```

可以理解成两步：

```text
cmake ..  生成 Makefile。
make -j   根据 Makefile 真正编译。
```

如果使用 `Ninja`：

```bash
cmake -S . -B build -G Ninja
cmake --build build -j
```

可以理解成：

```text
cmake -S . -B build -G Ninja  生成 Ninja 构建文件。
cmake --build build -j        调用 Ninja 真正编译。
```

## 一个最小 CMake 项目

对前面的 `demo` 项目，可以写一个 `CMakeLists.txt`：

```cmake
cmake_minimum_required(VERSION 3.20)

project(demo LANGUAGES CXX)

add_executable(demo
    src/main.cpp
    src/add.cpp
)

target_compile_features(demo PRIVATE cxx_std_20)

target_include_directories(demo
    PRIVATE
        ${PROJECT_SOURCE_DIR}/include
)
```

构建：

```bash
cmake -S . -B build
cmake --build build -j
```

这里几个概念很重要。

### cmake_minimum_required()

```cmake
cmake_minimum_required(VERSION 3.20)
```

表示当前项目至少需要哪个版本的 `CMake`。

不要把这个版本写得特别老，因为新版本 `CMake` 的行为更清晰，现代写法也更多。

### project()

```cmake
project(demo LANGUAGES CXX)
```

定义项目名，并说明这个项目使用 `C++`。

### add_executable()

```cmake
add_executable(demo
    src/main.cpp
    src/add.cpp
)
```

定义一个可执行文件目标，名字叫 `demo`。

这里的 `demo` 不是普通变量，而是一个 `target`。

现代 `CMake` 的核心就是围绕 `target` 组织工程。

### target_compile_features()

```cmake
target_compile_features(demo PRIVATE cxx_std_20)
```

表示 `demo` 这个目标需要 `C++20`。

这比直接写：

```cmake
set(CMAKE_CXX_STANDARD 20)
```

更贴近现代 `CMake` 的风格，因为它把需求绑定到具体目标上。

### target_include_directories()

```cmake
target_include_directories(demo
    PRIVATE
        ${PROJECT_SOURCE_DIR}/include
)
```

表示编译 `demo` 时，需要把 `include/` 加入头文件搜索路径。

这对应手写命令里的：

```bash
-Iinclude
```

## 现代 CMake 的核心：target

刚开始写 `CMake` 时，最容易写成全局变量风格：

```cmake
include_directories(include)
add_compile_options(-Wall -Wextra)
link_libraries(...)
```

这些写法不是完全不能用，但大型项目里容易污染全局配置。

现代 `CMake` 更推荐围绕 `target` 写：

```cmake
target_include_directories(...)
target_compile_options(...)
target_compile_definitions(...)
target_link_libraries(...)
target_compile_features(...)
```

原因是一个项目里可能有很多目标：

```text
核心库
命令行工具
单元测试
benchmark
示例程序
代码生成工具
```

每个目标需要的头文件、编译选项、链接库都可能不同。

所以更好的组织方式是：

```text
不要把选项撒到全局。
把选项挂到需要它的 target 上。
```

{% note info %}
现代 `CMake` 的学习重点不是背命令，而是理解 `target`。一个工程由多个 `target` 组成，`target` 之间通过依赖关系连接起来。
{% endnote %}

## PRIVATE、PUBLIC、INTERFACE 是什么？

`CMake` 里经常看到：

```cmake
PRIVATE
PUBLIC
INTERFACE
```

这三个词是在描述“属性是否传递给依赖者”。

假设有一个库：

```cmake
add_library(math_utils src/add.cpp)

target_include_directories(math_utils
    PUBLIC
        ${PROJECT_SOURCE_DIR}/include
)

target_compile_features(math_utils PUBLIC cxx_std_20)
```

再有一个程序依赖它：

```cmake
add_executable(demo src/main.cpp)

target_link_libraries(demo
    PRIVATE
        math_utils
)
```

如果 `math_utils` 的头文件在 `include/`，并且使用者也需要包含这些头文件，那么 `include/` 就应该是 `PUBLIC`。

可以这样理解：

```text
PRIVATE:   只给自己用。
PUBLIC:    自己用，依赖自己的目标也要用。
INTERFACE: 自己不编译，只给依赖自己的目标用。
```

常见判断方式：

```text
如果只影响当前 target 的 .cpp，用 PRIVATE。
如果出现在当前 target 的头文件接口里，用 PUBLIC。
如果这个 target 本身不产生编译产物，只表达使用要求，用 INTERFACE。
```

例如：

```text
库内部 .cpp 需要的 include path -> PRIVATE
库 public header 需要的 include path -> PUBLIC
header-only library 的 include path -> INTERFACE
```

## 静态库和动态库

`C++` 项目通常不会把所有 `.cpp` 都直接塞进一个可执行文件，而是会拆成库。

```cmake
add_library(math_utils
    src/add.cpp
)

target_include_directories(math_utils
    PUBLIC
        ${PROJECT_SOURCE_DIR}/include
)

target_compile_features(math_utils PUBLIC cxx_std_20)

add_executable(demo src/main.cpp)

target_link_libraries(demo
    PRIVATE
        math_utils
)
```

这里的依赖关系是：

```text
demo -> math_utils
```

`CMake` 会知道：

```text
先编译 math_utils。
再编译 demo。
最后把 demo 链接到 math_utils。
```

如果没有特别指定，`add_library()` 生成静态库还是动态库，可能取决于 `BUILD_SHARED_LIBS`。

也可以显式指定：

```cmake
add_library(math_utils STATIC src/add.cpp)
add_library(math_utils SHARED src/add.cpp)
```

静态库常见后缀：

```text
.a
.lib
```

动态库常见后缀：

```text
.so
.dylib
.dll
```

对初学阶段来说，先理解一件事就够了：

```text
库也是 target，可执行文件通过 target_link_libraries() 依赖库。
```

## Debug 和 Release

构建项目时经常要区分：

```text
Debug:   保留调试信息，优化较少，方便 gdb/lldb 调试。
Release: 开启优化，性能更接近真实运行。
```

使用 `CMake` 时，可以这样配置：

```bash
cmake -S . -B build-debug -DCMAKE_BUILD_TYPE=Debug
cmake --build build-debug -j
```

或者：

```bash
cmake -S . -B build-release -DCMAKE_BUILD_TYPE=Release
cmake --build build-release -j
```

`Debug` 通常类似：

```text
-g -O0
```

`Release` 通常类似：

```text
-O3 -DNDEBUG
```

在学习性能、并发、编译器优化时，一定要注意当前构建类型。

比如一个数据竞争问题，在 `Debug` 下看起来“正常”，在 `Release` 下可能完全变成另一种行为。

## Ninja：更快的构建后端

`Ninja` 和 `Make` 一样，是真正执行构建的工具。

区别是：

```text
Makefile 通常可以人手写。
Ninja 文件通常由 CMake / Meson 等工具生成。
```

使用方式：

```bash
cmake -S . -B build -G Ninja
cmake --build build -j
```

或者直接：

```bash
ninja -C build
```

`Ninja` 的特点是简单、快、适合作为生成器后端。

很多现代 `C++` 项目会选择：

```text
CMake 负责描述项目。
Ninja 负责执行构建。
```

在使用体验上，你不一定要直接写 `build.ninja`，但要知道：

```text
cmake --build build
```

背后可能调用的是 `make`，也可能调用的是 `ninja`，取决于配置时选择的 generator。

## compile_commands.json

现代 `C++` 开发里还有一个很重要的文件：

```text
compile_commands.json
```

它记录每个源文件真实的编译命令。

例如：

```json
[
  {
    "directory": "/path/to/demo/build",
    "command": "g++ -I/path/to/demo/include -std=c++20 -c /path/to/demo/src/main.cpp",
    "file": "/path/to/demo/src/main.cpp"
  }
]
```

这个文件通常给这些工具使用：

```text
clangd
clang-tidy
clang-format 辅助工具
代码跳转
静态分析
IDE
```

用 `CMake` 生成：

```bash
cmake -S . -B build -DCMAKE_EXPORT_COMPILE_COMMANDS=ON
```

如果用 `clangd`，这个文件非常关键。没有它，语言服务器可能不知道真实的头文件路径、宏定义和编译标准，导致跳转、补全、报错都不准确。

## 第三方依赖怎么处理？

真实项目一定会依赖外部库，例如：

```text
gtest
fmt
spdlog
protobuf
grpc
boost
openssl
```

在 `CMake` 里，最理想的方式是把依赖也变成 `target`。

例如：

```cmake
find_package(fmt REQUIRED)

add_executable(demo src/main.cpp)

target_link_libraries(demo
    PRIVATE
        fmt::fmt
)
```

这里 `fmt::fmt` 就是一个导入的 `target`。

它不仅表示链接 `fmt`，还可能携带：

```text
头文件路径
编译宏
链接选项
依赖的其他库
```

也就是说，现代 `CMake` 里，依赖库最好不是一串裸路径，而是一个带使用要求的 `target`。

常见依赖管理方式包括：

```text
系统包管理器：apt、brew
C++ 包管理器：vcpkg、Conan
源码拉取：FetchContent
Git submodule
公司内部依赖管理系统
```

初学阶段不需要马上精通所有方式，但要知道它们解决的是同一个问题：

```text
第三方库从哪里来，版本如何固定，如何暴露给构建系统。
```

## FetchContent：直接拉源码参与构建

`CMake` 自带的 `FetchContent` 可以在配置阶段拉取第三方源码，并让它参与当前项目构建。

例如使用 `googletest`：

```cmake
include(FetchContent)

FetchContent_Declare(
    googletest
    GIT_REPOSITORY https://github.com/google/googletest.git
    GIT_TAG v1.14.0
)

FetchContent_MakeAvailable(googletest)

add_executable(demo_test tests/demo_test.cpp)

target_link_libraries(demo_test
    PRIVATE
        GTest::gtest_main
)
```

这样项目就可以使用 `GTest::gtest_main` 这个 `target`。

不过 `FetchContent` 也有代价：

```text
配置时可能需要网络。
依赖源码会参与当前项目构建。
大型依赖可能拖慢配置和编译。
版本升级需要谨慎。
```

所以真实工程里，`FetchContent`、`vcpkg`、`Conan`、系统包管理器都可能出现，取决于项目的历史和部署环境。

## Bustub 里的 CMake 在做什么？

`15445 Bustub` 是一个比较典型的教学型现代 `C++` 项目。

它使用 `CMake` 的原因大概是：

```text
项目由多个模块组成。
需要构建库、测试、benchmark。
需要集成 gtest。
需要统一编译选项。
需要支持 clang-tidy、格式化、sanitizer 等工具。
```

平时执行：

```bash
mkdir build
cd build
cmake ..
make -j
```

从构建系统视角看，含义是：

```text
创建 out-of-source build 目录。
CMake 读取根目录和子目录里的 CMakeLists.txt。
CMake 检查编译器、依赖和配置选项。
CMake 生成 Makefile。
make 根据依赖图编译库、测试和工具。
```

这里的 `build/` 目录是构建产物目录，不应该和源码混在一起。

更现代、更不容易出错的写法是：

```bash
cmake -S . -B build
cmake --build build -j
```

这个写法不用手动 `cd build`，也更清楚地区分：

```text
-S source directory
-B build directory
```

## 常见命令速查

配置项目：

```bash
cmake -S . -B build
```

指定 `Ninja`：

```bash
cmake -S . -B build -G Ninja
```

指定构建类型：

```bash
cmake -S . -B build -DCMAKE_BUILD_TYPE=Debug
```

生成 `compile_commands.json`：

```bash
cmake -S . -B build -DCMAKE_EXPORT_COMPILE_COMMANDS=ON
```

编译：

```bash
cmake --build build -j
```

只构建某个目标：

```bash
cmake --build build --target demo -j
```

运行测试：

```bash
ctest --test-dir build --output-on-failure
```

清理构建目录：

```bash
rm -rf build
```

如果项目使用 `Makefile`：

```bash
make
make -j
make clean
make target_name
```

如果项目使用 `Ninja`：

```bash
ninja -C build
ninja -C build demo
```

## 学习路线

如果从 `Bustub` 和 `xv6` 的基础继续往下学，可以按这个顺序：

```text
1. 手写 g++ 命令，理解编译和链接。
2. 手写一个小 Makefile，理解 target、prerequisite、recipe。
3. 阅读 xv6 Makefile，理解 make target 如何串起编译、打包和运行。
4. 写一个最小 CMakeLists.txt，构建一个可执行文件。
5. 把项目拆成 library + executable，理解 target_link_libraries()。
6. 学会 PRIVATE / PUBLIC / INTERFACE。
7. 学会 Debug / Release、compile_commands.json、Ninja generator。
8. 用 gtest 写测试，理解 enable_testing() 和 ctest。
9. 学一种依赖管理方式，比如 FetchContent 或 vcpkg。
10. 阅读 Bustub 的 CMakeLists.txt，把命令和真实工程对应起来。
```

这个顺序的关键是：

```text
不要一上来背 CMake 语法。
先理解编译、链接和依赖图。
再理解 CMake 如何把这些关系抽象成 target。
```

## Make、CMake、Ninja 怎么区分？

最后把几种工具放在一起对比：

```text
Make:
  直接执行构建规则。
  适合简单项目、教学项目、系统项目、自定义流程。

CMake:
  描述 C++ 工程结构。
  生成 Makefile、Ninja、Visual Studio 等构建文件。
  现代 C++ 项目的主流选择。

Ninja:
  快速执行构建。
  通常不手写，由 CMake 生成。

vcpkg / Conan:
  管理第三方 C++ 依赖。
  负责依赖下载、版本、编译和暴露给 CMake。

ctest:
  CMake 配套测试工具。
  负责发现和运行测试。
```

可以用一句话总结：

```text
CMake 描述项目，Ninja / Make 执行构建，vcpkg / Conan 管理依赖，ctest 运行测试。
```

## 小结

对 `C++` 项目来说，构建系统是工程能力的一部分。

只会写 `C++` 代码，但看不懂构建系统，会在很多真实项目里卡住：

```text
为什么头文件找不到？
为什么链接失败？
为什么 Debug 能跑 Release 崩？
为什么 clangd 一直报错？
为什么测试没有被编译？
为什么加了库但链接不上？
```

学习构建工具时，最重要的是把所有问题都放回这条链路：

```text
源文件
  -> 编译选项
  -> 目标文件
  -> 链接选项
  -> 库
  -> 可执行文件
  -> 测试和安装
```

先掌握这条主线，再去看 `Makefile`、`CMakeLists.txt`、`Ninja`、`vcpkg`，很多命令就不会只是黑盒了。

