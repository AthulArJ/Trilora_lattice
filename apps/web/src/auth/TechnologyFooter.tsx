import { useRef } from 'react';
import { X } from 'lucide-react';

const technologies = [
  { name: 'Cloudflare', file: 'cloudflare.svg', url: 'https://www.cloudflare.com/' },
  { name: 'Supabase', file: 'supabase.svg', url: 'https://supabase.com/' },
  { name: 'PostgreSQL', file: 'postgresql.png', url: 'https://www.postgresql.org/' },
  { name: 'React', file: 'react.svg', url: 'https://react.dev/' },
  { name: 'Three.js', file: 'threejs.svg', url: 'https://threejs.org/' },
  { name: 'QGIS', file: 'qgis.svg', url: 'https://qgis.org/' },
  { name: 'MapLibre GL JS', file: 'maplibre.svg', url: 'https://maplibre.org/' },
  { name: 'PostGIS', file: 'postgis.svg', url: 'https://postgis.net/' },
];

export default function TechnologyFooter() {
  const privacyDialog = useRef<HTMLDialogElement>(null);
  return <footer className="login-technology-footer">
    <span className="login-technology-heading">Technology ecosystem</span>
    <ul className="login-technology-logos" aria-label="Technology ecosystem">
      {technologies.map(technology => <li key={technology.name}>
        <a href={technology.url} target="_blank" rel="noopener noreferrer" aria-label={`${technology.name} (opens in a new tab)`} title={technology.name}>
          <img src={`/brand/technology/${technology.file}`} alt={technology.name} width={40} height={32}/>
        </a>
      </li>)}
    </ul>
    <div className="login-technology-meta">
      <nav aria-label="Privacy and support"><button type="button" onClick={() => privacyDialog.current?.showModal()} aria-haspopup="dialog">Privacy</button><span aria-hidden="true">·</span><a href="mailto:support@trilora.net">Support</a></nav>
      <span>© {new Date().getFullYear()} Trilora</span>
    </div>
    <dialog ref={privacyDialog} className="login-privacy-dialog" aria-labelledby="privacy-title" onClick={event => { if (event.target === privacyDialog.current) privacyDialog.current.close(); }}>
      <div className="login-privacy-content">
        <form method="dialog"><button className="signup-dialog-close" aria-label="Close privacy information"><X size={18}/></button></form>
        <span className="signup-dialog-kicker">LATTICE WORKSPACE</span>
        <h3 id="privacy-title">Privacy enquiries</h3>
        <p>For information about how your account and workspace data are handled, or to make a privacy request, contact your workspace administrator or Trilora support.</p>
        <a href="mailto:support@trilora.net?subject=Lattice%20privacy%20enquiry">support@trilora.net</a>
      </div>
    </dialog>
  </footer>;
}
