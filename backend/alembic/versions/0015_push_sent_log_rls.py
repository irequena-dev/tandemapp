"""push_sent_log: tabla append-only de envíos push con RLS por Familia

Revision ID: 0015
Revises: 0014
Create Date: 2026-06-24

Crea la tabla `push_sent_log` (anti-duplicado de Avisos push):
- `id` (UUID PK), `family_id` (FK, index), `pauta_id` (UUID FK nullable),
  `dose_due_at` (TIMESTAMPTZ), `sent_at` (TIMESTAMPTZ, server_default=now()).
- UNIQUE `(pauta_id, dose_due_at)` para evitar reenvíos.
- RLS + FORCE con política `family_isolation` por `app.current_family_id`.
- Grants DML heredados del `ALTER DEFAULT PRIVILEGES` de la 0001.
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0015"
down_revision: str | None = "0014"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

FAMILY_VAR = "app.current_family_id"


def upgrade() -> None:
    op.create_table(
        "push_sent_log",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("family_id", sa.Text(), nullable=False),
        sa.Column("pauta_id", sa.Uuid(), nullable=True),
        sa.Column("dose_due_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column(
            "sent_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.ForeignKeyConstraint(["family_id"], ["families.id"]),
        sa.ForeignKeyConstraint(["pauta_id"], ["pautas.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("pauta_id", "dose_due_at", name="uq_pauta_dose"),
    )
    op.create_index("ix_push_sent_log_family_id", "push_sent_log", ["family_id"])

    op.execute("ALTER TABLE push_sent_log ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE push_sent_log FORCE ROW LEVEL SECURITY")
    op.execute(
        f"""
        CREATE POLICY family_isolation ON push_sent_log
        USING (family_id = current_setting('{FAMILY_VAR}', true))
        WITH CHECK (family_id = current_setting('{FAMILY_VAR}', true))
        """
    )


def downgrade() -> None:
    op.execute("DROP POLICY IF EXISTS family_isolation ON push_sent_log")
    op.drop_table("push_sent_log")
