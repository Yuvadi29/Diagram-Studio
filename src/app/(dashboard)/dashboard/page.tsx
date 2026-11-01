import type { Metadata } from "next";
import { ProjectBrowser } from "@/components/dashboard/project-browser";
import { requireUser } from "@/lib/auth/session";
import { listProjects } from "@/lib/data";
import { ApiError } from "@/lib/api";
import { SetupRequired } from "@/components/shared/setup-required";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const { supabase } = await requireUser("/dashboard");
  const projects = await listProjects(supabase).catch((err) => {
    if (err instanceof ApiError && err.code === "SETUP_REQUIRED") return null;
    throw err;
  });
  if (!projects) return <SetupRequired />;
  return <ProjectBrowser initialProjects={projects} mode="dashboard" />;
}
