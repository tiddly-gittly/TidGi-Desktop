import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/Delete";
import EditIcon from "@mui/icons-material/Edit";
import VisibilityIcon from "@mui/icons-material/Visibility";
import VisibilityOffIcon from "@mui/icons-material/VisibilityOff";
import {
  Box,
  Button,
  Chip,
  IconButton,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tooltip,
  Typography,
} from "@mui/material";
import { AIProviderConfig } from "@services/providerRegistry/interface";
import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { ProviderFormDialog } from "./ProviderFormDialog";

interface ProviderSettingsProps {
  providers: AIProviderConfig[];
  onProviderAdd: (provider: Partial<AIProviderConfig>) => Promise<void>;
  onProviderEdit: (
    providerName: string,
    updates: Partial<AIProviderConfig>,
  ) => Promise<void>;
  onProviderDelete: (providerName: string) => Promise<void>;
}

function maskApiKey(apiKey: string | undefined): string {
  if (!apiKey || apiKey.length === 0) return "";
  if (apiKey.length <= 4) return "****";
  return `${"*".repeat(apiKey.length - 4)}${apiKey.slice(-4)}`;
}

export function ProviderSettings({
  providers,
  onProviderAdd,
  onProviderEdit,
  onProviderDelete,
}: ProviderSettingsProps): React.JSX.Element {
  const { t } = useTranslation("agent");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingProvider, setEditingProvider] =
    useState<AIProviderConfig | null>(null);
  const [visibleApiKeys, setVisibleApiKeys] = useState<Set<string>>(new Set());

  const customProviders = providers.filter((p) => !p.isPreset);

  const handleAddClick = () => {
    setEditingProvider(null);
    setDialogOpen(true);
  };

  const handleEditClick = (provider: AIProviderConfig) => {
    setEditingProvider(provider);
    setDialogOpen(true);
  };

  const handleDialogClose = () => {
    setDialogOpen(false);
    setEditingProvider(null);
  };

  const handleDialogSave = async (providerData: Partial<AIProviderConfig>) => {
    if (editingProvider) {
      await onProviderEdit(editingProvider.provider, providerData);
    } else {
      await onProviderAdd(providerData);
    }
    handleDialogClose();
  };

  const handleDeleteClick = async (providerName: string) => {
    if (
      window.confirm(
        t("Preference.ConfirmDeleteProvider", { provider: providerName }),
      )
    ) {
      await onProviderDelete(providerName);
    }
  };

  const toggleApiKeyVisibility = (providerName: string) => {
    setVisibleApiKeys((prev) => {
      const next = new Set(prev);
      if (next.has(providerName)) {
        next.delete(providerName);
      } else {
        next.add(providerName);
      }
      return next;
    });
  };

  return (
    <Box sx={{ mt: 3 }}>
      <Box
        sx={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          mb: 2,
        }}
      >
        <Typography variant="h6">{t("Preference.CustomProviders")}</Typography>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={handleAddClick}
          size="small"
        >
          {t("Preference.AddCustomProvider")}
        </Button>
      </Box>

      {customProviders.length === 0 ? (
        <Paper
          sx={{ p: 3, textAlign: "center", bgcolor: "background.default" }}
        >
          <Typography color="text.secondary">
            {t("Preference.NoCustomProviders")}
          </Typography>
        </Paper>
      ) : (
        <TableContainer component={Paper}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>{t("Preference.ProviderName")}</TableCell>
                <TableCell>{t("Preference.BaseURL")}</TableCell>
                <TableCell>{t("Preference.APIKey")}</TableCell>
                <TableCell>{t("Preference.Status")}</TableCell>
                <TableCell align="right">{t("Preference.Actions")}</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {customProviders.map((provider) => {
                const isApiKeyVisible = visibleApiKeys.has(provider.provider);
                const displayApiKey = isApiKeyVisible
                  ? provider.apiKey || ""
                  : maskApiKey(provider.apiKey);

                return (
                  <TableRow key={provider.provider} hover>
                    <TableCell>
                      <Typography variant="body2" fontWeight="medium">
                        {provider.provider}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography
                        variant="body2"
                        color="text.secondary"
                        sx={{
                          maxWidth: 200,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                      >
                        {provider.baseURL || "-"}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Box
                        sx={{ display: "flex", alignItems: "center", gap: 1 }}
                      >
                        <Typography
                          variant="body2"
                          sx={{ fontFamily: "monospace", fontSize: "0.75rem" }}
                        >
                          {displayApiKey || "-"}
                        </Typography>
                        {provider.apiKey && (
                          <IconButton
                            size="small"
                            onClick={() =>
                              toggleApiKeyVisibility(provider.provider)
                            }
                          >
                            {isApiKeyVisible ? (
                              <VisibilityOffIcon fontSize="small" />
                            ) : (
                              <VisibilityIcon fontSize="small" />
                            )}
                          </IconButton>
                        )}
                      </Box>
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={
                          provider.enabled === false
                            ? t("Preference.Disabled")
                            : t("Preference.Enabled")
                        }
                        color={
                          provider.enabled === false ? "default" : "success"
                        }
                        size="small"
                      />
                    </TableCell>
                    <TableCell align="right">
                      <Tooltip title={t("Preference.Edit")}>
                        <IconButton
                          size="small"
                          onClick={() => handleEditClick(provider)}
                        >
                          <EditIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title={t("Preference.Delete")}>
                        <IconButton
                          size="small"
                          onClick={() => handleDeleteClick(provider.provider)}
                          color="error"
                        >
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      <ProviderFormDialog
        open={dialogOpen}
        provider={editingProvider}
        onClose={handleDialogClose}
        onSave={handleDialogSave}
      />
    </Box>
  );
}
