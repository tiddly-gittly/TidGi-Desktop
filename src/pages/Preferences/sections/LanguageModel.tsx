import React, { useCallback } from 'react';
import { useTranslation } from 'react-i18next';

import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import { Box, Button, Divider, LinearProgress, List, ListItemButton, Tooltip } from '@mui/material';

import { ListItem, ListItemText } from '@/components/ListItem';
import { usePromiseValue } from '@/helpers/useServiceValue';
import { useLoadModelObservable, useModelLoadedObservable, useModelLoadProgressObservable } from '@services/languageModel/hooks';
import { LanguageModelRunner } from '@services/languageModel/interface';
import { usePreferenceObservable } from '@services/preferences/hooks';
import { ListItemVertical, Paper, SectionTitle, TextField } from '../PreferenceComponents';
import type { ISectionProps } from '../useSections';

export function LanguageModel(props: Partial<ISectionProps>): JSX.Element {
  const { t } = useTranslation();

  const preference = usePreferenceObservable();
  const [LANGUAGE_MODEL_FOLDER] = usePromiseValue<[string | undefined]>(
    async () => await Promise.all([window.service.context.get('LANGUAGE_MODEL_FOLDER')]),
    [undefined],
  )!;
  const modelLoaded = useModelLoadedObservable();

  return (
    <>
      <SectionTitle ref={props.sections?.languageModel?.ref}>{t('Preference.LanguageModel.Title')}</SectionTitle>
      <Paper elevation={0}>
        <List dense disablePadding>
          {preference === undefined ? <ListItemVertical>{t('Loading')}</ListItemVertical> : (
            <>
              <ListItemButton
                onClick={async () => {
                  if (LANGUAGE_MODEL_FOLDER !== undefined) {
                    await window.service.native.mkdir(LANGUAGE_MODEL_FOLDER);
                    await window.service.native.openPath(LANGUAGE_MODEL_FOLDER, true);
                  }
                }}
              >
                <ListItemText
                  primary={t('Preference.LanguageModel.OpenModelFolder')}
                  secondary={
                    <div>
                      <div>{t('Preference.LanguageModel.OpenModelFolderDescription')}</div>
                      <div>{LANGUAGE_MODEL_FOLDER}</div>
                    </div>
                  }
                />
                <ChevronRightIcon color='action' />
              </ListItemButton>
              <ListItemVertical>
                <ListItemText primary={t('Preference.LanguageModel.DefaultModel')} />
                <ListItemText secondary={t('Preference.LanguageModel.DefaultModelDescription')} />
                {Object.keys(preference.languageModel.defaultModel).map(key => {
                  const runner = key as LanguageModelRunner;
                  const modelFileName = preference.languageModel.defaultModel[runner];
                  const modelPath = `${LANGUAGE_MODEL_FOLDER}/${modelFileName}`;
                  return (
                    <Box display='flex' key={key} width='100%'>
                      <TextField
                        fullWidth
                        label={modelPath}
                        onChange={async (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
                          await window.service.preference.set('languageModel', {
                            ...preference.languageModel,
                            defaultModel: {
                              ...preference.languageModel.defaultModel,
                              [key]: event.target.value,
                            },
                          });
                        }}
                        value={modelFileName}
                      />
                      <ModelLoadProgressBar runner={runner} modelLoaded={modelLoaded?.[runner] === true} modelPath={modelPath} />
                    </Box>
                  );
                })}
              </ListItemVertical>
              <Divider />
              <ListItem>
                <ListItemText primary={t('Preference.LanguageModel.TimeoutDuration')} secondary={t('Preference.LanguageModel.UpdateTimeoutDuration')} />
                <TextField
                  type='number'
                  onChange={async (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
                    const newValue = 1000 * Number(event.target.value);
                    await window.service.preference.set('languageModel', {
                      ...preference.languageModel,
                      timeoutDuration: (Number.isFinite(newValue) && newValue > 0) ? newValue : 30,
                    });
                  }}
                  value={preference.languageModel.timeoutDuration / 1000}
                />
              </ListItem>
            </>
          )}
        </List>
      </Paper>
    </>
  );
}

function ModelLoadProgressBar({ runner, modelLoaded, modelPath }: { modelLoaded: boolean; modelPath: string; runner: LanguageModelRunner }) {
  const { t } = useTranslation();
  const modelLoadProgress = useModelLoadProgressObservable();
  const progress = modelLoadProgress?.[runner] ?? 0;
  const [loadModal] = useLoadModelObservable();
  const unloadModal = useCallback(async (runner: LanguageModelRunner) => {
    await window.service.languageModel.unloadLanguageModel(runner);
  }, []);
  return (
    <Box display='flex' flexDirection='column' justifyContent='flex-end' alignItems='center' width='10em'>
      {progress > 0 && progress < 1 && <LinearProgress variant='determinate' value={progress} />}
      <Box display='flex'>
        {modelLoaded
          ? (
            <Tooltip title={`${t('Preference.LanguageModel.ModelLoaded')} ${t('Preference.LanguageModel.UnLoadModelDescription')}`}>
              <Button
                onClick={async () => {
                  await unloadModal(runner);
                }}
              >
                {t('Preference.LanguageModel.UnLoadModel')}
              </Button>
            </Tooltip>
          )
          : (
            <Tooltip title={`${t('Preference.LanguageModel.ModelNotLoaded')} ${t('Preference.LanguageModel.LoadModelDescription')}`}>
              <Button
                onClick={() => {
                  loadModal(runner, {
                    loadModelOnly: true,
                    id: 'tidgi-preference-page-load-model',
                    completionOptions: { prompt: '-' },
                    loadConfig: { modelPath },
                  });
                }}
              >
                {t('Preference.LanguageModel.LoadModel')}
              </Button>
            </Tooltip>
          )}
      </Box>
    </Box>
  );
}
