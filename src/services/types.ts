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

export interface IAuthingResponse {
  session?: null | { appId: string; type: string; userId: string };
  urlParams?: {
    access_token: string;
    code: string;
    // 这些参数是从 url 中获取到的，需要开发者自己存储以备使用
    id_token: string;
  };
  userInfo?: {
    oauth?: string;
    thirdPartyIdentity?: {
      accessToken?: string;
    };
  };
}

// {"email":"linonetwo012@gmail.com","phone":"","emailVerified":false,"phoneVerified":false,"username":"lin onetwo","nickname":"","company":"ByteDance","photo":"https://avatars1.githubusercontent.com/u/3746270?v=4","browser":"","device":"","loginsCount":26,"registerMethod":"oauth:github","blocked":false,"isDeleted":false,"phoneCode":"","name":"lin onetwo","givenName":"","familyName":"","middleName":"","profile":"","preferredUsername":"","website":"","gender":"","birthdate":"","zoneinfo":"","locale":"","address":"","formatted":"","streetAddress":"","locality":"","region":"","postalCode":"","country":"","updatedAt":"2020-07-04T05:08:53.472Z","metadata":"","_operate_history":[],"sendSMSCount":0,"sendSMSLimitCount":1000,"_id":"5efdd5475b9f7bc0990d7377","unionid":"3746270","lastIP":"61.223.86.45","registerInClient":"5efdd30d48432dfae5d047da","lastLogin":"2020-07-04T05:08:53.665Z","signedUp":"2020-07-02T12:38:31.485Z","__v":0,"token":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJkYXRhIjp7ImVtYWlsIjoibGlub2","tokenExpiredAt":"2020-07-19T05:08:53.000Z","__Token 验证方式说明":"https://docs.authing.cn/authing/advanced/authentication/verify-jwt-token#fa-song-token-gei-authing-fu-wu-qi-yan-zheng","login":"linonetwo","id":3746270,"node_id":"MDQ6VXNlcjM3NDYyNzA=","avatar_url":"https://avatars1.githubusercontent.com/u/3746270?v=4","gravatar_id":"","url":"https://api.github.com/users/linonetwo","html_url":"https://github.com/linonetwo","followers_url":"https://api.github.com/users/linonetwo/followers","following_url":"https://api.github.com/users/linonetwo/following{/other_user}","gists_url":"https://api.github.com/users/linonetwo/gists{/gist_id}","starred_url":"https://api.github.com/users/linonetwo/starred{/owner}{/repo}","subscriptions_url":"https://api.github.com/users/linonetwo/subscriptions","organizations_url":"https://api.github.com/users/linonetwo/orgs","repos_url":"https://api.github.com/users/linonetwo/repos","events_url":"https://api.github.com/users/linonetwo/events{/privacy}","received_events_url":"https://api.github.com/users/linonetwo/received_events","type":"User","site_admin":false,"blog":"https://onetwo.ren","location":"Shanghaitech University","hireable":null,"bio":"Use Web technology to create dev-tool and knowledge tools for procedural content generation. Hopefully will create a knowledge-driven PCG in game cosmos one day","twitter_username":null,"public_repos":146,"public_gists":13,"followers":167,"following":120,"created_at":"2013-03-02T07:09:13Z","updated_at":"2020-07-02T12:36:46Z","accessToken":"f5610134da3c51632e43e8a2413863987e8ad16e","scope":"repo","provider":"github","expiresIn":null}
export interface IAuthingUserInfo {
  '__Token 验证方式说明': string;
  __v: number;
  _id: string;
  _operate_history: any[];
  accessToken: string;
  address: string;
  avatar_url: string;
  bio: string;
  birthdate: string;
  blocked: boolean;
  blog: string;
  browser: string;
  company: string;
  country: string;
  created_at: string;
  device: string;
  email: string;
  emailVerified: boolean;
  events_url: string;
  expiresIn: null;
  familyName: string;
  followers: number;
  followers_url: string;
  following: number;
  following_url: string;
  formatted: string;
  gender: string;
  gists_url: string;
  givenName: string;
  gravatar_id: string;
  hireable: null;
  html_url: string;
  id: number;
  isDeleted: boolean;
  lastIP: string;
  lastLogin: string;
  locale: string;
  locality: string;
  location: string;
  login: string;
  loginsCount: number;
  metadata: string;
  middleName: string;
  name: string;
  nickname: string;
  node_id: string;
  organizations_url: string;
  phone: string;
  phoneCode: string;
  phoneVerified: boolean;
  photo: string;
  postalCode: string;
  preferredUsername: string;
  profile: string;
  provider: string;
  public_gists: number;
  public_repos: number;
  received_events_url: string;
  region: string;
  registerInClient: string;
  registerMethod: string;
  repos_url: string;
  scope: string;
  sendSMSCount: number;
  sendSMSLimitCount: number;
  signedUp: string;
  site_admin: boolean;
  starred_url: string;
  streetAddress: string;
  subscriptions_url: string;
  token: string;
  tokenExpiredAt: string;
  twitter_username: null;
  type: string;
  unionid: string;
  updatedAt: string;
  updated_at: string;
  url: string;
  username: string;
  website: string;
  zoneinfo: string;
}
