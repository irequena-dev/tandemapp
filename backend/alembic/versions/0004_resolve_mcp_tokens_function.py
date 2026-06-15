"""resolve_mcp_token: SECURITY DEFINER para resolver token → (Miembro, Familia)

Revision ID: 0004
Revises: 0003
Create Date: 2026-06-15

Crea la función `resolve_mcp_token(p_token_hash text)` que el servidor MCP
(issue 05) usa como bootstrap de autenticación: dado el hash del token presentado,
devuelve `(member_id, family_id, token_hash)` de la fila activa (no revocada).

- `SECURITY DEFINER`: se ejecuta con los privilegios de su OWNER (el rol de
  migración, SUPERUSER en dev/test). Así puede leer `mcp_tokens` de CUALQUIER
  Familia sin necesidad de fijar `app.current_family_id` (que aún se desconoce:
  es justo lo que estamos autenticando). Los superuser bypasan RLS incluso con
  FORCE, así que la función ve todas las Familias.
- `STABLE`: solo lectura; el planificador puede cachear por consulta.
- Filtra `revoked_at IS NULL`: un token revocado es como inexistente.
- `GRANT EXECUTE ... TO tandem_app`: el rol de aplicación (NOSUPERUSER, sujeto
  a RLS) puede invocarla; al hacerlo, "salta" transitoriamente RLS vía el
  contexto SECURITY DEFINER del owner. Es la única puerta deliberada al efecto.
"""

from collections.abc import Sequence

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0004"
down_revision: str | None = "0003"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute(
        """
        CREATE OR REPLACE FUNCTION resolve_mcp_token(p_token_hash text)
        RETURNS TABLE(member_id text, family_id text, token_hash text)
        LANGUAGE sql
        SECURITY DEFINER
        STABLE
        AS $$
            SELECT member_id, family_id, token_hash
            FROM mcp_tokens
            WHERE token_hash = p_token_hash
              AND revoked_at IS NULL
        $$
        """
    )
    op.execute("GRANT EXECUTE ON FUNCTION resolve_mcp_token(text) TO tandem_app")


def downgrade() -> None:
    op.execute("DROP FUNCTION IF EXISTS resolve_mcp_token(text)")
