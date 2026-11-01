import { Spinner } from "@/components/ui/spinner";

export default function Loading() {
  return (
    <div className="flex h-dvh items-center justify-center text-sm text-muted-foreground">
      <Spinner className="mr-2" /> Opening editor…
    </div>
  );
}
