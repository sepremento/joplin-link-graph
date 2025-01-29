import joplin from "api";
import { ColorGroup, JoplinNote } from './model'


export interface Notebook {
    title: string;
    parent_id: string;
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

// Fetch notes
export async function getNodes(
    selectedNotes: Array<string>,
    maxDegree: number,
    filterQuery: string
): Promise<Map<string, Node>> {

    const maxNotes = await joplin.settings.value("MAX_NODES");

    const noteIdsToExclude: Set<string> = new Set();

    var nodes = new Map<string, Node>();

    if (filterQuery) {
        const searchResult: Array<JoplinNote> = await executeSearch(filterQuery);
        for (let n of searchResult) noteIdsToExclude.add(n.id);
    }

    if (maxDegree > 0) {
        nodes = await getLinkedNodes(
            selectedNotes,
            maxDegree,
            noteIdsToExclude,
        );
    } else {
        nodes = await getAllNodes(maxNotes, noteIdsToExclude);
    }

    return nodes;
}

// Fetches every note.
async function getAllNodes(
    maxNotes: number,
    noteIdsToExclude: Set<string>,
): Promise<Map<string, Node>> {
    const showTags = await joplin.settings.value('SHOW_TAGS');

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

    const nodeMap = new Map<string, Node>();

    for (const joplinNote of allNotes) {
        if (noteIdsToExclude.has(joplinNote.id)) continue;

        const note = buildNodeFromNote(joplinNote);
        nodeMap.set(note.id, note);
    }

    if (showTags) {
        const tagNodes = await buildTagNodes(nodeMap, true);

        for (let [id, tag] of tagNodes.entries()) {
            if (!nodeMap.has(id)) nodeMap.set(id, tag);
        }
    }
    return nodeMap;
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
    noteIdsToExclude: Set<string>,
): Promise<Map<string, Node>> {

    var pending = source_ids;
    var visited = new Set();
    const nodeMap = new Map();
    const backlinksMap = new Map();
    var degree = 0;

    const showTags = await joplin.settings.value('SHOW_TAGS');

    do {
        // Traverse a new batch of pending note ids, storing the note data in
        // the resulting map, and stashing the newly found linked notes for the
        // next iteration.

        // applyFilters
        if (degree !== 0) pending = pending.filter(n => !noteIdsToExclude.has(n));

        const joplinNotes = await getNoteArray(pending);
        for (const pendingNoteId of pending) {
            visited.add(pendingNoteId)
        }
        pending = [];

        const backlinksPromises = joplinNotes.map(n => getAllBacklinksForNote(n.id));
        let backlinks = await Promise.all(backlinksPromises.map((p) => p.catch((e) => e)));

        for (let lnk of backlinks) {
            const filtered = lnk.backlinks.filter(link => !noteIdsToExclude.has(link.id));
            backlinksMap.set(lnk.id, filtered.map(({ id, }) => id));
        }

        for (const joplinNote of joplinNotes) {
            // store note data to be returned at the end of the traversal
            const node = buildNodeFromNote(joplinNote);

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
            const tagNodes = await buildTagNodes(nodeMap, false);

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


interface Tag {
    id: string,
    title: string
}


interface JoplinDataResponse {
    items: any,
    has_more?: boolean
}


export async function buildTagNodes(nodes: Map<string, Node>, all: boolean): Promise<Map<string, Node>> {
    const tagNodes = new Map();

    // keep only nodes that are built from notes;
    const notesNodes = new Map(Array.from(nodes).filter(([_, v]) => !v.is_tag))
    const noteIdsArr = Array.from(notesNodes.keys());
    let uniqueTags: Array<Tag> = [];

    if (all) {
        // if building Global View
        let pageNum = 1;
        let response: JoplinDataResponse;
        do {
            response = await joplin.data.get(["tags"], {
                fields: ["id", "title"],
                page: pageNum++,
            });
            uniqueTags.push(...response.items);
        } while (response.has_more);

    } else {
        // collect all tags present in given notes
        const uniqueTagIds = new Set();
        const tagsPromises = noteIdsArr.map((id) =>
            joplin.data.get(["notes", id, "tags"], {
                fields: ["id", "title"]
            }));
        const tagsResult = await Promise.all(tagsPromises.map((p) => p.catch((e) => e)));
        for (let res of tagsResult) {
            const tags = res.items;
            for (let tag of tags) {
                if (!uniqueTagIds.has(tag.id)) {
                    uniqueTagIds.add(tag.id);
                    uniqueTags.push(tag)
                }
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

        if (links.length === 0) continue;

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

export async function buildNodeGroupMap(groups: Map<string, ColorGroup>): Promise<Map<string, Map<string, string>>> {
    const nodeGroupMap: Map<string, Map<string, string>> = new Map();
    const groupsArr = Array.from(Object.entries(groups));
    const promises = groupsArr.map(([_, group]) => executeSearch(group.filter));
    const results = await Promise.all(promises.map((p) => p.catch((e) => e)));
    
    for (let i=0; i<groupsArr.length; i++) {
        const groupName = groupsArr[i][0];
        const groupColor = groupsArr[i][1].color;
        const nodeColorMap: Map<string, string> = new Map();
        const nodeArr = results[i];
        for (let note of nodeArr) {
            nodeColorMap.set(note.id, groupColor);
        }
        nodeGroupMap.set(groupName, nodeColorMap);
    }
    return nodeGroupMap
}

export async function executeSearch(query: string): Promise<Array<JoplinNote>> {
    let page = 1;
    const maxNotes = await joplin.settings.value("MAX_NODES")
    const foundNotes = new Array();

    do {
        var notes = await joplin.data.get(['search'], {
            query: query,
            fields: ["id", "parent_id", "title", "body"],
            limit: maxNotes < 100 ? maxNotes : 100,
            page: page
        });

        foundNotes.push(...notes.items);
        page++;
    } while(notes.has_more && foundNotes.length < maxNotes);

    return foundNotes;
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

