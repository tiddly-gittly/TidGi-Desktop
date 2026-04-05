import React, { useState } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Typography,
  Box,
  Alert,
} from "@mui/material";
import { styled } from "@mui/material/styles";
import LockIcon from "@mui/icons-material/Lock";

const PinCodeDisplay = styled(Box)(({ theme }) => ({
  backgroundColor: theme.palette.action.hover,
  padding: theme.spacing(2),
  borderRadius: theme.shape.borderRadius,
  textAlign: "center",
  marginTop: theme.spacing(2),
  marginBottom: theme.spacing(2),
}));

const PinCode = styled(Typography)(({ theme }) => ({
  fontFamily: "monospace",
  fontSize: "2rem",
  fontWeight: 700,
  letterSpacing: "0.5rem",
  color: theme.palette.primary.main,
}));

interface PinPairingDialogProps {
  open: boolean;
  nodeId: string;
  localPinCode: string;
  onConfirm: (confirmCode: string) => Promise<void>;
  onCancel: () => void;
}

export function PinPairingDialog({
  open,
  nodeId,
  localPinCode,
  onConfirm,
  onCancel,
}: PinPairingDialogProps): React.JSX.Element {
  const [confirmCode, setConfirmCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleConfirm = async (): Promise<void> => {
    if (!confirmCode.trim()) {
      setError("Please enter the confirmation code");
      return;
    }

    try {
      setLoading(true);
      setError(null);
      await onConfirm(confirmCode.trim());
      setConfirmCode("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "PIN confirmation failed");
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = (): void => {
    setConfirmCode("");
    setError(null);
    onCancel();
  };

  return (
    <Dialog open={open} maxWidth="sm" fullWidth onClose={handleCancel}>
      <DialogTitle>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <LockIcon color="primary" />
          PIN Pairing
        </Box>
      </DialogTitle>

      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          To pair with this node, verify that both devices show the same PIN
          code.
        </Typography>

        <Alert severity="info" sx={{ mb: 2 }}>
          Ask the remote node operator to confirm their PIN code matches yours.
        </Alert>

        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ display: "block", mb: 1 }}
        >
          Your PIN Code:
        </Typography>
        <PinCodeDisplay>
          <PinCode>{localPinCode || "------"}</PinCode>
        </PinCodeDisplay>

        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ display: "block", mb: 1 }}
        >
          Remote Node ID:
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
            mb: 2,
          }}
        >
          {nodeId}
        </Typography>

        <TextField
          fullWidth
          label="Enter Remote PIN Code"
          placeholder="Enter the PIN code shown on the remote node"
          value={confirmCode}
          onChange={(e) => setConfirmCode(e.target.value)}
          error={Boolean(error)}
          helperText={error}
          disabled={loading}
          autoFocus
          inputProps={{
            style: {
              fontFamily: "monospace",
              fontSize: "1.2rem",
              letterSpacing: "0.3rem",
              textAlign: "center",
            },
          }}
        />
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={handleCancel} disabled={loading}>
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={() => void handleConfirm()}
          disabled={loading || !confirmCode.trim()}
        >
          {loading ? "Confirming..." : "Confirm & Pair"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
