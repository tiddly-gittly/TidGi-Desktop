/* eslint-disable @typescript-eslint/strict-boolean-expressions */
import React from 'react';
import { useTranslation } from 'react-i18next';

import { SupportedStorageServices } from '@services/types';

import SearchGithubRepo from '@/components/StorageService/SearchGithubRepo';
import { CreateContainer, LocationPickerContainer, LocationPickerInput } from './FormComponents';

export function GitRepoUrlForm({
  storageProvider,
  gitRepoUrl,
  gitRepoUrlSetter,
  wikiFolderNameSetter,
  isCreateMainWorkspace,
  error,
}: {
  error?: boolean;
  gitRepoUrl: string;
  gitRepoUrlSetter: (nextUrl: string) => void;
  isCreateMainWorkspace: boolean;
  storageProvider?: SupportedStorageServices;
  wikiFolderNameSetter?: (nextName: string) => void;
}): JSX.Element {
  const { t } = useTranslation();
  return (
    <CreateContainer elevation={2} square>
      <LocationPickerContainer>
        <LocationPickerInput
          error={error}
          onChange={(event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
            gitRepoUrlSetter(event.target.value);
          }}
          label={t('AddWorkspace.GitRepoUrl')}
          value={gitRepoUrl}
        />
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
