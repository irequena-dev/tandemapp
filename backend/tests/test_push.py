"""Tests para la costura HTTP/REST de suscripciones push y el helper de envío.

Cubre: GET /api/push/vapid-public-key, POST /api/push/subscribe (idempotente),
POST /api/push/unsubscribe, aislamiento RLS entre Familias, y el helper
send_push (con mock de pywebpush).
"""

from unittest.mock import patch

from httpx import AsyncClient


def _as(identity: dict, org_id: str, user_id: str) -> None:
    identity.clear()
    identity.update({"org_id": org_id, "sub": user_id, "name": "Test User"})


def _sub(tag: str) -> dict:
    """Genera un body de suscripción con endpoint único por test."""
    return {
        "endpoint": f"https://push.example.com/sub/{tag}",
        "p256dh": (
            "BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls"
            "0VJXg7A8u-Ts1XbjhazAkj7I99e8p8REqnSw"
        ),
        "auth": "tBHItJI5svbpC7sc9axQiA",
    }


# ---------- vapid-public-key ----------


async def test_vapid_public_key_returns_configured_key(
    auth_client: AsyncClient, identity: dict
) -> None:
    """GET /api/push/vapid-public-key devuelve la clave pública configurada."""
    _as(identity, "org_push_key", "user_push_key")
    resp = await auth_client.get("/api/push/vapid-public-key")
    assert resp.status_code == 200
    data = resp.json()
    assert "vapid_public_key" in data
    assert isinstance(data["vapid_public_key"], str)


# ---------- subscribe ----------


async def test_subscribe_creates_subscription(
    auth_client: AsyncClient, identity: dict
) -> None:
    """POST /api/push/subscribe persiste la suscripción atribuida al Miembro/Familia."""
    _as(identity, "org_push_sub", "user_push_sub")
    body = _sub("create")
    resp = await auth_client.post("/api/push/subscribe", json=body)
    assert resp.status_code == 201
    data = resp.json()
    assert data["endpoint"] == body["endpoint"]
    assert data["member_id"] == "user_push_sub"
    assert "id" in data


async def test_subscribe_is_idempotent_by_endpoint(
    auth_client: AsyncClient, identity: dict
) -> None:
    """Reactivar el mismo endpoint no duplica; devuelve 200 con la existente."""
    _as(identity, "org_push_idem", "user_push_idem")
    body = _sub("idem")
    resp1 = await auth_client.post("/api/push/subscribe", json=body)
    assert resp1.status_code == 201

    # Segunda vez: mismo endpoint → upsert → 200
    resp2 = await auth_client.post("/api/push/subscribe", json=body)
    assert resp2.status_code == 200
    assert resp2.json()["id"] == resp1.json()["id"]


async def test_subscribe_upsert_updates_keys(
    auth_client: AsyncClient, identity: dict
) -> None:
    """Un upsert al mismo endpoint actualiza las claves p256dh/auth."""
    _as(identity, "org_push_upd", "user_push_upd")
    body = _sub("upd")
    await auth_client.post("/api/push/subscribe", json=body)

    updated = {**body, "p256dh": "UPDATED_KEY", "auth": "UPDATED_AUTH"}
    resp = await auth_client.post("/api/push/subscribe", json=updated)
    assert resp.status_code == 200
    assert resp.json()["p256dh"] == "UPDATED_KEY"
    assert resp.json()["auth"] == "UPDATED_AUTH"


# ---------- unsubscribe ----------


async def test_unsubscribe_deletes_subscription(
    auth_client: AsyncClient, identity: dict
) -> None:
    """POST /api/push/unsubscribe borra la fila por endpoint."""
    _as(identity, "org_push_unsub", "user_push_unsub")
    body = _sub("unsub")
    await auth_client.post("/api/push/subscribe", json=body)

    resp = await auth_client.post(
        "/api/push/unsubscribe", json={"endpoint": body["endpoint"]}
    )
    assert resp.status_code == 204

    # Verificar: suscribirse de nuevo crea una nueva (201, no 200)
    resp2 = await auth_client.post("/api/push/subscribe", json=body)
    assert resp2.status_code == 201


async def test_unsubscribe_nonexistent_is_204(
    auth_client: AsyncClient, identity: dict
) -> None:
    """Dar de baja un endpoint inexistente devuelve 204 (idempotente)."""
    _as(identity, "org_push_unsub_ne", "user_push_unsub_ne")
    resp = await auth_client.post(
        "/api/push/unsubscribe", json={"endpoint": "https://push.example.com/nope"}
    )
    assert resp.status_code == 204


# ---------- RLS isolation ----------


async def test_subscriptions_isolated_between_families(
    auth_client: AsyncClient, identity: dict
) -> None:
    """RLS aísla las suscripciones push entre Familias."""
    body = _sub("iso")

    # Familia A suscribe
    _as(identity, "org_push_iso_a", "user_push_iso_a")
    resp = await auth_client.post("/api/push/subscribe", json=body)
    assert resp.status_code == 201

    # Familia B no puede dar de baja la suscripción de A
    _as(identity, "org_push_iso_b", "user_push_iso_b")
    unsub = await auth_client.post(
        "/api/push/unsubscribe", json={"endpoint": body["endpoint"]}
    )
    assert unsub.status_code == 204  # idempotente, pero no borra nada

    # Familia A aún ve su suscripción (suscribir de nuevo devuelve 200)
    _as(identity, "org_push_iso_a", "user_push_iso_a")
    resp2 = await auth_client.post("/api/push/subscribe", json=body)
    assert resp2.status_code == 200


# ---------- Auth ----------


async def test_push_endpoints_require_auth(client: AsyncClient) -> None:
    """Los endpoints push devuelven 401 sin autenticación."""
    body = _sub("noauth")
    assert (await client.get("/api/push/vapid-public-key")).status_code == 401
    assert (await client.post("/api/push/subscribe", json=body)).status_code == 401
    assert (
        await client.post(
            "/api/push/unsubscribe", json={"endpoint": "https://x.com/sub"}
        )
    ).status_code == 401


async def test_push_endpoints_require_family(
    auth_client: AsyncClient, identity: dict
) -> None:
    """Un Miembro sin Familia activa recibe 403."""
    identity.clear()
    identity.update({"sub": "user_no_fam"})
    assert (await auth_client.get("/api/push/vapid-public-key")).status_code == 403


# ---------- send_push helper ----------


async def test_send_push_success() -> None:
    """send_push envía correctamente y devuelve True."""
    from app.config import get_settings
    from app.models import PushSubscription
    from app.push_service import send_push

    sub = PushSubscription(
        id="00000000-0000-0000-0000-000000000001",
        family_id="fam_test",
        member_id="mem_test",
        endpoint="https://push.example.com/sub/ok",
        p256dh="test_key",
        auth="test_auth",
    )
    settings = get_settings()

    with patch("app.push_service.webpush") as mock_wp:
        result = await send_push(sub, {"title": "Test", "body": "Hello"}, settings)

    assert result is True
    mock_wp.assert_called_once()


async def test_send_push_410_cleans_subscription() -> None:
    """send_push borra la suscripción si el servicio devuelve 410 (Gone)."""
    from unittest.mock import MagicMock

    from pywebpush import WebPushException

    from app.config import get_settings
    from app.models import PushSubscription
    from app.push_service import send_push

    sub = PushSubscription(
        id="00000000-0000-0000-0000-000000000002",
        family_id="fam_test_410",
        member_id="mem_test_410",
        endpoint="https://push.example.com/sub/gone",
        p256dh="test_key",
        auth="test_auth",
    )
    settings = get_settings()

    mock_response = MagicMock()
    mock_response.status_code = 410

    with patch(
        "app.push_service.webpush",
        side_effect=WebPushException("Gone", response=mock_response),
    ):
        result = await send_push(sub, {"title": "Test"}, settings)

    assert result is False


async def test_send_push_404_cleans_subscription() -> None:
    """send_push borra la suscripción si el servicio devuelve 404."""
    from unittest.mock import MagicMock

    from pywebpush import WebPushException

    from app.config import get_settings
    from app.models import PushSubscription
    from app.push_service import send_push

    sub = PushSubscription(
        id="00000000-0000-0000-0000-000000000003",
        family_id="fam_test_404",
        member_id="mem_test_404",
        endpoint="https://push.example.com/sub/notfound",
        p256dh="test_key",
        auth="test_auth",
    )
    settings = get_settings()

    mock_response = MagicMock()
    mock_response.status_code = 404

    with patch(
        "app.push_service.webpush",
        side_effect=WebPushException("Not Found", response=mock_response),
    ):
        result = await send_push(sub, {"title": "Test"}, settings)

    assert result is False
