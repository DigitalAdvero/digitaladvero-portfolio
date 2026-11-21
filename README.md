# DigitalAdvero — Portfolio

Samostalna (standalone) portfolio web stranica za predstavljanje agencije **DigitalAdvero** potencijalnim klijentima i partnerima. Potpuno je odvojena od vaše postojeće web stranice i ne zavisi od nje.

- Cijela stranica je na bosanskom jeziku.
- Bez frameworka i bez build koraka: čisti HTML, CSS i JavaScript.
- Spremna za GitHub i Vercel (statička stranica).
- Responzivna (desktop, tablet, mobitel), SEO-optimizovana, s rezervnim prikazom za starije uređaje.

## Kako stranica radi

Cijela stranica je **jedno neprekidno putovanje** kroz 3D okno sačinjeno od ekrana (WebGL), vođeno skrolanjem:

| # | Faza putovanja | Šta se dešava |
|---|----------------|---------------|
| 01 | DigitalAdvero | Pogled odozgo u okno (zoetrop) i naziv „DigitalAdvero“ s kratkim opisom |
| 02 | O nama | Kamera se spušta niz okno i rotira; natpis „Svaki ekran je jedno digitalno rješenje.“ |
| 03 | Naše usluge | Natpis s 9 usluga dok se plavi pod na dnu približava |
| 04 | Portfolio / Projekti | Kamera se podiže prema zakrivljenom zidu; ekrani se jedan po jedan skidaju sa zida (indeks desno, naslov dolje lijevo) |
| 05 | Zašto DigitalAdvero? | Kamera se vraća gore kroz okno; natpis s 5 prednosti |
| 06 | Kako radimo? | Natpis sa 6 faza rada |
| 07 | Kontakt | Izlaz iznad okna: „Vaš projekat, sljedeći na zidu.“ i dugme „Započnite projekat“ (kontakt podaci i forma) |

Gore desno je „Indeks“ — brza navigacija do svake faze i svakog projekta.

> **Važno o projektima:** šest prikazanih projekata su **demo koncepti** s izmišljenim brendovima (Lumea, Marena, Kovir, Vigor, Atrio, Verdea). Na stranici su jasno označeni oznakom „Demo koncept“ i ne predstavljaju stvarne klijente. Zamijenite ih stvarnim projektima kada budete spremni (upute ispod).

## Struktura projekta

```
digitaladvero-portfolio/
├── index.html              ← sav sadržaj stranice (tekstovi, usluge, projekti)
├── 404.html                ← stranica „nije pronađeno“
├── assets/
│   ├── css/style.css       ← dizajn (boje, fontovi, animacije)
│   ├── js/
│   │   ├── config.js       ← ★ VAŠI KONTAKT PODACI I DRUŠTVENE MREŽE
│   │   ├── main.js         ← kamera po skrolu, projekti, indeks, forma
│   │   ├── stage.js        ← 3D scena (okno i zid od ekrana)
│   │   └── vendor/         ← Lenis (glatko skrolanje, MIT licenca)
│   ├── fonts/              ← Instrument Serif i Geist (OFL licenca, lokalno)
│   └── images/
│       ├── projects/       ← slike projekata (po jedna mapa za svaki projekat)
│       ├── brand/          ← favicon i ikone
│       └── og-image.jpg    ← slika koja se prikazuje kad podijelite link
├── site.webmanifest
├── robots.txt
├── vercel.json             ← podešavanja za Vercel (keširanje, sigurnosna zaglavlja)
└── .gitignore
```

## 1. Upišite svoje kontakt podatke (obavezno prije objave)

Otvorite `assets/js/config.js` u bilo kojem uređivaču teksta (npr. Notepad, VS Code) i upišite svoje podatke između navodnika:

```js
email: "info@vasadomena.ba",
phone: "+387 6X XXX XXX",
whatsapp: "3876XXXXXXX",
social: {
  instagram: "https://www.instagram.com/vas.profil",
  ...
}
```

- Polja koja ostavite prazna (`""`) se jednostavno ne prikazuju.
- Dok kontakt nije upisan, na lokalnom pregledu vidite žutu napomenu u donjem lijevom uglu (na objavljenoj stranici se ne prikazuje).

**Kontakt forma** radi na jedan od dva načina:
1. **Bez dodatnih servisa (zadano):** klik na „Pošalji upit“ otvara e-mail program posjetioca s već popunjenom porukom na vašu adresu iz polja `email` (ili WhatsApp, ako e-mail nije upisan).
2. **Direktno slanje na vaš e-mail (preporučeno):** napravite besplatan obrazac na [formspree.io](https://formspree.io), kopirajte endpoint (npr. `https://formspree.io/f/abcdwxyz`) i upišite ga u `form.endpoint`. Poruke tada stižu direktno u vaš inbox.

## 2. Pregled na vašem računaru

Najjednostavnije je otvoriti `index.html` dvostrukim klikom. Zbog sigurnosnih pravila preglednika 3D paneli tada prikazuju samo tipografske panele, bez slika projekata. Za potpun prikaz pokrenite mali lokalni server u mapi projekta:

```bash
python3 -m http.server 8080
```

ili, ako imate Node.js:

```bash
npx serve .
```

Zatim otvorite `http://localhost:8080` u pregledniku.

## 3. Objava na GitHub

**Opcija A — preko web stranice (bez instalacije programa):**

1. Prijavite se na [github.com](https://github.com) i kliknite **New** (novi repozitorij).
2. Upišite naziv, npr. `digitaladvero-portfolio`, odaberite **Public** ili **Private** i kliknite **Create repository** (bez dodavanja README datoteke).
3. Na stranici novog repozitorija kliknite link **uploading an existing file**.
4. Otvorite mapu `digitaladvero-portfolio` na računaru, označite **sav njen sadržaj** (datoteke i mape, ne samu mapu) i prevucite ga u preglednik.
5. Kliknite **Commit changes**.

> Datoteke koje počinju tačkom (`.gitignore`) su na nekim sistemima skrivene. Nisu neophodne za rad stranice.

**Opcija B — preko terminala (Git):**

```bash
cd digitaladvero-portfolio
```

```bash
git init
```

```bash
git add .
```

```bash
git commit -m "DigitalAdvero portfolio"
```

```bash
git branch -M main
```

```bash
git remote add origin https://github.com/VAS-PROFIL/digitaladvero-portfolio.git
```

```bash
git push -u origin main
```

## 4. Objava na Vercel

1. Prijavite se na [vercel.com](https://vercel.com) putem svog GitHub računa.
2. Kliknite **Add New… → Project**.
3. Pronađite repozitorij `digitaladvero-portfolio` i kliknite **Import**.
4. Podešavanja ostavite kako jesu:
   - **Framework Preset:** `Other`
   - **Build Command:** prazno
   - **Output Directory:** prazno (korijen projekta)
5. Kliknite **Deploy**. Za manje od minute dobijate link oblika `https://digitaladvero-portfolio.vercel.app`.
6. (Opcionalno) Vlastita domena: u projektu na Vercelu otvorite **Settings → Domains**, dodajte domenu ili poddomenu (npr. `portfolio.vasadomena.ba`) i kod svog registra domene dodajte DNS zapis koji Vercel prikaže.

Svaka nova izmjena koju pošaljete na GitHub automatski se objavljuje na Vercelu.

## 5. Nakon objave (preporučeno)

1. **Slika za dijeljenje linka:** u `index.html` pronađite red s `og:image` i zamijenite relativnu putanju punim linkom, npr. `https://digitaladvero-portfolio.vercel.app/assets/images/og-image.jpg`. Tada Facebook, WhatsApp, LinkedIn i Viber prikazuju lijep pregled kad podijelite link.
2. **Sitemap (opcionalno):** kada znate konačnu domenu, možete dodati `sitemap.xml` i na kraj `robots.txt` dopisati `Sitemap: https://vasa-domena/sitemap.xml`.

## 6. Dodavanje novog (stvarnog) projekta

1. Napravite mapu `assets/images/projects/naziv-projekta/` i u nju stavite slike u WebP ili JPG formatu:

   | Datoteka | Preporučena veličina | Namjena |
   |----------|----------------------|---------|
   | `cover.webp` | 1600 × 1000 px | glavni prikaz projekta |
   | `cover-sm.webp` | 800 × 500 px | mobiteli i 3D paneli |
   | `mobile.webp` | ~640 px širine | prikaz na telefonu (u detaljima) |
   | `detail.webp` | 1600 × 1000 px | dodatni prikaz (u detaljima) |

   Ako nemate sve slike, koristite istu sliku više puta. Besplatni alat za pretvaranje u WebP: [squoosh.app](https://squoosh.app).

2. U `index.html` pronađite komentar **DODAVANJE NOVOG PROJEKTA**, kopirajte cijeli blok `<article class="project" …> … </article>` i zalijepite ga ispod postojećih.
3. U kopiranom bloku promijenite:
   - `id="projekat-…"` (jedinstven naziv),
   - `data-accent="#…"` (boja okvira kartice kad se skine sa zida),
   - `data-cover` i `data-cover-sm` (putanje do slika), te sliku u `<figure>`,
   - naslov, kategoriju, opis i sadržaj detalja (`<template>` s galerijom i funkcionalnostima).
4. **Za stvarne projekte obrišite** `<span class="badge">Demo koncept</span>` iz bloka. Prozor s detaljima tada automatski skriva napomenu o demo konceptu.
5. Indeks, lista projekata i 3D zid automatski preuzimaju novi projekat i njegove slike — ništa drugo ne trebate mijenjati.

Kada dodate stvarne projekte, demo koncepte možete obrisati (cijeli `<article>` blok i odgovarajuću mapu slika). Ako uklonite sve demo koncepte, obrišite i napomenu `<p class="demo-note">…</p>` na početku sekcije projekata.

## 7. Uređivanje tekstova i boja

- **Tekstovi** (naslov, natpisi tokom putovanja, završni ekran) nalaze se u `index.html`; svaka faza je označena komentarom (`01 — DigitalAdvero`, `02 — O nama` …).
- **Boje i fontovi** su na vrhu `assets/css/style.css` (sekcija „02. Varijable“).
- **SEO naslov i opis** su u `<head>` dijelu `index.html` (`<title>` i `<meta name="description">`).

## Tehničke napomene

- **Performanse:** jedna WebGL scena (bez vanjskih biblioteka) za cijelo putovanje; slike su u WebP formatu (ukupno manje od 1 MB); fontovi su lokalni. Na mobitelima se automatski smanjuje rezolucija 3D scene.
- **Pristupačnost:** semantički HTML, navigacija tastaturom, vidljiv fokus, poštuje postavku „smanjeno kretanje“ (prefers-reduced-motion), opisni `alt` tekstovi.
- **Rezervni prikaz:** bez WebGL podrške prikazuje se jednostavna CSS verzija zoetropa, a bez JavaScripta sav sadržaj ostaje dostupan kao obična stranica.
- **Podržani preglednici:** savremene verzije Chrome, Edge, Safari i Firefox (desktop i mobilni).

## Licence

- Fontovi **Instrument Serif** i **Geist / Geist Mono** — SIL Open Font License 1.1 (licence su u `assets/fonts/`).
- **Lenis** (glatko skrolanje) — MIT licenca (`assets/js/vendor/LICENSE-lenis.txt`).
- Svi vizuali, ilustracije i demo koncepti kreirani su originalno za ovaj projekat, bez fotografija ili materijala trećih strana.
