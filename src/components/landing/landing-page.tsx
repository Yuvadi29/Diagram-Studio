import Link from "next/link";
import { LogoMark } from "@/components/shared/logo";
import { ExportsShowcase } from "./exports-showcase";
import { FinalCta } from "./final-cta";
import { MotionProvider, MotionToggle } from "./motion";
import { Story } from "./story";
import { TopicProvider } from "./topic-context";

const DETAILS: { title: string; items: [term: string, description: string][] }[] = [
  {
    title: "Create",
    items: [
      ["Structure first", "The AI writes a validated diagram spec and a layout engine places everything, so diagrams come out tidy."],
      ["Ten diagram types", "Architecture, sequence, flowchart, data flow, pipeline, decision tree, agent workflow, network, database and process."],
    ],
  },
  {
    title: "Refine",
    items: [
      ["Version history", "Every AI change is saved as a version. Restore any of them in one click."],
      ["Autosave", "Work saves as you go, and is kept in your browser if the connection drops."],
    ],
  },
  {
    title: "Present",
    items: [
      ["Scene builder", "Reveal, highlight and dim components step by step. Drag scenes to reorder them."],
      ["Full-screen player", "Arrow keys to step, space to play, F for full screen, O to flip formats."],
    ],
  },
  {
    title: "Share",
    items: [
      ["Video in the background", "MP4 renders run on the server while you keep working."],
      ["Portable files", "PNG, SVG, .excalidraw and project JSON, whenever you need them."],
    ],
  },
];

const FAQ = [
  { q: "Do I need an AI key?", a: "You need one of two: your own Gemini API key from Google AI Studio, or Ollama running on your computer. You choose in Settings and can switch at any time." },
  { q: "Can I edit the diagram myself?", a: "Yes. Diagrams are native Excalidraw drawings. Move things, restyle them, add shapes and arrows. Labelled shapes you draw become part of the diagram the AI understands." },
  { q: "Will the AI overwrite my changes?", a: "No. Changes arrive as a preview you apply or discard. Components it doesn’t touch keep their position and style, and every AI change is saved as a version you can restore." },
  { q: "Is the portrait version just a crop?", a: "No. Portrait gets its own vertical layout and camera. You can drag components to fine-tune each format separately, and scenes stay in sync across both." },
  { q: "What can I export?", a: "PNG, SVG and .excalidraw files of the diagram, an image of every scene, project data as JSON, and MP4 video in 16:9 or 9:16." },
  { q: "Where is my data stored?", a: "Projects are stored with per-user access rules, so nobody else can read your diagrams. Gemini keys are encrypted and never shown again. With Ollama, prompts go from your browser straight to your own computer." },
];

export function LandingPage({ signedIn }: { signedIn: boolean }) {
  const primary = signedIn ? { href: "/dashboard", label: "Open your diagrams" } : { href: "/login", label: "Start drawing" };
  return (
    <MotionProvider>
      <TopicProvider>
        <div className="lp" data-lights="up">
          <a href="#main" className="lp-skip">
            Skip to content
          </a>
          <header className="lp-nav">
            <Link href="/" className="lp-wordmark" aria-label="Diagram Studio home">
              <LogoMark className="lp-logo" /> Diagram Studio
            </Link>
            <nav aria-label="Page sections" className="lp-nav-links">
              <a href="#how">How it works</a>
              <a href="#exports">Exports</a>
              <a href="#faq">FAQ</a>
            </nav>
            <div className="lp-nav-actions">
              <MotionToggle />
              {!signedIn && (
                <Link href="/login" className="lp-nav-login">
                  Log in
                </Link>
              )}
              <Link href={primary.href} className="lp-btn lp-btn-ink lp-btn-sm">
                {signedIn ? "Open app" : "Start drawing"}
              </Link>
            </div>
          </header>

          <main id="main">
            <Story primary={primary} />

            <section id="exports" className="lp-band lp-exports" aria-labelledby="exports-title">
              <div className="lp-band-head">
                <h2 id="exports-title">Leave with files, not screenshots.</h2>
                <p>Everything below was rendered from the diagram you picked at the top of the page, the same way your exports will be.</p>
              </div>
              <ExportsShowcase />
            </section>

            <section className="lp-band lp-models" aria-labelledby="models-title">
              <h2 id="models-title">Runs on the model you choose.</h2>
              <div className="lp-models-cols">
                <div>
                  <h3>Gemini, with your own key</h3>
                  <p>Paste an API key from Google AI Studio and pick any Gemini model it can use. The key is encrypted on our servers and never shown again. Usage goes to your own Google account.</p>
                </div>
                <div>
                  <h3>Ollama, on your computer</h3>
                  <p>Use models running on your own machine. Prompts go straight from your browser to Ollama and never pass through our servers.</p>
                </div>
              </div>
              <p className="lp-models-note">Diagram Studio never switches providers on its own.</p>
            </section>

            <section className="lp-band lp-details" aria-labelledby="details-title">
              <h2 id="details-title">The small things, handled.</h2>
              <div className="lp-details-grid">
                {DETAILS.map((g) => (
                  <div key={g.title}>
                    <h3>{g.title}</h3>
                    <dl>
                      {g.items.map(([t, d]) => (
                        <div key={t}>
                          <dt>{t}</dt>
                          <dd>{d}</dd>
                        </div>
                      ))}
                    </dl>
                  </div>
                ))}
              </div>
            </section>

            <section id="faq" className="lp-band lp-faq" aria-labelledby="faq-title">
              <h2 id="faq-title">Questions</h2>
              <div className="lp-faq-list">
                {FAQ.map((item) => (
                  <details key={item.q}>
                    <summary>{item.q}</summary>
                    <p>{item.a}</p>
                  </details>
                ))}
              </div>
            </section>

            <section className="lp-final" aria-label="Start your first diagram">
              <FinalCta signedIn={signedIn} />
            </section>
          </main>

          <footer className="lp-footer">
            <span className="lp-wordmark">
              <LogoMark className="lp-logo" /> Diagram Studio
            </span>
            <nav aria-label="Footer">
              <a href="#how">How it works</a>
              <a href="#exports">Exports</a>
              <a href="#faq">FAQ</a>
              {signedIn ? <Link href="/dashboard">Your diagrams</Link> : <Link href="/login">Log in</Link>}
            </nav>
            <p className="lp-footer-legal">© {new Date().getFullYear()} Diagram Studio. Diagrams are drawn with Excalidraw.</p>
          </footer>
        </div>
      </TopicProvider>
    </MotionProvider>
  );
}
