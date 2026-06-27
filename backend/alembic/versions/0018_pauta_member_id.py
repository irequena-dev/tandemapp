"""pautas: child_id nullable, member_id FK, CHECK exclusividad

Revision ID: 0018
Revises: 0017
Create Date: 2026-06-27

child_id pasa a nullable; se anade member_id UUID FK a members(id);
CHECK constraint: exactamente uno de (child_id, member_id) relleno.
Indice en member_id.
"""

from collections.abc import Sequence

from alembic import op

revision: str = "0018"
down_revision: str | None = "0017"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # 1. child_id DROP NOT NULL
    op.execute("ALTER TABLE pautas ALTER COLUMN child_id DROP NOT NULL")

    # 2. ADD member_id UUID FK
    op.execute("ALTER TABLE pautas ADD COLUMN member_id TEXT REFERENCES members(id)")

    # 3. CHECK constraint: exactamente uno relleno
    op.execute(
        "ALTER TABLE pautas ADD CONSTRAINT chk_pauta_subject "
        "CHECK ("
        "  (child_id IS NOT NULL) != (member_id IS NOT NULL)"
        ")"
    )

    # 4. Index on member_id
    op.create_index("ix_pautas_member_id", "pautas", ["member_id"])


def downgrade() -> None:
    op.drop_index("ix_pautas_member_id", table_name="pautas")
    op.execute("ALTER TABLE pautas DROP CONSTRAINT IF EXISTS chk_pauta_subject")
    op.execute("ALTER TABLE pautas DROP COLUMN IF EXISTS member_id")
    # Restore NOT NULL — only safe if all rows have child_id
    op.execute("ALTER TABLE pautas ALTER COLUMN child_id SET NOT NULL")


# Grant DML to tandem_app (consistent with other migrations)
