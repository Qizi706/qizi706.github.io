from math import sqrt
from statistics import median
from time import perf_counter_ns

import numpy as np


def softmax(x, axis=-1):
    x = x - np.max(x, axis=axis, keepdims=True)
    exp_x = np.exp(x)
    return exp_x / np.sum(exp_x, axis=axis, keepdims=True)


def causal_attention(x, wq, wk, wv):
    # 1. Q/K/V
    # 2. scaled scores
    # 3. causal mask
    # 4. row-wise softmax
    # 5. weighted sum of V

    Q = x @ wq
    K = x @ wk
    V = x @ wv

    T = Q.shape[0]
    d_k = Q.shape[-1]

    masks = np.triu(np.full((T, T), -np.inf), k=1)
    scores = Q @ K.T / sqrt(d_k) + masks

    attention_weights = softmax(scores)
    output = attention_weights @ V

    return output


def decode_without_cache(x, wq, wk, wv):
    outputs = []

    for t in range(x.shape[0]):
        prefix = x[0 : t + 1]
        prefix_output = causal_attention(prefix, wq, wk, wv)
        outputs.append(prefix_output[-1:])

    return np.concatenate(outputs, axis=0)


def decode_step(x_t, wq, wk, wv, k_cache=None, v_cache=None):
    q_t = x_t @ wq
    k_t = x_t @ wk
    v_t = x_t @ wv

    if k_cache is None or v_cache is None:
        k_cache = k_t
        v_cache = v_t
    else:
        k_cache = np.concatenate([k_cache, k_t], axis=0)
        v_cache = np.concatenate([v_cache, v_t], axis=0)

    d_k = q_t.shape[-1]

    scores = q_t @ k_cache.T / sqrt(d_k)
    attention_weights = softmax(scores, axis=-1)

    output_t = attention_weights @ v_cache

    return output_t, attention_weights, k_cache, v_cache


def cached_attention(x, wq, wk, wv, verbose=False):
    k_cache = None
    v_cache = None
    outputs = []

    for t in range(x.shape[0]):
        x_t = x[t : t + 1]
        output_t, weights_t, k_cache, v_cache = decode_step(
            x_t, wq, wk, wv, k_cache, v_cache
        )

        outputs.append(output_t)

        if verbose:
            print(
                f"step={t}, "
                f"weights={weights_t.shape}"
                f"k_cache={k_cache.shape}"
                f"v_cache={v_cache.shape}"
            )

    return np.concatenate(outputs, axis=0), k_cache, v_cache


def cached_attention_preallocated(x, wq, wk, wv):
    T = x.shape[0]
    d_k = wk.shape[1]
    d_v = wv.shape[1]

    k_cache = np.empty((T, d_k), dtype=x.dtype)
    v_cache = np.empty((T, d_v), dtype=x.dtype)
    outputs = np.empty((T, d_v), dtype=x.dtype)

    for t in range(T):
        x_t = x[t : t + 1]

        q_t = x_t @ wq
        k_t = x_t @ wk
        v_t = x_t @ wv

        k_cache[t : t + 1] = k_t
        v_cache[t : t + 1] = v_t

        active_k = k_cache[: t + 1]
        active_v = v_cache[: t + 1]

        scores = q_t @ active_k.T / sqrt(d_k)
        weights = softmax(scores, axis=-1)
        outputs[t : t + 1] = weights @ active_v

    return outputs, k_cache, v_cache


def benchmark(fn, *args, warmup=3, repeats=30):
    for _ in range(warmup):
        fn(*args)

    samples = []

    for _ in range(repeats):
        start = perf_counter_ns()
        fn(*args)
        end = perf_counter_ns()

        samples.append((end - start) / 1_000_000)

    return median(samples)


def run_benchmark():
    rng = np.random.default_rng(42)

    d_model = 64
    d_q = 64
    d_k = 64
    d_v = 64

    wq = rng.normal(size=(d_model, d_q))
    wk = rng.normal(size=(d_model, d_k))
    wv = rng.normal(size=(d_model, d_v))

    print(f"{'T':>6}{'no cache/ms':>14}{'cache/ms':>12}{'preallocated/ms':>18}")

    for T in [16, 32, 64, 128, 256]:
        x = rng.normal(size=(T, d_model))

        expected = decode_without_cache(x, wq, wk, wv)
        concat_output, _, _ = cached_attention(x, wq, wk, wv)
        preallocated_output, _, _ = cached_attention_preallocated(x, wq, wk, wv)

        assert np.allclose(expected, concat_output, atol=1e-8)
        assert np.allclose(expected, preallocated_output, atol=1e-8)

        no_cache_ms = benchmark(decode_without_cache, x, wq, wk, wv)

        cache_ms = benchmark(
            cached_attention,
            x,
            wq,
            wk,
            wv,
        )

        preallocated_ms = benchmark(cached_attention_preallocated, x, wq, wk, wv)

        print(f"{T:6d}{no_cache_ms:14.3f}{cache_ms:12.3f}{preallocated_ms:18.3f}")


if __name__ == "__main__":
    run_benchmark()
