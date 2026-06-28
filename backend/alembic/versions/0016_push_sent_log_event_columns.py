"""push_sent_log: columnas de discriminador de Evento

Revision ID: 0016
Revises: 0015
Create Date: 2026-06-24

Extiende `push_sent_log` para soportar Avisos de Evento:
- `event_id` (UUID FK nullable → events.id)
- `event_instant` (TIMESTAMPTZ nullable, instante absoluto del Evento en TZ)
- `alert_type` (TEXT nullable: lead_60m / lead_24h / morning_of / morning_before)
- UNIQUE `(event_id, event_instant, alert_type)` para anti-duplicado de Eventos.
- `dose_due_at` pasa a nullable (las filas de Evento no lo usan).
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0016"
down_revision: str | None = "0015"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Make dose_due_at nullable (event entries don't use it)
    op.alter_column(
        "push_sent_log",
        "dose_due_at",
        existing_type=sa.DateTime(timezone=True),
        nullable=True,
    )

    op.add_column(
        "push_sent_log",
        sa.Column("event_id", sa.Uuid(), sa.ForeignKey("events.id"), nullable=True),
    )
    op.add_column(
        "push_sent_log",
        sa.Column("event_instant", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "push_sent_log",
        sa.Column("alert_type", sa.Text(), nullable=True),
    )

    op.create_unique_constraint(
        "uq_event_instant_alert",
        "push_sent_log",
        ["event_id", "event_instant", "alert_type"],
    )


def downgrade() -> None:
    op.drop_constraint("uq_event_instant_alert", "push_sent_log", type_="unique")
    op.drop_column("push_sent_log", "alert_type")
    op.drop_column("push_sent_log", "event_instant")
    op.drop_column("push_sent_log", "event_id")
    op.alter_column(
        "push_sent_log",
        "dose_due_at",
        existing_type=sa.DateTime(timezone=True),
        nullable=False,
    )
