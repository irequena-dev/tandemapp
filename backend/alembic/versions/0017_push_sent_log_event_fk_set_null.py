"""push_sent_log.event_id FK → ON DELETE SET NULL

Permite borrar Eventos que ya tienen pushes enviados sin violar la FK.
El log es append-only histórico: conserva el registro pero suelta la
referencia al Evento borrado.

Revision ID: 0017
Revises: 0016
Create Date: 2026-06-24
"""

from collections.abc import Sequence

from alembic import op

revision: str = "0017"
down_revision: str | None = "0016"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.drop_constraint("push_sent_log_event_id_fkey", "push_sent_log", type_="foreignkey")
    op.create_foreign_key(
        "push_sent_log_event_id_fkey",
        "push_sent_log",
        "events",
        ["event_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint("push_sent_log_event_id_fkey", "push_sent_log", type_="foreignkey")
    op.create_foreign_key(
        "push_sent_log_event_id_fkey",
        "push_sent_log",
        "events",
        ["event_id"],
        ["id"],
    )
