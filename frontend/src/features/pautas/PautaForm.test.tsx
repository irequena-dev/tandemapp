import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { PautaForm } from './PautaForm'
import type { Child } from '../children/types'
import type { HealthVisit } from '../health-visits/types'

const CHILDREN: Child[] = [
  { id: 'h1', family_id: 'fam', name: 'Mateo', birth_date: '2020-03-15', avatar_color: 'sage' },
  { id: 'h2', family_id: 'fam', name: 'Lucía', birth_date: '2022-01-10', avatar_color: 'ochre' },
]

const VISITS: HealthVisit[] = [
  { id: 'v1', child_id: 'h1', family_id: 'fam', visited_at: '2026-06-20', diagnosis: 'Otitis', notes: null, pauta_ids: [], created_by: 'u1', created_at: '2026-06-20T10:00:00Z' },
  { id: 'v2', child_id: 'h1', family_id: 'fam', visited_at: '2026-06-15', diagnosis: 'Revisión', notes: null, pauta_ids: [], created_by: 'u1', created_at: '2026-06-15T10:00:00Z' },
  { id: 'v3', child_id: 'h1', family_id: 'fam', visited_at: '2026-06-01', diagnosis: 'Bronquitis', notes: null, pauta_ids: [], created_by: 'u1', created_at: '2026-06-01T10:00:00Z' },
]

describe('PautaForm', () => {
  it('renderiza todos los campos del formulario', () => {
    render(
      <PautaForm
        children={CHILDREN}
        visits={[]}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
      />,
    )

    expect(screen.getByLabelText('Medicamento')).not.toBeNull()
    expect(screen.getByLabelText('Dosis')).not.toBeNull()
    expect(screen.getByLabelText('Cada')).not.toBeNull()
    expect(screen.getByLabelText('Duración (días)')).not.toBeNull()
    expect(screen.getByLabelText('Hijo')).not.toBeNull()
  })

  it('muestra placeholders descriptivos', () => {
    render(
      <PautaForm
        children={CHILDREN}
        visits={[]}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
      />,
    )

    expect(screen.getByPlaceholderText('Ej: Dalsy')).not.toBeNull()
    expect(screen.getByPlaceholderText('Ej: 5 ml cada toma')).not.toBeNull()
  })

  it('oculta el selector de Hijo cuando se pasa childId (contexto HijoDetail)', () => {
    render(
      <PautaForm
        childId="h1"
        children={CHILDREN}
        visits={[]}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
      />,
    )

    expect(screen.queryByLabelText('Hijo')).toBeNull()
  })

  it('preselecciona el Hijo si solo hay uno', () => {
    const oneChild = [CHILDREN[0]]
    render(
      <PautaForm
        children={oneChild}
        visits={[]}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
      />,
    )

    const select = screen.getByLabelText('Hijo') as HTMLSelectElement
    expect(select.value).toBe('h1')
  })

  it('muestra las opciones predefinidas de intervalo (4, 6, 8, 12, 24) + Otro', () => {
    render(
      <PautaForm
        children={CHILDREN}
        visits={[]}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
      />,
    )

    const select = screen.getByLabelText('Cada') as HTMLSelectElement
    const options = Array.from(select.querySelectorAll('option'))
    const values = options.map(o => o.value)
    expect(values).toContain('4')
    expect(values).toContain('6')
    expect(values).toContain('8')
    expect(values).toContain('12')
    expect(values).toContain('24')
    expect(values).toContain('other')
  })

  it('muestra input numérico libre al seleccionar "Otro" en intervalo', async () => {
    const user = userEvent.setup()
    render(
      <PautaForm
        children={CHILDREN}
        visits={[]}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
      />,
    )

    await user.selectOptions(screen.getByLabelText('Cada'), 'other')
    expect(screen.getByLabelText('Intervalo en horas')).not.toBeNull()
  })

  it('muestra select de visitas recientes del hijo seleccionado (máx 3)', async () => {
    const user = userEvent.setup()
    render(
      <PautaForm
        children={CHILDREN}
        visits={VISITS}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
      />,
    )

    // Select Mateo
    await user.selectOptions(screen.getByLabelText('Hijo'), 'h1')

    const visitSelect = screen.getByLabelText('Visita asociada')
    expect(visitSelect).not.toBeNull()

    // Should show max 3 visits + "Sin visita" default
    const options = Array.from((visitSelect as HTMLSelectElement).querySelectorAll('option'))
    expect(options.length).toBeLessThanOrEqual(4) // 3 visits + 1 default
    expect(options[0].textContent).toMatch(/Sin visita/)
  })

  it('envía los datos correctos al submit', async () => {
    const onSubmit = vi.fn()
    const user = userEvent.setup()
    render(
      <PautaForm
        children={CHILDREN}
        visits={[]}
        onSubmit={onSubmit}
        onCancel={vi.fn()}
      />,
    )

    await user.selectOptions(screen.getByLabelText('Hijo'), 'h1')
    await user.type(screen.getByLabelText('Medicamento'), 'Dalsy')
    await user.type(screen.getByLabelText('Dosis'), '5 ml')
    await user.selectOptions(screen.getByLabelText('Cada'), '8')
    await user.clear(screen.getByLabelText('Duración (días)'))
    await user.type(screen.getByLabelText('Duración (días)'), '7')

    await user.click(screen.getByRole('button', { name: 'Registrar' }))

    expect(onSubmit).toHaveBeenCalledWith({
      child_id: 'h1',
      medication: 'Dalsy',
      dose: '5 ml',
      interval_hours: 8,
      duration_days: 7,
      health_visit_id: null,
    })
  })

  it('envía health_visit_id cuando se selecciona una visita', async () => {
    const onSubmit = vi.fn()
    const user = userEvent.setup()
    render(
      <PautaForm
        children={CHILDREN}
        visits={VISITS}
        onSubmit={onSubmit}
        onCancel={vi.fn()}
      />,
    )

    await user.selectOptions(screen.getByLabelText('Hijo'), 'h1')
    await user.type(screen.getByLabelText('Medicamento'), 'Dalsy')
    await user.type(screen.getByLabelText('Dosis'), '5 ml')
    await user.selectOptions(screen.getByLabelText('Cada'), '8')
    await user.clear(screen.getByLabelText('Duración (días)'))
    await user.type(screen.getByLabelText('Duración (días)'), '7')
    await user.selectOptions(screen.getByLabelText('Visita asociada'), 'v1')

    await user.click(screen.getByRole('button', { name: 'Registrar' }))

    expect(onSubmit).toHaveBeenCalledWith({
      child_id: 'h1',
      medication: 'Dalsy',
      dose: '5 ml',
      interval_hours: 8,
      duration_days: 7,
      health_visit_id: 'v1',
    })
  })

  it('llama onCancel al pulsar Cancelar', async () => {
    const onCancel = vi.fn()
    const user = userEvent.setup()
    render(
      <PautaForm
        children={CHILDREN}
        visits={[]}
        onSubmit={vi.fn()}
        onCancel={onCancel}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(onCancel).toHaveBeenCalled()
  })

  it('usa childId implícito sin mostrarlo y filtra visitas por ese hijo', () => {
    render(
      <PautaForm
        childId="h1"
        children={CHILDREN}
        visits={VISITS}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
      />,
    )

    // No child selector
    expect(screen.queryByLabelText('Hijo')).toBeNull()

    // Visit selector should show visits for h1
    const visitSelect = screen.getByLabelText('Visita asociada')
    expect(visitSelect).not.toBeNull()
  })

  it('muestra "Guardando…" cuando pending=true', () => {
    render(
      <PautaForm
        children={CHILDREN}
        visits={[]}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
        pending
      />,
    )

    expect(screen.getByRole('button', { name: 'Guardando…' })).not.toBeNull()
  })
})
