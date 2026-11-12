# Risparmio

<img src="img/icon-192.png" alt="Icona di Risparmio" width="96" align="right">

Web app per iPhone che ti dice se puoi permetterti una spesa e ti aiuta a risparmiare ogni mese.

- **Posso?** Scrivi il prezzo, scegli la categoria e l'app risponde "Sì, puoi" o "No, lascia stare".
- **Regola 50/30/20:** l'app mette da parte da sola il 20% delle entrate, o la rata del PAC se è più alta.
- **Categorie essenziali e non:** benzina e spesa sono sempre approvate; per gli sfizi controlla budget, ritmo di spesa e limiti.
- **Mascotte:** un husky in smoking se risparmi, normale se sei nella media, trasandato se esageri.
- **Riepilogo:** dove va lo stipendio, spese per categoria, sigarette in un anno, piano di accumulo.
- **Stipendio, PAC, 13ª e 14ª:** registri quando arrivano e il versato del PAC cresce da solo.
- **Google Drive:** i dati restano sul telefono e, se vuoi, si salvano nel file `risparmio-dati.json` sul tuo Drive.
- **Apple Pay:** con un'automazione di Comandi Rapidi l'app ti chiede la categoria dopo ogni pagamento.

Funziona anche offline e si installa dalla schermata Home. Nessun server: solo HTML, CSS e JavaScript.

## Pubblicare con GitHub Pages

1. Nel repository apri **Settings → Pages**.
2. In **Source** scegli **Deploy from a branch**, branch `main`, cartella `/ (root)`, e salva.
3. Dopo un minuto l'app è su `https://<utente>.github.io/Risparmio/`.

## Collegare Google Drive

1. Su [Google Cloud Console](https://console.cloud.google.com/) crea un progetto e attiva **Google Drive API**.
2. Configura la **schermata di consenso OAuth** (tipo Esterno) e aggiungi il tuo Gmail tra gli utenti di test.
3. Crea un **ID client OAuth** di tipo *Applicazione web*. In **Origini JavaScript autorizzate** scrivi `https://<utente>.github.io` (senza percorso e senza barra finale).
4. Incolla l'ID client in `config.js`:

   ```js
   window.RISPARMIO_CONFIG = { GOOGLE_CLIENT_ID: '1234-abc.apps.googleusercontent.com' };
   ```

5. Nell'app: **Impostazioni → Google Drive → Collega Google Drive**.

L'app chiede solo il permesso `drive.file`: vede esclusivamente il file che crea lei. L'ID client non è un segreto e può stare nel repository pubblico.

## Installare sull'iPhone

Apri il sito in Safari → **Condividi** → **Aggiungi alla schermata Home**.

## Spese con Apple Pay

In **Comandi Rapidi → Automazione → Nuova automazione → Transazione**:

1. **Codifica URL** sulla variabile *Esercente*.
2. **Testo**: `https://<utente>.github.io/Risparmio/?spesa=[Importo]&esercente=[URL codificato]`
3. **Apri URL** con quel testo.

Dopo ogni pagamento l'app si apre e chiede "Che spesa era?".

## Note

- L'accesso a Google dura un'ora; poi basta toccare **Sincronizza** in alto.
- Su iPhone, Safari e l'app sulla schermata Home hanno memorie separate: collegando Drive in entrambi, le spese si uniscono senza perdersi.
- Dopo ogni modifica ai file, aumenta `VERSIONE` in `sw.js` (es. `risparmio-v2`) perché i telefoni scarichino la versione nuova.

## Licenza

[MIT](LICENSE)
