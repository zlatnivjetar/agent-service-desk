from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str
    redis_url: str = "redis://localhost:6379"
    openai_api_key: str
    jwt_secret: str
    jwt_algorithm: str = "HS256"
    jwt_expiry_minutes: int = 60
    cors_origins: list[str] = ["http://localhost:3000"]

    model_config = {"env_file": ".env.local"}


settings = Settings()
