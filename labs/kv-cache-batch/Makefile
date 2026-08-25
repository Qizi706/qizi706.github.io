PYTHON := uv run python
GRADEFLAGS ?=
PRIVATE_SOURCE_DIR := .work/src
LAB_SOURCE_DIR ?= $(if $(wildcard $(PRIVATE_SOURCE_DIR)/kv_cache_lab),$(PRIVATE_SOURCE_DIR),src)

export OPENBLAS_NUM_THREADS := 1
export OMP_NUM_THREADS := 1
export LAB_SOURCE_DIR

.PHONY: help setup private-setup source-status test grade m2-a1 m2-a2 m2-b

help:
	@echo "make setup    Install the locked Lab environment"
	@echo "make private-setup  Copy the public Starter into ignored .work/src"
	@echo "make source-status  Show whether commands use public or private source"
	@echo "make test     Run completed regression tests"
	@echo "make grade    Grade every published exercise"
	@echo "make m2-b     Grade only the current exercise"

setup:
	uv sync

private-setup:
	@test ! -e .work || (echo ".work already exists; refusing to overwrite local work" && exit 1)
	@mkdir -p .work
	@cp -R src .work/src
	@echo "Private source created at .work/src"
	@echo "Future make test/grade commands will use .work/src automatically"

source-status:
	@echo "LAB_SOURCE_DIR=$(LAB_SOURCE_DIR)"

test:
	PYTHONPATH=$(LAB_SOURCE_DIR) $(PYTHON) -m unittest discover -s tests -v

grade:
	$(PYTHON) ./grade-lab-kv-cache $(GRADEFLAGS)

m2-a1:
	$(MAKE) grade GRADEFLAGS=m2-a1

m2-a2:
	$(MAKE) grade GRADEFLAGS=m2-a2

m2-b:
	$(MAKE) grade GRADEFLAGS=m2-b
