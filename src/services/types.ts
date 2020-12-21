export interface IService {
  init?: (...parameters: never[]) => Promise<void>;
}
