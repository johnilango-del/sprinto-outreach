import { db, dbError } from '@/lib/supabase';
import { cleanContact } from '@/lib/contactInput';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const { data, error } = await db().from('contacts').select('*').order('company_name', { ascending: true });
    if (error) return Response.json({ error: dbError(error, 'Could not load contacts') }, { status: 500 });
    return Response.json({ contacts: data || [] });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(req) {
  try {
    const input = await req.json().catch(() => null);
    const { value, error: vErr } = cleanContact(input);
    if (vErr) return Response.json({ error: vErr }, { status: 400 });
    const { data, error } = await db().from('contacts').insert(value).select('*').single();
    if (error) return Response.json({ error: dbError(error, 'Could not add the contact') }, { status: 500 });
    return Response.json({ contact: data });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
