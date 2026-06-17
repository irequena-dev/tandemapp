## Parent

`docs/prd/tandem-fase-4-agenda.md`

## What to build

Los **Tipos de Evento** de extremo a extremo: un enum gestionado por Familia que clasifica los Eventos, con **tipos base** del sistema sembrados al crear la Familia (Médico, Cole, Extraescolar, Trámite, Otros) que **no se borran ni editan**, más tipos **personalizados** que la Familia crea desde la PWA.

La tabla `event_types` (`family_id` **nullable** → `NULL` = tipo base compartido, `name`, `icon` clave del design system, default `circle`) lleva RLS con la variante que permite leer los tipos base (`family_id IS NULL`) además de los de la Familia. El REST expone CRUD de tipos personalizados; la **gestión de Tipos vive dentro de la pestaña Eventos** (no en Ajustes). Esquema y tipos en `docs/api-contract.md` §4.2.

## Acceptance criteria

- [ ] Existe la tabla `event_types` con `family_id` nullable y la política RLS que permite leer tipos base (`family_id IS NULL`) + los de la Familia.
- [ ] Los tipos base (Médico, Cole, Extraescolar, Trámite, Otros) se siembran al crear la Familia y se marcan `is_system`; no se pueden borrar ni editar.
- [ ] REST: listar (base + propios), crear, editar y borrar **solo** tipos personalizados de la Familia, con `icon`.
- [ ] La gestión de Tipos de Evento se hace dentro de la pestaña Eventos.
- [ ] Cubierto por la costura HTTP/REST (lectura de base + propios, protección de base) y la costura de ruta/página con MSW.

## Blocked by

- Fase 0 completa (`docs/issues/tandem-fase-0-cimientos/`).
