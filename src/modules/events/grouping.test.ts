import { describe, expect, it } from 'vitest'
import { groupSimultaneous } from './grouping'
import type { Activity } from './service'

const ev = (id: string, date: string, start: string | null): Activity => ({ id, activity_date: date, start_time: start } as Activity)

describe('eventos ao mesmo tempo', () => {
  it('mescla mesmo dia e mesmo início, mantendo a ordem', () => {
    const g = groupSimultaneous([ev('a', '2027-02-08', '18:00:00'), ev('b', '2027-02-08', '18:00:00'), ev('c', '2027-02-08', '19:00:00'), ev('d', '2027-02-08', '18:00:00')])
    expect(g.map((x) => x.items.map((i) => i.id))).toEqual([['a', 'b', 'd'], ['c']])
  })
  it('dias diferentes não mesclam; sem horário nunca mescla', () => {
    const g = groupSimultaneous([ev('a', '2027-02-08', '18:00'), ev('b', '2027-02-09', '18:00'), ev('c', '2027-02-08', null), ev('d', '2027-02-08', null)])
    expect(g.map((x) => x.items.length)).toEqual([1, 1, 1, 1])
  })
})
