export type ParticipationAgreementState = {
  statementOfTheologyAcceptedAt: Date | null;
  termsAcceptedAt: Date | null;
};

export function hasAcceptedParticipationAgreements(
  state: ParticipationAgreementState,
): boolean {
  return Boolean(state.statementOfTheologyAcceptedAt && state.termsAcceptedAt);
}
