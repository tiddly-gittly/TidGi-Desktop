export interface IReadFileRequest {
  filename: string;
  key: string;
}
export interface IWriteFileRequest {
  data: string;
  filename: string;
  keys: string[];
}
export interface IReadWriteFileRequest extends IReadFileRequest, IWriteFileRequest {}
