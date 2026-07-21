import os

from flask import Flask
from werkzeug.middleware.proxy_fix import ProxyFix

from app.api import register_blueprints
from app.api.voice_socket import register_voice_socket
from app.cli import create_admin
from app.config import config_by_name
from app.extensions import cors, db, jwt, migrate, sock
from app.utils.responses import error


def create_app(config_name=None):
    env_name = config_name or os.getenv("FLASK_ENV", "default")
    app = Flask(__name__)
    app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1, x_proto=1, x_host=1)
    app.config.from_object(config_by_name.get(env_name, config_by_name["default"]))

    db.init_app(app)
    migrate.init_app(app, db)
    jwt.init_app(app)
    cors.init_app(app, resources={r"/api/*": {"origins": app.config["CORS_ORIGINS"]}})
    sock.init_app(app)

    from app import models  # noqa: F401

    register_blueprints(app)
    register_voice_socket(app)
    app.cli.add_command(create_admin)

    @app.errorhandler(404)
    def handle_404(_):
        return error("Resource not found", 404)

    @app.errorhandler(400)
    def handle_400(_):
        return error("Bad request", 400)

    @app.errorhandler(500)
    def handle_500(_):
        return error("Internal server error", 500)

    return app
