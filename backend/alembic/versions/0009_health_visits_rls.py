"""health_visits: tabla de Visitas médicas con RLS por Familia

Revision ID: 0009
Revises: 0008
Create Date: 2026-06-17

Crea la tabla `health_visits` (historial de Visitas médicas por Hijo):
- `id` (UUID), `family_id`, `child_id`, `visited_at`, `diagnosis`, `notes` (JSONB),
  `created_by`, `created_at`.
- RLS + FORCE con política `family_isolation` por `app.current_family_id`.
- Índice compuesto `(child_id, visited_at DESC)` para el listado cronológico.
- Grants DML heredados del `ALTER DEFAULT PRIVILEGES` de la 0001.
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0009"
down_revision: str | None = "0008"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

FAMILY_VAR = "app.current_family_id"


def upgrade() -> None:
    op.create_table(
        "health_visits",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("family_id", sa.Text(), nullable=False),
        sa.Column("child_id", sa.Uuid(), nullable=False),
        sa.Column("visited_at", sa.Date(), nullable=False),
        sa.Column("diagnosis", sa.Text(), nullable=False),
        sa.Column("notes", sa.JSON(), nullable=True),
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
    op.create_index(
        "ix_health_visits_child_visited",
        "health_visits",
        [sa.text("child_id"), sa.text("visited_at DESC")],
    )

    op.execute("ALTER TABLE health_visits ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE health_visits FORCE ROW LEVEL SECURITY")
    op.execute(
        f"""
        CREATE POLICY family_isolation ON health_visits
        USING (family_id = current_setting('{FAMILY_VAR}', true))
        WITH CHECK (family_id = current_setting('{FAMILY_VAR}', true))
        """
    )


def downgrade() -> None:
    op.execute("DROP POLICY IF EXISTS family_isolation ON health_visits")
    op.drop_index("ix_health_visits_child_visited", table_name="health_visits")
    op.drop_table("health_visits")
