"""Generación y hasheado del token MCP por Miembro (ADR-0001).

El Miembro genera un token de alta entropía (≥32 bytes); el backend lo persiste
**solo** como hash SHA-256 y devuelve el valor en claro una única vez. El hash es
determinista e indexable, de forma que la autenticación del servidor MCP (issue
05) pueda resolver el token a su Miembro/Familia por lookup del hash.
"""

import hashlib
import secrets

# Entropía del token en bytes (≥32 según ADR-0001).
TOKEN_ENTROPY_BYTES = 32
# Prefijo para reconocer el token de Tándem (y facilitar scanners de secretos).
TOKEN_PREFIX = "tdm_live_"


def generate_token() -> str:
    """Token de alta entropía (≥32 bytes) listo para mostrar al Miembro."""
    return TOKEN_PREFIX + secrets.token_urlsafe(TOKEN_ENTROPY_BYTES)


def hash_token(token: str) -> str:
    """Hash SHA-256 (hex) del token para almacenar; nunca el valor en claro."""
    return hashlib.sha256(token.encode()).hexdigest()
