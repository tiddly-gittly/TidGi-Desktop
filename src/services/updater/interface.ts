/* eslint-disable typescript-sort-keys/interface */
import { UpdaterChannel } from '@/constants/channels';
import { ProxyPropertyType } from 'electron-ipc-cat/common';
import { BehaviorSubject } from 'rxjs';

export enum IUpdaterStatus {
  checkUpdate = 'CheckUpdate',
  checkingFailed = 'CheckingFailed',
  checkingForUpdate = 'CheckingForUpdate',
  downloadProgress = 'DownloadProgress',
  updateAvailable = 'UpdateAvailable',
  updateCancelled = 'UpdateCancelled',
  updateDownloaded = 'UpdateDownloaded',
  updateError = 'UpdateError',
  updateNotAvailable = 'UpdateNotAvailable',
}
export interface IUpdaterMetaData {
  status?: IUpdaterStatus;
  info?: {
    version?: string;
    latestReleasePageUrl?: string;
    errorMessage?: string;
  };
}
export interface IUpdaterService {
  checkForUpdates(): Promise<void>;
  updaterMetaData$: BehaviorSubject<IUpdaterMetaData>;
}
export const UpdaterServiceIPCDescriptor = {
  channel: UpdaterChannel.name,
  properties: {
    updaterMetaData$: ProxyPropertyType.Value$,
    checkForUpdates: ProxyPropertyType.Function,
  },
};

export interface IGithubReleaseData {
  url: string;
  assets_url: string;
  upload_url: string;
  html_url: string;
  id: number;
  author: IGithubReleaseDataAuthor;
  node_id: string;
  tag_name: string;
  target_commitish: string;
  name: string;
  draft: boolean;
  prerelease: boolean;
  created_at: string;
  published_at: string;
  assets: IGithubReleaseDataAsset[];
  tarball_url: string;
  zipball_url: string;
  body: string;
}

export interface IGithubReleaseDataAuthor {
  login: string;
  id: number;
  node_id: string;
  avatar_url: string;
  gravatar_id: string;
  url: string;
  html_url: string;
  followers_url: string;
  following_url: string;
  gists_url: string;
  starred_url: string;
  subscriptions_url: string;
  organizations_url: string;
  repos_url: string;
  events_url: string;
  received_events_url: string;
  type: string;
  site_admin: boolean;
}

export interface IGithubReleaseDataAsset {
  url: string;
  id: number;
  node_id: string;
  name: string;
  label: string;
  uploader: IGithubReleaseDataUploader;
  content_type: string;
  state: string;
  size: number;
  download_count: number;
  created_at: string;
  updated_at: string;
  browser_download_url: string;
}

export interface IGithubReleaseDataUploader {
  login: string;
  id: number;
  node_id: string;
  avatar_url: string;
  gravatar_id: string;
  url: string;
  html_url: string;
  followers_url: string;
  following_url: string;
  gists_url: string;
  starred_url: string;
  subscriptions_url: string;
  organizations_url: string;
  repos_url: string;
  events_url: string;
  received_events_url: string;
  type: string;
  site_admin: boolean;
}
