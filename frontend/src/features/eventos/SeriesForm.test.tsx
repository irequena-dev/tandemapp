import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { SeriesForm } from './SeriesForm'
import type { EventTypeOut, SeriesCreate } from './types'

const type1: EventTypeOut = {
  id: 't1',
  family_id: null,
  name: 'Cole',
  icon: 'school',
  is_system: true,
}

describe('SeriesForm — preview de ocurrencias', () => {
  it('muestra la preview de fechas mientras se edita (weekly + max_count)', () => {
    const { container } = render(
      <SeriesForm
        types={[type1]}
        children={[]}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
      />,
    )

    fireEvent.change(screen.getByLabelText('Título'), { target: { value: 'Extraescolar' } })
    fireEvent.change(screen.getByLabelText('Comienza el'), {
      target: { value: '2030-01-07' },
    })
    fireEvent.change(screen.getByLabelText('Repetir'), { target: { value: 'weekly' } })
    fireEvent.change(screen.getByLabelText('Día de la semana'), {
      target: { value: '0' },
    })
    fireEvent.change(screen.getByLabelText('Termina'), { target: { value: 'max_count' } })
    fireEvent.change(screen.getByLabelText('Nº de ocurrencias'), {
      target: { value: '3' },
    })

    const items = container.querySelectorAll('[data-date]')
    expect(items).toHaveLength(3)
    expect(container.querySelector('[data-date="2030-01-07"]')).not.toBeNull()
    expect(container.querySelector('[data-date="2030-01-14"]')).not.toBeNull()
    expect(container.querySelector('[data-date="2030-01-21"]')).not.toBeNull()
  })

  it('al enviar llama a onSubmit con la Serie acotada', () => {
    const onSubmit = vi.fn()
    render(
      <SeriesForm types={[type1]} children={[]} onSubmit={onSubmit} onCancel={vi.fn()} />,
    )

    fireEvent.change(screen.getByLabelText('Título'), { target: { value: 'Cole' } })
    fireEvent.change(screen.getByLabelText('Comienza el'), {
      target: { value: '2030-02-05' },
    })
    fireEvent.change(screen.getByLabelText('Repetir'), { target: { value: 'biweekly' } })
    fireEvent.change(screen.getByLabelText('Día de la semana'), {
      target: { value: '2' },
    })
    fireEvent.change(screen.getByLabelText('Nº de ocurrencias'), { target: { value: '2' } })

    fireEvent.click(screen.getByRole('button', { name: 'Crear serie' }))

    expect(onSubmit).toHaveBeenCalledTimes(1)
    const sent = onSubmit.mock.calls[0][0] as SeriesCreate
    expect(sent.title).toBe('Cole')
    expect(sent.cadence).toBe('biweekly')
    expect(sent.day_of_week).toBe(2)
    expect(sent.starts_at).toBe('2030-02-05')
    expect(sent.max_count).toBe(2)
    expect(sent.ends_at).toBeNull()
    expect(sent.event_type_id).toBe('t1')
  })

  it('monthly no exige día de la semana y acota por ends_at', () => {
    const { container } = render(
      <SeriesForm types={[type1]} children={[]} onSubmit={vi.fn()} onCancel={vi.fn()} />,
    )

    fireEvent.change(screen.getByLabelText('Título'), { target: { value: 'Pago' } })
    fireEvent.change(screen.getByLabelText('Comienza el'), {
      target: { value: '2030-01-31' },
    })
    fireEvent.change(screen.getByLabelText('Repetir'), { target: { value: 'monthly' } })
    // Sin día de la semana (monthly no lo muestra).
    expect(screen.queryByLabelText('Día de la semana')).toBeNull()
    fireEvent.change(screen.getByLabelText('Termina'), { target: { value: 'ends_at' } })
    fireEvent.change(screen.getByLabelText('Hasta'), { target: { value: '2030-03-31' } })

    const items = container.querySelectorAll('[data-date]')
    expect(items).toHaveLength(3)
    expect(container.querySelector('[data-date="2030-01-31"]')).not.toBeNull()
    expect(container.querySelector('[data-date="2030-02-28"]')).not.toBeNull()
    expect(container.querySelector('[data-date="2030-03-31"]')).not.toBeNull()
  })
})
