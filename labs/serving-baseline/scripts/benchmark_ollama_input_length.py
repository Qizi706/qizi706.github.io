import csv
import json
import random
import statistics
import time
import urllib.request
from pathlib import Path

URL = "http://127.0.0.1:11434/api/generate"
MODEL = "qwen3:4b-instruct-2507-q4_K_M"
REPEATS = 5
OUTPUT_PATH = Path("results/ollama_input_length_scan_v2.csv")

OUTPUT_TASK = (
    "请从 1 开始输出连续递增的整数，只能用空格分隔，不要解释，也不要主动停止。"
)

WORDS = [
    "request",
    "token",
    "model",
    "cache",
    "memory",
    "scheduler",
    "prefill",
    "decode",
    "storage",
    "latency",
    "throughput",
    "attention",
]


def generate(prompt, num_predict):
    payload = {
        "model": MODEL,
        "prompt": prompt,
        "stream": False,
        "keep_alive": "10m",
        "options": {
            "temperature": 0,
            "seed": 42,
            "num_predict": num_predict,
            "num_ctx": 4096,
        },
    }

    request = urllib.request.Request(
        URL,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
    )

    start = time.perf_counter()
    with urllib.request.urlopen(request, timeout=300) as response:
        result = json.load(response)
    client_ms = (time.perf_counter() - start) * 1000

    return result, client_ms


def measure(experiment, target, run, prompt, num_predict):
    result, client_ms = generate(prompt, num_predict)

    prompt_tokens = result["prompt_eval_count"]
    output_tokens = result["eval_count"]
    prefill_ms = result["prompt_eval_duration"] / 1e6
    decode_ms = result["eval_duration"] / 1e6

    return {
        "experiment": experiment,
        "target": target,
        "run": run,
        "prompt_tokens": prompt_tokens,
        "output_tokens": output_tokens,
        "load_ms": round(result["load_duration"] / 1e6, 3),
        "prefill_ms": round(prefill_ms, 3),
        "decode_ms": round(decode_ms, 3),
        "approx_tpot_ms": round(decode_ms / output_tokens, 3),
        "decode_tokens_per_s": round(output_tokens / (decode_ms / 1000), 2),
        "total_ms": round(result["total_duration"] / 1e6, 3),
        "client_ms": round(client_ms, 3),
        "done_reason": result["done_reason"],
    }


print("Warming up model...")
generate("热身请求。请只回答：好。", 8)

rows = []

# 实验 A：只改变输入长度，输出上限固定为 32 token。
for input_words in (64, 512, 2048):
    for run in range(1, REPEATS + 1):
        nonce = time.time_ns()
        rng = random.Random(nonce)

        body = " ".join(rng.choice(WORDS) for _ in range(input_words))

        prompt = f"experiment-{nonce} {body}\n{OUTPUT_TASK}"

        row = measure(
            experiment="input_length_v2",
            target=input_words,
            run=run,
            prompt=prompt,
            num_predict=32,
        )
        rows.append(row)
        print(row)

# 实验 B：只改变输出上限，输入长度保持不变。
# for output_cap in (32, 128, 512):
#     for run in range(1, REPEATS + 1):
#         nonce = f"实验编号 {time.time_ns()}。"
#         prompt = nonce + ("系统 " * 64) + OUTPUT_TASK
#
#         row = measure(
#             experiment="output_length",
#             target=output_cap,
#             run=run,
#             prompt=prompt,
#             num_predict=output_cap,
#         )
#         rows.append(row)
#         print(row)

OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
with OUTPUT_PATH.open("w", newline="") as file:
    writer = csv.DictWriter(file, fieldnames=rows[0].keys())
    writer.writeheader()
    writer.writerows(rows)

print("\nMedian results:")
for experiment in sorted({row["experiment"] for row in rows}):
    targets = sorted({row["target"] for row in rows if row["experiment"] == experiment})

    for target in targets:
        group = [
            row
            for row in rows
            if row["experiment"] == experiment and row["target"] == target
        ]

        print(
            experiment,
            f"target={target}",
            f"prompt_tokens={statistics.median(r['prompt_tokens'] for r in group):.0f}",
            f"output_tokens={statistics.median(r['output_tokens'] for r in group):.0f}",
            f"prefill_ms={statistics.median(r['prefill_ms'] for r in group):.3f}",
            f"decode_ms={statistics.median(r['decode_ms'] for r in group):.3f}",
            f"tpot_ms={statistics.median(r['approx_tpot_ms'] for r in group):.3f}",
            f"total_ms={statistics.median(r['total_ms'] for r in group):.3f}",
        )

print(f"\nRaw results written to {OUTPUT_PATH}")
