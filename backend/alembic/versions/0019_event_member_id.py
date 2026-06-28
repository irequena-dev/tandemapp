"""events: member_id TEXT FK a members(id), sin CHECK de exclusividad

Revision ID: 0019
Revises: 0018
Create Date: 2026-06-28

Se anade member_id TEXT FK a members(id) para soportar Eventos cuyo sujeto
es un Miembro (no un Hijo). child_id y member_id son independientes: ambos
pueden estar rellenos a la vez (no hay CHECK de exclusividad). Indice en
member_id.
"""

from collections.abc import Sequence

from alembic import op

revision: str = "0019"
down_revision: str | None = "0018"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # 1. ADD member_id TEXT FK
    op.execute("ALTER TABLE events ADD COLUMN member_id TEXT REFERENCES members(id)")

    # 2. Index on member_id
    op.create_index("ix_events_member_id", "events", ["member_id"])


def downgrade() -> None:
    op.drop_index("ix_events_member_id", table_name="events")
    op.execute("ALTER TABLE events DROP COLUMN IF EXISTS member_id")


# Grant DML to tandem_app (consistent with other migrations)
