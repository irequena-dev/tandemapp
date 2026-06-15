import uuid
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from ..models import McpToken, McpTokenCreated, McpTokenOut
from ..tenancy import current_family_id, current_member_id, family_session
from ..tokens import generate_token, hash_token

router = APIRouter(tags=["mcp-tokens"])


@router.post("/mcp-tokens", status_code=status.HTTP_201_CREATED)
async def create_token(
    member_id: str = Depends(current_member_id),
    family_id: str = Depends(current_family_id),
    session: AsyncSession = Depends(family_session),
) -> McpTokenCreated:
    """Genera un token MCP para el Miembro autenticado.

    El valor en claro se devuelve aquí (única vez) y se persiste solo como hash.
    `family_id`/`member_id` los impone el servidor desde el contexto autenticado;
    `family_id` coincide con `app.current_family_id`, así que el WITH CHECK de
    RLS lo acepta.
    """
    plaintext = generate_token()
    token = McpToken(
        member_id=member_id,
        family_id=family_id,
        token_hash=hash_token(plaintext),
        created_at=datetime.now(UTC),
    )
    session.add(token)
    await session.flush()
    await session.refresh(token)
    return McpTokenCreated(id=token.id, token=plaintext, created_at=token.created_at)


@router.get("/mcp-tokens")
async def list_tokens(
    member_id: str = Depends(current_member_id),
    session: AsyncSession = Depends(family_session),
) -> list[McpTokenOut]:
    """Lista los tokens del Miembro autenticado (metadata, nunca el valor).

    RLS acota por Familia; el filtro por `member_id` acota al Miembro dentro de
    ella. `response_model` deja caer `token_hash`/`member_id`/`family_id`.
    """
    result = await session.execute(
        select(McpToken)
        .where(McpToken.member_id == member_id)
        .order_by(McpToken.created_at.desc())
    )
    return list(result.scalars().all())


@router.delete("/mcp-tokens/{token_id}", status_code=status.HTTP_204_NO_CONTENT)
async def revoke_token(
    token_id: uuid.UUID,
    member_id: str = Depends(current_member_id),
    session: AsyncSession = Depends(family_session),
) -> None:
    """Revoca un token del Miembro autenticado (soft delete: fija `revoked_at`).

    RLS oculta los tokens de otra Familia; el check de `member_id` oculta los de
    otro Miembro dentro de la misma Familia. Ambos casos se comportan como
    inexistentes: 404, nunca 403.
    """
    token = await session.get(McpToken, token_id)
    if token is None or token.member_id != member_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Token no encontrado"
        )
    if token.revoked_at is None:
        token.revoked_at = datetime.now(UTC)
    session.add(token)
    await session.flush()
