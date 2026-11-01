import { Bricolage_Grotesque, Kalam } from "next/font/google";

/** Display + body face for the landing page. */
export const bricolage = Bricolage_Grotesque({ subsets: ["latin"], variable: "--font-bricolage", axes: ["opsz", "wdth"], display: "swap" });
/** Handwritten face, used only for whiteboard-style margin notes and sketches. */
export const kalam = Kalam({ subsets: ["latin"], weight: ["400", "700"], variable: "--font-kalam", display: "swap" });
