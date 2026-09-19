export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    try {
      const { startScheduler } = await import("@/lib/jobs");
      await startScheduler();
    } catch (e) {
      // A broken db (e.g. corrupt WAL) must not take down the whole server.
      console.error("[jobs] scheduler failed to start — continuing without jobs", e);
    }

    // Warm the in-memory caches so the first page load doesn't pay cold
    // latency for weather, target visibility, or the FITS library.
    void Promise.allSettled([
      import("@/lib/astro/weather").then((m) => m.getTonight()),
      import("@/lib/astro/targets").then((m) => m.getEnrichedTargets(25)),
      import("@/lib/astro/library").then((m) => m.getLibraryTargets()),
      import("@/lib/astro/needsUpdate").then((m) => m.getNeedsUpdate()),
    ]).then(() => console.log("[warm] caches primed"));
  }
}
