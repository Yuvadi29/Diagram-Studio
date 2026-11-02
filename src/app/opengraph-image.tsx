import { ImageResponse } from "next/og";

export const alt = "Diagram Studio: turn complex ideas into visual stories";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** Social share card: the headline beside a small sketch-to-stage diagram. */
export default function OpengraphImage() {
  const node = (label: string, bg: string, x: number, y: number, hi = false) => (
    <div
      style={{
        position: "absolute",
        left: x,
        top: y,
        width: 150,
        height: 58,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        borderRadius: 14,
        background: bg,
        border: hi ? "4px solid #fab005" : "2px solid rgba(255,255,255,0.18)",
        boxShadow: hi ? "0 0 30px rgba(250,176,5,0.5)" : "none",
        fontSize: 20,
        fontWeight: 700,
        color: "#14161b",
      }}
    >
      {label}
    </div>
  );
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", background: "radial-gradient(ellipse 70% 60% at 30% 0%, #4a2309 0%, #0a0a0a 70%)", fontFamily: "sans-serif" }}>
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", padding: "0 0 0 72px", width: 640 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14, fontSize: 28, fontWeight: 700, color: "#f5f5f5" }}>
            <div style={{ width: 40, height: 40, borderRadius: 10, border: "3px solid #ff8904", display: "flex" }} />
            Diagram Studio
          </div>
          <div style={{ marginTop: 34, fontSize: 70, lineHeight: 1, fontWeight: 700, letterSpacing: -3, color: "#fafafa" }}>Turn complex ideas into visual stories</div>
          <div style={{ marginTop: 26, fontSize: 26, color: "#a3a3a3" }}>AI diagrams you can edit, presented scene by scene in 16:9 and 9:16.</div>
        </div>
        <div style={{ position: "relative", display: "flex", flex: 1, margin: 48, borderRadius: 28, background: "#0c0c0c", border: "2px solid rgba(255,247,237,0.18)" }}>
          {node("User", "#b2f2bb", 40, 60)}
          {node("Application", "#a5d8ff", 140, 170)}
          {node("Retriever", "#e9ecef", 40, 280, true)}
          {node("Vector DB", "#d0bfff", 220, 380)}
          <div style={{ position: "absolute", left: 40, bottom: 34, fontSize: 24, fontWeight: 700, color: "#f5f5f5" }}>Find what’s relevant</div>
        </div>
      </div>
    ),
    size,
  );
}
