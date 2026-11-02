# De făcut (lista de idei păstrate pentru mai târziu)

## Retușuri la final
- **FAM completat automat din documente.** Constructorul atașează fișa tehnică și declarația de performanță, apasă „Completează din documente”, iar aplicația extrage producătorul, produsul, nr. și data DoP, specificația armonizată, marcajul CE și performanțele declarate, apoi pune lângă fiecare cerință din proiect valoarea declarată și o propunere de potrivire (decizia rămâne la proiectant și diriginte).
  - Varianta aleasă: citire cu inteligență artificială (Claude, prin API), ca să meargă și pe scanuri și pe formate diferite.
  - Cheia API stă ca secret în Supabase (funcție Edge), niciodată în browser.

## Etape următoare
- **Documente, completări posibile:** convenția de denumire salvată pe proiect (listă de inițiatori, volume, niveluri), încărcarea mai multor documente deodată, transmitale.
- **Vizualizarea modelului IFC în browser** și preluarea nivelurilor, spațiilor și echipamentelor în COBie. Atenție la limita de 50 MB pe fișier din planul gratuit Supabase.
- **Semnătura electronică, etapa 2:** semnarea direct din aplicație prin API-ul unui furnizor de semnătură în cloud.
- **Opțional:** rularea automată a scripturilor SQL în Supabase la fiecare unire în `main` (GitHub Actions, cu cheile ca secrete în GitHub).
