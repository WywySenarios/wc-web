.PHONY: install check test build dev

install:
	npm install

check:
	./scripts/tests/format
	./scripts/tests/check

test:
	./scripts/tests/unit

build:
	npm run build

dev:
	npm run dev
