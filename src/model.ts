export interface Edge {
  source: string;
  target: string;
  sourceDistanceToCurrentNode?: number;
  targetDistanceToCurrentNode?: number;
  focused: boolean;
}

export interface Node {
  id: string;
  title: string;
  parent_id: string;
  focused: boolean;
  totalLinks: number;
  distanceToCurrentNode?: number;
}

export interface GraphData {
  nodes: Node[];
  edges: Edge[];
  spanningTree: Array<string>;
  showLinkDirection: boolean;
  graphIsSelectionBased: boolean; // maxDegree > 0
}

