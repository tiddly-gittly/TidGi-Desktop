export interface IFbpGraphJSON {
  connections: Connection[];
  groups: Group[];
  id: string;
  inports: Inports;
  outports: Outports;
  processes: Processes;
  project: string;
  properties: Properties;
}

export interface Properties {
  environment: Environment;
  name: string;
}

export interface Environment {
  content: string;
  height: number;
  runtime: string;
  src: string;
  width: number;
}

export interface Inports {
  next: Next;
  prev: Previous;
}

export interface Previous {
  metadata?: Record<string, unknown>;
  port: string;
  process: string;
}

export interface Next {
  port: string;
  process: string;
}

export interface Outports {
  image: Image;
}

export interface Image {
  metadata?: Record<string, unknown>;
  port: string;
  process: string;
}

export interface Group {
  metadata?: Record<string, unknown>;
  name: string;
  nodes: string[];
}

export interface Processes {
  'dom/GetElement_f4nkd': DomGetElementF4nkd;
}

export interface DomGetElementF4nkd {
  component: string;
  metadata?: Record<string, unknown>;
}

export interface Connection {
  metadata?: Record<string, unknown>;
  src?: Source;
  tgt?: Tgt;
}

export interface Source {
  port: string;
  process: string;
}

export interface Tgt {
  port: string;
  process: string;
}
