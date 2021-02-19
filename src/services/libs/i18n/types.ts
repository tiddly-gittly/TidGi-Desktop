export interface IReadFileRequest {
  filename: string;
  key: string;
}
export interface IWriteFileRequest {
  filename: string;
  data: string;
  keys: string[];
}
export interface IReadWriteFileRequest extends IReadFileRequest, IWriteFileRequest {}
