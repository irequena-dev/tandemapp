/**
 * Formatea el instante de una toma (la próxima o una dada) para la UI de Pautas.
 *
 * A diferencia de un `HH:MM` plano, indica el día cuando la toma NO es hoy. Así
 * una Pauta de 24h marcada a las X:XX no muestra la siguiente toma como "X:XX"
 * —que parece que toca hoy— sino como "Mañana X:XX".
 *
 * - Hoy (mismo día local que `now`): "10:33"
 * - Mañana: "Mañana 10:33"
 * - Otro día (vencida o >1 día en el futuro): "lun 10:33" (día de la semana corto)
 *
 * Todo en la zona horaria local del dispositivo (coherente con el resto de la
 * PWA); `now` se inyecta para poder fijarlo en los tests.
 */
export function formatDoseTime(iso: string, now: Date = new Date()): string {
  const d = new Date(iso)
  const time = d.toLocaleTimeString('es-ES', {
    hour: '2-digit',
    minute: '2-digit',
  })
  const midnightNow = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
  ).getTime()
  const midnightD = new Date(
    d.getFullYear(),
    d.getMonth(),
    d.getDate(),
  ).getTime()
  const diffDays = Math.round((midnightD - midnightNow) / 86_400_000)
  if (diffDays === 0) return time
  if (diffDays === 1) return `Mañana ${time}`
  return `${d.toLocaleDateString('es-ES', { weekday: 'short' })} ${time}`
}
