"""mcp_tokens: tokens MCP por Miembro con RLS por Familia

Revision ID: 0003
Revises: 0002
Create Date: 2026-06-15

Crea la tabla `mcp_tokens` (token MCP de cada Miembro, ADR-0001):
- `id` (UUID), `member_id`, `family_id`, `token_hash`, `created_at`,
  `revoked_at` (metadatos de revocación; nullable = activo).
- El valor en claro NUNCA se persiste: solo su hash SHA-256.
- RLS + FORCE con política `family_isolation` por `app.current_family_id`
  (cada tabla family-scoped necesita su PROPIA política; no se hereda).
- Los grants DML los hereda del `ALTER DEFAULT PRIVILEGES` de la 0001.
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0003"
down_revision: str | None = "0002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# Variable de sesión que fija la Familia activa por transacción (SET LOCAL).
FAMILY_VAR = "app.current_family_id"


def upgrade() -> None:
    op.create_table(
        "mcp_tokens",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("member_id", sa.Text(), nullable=False),
        sa.Column("family_id", sa.Text(), nullable=False),
        sa.Column("token_hash", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["family_id"], ["families.id"]),
        sa.ForeignKeyConstraint(["member_id"], ["members.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_mcp_tokens_family_id", "mcp_tokens", ["family_id"])
    op.create_index("ix_mcp_tokens_member_id", "mcp_tokens", ["member_id"])

    op.execute("ALTER TABLE mcp_tokens ENABLE ROW LEVEL SECURITY")
    # FORCE para que ni el owner se salte RLS (defensa en profundidad).
    op.execute("ALTER TABLE mcp_tokens FORCE ROW LEVEL SECURITY")
    op.execute(
        f"""
        CREATE POLICY family_isolation ON mcp_tokens
        USING (family_id = current_setting('{FAMILY_VAR}', true))
        WITH CHECK (family_id = current_setting('{FAMILY_VAR}', true))
        """
    )


def downgrade() -> None:
    op.execute("DROP POLICY IF EXISTS family_isolation ON mcp_tokens")
    op.drop_index("ix_mcp_tokens_member_id", table_name="mcp_tokens")
    op.drop_index("ix_mcp_tokens_family_id", table_name="mcp_tokens")
    op.drop_table("mcp_tokens")
