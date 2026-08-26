import math
import unittest

import numpy as np

from inference_lab.multi_head_attention import multi_head_causal_attention

BATCH_SIZE = 2
NUM_HEADS = 3
SEQUENCE_LENGTH = 4
HEAD_DIM = 5


def make_qkv() -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    rng = np.random.default_rng(20260825)
    shape = (BATCH_SIZE, NUM_HEADS, SEQUENCE_LENGTH, HEAD_DIM)
    return tuple(rng.normal(size=shape) for _ in range(3))


def scalar_oracle(
    q: np.ndarray,
    k: np.ndarray,
    v: np.ndarray,
) -> tuple[np.ndarray, np.ndarray]:
    output = np.zeros_like(q, dtype=np.float64)
    weights = np.zeros(
        (BATCH_SIZE, NUM_HEADS, SEQUENCE_LENGTH, SEQUENCE_LENGTH),
        dtype=np.float64,
    )
    scale = math.sqrt(HEAD_DIM)

    for batch_index in range(BATCH_SIZE):
        for head_index in range(NUM_HEADS):
            for query_index in range(SEQUENCE_LENGTH):
                scores = []
                for key_index in range(query_index + 1):
                    dot_product = sum(
                        float(q[batch_index, head_index, query_index, dim_index])
                        * float(k[batch_index, head_index, key_index, dim_index])
                        for dim_index in range(HEAD_DIM)
                    )
                    scores.append(dot_product / scale)

                largest_score = max(scores)
                exponentials = [math.exp(score - largest_score) for score in scores]
                denominator = sum(exponentials)

                for key_index, exponential in enumerate(exponentials):
                    weight = exponential / denominator
                    weights[
                        batch_index,
                        head_index,
                        query_index,
                        key_index,
                    ] = weight
                    for dim_index in range(HEAD_DIM):
                        output[
                            batch_index,
                            head_index,
                            query_index,
                            dim_index,
                        ] += weight * float(
                            v[batch_index, head_index, key_index, dim_index]
                        )

    return output, weights


class TestM2B(unittest.TestCase):
    def setUp(self) -> None:
        self.q, self.k, self.v = make_qkv()

    def test_output_and_weight_shapes(self) -> None:
        output, weights = multi_head_causal_attention(self.q, self.k, self.v)

        self.assertEqual(
            output.shape,
            (BATCH_SIZE, NUM_HEADS, SEQUENCE_LENGTH, HEAD_DIM),
        )
        self.assertEqual(
            weights.shape,
            (BATCH_SIZE, NUM_HEADS, SEQUENCE_LENGTH, SEQUENCE_LENGTH),
        )

    def test_matches_independent_scalar_oracle(self) -> None:
        expected_output, expected_weights = scalar_oracle(self.q, self.k, self.v)

        actual_output, actual_weights = multi_head_causal_attention(
            self.q,
            self.k,
            self.v,
        )

        np.testing.assert_allclose(actual_weights, expected_weights, atol=1e-12)
        np.testing.assert_allclose(actual_output, expected_output, atol=1e-12)

    def test_causal_mask_and_normalization(self) -> None:
        _, weights = multi_head_causal_attention(self.q, self.k, self.v)

        future_mask = np.triu(
            np.ones((SEQUENCE_LENGTH, SEQUENCE_LENGTH), dtype=bool),
            k=1,
        )
        np.testing.assert_array_equal(weights[..., future_mask], 0.0)
        np.testing.assert_allclose(
            weights.sum(axis=-1),
            np.ones((BATCH_SIZE, NUM_HEADS, SEQUENCE_LENGTH)),
            atol=1e-12,
        )

    def test_future_batch_and_head_values_are_isolated(self) -> None:
        baseline, _ = multi_head_causal_attention(self.q, self.k, self.v)

        future_k = self.k.copy()
        future_v = self.v.copy()
        future_k[:, :, 2:] += 10_000.0
        future_v[:, :, 2:] -= 10_000.0
        changed_future, _ = multi_head_causal_attention(
            self.q,
            future_k,
            future_v,
        )
        np.testing.assert_allclose(changed_future[:, :, :2], baseline[:, :, :2])

        isolated_q = self.q.copy()
        isolated_k = self.k.copy()
        isolated_v = self.v.copy()
        isolated_q[1, 2] *= -3.0
        isolated_k[1, 2] += 7.0
        isolated_v[1, 2] -= 11.0
        changed_slice, _ = multi_head_causal_attention(
            isolated_q,
            isolated_k,
            isolated_v,
        )

        unchanged = np.ones((BATCH_SIZE, NUM_HEADS), dtype=bool)
        unchanged[1, 2] = False
        np.testing.assert_allclose(changed_slice[unchanged], baseline[unchanged])
        self.assertFalse(np.allclose(changed_slice[1, 2], baseline[1, 2]))

    def test_invalid_contracts_raise_value_error(self) -> None:
        cases = (
            (
                "not_4d",
                self.q[0],
                self.k,
                self.v,
                r"4D",
            ),
            (
                "batch_mismatch",
                self.q,
                self.k[:1],
                self.v,
                r"same",
            ),
            (
                "head_mismatch",
                self.q,
                self.k[:, :2],
                self.v,
                r"same",
            ),
            (
                "token_mismatch",
                self.q,
                self.k[:, :, :3],
                self.v,
                r"same",
            ),
            (
                "head_width_mismatch",
                self.q,
                self.k[..., :4],
                self.v,
                r"same",
            ),
            (
                "empty_token_axis",
                self.q[:, :, :0],
                self.k[:, :, :0],
                self.v[:, :, :0],
                r"positive",
            ),
            (
                "empty_head_width",
                self.q[..., :0],
                self.k[..., :0],
                self.v[..., :0],
                r"positive",
            ),
        )

        for name, q, k, v, message_pattern in cases:
            with (
                self.subTest(case=name),
                self.assertRaisesRegex(ValueError, message_pattern),
            ):
                multi_head_causal_attention(q, k, v)


if __name__ == "__main__":
    unittest.main()
