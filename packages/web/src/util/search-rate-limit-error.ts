export const SEARCH_RATE_LIMIT_MESSAGE =
  'Too many searches. Wait a moment and try again.';

type TrpcClientErrorLike = {
  data?: { code?: unknown; httpStatus?: unknown } | null;
};

/** Recognize the error shape exposed by tRPC's HTTP client. */
export function isTooManyRequestsError(error: unknown): boolean {
  const data = (error as TrpcClientErrorLike | null)?.data;
  return data?.code === 'TOO_MANY_REQUESTS' || data?.httpStatus === 429;
}
