import { useEffect, useRef, useState } from 'react';

// Drop-in replacement for @mantine/hooks' useDebouncedValue.
export function useDebouncedValue<T>(
  value: T,
  wait: number,
  options: { leading?: boolean } = { leading: false },
): [T, () => void] {
  const [debounced, setDebounced] = useState(value);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const leadingRef = useRef(true);

  const cancel = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
  };

  useEffect(() => {
    if (leadingRef.current && options.leading) {
      leadingRef.current = false;
      setDebounced(value);
      return;
    }
    cancel();
    timeoutRef.current = setTimeout(() => {
      leadingRef.current = true;
      setDebounced(value);
    }, wait);
    return cancel;
  }, [value, wait]);

  return [debounced, cancel];
}
