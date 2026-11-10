import type { AgentGoal, GoalStore } from 'memeloop';
import type { DataSource } from 'typeorm';

/** Each mutation is one SQLite compare-and-swap statement, shared by UI and runtime. */
export class DesktopGoalStore implements GoalStore {
  public constructor(private readonly dataSource: DataSource) {}

  public async get(conversationId: string): Promise<AgentGoal | null> {
    const rows = await this.dataSource.query<Array<{ goalJson: string }>>(
      'SELECT goalJson FROM agent_goals WHERE conversationId = ?',
      [conversationId],
    );
    return rows[0] ? JSON.parse(rows[0].goalJson) as AgentGoal : null;
  }

  public async save(goal: AgentGoal, expectedRevision: number | null): Promise<boolean> {
    const values = [goal.executionNodeId, goal.status, goal.revision, JSON.stringify(goal), goal.conversationId];
    const rows = expectedRevision === null
      ? await this.dataSource.query<Array<{ revision: number }>>(
        `INSERT INTO agent_goals (executionNodeId, status, revision, goalJson, conversationId)
         VALUES (?, ?, ?, ?, ?) ON CONFLICT(conversationId) DO NOTHING RETURNING revision`,
        values,
      )
      : await this.dataSource.query<Array<{ revision: number }>>(
        `UPDATE agent_goals SET executionNodeId = ?, status = ?, revision = ?, goalJson = ?
         WHERE conversationId = ? AND revision = ? RETURNING revision`,
        [...values, expectedRevision],
      );
    return rows.length === 1;
  }

  public async listActive(executionNodeId: string, cursor?: string): Promise<{ items: AgentGoal[]; nextCursor?: string }> {
    const rows = await this.dataSource.query<Array<{ conversationId: string; goalJson: string }>>(
      `SELECT conversationId, goalJson FROM agent_goals
       WHERE executionNodeId = ? AND status = 'active' AND conversationId > ?
       ORDER BY conversationId LIMIT 101`,
      [executionNodeId, cursor ?? ''],
    );
    const page = rows.slice(0, 100);
    return {
      items: page.map(row => JSON.parse(row.goalJson) as AgentGoal),
      ...(rows.length > 100 ? { nextCursor: page[page.length - 1].conversationId } : {}),
    };
  }
}
