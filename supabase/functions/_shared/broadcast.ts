// Data-free Realtime broadcasts (MVP_SPEC §9 Realtime): clients refetch through RLS on receipt.
function env(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value;
}

export async function broadcast(topic: string, event: string): Promise<void> {
  const key = env('SUPABASE_SERVICE_ROLE_KEY');
  const res = await fetch(`${env('SUPABASE_URL')}/realtime/v1/api/broadcast`, {
    method: 'POST',
    headers: { apikey: key, authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    body: JSON.stringify({ messages: [{ topic, event, payload: {} }] }),
  });
  if (!res.ok) throw new Error(`broadcast ${event} failed (${res.status})`);
}
