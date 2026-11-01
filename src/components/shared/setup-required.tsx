import { Database, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabaseProjectRef } from "@/lib/env";

/** Shown instead of the app when the Supabase schema hasn't been created yet. */
export function SetupRequired({ detail }: { detail?: string }) {
  const ref = supabaseProjectRef();
  const sqlEditor = ref ? `https://supabase.com/dashboard/project/${ref}/sql/new` : "https://supabase.com/dashboard";
  return (
    <div className="flex min-h-[80vh] items-center justify-center px-4 py-10">
      <div className="w-full max-w-xl rounded-xl border bg-card p-6">
        <Database className="size-6 text-primary" />
        <h1 className="mt-3 text-xl font-semibold">Finish setting up the database</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          You’re connected to Supabase{ref ? ` (project ${ref})` : ""}, but Diagram Studio’s tables don’t exist there yet. This is a one-time step.
        </p>
        <ol className="mt-5 grid list-decimal gap-3 pl-5 text-sm">
          <li>
            Open the <span className="font-medium">SQL Editor</span> for your project.
            <div className="mt-2">
              <Button asChild size="sm" variant="secondary">
                <a href={sqlEditor} target="_blank" rel="noreferrer">
                  Open SQL Editor <ExternalLink />
                </a>
              </Button>
            </div>
          </li>
          <li>
            Paste the entire contents of <code className="rounded bg-muted px-1 font-mono text-xs">supabase/setup.sql</code> from this repo and click <span className="font-medium">Run</span>. It’s safe to run more than once.
          </li>
          <li>Reload this page.</li>
        </ol>
        <p className="mt-5 border-t pt-4 text-xs text-muted-foreground">
          Prefer the CLI (no Docker needed)?{" "}
          <code className="font-mono">npx supabase link --project-ref {ref ?? "<ref>"}</code> then <code className="font-mono">npx supabase db push</code>.
        </p>
        {detail && process.env.NODE_ENV === "development" && <p className="mt-3 font-mono text-[11px] text-muted-foreground">Details: {detail}</p>}
      </div>
    </div>
  );
}
