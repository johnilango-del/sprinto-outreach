import ContactsClient from '../components/ContactsClient';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Contacts · Outreach Desk' };

export default function ContactsPage() {
  return (
    <>
      <section className="plum-bg band">
        <div className="wrap">
          <div className="eyebrow">Contacts · backup list</div>
          <h1>Backup contacts (optional)</h1>
          <p>
            Look people up on Apollo first, then enter them here. You don’t have to: for every good fit the system first asks Hunter,
            then reads the company’s own team page and asks Hunter’s Email Finder. A person you enter here is used only if
            both find nobody suitable. It never invents or
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
