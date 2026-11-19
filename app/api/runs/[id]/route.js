import { db, dbError } from '@/lib/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Human decisions on a run: skip the email, or agree / disagree with the fit decision.
export async function PATCH(req, { params }) {
  try {
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const action = body?.action;

    if (action === 'agree' || action === 'disagree') {
      const { error } = await db().from('runs').update({ fit_agreement: action }).eq('id', id);
      if (error) return Response.json({ error: dbError(error, 'Could not save') }, { status: 500 });
      return Response.json({ ok: true });
    }

    if (action === 'skip') {
      const { data, error } = await db()
        .from('runs')
        .update({ email_status: 'skipped' })
        .eq('id', id)
        .eq('email_status', 'draft')
        .select('id');
      if (error) return Response.json({ error: dbError(error, 'Could not skip') }, { status: 500 });
      if (!data || data.length === 0) return Response.json({ error: 'Only a draft email can be skipped.' }, { status: 409 });
      return Response.json({ ok: true });
    }

    if (action === 'unskip') {
      const { error } = await db().from('runs').update({ email_status: 'draft' }).eq('id', id).eq('email_status', 'skipped');
      if (error) return Response.json({ error: dbError(error, 'Could not restore') }, { status: 500 });
      return Response.json({ ok: true });
    }

    return Response.json({ error: 'Unknown action.' }, { status: 400 });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
