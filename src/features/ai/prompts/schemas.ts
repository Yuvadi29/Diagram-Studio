import { DIAGRAM_TYPES, EDGE_TYPES, LAYOUT_DIRECTIONS, NODE_TYPES } from "../../diagrams/schema/dsl";
import { PATCH_OPS } from "../../diagrams/services/patch";

/**
 * JSON Schemas sent to providers for structured output. They are kept
 * deliberately flat (no $ref / oneOf) so both Ollama's grammar-constrained
 * decoding and Gemini's responseJsonSchema accept them. Everything is still
 * re-validated with Zod afterwards. Model output is never trusted.
 */

const str = (description?: string) => ({ type: "string", ...(description ? { description } : {}) });
const strArray = (description?: string) => ({ type: "array", items: { type: "string" }, ...(description ? { description } : {}) });

export const DIAGRAM_JSON_SCHEMA = {
  type: "object",
  properties: {
    title: str("Short diagram title"),
    description: str("One or two sentences explaining what the diagram shows"),
    type: { type: "string", enum: [...DIAGRAM_TYPES] },
    layout: { type: "string", enum: [...LAYOUT_DIRECTIONS] },
    nodes: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: str("kebab-case unique id"),
          type: { type: "string", enum: [...NODE_TYPES] },
          label: str("Short label, max ~4 words"),
          description: str("One sentence explaining the component's role"),
          groupId: str("Id of the group this node belongs to, if any"),
        },
        required: ["id", "type", "label"],
      },
    },
    edges: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: str(),
          source: str("Node id"),
          target: str("Node id"),
          label: str("Short verb phrase"),
          type: { type: "string", enum: [...EDGE_TYPES] },
        },
        required: ["id", "source", "target"],
      },
    },
    groups: {
      type: "array",
      items: {
        type: "object",
        properties: { id: str(), label: str(), nodeIds: strArray() },
        required: ["id", "label", "nodeIds"],
      },
    },
  },
  required: ["title", "type", "layout", "nodes", "edges"],
} as const;

export const REFINEMENT_JSON_SCHEMA = {
  type: "object",
  properties: {
    kind: { type: "string", enum: ["patch", "clarify", "explain"] },
    summary: str("What the change does, in one sentence"),
    question: str("Clarifying question when kind is clarify"),
    answer: str("Explanation when kind is explain"),
    operations: {
      type: "array",
      items: {
        type: "object",
        properties: {
          op: { type: "string", enum: [...PATCH_OPS] },
          id: str("Target node/edge/group id for update_* and remove_*"),
          node: {
            type: "object",
            properties: { id: str(), type: { type: "string", enum: [...NODE_TYPES] }, label: str(), description: str(), groupId: str() },
          },
          edge: {
            type: "object",
            properties: { id: str(), source: str(), target: str(), label: str(), type: { type: "string", enum: [...EDGE_TYPES] } },
          },
          group: { type: "object", properties: { id: str(), label: str(), nodeIds: strArray() } },
          changes: {
            type: "object",
            properties: {
              label: str(),
              type: str(),
              description: str(),
              groupId: str(),
              highlight: { type: "boolean" },
              source: str(),
              target: str(),
              nodeIds: strArray(),
            },
          },
          layout: { type: "string", enum: [...LAYOUT_DIRECTIONS] },
          title: str(),
          diagramType: { type: "string", enum: [...DIAGRAM_TYPES] },
        },
        required: ["op"],
      },
    },
  },
  required: ["kind"],
} as const;

export const SCENES_JSON_SCHEMA = {
  type: "object",
  properties: {
    scenes: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: str("Short scene title"),
          description: str("1-2 sentences of narration for this scene"),
          visibleNodeIds: strArray("Node ids visible in this scene (usually cumulative)"),
          visibleEdgeIds: strArray("Edge ids visible in this scene"),
          highlightedNodeIds: strArray("Node ids to emphasise"),
          highlightedEdgeIds: strArray("Edge ids to emphasise"),
          dimmedNodeIds: strArray("Visible node ids to de-emphasise"),
          durationMs: { type: "integer", description: "Scene duration in milliseconds (3000-12000)" },
          transition: { type: "string", enum: ["none", "fade", "zoom"] },
        },
        required: ["title", "visibleNodeIds", "visibleEdgeIds"],
      },
    },
  },
  required: ["scenes"],
} as const;
