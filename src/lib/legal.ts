// Datele operatorului și versiunea curentă a textelor juridice.
// La o versiune nouă a termenilor sau a politicii: schimbați VERSIUNE_TERMENI (data publicării)
// și fiecare utilizator le va accepta din nou la prima intrare.
export const VERSIUNE_TERMENI = '2026-11-02';

// Datele de mai jos se completează înainte de folosirea în producție (un câmp gol apare evidențiat în pagină).
export const OPERATOR: Record<string, string> = {
  OPERATOR_NUME: 'Conpro Solutions SRL',
  OPERATOR_CUI: '',
  OPERATOR_REG: '',
  OPERATOR_SEDIU: '',
  OPERATOR_EMAIL: '',
  OPERATOR_REPREZENTANT: '',
  LIMITA_RASPUNDERE: '',
  PRET: '',
};

/** Înlocuiește {{CAMP}} cu datele operatorului și [[VERSIUNE]] cu versiunea; câmpurile necompletate rămân marcate. */
export function completeaza(text: string): string {
  return text
    .replace(/\[\[VERSIUNE\]\]/g, VERSIUNE_TERMENI.split('-').reverse().join('.'))
    .replace(/\{\{([A-Z_]+)\}\}/g, (_, k: string) => OPERATOR[k]?.trim() ? OPERATOR[k] : `[[${k.toLowerCase().replace(/_/g, ' ')}]]`);
}
