# Sepremento's Awesome Graph

This plugin provides a graph for the connections between notes in your Joplin
databse. The graph is interactive and configurable. See [Features](#features) below.

It was initially a fork of [@treymo](https://github.com/treymo) [Link Graph UI](https://github.com/treymo/joplin-link-graph)
plugin but quickly have developed into a creature of its own. Some pieces of code
remained untouched so as the structure of the app.

This plugin was developed for my personal use and my taste. It works best with
Dark theme. Also I am a recreational developer in TypeScript and Web so no 
rigorous testing was introduced. However pugin does a very decent job for me.

There are some known [bugs](#bugs) that I hope to fix in future.

# Features

- Collect and draw all connections between notes in your Joplin database. Backlinks
are included. There is a feature pending for a toggle "Backlinks on/off".
- Vary depth of your linked tree rooted in the current note.
    - Click on the `Max. distance` slider to set tree depth between `0` and
    `5`. Zero is like "Global view" in Obsidian, all notes are displayed.
- Select multiple notes to draw in the Graph UI.
- Open note or tag associated with node under curset with `CTRL-LeftClick`.
- Build a graph according to some query independent of selected notes.
    - Type your query in the "Query" input field and press `Enter`. Query syntax
    is [Joplin search syntax](https://discourse.joplinapp.org/t/search-syntax-documentation/9110).
- Filter notes accorning to some query defined in the UI.
    - Type your filter query in "Filter" input field and precc `Enter`. All
    notes that satisfy the condition in the "Filter" input field are EXCLUDED from the graph.
- Toggle tag nodes on and off in the UI.
- Flexible forces tweaks for each force in the graph UI in "Graph parameters" block.
- Add colored groups to your graph in "Groups" block.
    - For each group type your condition in the last input field and press `Enter`
    or click the `+` button.
    - Colors are assigned automatically but can be adjusted.
    - You can adjust your filters dynamically afterwards, don't forget to press `Enter`,
    otherwise the filter would not be updated.

**Note:** Requires Joplin 1.7.0+

https://github.com/user-attachments/assets/3b9d0786-83f7-4f9e-8c5d-2eb87b6f532f

# Bugs

- When adding new note if that note falls into one of the colored groups defined by user it is not colored until the graph is restarted or filter query is updated.
- When you switch quickly between notes in the same tree sometimes graph does not update. Toggle graph off and on to rebuild

# Development

1. Check out the Git repository
1. `cd` into the repository and run `npm install` to install dependencies.
1. Run `npm run dist` to build the plugin file.
1. Launch [Joplin in dev
   mode](https://joplinapp.org/api/references/development_mode/) and load the
   plugin.
