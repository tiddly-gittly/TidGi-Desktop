export interface IGithubSearchRepoQuery {
  repositoryOwner: IGithubRepositoryOwner;
  search: IGithubSearch;
}

interface IGithubRepositoryOwner {
  id: string;
}

interface IGithubSearch {
  edges: IGithubSearchEdge[];
  repositoryCount: number;
}

interface IGithubSearchEdge {
  node: IGithubSearchNode;
}

export interface IGithubSearchNode {
  name: string;
  url: string;
}
