import joplin from "api";
import * as joplinData from "./data";
import { registerSettings } from "./settings";
import { ColorGroup, DataSpec, GraphData } from "./model";
import { MenuItemLocation, ToolbarButtonLocation } from "api/types";
import { panelHtml } from "./panel-html";

let data: GraphData;
let nodeGroupMap = new Map();
let pollCb: any;
let modelChanges = [];
var prevNoteLinks = [];
var prevNoteTitle: string;
var prevSettings: any = {};
var syncOngoing = false;
const USER_INPUT = ["QUERY", "FILTER", "MAX_TREE_DEPTH", "SHOW_TAGS", "GROUPS", "INCLUDE_BACKLINKS"]


joplin.plugins.register({
    onStart: async function () {
        await registerSettings();
        const panels = joplin.views.panels;
        const graphPanel = await (panels as any).create("note-graph-view");

        await registerShowHideCommand(graphPanel);

        // Build Panel
        await drawPanel(graphPanel);
        await panels.addScript(graphPanel, "./webview.css");
        await panels.addScript(graphPanel, "./ui/index.js");

        panels.onMessage(graphPanel, processWebviewMessage);

        // Setup callbacks
        await joplin.workspace.onNoteChange(async (ev) => {
            if (ev.event === 2) updateUI("noteChange");
        });
        await joplin.workspace.onNoteSelectionChange(async () => {
            updateUI("noteSelectionChange");
        });
        await joplin.workspace.onSyncStart(async () => {
            syncOngoing = true;
        });
        await joplin.workspace.onSyncComplete(async () => {
            syncOngoing = false;
            updateUI("syncComplete");
        });
        await joplin.settings.onChange(async (ev) => {
            if (!USER_INPUT.includes(ev.keys[0]))
                updateUI("pushSettings");
        });
    },
});

async function collectGraphSettings() {
    return await joplin.settings.values([
        'FILTER', 'MAX_TREE_DEPTH', 'QUERY', 'SHOW_TAGS', 'INCLUDE_BACKLINKS', 'GROUPS',
        'ALPHA', 'CENTER_STRENGTH', 'CHARGE_STRENGTH', 'COLLIDE_RADIUS', 'LINK_DISTANCE'
    ]);
}

async function fetchData(spec: DataSpec) {
    const fetchForNoteIds: Array<string> = [];

    if (typeof(spec.spanningTree) === "undefined") {
        const selectedNoteIds = await joplin.workspace.selectedNoteIds();
        fetchForNoteIds.push(...selectedNoteIds);
    } else {
        for (const noteId of spec.spanningTree) {
            fetchForNoteIds.push(noteId); 
        }
    }

    const nodes = await joplinData.getNodes(
        fetchForNoteIds,
        spec.degree,
        spec.filterQuery
    );

    const data: GraphData = {
        nodes: [],
        edges: [],
        spanningTree: fetchForNoteIds,
        graphSettings: {}
    };

    for (let [id, node] of nodes.entries()) {
        for (let link of node.forwardlinks) {
            // Slice note link if link directs to an anchor
            var index = link.indexOf("#");
            if (index != -1) { link = link.substr(0, index); }

            // The destination note could have been deleted.
            const linkDestExists = nodes.has(link);

            if (!linkDestExists) { continue; }

            data.edges.push({
                source: id,
                target: link,
            });
        }

        data.nodes.push({
            id: id,
            title: node.title,
            color: "",
            is_tag: node.is_tag,
            num_links: node.num_links,
            num_forwardlinks: node.num_forwardlinks,
            num_backlinks: node.num_backlinks,
            distanceToCurrentNode: node.distanceToCurrentNode
        });

    }
    return data;
}

function notifyUI() {
    // resolves Promise created in processWebviewMessage and sends a message back
    // to the WebView;

    if (pollCb && modelChanges.length > 0) {
        let modelChange = modelChanges.shift();
        pollCb(modelChange);
        pollCb = undefined;
    }
}

async function drawPanel(panel: any) {
    await joplin.views.panels.setHtml(panel, panelHtml);
}

async function registerShowHideCommand(graphPanel: any) {
    // Register Show/Hide Graph Command and also create a toolbar button for this
    // command and a menu item.

    const panels = joplin.views.panels;

    await joplin.commands.register({
        name: "showHideGraphUI",
        label: "Show/Hide Graph View",
        iconName: "fas fa-sitemap",
        execute: async () => {
            const isVisible = await (panels as any).visible(graphPanel);
            (panels as any).show(graphPanel, !isVisible);
        },
    });

    await joplin.views.toolbarButtons.create(
        "graphUIButton",
        "showHideGraphUI",
        ToolbarButtonLocation.NoteToolbar
    );

    await joplin.views.menuItems.create(
        "showOrHideGraphMenuItem",
        "showHideGraphUI",
        MenuItemLocation.View,
        { accelerator: "F8" }
    );
}

async function processWebviewMessage(message: any) {
    let promise: Promise<Object>;
    switch (message.name) {
        case "poll":
            promise = new Promise((resolve) => { pollCb = resolve; });
            if (message.msg === "init") {
                updateUI("initialCall");
            } else {
                notifyUI();
            }
            return promise;
        case "open_note":
            return await joplin.commands.execute("openNote", message.id);
        case "open_tag":
            return await joplin.commands.execute("openTag", message.id);
        case "set_setting":
            if (message.key === "GROUPS") {
                updateUI("colorsChange");
            } else if (USER_INPUT.includes(message.key)) {
                updateUI("noteSelectionChange");
            } else {
                updateUI("pushSettings");
            }
            return await joplin.settings.setValue(message.key, message.value);
    }
}

async function updateUI(eventName: string) {
    //during sync do nothing;
    if (syncOngoing) { return; }

    let resp = {};
    const maxDegree = await joplin.settings.value("MAX_TREE_DEPTH");
    const graphSettings = await collectGraphSettings()

    // Speed up the inital load by skipping the eventName switch.
    if (!data || eventName === "initialCall") {
        const selectedNote = await joplin.workspace.selectedNote();

        data = await fetchData({degree: maxDegree});
        data.graphSettings = graphSettings;
        prevSettings = Object.assign({}, graphSettings);

        eventName = "initialGraph";
        prevNoteTitle = selectedNote.title;
        nodeGroupMap = await joplinData.buildNodeGroupMap(graphSettings.GROUPS as Map<string, ColorGroup>);

    } else if (eventName === "noteChange") {
        // Don't update the graph is the links in this note haven't changed.
        const selectedNote = await joplin.workspace.selectedNote();
        const noteLinks = Array.from(joplinData.getAllLinksForNote(selectedNote.body));

        if (selectedNote.title !== prevNoteTitle) {

            prevNoteTitle = selectedNote.title;
            eventName += ":title";

            resp = {
                updateType: "updateNodeTitle",
                noteId: selectedNote.id,
                newTitle: selectedNote.title
            };

        // } else if (!deepEqual(noteLinks, prevNoteLinks)) {
        } else if (!arraysEqual(noteLinks, prevNoteLinks)) {

            prevNoteLinks = noteLinks;
            eventName += ":links";
            data = await fetchData({degree: maxDegree});

        } else {

            eventName += ":other";
        }

    } else if (eventName === "noteSelectionChange") {
        let selectedNoteIds: string[];
        const query = (graphSettings.QUERY as string).trim()

        if (query) {
            const searchResult = await joplinData.executeSearch(query);
            selectedNoteIds = searchResult.map(n => n.id);

        } else {
            selectedNoteIds = await joplin.workspace.selectedNoteIds();
        }

        if (selectedNoteIds.length === 1) {
            const newSelectedNote = await joplin.workspace.selectedNote();

            data.spanningTree = [newSelectedNote.id];
            prevNoteTitle = newSelectedNote.title;
            prevNoteLinks = Array.from(joplinData.getAllLinksForNote(newSelectedNote.body));
        } else {
            data.spanningTree = selectedNoteIds;
            prevNoteTitle = undefined;
            prevNoteLinks = undefined;
        }

        data = await fetchData({
            degree: graphSettings.MAX_TREE_DEPTH as number,
            spanningTree: data.spanningTree,
            filterQuery: graphSettings.FILTER as string
        });
        data.graphSettings = graphSettings;
        prevSettings = Object.assign({}, graphSettings);
    } else if (eventName === "colorsChange") {
        // don't need to fetch new nodes, just update node to color map and 
        // update nodes
        const change = getGroupChange(graphSettings.GROUPS, prevSettings.GROUPS);
        const action = change.action, groupName = change.group;

        if (action === "add" || action === "filter") {
            const groupFilter = graphSettings.GROUPS[groupName].filter;
            const searchResult = await joplinData.executeSearch(groupFilter);
            const nodeIds = searchResult.map(({ id, }) => id)
            const nodeColorMap = new Map();

            for (let nodeId of nodeIds) {
                nodeColorMap.set(nodeId, graphSettings.GROUPS[groupName].color);
            }
            nodeGroupMap.set(groupName, nodeColorMap);
        } else if (action === "color") {
            const group = nodeGroupMap.get(groupName)
            for (let [key, _] of group.entries()) {
                group.set(key, graphSettings.GROUPS[groupName].color);
            }
        } else if (action === "remove") {
            nodeGroupMap.delete(groupName);
        }
        data.graphSettings = graphSettings;
        prevSettings = Object.assign({}, graphSettings);

    } else if (eventName === "pushSettings") {
        if (JSON.stringify(graphSettings) === JSON.stringify(prevSettings)) return;
        data.graphSettings = graphSettings;
        prevSettings = Object.assign({}, graphSettings);
    }

    for (let node of data.nodes) {
        node.color = '';
        for (let [_, nodeMap] of nodeGroupMap.entries())
            if (nodeMap.has(node.id)) node.color = nodeMap.get(node.id);
    }

    modelChanges.push({ name: eventName, data: data, resp: resp});
    notifyUI();
}

function getGroupChange(cur: any, prev: any) {
    for (let key in cur) {
        if (!(key in prev)) return { action: "add", group: key };
        if (cur[key].filter !== prev[key].filter) return { action: "filter", group: key };
        if (cur[key].color !== prev[key].color) return { action: "color", group: key };
    }
    for (let key in prev) {
        if (!(key in cur)) return { action: "remove", group: key };
    };
    return { action: "other" }
}

function arraysEqual(arr1: Array<string>, arr2: Array<string>): boolean {
    if (arr1.length !== arr2.length) return false;
    const sortedArr1 = arr1.sort();
    const sortedArr2 = arr2.sort();
    return sortedArr1.every((val, idx) => val === sortedArr2[idx]);
}

