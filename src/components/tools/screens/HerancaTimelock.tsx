import { useEffect, useMemo, useState } from 'react';
import { HeartPulse, KeyRound, ShieldCheck, Hourglass } from 'lucide-react';
import { SuiteHero, CopyBox, Tilt, Stat, Faq } from './SovereignKit';
import {
  TIMELOCK_PRESETS, MAX_RELATIVE_BLOCKS, BLOCKS_PER_DAY, clampBlocks, blocksToDays, inheritanceDescriptor, inheritancePhase,
} from '@/components/tools/lib/sovereign-math';

const PHASE = {
  seguro: { label: 'Cofre selado · só o titular assina', cls: 'ss-ok' },
  alerta: { label: 'Janela de alerta · movimente para renovar', cls: 'ss-bad' },
  heranca: { label: 'Herança ativa · a chave do herdeiro vale', cls: 'ss-bad' },
} as const;

export default function HerancaTimelock() {
  const [blocks, setBlocks] = useState(52560);
  const [elapsed, setElapsed] = useState(0);
  const [primary, setPrimary] = useState('[titular]xpub_PRINCIPAL/<0;1>/*');
  const [heir, setHeir] = useState('[herdeiro]xpub_RECUPERACAO/<0;1>/*');
  const [tip, setTip] = useState<number | null>(null);
  const [beats, setBeats] = useState(0);

  useEffect(() => {
    const ctl = new AbortController();
    fetch('https://mempool.space/api/blocks/tip/height', { signal: ctl.signal })
      .then(r => (r.ok ? r.text() : Promise.reject())).then(t => { const n = Number(t); if (Number.isFinite(n) && n > 0) setTip(n); })
      .catch(() => undefined);
    return () => ctl.abort();
  }, []);

  const n = clampBlocks(blocks);
  const e = Math.min(elapsed, n + Math.round(n * 0.1));
  const phase = inheritancePhase(e, n);
  const descriptor = useMemo(() => inheritanceDescriptor(primary.trim() || 'A', heir.trim() || 'B', n), [primary, heir, n]);
  const remaining = Math.max(0, n - e);
  const unlockDate = new Date(Date.now() + (remaining / BLOCKS_PER_DAY) * 86_400_000);
  const max = Math.round(n * 1.1);
  const pct = (v: number) => `${(v / max) * 100}%`;

  return <div className="ss-root">
    <SuiteHero kicker="Herança sem cartório · timelock relativo" title="Herança" accent="Programada" repo="https://github.com/wizardsardine/liana" repoLabel="LIANA (WIZARDSARDINE)"
      lead="Seu Bitcoin com duas portas. A sua abre sempre. A do seu herdeiro só abre se você ficar um tempo combinado sem mover as moedas. Quem garante é a própria rede Bitcoin, não um juiz, um banco ou um testamento." />
    <div className="ss-wrap">
      <div className="ss-grid">
        <section className="ss-plate">
          <span className="ss-tag">01 · REGRA</span>
          <h2>Defina o prazo</h2>
          <p className="ss-sub">Quanto tempo de silêncio até o herdeiro poder gastar. A rede mede em blocos (cerca de 144 por dia), com teto de {MAX_RELATIVE_BLOCKS.toLocaleString('pt-BR')} blocos.</p>
          <div className="ss-chips" role="group" aria-label="Prazos prontos">
            {TIMELOCK_PRESETS.map(p => <button key={p.blocks} type="button" className="ss-chip" aria-pressed={n === p.blocks} onClick={() => { setBlocks(p.blocks); setElapsed(0); }}>{p.label}</button>)}
          </div>
          <label className="ss-label" htmlFor="ht-blocks">Blocos: {n.toLocaleString('pt-BR')} · ≈ {Math.round(blocksToDays(n))} dias</label>
          <input id="ht-blocks" className="ss-range" type="range" min={144} max={MAX_RELATIVE_BLOCKS} step={1} value={n} onChange={ev => { setBlocks(Number(ev.target.value)); setElapsed(0); }} />
          <label className="ss-label" htmlFor="ht-a">Chave do titular (xpub ou rótulo)</label>
          <input id="ht-a" className="ss-input" value={primary} onChange={ev => setPrimary(ev.target.value)} spellCheck={false} />
          <label className="ss-label" htmlFor="ht-b">Chave do herdeiro (xpub ou rótulo)</label>
          <input id="ht-b" className="ss-input" value={heir} onChange={ev => setHeir(ev.target.value)} spellCheck={false} />
        </section>

        <section className="ss-plate">
          <span className="ss-tag">02 · SIMULAÇÃO</span>
          <h2>Avance o tempo</h2>
          <p className="ss-sub">Arraste para simular blocos passando sem nenhuma movimentação sua. Aperte "Sinal de vida" para mostrar que você continua no controle.</p>
          <p className={`ss-phase ${PHASE[phase].cls}`} aria-live="polite">{phase === 'seguro' ? <ShieldCheck size={14} /> : <Hourglass size={14} />}{PHASE[phase].label}</p>
          <div className="ss-timeline" aria-hidden="true">
            <div className="ss-track" style={{ ['--alert' as string]: pct(n * 0.8) }} />
            <div className="ss-fill" style={{ width: pct(e) }} />
            <span className="ss-marker start" style={{ left: '0%' }}>ÚLTIMA MOVIMENTAÇÃO</span>
            <span className="ss-marker below" style={{ left: pct(n * 0.8) }}>ALERTA</span>
            <span className="ss-marker end" style={{ left: pct(n) }}>HERDEIRO LIBERADO</span>
            <span className="ss-cursor" style={{ left: pct(e) }} />
          </div>
          <label className="ss-label" htmlFor="ht-e">Blocos sem movimentação: {e.toLocaleString('pt-BR')}</label>
          <input id="ht-e" className="ss-range" type="range" min={0} max={max} value={e} onChange={ev => setElapsed(Number(ev.target.value))} />
          <div className="ss-row">
            <button type="button" className="ss-btn" onClick={() => { setElapsed(0); setBeats(b => b + 1); }}><HeartPulse size={14} />Sinal de vida</button>
            <button type="button" className="ss-btn ghost" onClick={() => setElapsed(n)}>Pular para a herança</button>
          </div>
          <div className="ss-keys" style={{ marginTop: 22 }}>
            <Tilt><div className="ss-key live"><small>CAMINHO 1 · SEMPRE</small><b>Titular</b><small>Assina a qualquer momento.</small></div></Tilt>
            <Tilt><div className={`ss-key ${phase === 'heranca' ? 'live' : 'lock'}`}><small>CAMINHO 2 · older({n})</small><b>Herdeiro</b><small>{phase === 'heranca' ? 'Liberado pela rede agora.' : `Faltam ${remaining.toLocaleString('pt-BR')} blocos.`}</small></div></Tilt>
          </div>
        </section>
      </div>

      <div className="ss-stats">
        <Stat value={tip ? tip.toLocaleString('pt-BR') : '-'} label="Bloco atual da rede" />
        <Stat value={tip ? (tip + remaining).toLocaleString('pt-BR') : `+${remaining.toLocaleString('pt-BR')}`} label="Bloco de liberação" tone="hot" />
        <Stat value={unlockDate.toLocaleDateString('pt-BR')} label="Data estimada" tone="hot" />
        <Stat value={beats} label="Sinais de vida dados" tone="ember" />
      </div>

      <section className="ss-plate">
        <span className="ss-tag">03 · DESCRITOR</span>
        <h2><KeyRound size={22} style={{ display: 'inline', marginRight: 10 }} />A regra escrita para a rede</h2>
        <p className="ss-sub">Este é o descritor Miniscript no mesmo formato que a Liana usa. Ele diz: o titular assina sempre, ou o herdeiro assina depois de {n.toLocaleString('pt-BR')} blocos parados.</p>
        <CopyBox value={descriptor} />
        <p className="ss-sub" style={{ marginTop: 14 }}>Leitura: <b className="ss-ok">or_d</b> = um caminho ou outro · <b className="ss-ok">pk</b> = chave do titular · <b className="ss-ok">older({n})</b> = espera relativa medida pela rede (OP_CHECKSEQUENCEVERIFY).</p>
      </section>

      <div className="ss-warn">Simulação educativa. Com rótulos de exemplo o descritor não recebe moedas. Para proteger patrimônio real, gere as chaves em carteiras de hardware, monte o cofre na própria Liana ou no Sparrow, teste com um valor pequeno e lembre: cada movimentação sua reinicia o relógio só das moedas movidas.</div>

      <Faq items={[
        { q: 'Por que o prazo máximo é de cerca de 15 meses?', a: 'O timelock relativo por blocos usa 16 bits no consenso do Bitcoin, então o limite é 65.535 blocos. Para prazos maiores, basta renovar movimentando as moedas antes do vencimento.' },
        { q: 'O herdeiro pode gastar antes do prazo?', a: 'Não. Enquanto não passarem os blocos combinados desde a última movimentação daquela moeda, a rede rejeita qualquer assinatura do caminho de recuperação.' },
        { q: 'O que é o "sinal de vida" na prática?', a: 'É enviar as moedas para um novo endereço do mesmo cofre. A transação reinicia a contagem. A Liana avisa quando o prazo se aproxima.' },
        { q: 'Preciso confiar em alguém?', a: 'Não. A regra fica gravada no próprio endereço. Nenhuma empresa guarda suas chaves ou decide quando o herdeiro recebe.' },
      ]} />
    </div>
  </div>;
}
