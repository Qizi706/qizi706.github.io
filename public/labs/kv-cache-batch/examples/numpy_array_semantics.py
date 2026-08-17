import numpy as np

a = [1, 2]
b = a
b.append(3)
assert a == [1, 2, 3]
assert a is b

a = [1, 2]
b = a.copy()
b.append(3)
assert a == [1, 2]
assert a is not b

x = np.arange(24).reshape(2, 3, 4)
view = x[:, 0:1, :]
assert np.shares_memory(x, view)

copied = x[[0, 1]]
copied[0, 0, 0] = 999
print("advanced shape:", copied.shape)
print("advanced shares:", np.shares_memory(x, copied))
print("original value:", x[0, 0, 0])

swapped = np.swapaxes(x, -1, -2)
print("x shape:", x.shape)
print("swapped shape:", swapped.shape)
print("x strides:", x.strides)
print("swapped strides:", swapped.strides)
print("swap shares:", np.shares_memory(x, swapped))

joined = np.concatenate([x, x], axis=0)
print("joined shape:", joined.shape)
print("concatenate shares:", np.shares_memory(x, joined))
