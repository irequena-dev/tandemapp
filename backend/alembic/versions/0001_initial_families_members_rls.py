"""initial: families + members con RLS y rol de aplicación

Revision ID: 0001
Revises:
Create Date: 2026-06-14

Crea el esqueleto de aislamiento multi-inquilino:
- Tablas `families` y `members` (espejos de Org y usuario de Clerk).
- RLS + FORCE en ambas, con política por `app.current_family_id`.
- Rol de aplicación `tandem_app` (NOSUPERUSER) con grants DML; el runtime
  conecta como él para que RLS sea una red de seguridad real (un superusuario
  o el owner ignorarían RLS aunque esté FORCE).
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op
from app.config import get_settings

# revision identifiers, used by Alembic.
revision: str = "0001"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# Variable de sesión que fija la Familia activa por transacción (SET LOCAL).
FAMILY_VAR = "app.current_family_id"


def _enable_rls(table: str, column: str) -> None:
    op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY")
    # FORCE para que ni el owner se salte RLS (defensa en profundidad).
    op.execute(f"ALTER TABLE {table} FORCE ROW LEVEL SECURITY")
    op.execute(
        f"""
        CREATE POLICY family_isolation ON {table}
        USING ({column} = current_setting('{FAMILY_VAR}', true))
        WITH CHECK ({column} = current_setting('{FAMILY_VAR}', true))
        """
    )


def upgrade() -> None:
    op.create_table(
        "families",
        sa.Column("id", sa.Text(), nullable=False),
        sa.Column("slug", sa.Text(), nullable=True),
        sa.Column("name", sa.Text(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_table(
        "members",
        sa.Column("id", sa.Text(), nullable=False),
        sa.Column("family_id", sa.Text(), nullable=False),
        sa.Column("display_name", sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(["family_id"], ["families.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_members_family_id", "members", ["family_id"])

    _enable_rls("families", "id")
    _enable_rls("members", "family_id")

    # Rol de aplicación (NOSUPERUSER). La clave llega desde la config en runtime
    # (no se versiona): se inyecta vía GUC y se interpola con %L (seguro).
    password = get_settings().app_db_password
    op.execute(
        sa.text("SELECT set_config('tandem.app_pw', :pw, false)").bindparams(
            pw=password
        )
    )
    op.execute(
        """
        DO $$
        BEGIN
            IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'tandem_app') THEN
                EXECUTE format(
                    'CREATE ROLE tandem_app LOGIN NOSUPERUSER PASSWORD %L',
                    current_setting('tandem.app_pw')
                );
            ELSE
                EXECUTE format(
                    'ALTER ROLE tandem_app WITH LOGIN NOSUPERUSER PASSWORD %L',
                    current_setting('tandem.app_pw')
                );
            END IF;
        END $$;
        """
    )
    op.execute("GRANT USAGE ON SCHEMA public TO tandem_app")
    op.execute(
        "GRANT SELECT, INSERT, UPDATE, DELETE ON families, members TO tandem_app"
    )
    # Tablas futuras (p. ej. children en la issue 03) heredan los grants.
    op.execute(
        "ALTER DEFAULT PRIVILEGES IN SCHEMA public "
        "GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO tandem_app"
    )


def downgrade() -> None:
    op.execute(
        "ALTER DEFAULT PRIVILEGES IN SCHEMA public "
        "REVOKE SELECT, INSERT, UPDATE, DELETE ON TABLES FROM tandem_app"
    )
    op.execute("REVOKE ALL ON families, members FROM tandem_app")
    op.execute("REVOKE USAGE ON SCHEMA public FROM tandem_app")
    op.execute("DROP POLICY IF EXISTS family_isolation ON members")
    op.execute("DROP POLICY IF EXISTS family_isolation ON families")
    op.drop_index("ix_members_family_id", table_name="members")
    op.drop_table("members")
    op.drop_table("families")
    op.execute("DROP ROLE IF EXISTS tandem_app")
