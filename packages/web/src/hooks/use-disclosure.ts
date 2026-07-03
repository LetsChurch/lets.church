import { useCallback, useState } from 'react';

// Drop-in replacement for @mantine/hooks' useDisclosure.
export function useDisclosure(
  initialState = false,
  callbacks?: { onOpen?: () => void; onClose?: () => void },
): [boolean, { open: () => void; close: () => void; toggle: () => void }] {
  const [opened, setOpened] = useState(initialState);

  const open = useCallback(() => {
    setOpened((isOpened) => {
      if (!isOpened) {
        callbacks?.onOpen?.();
        return true;
      }
      return isOpened;
    });
  }, [callbacks]);

  const close = useCallback(() => {
    setOpened((isOpened) => {
      if (isOpened) {
        callbacks?.onClose?.();
        return false;
      }
      return isOpened;
    });
  }, [callbacks]);

  const toggle = useCallback(() => {
    setOpened((isOpened) => {
      if (isOpened) {
        callbacks?.onClose?.();
      } else {
        callbacks?.onOpen?.();
      }
      return !isOpened;
    });
  }, [callbacks]);

  return [opened, { open, close, toggle }];
}
