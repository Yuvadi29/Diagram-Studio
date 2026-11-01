import { Box, Cloud, Cpu, Database, DoorOpen, GitBranch, Layers, ListOrdered, StickyNote, User, Zap } from "lucide-react";
import type { NodeType } from "@/features/diagrams/schema/dsl";

const ICONS: Record<NodeType, typeof Box> = {
  actor: User,
  service: Cpu,
  database: Database,
  queue: ListOrdered,
  cache: Zap,
  gateway: DoorOpen,
  process: Layers,
  decision: GitBranch,
  "external-system": Cloud,
  component: Box,
  annotation: StickyNote,
};

export function NodeIcon({ type, className }: { type: NodeType; className?: string }) {
  const Icon = ICONS[type] ?? Box;
  return <Icon className={className ?? "size-3.5 text-muted-foreground"} />;
}
