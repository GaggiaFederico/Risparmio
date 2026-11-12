# Risparmio

<img src="img/icon-192.png" alt="Icona di Risparmio" width="96" align="right">

Web app per iPhone che ti dice se puoi permetterti una spesa e ti aiuta a risparmiare ogni mese. I dati stanno solo sul tuo Google Drive.

**App:** https://gaggiafederico.github.io/Risparmio/

![Le quattro schermate: Posso?, Riepilogo, Movimenti, Impostazioni](docs/schermate.jpg)

## Cosa fa

### Posso?
- In alto il **disponibile** del mese con il cane, quanto hai **speso** e quanto è **messo da parte**.
- Sotto, **Cosa vuoi comprare?**: scegli la categoria, scrivi il prezzo e l'app risponde **"Sì, puoi"** o **"No, lascia stare"** con il motivo, subito sotto il bottone. Tutto sta in una schermata, senza scorrere.
- Il tasto **Sigarette** è il primo e propone già **5,50 €**. Ogni categoria può avere il suo prezzo proposto.
- Se lo stipendio del mese non è ancora registrato, l'app te lo chiede qui.

### Riepilogo
- **Ciambella** del periodo in corso con una fetta per ogni categoria in cui hai speso, più spese fisse, rata PAC, risparmio 20% e disponibile, con percentuali e importi.
- Subito sotto il **piano di accumulo** (rata, versato finora, 13ª e 14ª), poi le spese **per categoria** e le **sigarette in un anno** a questo ritmo.

### Movimenti
- Tutte le spese, gli stipendi, le rate PAC e le mensilità extra, **da stipendio a stipendio** e divise per giorno.
- Filtri **Tutti / Spese / Entrate / PAC**.
- Cancelli un movimento con la **×**, oppure tocchi **Seleziona** e ne elimini diversi insieme: la barra **Elimina** resta in basso, a portata di pollice, mentre scorri.

### Impostazioni

Divise in tre gruppi: **Entrate** (quello che usi ogni mese), **Budget** (da impostare una volta), **Account e dati**.
- **È arrivato lo stipendio?**: registri lo stipendio quando arriva.
- **13ª e 14ª**, facoltative.
- **Spese fisse**, **rata fissa PAC** e **PAC già versato** (quanto avevi prima di usare l'app).
- **Categorie**: essenziale sì/no, limite al mese, prezzo proposto; puoi aggiungerle ed eliminarle.
- **Google Drive**: account collegato, **Prova collegamento**, **Esci da Google**, **Cambia ID client**.
- **Backup**: esporta o importa tutti i dati in un file.

## Come ragiona

### Il periodo va da stipendio a stipendio

Lo stipendio arriva in giorni diversi. Il "mese" dell'app parte dal giorno in cui registri lo stipendio e dura finché non registri il successivo, qualunque giorno arrivi. Per il ritmo di spesa l'app stima che il prossimo arrivi lo stesso giorno del mese dopo; verso la fine del periodo Posso? ti chiede se è arrivato. Prima del primo stipendio registrato si usa il mese di calendario. Anche Movimenti scorre per periodi.

### I conti

| Voce | Regola |
| --- | --- |
| Entrate | Stipendio del periodo + 13ª/14ª arrivate nel periodo. Lo stipendio è **sempre manuale**. |
| Messi da parte | **20% delle entrate + rata PAC**. Se la rata non è ancora registrata, viene tenuta da parte comunque. |
| Budget | Entrate − messi da parte − spese fisse. |
| Riserva | Il **10% del budget** resta sempre libero per gli imprevisti: gli sfizi non lo toccano. |
| Disponibile | Budget − speso nel periodo. |
| Sfizi | Al massimo il **20% delle entrate** (e mai oltre budget − riserva − spese essenziali). |

### Le risposte (severe)

| Spesa | Risposta |
| --- | --- |
| Essenziale (Benzina, Macchina, Spesa alimentare, Medicine) | **Sì**. Se ti lascia sotto la riserva: "Sì, ma ti resta poco". Se va oltre il disponibile: "Sì, ma solo questa". |
| Sfizio che tocca i risparmi o la riserva | **No** |
| Sfizio oltre gli sfizi rimasti | **No** |
| Sfizio più veloce del ritmo (sfizi spesi > quota dei giorni passati) | **No**, con quanto puoi spendere per ora |
| Sfizio sopra i 10 € che prende più di metà degli sfizi rimasti | **No**, "pensaci un giorno" |
| Sfizio che supera il limite della categoria | **No** |
| Sfizio che porta la categoria oltre l'**80% del limite** | **"Sì, ma attento"**, in giallo |
| Senza stipendio registrato | Gli sfizi ricevono "Aspetta lo stipendio" |

Scegliendo una categoria con limite, Posso? mostra subito quanto ne hai usato. Nel Riepilogo le categorie vicine al limite diventano gialle, quelle oltre rosse.

Le soglie stanno tutte nell'oggetto `REGOLE` in `app.js`: alzale per un'app più severa, abbassale per una più morbida.

### Il cane

Confronta la parte di budget usata con la parte di periodo passata:

| Husky | Quando |
| --- | --- |
| In smoking | Hai usato meno del 70% di quanto il periodo è avanzato. |
| Normale | Sei in linea. |
| Trasandato | Spendi più in fretta dei giorni, sei in rosso, o vai oltre il ritmo degli sfizi. |

Sotto la barra l'app scrive il motivo, per esempio "Hai usato il 52% del budget, ma sei solo al 40% dei giorni fino allo stipendio".

## Aspetto

- **Modalità scura automatica:** segue quella dell'iPhone.
- Animazioni che si spengono con **Riduci movimento**; zoom bloccato.

## Dati e accesso

- **Solo Google Drive.** I dati stanno esclusivamente nel file `risparmio-dati.json` sul tuo Drive, mai sul telefono: Safari può cancellare i dati dei siti che non apri per 7 giorni. Ogni modifica viene salvata subito.
- **Più dispositivi.** Prima di ogni salvataggio l'app rilegge il file e unisce le modifiche fatte altrove, quindi nessuna spesa va persa. Le cancellazioni valgono su tutti i dispositivi.
- **Accesso ricordato.** Sul telefono restano solo l'account Google e l'ID client, non i dati. Google limita l'accesso dei siti senza server a un'ora: quando scade, il tocco successivo ti ricollega da solo, senza password, e completa l'azione. Riaprendo l'app trovi **Continua come …**.
- **Permessi minimi.** L'app chiede solo `drive.file`: vede esclusivamente il file che ha creato lei, non il resto del tuo Drive.
- **Test di collegamento.** All'accesso, e quando vuoi da Impostazioni, controlla passo per passo: accesso a Google, Drive raggiungibile, file, lettura, salvataggio. Se un passo fallisce, dice il motivo.

## Installazione

### 1. Pubblicare con GitHub Pages

1. Nel repository apri **Settings → Pages**.
2. In **Source** scegli **Deploy from a branch**, branch `main`, cartella `/ (root)`, e salva.
3. Dopo un minuto l'app è su `https://<utente>.github.io/Risparmio/`.

Ogni modifica caricata su `main` va online da sola in un paio di minuti, e l'app sul telefono si aggiorna da sola.

### 2. Creare l'ID client di Google (una volta sola)

1. Su [Google Cloud Console](https://console.cloud.google.com/) crea un progetto con il tuo account Gmail personale.
2. **API e servizi → Libreria**: attiva **Google Drive API**.
3. **Google Auth Platform → Pubblico** (o "Schermata consenso OAuth"): tipo utente **Esterno**, stato **Test**, e aggiungi il tuo Gmail tra gli **utenti di test**.
4. **Credenziali → Crea credenziali → ID client OAuth**, tipo **Applicazione web**. In **Origini JavaScript autorizzate** scrivi `https://<utente>.github.io` (senza `/Risparmio` e senza barra finale).
5. Copia l'**ID client** (finisce con `.apps.googleusercontent.com`). Il *client secret* non serve.

### 3. Primo avvio

1. Apri l'app: ti chiede l'**ID client**. Incollalo e tocca **Salva e continua**. La stessa schermata mostra l'indirizzo da autorizzare, con il tasto **Copia**.
2. Tocca **Accedi con Google**: parte il test di collegamento e poi si caricano i tuoi dati.
3. Al primo accesso Google può dire "Google non ha verificato questa app": è normale per un'app in test, tocca **Continua**.

L'ID client resta solo sul dispositivo dove lo inserisci, quindi il codice pubblicato non contiene niente di tuo. In alternativa puoi scriverlo in `config.js`, così è già pronto per chiunque apra il sito. Non è un segreto: Google lo accetta solo dall'indirizzo autorizzato.

### 4. Installare sull'iPhone

Apri il sito in Safari → **Condividi** → **Aggiungi alla schermata Home**.

### 5. Spese con Apple Pay (facoltativo)

In **Comandi Rapidi → Automazione → Nuova automazione → Transazione**, scegli le carte e **Esegui immediatamente**, poi:

1. **Codifica URL** sulla variabile *Esercente*.
2. **Testo**: `https://<utente>.github.io/Risparmio/?spesa=[Importo]&esercente=[URL codificato]`
3. **Apri URL** con quel testo.

Dopo ogni pagamento l'app si apre e chiede "Che spesa era?": tocchi la categoria e la spesa è registrata.

## Problemi comuni

| Messaggio | Soluzione |
| --- | --- |
| `Errore 403: org_internal` | Il progetto Google è impostato come **Interno**. In **Pubblico** premi **Rendi esterna**. Se non si può, crea il progetto con un Gmail personale, senza organizzazione. |
| `Errore 403: access_denied` | Aggiungi il tuo Gmail tra gli **utenti di test**. |
| `Errore 400: origin_mismatch` | L'origine autorizzata deve essere esattamente `https://<utente>.github.io`. |
| Test: "Permesso negato: controlla che Google Drive API sia attiva" | Attiva **Google Drive API** nel progetto. |
| Vedo ancora la versione vecchia | Chiudi del tutto l'app e riaprila. |

## File

| File | Cosa contiene |
| --- | --- |
| `index.html` | Struttura della pagina e barra in basso. |
| `app.js` | Tutta la logica: conti, schermate, Google Drive, test di collegamento, animazioni. |
| `style.css` | Stile: vetro, colori, animazioni (spente con "Riduci movimento"). |
| `config.js` | ID client di Google facoltativo. |
| `sw.js` | Service worker: carica sempre la versione nuova; quando cambi i file aumenta `VERSIONE`. |
| `manifest.webmanifest` | Nome, icona e colori per l'installazione. |
| `img/` | Icone dell'app e i tre husky. |
| `font/` | Font Nunito incluso. |

Per provarla sul computer: `python3 -m http.server 8000` nella cartella e apri `http://localhost:8000`. Per collegare Drive in locale aggiungi `http://localhost:8000` tra le origini autorizzate.

## Licenza

[MIT](LICENSE)
