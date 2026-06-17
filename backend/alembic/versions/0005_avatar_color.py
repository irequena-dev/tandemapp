"""children.avatar_color: color de avatar por Hijo (paleta acotada)

Revision ID: 0005
Revises: 0004
Create Date: 2026-06-17

Añade `avatar_color` TEXT nullable a `children`. Almacena la clave de la
paleta de identidad (clay, sage, ochre, terracotta, olive, rosewood).
Los Hijos sin color usan un fallback determinista derivado de su `id` en el
frontend. No requiere backfill.
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0005"
down_revision: str | None = "0004"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("children", sa.Column("avatar_color", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("children", "avatar_color")
