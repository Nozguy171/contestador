from app.api.auth import bp as auth_bp
from app.api.bot import bp as bot_bp
from app.api.businesses import bp as businesses_bp
from app.api.calls import bp as calls_bp
from app.api.customers import bp as customers_bp
from app.api.health import bp as health_bp
from app.api.inventory import bp as inventory_bp
from app.api.insights import bp as insights_bp
from app.api.menu import bp as menu_bp
from app.api.orders import bp as orders_bp
from app.api.uploads import bp as uploads_bp
from app.api.voice import bp as voice_bp, public_bp as public_voice_bp


def register_blueprints(app):
    app.register_blueprint(health_bp)
    app.register_blueprint(auth_bp)
    app.register_blueprint(businesses_bp)
    app.register_blueprint(bot_bp)
    app.register_blueprint(menu_bp)
    app.register_blueprint(inventory_bp)
    app.register_blueprint(insights_bp)
    app.register_blueprint(orders_bp)
    app.register_blueprint(uploads_bp)
    app.register_blueprint(calls_bp)
    app.register_blueprint(customers_bp)
    app.register_blueprint(voice_bp)
    app.register_blueprint(public_voice_bp)
