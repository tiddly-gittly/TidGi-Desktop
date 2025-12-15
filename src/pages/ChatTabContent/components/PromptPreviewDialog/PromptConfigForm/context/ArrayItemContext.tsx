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
  /** The path segments to locate the array in root form data */
  arrayFieldPathSegments?: Array<string | number>;
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
  arrayFieldPathSegments?: Array<string | number>;
}

export const ArrayItemProvider: React.FC<ArrayItemProviderProps> = ({
  children,
  isInArrayItem,
  arrayItemCollapsible = false,
  itemData,
  itemIndex,
  arrayFieldPath,
  arrayFieldPathSegments,
}) => {
  const value = useMemo(() => ({
    isInArrayItem,
    arrayItemCollapsible,
    itemData,
    itemIndex,
    arrayFieldPath,
    arrayFieldPathSegments,
  }), [isInArrayItem, arrayItemCollapsible, itemData, itemIndex, arrayFieldPath, arrayFieldPathSegments]);

  return (
    <ArrayItemContext.Provider value={value}>
      {children}
    </ArrayItemContext.Provider>
  );
};
