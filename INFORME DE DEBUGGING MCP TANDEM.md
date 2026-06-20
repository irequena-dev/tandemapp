    INFORME DE DEBUGGING MCP TANDEM + EDGE GALLERY
    ===============================================

    ESTADO: RESUELTO ✅  (tras ~7h de trabajo)
    Fecha de cierre: 2026-06-20


    ARQUITECTURA (cómo funciona, confirmado)

    Servidor (backend):
    - Archivo: /home/isma/projects/caoscero/backend/app/mcp/server.py
    - Endpoint: https://api.tandemapp.es/mcp/   (trailing slash normalizado)
    - Stack (commit a861f5d + fixes de esta sesión):
        * Server: mcp.server.Server (low-level, oficial)
        * Transport: StreamableHTTPSessionManager (oficial SDK)
        * ASGI: StreamableHTTPASGIApp (oficial)
        * json_response=False  -> respuestas SSE (text/event-stream)
        * stateless=False      -> sesiones persistentes con Mcp-Session-Id
        * Auth: middleware ASGI with_bearer_auth resuelve Bearer ->
                (member_id, family_id) y lo deja en scope["state"]
        * Las herramientas leen la identidad via get_http_request()
    - main.py:
        * McpCorsMiddleware normaliza /mcp -> /mcp/ (evita el 307 del Mount)
        * McpRequestLoggingMiddleware loguea cada request MCP (MCP-IN/MCP-OUT)

    Cliente (Edge Gallery, app Android):
    - Modelo on-device: gemma-4-E4B-it (LiteRT-LM)
    - ARQUITECTURA INDIRECTA (clave para entender el bug):
        1. El server manda las tools como TEXTO en el system prompt
           (getToolsPrompt() en McpManagerViewModel.kt sustituye ___TOOLS___).
        2. El modelo NUNCA llama a nuestras tools directamente.
           Llama a UNA tool nativa: runMcpTool(toolName, input).
        3. Edge Gallery traduce esa llamada nativa en un tools/call contra
           nuestro server.
        => El output del modelo NO es la peticion al server. runMcpTool es
           el puente. Si runMcpTool no se dispara, no llega nada al backend.
    - Constrained decoding activado (enableConversationConstrainedDecoding=true):
        fuerza la gramatica nativa de Gemma (<|tool_call|>...).
    - getToolsPrompt() solo incluye servers enabled Y tools enabled.
    - loadMcpServers() auto-desabilita el server si la conexion falla al init.


    SINTOMAS OBSERVADOS (en orden cronologico)

    S1. TypeError: function vs ASGI app en Route(endpoint=...)
        Fix: usar StreamableHTTPASGIApp(http_manager) (clase, no funcion).

    S2. Bucle infinito ("tried 25 times") - el server NUNCA recibia tools/call
        Logs del backend mostraban: initialize -> notifications/initialized
        -> tools/list -> GET stream, todo 200, PERO ningun tools/call.
        Causa real (descubierta al final): system prompt del movil MODIFICADO
        por alguien, que instruia al modelo a emitir <tool_call>{...}</tool_call>
        como TEXTO y le prohibia usar los tokens nativos <|tool_call|> de Gemma.
        Eso rompia runMcpTool (LiteRT-LM no parsea XML texto, solo la gramatica
        nativa). Fix: volver al DEFAULT_SYSTEM_PROMPT de Edge Gallery
        (AgentChatTaskModule.kt), que SI instruye a llamar a runMcpTool.

    S3. "No skills or tools found" con el prompt por defecto
        Causa: routing. Con solo 1 tool habilitada que no encajaba con la
        pregunta, el modelo ejecutaba la rama "nothing found" del prompt.
        No era fallo de servidor ni de conexion (el server aparecia conectado
        y las tools se veian con sus toggles). Era el modelo (pequeno) sin
        contexto para emparejar pregunta <-> tool.

    S4. La tool fallaba por valores invalidos (EL BUG FINAL)
        Sintoma: p.ej. recordSize recibia type="calzado" en vez de "footwear".
        Causa: los inputSchema no tenian enum ni descripciones en los params,
        asi que el modelo inventaba valores a partir del lenguaje natural del
        usuario. El codigo YA validaba contra VALID_SIZE_TYPES / VALID_
        MEASUREMENT_TYPES y rechazaba, pero el modelo no conocia los valores
        validos de antemano.
        Fix: enriquecer los schemas con:
          - enum en los campos de valor fijo
            (recordSize.type: ["clothing","footwear"];
             recordMeasurement.type: ["height","weight"];
             recordMeasurement.unit: ["cm","kg"])
          - formato para fechas/horas/UUIDs (YYYY-MM-DD, HH:MM, "obtenido de
            startPauta/listActivePautas")
          - descripciones orientadas a la accion (palabras clave en espanol)
            para mejorar el routing pregunta <-> tool


    ROOT CAUSE RESUMEN (lo que de verdad estaba roto)

    El servidor MCP funcionaba correctamente desde el principio (verificado
    con curl: initialize, tools/list, tools/call devolvian 200). El problema
    era 100% del lado cliente / modelo:

    1. Un system prompt modificado en el movil rompia runMcpTool (S2).
    2. Despues, falta de enum/descripciones en los schemas hacia que el
       modelo generara valores invalidos (S4).

    Ninguno de los dos era del backend. Los cambios en el backend
    (trailing slash, logging, json_response, enums) fueron robustez +
    el fix real de los schemas.


    CAMBIOS APLICADOS EN ESTA SESION

    backend/app/main.py:
    - import json, logging
    - McpCorsMiddleware: normaliza /mcp -> /mcp/ antes del router (evita 307)
    - McpRequestLoggingMiddleware: loguea cada POST/GET a /mcp con
      rpc.method, rpc.id, session, body size y status de respuesta

    backend/app/mcp/server.py:
    - http_manager: json_response=False (SSE), stateless=False (sesiones)
    - handle_list_tools(): schemas enriquecidos con enum + descripciones por
      parametro + descripciones de tool orientadas a routing


    LECCIONES APRENDIDAS

    - Edge Gallery usa arquitectura indirecta: el modelo llama a runMcpTool,
      no a nuestras tools. Un system prompt que prohiba los tokens nativos
      de Gemma ROMPE todo el mecanismo. Usar SIEMPRE el DEFAULT_SYSTEM_PROMPT.
    - getToolsPrompt() solo inyecta servers enabled + tools enabled. Si el
      server falla al init, queda disabled -> "No skills or tools found".
    - Los modelos pequenos (Gemma-4-E4B-it) necesitan enum y descripciones
      explicitas en el inputSchema; si no, alucinan valores.
    - El trailing slash importa: app.mount("/mcp") emite 307 para /mcp (sin
      slash) que los clientes MCP no siguen en POST.
    - curl al endpoint sirve para exonerar/condenar al servidor; cuando curl
      funciona pero el cliente falla, el problema es de cliente/modelo/prompt.


    COMANDOS UTILES

    Ver logs del backend:
      docker logs tandem-backend --tail=50

    Buscar si llega tools/call durante una prueba:
      docker logs tandem-backend --tail=50 | grep tools/call

    Redeploy:
      cd /etc/tandem-prod && vibelock -p tandem -v secrets.vibe \
        docker compose -v secrets.vibe -- up -d --build backend

    Test manual completo (initialize -> extraer mcp-session-id -> tools/list):
      curl -s -D /tmp/h -X POST https://api.tandemapp.es/mcp/ \
        -H "Content-Type: application/json" \
        -H "Authorization: Bearer <TOKEN>" \
        -H "Accept: application/json" \
        -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{\
"protocolVersion":"2024-11-05","capabilities":{},\
"clientInfo":{"name":"test","version":"1.0"}}}'

    TRAS REDEPLOY: en el movil, reiniciar el modelo / re-anadir el servidor
    MCP para que Edge Gallery vuelva a pedir tools/list y cachee los nuevos
    schemas con enum. (Cachea los schemas en mcp_servers.pb al iniciar.)
