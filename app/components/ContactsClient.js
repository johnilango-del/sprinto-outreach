'use client';

import { useEffect, useState } from 'react';

const BLANK = { company_name: '', domains: '', person_name: '', title: '', email: '', why_chosen: '' };

function ContactForm({ initial, onSave, onCancel, saving, submitLabel }) {
  const [v, setV] = useState(initial);
  const set = (k) => (e) => setV({ ...v, [k]: e.target.value });
  const uid = initial.id || 'new';
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSave(v);
      }}
    >
      <div className="form-grid">
        <div className="field">
          <label htmlFor={`cn-${uid}`}>Company name</label>
          <input id={`cn-${uid}`} value={v.company_name} onChange={set('company_name')} required placeholder="LogPulse" />
        </div>
        <div className="field">
          <label htmlFor={`dm-${uid}`}>Domains (comma separated)</label>
          <input id={`dm-${uid}`} value={v.domains} onChange={set('domains')} required placeholder="logpulse.io, logpulse.nl" />
        </div>
        <div className="field">
          <label htmlFor={`pn-${uid}`}>Person name</label>
          <input id={`pn-${uid}`} value={v.person_name} onChange={set('person_name')} required placeholder="First Last" />
        </div>
        <div className="field">
          <label htmlFor={`tt-${uid}`}>Title</label>
          <input id={`tt-${uid}`} value={v.title} onChange={set('title')} placeholder="CTO" />
        </div>
        <div className="field">
          <label htmlFor={`em-${uid}`}>Email</label>
          <input id={`em-${uid}`} type="email" value={v.email} onChange={set('email')} placeholder="name@company.com" />
        </div>
        <div className="field wide">
          <label htmlFor={`wc-${uid}`}>Why chosen</label>
          <textarea id={`wc-${uid}`} rows={2} value={v.why_chosen} onChange={set('why_chosen')} placeholder="e.g. Technical co-founder; no security lead listed on Apollo" />
        </div>
      </div>
      <div className="btn-row">
        <button className="btn btn-primary" type="submit" disabled={saving}>
          {saving ? 'Saving…' : submitLabel}
        </button>
        {onCancel && (
          <button className="btn btn-secondary" type="button" onClick={onCancel} disabled={saving}>
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}

export default function ContactsClient() {
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(null);
  const [formKey, setFormKey] = useState(0);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch('/api/contacts', { cache: 'no-store' });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || `Error ${res.status}`);
      setContacts(j.contacts || []);
      setError('');
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function save(values, id) {
    setSaving(true);
    setError('');
    try {
      const res = await fetch(id ? `/api/contacts/${id}` : '/api/contacts', {
        method: id ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || `Error ${res.status}`);
      setEditing(null);
      if (!id) setFormKey((k) => k + 1);
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  async function remove(c) {
    if (!window.confirm(`Delete ${c.person_name} (${c.company_name})? Past results keep their text but lose the link to this contact.`)) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/contacts/${c.id}`, { method: 'DELETE' });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || `Error ${res.status}`);
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className="card">
        <div className="eyebrow" style={{ marginBottom: 14 }}>Add a contact</div>
        <ContactForm key={formKey} initial={BLANK} onSave={(v) => save(v)} saving={saving} submitLabel="Add contact" />
        {error && <div className="notice error" style={{ marginTop: 14 }}>{error}</div>}
      </div>

      <div className="card">
        <div className="eyebrow" style={{ marginBottom: 10 }}>
          Your contacts {contacts.length ? `(${contacts.length})` : ''}
        </div>
        {loading ? (
          <div className="empty">Loading…</div>
        ) : contacts.length === 0 ? (
          <div className="empty">No contacts yet. Add the people you picked on Apollo above.</div>
        ) : (
          <table className="ctable">
            <thead>
              <tr>
                <th>Company</th>
                <th>Domains</th>
                <th>Person</th>
                <th>Title</th>
                <th>Email</th>
                <th>Why chosen</th>
                <th>
                  <span className="sr-only" style={{ position: 'absolute', left: -9999 }}>Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {contacts.map((c) =>
                editing === c.id ? (
                  <tr key={c.id}>
                    <td colSpan={7}>
                      <ContactForm
                        initial={{ ...c, domains: (c.domains || []).join(', '), title: c.title || '', email: c.email || '', why_chosen: c.why_chosen || '' }}
                        onSave={(v) => save(v, c.id)}
                        onCancel={() => setEditing(null)}
                        saving={saving}
                        submitLabel="Save changes"
                      />
                    </td>
                  </tr>
                ) : (
                  <tr key={c.id}>
                    <td data-k="Company"><strong>{c.company_name}</strong></td>
                    <td data-k="Domains">{(c.domains || []).join(', ')}</td>
                    <td data-k="Person">{c.person_name}</td>
                    <td data-k="Title">{c.title}</td>
                    <td data-k="Email">{c.email}</td>
                    <td data-k="Why chosen" className="small">{c.why_chosen}</td>
                    <td className="actions">
                      <button className="btn btn-secondary btn-small" onClick={() => setEditing(c.id)} disabled={saving}>
                        Edit
                      </button>{' '}
                      <button className="btn btn-danger btn-small" onClick={() => remove(c)} disabled={saving}>
                        Delete
                      </button>
                    </td>
                  </tr>
                )
              )}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
