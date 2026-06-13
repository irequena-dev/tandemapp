# Especificación Técnica de Proyecto: CaosCero

## Resumen Ejecutivo de la Idea
CaosCero (caoscero.es) es una plataforma web móvil (PWA) híbrida y multi-inquilino (multi-tenant) diseñada para eliminar la carga mental logística en la crianza de los hijos. Resuelve el problema de la falta de manos libres mediante un flujo asíncrono doble:
1. Entrada de datos (Manos libres): Interfaz por voz delegada en la aplicación móvil de Claude mediante un servidor MCP (Model Context Protocol) remoto. El usuario dicta texto libre, la IA clasifica la intención y escribe datos estructurados en la base de datos.
2. Consulta e interacción (Visual y veloz): Una aplicación web en React (PWA) optimizada para móviles para consultar, tachar o validar datos en tiempo real (listas de la compra, métricas/tallas de ropa, pautas e historial médico) con coste cero de tokens y latencia inmediata.

## Stack Tecnológico General
Frontend: React (Vite) configurado como PWA (Progressive Web App).
Gestión de Estado/Data Fetching: TanStack Query (React Query) para caché avanzada y Optimistic Updates (actualizaciones optimistas en UI).
Autenticación y Gestión Familiar: Clerk (utilizando la característica nativa de Clerk Organizations).
Backend: Python con FastAPI + FastMCP (asíncrono, ideal para el transporte SSE de MCP) y SQLModel (SQLAlchemy + Pydantic).
Base de Datos: PostgreSQL con soporte para columnas JSONB para almacenar los metadatos médicos variables extraídos por la IA.

## Arquitectura de Seguridad y Multi-Tenancy
Aislamiento de Datos (Multi-tenancy relacional)
Cada "Familia" equivale a una Organización en Clerk.
Todas las tablas funcionales de la base de datos de Postgres deben incluir de forma obligatoria la columna family_id (mapeada con el org_id de Clerk). Activar RLS (Row Level Security) en PostgreSQL.
Cualquier query (SELECT, INSERT, UPDATE, DELETE) en el backend debe filtrar estrictamente por el family_id del contexto del usuario.

## Seguridad del Servidor MCP Remoto
El backend expone un endpoint MCP público para que lo invoquen los llm mediante MCP:
1. Autenticación por Token: Cabecera personalizada Authorization: Bearer <TOKEN_DE_ALTA_ENTROPIA> configurada en el conector MCP de Claude. Cada familia tiene su propio token generado con criptografía segura (mínimo 32 bytes).
2. Comparación en Tiempo Constante: En Python, la validación del token MCP se hace mediante secrets.compare_digest() para mitigar ataques de tiempo (timing attacks).
3. Rate Limiting: Umbral estricto en el proxy inverso (ej. máximo 15 peticiones por minuto por token) para mitigar denegaciones de servicio.

## Propuesta de scaffolding

caoscero/
├── frontend/
│   ├── public/
│   │   └── manifest.json         # Configuración PWA
│   ├── src/
│   │   ├── components/           # Componentes UI reutilizables
│   │   ├── hooks/                # Hooks personalizados de TanStack Query
│   │   ├── pages/
│   │   │   ├── Dashboard.jsx     # Vista general
│   │   │   ├── ShoppingList.jsx  # Lista interactiva con Optimistic Updates
│   │   │   ├── Metrics.jsx       # Tallas y alturas de niños
│   │   │   └── Health.jsx        # Historial médico / Pautas
│   │   ├── App.jsx               # Integración de ClerkProvider y QueryClientProvider
│   │   └── main.jsx
│   ├── package.json
│   └── vite.config.js
│
├── backend/
│   ├── app/
│   │   ├── __init__.py
│   │   ├── main.py               # Inicialización de FastAPI (Une REST y MCP)
│   │   ├── config.py             # Variables de entorno y seguridad
│   │   ├── database.py           # Configuración de SQLModel / SQLAlchemy
│   │   ├── models.py             # Modelos de SQLModel (Postgres Schemas)
│   │   ├── api/                  # Endpoints REST para la App de React
│   │   │   ├── auth.py           # Middleware de verificación de JWT de Clerk
│   │   │   ├── shopping.py
│   │   │   ├── metrics.py
│   │   │   └── health.py
│   │   └── mcp/                  # Servidor MCP Remoto (Transporte SSE)
│   │       ├── server.py         # Configuración del protocolo MCP Python SDK
│   │       ├── auth_mcp.py       # Validación de cabecera custom token (compare_digest)
│   │       └── tools.py          # Definición de herramientas (Tools) expuestas a Claude
│   ├── requirements.txt
│   └── Dockerfile

## Flujo de Trabajo del Servidor MCP (Python)
El archivo backend/app/mcp/tools.py debe registrar e implementar funciones asíncronas decoradas para que el SDK de MCP las exponga como herramientas estructuradas (herramientas que Claude leerá basándose en sus esquemas de validación).

Ejemplo de definición conceptual de herramientas:

- add_shopping_items(items: list[str]): Inserta registros en shopping_items bajo el family_id autenticado con estado pending.
- update_child_metrics(child_name: str, height_cm: Optional[int], shoe_size: Optional[int]): Actualiza o inserta las últimas tallas registradas en children_metrics.
- record_health_visit(child_name: str, diagnosis: str, treatment: dict): Inserta en health_records guardando el diccionario de tratamiento directamente en la columna JSONB.