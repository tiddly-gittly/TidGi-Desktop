/* eslint-disable @typescript-eslint/strict-boolean-expressions */
import React from 'react';
import { useTranslation } from 'react-i18next';

import { SupportedStorageServices } from '@services/types';

import SearchGithubRepo from '@/components/StorageService/SearchGithubRepo';
import { CreateContainer, LocationPickerContainer, LocationPickerInput } from './FormComponents';
import type { IWikiWorkspaceFormProps } from './useForm';

export function GitRepoUrlForm({
  form,
  isCreateMainWorkspace,
  error,
}: IWikiWorkspaceFormProps & { isCreateMainWorkspace: boolean; error?: boolean }): JSX.Element {
  const { t } = useTranslation();
  const { storageProvider, gitRepoUrl, gitRepoUrlSetter, wikiFolderNameSetter } = form;
  return (
    <CreateContainer elevation={2} square>
      <LocationPickerContainer>
        <LocationPickerInput error={error} onChange={(event) => gitRepoUrlSetter(event.target.value)} label={t('AddWorkspace.GitRepoUrl')} value={gitRepoUrl} />
      </LocationPickerContainer>
      {storageProvider === SupportedStorageServices.github && (
        <SearchGithubRepo
          githubWikiUrl={gitRepoUrl}
          githubWikiUrlSetter={gitRepoUrlSetter}
          isCreateMainWorkspace={isCreateMainWorkspace}
          wikiFolderNameSetter={wikiFolderNameSetter}
        />
      )}
    </CreateContainer>
  );
}
