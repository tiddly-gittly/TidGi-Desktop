# Prompt Tree Navigation to Form Editor

## Overview

Click on any prompt item in the tree view and automatically open the corresponding form editor with the correct tab and expanded state.

## Implementation Details

### 1. Source Path Tracking

When plugins inject content into the prompt tree using `injectToolList()` or `injectContent()`, the system automatically adds a `source` field to track the original configuration location.

**File**: `src/services/agentInstance/tools/defineTool.ts`

```typescript
// Build source path pointing to the plugin configuration
const pluginIndex = context.pluginIndex;
const source = pluginIndex !== undefined ? ['plugins', toolConfig.id] : undefined;

const toolPrompt: IPrompt = {
  id: `${toolId}-tool-list-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
  text: toolContent,
  caption: options.caption ?? `${definition.displayName} Tools`,
  enabled: true,
  source, // ['plugins', 'plugin-id']
};
```

The `source` array format: `['plugins', pluginId]` or `['prompts', promptId, ...]`

### 2. Navigation Trigger

**File**: `src/pages/ChatTabContent/components/PromptTree.tsx`

When a user clicks a tree node:

```typescript
const handleNodeClick = useCallback((event: React.MouseEvent) => {
  event.stopPropagation();
  
  // Use source path if available, otherwise construct from fieldPath
  const targetFieldPath = (node.source && node.source.length > 0) 
    ? node.source 
    : [...fieldPath, node.id];
  
  setFormFieldsToScrollTo(targetFieldPath);
}, [node.source, node.id, fieldPath, setFormFieldsToScrollTo]);
```

### 3. Tab Switching

**File**: `src/pages/ChatTabContent/components/PromptPreviewDialog/PromptConfigForm/templates/RootObjectFieldTemplate.tsx`

The root form template listens to the navigation path and switches to the appropriate tab:

```typescript
useEffect(() => {
  if (formFieldsToScrollTo.length > 0) {
    const targetTab = formFieldsToScrollTo[0]; // 'prompts', 'plugins', or 'response'
    const tabIndex = properties.findIndex(property => property.name === targetTab);
    if (tabIndex !== -1 && tabIndex !== activeTab) {
      setActiveTab(tabIndex);
    }
  }
}, [formFieldsToScrollTo, properties, activeTab]);
```

### 4. Item Expansion

**File**: `src/pages/ChatTabContent/components/PromptPreviewDialog/EditView.tsx`

The EditView component handles the expansion of nested items:

```typescript
useEffect(() => {
  if (formFieldsToScrollTo.length > 0 && editorMode === 'form') {
    const savedPath = [...formFieldsToScrollTo];
    
    // Wait for RootObjectFieldTemplate to switch tabs
    setTimeout(() => {
      setFormFieldsToScrollTo([]); // Clear after tab switches
      
      // Step 1: Expand top-level item
      const topLevelKey = savedPath[0];
      const firstItemId = savedPath[1];
      expandItemsByPath(topLevelKey, [firstItemId]);
      
      // Step 2: Expand nested children if present
      if (savedPath.length > 2) {
        setTimeout(() => {
          const parentIndex = findParentIndex(topLevelKey, firstItemId);
          const nestedFieldPath = `${topLevelKey}_${parentIndex}_children`;
          const nestedItemIds = savedPath.slice(2);
          expandItemsByPath(nestedFieldPath, nestedItemIds);
        }, 300);
      }
    }, 100);
  }
}, [formFieldsToScrollTo, editorMode, agentFrameworkConfig]);
```

### 5. Store Management

**File**: `src/pages/Agent/store/agentChatStore/PromptPreviewStore.ts`

The store maintains:

- Expansion state for all array fields
- Navigation path queue
- Helper functions to expand/collapse items

```typescript
interface PromptPreviewStore {
  arrayExpansionStore: Record<string, Record<number, boolean>>;
  formFieldsToScrollTo: string[];
  
  setItemExpanded: (fieldPath: string, index: number, expanded: boolean) => void;
  setFormFieldsToScrollTo: (path: string[]) => void;
}
```

## Data Flow

1. User clicks "Git Tools" in tree view
2. `PromptTree` reads `node.source` → `['plugins', 'g3f4e5d6-7e8f-9g0h-1i2j-l3m4n5o6p7q8']`
3. Calls `setFormFieldsToScrollTo(['plugins', 'g3f4e5d6-7e8f-9g0h-1i2j-l3m4n5o6p7q8'])`
4. `RootObjectFieldTemplate` detects path[0] = 'plugins' → switches to plugins tab
5. `EditView` expands the plugin item with id 'g3f4e5d6-7e8f-9g0h-1i2j-l3m4n5o6p7q8'
6. Form scrolls to and highlights the target element

## Timing Considerations

The implementation uses careful timing to ensure proper rendering:

- **100ms delay**: Wait for tab switch before expanding items
- **300ms delay**: Wait for parent expansion before expanding nested children
- **500ms delay**: Wait for all expansions before scrolling to target

These delays account for React's rendering cycles and DOM updates.

## Extension Points

To add navigation support for custom components:

1. Add `source` field when creating prompts
2. Ensure `source` points to the configuration location: `['topLevelKey', 'itemId', ...]`
3. The navigation system will automatically handle the rest

## Related Files

- `src/services/agentInstance/tools/defineTool.ts` - Source path injection
- `src/services/agentInstance/tools/types.ts` - Context types with pluginIndex
- `src/services/agentInstance/promptConcat/promptConcat.ts` - Plugin index passing
- `src/pages/ChatTabContent/components/PromptTree.tsx` - Click handler
- `src/pages/ChatTabContent/components/PromptPreviewDialog/EditView.tsx` - Expansion logic
- `src/pages/ChatTabContent/components/PromptPreviewDialog/PromptConfigForm/templates/RootObjectFieldTemplate.tsx` - Tab switching
- `src/pages/Agent/store/agentChatStore/PromptPreviewStore.ts` - State management
