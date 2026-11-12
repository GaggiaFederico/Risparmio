'use strict';
/* Risparmio: ti dice se puoi permetterti una spesa.
   I dati stanno SOLO sul tuo Google Drive, nel file "risparmio-dati.json".
   Sul telefono resta solo l'accesso a Google (valido un'ora), mai i dati:
   ogni modifica viene salvata subito su Drive. */
(function () {
  const CFG = window.RISPARMIO_CONFIG || {};
  const K = {
    dati: 'risparmio.dati.v1',
    token: 'risparmio.drive.token',
    file: 'risparmio.drive.file',
    collegato: 'risparmio.drive.collegato',
    modifiche: 'risparmio.drive.modifiche',
    ultima: 'risparmio.drive.ultima',
    clientId: 'risparmio.google.clientId',
    account: 'risparmio.google.account'
  };

  // ---------- Memoria del telefono ----------
  const leggi = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const scrivi = (k, v) => {
    try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) { /* memoria non disponibile */ }
  };
  const uid = () => (window.crypto && crypto.randomUUID)
    ? crypto.randomUUID()
    : Date.now().toString(36) + Math.random().toString(36).slice(2, 10);

  const CATEGORIE_BASE = [
    ['Benzina', true], ['Macchina', true], ['Spesa alimentare', true], ['Medicine', true],
    ['Ristoranti', false], ['Vestiti', false], ['Svago', false], ['Sigarette', false]
  ];

  function nuoviDati() {
    return {
      versione: 1, aggiornato: 0,
      stipendio: 0, speseFisse: 0, pac: 0, pacTotale: 0,
      extra: [], spese: [], eliminati: [],
      categorie: CATEGORIE_BASE.map(([nome, essenziale]) => ({ id: uid(), nome, essenziale, limite: null, prezzo: PREZZI_BASE[nome] || null }))
    };
  }
  // Prezzo proposto quando tocchi la categoria in Posso?
  const PREZZI_BASE = { Sigarette: 5.5 };
  // [id fisso, nome, essenziale, dopo quale categoria]
  const NUOVE_CATEGORIE = [['cat-macchina', 'Macchina', true, 'Benzina']];

  function normalizza(d) {
    const base = nuoviDati();
    const o = Object.assign({}, base, d || {});
    ['extra', 'spese', 'eliminati', 'categorie'].forEach((k) => { if (!Array.isArray(o[k])) o[k] = base[k]; });
    ['stipendio', 'speseFisse', 'pac', 'pacTotale', 'aggiornato'].forEach((k) => { o[k] = Number(o[k]) || 0; });
    // Categorie aggiunte dopo: compaiono una volta sola anche a chi ha già i dati (se le cancella non tornano).
    NUOVE_CATEGORIE.forEach(([id, nome, essenziale, dopo]) => {
      if (o.eliminati.includes(id) || o.categorie.some((c) => c.id === id || String(c.nome).trim().toLowerCase() === nome.toLowerCase())) return;
      const i = o.categorie.findIndex((c) => String(c.nome).trim().toLowerCase() === dopo.toLowerCase());
      o.categorie = o.categorie.slice();
      o.categorie.splice(i < 0 ? o.categorie.length : i + 1, 0, { id, nome, essenziale, limite: null, prezzo: null });
    });
    // Categorie salvate prima che esistesse il prezzo proposto: le Sigarette partono da 5,50 €.
    o.categorie = o.categorie.map((c) => (c.prezzo === undefined ? Object.assign({}, c, { prezzo: PREZZI_BASE[String(c.nome).trim()] || null }) : c));
    // Versione precedente: la rata del PAC stava dentro lo stipendio. Ora è un movimento a sé.
    const elim = new Set(o.eliminati);
    const rate = [];
    o.extra = o.extra.map((e) => {
      if (e.tipo !== 'stipendio' || !(Number(e.pac) > 0)) return e;
      const id = `${e.id}-pac`;
      if (!elim.has(id) && !o.extra.some((x) => x.id === id)) rate.push({ id, tipo: 'pac', nome: 'Rata PAC', importo: Number(e.pac), rif: e.id, data: e.data + 1 });
      const copia = Object.assign({}, e); delete copia.pac; return copia;
    }).concat(rate);
    return o;
  }

  // I dati arrivano da Drive dopo l'accesso: prima di allora l'app non mostra nulla.
  let D = null;

  // Dati rimasti sul telefono dalla versione precedente: vanno su Drive al primo accesso.
  function vecchiDatiLocali() {
    try { const s = leggi(K.dati); if (s) return normalizza(JSON.parse(s)); } catch (e) { /* dati rovinati */ }
    return null;
  }

  // Ogni modifica parte subito verso Drive.
  function salva() { D.aggiornato = Date.now(); Drive.modificato(); }

  // Unisce i dati di due dispositivi senza perdere spese.
  function unisci(a, b) {
    const nuovo = (a.aggiornato || 0) >= (b.aggiornato || 0) ? a : b;
    const vecchio = nuovo === a ? b : a;
    const elim = new Set([...(a.eliminati || []), ...(b.eliminati || [])]);
    const unione = (x, y) => {
      const m = new Map();
      (x || []).forEach((e) => m.set(e.id, e));
      (y || []).forEach((e) => { if (!m.has(e.id)) m.set(e.id, e); });
      return [...m.values()].filter((e) => !elim.has(e.id));
    };
    const spese = unione(nuovo.spese, vecchio.spese).map((s) => Object.assign({}, s));
    // Categorie con lo stesso nome diventano una sola.
    const perNome = new Map();
    const sposta = {};
    const categorie = [];
    unione(nuovo.categorie, vecchio.categorie).forEach((c) => {
      const k = String(c.nome).trim().toLowerCase();
      if (perNome.has(k)) sposta[c.id] = perNome.get(k).id;
      else { perNome.set(k, c); categorie.push(c); }
    });
    spese.forEach((s) => { if (sposta[s.categoriaID]) s.categoriaID = sposta[s.categoriaID]; });
    spese.sort((p, q) => p.data - q.data);
    return normalizza(Object.assign({}, nuovo, {
      spese,
      categorie,
      extra: unione(nuovo.extra, vecchio.extra),
      eliminati: [...elim].slice(-1000)
    }));
  }

  // ---------- Numeri ----------
  const fmt2 = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: 'always' });
  const fmt0 = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0, useGrouping: 'always' });
  const eur = (v) => { v = Math.round((Number(v) || 0) * 100) / 100; return (Number.isInteger(v) ? fmt0 : fmt2).format(v); };
  const eur0 = (v) => fmt0.format(Math.round(Number(v) || 0));
  const numero = (v) => (v ? Number(v).toLocaleString('it-IT', { minimumFractionDigits: Number.isInteger(Number(v)) ? 0 : 2, maximumFractionDigits: 2, useGrouping: 'always' }) : '');

  // Legge "12,50", "1.800", "€ 12.50", "12,50 €"...
  function parseEuro(s) {
    if (s == null) return NaN;
    s = String(s).replace(/[^\d,.-]/g, '');
    if (!s) return NaN;
    const c = s.lastIndexOf(','), p = s.lastIndexOf('.');
    if (c > -1 && p > -1) s = c > p ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
    else if (c > -1) s = s.replace(/\./g, '').replace(',', '.');
    else if (p > -1 && /^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
    const v = parseFloat(s);
    return isFinite(v) ? v : NaN;
  }

  const esc = (t) => String(t == null ? '' : t).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  const maiuscola = (t) => t.charAt(0).toUpperCase() + t.slice(1);

  function stessoMese(t) { const d = new Date(t), n = new Date(); return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth(); }
  function stessoAnno(t) { return new Date(t).getFullYear() === new Date().getFullYear(); }
  function giorniMese() { const n = new Date(); return { g: n.getDate(), tot: new Date(n.getFullYear(), n.getMonth() + 1, 0).getDate() }; }

  // ---------- Conti (regola 50/30/20) ----------
  const C = {
    speseMese() { return D.spese.filter((s) => stessoMese(s.data)); },
    cat(id) { return D.categorie.find((c) => c.id === id); },
    totale(filtro) { return this.speseMese().filter(filtro).reduce((a, s) => a + s.importo, 0); },
    totEssenziali(ess) { return this.totale((s) => { const c = this.cat(s.categoriaID); return c ? c.essenziale === ess : !ess; }); },
    totCategoria(id) { return this.totale((s) => s.categoriaID === id); },
    speso() { return this.totale(() => true); },
    // Lo stipendio conta solo se lo registri tu, mese per mese.
    stipendiMese() { return D.extra.filter((e) => e.tipo === 'stipendio' && stessoMese(e.data)).reduce((a, e) => a + e.importo, 0); },
    // 13ª e 14ª (né stipendio né rata PAC)
    extraMese() { return D.extra.filter((e) => !e.tipo && stessoMese(e.data)).reduce((a, e) => a + e.importo, 0); },
    extraAnno() { return D.extra.filter((e) => !e.tipo && stessoAnno(e.data)).reduce((a, e) => a + e.importo, 0); },
    // Rata PAC: movimento che si somma ai soldi messi da parte.
    pacMese() { return D.extra.filter((e) => e.tipo === 'pac' && stessoMese(e.data)).reduce((a, e) => a + e.importo, 0); },
    entrate() { return this.stipendiMese() + this.extraMese(); },
    // Versato nel PAC: quanto avevi già, più la rata di ogni stipendio registrato.
    versatoPac() { return D.pacTotale + D.extra.filter((e) => e.tipo === 'pac').reduce((a, e) => a + e.importo, 0); },
    ultimoStipendio() { const s = D.extra.filter((e) => e.tipo === 'stipendio').sort((a, b) => b.data - a.data)[0]; return s ? s.importo : 0; },
    risparmio() { return this.entrate() * 0.2; },
    // La rata del PAC conta già come risparmio.
    // Messi da parte: il 20% delle entrate PIÙ la rata PAC del mese.
    protetto() { return this.risparmio() + this.pacMese(); },
    disponibile() { return this.entrate() - this.protetto() - D.speseFisse - this.speso(); },
    sfiziMax() { return Math.max(0, Math.min(this.entrate() * 0.3, this.entrate() * 0.8 - D.speseFisse - this.totEssenziali(true))); },
    // Quanto potresti aver speso in sfizi a oggi (almeno una settimana di budget).
    sfiziAOggi() { const { g, tot } = giorniMese(); return this.sfiziMax() * Math.max(g, 7) / tot; },
    usato() { if (this.entrate() <= 0) return 0; const b = this.entrate() - D.speseFisse - this.protetto(); return b > 0 ? Math.min(1, this.speso() / b) : (this.speso() > 0 ? 1 : 0); },
    // 2 = elegante, 1 = normale, 0 = trasandato
    // Quota del mese già passata (almeno 5 giorni, così all'inizio del mese non scatta subito).
    tempo() { const { g, tot } = giorniMese(); return Math.max(g, 5) / tot; },
    // Umore del cane: confronta TUTTO quello che hai speso con il giorno del mese.
    // 2 = smoking (sei sotto il ritmo), 1 = normale, 0 = trasandato (sopra il ritmo o in rosso).
    umore() {
      if (this.entrate() <= 0) return 1;
      if (this.disponibile() < 0) return 0;
      const usato = this.usato(), tempo = this.tempo();
      const sfiziTroppi = this.totEssenziali(false) > this.sfiziAOggi() * 1.2;
      if (usato > tempo * 1.1 + 0.05 || sfiziTroppi) return 0;
      if (usato < tempo * 0.8) return 2;
      return 1;
    },
    valuta(importo, c) {
      const disp = this.disponibile();
      const no = (motivo) => ({ ok: false, titolo: 'No, lascia stare', motivo });
      if (this.entrate() <= 0 && !c.essenziale) return { ok: false, titolo: 'Aspetta lo stipendio', motivo: 'Registra prima lo stipendio di questo mese: senza, non so quanto puoi spendere.' };
      if (c.essenziale) {
        return importo <= disp
          ? { ok: true, titolo: 'Sì, puoi', motivo: 'È una spesa essenziale.' }
          : { ok: true, titolo: 'Sì, è essenziale', motivo: 'Fallo pure, ma questo mese intacchi il risparmio.' };
      }
      if (importo > disp) return no('Andresti a toccare i risparmi.');
      if (importo > this.sfiziMax() - this.totEssenziali(false)) return no('Hai finito il budget per gli sfizi di questo mese.');
      if (this.totEssenziali(false) + importo > this.sfiziAOggi() * 1.2) return no('Stai spendendo troppo in fretta: aspetta qualche giorno.');
      if (c.limite > 0 && this.totCategoria(c.id) + importo > c.limite) return no(`Superi il limite che hai messo per ${c.nome}.`);
      return { ok: true, titolo: 'Sì, puoi', motivo: `Dopo l'acquisto ti restano ${eur(disp - importo)} da spendere questo mese.` };
    }
  };

  // ---------- Stato dello schermo ----------
  const ID_VALIDO = /^[\w.-]+\.apps\.googleusercontent\.com$/;
  // fase: config (manca il Client ID) · accesso · carico · errore · pronto
  const S = { prezzoProposto: null, meseMov: 0, filtroMov: 'tutti', selezione: null, fase: 'accesso', clientId: '', test: [], ultimi: {}, vista: null, umorePrec: undefined, tab: 'posso', prezzo: '', catId: null, verdetto: null, stipendioArr: '', extraImp: '', nuovaCat: '', pendente: null, ridisegna: false };
  const $ = (q) => document.querySelector(q);

  // ---------- Icone ----------
  const ICONA = {
    x: '<svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    no: '<svg aria-hidden="true" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#B42329" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M9 9l6 6M15 9l-6 6"/></svg>',
    si: '<svg aria-hidden="true" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#0B7A6E" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M8 12.5l2.5 2.5L16 9.5"/></svg>',
    nuvola: '<svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 18a4.5 4.5 0 0 1-.6-8.96A6 6 0 0 1 18 9.5a4 4 0 0 1-.5 8.5z"/></svg>'
  };

  // ---------- Schermate ----------
  function testata(sopra, titolo) {
    const chip = Drive.configurato() ? `<span data-drive-chip>${chipDrive()}</span>` : '';
    return `<header class="testata"><div><p class="sopra">${sopra}</p><h1>${titolo}</h1></div>${chip}</header>`;
  }

  function viewPosso() {
    const { g, tot } = giorniMese();
    const mese = maiuscola(new Intl.DateTimeFormat('it-IT', { month: 'long' }).format(new Date()));
    const disp = C.disponibile();
    const u = C.umore();
    const pct = Math.round(C.usato() * 100);
    const foto = ['cane_trasandato', 'cane_normale', 'cane_elegante'][u];
    const alt = ['Husky trasandato: stai spendendo troppo', 'Husky: tutto nella norma', 'Husky in smoking: stai risparmiando alla grande'][u];
    const pctTempo = Math.round(C.tempo() * 100);
    const frase = C.entrate() <= 0
      ? 'Registra lo stipendio di questo mese: poi il cane ti dice come stai andando.'
      : disp < 0
        ? `Sei andato oltre il budget del mese: il cane è trasandato.`
        : [`Hai usato il ${pct}% del budget, ma il mese è solo al ${pctTempo}%: stai spendendo troppo in fretta.`,
           `Hai usato il ${pct}% del budget con il mese al ${pctTempo}%: tutto nella norma.`,
           `Hai usato solo il ${pct}% del budget con il mese al ${pctTempo}%: stai risparmiando alla grande.`][u];
    const senzaStipendio = C.entrate() <= 0;
    const testoDisp = senzaStipendio ? '—' : eur(disp);
    const v = S.verdetto;
    const pronto = parseEuro(S.prezzo) > 0 && C.cat(S.catId);
    S.umorePrec = u;

    const chiediStipendio = C.stipendiMese() <= 0 ? `<section class="vetro stipendio-mese" aria-labelledby="t-stip-mese">
        <h2 id="t-stip-mese">È arrivato lo stipendio di ${mese.toLowerCase()}?</h2>
        <label class="campo"><span class="nome-campo">Importo</span>
          <input type="text" inputmode="decimal" autocomplete="off" placeholder="${esc(numero(C.ultimoStipendio()) || '0')}" value="${esc(S.stipendioArr)}" data-campo="stipendioArr" aria-label="Importo dello stipendio arrivato"><span class="euro">€</span>
        </label>
        <button type="button" class="btn" data-act="stipendio" data-pulsante="stipendio"${parseEuro(S.stipendioArr) > 0 ? '' : ' disabled'}>Registra stipendio</button>
      </section>` : '';

    return `${testata(`${mese} · giorno ${g} di ${tot}`, 'Posso?')}
      ${chiediStipendio}
      <section class="vetro saldo" aria-label="Saldo del mese">
        <img class="cane${S.umorePrec !== undefined && S.umorePrec !== u ? ' cambia' : ''}" src="img/${foto}.png" alt="${alt}">
        <div class="disponibile">
          <span class="etichetta-piccola">Disponibile</span>
          ${senzaStipendio ? `<span class="cifra-grande vuota">${testoDisp}</span>` : `<span class="cifra-grande${disp < 0 ? ' negativa' : ''}${testoDisp.length > 8 ? ' lunga' : ''}" data-conta="disp" data-valore="${disp}">${testoDisp}</span>`}
        </div>
        <div class="griglia2">
          <div class="mini"><span>Speso</span><strong data-conta="speso" data-valore="${C.speso()}">${eur(C.speso())}</strong></div>
          <div class="mini"><span>Messi da parte</span><strong style="color: var(--accento)" data-conta="protetto" data-valore="${C.protetto()}">${eur(C.protetto())}</strong></div>
        </div>
        <div class="barra${pct >= 100 ? ' piena' : ''}" role="progressbar" aria-label="Budget usato" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}"><span data-barra="usato" data-pct="${pct}" style="width: ${pct}%"></span></div>
        <p class="nota">${frase}</p>
      </section>

      <section class="vetro" aria-labelledby="t-compra">
        <h2 id="t-compra">Cosa vuoi comprare?</h2>
        <label class="campo"><span class="nome-campo">Prezzo</span>
          <input type="text" inputmode="decimal" autocomplete="off" placeholder="0" value="${esc(S.prezzo)}" data-campo="prezzo" aria-label="Prezzo in euro"><span class="euro">€</span>
        </label>
        <div class="pillole" role="group" aria-label="Categoria">
          ${D.categorie.slice().sort((a, b) => (b.prezzo > 0) - (a.prezzo > 0)).map((c) => `<button type="button" class="pillola${c.prezzo > 0 ? ' rapida' : ''}" data-act="cat" data-id="${c.id}" aria-pressed="${c.id === S.catId}">${esc(c.nome)}${c.prezzo > 0 ? ` <span class="prezzo-rapido">${eur(c.prezzo)}</span>` : ''}</button>`).join('')}
        </div>
        <button type="button" class="btn" data-act="chiedi" data-pulsante="chiedi"${pronto ? '' : ' disabled'}>Posso comprarlo?</button>
      </section>

      ${v ? `<section class="verdetto ${v.ok ? 'si' : 'no'}" aria-live="polite" id="verdetto">
        ${v.ok ? ICONA.si : ICONA.no}
        <div class="colonna">
          <span class="titolo-v">${v.titolo}</span>
          <span class="nota">${esc(v.motivo)}</span>
          <button type="button" class="link" data-act="registra">${v.ok ? "L'ho comprato, registra la spesa" : 'Lo compro lo stesso'}</button>
        </div>
      </section>` : ''}`;
  }

  function viewRiepilogo() {
    const mese = maiuscola(new Intl.DateTimeFormat('it-IT', { month: 'long', year: 'numeric' }).format(new Date()));
    const fette = [
      ['Fisse', D.speseFisse, 'var(--lilla)'],
      ['Speso', C.speso(), 'var(--accento)'],
      ['Disponibile', Math.max(0, C.disponibile()), 'var(--teal)'],
      ['Risparmio 20%', C.risparmio(), 'var(--ambra)'],
      ['Rata PAC', C.pacMese(), 'var(--verde)']
    ];
    const somma = fette.reduce((a, f) => a + f[1], 0);
    const R = 52, CIRC = 2 * Math.PI * R;
    let pos = 0;
    const archi = somma > 0 ? fette.map(([, val, col]) => {
      const lung = (val / somma) * CIRC;
      const gap = lung > 4 ? 2 : 0;
      const arco = lung > 0.5 ? `<circle cx="66" cy="66" r="${R}" stroke="${col}" stroke-dasharray="${(lung - gap).toFixed(1)} ${CIRC.toFixed(1)}" stroke-dashoffset="${(-pos).toFixed(1)}"/>` : '';
      pos += lung;
      return arco;
    }).join('') : `<circle cx="66" cy="66" r="${R}" stroke="rgba(30,27,75,0.08)"/>`;
    const descr = fette.map(([n, v]) => `${n} ${eur0(v)}`).join(', ');

    const perCat = D.categorie.map((c) => [c, C.totCategoria(c.id)]).filter(([, t]) => t > 0).sort((a, b) => b[1] - a[1]);
    const senzaCat = C.totale((s) => !C.cat(s.categoriaID));
    const massimo = Math.max(1, ...perCat.map(([, t]) => t), senzaCat);
    const sig = D.categorie.find((c) => c.nome.trim().toLowerCase() === 'sigarette');
    const sigMese = sig ? C.totCategoria(sig.id) : 0;
    const ultime = C.speseMese().concat(D.extra.filter((e) => stessoMese(e.data)));

    return `${testata(mese, 'Riepilogo')}
      <section class="vetro" aria-labelledby="t-stip">
        <h2 id="t-stip">Dove va lo stipendio</h2>
        <div class="torta">
          <div class="torta-grafico">
            <svg role="img" aria-label="${esc(descr)}" width="132" height="132" viewBox="0 0 132 132"><g transform="rotate(-90 66 66)" fill="none" stroke-width="16">${archi}</g></svg>
            <div class="torta-centro"><strong data-conta="torta" data-formato="0" data-valore="${C.protetto()}">${eur0(C.protetto())}</strong><span>da parte</span></div>
          </div>
          <ul class="legenda">
            ${fette.map(([n, val, col]) => `<li><span class="quadratino" style="background: ${col}"></span><span class="voce">${n}</span><strong>${eur0(val)}</strong></li>`).join('')}
          </ul>
        </div>
      </section>

      <section class="vetro" aria-labelledby="t-cat">
        <h2 id="t-cat">Per categoria</h2>
        ${perCat.length || senzaCat ? '' : '<p class="nota">Nessuna spesa registrata questo mese.</p>'}
        ${perCat.map(([c, t]) => `<div class="cat-riga">
          <div class="cat-testa"><span class="nome">${esc(c.nome)}</span>${c.essenziale ? '<span class="etichetta">Essenziale</span>' : ''}<strong>${eur(t)}</strong></div>
          <div class="barra-sottile" aria-hidden="true"><span class="${c.essenziale ? 'essenziale' : ''}" style="width: ${Math.round((t / massimo) * 100)}%"></span></div>
        </div>`).join('')}
        ${senzaCat ? `<div class="cat-riga"><div class="cat-testa"><span class="nome">Categorie eliminate</span><strong>${eur(senzaCat)}</strong></div>
          <div class="barra-sottile" aria-hidden="true"><span style="width: ${Math.round((senzaCat / massimo) * 100)}%"></span></div></div>` : ''}
      </section>

      ${sig ? `<section class="avviso" aria-label="Sigarette in un anno">
        <div class="colonna"><span class="titolo-a">Sigarette in un anno</span><span class="nota">A questo ritmo: ${eur(sigMese)} al mese</span></div>
        <span class="cifra" data-conta="sigarette" data-formato="0" data-valore="${sigMese * 12}">${eur0(sigMese * 12)}</span>
      </section>` : ''}

      <section class="vetro" aria-labelledby="t-pac">
        <h2 id="t-pac">Piano di accumulo</h2>
        <div class="griglia3">
          <div class="mini"><span>Rata mensile</span><strong>${eur(D.pac)}</strong></div>
          <div class="mini"><span>Versato finora</span><strong style="color: var(--verde)" data-conta="versato" data-valore="${C.versatoPac()}">${eur(C.versatoPac())}</strong></div>
          <div class="mini"><span>13ª e 14ª</span><strong>${eur(C.extraAnno())}</strong></div>
        </div>
      </section>

      <button type="button" class="vetro vai-movimenti" data-act="tab" data-id="movimenti">
        <span class="colonna"><span class="principale">Movimenti del mese</span><span class="nota">${ultime.length} ${ultime.length === 1 ? 'movimento' : 'movimenti'} · vedi e cancella</span></span>
        <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>
      </button>`;
  }

  // ---------- Movimenti: elenco per mese, con cancellazione ----------
  function movimentiDelMese(offset) {
    const n = new Date();
    const rif = new Date(n.getFullYear(), n.getMonth() - offset, 1);
    const nelMese = (t) => { const d = new Date(t); return d.getFullYear() === rif.getFullYear() && d.getMonth() === rif.getMonth(); };
    const spese = D.spese.filter((s) => nelMese(s.data)).map((s) => {
      const c = C.cat(s.categoriaID);
      return { id: s.id, tipo: 'spesa', data: s.data, importo: s.importo, titolo: c ? c.nome : 'Senza categoria', nota: s.nota || '' };
    });
    const extra = D.extra.filter((e) => nelMese(e.data)).map((e) => ({
      id: e.id, tipo: e.tipo === 'pac' ? 'risparmio' : 'entrata', data: e.data, importo: e.importo, titolo: e.nome,
      nota: e.tipo === 'pac' ? 'Messa da parte nel PAC' : e.tipo === 'stipendio' ? '' : 'Mensilità extra'
    }));
    return { rif, voci: spese.concat(extra).sort((a, b) => b.data - a.data) };
  }

  const filtraMov = (v) => S.filtroMov === 'tutti'
    || (S.filtroMov === 'spese' && v.tipo === 'spesa')
    || (S.filtroMov === 'entrate' && v.tipo === 'entrata')
    || (S.filtroMov === 'risparmi' && v.tipo === 'risparmio');

  function viewMovimenti() {
    const { rif, voci: tutte } = movimentiDelMese(S.meseMov);
    const voci = tutte.filter(filtraMov);
    const nomeMese = maiuscola(new Intl.DateTimeFormat('it-IT', { month: 'long', year: 'numeric' }).format(rif));
    const uscite = tutte.filter((v) => v.tipo === 'spesa').reduce((a, v) => a + v.importo, 0);
    const entrate = tutte.filter((v) => v.tipo === 'entrata').reduce((a, v) => a + v.importo, 0);
    const accantonati = tutte.filter((v) => v.tipo === 'risparmio').reduce((a, v) => a + v.importo, 0);
    const sel = S.selezione;
    const nSel = sel ? voci.filter((v) => sel.has(v.id)).length : 0;
    const fGiorno = new Intl.DateTimeFormat('it-IT', { weekday: 'long', day: 'numeric', month: 'long' });
    const gruppi = [];
    voci.forEach((v) => {
      const k = new Date(v.data).toDateString();
      const g = gruppi[gruppi.length - 1];
      if (g && g.k === k) g.voci.push(v); else gruppi.push({ k, titolo: maiuscola(fGiorno.format(new Date(v.data))), voci: [v] });
    });
    const filtro = (id, nome) => `<button type="button" class="pillola" data-act="filtro-mov" data-id="${id}" aria-pressed="${S.filtroMov === id}">${nome}</button>`;

    return `${testata('Spese ed entrate', 'Movimenti')}
      <section class="vetro" aria-label="Mese">
        <div class="mesi">
          <button type="button" class="x" data-act="mese-prec" aria-label="Mese precedente"><svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M15 6l-6 6 6 6"/></svg></button>
          <h2 aria-live="polite">${nomeMese}</h2>
          <button type="button" class="x" data-act="mese-succ" aria-label="Mese successivo"${S.meseMov === 0 ? ' disabled' : ''}><svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg></button>
        </div>
        <div class="griglia3">
          <div class="mini"><span>Uscite</span><strong data-conta="mov-uscite" data-valore="${uscite}">${eur(uscite)}</strong></div>
          <div class="mini"><span>Entrate</span><strong style="color: var(--verde)" data-conta="mov-entrate" data-valore="${entrate}">${eur(entrate)}</strong></div>
          <div class="mini"><span>Nel PAC</span><strong style="color: var(--accento)" data-conta="mov-pac" data-valore="${accantonati}">${eur(accantonati)}</strong></div>
        </div>
      </section>

      <section class="vetro" aria-labelledby="t-mov">
        <div class="riga-titolo">
          <h2 id="t-mov">${voci.length} ${voci.length === 1 ? 'movimento' : 'movimenti'}</h2>
          ${voci.length ? `<button type="button" class="link" data-act="seleziona">${sel ? 'Fine' : 'Seleziona'}</button>` : ''}
        </div>
        <div class="pillole" role="group" aria-label="Mostra">${filtro('tutti', 'Tutti')}${filtro('spese', 'Spese')}${filtro('entrate', 'Entrate')}${filtro('risparmi', 'PAC')}</div>
        ${sel && voci.length ? `<div class="barra-selezione">
          <button type="button" class="link" data-act="seleziona-tutti">${nSel === voci.length ? 'Deseleziona tutti' : 'Seleziona tutti'}</button>
          <button type="button" class="btn-pericolo" data-act="elimina-selezionati" data-pulsante="selezionati"${nSel ? '' : ' disabled'}>Elimina <span data-conta-sel>${nSel}</span></button>
        </div>` : ''}
        ${voci.length ? gruppi.map((g) => `<div class="giorno">
          <h3 class="giorno-titolo">${esc(g.titolo)}</h3>
          <ul class="lista">${g.voci.map((v) => `<li class="voce-lista${sel && sel.has(v.id) ? ' scelta' : ''}">
            ${sel ? `<input type="checkbox" class="spunta" data-campo="sel" data-id="${v.id}"${sel.has(v.id) ? ' checked' : ''} aria-label="Seleziona ${esc(v.titolo)} ${eur(v.importo)}">` : ''}
            <div class="colonna"><span class="principale">${esc(v.titolo)}</span>${v.nota ? `<span class="secondaria">${esc(v.nota)}</span>` : ''}</div>
            <strong class="${v.tipo === 'entrata' ? 'positivo' : v.tipo === 'risparmio' ? 'accantonato' : ''}">${v.tipo === 'entrata' ? '+' : v.tipo === 'risparmio' ? '→ ' : '−'}${eur(v.importo)}</strong>
            ${sel ? '' : `<button type="button" class="x" data-act="elimina-mov" data-id="${v.id}" data-tipo="${v.tipo}" aria-label="Elimina ${esc(v.titolo)} di ${eur(v.importo)}">${ICONA.x}</button>`}
          </li>`).join('')}</ul>
        </div>`).join('') : `<p class="nota">${tutte.length ? 'Nessun movimento di questo tipo.' : 'Nessun movimento in questo mese.'}</p>`}
      </section>`;
  }

  function viewImpostazioni() {
    const extraAnno = D.extra.filter((e) => !e.tipo && stessoAnno(e.data)).sort((a, b) => b.data - a.data);
    const stipendiMese = D.extra.filter((e) => e.tipo === 'stipendio' && stessoMese(e.data)).sort((a, b) => b.data - a.data);
    const giorno = new Intl.DateTimeFormat('it-IT', { day: 'numeric', month: 'short' });
    const campoEuro = (nome, campo, valore, extraAttr) => `<label class="campo piccolo"><span class="nome-campo">${nome}</span>
      <input type="text" inputmode="decimal" autocomplete="off" placeholder="0" value="${esc(valore)}" data-campo="${campo}" ${extraAttr || ''}><span class="euro">€</span></label>`;

    return `${testata('Il tuo mese', 'Impostazioni')}
      <section class="vetro" aria-labelledby="t-arrivato">
        <h2 id="t-arrivato">È arrivato lo stipendio?</h2>
        <label class="campo"><span class="nome-campo">Importo</span>
          <input type="text" inputmode="decimal" autocomplete="off" placeholder="${esc(numero(C.ultimoStipendio()) || '0')}" value="${esc(S.stipendioArr)}" data-campo="stipendioArr" aria-label="Importo dello stipendio arrivato"><span class="euro">€</span>
        </label>
        <button type="button" class="btn" data-act="stipendio" data-pulsante="stipendio"${parseEuro(S.stipendioArr) > 0 ? '' : ' disabled'}>Registra stipendio</button>
        <p class="nota">${stipendiMese.length
          ? `Questo mese hai registrato ${stipendiMese.map((e) => `${eur(e.importo)} il ${giorno.format(new Date(e.data))}`).join(' e ')}. Per correggerlo, cancellalo da Movimenti.`
          : 'Lo stipendio non è fisso: registralo ogni mese quando arriva.'}${D.pac > 0 ? ` Insieme allo stipendio viene registrata la rata PAC di ${eur(D.pac)}, come movimento a parte.` : ''}</p>
      </section>

      <section class="vetro" aria-labelledby="t-fisse">
        <h2 id="t-fisse">Spese fisse e PAC</h2>
        ${campoEuro('Spese fisse', 'speseFisse', numero(D.speseFisse))}
        ${campoEuro('Rata fissa PAC', 'pac', numero(D.pac))}
        ${campoEuro('PAC già versato', 'pacBase', numero(D.pacTotale))}
        <p class="nota">Spese fisse: affitto, bollette, abbonamenti. L'app mette da parte il 20% delle entrate più la rata del PAC. "PAC già versato" è quanto avevi prima di usare l'app.</p>
      </section>

      <section class="vetro" aria-labelledby="t-extra">
        <div class="riga-titolo"><h2 id="t-extra">Mensilità extra</h2><span class="etichetta grigia">Facoltative</span></div>
        <label class="campo"><span class="nome-campo">Importo</span>
          <input type="text" inputmode="decimal" autocomplete="off" placeholder="0" value="${esc(S.extraImp)}" data-campo="extraImp" aria-label="Importo della mensilità extra"><span class="euro">€</span>
        </label>
        <div class="griglia2">
          <button type="button" class="btn-sec" data-act="extra" data-id="13ª" data-pulsante="extra"${parseEuro(S.extraImp) > 0 ? '' : ' disabled'}>È arrivata la 13ª</button>
          <button type="button" class="btn-sec" data-act="extra" data-id="14ª" data-pulsante="extra"${parseEuro(S.extraImp) > 0 ? '' : ' disabled'}>È arrivata la 14ª</button>
        </div>
        ${extraAnno.length ? `<ul class="lista">${extraAnno.map((e) => `<li class="voce-lista"><div class="colonna"><span class="principale">${esc(e.nome)}</span><span class="secondaria">${giorno.format(new Date(e.data))}</span></div><strong>${eur(e.importo)}</strong>
          <button type="button" class="x" data-act="elimina-extra" data-id="${e.id}" aria-label="Elimina ${esc(e.nome)}">${ICONA.x}</button></li>`).join('')}</ul>` : ''}
        <p class="nota">Si sommano alle entrate del mese in cui arrivano.</p>
      </section>

      <section class="vetro" aria-labelledby="t-categorie">
        <div><h2 id="t-categorie">Categorie</h2><p class="nota">Acceso = essenziale, approvata sempre.</p></div>
        ${D.categorie.map((c) => `<div class="riga-cat">
          <div class="sopra-riga">
            <span class="nome">${esc(c.nome)}</span>
            <button type="button" class="interruttore" role="switch" aria-checked="${c.essenziale}" aria-label="${esc(c.nome)} essenziale" data-act="essenziale" data-id="${c.id}"><span></span></button>
            <button type="button" class="x" data-act="elimina-cat" data-id="${c.id}" aria-label="Elimina categoria ${esc(c.nome)}">${ICONA.x}</button>
          </div>
          <div class="campi-cat">
            <label class="limite">Limite al mese <input type="text" inputmode="decimal" placeholder="—" value="${esc(numero(c.limite))}" data-campo="limite" data-id="${c.id}" aria-label="Limite mensile per ${esc(c.nome)}"> €</label>
            <label class="limite">Prezzo proposto <input type="text" inputmode="decimal" placeholder="—" value="${esc(numero(c.prezzo))}" data-campo="prezzoCat" data-id="${c.id}" aria-label="Prezzo proposto per ${esc(c.nome)}"> €</label>
          </div>
        </div>`).join('')}
        <div class="aggiungi">
          <label class="campo piccolo testo"><span class="nascosto">Nuova categoria</span><input type="text" placeholder="Nuova categoria" value="${esc(S.nuovaCat)}" data-campo="nuovaCat" maxlength="30"></label>
          <button type="button" class="btn piccolo" data-act="aggiungi-cat" data-pulsante="nuovaCat"${S.nuovaCat.trim() ? '' : ' disabled'}>Aggiungi</button>
        </div>
      </section>

      <section class="vetro" aria-labelledby="t-drive" data-drive-sezione>${sezioneDrive()}</section>

      <section class="vetro" aria-labelledby="t-backup">
        <h2 id="t-backup">Backup</h2>
        <p class="nota">Salva una copia dei dati in un file, o ripristinala.</p>
        <div class="riga-bottoni">
          <button type="button" class="btn-sec" data-act="esporta">Esporta backup</button>
          <label class="btn-sec">Importa backup<input class="nascosto" type="file" accept="application/json,.json" data-campo="importa"></label>
        </div>
      </section>`;
  }

  // ---------- Ingresso: accesso a Google e test di collegamento ----------
  const ICONA_TEST = {
    attesa: '<span class="test-icona attesa" aria-hidden="true"></span>',
    corso: '<span class="test-icona corso" aria-hidden="true"></span>',
    ok: '<svg class="test-icona" aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#0B7A6E" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
    ko: '<svg class="test-icona" aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#B42329" stroke-width="2.6" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>'
  };
  const TESTO_TEST = { attesa: 'in attesa', corso: 'in corso', ok: 'riuscito', ko: 'non riuscito' };
  function listaTest() {
    if (!S.test.length) return '';
    return `<ul class="test" aria-label="Test di collegamento">${S.test.map((t) => `<li class="${t.stato}">
      ${ICONA_TEST[t.stato]}<span class="test-nome">${esc(t.nome)}<span class="nascosto">: ${TESTO_TEST[t.stato]}</span></span>
      ${t.dett ? `<span class="test-dett">${esc(t.dett)}</span>` : ''}</li>`).join('')}</ul>`;
  }
  function aggiornaTest() { document.querySelectorAll('[data-test-lista]').forEach((el) => { el.innerHTML = listaTest(); }); }

  function viewIngresso() {
    const f = S.fase;
    let corpo;
    const acc = Drive.account();
    if (f === 'config') {
      const valido = ID_VALIDO.test(S.clientId.trim());
      corpo = `<p class="nota">Per iniziare collega l'app al tuo progetto Google: incolla qui l'ID client OAuth. Finisce con .apps.googleusercontent.com.</p>
        <label class="campo piccolo testo campo-id"><span class="nascosto">ID client Google</span>
          <input type="text" data-campo="clientId" value="${esc(S.clientId)}" placeholder="1234-abc.apps.googleusercontent.com" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" inputmode="url"></label>
        <button type="button" class="btn" data-act="salva-client" data-pulsante="clientId"${valido ? '' : ' disabled'}>Salva e continua</button>
        <div class="origine">
          <span class="etichetta-piccola">Su Google, in "Origini JavaScript autorizzate", scrivi:</span>
          <div class="origine-riga"><code>${esc(location.origin)}</code><button type="button" class="btn-sec" data-act="copia-origine">Copia</button></div>
        </div>
        <p class="nota">L'ID resta solo su questo dispositivo: non serve metterlo nel codice pubblicato.</p>`;
    } else {
      const bottone = f === 'carico' ? ''
        : `<button type="button" class="btn" data-act="accedi"${Drive.client ? '' : ' disabled'}>${!Drive.client ? 'Preparo Google…' : (acc ? `Continua come ${esc(acc)}` : 'Accedi con Google')}</button>`;
      corpo = `<p class="nota">${acc ? 'Bentornato! Il tuo account è ricordato su questo telefono: tocca per continuare, senza password.' : `I tuoi dati sono salvati solo nel tuo Google Drive, nel file ${Drive.NOME}. Niente resta sul telefono, così non si perdono.`}</p>
        ${bottone}
        ${acc && f !== 'carico' ? '<button type="button" class="link centrato" data-act="altro-account">Usa un altro account</button>' : ''}
        <div data-test-lista>${listaTest()}</div>
        ${f === 'errore' && Drive.token() ? '<button type="button" class="btn-sec" data-act="riprova">Riprova il collegamento</button>' : ''}`;
    }
    return `<section class="vetro ingresso" aria-labelledby="t-ingresso">
      <img class="logo" src="img/icon-192.png" alt="" width="96" height="96">
      <h1 id="t-ingresso">Risparmio</h1>
      ${corpo}
    </section>`;
  }

  function render() {
    S.ridisegna = false;
    const app = $('#app');
    const pronto = S.fase === 'pronto';
    const tabbar = document.querySelector('.tabbar');
    tabbar.hidden = !pronto;
    // Le sezioni entrano con un'animazione solo quando cambi schermata.
    const vista = pronto ? S.tab : 'ingresso-' + S.fase;
    const entrata = vista !== S.vista;
    S.vista = vista;
    app.classList.remove('entrata');
    if (entrata) { void app.offsetWidth; app.classList.add('entrata'); }
    if (!pronto) { app.innerHTML = viewIngresso(); return; }
    tabbar.style.setProperty('--i', String(['posso', 'riepilogo', 'movimenti', 'impostazioni'].indexOf(S.tab)));
    app.innerHTML = S.tab === 'riepilogo' ? viewRiepilogo() : S.tab === 'movimenti' ? viewMovimenti()
      : S.tab === 'impostazioni' ? viewImpostazioni() : viewPosso();
    animaNumeri(entrata);
    document.querySelectorAll('.tabbar [data-act="tab"]').forEach((b) => {
      if (b.dataset.id === S.tab) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
    });
  }
  // Le cifre scorrono fino al valore nuovo e le barre crescono.
  const movimentoRidotto = () => window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  function animaNumeri(entrata) {
    const ridotto = movimentoRidotto();
    document.querySelectorAll('#app [data-conta]').forEach((el) => {
      const k = el.dataset.conta, a = Number(el.dataset.valore) || 0;
      const f = el.dataset.formato === '0' ? eur0 : eur;
      const da = entrata ? 0 : (k in S.ultimi ? S.ultimi[k] : a);
      S.ultimi[k] = a;
      if (ridotto || Math.abs(da - a) < 0.005) return;
      const t0 = performance.now(), durata = 800;
      el.textContent = f(da);
      const passo = (t) => {
        if (!el.isConnected) return;
        const x = Math.min(1, (t - t0) / durata), e = 1 - Math.pow(1 - x, 3);
        el.textContent = x < 1 ? f(da + (a - da) * e) : f(a);
        if (x < 1) requestAnimationFrame(passo);
      };
      requestAnimationFrame(passo);
    });
    document.querySelectorAll('#app [data-barra]').forEach((el) => {
      const k = 'barra-' + el.dataset.barra, a = Number(el.dataset.pct) || 0;
      const da = entrata ? 0 : (k in S.ultimi ? S.ultimi[k] : a);
      S.ultimi[k] = a;
      if (ridotto || da === a) return;
      el.style.transition = 'none';
      el.style.width = da + '%';
      void el.offsetWidth;
      el.style.transition = '';
      el.style.width = a + '%';
    });
  }

  // Ridisegna senza togliere il cursore da un campo che stai scrivendo.
  function ridisegnaSicuro() {
    const a = document.activeElement;
    if (a && a.tagName === 'INPUT' && a.closest('#app')) S.ridisegna = true; else render();
  }
  document.addEventListener('focusout', () => {
    if (!S.ridisegna) return;
    setTimeout(() => {
      const a = document.activeElement;
      if (S.ridisegna && !(a && a.tagName === 'INPUT' && a.closest('#app'))) render();
    }, 50);
  });

  let timerToast;
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('vis');
    clearTimeout(timerToast);
    timerToast = setTimeout(() => t.classList.remove('vis'), 2600);
  }

  // ---------- Spesa arrivata da Apple Pay (Comandi Rapidi) ----------
  function mostraPendente() {
    const m = $('#modale');
    const p = S.pendente;
    if (!p || S.fase !== 'pronto') { m.hidden = true; m.innerHTML = ''; return; }
    m.hidden = false;
    m.innerHTML = `<div class="foglio vetro" role="dialog" aria-modal="true" aria-labelledby="t-pend">
      <h2 id="t-pend">Che spesa era?</h2>
      <p class="nota">Hai speso <strong>${eur(p.importo)}</strong>${p.esercente ? ` da <strong>${esc(p.esercente)}</strong>` : ''} con Apple Pay.</p>
      <div class="griglia-cat">${D.categorie.map((c) => `<button type="button" class="pillola" data-act="pendente-cat" data-id="${c.id}">${esc(c.nome)}</button>`).join('')}</div>
      <button type="button" class="link" data-act="pendente-annulla">Non registrarla</button>
    </div>`;
    const primo = m.querySelector('button');
    if (primo) primo.focus();
  }

  function leggiLink() {
    const p = new URLSearchParams(location.search);
    const raw = p.get('spesa') || p.get('importo');
    if (raw != null) {
      const v = Math.abs(parseEuro(raw));
      if (v > 0) S.pendente = { importo: v, esercente: (p.get('esercente') || '').trim().slice(0, 60) };
      history.replaceState(null, '', location.pathname);
    }
  }

  // ---------- Azioni ----------
  const azioni = {
    tab(el, id) { S.tab = id; render(); window.scrollTo(0, 0); },
    cat(el, id) {
      const c = C.cat(id);
      // Categoria con prezzo proposto: lo scrive lei se il prezzo è vuoto o era quello proposto da un'altra.
      if (c && c.prezzo > 0 && (!S.prezzo.trim() || S.prezzoProposto === S.prezzo)) {
        S.prezzo = numero(c.prezzo);
        S.prezzoProposto = S.prezzo;
      } else if (S.prezzoProposto === S.prezzo && !(c && c.prezzo > 0)) {
        S.prezzo = ''; S.prezzoProposto = null;
      }
      S.catId = id; S.verdetto = null; render();
    },
    chiedi() {
      const imp = parseEuro(S.prezzo), c = C.cat(S.catId);
      if (!(imp > 0) || !c) return;
      S.verdetto = C.valuta(imp, c);
      render();
      const v = $('#verdetto');
      if (v) v.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    },
    registra() {
      const imp = parseEuro(S.prezzo), c = C.cat(S.catId);
      if (!(imp > 0) || !c) return;
      D.spese.push({ id: uid(), importo: imp, categoriaID: c.id, data: Date.now(), nota: '' });
      S.prezzo = ''; S.verdetto = null;
      salva(); render();
      toast(`Registrati ${eur(imp)} in ${c.nome}`);
    },
    'mese-prec'() { S.meseMov++; S.selezione = null; render(); },
    'mese-succ'() { if (S.meseMov > 0) { S.meseMov--; S.selezione = null; render(); } },
    'filtro-mov'(el, id) { S.filtroMov = id; if (S.selezione) S.selezione.clear(); render(); },
    seleziona() { S.selezione = S.selezione ? null : new Set(); render(); },
    'seleziona-tutti'() {
      const { voci } = movimentiDelMese(S.meseMov);
      const visibili = voci.filter(filtraMov);
      const tutti = visibili.every((v) => S.selezione.has(v.id));
      visibili.forEach((v) => { if (tutti) S.selezione.delete(v.id); else S.selezione.add(v.id); });
      render();
    },
    'elimina-mov'(el, id) {
      const spesa = D.spese.find((s) => s.id === id);
      const extra = D.extra.find((e) => e.id === id);
      const v = spesa || extra;
      if (!v) return;
      const nome = spesa ? (C.cat(spesa.categoriaID) || { nome: 'spesa' }).nome : extra.nome;
      const rata = extra && extra.tipo === 'stipendio' ? D.extra.find((e) => e.rif === id) : null;
      if (!confirm(`Eliminare ${nome} di ${eur(v.importo)}?${rata ? ` Viene tolta anche la rata PAC di ${eur(rata.importo)} collegata.` : ''}`)) return;
      eliminaMovimenti([id]);
      toast(`Eliminato: ${nome} ${eur(v.importo)}`);
    },
    'elimina-selezionati'() {
      const ids = [...(S.selezione || [])];
      if (!ids.length) return;
      if (!confirm(`Eliminare ${ids.length} ${ids.length === 1 ? 'movimento' : 'movimenti'}? Non si può annullare.`)) return;
      eliminaMovimenti(ids);
      S.selezione = null;
      render();
      toast(`${ids.length} ${ids.length === 1 ? 'movimento eliminato' : 'movimenti eliminati'}`);
    },
    'elimina-spesa'(el, id) {
      if (!confirm('Eliminare questa spesa?')) return;
      D.spese = D.spese.filter((s) => s.id !== id);
      D.eliminati.push(id);
      salva(); render();
    },
    stipendio() {
      const v = parseEuro(S.stipendioArr);
      if (!(v > 0)) return;
      const ora = Date.now(), id = uid();
      D.extra.push({ id, tipo: 'stipendio', nome: 'Stipendio', importo: v, data: ora });
      if (D.pac > 0) D.extra.push({ id: `${id}-pac`, tipo: 'pac', nome: 'Rata PAC', importo: D.pac, rif: id, data: ora + 1 });
      S.stipendioArr = '';
      salva(); render();
      toast(D.pac > 0 ? `Stipendio registrato · ${eur(D.pac)} nel PAC` : 'Stipendio registrato');
    },
    extra(el, nome) {
      const v = parseEuro(S.extraImp);
      if (!(v > 0)) return;
      D.extra.push({ id: uid(), nome, importo: v, data: Date.now() });
      S.extraImp = '';
      salva(); render();
      toast(`${nome} registrata: +${eur(v)} questo mese`);
    },
    'elimina-extra'(el, id) {
      if (!confirm('Eliminare questa mensilità?')) return;
      D.extra = D.extra.filter((e) => e.id !== id);
      D.eliminati.push(id);
      salva(); render();
    },
    essenziale(el, id) {
      const c = C.cat(id); if (!c) return;
      c.essenziale = !c.essenziale;
      salva(); render();
    },
    'elimina-cat'(el, id) {
      const c = C.cat(id); if (!c) return;
      if (!confirm(`Eliminare la categoria ${c.nome}? Le spese già registrate restano nei totali.`)) return;
      D.categorie = D.categorie.filter((x) => x.id !== id);
      D.eliminati.push(id);
      if (S.catId === id) S.catId = null;
      salva(); render();
    },
    'aggiungi-cat'() {
      const nome = S.nuovaCat.trim();
      if (!nome) return;
      if (D.categorie.some((c) => c.nome.trim().toLowerCase() === nome.toLowerCase())) { toast('Questa categoria esiste già'); return; }
      D.categorie.push({ id: uid(), nome, essenziale: false, limite: null, prezzo: null });
      S.nuovaCat = '';
      salva(); render();
    },
    'salva-client'() {
      const id = S.clientId.trim();
      if (!ID_VALIDO.test(id)) { toast("L'ID client deve finire con .apps.googleusercontent.com"); return; }
      scrivi(K.clientId, id);
      location.reload();
    },
    'copia-origine'() {
      const fatto = () => toast('Indirizzo copiato');
      if (navigator.clipboard) navigator.clipboard.writeText(location.origin).then(fatto).catch(() => toast(location.origin));
      else toast(location.origin);
    },
    'cambia-client'() {
      if (!confirm("Cambiare l'ID client di Google? Esci da Google e lo inserisci di nuovo. I dati restano su Drive.")) return;
      Drive.esci();
      scrivi(K.clientId, null);
      location.reload();
    },
    accedi() {
      Drive.accedi().then(apri).catch((e) => {
        toast(e.message === 'nonpronto' ? 'Google non è ancora pronto: riprova tra un attimo' : 'Accesso a Google non riuscito');
      });
    },
    riprova() { apri(); },
    'altro-account'() {
      Drive.accedi(true).then(apri).catch(() => toast('Accesso a Google non riuscito'));
    },
    ricollega() {
      Drive.accedi().then(() => {
        mostraBlocco();
        if (Drive.sporco) Drive.salvaOra(); else Drive.ricarica();
        toast('Ricollegato a Google Drive');
      }).catch(() => toast('Accesso a Google non riuscito'));
    },
    'drive-tocca'() {
      if (!Drive.token()) { mostraBlocco(); return; }
      if (Drive.stato === 'errore' || Drive.sporco) Drive.salvaOra(); else Drive.ricarica(true);
    },
    async prova() {
      if (!Drive.token()) { mostraBlocco(); return; }
      if (Drive.inCorso) await Drive.inCorso;
      try {
        D = await provaCollegamento();
        Drive.sporco = false;
        Drive.imposta('ok');
        toast('Collegamento riuscito');
      } catch (e) {
        Drive.imposta(e.message === 'auth' ? 'scaduto' : 'errore');
        toast('Il collegamento ha un problema: guarda il test');
      }
    },
    esci() {
      if (Drive.sporco && !confirm('Ci sono modifiche non ancora salvate su Drive. Uscire lo stesso?')) return;
      if (!Drive.sporco && !confirm('Uscire da Google? I tuoi dati restano nel file su Drive.')) return;
      Drive.esci();
      D = null; S.test = []; S.fase = 'accesso'; S.tab = 'posso';
      render();
    },
    esporta() {
      const blob = new Blob([JSON.stringify(D, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `risparmio-backup-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    },
    'pendente-cat'(el, id) {
      const p = S.pendente, c = C.cat(id);
      if (!p || !c) return;
      D.spese.push({ id: uid(), importo: p.importo, categoriaID: c.id, data: Date.now(), nota: p.esercente || 'Apple Pay' });
      S.pendente = null;
      salva(); mostraPendente(); render();
      toast(`Registrati ${eur(p.importo)} in ${c.nome}`);
    },
    'pendente-annulla'() { S.pendente = null; mostraPendente(); }
  };

  // Mentre scrivi: niente ridisegno, si aggiornano solo i bottoni.
  function abilita(nome, si) { document.querySelectorAll(`[data-pulsante="${nome}"]`).forEach((b) => { b.disabled = !si; }); }
  // Cancella spese o mensilità extra, anche su Drive e sugli altri dispositivi.
  function eliminaMovimenti(ids) {
    const via = new Set(ids);
    // Togliendo uno stipendio si toglie anche la sua rata PAC.
    D.extra.forEach((e) => { if (e.rif && via.has(e.rif)) via.add(e.id); });
    ids = [...via];
    D.spese = D.spese.filter((s) => !via.has(s.id));
    D.extra = D.extra.filter((e) => !via.has(e.id));
    ids.forEach((id) => D.eliminati.push(id));
    salva();
    render();
  }

  const mentreScrivi = {
    clientId(el) { S.clientId = el.value; abilita('clientId', ID_VALIDO.test(el.value.trim())); },
    prezzo(el) {
      S.prezzo = el.value;
      S.prezzoProposto = null;
      if (S.verdetto) { S.verdetto = null; const v = $('#verdetto'); if (v) v.remove(); }
      abilita('chiedi', parseEuro(S.prezzo) > 0 && !!C.cat(S.catId));
    },
    stipendioArr(el) { S.stipendioArr = el.value; abilita('stipendio', parseEuro(el.value) > 0); },
    extraImp(el) { S.extraImp = el.value; abilita('extra', parseEuro(el.value) > 0); },
    nuovaCat(el) { S.nuovaCat = el.value; abilita('nuovaCat', !!el.value.trim()); }
  };
  // A campo confermato: si salva.
  const aFineCampo = {
    sel(el) {
      if (!S.selezione) return;
      if (el.checked) S.selezione.add(el.dataset.id); else S.selezione.delete(el.dataset.id);
      const li = el.closest('.voce-lista'); if (li) li.classList.toggle('scelta', el.checked);
      const n = S.selezione.size;
      document.querySelectorAll('[data-conta-sel]').forEach((x) => { x.textContent = n; });
      abilita('selezionati', n > 0);
    },
    pacBase(el) { const v = parseEuro(el.value); D.pacTotale = v > 0 ? v : 0; el.value = numero(D.pacTotale); salva(); },
    speseFisse(el) { const v = parseEuro(el.value); D.speseFisse = v > 0 ? v : 0; el.value = numero(D.speseFisse); salva(); },
    pac(el) { const v = parseEuro(el.value); D.pac = v > 0 ? v : 0; el.value = numero(D.pac); salva(); },
    prezzoCat(el) {
      const c = C.cat(el.dataset.id); if (!c) return;
      const v = parseEuro(el.value); c.prezzo = v > 0 ? v : null; el.value = numero(c.prezzo); salva();
    },
    limite(el) {
      const c = C.cat(el.dataset.id); if (!c) return;
      const v = parseEuro(el.value); c.limite = v > 0 ? v : null; el.value = numero(c.limite); salva();
    },
    importa(el) {
      const f = el.files && el.files[0];
      if (!f) return;
      f.text().then((t) => {
        const nuovi = normalizza(JSON.parse(t));
        if (!confirm('Sostituire i dati attuali con quelli del backup?')) return;
        D = nuovi; salva(); render();
        toast('Backup ripristinato');
      }).catch(() => toast('Questo file non è un backup valido'))
        .finally(() => { el.value = ''; });
    }
  };

  // Le azioni che cambiano i dati partono solo con l'accesso a Google valido,
  // così ogni modifica arriva davvero su Drive.
  const MODIFICANO = new Set(['registra', 'elimina-spesa', 'elimina-mov', 'elimina-selezionati', 'stipendio', 'extra', 'elimina-extra', 'essenziale', 'elimina-cat', 'aggiungi-cat', 'pendente-cat',
    'speseFisse', 'pac', 'pacBase', 'limite', 'prezzoCat', 'importa']);
  function puoModificare() {
    if (S.fase !== 'pronto') return false;
    if (Drive.token()) return true;
    Drive.imposta('scaduto');
    mostraBlocco();
    return false;
  }

  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-act]');
    if (!el || el.disabled) return;
    const f = azioni[el.dataset.act];
    if (!f) return;
    if (MODIFICANO.has(el.dataset.act) && S.fase === 'pronto' && !Drive.token()) {
      // Accesso scaduto: lo rinnova con questo stesso tocco e poi fa quello che volevi.
      if (!Drive.client) { puoModificare(); return; }
      Drive.accedi().then(() => {
        Drive.imposta(Drive.sporco ? 'salvo' : 'ok');
        mostraBlocco();
        f(el, el.dataset.id, e);
        if (Drive.sporco) Drive.salvaOra();
      }).catch(() => { Drive.imposta('scaduto'); mostraBlocco(); });
      return;
    }
    if (MODIFICANO.has(el.dataset.act) && !puoModificare()) return;
    f(el, el.dataset.id, e);
  });
  document.addEventListener('input', (e) => { const f = mentreScrivi[e.target.dataset.campo]; if (f) f(e.target); });
  document.addEventListener('change', (e) => {
    const campo = e.target.dataset.campo;
    const f = aFineCampo[campo];
    if (!f) return;
    if (MODIFICANO.has(campo) && !puoModificare()) {
      if (campo === 'importa') e.target.value = '';
      return;
    }
    f(e.target);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && S.pendente) { S.pendente = null; mostraPendente(); return; }
    if (e.key !== 'Enter' || e.target.tagName !== 'INPUT') return;
    const campo = e.target.dataset.campo;
    const vai = { prezzo: 'chiedi', stipendioArr: 'stipendio', nuovaCat: 'aggiungi-cat', clientId: 'salva-client' }[campo];
    if (vai) {
      e.preventDefault();
      const b = document.querySelector(`[data-act="${vai}"]`);
      if (b && !b.disabled && (!MODIFICANO.has(vai) || puoModificare())) azioni[vai](b, b.dataset.id);
    }
    else e.target.blur();
  });

  // ---------- Google Drive ----------
  const STATI = {
    ok: ['Salvato su Drive', 'ok'],
    salvo: ['Salvo su Drive…', 'salvando'],
    scaduto: ['Ricollega Google', 'errore'],
    errore: ['Non salvato · Riprova', 'errore']
  };
  function chipDrive() {
    const [testo, cls] = STATI[Drive.stato] || STATI.ok;
    return `<button type="button" class="chip ${cls}" data-act="drive-tocca" aria-label="Google Drive: ${testo}">${ICONA.nuvola}${testo}</button>`;
  }
  function sezioneDrive() {
    const ultima = Number(leggi(K.ultima)) || 0;
    const quando = ultima ? new Intl.DateTimeFormat('it-IT', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(ultima)) : '';
    const u = Drive.utente;
    const chi = u ? [u.displayName, u.emailAddress].filter(Boolean).join(' · ') : '';
    const testo = {
      ok: `Tutto salvato nel file ${Drive.NOME}.`,
      salvo: 'Sto salvando su Drive…',
      scaduto: "L'accesso a Google è scaduto: ricollegati per continuare.",
      errore: "L'ultimo salvataggio non è riuscito. Tocca Prova collegamento."
    }[Drive.stato] || '';
    return `<h2 id="t-drive">Google Drive</h2>
      <p class="nota">${esc(testo)}${chi ? ` Account: ${esc(chi)}.` : ''}${quando ? ` Ultimo salvataggio: ${quando}.` : ''}</p>
      <div data-test-lista>${listaTest()}</div>
      <div class="riga-bottoni">
        <button type="button" class="btn-sec" data-act="prova">Prova collegamento</button>
        <button type="button" class="btn-sec" data-act="esci">Esci da Google</button>
        <button type="button" class="btn-sec" data-act="cambia-client">Cambia ID client</button>
      </div>`;
  }

  // Finestra che blocca l'app quando l'accesso a Google è scaduto.
  function mostraBlocco() {
    const b = $('#blocco');
    if (S.fase !== 'pronto' || Drive.token()) { b.hidden = true; b.innerHTML = ''; return; }
    if (!b.hidden) return;
    b.hidden = false;
    b.innerHTML = `<div class="foglio vetro" role="alertdialog" aria-modal="true" aria-labelledby="t-blocco" aria-describedby="d-blocco">
      <h2 id="t-blocco">Conferma l'accesso a Google</h2>
      <p class="nota" id="d-blocco">${Drive.sporco ? '<strong>Hai modifiche non ancora salvate.</strong> ' : ''}Google chiede di confermare l'accesso ogni ora. Il tuo account è ricordato: basta un tocco, senza password.</p>
      <button type="button" class="btn" data-act="ricollega">${Drive.account() ? `Continua come ${esc(Drive.account())}` : 'Continua'}</button>
    </div>`;
    const btn = b.querySelector('button');
    if (btn) btn.focus();
  }

  class ErroreDrive extends Error {
    constructor(tipo, stato) { super(tipo); this.stato = stato; }
  }
  function messaggioErrore(e) {
    if (!e) return 'Errore sconosciuto';
    if (e.message === 'auth') return 'Accesso a Google scaduto o negato';
    if (e.message === 'rete') return 'Nessuna connessione a Internet';
    if (e.message === 'formato') return 'Il file su Drive non è leggibile';
    if (e.stato === 403) return 'Permesso negato: controlla che Google Drive API sia attiva';
    if (e.stato === 429 || e.stato >= 500) return `Google non risponde (errore ${e.stato}), riprova tra poco`;
    if (e.stato) return `Errore di Google Drive ${e.stato}`;
    return 'Errore: ' + e.message;
  }

  const Drive = {
    SCOPE: 'https://www.googleapis.com/auth/drive.file',
    NOME: 'risparmio-dati.json',
    stato: 'ok',
    client: null, attesa: null, timer: null, inCorso: null, ancora: false, gen: 0, sporco: false, utente: null,

    // L'ID client si inserisce dall'app (resta su questo dispositivo); config.js è solo un'alternativa.
    idClient() { return String(leggi(K.clientId) || CFG.GOOGLE_CLIENT_ID || '').trim(); },
    configurato() { return !!this.idClient(); },
    token() {
      try { const t = JSON.parse(leggi(K.token) || 'null'); if (t && t.scade > Date.now() + 60000) return t.valore; } catch (e) { /* niente */ }
      return null;
    },

    caricaGoogle() {
      const s = document.createElement('script');
      s.src = 'https://accounts.google.com/gsi/client';
      s.async = true;
      s.onload = () => {
        try {
          this.client = google.accounts.oauth2.initTokenClient({
            client_id: this.idClient(),
            scope: this.SCOPE,
            callback: (r) => this.risposta(r),
            error_callback: (e) => this.fallito(e)
          });
        } catch (e) { console.warn(e); }
        if (S.fase !== 'pronto') render();
      };
      s.onerror = () => {
        S.test = [{ nome: 'Caricamento di Google', stato: 'ko', dett: 'Non raggiungibile: controlla la connessione' }];
        if (S.fase !== 'pronto') render();
      };
      document.head.appendChild(s);
    },
    // Va chiamata direttamente dal tocco, altrimenti il browser blocca la finestra di Google.
    // L'account resta ricordato sul telefono: Google riconosce subito chi sei, senza password.
    account() { return leggi(K.collegato) === '1' ? (leggi(K.account) || '') : ''; },
    accedi(altro) {
      return new Promise((ok, ko) => {
        if (!this.client) { ko(new Error('nonpronto')); return; }
        this.attesa = { ok, ko };
        const conf = { prompt: altro ? 'select_account' : (leggi(K.collegato) === '1' ? '' : 'consent') };
        if (!altro && this.account()) conf.login_hint = this.account();
        this.client.requestAccessToken(conf);
      });
    },
    risposta(r) {
      const a = this.attesa; this.attesa = null;
      if (!r || r.error || !r.access_token) { if (a) a.ko(new Error((r && r.error) || 'negato')); return; }
      if (google.accounts.oauth2.hasGrantedAllScopes && !google.accounts.oauth2.hasGrantedAllScopes(r, this.SCOPE)) {
        if (a) a.ko(new Error('permesso'));
        return;
      }
      scrivi(K.token, JSON.stringify({ valore: r.access_token, scade: Date.now() + (Number(r.expires_in) || 3600) * 1000 }));
      scrivi(K.collegato, '1');
      if (a) a.ok();
    },
    fallito(e) { const a = this.attesa; this.attesa = null; if (a) a.ko(new Error((e && e.type) || 'errore')); },
    esci() {
      const t = this.token();
      try { if (t && window.google && google.accounts) google.accounts.oauth2.revoke(t, () => {}); } catch (e) { /* niente */ }
      [K.token, K.collegato, K.file, K.ultima, K.account].forEach((k) => scrivi(k, null));
      clearTimeout(this.timer);
      this.sporco = false; this.utente = null; this.stato = 'ok';
    },

    async api(url, opt) {
      const t = this.token();
      if (!t) throw new ErroreDrive('auth');
      opt = opt || {};
      let r;
      try {
        r = await fetch(url, Object.assign({}, opt, { headers: Object.assign({}, opt.headers, { Authorization: 'Bearer ' + t }) }));
      } catch (e) { throw new ErroreDrive('rete'); }
      if (r.status === 401) { scrivi(K.token, null); throw new ErroreDrive('auth', 401); }
      return r;
    },
    async chiSei() {
      const r = await this.api('https://www.googleapis.com/drive/v3/about?fields=user(displayName,emailAddress)');
      if (!r.ok) throw new ErroreDrive('http', r.status);
      const j = await r.json();
      this.utente = j.user || null;
      if (this.utente && this.utente.emailAddress) scrivi(K.account, this.utente.emailAddress);
      return this.utente;
    },
    async trova() {
      const salvato = leggi(K.file);
      if (salvato) return salvato;
      const q = encodeURIComponent(`name='${this.NOME}' and trashed=false`);
      const r = await this.api(`https://www.googleapis.com/drive/v3/files?q=${q}&spaces=drive&orderBy=modifiedTime%20desc&pageSize=1&fields=files(id)`);
      if (!r.ok) throw new ErroreDrive('http', r.status);
      const j = await r.json();
      const f = j.files && j.files[0];
      if (f) { scrivi(K.file, f.id); return f.id; }
      return null;
    },
    // undefined = file sparito, null = file vuoto
    async scarica(id) {
      const r = await this.api(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}?alt=media`);
      if (r.status === 404) { scrivi(K.file, null); return undefined; }
      if (!r.ok) throw new ErroreDrive('http', r.status);
      const t = await r.text();
      if (!t.trim()) return null;
      try { return normalizza(JSON.parse(t)); } catch (e) { throw new ErroreDrive('formato'); }
    },
    // Scarica il file, ritrovandolo se è stato spostato o ricreato.
    async leggiFile() {
      let id = await this.trova();
      if (!id) return { id: null, dati: null };
      let dati = await this.scarica(id);
      if (dati === undefined) {
        id = await this.trova();
        dati = id ? await this.scarica(id) : null;
        if (dati === undefined) { id = null; dati = null; }
      }
      return { id, dati };
    },
    async crea(dati) {
      const b = 'risparmio' + Date.now();
      const corpo = `--${b}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify({ name: this.NOME, mimeType: 'application/json', description: "Dati dell'app Risparmio" })}\r\n--${b}\r\nContent-Type: application/json\r\n\r\n${JSON.stringify(dati)}\r\n--${b}--`;
      const r = await this.api('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id', {
        method: 'POST', headers: { 'Content-Type': `multipart/related; boundary=${b}` }, body: corpo
      });
      if (!r.ok) throw new ErroreDrive('http', r.status);
      const j = await r.json();
      scrivi(K.file, j.id);
      return j.id;
    },
    async aggiorna(id, dati) {
      const r = await this.api(`https://www.googleapis.com/upload/drive/v3/files/${encodeURIComponent(id)}?uploadType=media`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(dati)
      });
      if (r.status === 404) { scrivi(K.file, null); return false; }
      if (!r.ok) throw new ErroreDrive('http', r.status);
      return true;
    },
    async scriviFile(id, dati) {
      if (id && await this.aggiorna(id, dati)) return id;
      return this.crea(dati);
    },
    segnaOra() { scrivi(K.ultima, String(Date.now())); },

    // Dopo ogni modifica: salva quasi subito (raccoglie i tocchi ravvicinati).
    modificato() {
      this.gen++;
      this.sporco = true;
      this.imposta('salvo');
      clearTimeout(this.timer);
      this.timer = setTimeout(() => this.salvaOra(), 300);
    },
    // Legge il file, unisce le modifiche di altri dispositivi e riscrive: nessuna spesa va persa.
    salvaOra() {
      clearTimeout(this.timer);
      if (!this.token()) { this.imposta('scaduto'); mostraBlocco(); return Promise.resolve(); }
      if (this.inCorso) { this.ancora = true; return this.inCorso; }
      const gen = this.gen;
      this.imposta('salvo');
      this.inCorso = (async () => {
        try {
          const prima = JSON.stringify(D);
          const { id, dati } = await this.leggiFile();
          if (dati) D = unisci(D, dati);
          await this.scriviFile(id, D);
          if (this.gen === gen) this.sporco = false;
          this.segnaOra();
          this.imposta(this.sporco ? 'salvo' : 'ok');
          if (JSON.stringify(D) !== prima) ridisegnaSicuro();
        } catch (e) {
          console.warn('Drive:', e);
          if (e.message === 'auth') { this.imposta('scaduto'); mostraBlocco(); } else { this.imposta('errore'); toast('Salvataggio su Drive non riuscito: ' + messaggioErrore(e)); }
        } finally {
          this.inCorso = null;
          if (this.ancora) { this.ancora = false; this.salvaOra(); }
        }
      })();
      return this.inCorso;
    },
    // Rilegge da Drive le modifiche fatte su un altro dispositivo.
    ricarica(avvisa) {
      if (this.sporco) return this.salvaOra();
      if (!this.token()) { this.imposta('scaduto'); mostraBlocco(); return Promise.resolve(); }
      if (this.inCorso) return this.inCorso;
      this.imposta('salvo');
      this.inCorso = (async () => {
        try {
          const { dati } = await this.leggiFile();
          if (dati && !this.sporco) {
            const prima = JSON.stringify(D);
            D = unisci(D, dati);
            if (JSON.stringify(D) !== prima) ridisegnaSicuro();
          }
          this.imposta(this.sporco ? 'salvo' : 'ok');
          if (avvisa) toast('Dati aggiornati da Drive');
        } catch (e) {
          if (e.message === 'auth') { this.imposta('scaduto'); mostraBlocco(); } else this.imposta('errore');
        } finally {
          this.inCorso = null;
          if (this.sporco) this.salvaOra();
        }
      })();
      return this.inCorso;
    },
    imposta(s) {
      this.stato = s;
      document.querySelectorAll('[data-drive-chip]').forEach((el) => { el.innerHTML = chipDrive(); });
      document.querySelectorAll('[data-drive-sezione]').forEach((el) => { el.innerHTML = sezioneDrive(); });
    }
  };

  // Test di collegamento passo per passo. Restituisce i dati letti (e salvati) su Drive.
  async function provaCollegamento() {
    const passi = [
      ['google', 'Accesso a Google'],
      ['drive', 'Google Drive raggiungibile'],
      ['file', `File ${Drive.NOME}`],
      ['lettura', 'Lettura dei dati'],
      ['scrittura', 'Salvataggio su Drive']
    ].map(([id, nome]) => ({ id, nome, stato: 'attesa', dett: '' }));
    S.test = passi;
    aggiornaTest();
    const trova = (id) => passi.find((p) => p.id === id);
    async function passo(id, fn) {
      const p = trova(id);
      p.stato = 'corso'; aggiornaTest();
      const t0 = performance.now();
      try {
        const r = await fn(p);
        p.stato = 'ok';
        if (!p.dett) p.dett = `${Math.round(performance.now() - t0)} ms`;
        aggiornaTest();
        return r;
      } catch (e) {
        p.stato = 'ko'; p.dett = messaggioErrore(e); aggiornaTest();
        throw e;
      }
    }

    await passo('google', async (p) => { if (!Drive.token()) throw new ErroreDrive('auth'); p.dett = 'Collegato'; });
    await passo('drive', async (p) => {
      const u = await Drive.chiSei();
      p.dett = u ? (u.emailAddress || u.displayName || '') : '';
    });
    let id = await passo('file', async (p) => {
      const trovato = await Drive.trova();
      p.dett = trovato ? 'Trovato' : 'Non esiste ancora: lo creo';
      return trovato;
    });
    let remoto = await passo('lettura', async (p) => {
      if (!id) { p.dett = 'Nessun dato precedente'; return null; }
      const r = await Drive.leggiFile();
      id = r.id;
      p.dett = r.dati ? `${r.dati.spese.length} spese, ${r.dati.categorie.length} categorie` : 'File vuoto';
      return r.dati;
    });

    let dati = remoto;
    if (D) dati = dati ? unisci(D, dati) : D;
    const vecchi = vecchiDatiLocali();
    if (vecchi) dati = dati ? unisci(dati, vecchi) : vecchi;
    if (!dati) { dati = nuoviDati(); dati.aggiornato = Date.now(); }

    await passo('scrittura', async () => { id = await Drive.scriviFile(id, dati); });
    if (vecchi) scrivi(K.dati, null); // i vecchi dati del telefono ora sono su Drive
    Drive.segnaOra();
    return dati;
  }

  // Dopo l'accesso: test di collegamento e caricamento dei dati.
  async function apri() {
    S.fase = 'carico';
    render();
    try {
      D = await provaCollegamento();
      Drive.sporco = false;
      Drive.stato = 'ok';
      S.fase = 'pronto';
      render();
      mostraPendente();
    } catch (e) {
      console.warn('Collegamento:', e);
      S.fase = 'errore';
      render();
    }
  }

  // ---------- Zoom bloccato ----------
  // Safari su iPhone ignora user-scalable=no, quindi il pizzico con due dita si ferma qui.
  ['gesturestart', 'gesturechange', 'gestureend'].forEach((ev) => document.addEventListener(ev, (e) => e.preventDefault(), { passive: false }));
  document.addEventListener('touchmove', (e) => { if (e.touches && e.touches.length > 1) e.preventDefault(); }, { passive: false });
  // Il doppio tocco lo blocca già touch-action: manipulation nel CSS (senza perdere i tocchi veloci).

  // ---------- Avvio ----------
  leggiLink();
  if (!Drive.configurato()) {
    S.fase = 'config';
    render();
  } else {
    Drive.caricaGoogle();
    if (Drive.token()) apri(); else { S.fase = 'accesso'; render(); }
  }

  // Quando torni sull'app: controlla l'accesso e prendi le modifiche dagli altri dispositivi.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible' || S.fase !== 'pronto') return;
    if (!Drive.token()) { Drive.imposta('scaduto'); mostraBlocco(); return; }
    Drive.ricarica();
    ridisegnaSicuro();
  });
  setInterval(() => {
    if (S.fase === 'pronto' && !Drive.token()) { Drive.imposta('scaduto'); mostraBlocco(); }
  }, 30000);
  window.addEventListener('beforeunload', (e) => {
    if (Drive.sporco) { e.preventDefault(); e.returnValue = ''; }
  });

  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    // Quando arriva una versione nuova dell'app, la pagina si ricarica da sola (una volta).
    const avevaController = !!navigator.serviceWorker.controller;
    let ricaricata = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!avevaController || ricaricata || Drive.sporco) return;
      ricaricata = true;
      location.reload();
    });
    navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' })
      .then((reg) => { reg.update(); document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') reg.update(); }); })
      .catch(() => { /* senza service worker l'app funziona lo stesso */ });
  }
})();
