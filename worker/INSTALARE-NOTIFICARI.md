# Notificări PUPITRU — instalarea serviciului (gratuit, ~15 minute)

Serviciul trimite notificările la ora potrivită, chiar dacă aplicația e închisă.
Rulează pe Cloudflare Workers, plan gratuit (100.000 cereri/zi — tu vei folosi câteva sute).

Fă pașii de pe calculator; pe telefon rămâne doar apăsarea butonului „Activează".

---

## 1. Cont Cloudflare
1. Intră pe https://dash.cloudflare.com/sign-up și creează cont gratuit (fără card).
2. Confirmă adresa de e-mail.

## 2. Creează spațiul de stocare (KV)
1. În panou: **Storage & Databases → KV → Create instance**.
2. Nume: `PUPITRU_KV` → **Create**.

## 3. Creează Worker-ul
1. **Compute (Workers) → Create → Start with Hello World → Deploy**.
2. Nume sugerat: `pupitru-push`. Reține adresa afișată, de forma
   `https://pupitru-push.NUMELE-TAU.workers.dev`.
3. Apasă **Edit code**, șterge tot din editor și lipește conținutul fișierului `worker.js`.
   **Deploy**.

## 4. Leagă stocarea și cheile
În Worker → **Settings**:

**Bindings → Add → KV namespace**
- Variable name: `PUSH_KV`
- KV namespace: `PUPITRU_KV`

**Variables and Secrets → Add** (trei intrări):

| Nume | Tip | Valoare |
|---|---|---|
| `VAPID_PUBLIC` | Text | cheia publică din `vapid-keys.json`, câmpul `public` |
| `VAPID_PRIVATE_JWK` | **Secret** | întreg obiectul `private` din `vapid-keys.json`, pe un singur rând: `{"kty":"EC","crv":"P-256","d":"...","x":"...","y":"..."}` |
| `VAPID_SUBJECT` | Text | `mailto:` + adresa ta de e-mail |

**Deploy** după fiecare modificare.

## 5. Pornește ceasul (cron)
Worker → **Settings → Triggers → Cron Triggers → Add Cron Trigger**
- Expresie: `*/5 * * * *`  (verifică la fiecare 5 minute)
- **Add** → **Deploy**.

## 6. Verifică
Deschide în browser: `https://ADRESA-TA.workers.dev/api/health`
Trebuie să răspundă `{"ok":true,...}` și să afișeze cheia publică.

## 7. Activează pe iPhone
1. Deschide PUPITRU **de pe ecranul principal** (nu din Safari — iOS acceptă notificări doar pentru aplicația instalată).
2. Tab **Evoluție → Notificări**.
3. Lipește adresa serviciului → **Activează** → acceptă permisiunea.
4. Apasă **Test**. În câteva secunde trebuie să apară notificarea.

---

## Ce notificări primești
- **Sumarul zilei** la ora aleasă: câte task-uri au termen azi și câte sunt restante.
- **Reamintirea restanțelor** după-amiaza, cu cel mai vechi task și vechimea lui.
- **Termenele task-urilor**: dimineața pentru cele fără oră, cu 30 de minute înainte pentru cele cu interval orar.

Aplicația trimite serviciului programul următoarelor 7 zile, de fiecare dată când o deschizi.
**Deschide aplicația măcar o dată la câteva zile**, altfel programul se consumă și notificările se opresc.

## Confidențialitate
În mod normal, denumirile task-urilor ajung pe serviciul tău Cloudflare (contul tău, nimeni altcineva).
Dacă preferi să nu plece deloc, pune **Conținut → Doar cifre**: notificările vor spune
„3 task-uri restante, cel mai vechi de 6 zile", fără nume de proiecte sau task-uri.

## Dacă notificările se opresc
- iOS poate revoca abonamentul după o perioadă lungă fără folosire: apasă din nou **Activează**.
- Dacă ai reinstalat aplicația pe ecranul principal, abonamentul vechi dispare — reactivează.
- Verifică în iPhone: **Setări → Notificări → PUPITRU**.
