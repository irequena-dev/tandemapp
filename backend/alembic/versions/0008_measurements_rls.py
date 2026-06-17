"""measurements: tabla de Medidas (altura, peso) con RLS por Familia

Revision ID: 0005
Revises: 0004
Create Date: 2026-06-17

Crea la tabla `measurements` para el registro append-only de Medidas de un Hijo:
- `id` (UUID), `family_id`, `child_id`, `type` (height|weight), `value`,
  `unit`, `measured_at`, `recorded_by`, `created_at`.
- RLS + FORCE con política `family_isolation` por `app.current_family_id`.
- Índice compuesto `(child_id, type, measured_at DESC)` para consulta de
  "valor actual" (más reciente por tipo) y listado histórico.
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0008"
down_revision: str | None = "0007"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

FAMILY_VAR = "app.current_family_id"


def upgrade() -> None:
    op.create_table(
        "measurements",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("family_id", sa.Text(), nullable=False),
        sa.Column("child_id", sa.Uuid(), nullable=False),
        sa.Column(
            "type",
            sa.Text(),
            nullable=False,
        ),
        sa.Column("value", sa.Numeric(), nullable=False),
        sa.Column("unit", sa.Text(), nullable=False),
        sa.Column("measured_at", sa.Date(), nullable=False),
        sa.Column("recorded_by", sa.Text(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.ForeignKeyConstraint(["family_id"], ["families.id"]),
        sa.ForeignKeyConstraint(["child_id"], ["children.id"]),
        sa.ForeignKeyConstraint(["recorded_by"], ["members.id"]),
        sa.CheckConstraint("type IN ('height', 'weight')", name="ck_measurements_type"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_measurements_family_id", "measurements", ["family_id"])
    op.create_index("ix_measurements_child_id", "measurements", ["child_id"])
    op.create_index(
        "ix_measurements_child_type_date",
        "measurements",
        ["child_id", "type", sa.text("measured_at DESC")],
    )

    op.execute("ALTER TABLE measurements ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE measurements FORCE ROW LEVEL SECURITY")
    op.execute(
        f"""
        CREATE POLICY family_isolation ON measurements
        USING (family_id = current_setting('{FAMILY_VAR}', true))
        WITH CHECK (family_id = current_setting('{FAMILY_VAR}', true))
        """
    )


def downgrade() -> None:
    op.execute("DROP POLICY IF EXISTS family_isolation ON measurements")
    op.drop_index("ix_measurements_child_type_date", table_name="measurements")
    op.drop_index("ix_measurements_child_id", table_name="measurements")
    op.drop_index("ix_measurements_family_id", table_name="measurements")
    op.drop_table("measurements")
