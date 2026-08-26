"""Minimal causal-attention and KV-cache experiment."""


def main() -> None:
    from inference_lab.benchmark import main as run_benchmark

    run_benchmark()
