import Link from 'next/link';
import Nav from '@/components/Nav';
import Footer from '@/components/Footer';

export default function NotFound() {
  return (
    <>
      <Nav />
      <div style={{ minHeight: '60vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '40px 20px' }}>
        <div style={{ fontSize: 48, fontWeight: 800, color: '#111', marginBottom: 4 }}>404</div>
        <div style={{ fontSize: 16, fontWeight: 700, color: '#333', marginBottom: 8 }}>Page not found</div>
        <div style={{ fontSize: 13, color: '#888', maxWidth: 400, marginBottom: 24 }}>
          The page you’re looking for doesn’t exist or has moved.
        </div>
        <Link
          href="/listings"
          style={{ background: '#111', color: '#fff', borderRadius: 999, padding: '10px 24px', fontSize: 14, fontWeight: 600, textDecoration: 'none' }}
        >
          Browse listings
        </Link>
      </div>
      <Footer />
    </>
  );
}
