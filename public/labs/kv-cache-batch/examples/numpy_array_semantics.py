import numpy as np


def make_array() -> np.ndarray:
    """Return an independent C-contiguous array for one controlled case."""
    return np.arange(24, dtype=np.int64).reshape(2, 3, 4)


def print_case(title: str) -> None:
    print(f"\n{title}")


def case_name_binding() -> None:
    print_case("case 1: Python name binding")
    a = [1, 2]
    b = a
    b.append(3)

    print("a:", a)
    print("b:", b)
    print("same object:", a is b)

    assert a == [1, 2, 3]
    assert a is b


def case_shallow_copy() -> None:
    print_case("case 2: Python shallow copy")
    a = [[1], [2]]
    b = a.copy()
    b.append([3])
    b[0].append(9)

    print("a:", a)
    print("b:", b)
    print("same outer object:", a is b)
    print("same nested object:", a[0] is b[0])

    assert a == [[1, 9], [2]]
    assert b == [[1, 9], [2], [3]]
    assert a is not b
    assert a[0] is b[0]


def case_basic_slice() -> None:
    print_case("case 3: NumPy basic slicing")
    x = make_array()
    view = x[:, 0:1, :]
    view[0, 0, 0] = 999

    print("x shape:", x.shape)
    print("view shape:", view.shape)
    print("x strides:", x.strides)
    print("view strides:", view.strides)
    print("shares buffer:", np.shares_memory(x, view))
    print("mutation reached x:", x[0, 0, 0])

    assert view.shape == (2, 1, 4)
    assert np.shares_memory(x, view)
    assert x[0, 0, 0] == 999


def case_advanced_indexing() -> None:
    print_case("case 4: NumPy advanced indexing")
    x = make_array()
    copied = x[[0, 1]]
    copied[0, 0, 0] = 999

    print("x shape:", x.shape)
    print("copied shape:", copied.shape)
    print("shares buffer:", np.shares_memory(x, copied))
    print("original value:", x[0, 0, 0])
    print("copied value:", copied[0, 0, 0])

    assert copied.shape == (2, 3, 4)
    assert not np.shares_memory(x, copied)
    assert x[0, 0, 0] == 0
    assert copied[0, 0, 0] == 999


def case_swapaxes() -> None:
    print_case("case 5: NumPy swapaxes")
    x = make_array()
    swapped = np.swapaxes(x, -1, -2)
    swapped[0, 0, 1] = 999

    print("x shape:", x.shape)
    print("swapped shape:", swapped.shape)
    print("x strides:", x.strides)
    print("swapped strides:", swapped.strides)
    print("shares buffer:", np.shares_memory(x, swapped))
    print("mutation reached mapped x element:", x[0, 1, 0])

    assert swapped.shape == (2, 4, 3)
    assert swapped.strides == (x.strides[0], x.strides[2], x.strides[1])
    assert np.shares_memory(x, swapped)
    assert x[0, 1, 0] == 999


def case_concatenate() -> None:
    print_case("case 6: NumPy concatenate")
    x = make_array()
    joined = np.concatenate([x, x], axis=0)
    joined[0, 0, 0] = 999

    print("x shape:", x.shape)
    print("joined shape:", joined.shape)
    print("shares buffer:", np.shares_memory(x, joined))
    print("original value:", x[0, 0, 0])
    print("joined value:", joined[0, 0, 0])

    assert joined.shape == (4, 3, 4)
    assert not np.shares_memory(x, joined)
    assert x[0, 0, 0] == 0
    assert joined[0, 0, 0] == 999


def main() -> None:
    case_name_binding()
    case_shallow_copy()
    case_basic_slice()
    case_advanced_indexing()
    case_swapaxes()
    case_concatenate()


if __name__ == "__main__":
    main()
