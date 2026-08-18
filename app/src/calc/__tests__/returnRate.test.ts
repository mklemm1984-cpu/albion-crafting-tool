import { describe, it, expect } from 'vitest';
import { resourceReturnRate, isNonReturnable } from '../returnRate';

describe('resourceReturnRate', () => {
  it('computes base royal city RRR (bonus 0.18)', () => {
    expect(resourceReturnRate({ baseCityBonus: 0.18 })).toBeCloseTo(0.1525, 4);
  });

  it('computes RRR with focus (shared test config: bonus 0.77)', () => {
    const rrr = resourceReturnRate({ baseCityBonus: 0.18, useFocus: true });
    expect(rrr).toBeCloseTo(0.435, 4);
  });

  it('adds a generic hideout/guild bonus on top of the stack', () => {
    const rrr = resourceReturnRate({
      baseCityBonus: 0.18,
      specBonus: 0.15,
      hideoutBonus: 0.1,
      useFocus: true,
    });
    expect(rrr).toBeCloseTo(0.505, 3);
  });
});

describe('isNonReturnable', () => {
  it('flags artifacts, runes, souls, relics and tokens', () => {
    expect(isNonReturnable('T5_ARTEFACT_FOCUS_AVALON')).toBe(true);
    expect(isNonReturnable('T4_RUNE')).toBe(true);
    expect(isNonReturnable('T4_SOUL')).toBe(true);
    expect(isNonReturnable('T4_RELIC')).toBe(true);
    expect(isNonReturnable('T4_FACTION_TOKEN_MARTLOCK')).toBe(true);
  });

  it('does not flag regular materials', () => {
    expect(isNonReturnable('T4_CLOTH')).toBe(false);
  });
});
