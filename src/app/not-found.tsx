import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Backdrop } from "@/components/shared/backdrop";

export default function NotFound() {
  return (
    <div className="ds-backdrop-host flex min-h-screen flex-col items-center justify-center gap-3 px-6 text-center">
      <Backdrop />
      <p className="font-montserrat text-6xl font-semibold tracking-tight text-highlight">404</p>
      <h1 className="text-2xl font-medium tracking-tight sm:text-3xl">This page doesn’t exist</h1>
      <p className="max-w-md text-muted-foreground">The project may have been deleted, or you may not have access to it.</p>
      <Button asChild variant="solid" size="lg" className="mt-4">
        <Link href="/dashboard">Back to dashboard</Link>
      </Button>
    </div>
  );
}
