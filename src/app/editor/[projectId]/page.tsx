import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { EditorShell } from "@/components/editor/editor-shell";
import { getProfile, requireUser } from "@/lib/auth/session";
import { getDiagramForProject, getPresentationForProject, getProject } from "@/lib/data";
import { ApiError } from "@/lib/api";
import { SetupRequired } from "@/components/shared/setup-required";
import { settingsFromPreferences } from "@/features/ai/services/settings";
import { cloudStatus } from "@/features/ai/services/server";

type Props = { params: Promise<{ projectId: string }> };

export const metadata: Metadata = { title: "Editor" };

export default async function EditorPage({ params }: Props) {
  const { projectId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(projectId)) notFound();
  const { supabase } = await requireUser(`/editor/${projectId}`);
  try {
    const [project, diagram, presentation, profile] = await Promise.all([
      getProject(supabase, projectId),
      getDiagramForProject(supabase, projectId),
      getPresentationForProject(supabase, projectId),
      getProfile(),
    ]);
    return (
      <EditorShell
        projectId={project.id}
        projectTitle={project.title}
        diagram={diagram}
        presentation={presentation}
        initialSettings={settingsFromPreferences(profile?.preferences)}
        cloud={cloudStatus()}
      />
    );
  } catch (err) {
    if (err instanceof ApiError && err.code === "SETUP_REQUIRED") return <SetupRequired />;
    if (err instanceof ApiError && (err.status === 404 || err.status === 403)) notFound();
    throw err;
  }
}
