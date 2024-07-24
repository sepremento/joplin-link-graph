import * as d3 from "d3";
import * as userInput from "./user-input.js"


var width = window.innerWidth;
var height = window.innerHeight;
var margin = { top: 10, right: 10, bottom: 10, left: 10 };


// first functions are for communication with the plugin

function poll() {
  webviewApi.postMessage({
    name: "poll"
  }).then((event) => {
    //console.log('Received event: ', event.name);
    if (event.name === "initialGraph") { graph.update(event.data); }
    if (event.name === "noteSelectionChange") { graph.update(event.data); }
    if (event.name === "settingsChange") { graph.update(event.data); }
    if (event.name === "noteChange:title") { updateTitle(event.resp) }
    if (event.name === "noteChange:links") { graph.update(event.data) }
    poll();
  });
}

function update() {
  webviewApi.postMessage({
    name: "update"
  }).then((event) => {
    if (event.data) {
      graph.update(event.data);
    }
  });
}

function processUserQuery(query) {
  webviewApi.postMessage({
    name: "search-query",
    query: query 
  }).then((event) => {
    if (event.data) {
      graph.update(event.data);
    }
  });
}

function getNoteTags(noteId) {
  return webviewApi.postMessage({
    name: "get_note_tags",
    id: noteId
  });
}

function openNote(event, i) {
  if (event.ctrlKey) {
    webviewApi.postMessage({
      name: "navigateTo",
      id: i.id
    });
  }
}

function setMaxDistanceSetting(newVal) {
  // will automically trigger ui update of graph
  return webviewApi.postMessage({
    name: "set_setting",
    key: "MAX_TREE_DEPTH",
    value: newVal,
  });
}

function getMaxDistanceSetting() {
  return webviewApi.postMessage({
    name: "get_setting",
    key: "MAX_TREE_DEPTH"
  })
}

// next graph functions

function hoverNode(d, hovered) {
  const hoveredNotesIds = new Set();
  const linkSelector = `line[from="${d.id}"],line[to="${d.id}"]`

  d3.select(`circle[note_id="${d.id}"]`).classed('hovered', hovered);
  d3.selectAll(linkSelector)
    .each((d, i, nodes) => {
      hoveredNotesIds.add(nodes[i].getAttribute("from"));
      hoveredNotesIds.add(nodes[i].getAttribute("to"));
    })
    .classed('highlighted', hovered);
  for (const id of hoveredNotesIds) {
    d3.select(`circle[note_id="${id}"]`).classed('highlighted', hovered);
    d3.select(`text[note_id="${id}"]`).classed('highlighted', hovered);
  };

  return showTooltip(d, hovered)
}

async function showTooltip(d, hovered) {
  const tooltip = d3.select('.tooltip');

  if (!hovered) {
    tooltip.classed("hidden", true);
    return;
  }

  const hoveredBefore = d3.select("circle.hovered").node();
  const tags = await getNoteTags(d.id);
  const hoveredAfter = d3.select("circle.hovered").node();

  // If we hovered something different in the meanwhile, don't show tooltip
  if (hoveredAfter !== hoveredBefore) return;
  if (tags.length === 0) return;

  const rect = d3
    .select("circle.hovered")
    .node()
    .getBoundingClientRect();

  tooltip.classed("hidden", false);

  tooltip.html(
    tags.map(({id, title}) => `<div class="node-hover-tag">${title}</div>`)
    .join(" ")
  );

  // center tooltip text at bottom of circle
  // (Note: CSS tranform translate does not work with flex:wrap)
  const leftPos = window.pageXOffset + rect.x + rect.width / 2 -
    tooltip.node().getBoundingClientRect().width / 2;

  tooltip
    .style("left", `${leftPos >= 0 ? leftPos : 0}px`)
    .style("top", `${window.pageYOffset + rect.y + rect.height}px`);
}

function chart() {
  const color = d3.scaleOrdinal(d3.schemeTableau10)

  // if tooltip div exists then select it otherwise create it
  const tooltip = (
    d3.select("#joplin-plugin-content > div.tooltip").node()
    ? d3.select('div.tooltip')
    : d3.select('#joplin-plugin-content')
    .append("div")
    .classed("tooltip", true)
  ).classed("hidden", true);

  const svg = d3.select("#note_graph")
    .append("svg")
    .attr("width", width)
    .attr("height", height)
    .attr("viewBox", [-width / 2, -height / 2, width, height])
    .append("g");

  svg
    .append("marker")
    .attr("id", "arrow")
    .attr("viewBox", "0 -5 10 10")
    .attr("refX", 20)
    .attr("refY", 0)
    .attr("markerWidth", 15)
    .attr("markerHeight", 15)
    .attr("markerUnits", "userSpaceOnUse")
    .attr("orient", "auto")
    .style("fill", "#999")
    .append("svg:path")
    .attr("d", "M0,-3L10,0L0,3");

  const simulation = d3.forceSimulation()
    .force("charge", d3.forceManyBody().strength(20))
    .force("center", d3.forceCenter())
    .force("link", d3.forceLink().id(d => d.id).distance(200))
    .force("nocollide", d3.forceCollide(48))
    .on("tick", ticked);

  let link = svg.append("g")
    .selectAll("line.edge");

  let node = svg.append("g")
    .selectAll("circle.node");

  let nodeLabels = svg.append("g")
      .attr("fill", "#000")
    .selectAll("text");

  let legend = d3.select('#legend')
    .selectAll("div.folder")

  function ticked() {
    node.attr("cx", d => d.x)
        .attr("cy", d => d.y)

    nodeLabels
      .attr("x", d => d.x + 20)
      .attr("y", d => d.y + 5)

    link.attr("x1", d => d.source.x)
        .attr("y1", d => d.source.y)
        .attr("x2", d => d.target.x)
        .attr("y2", d => d.target.y);
  }

  const zoom_handler = d3.zoom()
    .scaleExtent([0.1, 10])
    .on("zoom", (ev) => zoomActions(svg, ev));

  zoom_handler(d3.select("svg"));

  function dragStart(ev) {
    if (!event.active) simulation.alphaTarget(0.3).restart();
    ev.subject.fx = ev.subject.x;
    ev.subject.fy = ev.subject.y;
  }

  function drag(ev) {
    ev.subject.fx = ev.x;
    ev.subject.fy = ev.y;
  }

  function dragEnd(ev) {
    if (!ev.active) simulation.alphaTarget(0);
    ev.subject.fx = null;
    ev.subject.fy = null;
  }

  function zoomActions(svg, event) {
    svg.attr("transform", event.transform);
  }

  return Object.assign(svg.node(), {
    update(data) {

      const old = new Map(node.data().map(d => [d.id, d]));
      const nodes = data.nodes.map(d => Object.assign(old.get(d.id) || {}, d));
      const links = data.edges.map(d => Object.assign({}, d));

      const parents = new Array(data.nodes.length);
      for (let i=0; i<nodes.length; ++i) { parents[i] = nodes[i].parent_id; }
      const folders = distinct(parents);

      simulation.nodes(nodes);
      simulation
        .force("link")
        .links(links)
        .distance(data.graphSettings.linkDistance)
        .strength(data.graphSettings.linkStrength / 100);
      simulation.force("charge").strength(data.graphSettings.chargeStrength);
      simulation.force("center").strength(data.graphSettings.centerStrength /100);
      simulation.force("nocollide").radius(data.graphSettings.collideRadius);
      simulation.alpha(0.6).restart();

      node = node
        .data(nodes, d => d.id)
        .join(enter => enter.append("circle")
          .attr("note_id", d => d.id)
          .attr("r", d => { return 10 + 8 * Math.log10(d.totalLinks + 1); })
          .classed("node", true)
          .on("click", (ev, i) => openNote(ev, i)) 
          .on("mouseover", (_, i) => hoverNode(i, true))
          .on("mouseout", (_, i) => hoverNode(i, false))
          .call(
            d3
            .drag()
            .on("start", dragStart)
            .on("drag", drag)
            .on("end", dragEnd)
          )
        )
        .attr("fill", d => color(d.parent_id))
        .classed('current-note', (d) => data.spanningTree.includes(d.id))

      link = link
        .data(links, d => `${d.source.id}\t${d.target.id}`)
        .join("line")
        .attr("from", d => d.source.id)
        .attr("to", d => d.target.id)
        .attr("marker-end", "url(#arrow)")
        .classed("edge", true)
        .classed("adjacent-line", (d) => d.focused);

      // assign inward-link classes for backlinks
      if (data.graphSettings.isSelectionBased) {
        link.attr("class", (d, i, nodes) => {
          const sourceDist = d.sourceDistanceToCurrentNode;
          const targetDist = d.targetDistanceToCurrentNode;
          const inwardLink = sourceDist > targetDist;
          const classes = [
            ...nodes[i].classList,
            ...(inwardLink ? ['inward-link'] : []),
          ]
          return classes.join(" ");
        });
      }
      nodeLabels = nodeLabels
        .data(nodes, d => d.id)
        .join("text")
        .attr("class", "node-label")
        .attr("note_id", d => d.id)
        .attr("fill", d => color(d.parent_id))
        .attr("font-size", d => { return 10 + 6 * Math.log10(d.totalLinks + 1) + "px"; })
        .text(d => d.title)
        .call(wrap, 200)
        .attr("x", 0)
        .attr("y", 15);

      legend = legend
        .data(folders, d => d)
        .join("div")
        .style("color", d => color(d))
        .text(d => d);
    }
  });
}

function wrap(text, width) {
  text.each(function () {
    var text = d3.select(this),
      words = text.text().split(/\s+/).reverse(),
      word, line = [], len, prevLen = 0,
      tspan = text.text(null)
      .append("tspan")
    while (word = words.pop()) {
      line.push(word);
      tspan.text(line.join(" "));
      len = tspan.node().getComputedTextLength()
      if (len > width) {
        line.pop();
        tspan.text(line.join(" "));
        line = [word];
        tspan = text.append("tspan")
          .attr("dx", -prevLen)
          .attr("dy", "1.15em")
          .text(word);
      }
      prevLen = len;
    }
  });
}

function updateTitle(data) {
  d3.select(`text.node-label[note_id="${data.noteId}"]`)
    .text(data.newTitle)
    .call(wrap, 200);
}

function distinct( arr ) {
  var j = {};
  for (let v of arr) { j[v] = v; };
  const result = new Array(Object.keys(j).length);
  for (let i=0; i < result.length; ++i) { result[i] = Object.keys(j)[i]; }
  return result
} 

var graph = chart();

userInput.initQueryInput(processUserQuery);

getMaxDistanceSetting().then((v) => {
  // todo: shorten up, when top-level await available
  userInput.init(v, setMaxDistanceSetting, update);
  update();
});

poll();

