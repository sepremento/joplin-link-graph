export interface ColorGroup {
    filter: string,
    color: string
}

export interface JoplinNote {
    id: string;
    title: string;
    body: string;
}

export interface Edge {
  source: string;
  target: string;
  // sourceDistanceToCurrentNode?: number;
  // targetDistanceToCurrentNode?: number;
  // focused: boolean;
}

export interface Node {
    id: string;
    title: string;
    is_tag: boolean;
    color?: string;
    forwardlinks?: Set<string>;
    backlinks?: Array<string>;
    num_links: number;
    num_forwardlinks: number;
    num_backlinks: number;
    /**
   * (Minimal) distance of this note to current/selected note in Joplin
   * 0 => current note itself
   * 1 => directly adjacent note
   * x => ... and so on
   */
    distanceToCurrentNode?: number;
}

export interface DataSpec {
    degree: number;
    spanningTree?: string[];
    filterQuery?: string;
}

export interface GraphData {
  nodes: Node[];
  edges: Edge[];
  spanningTree: Array<string>;
  graphSettings: GraphSettings | {};
}

export interface GraphSettings {
  chargeStrength: number;
  collideRadius: number;
  linkDistance: number;
  linkStrength: number;
  alpha: number;
}

export interface PreprocessedFilter {
    query: string,
    min_links?: number,
    max_links?: number,
    min_forwardlinks?: number,
    max_forwardlinks?: number,
    min_backlinks?: number,
    max_backlinks?: number,
}
