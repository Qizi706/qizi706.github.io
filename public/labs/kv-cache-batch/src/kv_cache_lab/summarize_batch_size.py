import argparse
import csv
import math
import os
import tempfile
from collections import defaultdict
from collections.abc import Sequence
from dataclasses import dataclass
from pathlib import Path
from statistics import median
from typing import Literal

import numpy as np

os.environ.setdefault(
    "MPLCONFIGDIR",
    str(Path(tempfile.gettempdir()) / "kv-cache-batch-matplotlib"),
)

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.ticker import StrMethodFormatter

type ExecutionPath = Literal["sequential", "batched"]

REQUIRED_COLUMNS = {
    "experiment",
    "path",
    "batch_size",
    "sequence_length",
    "sample",
    "elapsed_ms",
}
EXPECTED_EXPERIMENT = "batch_size_scan"
EXPECTED_PATHS: tuple[ExecutionPath, ...] = ("sequential", "batched")


@dataclass(frozen=True)
class RawTiming:
    path: ExecutionPath
    batch_size: int
    sequence_length: int
    sample: int
    elapsed_ms: float


@dataclass(frozen=True)
class BatchSummary:
    batch_size: int
    batch_p50_ms: float
    batch_p95_ms: float
    p50_per_sequence_ms: float
    positions_per_second: float
    sequential_over_batch: float
    throughput_gain: float | None


def read_raw_samples(path: Path) -> list[RawTiming]:
    with path.open(newline="", encoding="utf-8") as source:
        reader = csv.DictReader(source)
        columns = set(reader.fieldnames or ())
        missing_columns = REQUIRED_COLUMNS - columns
        if missing_columns:
            missing = ", ".join(sorted(missing_columns))
            raise ValueError(f"raw CSV is missing columns: {missing}")

        samples: list[RawTiming] = []
        for line_number, row in enumerate(reader, start=2):
            if row["experiment"] != EXPECTED_EXPERIMENT:
                raise ValueError(
                    f"line {line_number}: expected experiment "
                    f"{EXPECTED_EXPERIMENT!r}, got {row['experiment']!r}"
                )

            raw_path = row["path"]
            if raw_path not in EXPECTED_PATHS:
                raise ValueError(
                    f"line {line_number}: unsupported execution path {raw_path!r}"
                )

            batch_size = int(row["batch_size"])
            sequence_length = int(row["sequence_length"])
            sample = int(row["sample"])
            elapsed_ms = float(row["elapsed_ms"])

            if batch_size <= 0 or sequence_length <= 0 or sample <= 0:
                raise ValueError(f"line {line_number}: dimensions must be positive")
            if not math.isfinite(elapsed_ms) or elapsed_ms <= 0:
                raise ValueError(
                    f"line {line_number}: elapsed_ms must be finite and positive"
                )

            samples.append(
                RawTiming(
                    path=raw_path,
                    batch_size=batch_size,
                    sequence_length=sequence_length,
                    sample=sample,
                    elapsed_ms=elapsed_ms,
                )
            )

    if not samples:
        raise ValueError("raw CSV contains no timing samples")

    return samples


def summarize_samples(
    samples: Sequence[RawTiming],
    *,
    expected_sequence_length: int,
    expected_repeats: int,
) -> list[BatchSummary]:
    sequence_lengths = {sample.sequence_length for sample in samples}
    if sequence_lengths != {expected_sequence_length}:
        raise ValueError(
            "raw CSV sequence lengths do not match the expected value: "
            f"expected {expected_sequence_length}, got {sorted(sequence_lengths)}"
        )

    grouped: dict[tuple[int, ExecutionPath], list[RawTiming]] = defaultdict(list)
    for sample in samples:
        grouped[(sample.batch_size, sample.path)].append(sample)

    batch_sizes = sorted({sample.batch_size for sample in samples})
    summaries: list[BatchSummary] = []
    previous_throughput: float | None = None

    for batch_size in batch_sizes:
        path_samples: dict[ExecutionPath, list[float]] = {}
        for execution_path in EXPECTED_PATHS:
            current_samples = grouped.get((batch_size, execution_path), [])
            sample_indices = sorted(sample.sample for sample in current_samples)
            expected_indices = list(range(1, expected_repeats + 1))
            if sample_indices != expected_indices:
                raise ValueError(
                    f"B={batch_size}, path={execution_path!r}: expected sample "
                    f"indices 1..{expected_repeats}, got {sample_indices}"
                )
            path_samples[execution_path] = [
                sample.elapsed_ms for sample in current_samples
            ]

        sequential_p50_ms = median(path_samples["sequential"])
        batch_p50_ms = median(path_samples["batched"])
        batch_p95_ms = float(np.percentile(path_samples["batched"], 95))
        p50_per_sequence_ms = batch_p50_ms / batch_size
        positions_per_second = (
            batch_size
            * expected_sequence_length
            / (batch_p50_ms / 1_000)
        )
        sequential_over_batch = sequential_p50_ms / batch_p50_ms
        throughput_gain = (
            None
            if previous_throughput is None
            else positions_per_second / previous_throughput - 1
        )

        summaries.append(
            BatchSummary(
                batch_size=batch_size,
                batch_p50_ms=batch_p50_ms,
                batch_p95_ms=batch_p95_ms,
                p50_per_sequence_ms=p50_per_sequence_ms,
                positions_per_second=positions_per_second,
                sequential_over_batch=sequential_over_batch,
                throughput_gain=throughput_gain,
            )
        )
        previous_throughput = positions_per_second

    return summaries


def find_knee(
    summaries: Sequence[BatchSummary],
    *,
    gain_threshold: float,
) -> int | None:
    return next(
        (
            summary.batch_size
            for summary in summaries
            if summary.throughput_gain is not None
            and summary.throughput_gain < gain_threshold
        ),
        None,
    )


def write_summary_csv(path: Path, summaries: Sequence[BatchSummary]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8") as output:
        writer = csv.DictWriter(
            output,
            fieldnames=(
                "batch_size",
                "batch_p50_ms",
                "batch_p95_ms",
                "p50_per_sequence_ms",
                "positions_per_second",
                "sequential_over_batch",
                "throughput_gain",
            ),
        )
        writer.writeheader()
        for summary in summaries:
            writer.writerow(
                {
                    "batch_size": summary.batch_size,
                    "batch_p50_ms": f"{summary.batch_p50_ms:.6f}",
                    "batch_p95_ms": f"{summary.batch_p95_ms:.6f}",
                    "p50_per_sequence_ms": (
                        f"{summary.p50_per_sequence_ms:.6f}"
                    ),
                    "positions_per_second": (
                        f"{summary.positions_per_second:.6f}"
                    ),
                    "sequential_over_batch": (
                        f"{summary.sequential_over_batch:.6f}"
                    ),
                    "throughput_gain": (
                        ""
                        if summary.throughput_gain is None
                        else f"{summary.throughput_gain:.6f}"
                    ),
                }
            )


def write_plots(
    output_dir: Path,
    summaries: Sequence[BatchSummary],
    *,
    sequence_length: int,
    dtype: str,
    blas_threads: int,
) -> None:
    output_dir.mkdir(parents=True, exist_ok=True)
    matplotlib.rcParams["svg.hashsalt"] = "kv-cache-batch-batch-size-scan"

    batch_sizes = [summary.batch_size for summary in summaries]
    title_context = (
        f"T={sequence_length}, dtype={dtype}, BLAS threads={blas_threads}"
    )

    latency_figure, latency_axis = plt.subplots(figsize=(7.2, 4.5))
    latency_axis.plot(
        batch_sizes,
        [summary.batch_p50_ms for summary in summaries],
        marker="o",
        linewidth=2,
        label="Batch P50",
    )
    latency_axis.plot(
        batch_sizes,
        [summary.batch_p95_ms for summary in summaries],
        marker="s",
        linewidth=2,
        label="Batch P95",
    )
    latency_axis.set_title(f"Batch latency ({title_context})")
    latency_axis.set_xlabel("Batch size (B)")
    latency_axis.set_ylabel("Wall time (ms)")
    latency_axis.set_xticks(batch_sizes)
    latency_axis.grid(alpha=0.25)
    latency_axis.legend()
    latency_figure.tight_layout()
    latency_figure.savefig(
        output_dir / "batch-latency-percentiles.svg",
        format="svg",
        metadata={"Date": None},
    )
    plt.close(latency_figure)

    throughput_figure, throughput_axis = plt.subplots(figsize=(7.2, 4.5))
    throughput_axis.plot(
        batch_sizes,
        [summary.positions_per_second for summary in summaries],
        marker="o",
        linewidth=2,
        color="#d97706",
    )
    throughput_axis.set_title(f"Batch throughput ({title_context})")
    throughput_axis.set_xlabel("Batch size (B)")
    throughput_axis.set_ylabel("Positions/s")
    throughput_axis.set_xticks(batch_sizes)
    throughput_axis.yaxis.set_major_formatter(StrMethodFormatter("{x:,.0f}"))
    throughput_axis.grid(alpha=0.25)
    throughput_figure.tight_layout()
    throughput_figure.savefig(
        output_dir / "positions-throughput.svg",
        format="svg",
        metadata={"Date": None},
    )
    plt.close(throughput_figure)


def format_summary_table(summaries: Sequence[BatchSummary]) -> str:
    lines = [
        "| B | Batch P50 / ms | Batch P95 / ms | P50/B / ms | Positions/s | Sequential/Batch |",
        "| --: | --: | --: | --: | --: | --: |",
    ]
    lines.extend(
        "| {batch_size} | {p50:.3f} | {p95:.3f} | {per_sequence:.3f} "
        "| {throughput:,.0f} | {speedup:.3f}x |".format(
            batch_size=summary.batch_size,
            p50=summary.batch_p50_ms,
            p95=summary.batch_p95_ms,
            per_sequence=summary.p50_per_sequence_ms,
            throughput=summary.positions_per_second,
            speedup=summary.sequential_over_batch,
        )
        for summary in summaries
    )
    return "\n".join(lines)


def write_conclusion(
    path: Path,
    summaries: Sequence[BatchSummary],
    *,
    sequence_length: int,
    dtype: str,
    blas_threads: int,
    gain_threshold: float,
) -> None:
    knee = find_knee(summaries, gain_threshold=gain_threshold)
    gain_lines = []
    previous_batch_size: int | None = None
    for summary in summaries:
        if summary.throughput_gain is not None and previous_batch_size is not None:
            gain_lines.append(
                f"| {previous_batch_size} → {summary.batch_size} "
                f"| {summary.throughput_gain * 100:.2f}% |"
            )
        previous_batch_size = summary.batch_size

    knee_text = (
        f"Knee: B={knee}"
        if knee is not None
        else f"Knee: Not reached in B <= {summaries[-1].batch_size}"
    )

    content = "\n".join(
        [
            "# Batch Size Scan: Knee Analysis",
            "",
            "## Protocol",
            "",
            f"- Sequence length: `T={sequence_length}`",
            f"- dtype: `{dtype}`",
            f"- BLAS threads: `{blas_threads}`",
            "- Source: `raw.csv` only",
            "",
            "## Summary",
            "",
            format_summary_table(summaries),
            "",
            "## Adjacent throughput gain",
            "",
            "| Transition | Gain |",
            "| ---: | ---: |",
            *gain_lines,
            "",
            f"Operational threshold: gain < {gain_threshold * 100:.0f}%.",
            "",
            f"**{knee_text}**",
            "",
            "Batch Wall Time measures completion of the whole batch. `P50/B` is "
            "an amortized execution cost, not per-request latency. Positions/s is "
            "the toy lab's output-position rate, not serving token throughput.",
            "",
            "This fixed-shape CPU/NumPy experiment is not Continuous Batching and "
            "does not model request arrivals, queues, padding, dynamic exits, GPU "
            "kernels, model layers, sampling, or network overhead.",
            "",
        ]
    )
    path.write_text(content, encoding="utf-8")


def parse_args(argv: Sequence[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Summarize and plot the batch-size scan raw benchmark CSV.",
    )
    parser.add_argument(
        "--input",
        type=Path,
        default=Path("results/batch-size-scan/raw.csv"),
    )
    parser.add_argument("--output-dir", type=Path)
    parser.add_argument("--sequence-length", type=int, default=128)
    parser.add_argument("--expected-repeats", type=int, default=30)
    parser.add_argument("--dtype", default="float64")
    parser.add_argument("--blas-threads", type=int, default=1)
    parser.add_argument("--gain-threshold", type=float, default=0.10)
    return parser.parse_args(argv)


def main(argv: Sequence[str] | None = None) -> None:
    args = parse_args(argv)
    output_dir = args.output_dir or args.input.parent
    samples = read_raw_samples(args.input)
    summaries = summarize_samples(
        samples,
        expected_sequence_length=args.sequence_length,
        expected_repeats=args.expected_repeats,
    )

    write_summary_csv(output_dir / "summary.csv", summaries)
    write_plots(
        output_dir,
        summaries,
        sequence_length=args.sequence_length,
        dtype=args.dtype,
        blas_threads=args.blas_threads,
    )
    write_conclusion(
        output_dir / "knee-analysis.md",
        summaries,
        sequence_length=args.sequence_length,
        dtype=args.dtype,
        blas_threads=args.blas_threads,
        gain_threshold=args.gain_threshold,
    )

    print(format_summary_table(summaries))
    knee = find_knee(summaries, gain_threshold=args.gain_threshold)
    if knee is None:
        print(f"\nKnee: Not reached in B <= {summaries[-1].batch_size}")
    else:
        print(f"\nKnee: B={knee}")
    print(f"artifacts: {output_dir}")


if __name__ == "__main__":
    main()
