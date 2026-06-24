"""Helper de envío de Web Push con limpieza de suscripciones muertas."""

import json

from pywebpush import WebPushException, webpush
from sqlmodel.ext.asyncio.session import AsyncSession

from .config import Settings
from .models import PushSubscription


async def send_push(
    subscription: PushSubscription,
    payload: dict,
    settings: Settings,
    session: AsyncSession | None = None,
) -> bool:
    """Envía una notificación Web Push.

    Devuelve True si se envió con éxito, False si la suscripción
    estaba muerta (410/404) y se eliminó (requiere *session*).
    """
    sub_info = {
        "endpoint": subscription.endpoint,
        "keys": {
            "p256dh": subscription.p256dh,
            "auth": subscription.auth,
        },
    }
    vapid_claims = {
        "sub": settings.vapid_subject,
    }

    try:
        webpush(
            subscription_info=sub_info,
            data=json.dumps(payload),
            vapid_private_key=settings.vapid_private_key,
            vapid_claims=vapid_claims,
        )
        return True
    except WebPushException as exc:
        resp = getattr(exc, "response", None)
        status_code = getattr(resp, "status_code", None) if resp is not None else None
        if status_code in (404, 410):
            if session is not None:
                await session.delete(subscription)
                await session.flush()
            return False
        raise
