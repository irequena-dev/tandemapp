"""sizes: tabla de Tallas (ropa, calzado) con RLS por Familia

Revision ID: 0007
Revises: 0006
Create Date: 2026-06-17

Crea la tabla `sizes` (Tallas), append-only: etiquetas de talla por Hijo.
- `id` (UUID), `family_id`, `child_id`, `type` (clothing|footwear), `label`,
  `recorded_at`, `recorded_by`, `created_at`.
- RLS + FORCE con política `family_isolation` por `app.current_family_id`.
- Índice compuesto `(child_id, type, recorded_at DESC)` para consultar la actual.
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0007c"
down_revision: str | None = "0006"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

FAMILY_VAR = "app.current_family_id"


def upgrade() -> None:
    op.create_table(
        "sizes",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("family_id", sa.Text(), nullable=False),
        sa.Column("child_id", sa.Uuid(), nullable=False),
        sa.Column(
            "type",
            sa.Text(),
            nullable=False,
        ),
        sa.Column("label", sa.Text(), nullable=False),
        sa.Column("recorded_at", sa.Date(), nullable=False),
        sa.Column("recorded_by", sa.Text(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.ForeignKeyConstraint(["family_id"], ["families.id"]),
        sa.ForeignKeyConstraint(["child_id"], ["children.id"]),
        sa.ForeignKeyConstraint(["recorded_by"], ["members.id"]),
        sa.CheckConstraint("type IN ('clothing', 'footwear')", name="ck_sizes_type"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_sizes_family_id", "sizes", ["family_id"])
    op.create_index("ix_sizes_child_id", "sizes", ["child_id"])
    op.create_index(
        "ix_sizes_child_type_recorded",
        "sizes",
        ["child_id", "type", sa.text("recorded_at DESC")],
    )

    op.execute("ALTER TABLE sizes ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE sizes FORCE ROW LEVEL SECURITY")
    op.execute(
        f"""
        CREATE POLICY family_isolation ON sizes
        USING (family_id = current_setting('{FAMILY_VAR}', true))
        WITH CHECK (family_id = current_setting('{FAMILY_VAR}', true))
        """
    )


def downgrade() -> None:
    op.execute("DROP POLICY IF EXISTS family_isolation ON sizes")
    op.drop_index("ix_sizes_child_type_recorded", table_name="sizes")
    op.drop_index("ix_sizes_child_id", table_name="sizes")
    op.drop_index("ix_sizes_family_id", table_name="sizes")
    op.drop_table("sizes")
