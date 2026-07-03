import React from 'react';

export default function Settings() {
  return (
    <div>
      <h1 style={{ marginBottom: '1.5rem' }}>Configuración</h1>
      <div className="card">
        <h3>Perfiles y Permisos</h3>
        <p style={{ marginTop: '0.5rem', color: 'var(--text-secondary)' }}>
          Aquí podrás gestionar quién tiene acceso a ver tus transacciones o configurar las categorías personalizadas.
        </p>
      </div>
    </div>
  );
}
