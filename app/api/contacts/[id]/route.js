import { db, dbError } from '@/lib/supabase';
import { cleanContact } from '@/lib/contactInput';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function PATCH(req, { params }) {
  try {
    const { id } = await params;
    const input = await req.json().catch(() => null);
    const { value, error: vErr } = cleanContact(input);
    if (vErr) return Response.json({ error: vErr }, { status: 400 });
    const { data, error } = await db().from('contacts').update(value).eq('id', id).select('*').single();
    if (error) return Response.json({ error: dbError(error, 'Could not save the contact') }, { status: 500 });
    return Response.json({ contact: data });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}

export async function DELETE(_req, { params }) {
  try {
    const { id } = await params;
    const { error } = await db().from('contacts').delete().eq('id', id);
    if (error) return Response.json({ error: dbError(error, 'Could not delete the contact') }, { status: 500 });
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
