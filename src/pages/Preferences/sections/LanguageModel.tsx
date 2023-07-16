import React from 'react';
import { useTranslation } from 'react-i18next';

import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import { Divider, List, ListItemButton } from '@mui/material';

import { ListItem, ListItemText } from '@/components/ListItem';
import { usePromiseValue } from '@/helpers/useServiceValue';
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
                    await window.service.native.open(LANGUAGE_MODEL_FOLDER, true);
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
                {Object.keys(preference.languageModel.defaultModel).map(key => (
                  <TextField
                    fullWidth
                    key={key}
                    label={key}
                    onChange={async (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
                      await window.service.preference.set('languageModel', {
                        ...preference.languageModel,
                        defaultModel: {
                          ...preference.languageModel.defaultModel,
                          [key]: event.target.value,
                        },
                      });
                    }}
                    value={preference.languageModel.defaultModel[key as keyof typeof preference.languageModel.defaultModel]}
                  />
                ))}
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
