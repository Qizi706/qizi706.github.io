import unittest

import numpy as np

from inference_lab.multi_head_attention import (
    cached_multi_head_attention,
    multi_head_causal_attention,
)

BATCH_SIZE = 2
NUM_HEADS = 3
SEQUENCE_LENGTH = 4
HEAD_DIM = 5


def make_qkv() -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    rng = np.random.default_rng(20260901)
    shape = (BATCH_SIZE, NUM_HEADS, SEQUENCE_LENGTH, HEAD_DIM)
    q, k, v = (rng.normal(size=shape) for _ in range(3))
    return q, k, v


class TestM2CCachedMHA(unittest.TestCase):
    def setUp(self) -> None:
        self.q, self.k, self.v = make_qkv()

    def test_each_step_matches_full_recompute(self) -> None:
        k_cache = None
        v_cache = None

        for token_index in range(SEQUENCE_LENGTH):
            output, weights, k_cache, v_cache = cached_multi_head_attention(
                self.q[:, :, token_index : token_index + 1],
                self.k[:, :, token_index : token_index + 1],
                self.v[:, :, token_index : token_index + 1],
                k_cache,
                v_cache,
            )
            expected_output, expected_weights = multi_head_causal_attention(
                self.q[:, :, : token_index + 1],
                self.k[:, :, : token_index + 1],
                self.v[:, :, : token_index + 1],
            )

            np.testing.assert_allclose(
                output,
                expected_output[:, :, -1:],
                atol=1e-12,
            )
            np.testing.assert_allclose(
                weights,
                expected_weights[:, :, -1:, :],
                atol=1e-12,
            )

    def test_cache_weight_and_output_shapes_and_contents(self) -> None:
        k_cache = None
        v_cache = None

        for token_index in range(SEQUENCE_LENGTH):
            output, weights, k_cache, v_cache = cached_multi_head_attention(
                self.q[:, :, token_index : token_index + 1],
                self.k[:, :, token_index : token_index + 1],
                self.v[:, :, token_index : token_index + 1],
                k_cache,
                v_cache,
            )
            current_length = token_index + 1
            self.assertEqual(
                k_cache.shape,
                (BATCH_SIZE, NUM_HEADS, current_length, HEAD_DIM),
            )
            self.assertEqual(v_cache.shape, k_cache.shape)
            self.assertEqual(
                weights.shape,
                (BATCH_SIZE, NUM_HEADS, 1, current_length),
            )
            self.assertEqual(output.shape, (BATCH_SIZE, NUM_HEADS, 1, HEAD_DIM))
            np.testing.assert_array_equal(k_cache, self.k[:, :, :current_length])
            np.testing.assert_array_equal(v_cache, self.v[:, :, :current_length])
            np.testing.assert_allclose(
                weights.sum(axis=-1),
                np.ones((BATCH_SIZE, NUM_HEADS, 1)),
                atol=1e-12,
            )

    def test_existing_cache_inputs_are_not_mutated(self) -> None:
        _, _, k_cache, v_cache = cached_multi_head_attention(
            self.q[:, :, :1],
            self.k[:, :, :1],
            self.v[:, :, :1],
        )
        original_k_cache = k_cache.copy()
        original_v_cache = v_cache.copy()

        cached_multi_head_attention(
            self.q[:, :, 1:2],
            self.k[:, :, 1:2],
            self.v[:, :, 1:2],
            k_cache,
            v_cache,
        )

        np.testing.assert_array_equal(k_cache, original_k_cache)
        np.testing.assert_array_equal(v_cache, original_v_cache)

    def test_batch_and_head_slices_are_isolated(self) -> None:
        _, _, k_cache, v_cache = cached_multi_head_attention(
            self.q[:, :, :1],
            self.k[:, :, :1],
            self.v[:, :, :1],
        )
        baseline = cached_multi_head_attention(
            self.q[:, :, 1:2],
            self.k[:, :, 1:2],
            self.v[:, :, 1:2],
            k_cache,
            v_cache,
        )

        changed_q = self.q[:, :, 1:2].copy()
        changed_k = self.k[:, :, 1:2].copy()
        changed_v = self.v[:, :, 1:2].copy()
        changed_q[1, 2] *= -3.0
        changed_k[1, 2] += 7.0
        changed_v[1, 2] -= 11.0
        changed = cached_multi_head_attention(
            changed_q,
            changed_k,
            changed_v,
            k_cache,
            v_cache,
        )

        unchanged = np.ones((BATCH_SIZE, NUM_HEADS), dtype=bool)
        unchanged[1, 2] = False
        for baseline_value, changed_value in zip(baseline, changed, strict=True):
            np.testing.assert_allclose(
                changed_value[unchanged],
                baseline_value[unchanged],
                atol=1e-12,
            )
        self.assertFalse(np.allclose(changed[0][1, 2], baseline[0][1, 2]))

    def test_invalid_contracts_raise_value_error(self) -> None:
        current_q = self.q[:, :, :1]
        current_k = self.k[:, :, :1]
        current_v = self.v[:, :, :1]
        cache_shape = (BATCH_SIZE, NUM_HEADS, 2, HEAD_DIM)
        valid_k_cache = np.zeros(cache_shape, dtype=np.float64)
        valid_v_cache = np.zeros(cache_shape, dtype=np.float64)
        cases = (
            lambda: cached_multi_head_attention(current_q[0], current_k, current_v),
            lambda: cached_multi_head_attention(current_q, current_k[:, :2], current_v),
            lambda: cached_multi_head_attention(self.q[:, :, :2], self.k[:, :, :2], self.v[:, :, :2]),
            lambda: cached_multi_head_attention(
                current_q,
                current_k,
                current_v,
                valid_k_cache,
                None,
            ),
            lambda: cached_multi_head_attention(
                current_q,
                current_k,
                current_v,
                valid_k_cache[0],
                valid_v_cache,
            ),
            lambda: cached_multi_head_attention(
                current_q,
                current_k,
                current_v,
                valid_k_cache[:, :2],
                valid_v_cache[:, :2],
            ),
            lambda: cached_multi_head_attention(
                current_q,
                current_k,
                current_v,
                valid_k_cache,
                valid_v_cache[:, :, :1],
            ),
            lambda: cached_multi_head_attention(
                current_q[..., :0],
                current_k[..., :0],
                current_v[..., :0],
            ),
        )

        for case_index, action in enumerate(cases):
            with self.subTest(case=case_index), self.assertRaises(ValueError):
                action()


if __name__ == "__main__":
    unittest.main()
