import { useState } from 'react';
import { createPortal } from 'react-dom';
import Tree from 'react-d3-tree';
import { X, Maximize2 } from 'lucide-react';

interface MindMapChartProps {
  transactions: any[];
  taxonomy: any;
}

const renderCustomNodeElement = ({ nodeDatum, toggleNode }: any) => {
  const isRoot = nodeDatum.name === 'Movimientos';
  const rootTipo = nodeDatum.attributes?.rootTipo;
  const isIngreso = nodeDatum.name === 'Ingreso' || rootTipo === 'Ingreso';
  const isEgreso = nodeDatum.name === 'Egreso' || rootTipo === 'Egreso';
  const amount = nodeDatum.attributes?.amount as number || 0;
  
  let fill = '#ffffff';
  let stroke = '#000000';
  
  if (isRoot) {
    fill = '#3b82f6';
    stroke = '#2563eb';
  } else if (isIngreso) {
    fill = '#22c55e';
    stroke = '#16a34a';
  } else if (isEgreso) {
    fill = '#ef4444';
    stroke = '#dc2626';
  }

  const formattedAmount = amount > 0 ? `$${amount.toLocaleString('es-CL')}` : '';

  return (
    <g>
      <circle r="12" fill={fill} stroke={stroke} strokeWidth="3" onClick={toggleNode} style={{ cursor: 'pointer' }} />
      <text 
        fill="black" 
        stroke="white"
        strokeWidth="6" 
        paintOrder="stroke fill"
        x="18" 
        y={formattedAmount ? "-10" : "5"} 
        style={{ 
          fontSize: isRoot || nodeDatum.name === 'Ingreso' || nodeDatum.name === 'Egreso' ? '16px' : '14px', 
          fontWeight: isRoot || nodeDatum.name === 'Ingreso' || nodeDatum.name === 'Egreso' ? 800 : 500,
          fontFamily: '"Inter", sans-serif'
        }}
      >
        {nodeDatum.name}
      </text>
      {formattedAmount && (
        <text 
          fill={isIngreso ? '#15803d' : (isEgreso ? '#b91c1c' : '#1d4ed8')} 
          stroke="white"
          strokeWidth="6" 
          paintOrder="stroke fill"
          x="18" 
          y="10" 
          style={{ 
            fontSize: '13px', 
            fontWeight: 800,
            fontFamily: '"Inter", sans-serif'
          }}
        >
          {formattedAmount}
        </text>
      )}
    </g>
  );
};

const getDynamicPathClass = ({ target }: any) => {
  const rootTipo = target.data.attributes?.rootTipo;
  if (rootTipo === 'Ingreso') return 'link-ingreso';
  if (rootTipo === 'Egreso') return 'link-egreso';
  return 'link-default';
};

export default function MindMapChart({ transactions, taxonomy }: MindMapChartProps) {
  const [zoom, setZoom] = useState(0.8);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Compute totals per category
  const totals = {
    Ingreso: 0,
    Egreso: 0,
    principales: {} as Record<string, number>,
    secundarias: {} as Record<string, number>
  };

  transactions.forEach(t => {
    if (t.tipo_movimiento) {
      const amount = Math.abs(t.amount);
      if (t.tipo_movimiento === 'Ingreso' || t.tipo_movimiento === 'Ingreso Real') {
        totals.Ingreso += amount;
      } else {
        totals.Egreso += amount;
      }
      
      const tipoBase = (t.tipo_movimiento === 'Ingreso' || t.tipo_movimiento === 'Ingreso Real') ? 'Ingreso' : 'Egreso';
      const prinKey = `${tipoBase}-${t.categoria_principal}`;
      const secKey = `${prinKey}-${t.categoria_secundaria}`;
      
      totals.principales[prinKey] = (totals.principales[prinKey] || 0) + amount;
      totals.secundarias[secKey] = (totals.secundarias[secKey] || 0) + amount;
    }
  });

  const treeData = {
    name: 'Movimientos',
    attributes: { amount: totals.Ingreso + totals.Egreso, rootTipo: 'Root' },
    children: Object.entries(taxonomy)
      .filter(([tipo]) => tipo === 'Ingreso' || tipo === 'Egreso')
      .map(([tipo, principals]) => ({
      name: tipo,
      attributes: { rootTipo: tipo, amount: tipo === 'Ingreso' ? totals.Ingreso : totals.Egreso },
      children: Object.entries(principals as Record<string, string[]>).map(([principal, secundarias]) => ({
        name: principal,
        attributes: { rootTipo: tipo, amount: totals.principales[`${tipo}-${principal}`] || 0 },
        children: secundarias.map(sec => ({ 
          name: sec, 
          attributes: { rootTipo: tipo, amount: totals.secundarias[`${tipo}-${principal}-${sec}`] || 0 } 
        }))
      }))
    }))
  };

  const treeProps = {
    data: treeData,
    orientation: "horizontal" as const,
    pathFunc: "diagonal" as const,
    pathClassFunc: getDynamicPathClass,
    translate: { x: 100, y: isModalOpen ? window.innerHeight / 2 : 250 },
    nodeSize: { x: 180, y: 40 },
    zoomable: true,
    zoom: zoom,
    collapsible: true,
    separation: { siblings: 1.2, nonSiblings: 1.5 },
    renderCustomNodeElement: renderCustomNodeElement
  };

  const controls = (
    <div style={{ position: 'absolute', bottom: '1rem', right: '1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem', zIndex: 10 }}>
      <button type="button" onClick={() => setZoom(z => Math.min(z + 0.2, 2))} style={{ backgroundColor: '#fff', border: '2px solid #000', borderRadius: '8px', padding: '0.5rem', width: '40px', height: '40px', display: 'flex', justifyContent: 'center', alignItems: 'center', fontWeight: 900, cursor: 'pointer', boxShadow: '2px 2px 0px #000' }}>+</button>
      <button type="button" onClick={() => setZoom(z => Math.max(z - 0.2, 0.2))} style={{ backgroundColor: '#fff', border: '2px solid #000', borderRadius: '8px', padding: '0.5rem', width: '40px', height: '40px', display: 'flex', justifyContent: 'center', alignItems: 'center', fontWeight: 900, cursor: 'pointer', boxShadow: '2px 2px 0px #000' }}>-</button>
      <button type="button" onClick={() => setIsModalOpen(!isModalOpen)} style={{ backgroundColor: '#fff', border: '2px solid #000', borderRadius: '8px', padding: '0.5rem', width: '40px', height: '40px', display: 'flex', justifyContent: 'center', alignItems: 'center', fontWeight: 900, cursor: 'pointer', boxShadow: '2px 2px 0px #000' }}>
        {isModalOpen ? <X size={20} /> : <Maximize2 size={20} />}
      </button>
    </div>
  );

  return (
    <>
      <div style={{ position: 'relative', width: '100%', height: '500px', border: '2px solid black', borderRadius: '8px', background: '#f8fafc', overflow: 'hidden' }}>
        <Tree {...treeProps} />
        {controls}
      </div>
      
      {isModalOpen && createPortal(
        <div style={{ position: 'fixed', inset: 0, zIndex: 99999, backgroundColor: 'rgba(0,0,0,0.8)', padding: '2rem' }}>
          <div style={{ position: 'relative', width: '100%', height: '100%', backgroundColor: '#f8fafc', borderRadius: '12px', border: '4px solid black', overflow: 'hidden', boxShadow: '8px 8px 0px rgba(0,0,0,1)' }}>
            <Tree {...treeProps} />
            {controls}
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
