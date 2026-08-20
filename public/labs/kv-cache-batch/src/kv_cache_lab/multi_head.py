import numpy as np


def split_heads(projected: np.ndarray, num_heads: int) -> np.ndarray:
    """Convert [B, T, H * D_head] into [B, H, T, D_head]."""
    b = projected.shape[0]
    t = projected.shape[1]
    h = num_heads
    d_head = projected.shape[2] // h
    tmp = projected.reshape(b, t, h, d_head)
    multi_heads_attention = tmp.swapaxes(-2, -3)

    return multi_heads_attention
