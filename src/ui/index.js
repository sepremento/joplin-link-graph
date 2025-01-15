import * as d3 from "d3";
import * as userInput from "./user-input.js"

var width = window.innerWidth;
var height = window.innerHeight;


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
  if (!query) { return; }
  webviewApi.postMessage({
    name: "search-query",
    query: query 
  }).then((event) => {
    if (event.data) {
      graph.update(event.data);
    }
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

function setSetting(settingName, newVal) {
  // will automically trigger ui update of graph
  return webviewApi.postMessage({
    name: "set_setting",
    key: settingName,
    value: newVal,
  });
}

function getSettings() {
  return webviewApi.postMessage({ name: "get_settings", })
}

// next graph functions

function chart() {

    const canvas = d3.select('#note_graph')
    .append('canvas')
    .attr("width", width)
    .attr("height", height)
    .node();

    const context = canvas.getContext('2d');

    let transform = d3.zoomIdentity;

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
            .alpha(data.graphSettings.alpha / 100)
            .on("tick", draw);

            let timer;

            function showInfo(event) {
                clearTimeout(timer);
                timer = setTimeout(mouseStopped, 150, event)
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
                links.forEach(drawLink);

                context.globalAlpha = 1;
                nodes.forEach(drawNode);
                context.restore();
            }

            function drawLink(d) {
                context.beginPath();        
                // Возможный вариант оформления обратных ссылок
                // const sourceDist = d.sourceDistanceToCurrentNode;
                // const targetDist = d.targetDistanceToCurrentNode;
                // const inwardLink = sourceDist > targetDist;
                // if (inwardLink) { }
                context.globalAlpha = 0.1;
                context.strokeStyle = "#999";

                if (d.focused) {
                    context.globalAlpha = 1;
                }

                const x1 = d.source.x,
                    x2 = d.target.x,
                    y1 = d.source.y,
                    y2 = d.target.y;
                const arrowLen = 10;
                // const offset = 8;
                const depth = d.target.distanceToCurrentNode ? d.target.distanceToCurrentNode : 0;
                const offset = Math.max(10 - 3 * depth, 4);
                const lineLength = Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
                const xa = x2 - (offset / lineLength) * (x2 - x1);
                const ya = y2 - (offset / lineLength) * (y2 - y1);
                const angle = Math.atan2(y2 - y1, x2 - x1);

                context.moveTo(x1, y1);
                context.lineTo(x2, y2);

                // Конечная точка стрелки
                context.moveTo(xa, ya);

                // Линия стрелки (левое крыло)
                context.lineTo(
                    xa - arrowLen * Math.cos(angle - Math.PI / 6),
                    ya - arrowLen * Math.sin(angle - Math.PI / 6)
                );

                // Линия стрелки (правое крыло)
                context.moveTo(xa, ya);
                context.lineTo(
                    xa - arrowLen * Math.cos(angle + Math.PI / 6),
                    ya - arrowLen * Math.sin(angle + Math.PI / 6)
                );
                context.stroke();
            }

            function drawNode(d) {
                const depth = d.distanceToCurrentNode ? d.distanceToCurrentNode : 0;
                const r = Math.max(10 - 3 * depth, 4);
                const maxLabelWidth = 150;
                context.beginPath();
                context.strokeStyle = "#999";
                context.fillStyle = "#999";
                context.lineWidth = 1.0;
                if (data.spanningTree.includes(d.id)) {
                    context.fillStyle = "#595";
                }

                if (d.focused) {
                    context.strokeStyle = "#595";
                    context.fillStyle = "#595";
                }
                context.moveTo(d.x + r, d.y);
                context.arc(d.x, d.y, r, 0, 2 * Math.PI);
                context.fill();
                if (transform.k >= 0.7) {
                    wrapNodeText(context, d, r, maxLabelWidth);
                }
                context.stroke();
            }

            function findNode(event, nodes) {
                const [px, py] = d3.pointer(event, canvas);
                const xi = transform.invertX(px);
                const yi = transform.invertY(py);
                const node = d3.least(nodes, ({x, y}) => {
                    const dist2 = (x - xi) ** 2 + (y - yi) ** 2;
                    if (dist2 < 400) return dist2;
                });
                if (node) {
                    node.px = px;
                    node.py = py;
                }
                return node;
            }

            function highlightSelectedNodeAndLinks(node) {
                const adjacentNodes = [];
                for (let link of links) {
                    link.focused = false;
                    if (node && (link.source.id === node.id || link.target.id === node.id)) {
                        link.focused = true;
                        adjacentNodes.push(link.target.id);
                    }
                }

                for (let n of nodes) {
                    n.focused = false;
                    if (node && adjacentNodes.includes(n.id)) {
                        n.focused = true;
                    }
                }

                simulation.nodes(nodes);
                simulation.force("link").links(links);
                draw();
            }

            function mouseStopped(event) {
                const node = findNode(event, nodes);
                highlightSelectedNodeAndLinks(node);
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
                const [px, py] = d3.pointer(event, canvas);
                event.subject.fx = transform.invertX(px);
                event.subject.fy = transform.invertY(py);
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
        }
    });
}

function wrapNodeText(context, d, r, width) {
    var text = d.title, lineHeight = 16,
    words = text.split(/\s+/).reverse(),
    word, line = [], len, N = 0,
    offset = (2 * r) + 4;

    while (word = words.pop()) {
        line.push(word);
        len = context.measureText(line.join(" ")).width;
        if (len > width) {
            line.pop();
            context.fillText(line.join(" "), d.x - width / 2, d.y + offset + N * lineHeight);
            N += 1;
            line = [word]
            len = context.measureText(line.join(" ")).width;
        }
    }
    context.fillText(line.join(" "), d.x - len / 2 , d.y + offset + N * lineHeight);
}

var graph = chart();

userInput.initQueryInput(processUserQuery);

getSettings().then((initialValues) => {
  // todo: shorten up, when top-level await available
  userInput.init(initialValues, setSetting, update);
  update();
});

poll();

