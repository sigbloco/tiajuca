import { describe, expect, it } from 'vitest'
import { cleanSchedule, hasFutureSlot, scheduleText, validateSchedule, type ScheduleSlot } from './schedule'

const TODAY = '2026-10-19'

describe('texto da agenda (prévia do painel; igual ao que o banco monta)', () => {
  const slots: ScheduleSlot[] = [
    { type: 'date', date: '2026-10-22', start: '10:30', end: '14:00', label: 'Feijoada' },
    { type: 'weekly', weekday: 1, start: '19:00', end: '22:00', label: 'Ensaio' },
    { type: 'date', date: '2026-10-10', start: '10:00' },
  ]
  it('dias fixos primeiro, depois datas futuras; observação no fim; datas passadas somem', () => {
    const r = scheduleText(slots, 'Entrada pela portaria', TODAY)
    expect(r.text).toBe('Segundas (Ensaio), das 19h às 22h · Qui 22/10/2026 (Feijoada), das 10h30 às 14h · Entrada pela portaria')
    expect(r.expired).toBe(1)
  })
  it('segunda vem antes de domingo na lista; horários parciais', () => {
    const r = scheduleText([{ type: 'weekly', weekday: 0 }, { type: 'weekly', weekday: 6, start: '09:00' }, { type: 'weekly', weekday: 2, end: '18:00' }], '', TODAY)
    expect(r.text).toBe('Terças, até às 18h · Sábados, a partir das 9h · Domingos')
  })
  it('só observação, ou nada', () => {
    expect(scheduleText([], 'Combinar', TODAY).text).toBe('Combinar')
    expect(scheduleText([], '  ', TODAY).text).toBe('')
  })
})

describe('ponto disponível no checkout', () => {
  it('sem agenda ou com dia fixo: sempre; só datas: precisa de uma futura (hoje conta)', () => {
    expect(hasFutureSlot([], TODAY)).toBe(true)
    expect(hasFutureSlot([{ type: 'weekly', weekday: 1 }], TODAY)).toBe(true)
    expect(hasFutureSlot([{ type: 'date', date: '2026-10-19' }], TODAY)).toBe(true)
    expect(hasFutureSlot([{ type: 'date', date: '2026-10-18' }], TODAY)).toBe(false)
  })
})

describe('validação', () => {
  it('aceita uma agenda correta', () => {
    expect(validateSchedule([{ type: 'weekly', weekday: 1, start: '19:00', end: '22:00' }, { type: 'date', date: '2026-11-07' }])).toEqual([])
  })
  it('recusa dia, data e horas inválidos, e hora final antes da inicial', () => {
    expect(validateSchedule([{ type: 'weekly', weekday: 9 }])).toHaveLength(1)
    expect(validateSchedule([{ type: 'date', date: '' }])).toHaveLength(1)
    expect(validateSchedule([{ type: 'date', date: '2026-02-31' }])).toHaveLength(1)
    expect(validateSchedule([{ type: 'weekly', weekday: 1, start: '25:00' }])).toHaveLength(1)
    expect(validateSchedule([{ type: 'weekly', weekday: 1, start: '22:00', end: '19:00' }])).toEqual(['Horário 1: a hora final precisa ser depois da inicial.'])
    expect(validateSchedule(Array.from({ length: 21 }, () => ({ type: 'weekly' as const, weekday: 1 })))).toContain('No máximo 20 horários por ponto.')
  })
  it('limpa campos vazios antes de enviar ao banco', () => {
    expect(cleanSchedule([{ type: 'weekly', weekday: 1, start: '', end: '22:00', label: '  ' }, { type: 'date', date: '2026-11-07', label: ' Feijoada ' }]))
      .toEqual([{ type: 'weekly', weekday: 1, end: '22:00' }, { type: 'date', date: '2026-11-07', label: 'Feijoada' }])
  })
})
