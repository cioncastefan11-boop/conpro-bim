# De făcut (lista de idei păstrate pentru mai târziu)

## Retușuri la final
- **FAM completat automat din documente.** Constructorul atașează fișa tehnică și declarația de performanță, apasă „Completează din documente”, iar aplicația extrage producătorul, produsul, nr. și data DoP, specificația armonizată, marcajul CE și performanțele declarate, apoi pune lângă fiecare cerință din proiect valoarea declarată și o propunere de potrivire (decizia rămâne la proiectant și diriginte).
  - Varianta aleasă: citire cu inteligență artificială (Claude, prin API), ca să meargă și pe scanuri și pe formate diferite.
  - Cheia API stă ca secret în Supabase (funcție Edge), niciodată în browser.

## Etape următoare
- **Documente, completări posibile:** încărcarea mai multor documente deodată, transmitale, comentarii pe planșă la S3, documentele de management al informației (EIR, BEP, MIDP/TIDP).
- **Rezumatul pe e-mail:** de activat după pașii din `docs/REZUMAT-EMAIL.md`.
- **Înainte de prima lucrare reală: trecerea pe Supabase Pro** (copii de siguranță zilnice, fără oprire la inactivitate, 100 GB pentru fișiere), apoi ridicarea limitei pe fișier (comanda e în README, la 0.10).
- **Model 3D, completări posibile:** măsurători în model, vederi salvate, legarea unui element de PV-ul sau de FAM-ul lui, modele foarte mari (fragmentare).
- **Semnătura electronică, etapa 2:** semnarea direct din aplicație prin API-ul unui furnizor de semnătură în cloud.
- **Opțional:** rularea automată a scripturilor SQL în Supabase la fiecare unire în `main` (GitHub Actions, cu cheile ca secrete în GitHub).
