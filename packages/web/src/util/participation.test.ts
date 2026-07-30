import { describe, expect, it } from 'vitest';

import { hasAcceptedParticipationAgreements } from './participation';

describe('hasAcceptedParticipationAgreements', () => {
  const acceptedAt = new Date('2026-07-29T12:00:00.000Z');

  it('requires both acknowledgments', () => {
    expect(
      hasAcceptedParticipationAgreements({
        statementOfTheologyAcceptedAt: acceptedAt,
        termsAcceptedAt: acceptedAt,
      }),
    ).toBe(true);

    expect(
      hasAcceptedParticipationAgreements({
        statementOfTheologyAcceptedAt: acceptedAt,
        termsAcceptedAt: null,
      }),
    ).toBe(false);

    expect(
      hasAcceptedParticipationAgreements({
        statementOfTheologyAcceptedAt: null,
        termsAcceptedAt: acceptedAt,
      }),
    ).toBe(false);
  });
});
