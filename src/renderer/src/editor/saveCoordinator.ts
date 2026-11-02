// Lets the rest of the app ask "save anything pending, right now" before it
// renames, moves or deletes a page that might have unsaved edits.

type Flusher = () => Promise<void>
const flushers = new Set<Flusher>()

export function registerFlusher(fn: Flusher): () => void {
  flushers.add(fn)
  return () => flushers.delete(fn)
}

export async function flushAllSaves(): Promise<void> {
  await Promise.all([...flushers].map((f) => f().catch(() => {})))
}
