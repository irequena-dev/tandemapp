"""events: Eventos de la agenda con RLS por Familia

Revision ID: 0011
Revises: 0010
Create Date: 2026-06-17

Crea la tabla `events` (Eventos de la agenda por Familia):
- `id` (UUID), `family_id`, `title`, `date`, `time` (nullable = día completo),
  `event_type_id` (FK → event_types), `child_id` (nullable FK → children),
  `status` (pending/done), `series_id` (nullable), `created_by`, `created_at`.
- RLS + FORCE con política `family_isolation` por `app.current_family_id`.
- Índices: (family_id, date), (event_type_id), (child_id).
- Grants para `tandem_app`.
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0011"
down_revision: str | None = "0010"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

FAMILY_VAR = "app.current_family_id"


def upgrade() -> None:
    op.create_table(
        "events",
        sa.Column(
            "id",
            sa.Uuid(),
            nullable=False,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column("family_id", sa.Text(), nullable=False),
        sa.Column("title", sa.Text(), nullable=False),
        sa.Column("date", sa.Date(), nullable=False),
        sa.Column("time", sa.Time(), nullable=True),
        sa.Column("event_type_id", sa.Uuid(), nullable=False),
        sa.Column("child_id", sa.Uuid(), nullable=True),
        sa.Column(
            "status",
            sa.Text(),
            nullable=False,
            server_default=sa.text("'pending'"),
        ),
        sa.Column("series_id", sa.Uuid(), nullable=True),
        sa.Column("created_by", sa.Text(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.ForeignKeyConstraint(["family_id"], ["families.id"]),
        sa.ForeignKeyConstraint(["event_type_id"], ["event_types.id"]),
        sa.ForeignKeyConstraint(["child_id"], ["children.id"]),
        sa.ForeignKeyConstraint(["created_by"], ["members.id"]),
        sa.PrimaryKeyConstraint("id"),
    )

    # Índices compuestos según contrato.
    op.create_index("ix_events_family_date", "events", ["family_id", "date"])
    op.create_index("ix_events_event_type_id", "events", ["event_type_id"])
    op.create_index("ix_events_child_id", "events", ["child_id"])

    # RLS por Familia.
    op.execute("ALTER TABLE events ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE events FORCE ROW LEVEL SECURITY")

    op.execute(
        f"""
        CREATE POLICY events_family_isolation ON events
        USING (family_id = current_setting('{FAMILY_VAR}', true))
        WITH CHECK (family_id = current_setting('{FAMILY_VAR}', true))
        """
    )

    # Grants para el rol de aplicación.
    op.execute("GRANT SELECT, INSERT, UPDATE, DELETE ON events TO tandem_app")


def downgrade() -> None:
    op.execute("DROP POLICY IF EXISTS events_family_isolation ON events")
    op.drop_index("ix_events_child_id", table_name="events")
    op.drop_index("ix_events_event_type_id", table_name="events")
    op.drop_index("ix_events_family_date", table_name="events")
    op.drop_table("events")
