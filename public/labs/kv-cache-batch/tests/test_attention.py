import unittest

import numpy as np

from kv_cache_batch.attention import (
    batched_cached_attention,
    cached_attention,
    cached_attention_preallocated,
    decode_without_cache,
)

RANDOM_SEED = 42
BATCH_SIZE = 8
SEQUENCE_LENGTH = 6
D_MODEL = 4
D_K = 3
D_V = 5
RTOL = 1e-7
ATOL = 1e-8


class TestAttentionCorrectness(unittest.TestCase):
    def setUp(self) -> None:
        rng = np.random.default_rng(RANDOM_SEED)
        self.wq = rng.normal(size=(D_MODEL, D_K))
        self.wk = rng.normal(size=(D_MODEL, D_K))
        self.wv = rng.normal(size=(D_MODEL, D_V))
        self.x = rng.normal(size=(BATCH_SIZE, SEQUENCE_LENGTH, D_MODEL))

    def assert_single_sequence_result_matches_oracle(
        self,
        actual_output: np.ndarray,
        expected_output: np.ndarray,
        k_cache: np.ndarray,
        v_cache: np.ndarray,
    ) -> None:
        np.testing.assert_allclose(
            actual_output,
            expected_output,
            rtol=RTOL,
            atol=ATOL,
        )
        self.assertEqual(actual_output.shape, (SEQUENCE_LENGTH, D_V))
        self.assertEqual(k_cache.shape, (SEQUENCE_LENGTH, D_K))
        self.assertEqual(v_cache.shape, (SEQUENCE_LENGTH, D_V))

    def test_cached_attention_with_single_sequence_matches_oracle(self) -> None:
        # Arrange
        x = self.x[0]
        expected_output = decode_without_cache(x, self.wq, self.wk, self.wv)

        # Act
        actual_output, k_cache, v_cache = cached_attention(
            x,
            self.wq,
            self.wk,
            self.wv,
        )

        # Assert
        self.assert_single_sequence_result_matches_oracle(
            actual_output,
            expected_output,
            k_cache,
            v_cache,
        )

    def test_preallocated_cache_with_single_sequence_matches_oracle(self) -> None:
        # Arrange
        x = self.x[0]
        expected_output = decode_without_cache(x, self.wq, self.wk, self.wv)

        # Act
        actual_output, k_cache, v_cache = cached_attention_preallocated(
            x,
            self.wq,
            self.wk,
            self.wv,
        )

        # Assert
        self.assert_single_sequence_result_matches_oracle(
            actual_output,
            expected_output,
            k_cache,
            v_cache,
        )

    def test_batched_cache_with_independent_sequences_matches_oracle(self) -> None:
        batch_size = 2
        x = self.x[:batch_size]
        # Arrange
        expected_output = np.stack(
            [
                decode_without_cache(sequence, self.wq, self.wk, self.wv)
                for sequence in x
            ],
            axis=0,
        )

        # Act
        actual_output, k_cache, v_cache = batched_cached_attention(
            x,
            self.wq,
            self.wk,
            self.wv,
        )

        # Assert
        np.testing.assert_allclose(
            actual_output,
            expected_output,
            rtol=RTOL,
            atol=ATOL,
        )
        self.assertEqual(
            actual_output.shape,
            (batch_size, SEQUENCE_LENGTH, D_V),
        )
        self.assertEqual(
            k_cache.shape,
            (batch_size, SEQUENCE_LENGTH, D_K),
        )
        self.assertEqual(
            v_cache.shape,
            (batch_size, SEQUENCE_LENGTH, D_V),
        )

    def test_batched_path_matches_oracle_for_batch_size_scan(self) -> None:
        for batch_size in [1, 2, 4, 8]:
            with self.subTest(batch_size=batch_size):
                # Arrange
                x = self.x[:batch_size]
                expected_output = np.stack(
                    [
                        decode_without_cache(
                            sequence,
                            self.wq,
                            self.wk,
                            self.wv,
                        )
                        for sequence in x
                    ],
                    axis=0,
                )

                # Act
                actual_output, k_cache, v_cache = batched_cached_attention(
                    x,
                    self.wq,
                    self.wk,
                    self.wv,
                )

                # Assert
                np.testing.assert_allclose(
                    actual_output,
                    expected_output,
                    rtol=RTOL,
                    atol=ATOL,
                )
                self.assertEqual(
                    actual_output.shape,
                    (batch_size, SEQUENCE_LENGTH, D_V),
                )
                self.assertEqual(
                    k_cache.shape,
                    (batch_size, SEQUENCE_LENGTH, D_K),
                )
                self.assertEqual(
                    v_cache.shape,
                    (batch_size, SEQUENCE_LENGTH, D_V),
                )


if __name__ == "__main__":
    unittest.main()
