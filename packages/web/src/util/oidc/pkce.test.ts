import { describe, expect, test } from 'vitest';

import { verifyPkceS256 } from './pkce';

// RFC 7636 Appendix B worked example.
const VERIFIER = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
const CHALLENGE = 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM';

describe('verifyPkceS256', () => {
  test('accepts a valid S256 verifier/challenge pair', () => {
    expect(verifyPkceS256(VERIFIER, CHALLENGE, 'S256')).toBe(true);
  });

  test('rejects a mismatched verifier', () => {
    expect(verifyPkceS256(`${VERIFIER}x`.slice(1), CHALLENGE, 'S256')).toBe(
      false,
    );
  });

  test('rejects the wrong challenge', () => {
    expect(verifyPkceS256(VERIFIER, `${CHALLENGE.slice(0, -1)}X`, 'S256')).toBe(
      false,
    );
  });

  test('rejects the plain method', () => {
    // Even when verifier === challenge, plain must be refused.
    expect(verifyPkceS256(VERIFIER, VERIFIER, 'plain')).toBe(false);
  });

  test('rejects a too-short verifier', () => {
    const short = 'abc';
    expect(verifyPkceS256(short, CHALLENGE, 'S256')).toBe(false);
  });

  test('rejects a verifier with illegal characters', () => {
    const bad = `${'a'.repeat(42)}/`;
    expect(verifyPkceS256(bad, CHALLENGE, 'S256')).toBe(false);
  });
});
