export interface ClassificationRule {
  id: string;
  keyword: string;
  tipo_movimiento: string;
  categoria_principal: string;
  categoria_secundaria: string;
}

export const applyRules = (description: string, rules: ClassificationRule[]) => {
  const descLower = description.toLowerCase();

  for (const rule of rules) {
    if (descLower.includes(rule.keyword.toLowerCase())) {
      return {
        tipo_movimiento: rule.tipo_movimiento,
        categoria_principal: rule.categoria_principal,
        categoria_secundaria: rule.categoria_secundaria
      };
    }
  }

  return null;
};
