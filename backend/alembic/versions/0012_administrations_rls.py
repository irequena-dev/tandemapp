"""administrations: tabla de Administraciones (dosis) con RLS por Familia

Revision ID: 0012
Revises: 0011
Create Date: 2026-06-17

Crea la tabla `administrations` (registro de dosis dadas de una Pauta):
- `id` (UUID), `family_id`, `pauta_id`, `administered_at`, `administered_by`,
  `created_at`.
- RLS + FORCE con política `family_isolation` por `app.current_family_id`.
- Índice compuesto `(pauta_id, administered_at DESC)` para la guarda de
  duplicado y el cálculo de siguiente toma.
- Grants DML heredados del `ALTER DEFAULT PRIVILEGES` de la 0001.
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0012"
down_revision: str | None = "0011"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

FAMILY_VAR = "app.current_family_id"


def upgrade() -> None:
    op.create_table(
        "administrations",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("family_id", sa.Text(), nullable=False),
        sa.Column("pauta_id", sa.Uuid(), nullable=False),
        sa.Column(
            "administered_at",
            sa.DateTime(timezone=True),
            nullable=False,
        ),
        sa.Column("administered_by", sa.Text(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.ForeignKeyConstraint(["family_id"], ["families.id"]),
        sa.ForeignKeyConstraint(["pauta_id"], ["pautas.id"]),
        sa.ForeignKeyConstraint(["administered_by"], ["members.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_administrations_pauta_at",
        "administrations",
        [sa.text("pauta_id"), sa.text("administered_at DESC")],
    )

    op.execute("ALTER TABLE administrations ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE administrations FORCE ROW LEVEL SECURITY")
    op.execute(
        f"""
        CREATE POLICY family_isolation ON administrations
        USING (family_id = current_setting('{FAMILY_VAR}', true))
        WITH CHECK (family_id = current_setting('{FAMILY_VAR}', true))
        """
    )


def downgrade() -> None:
    op.execute("DROP POLICY IF EXISTS family_isolation ON administrations")
    op.drop_index("ix_administrations_pauta_at", table_name="administrations")
    op.drop_table("administrations")
