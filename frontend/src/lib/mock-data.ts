/**
 * Datos mock para el frontend estático. Familia tipo coherente que cubre
 * todos los estados relevantes de cada pantalla (vacío, activo, completado,
 * urgente, calm). Cuando el backend esté listo, estos datos se sustituyen
 * por llamadas a la API real vía TanStack Query.
 */

/* ---------- Familia & Miembros ---------- */

export type MockMember = {
  id: string
  name: string
  avatar_initial: string
  role: string
}

export type MockFamily = {
  id: string
  name: string
  members: MockMember[]
}

export const FAMILY: MockFamily = {
  id: 'fam-001',
  name: 'Los Martínez-Torres',
  members: [
    { id: 'mem-ana', name: 'Ana', avatar_initial: 'A', role: 'admin' },
    { id: 'mem-carlos', name: 'Carlos', avatar_initial: 'C', role: 'member' },
  ],
}

export const CURRENT_MEMBER = FAMILY.members[0]

/* ---------- Hijos ---------- */

export type MockChild = {
  id: string
  name: string
  birth_date: string
  avatar_color: number
  height_cm: number | null
  weight_kg: number | null
  talla_ropa: string | null
  talla_calzado: string | null
}

export const CHILDREN: MockChild[] = [
  {
    id: 'hijo-mateo',
    name: 'Mateo',
    birth_date: '2020-03-15',
    avatar_color: 1,
    height_cm: 112,
    weight_kg: 20,
    talla_ropa: '6',
    talla_calzado: '29',
  },
  {
    id: 'hijo-lucia',
    name: 'Lucía',
    birth_date: '2023-11-08',
    avatar_color: 0,
    height_cm: 88,
    weight_kg: 12.5,
    talla_ropa: '2',
    talla_calzado: '22',
  },
]

/* ---------- Compra ---------- */

export type MockShoppingItem = {
  id: string
  text: string
  is_bought: boolean
  bought_by: string | null
  bought_at: string | null
}

export const SHOPPING_ITEMS: MockShoppingItem[] = [
  { id: 'item-1', text: 'Leche entera', is_bought: false, bought_by: null, bought_at: null },
  { id: 'item-2', text: 'Pañales talla 5 para Lucía', is_bought: false, bought_by: null, bought_at: null },
  { id: 'item-3', text: 'Fruta variada', is_bought: false, bought_by: null, bought_at: null },
  { id: 'item-4', text: 'Zapatillas talla 29 para Mateo', is_bought: false, bought_by: null, bought_at: null },
  { id: 'item-5', text: 'Pan de molde', is_bought: true, bought_by: 'Carlos', bought_at: '2026-06-15T10:30:00Z' },
  { id: 'item-6', text: 'Jabón de manos', is_bought: true, bought_by: 'Ana', bought_at: '2026-06-15T09:15:00Z' },
]

/* ---------- Eventos ---------- */

export type MockEventType = {
  id: string
  name: string
  icon: string
}

export const EVENT_TYPES: MockEventType[] = [
  { id: 'et-medico', name: 'Médico', icon: 'stethoscope' },
  { id: 'et-cole', name: 'Cole', icon: 'school' },
  { id: 'et-extra', name: 'Extraescolar', icon: 'activity' },
  { id: 'et-tramite', name: 'Trámite', icon: 'file' },
  { id: 'et-otros', name: 'Otros', icon: 'circle' },
]

export type MockEvent = {
  id: string
  title: string
  date: string
  time: string | null
  event_type_id: string
  child_id: string | null
  status: 'pending' | 'done' | 'overdue'
}

export const EVENTS: MockEvent[] = [
  {
    id: 'ev-1',
    title: 'Control pediatra',
    date: '2026-06-28',
    time: '10:00',
    event_type_id: 'et-medico',
    child_id: 'hijo-mateo',
    status: 'pending',
  },
  {
    id: 'ev-2',
    title: 'Reunión de padres',
    date: '2026-07-02',
    time: '17:30',
    event_type_id: 'et-cole',
    child_id: 'hijo-lucia',
    status: 'pending',
  },
  {
    id: 'ev-3',
    title: 'Natación',
    date: '2026-06-16',
    time: '18:00',
    event_type_id: 'et-extra',
    child_id: 'hijo-mateo',
    status: 'pending',
  },
  {
    id: 'ev-4',
    title: 'Renovar tarjeta sanitaria',
    date: '2026-06-10',
    time: null,
    event_type_id: 'et-tramite',
    child_id: null,
    status: 'overdue',
  },
  {
    id: 'ev-5',
    title: 'Vacuna 18 meses',
    date: '2026-06-12',
    time: '09:30',
    event_type_id: 'et-medico',
    child_id: 'hijo-lucia',
    status: 'done',
  },
]

/* ---------- Pautas & Administraciones ---------- */

export type MockAdministracion = {
  id: string
  given_at: string
  given_by: string
}

export type MockPauta = {
  id: string
  child_id: string
  medication: string
  dose: string
  interval_hours: number
  duration_days: number
  started_at: string
  status: 'activa' | 'finalizada'
  administraciones: MockAdministracion[]
}

export const PAUTAS: MockPauta[] = [
  {
    id: 'pauta-1',
    child_id: 'hijo-mateo',
    medication: 'Amoxicilina',
    dose: '5 ml',
    interval_hours: 8,
    duration_days: 7,
    started_at: '2026-06-12T08:00:00Z',
    status: 'activa',
    administraciones: [
      { id: 'adm-1', given_at: '2026-06-15T08:10:00Z', given_by: 'Ana' },
      { id: 'adm-2', given_at: '2026-06-15T16:05:00Z', given_by: 'Carlos' },
    ],
  },
  {
    id: 'pauta-2',
    child_id: 'hijo-lucia',
    medication: 'Vitamina D',
    dose: '1 gota',
    interval_hours: 24,
    duration_days: 90,
    started_at: '2026-05-01T09:00:00Z',
    status: 'activa',
    administraciones: [
      { id: 'adm-3', given_at: '2026-06-15T09:00:00Z', given_by: 'Ana' },
    ],
  },
  {
    id: 'pauta-3',
    child_id: 'hijo-mateo',
    medication: 'Ibuprofeno',
    dose: '3 ml',
    interval_hours: 8,
    duration_days: 3,
    started_at: '2026-06-01T10:00:00Z',
    status: 'finalizada',
    administraciones: [],
  },
]

/* ---------- Visitas médicas ---------- */

export type MockVisita = {
  id: string
  child_id: string
  date: string
  title: string
  diagnosis: string
  notes: string
  pauta_ids: string[]
}

export const VISITAS: MockVisita[] = [
  {
    id: 'vis-1',
    child_id: 'hijo-mateo',
    date: '2026-06-12',
    title: 'Revisión por otitis',
    diagnosis: 'Otitis media aguda',
    notes: 'Prescribe Amoxicilina 7 días. Control en 2 semanas.',
    pauta_ids: ['pauta-1'],
  },
  {
    id: 'vis-2',
    child_id: 'hijo-mateo',
    date: '2025-12-15',
    title: 'Revisión 5 años',
    diagnosis: 'Desarrollo normal',
    notes: 'Peso y talla en percentil 50. Todo correcto.',
    pauta_ids: [],
  },
  {
    id: 'vis-3',
    child_id: 'hijo-lucia',
    date: '2026-05-01',
    title: 'Revisión 2 años',
    diagnosis: 'Desarrollo normal. Déficit leve vitamina D',
    notes: 'Suplementar con vitamina D 90 días.',
    pauta_ids: ['pauta-2'],
  },
]

/* ---------- Medidas (histórico) ---------- */

export type MockMedida = {
  id: string
  child_id: string
  type: 'height' | 'weight'
  value: number
  unit: string
  recorded_at: string
}

export const MEDIDAS: MockMedida[] = [
  { id: 'med-1', child_id: 'hijo-mateo', type: 'height', value: 112, unit: 'cm', recorded_at: '2026-06-01' },
  { id: 'med-2', child_id: 'hijo-mateo', type: 'height', value: 110, unit: 'cm', recorded_at: '2026-03-01' },
  { id: 'med-3', child_id: 'hijo-mateo', type: 'height', value: 107, unit: 'cm', recorded_at: '2025-12-15' },
  { id: 'med-4', child_id: 'hijo-mateo', type: 'weight', value: 20, unit: 'kg', recorded_at: '2026-06-01' },
  { id: 'med-5', child_id: 'hijo-mateo', type: 'weight', value: 19, unit: 'kg', recorded_at: '2026-03-01' },
  { id: 'med-6', child_id: 'hijo-lucia', type: 'height', value: 88, unit: 'cm', recorded_at: '2026-05-01' },
  { id: 'med-7', child_id: 'hijo-lucia', type: 'height', value: 85, unit: 'cm', recorded_at: '2026-02-01' },
  { id: 'med-8', child_id: 'hijo-lucia', type: 'weight', value: 12.5, unit: 'kg', recorded_at: '2026-05-01' },
]

/* ---------- Helpers ---------- */

export function childById(id: string): MockChild | undefined {
  return CHILDREN.find((c) => c.id === id)
}

export function eventTypeById(id: string): MockEventType | undefined {
  return EVENT_TYPES.find((t) => t.id === id)
}

export function pautasForChild(childId: string): MockPauta[] {
  return PAUTAS.filter((p) => p.child_id === childId)
}

export function visitasForChild(childId: string): MockVisita[] {
  return VISITAS.filter((v) => v.child_id === childId)
}

export function medidasForChild(childId: string): MockMedida[] {
  return MEDIDAS.filter((m) => m.child_id === childId)
}
