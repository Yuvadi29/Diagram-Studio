import { Logo } from "@/components/shared/logo";
import { Backdrop } from "@/components/shared/backdrop";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="ds-backdrop-host flex min-h-screen flex-col">
      <Backdrop />
      <header className="mx-auto flex w-full max-w-6xl px-6 py-5 sm:px-12">
        <Logo />
      </header>
      <main className="flex flex-1 items-center justify-center px-6 pb-20">
        <div className="w-full max-w-sm">{children}</div>
      </main>
    </div>
  );
}
