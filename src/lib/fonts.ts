import { Geist_Mono, Manrope, Montserrat, Onest } from "next/font/google";

/**
 * ChaiUI type: Manrope for text, Montserrat for highlights, card titles and
 * numbers, Onest for the wordmark, Geist Mono for code. Exposed as --ff-*
 * variables; Tailwind's font-sans / font-montserrat / font-onest map to them.
 */
export const manrope = Manrope({ subsets: ["latin"], variable: "--ff-manrope", display: "swap" });
export const montserrat = Montserrat({ subsets: ["latin"], variable: "--ff-montserrat", display: "swap" });
export const onest = Onest({ subsets: ["latin"], variable: "--ff-onest", display: "swap" });
export const geistMono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono", display: "swap" });

export const fontVariables = `${manrope.variable} ${montserrat.variable} ${onest.variable} ${geistMono.variable}`;
