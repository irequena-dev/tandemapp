import { useState } from 'react'
import { Link } from 'react-router'
import { useChildren } from '../children/api'
import { useToast } from '../toasts/toasts'
import { useCreateAdministration, useDeleteAdministration, useFinishPauta, usePautas } from './api'
import type { Administration, Pauta } from './types'
import './pautas.css'
import '../children/children.css'

function initialOf(name: string): string {
  return [...name.trim()][0]?.toUpperCase() ?? '?'
}

function toneOf(name: string): number {
  let h = 0
  for (const ch of name) h = (h + (ch.codePointAt(0) ?? 0)) % 6
  return h
}

function CheckSmall() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  )
}

function ClockSmall() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
    </svg>
  )
}

function ChevronDown({ open }: { open: boolean }) {
  return (
    <svg className={`pauta-card__chevron${open ? ' pauta-card__chevron--open' : ''}`} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="6 9 12 15 18 9" />
    </svg>
  )
}

function PulseIcon() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 12h4l2 5 4-12 2 7h6" />
    </svg>
  )
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
}

/**
 * Mensaje humano para un error de mutación. El backend lanza `ApiError(status)`;
 * aquí lo traducimos a algo que una Miembro cansada pueda leer, en lugar de
 * "HTTP 500". Cae en un mensaje genérico pero accionable si no reconocemos el
 * estado o el error no viene tipado.
 */
function mutationErrorMessage(error: unknown, fallback: string): string {
  if (error && typeof error === 'object' && 'status' in error) {
    const status = (error as { status: number }).status
    if (status === 401 || status === 403) return 'Tu sesión caducó. Vuelve a entrar e inténtalo.'
    if (status === 404) return 'No se encontró el registro; puede que otra Miembro lo haya cambiado.'
    if (status === 409) return 'Ya existe una toma reciente para esta Pauta.'
    if (status >= 500) return 'El servidor falló. Inténtalo de nuevo en un momento.'
  }
  return fallback
}

/**
 * Ventana de la guarda de duplicado del backend (DUPLICATE_GUARD_MINUTES).
 * Si la última toma cae dentro, el POST devuelve la existente con 200 (no
 * crea nada nuevo): bloqueamos el botón aquí para evitar el no-op silencioso.
 */
const DUPLICATE_GUARD_MINUTES = 15

/** ¿La toma dada está dentro de la ventana de duplicado respecto a `now`? */
function isRecentAdmin(iso: string, now: Date): boolean {
  return now.getTime() - new Date(iso).getTime() < DUPLICATE_GUARD_MINUTES * 60_000
}

function PautaCard({ pauta, childName }: { pauta: Pauta; childName: string }) {
  const [open, setOpen] = useState(false)
  // ID de la Administración cuyo "Deshacer" está pidiendo confirmación inline.
  // null = ninguna. Es por-fila: solo una toma se confirma a la vez.
  const [confirmingAdminId, setConfirmingAdminId] = useState<string | null>(null)
  const finishMutation = useFinishPauta()
  const createAdmin = useCreateAdministration()
  const deleteAdmin = useDeleteAdministration()
  const toast = useToast()
  const now = new Date()

  const todaysAdmins = pauta.todays_administrations ?? []
  const lastAdmin = todaysAdmins.length > 0 ? todaysAdmins[todaysAdmins.length - 1] : null
  // La última toma de hoy determina si estamos dentro de la guarda de duplicado.
  const recentToma = lastAdmin !== null && isRecentAdmin(lastAdmin.administered_at, now)

  /** "Dada a las 14:32 por Marta" — el momento peak-end de la toma. Reutilizado
   *  por el toast de éxito y por el hint del cuerpo expandido. */
  function dadaLine(a: Pick<Administration, 'administered_at' | 'member_name'>): string {
    const base = `Dada a las ${formatTime(a.administered_at)}`
    return a.member_name ? `${base} por ${a.member_name}` : base
  }

  // Marca una toma desde la tarjeta colapsada (acción primaria, P0b). El
  // callback onSuccess dispara el toast de confirmación con el dato que el
  // servidor devolvió; onError delega en el bloque de error persistente.
  function handleCreateToma() {
    createAdmin.mutate(pauta.id, {
      onSuccess: (admin) => {
        toast.success(dadaLine(admin))
      },
    })
  }

  // Deshacer una toma confirmada (acción destructiva). Tras la confirmación
  // inline, ejecuta el delete y avisa con un toast.
  function handleConfirmDelete(a: Administration) {
    deleteAdmin.mutate(
      { pautaId: pauta.id, adminId: a.id },
      {
        onSuccess: () => {
          toast.success(`Toma de las ${formatTime(a.administered_at)} eliminada`)
          setConfirmingAdminId(null)
        },
      },
    )
  }

  // Las mutaciones usan optimistic update + rollback en api.ts, así que un
  // error ya deja la UI en el estado previo. Aquí solo mostramos feedback.
  // `isError` se reinicia en el siguiente intento (react-query), así que el
  // bloque desaparece solo al reintentar.
  const createError = createAdmin.isError
    ? mutationErrorMessage(createAdmin.error, 'No se pudo registrar la toma.')
    : null
  const deleteError = deleteAdmin.isError
    ? mutationErrorMessage(deleteAdmin.error, 'No se pudo deshacer la toma.')
    : null
  const finishError = finishMutation.isError
    ? mutationErrorMessage(finishMutation.error, 'No se pudo finalizar la Pauta.')
    : null

  // Al cerrar la tarjeta, limpiamos el confirm pendiente para que no quede una
  // fila en estado "¿Segura?" al reabrir. Se hace en el toggle (estado derivado
  // del click/teclado), no en un effect, para evitar renders en cascada.
  function toggleOpen() {
    setOpen((prev) => {
      const next = !prev
      if (!next) setConfirmingAdminId(null)
      return next
    })
  }

  const isActive = pauta.status === 'active'
  // La tarjeta colapsada ES la respuesta (P0a): la figura de próxima/dada sube a
  // la cabecera usando el vocabulario de pills existente (que ya lleva icono →
  // cumple State-Is-Never-Color-Alone). El cuerpo expandido queda como historial.
  const dueLabel = (() => {
    if (!isActive) return { kind: 'finalizada' as const }
    // Una toma reciente es el hecho vivo: "Dada · 14:32" gana sobre "Próxima".
    if (recentToma && lastAdmin) {
      return { kind: 'dada' as const, time: formatTime(lastAdmin.administered_at) }
    }
    if (pauta.next_dose_at) {
      return { kind: 'proxima' as const, time: formatTime(pauta.next_dose_at) }
    }
    return null
  })()

  return (
    <div className={`pauta-card${pauta.status === 'finished' ? ' pauta-card--finalizada' : ''}`}>
      <div
        className="pauta-card__header"
        role="button"
        tabIndex={0}
        aria-expanded={open}
        onClick={toggleOpen}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleOpen() } }}
      >
        <span className="pauta-card__child">
          <span className="hijo-mono" data-tone={toneOf(childName)}>
            {initialOf(childName)}
          </span>
        </span>
        <div className="pauta-card__info">
          <span className="pauta-card__med ds-nums">
            {pauta.medication} · {pauta.dose}
          </span>
          <span className="pauta-card__sub">
            <span>{childName} · cada </span>
            <span className="ds-nums">{pauta.interval_hours}h</span>
            <span> · </span>
            <span className="ds-nums">{pauta.duration_days} días</span>
          </span>
        </div>
        <div className="pauta-card__meta">
          {dueLabel && (
            <span className={`pauta-card__due pauta-card__due--${dueLabel.kind}`}>
              {dueLabel.kind === 'proxima' && <><ClockSmall /> Próxima · <span className="ds-nums">{dueLabel.time}</span></>}
              {dueLabel.kind === 'dada' && <><CheckSmall /> Dada · <span className="ds-nums">{dueLabel.time}</span></>}
              {dueLabel.kind === 'finalizada' && <><CheckSmall /> Finalizada</>}
            </span>
          )}
          <ChevronDown open={open} />
        </div>
      </div>

      {/* Acción de escritura primaria en la tarjeta colapsada (P0b): un solo
          botón sage, visible solo para la pauta activa. stopPropagation evita
          que un toque registre la toma Y abra la tarjeta a la vez. La acción
          infrecuente "Finalizar Pauta" vive solo en el cuerpo expandido. */}
      {isActive && (
        <div className="pauta-card__action">
          <button
            type="button"
            className="btn btn--primary btn--sm"
            onClick={(e) => { e.stopPropagation(); handleCreateToma() }}
            disabled={createAdmin.isPending || recentToma}
            aria-label={
              recentToma && lastAdmin
                ? `Toma reciente (${formatTime(lastAdmin.administered_at)}). Espera ${DUPLICATE_GUARD_MINUTES} min entre tomas.`
                : `Marcar toma de ${pauta.medication}`
            }
          >
            {recentToma ? 'Toma reciente' : 'Marcar toma'}
          </button>
          {createError && (
            <span className="pauta-inline-error" role="alert">
              {createError}
            </span>
          )}
        </div>
      )}

      {open && (
        <div className="pauta-body">
          {/* Progress — indicador discreto "Día N de M": un segmento por día.
              Calmo y honesto: refleja el día actual (day_number del servidor),
              no un relleno continuo calculado contra el reloj que envejece mal
              y avanza en horas sin eventos. Sin transition: el cambio es entre
              renders (día a día). */}
          <div className="pauta-progress">
            <span className="pauta-progress__label ds-nums">
              Día {pauta.day_number} de {pauta.duration_days}
            </span>
            <div
              className="pauta-progress__segments"
              role="img"
              aria-label={`Día ${pauta.day_number} de ${pauta.duration_days} del tratamiento`}
            >
              {Array.from({ length: pauta.duration_days }, (_, i) => {
                const day = i + 1
                const cls = day < pauta.day_number
                  ? 'pauta-progress__seg pauta-progress__seg--done'
                  : day === pauta.day_number
                    ? 'pauta-progress__seg pauta-progress__seg--current'
                    : 'pauta-progress__seg'
                return <span key={day} className={cls} />
              })}
            </div>
          </div>

          {/* Tomas del día */}
          {pauta.status === 'active' && (
            <div className="pauta-tomas">
              <span className="pauta-tomas__title">Tomas de hoy</span>

              {todaysAdmins.map((a) => (
                <div key={a.id}>
                  <div className="pauta-toma">
                    <span className="pauta-toma__time ds-nums">
                      {formatTime(a.administered_at)}
                    </span>
                    <span className="pauta-toma__label">
                      Dada{a.member_name ? ` por ${a.member_name}` : ''}
                    </span>
                    <span className="pauta-toma__status pauta-toma__status--dada">
                      <CheckSmall /> Dada
                    </span>
                    {/* Deshacer una toma es destructivo: antes de borrar pedimos
                        confirmación inline (patrón .hijo-confirm de Hijos, sin
                        modal). Mientras se confirma una toma, ocultamos su
                        trigger para evitar dobles afirmaciones. */}
                    {confirmingAdminId !== a.id && (
                      <button
                        type="button"
                        className="btn btn--secondary btn--sm"
                        aria-label={`Deshacer toma de las ${formatTime(a.administered_at)}`}
                        onClick={() => setConfirmingAdminId(a.id)}
                        disabled={deleteAdmin.isPending}
                      >
                        Deshacer
                      </button>
                    )}
                  </div>

                  {confirmingAdminId === a.id && (
                    <div
                      className="hijo-confirm pauta-confirm"
                      role="group"
                      aria-label={`Confirmar borrado de la toma de las ${formatTime(a.administered_at)}`}
                    >
                      <span className="hijo-confirm__label">
                        ¿Borrar la toma de las <b className="ds-nums">{formatTime(a.administered_at)}</b>?
                      </span>
                      <button
                        type="button"
                        className="btn btn--secondary btn--sm"
                        onClick={() => setConfirmingAdminId(null)}
                        disabled={deleteAdmin.isPending}
                      >
                        Cancelar
                      </button>
                      <button
                        type="button"
                        className="btn btn--danger-solid btn--sm"
                        onClick={() => handleConfirmDelete(a)}
                        disabled={deleteAdmin.isPending}
                      >
                        {deleteAdmin.isPending ? 'Borrando…' : 'Borrar'}
                      </button>
                    </div>
                  )}
                </div>
              ))}

              {/* Error de borrado: el rollback ya devolvió la UI al estado
                  previo; este bloque solo explica qué falló. */}
              {deleteError && (
                <p className="pauta-inline-error" role="alert">
                  {deleteError}
                </p>
              )}

              {/* Próxima toma */}
              {pauta.next_dose_at && (
                <div className="pauta-toma">
                  <span className="pauta-toma__time ds-nums">
                    {formatTime(pauta.next_dose_at)}
                  </span>
                  <span className="pauta-toma__label">Siguiente toma</span>
                  <span className="pauta-toma__status pauta-toma__status--proxima">
                    <ClockSmall /> Próxima
                  </span>
                </div>
              )}

              {todaysAdmins.length === 0 && !pauta.next_dose_at && (
                <p className="pauta-toma__label">Sin tomas registradas hoy</p>
              )}
            </div>
          )}

          {/* Última toma */}
          {lastAdmin && (
            <div className="pauta-tomas">
              <span className="pauta-tomas__title">Última toma</span>
              <div className="pauta-toma">
                <span className="pauta-toma__time ds-nums">
                  {formatTime(lastAdmin.administered_at)}
                </span>
                <span className="pauta-toma__label">
                  {lastAdmin.member_name ?? 'Miembro'}
                </span>
              </div>
            </div>
          )}

          {/* Ends at */}
          <div className="pauta-tomas">
            <span className="pauta-tomas__title">Fin del tratamiento</span>
            <div className="pauta-toma">
              <span className="pauta-toma__time ds-nums">
                {new Date(pauta.ends_at).toLocaleDateString('es-ES')}
              </span>
              <span className="pauta-toma__label">
                {pauta.status === 'finished' ? (
                  <><CheckSmall /> Finalizada</>
                ) : (
                  <><ClockSmall /> En curso</>
                )}
              </span>
            </div>
          </div>

          {/* El cuerpo expandido es ahora historial. "Marcar toma" vive en la
              tarjeta colapsada; aquí queda la acción infrecuente "Finalizar
              Pauta" y, cuando aplica, el aviso de la guarda de duplicado como
              momento de reassurance ("Dada a las … por …"). */}
          {pauta.status === 'active' && (
            <div className="pauta-body__actions">
              {recentToma && lastAdmin && (
                <span className="pauta-toma__hint">
                  Dada a las {formatTime(lastAdmin.administered_at)}
                  {lastAdmin.member_name ? ` por ${lastAdmin.member_name}` : ''} · próxima disponible en {DUPLICATE_GUARD_MINUTES} min
                </span>
              )}
              <button
                type="button"
                className="pauta-finish"
                onClick={() =>
                  finishMutation.mutate(pauta.id, {
                    onSuccess: () => toast.success(`Pauta de ${pauta.medication} finalizada`),
                  })
                }
                disabled={finishMutation.isPending}
              >
                {finishMutation.isPending ? 'Finalizando…' : 'Finalizar Pauta'}
              </button>
              {finishError && (
                <p className="pauta-inline-error" role="alert">
                  {finishError}
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export function PautasPage() {
  const { data: pautas = [], isLoading } = usePautas()
  const { data: children = [] } = useChildren()

  const childNameById = (id: string): string => {
    const child = children.find((c) => c.id === id)
    return child?.name ?? '…'
  }

  const sorted = [...pautas].sort((a, b) => {
    if (a.status !== b.status) return a.status === 'active' ? -1 : 1
    if (a.next_dose_at && b.next_dose_at) {
      return new Date(a.next_dose_at).getTime() - new Date(b.next_dose_at).getTime()
    }
    return 0
  })

  // Agrupamos: activas primero (ordenadas por próxima toma), finalizadas en una
  // sección aparte y recedida. Refuerza el estado a nivel de IA sin bajar la
  // opacidad de las tarjetas (eso rompía el contraste del texto muted).
  const active = sorted.filter((p) => p.status === 'active')
  const finished = sorted.filter((p) => p.status === 'finished')

  if (isLoading) {
    // Skeleton espejo del `.hijo-skel-row` de Hijos: mono + dos líneas pulsando,
    // no "Cargando…" en texto pelado. Dos filas bastan para anticipar la lista.
    return (
      <div className="pautas" aria-labelledby="pautas-title" aria-busy="true">
        <h1 className="pautas__title" id="pautas-title">Pautas</h1>
        <ul className="pautas__list" aria-hidden="true">
          <li><div className="pauta-skel"><span className="skel skel--mono" /><span className="skel skel--lines"><span className="skel skel--name" /><span className="skel skel--age" /></span></div></li>
          <li><div className="pauta-skel"><span className="skel skel--mono" /><span className="skel skel--lines"><span className="skel skel--name" /><span className="skel skel--age" /></span></div></li>
        </ul>
      </div>
    )
  }

  return (
    <div className="pautas" aria-labelledby="pautas-title">
      <h1 className="pautas__title" id="pautas-title">Pautas</h1>

      {sorted.length === 0 ? (
        <div className="pautas__empty">
          <span className="pautas__empty-icon" aria-hidden="true"><PulseIcon /></span>
          <p className="pautas__empty-title">Sin pautas activas</p>
          <p className="pautas__empty-text">
            Cuando registres un tratamiento (por voz o desde una visita), aparecerá aquí con sus tomas y progreso.
          </p>
          {/* Sembrar una acción (como hace Hijos): una Pauta nace de una Visita
              médica en la ficha de un Hijo. No hay formulario aquí a propósito
              — la entrada habitual es por voz — así que apuntamos al camino real
              en vez de dejar un callejón sin salida. */}
          <Link className="btn btn--secondary btn--sm" to="/hijos">Ver los Hijos</Link>
        </div>
      ) : (
        <>
          {active.length > 0 && (
            <ul className="pautas__list pautas__group">
              {active.map((p) => (
                <li key={p.id}><PautaCard pauta={p} childName={childNameById(p.child_id)} /></li>
              ))}
            </ul>
          )}

          {finished.length > 0 && (
            <section className="pautas__group" aria-label="Pautas finalizadas">
              <h2 className="pautas__group-title">Finalizadas</h2>
              <ul className="pautas__list">
                {finished.map((p) => (
                  <li key={p.id}><PautaCard pauta={p} childName={childNameById(p.child_id)} /></li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  )
}
