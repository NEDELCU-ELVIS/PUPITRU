# PUPITRU — instalare ca aplicație pe iPhone

Nu ai nevoie de Mac, de cont Apple Developer sau de App Store. Pași (o singură dată, ~10 minute):

## 1. Publică aplicația gratuit pe GitHub Pages
1. Intră pe github.com (cont gratuit, dacă nu ai deja).
2. Creează un repository nou, de exemplu `pupitru` (poate fi Public; datele TALE nu sunt aici — ele stau doar pe telefonul tău).
3. Apasă „Add file → Upload files" și urcă TOATE fișierele din această arhivă:
   `index.html`, `manifest.json`, `sw.js`, `icon-192.png`, `icon-512.png`, `apple-touch-icon.png`
4. Settings → Pages → Source: „Deploy from a branch" → Branch: `main`, folder `/ (root)` → Save.
5. După 1–2 minute, aplicația e live la: `https://NUMELE-TAU.github.io/pupitru/`

## 2. Instaleaz-o pe iPhone
1. Deschide adresa de mai sus în **Safari** (obligatoriu Safari, nu Chrome).
2. Apasă butonul **Partajare** (pătratul cu săgeată) → **„Adaugă la ecranul principal"**.
3. Gata: ai iconița PUPITRU pe ecran. Se deschide pe tot ecranul, ca o aplicație normală, și funcționează și fără internet.

## 3. Adu-ți datele din versiunea Claude (opțional)
1. În versiunea din Claude: Evoluție → „Copiază backup".
2. În aplicația instalată: Evoluție → „Importă backup" → lipește → OK.

## De știut
- Datele se salvează local, pe telefonul tău, și persistă atâta timp cât aplicația e pe ecranul principal.
- Fă periodic „Copiază backup" și salvează textul în Notes — e plasa ta de siguranță.
- Dacă vreodată vrei modificări la aplicație, trimite-mi fișierul `index.html` și ți-l actualizez.
