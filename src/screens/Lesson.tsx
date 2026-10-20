// Placeholder (M0). Lesson content, checks, rating and Done arrive in M3.
export function Lesson({ id }: { id: string }) {
  return (
    <article aria-labelledby="lesson-title">
      <p class="muted">{id}</p>
      <h1 id="lesson-title">Lesson</h1>
      <p class="muted">Lesson content will appear here.</p>
      <a href="#/today">Back to Today</a>
    </article>
  );
}
