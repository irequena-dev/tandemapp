"""pautas: tabla de Pautas (tratamientos) con RLS por Familia

Revision ID: 0007b
Revises: 0007a
Create Date: 2026-06-17

Crea la tabla `pautas` para los tratamientos activos/finalizados:
- `id` (UUID), `family_id`, `child_id`, `medication`, `dose`,
  `interval_hours`, `duration_days`, `started_at`, `status`,
  `health_visit_id` (nullable), `created_by`, `created_at`.
- RLS + FORCE con política `family_isolation` por `app.current_family_id`.
- Índices: `(family_id, status)` y `(child_id)`.
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0007b"
down_revision: str | None = "0007a"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

FAMILY_VAR = "app.current_family_id"


def upgrade() -> None:
    op.create_table(
        "pautas",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("family_id", sa.Text(), nullable=False),
        sa.Column("child_id", sa.Uuid(), nullable=False),
        sa.Column("medication", sa.Text(), nullable=False),
        sa.Column("dose", sa.Text(), nullable=False),
        sa.Column("interval_hours", sa.SmallInteger(), nullable=False),
        sa.Column("duration_days", sa.SmallInteger(), nullable=False),
        sa.Column(
            "started_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column(
            "status",
            sa.Text(),
            nullable=False,
            server_default=sa.text("'active'"),
        ),
        sa.Column("health_visit_id", sa.Uuid(), nullable=True),
        sa.Column("created_by", sa.Text(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.ForeignKeyConstraint(["family_id"], ["families.id"]),
        sa.ForeignKeyConstraint(["child_id"], ["children.id"]),
        sa.ForeignKeyConstraint(["created_by"], ["members.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_pautas_family_status", "pautas", ["family_id", "status"])
    op.create_index("ix_pautas_child_id", "pautas", ["child_id"])

    op.execute("ALTER TABLE pautas ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE pautas FORCE ROW LEVEL SECURITY")
    op.execute(
        f"""
        CREATE POLICY family_isolation ON pautas
        USING (family_id = current_setting('{FAMILY_VAR}', true))
        WITH CHECK (family_id = current_setting('{FAMILY_VAR}', true))
        """
    )


def downgrade() -> None:
    op.execute("DROP POLICY IF EXISTS family_isolation ON pautas")
    op.drop_index("ix_pautas_child_id", table_name="pautas")
    op.drop_index("ix_pautas_family_status", table_name="pautas")
    op.drop_table("pautas")
