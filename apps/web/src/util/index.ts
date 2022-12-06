export function notEmpty<T>(t?: T | null): t is T {
  return t !== null && t !== undefined;
}
