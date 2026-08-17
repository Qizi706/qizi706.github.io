import unittest

from kv_cache_batch.summarize_batch_size import (
    BatchSummary,
    RawTiming,
    find_knee,
    summarize_samples,
)


class TestBatchSizeSummary(unittest.TestCase):
    def test_summary_uses_batch_wall_time_for_derived_metrics(self) -> None:
        samples = [
            RawTiming("sequential", 2, 128, 1, 4.0),
            RawTiming("sequential", 2, 128, 2, 4.0),
            RawTiming("batched", 2, 128, 1, 2.0),
            RawTiming("batched", 2, 128, 2, 2.0),
        ]

        summaries = summarize_samples(
            samples,
            expected_sequence_length=128,
            expected_repeats=2,
        )

        self.assertEqual(len(summaries), 1)
        summary = summaries[0]
        self.assertEqual(summary.batch_size, 2)
        self.assertAlmostEqual(summary.batch_p50_ms, 2.0)
        self.assertAlmostEqual(summary.batch_p95_ms, 2.0)
        self.assertAlmostEqual(summary.p50_per_sequence_ms, 1.0)
        self.assertAlmostEqual(summary.positions_per_second, 128_000.0)
        self.assertAlmostEqual(summary.sequential_over_batch, 2.0)
        self.assertIsNone(summary.throughput_gain)

    def test_knee_is_first_batch_below_gain_threshold(self) -> None:
        summaries = [
            self.make_summary(batch_size=1, throughput=100.0, gain=None),
            self.make_summary(batch_size=2, throughput=160.0, gain=0.60),
            self.make_summary(batch_size=4, throughput=200.0, gain=0.25),
            self.make_summary(batch_size=8, throughput=198.0, gain=-0.01),
        ]

        knee = find_knee(summaries, gain_threshold=0.10)

        self.assertEqual(knee, 8)

    @staticmethod
    def make_summary(
        *,
        batch_size: int,
        throughput: float,
        gain: float | None,
    ) -> BatchSummary:
        return BatchSummary(
            batch_size=batch_size,
            batch_p50_ms=1.0,
            batch_p95_ms=1.0,
            p50_per_sequence_ms=1.0,
            positions_per_second=throughput,
            sequential_over_batch=1.0,
            throughput_gain=gain,
        )


if __name__ == "__main__":
    unittest.main()
