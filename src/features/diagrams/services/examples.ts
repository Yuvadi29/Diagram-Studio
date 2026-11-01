import type { DiagramType } from "../schema/dsl";

export interface ExamplePrompt {
  label: string;
  prompt: string;
  type: DiagramType | "auto";
}

/** Example prompts shown in the empty state and new-diagram dialog (PRD §4.1, §21). */
export const EXAMPLE_PROMPTS: ExamplePrompt[] = [
  {
    label: "Explain a RAG pipeline",
    prompt:
      "Explain how a RAG (retrieval-augmented generation) architecture works: a user asks a question to an application, the query is embedded by an embedding model, a retriever searches a vector database for relevant chunks, the context is augmented into the prompt, an LLM generates the answer, and the response returns to the user.",
    type: "architecture",
  },
  { label: "Explain how JWT authentication works", prompt: "Explain how JWT authentication works between a client, an auth service and a protected API, including login, token issuance, sending the bearer token and signature verification.", type: "sequence" },
  { label: "Create a microservices architecture", prompt: "Create a microservices architecture for an e-commerce app: web and mobile clients, API gateway, auth, catalog, cart, order and payment services, each with its own database, plus a message broker for order events.", type: "architecture" },
  { label: "Visualize a Kafka event processing workflow", prompt: "Visualize a Kafka event processing workflow: producers publish events to topics, consumer groups process them, a stream processor enriches events, results are written to a data warehouse, and failed events go to a dead letter queue.", type: "pipeline" },
  { label: "Browser-to-backend request lifecycle", prompt: "Explain how a browser request reaches a backend API through DNS, a CDN, a load balancer and an API gateway, then retrieves data from a Redis cache or PostgreSQL.", type: "architecture" },
  { label: "AI agent execution workflow", prompt: "Show an AI agent execution loop: a user task goes to an agent, which plans with an LLM, calls tools (web search, code runner), stores observations in memory, and loops until it returns a final answer.", type: "agent-workflow" },
  { label: "Database query lifecycle", prompt: "Explain the lifecycle of a SQL query inside a database: client connection, parser, query planner/optimizer, executor, buffer pool, storage engine and disk, and the result set returned to the client.", type: "flowchart" },
];

export const PENDING_PROMPT_KEY = (projectId: string) => `ds-pending-prompt:${projectId}`;

/** A prompt typed on the landing page, carried through sign-in to the new-diagram dialog (localStorage). */
export const LANDING_PROMPT_KEY = "ds-landing-prompt";
