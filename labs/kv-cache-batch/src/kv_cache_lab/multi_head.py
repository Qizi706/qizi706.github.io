import numpy as np


def split_heads(projected: np.ndarray, num_heads: int) -> np.ndarray:
    """Convert [B, T, H * D_head] into [B, H, T, D_head]."""
    if projected.ndim != 3:
        raise ValueError("projected must be 3D")

    if num_heads <= 0:
        raise ValueError("num_heads must be positive")

    if projected.shape[-1] % num_heads != 0:
        raise ValueError("projection width must be divisible by num_heads")

    b = projected.shape[0]
    t = projected.shape[1]
    h = num_heads
    d_head = projected.shape[2] // h
    tmp = projected.reshape(b, t, h, d_head)
    multi_heads_attention = tmp.swapaxes(-2, -3)

    return multi_heads_attention


def project_qkv(
    x: np.ndarray,
    w_q: np.ndarray,
    w_k: np.ndarray,
    w_v: np.ndarray,
    num_query_heads: int,
    num_kv_heads: int,
) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Project X and return Q/K/V with explicit Head axes."""
    if x.ndim != 3:
        raise ValueError("x must be 3D")

    if num_query_heads <= 0 or num_kv_heads <= 0:
        raise ValueError("num_query_heads and num_kv_heads must be positive")

    weights = (("w_q", w_q), ("w_k", w_k), ("w_v", w_v))
    for name, weight in weights:
        if weight.ndim != 2:
            raise ValueError(f"{name} must be 2D")
        if weight.shape[0] != x.shape[-1]:
            raise ValueError(f"{name} input width must match x input width")

    projection_specs = (
        ("w_q", w_q, num_query_heads),
        ("w_k", w_k, num_kv_heads),
        ("w_v", w_v, num_kv_heads),
    )
    d_heads = []
    for name, weight, num_heads in projection_specs:
        if weight.shape[1] % num_heads != 0:
            raise ValueError(f"{name} projection width must be divisible by num_heads")
        d_heads.append(weight.shape[1] // num_heads)

    if len(set(d_heads)) != 1:
        raise ValueError("Q/K/V D_head must match")

    q = x @ w_q
    k = x @ w_k
    v = x @ w_v

    q = split_heads(q, num_query_heads)
    k = split_heads(k, num_kv_heads)
    v = split_heads(v, num_kv_heads)

    return q, k, v
