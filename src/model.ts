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
  folder: string;
  is_tag: boolean;
  distanceToCurrentNode?: number;
}

export interface GraphData {
  nodes: Node[];
  edges: Edge[];
  spanningTree: Array<string>;
  graphSettings: GraphSettings | {};
}

export interface GraphSettings {
  chargeStrength: number;
  centerStrength: number;
  collideRadius: number;
  linkDistance: number;
  linkStrength: number;
  alpha: number;
}
