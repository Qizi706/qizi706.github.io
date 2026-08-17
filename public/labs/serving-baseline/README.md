# 本地 LLM 推理服务实验产物

This directory contains the reproducibility artifacts for the experiment report
《本地 LLM 推理服务实验》.

Article:

<https://qizi706.github.io/blog/llm-inference-request-lifecycle-practice/>

## Directory structure

```text
serving-baseline/
├── scripts/
│   ├── benchmark_ollama_input_length.py
│   └── install_vllm_metal.sh
├── results/
│   ├── ollama_length_scan_v1.csv
│   └── ollama_input_length_scan_v2.csv
├── logs/
│   ├── vllm_metal_install.log
│   └── vllm_metal_server.log
└── responses/
    └── vllm_chat_completion.json
```

The directory name identifies the artifact role; each file name identifies the
runtime, workload, and revision where those details matter.

## Artifacts

- `scripts/benchmark_ollama_input_length.py`: Ollama warmup, randomized prompts, request timing, repetition, and CSV export.
- `scripts/install_vllm_metal.sh`: installation script used during the vLLM Metal bring-up.
- `results/ollama_length_scan_v1.csv`: first input-length and output-length scans.
- `results/ollama_input_length_scan_v2.csv`: corrected randomized-prompt input-length scan.
- `logs/vllm_metal_install.log`: vLLM Core installation and failed Metal release lookup.
- `logs/vllm_metal_server.log`: Metal plugin activation, model loading, KV Cache budget, warmup, and HTTP request logs.
- `responses/vllm_chat_completion.json`: successful OpenAI-compatible Chat Completion response.

## Reproduce

Run commands from this directory so generated artifacts land in the paths shown
above:

```bash
python3 scripts/benchmark_ollama_input_length.py

bash -o pipefail scripts/install_vllm_metal.sh 2>&1 |
  tee logs/vllm_metal_install.log
```

## Notes

- The benchmark used Qwen3-4B-Instruct-2507 on an Apple M5 Pro with 48 GB unified memory.
- Each steady-state configuration was run five times after warmup.
- Ollama's `prompt_eval_duration` and `eval_duration` are used as Prefill and Decode observations.
- `eval_duration / eval_count` is only an approximate TPOT, not strict streaming inter-token latency.
- The public installation log replaces the local home-directory prefix with `~`; the experimental content is otherwise unchanged.
