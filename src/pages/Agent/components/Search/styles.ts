import { css } from 'styled-components';
import { TabType } from '../../types/tab';

export const autocompleteStyles = css`
  .aa-Autocomplete {
    width: 100%;
  }

  .aa-Form {
    border-radius: 8px;
    box-shadow: 0 2px 5px rgba(0, 0, 0, 0.1);
    background-color: ${({ theme }) => theme.palette.background.paper};
    border: 1px solid ${({ theme }) => theme.palette.divider};
  }

  .aa-InputWrapper {
    padding: 8px 16px;
  }

  .aa-Input {
    font-size: 16px;
    background: transparent;
    color: ${({ theme }) => theme.palette.text.primary};
    &::placeholder {
      color: ${({ theme }) => theme.palette.text.secondary};
    }
  }

  .aa-InputWrapperSuffix {
    display: flex;
    align-items: center;
  }

  .aa-ClearButton {
    padding: 0;
    margin-right: 8px;
  }
  
  .aa-Panel {
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    background-color: ${({ theme }) => theme.palette.background.paper};
    border: 1px solid ${({ theme }) => theme.palette.divider};
    overflow: hidden;
    margin-top: 8px;
  }

  .aa-List {
    padding: 8px 0;
  }

  .aa-SourceHeader {
    margin: 0;
    padding: 8px 16px;
    color: ${({ theme }) => theme.palette.text.secondary};
    font-weight: 600;
    font-size: 14px;
    border-bottom: 1px solid ${({ theme }) => theme.palette.divider};
  }

  .aa-ItemWrapper {
    padding: 8px 16px;
    cursor: pointer;
    
    &:hover, &[aria-selected="true"] {
      background-color: ${({ theme }) => theme.palette.action.hover};
    }
  }

  .aa-ItemContent {
    display: flex;
    align-items: center;
  }

  .aa-ItemIcon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    margin-right: 12px;
  }

  .aa-ItemContentBody {
    flex: 1;
    overflow: hidden;
  }

  .aa-ItemContentTitle {
    font-size: 14px;
    line-height: 20px;
    font-weight: 500;
    color: ${({ theme }) => theme.palette.text.primary};
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .aa-ItemContentDescription {
    font-size: 13px;
    line-height: 18px;
    color: ${({ theme }) => theme.palette.text.secondary};
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    margin-top: 2px;
  }

  mark {
    background-color: rgba(255, 226, 143, 0.4);
    color: inherit;
    font-weight: 500;
    padding: 0 1px;
  }
`;

export function getTabTypeIcon(type: TabType): string {
  switch (type) {
    case TabType.CHAT:
      return '💬';
    case TabType.WEB:
      return '🌐';
    case TabType.NEW_TAB:
      return '➕';
    default:
      return '📄';
  }
}

export function highlightHits({
  hit,
  attribute,
  query,
}: {
  hit: { [key: string]: string };
  attribute: string;
  query: string;
}): string {
  const value = hit[attribute] || '';
  if (!query) return value;

  const lowerCaseValue = value.toLowerCase();
  const lowerCaseQuery = query.toLowerCase();
  const startIndex = lowerCaseValue.indexOf(lowerCaseQuery);

  if (startIndex === -1) return value;

  const endIndex = startIndex + lowerCaseQuery.length;

  return (
    value.substring(0, startIndex) +
    `<mark>${value.substring(startIndex, endIndex)}</mark>` +
    value.substring(endIndex)
  );
}
