import click
import json
from flask.cli import with_appcontext

from app.extensions import db
from app.models import User
from app.services.address_catalog import import_inegi_address_catalog


@click.command("create-admin")
@click.option("--email", required=True)
@click.option("--password", required=True)
@click.option("--name", default="Admin")
@with_appcontext
def create_admin(email, password, name):
    user = User.query.filter_by(email=email.lower()).first()
    if user:
        user.name = name
        user.is_active = True
        user.set_password(password)
        db.session.commit()
        click.echo(f"Admin actualizado: {email}")
        return

    user = User(name=name, email=email.lower(), is_active=True)
    user.set_password(password)
    db.session.add(user)
    db.session.commit()
    click.echo(f"Admin creado: {email}")


@click.command("import-inegi-address-catalog")
@click.option("--entity", required=True, help="Clave INEGI de entidad, dos dígitos; Baja California es 02.")
@click.option("--municipality", required=True, help="Clave INEGI municipal, tres dígitos; Mexicali es 002.")
@click.option("--entity-name", default=None)
@click.option("--municipality-name", default=None)
@with_appcontext
def import_address_catalog(entity, municipality, entity_name, municipality_name):
    try:
        result = import_inegi_address_catalog(
            entity_code=entity,
            municipality_code=municipality,
            entity_name=entity_name,
            municipality_name=municipality_name,
        )
    except Exception as exc:
        db.session.rollback()
        raise click.ClickException(f"No se importó el catálogo: {type(exc).__name__}: {exc}") from exc
    click.echo(json.dumps(result, ensure_ascii=False, indent=2))
