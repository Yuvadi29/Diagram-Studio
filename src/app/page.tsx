import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, Layers, Presentation, Sparkles, Smartphone, Cpu, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/shared/logo";
import { createClient } from "@/lib/supabase/server";
import { publicEnv } from "@/lib/env";

export default async function LandingPage() {
  if (publicEnv.supabaseUrl && publicEnv.supabaseAnonKey) {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) redirect("/dashboard");
  }

  const features = [
    { icon: Sparkles, title: "Describe it, get a diagram", body: "Natural language in, a structured architecture, flow or sequence diagram out. Laid out deterministically, never as a static image." },
    { icon: Layers, title: "Edit in Excalidraw", body: "Every diagram is native Excalidraw. Move, restyle and connect things by hand, or ask the AI to change it without losing your edits." },
    { icon: Presentation, title: "Present step by step", body: "Turn a diagram into scenes that reveal components and flows progressively, ready to teach, present or record." },
    { icon: Smartphone, title: "16:9 and 9:16", body: "Landscape for YouTube and courses, portrait for Shorts and Reels, each with its own layout, not a crop." },
    { icon: Cpu, title: "Local or cloud AI", body: "Run on your own machine with Ollama, or use cloud AI. You choose, and it never switches silently." },
    { icon: Download, title: "Export anywhere", body: "PNG, SVG, scene images, project JSON and MP4 video renders for your content pipeline." },
  ];

  return (
    <div className="min-h-screen">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <Logo />
        <nav className="flex items-center gap-2">
          <Button variant="ghost" asChild>
            <Link href="/login">Log in</Link>
          </Button>
          <Button asChild>
            <Link href="/signup">Get started</Link>
          </Button>
        </nav>
      </header>

      <main>
        <section className="mx-auto max-w-4xl px-6 pt-20 pb-16 text-center sm:pt-28">
          <p className="mb-5 inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs text-muted-foreground">
            <span className="size-1.5 rounded-full bg-primary" /> AI diagrams → editable canvas → presentations
          </p>
          <h1 className="text-4xl font-semibold tracking-tight text-balance sm:text-6xl">Turn complex ideas into visual stories.</h1>
          <p className="mx-auto mt-5 max-w-2xl text-lg text-pretty text-muted-foreground">
            Describe what you want to explain. Diagram Studio builds the diagram, helps you refine it, and turns it into a presentation ready to share or record.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button size="lg" asChild>
              <Link href="/signup">
                Start for free <ArrowRight />
              </Link>
            </Button>
            <Button size="lg" variant="outline" asChild>
              <Link href="/login">I have an account</Link>
            </Button>
          </div>
        </section>

        <section className="mx-auto max-w-5xl px-6 pb-24">
          <div className="grid gap-px overflow-hidden rounded-xl border bg-border sm:grid-cols-2 lg:grid-cols-3">
            {features.map((f) => (
              <div key={f.title} className="bg-card p-6">
                <f.icon className="mb-3 size-5 text-primary" />
                <h2 className="font-medium">{f.title}</h2>
                <p className="mt-1.5 text-sm text-muted-foreground">{f.body}</p>
              </div>
            ))}
          </div>
        </section>
      </main>

      <footer className="border-t py-8 text-center text-xs text-muted-foreground">Diagram Studio. Built on Excalidraw.</footer>
    </div>
  );
}
