"""Servidor MCP remoto de Tándem y sus contratos de seguridad/resolución.

Montado en `/mcp` (ver `app.main`); autenticado por token MCP (ADR-0001) vía
`Authorization: Bearer`. Resuelve el token a Miembro → Familia y fija el contexto
RLS de esa Familia para cada operación.
"""
