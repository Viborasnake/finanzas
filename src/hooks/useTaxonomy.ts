import { useMemo } from 'react';
import { useSettings } from '../contexts/settingsContextValue';
import { BASE_TAXONOMY } from '../utils/baseTaxonomy';

export { BASE_TAXONOMY } from '../utils/baseTaxonomy';

export function useTaxonomy() {
  const { customCategories } = useSettings();

  const taxonomy = useMemo(() => {
    const merged = JSON.parse(JSON.stringify(BASE_TAXONOMY));

    customCategories?.forEach(cat => {
      if (cat.tipo === 'Movimiento Interno') return;
      if (!merged[cat.tipo]) merged[cat.tipo] = {};
      if (!merged[cat.tipo][cat.principal]) merged[cat.tipo][cat.principal] = [];
      
      cat.secundarias.forEach(sec => {
        if (!merged[cat.tipo][cat.principal].includes(sec)) {
          merged[cat.tipo][cat.principal].push(sec);
        }
      });
    });

    return merged;
  }, [customCategories]);

  const allOptions = useMemo(() => {
    return Object.entries(taxonomy).flatMap(([tipo, principals]) => 
      Object.entries(principals as Record<string, string[]>).flatMap(([principal, secundarias]) => 
        secundarias.map(secundaria => ({
          label: secundaria === principal ? principal : `${secundaria} (${principal})`,
          tipo,
          principal,
          secundaria
        }))
      )
    );
  }, [taxonomy]);

  return { taxonomy, allOptions };
}
