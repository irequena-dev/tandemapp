from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Configuración del backend, leída de variables de entorno o .env.local."""

    model_config = SettingsConfigDict(
        env_file=".env.local", env_file_encoding="utf-8", extra="ignore"
    )

    # Clerk
    clerk_secret_key: str = ""

    # Base de datos (async, p. ej. postgresql+asyncpg://...)
    database_url: str = ""

    # Origen del frontend, usado para CORS y como authorized party de Clerk
    frontend_origin: str = "http://localhost:5173"

    @property
    def authorized_parties(self) -> list[str]:
        return [self.frontend_origin]


@lru_cache
def get_settings() -> Settings:
    return Settings()
