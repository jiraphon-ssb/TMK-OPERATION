/* ============================================================
   TMK Operation — Onboarding tour + Help system
   ============================================================ */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Icon } from './components.jsx';
import { useLang } from './i18n.jsx';

const TOUR_STEPS = [
  {
    target: '.rail-btn:nth-child(1)',
    titleKey: 'navHome',
    descKey: 'tourStep1',
    position: 'right',
  },
  {
    target: '.rail-btn:nth-child(2)',
    titleKey: 'navSales',
    descKey: 'tourStep2',
    position: 'right',
  },
  {
    target: '.rail-btn:nth-child(3)',
    titleKey: 'navPlanner',
    descKey: 'tourStep3',
    position: 'right',
  },
  {
    target: '.rail-btn:nth-child(4)',
    titleKey: 'navCatalog',
    descKey: 'tourStep4',
    position: 'right',
  },
  {
    target: '.search.desktop-only',
    titleKey: 'search',
    descKey: 'tourStep5',
    descArgs: ['Ctrl+K / ⌘K'],
    position: 'bottom',
  },
];

/* ---- Welcome modal (shown on first visit) ---- */
export function WelcomeModal({ onStart, onSkip }) {
  const { t } = useLang();
  return (
    <div className="modal-scrim" style={{ zIndex: 9990 }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: 'var(--surface)', borderRadius: 'var(--r-xl)',
        padding: '36px 32px', maxWidth: 440, width: '90%',
        boxShadow: 'var(--sh-pop)', textAlign: 'center',
      }}>
        <div style={{ width: 56, height: 56, margin: '0 auto 16px', background: 'var(--accent-soft)', borderRadius: 16, display: 'grid', placeItems: 'center', color: 'var(--accent)' }}>
          <Icon name="sparkle" />
        </div>
        <h2 className="h1" style={{ marginBottom: 8 }}>{t('onboardTitle')}</h2>
        <div className="sm" style={{ color: 'var(--ink-2)', marginBottom: 24, lineHeight: 1.6 }}>
          {t('onboardSub')}
        </div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
          <button className="btn" onClick={onSkip}>{t('onboardSkip')}</button>
          <button className="btn btn-primary" onClick={onStart}>
            {t('onboardStart')} <Icon name="arrowR" />
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---- Tour spotlight overlay ---- */
export function TourOverlay({ step, total, current, onNext, onPrev, onClose }) {
  const { t } = useLang();
  const [rect, setRect] = useState(null);
  const tooltipRef = useRef(null);

  useEffect(() => {
    const el = document.querySelector(step.target);
    if (el) {
      const r = el.getBoundingClientRect();
      // target ที่ซ่อน (เช่น rail บนมือถือ) → rect ขนาด 0 → ถือว่าไม่มี (โชว์ tooltip กลางจอแทน ไม่พังมุมจอ)
      if (r.width === 0 && r.height === 0) { setRect(null); return; }
      setRect(r);
      el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    } else {
      setRect(null);
    }
  }, [step.target]);

  const hasRect = !!rect;
  const pad = 8;
  const holeStyle = hasRect ? {
    position: 'fixed',
    left: rect.left - pad,
    top: rect.top - pad,
    width: rect.width + pad * 2,
    height: rect.height + pad * 2,
    borderRadius: 12,
    boxShadow: '0 0 0 9999px rgba(8,18,32,0.55)',
    zIndex: 9991,
    pointerEvents: 'none',
    transition: 'all 0.35s cubic-bezier(0.4,0,0.2,1)',
  } : null;

  // Tooltip position
  let tooltipStyle = {
    position: 'fixed', zIndex: 9992,
    background: 'var(--surface)', borderRadius: 'var(--r-lg)',
    padding: '18px 22px', maxWidth: 320, width: 'max-content',
    boxShadow: 'var(--sh-pop)', border: '1px solid var(--line)',
  };

  if (!hasRect) {
    // ไม่มี target → กลางจอ
    tooltipStyle.left = '50%'; tooltipStyle.top = '50%'; tooltipStyle.transform = 'translate(-50%, -50%)';
  } else if (step.position === 'right') {
    tooltipStyle.left = rect.right + pad + 16;
    tooltipStyle.top = rect.top + rect.height / 2 - 50;
  } else if (step.position === 'bottom') {
    tooltipStyle.left = Math.max(16, rect.left + rect.width / 2 - 160);
    tooltipStyle.top = rect.bottom + pad + 12;
  } else if (step.position === 'left') {
    tooltipStyle.right = window.innerWidth - rect.left + pad + 16;
    tooltipStyle.top = rect.top + rect.height / 2 - 50;
  }

  const descArgs = step.descArgs || [];
  const desc = t(step.descKey, ...descArgs);

  return (
    <>
      {/* Backdrop click to close */}
      <div style={{ position: 'fixed', inset: 0, zIndex: 9990 }} onClick={onClose}></div>

      {/* Spotlight hole (เฉพาะเมื่อมี target จริง) */}
      {hasRect ? <div style={holeStyle}></div> : <div style={{ position: 'fixed', inset: 0, background: 'rgba(8,18,32,0.55)', zIndex: 9991, pointerEvents: 'none' }}></div>}

      {/* Tooltip */}
      <div ref={tooltipRef} style={tooltipStyle} onClick={e => e.stopPropagation()}>
        <div className="row between" style={{ marginBottom: 8 }}>
          <span className="chip chip-accent" style={{ fontSize: 10 }}>{current + 1}/{total}</span>
          <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink-3)', width: 16, height: 16 }} onClick={onClose}>
            <Icon name="x" />
          </button>
        </div>
        <div className="h3" style={{ marginBottom: 4 }}>{t(step.titleKey)}</div>
        <div className="sm" style={{ color: 'var(--ink-2)', lineHeight: 1.5, marginBottom: 14 }}>{desc}</div>

        {/* Progress dots */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 12 }}>
          {Array.from({ length: total }, (_, i) => (
            <div key={i} style={{
              width: i === current ? 18 : 6, height: 6, borderRadius: 3,
              background: i === current ? 'var(--accent)' : 'var(--surface-3)',
              transition: 'all 0.25s',
            }}></div>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          {current > 0 && (
            <button className="btn btn-sm" onClick={onPrev}>{t('onboardPrev')}</button>
          )}
          {current < total - 1 ? (
            <button className="btn btn-sm btn-primary" onClick={onNext}>{t('onboardNext')} <Icon name="arrowR" /></button>
          ) : (
            <button className="btn btn-sm btn-primary" onClick={onClose}>{t('onboardFinish')} <Icon name="check" /></button>
          )}
        </div>
      </div>
    </>
  );
}

/* ---- Main Onboarding controller ---- */
export function Onboarding({ onComplete }) {
  const [phase, setPhase] = useState('welcome'); // 'welcome' | 'tour' | null
  const [step, setStep] = useState(0);

  const startTour = () => { setPhase('tour'); setStep(0); };
  const skip = () => { setPhase(null); onComplete(); };
  const next = () => { if (step < TOUR_STEPS.length - 1) setStep(s => s + 1); else skip(); };
  const prev = () => { if (step > 0) setStep(s => s - 1); };

  if (phase === 'welcome') {
    return <WelcomeModal onStart={startTour} onSkip={skip} />;
  }

  if (phase === 'tour') {
    return (
      <TourOverlay
        step={TOUR_STEPS[step]}
        total={TOUR_STEPS.length}
        current={step}
        onNext={next}
        onPrev={prev}
        onClose={skip}
      />
    );
  }

  return null;
}

