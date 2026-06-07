/* ============================================================
   TMK Operation — Data Context (Supabase + fallback mock)
   Loads real data from Supabase, falls back to mock if unavailable.
   ============================================================ */
import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { TMK } from './data.js';
import { tmkRepository } from './lib/tmkRepository.js';

const DataContext = createContext();

export function DataProvider({ children }) {
  const [data, setData] = useState(TMK); // Start with mock, replace with real
  const [loading, setLoading] = useState(true);
  const [source, setSource] = useState('mock'); // 'mock' | 'supabase'
  const [error, setError] = useState(null);
  const mountedRef = useRef(true);

  // Load from Supabase
  const loadFromSupabase = useCallback(async () => {
    if (!tmkRepository.isConfigured) {
      setLoading(false);
      setSource('mock');
      console.log('📌 Supabase not configured — using mock data');
      return;
    }

    try {
      setLoading(true);
      const remote = await tmkRepository.loadAll();
      if (!remote || !mountedRef.current) return;

      // Map Supabase data to TMK format
      const mapped = {
        ...TMK, // Keep computed values, staff, etc. as fallback
        consts: {
          ...TMK.consts,
          TARGET: remote.totalTarget || TMK.consts.TARGET,
        },
        channels: remote.channels.length > 0 ? remote.channels.map((ch, i) => ({
          id: ch.id,
          name: ch.name,
          color: `var(--ch-${ch.name.toLowerCase().replace(/[^a-z]/g, '')})`,
          hex: ch.color,
          target: ch.target || 0,
          actual: ch.actual || 0,
          orders: 0, newRev: 0, oldRev: 0, newCust: 0, oldCust: 0, ad: 0, hasAd: false,
        })) : TMK.channels,
        campaigns: remote.campaigns.length > 0 ? remote.campaigns.map(c => ({
          id: c.id,
          name: c.name,
          color: c.color,
          start: '', end: '',
          status: 'live',
          channels: [],
          tasks: 0,
        })) : TMK.campaigns,
        tasks: remote.tasks.length > 0 ? remote.tasks.map(t => ({
          id: t.id,
          title: t.title,
          detail: t.detail || '',
          date: formatThaiDate(t.date),
          responsible: (t.responsible || '').split(',').map(s => s.trim()).filter(Boolean),
          camp: t.camp || '',
          status: t.status || 'todo',
          channel: t.channel || 'หลังบ้าน',
        })) : TMK.tasks,
        products: remote.products.length > 0 ? remote.products.map((p, i) => ({
          rank: i + 1,
          name: p.name,
          price: p.price,
          units: p.actualUnits || 0,
          rev: p.price * (p.actualUnits || 0),
          stock: p.stockOnHand <= 0 ? 'out' : p.stockOnHand < p.reorderPoint ? 'low' : 'ok',
          onHand: p.stockOnHand,
          reorder: p.reorderPoint,
          strategy: p.strategy || '',
        })) : TMK.products,
        poTracker: remote.poTracker || TMK.poTracker,
      };

      // Recompute aggregates
      const MTD = mapped.channels.reduce((s, c) => s + c.actual, 0);
      const ORD = mapped.channels.reduce((s, c) => s + c.orders, 0);
      const AD = mapped.channels.reduce((s, c) => s + c.ad, 0);
      const TARGET = mapped.consts.TARGET;
      const DAY = mapped.consts.DAY;
      const DAYS = mapped.consts.DAYS;
      mapped.computed = {
        ...TMK.computed,
        MTD, ORD, AD,
        PACE_TGT: Math.round((TARGET / DAYS) * DAY),
        PACE_PCT: MTD > 0 ? (MTD / (Math.round((TARGET / DAYS) * DAY))) * 100 : TMK.computed.PACE_PCT,
        RUN: MTD > 0 ? Math.round((MTD / DAY) * DAYS) : TMK.computed.RUN,
        AOV: ORD > 0 ? MTD / ORD : TMK.computed.AOV,
      };

      if (mountedRef.current) {
        setData(mapped);
        setSource('supabase');
        setError(null);
        console.log('✅ Loaded from Supabase:', {
          channels: remote.channels.length,
          campaigns: remote.campaigns.length,
          tasks: remote.tasks.length,
          products: remote.products.length,
          target: remote.totalTarget,
        });
      }
    } catch (err) {
      console.error('❌ Supabase load failed, using mock data:', err);
      if (mountedRef.current) {
        setError(err.message);
        setSource('mock');
      }
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, []);

  // Initial load + realtime subscription
  useEffect(() => {
    mountedRef.current = true;
    loadFromSupabase();

    const unsub = tmkRepository.subscribeToChanges(() => {
      console.log('🔄 Realtime change detected — reloading...');
      loadFromSupabase();
    });

    return () => {
      mountedRef.current = false;
      unsub();
    };
  }, [loadFromSupabase]);

  return (
    <DataContext.Provider value={{ data, loading, source, error, reload: loadFromSupabase }}>
      {children}
    </DataContext.Provider>
  );
}

export function useData() {
  return useContext(DataContext);
}

// Helper: format "2026-06-18" → "18 มิ.ย."
function formatThaiDate(dateStr) {
  if (!dateStr) return '';
  const months = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
  const parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr;
  const day = parseInt(parts[2], 10);
  const month = parseInt(parts[1], 10) - 1;
  return `${day} ${months[month] || ''}`;
}
