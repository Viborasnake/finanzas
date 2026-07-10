const fs = require('fs');
let code = fs.readFileSync('src/pages/Settings.tsx', 'utf-8');

if (!code.includes('ChevronUp')) {
  code = code.replace('ChevronDown, ', 'ChevronDown, ChevronUp, ');
}

const componentDef = `
const CollapsibleSection = ({ id, icon: Icon, title, subtitle, description, defaultCollapsed = true, className = "card settings-card settings-card-wide", children }: any) => {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  return (
    <div id={id} className={className} style={{ position: 'relative', zIndex: 9, padding: '1.25rem' }}>
      <div 
        onClick={() => setCollapsed(!collapsed)}
        style={{ cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
      >
        <div className="settings-section-title" style={{ margin: 0 }}>
          <Icon size={26} />
          <div>
            <h2 style={{ margin: 0, fontSize: '1.1rem' }}>{title}</h2>
            <span style={{ display: 'block', color: '#64748b', fontSize: '0.82rem', fontWeight: 800, marginTop: '0.25rem' }}>{subtitle}</span>
          </div>
        </div>
        <button className="btn btn-outline" type="button" style={{ padding: '0.5rem', border: '2px solid black' }}>
          {collapsed ? 'Mostrar' : 'Ocultar'}
        </button>
      </div>
      {!collapsed && (
        <div style={{ marginTop: '1.25rem' }}>
          {description && <p className="settings-muted">{description}</p>}
          {children}
        </div>
      )}
    </div>
  );
};
`;

if (!code.includes('CollapsibleSection =')) {
  code = code.replace('export default function Settings() {', componentDef + '\nexport default function Settings() {');
}

// 1. Mis Bancos
code = code.replace(
  /<div className="card settings-card settings-card-wide" style={{ position: 'relative', zIndex: 9 }}>\s*<div className="settings-section-title">\s*<Landmark size={26} \/>\s*<div>\s*<h2 id="bancos">Mis Bancos<\/h2>\s*<span>Primero elige con qué banco vas a trabajar<\/span>\s*<\/div>\s*<\/div>\s*<p className="settings-muted">\s*Administra los bancos que tienes conectados y define cuál es el banco principal para tus reportes globales\.\s*<\/p>/,
  '<CollapsibleSection id="bancos" icon={Landmark} title="Mis Bancos" subtitle="Primero elige con qué banco vas a trabajar" description="Administra los bancos que tienes conectados y define cuál es el banco principal para tus reportes globales." defaultCollapsed={false}>'
);
// Fix the closing div of Mis Bancos: It is right before {/* Ajuste de Inicio */}
code = code.replace(
  /<\/div>\s*\{\/\* Ajuste de Inicio \*\/\}/,
  '</CollapsibleSection>\n\n        {/* Ajuste de Inicio */}'
);

// 2. Detección Automática
code = code.replace(
  /<div className="card settings-card settings-card-wide">\s*<div className="settings-section-title">\s*<BadgeCheck size={26} \/>\s*<div>\s*<h2 id="deteccion">Detección Automática<\/h2>\s*<span>Tu RUT y auto-clasificación histórica<\/span>\s*<\/div>\s*<\/div>\s*<p className="settings-muted">\s*Ingresa tu RUT para que el sistema reconozca automáticamente las transferencias entre tus propias cuentas y no las sume como Egreso o Ingreso\.\s*<\/p>/,
  '<CollapsibleSection id="deteccion" icon={BadgeCheck} title="Detección Automática" subtitle="Tu RUT y auto-clasificación histórica" description="Ingresa tu RUT para que el sistema reconozca automáticamente las transferencias entre tus propias cuentas y no las sume como Egreso o Ingreso." defaultCollapsed={true}>'
);
code = code.replace(
  /<\/div>\s*\{\/\* Categorías Personalizadas \*\/\}/,
  '</CollapsibleSection>\n\n        {/* Categorías Personalizadas */}'
);

// 3. Mis Categorías
code = code.replace(
  /<div className="card settings-card settings-card-wide">\s*<div className="settings-section-title">\s*<Tags size={26} \/>\s*<div>\s*<h2 id="categorias">Mis Categorías<\/h2>\s*<span>Categorías personalizadas para este banco<\/span>\s*<\/div>\s*<\/div>\s*<p className="settings-muted">\s*Agrega nuevas categorías para organizar tus movimientos\. Estas se sumarán a la lista base que ya trae la aplicación\.\s*<\/p>/,
  '<CollapsibleSection id="categorias" icon={Tags} title="Mis Categorías" subtitle="Categorías personalizadas para este banco" description="Agrega nuevas categorías para organizar tus movimientos. Estas se sumarán a la lista base que ya trae la aplicación." defaultCollapsed={true}>'
);
code = code.replace(
  /<\/div>\s*\{\/\* Reglas de Clasificación \*\/\}/,
  '</CollapsibleSection>\n\n        {/* Reglas de Clasificación */}'
);

// 4. Reglas de Clasificación
code = code.replace(
  /<div className="card settings-card settings-card-wide settings-card-tall">\s*<div className="settings-section-title">\s*<Wand2 size={26} \/>\s*<div>\s*<h2 id="reglas">Reglas de Clasificación<\/h2>\s*<span>Filtros y palabras clave para este banco<\/span>\s*<\/div>\s*<\/div>\s*<p className="settings-muted">\s*Define reglas para que las transacciones se clasifiquen automáticamente según palabras clave en su descripción\.\s*<\/p>/,
  '<CollapsibleSection id="reglas" icon={Wand2} title="Reglas de Clasificación" subtitle="Filtros y palabras clave para este banco" description="Define reglas para que las transacciones se clasifiquen automáticamente según palabras clave en su descripción." className="card settings-card settings-card-wide settings-card-tall" defaultCollapsed={true}>'
);
code = code.replace(
  /<\/div>\s*\{\/\* Contactos Frecuentes \*\/\}/,
  '</CollapsibleSection>\n\n        {/* Contactos Frecuentes */}'
);

// 5. Contactos Frecuentes
code = code.replace(
  /<div className="card settings-card settings-card-wide">\s*<div className="settings-section-title">\s*<Users size={26} \/>\s*<div>\s*<h2 id="contactos">Contactos Frecuentes<\/h2>\s*<span>Nombres y RUTs de tus contactos<\/span>\s*<\/div>\s*<\/div>\s*<p className="settings-muted">\s*Agrega RUTs de amigos o familiares\. Cuando importes, el sistema clasificará automáticamente los traspasos a ellos como "Transferencias a Otras Personas"\.\s*<\/p>/,
  '<CollapsibleSection id="contactos" icon={Users} title="Contactos Frecuentes" subtitle="Nombres y RUTs de tus contactos" description="Agrega RUTs de amigos o familiares. Cuando importes, el sistema clasificará automáticamente los traspasos a ellos como \'Transferencias a Otras Personas\'." defaultCollapsed={true}>'
);
code = code.replace(
  /<\/div>\s*\{\/\* Mis Gastos Fijos \*\/\}/,
  '</CollapsibleSection>\n\n        {/* Mis Gastos Fijos */}'
);

// 6. Mis Gastos Fijos
code = code.replace(
  /<div className="card settings-card settings-card-wide">\s*<div className="settings-section-title">\s*<CalendarCheck size={26} \/>\s*<div>\s*<h2 id="cuentas">Mis Gastos Fijos \(Cuentas\)<\/h2>\s*<span>Cuentas mensuales, créditos y suscripciones<\/span>\s*<\/div>\s*<\/div>\s*<p className="settings-muted">\s*Define tus gastos fijos mensuales para hacerles seguimiento en la pestaña Cuentas\.\s*<\/p>/,
  '<CollapsibleSection id="cuentas" icon={CalendarCheck} title="Mis Gastos Fijos (Cuentas)" subtitle="Cuentas mensuales, créditos y suscripciones" description="Define tus gastos fijos mensuales para hacerles seguimiento en la pestaña Cuentas." defaultCollapsed={true}>'
);
code = code.replace(
  /<\/div>\s*\{\/\* Danger Zone \*\/\}/,
  '</CollapsibleSection>\n\n        {/* Danger Zone */}'
);

fs.writeFileSync('src/pages/Settings.tsx', code);
console.log('done');
