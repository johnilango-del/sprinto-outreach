import ContactsClient from '../components/ContactsClient';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Contacts · Outreach Desk' };

export default function ContactsPage() {
  return (
    <>
      <section className="plum-bg band">
        <div className="wrap">
          <div className="eyebrow">Contacts · backup list</div>
          <h1>Backup contacts (used when Hunter finds nobody)</h1>
          <p>
            Look people up on Apollo first, then enter them here. For every good fit the system asks Hunter first; if Hunter
            finds nobody suitable, is out of credits or fails, it uses the person you entered here. It never invents or
            replaces a contact. Best picks: CTO or technical founder for small teams; Head of Security or
            Compliance Lead for Series B to C. Never sales, marketing, interns or info@ inboxes.
          </p>
        </div>
      </section>
      <section className="wrap band-overlap">
        <ContactsClient />
      </section>
    </>
  );
}
