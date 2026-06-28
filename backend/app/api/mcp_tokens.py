import uuid
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import select

from ..models import McpToken, McpTokenCreated, McpTokenOut
from ..tenancy import FamilyScope, family_session
from ..tokens import generate_token, hash_token

router = APIRouter(tags=["mcp-tokens"])


@router.post("/mcp-tokens", status_code=status.HTTP_201_CREATED)
async def create_token(
    scope: FamilyScope = Depends(family_session),
) -> McpTokenCreated:
    """Genera un token MCP para el Miembro autenticado.

    El valor en claro se devuelve aquí (única vez) y se persiste solo como hash.
    `family_id`/`member_id` los impone el servidor desde el contexto autenticado;
    `family_id` coincide con `app.current_family_id`, así que el WITH CHECK de
    RLS lo acepta.
    """
    plaintext = generate_token()
    token = McpToken(
        member_id=scope.member_id,
        family_id=scope.family_id,
        token_hash=hash_token(plaintext),
        created_at=datetime.now(UTC),
    )
    scope.session.add(token)
    await scope.session.flush()
    await scope.session.refresh(token)
    return McpTokenCreated(id=token.id, token=plaintext, created_at=token.created_at)


@router.get("/mcp-tokens", response_model=list[McpTokenOut])
async def list_tokens(
    scope: FamilyScope = Depends(family_session),
) -> list[McpTokenOut]:
    """Lista los tokens del Miembro autenticado (metadata, nunca el valor).

    RLS acota por Familia; el filtro por `member_id` acota al Miembro dentro de
    ella. `response_model` deja caer `token_hash`/`member_id`/`family_id`.
    """
    result = await scope.session.execute(
        select(McpToken)
        .where(McpToken.member_id == scope.member_id)
        .order_by(McpToken.created_at.desc())
    )
    return list(result.scalars().all())


@router.delete("/mcp-tokens/{token_id}", status_code=status.HTTP_204_NO_CONTENT)
async def revoke_token(
    token_id: uuid.UUID,
    scope: FamilyScope = Depends(family_session),
) -> None:
    """Revoca un token del Miembro autenticado (soft delete: fija `revoked_at`).

    RLS oculta los tokens de otra Familia; el check de `member_id` oculta los de
    otro Miembro dentro de la misma Familia. Ambos casos se comportan como
    inexistentes: 404, nunca 403.
    """
    token = await scope.session.get(McpToken, token_id)
    if token is None or token.member_id != scope.member_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Token no encontrado"
        )
    if token.revoked_at is None:
        token.revoked_at = datetime.now(UTC)
    scope.session.add(token)
    await scope.session.flush()
