import joplin from "api";
import { SettingItemType } from "api/types";

const DEFAULT_NODE_FONT_SIZE = 20;
const DEFAULT_MAX_NOTES = 700;
const DEFAULT_MAX_DEGREE = 0;
const DEFAULT_INCLUDE_BACKLINKS = false;
const DEFAULT_SHOW_LINK_DIRECTION = false;

export async function registerSettings() {
  const sectionName = "graph-ui.settings";
  await joplin.settings.registerSection(sectionName, {
    label: "Graph UI",
    // Check out https://forkaweso.me/Fork-Awesome/icons/ for available icons.
    iconName: "fas fa-sitemap",
  });

  await joplin.settings.registerSettings({
    MAX_NODES: {
      value: DEFAULT_MAX_NOTES,
      type: SettingItemType.Int,
      section: sectionName,
      public: true,
      label: "Max nodes in graph",
      description:
        "Maximum number of nodes shown in the graph. Most recent nodes have priority.",
    },
    FILTER_IS_INCLUDE_FILTER: {
      value: "exclude",
      type: SettingItemType.String,
      isEnum: true,
      section: sectionName,
      public: true,
      options: {
        include: "Include",
        exclude: "Exclude",
      },
      label: "Should notes in the filtered notebooks be included or excluded?",
      description:
        "Include will show only notebooks in the filter list and exclude will show all notebooks not in the filter list.",
    },
    NOTEBOOK_NAMES_TO_FILTER: {
      value: "",
      type: SettingItemType.String,
      section: sectionName,
      public: true,
      label: "Notebooks names to filter",
      description: "Comma separated list of Notebook names to filter.",
    },
    SETTING_FILTER_CHILD_NOTEBOOKS: {
      value: true,
      type: SettingItemType.Bool,
      section: sectionName,
      public: true,
      label: "Filter child notebooks",
      description:
        "Filters notebooks that are children of the notebooks listed above.",
    },
    MAX_TREE_DEPTH: {
      value: DEFAULT_MAX_DEGREE,
      type: SettingItemType.Int,
      minimum: 0,
      section: sectionName,
      public: false,
      label: "Max degree of separation",
      description:
        "Maximum number of link jumps from selected note. Zero for all notes",
    },
    SETTING_INCLUDE_BACKLINKS: {
      value: DEFAULT_INCLUDE_BACKLINKS,
      type: SettingItemType.Bool,
      section: sectionName,
      public: true,
      label: "Include note back-links for selected note",
      description:
        "Backlinks are links that other notes have to the selected note. Note: This setting is targeted towards selection-based graphs with degree of separation > 0.",
    },
    CHARGE_STRENGTH: {
      advanced: true,
      value: 20,
      type: SettingItemType.Int,
      section: sectionName,
      public: true,
      label: "Electric charge force strength",
      description:
        "Positive number defines gravity for nodes, negative number defines electric charge repulsion for nodes",
    },
    CENTER_STRENGTH: {
      advanced: true,
      value: 100,
      type: SettingItemType.Int,
      section: sectionName,
      public: true,
      label: "Center force strength",
      description:
        "",
    },
    COLLIDE_RADIUS: {
      advanced: true,
      value: 48,
      type: SettingItemType.Int,
      section: sectionName,
      public: true,
      label: "Collide force radius",
      description:
        "",
    },
    LINK_DISTANCE: {
      advanced: true,
      value: 200,
      type: SettingItemType.Int,
      section: sectionName,
      public: true,
      label: "Link force distance",
      description:
        "",
    },
    LINK_STRENGTH: {
      advanced: true,
      value: 100,
      type: SettingItemType.Int,
      section: sectionName,
      public: true,
      label: "Link force strength",
      description:
        "",
    },
    ALPHA: {
      advanced: true,
      value: 30,
      type: SettingItemType.Int,
      section: sectionName,
      public: true,
      label: "Alpha Target",
      description:
        "",
    },
  });
}
