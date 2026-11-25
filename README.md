# Fel nummer

Ett interaktivt deckaräventyr som utspelar sig i sms. Du har fått ett nytt kontantkort, och numret har tillhört någon annan. Sms:en är inte till dig.

Personerna i spelet är självstyrande AI-agenter (Claude). Det finns ingen regissör, bara en klocka, schemalagda händelser och personernas egna hemligheter och mål. Allt de vet om varandra får de veta av dig, så vidarebefordran är ditt viktigaste verktyg.

**Spela:** https://paokarlsson.github.io/fel-nummer/

## Så spelar du

- Klistra in din egen API-nyckel från [Anthropic Console](https://console.anthropic.com/settings/keys) eller spela en demo utan nyckel. Nyckeln skickas bara till `api.anthropic.com` och sparas lokalt i webbläsaren.
- Tryck på ett sms för att vidarebefordra eller kopiera det.
- Tryck på personikonen i en konversation för att spara numret som en kontakt.
- I menyn (⋮) kan du spola fram till nästa händelse, pausa och peka ut någon.
- Tempo, modell, tema, aviseringar, sparfiler och utgiftsgräns ställer du in under Inställningar.
- Lägg till `?debug` i adressen för att se agenternas stress, kvoter och logg.

Ett fall tar 1–2 timmar. Med standardmodellen (Claude Haiku 5.5) kostar ett genomspelat fall oftast några kronor.

## Utveckling

```sh
npm install
npm run dev        # utvecklingsserver
npm test           # enhetstester (motor, spärrar, fall)
npm run build      # bygger till dist/
npm run e2e        # röktest i Chromium: spelar igenom Lottogänget i demoläge (kräver bygget)
npm run icons      # ritar om PNG-ikonerna från public/icons/icon.svg
```

Push till `main` bygger och publicerar till GitHub Pages (`.github/workflows/deploy.yml`). I repots inställningar ska Pages-källan vara **GitHub Actions**.

### Struktur

| Mapp | Innehåll |
|---|---|
| `src/engine/` | Motorn: tid, turordning, prompt, spärrar, validering, `Engine` (klocka, händelse- och jobbkö, agentturer). Ingen berättelse. |
| `src/llm/` | `LlmProvider`, Anthropic-leverantören och mock-leverantören för demoläget. |
| `src/storage/` | IndexedDB-sparning, export/import och inställningar. |
| `src/ui/` | Sms-appen, start, nyckel, inställningar, slut och debug-logg. |
| `src/pwa/` | Service worker, installation och lokala aviseringar. |
| `public/cases/` | Fallen. `index.json` listar dem. |

## Så skriver du ett eget fall

Ett fall är en enda fil, `public/cases/<id>/case.json`, plus eventuella bilder i samma mapp. Lägg till id:t i `public/cases/index.json`. Ingen kod behöver ändras. Formatet beskrivs i `case.schema.json`, och `public/cases/lottoganget/case.json` är ett komplett exempel.

1. **Tid** skrivs `"D HH:MM"`, där D är dagen räknat från start (0 = första dagen). `startDay` anger veckodagen för dag 0.
2. **Spelaren** (`player`): ditt nummer, premissen och vem numret tillhörde förut (`previousOwner`).
3. **Personer** (`characters`): varje person får
   - `bio`, `style` (hur hen skriver), `secret`, `cover` (versionen utåt), `story` och `goals`
   - `knows`: rader med tid. En person vet bara det som har hänt hittills.
   - `aboutPlayer`: vad personen tror om ditt nummer i början
   - `schedule` (vaken/sover, gärna över midnatt), `talk` (0–1, hur pratsam), `dailyBudget` (max turer per dag) och `stress` (0–10)
   - `aliveUntil` för den som dör (hens nummer ger sedan ✓ i stället för ✓✓)
   - `guards` med `neverSay`-mönster, t.ex. att mördaren aldrig får erkänna
   - `mockLines`: repliker för demoläget
4. **Tjänster** (`services`): nummer som inte är personer, t.ex. polisen eller en tidning. De har `autoReply` eller slumpade `replies`.
5. **Händelser** (`events`) sker vid sin tid. De kan skicka sms (`text`, `news`, `image` med `alt`), ändra stress, skapa grupper (`createGroup`), få gruppen att reagera (`react`), radera sig själva (`deleteAfter`) eller bara ske under ett villkor (`if: { "playerRevealed": "goran" }`, alltså när Göran har förstått att du är en främling). En händelse med `end: true` är slutpunkten.
6. **Slut** (`endings`): vem som kan pekas ut, vem som är skyldig, texter för rätt och fel (`{name}` ersätts) och valfria val före utpekandet.
7. **Sanningen** (`truth`): tidslinjen och allas hemligheter, som visas efter slutet.

Kör `npm test`. Testerna validerar alla fall i `public/cases`: unika id:n, kända avsändare, giltiga tider, att bilderna finns och att den skyldiga går att peka ut.

**Tips:** Ge varje person en egen hemlighet som får hen att ljuga, så blir inte den skyldiga den enda som verkar misstänkt. Lägg ledtrådarna hos olika personer, så att spelaren måste vidarebefordra för att få ihop bilden.

## Integritet

Ingen server, inga konton, ingen analys och inga cookies. Sparade spel och inställningar ligger i webbläsaren. Den enda nätverkstrafiken utöver sajtens egna filer går till `api.anthropic.com`, och det styrs av en Content Security Policy.
