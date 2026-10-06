export default function PortalProjectNotFound() {
  return (
    <main className="grid min-h-screen place-items-center bg-[var(--background)] px-4">
      <section className="w-full max-w-md rounded-2xl bg-white p-8 text-center shadow-sm">
        <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-[var(--navy)] text-lg font-bold text-white">
          D
        </div>
        <h1 className="mt-5 text-2xl font-bold text-[var(--navy)]">
          Project not found
        </h1>
        <p className="mt-3 text-sm leading-6 text-[var(--muted-foreground)]">
          Please check the link you were given.
        </p>
      </section>
    </main>
  );
}
