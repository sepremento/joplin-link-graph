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
var prevNoteTitle: string;
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


async function fetchData(maxDegree, fetchForNotes?) {
  // Load settings
  let selectedNote;
  const fetchForNoteIds = [];
  const getSetting = joplin.settings.value;
  const showLinkDirection = await joplin.settings.value("SETTING_SHOW_LINK_DIRECTION");

  if (typeof(fetchForNotes) === "undefined") {
    selectedNote = await joplin.workspace.selectedNote();
    fetchForNoteIds.push(selectedNote.id);
  } else {
    selectedNote = fetchForNotes[0];
    fetchForNotes.forEach((note) => { fetchForNoteIds.push(note.id); })
  }

  const notes = await joplinData.getNotes(fetchForNoteIds, maxDegree);

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

async function processWebviewMessage(message) {
  switch (message.name) {
    case "poll":
      let p = new Promise((resolve) => { pollCb = resolve; });
      notifyUI();
      return p;
    case "update":
      return { name: "update", data: data };
    case "search-query":
      data = await executeSearchQuery(message.query);
      return { name: "update", data: data };
    break;
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

async function executeSearchQuery(query): Promise<GraphData> {
  //console.log(`Got a query: ${query}`)
  const maxDegree = await joplin.settings.value("MAX_TREE_DEPTH");
  const searchResult = await joplin.data.get(['search'], {
      query: query,
      fields: ["id", "parent_id", "title", "body"],
  });

  const foundNotes = [...searchResult.items];

  //console.log(`type of foundNotes: ${typeof(foundNotes)}`)

  return fetchData(maxDegree, foundNotes);
}


async function updateUI(eventName: string) {
  //during sync do nothing;
  if (syncOngoing) { return; }

  let resp = {};
  var dataChanged = false;
  const maxDegree = await joplin.settings.value("MAX_TREE_DEPTH");

  // Speed up the inital load by skipping the eventName switch.
  if (typeof data === "undefined") {
    const selectedNote = await joplin.workspace.selectedNote();
    data = await fetchData(maxDegree);
    eventName = "initialGraph";
    prevNoteTitle = selectedNote.title;
    dataChanged = true;
  } else {
    if (eventName === "noteChange") {
      // Don't update the graph is the links in this note haven't changed.
      const selectedNote = await joplin.workspace.selectedNote();
      const noteLinks = Array.from(joplinData.getAllLinksForNote(selectedNote.body));

      if (selectedNote.title !== prevNoteTitle) {
        console.log(`New note title: ${selectedNote.title}`);

        prevNoteTitle = selectedNote.title;
        eventName += ":title";
        resp = {
          noteId: selectedNote.id,
          newTitle: selectedNote.title
        };
        dataChanged = false;

      } else if (!deepEqual(noteLinks, prevNoteLinks)) {
        console.log('Note links array changed!');

        prevNoteLinks = noteLinks;
        eventName += ":links";
        data = await fetchData(maxDegree);
        dataChanged = true;

      } else {
        console.log('Note changed, but not title or links');

        eventName += ":other";
        dataChanged = false;

      }

    } else if (eventName === "noteSelectionChange") {
      const newSelectedNote = await joplin.workspace.selectedNote();
      const noteIds = data.nodes.map(note => note.id);

      data.currentNoteID = newSelectedNote.id;
      prevNoteTitle = newSelectedNote.title;
      prevNoteLinks = Array.from(joplinData.getAllLinksForNote(newSelectedNote.body));

      // if draw all notes already then most of the time no need to refetch;
      if (maxDegree == 0) {
        // but if selected note was not in the previous data then refetch
        if (!noteIds.includes(data.currentNoteID)) {
          data = await fetchData(maxDegree);
          dataChanged = true;

        } else {
          // otherwise just refocus the graph
          data.edges.forEach((edge) => {
            const shouldHaveFocus =
              edge.source === newSelectedNote.id ||
              edge.target === newSelectedNote.id;
            edge.focused = shouldHaveFocus;
          });
          data.nodes.forEach((node) => {
            node.focused = node.id === newSelectedNote.id;
          });
          dataChanged = true;
        }
      } else {
        data = await fetchData(maxDegree);
        dataChanged = true;
      }
    } else if (eventName === "settingsChange") {
      data = await fetchData(maxDegree);
      dataChanged = true;
    }
  }
  if (dataChanged) { prevData = data; }

  console.log("eventName: ", eventName, "maxDegree: ", maxDegree)
  recordModelChanges({ name: eventName, data: data, resp: resp});
  notifyUI();
}

