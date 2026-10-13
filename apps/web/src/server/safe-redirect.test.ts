import { describe, expect, it } from 'vitest';
import { safeNextPath } from './safe-redirect';

const BACKSLASH = String.fromCharCode(92);

describe('safeNextPath', () => {
  it('keeps a path on this site, with its query and hash', () => {
    expect(safeNextPath('/projects/PRJ-0001?tab=qa#findings')).toBe(
      '/projects/PRJ-0001?tab=qa#findings',
    );
  });

  it('refuses every way of naming another host', () => {
    for (const value of [
      'https://evil.example/',
      '//evil.example',
      `/${BACKSLASH}evil.example`,
      `/${BACKSLASH}/evil.example`,
      `${BACKSLASH}${BACKSLASH}evil.example`,
      '/\t/evil.example',
      '/\n/evil.example',
      'javascript:alert(1)',
    ]) {
      expect(safeNextPath(value), JSON.stringify(value)).toBeNull();
    }
  });

  it('treats an empty or missing value as no destination', () => {
    expect(safeNextPath('')).toBeNull();
    expect(safeNextPath(undefined)).toBeNull();
  });
});
