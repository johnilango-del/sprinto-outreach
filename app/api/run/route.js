import { runCompany } from '@/lib/pipeline';

export const runtime = 'nodejs';
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

// One company per request. Streams progress as newline-separated JSON events.
export async function POST(req) {
  let body;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'Send JSON like {"website": "example.com"}.' }, { status: 400 });
  }
  const website = String(body?.website || '').trim();
  if (!website) return Response.json({ error: 'No website given.' }, { status: 400 });

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const emit = (ev) => {
        try {
          controller.enqueue(encoder.encode(JSON.stringify(ev) + '\n'));
        } catch {
          // the browser went away; keep going so the run is still saved
        }
      };
      try {
        await runCompany(website, emit);
      } catch (e) {
        emit({ type: 'error', message: e?.message || String(e) });
      } finally {
        try {
          controller.close();
        } catch {}
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'X-Accel-Buffering': 'no',
    },
  });
}
