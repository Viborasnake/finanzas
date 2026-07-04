export interface ClassificationRule {
  id: string;
  keyword: string;
  tipo_movimiento: string;
  categoria_principal: string;
  categoria_secundaria: string;
}

const STORAGE_KEY = 'finanzas_classification_rules';

export const getRules = (): ClassificationRule[] => {
  const data = localStorage.getItem(STORAGE_KEY);
  return data ? JSON.parse(data) : [];
};

export const saveRules = (rules: ClassificationRule[]) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(rules));
};

export const applyRules = (description: string, rules?: ClassificationRule[]) => {
  const currentRules = rules || getRules();
  const descLower = description.toLowerCase();

  for (const rule of currentRules) {
    if (descLower.includes(rule.keyword.toLowerCase())) {
      return {
        tipo_movimiento: rule.tipo_movimiento,
        categoria_principal: rule.categoria_principal,
        categoria_secundaria: rule.categoria_secundaria
      };
    }
  }

  return null; // No rule matched
};
