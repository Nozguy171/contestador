.PHONY: env rotate-secrets config up down restart ps logs migrate upgrade create-admin

env:
	python3 scripts/setup_env.py

rotate-secrets:
	python3 scripts/setup_env.py --rotate

config:
	docker compose config --quiet

up:
	docker compose up --build -d

down:
	docker compose down

restart:
	docker compose up --build -d

ps:
	docker compose ps

logs:
	docker compose logs -f api web

migrate:
	docker compose exec api flask db migrate -m "$(m)"

upgrade:
	docker compose exec api flask db upgrade

create-admin:
	docker compose exec api flask create-admin --email "$(email)" --password "$(password)" --name "$(name)"
