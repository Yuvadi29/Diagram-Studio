"use client";
import Link from "next/link";
import { Copy, MoreHorizontal, Pencil, Trash2, Workflow } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { relativeTime } from "@/lib/utils/format";
import type { ProjectRow } from "@/lib/supabase/types";

export function ProjectCard({
  project,
  onRename,
  onDuplicate,
  onDelete,
}: {
  project: ProjectRow;
  onRename: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="card-chai group relative overflow-hidden sm:opacity-90 sm:hover:opacity-100">
      <Link href={`/editor/${project.id}`} className="block" aria-label={`Open ${project.title}`}>
        <div className="flex aspect-[16/10] items-center justify-center overflow-hidden border-b border-card-edge bg-[#f8f9fa] dark:bg-[#121212]">
          {project.thumbnail_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={project.thumbnail_url} alt="" className="h-full w-full object-contain p-3 transition-transform duration-300 group-hover:scale-[1.03] dark:invert-[0.93] dark:hue-rotate-180" />
          ) : (
            <Workflow className="size-8 text-muted-foreground/40" />
          )}
        </div>
        <div className="p-3 pr-10">
          <h3 className="truncate font-montserrat text-sm font-semibold tracking-tight">{project.title}</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">Edited {relativeTime(project.updated_at)}</p>
        </div>
      </Link>
      <DropdownMenu>
        <DropdownMenuTrigger className="absolute right-2 bottom-3 rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground" aria-label="Project actions">
          <MoreHorizontal className="size-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={onRename}>
            <Pencil /> Rename
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={onDuplicate}>
            <Copy /> Duplicate
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onSelect={onDelete}>
            <Trash2 /> Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
