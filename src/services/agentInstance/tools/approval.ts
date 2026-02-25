/**
 * Tool Approval Infrastructure
 *
 * Manages the approval flow for tool executions that require user confirmation.
 * Supports:
 * - Per-tool approval modes (auto / confirm)
 * - Regex-based allowlists and denylists
 * - Pending approval queue with UI notification
 * - Future: AI-based judgment (placeholder)
 */
import { logger } from '@services/libs/log';
import type { ApprovalDecision, ToolApprovalConfig, ToolApprovalRequest } from './types';

/**
 * Pending approval requests waiting for user response.
 * Key: approvalId, Value: resolve function to unblock execution.
 */
const pendingApprovals = new Map<string, {
  request: ToolApprovalRequest;
  resolve: (decision: 'allow' | 'deny') => void;
}>();

/** Listeners for new approval requests (UI subscribes to these) */
const approvalListeners = new Set<(request: ToolApprovalRequest) => void>();

/**
 * Subscribe to approval requests (for frontend UI).
 * Returns an unsubscribe function.
 */
export function onApprovalRequest(listener: (request: ToolApprovalRequest) => void): () => void {
  approvalListeners.add(listener);
  return () => {
    approvalListeners.delete(listener);
  };
}

/**
 * Evaluate approval rules for a tool call.
 * Returns 'allow', 'deny', or 'pending' (needs user confirmation).
 */
export function evaluateApproval(
  approval: ToolApprovalConfig | undefined,
  toolName: string,
  parameters: Record<string, unknown>,
): ApprovalDecision {
  // No approval config or auto mode → allow
  if (!approval || approval.mode === 'auto') {
    return 'allow';
  }

  // Serialize the call content for pattern matching
  const callContent = JSON.stringify({ tool: toolName, parameters });

  // Check deny patterns first
  if (approval.denyPatterns?.length) {
    for (const pattern of approval.denyPatterns) {
      try {
        if (new RegExp(pattern, 'i').test(callContent)) {
          logger.debug('Tool call denied by pattern', { toolName, pattern });
          return 'deny';
        }
      } catch (error) {
        logger.warn('Invalid deny pattern', { pattern, error });
      }
    }
  }

  // Check allow patterns
  if (approval.allowPatterns?.length) {
    for (const pattern of approval.allowPatterns) {
      try {
        if (new RegExp(pattern, 'i').test(callContent)) {
          logger.debug('Tool call auto-allowed by pattern', { toolName, pattern });
          return 'allow';
        }
      } catch (error) {
        logger.warn('Invalid allow pattern', { pattern, error });
      }
    }
  }

  // No pattern matched, needs confirmation
  return 'pending';
}

/**
 * Request approval from the user. Returns a promise that resolves when the user responds.
 * The UI should call `resolveApproval()` with the user's decision.
 *
 * @param request The approval request details
 * @param timeoutMs Timeout in ms (0 = no timeout). On timeout, auto-denies.
 */
export function requestApproval(
  request: ToolApprovalRequest,
  timeoutMs: number = 60000,
): Promise<'allow' | 'deny'> {
  return new Promise<'allow' | 'deny'>((resolve) => {
    pendingApprovals.set(request.approvalId, { request, resolve });

    // Notify all listeners (for UI)
    for (const listener of approvalListeners) {
      try {
        listener(request);
      } catch (error) {
        logger.warn('Approval listener error', { error });
      }
    }

    // Timeout
    if (timeoutMs > 0) {
      setTimeout(() => {
        if (pendingApprovals.has(request.approvalId)) {
          pendingApprovals.delete(request.approvalId);
          logger.info('Tool approval timed out, auto-denying', { approvalId: request.approvalId, toolName: request.toolName });
          resolve('deny');
        }
      }, timeoutMs);
    }
  });
}

/**
 * Resolve a pending approval (called from UI).
 */
export function resolveApproval(approvalId: string, decision: 'allow' | 'deny'): void {
  const pending = pendingApprovals.get(approvalId);
  if (pending) {
    pendingApprovals.delete(approvalId);
    pending.resolve(decision);
    logger.debug('Tool approval resolved', { approvalId, decision, toolName: pending.request.toolName });
  } else {
    logger.warn('No pending approval found', { approvalId });
  }
}

/**
 * Get all currently pending approval requests (for UI to render on reconnect).
 */
export function getPendingApprovals(): ToolApprovalRequest[] {
  return [...pendingApprovals.values()].map(p => p.request);
}

/**
 * Cancel all pending approvals for an agent (on agent cancel/close).
 */
export function cancelPendingApprovals(agentId: string): void {
  for (const [id, pending] of pendingApprovals) {
    if (pending.request.agentId === agentId) {
      pendingApprovals.delete(id);
      pending.resolve('deny');
    }
  }
}
