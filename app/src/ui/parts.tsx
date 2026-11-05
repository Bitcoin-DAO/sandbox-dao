import type { ComponentChildren } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { setLang, useApp } from '../app';
import { t } from '../i18n';
import { qrMatrix, startScanner, type Scanner } from '../lib/qr';
import { rpId } from '../lib/passkey';
import { stageOf } from '../core/config';
import { cardPayload } from '../core/identity';
import { shortCode, formatShortCode } from '../core/shortcode';
import { fmtDate } from '../i18n';

export const go = (path: string) => {
  location.hash = '#' + path;
  window.scrollTo(0, 0);
};

export function errText(e: unknown): string {
  const msg = String((e as Error)?.message ?? e);
  if ((e as Error)?.name === 'NotAllowedError' || msg === 'passkey-cancelled') return t('error.cancelled');
  return t('error.generic', { msg });
}

export function Header(props: { sub?: string; tabs?: ComponentChildren }) {
  const app = useApp();
  const site = app.site;
  const signedIn = !!app.secret && !!app.me;
  const dev = site && !rpId(site.passkeyDomain).matches;
  return (
    <>
      <header class="top">
        <a href="#/" style="display:flex;flex-direction:column">
          <span class="name">{site?.name ?? 'btc-dao'}</span>
          <span class="sub">{props.sub ?? t('tagline')}</span>
        </a>
        <div class="actions">
          <button type="button" class="btn-head" aria-label={t('lang.switch')} onClick={() => setLang(app.lang === 'it' ? 'en' : 'it')}>
            {app.lang === 'it' ? 'IT · EN' : 'EN · IT'}
          </button>
          {app.daoId && (signedIn ? (
            <button type="button" class="btn-head solid" onClick={() => go('/profile')}>{app.me!.name}</button>
          ) : (
            <button type="button" class="btn-head solid" onClick={() => go('/join')}>{t('nav.signin')}</button>
          ))}
        </div>
      </header>
      {site && stageOf(site) === 'practice' && <div class="banner"><strong>{t('banner.practice')}</strong> {t('banner.practiceText')}</div>}
      {site && stageOf(site) === 'testnet' && <div class="banner">{t('banner.trial')}</div>}
      {app.dao?.conflict && <div class="banner">{t('banner.conflict')}</div>}
      {dev && <div class="banner">{t('banner.devPasskey', { host: location.hostname, domain: site!.passkeyDomain })}</div>}
      {props.tabs}
    </>
  );
}

export function Footer() {
  const app = useApp();
  if (!app.daoId) return null;
  return (
    <nav class="footer">
      <a href="#/">{t('nav.home')}</a>
      <a href="#/proposals">{t('nav.proposals')}</a>
      <a href="#/members">{t('nav.members')}</a>
      <a href="#/rules">{t('nav.rules')}</a>
      {app.isCouncil && app.secret && <a href="#/council">{t('nav.council')}</a>}
    </nav>
  );
}

export function Qr(props: { text: string; size?: number; label?: string }) {
  const m = qrMatrix(props.text);
  const q = 4; // quiet zone
  return (
    <svg class="qr" role="img" aria-label={props.label} width={props.size ?? 240} height={props.size ?? 240} viewBox={`${-q} ${-q} ${m.size + 2 * q} ${m.size + 2 * q}`} shape-rendering="crispEdges">
      <rect x={-q} y={-q} width={m.size + 2 * q} height={m.size + 2 * q} fill="#fff" />
      <path d={m.path} fill="#000" />
    </svg>
  );
}

/** As SeedSigner shows it: first and last 7 characters highlighted. */
export function Address({ value }: { value: string }) {
  return (
    <span class="addr">
      <b>{value.slice(0, 7)}</b> {value.slice(7, -7)} <b>{value.slice(-7)}</b>
    </span>
  );
}

export function Steps({ n }: { n: number }) {
  return (
    <div class="stack" style="gap:8px">
      <span class="small">{t('fs.step', { n })}</span>
      <div class="steps" aria-hidden="true">
        {[1, 2, 3, 4].map(i => <span class={i <= n ? 'on' : ''} />)}
      </div>
    </div>
  );
}

export function ShortCode({ pubkey }: { pubkey: string }) {
  return <div class="code">{formatShortCode(shortCode(pubkey))}</div>;
}

/** Camera scanner with a paste fallback. `parse` returns undefined to keep scanning. */
export function ScanModal<T>(props: { parse: (text: string) => T | undefined; onResult: (v: T) => void; onCancel: () => void; title?: string }) {
  const video = useRef<HTMLVideoElement>(null);
  const [noCamera, setNoCamera] = useState(false);
  const [pasted, setPasted] = useState('');
  const [bad, setBad] = useState(false);
  useEffect(() => {
    let s: Scanner | undefined;
    let done = false;
    startScanner(video.current!, text => {
      if (done) return;
      const v = props.parse(text);
      if (v !== undefined) {
        done = true;
        s?.stop();
        props.onResult(v);
      }
    })
      .then(x => {
        s = x;
        if (done) x.stop();
      })
      .catch(() => setNoCamera(true));
    return () => {
      done = true;
      s?.stop();
    };
  }, []);
  const usePaste = () => {
    const v = props.parse(pasted);
    if (v === undefined) setBad(true);
    else props.onResult(v);
  };
  return (
    <div class="scanner" role="dialog" aria-modal="true">
      <h2>{props.title ?? t('scan.title')}</h2>
      {!noCamera ? <video ref={video} muted playsInline /> : <p>{t('scan.noCamera')}</p>}
      <p class="small" style="color:var(--head-sub)">{t('scan.hint')}</p>
      <label class="field">
        {t('scan.paste')}
        <textarea value={pasted} onInput={e => (setPasted((e.target as HTMLTextAreaElement).value), setBad(false))} />
      </label>
      {bad && <p class="warnbox">{t('scan.invalid')}</p>}
      <button type="button" class="btn primary" disabled={!pasted.trim()} onClick={usePaste}>{t('scan.use')}</button>
      <button type="button" class="btn secondary" onClick={props.onCancel}>{t('scan.cancel')}</button>
    </div>
  );
}

/** The printable identity card (protocol 1.7). Rendered off screen; shown only when printing. */
export function IdentityCardPrint(props: { daoId: string; secret: string; name: string; pubkey: string; council: boolean }) {
  const app = useApp();
  const host = new URL(app.site!.site).host;
  return (
    <div class="print-only">
      <div class="idcard">
        <Qr text={cardPayload(props.daoId, props.secret)} size={113} />
        <div class="txt">
          <span class="dao">{app.site!.name}</span>
          <span>{t('card.heading')}{props.council ? ` · ${t('card.councilBadge')}` : ''}</span>
          <span class="nm">{props.name}</span>
          <span class="sc">{formatShortCode(shortCode(props.pubkey))}</span>
          <span class="fine">{t('card.printed', { date: fmtDate(Math.floor(Date.now() / 1000)) })}</span>
          <span class="fine">{t('card.secret')}</span>
          <span class="fine">{t('card.fallback', { host })}</span>
        </div>
      </div>
    </div>
  );
}

export function PrintCard(props: { council: boolean }) {
  const app = useApp();
  if (!app.secret || !app.daoId || !app.me) return null;
  return (
    <div class="card">
      <h3>{t('card.title')}</h3>
      <p class="lead">{t('card.text')}</p>
      {props.council && <p class="warn">{t('card.council')}</p>}
      <button type="button" class="btn primary" onClick={() => window.print()}>{t('card.print')}</button>
      <p class="small">{t('card.printNote')}</p>
      <IdentityCardPrint daoId={app.daoId} secret={app.secret} name={app.me.name} pubkey={app.me.key} council={app.me.council} />
    </div>
  );
}
