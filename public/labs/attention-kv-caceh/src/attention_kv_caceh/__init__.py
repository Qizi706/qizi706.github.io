"""Minimal causal-attention and KV-cache experiment."""


def main() -> None:
    from attention_kv_caceh.benchmark import main as run_benchmark

    run_benchmark()
