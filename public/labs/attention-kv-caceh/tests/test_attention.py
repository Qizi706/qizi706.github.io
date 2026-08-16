import unittest

import numpy as np

from attention_kv_caceh.attention import (
    batched_cached_attention,
    cached_attention,
    cached_attention_preallocated,
    decode_without_cache,
)


class AttentionCorrectnessTests(unittest.TestCase):
    def setUp(self) -> None:
        rng = np.random.default_rng(42)
        self.batch_size = 2
        self.sequence_length = 6
        self.d_model = 4
        self.d_k = 3
        self.d_v = 5
        self.wq = rng.normal(size=(self.d_model, self.d_k))
        self.wk = rng.normal(size=(self.d_model, self.d_k))
        self.wv = rng.normal(size=(self.d_model, self.d_v))
        self.x = rng.normal(
            size=(self.batch_size, self.sequence_length, self.d_model)
        )

    def test_single_sequence_cache_paths_match_full_recomputation(self) -> None:
        expected = decode_without_cache(self.x[0], self.wq, self.wk, self.wv)
        dynamic_output, dynamic_k, dynamic_v = cached_attention(
            self.x[0],
            self.wq,
            self.wk,
            self.wv,
        )
        preallocated_output, preallocated_k, preallocated_v = (
            cached_attention_preallocated(
                self.x[0],
                self.wq,
                self.wk,
                self.wv,
            )
        )

        np.testing.assert_allclose(expected, dynamic_output, atol=1e-8)
        np.testing.assert_allclose(expected, preallocated_output, atol=1e-8)
        self.assertEqual(dynamic_k.shape, (self.sequence_length, self.d_k))
        self.assertEqual(dynamic_v.shape, (self.sequence_length, self.d_v))
        self.assertEqual(preallocated_k.shape, (self.sequence_length, self.d_k))
        self.assertEqual(preallocated_v.shape, (self.sequence_length, self.d_v))

    def test_batched_path_keeps_sequence_state_independent(self) -> None:
        expected = np.stack(
            [
                decode_without_cache(sequence, self.wq, self.wk, self.wv)
                for sequence in self.x
            ],
            axis=0,
        )
        actual, k_cache, v_cache = batched_cached_attention(
            self.x,
            self.wq,
            self.wk,
            self.wv,
        )

        np.testing.assert_allclose(expected, actual, atol=1e-8)
        self.assertEqual(
            k_cache.shape,
            (self.batch_size, self.sequence_length, self.d_k),
        )
        self.assertEqual(
            v_cache.shape,
            (self.batch_size, self.sequence_length, self.d_v),
        )


if __name__ == "__main__":
    unittest.main()
