'use client';

import Link from 'next/link';

export default function Footer() {
  return (
    <footer className="footer">
      <div className="footer-inner">
        <div>
          <div className="footer-logo">Kepler</div>
          <div className="footer-tag">The premier marketplace for graded Pokémon cards and vintage TCG collectibles. Trusted by collectors worldwide.</div>
        </div>
        <div>
          <div className="footer-col-title">Marketplace</div>
          <div className="footer-links">
            <Link href="/auctions">Auctions</Link>
            <Link href="/catalog">Card Catalog</Link>
            <a>Private Sales</a>
            <a>Results</a>
          </div>
        </div>
        <div>
          <div className="footer-col-title">Sellers</div>
          <div className="footer-links">
            <a>How to Sell</a>
            <a>Consign a Card</a>
            <a>Seller FAQ</a>
            <a>Grading Guide</a>
          </div>
        </div>
        <div>
          <div className="footer-col-title">Company</div>
          <div className="footer-links">
            <a>About Kepler</a>
            <a>Careers</a>
            <a>Press</a>
            <a>Contact</a>
          </div>
        </div>
      </div>
      <div className="footer-bottom">
        <span>© 2026 Kepler Trading Co. All rights reserved.</span>
        <div className="footer-bottom-links">
          <a>Privacy Policy</a>
          <a>Terms of Service</a>
          <a>Buyer&apos;s Premium</a>
        </div>
      </div>
    </footer>
  );
}
