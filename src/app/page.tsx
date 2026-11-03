import type { Metadata } from "next";
import { LandingPage } from "@/components/landing/landing-page";
import { getSessionUser } from "@/lib/auth/session";
import { publicEnv } from "@/lib/env";
import "./landing.css";

export const metadata: Metadata = {
  title: { absolute: "FlowDeck: turn complex ideas into visual stories" },
  description:
    "Describe a system in a sentence. FlowDeck draws an editable Excalidraw diagram and turns it into a step-by-step presentation in 16:9 and 9:16, with images and MP4 export.",
  openGraph: {
    title: "FlowDeck",
    description: "Turn complex ideas into visual stories. AI diagrams you can edit, presented scene by scene.",
    type: "website",
  },
  twitter: { card: "summary_large_image", title: "FlowDeck", description: "Turn complex ideas into visual stories." },
};

export default async function Home() {
  let signedIn = false;
  if (publicEnv.supabaseUrl && publicEnv.supabaseAnonKey) {
    signedIn = Boolean(await getSessionUser());
  }
  return (
    <div>
      <LandingPage signedIn={signedIn} />
    </div>
  );
}
