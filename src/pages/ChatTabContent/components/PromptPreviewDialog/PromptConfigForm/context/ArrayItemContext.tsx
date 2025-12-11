import React, { createContext, useContext, useMemo } from 'react';

interface ArrayItemContextValue {
  /** Whether this field is rendered within an array item */
  isInArrayItem: boolean;
  /** Whether the array item controls should show collapse/expand functionality */
  arrayItemCollapsible: boolean;
  /** The current item's form data */
  itemData?: unknown;
  /** The index of the current item in the array */
  itemIndex?: number;
  /** The stable field path for the parent array */
  arrayFieldPath?: string;
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
  arrayFieldPath?: string;
}

export const ArrayItemProvider: React.FC<ArrayItemProviderProps> = ({
  children,
  isInArrayItem,
  arrayItemCollapsible = false,
  itemData,
  itemIndex,
  arrayFieldPath,
}) => {
  const value = useMemo(() => ({
    isInArrayItem,
    arrayItemCollapsible,
    itemData,
    itemIndex,
    arrayFieldPath,
  }), [isInArrayItem, arrayItemCollapsible, itemData, itemIndex, arrayFieldPath]);

  return (
    <ArrayItemContext.Provider value={value}>
      {children}
    </ArrayItemContext.Provider>
  );
};

