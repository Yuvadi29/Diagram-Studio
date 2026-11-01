"use client";
import { useState } from "react";
import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { signOut } from "@/lib/auth/sign-out";

export function SignOutButton() {
  const [busy, setBusy] = useState(false);
  return (
    <Button
      variant="outline"
      onClick={() => {
        setBusy(true);
        void signOut();
      }}
      disabled={busy}
    >
      {busy ? <Spinner /> : <LogOut />} {busy ? "Signing out…" : "Sign out"}
    </Button>
  );
}
