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
    if (event.name === "initialGraph") { graph.update(event.data); }
    if (event.name === "noteSelectionChange") { graph.update(event.data); }
    if (event.name === "settingsChange") { graph.update(event.data); }
    if (event.name === "noteChange:title") { graph.update(event.resp) }
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

async function showTooltip(node) {
    const tooltip = d3.select('.tooltip');

    if (node === undefined) {
        tooltip.classed("hidden", true);
        return;
    }

    const tags = await getNoteTags(node.id);

    if (tags.length === 0) {
        tooltip.classed("hidden", true);
        return;
    }

    tooltip.classed("hidden", false);
    tooltip.html(
        tags.map(({id, title}) => `<div class="node-hover-tag">${title}</div>`)
            .join(" ")
    );
    const leftPos = node.px - tooltip.node().getBoundingClientRect().width / 2;
    tooltip
        .style("left", `${leftPos >= 0 ? leftPos : 0}px`)
        .style("top", `${node.py + 9}px`);
}

function chart() {
    const color = d3.scaleOrdinal(d3.schemeTableau10);

    // if tooltip div exists then select it otherwise create it
    const tooltip = (
        d3.select("#joplin-plugin-content > div.tooltip").node()
            ? d3.select('div.tooltip')
            : d3.select('#joplin-plugin-content')
            .append("div")
            .classed("tooltip", true)
    ).classed("hidden", true);

    const canvas = d3.select('#note_graph')
    .append('canvas')
    .attr("width", width)
    .attr("height", height)
    .node();

    const context = canvas.getContext('2d');

    let legend = d3.select('#legend')
        .selectAll("div.folder")

    let oldNodes = new Map();
    let oldLinks = [];
    let oldSpanningTree = [];
    let oldGraphSettings = {};

    return Object.assign(canvas, {

        update(data) {
            let nodes, links
            if (data.updateType === "updateNodeTitle") {
                const updatedNode = oldNodes.get(data.noteId);
                if (updatedNode) { updatedNode.title = data.newTitle; }

                nodes = Array.from(oldNodes.values());
                links = oldLinks;
                data.graphSettings = oldGraphSettings;
                data.spanningTree = oldSpanningTree;
            } else {
                nodes = data.nodes.map(d => Object.assign(oldNodes.get(d.id) || {}, d));
                links = data.edges.map(d => Object.assign({}, d));

                oldNodes = new Map(nodes.map(d => [d.id, d]));
                oldLinks = links;
                oldGraphSettings = Object.assign(oldGraphSettings, data.graphSettings);
                oldSpanningTree = data.spanningTree;
            }

            const simulation = d3.forceSimulation(nodes)
            .force("link", d3.forceLink(links)
                .id(d => d.id)
                .distance(data.graphSettings.linkDistance)
                .strength(data.graphSettings.linkStrength / 100)
            )
            .force("charge", d3.forceManyBody()
                .strength(data.graphSettings.chargeStrength)
            )
            .force("center", d3.forceCenter(width / 2, height / 2)
                .strength(data.graphSettings.centerStrength / 100)
            )
            .force("nocollide", d3.forceCollide(48)
                .radius(data.graphSettings.collideRadius)
            )
            .on("tick", draw);

            let transform = d3.zoomIdentity;

            let timer;

            function showInfo(event) {
                clearTimeout(timer);
                timer = setTimeout(mouseStopped, 300, event)
            }

            function clickOpenNote(event) {
                const node = findNode(event, nodes);
                openNote(event, node)
            }
            
            function draw() {
                context.clearRect(0, 0, width, height);

                context.save();
                context.translate(transform.x, transform.y);
                context.scale(transform.k, transform.k);
                context.globalAlpha = 0.6;
                context.strokeStyle = "#999";
                context.beginPath();        
                links.forEach(drawLink);
                context.stroke();

                context.globalAlpha = 1;
                nodes.forEach(node => {
                    context.beginPath();
                    drawNode(node)
                    context.stroke();
                });
                context.restore();
            }

            function drawLink(d) {
                // Возможный вариант оформления обратных ссылок
                // const sourceDist = d.sourceDistanceToCurrentNode;
                // const targetDist = d.targetDistanceToCurrentNode;
                // const inwardLink = sourceDist > targetDist;
                // if (inwardLink) { }
                context.moveTo(d.source.x, d.source.y);
                context.lineTo(d.target.x, d.target.y);
            }

            function drawNode(d) {
                context.strokeStyle = "#999";
                if (data.spanningTree.includes(d.id)) {
                    context.strokeStyle = "#fff";
                }
                context.fillStyle = color(d.folder);
                context.moveTo(d.x + 8, d.y);
                context.arc(d.x, d.y, 8, 0, 2 * Math.PI);
                context.fill();
                wrapNodeText(context, d, 200)
            }

            function findNode(event, nodes) {
                const [px, py] = d3.pointer(event, canvas);
                const xi = transform.invertX(px);
                const yi = transform.invertY(py);
                const node = d3.least(nodes, ({x, y}) => {
                    const dist2 = (x - xi) ** 2 + (y - yi) ** 2;
                    if (dist2 < 400) return dist2;
                });
                if (node !== undefined) {
                    node.px = px;
                    node.py = py;
                }
                return node;
            }

            function mouseStopped(event) {
                const node = findNode(event, nodes);
                showTooltip(node);
            }

            d3.select(canvas)
                .on('mousemove', showInfo)
                .on('click', clickOpenNote)
                .call(d3.drag()
                    .subject(event => findNode(event, nodes))
                    .on("start", dragstarted)
                    .on("drag", dragged)
                    .on("end", dragended))
                .call(d3.zoom()
                    .scaleExtent([1/10, 8])
                    .on('zoom', zoomed));

            function dragstarted(event) {
                if (!event.active) simulation.alphaTarget(0.3).restart();
                event.subject.fx = event.subject.x;
                event.subject.fy = event.subject.y;
            }

            function dragged(event) {
                event.subject.fx = event.x;
                event.subject.fy = event.y;
            }

            function dragended(event) {
                if (!event.active) simulation.alphaTarget(0);
                event.subject.fx = null;
                event.subject.fy = null;
            }

            function zoomed(event) {
                transform = event.transform;
                draw();
            }

            const parents = new Array(nodes.length);
            for (let i=0; i<nodes.length; ++i) { parents[i] = nodes[i].folder; }
            const folders = distinct(parents);

            legend = legend
                .data(folders, d => d)
                .join("div")
                .classed('folder', true)
                .style("color", d => color(d))
                .text(d => d)
        }
    });
}

function wrapNodeText(context, d, width) {
    var text = d.title, lineHeight = 16,
    words = text.split(/\s+/).reverse(),
    word, line = [], len, N = 0

    while (word = words.pop()) {
        line.push(word);
        len = context.measureText(line.join(" ")).width;
        if (len > width) {
            line.pop();
            context.fillText(line.join(" "), d.x + 9, d.y + N * lineHeight);
            N += 1;
            line = [word]
            len = context.measureText(line.join(" ")).width;
        }
    }
    context.fillText(line.join(" "), d.x + 9, d.y + N * lineHeight);
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

