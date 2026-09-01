import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const styles = readFileSync(new URL('./styles.css', import.meta.url), 'utf8');

function rule(selector: string) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return styles.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`))?.[1] ?? '';
}

describe('control contrast', () => {
  it('keeps brass controls filled before hover', () => {
    expect(rule('.button--brass')).toContain('background: var(--brass-fill)');
  });

  it('uses opaque readable labels on the active audition tab', () => {
    expect(rule('.audition__mode--active')).toContain('background: var(--brass-fill)');
    expect(rule('.audition__mode--active span')).toContain('color: var(--brass-edge)');
  });
});
