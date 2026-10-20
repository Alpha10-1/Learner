// Placeholder (M0). The real plan, hero count and streak arrive in M2/M3.
export function Today() {
  return (
    <section aria-labelledby="today-title">
      <h1 id="today-title" class="visually-hidden">
        Today
      </h1>
      <p class="hero">
        <span aria-hidden="true">–</span>
        <span class="visually-hidden">No lessons yet.</span>
      </p>
      <p class="muted">
        Lessons left today. Your plan will appear here once lessons are loaded.
      </p>
      <a class="button" href="#/lesson/p01-s01-l01">
        Open a sample lesson
      </a>
    </section>
  );
}
