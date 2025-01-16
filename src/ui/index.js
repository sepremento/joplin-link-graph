import * as d3 from "d3";
import * as userInput from "./user-input.js"

var width = window.innerWidth;
var height = window.innerHeight;
const centerX = width / 2;
const centerY = height / 2;


// first functions are for communication with the plugin

function poll(msg) {
    webviewApi.postMessage({
        name: "poll",
        msg: msg
    }).then((resp) => {
            if (resp.name === "initialGraph") graph.init(resp.data);
            if (resp.name === "pushSettings") graph.updateSettings(resp.data);
            if (resp.name === "noteChange:title") graph.updateNodeLabel(resp.resp); 
            if (resp.name === "noteChange:links" || resp.name === "noteSelectionChange")
                graph.updateGraph(resp.data);
            poll();
        });
}

function requestUpdate(query, degree) {
    webviewApi.postMessage({
        name: "request_update",
        query: query,
        degree: degree
    }).then((event) => {
            if (event.data) {
                graph.updateGraph(event.data);
                poll();
            }
        });
}

function setSetting(settingName, newVal) {
    // will automically trigger ui update of graph
    return webviewApi.postMessage({
        name: "set_setting",
        key: settingName,
        value: newVal,
    });
}

// next graph functions

function createGraph() {

    const canvas = d3.select('#note_graph')
    .append('canvas')
    .attr("width", width)
    .attr("height", height)
    .node();

    const context = canvas.getContext('2d');

    let graphNodes = [];
    let graphNodesMap = new Map();
    let graphLinks = [];
    let spanningTree = [];
    let graphSettings = {};

    let simulation;
    let transform;
    let timer;

    function dragstarted(event) {
        if (!event.active) simulation.alphaTarget(0.3).restart();
        event.subject.fx = event.subject.x;
        event.subject.fy = event.subject.y;
    };

    function dragged(event) {
        const [px, py] = d3.pointer(event, canvas);
        event.subject.fx = transform.invertX(px);
        event.subject.fy = transform.invertY(py);
    };

    function dragended(event) {
        if (!event.active) simulation.alphaTarget(0);
        event.subject.fx = null;
        event.subject.fy = null;
    };

    function drawNode(node) {
        const depth = node.distanceToCurrentNode
            ? node.distanceToCurrentNode
            : 0;
        const r = Math.max(10 - 3 * depth, 4);
        const maxLabelWidth = 150;
        context.beginPath();
        context.globalAlpha = 0.8;
        context.strokeStyle = "#999";
        context.fillStyle = "#999";
        context.lineWidth = 1.0;
        if (spanningTree.includes(node.id)) {
            context.fillStyle = "#595";
        }

        if (node.focused) {
            context.globalAlpha = 1;
            context.strokeStyle = "#595";
            context.fillStyle = "#595";
        }

        if (node.faded) {
            context.globalAlpha = 0.5;
            context.fillStyle = "#A0A0A0";
            context.strokeStyle = "#A0A0A0";
        }
        context.moveTo(node.x + r, node.y);
        context.arc(node.x, node.y, r, 0, 2 * Math.PI);
        context.fill();
        if (transform.k >= 0.7) {
            wrapNodeText(context, node, r, maxLabelWidth);
        }
        context.stroke();
    };

    function drawLink(link) {
        context.beginPath();        
        context.globalAlpha = 0.1;
        context.strokeStyle = "#999";

        if (link.focused) {
            context.globalAlpha = 0.8;
        }

        if (link.faded) {
            context.globalAlpha = 0.05;
        }

        const x1 = link.source.x,
        x2 = link.target.x,
        y1 = link.source.y,
        y2 = link.target.y;
        const arrowLen = 10;
        const depth = link.target.distanceToCurrentNode
            ? link.target.distanceToCurrentNode
            : 0;
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
    };

    function draw() {
        context.clearRect(0, 0, width, height);

        context.save();

        context.translate(transform.x, transform.y);
        context.scale(transform.k, transform.k);

        graphLinks.forEach(drawLink);


        const postponedNodes = [];
        for (const d of graphNodes) {
            if (d.focused) { 
                postponedNodes.push(d);
                continue; 
            }
            drawNode(d);
        }
        postponedNodes.forEach(drawNode)

        context.restore();
    };

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
    };

    function highlightRegion(event) {
        clearTimeout(timer);
        timer = setTimeout(() => {
            const node = findNode(event, graphNodes);
            if (!node) {
                for (let link of graphLinks) {
                    link.focused = false;
                    link.faded = false;
                }
                for (let node of graphNodes) {
                    node.focused = false;
                    node.faded = false;
                }
            } else {
                const adjacentNodes = [];
                for (let link of graphLinks) {
                    if (link.source.id === node.id || link.target.id === node.id) {
                        link.faded = false;
                        link.focused = true;
                        adjacentNodes.push(link.target.id);
                        adjacentNodes.push(link.source.id);
                    } else {
                        link.faded = true;
                        link.focused = false;
                    }
                }
                for (let n of graphNodes) {
                    if (adjacentNodes.includes(n.id)) {
                        n.faded = false;
                        n.focused = true;
                    } else {
                        n.faded = true;
                        n.focused = false;
                    }
                }
            }

            simulation.nodes(graphNodes);
            simulation.force("link").links(graphLinks);
            draw();
        }, 85)
    };

    function initSimulation() {
        const r = graphSettings.radiusScale * Math.min(centerX, centerY) / 100;
        return d3.forceSimulation(graphNodes)
            .force("link", d3.forceLink(graphLinks)
                .id(d => d.id)
                .distance(graphSettings.linkDistance)
                .strength(graphSettings.linkStrength / 100)
            )
            .force("circle", d3.forceRadial(r, centerX, centerY))
            .force("charge", d3.forceManyBody()
                .strength(graphSettings.chargeStrength)
            )
            .force("center", d3.forceCenter(centerX, centerY)
                .strength(graphSettings.centerStrength / 100)
            )
            .force("nocollide", d3.forceCollide(48)
                .radius(graphSettings.collideRadius)
            )
            .alpha(graphSettings.alpha / 100)
            .on("tick", draw);
    };

    function openNote(event) {
        const node = findNode(event, graphNodes);
        if (event.ctrlKey) {
            webviewApi.postMessage({
                name: "open_note",
                id: node.id
            });
        }
    };

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

    function zoomed(event) {
        transform = event.transform;
        draw();
    }

    return Object.assign(canvas, {

        init(data) {

            graphNodes = data.nodes;
            graphLinks = data.edges;
            graphSettings = data.graphSettings;
            spanningTree = data.spanningTree;

            userInput.initFront(graphSettings, setSetting, requestUpdate);

            for (let node of graphNodes) graphNodesMap.set(node.id, node);

            transform = d3.zoomIdentity;
            simulation = initSimulation();

            d3.select(canvas)
                .on('mousemove', highlightRegion)
                .on('click', openNote)
                .call(d3.drag()
                    .subject(event => findNode(event, graphNodes))
                    .on("start", dragstarted)
                    .on("drag", dragged)
                    .on("end", dragended))
                .call(d3.zoom()
                    .scaleExtent([1/10, 8])
                    .on('zoom', zoomed));
        },

        updateGraph(data) {
            graphNodes = data.nodes.map(d => {
                if (!graphNodesMap.has(d.id)) graphNodesMap.set(d.id, d);
                return Object.assign(graphNodesMap.get(d.id) || {}, d);
            }); 
            graphLinks = data.edges;
            spanningTree = data.spanningTree;

            if (!simulation) simulation = initSimulation();

            simulation.nodes(graphNodes);
            simulation.force("link").links(graphLinks);
            simulation.alpha(graphSettings.alpha / 100).restart();
        },

        updateNodeLabel(data) {
            const node = graphNodes.find((n) => n.id === data.noteId);
            node.title = data.newTitle;

            if (transform.k > 0.7) draw();
        },

        updateSettings(data) {
            graphSettings = Object.assign(graphSettings, data.graphSettings);
            userInput.setupGraphHandle(graphSettings);

            const r = graphSettings.radiusScale * Math.min(centerX, centerY) / 100;
            simulation.force("link")
                .distance(graphSettings.linkDistance)
                .strength(graphSettings.linkStrength / 100);
            simulation.force("circle").radius(r);
            simulation.force("charge").strength(graphSettings.chargeStrength);
            simulation.force("center").strength(graphSettings.centerStrength / 100);
            simulation.force("nocollide").radius(graphSettings.collideRadius);

            simulation.alpha(graphSettings.alpha / 100);
            simulation.restart();
        },
    });
}

var graph = createGraph();

poll("init");

