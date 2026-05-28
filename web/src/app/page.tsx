import App from "@/components/App";

// The home shell wraps a client-side SPA (sections, wallet state, live data).
// Caching a stale HTML envelope makes old chunk references survive a deploy
// and the new UI never paints. Mark dynamic + revalidate=0 so every request
// gets a fresh shell pointing at current chunks.
export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function Home() {
  return <App />;
}
