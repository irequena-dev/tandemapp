"""series: Series recurrentes (generador materializado) con RLS por Familia

Revision ID: 0013
Revises: 0012
Create Date: 2026-06-18

Crea la tabla `series` (ADR-0003): una Serie es **solo generador**; al crearse
materializa todas sus ocurrencias como Eventos independientes (cada uno con su
`series_id`). Acotada: `ends_at` o `max_count` (uno obligatorio).

- `id` (UUID), `family_id`, `cadence` (weekly/biweekly/monthly),
  `day_of_week` (SMALLINT 0=lun…6=dom, requerido si weekly/biweekly),
  `starts_at` (DATE), `ends_at` (DATE nullable), `max_count` (SMALLINT nullable),
  `created_at`.
- RLS + FORCE con política `family_isolation` por `app.current_family_id`.
- Grants para `tandem_app`.
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0013"
down_revision: str | None = "0012"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

FAMILY_VAR = "app.current_family_id"


def upgrade() -> None:
    op.create_table(
        "series",
        sa.Column(
            "id",
            sa.Uuid(),
            nullable=False,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column("family_id", sa.Text(), nullable=False),
        sa.Column("cadence", sa.Text(), nullable=False),
        sa.Column("day_of_week", sa.SmallInteger(), nullable=True),
        sa.Column("starts_at", sa.Date(), nullable=False),
        sa.Column("ends_at", sa.Date(), nullable=True),
        sa.Column("max_count", sa.SmallInteger(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.ForeignKeyConstraint(["family_id"], ["families.id"]),
        sa.CheckConstraint(
            "cadence IN ('weekly', 'biweekly', 'monthly')",
            name="series_cadence_check",
        ),
        sa.CheckConstraint(
            "(ends_at IS NOT NULL) OR (max_count IS NOT NULL)",
            name="series_bounded_check",
        ),
        sa.PrimaryKeyConstraint("id"),
    )

    # RLS por Familia.
    op.execute("ALTER TABLE series ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE series FORCE ROW LEVEL SECURITY")

    op.execute(
        f"""
        CREATE POLICY series_family_isolation ON series
        USING (family_id = current_setting('{FAMILY_VAR}', true))
        WITH CHECK (family_id = current_setting('{FAMILY_VAR}', true))
        """
    )

    op.execute("GRANT SELECT, INSERT, UPDATE, DELETE ON series TO tandem_app")


def downgrade() -> None:
    op.execute("DROP POLICY IF EXISTS series_family_isolation ON series")
    op.drop_table("series")
