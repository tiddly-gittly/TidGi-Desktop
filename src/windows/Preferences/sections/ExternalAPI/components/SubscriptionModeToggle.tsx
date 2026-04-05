import InfoIcon from "@mui/icons-material/Info";
import {
  Alert,
  Box,
  Button,
  FormControl,
  FormControlLabel,
  Link,
  Paper,
  Radio,
  RadioGroup,
  TextField,
  Typography,
} from "@mui/material";
import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

type SubscriptionMode = "self-hosted" | "subscription";

interface SubscriptionStatus {
  mode: SubscriptionMode;
  apiKey?: string;
  subscriptionActive?: boolean;
  subscriptionExpiry?: string;
}

export function SubscriptionModeToggle(): React.JSX.Element {
  const { t } = useTranslation("agent");
  const [mode, setMode] = useState<SubscriptionMode>("self-hosted");
  const [apiKey, setApiKey] = useState("");
  const [status, setStatus] = useState<SubscriptionStatus | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadSubscriptionStatus();
  }, []);

  const loadSubscriptionStatus = async () => {
    try {
      const service = window.service.database as unknown as {
        getSetting: (key: string) => SubscriptionStatus | undefined;
      };
      const savedStatus = service.getSetting("memeloopSubscription");
      if (savedStatus) {
        setStatus(savedStatus);
        setMode(savedStatus.mode);
        setApiKey(savedStatus.apiKey || "");
      }
    } catch (error) {
      console.error("Failed to load subscription status:", error);
    }
  };

  const handleModeChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setMode(event.target.value as SubscriptionMode);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const service = window.service.database as unknown as {
        setSetting: (key: string, value: SubscriptionStatus) => void;
      };
      const newStatus: SubscriptionStatus = {
        mode,
        apiKey: mode === "self-hosted" ? apiKey : undefined,
      };
      service.setSetting("memeloopSubscription", newStatus);
      setStatus(newStatus);
    } catch (error) {
      console.error("Failed to save subscription mode:", error);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Paper sx={{ p: 2, mb: 3, bgcolor: "background.default" }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 2 }}>
        <InfoIcon color="primary" fontSize="small" />
        <Typography variant="h6">
          {t("Preference.MemeloopSubscription")}
        </Typography>
      </Box>

      <FormControl component="fieldset" fullWidth>
        <RadioGroup value={mode} onChange={handleModeChange}>
          <FormControlLabel
            value="self-hosted"
            control={<Radio />}
            label={
              <Box>
                <Typography variant="body1">
                  {t("Preference.SelfHostedMode")}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {t("Preference.SelfHostedModeDescription")}
                </Typography>
              </Box>
            }
          />
          <FormControlLabel
            value="subscription"
            control={<Radio />}
            label={
              <Box>
                <Typography variant="body1">
                  {t("Preference.SubscriptionMode")}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {t("Preference.SubscriptionModeDescription")}
                </Typography>
              </Box>
            }
          />
        </RadioGroup>
      </FormControl>

      {mode === "self-hosted" && (
        <Box sx={{ mt: 2 }}>
          <TextField
            label={t("Preference.MemeloopAPIKey")}
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            fullWidth
            type="password"
            placeholder="ml-..."
            helperText={t("Preference.MemeloopAPIKeyHelp")}
            size="small"
          />
        </Box>
      )}

      {mode === "subscription" && (
        <Alert severity="info" sx={{ mt: 2 }}>
          <Typography variant="body2">
            {t("Preference.SubscriptionInfo")}{" "}
            <Link
              href="https://memeloop.cloud/subscribe"
              target="_blank"
              rel="noopener"
            >
              {t("Preference.ManageSubscription")}
            </Link>
          </Typography>
          {status?.subscriptionActive && (
            <Typography variant="caption" display="block" sx={{ mt: 1 }}>
              {t("Preference.SubscriptionActiveUntil", {
                date: status.subscriptionExpiry,
              })}
            </Typography>
          )}
        </Alert>
      )}

      <Box sx={{ mt: 2, display: "flex", justifyContent: "flex-end" }}>
        <Button
          variant="contained"
          onClick={handleSave}
          disabled={saving || (mode === "self-hosted" && !apiKey.trim())}
          size="small"
        >
          {saving
            ? t("Preference.Saving")
            : t("Preference.SaveSubscriptionMode")}
        </Button>
      </Box>
    </Paper>
  );
}
