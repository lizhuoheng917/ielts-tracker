import { describe, expect, it } from 'vitest'

import { ACHIEVEMENT_VISUALS } from './achievement-visuals'
import { BADGES } from '@/lib/constants'

describe('achievement visuals', () => {
  it('为全部成就提供唯一的矢量视觉映射', () => {
    const badgeIds = BADGES.map((badge) => badge.id).sort()
    const visualIds = Object.keys(ACHIEVEMENT_VISUALS).sort()

    expect(new Set(badgeIds).size).toBe(BADGES.length)
    expect(visualIds).toEqual(badgeIds)
  })
})
