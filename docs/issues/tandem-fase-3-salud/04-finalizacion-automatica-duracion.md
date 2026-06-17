## Parent

`docs/prd/tandem-fase-3-salud.md`

## What to build

La **finalización automática** de una Pauta al cumplir su duración, de forma **lazy**: si `now >= ends_at` (con `ends_at = started_at + duration_days`), el backend marca `status=finished` al consultar, sin cron ni proceso en segundo plano. Así una Pauta no queda activa indefinidamente y deja de proponer "siguiente toma" (`next_dose_at = null` cuando está finalizada).

Complementa la finalización **manual/anticipada** (rebanada 02): el usuario puede cortar antes, y el sistema cierra sola la que agota su duración.

## Acceptance criteria

- [ ] Al consultar una Pauta cuya `ends_at` ya pasó, su `status` pasa a `finished` (lazy, sin job programado).
- [ ] Una Pauta finalizada (auto o manual) devuelve `next_dose_at = null` y no propone más tomas.
- [ ] La finalización automática no afecta a las Administraciones ya registradas ni al historial.
- [ ] La pestaña Pautas muestra recesadas las Pautas finalizadas por duración igual que las finalizadas a mano.
- [ ] Cubierto por la costura HTTP/REST (Pauta que cruza `ends_at` se reporta finalizada al consultar).

## Blocked by

- 02-pautas-iniciar-listar-finalizar.md
