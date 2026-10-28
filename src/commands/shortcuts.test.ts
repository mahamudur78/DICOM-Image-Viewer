import { describe, expect, it } from 'vitest'
import { DEFAULT_KEYMAP, keyConflicts } from './keymap'

describe('keyboard shortcuts', () => {
  it('give every key to one command, except known exclusive pairs', () => {
    expect(keyConflicts(DEFAULT_KEYMAP)).toEqual([])
  })
  it('detect conflicts', () => {
    expect(keyConflicts({ a: ['x'], b: ['x'] })).toEqual([['x', ['a', 'b']]])
  })
})
