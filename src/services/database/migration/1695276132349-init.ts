import { MigrationInterface, QueryRunner, Table, TableForeignKey } from 'typeorm';

export class Init1695276132349 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // User table
    await queryRunner.createTable(
      new Table({
        name: 'user',
        columns: [
          {
            name: 'id',
            type: 'integer',
            isPrimary: true,
            isGenerated: true,
            generationStrategy: 'increment',
          },
          {
            name: 'username',
            type: 'varchar',
          },
        ],
      }),
      true,
    );

    // WorkflowNetwork table
    await queryRunner.createTable(
      new Table({
        name: 'workflowNetwork',
        columns: [
          {
            name: 'id',
            type: 'integer',
            isPrimary: true,
            isGenerated: true,
            generationStrategy: 'increment',
          },
          {
            name: 'runningState',
            type: 'varchar',
            // SQLite does not natively support the ENUM data type, and it seems like better-sqlite3 also does not support it. Error: Data type \"enum\" in \"WorkflowNetwork.runningState\" is not supported by \"better-sqlite3\" database.",
            // enum: ['idle', 'running', 'stopped'],
            default: "'idle'",
          },
          {
            name: 'serializedState',
            type: 'text',
          },
          {
            name: 'userId',
            type: 'integer',
          },
        ],
      }),
      true,
    );

    await queryRunner.createForeignKey(
      'workflowNetwork',
      new TableForeignKey({
        columnNames: ['userId'],
        referencedColumnNames: ['id'],
        referencedTableName: 'user',
        onDelete: 'CASCADE',
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('workflowNetwork');
    await queryRunner.dropTable('user');
  }
}
