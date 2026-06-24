"""Router REST para suscripciones Web Push.

- GET  /api/push/vapid-public-key → clave pública VAPID.
- POST /api/push/subscribe        → alta idempotente por endpoint (upsert).
- POST /api/push/unsubscribe      → baja por endpoint.
"""

from fastapi import APIRouter, Depends, Response, status
from sqlmodel import select

from ..config import Settings, get_settings
from ..models import (
    PushSubscription,
    PushSubscriptionCreate,
    PushSubscriptionOut,
)
from ..tenancy import FamilyScope, family_session

router = APIRouter(prefix="/api/push", tags=["push"])


@router.get("/vapid-public-key")
async def get_vapid_public_key(
    _scope: FamilyScope = Depends(family_session),
    settings: Settings = Depends(get_settings),
) -> dict[str, str]:
    return {"vapid_public_key": settings.vapid_public_key}


@router.post("/subscribe")
async def subscribe(
    data: PushSubscriptionCreate,
    response: Response,
    scope: FamilyScope = Depends(family_session),
) -> PushSubscriptionOut:
    session = scope.session
    stmt = select(PushSubscription).where(
        PushSubscription.endpoint == data.endpoint,
    )
    result = await session.execute(stmt)
    existing = result.scalar_one_or_none()

    if existing is not None:
        existing.p256dh = data.p256dh
        existing.auth = data.auth
        existing.member_id = scope.member_id
        session.add(existing)
        await session.flush()
        await session.refresh(existing)
        response.status_code = status.HTTP_200_OK
        return PushSubscriptionOut.model_validate(existing)

    sub = PushSubscription(
        family_id=scope.family_id,
        member_id=scope.member_id,
        endpoint=data.endpoint,
        p256dh=data.p256dh,
        auth=data.auth,
    )
    session.add(sub)
    await session.flush()
    await session.refresh(sub)
    response.status_code = status.HTTP_201_CREATED
    return PushSubscriptionOut.model_validate(sub)


@router.post("/unsubscribe", status_code=status.HTTP_204_NO_CONTENT)
async def unsubscribe(
    data: dict,
    scope: FamilyScope = Depends(family_session),
) -> None:
    session = scope.session
    endpoint = data.get("endpoint", "")
    stmt = select(PushSubscription).where(
        PushSubscription.endpoint == endpoint,
    )
    result = await session.execute(stmt)
    existing = result.scalar_one_or_none()
    if existing is not None:
        await session.delete(existing)
        await session.flush()
