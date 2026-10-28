import { compositionTypes } from "@hypit/composition";
import { textLayer, temporalLineageFor } from "@hypit/studio-companion";
const scenes = {
  ComponentWorkshop: ["Components in use", "Motion → components → library → another video"],
  SemanticWorkshop: ["Words drive motion", "Selection → reveal → revised words → following motion"],
  DeliveryWorkshop: ["From assets to a film", "Assets → result → sharing → reference callback"],
  CodeJourney: ["The coding route", "IDE → motion → rewrites → timing → Hypit"],
  Outro: ["Get Hypit", "GitHub → copy → install → characters → star"],
  Road: ["The editing route", "Editor → materials → motion → keyframes → generated sample"],
  Introduction: [
    "Introducing Hypit",
    "Homepage → code → installation → reference and replacement examples",
  ],
  Comparison: ["Competing tools", "Homepages → prices → templates → results → watermarks"],
};
export function sceneCompanions(module, tags) {
  return Object.entries(tags).map(([tag, spec]) => ({
    id: spec.name,
    output: {
      type: compositionTypes.visualTrack,
        declaration: spec.name,
      modules: [module],
    },
    family: "explainer-scenes",
    label: scenes[tag][0],
    tone: "violet",
    icon: "component",
    lane: { heightPx: 52 },
    bindings: [],
    inspector: [],
    project(context) {
      return context.generic().map((e) => ({
        ...e,
        temporal: temporalLineageFor(context, context.placement.id, "window"),
        display: {
          title: scenes[tag][0],
          layers: [textLayer(scenes[tag][1])],
        },
        inspector: [
          {
            id: "sequence",
            label: "Sequence",
            domain: "how",
            section: { id: "scene", label: "Scene" },
            value: scenes[tag][1],
          },
        ],
      }));
    },
  }));
}
