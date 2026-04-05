import React, { useState } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Typography,
  Box,
  Alert,
} from "@mui/material";
import WarningIcon from "@mui/icons-material/Warning";

interface RevokeDialogProps {
  open: boolean;
  nodeId: string;
  onConfirm: () => Promise<void>;
  onCancel: () => void;
}

export function RevokeDialog({
  open,
  nodeId,
  onConfirm,
  onCancel,
}: RevokeDialogProps): React.JSX.Element {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleConfirm = async (): Promise<void> => {
    try {
      setLoading(true);
      setError(null);
      await onConfirm();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to revoke trust");
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = (): void => {
    setError(null);
    onCancel();
  };

  return (
    <Dialog open={open} maxWidth="sm" fullWidth onClose={handleCancel}>
      <DialogTitle>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <WarningIcon color="error" />
          Revoke Node Trust
        </Box>
      </DialogTitle>

      <DialogContent>
        <Alert severity="warning" sx={{ mb: 2 }}>
          This will remove the node from your trusted list. The node will no
          longer be able to access your resources.
        </Alert>

        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          You can re-pair with this node later using PIN confirmation.
        </Typography>

        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ display: "block", mb: 1 }}
        >
          Node ID:
        </Typography>
        <Typography
          variant="body2"
          sx={{
            fontFamily: "monospace",
            fontSize: "0.75rem",
            backgroundColor: "action.hover",
            p: 1,
            borderRadius: 1,
            wordBreak: "break-all",
          }}
        >
          {nodeId}
        </Typography>

        {error && (
          <Alert severity="error" sx={{ mt: 2 }}>
            {error}
          </Alert>
        )}
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={handleCancel} disabled={loading}>
          Cancel
        </Button>
        <Button
          variant="contained"
          color="error"
          onClick={() => void handleConfirm()}
          disabled={loading}
        >
          {loading ? "Revoking..." : "Revoke Trust"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
