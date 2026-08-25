# Phase 1 复现包：本地 LLM Serving 请求链路与基线

这是已经通过 Checkoff 的 **Phase 1 历史复现包**，不是当前任务书。完整教学顺序、每个模块的前置条件与验收标准见[阶段 1 课程页](/learning/phase-1/)；当前学习任务从[总课程页](/learning/)进入。

## 这份复现包在课程中的位置

```text
P1-L0 模型 / 推理 / Serving 边界
  → P1-L1 请求生命周期
  → P1-L2 本地服务 Bring-up
  → P1-L3 测量契约
  → P1-L4 Input / Output Length Scan
  → P1-F  Phase 1 Checkoff
  → Phase 2 · P0 NumPy 语义热身
```

本目录只保存 P1-L2 到 P1-L4 的可运行产物。机制解释与实验叙事分别位于：

- [《LLM 推理系统从请求到返回的完整链路》](/blog/llm-inference-request-lifecycle/)
- [《本地 LLM 推理服务实验》](/blog/llm-inference-request-lifecycle-practice/)

## 目录与证据职责

```text
serving-baseline/
├── scripts/
│   ├── benchmark_ollama_input_length.py  # 长度实验、Warmup、重复与 CSV 输出
│   └── install_vllm_metal.sh             # vLLM Metal 安装过程
├── results/
│   ├── ollama_length_scan_v1.csv         # 第一版输入/输出长度扫描
│   └── ollama_input_length_scan_v2.csv   # 修正后的随机 Prompt 输入长度扫描
├── logs/
│   ├── vllm_metal_install.log            # 安装证据
│   └── vllm_metal_server.log             # 模型、Backend、KV 预算与服务启动证据
└── responses/
    └── vllm_chat_completion.json         # OpenAI-compatible 原始响应
```

## 最小复现

从本目录运行，确保生成结果落在上述路径：

```bash
python3 scripts/benchmark_ollama_input_length.py

bash -o pipefail scripts/install_vllm_metal.sh 2>&1 |
  tee logs/vllm_metal_install.log
```

## Phase 1 Checkoff

只有同时完成下面四项，才把 Phase 1 标记为通过：

1. 闭卷画出 API → Tokenizer → Scheduler → Prefill → KV Cache → Decode → Response。
2. 从干净终端启动一个本地服务，并保存可以确认模型、Runtime 和 Backend 的日志与响应。
3. 复跑至少一个长度扫描点，解释 Warmup、重复次数、控制变量和计时边界。
4. 明确 Ollama 的 `eval_duration / eval_count` 只是近似 TPOT，不是严格流式 ITL；不外推并发或尾延迟结论。

## 已冻结的实验边界

- 模型：Qwen3-4B-Instruct-2507。
- 环境：Apple M5 Pro，48 GB Unified Memory。
- Runtime：Ollama 与 vLLM Metal。
- 每个稳态配置在 Warmup 后运行五次。
- 公开安装日志仅把本机 Home 路径替换成 `~`，其余实验内容保持不变。
- Phase 1 环境不能自动代表 Phase 2；进入真实 vLLM 性能实验时必须在 S0 重新冻结版本和能力。
