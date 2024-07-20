import joplin from "api";
import * as joplinData from "./data";
import { registerSettings } from "./settings";
import { Edge, Node, GraphData } from "./model";
import { MenuItemLocation, ToolbarButtonLocation } from "api/types";
var deepEqual = require("fast-deep-equal");

let data: GraphData;
let pollCb: any;
let modelChanges = [];
var prevData = {};
var prevNoteLinks = [];
var syncOngoing = false;


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
    await joplin.workspace.onNoteChange(async () => {
      updateUI("noteChange");
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
    await joplin.settings.onChange(async () => {
      updateUI("settingsChange");
    });
  },
});


async function fetchData(maxDegree) {
  //console.log('fetchData was called!')
  // Load settings
  const getSetting = joplin.settings.value;
  const showLinkDirection = await joplin.settings.value("SETTING_SHOW_LINK_DIRECTION");


  const selectedNote = await joplin.workspace.selectedNote();

  const notes = await joplinData.getNotes(selectedNote.id, maxDegree);

  const data: GraphData = {
    nodes: [],
    edges: [],
    currentNoteID: selectedNote.id,
    nodeFontSize: await joplin.settings.value("SETTING_NODE_FONT_SIZE"),
    nodeDistanceRatio:
      (await joplin.settings.value("SETTING_NODE_DISTANCE")) / 100.0,
    showLinkDirection,
    graphIsSelectionBased: maxDegree > 0
  };

  notes.forEach((note, id) => {
    for (let link of note.links) {
      // Slice note link if link directs to an anchor
      var index = link.indexOf("#");
      if (index != -1) { link = link.substr(0, index); }

      // The destination note could have been deleted.
      const linkDestExists = notes.has(link);
      if (!linkDestExists) { continue; }

      data.edges.push({
        source: id,
        target: link,
        sourceDistanceToCurrentNode: notes.get(id).distanceToCurrentNote,
        targetDistanceToCurrentNode: notes.get(link).distanceToCurrentNote,
        focused: id === selectedNote.id || link === selectedNote.id,
      });

      // Mark nodes that are adjacent to the currently selected note.
      if (id === selectedNote.id) {
        notes.get(link).linkedToCurrentNote = true;
      } else if (link == selectedNote.id) {
        notes.get(id).linkedToCurrentNote = true;
      } else {
        const l = notes.get(link);
        l.linkedToCurrentNote = l.linkedToCurrentNote || false;
      }
    }

    data.nodes.push({
      id: id,
      title: note.title,
      parent_id: note.parent_id,
      focused: note.linkedToCurrentNote,
      totalLinks: note.backlinks.length + note.links.size,
      distanceToCurrentNode: note.distanceToCurrentNote
    });
  });

  return data;
}


async function notifyUI() {
  // resolves Promise created in processWebviewMessage and sends a message back
  // to the WebView;

  if (pollCb && modelChanges.length > 0) {
    let modelChange = modelChanges.shift();
    pollCb(modelChange);
    pollCb = undefined;
  }
}


async function recordModelChanges(event) {
  modelChanges.push(event);
}


async function drawPanel(panel) {
  await joplin.views.panels.setHtml(
    panel,
    `
    <div class="graph-content">
      <div class="header-area">
        <button id="redrawButton">Redraw Graph</button>
        <p class="header">Note Graph</p>
      </div>
    <div class="container">
      <div id="user-input-container"></div>
      <div id="note_graph"/></div>
    </div>
  `
  );
}


async function registerShowHideCommand(graphPanel) {
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


function processWebviewMessage(message) {
  switch (message.name) {
    case "poll":
      let p = new Promise((resolve) => { pollCb = resolve; });
      notifyUI();
      return p;
    case "update":
      return { name: "update", data: data };
    case "navigateTo":
      joplin.commands.execute("openNote", message.id);
    break;
    case "get_note_tags":
      return joplinData.getNoteTags(message.id);
    case "set_setting":
      return joplin.settings.setValue(message.key, message.value);
    case "get_setting":
      return joplin.settings.value(message.key);
  }
}


async function updateUI(eventName: string) {
  //during sync do nothing;
  if (syncOngoing) { return; }

  var dataChanged = false;
  const maxDegree = await joplin.settings.value("MAX_TREE_DEPTH");

  // Speed up the inital load by skipping the eventName switch.
  if (typeof data === "undefined") {
    data = await fetchData(maxDegree);
    dataChanged = true;
  } else {
    if (eventName === "noteChange") {
      // Don't update the graph is the links in this note haven't changed.
      const selectedNote = await joplin.workspace.selectedNote();
      var noteLinks = Array.from(joplinData.getAllLinksForNote(selectedNote.body));

      if (!deepEqual(noteLinks, prevNoteLinks)) {
        prevNoteLinks = noteLinks;
        data = await fetchData(maxDegree);
        dataChanged = true;
      }

    } else if (eventName === "noteSelectionChange" && maxDegree == 0) {
      //console.log('noteSelectionChange event and maxDegree == 0!')
      // noteSelectionChange should just re-center the graph, no need to fetch all new data and compare.
      const newSelectedNote = await joplin.workspace.selectedNote();

      data.currentNoteID = newSelectedNote.id;

      data.edges.forEach((edge) => {
        const shouldHaveFocus =
          edge.source === newSelectedNote.id ||
          edge.target === newSelectedNote.id;
        edge.focused = shouldHaveFocus;
      });

      data.nodes.forEach((node) => {
        node.focused = node.id === newSelectedNote.id;
      });

      dataChanged = false;

    } else {
      //console.log('noteSelectionChange event and maxDegree > 0!')
      data = await fetchData(maxDegree);
      dataChanged = !deepEqual(data, prevData);
    }
  }

  if (dataChanged) { prevData = data; }

  recordModelChanges({ name: eventName, data: data });
  notifyUI();
}

