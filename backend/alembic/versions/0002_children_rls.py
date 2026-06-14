"""children: tabla de Hijos con RLS por Familia

Revision ID: 0002
Revises: 0001
Create Date: 2026-06-14

Crea la tabla `children` (Hijos), primera tabla de dominio real:
- `id` (UUID), `family_id`, `name`, `birth_date`.
- RLS + FORCE con política `family_isolation` por `app.current_family_id`
  (cada tabla family-scoped necesita su PROPIA política; no se hereda).
- Los grants DML los hereda del `ALTER DEFAULT PRIVILEGES` de la 0001, ya que
  la tabla la crea el mismo owner que fijó esos privilegios por defecto.
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0002"
down_revision: str | None = "0001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# Variable de sesión que fija la Familia activa por transacción (SET LOCAL).
FAMILY_VAR = "app.current_family_id"


def upgrade() -> None:
    op.create_table(
        "children",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("family_id", sa.Text(), nullable=False),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("birth_date", sa.Date(), nullable=False),
        sa.ForeignKeyConstraint(["family_id"], ["families.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_children_family_id", "children", ["family_id"])

    op.execute("ALTER TABLE children ENABLE ROW LEVEL SECURITY")
    # FORCE para que ni el owner se salte RLS (defensa en profundidad).
    op.execute("ALTER TABLE children FORCE ROW LEVEL SECURITY")
    op.execute(
        f"""
        CREATE POLICY family_isolation ON children
        USING (family_id = current_setting('{FAMILY_VAR}', true))
        WITH CHECK (family_id = current_setting('{FAMILY_VAR}', true))
        """
    )


def downgrade() -> None:
    op.execute("DROP POLICY IF EXISTS family_isolation ON children")
    op.drop_index("ix_children_family_id", table_name="children")
    op.drop_table("children")
