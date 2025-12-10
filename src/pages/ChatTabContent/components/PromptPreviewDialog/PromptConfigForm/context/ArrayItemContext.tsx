import React, { createContext, useContext } from 'react';

interface ArrayItemContextValue {
  /** Whether this field is rendered within an array item */
  isInArrayItem: boolean;
  /** Whether the array item controls should show collapse/expand functionality */
  arrayItemCollapsible: boolean;
  /** The current item's form data */
  itemData?: unknown;
  /** The index of the current item in the array */
  itemIndex?: number;
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
  itemData?: unknown;
  itemIndex?: number;
}

export const ArrayItemProvider: React.FC<ArrayItemProviderProps> = ({
  children,
  isInArrayItem,
  arrayItemCollapsible = false,
  itemData,
  itemIndex,
}) => {
  return (
    <ArrayItemContext.Provider value={{ isInArrayItem, arrayItemCollapsible, itemData, itemIndex }}>
      {children}
    </ArrayItemContext.Provider>
  );
};

