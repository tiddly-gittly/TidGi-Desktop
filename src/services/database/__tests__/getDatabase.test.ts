/** @vitest-environment node */
import fs from 'fs-extra';
import { DataSource } from 'typeorm';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DatabaseService } from '..';

describe('DatabaseService.getDatabase', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('propagates schema initialization errors without modifying the database file', async () => {
    const service = new DatabaseService();
    const initializationError = new Error('schema initialization failed');
    const initialize = vi.spyOn(DataSource.prototype, 'initialize').mockRejectedValue(initializationError);
    const copy = vi.spyOn(fs, 'copy');
    const unlink = vi.spyOn(fs, 'unlink');

    service.registerSchema('schemaFailure', {
      entities: [],
      synchronize: true,
      migrationsRun: false,
    });

    await expect(service.getDatabase('schemaFailure')).rejects.toBe(initializationError);

    expect(initialize).toHaveBeenCalledOnce();
    expect(copy).not.toHaveBeenCalled();
    expect(unlink).not.toHaveBeenCalled();
  });
});
