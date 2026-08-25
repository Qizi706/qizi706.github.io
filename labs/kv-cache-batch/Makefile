PYTHON := uv run python
GRADEFLAGS ?=

export OPENBLAS_NUM_THREADS := 1
export OMP_NUM_THREADS := 1

.PHONY: help setup test grade m2-a1 m2-a2 m2-b

help:
	@echo "make setup    Install the locked Lab environment"
	@echo "make test     Run completed regression tests"
	@echo "make grade    Grade every published exercise"
	@echo "make m2-b     Grade only the current exercise"

setup:
	uv sync

test:
	PYTHONPATH=src $(PYTHON) -m unittest discover -s tests -v

grade:
	$(PYTHON) ./grade-lab-kv-cache $(GRADEFLAGS)

m2-a1:
	$(MAKE) grade GRADEFLAGS=m2-a1

m2-a2:
	$(MAKE) grade GRADEFLAGS=m2-a2

m2-b:
	$(MAKE) grade GRADEFLAGS=m2-b
