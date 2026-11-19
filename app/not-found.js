import Link from 'next/link';

export default function NotFound() {
  return (
    <section className="wrap" style={{ padding: '60px 16px' }}>
      <div className="card empty">
        That page or company was not found. <Link href="/results">Back to results</Link>
      </div>
    </section>
  );
}
