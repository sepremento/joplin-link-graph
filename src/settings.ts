import joplin from "api";
import { SettingItemType } from "api/types";

export async function registerSettings() {
  const sectionName = "graph-ui.settings";
  await joplin.settings.registerSection(sectionName, {
    label: "Graph UI",
    // Check out https://forkaweso.me/Fork-Awesome/icons/ for available icons.
    iconName: "fas fa-sitemap",
  });

  await joplin.settings.registerSettings({
    MAX_NODES: {
      value: 5000,
      type: SettingItemType.Int,
      section: sectionName,
      public: true,
      label: "Max nodes in graph",
      description:
        "Maximum number of nodes shown in the graph. Most recent nodes have priority.",
    },
    QUERY: {
      value: "",
      type: SettingItemType.String,
      section: sectionName,
      public: false,
      label: "User query",
      description: "",
    },
    FILTER: {
      value: "",
      type: SettingItemType.String,
      section: sectionName,
      public: false,
      label: "User set filters",
      description: "",
    },
    GROUPS: {
      value: "",
      type: SettingItemType.Object,
      section: sectionName,
      public: false,
      label: "Colored groups",
      description: "",
    },
    MAX_TREE_DEPTH: {
      value: 2,
      type: SettingItemType.Int,
      minimum: 0,
      section: sectionName,
      public: false,
      label: "Max degree of separation",
      description:
        "Maximum number of link jumps from selected note. Zero for all notes",
    },
    SHOW_TAGS: {
      value: true,
      type: SettingItemType.Bool,
      section: sectionName,
      public: true,
      label: "Show tags as nodes in a graph",
      description:
        "",
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
        "How strong nodes try to reach the center.",
    },
    COLLIDE_RADIUS: {
      advanced: true,
      value: 48,
      type: SettingItemType.Int,
      section: sectionName,
      public: true,
      label: "Collide force radius",
      description:
        "You can't move two nodes closer together than this setting.",
    },
    LINK_DISTANCE: {
      advanced: true,
      value: 200,
      type: SettingItemType.Int,
      section: sectionName,
      public: true,
      label: "Link force distance",
      description:
        "The desired distance between nodes.",
    },
    ALPHA: {
      advanced: true,
      value: 30,
      type: SettingItemType.Int,
      section: sectionName,
      public: true,
      label: "Alpha Target",
      description:
        "The higher this setting the slower and the better the simulation will converge.",
    },
  });
}
