import os


class Config:
    SECRET_KEY = os.getenv("SECRET_KEY", "change-me")
    SQLALCHEMY_DATABASE_URI = os.getenv(
        "DATABASE_URL",
        "postgresql+psycopg://voice_user:voice_password@db:5432/voice_orders",
    )
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    MAX_CONTENT_LENGTH = 6 * 1024 * 1024
    JWT_SECRET_KEY = os.getenv("JWT_SECRET_KEY", "change-me-jwt")
    JWT_ACCESS_TOKEN_EXPIRES = 60 * 60 * 12
    CORS_ORIGINS = [origin.strip() for origin in os.getenv("CORS_ORIGINS", "*").split(",") if origin.strip()]
    APP_PORT = int(os.getenv("APP_PORT", "18763"))
    REGISTER_OPEN = os.getenv("REGISTER_OPEN", "true").lower() == "true"
    PUBLIC_BASE_URL = os.getenv("PUBLIC_BASE_URL", "http://localhost:18763").rstrip("/")
    TWILIO_ACCOUNT_SID = os.getenv("TWILIO_ACCOUNT_SID", "")
    TWILIO_AUTH_TOKEN = os.getenv("TWILIO_AUTH_TOKEN", "")
    TWILIO_VALIDATE_SIGNATURE = os.getenv("TWILIO_VALIDATE_SIGNATURE", "false").lower() == "true"
    TWILIO_STATUS_CALLBACK_URL = os.getenv("TWILIO_STATUS_CALLBACK_URL", "")
    GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
    GEMINI_MODEL = os.getenv("GEMINI_MODEL", os.getenv("VOICE_LIVE_MODEL", "gemini-3.8-live"))
    VOICE_LIVE_MODEL = os.getenv("VOICE_LIVE_MODEL", GEMINI_MODEL)
    GEMINI_HTTP_API_VERSION = os.getenv("GEMINI_HTTP_API_VERSION", "v1beta")
    GEMINI_VOICE_NAME = os.getenv("GEMINI_VOICE_NAME", "Aoede")
    GEMINI_LANGUAGE_CODE = os.getenv("GEMINI_LANGUAGE_CODE", "es-MX")
    VOICE_WEBHOOK_PATH = os.getenv("VOICE_WEBHOOK_PATH", "/voice/incoming")
    VOICE_STREAM_PATH = os.getenv("VOICE_STREAM_PATH", "/api/v1/voice/twilio/media-stream")
    VOICE_STATUS_PATH = os.getenv("VOICE_STATUS_PATH", "/api/v1/voice/twilio/status")
    VOICE_STREAM_TOKEN_TTL_SECONDS = int(os.getenv("VOICE_STREAM_TOKEN_TTL_SECONDS", "300"))
    VOICE_START_OF_SPEECH_SENSITIVITY = os.getenv("VOICE_START_OF_SPEECH_SENSITIVITY", "START_SENSITIVITY_LOW")
    VOICE_END_OF_SPEECH_SENSITIVITY = os.getenv("VOICE_END_OF_SPEECH_SENSITIVITY", "END_SENSITIVITY_LOW")
    VOICE_PREFIX_PADDING_MS = int(os.getenv("VOICE_PREFIX_PADDING_MS", "120"))
    VOICE_SILENCE_DURATION_MS = int(os.getenv("VOICE_SILENCE_DURATION_MS", "700"))
    VOICE_TRANSCRIPT_EVENTS_V2 = os.getenv("VOICE_TRANSCRIPT_EVENTS_V2", "false").lower() == "true"
    VOICE_AUDIO_DIAGNOSTICS = os.getenv("VOICE_AUDIO_DIAGNOSTICS", "true").lower() == "true"
    UPLOAD_FOLDER = os.getenv(
        "UPLOAD_FOLDER",
        os.path.join(os.path.dirname(os.path.dirname(__file__)), "uploads"),
    )


class DevelopmentConfig(Config):
    DEBUG = True


class ProductionConfig(Config):
    DEBUG = False


class TestingConfig(Config):
    TESTING = True
    SQLALCHEMY_DATABASE_URI = "sqlite:///:memory:"
    JWT_SECRET_KEY = "testing-jwt-key-with-at-least-32-bytes"
    TWILIO_VALIDATE_SIGNATURE = False
    PUBLIC_BASE_URL = "https://voice.example.test"
    TWILIO_ACCOUNT_SID = "AC00000000000000000000000000000000"
    TWILIO_AUTH_TOKEN = "testing-twilio-token"
    GEMINI_API_KEY = "test-key"


config_by_name = {
    "development": DevelopmentConfig,
    "production": ProductionConfig,
    "testing": TestingConfig,
    "default": DevelopmentConfig,
}
