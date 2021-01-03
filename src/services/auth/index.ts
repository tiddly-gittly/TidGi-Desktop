import { injectable } from 'inversify';
import settings from 'electron-settings';

const defaultUserInfos = {
  userName: 'TiddlyGit User',
  
}

/**
 * Handle login to Github GitLab Coding.net
 */
@injectable()
export class Authentication {

}