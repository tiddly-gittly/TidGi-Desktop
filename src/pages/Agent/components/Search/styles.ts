import { TabType } from '../../types/tab';

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
