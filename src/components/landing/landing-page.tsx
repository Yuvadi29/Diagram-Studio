import Link from "next/link";
import { AnimatedBadge, ArrowUpRight, ChevronsDown, Highlight, Navbar, SectionHead, Wordmark } from "./chai";
import { ProductDemo } from "./demo";
import { ExportsShowcase } from "./exports-showcase";
import { FinalCta } from "./final-cta";
import { MotionProvider, MotionToggle } from "./motion";
import { FormatsDemo, HowItWorks } from "./sections";
import { TopicProvider } from "./topic-context";

const STATS = [
  { value: "10", label: "diagram types" },
  { value: "2", label: "presentation formats" },
  { value: "6", label: "ways to export" },
  { value: "0", label: "shared API keys" },
];

type Tone = "blue" | "purple" | "amber" | "grey";
const FEATURES: { title: string; body: string; tone: Tone }[] = [
  { title: "Structure first", body: "The AI writes a validated diagram spec and a layout engine places everything, so diagrams come out tidy instead of tangled.", tone: "blue" },
  { title: "Real Excalidraw", body: "Every diagram is a native, hand-drawn Excalidraw canvas. Move it, restyle it, extend it.", tone: "purple" },
  { title: "Edits you approve", body: "Ask for a change in plain words. It arrives as a preview, and parts it doesn’t touch stay put.", tone: "amber" },
  { title: "Version history", body: "Every AI change is saved as a version you can restore in one click.", tone: "grey" },
  { title: "Scene builder", body: "Reveal, highlight and dim step by step. Drag scenes to reorder.", tone: "blue" },
  { title: "Camera per format", body: "Landscape and portrait each get their own layout and framing.", tone: "purple" },
  { title: "Your key, your model", body: "Your own Gemini key, encrypted, or local models through Ollama.", tone: "amber" },
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
        <div className="chai">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="c-backdrop" src="/backdrop.svg" alt="" aria-hidden fetchPriority="high" decoding="async" />
          <a href="#main" className="c-skip">
            Skip to content
          </a>
          <Navbar signedIn={signedIn} primary={primary} />

          <main id="main" className="c-page">
            <section className="c-hero" aria-labelledby="hero-title">
              <AnimatedBadge>New: present in 16:9 and 9:16</AnimatedBadge>
              <h1 id="hero-title">Turn complex ideas into visual stories</h1>
              <p className="c-lead">
                Describe a system in a sentence. Diagram Studio draws an editable Excalidraw diagram, then presents it <Highlight>scene by scene</Highlight> for YouTube, courses and Shorts.
              </p>
              <div className="c-hero-actions">
                <Link href={primary.href} className="c-btn c-btn-solid c-btn-lg">
                  {primary.label}
                  <ArrowUpRight />
                </Link>
                <a href="#demo" className="c-btn c-btn-outline c-btn-lg">
                  See it in action
                  <ChevronsDown />
                </a>
              </div>
            </section>

            <section id="demo" className="c-demo-section" aria-label="Product demo">
              <ProductDemo />
            </section>

            <section aria-label="Diagram Studio in numbers">
              <dl className="c-stats">
                {STATS.map((s) => (
                  <div key={s.label}>
                    <dt>{s.label}</dt>
                    <dd>{s.value}</dd>
                  </div>
                ))}
              </dl>
            </section>

            <section id="how" className="c-section" aria-labelledby="how-title">
              <SectionHead id="how-title" title="From a sentence to a presentation">
                Three steps, and <Highlight>you stay in control</Highlight> of every one.
              </SectionHead>
              <HowItWorks />
            </section>

            <section id="formats" className="c-section" aria-labelledby="formats-title">
              <SectionHead id="formats-title" title="One diagram, two stages">
                Portrait gets <Highlight>its own layout and camera</Highlight>, not a crop. Your scenes stay in sync across both.
              </SectionHead>
              <FormatsDemo />
            </section>

            <section id="exports" className="c-section" aria-labelledby="exports-title">
              <SectionHead id="exports-title" title="Leave with files, not screenshots">
                Everything here is rendered from the diagram you picked, <Highlight>exactly like your exports</Highlight>.
              </SectionHead>
              <ExportsShowcase />
            </section>

            <section id="features" className="c-section" aria-labelledby="features-title">
              <SectionHead id="features-title" title="Why Diagram Studio">
                Built for people who <Highlight>explain systems for a living</Highlight>.
              </SectionHead>
              <div className="c-bento">
                <div className="c-bento-row c-bento-top">
                  {FEATURES.slice(0, 3).map((f) => (
                    <div key={f.title} className="c-bento-cell">
                      <h3 className="c-tone" data-tone={f.tone}>
                        {f.title}
                      </h3>
                      <p>{f.body}</p>
                    </div>
                  ))}
                </div>
                <div className="c-bento-row c-bento-bottom">
                  {FEATURES.slice(3).map((f) => (
                    <div key={f.title} className="c-bento-cell">
                      <h3 className="c-tone" data-tone={f.tone}>
                        {f.title}
                      </h3>
                      <p>{f.body}</p>
                    </div>
                  ))}
                </div>
              </div>
            </section>

            <section id="faq" className="c-section" aria-labelledby="faq-title">
              <SectionHead id="faq-title" title="Questions">
                Still curious? <Highlight>Here’s the short version</Highlight>.
              </SectionHead>
              <div className="c-accordion">
                {FAQ.map((item) => (
                  <details key={item.q}>
                    <summary>
                      {item.q}
                      <svg viewBox="0 0 24 24" className="c-icon" aria-hidden>
                        <path d="m6 9 6 6 6-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </summary>
                    <p>{item.a}</p>
                  </details>
                ))}
              </div>
            </section>

            <FinalCta signedIn={signedIn} />
          </main>

          <footer className="c-footer">
            <div className="c-footer-inner">
              <div className="c-footer-brand">
                <Wordmark />
                <span className="c-footer-tagline">Turn complex ideas into visual stories</span>
                <p className="c-footer-legal">© {new Date().getFullYear()} Diagram Studio. Diagrams are drawn with Excalidraw.</p>
              </div>
              <div className="c-footer-cols">
                <nav aria-label="Product">
                  <h2>Product</h2>
                  <ul>
                    <li>
                      <a href="#how">How it works</a>
                    </li>
                    <li>
                      <a href="#formats">Formats</a>
                    </li>
                    <li>
                      <a href="#exports">Exports</a>
                    </li>
                    <li>
                      <a href="#faq">FAQ</a>
                    </li>
                  </ul>
                </nav>
                <nav aria-label="Account">
                  <h2>Account</h2>
                  <ul>
                    <li>{signedIn ? <Link href="/dashboard">Your diagrams</Link> : <Link href="/login">Log in</Link>}</li>
                    <li>
                      <Link href="/settings">Settings</Link>
                    </li>
                  </ul>
                </nav>
                <nav aria-label="Preferences">
                  <h2>Preferences</h2>
                  <ul>
                    <li>
                      <MotionToggle />
                    </li>
                  </ul>
                </nav>
              </div>
            </div>
          </footer>
        </div>
      </TopicProvider>
    </MotionProvider>
  );
}
