// Centralize table parsing heuristics so feature files can evolve without step churn.
export function parseDataTableRows(rows: string[][], expectedColumns: number = 2): string[][] {
  if (rows.length === 0) return [];

  const firstRow = rows[0];
  if (firstRow && firstRow.length === expectedColumns) {
    const hasHeader = firstRow.some((cell) =>
      cell && typeof cell === 'string' &&
      (cell.toLowerCase().includes('description') ||
        cell.toLowerCase().includes('selector') ||
        cell.toLowerCase().includes('text') ||
        cell.toLowerCase().includes('element'))
    );
    return hasHeader ? rows.slice(1) : rows;
  }

  // Prefer skipping the first row when structure is ambiguous to avoid accidental header assertions.
  return rows.slice(1);
}
