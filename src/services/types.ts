export interface IService {
  init?: (...parameters: never[]) => Promise<void>;
}

export enum SupportedStorageServices {
  /** High availability git service without storage limit, but is blocked by GFW in China somehow */
  github,
  /** SocialLinkedData, a privacy first DApp platform leading by Tim Berners-Lee, you can run a server by you own  */
  solid,
  /** China's Collaboration platform for software development & code hosting,
   * with some official background, very secure in China, but have 500M storage limit */
  gitee,
}

export interface IAuthingResponse {
  session?: null | { appId: string; type: string; userId: string };
  userInfo?: {
    thirdPartyIdentity?: {
      accessToken?: string;
    };
    oauth?: string;
  };
  urlParams?: {
    code: string; // 这些参数是从 url 中获取到的，需要开发者自己存储以备使用
    id_token: string;
    access_token: string;
  };
}

// {"email":"linonetwo012@gmail.com","phone":"","emailVerified":false,"phoneVerified":false,"username":"lin onetwo","nickname":"","company":"ByteDance","photo":"https://avatars1.githubusercontent.com/u/3746270?v=4","browser":"","device":"","loginsCount":26,"registerMethod":"oauth:github","blocked":false,"isDeleted":false,"phoneCode":"","name":"lin onetwo","givenName":"","familyName":"","middleName":"","profile":"","preferredUsername":"","website":"","gender":"","birthdate":"","zoneinfo":"","locale":"","address":"","formatted":"","streetAddress":"","locality":"","region":"","postalCode":"","country":"","updatedAt":"2020-07-04T05:08:53.472Z","metadata":"","_operate_history":[],"sendSMSCount":0,"sendSMSLimitCount":1000,"_id":"5efdd5475b9f7bc0990d7377","unionid":"3746270","lastIP":"61.223.86.45","registerInClient":"5efdd30d48432dfae5d047da","lastLogin":"2020-07-04T05:08:53.665Z","signedUp":"2020-07-02T12:38:31.485Z","__v":0,"token":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJkYXRhIjp7ImVtYWlsIjoibGlub2","tokenExpiredAt":"2020-07-19T05:08:53.000Z","__Token 验证方式说明":"https://docs.authing.cn/authing/advanced/authentication/verify-jwt-token#fa-song-token-gei-authing-fu-wu-qi-yan-zheng","login":"linonetwo","id":3746270,"node_id":"MDQ6VXNlcjM3NDYyNzA=","avatar_url":"https://avatars1.githubusercontent.com/u/3746270?v=4","gravatar_id":"","url":"https://api.github.com/users/linonetwo","html_url":"https://github.com/linonetwo","followers_url":"https://api.github.com/users/linonetwo/followers","following_url":"https://api.github.com/users/linonetwo/following{/other_user}","gists_url":"https://api.github.com/users/linonetwo/gists{/gist_id}","starred_url":"https://api.github.com/users/linonetwo/starred{/owner}{/repo}","subscriptions_url":"https://api.github.com/users/linonetwo/subscriptions","organizations_url":"https://api.github.com/users/linonetwo/orgs","repos_url":"https://api.github.com/users/linonetwo/repos","events_url":"https://api.github.com/users/linonetwo/events{/privacy}","received_events_url":"https://api.github.com/users/linonetwo/received_events","type":"User","site_admin":false,"blog":"https://onetwo.ren","location":"Shanghaitech University","hireable":null,"bio":"Use Web technology to create dev-tool and knowledge tools for procedural content generation. Hopefully will create a knowledge-driven PCG in game cosmos one day","twitter_username":null,"public_repos":146,"public_gists":13,"followers":167,"following":120,"created_at":"2013-03-02T07:09:13Z","updated_at":"2020-07-02T12:36:46Z","accessToken":"f5610134da3c51632e43e8a2413863987e8ad16e","scope":"repo","provider":"github","expiresIn":null}
export interface IAuthingUserInfo {
  email: string;
  phone: string;
  emailVerified: boolean;
  phoneVerified: boolean;
  username: string;
  nickname: string;
  company: string;
  photo: string;
  browser: string;
  device: string;
  loginsCount: number;
  registerMethod: string;
  blocked: boolean;
  isDeleted: boolean;
  phoneCode: string;
  name: string;
  givenName: string;
  familyName: string;
  middleName: string;
  profile: string;
  preferredUsername: string;
  website: string;
  gender: string;
  birthdate: string;
  zoneinfo: string;
  locale: string;
  address: string;
  formatted: string;
  streetAddress: string;
  locality: string;
  region: string;
  postalCode: string;
  country: string;
  updatedAt: string;
  metadata: string;
  _operate_history: any[];
  sendSMSCount: number;
  sendSMSLimitCount: number;
  _id: string;
  unionid: string;
  lastIP: string;
  registerInClient: string;
  lastLogin: string;
  signedUp: string;
  __v: number;
  token: string;
  tokenExpiredAt: string;
  '__Token 验证方式说明': string;
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
  blog: string;
  location: string;
  hireable: null;
  bio: string;
  twitter_username: null;
  public_repos: number;
  public_gists: number;
  followers: number;
  following: number;
  created_at: string;
  updated_at: string;
  accessToken: string;
  scope: string;
  provider: string;
  expiresIn: null;
}
