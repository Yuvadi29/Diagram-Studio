import type { Metadata } from "next";
import { LandingPage } from "@/components/landing/landing-page";
import { bricolage, kalam } from "@/components/landing/fonts";
import { createClient } from "@/lib/supabase/server";
import { publicEnv } from "@/lib/env";
import "./landing.css";

export const metadata: Metadata = {
  title: { absolute: "Diagram Studio: turn complex ideas into visual stories" },
  description:
    "Describe a system in a sentence. Diagram Studio draws an editable Excalidraw diagram and turns it into a step-by-step presentation in 16:9 and 9:16, with images and MP4 export.",
  openGraph: {
    title: "Diagram Studio",
    description: "Turn complex ideas into visual stories. AI diagrams you can edit, presented scene by scene.",
    type: "website",
  },
  twitter: { card: "summary_large_image", title: "Diagram Studio", description: "Turn complex ideas into visual stories." },
};

export default async function Home() {
  let signedIn = false;
  if (publicEnv.supabaseUrl && publicEnv.supabaseAnonKey) {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    signedIn = Boolean(user);
  }
  return (
    <div className={`${bricolage.variable} ${kalam.variable}`}>
      <LandingPage signedIn={signedIn} />
    </div>
  );
}
