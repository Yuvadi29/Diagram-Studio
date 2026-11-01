import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Player } from "@/components/presentation/player";
import { Button } from "@/components/ui/button";
import { requireUser } from "@/lib/auth/session";
import { getDiagramForProject, getPresentation, listScenes } from "@/lib/data";
import { ApiError } from "@/lib/api";
import { SetupRequired } from "@/components/shared/setup-required";
import { getNodeBoxes, getNodeStyles, type ExElement } from "@/features/excalidraw/adapter";
import { reconcileScenes } from "@/features/presentations";

export const metadata: Metadata = { title: "Presentation" };

type Props = { params: Promise<{ presentationId: string }>; searchParams: Promise<{ format?: string; autoplay?: string; scene?: string }> };

export default async function PresentationPage({ params, searchParams }: Props) {
  const { presentationId } = await params;
  const sp = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(presentationId)) notFound();
  const { supabase } = await requireUser(`/presentation/${presentationId}`);
  try {
    const presentation = await getPresentation(supabase, presentationId);
    const [diagram, rawScenes] = await Promise.all([getDiagramForProject(supabase, presentation.project_id), listScenes(supabase, presentationId)]);
    const { scenes } = reconcileScenes(rawScenes, diagram.diagram_dsl);
    const exitHref = `/editor/${presentation.project_id}/present`;
    if (!scenes.length) {
      return (
        <div className="flex min-h-screen flex-col items-center justify-center gap-3 px-6 text-center">
          <h1 className="text-xl font-semibold">This presentation has no scenes yet</h1>
          <p className="text-sm text-muted-foreground">Create scenes from your diagram in the presentation studio.</p>
          <Button asChild>
            <Link href={exitHref}>Open presentation studio</Link>
          </Button>
        </div>
      );
    }
    const elements = (diagram.excalidraw_data.elements ?? []) as ExElement[];
    const format = sp.format === "portrait" || sp.format === "landscape" ? sp.format : presentation.active_format;
    return (
      <Player
        title={presentation.title}
        diagram={diagram.diagram_dsl}
        scenes={scenes}
        formats={{ landscape: presentation.landscape_config, portrait: presentation.portrait_config }}
        initialFormat={format}
        colors={getNodeStyles(elements)}
        editorBoxes={getNodeBoxes(elements)}
        exitHref={exitHref}
        autoplay={sp.autoplay === "1"}
      />
    );
  } catch (err) {
    if (err instanceof ApiError && err.code === "SETUP_REQUIRED") return <SetupRequired />;
    if (err instanceof ApiError && (err.status === 404 || err.status === 403)) notFound();
    throw err;
  }
}
