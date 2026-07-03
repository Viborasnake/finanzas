import React from 'react';

export default function Dashboard() {
  return (
    <div>
      <h1 style={{ marginBottom: '1.5rem' }}>Dashboard</h1>
      <div className="card">
        <h2>Resumen Mensual</h2>
        <p style={{ color: 'var(--text-secondary)', marginTop: '0.5rem' }}>
          Aquí irán los gráficos y el resumen de ingresos y egresos.
        </p>
      </div>
    </div>
  );
}
