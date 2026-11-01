"use client";
import { Download, FileCode2, FileImage, FileJson, Film, Images } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

export interface ExportActions {
  png?: () => void;
  svg?: () => void;
  excalidraw?: () => void;
  sceneImages?: () => void;
  json?: () => void;
  video?: () => void;
}

export function ExportMenu({ actions, disabled, compact }: { actions: ExportActions; disabled?: boolean; compact?: boolean }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size={compact ? "icon-sm" : "sm"} disabled={disabled} aria-label="Export">
          <Download /> {!compact && "Export"}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>Diagram</DropdownMenuLabel>
        {actions.png && (
          <DropdownMenuItem onSelect={actions.png}>
            <FileImage /> PNG image
          </DropdownMenuItem>
        )}
        {actions.svg && (
          <DropdownMenuItem onSelect={actions.svg}>
            <FileCode2 /> SVG vector
          </DropdownMenuItem>
        )}
        {actions.excalidraw && (
          <DropdownMenuItem onSelect={actions.excalidraw}>
            <FileJson /> .excalidraw file
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuLabel>Presentation</DropdownMenuLabel>
        {actions.sceneImages && (
          <DropdownMenuItem onSelect={actions.sceneImages}>
            <Images /> Scene images (.zip)
          </DropdownMenuItem>
        )}
        {actions.video && (
          <DropdownMenuItem onSelect={actions.video}>
            <Film /> MP4 video…
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        {actions.json && (
          <DropdownMenuItem onSelect={actions.json}>
            <FileJson /> Project data (JSON)
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
