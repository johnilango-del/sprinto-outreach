import { parseDomains } from './contacts.js';

// Validates a contact typed into the Contacts page.
export function cleanContact(input) {
  if (!input || typeof input !== 'object') return { error: 'No contact data received.' };
  const s = (v, n) => String(v ?? '').trim().slice(0, n);
  const value = {
    company_name: s(input.company_name, 200),
    domains: parseDomains(input.domains),
    person_name: s(input.person_name, 200),
    title: s(input.title, 200) || null,
    email: s(input.email, 320).toLowerCase() || null,
    why_chosen: s(input.why_chosen, 2000) || null,
  };
  if (!value.company_name) return { error: 'Company name is required.' };
  if (!value.person_name) return { error: 'Person name is required.' };
  if (value.domains.length === 0) return { error: 'Add at least one website domain, e.g. logpulse.io.' };
  if (value.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value.email)) return { error: 'That email address does not look right.' };
  return { value };
}
