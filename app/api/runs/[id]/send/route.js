import { db, dbError } from '@/lib/supabase';
import { sendTestEmail } from '@/lib/email';
import { editPercent } from '@/lib/text';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

// "Send to my inbox": the ONLY way an email is ever sent. Goes to EMAIL_TEST_RECIPIENT only.
export async function POST(req, { params }) {
  try {
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const finalText = String(body?.email_final ?? '').replace(/\r\n/g, '\n').trim();
    if (!finalText) return Response.json({ error: 'The email is empty.' }, { status: 400 });

    const { data: run, error } = await db().from('runs').select('*').eq('id', id).maybeSingle();
    if (error) return Response.json({ error: dbError(error, 'Could not load the run') }, { status: 500 });
    if (!run) return Response.json({ error: 'Run not found.' }, { status: 404 });
    if (run.email_status === 'sent') return Response.json({ error: 'This email was already sent. It cannot be sent twice.' }, { status: 409 });
    if (!['GOOD_FIT', 'GOOD_FIT_FLAGGED'].includes(run.status) || !run.email_original) {
      return Response.json({ error: 'There is no drafted email for this company.' }, { status: 400 });
    }
    // The chosen person is stored on the run (Hunter or Apollo list). Their real address only goes in the subject line.
    let contact = run.contact_name ? { person_name: run.contact_name, email: run.contact_email } : null;
    if (!contact && run.contact_id) {
      const { data } = await db().from('contacts').select('person_name, email').eq('id', run.contact_id).maybeSingle();
      contact = data;
    }
    if (!contact) return Response.json({ error: 'No contact is linked to this run.' }, { status: 400 });

    // Lock first, so a double click can never send twice.
    const { data: locked, error: lockErr } = await db()
      .from('runs')
      .update({ email_status: 'sending' })
      .eq('id', id)
      .in('email_status', ['draft', 'skipped'])
      .select('id');
    if (lockErr) return Response.json({ error: dbError(lockErr, 'Could not lock the email') }, { status: 500 });
    if (!locked || locked.length === 0) {
      return Response.json({ error: 'This email is already being sent or was sent.' }, { status: 409 });
    }

    let result;
    try {
      result = await sendTestEmail({
        contactName: contact?.person_name,
        contactEmail: contact?.email,
        subject: run.email_subject || 'Hello',
        text: finalText,
      });
    } catch (e) {
      await db().from('runs').update({ email_status: 'draft' }).eq('id', id);
      return Response.json({ error: e.message }, { status: 502 });
    }

    const pct = editPercent(run.email_original, finalText);
    const sentAt = new Date().toISOString();
    const { error: upErr } = await db()
      .from('runs')
      .update({ email_status: 'sent', email_final: finalText, edit_percent: pct, sent_at: sentAt, email_sender: result.sender })
      .eq('id', id);
    if (upErr) {
      return Response.json({ error: `Email was sent, but saving failed: ${upErr.message}` }, { status: 500 });
    }
    return Response.json({ ok: true, sent_at: sentAt, edit_percent: pct, sender: result.sender, to: result.to });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
