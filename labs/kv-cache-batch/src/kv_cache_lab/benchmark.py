import argparse
import csv
from collections.abc import Callable, Sequence
from dataclasses import dataclass
from pathlib import Path
from statistics import median
from time import perf_counter_ns
from typing import Literal

import numpy as np

from kv_cache_lab.attention import (
    batched_cached_attention,
    cached_attention,
    cached_attention_preallocated,
    decode_without_cache,
    sequential_cached_attention,
)

EXPERIMENT_CHOICES = (
    "all",
    "cache",
    "batch-length",
    "batch-size",
)
CACHE_STRATEGY_EXPERIMENT = "cache_strategy"
BATCH_LENGTH_EXPERIMENT = "batch_length_scan"
BATCH_SIZE_EXPERIMENT = "batch_size_scan"

type BenchmarkExperiment = Literal[
    "cache_strategy",
    "batch_length_scan",
    "batch_size_scan",
]
type BenchmarkPath = Literal[
    "no_cache",
    "dynamic_cache",
    "preallocated_cache",
    "sequential",
    "batched",
]

SEQUENCE_LENGTHS = (16, 32, 64, 128, 256)
WARMUP = 10
REPEATS = 30
BATCH_SIZES = (1, 2, 4, 8)
BATCH_SCAN_SEQUENCE_LENGTH = 128


@dataclass(frozen=True)
class Sample:
    experiment: BenchmarkExperiment
    path: BenchmarkPath
    batch_size: int
    sequence_length: int
    sample: int
    elapsed_ms: float


def measure(
    fn: Callable[..., object],
    *args: object,
    warmup: int = WARMUP,
    repeats: int = REPEATS,
) -> list[float]:
    for _ in range(warmup):
        fn(*args)

    samples = []
    for _ in range(repeats):
        start = perf_counter_ns()
        fn(*args)
        samples.append((perf_counter_ns() - start) / 1_000_000)

    return samples


def record_samples(
    rows: list[Sample],
    *,
    experiment: BenchmarkExperiment,
    path: BenchmarkPath,
    batch_size: int,
    sequence_length: int,
    samples: Sequence[float],
) -> None:
    rows.extend(
        Sample(
            experiment=experiment,
            path=path,
            batch_size=batch_size,
            sequence_length=sequence_length,
            sample=index,
            elapsed_ms=elapsed_ms,
        )
        for index, elapsed_ms in enumerate(samples, start=1)
    )


def make_weights(
    rng: np.random.Generator,
    *,
    d_model: int,
    d_k: int,
    d_v: int,
) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    wq = rng.normal(size=(d_model, d_k))
    wk = rng.normal(size=(d_model, d_k))
    wv = rng.normal(size=(d_model, d_v))
    return wq, wk, wv


def run_cache_benchmark(rows: list[Sample]) -> None:
    rng = np.random.default_rng(42)
    d_model = d_k = d_v = 64
    wq, wk, wv = make_weights(rng, d_model=d_model, d_k=d_k, d_v=d_v)

    print(f"{'T':>6}{'no cache/ms':>14}{'cache/ms':>12}{'preallocated/ms':>18}")

    for sequence_length in SEQUENCE_LENGTHS:
        x = rng.normal(size=(sequence_length, d_model))
        expected = decode_without_cache(x, wq, wk, wv)
        dynamic_output, _, _ = cached_attention(x, wq, wk, wv)
        preallocated_output, _, _ = cached_attention_preallocated(x, wq, wk, wv)

        np.testing.assert_allclose(expected, dynamic_output, atol=1e-8)
        np.testing.assert_allclose(expected, preallocated_output, atol=1e-8)

        paths: dict[BenchmarkPath, list[float]] = {
            "no_cache": measure(decode_without_cache, x, wq, wk, wv),
            "dynamic_cache": measure(cached_attention, x, wq, wk, wv),
            "preallocated_cache": measure(
                cached_attention_preallocated,
                x,
                wq,
                wk,
                wv,
            ),
        }

        for path, samples in paths.items():
            record_samples(
                rows,
                experiment=CACHE_STRATEGY_EXPERIMENT,
                path=path,
                batch_size=1,
                sequence_length=sequence_length,
                samples=samples,
            )

        print(
            f"{sequence_length:6d}"
            f"{median(paths['no_cache']):14.3f}"
            f"{median(paths['dynamic_cache']):12.3f}"
            f"{median(paths['preallocated_cache']):18.3f}"
        )


def run_batch_length_benchmark(rows: list[Sample], batch_size: int = 2) -> None:
    rng = np.random.default_rng(42)
    d_model = d_k = d_v = 64
    wq, wk, wv = make_weights(rng, d_model=d_model, d_k=d_k, d_v=d_v)

    print()
    print(
        f"{'B':>6}{'T':>6}{'sequential/ms':>14}{'batch/ms':>12}"
        f"{'speedup':>10}{'positions/s':>14}"
    )

    for sequence_length in SEQUENCE_LENGTHS:
        x = rng.normal(size=(batch_size, sequence_length, d_model))
        expected = np.stack(
            [decode_without_cache(sequence, wq, wk, wv) for sequence in x],
            axis=0,
        )
        actual, k_cache, v_cache = batched_cached_attention(x, wq, wk, wv)

        assert actual.shape == (batch_size, sequence_length, d_v)
        assert k_cache.shape == (batch_size, sequence_length, d_k)
        assert v_cache.shape == (batch_size, sequence_length, d_v)
        np.testing.assert_allclose(expected, actual, atol=1e-8)

        sequential_samples = measure(
            sequential_cached_attention,
            x,
            wq,
            wk,
            wv,
        )
        batched_samples = measure(
            batched_cached_attention,
            x,
            wq,
            wk,
            wv,
        )

        record_samples(
            rows,
            experiment=BATCH_LENGTH_EXPERIMENT,
            path="sequential",
            batch_size=batch_size,
            sequence_length=sequence_length,
            samples=sequential_samples,
        )
        record_samples(
            rows,
            experiment=BATCH_LENGTH_EXPERIMENT,
            path="batched",
            batch_size=batch_size,
            sequence_length=sequence_length,
            samples=batched_samples,
        )

        sequential_ms = median(sequential_samples)
        batched_ms = median(batched_samples)
        speedup = sequential_ms / batched_ms
        positions_per_second = batch_size * sequence_length / (batched_ms / 1_000)

        print(
            f"{batch_size:6d}{sequence_length:6d}{sequential_ms:14.3f}{batched_ms:12.3f}"
            f"{speedup:10.3f}{positions_per_second:14.0f}"
        )


def run_batch_size_benchmark(rows: list[Sample]) -> None:
    rng = np.random.default_rng(42)
    d_model = d_k = d_v = 64
    wq, wk, wv = make_weights(rng, d_model=d_model, d_k=d_k, d_v=d_v)

    print()
    print(
        f"{'B':>6}{'Batch P50':>12}{'Batch P95':>12}{'P50/B':>8}"
        f"{'Positions/s':>14}{'Sequential/Batch':>18}"
    )

    max_batch_size = max(BATCH_SIZES)
    sequence_length = BATCH_SCAN_SEQUENCE_LENGTH
    x_max = rng.normal(
        size=(
            max_batch_size,
            sequence_length,
            d_model,
        )
    )

    # randomize execution order
    # the final output is in order
    execution_order = list(BATCH_SIZES)
    rng.shuffle(execution_order)
    final_output = []

    for batch_size in execution_order:
        x = x_max[:batch_size].copy()
        expected = np.stack(
            [decode_without_cache(sequence, wq, wk, wv) for sequence in x],
            axis=0,
        )
        actual, k_cache, v_cache = batched_cached_attention(x, wq, wk, wv)

        assert actual.shape == (batch_size, sequence_length, d_v)
        assert k_cache.shape == (batch_size, sequence_length, d_k)
        assert v_cache.shape == (batch_size, sequence_length, d_v)
        np.testing.assert_allclose(expected, actual, atol=1e-8)

        sequential_samples = measure(
            sequential_cached_attention,
            x,
            wq,
            wk,
            wv,
        )
        batched_samples = measure(
            batched_cached_attention,
            x,
            wq,
            wk,
            wv,
        )

        record_samples(
            rows,
            experiment=BATCH_SIZE_EXPERIMENT,
            path="sequential",
            batch_size=batch_size,
            sequence_length=sequence_length,
            samples=sequential_samples,
        )
        record_samples(
            rows,
            experiment=BATCH_SIZE_EXPERIMENT,
            path="batched",
            batch_size=batch_size,
            sequence_length=sequence_length,
            samples=batched_samples,
        )

        sequential_p50_ms = median(sequential_samples)
        p50_ms = median(batched_samples)
        p95_ms = float(np.percentile(batched_samples, 95))
        p50_per_sequence = p50_ms / batch_size
        positions_per_second = batch_size * sequence_length / (p50_ms / 1_000)
        speedup = sequential_p50_ms / p50_ms

        final_output.append(
            [
                batch_size,
                p50_ms,
                p95_ms,
                p50_per_sequence,
                positions_per_second,
                speedup,
            ]
        )

    final_output.sort(key=lambda x: x[0])
    for [
        batch_size,
        p50_ms,
        p95_ms,
        p50_per_sequence,
        positions_per_second,
        speedup,
    ] in final_output:
        print(
            f"{batch_size:6d}{p50_ms:12.3f}{p95_ms:12.3f}{p50_per_sequence:8.3f}"
            f"{positions_per_second:14.3f}{speedup:18.3f}"
        )


def write_csv(path: Path, rows: Sequence[Sample]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8") as output:
        writer = csv.DictWriter(
            output,
            fieldnames=(
                "experiment",
                "path",
                "batch_size",
                "sequence_length",
                "sample",
                "elapsed_ms",
            ),
        )
        writer.writeheader()
        writer.writerows(
            {
                "experiment": row.experiment,
                "path": row.path,
                "batch_size": row.batch_size,
                "sequence_length": row.sequence_length,
                "sample": row.sample,
                "elapsed_ms": f"{row.elapsed_ms:.6f}",
            }
            for row in rows
        )


def parse_args(argv: Sequence[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Benchmark KV-cache strategies, sequence lengths, and batch sizes."
        ),
    )
    parser.add_argument(
        "--experiment",
        choices=EXPERIMENT_CHOICES,
        default="all",
    )
    parser.add_argument(
        "--csv",
        type=Path,
        help="Optional path for all raw timing samples.",
    )
    return parser.parse_args(argv)


def run_selected_experiments(
    experiment: str,
    rows: list[Sample],
) -> None:
    runners: dict[str, Callable[[list[Sample]], None]] = {
        "cache": run_cache_benchmark,
        "batch-length": run_batch_length_benchmark,
        "batch-size": run_batch_size_benchmark,
    }

    if experiment == "all":
        selected_runners = runners.values()
    else:
        selected_runners = (runners[experiment],)

    for runner in selected_runners:
        runner(rows)


def main(argv: Sequence[str] | None = None) -> None:
    args = parse_args(argv)
    rows: list[Sample] = []

    run_selected_experiments(args.experiment, rows)

    if args.csv:
        write_csv(args.csv, rows)
        print(f"\nraw samples: {args.csv}")


if __name__ == "__main__":
    main()
