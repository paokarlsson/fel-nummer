# Fel nummer – specifikation

> Ett interaktivt deckaräventyr som utspelar sig i sms. Du har fått ett nytt kontantkort, och numret har tillhört någon annan. Sms:en är inte till dig.

**Repo:** `fel-nummer`
**Publiceras på:** `https://<användare>.github.io/fel-nummer/`
**Status:** v1-spec, baserad på den spelbara prototypen (artefakten "Lottogänget", sms-versionen)

---

## 1. Mål och avgränsningar

### Mål
- Ett spel som körs helt i webbläsaren och ligger som statisk sajt på GitHub Pages.
- Ingen server och inget konto. All data lagras lokalt hos spelaren.
- Spelaren klistrar in sin egen API-nyckel. Nyckeln skickas bara till LLM-leverantören.
- Spelet kan installeras som webbapp (PWA) på mobil och dator och känns då som en egen sms-app.
- Personerna i spelet är självstyrande LLM-agenter. Det finns **ingen AI-regissör**, bara regler, en klocka, schemalagda händelser och personernas egna hemligheter och mål.
- Motorn är skild från berättelserna: ett fall är en datafil, och nya fall kan läggas till utan kodändring.

### Inte i v1
- Riktiga push-notiser när appen är stängd (kräver server, se 9.3).
- Konton, synk mellan enheter, topplistor.
- Flerspelarläge.
- Genererade bilder via API (bilder i fallen är handritade SVG:er).
- Andra LLM-leverantörer än Anthropic (gränssnittet förbereds för det, se 6.1).

---

## 2. Spelupplevelse

### 2.1 Grundidén
- Spelaren ser en sms-app: en lista med konversationer och en vy för varje konversation.
- Alla avsändare visas som **okända nummer** tills spelaren sparar dem som kontakter och döper dem själv (t.ex. "Advokaten?").
- Personerna tror att de skriver till någon annan (den förra ägaren av numret) tills de förstår eller får veta att det är en främling.
- Personerna ser **bara sina egna sms med spelaren** (och gruppchattar de är med i). Allt de vet om varandra kommer från spelaren, därför är **vidarebefordran** spelets viktigaste verktyg.

### 2.2 Spelarens verktyg
| Funktion | Beskrivning |
|---|---|
| Skicka sms | Fritext i valfri konversation. |
| Spara kontakt / byt namn | Ger ett nummer ett namn och en färg på avataren. |
| Vidarebefordra | Skicka vilket mottaget sms som helst till en annan konversation. Mottagaren ser ursprungsnumret. |
| Spola fram | Hoppa till nästa schemalagda händelse. |
| Paus | Stoppar klockan och agenterna. |
| Tempo | *Lugnt* (standard), *Normalt*, *Snabbt*. Påverkar alla väntetider. |
| Peka ut | Avsluta och anklaga någon. Finns alltid. |
| Bakom kulisserna | Valfri panel (märkt "spoilers") som visar varje agents stress, kvot, status och en logg över vem som ville svara och hur gärna. |

### 2.3 Detaljer i sms-appen som är en del av spelet
- "skriver…" medan en agent formulerar sig, ungefär så länge det tar att skriva meddelandet.
- Raderade meddelanden: visas några sekunder och ersätts sedan med *"Detta meddelande har raderats"*.
- Flera sms i rad från samma person, med pauser mellan.
- Leveransstatus: ✓✓ levererat, ✓ ej levererat (t.ex. till en död persons nummer).
- Bilder (SVG) och länkkort (nyhetsartiklar) i chatten.
- Gruppchattar som skapas under spelets gång, med medlemmar som visas med nummer eller sparade namn.
- Dagavdelare ("Lördag", "Söndag" …) och tidsstämplar i speltid.

### 2.4 Tidslägen
- **Komprimerad tid (standard):** speltiden står still medan det händer saker och hoppar framåt efter ca 30–50 s tystnad (beroende på tempo). Ett fall tar 1–2 timmar.
- **Realtid (valbar):** speltiden följer klockan. Ett fall pågår en vecka. När spelaren öppnar appen igen körs det som har hänt i bakgrunden ikapp (se 5.6).

### 2.5 Slut
- Fallet har en schemalagd slutpunkt, och spelaren kan också själv välja **Peka ut**.
- Slutet beror på vem spelaren pekar ut och ibland på tidigare val (t.ex. att åka till stugan).
- Efter slutet visas **"Det här hände egentligen"**: hela tidslinjen och allas hemligheter.

---

## 3. Teknisk översikt

### 3.1 Stack
- **Vite + TypeScript**, inget ramverk (eller Preact om gränssnittet växer). Liten bundle, snabb laddning.
- **ES-moduler**, inga externa runtime-beroenden förutom ev. `idb` (tunn IndexedDB-wrapper).
- **Vitest** för enhetstester.
- **GitHub Actions** bygger och publicerar till GitHub Pages vid push till `main`.
- Vite `base: '/fel-nummer/'` så att sökvägar, service worker och manifest fungerar under undersökvägen.

### 3.2 Mappstruktur
```
fel-nummer/
├─ index.html
├─ public/
│  ├─ manifest.webmanifest
│  ├─ icons/                 # 192, 512, maskable, apple-touch-icon
│  └─ cases/
│     └─ lottoganget/
│        ├─ case.json        # fallets data (se kap. 4)
│        └─ images/          # SVG:er som används i sms
├─ src/
│  ├─ main.ts                # start, routing mellan vyer
│  ├─ engine/
│  │  ├─ clock.ts            # speltid, tidslägen, ikapp-körning
│  │  ├─ scheduler.ts        # händelsekö, jobbkö (pump)
│  │  ├─ turns.ts            # vem som får skriva (se 5.3)
│  │  ├─ agent.ts            # kör en agenttur: prompt → svar → meddelanden
│  │  ├─ prompt.ts           # bygger agentprompten
│  │  ├─ guards.ts           # spärrar (erkännanden, längd, kanal)
│  │  └─ state.ts            # speltillstånd, typer
│  ├─ llm/
│  │  ├─ provider.ts         # gränssnitt LlmProvider
│  │  ├─ anthropic.ts        # Messages API direkt från webbläsaren
│  │  └─ mock.ts             # låtsassvar för test och demoläge
│  ├─ storage/
│  │  ├─ db.ts               # IndexedDB: sparade spel
│  │  └─ settings.ts         # localStorage: inställningar, ev. nyckel
│  ├─ ui/
│  │  ├─ list.ts  chat.ts  composer.ts  picker.ts
│  │  ├─ backstage.ts        # "Bakom kulisserna"
│  │  ├─ onboarding.ts       # nyckel, val av fall, tidsläge
│  │  └─ ending.ts
│  ├─ pwa/
│  │  ├─ sw.ts               # service worker
│  │  └─ notify.ts           # lokala notiser
│  └─ styles.css
├─ tests/
├─ .github/workflows/deploy.yml
├─ SPEC.md
└─ README.md
```

---

## 4. Fallformat (`case.json`)

Ett fall är en enda JSON-fil. Motorn innehåller ingen berättelse. Prototypens fall *Lottogänget* blir den första filen.

### 4.1 Tid
Tid skrivs som `"D HH:MM"`, där `D` är dagsindex från fallets start (0 = första dagen). Exempel: `"1 23:26"`. Fallet anger veckodag för dag 0.

### 4.2 Schema (förkortat)
```jsonc
{
  "id": "lottoganget",
  "title": "Fel nummer: Lottogänget",
  "language": "sv",
  "startDay": "lördag",
  "start": "0 19:40",
  "end": "4 20:20",
  "player": {
    "number": "070-412 88 31",
    "premise": "Du har just skaffat ett nytt kontantkort. Numret har tillhört någon annan.",
    "labelInPrompts": "070-412 88 31 (personen med Kentas gamla nummer)"
  },
  "world": "Västersjö, en liten by vid en sjö. Lottogänget: sex vänner som spelat på samma rad i 15 år …",

  "characters": [{
    "id": "cecilia",
    "name": "Cecilia",
    "fullName": "Cecilia Ek",
    "number": "070-145 72 60",
    "color": "#56617d",
    "aliases": ["cecilia", "cissi"],
    "bio": "49 år, advokat …",
    "style": "Korrekt och kontrollerad. Hela meningar …",
    "secret": "Mordet och förskingringen.",
    "story": "Söndag kväll var hon hemma ensam …",
    "goals": "Få främlingen att vidarebefordra allt och radera det …",
    "knows": [
      { "at": "0 00:00", "text": "Du har förskingrat ca 400 000 kr …" },
      { "at": "1 23:45", "text": "Du körde din grå Volvo till stugan 23:10 …" }
    ],
    "schedule": { "wake": "06:30", "sleep": "23:30" },
    "talk": 0.5,
    "dailyBudget": 18,
    "stress": 3,
    "aliveUntil": null,
    "guards": [
      { "type": "neverSay", "pattern": "(jag|det var jag)[^.!?]{0,40}(knuffa|dödade|mörda)", "log": "Cecilia höll på att erkänna" }
    ],
    "promptExtra": "Mordet erkänner du ALDRIG."
  }],

  "services": [
    { "id": "spel", "name": "Spelbolaget", "autoReply": "Detta nummer kan inte ta emot svar." },
    { "id": "polis", "name": "Polisen", "replies": ["Tack. Det är till hjälp.", "Noterat."] }
  ],

  "events": [
    { "at": "0 20:06", "from": "spel", "text": "Spelbolaget: Grattis! …" },
    { "at": "1 23:26", "from": "matte", "text": "stod en grå bil vid grinden. släckt" },
    { "at": "2 07:31", "from": "jenny", "text": "Kenta", "stress": { "all": 3 } },
    { "at": "2 15:40", "from": "nyhet", "news": { "paper": "Västersjö-Kuriren", "head": "…", "sub": "…" } },
    { "at": "4 16:00", "createGroup": { "id": "minne", "name": "Minnesstund för Kenta", "createdBy": "jenny", "members": "allAlive" } },
    { "at": "4 16:04", "from": "jenny", "to": "minne", "text": "vem är 070-412 88 31?? 😳", "react": true },
    { "at": "3 08:15", "from": "polis", "image": "images/radio.svg", "text": "…" }
  ],

  "endings": {
    "choices": [{ "id": "stuga", "label": "Åk till stugan", "availableFrom": "4 19:30", "leadsTo": "accuse", "text": "Det är mörkt vid sjön …" }],
    "accusable": ["rogge", "cecilia", "goran", "matte", "jenny"],
    "culprit": "cecilia",
    "right": "Matte sms om den grå bilen, Cecilias krav på att du skulle radera allt …",
    "wrong": "Polisen förhör {name} i två dagar och släpper hen …"
  },
  "truth": {
    "timeline": ["Kenta bytte nummer i somras …", "22:15: Kenta smsar Cecilia …"],
    "secrets": "Cecilia förskingrade 400 000 kr …"
  }
}
```

### 4.3 Händelsefält
| Fält | Betydelse |
|---|---|
| `from` | Avsändare (karaktär eller tjänst). Konversationen blir avsändarens egen om `to` saknas. |
| `to` | Gruppens id om det skickas i en grupp. |
| `text` / `news` / `image` | Innehåll. `image` är en sökväg inom fallmappen. |
| `stress` | Ändrar stress, per id eller `all`. |
| `react` | Kör turordningen i gruppen efteråt (se 5.3). |
| `createGroup` | Skapar en gruppchatt och lägger till spelaren. |
| `if` | Valfritt villkor, t.ex. `{ "playerRevealed": "goran" }`. Hoppa över händelsen om villkoret inte stämmer. |
| `end: true` | Slutpunkt, visar slutvalen. |

### 4.4 Validering
- Ett JSON Schema (`case.schema.json`) följer med. Fallen valideras i testerna och när de laddas.
- Kontroller: unika id:n, att alla `from` finns, att tider är stigande inom samma sekund, att `culprit` finns bland `accusable`.

---

## 5. Motorn

### 5.1 Speltillstånd
```ts
type GameState = {
  caseId: string; version: number;
  t: number;                    // speltid i minuter från dag 0 00:00
  timeMode: 'compressed' | 'realtime';
  realStart?: number;           // epoch ms, realtidsläge
  eventIdx: number;
  chats: Record<ChatId, Message[]>;
  contacts: Record<CharId, { name: string }>;
  unread: Record<ChatId, number>;
  agents: Record<CharId, { stress: number; used: Record<number, number>; pendingReply: boolean; last: string }>;
  groups: Record<GroupId, { name: string; members: CharId[] }>;
  flags: Record<string, boolean>;  // t.ex. playerRevealed:goran
  log: LogEntry[];
  paused: boolean; ended?: EndingResult;
  usage: { calls: number; inputTokens: number; outputTokens: number };
};
type Message = { id: number; t: number; from: 'player' | 'system' | CharId | ServiceId;
  text?: string; news?: News; image?: string; fwdFrom?: string; deleted?: boolean };
```

### 5.2 Köer
- **Händelsekö:** schemalagda händelser vars tid har passerats läggs i jobbkön (`fireDue` före varje jobb).
- **Jobbkö:** händelser och agentturer körs **en i taget** (`pump`), med en paus emellan (1,5 s × tempo). Det håller tempot läsbart och undviker att flera API-anrop krockar.

### 5.3 Turordning (spärren, utan regissör)
**I privata konversationer:**
- Spelaren skickar sms → mottagaren får en tur om hen lever och är vaken.
- Sover hen markeras `pendingReply`, och hen svarar när hen vaknar.

**I grupper**, efter varje nytt meddelande, får varje vaken och levande medlem med kvot kvar en poäng:
```
poäng = talk + stress × 0.05 + slump(0–0.55)
      + 1.1 om hen nämns (alias i texten)
      + 0.3 om spelaren skrev / spelarens nummer nämns
      − 0.45 om hen skrev bland de 3 senaste
```
- Gräns = 0.95 + 0.3 × djup. Den med högst poäng över gränsen får turen. På djup 0 får även tvåan turen, med 40 % chans.
- Max djup är 2, alltså högst tre repliker i följd innan det blir tyst.

**Initiativ vid tystnad:** när klockan hoppar framåt får en agent med 35 % chans möjlighet att höra av sig. Agenten väljs slumpmässigt viktat på `talk × 0.5 + stress / 10`, och bara bland agenter som redan har kontakt med spelaren.

**Agenten bestämmer alltid själv:** en tur kan sluta med att agenten avstår (`text: null`).

**Kvoter och rytm:** `dailyBudget` per speldygn och `schedule` (vaken/sover). Sovtider över midnatt stöds.

### 5.4 En agenttur
1. Läspaus på 1,5–4 s × tempo. Kontrollera igen att agenten lever och är vaken.
2. Visa "skriver…".
3. Bygg prompten (5.5) och anropa LLM:en.
4. Tolka svaret som JSON: `{ text, kanal, stress, radera }`.
5. Kör spärrarna (5.7). Stoppas svaret loggas det, och inget skickas.
6. Dela upp texten i högst 4 sms och skicka dem med skrivtid emellan (`900 + 45 ms/tecken`, 1,3–6,5 s × tempo).
7. Uppdatera stress (−1 till +2), kvot och logg. `radera` gäller bara om stressen är minst 6: sista sms:et raderas efter 3,5 s.
8. Om svaret gick till en grupp körs turordningen igen (djup + 1).

### 5.5 Agentprompten
Prompten byggs på nytt varje gång (agenterna har inget eget minne utöver chattloggen). Den innehåller:
- roll, bio, skrivstil
- **det agenten vet just nu**: bara de `knows`-rader vars tid har passerats
- hemlighet, version utåt, mål, eventuell `promptExtra`
- vad agenten vet om mottagaren (bara det som framgår av era sms)
- speltid och stressnivå, med förklaring av vad hög stress innebär
- de senaste 30 sms:en med spelaren, och de senaste 30 i grupper agenten är med i
- situationen: svar på sms, ny aktivitet i gruppen eller initiativ vid tystnad
- regler: 1–3 korta sms, ingen berättartext, får avstå, motsäg dig inte, avslöja inte hemligheten frivilligt
- svarsformat: endast JSON

Svaret läses med fallback: JSON-blocket plockas ut med regex, och ogiltigt svar räknas som att agenten avstår.

### 5.6 Klocka och ikappkörning
- **Komprimerad tid:** en timer varje sekund. Om inget har hänt på 30 s × tempo, ingen kö är aktiv och spelaren inte skriver något, flyttas klockan 20–45 min framåt (eller till nästa uppvaknande om alla sover), men aldrig förbi nästa händelse.
- **Realtid:** `t = startT + (nu − realStart) / 60000`.
  - När appen öppnas: alla passerade händelser läggs in direkt med sina **riktiga tidsstämplar**, utan skrivanimation, och olästa räknas upp.
  - Agentinitiativ som "skulle ha hänt" medan appen var stängd körs inte i efterhand. Ett obesvarat sms till en vaken agent får däremot svar när appen öppnas.
  - Spola fram finns i realtidsläge som "Hoppa till nästa händelse" och flyttar `realStart`.

### 5.7 Spärrar
- `neverSay`-mönster per karaktär. Exempel: mördaren får aldrig erkänna.
- Max 4 sms per tur, max 400 tecken per sms.
- Kanalkontroll: en agent kan bara skriva i grupper den är med i och bara till spelaren privat.
- Döda agenter tar inga turer. Deras nummer ger ✓ i stället för ✓✓.

---

## 6. LLM-anslutning

### 6.1 Gränssnitt
```ts
interface LlmProvider {
  id: string;
  complete(req: { prompt: string; model: string; maxTokens: number; signal?: AbortSignal }):
    Promise<{ text: string; usage?: { input: number; output: number } }>;
  validateKey(key: string): Promise<boolean>;
}
```

### 6.2 Anthropic (v1)
- Anrop direkt från webbläsaren till `https://api.anthropic.com/v1/messages`, med headrarna `x-api-key`, `anthropic-version` och `anthropic-dangerous-direct-browser-access: true` (krävs för CORS).
- Standardmodell för agenter: **`claude-haiku-5-5`**, eftersom den är snabb och billig och agentturerna är många och korta. Kan bytas i inställningarna (t.ex. `claude-sonnet-5-5`).
- `max_tokens` cirka 300. Ingen streaming behövs, eftersom "skriver…" visas under tiden.
- Fel:
  - `401` → be om ny nyckel.
  - `429` / `529` → pausa simuleringen, vänta med backoff (2, 4, 8 s, max 3 försök) och visa en notis.
  - Nätverksfel → turen räknas som att agenten avstår, loggas, och spelet fortsätter.
- Kontrollera modellnamn och headrar mot aktuell dokumentation på docs.claude.com innan release.

### 6.3 Demoläge utan nyckel
- `mock.ts` ger korta svar som fallet kan definiera per karaktär (`mockLines`), så att det går att spela igenom de manusskrivna händelserna utan nyckel.
- Bra för första intrycket och för tester.

### 6.4 Kostnad
- Räkna tokens per anrop (`usage` från API:t) och visa en uppskattad kostnad i inställningarna och i "Bakom kulisserna".
- Valfri **budgetgräns per spel** (antal anrop). När den nås pausas spelet med ett meddelande.

---

## 7. Lagring (allt lokalt)

| Data | Var | Kommentar |
|---|---|---|
| Sparade spel | IndexedDB, store `saves` | Ett objekt per spel. Sparas efter varje meddelande (debounce 500 ms). |
| Inställningar | localStorage `fn:settings` | Tempo, tidsläge, modell, tema, notiser. |
| API-nyckel | localStorage `fn:key` **eller** sessionStorage | Spelaren väljer "Kom ihåg på den här enheten" eller bara för sessionen. |
| Fall | Statiska filer, cachas av service worker | Fallen ändras inte under spel. Sparfilen innehåller fallets `version`. |

- **Exportera/importera** sparfil som JSON (utan API-nyckel) för att flytta spelet mellan enheter.
- **Radera allt:** en knapp som tömmer IndexedDB, localStorage och cachen.
- Allt i try/catch. Fungerar inte lagringen (t.ex. privat läge) körs spelet ändå, men utan sparning och med en tydlig notis.

---

## 8. Säkerhet och integritet
- Nyckeln skickas **bara** till `api.anthropic.com`. Ingen annan nätverkstrafik förutom sajtens egna filer.
- Ingen analys, inga cookies, inga tredjepartsskript. Typsnitt bundlas lokalt i stället för att hämtas från Google Fonts.
- Content Security Policy via `<meta>`: `default-src 'self'; connect-src 'self' https://api.anthropic.com; img-src 'self' data:; style-src 'self'`.
- All text från LLM:en sätts med `textContent`, aldrig som HTML.
- Tydlig text vid nyckelfältet:
  - nyckeln lagras okrypterad i webbläsaren
  - använd en egen nyckel med låg utgiftsgräns
  - ta bort den när du är klar
- Länk till Anthropic Console för att skapa nyckel och sätta gräns.

---

## 9. PWA

### 9.1 Manifest
```json
{
  "name": "Fel nummer",
  "short_name": "Fel nummer",
  "start_url": "./",
  "scope": "./",
  "display": "standalone",
  "orientation": "portrait",
  "background_color": "#0b1114",
  "theme_color": "#0b1114",
  "lang": "sv",
  "icons": [
    { "src": "icons/192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "icons/512.png", "sizes": "512x512", "type": "image/png" },
    { "src": "icons/maskable-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
  ]
}
```
Lägg också till `apple-touch-icon` och `apple-mobile-web-app-capable` för iOS.

### 9.2 Service worker
- Precachar appskalet (HTML, JS, CSS, typsnitt, ikoner) och fallfilerna, så att appen startar offline. Agenterna kräver förstås nät.
- Cache-first för statiska filer, och **aldrig** cache för `api.anthropic.com`.
- Ny version: visa "Ny version finns – ladda om" i stället för att byta tyst mitt i ett spel.
- Installationsknapp via `beforeinstallprompt` (Chromium). På iOS visas en instruktion för "Lägg till på hemskärmen".

### 9.3 Notiser
- Lokala notiser (`registration.showNotification`) när ett sms kommer och appen ligger i bakgrunden eller fliken inte är aktiv: avsändarens nummer eller sparade namn, och de första orden.
- Kräver tillstånd. Fråga först när spelaren väljer realtidsläge, inte vid start.
- På iOS fungerar notiser bara i installerad PWA (iOS 16.4+).
- **Begränsning:** utan server kan inga notiser skickas när appen är helt stängd. Realtidsläget kompenserar med ikappkörning (5.6). Riktig push via en liten serverfri funktion kan bli en v2.

---

## 10. Gränssnitt

### 10.1 Vyer
1. **Start:** välj fall, nytt spel eller fortsätt, och tidsläge.
2. **Nyckel:** klistra in, testa (ett minimalt anrop), välj om den ska kommas ihåg. Alternativt "Spela demo utan nyckel".
3. **Sms-appen:** lista och konversation (tvåkolumns på bred skärm, en vy i taget på mobil).
4. **Inställningar:** tempo, tidsläge, modell, kostnad, notiser, tema, exportera/importera, radera allt.
5. **Bakom kulisserna:** utfällbar panel.
6. **Slut:** val, utfall, "Det här hände egentligen", spela igen.

### 10.2 Design
- Ser ut som en äkta, neutral sms-app (ingen kopia av någon specifik app). Ljust och mörkt tema följer systemet.
- En accentfärg (lingonröd) för det viktiga: skicka, olästa, Peka ut.
- Okända nummer har grå avatar med `#`. Sparade kontakter får karaktärens färg och initialer.
- Mobil först: 44 px tryckytor, 16 px inmatning (ingen zoom på iOS), `env(safe-area-inset-*)` i standalone-läge.
- `prefers-reduced-motion` stänger av "skriver…"-animationen.

### 10.3 Tillgänglighet
- Konversationsvyn är en `role="log"` med `aria-live="polite"` för nya sms.
- Tangentbord: Enter skickar, Esc stänger paneler, piltangenter i listan.
- Kontrast enligt WCAG AA i båda teman.

---

## 11. Kvalitet

### 11.1 Tester
- **Motor:** turordning, kvoter, sovtider över midnatt, ikappkörning i realtid, spärrar. Med fast slumpfrö och `mock`-leverantören.
- **Fall:** schemavalidering av alla fall i `public/cases`.
- **Röktest:** spela igenom Lottogänget med Spola fram från start till slut utan fel (Playwright, mock-leverantör).

### 11.2 Prestanda
- Första laddning under 150 kB JS gzippat.
- Rendera bara konversationen som är öppen. Listan uppdateras inkrementellt.

---

## 12. Driftsättning
- `.github/workflows/deploy.yml`: `npm ci` → `npm test` → `npm run build` → `actions/upload-pages-artifact` → `actions/deploy-pages`.
- Pages-källa: GitHub Actions.
- Versionsnummer från `package.json` visas i inställningarna och i service workerns cachenamn.

---

## 13. Milstolpar
1. **Motorn utbruten:** prototypens logik i TypeScript-moduler, och Lottogänget som `case.json`. Mock-leverantör och tester.
2. **Egen nyckel:** Anthropic-leverantören, nyckelvyn, felhantering och kostnadsräkning.
3. **Lagring:** IndexedDB-sparning, export och import, radera allt.
4. **PWA:** manifest, ikoner, service worker, installation och offline-skal.
5. **Realtidsläge:** klocka, ikappkörning, lokala notiser.
6. **Polering:** tillgänglighet, design, demoläge, README med "så skriver du ett eget fall".

---

## 14. Öppna frågor
- Ska spelaren kunna välja namn, eller förblir hen "numret"? Agenterna får i så fall veta namnet bara om spelaren skriver det.
- Ska Kentas bärgade telefon bli spelbar (läsa hans gamla chattar) redan i v1, eller i v2?
- Behövs ett "sammanfattande minne" per agent för långa spel, när 30 sms inte räcker som kontext?
- Fler språk: ska fallen ha översättningar i samma fil eller en fil per språk?
