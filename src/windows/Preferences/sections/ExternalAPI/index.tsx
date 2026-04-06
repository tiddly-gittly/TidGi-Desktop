import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import CloudIcon from "@mui/icons-material/Cloud";
import LoginIcon from "@mui/icons-material/Login";
import LogoutIcon from "@mui/icons-material/Logout";
import TuneIcon from "@mui/icons-material/Tune";
import { Alert, Box, Button, Chip, CircularProgress, Divider, List, TextField, Typography } from "@mui/material";

import { ListItemText } from "@/components/ListItem";
import {
  AIProviderConfig,
  ModelInfo,
} from "@services/providerRegistry/interface";
import type { ICustomSectionProps } from "@services/preferences/definitions/types";
import type { NodeIdentityStatus } from "@services/memeloopNode/interface";
import {
  ListItemVertical,
  Paper,
  SectionTitle,
} from "../../PreferenceComponents";
import { AIModelParametersDialog } from "./components/AIModelParametersDialog";
import { ModelSelector } from "./components/ModelSelector";
import { ProviderConfig } from "./components/ProviderConfig";
import { ProviderSettings } from "./components/ProviderSettings";
import { useAIConfigManagement } from "./useAIConfigManagement";

export function ExternalAPI(props: ICustomSectionProps): React.JSX.Element {
  const { t } = useTranslation("agent");
  const {
    loading,
    config,
    providers,
    setProviders,
    handleModelChange,
    handleEmbeddingModelChange,
    handleSpeechModelChange,
    handleImageGenerationModelChange,
    handleTranscriptionsModelChange,
    handleFreeModelChange,
    handleConfigChange,
  } = useAIConfigManagement();
  const [parametersDialogOpen, setParametersDialogOpen] = useState(false);

  const openParametersDialog = () => {
    setParametersDialogOpen(true);
  };

  const closeParametersDialog = () => {
    setParametersDialogOpen(false);
  };

  const handleModelClear = async () => {
    if (!config) return;

    try {
      // Delete the default model configuration
      await window.service.externalAPI.deleteFieldFromDefaultAIConfig(
        "default",
      );

      // Update local state to reflect deletion
      const updatedConfig = {
        ...config,
        default: undefined,
      };

      await handleConfigChange(updatedConfig);
    } catch (error) {
      console.error("Failed to clear model configuration:", error);
    }
  };

  const handleEmbeddingModelClear = async () => {
    if (!config) return;

    // Delete the embedding model configuration
    await window.service.externalAPI.deleteFieldFromDefaultAIConfig(
      "embedding",
    );

    // Update local state to reflect the change
    const updatedConfig = {
      ...config,
      embedding: undefined,
    };
    await handleConfigChange(updatedConfig);
  };

  const handleSpeechModelClear = async () => {
    if (!config) return;

    await window.service.externalAPI.deleteFieldFromDefaultAIConfig("speech");

    const updatedConfig = {
      ...config,
      speech: undefined,
    };
    await handleConfigChange(updatedConfig);
  };

  const handleImageGenerationModelClear = async () => {
    if (!config) return;

    await window.service.externalAPI.deleteFieldFromDefaultAIConfig(
      "imageGeneration",
    );

    const updatedConfig = {
      ...config,
      imageGeneration: undefined,
    };
    await handleConfigChange(updatedConfig);
  };

  const handleTranscriptionsModelClear = async () => {
    if (!config) return;

    await window.service.externalAPI.deleteFieldFromDefaultAIConfig(
      "transcriptions",
    );

    const updatedConfig = {
      ...config,
      transcriptions: undefined,
    };
    await handleConfigChange(updatedConfig);
  };

  // Extract model selections directly from config
  const defaultModelConfig = config?.default;
  const embeddingConfig = config?.embedding;
  const speechConfig = config?.speech;
  const imageGenerationConfig = config?.imageGeneration;
  const transcriptionsConfig = config?.transcriptions;
  const freeModelConfig = config?.free;

  const handleFreeModelClear = async () => {
    if (!config) return;

    await window.service.externalAPI.deleteFieldFromDefaultAIConfig("free");

    const updatedConfig = {
      ...config,
      free: undefined,
    };
    await handleConfigChange(updatedConfig);
  };

  return (
    <>
      <SectionTitle ref={props.sectionRef}>
        {t("Preference.ExternalAPI")}
      </SectionTitle>
      <Paper elevation={0}>
        <List dense disablePadding>
          {loading ? (
            <ListItemVertical>{t("Loading")}</ListItemVertical>
          ) : (
            <>
              {providers.length > 0 && (
                <>
                  <ListItemVertical>
                    <ListItemText
                      primary={t("Preference.DefaultAIModelSelection")}
                      secondary={t(
                        "Preference.DefaultAIModelSelectionDescription",
                      )}
                    />
                    <ModelSelector
                      selectedModel={defaultModelConfig}
                      modelOptions={providers.flatMap((provider) =>
                        provider.models
                          .filter(
                            (model) =>
                              Array.isArray(model.features) &&
                              model.features.includes("language"),
                          )
                          .map(
                            (model) =>
                              [provider, model] as [
                                AIProviderConfig,
                                ModelInfo,
                              ],
                          ),
                      )}
                      onChange={handleModelChange}
                      onClear={handleModelClear}
                    />
                  </ListItemVertical>

                  <ListItemVertical>
                    <ListItemText
                      primary={t("Preference.DefaultEmbeddingModelSelection")}
                      secondary={t(
                        "Preference.DefaultEmbeddingModelSelectionDescription",
                      )}
                    />
                    <ModelSelector
                      selectedModel={embeddingConfig}
                      modelOptions={providers.flatMap((provider) =>
                        provider.models
                          .filter(
                            (model) =>
                              Array.isArray(model.features) &&
                              model.features.includes("embedding"),
                          )
                          .map(
                            (model) =>
                              [provider, model] as [
                                AIProviderConfig,
                                ModelInfo,
                              ],
                          ),
                      )}
                      onChange={handleEmbeddingModelChange}
                      onClear={handleEmbeddingModelClear}
                    />
                  </ListItemVertical>

                  <ListItemVertical>
                    <ListItemText
                      primary={t("Preference.DefaultSpeechModelSelection")}
                      secondary={t(
                        "Preference.DefaultSpeechModelSelectionDescription",
                      )}
                    />
                    <ModelSelector
                      selectedModel={speechConfig}
                      modelOptions={providers.flatMap((provider) =>
                        provider.models
                          .filter(
                            (model) =>
                              Array.isArray(model.features) &&
                              model.features.includes("speech"),
                          )
                          .map(
                            (model) =>
                              [provider, model] as [
                                AIProviderConfig,
                                ModelInfo,
                              ],
                          ),
                      )}
                      onChange={handleSpeechModelChange}
                      onClear={handleSpeechModelClear}
                    />
                  </ListItemVertical>

                  <ListItemVertical>
                    <ListItemText
                      primary={t(
                        "Preference.DefaultImageGenerationModelSelection",
                      )}
                      secondary={t(
                        "Preference.DefaultImageGenerationModelSelectionDescription",
                      )}
                    />
                    <ModelSelector
                      selectedModel={imageGenerationConfig}
                      modelOptions={providers.flatMap((provider) =>
                        provider.models
                          .filter(
                            (model) =>
                              Array.isArray(model.features) &&
                              model.features.includes("imageGeneration"),
                          )
                          .map(
                            (model) =>
                              [provider, model] as [
                                AIProviderConfig,
                                ModelInfo,
                              ],
                          ),
                      )}
                      onChange={handleImageGenerationModelChange}
                      onClear={handleImageGenerationModelClear}
                    />
                  </ListItemVertical>

                  <ListItemVertical>
                    <ListItemText
                      primary={t(
                        "Preference.DefaultTranscriptionsModelSelection",
                      )}
                      secondary={t(
                        "Preference.DefaultTranscriptionsModelSelectionDescription",
                      )}
                    />
                    <ModelSelector
                      selectedModel={transcriptionsConfig}
                      modelOptions={providers.flatMap((provider) =>
                        provider.models
                          .filter(
                            (model) =>
                              Array.isArray(model.features) &&
                              model.features.includes("transcriptions"),
                          )
                          .map(
                            (model) =>
                              [provider, model] as [
                                AIProviderConfig,
                                ModelInfo,
                              ],
                          ),
                      )}
                      onChange={handleTranscriptionsModelChange}
                      onClear={handleTranscriptionsModelClear}
                    />
                  </ListItemVertical>

                  <ListItemVertical>
                    <ListItemText
                      primary={t("Preference.DefaultFreeModelSelection")}
                      secondary={t(
                        "Preference.DefaultFreeModelSelectionDescription",
                      )}
                    />
                    <ModelSelector
                      selectedModel={freeModelConfig}
                      modelOptions={providers.flatMap((provider) =>
                        provider.models
                          .filter(
                            (model) =>
                              Array.isArray(model.features) &&
                              model.features.includes("free"),
                          )
                          .map(
                            (model) =>
                              [provider, model] as [
                                AIProviderConfig,
                                ModelInfo,
                              ],
                          ),
                      )}
                      onChange={handleFreeModelChange}
                      onClear={handleFreeModelClear}
                    />
                  </ListItemVertical>

                  <ListItemVertical>
                    <ListItemText
                      primary={t("Preference.ModelParameters", { ns: "agent" })}
                      secondary={t("Preference.ModelParametersDescription", {
                        ns: "agent",
                      })}
                    />
                    <Button
                      variant="outlined"
                      color="primary"
                      startIcon={<TuneIcon />}
                      onClick={openParametersDialog}
                      disabled={!config}
                      sx={{ alignSelf: "flex-start" }}
                    >
                      {t("Preference.ConfigureModelParameters", {
                        ns: "agent",
                      })}
                    </Button>
                  </ListItemVertical>
                </>
              )}

              <ProviderConfig
                providers={providers}
                changeDefaultModel={handleModelChange}
                changeDefaultEmbeddingModel={handleEmbeddingModelChange}
                changeDefaultSpeechModel={handleSpeechModelChange}
                changeDefaultImageGenerationModel={
                  handleImageGenerationModelChange
                }
                changeDefaultTranscriptionsModel={
                  handleTranscriptionsModelChange
                }
                changeDefaultFreeModel={handleFreeModelChange}
                setProviders={setProviders}
              />
            </>
          )}
        </List>
      </Paper>

      <ProviderSettings
        providers={providers}
        onProviderAdd={async (provider) => {
          await window.service.externalAPI.updateProvider(
            provider.provider!,
            provider,
          );
          const updatedProviders =
            await window.service.externalAPI.getAIProviders();
          setProviders(updatedProviders);
        }}
        onProviderEdit={async (providerName, updates) => {
          await window.service.externalAPI.updateProvider(
            providerName,
            updates,
          );
          const updatedProviders =
            await window.service.externalAPI.getAIProviders();
          setProviders(updatedProviders);
        }}
        onProviderDelete={async (providerName) => {
          await window.service.externalAPI.deleteProvider(providerName);
          const updatedProviders =
            await window.service.externalAPI.getAIProviders();
          setProviders(updatedProviders);
        }}
      />

      {/* 模型参数设置对话框 */}
      <AIModelParametersDialog
        open={parametersDialogOpen}
        onClose={closeParametersDialog}
        config={config}
        onSave={handleConfigChange}
      />

      <CloudAuthPanel />
    </>
  );
}

// ─── Cloud service auth panel (moved from WikiSync section) ──────────────────

function CloudAuthPanel(): React.JSX.Element {
  const { t } = useTranslation();
  const [identity, setIdentity] = useState<NodeIdentityStatus | null>(null);
  const [cloudUrl, setCloudUrl] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [otp, setOtp] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const id = await window.service.memeloopNode.getIdentityStatus();
    setIdentity(id);
    const url = await window.service.memeloopNode.getCloudUrl();
    if (url) setCloudUrl(url);
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const handleSetCloudUrl = useCallback(async () => {
    if (!cloudUrl.trim()) return;
    setError(null);
    await window.service.memeloopNode.setCloudUrl(cloudUrl.trim());
    await refresh();
  }, [cloudUrl, refresh]);

  const handleLogin = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await window.service.memeloopNode.cloudLogin(email, password);
      if (!result.ok) setError(result.error ?? 'Login failed');
      else { setPassword(''); await refresh(); }
    } finally { setLoading(false); }
  }, [email, password, refresh]);

  const handleLogout = useCallback(async () => {
    await window.service.memeloopNode.cloudLogout();
    await refresh();
  }, [refresh]);

  const handleRequestOtp = useCallback(async () => {
    setError(null);
    try {
      const result = await window.service.memeloopNode.requestNodeOtp();
      setOtp(result.otp);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  const handleRegisterNode = useCallback(async () => {
    if (!otp) return;
    setLoading(true);
    setError(null);
    try {
      const result = await window.service.memeloopNode.registerNodeWithOtp(otp);
      if (result.error) setError(result.error);
      else { setOtp(null); await refresh(); }
    } finally { setLoading(false); }
  }, [otp, refresh]);

  return (
    <>
      <Divider sx={{ mt: 2 }} />
      <Box sx={{ px: 2, pt: 1.5, pb: 0.5 }}>
        <Typography variant="subtitle1" fontWeight="medium">
          <CloudIcon sx={{ verticalAlign: 'middle', mr: 0.5, fontSize: '1.2em' }} />
          {t('Preference.WikiSync.CloudAuth')}
        </Typography>
      </Box>

      <Box sx={{ mx: 2, mb: 1 }}>
        <Box sx={{ display: 'flex', gap: 1, mb: 1, alignItems: 'flex-start' }}>
          <TextField
            size="small"
            label={t('Preference.WikiSync.CloudUrl')}
            placeholder="https://api.memeloop.dev"
            value={cloudUrl}
            onChange={(e) => setCloudUrl(e.target.value)}
            fullWidth
          />
          <Button size="small" variant="outlined" onClick={handleSetCloudUrl} sx={{ minWidth: 60 }}>
            {t('Preference.WikiSync.Save')}
          </Button>
        </Box>

        {identity?.cloudLoggedIn
          ? (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
              <Chip label={identity.cloudEmail ?? 'Logged in'} color="success" size="small" />
              {identity.cloudNodeRegistered && <Chip label={t('Preference.WikiSync.NodeRegistered')} size="small" variant="outlined" color="info" />}
              <Button size="small" startIcon={<LogoutIcon />} onClick={handleLogout}>
                {t('Preference.WikiSync.Logout')}
              </Button>
            </Box>
            )
          : (
            <Box sx={{ display: 'flex', gap: 1, mb: 1, alignItems: 'flex-start', flexWrap: 'wrap' }}>
              <TextField size="small" label={t('Preference.WikiSync.Email')} value={email} onChange={(e) => setEmail(e.target.value)} />
              <TextField size="small" label={t('Preference.WikiSync.Password')} type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
              <Button size="small" variant="contained" startIcon={loading ? <CircularProgress size={14} /> : <LoginIcon />} onClick={handleLogin} disabled={loading || !email || !password}>
                {t('Preference.WikiSync.Login')}
              </Button>
            </Box>
            )}

        {identity?.cloudLoggedIn && !identity.cloudNodeRegistered && (
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
            <Button size="small" variant="outlined" onClick={handleRequestOtp}>
              {t('Preference.WikiSync.RequestOtp')}
            </Button>
            {otp && (
              <>
                <Typography variant="body2">{t('Preference.WikiSync.OtpCode')}: <strong>{otp}</strong></Typography>
                <Button size="small" variant="contained" onClick={handleRegisterNode} disabled={loading}>
                  {t('Preference.WikiSync.RegisterNode')}
                </Button>
              </>
            )}
          </Box>
        )}

        {error && <Alert severity="error" sx={{ mt: 1 }}>{error}</Alert>}
      </Box>
    </>
  );
}
