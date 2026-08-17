"""Minimal causal-attention and KV-cache experiment."""


def main() -> None:
    from kv_cache_batch.benchmark import main as run_benchmark

    run_benchmark()
