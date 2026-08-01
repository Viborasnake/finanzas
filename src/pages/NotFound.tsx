import { ArrowLeft, LayoutDashboard } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function NotFound() {
  const navigate = useNavigate();

  return (
    <section className="route-error" role="status" aria-labelledby="not-found-title" style={{ maxWidth: 720, margin: 'clamp(2rem, 8vh, 6rem) auto' }}>
      <div style={{ fontSize: 'clamp(3rem, 10vw, 6rem)', fontWeight: 900, lineHeight: 1 }} aria-hidden="true">404</div>
      <div>
        <h1 id="not-found-title" style={{ margin: 0 }}>Esta página no existe</h1>
        <p>La dirección puede estar incompleta o pertenecer a una versión anterior de MisFinanzas.</p>
      </div>
      <div className="route-error-actions">
        <button type="button" className="btn btn-outline" onClick={() => navigate(-1)}>
          <ArrowLeft size={18} aria-hidden="true" />
          Volver
        </button>
        <button type="button" className="btn btn-primary" onClick={() => navigate('/', { replace: true })}>
          <LayoutDashboard size={18} aria-hidden="true" />
          Ir al dashboard
        </button>
      </div>
    </section>
  );
}
