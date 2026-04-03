interface AppBootstrapGateProps {
  status: "loading" | "error";
  message?: string;
}

export function AppBootstrapGate({
  status,
  message,
}: AppBootstrapGateProps) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-6 text-foreground">
      <div className="w-full max-w-md rounded-3xl border border-border/50 bg-card/90 p-8 text-center shadow-2xl">
        <img
          src="/dimweave-mark.svg"
          alt="Dimweave logo"
          className="mx-auto h-14 w-14 object-contain"
        />
        <h1 className="mt-4 text-2xl font-semibold">Dimweave</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {status === "loading"
            ? "Preparing workspace session"
            : message ?? "Failed to prepare workspace session."}
        </p>
      </div>
    </div>
  );
}
