import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import ErrorIcon from "@mui/icons-material/Error";
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Typography,
} from "@mui/material";
import React, { useCallback, useEffect, useState } from "react";

import type {
  IToolApprovalRequest,
  ToolApprovalDecision,
} from "@/services/toolPermissions/interface";

export function ToolApprovalDialog(): React.JSX.Element {
  const [pendingRequests, setPendingRequests] = useState<
    IToolApprovalRequest[]
  >([]);
  const [currentRequest, setCurrentRequest] =
    useState<IToolApprovalRequest | null>(null);

  useEffect(() => {
    const service = window.service.toolPermissions as unknown as {
      pendingApprovals$: {
        subscribe: (callback: (requests: IToolApprovalRequest[]) => void) => {
          unsubscribe: () => void;
        };
      };
    };
    const subscription = service.pendingApprovals$.subscribe(
      (requests: IToolApprovalRequest[]) => {
        setPendingRequests(requests);
        if (requests.length > 0 && !currentRequest) {
          setCurrentRequest(requests[0]);
        }
      },
    );

    return () => {
      subscription.unsubscribe();
    };
  }, [currentRequest]);

  const handleDecision = useCallback(
    async (decision: ToolApprovalDecision) => {
      if (!currentRequest) return;

      try {
        await window.service.toolPermissions.resolveApproval(
          currentRequest.id,
          decision,
        );

        const remaining = pendingRequests.filter(
          (r) => r.id !== currentRequest.id,
        );
        if (remaining.length > 0) {
          setCurrentRequest(remaining[0]);
        } else {
          setCurrentRequest(null);
        }
      } catch (error) {
        void window.service.native.log(
          "error",
          "ToolApproval: resolve failed",
          { error },
        );
      }
    },
    [currentRequest, pendingRequests],
  );

  if (!currentRequest) return <></>;

  let parametersDisplay: string;
  try {
    const parsed = JSON.parse(currentRequest.parameters);
    parametersDisplay = JSON.stringify(parsed, null, 2);
  } catch {
    parametersDisplay = currentRequest.parameters;
  }

  return (
    <Dialog
      open={Boolean(currentRequest)}
      maxWidth="sm"
      fullWidth
      disableEscapeKeyDown
    >
      <DialogTitle>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <ErrorIcon color="warning" />
          Tool Execution Approval Required
        </Box>
      </DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          An agent is requesting permission to execute a tool. Review the
          details and choose how to proceed.
        </Typography>

        <Box sx={{ mb: 2 }}>
          <Typography variant="caption" color="text.secondary">
            Tool Name
          </Typography>
          <Typography
            variant="body1"
            sx={{
              fontFamily: "monospace",
              bgcolor: "action.hover",
              p: 1,
              borderRadius: 1,
              fontWeight: 600,
            }}
          >
            {currentRequest.toolName}
          </Typography>
        </Box>

        <Box sx={{ mb: 2 }}>
          <Typography variant="caption" color="text.secondary">
            Agent ID
          </Typography>
          <Typography
            variant="body2"
            sx={{
              fontFamily: "monospace",
              bgcolor: "action.hover",
              p: 1,
              borderRadius: 1,
            }}
          >
            {currentRequest.agentId}
          </Typography>
        </Box>

        {currentRequest.nodeId && (
          <Box sx={{ mb: 2 }}>
            <Typography variant="caption" color="text.secondary">
              Remote Node ID
            </Typography>
            <Typography
              variant="body2"
              sx={{
                fontFamily: "monospace",
                bgcolor: "action.hover",
                p: 1,
                borderRadius: 1,
              }}
            >
              {currentRequest.nodeId}
            </Typography>
          </Box>
        )}

        <Box sx={{ mb: 2 }}>
          <Typography variant="caption" color="text.secondary">
            Parameters
          </Typography>
          <Box
            sx={{
              fontFamily: "monospace",
              fontSize: "0.75rem",
              bgcolor: "action.hover",
              p: 1,
              borderRadius: 1,
              maxHeight: 200,
              overflow: "auto",
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
            }}
          >
            {parametersDisplay}
          </Box>
        </Box>

        {pendingRequests.length > 1 && (
          <Typography variant="caption" color="text.secondary">
            {pendingRequests.length - 1} more approval
            {pendingRequests.length > 2 ? "s" : ""} pending
          </Typography>
        )}
      </DialogContent>
      <DialogActions sx={{ flexDirection: "column", gap: 1, p: 2 }}>
        <Box sx={{ display: "flex", gap: 1, width: "100%" }}>
          <Button
            fullWidth
            variant="contained"
            color="success"
            startIcon={<CheckCircleIcon />}
            onClick={() => {
              void handleDecision("allow-once");
            }}
          >
            Allow Once
          </Button>
          <Button
            fullWidth
            variant="contained"
            color="primary"
            onClick={() => {
              void handleDecision("allow-session");
            }}
          >
            Allow for Session
          </Button>
        </Box>
        <Box sx={{ display: "flex", gap: 1, width: "100%" }}>
          <Button
            fullWidth
            variant="outlined"
            onClick={() => {
              void handleDecision("allow-always");
            }}
          >
            Allow Always
          </Button>
          <Button
            fullWidth
            variant="outlined"
            color="error"
            onClick={() => {
              void handleDecision("deny");
            }}
          >
            Deny
          </Button>
        </Box>
      </DialogActions>
    </Dialog>
  );
}
