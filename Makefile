.PHONY: dev build test lint typecheck install clean docker-up docker-down migrate

# Development
install:
	pnpm install
	cd services/platform && pip install -e ".[dev]"

dev:
	pnpm dev

build:
	pnpm build

test:
	pnpm test
	cd services/platform && python -m pytest

lint:
	pnpm lint
	cd services/platform && ruff check .

typecheck:
	pnpm typecheck

# Docker
docker-up:
	cd infra/docker && docker compose up -d

docker-down:
	cd infra/docker && docker compose down

docker-build:
	cd infra/docker && docker compose build

docker-logs:
	cd infra/docker && docker compose logs -f

# Database
migrate:
	cd services/platform && alembic upgrade head

migrate-create:
	cd services/platform && alembic revision --autogenerate -m "$(MSG)"

# Clean
clean:
	pnpm -r exec rm -rf dist node_modules/.cache
	find . -type d -name __pycache__ -exec rm -rf {} + 2>/dev/null || true
