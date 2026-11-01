import Link from "next/link";
import { EXAMPLE_PROMPTS } from "@/features/diagrams/services/examples";
import { LogoMark } from "@/components/shared/logo";
import { EditDemo } from "./edit-demo";
import { FormatsDemo } from "./formats-demo";
import { HeroMachine } from "./hero-machine";
import { MotionProvider, MotionToggle } from "./motion";

const FEATURE_GROUPS = [
  {
    title: "Create",
    items: [
      { title: "Structure first", body: "The AI writes a validated diagram spec. A layout engine places everything, so diagrams stay tidy and readable." },
      { title: "Ten diagram types", body: "Architecture, sequence, flowchart, data flow, pipeline, decision tree, agent workflow, network, database and process." },
      { title: "Real Excalidraw", body: "Every diagram is a native, hand-drawn Excalidraw canvas you can move, restyle and extend." },
    ],
  },
  {
    title: "Refine",
    items: [
      { title: "Plain-language edits", body: "“Add a queue”, “make it vertical”, “highlight the gateway”. Each change is previewed before it’s applied." },
      { title: "Version history", body: "Every AI change is saved as a version. Restore any of them in one click." },
      { title: "Autosave", body: "Work saves as you go and is kept in your browser if the connection drops." },
    ],
  },
  {
    title: "Present",
    items: [
      { title: "Scene builder", body: "Reveal, highlight and dim components step by step. Drag scenes to reorder them." },
      { title: "Camera per format", body: "Fit what’s visible, zoom into what matters, or frame the whole system." },
      { title: "Full-screen player", body: "Arrow keys to step, space to play, F for full screen, O to flip between formats." },
    ],
  },
  {
    title: "Export",
    items: [
      { title: "PNG and SVG", body: "Crisp images of the full diagram for docs, slides and thumbnails." },
      { title: "Every scene as an image", body: "One PNG and SVG per scene, zipped, in 16:9 or 9:16." },
      { title: "MP4 video", body: "Scenes, transitions and reveals rendered to video in the background." },
    ],
  },
];

const FAQ = [
  { q: "Do I need an AI key?", a: "Yes, one of two: your own Gemini API key from Google AI Studio, or Ollama running on your computer. You choose in Settings and can switch at any time." },
  { q: "Can I edit the diagram myself?", a: "Yes. Diagrams are native Excalidraw drawings. Move things, restyle them, add shapes and arrows. Labelled shapes you draw become part of the diagram the AI understands." },
  { q: "Will the AI overwrite my changes?", a: "No. Changes arrive as a preview you apply or discard. Components it doesn’t touch keep their position and style, and every AI change is saved as a version you can restore." },
  { q: "Is the portrait version just a crop?", a: "No. Portrait gets its own vertical layout and camera. You can drag components to fine-tune each format separately, and scenes stay in sync across both." },
  { q: "What can I export?", a: "PNG, SVG and .excalidraw files of the diagram, an image of every scene, project data as JSON, and MP4 video in 16:9 or 9:16." },
  { q: "Where is my data stored?", a: "Projects are stored with per-user access rules, so nobody else can read your diagrams. Gemini keys are encrypted and never shown again. With Ollama, prompts go from your browser straight to your own computer." },
];

export function LandingPage({ signedIn }: { signedIn: boolean }) {
  const primary = signedIn ? { href: "/dashboard", label: "Open your diagrams" } : { href: "/signup", label: "Start free" };
  return (
    <MotionProvider>
      <div className="lp">
        <a href="#main" className="lp-skip">
          Skip to content
        </a>
        <header className="lp-nav">
          <Link href="/" className="lp-wordmark" aria-label="Diagram Studio home">
            <LogoMark className="lp-logo" /> Diagram Studio
          </Link>
          <nav aria-label="Page sections" className="lp-nav-links">
            <a href="#how">How it works</a>
            <a href="#formats">Formats</a>
            <a href="#features">Features</a>
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
              {signedIn ? "Open app" : "Start free"}
            </Link>
          </div>
        </header>

        <main id="main">
          <section className="lp-hero" aria-labelledby="hero-title">
            <div className="lp-hero-copy">
              <h1 id="hero-title">Turn complex ideas into visual stories.</h1>
              <div className="lp-hero-side">
                <p className="lp-lede">
                  Type what you want to explain. Diagram Studio draws an editable diagram, then turns it into a step-by-step presentation for YouTube, courses and Shorts.
                </p>
                <div className="lp-cta-row">
                  <Link href={primary.href} className="lp-btn lp-btn-ink">
                    {primary.label}
                  </Link>
                  <a href="#how" className="lp-btn lp-btn-line">
                    See how it works
                  </a>
                </div>
                <p className="lp-fineprint">Works with your own Gemini key, or with models running on your machine through Ollama.</p>
              </div>
            </div>
            <HeroMachine />
          </section>

          <p className="lp-audience">
            For people who explain systems for a living: YouTube educators, course creators, engineers writing design docs, and teams walking each other through architecture.
          </p>

          <section id="how" className="lp-section lp-how" aria-labelledby="how-title">
            <h2 id="how-title">From a sentence to a presentation in three moves.</h2>
            <ol className="lp-flow">
              <li className="lp-node lp-node-blue">
                <span className="lp-node-n">1</span>
                <h3>Describe it</h3>
                <p>Write a sentence or a paragraph. Pick a diagram type, or let the AI choose.</p>
                <p className="lp-node-sample">“Show how Kafka consumers process orders, with a dead-letter queue”</p>
              </li>
              <li className="lp-arrow" aria-hidden>
                <svg viewBox="0 0 120 40">
                  <path d="M4 22 C 30 10, 70 30, 104 19" />
                  <path d="M96 11 L106 19 L95 27" />
                </svg>
              </li>
              <li className="lp-node lp-node-violet">
                <span className="lp-node-n">2</span>
                <h3>Shape it</h3>
                <p>Edit by hand on a real Excalidraw canvas, or ask for changes in plain language.</p>
                <p className="lp-node-sample">“Add a cache between the API and the database”</p>
              </li>
              <li className="lp-arrow" aria-hidden>
                <svg viewBox="0 0 120 40">
                  <path d="M4 18 C 34 30, 66 8, 104 21" />
                  <path d="M95 13 L106 21 L96 29" />
                </svg>
              </li>
              <li className="lp-node lp-node-yellow">
                <span className="lp-node-n">3</span>
                <h3>Present it</h3>
                <p>Scenes reveal one idea at a time. Play full screen, or export images and video.</p>
                <p className="lp-node-sample">4 scenes, 16:9 and 9:16</p>
              </li>
            </ol>
          </section>

          <section className="lp-section lp-split" aria-labelledby="edit-title">
            <div className="lp-split-copy">
              <h2 id="edit-title">Ask for changes. Keep your edits.</h2>
              <p className="lp-split-text">
                Changes arrive as a preview you can apply or undo. Components you moved stay where you moved them. Nothing gets regenerated behind your back, and every change is saved as a version.
              </p>
            </div>
            <EditDemo />
          </section>

          <section id="formats" className="lp-stage-band" aria-labelledby="formats-title">
            <div className="lp-stage-inner">
              <h2 id="formats-title">One diagram. Two stages.</h2>
              <p className="lp-stage-lede">Portrait isn’t a cropped landscape. Each format gets its own layout and camera, and your scenes stay in sync across both.</p>
              <FormatsDemo />
            </div>
          </section>

          <section id="features" className="lp-section" aria-labelledby="features-title">
            <h2 id="features-title">Everything between the idea and the upload.</h2>
            <div className="lp-spec">
              {FEATURE_GROUPS.map((g) => (
                <div key={g.title} className="lp-spec-col">
                  <h3>{g.title}</h3>
                  <dl>
                    {g.items.map((item) => (
                      <div key={item.title}>
                        <dt>{item.title}</dt>
                        <dd>{item.body}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              ))}
            </div>
          </section>

          <section className="lp-section lp-keys" aria-labelledby="keys-title">
            <h2 id="keys-title">Your model, your key.</h2>
            <div className="lp-keys-grid">
              <div className="lp-key-card">
                <h3>Gemini, with your own key</h3>
                <p>Paste an API key from Google AI Studio and choose the model you want. Your key is encrypted on our servers and never shown again. Usage is billed to your own Google account.</p>
              </div>
              <div className="lp-key-card">
                <h3>Local models with Ollama</h3>
                <p>Run models on your own computer. Prompts go straight from your browser to Ollama, so they never pass through our servers.</p>
              </div>
            </div>
            <p className="lp-keys-note">Diagram Studio never switches providers on its own.</p>
          </section>

          <section className="lp-section lp-ideas" aria-labelledby="ideas-title">
            <h2 id="ideas-title">Not sure where to start? Try one of these.</h2>
            <ul className="lp-chips">
              {EXAMPLE_PROMPTS.map((ex) => (
                <li key={ex.label}>
                  <Link href={primary.href}>{ex.label}</Link>
                </li>
              ))}
            </ul>
          </section>

          <section id="faq" className="lp-section lp-faq" aria-labelledby="faq-title">
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

          <section className="lp-final" aria-labelledby="final-title">
            <div>
              <h2 id="final-title">Your next explainer starts with a sentence.</h2>
              <div className="lp-final-cta">
                <Link href={primary.href} className="lp-btn lp-btn-amber">
                  {primary.label}
                </Link>
                <span className="lp-note lp-note-final" aria-hidden>
                  go on, describe something
                </span>
              </div>
            </div>
            <Link href={primary.href} className="lp-final-prompt" aria-label={`${primary.label}: describe your first diagram`}>
              <span className="lp-final-prompt-label">What do you want to explain?</span>
              <span className="lp-final-prompt-field">
                Explain how<span className="lp-caret" />
              </span>
              <span className="lp-final-prompt-hint">Architecture, sequence, data flow, agent workflow and more</span>
            </Link>
          </section>
        </main>

        <footer className="lp-footer">
          <div className="lp-footer-brand">
            <span className="lp-wordmark">
              <LogoMark className="lp-logo" /> Diagram Studio
            </span>
            <p>Turn complex ideas into visual stories.</p>
          </div>
          <nav aria-label="Product">
            <h3>Product</h3>
            <a href="#how">How it works</a>
            <a href="#formats">Formats</a>
            <a href="#features">Features</a>
            <a href="#faq">FAQ</a>
          </nav>
          <nav aria-label="Account">
            <h3>Account</h3>
            {signedIn ? <Link href="/dashboard">Your diagrams</Link> : <Link href="/login">Log in</Link>}
            {!signedIn && <Link href="/signup">Create an account</Link>}
            <Link href="/settings">Settings</Link>
          </nav>
          <p className="lp-footer-legal">© {new Date().getFullYear()} Diagram Studio. Diagrams are drawn with Excalidraw.</p>
        </footer>
      </div>
    </MotionProvider>
  );
}
