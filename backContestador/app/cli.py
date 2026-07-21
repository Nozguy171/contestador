import click
from flask.cli import with_appcontext

from app.extensions import db
from app.models import User


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
