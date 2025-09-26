import { createContext, useContext } from 'react';

type HeaderContextType = {
  setBackgroundImage: (imageUrl?: string) => void;
};

const HeaderContext = createContext<HeaderContextType | null>(null);

export const useHeader = () => {
  const context = useContext(HeaderContext);
  if (!context) {
    throw new Error('useHeader must be used within a Header component');
  }
  return context;
};

export default HeaderContext;
