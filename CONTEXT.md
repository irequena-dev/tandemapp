# CaosCero

Plataforma multi-inquilino para reducir la carga mental logística en la crianza. Una familia dicta datos por voz (vía IA/MCP) y los consulta/valida en una PWA.

## Lenguaje

**Familia**:
La unidad de aislamiento de datos (tenant). Toda la información pertenece a una y solo una Familia.
_Evitar_: Cuenta, Grupo, Hogar

**Hijo**:
Persona menor sujeto de los datos de crianza (métricas y salud). Tiene identidad propia y estable dentro de una Familia y una fecha de nacimiento (de la que se deriva su edad); no es un usuario del sistema.
_Evitar_: Niño, Crío, Child (en prosa)

**Miembro**:
Persona que usa la aplicación y pertenece a exactamente una Familia (padre, madre, abuela, niñera). Es quien dicta y consulta datos; sus acciones se le atribuyen.
_Evitar_: Usuario, Cuidador, Padre/Madre

## Crecimiento y tallas

**Medida**:
Valor numérico con unidad registrado para un Hijo en un momento dado (altura en cm, peso en kg). Append-only; el valor actual es el más reciente. Interesa la evolución en el tiempo.
_Evitar_: Métrica, Talla (la Talla es distinta)

**Talla**:
Etiqueta de talla que le vale a un Hijo en un momento dado (ropa, calzado). Append-only; lo que interesa es el valor actual, para comprar.
_Evitar_: Medida, Tamaño

## Compra

**Ítem de compra**:
Algo que hay que comprar, en la lista única compartida de la Familia. Tiene estado pendiente o comprado; al comprarlo se conserva (agrupado/oculto) y puede deshacerse o limpiarse.
_Evitar_: Producto, Artículo, Tarea

## Agenda

**Evento**:
Algo que ocurre o vence en una fecha (con hora opcional), perteneciente a la Familia y opcionalmente a un Hijo. Se ve en la agenda y se marca como hecho. Es independiente de la Visita médica: una cita futura es un Evento; la Visita es el registro histórico posterior.
_Evitar_: Cita, Tarea, Recordatorio

**Serie**:
Regla de repetición acotada (con fecha de fin o número de ocurrencias) que al crearse genera cada repetición como un Evento individual e independiente. Es solo un generador, no una entidad viva: no se reedita con efecto en cascada; recalendarizar es borrar las ocurrencias futuras y crear otra Serie.
_Evitar_: Recurrencia, Repetición, Evento recurrente

**Tipo de Evento**:
Categoría de un Evento (médico, cole, extraescolar, trámite, otros…). Es una lista gestionada por Familia: el sistema siembra unos tipos base y un Miembro puede añadir más en la PWA. La IA solo elige entre los existentes; si ninguno encaja, usa "otros".
_Evitar_: Categoría, Etiqueta

## Salud

**Visita médica**:
Evento histórico de atención sanitaria a un Hijo, con su diagnóstico. Es un registro que se consulta (corregible si hubo un error de captura). Puede originar una o varias Pautas.
_Evitar_: Consulta, Cita, Registro de salud

**Pauta**:
Instrucción de tratamiento activa que se sigue en el tiempo para un Hijo (medicamento, dosis, frecuencia como intervalo, duración). Tiene un ciclo de vida (activa/finalizada) y es lo que se consulta y marca en el día a día.
_Evitar_: Tratamiento, Prescripción, Medicación

**Administración**:
El acto registrado de dar una dosis concreta de una Pauta (cuándo y quién). La siguiente toma se calcula como la última Administración más el intervalo de la Pauta.
_Evitar_: Toma, Dosis (la Dosis es la cantidad; la Administración es el evento)
