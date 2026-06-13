from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict
from sqlalchemy import make_url


class Settings(BaseSettings):
    """Configuración del backend, leída de variables de entorno o .env.local."""

    model_config = SettingsConfigDict(
        env_file=".env.local", env_file_encoding="utf-8", extra="ignore"
    )

    # Clerk
    clerk_secret_key: str = ""

    # Base de datos (async, p. ej. postgresql+asyncpg://...).
    # Es la conexión de **administración/owner**: la usan las migraciones de
    # Alembic (crean tablas, políticas RLS y el rol de aplicación).
    database_url: str = ""

    # Rol de aplicación con el que conecta el runtime. Es NOSUPERUSER (lo crea
    # la migración inicial) para que RLS se aplique de verdad: un superusuario
    # o el owner ignorarían RLS aunque esté FORCE.
    app_db_role: str = "tandem_app"
    app_db_password: str = "tandem_app"

    # Origen del frontend, usado para CORS y como authorized party de Clerk
    frontend_origin: str = "http://localhost:5173"

    @property
    def authorized_parties(self) -> list[str]:
        return [self.frontend_origin]

    @property
    def app_database_url(self) -> str:
        """URL de runtime: mismo host/base que `database_url`, rol `tandem_app`.

        RLS solo es una red de seguridad real si el runtime NO conecta como
        owner/superusuario; por eso derivamos el rol de aplicación aquí.
        """
        url = make_url(self.database_url).set(
            username=self.app_db_role, password=self.app_db_password
        )
        return url.render_as_string(hide_password=False)


@lru_cache
def get_settings() -> Settings:
    return Settings()
