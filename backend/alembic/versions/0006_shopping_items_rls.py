"""shopping_items con RLS

Revision ID: 0005
Revises: 0004
Create Date: 2026-06-17

Tabla `shopping_items`: lista de la compra única por Familia. RLS aísla por
`family_id` con el mismo patrón de la Fase 0 (`app.current_family_id`).
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0006"
down_revision: str = "0005"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

FAMILY_VAR = "app.current_family_id"


def upgrade() -> None:
    op.create_table(
        "shopping_items",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("family_id", sa.Text(), nullable=False),
        sa.Column("text", sa.Text(), nullable=False),
        sa.Column("status", sa.Text(), nullable=False, server_default="pending"),
        sa.Column("created_by", sa.Text(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["family_id"], ["families.id"]),
        sa.ForeignKeyConstraint(["created_by"], ["members.id"]),
    )
    op.create_index("ix_shopping_items_family_id", "shopping_items", ["family_id"])

    # RLS: mismo patrón que families/members/children/mcp_tokens.
    op.execute("ALTER TABLE shopping_items ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE shopping_items FORCE ROW LEVEL SECURITY")
    op.execute(
        f"""
        CREATE POLICY family_isolation ON shopping_items
        USING (family_id = current_setting('{FAMILY_VAR}', true))
        WITH CHECK (family_id = current_setting('{FAMILY_VAR}', true))
        """
    )


def downgrade() -> None:
    op.execute("DROP POLICY IF EXISTS family_isolation ON shopping_items")
    op.drop_index("ix_shopping_items_family_id", table_name="shopping_items")
    op.drop_table("shopping_items")
