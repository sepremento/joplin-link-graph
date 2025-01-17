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


export interface Node {
    id: string;
    parent_id: string;
    title: string;
    folder: string;
    links: Set<string>;
    is_tag: boolean;
    backlinks?: Array<string>;
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
export async function getNodes(
    selectedNotes: Array<string>,
    maxDegree: number,
): Promise<Map<string, Node>> {

    const maxNotes = await joplin.settings.value("MAX_NODES");
    const notebooksToFilter = (await joplin.settings.value('NOTEBOOK_NAMES_TO_FILTER')).split(",");

    const shouldFilterChildren = await joplin.settings.value("SETTING_FILTER_CHILD_NOTEBOOKS");
    const isIncludeFilter = (await joplin.settings.value("FILTER_IS_INCLUDE_FILTER")) === "include" ? true : false;

    const notebooks = await getNotebooks();

    var nodes = new Map<string, Node>();
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
        nodes = await getLinkedNodes(
            selectedNotes,
            maxDegree,
            notebooks,
            filteredNotebooks,
        );
    } else {
        nodes = await getAllNodes(maxNotes, notebooks);
    }

    if (notebooksToFilter[0] !== "" || notebooksToFilter.length > 1) {
        nodes = await filterNotesByNotebookName(nodes, filteredNotebooks);
    }
    return nodes;
}

/**
 * Returns a filtered map of notes by notebook name.
 */
export async function filterNotesByNotebookName(
    notes: Map<string, Node>,
    filteredNotebooks: Map<string, Notebook>
): Promise<Map<string, Node>> {
    var filteredNotes = new Map<string, Node>();

    for (let [id, n] of notes) {
        if (filteredNotebooks.has(n.parent_id)) {
            filteredNotes.set(id, n); 
        }
    }

    return filteredNotes;
}

// Fetches every note.
async function getAllNodes(
    maxNotes: number,
    notebooks: Map<string, Notebook>
): Promise<Map<string, Node>> {
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

    const noteMap = new Map<string, Node>();

    for (const joplinNote of allNotes) {
        const note = buildNodeFromNote(joplinNote);
        note.folder = notebooks.get(note.parent_id).title;
        noteMap.set(note.id, note);
    }
    return noteMap;
}


function buildNodeFromNote(joplinNote: JoplinNote): Node {
    const links: Set<string> = getAllLinksForNote(joplinNote.body);
    joplinNote.body = null;
    return {
        id: joplinNote.id,
        title: joplinNote.title,
        parent_id: joplinNote.parent_id,
        folder: undefined,
        is_tag: false,
        links: links,
        backlinks: new Array<string>()
    };
}


// Fetch all notes linked to a given source note, up to a maximum degree of
// separation.
async function getLinkedNodes(
    source_ids: Array<string>,
    maxDegree: number,
    notebooks: Map<string, Notebook>,
    filteredNotebooks: Map<string, Notebook>,
): Promise<Map<string, Node>> {

    var pending = source_ids;
    var visited = new Set();
    const nodeMap = new Map();
    const backlinksMap = new Map();
    var degree = 0;

    const includeBacklinks = await joplin.settings.value("SETTING_INCLUDE_BACKLINKS");
    const showTags = await joplin.settings.value('SHOW_TAGS');

    do {
        // Traverse a new batch of pending note ids, storing the note data in
        // the resulting map, and stashing the newly found linked notes for the
        // next iteration.
        const joplinNotes = await getNoteArray(pending);
        for (const pendingNoteId of pending) {
            visited.add(pendingNoteId)
        }
        pending = [];

        if (includeBacklinks) {
            const backlinksPromises = joplinNotes.map(n => getAllBacklinksForNote(n.id));
            let backlinks = await Promise.all(backlinksPromises.map((p) => p.catch((e) => e)));

            for (let obj of backlinks) {
                const filtered = obj.backlinks.filter(link => filteredNotebooks.has(link.parent_id));
                backlinksMap.set(obj.id, filtered.map(({ id, }) => id));
            }
        }

        for (const joplinNote of joplinNotes) {
            // store note data to be returned at the end of the traversal
            const node = buildNodeFromNote(joplinNote);

            node.folder = notebooks.has(node.parent_id) 
                ? notebooks.get(node.parent_id).title
                : undefined

            node.distanceToCurrentNote = degree;
            nodeMap.set(joplinNote.id, node);

            node.backlinks = backlinksMap.get(node.id);

            const allLinks = [
                ...node.links, // these are the forward-links
                ...node.backlinks,
            ];

            // stash any new links for the next iteration
            for (const link of allLinks) {
                // prevent cycles by filtering notes we've already seen.
                if (!visited.has(link)) {
                    pending.push(link);
                }
            }
        }

        if (showTags) {
            const tagNodes = await buildTagNodes(nodeMap);

            for (let [id, tag] of tagNodes.entries()) {
                if (!nodeMap.has(id)) nodeMap.set(id, tag);

                for (let link of tag.links) {
                    if (!visited.has(link)) pending.push(link);
                }
            }
        }

        degree++;

        // stop whenever we've reached the maximum degree of separation, or
        // we've exhausted the adjacent nodes.
    } while (pending.length > 0 && degree <= maxDegree);

    return nodeMap;
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

export async function buildTagNodes(nodes: Map<string, Node>): Promise<Map<string, Node>> {
    const tagNodes = new Map();

    // keep only nodes that are built from notes;
    const notesNodes = new Map(Array.from(nodes).filter(([_, v]) => !v.is_tag))
    const noteIdsArr = Array.from(notesNodes.keys());

    // collect all tags present in given notes
    const tagsPromises = noteIdsArr.map((id) =>
        joplin.data.get(["notes", id, "tags"], {
            fields: ["id", "title"]
        }));
    const tagsResult = await Promise.all(tagsPromises.map((p) => p.catch((e) => e)));
    
    const uniqueTags = [];
    const uniqueTagIds = new Set();

    for (let res of tagsResult) {
        const tags = res.items;
        for (let tag of tags) {
            if (!uniqueTagIds.has(tag.id)) {
                uniqueTagIds.add(tag.id);
                uniqueTags.push(tag)
            }
        }
    }

    // collect all notes associated with deduced tags
    const tagIdsArr = uniqueTags.map(tag => tag.id);
    const notesPromises = tagIdsArr.map((id) =>
        joplin.data.get(["tags", id, "notes"], { fields: ["id"] }));

    const notesForTags = await Promise.all(notesPromises.map((p) => p.catch((e) => e)));

    for (let i=0; i < uniqueTags.length; i++) {
        const tagId = uniqueTags[i].id;
        const title = uniqueTags[i].title;
        const links = notesForTags[i].items.map(({ id }) => id);

        if (!tagNodes.has(tagId)) tagNodes.set(tagId, {
            id: tagId,
            title: title,
            parent_id: undefined,
            folder: undefined,
            is_tag: true,
            links: links
        });
    }
    return tagNodes;
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


async function getAllBacklinksForNote(noteId: string): Promise<Object> {
    // async function getAllBacklinksForNote(noteId: string): Promise<string[]> {
    const links: string[] = [];
    let pageNum = 1;
    let response;
    do {
        response = await joplin.data.get(["search"], {
            query: noteId,
            fields: ["id", "parent_id"],
            page: pageNum++,
        });
        links.push(...response.items);
    } while (response.has_more);
    return {id: noteId, backlinks: links};
}

