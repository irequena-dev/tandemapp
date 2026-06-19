"""shopping_items: columnas bought_by / bought_at para tachar y deshacer

Revision ID: 0010
Revises: 0009
Create Date: 2026-06-17

Añade `bought_by` (FK → members.id, nullable) y `bought_at` (TIMESTAMPTZ,
nullable) a `shopping_items`. Al tachar un Ítem el backend fija ambas columnas
con el Miembro del JWT; al deshacer las limpia.
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0010"
down_revision: str | None = "0009"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "shopping_items",
        sa.Column("bought_by", sa.Text(), nullable=True),
    )
    op.add_column(
        "shopping_items",
        sa.Column("bought_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_foreign_key(
        "fk_shopping_items_bought_by",
        "shopping_items",
        "members",
        ["bought_by"],
        ["id"],
    )


def downgrade() -> None:
    op.drop_constraint(
        "fk_shopping_items_bought_by", "shopping_items", type_="foreignkey"
    )
    op.drop_column("shopping_items", "bought_at")
    op.drop_column("shopping_items", "bought_by")
