export function adjacentPairs<T>(arr: [T, ...T[]]): Array<[T, T] | [T]> {
  if (arr.length <= 2) {
    return [arr] as Array<[T, T]>;
  }

  const pairs: [T, T][] = [];

  for (let i = 0; i < arr.length - 1; i++) {
    pairs.push([arr[i] as T, arr[i + 1] as T]);
  }

  return pairs;
}
