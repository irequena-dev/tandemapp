# El backend no interpreta lenguaje natural

La frase del concepto "la IA clasifica la intención y escribe datos estructurados" podría leerse como que el backend contiene un clasificador. No es así: toda la comprensión del lenguaje natural (elegir la intención y extraer datos estructurados del texto libre dictado) ocurre en el cliente MCP (Claude) a través de los esquemas de las herramientas. El backend recibe argumentos ya estructurados, los valida con Pydantic y los persiste; no contiene NLP.

## Consequences

- El backend se mantiene simple, determinista y testeable.
- Toda la "inteligencia" de extracción depende de la calidad de los esquemas de las herramientas MCP.
- Añadir interpretación de texto libre en el backend en el futuro sería una desviación explícita de esta decisión.
