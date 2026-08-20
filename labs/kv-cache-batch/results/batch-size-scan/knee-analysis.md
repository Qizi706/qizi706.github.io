# Batch Size Scan: Knee Analysis

## Protocol

- Sequence length: `T=128`
- dtype: `float64`
- BLAS threads: `1`
- Source: `raw.csv` only

## Summary

| B | Batch P50 / ms | Batch P95 / ms | P50/B / ms | Positions/s | Sequential/Batch |
| --: | --: | --: | --: | --: | --: |
| 1 | 1.442 | 1.467 | 1.442 | 88,750 | 0.938x |
| 2 | 1.789 | 1.808 | 0.894 | 143,129 | 1.521x |
| 4 | 2.627 | 2.673 | 0.657 | 194,928 | 2.045x |
| 8 | 5.264 | 5.312 | 0.658 | 194,513 | 2.064x |

## Adjacent throughput gain

| Transition | Gain |
| ---: | ---: |
| 1 → 2 | 61.27% |
| 2 → 4 | 36.19% |
| 4 → 8 | -0.21% |

Operational threshold: gain < 10%.

**Knee: B=8**

Batch Wall Time measures completion of the whole batch. `P50/B` is an amortized execution cost, not per-request latency. Positions/s is the toy lab's output-position rate, not serving token throughput.

This fixed-shape CPU/NumPy experiment is not Continuous Batching and does not model request arrivals, queues, padding, dynamic exits, GPU kernels, model layers, sampling, or network overhead.
