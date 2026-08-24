import unittest

import numpy as np

from kv_cache_lab.multi_head import project_qkv, split_heads

BATCH_SIZE = 2
SEQUENCE_LENGTH = 5
MODEL_WIDTH = 7
SPLIT_HEADS = 5
QUERY_HEADS = 4
KV_HEADS = 2
HEAD_DIM = 3


def sequential_array(
    shape: tuple[int, ...], *, offset: float = 0.0
) -> np.ndarray:
    size = int(np.prod(shape))
    return (np.arange(size, dtype=np.float64) + offset).reshape(shape)


def make_projection_inputs() -> tuple[
    np.ndarray,
    np.ndarray,
    np.ndarray,
    np.ndarray,
]:
    x = sequential_array((BATCH_SIZE, SEQUENCE_LENGTH, MODEL_WIDTH))
    w_q = sequential_array(
        (MODEL_WIDTH, QUERY_HEADS * HEAD_DIM),
        offset=100.0,
    )
    w_k = sequential_array(
        (MODEL_WIDTH, KV_HEADS * HEAD_DIM),
        offset=200.0,
    )
    w_v = sequential_array(
        (MODEL_WIDTH, KV_HEADS * HEAD_DIM),
        offset=300.0,
    )
    return x, w_q, w_k, w_v


class TestSplitHeads(unittest.TestCase):
    def setUp(self) -> None:
        self.projected = sequential_array(
            (BATCH_SIZE, SEQUENCE_LENGTH, SPLIT_HEADS * HEAD_DIM)
        )

    def test_output_shape(self) -> None:
        actual = split_heads(self.projected, SPLIT_HEADS)

        self.assertEqual(
            actual.shape,
            (BATCH_SIZE, SPLIT_HEADS, SEQUENCE_LENGTH, HEAD_DIM),
        )

    def test_nonzero_coordinate_preserves_flat_index_mapping(self) -> None:
        batch_index = 1
        head_index = 3
        sequence_index = 2
        head_dim_index = 1
        flat_index = head_index * HEAD_DIM + head_dim_index

        actual = split_heads(self.projected, SPLIT_HEADS)

        self.assertEqual(
            actual[
                batch_index,
                head_index,
                sequence_index,
                head_dim_index,
            ],
            self.projected[batch_index, sequence_index, flat_index],
        )

    def test_output_shares_memory_with_input(self) -> None:
        actual = split_heads(self.projected, SPLIT_HEADS)

        self.assertTrue(np.shares_memory(actual, self.projected))


class TestProjectQKV(unittest.TestCase):
    def setUp(self) -> None:
        self.x, self.w_q, self.w_k, self.w_v = make_projection_inputs()

    def project(self) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
        return project_qkv(
            self.x,
            self.w_q,
            self.w_k,
            self.w_v,
            QUERY_HEADS,
            KV_HEADS,
        )

    def test_output_shapes(self) -> None:
        q, k, v = self.project()
        cases = (
            ("q", q, (BATCH_SIZE, QUERY_HEADS, SEQUENCE_LENGTH, HEAD_DIM)),
            ("k", k, (BATCH_SIZE, KV_HEADS, SEQUENCE_LENGTH, HEAD_DIM)),
            ("v", v, (BATCH_SIZE, KV_HEADS, SEQUENCE_LENGTH, HEAD_DIM)),
        )

        for name, actual, expected_shape in cases:
            with self.subTest(projection=name):
                self.assertEqual(actual.shape, expected_shape)

    def test_nonzero_coordinates_match_independent_scalar_oracles(self) -> None:
        q, k, v = self.project()
        cases = (
            ("q", q, self.w_q, (1, 3, 2, 1)),
            ("k", k, self.w_k, (1, 1, 3, 2)),
            ("v", v, self.w_v, (1, 1, 4, 1)),
        )

        for name, actual, weight, coordinate in cases:
            batch_index, head_index, sequence_index, head_dim_index = coordinate
            flat_index = head_index * HEAD_DIM + head_dim_index
            expected = sum(
                float(self.x[batch_index, sequence_index, model_index])
                * float(weight[model_index, flat_index])
                for model_index in range(MODEL_WIDTH)
            )

            with self.subTest(projection=name, coordinate=coordinate):
                self.assertAlmostEqual(
                    actual[
                        batch_index,
                        head_index,
                        sequence_index,
                        head_dim_index,
                    ],
                    expected,
                )


class TestMultiHeadContractValidation(unittest.TestCase):
    def setUp(self) -> None:
        self.x, self.w_q, self.w_k, self.w_v = make_projection_inputs()

    def test_invalid_contracts_raise_explicit_value_errors(self) -> None:
        valid_projected = np.zeros(
            (BATCH_SIZE, SEQUENCE_LENGTH, QUERY_HEADS * HEAD_DIM)
        )
        bad_w_q_input_width = np.zeros(
            (MODEL_WIDTH + 1, QUERY_HEADS * HEAD_DIM)
        )
        bad_w_k_head_dim = np.zeros(
            (MODEL_WIDTH, KV_HEADS * (HEAD_DIM + 1))
        )
        cases = (
            (
                "projected_not_3d",
                lambda: split_heads(
                    np.zeros((SEQUENCE_LENGTH, QUERY_HEADS * HEAD_DIM)),
                    QUERY_HEADS,
                ),
                r"3D",
            ),
            (
                "num_heads_not_positive",
                lambda: split_heads(valid_projected, 0),
                r"positive",
            ),
            (
                "projection_width_not_divisible",
                lambda: split_heads(
                    np.zeros(
                        (
                            BATCH_SIZE,
                            SEQUENCE_LENGTH,
                            QUERY_HEADS * HEAD_DIM + 1,
                        )
                    ),
                    QUERY_HEADS,
                ),
                r"divisible",
            ),
            (
                "weight_input_width_mismatch",
                lambda: project_qkv(
                    self.x,
                    bad_w_q_input_width,
                    self.w_k,
                    self.w_v,
                    QUERY_HEADS,
                    KV_HEADS,
                ),
                r"input width",
            ),
            (
                "qkv_head_dim_mismatch",
                lambda: project_qkv(
                    self.x,
                    self.w_q,
                    bad_w_k_head_dim,
                    self.w_v,
                    QUERY_HEADS,
                    KV_HEADS,
                ),
                r"D_head",
            ),
        )

        for name, action, message_pattern in cases:
            with self.subTest(case=name):
                with self.assertRaisesRegex(ValueError, message_pattern):
                    action()


if __name__ == "__main__":
    unittest.main()
