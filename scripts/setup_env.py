#!/usr/bin/env python3
import argparse
import os
import secrets
import subprocess
from pathlib import Path
from urllib.parse import quote


ROOT = Path(__file__).resolve().parents[1]
ENV_FILE = ROOT / ".env"
TEMPLATE_FILE = ROOT / ".env.example"


def read_env(path: Path) -> dict[str, str]:
    values: dict[str, str] = {}
    if not path.exists():
        return values
    for raw_line in path.read_text().splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        values[key] = value
    return values


def render_env(values: dict[str, str]) -> str:
    rendered: list[str] = []
    template_keys: set[str] = set()
    for raw_line in TEMPLATE_FILE.read_text().splitlines():
        if not raw_line or raw_line.lstrip().startswith("#") or "=" not in raw_line:
            rendered.append(raw_line)
            continue
        key = raw_line.split("=", 1)[0]
        template_keys.add(key)
        rendered.append(f"{key}={values[key]}")
    rendered.extend(f"{key}={value}" for key, value in values.items() if key not in template_keys)
    return "\n".join(rendered) + "\n"


def rotate_database_password(values: dict[str, str], password: str) -> None:
    user = values["POSTGRES_USER"]
    database = values["POSTGRES_DB"]
    if not user.replace("_", "").isalnum():
        raise SystemExit("POSTGRES_USER contiene caracteres no permitidos para la rotación automática.")

    compose_env = os.environ.copy()
    compose_env.update(values)
    status = subprocess.run(
        ["docker", "compose", "ps", "-q", "db"],
        cwd=ROOT,
        env=compose_env,
        capture_output=True,
        text=True,
        check=True,
    )
    if not status.stdout.strip():
        raise SystemExit("La base existente debe estar encendida para rotar POSTGRES_PASSWORD sin perder acceso.")

    role = user.replace('"', '""')
    sql_password = password.replace("'", "''")
    subprocess.run(
        ["docker", "compose", "exec", "-T", "db", "psql", "-v", "ON_ERROR_STOP=1", "-U", user, "-d", database],
        cwd=ROOT,
        env=compose_env,
        input=f'ALTER ROLE "{role}" WITH PASSWORD \'{sql_password}\';\n',
        capture_output=True,
        text=True,
        check=True,
    )


def main() -> None:
    parser = argparse.ArgumentParser(description="Genera los secretos locales sin imprimirlos.")
    parser.add_argument("--rotate", action="store_true", help="Rota secretos internos y la contraseña de la base activa.")
    parser.add_argument("--public-url", help="Configura la URL pública para frontend, CORS y webhooks.")
    parser.add_argument("--web-port", default=None, help="Puerto del frontend publicado en el host.")
    args = parser.parse_args()

    exists = ENV_FILE.exists()
    if exists and not args.rotate:
        print(".env ya existe; no se modificó. Usa --rotate para cambiar secretos internos.")
        return

    values = read_env(TEMPLATE_FILE)
    values.update(read_env(ENV_FILE))
    values["FLASK_ENV"] = "production"
    if args.public_url:
        public_url = args.public_url.rstrip("/")
        values["NEXT_PUBLIC_API_URL"] = public_url
        values["PUBLIC_BASE_URL"] = public_url
        values["CORS_ORIGINS"] = public_url
    if args.web_port:
        values["WEB_PORT_HOST"] = args.web_port
    values["SECRET_KEY"] = secrets.token_hex(32)
    values["JWT_SECRET_KEY"] = secrets.token_hex(32)
    password = secrets.token_urlsafe(32)

    if exists:
        rotate_database_password(values, password)

    values["POSTGRES_PASSWORD"] = password
    values["DATABASE_URL"] = (
        "postgresql+psycopg://"
        f"{quote(values['POSTGRES_USER'], safe='')}:{quote(password, safe='')}"
        f"@db:5432/{quote(values['POSTGRES_DB'], safe='')}"
    )
    temporary = ENV_FILE.with_suffix(".tmp")
    temporary.write_text(render_env(values))
    temporary.chmod(0o600)
    temporary.replace(ENV_FILE)
    print(".env generado correctamente; los secretos no se mostraron.")


if __name__ == "__main__":
    main()
