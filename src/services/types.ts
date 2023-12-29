export interface IService {
  init?: (...parameters: never[]) => Promise<void>;
}

export enum SupportedStorageServices {
  /** China's Collaboration platform for software development & code hosting,
   * with some official background, very secure in China, but have 500M storage limit */
  gitee = 'gitee',
  /** High availability git service without storage limit, but is blocked by GFW in China somehow */
  github = 'github',
  /** Open source git service */
  gitlab = 'gitlab',
  local = 'local',
  /** SocialLinkedData, a privacy first DApp platform leading by Tim Berners-Lee, you can run a server by you own  */
  solid = 'solid',
}
