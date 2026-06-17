"""event_types: Tipos de Evento con RLS por Familia y tipos base

Revision ID: 0006
Revises: 0005
Create Date: 2026-06-17

Crea la tabla `event_types` con `family_id` nullable (NULL = tipo base del
sistema). RLS especial: lectura permite tipos base (`family_id IS NULL`) además
de los de la Familia; escritura solo admite filas de la Familia. Siembra los
cinco tipos base: Médico, Cole, Extraescolar, Trámite, Otros.
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0006"
down_revision: str | None = "0005"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

FAMILY_VAR = "app.current_family_id"

SYSTEM_TYPES = [
    ("Médico", "stethoscope"),
    ("Cole", "school"),
    ("Extraescolar", "activity"),
    ("Trámite", "file"),
    ("Otros", "circle"),
]


def upgrade() -> None:
    op.create_table(
        "event_types",
        sa.Column(
            "id",
            sa.Uuid(),
            nullable=False,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column("family_id", sa.Text(), nullable=True),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column(
            "icon",
            sa.Text(),
            nullable=False,
            server_default=sa.text("'circle'"),
        ),
        sa.Column(
            "is_system",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
        sa.ForeignKeyConstraint(["family_id"], ["families.id"]),
        sa.PrimaryKeyConstraint("id"),
    )

    op.execute("ALTER TABLE event_types ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE event_types FORCE ROW LEVEL SECURITY")

    # Lectura: tipos base (family_id IS NULL) + los de la Familia activa.
    op.execute(
        f"""
        CREATE POLICY event_types_read ON event_types
        FOR SELECT
        USING (family_id IS NULL OR family_id = current_setting('{FAMILY_VAR}', true))
        """
    )

    # Escritura: solo filas de la Familia activa (no se pueden insertar tipos base).
    op.execute(
        f"""
        CREATE POLICY event_types_write ON event_types
        FOR ALL
        USING (family_id = current_setting('{FAMILY_VAR}', true))
        WITH CHECK (family_id = current_setting('{FAMILY_VAR}', true))
        """
    )

    # Grants explícitos para el rol de aplicación (tandem_app).
    op.execute("GRANT SELECT, INSERT, UPDATE, DELETE ON event_types TO tandem_app")

    # Sembrar tipos base del sistema (family_id = NULL, is_system = true).
    for name, icon in SYSTEM_TYPES:
        op.execute(
            sa.text(
                "INSERT INTO event_types (id, family_id, name, icon, is_system) "
                "VALUES (gen_random_uuid(), NULL, :name, :icon, true)"
            ).bindparams(name=name, icon=icon)
        )


def downgrade() -> None:
    op.execute("DROP POLICY IF EXISTS event_types_write ON event_types")
    op.execute("DROP POLICY IF EXISTS event_types_read ON event_types")
    op.drop_table("event_types")
