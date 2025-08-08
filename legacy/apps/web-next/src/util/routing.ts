import { useLocation } from '@solidjs/router';

export const isChurchesPage = () => {
  const loc = useLocation();
  return loc.pathname.startsWith('/churches');
};
