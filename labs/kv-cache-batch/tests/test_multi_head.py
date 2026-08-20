import unittest

import numpy as np

from kv_cache_lab.multi_head import split_heads

RANDOM_SEED = 20260820
B = 2
H = 5
T = 4
D = 3


class TestMultiHeadSplitCorrectness(unittest.TestCase):
    def setUp(self) -> None:
        rng = np.random.default_rng(RANDOM_SEED)
        self.x = rng.normal(size=(B, T, H * D))

    def assert_split_heads_shape_match_oracle(self, actual_output) -> None:
        self.assertEqual(actual_output.shape, (B, H, T, D))

    def assert_split_heads_element_match(self, actual_output, b, h, t, d) -> None:
        self.assertEqual(actual_output[b, h, t, d], self.x[b, t, h * D + d])

    def test_split_heads_shape_match_oracle(self) -> None:
        split_heads_array = split_heads(self.x, H)

        self.assert_split_heads_shape_match_oracle(split_heads_array)

    def test_split_heads_element_match_oracle(self) -> None:
        b = 1
        t = 2
        h = 3
        d = 1
        split_heads_array = split_heads(self.x, H)

        self.assert_split_heads_element_match(split_heads_array, b, h, t, d)

    def test_split_heads_share_memory_match_oracle(self) -> None:
        split_heads_array = split_heads(self.x, H)
        share_memory = np.shares_memory(split_heads_array, self.x)
        self.assertTrue(share_memory == True)


if __name__ == "__main__":
    unittest.main()
