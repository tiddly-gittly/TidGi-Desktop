import type { DataSource, EntityManager } from 'typeorm';

const transactionTails = new WeakMap<DataSource, Promise<void>>();

/** TypeORM's better-sqlite3 driver shares one connection across transactions. */
export async function withAgentTransaction<T>(dataSource: DataSource, operation: (manager: EntityManager) => Promise<T>): Promise<T> {
  const previous = transactionTails.get(dataSource);
  let release!: () => void;
  const current = new Promise<void>(resolve => {
    release = resolve;
  });
  transactionTails.set(dataSource, current);
  if (previous) await previous;
  try {
    return await dataSource.transaction(operation);
  } finally {
    release();
    if (transactionTails.get(dataSource) === current) transactionTails.delete(dataSource);
  }
}
