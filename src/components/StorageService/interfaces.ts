export interface IGithubSearchRepoQuery {
  repositoryOwner: IGithubRepositoryOwner;
  search: IGithubSearch;
}

interface IGithubRepositoryOwner {
  id: string;
}

interface IGithubSearch {
  repositoryCount: number;
  edges: IGithubSearchEdge[];
}

interface IGithubSearchEdge {
  node: IGithubSearchNode;
}

export interface IGithubSearchNode {
  name: string;
  url: string;
}
