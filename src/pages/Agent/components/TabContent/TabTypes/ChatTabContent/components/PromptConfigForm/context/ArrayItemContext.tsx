import React, { createContext, useContext } from 'react';

interface ArrayItemContextValue {
  /** Whether this field is rendered within an array item */
  isInArrayItem: boolean;
  /** Whether the array item controls should show collapse/expand functionality */
  arrayItemCollapsible: boolean;
}

const ArrayItemContext = createContext<ArrayItemContextValue>({
  isInArrayItem: false,
  arrayItemCollapsible: false,
});

export const useArrayItemContext = () => useContext(ArrayItemContext);

interface ArrayItemProviderProps {
  children: React.ReactNode;
  isInArrayItem: boolean;
  arrayItemCollapsible?: boolean;
}

export const ArrayItemProvider: React.FC<ArrayItemProviderProps> = ({
  children,
  isInArrayItem,
  arrayItemCollapsible = false,
}) => {
  return (
    <ArrayItemContext.Provider value={{ isInArrayItem, arrayItemCollapsible }}>
      {children}
    </ArrayItemContext.Provider>
  );
};
