from math import sqrt

import numpy as np


def softmax(x: np.ndarray, axis: int = -1) -> np.ndarray:
    shifted = x - np.max(x, axis=axis, keepdims=True)
    exp_x = np.exp(shifted)
    return exp_x / np.sum(exp_x, axis=axis, keepdims=True)


def causal_attention(
    x: np.ndarray,
    wq: np.ndarray,
    wk: np.ndarray,
    wv: np.ndarray,
) -> np.ndarray:
    """Compute single-head causal attention for one sequence."""
    q = x @ wq
    k = x @ wk
    v = x @ wv

    sequence_length = q.shape[0]
    d_k = q.shape[-1]
    causal_mask = np.triu(
        np.full((sequence_length, sequence_length), -np.inf),
        k=1,
    )
    scores = q @ k.T / sqrt(d_k) + causal_mask
    return softmax(scores, axis=-1) @ v


def decode_without_cache(
    x: np.ndarray,
    wq: np.ndarray,
    wk: np.ndarray,
    wv: np.ndarray,
) -> np.ndarray:
    """Decode one sequence by recomputing its full prefix at every step."""
    outputs = []

    for t in range(x.shape[0]):
        prefix_output = causal_attention(x[: t + 1], wq, wk, wv)
        outputs.append(prefix_output[-1:])

    return np.concatenate(outputs, axis=0)


def decode_step(
    x_t: np.ndarray,
    wq: np.ndarray,
    wk: np.ndarray,
    wv: np.ndarray,
    k_cache: np.ndarray | None = None,
    v_cache: np.ndarray | None = None,
) -> tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
    """Decode one position and grow a single-sequence cache dynamically."""
    q_t = x_t @ wq
    k_t = x_t @ wk
    v_t = x_t @ wv

    if k_cache is None or v_cache is None:
        k_cache = k_t
        v_cache = v_t
    else:
        k_cache = np.concatenate([k_cache, k_t], axis=0)
        v_cache = np.concatenate([v_cache, v_t], axis=0)

    scores = q_t @ k_cache.T / sqrt(q_t.shape[-1])
    weights = softmax(scores, axis=-1)
    output_t = weights @ v_cache

    return output_t, weights, k_cache, v_cache


def cached_attention(
    x: np.ndarray,
    wq: np.ndarray,
    wk: np.ndarray,
    wv: np.ndarray,
) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Decode one sequence with a dynamically concatenated KV cache."""
    if x.shape[0] == 0:
        raise ValueError("x must contain at least one token")

    k_cache = None
    v_cache = None
    outputs = []

    for t in range(x.shape[0]):
        output_t, _, k_cache, v_cache = decode_step(
            x[t : t + 1],
            wq,
            wk,
            wv,
            k_cache,
            v_cache,
        )
        outputs.append(output_t)

    assert k_cache is not None
    assert v_cache is not None
    return np.concatenate(outputs, axis=0), k_cache, v_cache


def cached_attention_preallocated(
    x: np.ndarray,
    wq: np.ndarray,
    wk: np.ndarray,
    wv: np.ndarray,
) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Decode one sequence with a fixed-capacity KV cache."""
    sequence_length = x.shape[0]
    d_k = wk.shape[1]
    d_v = wv.shape[1]

    k_cache = np.empty((sequence_length, d_k), dtype=x.dtype)
    v_cache = np.empty((sequence_length, d_v), dtype=x.dtype)
    outputs = np.empty((sequence_length, d_v), dtype=x.dtype)

    for t in range(sequence_length):
        x_t = x[t : t + 1]
        q_t = x_t @ wq
        k_cache[t : t + 1] = x_t @ wk
        v_cache[t : t + 1] = x_t @ wv

        active_k = k_cache[: t + 1]
        active_v = v_cache[: t + 1]
        scores = q_t @ active_k.T / sqrt(d_k)
        outputs[t : t + 1] = softmax(scores, axis=-1) @ active_v

    return outputs, k_cache, v_cache


def batched_decode_step(
    x_t: np.ndarray,
    wq: np.ndarray,
    wk: np.ndarray,
    wv: np.ndarray,
    k_cache: np.ndarray | None = None,
    v_cache: np.ndarray | None = None,
) -> tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
    """Decode one position for B independent sequences in one NumPy call."""
    q_t = x_t @ wq
    k_t = x_t @ wk
    v_t = x_t @ wv

    if k_cache is None or v_cache is None:
        k_cache = k_t
        v_cache = v_t
    else:
        k_cache = np.concatenate([k_cache, k_t], axis=1)
        v_cache = np.concatenate([v_cache, v_t], axis=1)

    scores = q_t @ np.swapaxes(k_cache, -1, -2) / sqrt(q_t.shape[-1])
    weights = softmax(scores, axis=-1)
    output_t = weights @ v_cache

    return output_t, weights, k_cache, v_cache


def batched_cached_attention(
    x: np.ndarray,
    wq: np.ndarray,
    wk: np.ndarray,
    wv: np.ndarray,
) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Decode equal-length sequences with a shared batched execution path."""
    sequence_length = x.shape[1]
    if sequence_length == 0:
        raise ValueError("x must contain at least one token per sequence")

    k_cache = None
    v_cache = None
    outputs = []

    for t in range(sequence_length):
        output_t, _, k_cache, v_cache = batched_decode_step(
            x[:, t : t + 1, :],
            wq,
            wk,
            wv,
            k_cache,
            v_cache,
        )
        outputs.append(output_t)

    assert k_cache is not None
    assert v_cache is not None
    return np.concatenate(outputs, axis=1), k_cache, v_cache


def sequential_cached_attention(
    x: np.ndarray,
    wq: np.ndarray,
    wk: np.ndarray,
    wv: np.ndarray,
) -> np.ndarray:
    """Reference path that decodes each sequence with a separate Python call."""
    return np.stack(
        [cached_attention(sequence, wq, wk, wv)[0] for sequence in x],
        axis=0,
    )
