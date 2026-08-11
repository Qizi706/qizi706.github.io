# 本地 LLM 推理服务实验产物

This directory contains the reproducibility artifacts for the experiment report
《在 Apple Silicon 上运行 Qwen3-4B：本地 LLM 推理服务实验》.

Article:

https://qizi706.github.io/blog/llm-inference-request-lifecycle-practice/

## Files

- `benchmark_lengths.py`: Ollama warmup, request, timing, repetition, and CSV export logic.
- `length-results-v1.csv`: first input-length experiment and output-length experiment.
- `input-length-results-v2.csv`: corrected randomized-prompt input experiment.
- `vllm-metal-install.sh`: installation script used during the vLLM Metal bring-up.
- `vllm-metal-install.log`: vLLM Core installation and failed Metal release lookup.
- `vllm-server.log`: Metal plugin activation, model loading, KV Cache budget, warmup, and HTTP request logs.
- `vllm-response.json`: successful OpenAI-compatible Chat Completion response.

## Notes

- The benchmark used Qwen3-4B-Instruct-2507 on an Apple M5 Pro with 48 GB unified memory.
- Each steady-state configuration was run five times after warmup.
- Ollama's `prompt_eval_duration` and `eval_duration` are used as Prefill and Decode observations.
- `eval_duration / eval_count` is only an approximate TPOT, not strict streaming inter-token latency.
- The public installation log replaces the local home-directory prefix with `~`; the experimental content is otherwise unchanged.
