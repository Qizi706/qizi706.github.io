PYTHON := uv run python
GRADEFLAGS ?=
LAB_SOURCE_DIR ?= src

export OPENBLAS_NUM_THREADS := 1
export OMP_NUM_THREADS := 1
export LAB_SOURCE_DIR

.PHONY: help setup source-status test grade m2-c

help:
	@echo "make setup    Install the locked Lab environment"
	@echo "make source-status  Show the source used by this repository"
	@echo "make test     Run completed regression tests"
	@echo "make grade    Grade every published exercise"
	@echo "make m2-c     Grade only the current exercise"

setup:
	uv sync

source-status:
	@echo "LAB_SOURCE_DIR=$(LAB_SOURCE_DIR)"

test:
	PYTHONPATH=$(LAB_SOURCE_DIR) $(PYTHON) -m unittest discover -s tests -v

grade:
	$(PYTHON) ./grade-lab $(GRADEFLAGS)

m2-c:
	$(MAKE) grade GRADEFLAGS=m2-c
