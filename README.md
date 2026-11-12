# Risparmio

<img src="img/icon-192.png" alt="Icona di Risparmio" width="96" align="right">

Web app per iPhone che ti dice se puoi permetterti una spesa e ti aiuta a risparmiare ogni mese.

- **Posso?** Scrivi il prezzo, scegli la categoria e l'app risponde "Sì, puoi" o "No, lascia stare".
- **Regola 50/30/20:** l'app mette da parte da sola il 20% delle entrate, o la rata del PAC se è più alta.
- **Categorie essenziali e non:** benzina e spesa sono sempre approvate; per gli sfizi controlla budget, ritmo di spesa e limiti.
- **Mascotte:** un husky in smoking se risparmi, normale se sei nella media, trasandato se esageri.
- **Riepilogo:** dove va lo stipendio, spese per categoria, sigarette in un anno, piano di accumulo.
- **Movimenti:** tutte le spese e le mensilità extra mese per mese, divise per giorno. Le cancelli una alla volta o ne selezioni diverse insieme.
- **Stipendio sempre manuale:** non c'è uno stipendio fisso. Ogni mese lo registri quando arriva, e finché non lo fai l'app te lo chiede in cima a Posso?. Ogni stipendio è un movimento che puoi cancellare.
- **Prezzo proposto:** il tasto Sigarette è il primo e propone 5,50 €; ogni categoria può avere il suo prezzo proposto da Impostazioni.
- **Categorie di partenza:** Benzina, Macchina, Spesa alimentare, Medicine (essenziali), Ristoranti, Vestiti, Svago, Sigarette.
- **Rata PAC come movimento:** registrando lo stipendio viene creato anche il movimento "Rata PAC", che si somma ai soldi messi da parte (20% delle entrate + rata PAC) e al versato. Cancellando lo stipendio si toglie anche la sua rata.
- **13ª e 14ª:** si sommano alle entrate del mese in cui arrivano.
- **Solo Google Drive:** i dati stanno esclusivamente nel file `risparmio-dati.json` sul tuo Drive, mai sul telefono. Ogni modifica viene salvata subito.
- **Test di collegamento:** all'accesso, e quando vuoi da Impostazioni, controlla passo per passo Google, Drive, il file, la lettura e il salvataggio.
- **Animazioni:** cifre che scorrono, barre che crescono, ciambella che si disegna, cane che respira e salta quando cambia umore.
- **Apple Pay:** con un'automazione di Comandi Rapidi l'app ti chiede la categoria dopo ogni pagamento.

Si installa dalla schermata Home. Nessun server: solo HTML, CSS e JavaScript. Serve la connessione a Internet, perché i dati stanno su Drive.

## Pubblicare con GitHub Pages

1. Nel repository apri **Settings → Pages**.
2. In **Source** scegli **Deploy from a branch**, branch `main`, cartella `/ (root)`, e salva.
3. Dopo un minuto l'app è su `https://<utente>.github.io/Risparmio/`.

## Collegare Google Drive

1. Su [Google Cloud Console](https://console.cloud.google.com/) crea un progetto e attiva **Google Drive API**.
2. Configura la **schermata di consenso OAuth** (tipo Esterno) e aggiungi il tuo Gmail tra gli utenti di test.
3. Crea un **ID client OAuth** di tipo *Applicazione web*. In **Origini JavaScript autorizzate** scrivi `https://<utente>.github.io` (senza percorso e senza barra finale).
4. Apri l'app: al primo avvio ti chiede l'**ID client**. Incollalo e tocca **Salva e continua**. La stessa schermata ti mostra l'indirizzo da autorizzare, con il tasto **Copia**.
5. Tocca **Accedi con Google**: parte il test di collegamento e poi si caricano i tuoi dati.

L'ID client resta solo sul dispositivo dove lo inserisci, quindi il codice pubblicato non contiene niente di tuo. Lo cambi quando vuoi da **Impostazioni → Google Drive → Cambia ID client**. In alternativa puoi scriverlo in `config.js`, così è già pronto per chiunque apra il sito.

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

- **Accesso ricordato:** il telefono ricorda il tuo account Google (non i dati). Google limita l'accesso dei siti a un'ora: quando scade, il tocco successivo ti ricollega da solo, senza password, e poi esegue quello che volevi fare. Riaprendo l'app trovi **Continua come …**.
- Prima di ogni salvataggio l'app rilegge il file e unisce le spese fatte da altri dispositivi, quindi non se ne perde nessuna.
- Se avevi usato la versione precedente, le spese rimaste sul telefono vengono portate su Drive al primo accesso.
- L'app carica sempre la versione più recente dal sito e si ricarica da sola quando ne esce una nuova. Dopo ogni modifica ai file conviene comunque aumentare `VERSIONE` in `sw.js`.

## Licenza

[MIT](LICENSE)
