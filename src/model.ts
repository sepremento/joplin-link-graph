export interface JoplinNote {
    id: string;
    parent_id: string;
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
  parent_id: string;
  color?: string;
  is_tag: boolean;
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
