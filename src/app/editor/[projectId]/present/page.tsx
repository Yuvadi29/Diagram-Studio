import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { StudioShell } from "@/components/presentation/studio-shell";
import { getProfile, requireUser } from "@/lib/auth/session";
import { getDiagramForProject, getPresentationForProject, getProject, listScenes } from "@/lib/data";
import { ApiError } from "@/lib/api";
import { SetupRequired } from "@/components/shared/setup-required";
import { getNodeBoxes, getNodeStyles, type ExElement } from "@/features/excalidraw/adapter";
import { settingsFromPreferences } from "@/features/ai/services/settings";

export const metadata: Metadata = { title: "Presentation studio" };

type Props = { params: Promise<{ projectId: string }> };

export default async function StudioPage({ params }: Props) {
  const { projectId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(projectId)) notFound();
  const { supabase } = await requireUser(`/editor/${projectId}/present`);
  try {
    const [project, diagram, presentation, profile] = await Promise.all([
      getProject(supabase, projectId),
      getDiagramForProject(supabase, projectId),
      getPresentationForProject(supabase, projectId),
      getProfile(),
    ]);
    const scenes = await listScenes(supabase, presentation.id);
    const elements = (diagram.excalidraw_data.elements ?? []) as ExElement[];
    return (
      <Suspense>
        <StudioShell
          projectId={project.id}
          title={project.title}
          presentationId={presentation.id}
          diagram={diagram.diagram_dsl}
          excalidrawElements={elements}
          colors={getNodeStyles(elements)}
          editorBoxes={getNodeBoxes(elements)}
          initialScenes={scenes}
          initialFormats={{ landscape: presentation.landscape_config, portrait: presentation.portrait_config }}
          initialFormat={presentation.active_format}
          aiSettings={settingsFromPreferences(profile?.preferences)}
        />
      </Suspense>
    );
  } catch (err) {
    if (err instanceof ApiError && err.code === "SETUP_REQUIRED") return <SetupRequired />;
    if (err instanceof ApiError && (err.status === 404 || err.status === 403)) notFound();
    throw err;
  }
}
