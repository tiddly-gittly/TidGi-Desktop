import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';

/**
 * Callback functions for moving items
 */
interface ItemMoveCallbacks {
  onMoveUp: () => void;
  onMoveDown: () => void;
}

/** Counter for generating unique IDs */
let itemIdCounter = 0;

/** Generate a unique stable ID for an array item */
function generateItemId(): string {
  return `item-${Date.now()}-${itemIdCounter++}`;
}

/**
 * Store for managing array field state
 * Tracks expanded state and ordering for each array field instance
 */
interface ArrayFieldState {
  /** Map of field path -> array of expanded states for each item */
  expandedStates: Record<string, boolean[]>;
  /** Map of field path -> array of item data (for stable rendering) */
  itemsData: Record<string, unknown[]>;
  /** Map of field path -> array order (indices) - used for optimistic rendering during drag */
  itemsOrder: Record<string, number[]>;
  /** Map of field path -> index -> move callbacks */
  moveCallbacks: Record<string, Record<number, ItemMoveCallbacks>>;
  /** Map of field path -> array of stable unique IDs for dnd-kit */
  stableItemIds: Record<string, string[]>;
  /** Map of field path -> whether there's a pending reorder (optimistic update in progress) */
  pendingReorder: Record<string, boolean>;
}

interface ArrayFieldActions {
  /** Set expanded state for a specific item */
  setItemExpanded: (fieldPath: string, itemIndex: number, expanded: boolean) => void;
  /** Initialize array field state */
  initializeField: (fieldPath: string, itemCount: number, itemsData: unknown[]) => void;
  /** Move item to new position (optimistic update for drag-and-drop) */
  moveItem: (fieldPath: string, oldIndex: number, newIndex: number) => void;
  /** Update items data when form data changes (from RJSF) */
  updateItemsData: (fieldPath: string, itemsData: unknown[]) => void;
  /** Clean up field state when unmounted */
  cleanupField: (fieldPath: string) => void;
  /** Register move callbacks for an item */
  registerMoveCallbacks: (fieldPath: string, itemIndex: number, callbacks: ItemMoveCallbacks) => void;
  /** Reset all state */
  reset: () => void;
}

const initialState: ArrayFieldState = {
  expandedStates: {},
  itemsData: {},
  itemsOrder: {},
  moveCallbacks: {},
  stableItemIds: {},
  pendingReorder: {},
};

export const useArrayFieldStore = create<ArrayFieldState & ArrayFieldActions>()(
  immer((set) => ({
    ...initialState,

    setItemExpanded: (fieldPath, itemIndex, expanded) => {
      set((state) => {
        if (!state.expandedStates[fieldPath]) {
          state.expandedStates[fieldPath] = [];
        }
        state.expandedStates[fieldPath][itemIndex] = expanded;
      });
    },

    initializeField: (fieldPath, itemCount, itemsData) => {
      set((state) => {
        // Only initialize if not already present or if count changed
        if (!state.expandedStates[fieldPath] || state.expandedStates[fieldPath].length !== itemCount) {
          state.expandedStates[fieldPath] = Array.from({ length: itemCount }, () => false);
          state.itemsOrder[fieldPath] = Array.from({ length: itemCount }, (_, index) => index);
          state.stableItemIds[fieldPath] = Array.from({ length: itemCount }, () => generateItemId());
        }
        state.itemsData[fieldPath] = itemsData;
      });
    },

    moveItem: (fieldPath, oldIndex, newIndex) => {
      set((state) => {
        const order = state.itemsOrder[fieldPath];
        const expanded = state.expandedStates[fieldPath];
        const stableIds = state.stableItemIds[fieldPath];
        if (!order || !expanded || !stableIds) return;

        // Mark that we have a pending reorder (optimistic update)
        state.pendingReorder[fieldPath] = true;

        // Move in order array
        const [movedOrderItem] = order.splice(oldIndex, 1);
        order.splice(newIndex, 0, movedOrderItem);

        // Move in expanded states
        const [movedExpandedItem] = expanded.splice(oldIndex, 1);
        expanded.splice(newIndex, 0, movedExpandedItem);

        // Move in stable IDs array
        const [movedStableId] = stableIds.splice(oldIndex, 1);
        stableIds.splice(newIndex, 0, movedStableId);
      });
    },

    updateItemsData: (fieldPath, itemsData) => {
      set((state) => {
        const previousLength = state.itemsData[fieldPath]?.length ?? 0;
        const newLength = itemsData.length;
        const hasPendingReorder = state.pendingReorder[fieldPath] ?? false;

        state.itemsData[fieldPath] = itemsData;

        // Adjust order, expanded states, and stable IDs if length changed
        if (newLength !== previousLength) {
          if (newLength > previousLength) {
            // Items added
            const addedCount = newLength - previousLength;
            if (!state.itemsOrder[fieldPath]) {
              state.itemsOrder[fieldPath] = [];
            }
            if (!state.expandedStates[fieldPath]) {
              state.expandedStates[fieldPath] = [];
            }
            if (!state.stableItemIds[fieldPath]) {
              state.stableItemIds[fieldPath] = [];
            }
            for (let addedIndex = 0; addedIndex < addedCount; addedIndex++) {
              state.itemsOrder[fieldPath].push(previousLength + addedIndex);
              state.expandedStates[fieldPath].push(false);
              state.stableItemIds[fieldPath].push(generateItemId());
            }
          } else {
            // Items removed
            if (state.itemsOrder[fieldPath]) {
              state.itemsOrder[fieldPath] = state.itemsOrder[fieldPath]
                .filter((_originalIndex, position) => position < newLength)
                .map((_originalIndex, position) => position);
            }
            if (state.expandedStates[fieldPath]) {
              state.expandedStates[fieldPath].splice(newLength);
            }
            if (state.stableItemIds[fieldPath]) {
              state.stableItemIds[fieldPath].splice(newLength);
            }
          }
          // Clear pending reorder flag on length change
          state.pendingReorder[fieldPath] = false;
        } else if (hasPendingReorder && state.itemsOrder[fieldPath]) {
          // Length is same and we had a pending reorder - RJSF has re-rendered with updated data
          // Reset itemsOrder to natural order since items array now reflects the new order
          state.itemsOrder[fieldPath] = Array.from({ length: newLength }, (_, index) => index);
          state.pendingReorder[fieldPath] = false;
        }
      });
    },

    cleanupField: (fieldPath) => {
      set((state) => {
        state.expandedStates = Object.fromEntries(
          Object.entries(state.expandedStates).filter(([key]) => key !== fieldPath),
        );
        state.itemsData = Object.fromEntries(
          Object.entries(state.itemsData).filter(([key]) => key !== fieldPath),
        );
        state.itemsOrder = Object.fromEntries(
          Object.entries(state.itemsOrder).filter(([key]) => key !== fieldPath),
        );
        state.moveCallbacks = Object.fromEntries(
          Object.entries(state.moveCallbacks).filter(([key]) => key !== fieldPath),
        );
        state.stableItemIds = Object.fromEntries(
          Object.entries(state.stableItemIds).filter(([key]) => key !== fieldPath),
        );
        state.pendingReorder = Object.fromEntries(
          Object.entries(state.pendingReorder).filter(([key]) => key !== fieldPath),
        );
      });
    },

    registerMoveCallbacks: (fieldPath, itemIndex, callbacks) => {
      set((state) => {
        if (!state.moveCallbacks[fieldPath]) {
          state.moveCallbacks[fieldPath] = {};
        }
        state.moveCallbacks[fieldPath][itemIndex] = callbacks;
      });
    },

    reset: () => {
      set(initialState);
    },
  })),
);

/**
 * Get move callbacks for an item - standalone function to avoid circular reference
 */
export function getMoveCallbacks(fieldPath: string, itemIndex: number): ItemMoveCallbacks | undefined {
  return useArrayFieldStore.getState().moveCallbacks[fieldPath]?.[itemIndex];
}
