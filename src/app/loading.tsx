export default function Loading() {
  return (
    <div className="flex flex-col gap-4">
      <div className="h-7 w-40 animate-pulse rounded-md bg-muted" />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }, (_, i) => (
          <div
            key={i}
            className="h-40 animate-pulse rounded-xl border border-border bg-card"
          />
        ))}
      </div>
    </div>
  );
}
