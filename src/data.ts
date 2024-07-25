import joplin from "api";


export interface Notebook {
  title: string;
  parent_id: string;
}


async function getNotebooks(): Promise<Map<string, Notebook>> {
  var notebooks = new Map<string, Notebook>();
  var page_num = 1;
  do {
    var notebooksBatch = await joplin.data.get(
      ["folders"], 
      {
        fields: ["id", "title", "parent_id"],
        page: page_num,
      }
    );
    for (const notebook of notebooksBatch.items) {
      notebooks.set(notebook.id, {
        title: notebook.title,
        parent_id: notebook.parent_id
      })
    }
    page_num++;
  } while (notebooksBatch.has_more);

  return notebooks;
}


function getFilteredNotebooks(
  notebooks: Map<string, Notebook>,
  filteredNotebookNames: Array<string>,
  shouldFilterChildren: boolean,
  isIncludeFilter: boolean
): Map<string, Notebook> {
  const notebookIdsByName = new Map<string, string>();
  for (const [id, n] of notebooks) { notebookIdsByName.set(n.title, id) }

  // Get a list of valid notebook names to filter out.
  filteredNotebookNames = filteredNotebookNames.filter((name) =>
    notebookIdsByName.has(name)
  );

  function shouldIncludeNotebook(parent_id: string): boolean {
    var parentNotebook: Notebook = notebooks.get(parent_id);
    // Filter out the direct parent.
    if (filteredNotebookNames.includes(parentNotebook.title)) {
      return isIncludeFilter;
    }

    // Filter a note if any of its ancestor notebooks are filtered.
    if (shouldFilterChildren) {
      while (parentNotebook !== undefined) {
        if (filteredNotebookNames.includes(parentNotebook.title)) {
          return isIncludeFilter;
        }
        parentNotebook = notebooks.get(parentNotebook.parent_id);
      }
    }
    return !isIncludeFilter;
  }

  const filteredNotebooks = new Map<string, Notebook>();

  for (const [id, n] of notebooks.entries()) {
    if (shouldIncludeNotebook(id)) { filteredNotebooks.set(id, n) }
  }
  return filteredNotebooks
}


export interface Note {
  id: string;
  parent_id: string;
  title: string;
  folder: string;
  links: Set<string>;
  backlinks?: Array<string>;
  linkedToCurrentNote?: boolean;
  /**
   * (Minimal) distance of this note to current/selected note in Joplin
   * 0 => current note itself
   * 1 => directly adjacent note
   * x => ... and so on
   */
  distanceToCurrentNote?: number;
}


interface JoplinNote {
  id: string;
  parent_id: string;
  title: string;
  body: string;
}


// Fetch notes
export async function getNotes(
  selectedNotes: Array<string>,
  maxDegree: number,
): Promise<Map<string, Note>> {

  const maxNotes = await joplin.settings.value("MAX_NODES");
  const notebooksToFilter = (await joplin.settings.value('NOTEBOOK_NAMES_TO_FILTER')).split(",");

  const shouldFilterChildren = await joplin.settings.value("SETTING_FILTER_CHILD_NOTEBOOKS");
  const isIncludeFilter = (await joplin.settings.value("FILTER_IS_INCLUDE_FILTER")) === "include" ? true : false;

  const notebooks = await getNotebooks();

  var notes = new Map<string, Note>();
  var filteredNotebooks = new Map<string, Notebook>();

  if (notebooksToFilter[0] !== "" || notebooksToFilter.length > 1) {
    filteredNotebooks = getFilteredNotebooks(
      notebooks,
      notebooksToFilter,
      shouldFilterChildren,
      isIncludeFilter
    )
  } else {
    filteredNotebooks = notebooks;
  }

  if (maxDegree > 0) {
    notes = await getLinkedNotes(
      selectedNotes,
      maxDegree,
      notebooks,
      filteredNotebooks,
    );
  } else {
    notes = await getAllNotes(maxNotes, notebooks);
  }

  if (notebooksToFilter[0] !== "" || notebooksToFilter.length > 1) {
    notes = await filterNotesByNotebookName(notes, filteredNotebooks);
  }
  return notes;
}

/**
 * Returns a filtered map of notes by notebook name.
 */
export async function filterNotesByNotebookName(
  notes: Map<string, Note>,
  filteredNotebooks: Map<string, Notebook>
): Promise<Map<string, Note>> {
  var filteredNotes = new Map<string, Note>();

  for (let [id, n] of notes) {
    if (filteredNotebooks.has(n.parent_id)) {
      filteredNotes.set(id, n); 
    }
  }

  return filteredNotes;
}

// Fetches every note.
async function getAllNotes(
  maxNotes: number,
  notebooks: Map<string, Notebook>
): Promise<Map<string, Note>> {
  var allNotes = new Array<JoplinNote>();
  var page_num = 1;

  do {
    // `parent_id` is the ID of the notebook containing the note.
    var notes = await joplin.data.get(["notes"], {
      fields: ["id", "parent_id", "title", "body"],
      order_by: "updated_time",
      order_dir: "DESC",
      limit: maxNotes < 100 ? maxNotes : 100,
      page: page_num,
    });
    allNotes.push(...notes.items);
    page_num++;
  } while (notes.has_more && allNotes.length < maxNotes);

  const noteMap = new Map<string, Note>();

  for (const joplinNote of allNotes) {
    const note = buildNote(joplinNote);
    note.folder = notebooks.get(note.parent_id).title;
    noteMap.set(note.id, note);
  }
  return noteMap;
}


function buildNote(joplinNote: JoplinNote): Note {
  const links: Set<string> = getAllLinksForNote(joplinNote.body);
  joplinNote.body = null;
  return {
    id: joplinNote.id,
    title: joplinNote.title,
    parent_id: joplinNote.parent_id,
    folder: undefined,
    links: links,
    backlinks: new Array<string>()
  };
}


// Fetch all notes linked to a given source note, up to a maximum degree of
// separation.
async function getLinkedNotes(
  source_ids: Array<string>,
  maxDegree: number,
  notebooks: Map<string, Notebook>,
  filteredNotebooks: Map<string, Notebook>,
): Promise<Map<string, Note>> {

  var pending = source_ids;
  var visited = new Set();
  const noteMap = new Map();
  var degree = 0;

  const includeBacklinks = await joplin.settings.value("SETTING_INCLUDE_BACKLINKS");

  do {
    // Traverse a new batch of pending note ids, storing the note data in
    // the resulting map, and stashing the newly found linked notes for the
    // next iteration.
    const joplinNotes = await getNoteArray(pending);
    for (const pendingNoteId of pending) {
      visited.add(pendingNoteId)
    }
    pending = [];

    for (const joplinNote of joplinNotes) {
      // store note data to be returned at the end of the traversal
      const note = buildNote(joplinNote);

      note.folder = notebooks.has(note.parent_id) 
        ? notebooks.get(note.parent_id).title
        : undefined

      note.distanceToCurrentNote = degree;
      noteMap.set(joplinNote.id, note);


      let backlinks = includeBacklinks ? await getAllBacklinksForNote(note.id) : [];

      if (backlinks.length > 0) {
        backlinks = await filterBacklinks(backlinks, filteredNotebooks);
      }

      note.backlinks = backlinks;

      const allLinks = [
        ...note.links, // these are the forward-links
        ...backlinks,
      ];

      // stash any new links for the next iteration
      for (const link of allLinks) {
        // prevent cycles by filtering notes we've already seen.
        if (!visited.has(link)) {
          pending.push(link);
        }
      }
    }

    degree++;

    // stop whenever we've reached the maximum degree of separation, or
    // we've exhausted the adjacent nodes.
  } while (pending.length > 0 && degree <= maxDegree);

  return noteMap;
}


async function filterBacklinks(
  backlinks: Array<string>,
  filteredNotebooks: Map<string, Notebook>,
): Promise<Array<string>> {

  const joplinNotes = await getNoteArray(backlinks);

  const filteredNotebookIds = [];
  for (const [id, n] of filteredNotebooks) {
    filteredNotebookIds.push(id)
  }

  const filteredBacklinks = [];
  for (const note of joplinNotes) {
    if (filteredNotebookIds.includes(note.parent_id)) {
      filteredBacklinks.push(note.id);
    }
  }

  return filteredBacklinks;
}


async function getNoteArray(ids: string[]): Promise<Array<JoplinNote>> {
  var promises = ids.map((id) =>
    joplin.data.get(["notes", id], {
      fields: ["id", "parent_id", "title", "body"],
    })
  );

  // joplin queries could fail -- make sure we catch errors.
  const results = await Promise.all(promises.map((p) => p.catch((e) => e)));

  // remove from results any promises that errored out, returning the valid
  // subset of queries.
  const valid = results.filter((r) => !(r instanceof Error));
  return valid;
}


export function getAllLinksForNote(noteBody: string): Set<string> {
  const links = new Set<string>();
  // TODO: needs to handle resource links vs note links. see 4. Tips note for
  // webclipper screenshot.
  // https://stackoverflow.com/questions/37462126/regex-match-markdown-link
  const linkRegexp = /\[\]|\[.*?\]\(:\/(.*?)\)/g;
  var match = null;
  do {
    match = linkRegexp.exec(noteBody);
    if (match != null && match[1] !== undefined) {
      links.add(match[1]);
    }
  } while (match != null);
  return links;
}


async function getAllBacklinksForNote(noteId: string) {
  const links: string[] = [];
  let pageNum = 1;
  let response;
  do {
    response = await joplin.data.get(["search"], {
      query: noteId,
      fields: ["id"],
      page: pageNum++,
    });
    links.push(...response.items.map(({ id }) => id));
  } while (response.has_more);
  return links;
}


type Tag = {
  id: string;
  title: string;
};


export async function getNoteTags(noteId: string) {
  const tags: Tag[] = [];
  let pageNum = 1;
  let response;
  do {
    response = await joplin.data.get(["notes", noteId, "tags"], {
      fields: ["id", "title"],
      page: pageNum++,
    });
    tags.push(...response.items);
  } while (response.has_more);
  return tags;
}
