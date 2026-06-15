"""Autenticación del servidor MCP por token (ADR-0001 / issue 05).

El servidor MCP recibe `Authorization: Bearer <token>` y debe resolverlo a su
(Miembro, Familia) SIN conocer la Familia de antemano: la variable de sesión
RLS aún no está fijada. Por eso el lookup pasa por la función `resolve_mcp_token`,
`SECURITY DEFINER` del owner (superuser) → bypasa RLS y puede leer `mcp_tokens`
de cualquier Familia. Es exactamente el bootstrap de autenticación.
"""

import secrets
from collections.abc import Mapping

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from ..tokens import hash_token


def extract_bearer(headers: Mapping[str, str]) -> str | None:
    """Extrae el token de `Authorization: Bearer <token>`; None si no aplica.

    El nombre de cabecera es case-insensitive (HTTP lo es). Exige el scheme
    `Bearer` y un token no vacío; cualquier otra forma (scheme distinto, falta
    de token, cabecera ausente) se trata como ausente → el llamante responde 401.
    """
    raw: str | None = None
    for name, value in headers.items():
        if name.lower() == "authorization":
            raw = value
            break
    if raw is None:
        return None

    parts = raw.split(maxsplit=1)
    if len(parts) != 2 or parts[0].lower() != "bearer":
        return None
    token = parts[1].strip()
    return token or None


async def resolve_token(
    session: AsyncSession, presented: str | None
) -> tuple[str, str] | None:
    """Resuelve un token MCP presentado a (member_id, family_id); None si no aplica.

    La variable RLS aún NO está fijada (es justo lo que queremos averiguar), así
    que leemos vía `resolve_mcp_token` (SECURITY DEFINER del owner superuser),
    que ve `mcp_tokens` de cualquier Familia y ya filtra por hash y por
    `revoked_at IS NULL`.

    El `secrets.compare_digest` posterior es defensa en profundidad: la función
    ya acota por `token_hash = p_token_hash` (igualdad exacta), por lo que en la
    práctica solo puede devolver la fila coincidente o ninguna. Lo mantenemos
    para que la comparación del secreto sea timing-safe y resistente a futuros
    relajamientos del filtro SQL (p. ej. un índice parcial).
    """
    if not presented:
        return None

    h = hash_token(presented)
    row = (
        await session.execute(
            text("SELECT member_id, family_id, token_hash FROM resolve_mcp_token(:h)"),
            {"h": h},
        )
    ).first()
    if row is None:
        return None

    if not secrets.compare_digest(row.token_hash, h):
        return None
    return (row.member_id, row.family_id)
