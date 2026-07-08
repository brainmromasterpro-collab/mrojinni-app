import { useState, useCallback, useRef, useEffect } from 'react';
//
import TopBar from './components/TopBar';
import Sidebar from './components/Sidebar';
import StreamArea from './components/StreamArea';
import RightPanel from './components/RightPanel';
import ConnectorsPanel from './components/ConnectorsPanel';
import AgentsPanel from './components/AgentsPanel';
import InfraPanel from './components/InfraPanel';
import DashboardPanel from './components/DashboardPanel';
import ActivityLogPanel from './components/ActivityLogPanel';
import LoginPage from './components/LoginPage';
import { supabase } from './lib/supabase';
import { loadMessages, persistMessages, loadMessagesFromCache, saveMessagesToCache, clearMessagesCache, deleteStreamMessages } from './lib/storage';
import type { Stream, Message } from './lib/types';

const ALLOWED_EMAILS = new Set([
  'brain.mromasterpro@gmail.com',
  'thejinni.app@gmail.com',
]);

const DEMO_STREAM_1 = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
const DEMO_STREAM_2 = 'b2c3d4e5-f6a7-8901-bcde-f12345678901';

const demoStreams: Stream[] = [
  {
    id: DEMO_STREAM_1,
    nombre: 'RFQ · MRO Master',
    tipo: 'compras',
    created_at: new Date().toISOString(),
    user_id: 'demo',
  },
  {
    id: DEMO_STREAM_2,
    nombre: 'APQP · Cliente 2',
    tipo: 'general',
    created_at: new Date().toISOString(),
    user_id: 'demo',
  },
];

const demoMessages: Message[] = [];

export default function App() {
  const [session, setSession] = useState<any>(undefined);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => subscription.unsubscribe();
  }, []);

  if (session === undefined) return (
    <div className="min-h-screen bg-brain-dark flex items-center justify-center">
      <div className="w-6 h-6 border-2 border-brain-accent border-t-transparent rounded-full animate-spin" />
    </div>
  );

  const userEmail = session?.user?.email;
  if (!session || !ALLOWED_EMAILS.has(userEmail ?? '')) {
    if (session && !ALLOWED_EMAILS.has(userEmail ?? '')) supabase.auth.signOut();
    return <LoginPage />;
  }

  return <AppContent />;
}

function AppContent() {
  const [streams, setStreams] = useState<Stream[]>(demoStreams);
  const [activeStreamId, setActiveStreamId] = useState<string>(DEMO_STREAM_1);
  const [messages, setMessagesRaw] = useState<Message[]>(demoMessages);
  const [activeNav, setActiveNav] = useState('chat');
  const [activeBulkId, setActiveBulkId] = useState<string | null>(null);
  const activeBulkIdRef = useRef<string | null>(null);
  activeBulkIdRef.current = activeBulkId;
  const rfqPollsRef = useRef<Map<string, ReturnType<typeof setInterval>>>(new Map());
  const imagenPollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const publicadorPollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const confirmedDocsRef = useRef<Set<string>>(new Set());
  const recentSearchesRef = useRef<Map<string, number>>(new Map());
  const [bulkRfqIds, setBulkRfqIds] = useState<Set<string>>(new Set());

  // Sync stream names from Supabase on mount (names may have been renamed)
  useEffect(() => {
    supabase.from('streams').select('id,nombre').then(({ data }) => {
      if (!data) return;
      const nameMap = new Map(data.map((r: { id: string; nombre: string }) => [r.id, r.nombre]));
      setStreams((prev) => prev.map((s) => nameMap.has(s.id) ? { ...s, nombre: nameMap.get(s.id)! } : s));
    });
  }, []);

  const activeStream = streams.find((s) => s.id === activeStreamId) || null;

  // Centralized guard: checks if a RECENT widget already exists for this rfq_id OR producto
  const widgetExistsFor = useCallback((rfqId?: string, producto?: string): boolean => {
    const normalizedProducto = producto?.toLowerCase?.().trim();
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    return messages.some((m) => {
      if (m.tipo !== 'widget') return false;
      if (m.created_at && m.created_at < twoHoursAgo) return false;
      const c = m.contenido as any;
      if (rfqId && c?.rfq_id === rfqId) return true;
      if (normalizedProducto && c?.producto?.toLowerCase?.().trim() === normalizedProducto) return true;
      return false;
    });
  }, [messages]);

  const streamMessages = (() => {
    const raw = messages
      .filter((m) => m.stream_id === activeStreamId)
      .slice()
      .sort((a, b) => (a.created_at || '').localeCompare(b.created_at || ''));
    const seenWidgetRfqs = new Set<string>();
    const hasWidget = raw.some((m) => m.tipo === 'widget');
    return raw.filter((msg) => {
      if (msg.tipo === 'widget') {
        const c = msg.contenido as any;
        const rid = c?.rfq_id;
        if (rid && seenWidgetRfqs.has(rid)) return false;
        if (rid) seenWidgetRfqs.add(rid);
      }
      if (msg.tipo === 'file-upload' && hasWidget) return false;
      return true;
    });
  })();

  function pushLog(msg: string, type: 'ok' | 'warn' | 'error' = 'ok') {
    if (!activeStreamId) return;
    supabase.from('stream_logs').insert({
      stream_id: activeStreamId,
      msg,
      type,
    }).then(() => {});
  }

  const setMessages: typeof setMessagesRaw = useCallback((action) => {
    setMessagesRaw((prev) => {
      const next = typeof action === 'function' ? action(prev) : action;

      // Widgets: keep the LAST occurrence per rfq_id only (not producto — same product can have multiple searches)
      // Decisions: keep the FIRST occurrence per rfq_id
      const widgetLastIndex = new Map<string, number>();
      const decisionFirstIndex = new Map<string, number>();

      for (let i = 0; i < next.length; i++) {
        const m = next[i];
        if (m.tipo === 'widget') {
          const c = m.contenido as any;
          const rid = c?.rfq_id;
          if (rid) widgetLastIndex.set(rid, i);
        }
        if (m.tipo === 'decision') {
          const c = m.contenido as any;
          const rid = c?.rfq_id;
          if (rid && !decisionFirstIndex.has(rid)) decisionFirstIndex.set(rid, i);
        }
      }

      const deduped = next.filter((m, i) => {
        if (m.tipo === 'widget') {
          const c = m.contenido as any;
          const rid = c?.rfq_id;
          if (rid && widgetLastIndex.get(rid) !== i) return false;
        }
        if (m.tipo === 'decision') {
          const c = m.contenido as any;
          const rid = c?.rfq_id;
          if (rid && decisionFirstIndex.get(rid) !== i) return false;
        }
        return true;
      });

      const toPersist = deduped.filter((m) => {
        const existing = prev.find((p) => p.id === m.id);
        return !existing || existing !== m;
      });
      if (toPersist.length > 0) {
        persistMessages(toPersist);
        const streamId = toPersist[0]?.stream_id;
        if (streamId) saveMessagesToCache(streamId, deduped.filter((m) => m.stream_id === streamId));
      }
      return deduped;
    });
  }, []);

  // Validates that a proveedor name looks legitimate (not garbage data)
  function isValidProveedor(nombre: string | null | undefined): boolean {
    if (!nombre || nombre.trim().length < 3) return false;
    if (/^\d+$/.test(nombre.trim())) return false;
    if (/^[a-z0-9]{1,2}$/i.test(nombre.trim())) return false;
    if (/^[\W_]+$/.test(nombre.trim())) return false;
    return true;
  }

  // Filters opciones to only keep those with valid-looking proveedor names
  function filterValidOpciones(opciones: Record<string, unknown>[]): Record<string, unknown>[] {
    const valid = opciones.filter((op) => isValidProveedor(op.proveedor as string));
    return valid.length > 0 ? valid : opciones;
  }

  // Adds a widget message; if a recent (<2h) duplicate exists for same rfq_id, block. If stale duplicate exists for same producto, replace it.
  function addWidgetMessage(prev: Message[], widgetMsg: Message, extraMsgs: Message[] = []): Message[] {
    const c = widgetMsg.contenido as any;
    const rfqId = c?.rfq_id;
    const producto = c?.producto?.toLowerCase?.().trim();
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();

    // Block if exact same rfq_id already exists (regardless of age)
    if (rfqId && prev.some((m) => m.tipo === 'widget' && (m.contenido as any)?.rfq_id === rfqId)) {
      return prev;
    }

    // Check for same-producto widget
    const staleIndex = prev.findIndex((m) => {
      if (m.tipo !== 'widget') return false;
      const mc = m.contenido as any;
      return producto && mc?.producto?.toLowerCase?.().trim() === producto;
    });

    if (staleIndex !== -1) {
      const existing = prev[staleIndex];
      // If the existing widget is recent, block insertion
      if (existing.created_at && existing.created_at >= twoHoursAgo) return prev;
      // Otherwise replace the stale widget with the new one
      const updated = [...prev];
      updated.splice(staleIndex, 1);
      return [...updated, ...extraMsgs, widgetMsg];
    }

    return [...prev, ...extraMsgs, widgetMsg];
  }

  useEffect(() => {
    // Clear all active polls when switching streams
    rfqPollsRef.current.forEach((interval) => clearInterval(interval));
    rfqPollsRef.current.clear();
    if (imagenPollingRef.current) { clearInterval(imagenPollingRef.current); imagenPollingRef.current = null; }
    if (publicadorPollingRef.current) { clearInterval(publicadorPollingRef.current); publicadorPollingRef.current = null; }

    let cancelled = false;

    // Instantly restore from session cache (survives tab switches)
    const cached = loadMessagesFromCache(activeStreamId);
    if (cached.length > 0) {
      setMessagesRaw((prev) => {
        const existingIds = new Set(prev.map((m) => m.id));
        const newMsgs = cached.filter((m) => !existingIds.has(m.id));
        return newMsgs.length > 0 ? [...prev, ...newMsgs] : prev;
      });
    }

    // Then load from Supabase (authoritative source). Reconcile by id and
    // re-sort por created_at — el merge anterior solo agregaba al final, lo que
    // dejaba el historial reciente incompleto o desordenado.
    loadMessages(activeStreamId).then((loaded) => {
      if (cancelled || loaded.length === 0) return;
      setMessagesRaw((prev) => {
        const byId = new Map(prev.map((m) => [m.id, m]));
        for (const m of loaded) byId.set(m.id, m); // DB es autoritativa
        return Array.from(byId.values()).sort((a, b) =>
          (a.created_at || '').localeCompare(b.created_at || '')
        );
      });
    });
    return () => { cancelled = true; };
  }, [activeStreamId]);

  useEffect(() => {
    async function restoreActiveRFQs() {
      // Populate bulkRfqIds for any RFQs that belong to a bulk
      const { data: bulkRows } = await supabase
        .from('rfqs')
        .select('id, rfq_id')
        .not('bulk_id', 'is', null);
      if (bulkRows && bulkRows.length > 0) {
        setBulkRfqIds((prev) => {
          const next = new Set(prev);
          for (const r of bulkRows) {
            next.add(r.id);
            if (r.rfq_id) next.add(r.rfq_id);
          }
          return next;
        });
      }

      const loaded = await loadMessages(activeStreamId);
      const { data: activeRfqs } = await supabase
        .from('rfqs')
        .select('id, rfq_id, marca, modelo, estado, foto_url, qty, fx_usd_mxn, fx_fecha, created_at')
        .in('estado', ['busqueda_completa', 'procesando_imagen', 'foto_lista', 'imagen_fallida', 'foto_pendiente', 'publicando'])
        .is('bulk_id', null)
        .gte('created_at', new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString())
        .order('created_at', { ascending: false })
        .limit(10);

      if (!activeRfqs || activeRfqs.length === 0) return;

      const restored: Message[] = [];

      for (const rfq of activeRfqs) {
        const uuid = rfq.id;
        const rfqId = rfq.rfq_id;
        const producto = `${rfq.marca} ${rfq.modelo}`;

        // Check if widget already exists for this rfq_id
        const alreadyHasWidget = loaded.some((m) => {
          if (m.tipo !== 'widget') return false;
          const c = m.contenido as any;
          return c?.rfq_id === rfqId;
        });
        if (alreadyHasWidget) {
          if (rfq.estado === 'procesando_imagen') startImagenPolling(uuid);
          if (rfq.estado === 'publicando') startPublicadorPolling(uuid);
          continue;
        }

        if (rfq.estado === 'busqueda_completa' || (rfq.estado === 'foto_lista' && !rfq.foto_url) || rfq.estado === 'publicando') {
          const { data: opciones } = await supabase
            .from('opciones')
            .select('*')
            .eq('rfq_id', uuid)
            .order('score_ranking', { ascending: false });

          if (opciones && opciones.length > 0) {
            const validOpciones = filterValidOpciones(opciones);
            const proveedores = validOpciones.map((op: Record<string, unknown>, idx: number) => ({
              rank: idx + 1,
              nombre: op.proveedor as string || 'Sin nombre',
              precio: op.precio_orig != null ? `$${op.precio_orig} ${op.moneda || 'USD'}` : 'Consultar',
              disponibilidad: op.disponibilidad as string || 'N/A',
              score: op.score_ranking != null ? `${op.score_ranking}` : '0',
            }));

            const fxText = rfq.fx_usd_mxn
              ? `${rfq.fx_usd_mxn} \u00B7 ${rfq.fx_fecha || new Date().toISOString().slice(0, 10)}`
              : '';

            restored.push({
              id: crypto.randomUUID(),
              stream_id: DEMO_STREAM_1,
              rol: 'assistant',
              tipo: 'widget',
              contenido: {
                rfq_id: rfqId,
                producto,
                cantidad: rfq.qty,
                en_crm: validOpciones.some((op: Record<string, unknown>) => op.fuente === '1crm_productos')
                  ? `Encontrado en catalogo — ${validOpciones.find((op: Record<string, unknown>) => op.fuente === '1crm_productos')?.proveedor ?? ''}`
                  : 'No existe — requiere publicacion',
                fx: fxText,
                estado: rfq.estado,
                proveedores,
              },
              created_at: rfq.created_at || new Date().toISOString(),
            } as Message);

            const productoYaPublicado = validOpciones.some((op: Record<string, unknown>) => op.fuente === '1crm_productos');

            if (rfq.estado === 'busqueda_completa' && !productoYaPublicado) {
              const { data: imagenJob } = await supabase
                .from('jobs')
                .select('estado')
                .eq('rfq_id', uuid)
                .eq('agente', 'imagen')
                .order('created_at', { ascending: false })
                .limit(1)
                .maybeSingle();

              if (imagenJob && imagenJob.estado === 'fallido') {
                restored.push({
                  id: crypto.randomUUID(),
                  stream_id: DEMO_STREAM_1,
                  rol: 'assistant',
                  tipo: 'imagen_fallida',
                  contenido: { rfq_id: uuid },
                  created_at: new Date().toISOString(),
                } as Message);
              } else {
                restored.push({
                  id: crypto.randomUUID(),
                  stream_id: DEMO_STREAM_1,
                  rol: 'assistant',
                  tipo: 'decision',
                  contenido: {
                    text: `¿Publicar ${producto} basado en opcion #1? El producto no existe en el catalogo.`,
                    rfq_id: uuid,
                  },
                  created_at: rfq.created_at || new Date().toISOString(),
                } as Message);
              }
            }
          }
        }

        else if (rfq.estado === 'foto_lista' && rfq.foto_url) {
          const { data: topOp } = await supabase
            .from('opciones')
            .select('proveedor, precio_orig, moneda, disponibilidad')
            .eq('rfq_id', uuid)
            .order('score_ranking', { ascending: false })
            .limit(1)
            .maybeSingle();
          restored.push({
            id: crypto.randomUUID(),
            stream_id: DEMO_STREAM_1,
            rol: 'assistant',
            tipo: 'imagen_lista',
            contenido: {
              rfq_id: uuid,
              producto,
              foto_url: rfq.foto_url,
              proveedor_top: topOp?.proveedor || '',
              precio_top: topOp?.precio_orig != null ? `$${topOp.precio_orig} ${topOp.moneda || 'USD'}` : '',
              disponibilidad_top: topOp?.disponibilidad || '',
            },
            created_at: new Date().toISOString(),
          } as Message);
        }

        else if (rfq.estado === 'imagen_fallida' || rfq.estado === 'foto_pendiente') {
          restored.push({
            id: crypto.randomUUID(),
            stream_id: DEMO_STREAM_1,
            rol: 'assistant',
            tipo: 'imagen_fallida',
            contenido: { rfq_id: uuid },
            created_at: new Date().toISOString(),
          } as Message);
        }

        else if (rfq.estado === 'procesando_imagen') {
          restored.push({
            id: crypto.randomUUID(),
            stream_id: DEMO_STREAM_1,
            rol: 'assistant',
            tipo: 'rfq-status',
            contenido: { rfq_id: uuid, estado: 'procesando_imagen' },
            created_at: new Date().toISOString(),
          } as Message);
          startImagenPolling(uuid);
        }

        if (rfq.estado === 'publicando') {
          startPublicadorPolling(uuid);
        }
      }

      if (restored.length > 0) {
        setMessages((prev) => {
          let next = prev;
          for (const msg of restored) {
            if (msg.tipo === 'widget') {
              const updated = addWidgetMessage(next, msg);
              if (updated !== next) next = updated;
            } else {
              next = [...next, msg];
            }
          }
          return next;
        });
      }
    }

    restoreActiveRFQs();

    return () => {
      rfqPollsRef.current.forEach((interval) => clearInterval(interval));
      rfqPollsRef.current.clear();
    };
  }, []);

  function parseSearchIntent(text: string): { marca: string; modelo: string; urgente: boolean } | null {
    const urgente = /urgente|asap|rush/i.test(text);
    const cleaned = text
      .replace(/urgente|asap|rush/gi, '')
      .replace(/^(oye|hey|por favor|porfavor|porfa|please|pls)[\s,]*/i, '')
      .replace(/^(busca|buscar|necesito|cotiza|cotizar|encuentra|quiero|dame|me puedes? (?:buscar|cotizar|encontrar)|search|find|quote|conseguir|consigue|consigueme|ocupo)[\s:\-—]*/i, '')
      .replace(/^(el|la|un|una|uno|los|las|unos|unas|esto|este|esta)[\s]+/i, '')
      .trim();

    if (!cleaned) return null;

    // Pattern: part numbers like "6ES7214-1AG40-0XB0", "TTD25C-20-0300F-H"
    const partNumberMatch = cleaned.match(/([A-Z0-9]{2,}[\-\/][A-Z0-9\-\/]+)/i);
    if (partNumberMatch) {
      const idx = cleaned.indexOf(partNumberMatch[0]);
      let before = cleaned.slice(0, idx).trim();
      // Strip noise words that aren't brand names
      before = before.replace(/^(modelo|parte|no\.?|num\.?|numero|ref\.?|referencia|de|marca)[\s:]*/i, '').trim();
      // If 'before' still looks like a noise phrase (lowercase, common words), discard it
      if (before && /^(el|la|un|una|los|las|de|del|para|por|con|esto|este|esta|ese|esa)$/i.test(before)) {
        before = '';
      }
      return {
        marca: before || '(detectar)',
        modelo: partNumberMatch[0],
        urgente,
      };
    }

    // Pattern: "Marca Modelo" e.g. "Siemens SITRANS F US 1010"
    // First word must be capitalized and NOT a common Spanish word
    const words = cleaned.split(/\s+/);
    const commonWords = /^(Hola|Oye|Por|Para|Con|Sin|Que|Como|Donde|Cual|Este|Esta|Ese|Esa|Tengo|Hay|Dame|Los|Las|Unos|Unas|Del|Modelo|Parte|Numero)$/i;
    if (words.length >= 2 && /^[A-Z]/.test(words[0]) && !commonWords.test(words[0])) {
      return {
        marca: words[0],
        modelo: words.slice(1).join(' '),
        urgente,
      };
    }

    return null;
  }

  async function createRFQAndSearch(marca: string, modelo: string, qty: number, urgente: boolean, fotoUrl?: string, bulkId?: string) {
    if (!activeStreamId) return;

    const searchKey = `${marca.toLowerCase().trim()}|${modelo.toLowerCase().trim()}`;
    const lastSearch = recentSearchesRef.current.get(searchKey);
    if (lastSearch && Date.now() - lastSearch < 300000) return;

    const producto = `${marca} ${modelo}`;

    recentSearchesRef.current.set(searchKey, Date.now());

    const now = new Date();
    const suffix = crypto.randomUUID().slice(0, 6).toUpperCase();
    const rfqId = `RFQ-${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}-${suffix}`;

    const { data: streamExists } = await supabase
      .from('streams')
      .select('id')
      .eq('id', activeStreamId)
      .maybeSingle();

    const rfqInsert: Record<string, unknown> = {
      stream_id: streamExists ? activeStreamId : null,
      rfq_id: rfqId,
      marca,
      modelo,
      qty,
      urgente,
    };
    if (fotoUrl) rfqInsert.foto_url = fotoUrl;
    if (bulkId) rfqInsert.bulk_id = bulkId;

    const { data: rfqData, error: insertError } = await supabase.from('rfqs').insert(rfqInsert).select('id').single();

    if (insertError || !rfqData?.id) {
      console.error('[RFQ] Insert failed:', insertError);
      setMessages((prev) => [...prev, {
        id: crypto.randomUUID(),
        stream_id: activeStreamId,
        rol: 'assistant',
        tipo: 'text',
        contenido: { text: 'Error creando el RFQ. Intenta de nuevo.' },
        created_at: new Date().toISOString(),
      }]);
      return;
    }

    if (bulkId) {
      setBulkRfqIds((prev) => { const next = new Set(prev); next.add(rfqData.id); next.add(rfqId); return next; });
    }

    const { error: jobError } = await supabase.from('jobs').insert({
      rfq_id: rfqData.id,
      agente: 'buscador',
      estado: 'pendiente',
    });
    if (jobError) console.error('[RFQ] Job insert failed:', jobError);

    if (!bulkId) {
      const searchingMsg: Message = {
        id: crypto.randomUUID(),
        stream_id: activeStreamId,
        rol: 'assistant',
        tipo: 'rfq-log',
        contenido: { text: `${rfqId} registrado. Buscando proveedores para ${marca} ${modelo}...`, rfqId, status: 'searching' },
        created_at: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, searchingMsg]);
    }
    pushLog(`${rfqId} registrado, buscando proveedores`, 'warn');

    // Bulk items are managed entirely by BulkWidget polling -- skip per-RFQ polling
    if (bulkId) return;

    const uuid = rfqData.id;
    const isBulkRfq = !!bulkId;

    // Prevent duplicate polling for the same UUID
    if (rfqPollsRef.current.has(uuid)) return;

    const startTime = Date.now();
    const pollInterval = setInterval(async () => {
      if (Date.now() - startTime >= 180000) {
        clearInterval(pollInterval);
        rfqPollsRef.current.delete(uuid);
        if (!isBulkRfq) {
          setMessages((prev) => [...prev, {
            id: crypto.randomUUID(),
            stream_id: activeStreamId,
            rol: 'assistant',
            tipo: 'rfq-log',
            contenido: { text: `Tiempo de espera agotado para ${rfqId}. Intenta de nuevo mas tarde.`, rfqId, status: 'crm' },
            created_at: new Date().toISOString(),
          }]);
        }
        pushLog(`Timeout esperando resultados: ${rfqId}`, 'error');
        return;
      }

      const { data: rfqRow } = await supabase
        .from('rfqs')
        .select('qty, estado, fx_usd_mxn, fx_fecha, foto_url, marca, modelo, bulk_id')
        .eq('id', uuid)
        .maybeSingle();

      const isBulkSuppressed = isBulkRfq || (rfqRow?.bulk_id && rfqRow.bulk_id === activeBulkIdRef.current);

      if (rfqRow && rfqRow.estado === 'busqueda_completa') {
        const { data: opCheck } = await supabase
          .from('opciones')
          .select('id')
          .eq('rfq_id', uuid)
          .limit(1);
        if (!opCheck || opCheck.length === 0) {
          clearInterval(pollInterval);
          rfqPollsRef.current.delete(uuid);
          if (!isBulkSuppressed) {
            setMessages((prev) => [...prev, {
              id: crypto.randomUUID(),
              stream_id: activeStreamId,
              rol: 'assistant',
              tipo: 'rfq-log',
              contenido: { text: `Sin resultados para ${marca} ${modelo}.`, rfqId, status: 'crm' },
              created_at: new Date().toISOString(),
            }]);
            pushLog(`Sin resultados: ${rfqId}`);
          }
          return;
        }
      }

      if (rfqRow && ['procesando_imagen', 'foto_lista', 'imagen_fallida', 'foto_pendiente', 'publicando', 'publicado'].includes(rfqRow.estado)) {
        clearInterval(pollInterval);
        rfqPollsRef.current.delete(uuid);

        if (isBulkSuppressed) return;

        if (rfqRow.estado === 'procesando_imagen') {
          setMessages((prev) => [...prev, {
            id: crypto.randomUUID(),
            stream_id: activeStreamId,
            rol: 'assistant',
            tipo: 'rfq-status',
            contenido: { rfq_id: uuid, estado: 'procesando_imagen' },
            created_at: new Date().toISOString(),
          }]);
          startImagenPolling(uuid);
        } else if (rfqRow.estado === 'foto_lista' && rfqRow.foto_url) {
          const { data: topOpcion } = await supabase
            .from('opciones')
            .select('proveedor, precio_orig, moneda, disponibilidad')
            .eq('rfq_id', uuid)
            .order('score_ranking', { ascending: false })
            .limit(1)
            .maybeSingle();
          setMessages((prev) => [...prev, {
            id: crypto.randomUUID(),
            stream_id: activeStreamId,
            rol: 'assistant',
            tipo: 'imagen_lista',
            contenido: {
              rfq_id: uuid,
              producto: `${rfqRow.marca} ${rfqRow.modelo}`,
              foto_url: rfqRow.foto_url,
              proveedor_top: topOpcion?.proveedor || '',
              precio_top: topOpcion?.precio_orig != null ? `$${topOpcion.precio_orig} ${topOpcion.moneda || 'USD'}` : '',
              disponibilidad_top: topOpcion?.disponibilidad || '',
            },
            created_at: new Date().toISOString(),
          }]);
        } else if (rfqRow.estado === 'imagen_fallida' || rfqRow.estado === 'foto_pendiente') {
          setMessages((prev) => [...prev, {
            id: crypto.randomUUID(),
            stream_id: activeStreamId,
            rol: 'assistant',
            tipo: 'imagen_fallida',
            contenido: { rfq_id: uuid },
            created_at: new Date().toISOString(),
          }]);
        } else if (rfqRow.estado === 'publicando') {
          setMessages((prev) => [...prev, {
            id: crypto.randomUUID(),
            stream_id: activeStreamId,
            rol: 'assistant',
            tipo: 'rfq-status',
            contenido: { rfq_id: uuid, estado: 'publicando' },
            created_at: new Date().toISOString(),
          }]);
          startPublicadorPolling(uuid);
        } else if (rfqRow.estado === 'publicado') {
          setMessages((prev) => [...prev, {
            id: crypto.randomUUID(),
            stream_id: activeStreamId,
            rol: 'assistant',
            tipo: 'rfq-status',
            contenido: { rfq_id: uuid, estado: 'publicado', producto: `${rfqRow.marca} ${rfqRow.modelo}` },
            created_at: new Date().toISOString(),
          }]);
        }
        return;
      }

      const { data: opciones, error: opcionesError } = await supabase
        .from('opciones')
        .select('*')
        .eq('rfq_id', uuid)
        .order('score_ranking', { ascending: false });

      if (opcionesError) {
        console.error('[RFQ] Error polling opciones:', opcionesError);
        return;
      }

      if (opciones && opciones.length > 0) {
        clearInterval(pollInterval);
        rfqPollsRef.current.delete(uuid);

        if (isBulkSuppressed) return;

        const validOpciones = filterValidOpciones(opciones);
        const proveedores = validOpciones.map((op: Record<string, unknown>, idx: number) => ({
          rank: idx + 1,
          nombre: op.proveedor as string || 'Sin nombre',
          precio: op.precio_orig != null ? `$${op.precio_orig} ${op.moneda || 'USD'}` : 'Consultar',
          disponibilidad: op.disponibilidad as string || 'N/A',
          score: op.score_ranking != null ? `${op.score_ranking}` : '0',
        }));

        const fxText = rfqRow?.fx_usd_mxn
          ? `${rfqRow.fx_usd_mxn} \u00B7 ${rfqRow.fx_fecha || new Date().toISOString().slice(0, 10)}`
          : '';

        const widgetMsg: Message = {
          id: crypto.randomUUID(),
          stream_id: activeStreamId,
          rol: 'assistant',
          tipo: 'widget',
          contenido: {
            rfq_id: rfqId,
            producto: `${marca} ${modelo}`,
            cantidad: rfqRow?.qty || qty,
            en_crm: validOpciones.some((op: Record<string, unknown>) => op.fuente === '1crm_productos')
              ? `Encontrado en catalogo — ${validOpciones.find((op: Record<string, unknown>) => op.fuente === '1crm_productos')?.proveedor ?? ''}`
              : 'No existe — requiere publicacion',
            fx: fxText,
            estado: rfqRow?.estado || 'busqueda_completa',
            proveedores,
          },
          created_at: new Date().toISOString(),
        };
        const infoMsg: Message = {
          id: crypto.randomUUID(),
          stream_id: activeStreamId,
          rol: 'assistant',
          tipo: 'rfq-log',
          contenido: { text: `Se encontraron ${proveedores.length} opciones. Revisa el RFQ para aprobar.`, rfqId, status: 'crm' },
          created_at: new Date().toISOString(),
        };
        setMessages((prev) => addWidgetMessage(prev, widgetMsg, [infoMsg]));
        pushLog(`Resultados listos: ${proveedores.length} opciones encontradas`);

        const productoYaPublicado = validOpciones.some(
          (op: any) => op.fuente === '1crm_productos'
        );
        if (!productoYaPublicado) {
          const opcionTop = validOpciones[0];
          setMessages((prev) => {
            if (prev.some(m => m.tipo === 'decision' && (m.contenido as any)?.rfq_id === uuid)) return prev;
            return [
              ...prev,
              {
                id: crypto.randomUUID(),
                stream_id: activeStreamId,
                rol: 'assistant',
                tipo: 'decision',
                contenido: {
                  text: `¿Publicar ${marca} ${modelo} basado en opcion #1 (${opcionTop?.proveedor ?? 'mejor opcion'})? El producto no existe en el catalogo.`,
                  rfq_id: uuid,
                },
                created_at: new Date().toISOString(),
              },
            ];
          });
        }
      }
    }, 5000);

    rfqPollsRef.current.set(uuid, pollInterval);
  }

  const handleSendMessage = useCallback(async (text: string) => {
    if (!activeStreamId) return;

    setMessages((prev) => [...prev, {
      id: crypto.randomUUID(),
      stream_id: activeStreamId,
      rol: 'user',
      tipo: 'text',
      contenido: { text },
      created_at: new Date().toISOString(),
    }]);

    // Indicador inmediato de "procesando" — evita que el chat se vea muerto durante el
    // cómputo. Se reemplaza en vivo por los pasos de stream_logs y se quita solo cuando
    // llega la respuesta del asistente (filtro `procesando` al aplicar la fila del asistente).
    // Estimado de tiempo INMEDIATO según el mensaje (no depende de stream_logs / realtime).
    const _low = text.toLowerCase();
    let _procText = 'Procesando tu solicitud… un momento.';
    if (/https?:\/\//.test(text)) {
      _procText = '🔎 Reviso el link del producto… (~15-40s). Te aviso al terminar.';
    } else if (/(correo|oportunidad|email|\brfq\b|cotiza|escanea)/.test(_low)) {
      _procText = '🔎 Reviso tu correo en busca de oportunidades… (~1 min). Te aviso al terminar.';
    } else if (/^(s[ií]|no|ok|dale|adelante|publica|publícalo|env[ií]a)(\W|$)/.test(_low.trim())) {
      _procText = 'Procesando tu aprobación… (~30s). Te aviso al terminar.';
    }
    setMessages((prev) => [...prev.filter((m) => !(m.contenido as any)?.procesando), {
      id: crypto.randomUUID(),
      stream_id: activeStreamId,
      rol: 'assistant',
      tipo: 'rfq-log',
      contenido: { text: _procText, status: 'querying', procesando: true },
      created_at: new Date().toISOString(),
    }]);

    pushLog(`Mensaje enviado: "${text.slice(0, 40)}${text.length > 40 ? '...' : ''}"`);

    const { error } = await supabase.from('mensajes').insert({
      stream_id: activeStreamId,
      role: 'user',
      content: text,
      procesado: false,
    });
    if (error) console.error('[chat] mensajes insert failed:', error);
  }, [activeStreamId]);

  const handleParseConfirm = useCallback(async (messageId: string, confirmed: boolean, data: { marca: string; modelo: string; qty: number; urgente: boolean; imageUrl?: string }) => {
    setMessages((prev) => prev.map((msg) =>
      msg.id === messageId ? { ...msg, contenido: { ...msg.contenido, resolved: true, confirmed } } : msg
    ));

    if (confirmed) {
      await createRFQAndSearch(data.marca, data.modelo, data.qty, data.urgente, data.imageUrl);
    } else {
      pushLog('Busqueda cancelada');
    }
  }, [activeStreamId]);

  const handleDocsConfirm = useCallback(async (messageId: string, products: { marca: string; modelo: string; qty: number }[]) => {
    if (confirmedDocsRef.current.has(messageId)) return;
    confirmedDocsRef.current.add(messageId);

    setMessages((prev) => prev.map((msg) =>
      msg.id === messageId ? { ...msg, contenido: { ...msg.contenido, resolved: true, count: products.length } } : msg
    ));

    if (products.length === 0) {
      pushLog('Sin productos seleccionados');
      return;
    }

    const isBulk = products.length >= 2;
    const bulkId = isBulk ? crypto.randomUUID() : undefined;

    if (isBulk && bulkId) {
      setActiveBulkId(bulkId);
      setMessages((prev) => [...prev, {
        id: crypto.randomUUID(),
        stream_id: activeStreamId,
        rol: 'assistant',
        tipo: 'bulk-widget',
        contenido: { bulk_id: bulkId },
        created_at: new Date().toISOString(),
      }]);
    }

    pushLog(`Creando ${products.length} RFQ(s) desde documento...`);
    for (const p of products) {
      await createRFQAndSearch(p.marca, p.modelo, p.qty, false, undefined, bulkId);
    }
  }, [activeStreamId]);

  const lastSeenMensajeRef = useRef<string | null>(null);
  useEffect(() => {
    if (!activeStreamId) return;
    function applyAssistantRow(row: { id: string; stream_id: string; role: string; content: string; created_at: string }) {
      if (row.role !== 'assistant') return;
      setMessages((prev) => {
        if (prev.some((m) => m.id === row.id)) return prev;
        const withoutProcesando = prev.filter((m) => !(m.contenido as any)?.procesando);
        return [...withoutProcesando, {
          id: row.id,
          stream_id: row.stream_id,
          rol: 'assistant' as const,
          tipo: 'text' as const,
          contenido: { text: row.content },
          created_at: row.created_at,
        }];
      });
      lastSeenMensajeRef.current = row.id;
    }
    const channel = supabase.channel(`mensajes-${activeStreamId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'mensajes', filter: `stream_id=eq.${activeStreamId}` }, (payload) => applyAssistantRow(payload.new as any))
      .subscribe();
    // Trae la última respuesta del asistente que ya esté en la BD. Se llama en el poll y,
    // sobre todo, al volver a la pestaña: el navegador congela setInterval y el websocket
    // cuando la pestaña está en segundo plano, así que sin esto la respuesta (que ya llegó a
    // la BD) no se pinta hasta que el poll despierta ~1-2 min después.
    const refetchLatest = async () => {
      const { data } = await supabase.from('mensajes').select('*').eq('stream_id', activeStreamId).eq('role', 'assistant').order('created_at', { ascending: false }).limit(1);
      if (data?.[0] && data[0].id !== lastSeenMensajeRef.current) applyAssistantRow(data[0]);
    };
    const poll = setInterval(refetchLatest, 3000);
    const onVisible = () => { if (document.visibilityState === 'visible') refetchLatest(); };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', refetchLatest);
    return () => {
      supabase.removeChannel(channel);
      clearInterval(poll);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', refetchLatest);
    };
  }, [activeStreamId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Feed de progreso en vivo: cada paso que el backend escribe en stream_logs actualiza la
  // burbuja "procesando" del chat (p.ej. "Escaneando correos: 3 oportunidades", "Correo
  // enviado a X"), para que el 1-2 min de cómputo se vea vivo en vez de muerto.
  useEffect(() => {
    if (!activeStreamId) return;
    const applyLog = (msg: string, tipo: string) => {
      if (!msg) return;
      setMessages((prev) => {
        const idx = prev.findIndex((m) => (m.contenido as any)?.procesando);
        if (idx === -1) return prev; // no hay burbuja activa → no mostramos nada
        const next = [...prev];
        next[idx] = { ...next[idx], contenido: { ...next[idx].contenido, text: msg, status: tipo === 'error' ? 'error' : 'querying' } };
        return next;
      });
    };
    const channel = supabase.channel(`streamlogs-chat-${activeStreamId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'stream_logs', filter: `stream_id=eq.${activeStreamId}` },
        (payload) => applyLog((payload.new as any)?.msg, (payload.new as any)?.type))
      .subscribe();
    // Poll de respaldo (por si Realtime no está habilitado para stream_logs): solo actualiza
    // la burbuja mientras hay una "procesando" activa.
    const lastLog = { id: null as string | null };
    const poll = setInterval(async () => {
      const { data } = await supabase.from('stream_logs')
        .select('id, msg, type').eq('stream_id', activeStreamId)
        .order('created_at', { ascending: false }).limit(1);
      const row = data?.[0];
      if (row && row.id !== lastLog.id) { lastLog.id = row.id; applyLog(row.msg, row.type); }
    }, 2000);
    return () => { supabase.removeChannel(channel); clearInterval(poll); };
  }, [activeStreamId]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleActiveBulkIdChange = useCallback(async (bulkId: string | null) => {
    if (bulkId === null) {
      setActiveBulkId(null);
      return;
    }
    if (activeBulkIdRef.current === bulkId) return;
    setActiveBulkId(bulkId);
    setMessages((prev) => {
      // Al aparecer el resultado (bulk widget), quitar la burbuja "procesando"
      const base = prev.filter((m) => !(m.contenido as any)?.procesando);
      if (base.some(m => m.tipo === 'bulk-widget' && (m.contenido as any)?.bulk_id === bulkId)) return base;
      return [...base, {
        id: crypto.randomUUID(),
        stream_id: activeStreamId ?? '',
        rol: 'assistant' as const,
        tipo: 'bulk-widget',
        contenido: { bulk_id: bulkId },
        created_at: new Date().toISOString(),
      }];
    });
    const { data } = await supabase.from('rfqs').select('id, rfq_id').eq('bulk_id', bulkId);
    if (data) {
      setBulkRfqIds((prev) => {
        const next = new Set(prev);
        data.forEach((r: any) => { next.add(r.id); if (r.rfq_id) next.add(r.rfq_id); });
        return next;
      });
    }
  }, [activeStreamId]);

  // Polling fallback: checks notificaciones every 3s in case realtime is not enabled for that table
  const lastSeenNotifRef = useRef<string | null>(null);
  useEffect(() => {
    if (!activeStreamId) return;
    const poll = setInterval(async () => {
      const { data } = await supabase
        .from('notificaciones')
        .select('id, tipo, mensaje')
        .eq('stream_id', activeStreamId)
        .eq('tipo', 'bulk')
        .order('created_at', { ascending: false })
        .limit(1);
      if (data?.[0] && data[0].id !== lastSeenNotifRef.current) {
        lastSeenNotifRef.current = data[0].id;
        try {
          const parsed = JSON.parse(data[0].mensaje);
          if (parsed.bulk_id) handleActiveBulkIdChange(parsed.bulk_id);
        } catch { /* ignore */ }
      }
    }, 3000);
    return () => clearInterval(poll);
  }, [activeStreamId, handleActiveBulkIdChange]);

  const handleImageExtracted = useCallback((data: { marca: string; modelo: string; qty: number; imageUrl: string }) => {
    if (!activeStreamId) return;
    const confirmMsg: Message = {
      id: crypto.randomUUID(),
      stream_id: activeStreamId,
      rol: 'assistant',
      tipo: 'parse_confirm',
      contenido: {
        marca: data.marca,
        modelo: data.modelo,
        qty: data.qty || 1,
        urgente: false,
        source: 'image',
        imageUrl: data.imageUrl,
      },
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, confirmMsg]);
    pushLog('Datos extraidos de imagen - esperando confirmacion');
  }, [activeStreamId]);

  function handleNavSelect(id: string) {
    setActiveNav(id);
  }


  const handleFileUploaded = useCallback(async (file: { name: string; type: string; size: number; url: string }, userText?: string) => {
    if (!activeStreamId) return;
    const fileMsg: Message = {
      id: crypto.randomUUID(),
      stream_id: activeStreamId,
      rol: 'user',
      tipo: 'file-upload',
      contenido: file,
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, fileMsg]);
    pushLog(`Archivo subido: ${file.name}`);

    const isImage = /\.(png|jpg|jpeg|webp)$/i.test(file.name) || file.type.startsWith('image/');
    const isDocument = /\.(docx?|xlsx?)$/i.test(file.name) || /word|spreadsheet|excel/i.test(file.type);
    let imageUrl = file.url;

    // If storage upload failed and we only have a blob URL, try to re-upload from the blob
    if (isImage && file.url.startsWith('blob:')) {
      try {
        const blobResp = await fetch(file.url);
        const blob = await blobResp.blob();
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 60);
        const path = `${activeStreamId}/${Date.now()}-${safeName}`;
        const { data: reupData, error: reupErr } = await supabase.storage
          .from('rfq-files')
          .upload(path, blob, { contentType: file.type });
        if (!reupErr && reupData) {
          const { data: urlData } = supabase.storage
            .from('rfq-files')
            .getPublicUrl(reupData.path);
          imageUrl = urlData.publicUrl;
        }
      } catch { /* re-upload failed, imageUrl stays as blob */ }
    }

    const hasRemoteUrl = imageUrl && !imageUrl.startsWith('blob:');

    if (isImage && hasRemoteUrl) {
      const extractingMsg: Message = {
        id: crypto.randomUUID(),
        stream_id: activeStreamId,
        rol: 'assistant',
        tipo: 'rfq-log',
        contenido: { text: 'Analizando imagen para extraer marca y modelo...', status: 'querying' },
        created_at: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, extractingMsg]);

      try {
        const apiUrl = `${'https://occlmazeyrxwszgjlrfb.supabase.co'}/functions/v1/extract-from-image`;
        const response = await fetch(apiUrl, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9jY2xtYXpleXJ4d3N6Z2pscmZiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc0OTQwODUsImV4cCI6MjA5MzA3MDA4NX0.FYWHw9xNCy5kQnelGOPB_zdAvYDd5B1nZEWN4CNP9DM'}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ image_url: imageUrl }),
        });

        if (!response.ok) throw new Error(`Status ${response.status}`);
        const result = await response.json();

        // Normalize response: new format returns {products: [...]}, legacy returns {marca, modelo, qty}
        let products: { marca: string; modelo: string; qty: number }[] = [];
        if (Array.isArray(result.products)) {
          products = result.products.filter((p: { marca?: string; modelo?: string }) => p.marca || p.modelo);
        } else if (result.marca || result.modelo) {
          products = [{ marca: result.marca || '', modelo: result.modelo || '', qty: result.qty || 1 }];
        }

        if (products.length === 1) {
          handleImageExtracted({
            marca: products[0].marca || '(detectar)',
            modelo: products[0].modelo || '(detectar)',
            qty: products[0].qty || 1,
            imageUrl: imageUrl,
          });
        } else if (products.length > 1) {
          const docsMsg: Message = {
            id: crypto.randomUUID(),
            stream_id: activeStreamId,
            rol: 'assistant',
            tipo: 'docs_parsed',
            contenido: { products, source: file.name, imageUrl: imageUrl },
            created_at: new Date().toISOString(),
          };
          setMessages((prev) => [...prev, docsMsg]);
          pushLog(`${products.length} productos detectados en imagen`);
        } else {
          setMessages((prev) => [...prev, {
            id: crypto.randomUUID(),
            stream_id: activeStreamId,
            rol: 'assistant',
            tipo: 'text',
            contenido: { text: 'No se pudo extraer informacion de producto de la imagen. Puedes escribir la marca y modelo directamente.' },
            created_at: new Date().toISOString(),
          }]);
        }
      } catch (err) {
        console.error('[Image Extract] Error:', err);
        setMessages((prev) => [...prev, {
          id: crypto.randomUUID(),
          stream_id: activeStreamId,
          rol: 'assistant',
          tipo: 'text',
          contenido: { text: 'No se pudo analizar la imagen. Puedes escribir la marca y modelo directamente.' },
          created_at: new Date().toISOString(),
        }]);
      }
    } else if (isDocument && hasRemoteUrl) {
      const extractingMsg: Message = {
        id: crypto.randomUUID(),
        stream_id: activeStreamId,
        rol: 'assistant',
        tipo: 'rfq-log',
        contenido: { text: `Analizando documento "${file.name}" para extraer productos...`, status: 'querying' },
        created_at: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, extractingMsg]);

      try {
        const apiUrl = `${'https://occlmazeyrxwszgjlrfb.supabase.co'}/functions/v1/extract-from-document`;
        const response = await fetch(apiUrl, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9jY2xtYXpleXJ4d3N6Z2pscmZiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc0OTQwODUsImV4cCI6MjA5MzA3MDA4NX0.FYWHw9xNCy5kQnelGOPB_zdAvYDd5B1nZEWN4CNP9DM'}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ file_url: file.url, file_type: file.name }),
        });

        if (!response.ok) throw new Error(`Status ${response.status}`);
        const result = await response.json();

        if (result.products && result.products.length > 0) {
          if (userText) {
            // User gave explicit intent — send to Claude with product list
            const productList = result.products
              .map((p: { marca?: string; modelo?: string; qty?: number }) =>
                `- ${[p.marca, p.modelo].filter(Boolean).join(' ')}${(p.qty ?? 1) > 1 ? ` x${p.qty}` : ''}`)
              .join('\n');
            const fullMessage = `${userText}\n\n[${result.products.length} productos extraídos de "${file.name}"]\n${productList}`;
            // Show user text bubble in UI
            setMessages((prev) => [...prev, {
              id: crypto.randomUUID(),
              stream_id: activeStreamId!,
              rol: 'user',
              tipo: 'text',
              contenido: { text: userText },
              created_at: new Date().toISOString(),
            }]);
            // Show "procesando" bubble
            setMessages((prev) => [...prev, {
              id: crypto.randomUUID(),
              stream_id: activeStreamId!,
              rol: 'assistant',
              tipo: 'rfq-log',
              contenido: { text: 'Claude está procesando tu solicitud...', status: 'querying', procesando: true },
              created_at: new Date().toISOString(),
            }]);
            // Send to Claude via mensajes table
            await supabase.from('mensajes').insert({
              stream_id: activeStreamId,
              role: 'user',
              content: fullMessage,
              procesado: false,
            });
            pushLog(`"${userText}" — ${result.products.length} productos de "${file.name}" enviados a Claude`);
          } else if (result.products.length === 1) {
            const p = result.products[0];
            handleImageExtracted({
              marca: p.marca || '(detectar)',
              modelo: p.modelo || '(detectar)',
              qty: p.qty || 1,
              imageUrl: '',
            });
          } else {
            const docsMsg: Message = {
              id: crypto.randomUUID(),
              stream_id: activeStreamId,
              rol: 'assistant',
              tipo: 'docs_parsed',
              contenido: { products: result.products, source: file.name },
              created_at: new Date().toISOString(),
            };
            setMessages((prev) => [...prev, docsMsg]);
            pushLog(`${result.products.length} productos extraidos de "${file.name}"`);
          }
        } else {
          setMessages((prev) => [...prev, {
            id: crypto.randomUUID(),
            stream_id: activeStreamId,
            rol: 'assistant',
            tipo: 'text',
            contenido: { text: `No se encontraron productos en "${file.name}". Puedes escribir la marca y modelo directamente.` },
            created_at: new Date().toISOString(),
          }]);
        }
      } catch (err) {
        console.error('[Doc Extract] Error:', err);
        setMessages((prev) => [...prev, {
          id: crypto.randomUUID(),
          stream_id: activeStreamId,
          rol: 'assistant',
          tipo: 'text',
          contenido: { text: `No se pudo analizar "${file.name}". Puedes escribir la marca y modelo directamente.` },
          created_at: new Date().toISOString(),
        }]);
      }
    } else if ((isImage || isDocument) && !hasRemoteUrl) {
      setMessages((prev) => [...prev, {
        id: crypto.randomUUID(),
        stream_id: activeStreamId,
        rol: 'assistant',
        tipo: 'text',
        contenido: { text: `Error al subir "${file.name}" al servidor. Intenta de nuevo o verifica tu conexion.` },
        created_at: new Date().toISOString(),
      }]);
      pushLog(`Error subiendo archivo: ${file.name}`, 'error');
    }
  }, [activeStreamId]);

  function startImagenPolling(rfqId: string) {
    if (imagenPollingRef.current) {
      clearInterval(imagenPollingRef.current);
      imagenPollingRef.current = null;
    }

    const startTime = Date.now();
    const TEN_MINUTES = 600000;

    const pollInterval = setInterval(async () => {
      if (Date.now() - startTime >= TEN_MINUTES) {
        clearInterval(pollInterval);
        imagenPollingRef.current = null;
        showImagenFallida(rfqId);
        return;
      }

      const { data: rfq } = await supabase
        .from('rfqs')
        .select('id, marca, modelo, foto_url, estado')
        .eq('id', rfqId)
        .maybeSingle();

      if (!rfq) return;

      if (rfq.estado === 'imagen_fallida' || rfq.estado === 'foto_pendiente') {
        clearInterval(pollInterval);
        imagenPollingRef.current = null;
        showImagenFallida(rfqId);
        return;
      }

      if (rfq.estado === 'foto_lista' && rfq.foto_url) {
        clearInterval(pollInterval);
        imagenPollingRef.current = null;

        const { data: topOpcion } = await supabase
          .from('opciones')
          .select('proveedor, precio_orig, moneda, disponibilidad')
          .eq('rfq_id', rfqId)
          .order('score_ranking', { ascending: false })
          .limit(1)
          .maybeSingle();

        const imagenMsg: Message = {
          id: crypto.randomUUID(),
          stream_id: activeStreamId || '',
          rol: 'assistant',
          tipo: 'imagen_lista',
          contenido: {
            rfq_id: rfq.id,
            producto: `${rfq.marca} ${rfq.modelo}`,
            foto_url: rfq.foto_url,
            proveedor_top: topOpcion?.proveedor || '',
            precio_top: topOpcion?.precio_orig != null ? `$${topOpcion.precio_orig} ${topOpcion.moneda || 'USD'}` : '',
            disponibilidad_top: topOpcion?.disponibilidad || '',
          },
          created_at: new Date().toISOString(),
        };
        setMessages((prev) => [...prev, imagenMsg]);
        pushLog('Imagen procesada - revision requerida');
      }
    }, 5000);

    imagenPollingRef.current = pollInterval;
  }

  function showImagenFallida(rfqId: string) {
    setMessages((prev) => [...prev, {
      id: crypto.randomUUID(),
      stream_id: activeStreamId || '',
      rol: 'assistant',
      tipo: 'imagen_fallida',
      contenido: { rfq_id: rfqId },
      created_at: new Date().toISOString(),
    }]);
    pushLog('Agente imagen fallo - accion manual requerida', 'error');
  }

  function startPublicadorPolling(rfqId: string) {
    if (publicadorPollingRef.current) {
      clearInterval(publicadorPollingRef.current);
      publicadorPollingRef.current = null;
    }

    const startTime = Date.now();
    const FIVE_MINUTES = 300000;

    const pollInterval = setInterval(async () => {
      if (Date.now() - startTime >= FIVE_MINUTES) {
        clearInterval(pollInterval);
        publicadorPollingRef.current = null;
        setMessages((prev) => [...prev, {
          id: crypto.randomUUID(),
          stream_id: activeStreamId || '',
          rol: 'assistant',
          tipo: 'rfq-log',
          contenido: { text: 'Timeout esperando publicacion en 1CRM.', status: 'crm' },
          created_at: new Date().toISOString(),
        }]);
        pushLog('Timeout esperando publicador', 'warn');
        return;
      }

      const { data: rfq } = await supabase
        .from('rfqs')
        .select('id, marca, modelo, estado, crm_producto_id')
        .eq('id', rfqId)
        .eq('estado', 'publicado')
        .maybeSingle();

                    // Detectar job fallido — no esperar 5 minutos
                    const { data: failedJob } = await supabase
                      .from('jobs')
                      .select('id, error')
                      .eq('rfq_id', rfqId)
                      .eq('agente', 'publicador')
                      .eq('estado', 'fallido')
                      .maybeSingle();
                    if (failedJob) {
                                      clearInterval(pollInterval);
                                      publicadorPollingRef.current = null;
                                      setMessages((prev) => [...prev, {
                                                          id: crypto.randomUUID(),
                                                          stream_id: activeStreamId || '',
                                                          rol: 'assistant',
                                                          tipo: 'rfq-log',
                                                          contenido: { text: `Error publicando en 1CRM. Intente de nuevo.`, status: 'crm' },
                                                          created_at: new Date().toISOString(),
                                      }]);
                                      pushLog('Publicacion 1CRM fallida — reintentando', 'error');
                                      return;
                    }

      if (rfq) {
        clearInterval(pollInterval);
        publicadorPollingRef.current = null;

        setMessages((prev) => [...prev, {
          id: crypto.randomUUID(),
          stream_id: activeStreamId || '',
          rol: 'assistant',
          tipo: 'rfq-status',
          contenido: {
            rfq_id: rfq.id,
            estado: 'publicado',
            producto: `${rfq.marca} ${rfq.modelo}`,
            crm_producto_id: rfq.crm_producto_id || null,
          },
          created_at: new Date().toISOString(),
        }]);
        pushLog(`Publicado en 1CRM: ${rfq.marca} ${rfq.modelo}`);
      }
    }, 5000);

    publicadorPollingRef.current = pollInterval;
  }

  const handleImagenDecision = useCallback(async (rfqId: string, approved: boolean) => {
    console.log('[handleImagenDecision] rfqId:', rfqId, 'approved:', approved);
    if (approved) {
      const { error } = await supabase
        .from('jobs')
        .insert({
          rfq_id: rfqId,
          agente: 'publicador',
          estado: 'pendiente',
        });
      if (error) {
        const msg = `INSERT jobs FAILED\n\ncode: ${error.code}\nmessage: ${error.message}\ndetails: ${error.details}\nhint: ${error.hint}`;
        console.error(msg, error);
        alert(msg);
        return;
      }
      await supabase.from('rfqs').update({ estado: 'publicando' }).eq('id', rfqId);
      setMessages((prev) => [...prev, {
        id: crypto.randomUUID(),
        stream_id: activeStreamId || '',
        rol: 'assistant',
        tipo: 'rfq-status',
        contenido: { rfq_id: rfqId, estado: 'publicando' },
        created_at: new Date().toISOString(),
      }]);
      pushLog('Job publicador creado - publicando en 1CRM');
      startPublicadorPolling(rfqId);
    } else {
      const { error } = await supabase
        .from('jobs')
        .insert({
          rfq_id: rfqId,
          agente: 'imagen',
          estado: 'pendiente',
        });
      if (error) {
        console.error('Error creando job imagen (retry):', error);
        return;
      }
      await supabase.from('rfqs').update({ estado: 'procesando_imagen' }).eq('id', rfqId);
      setMessages((prev) => [...prev, {
        id: crypto.randomUUID(),
        stream_id: activeStreamId || '',
        rol: 'assistant',
        tipo: 'rfq-status',
        contenido: { rfq_id: rfqId, estado: 'procesando_imagen' },
        created_at: new Date().toISOString(),
      }]);
      pushLog('Imagen rechazada - buscando otra foto', 'warn');
      startImagenPolling(rfqId);
    }
  }, [activeStreamId]);

  const handleDecision = useCallback(async (messageId: string, approved: boolean) => {
    const targetMsg = messages.find((m) => m.id === messageId);
    const rfqId = targetMsg?.contenido?.rfq_id;

    setMessages((prev) => prev.map((msg) => {
      if (msg.id === messageId) {
        return { ...msg, contenido: { ...msg.contenido, resolved: true, approved } };
      }
      return msg;
    }));
    pushLog(approved ? 'Decision: Aprobado para imagen' : 'Decision: Rechazado', approved ? 'ok' : 'warn');

    if (approved && rfqId) {
      const { error: jobErr } = await supabase
        .from('jobs')
        .insert({
          rfq_id: rfqId,
          agente: 'imagen',
          estado: 'pendiente',
        });
      if (jobErr) {
        console.error('Error creando job imagen:', jobErr);
        return;
      }

      await supabase.from('rfqs').update({ estado: 'procesando_imagen' }).eq('id', rfqId);

      setMessages((prev) => [...prev, {
        id: crypto.randomUUID(),
        stream_id: activeStreamId || '',
        rol: 'assistant',
        tipo: 'rfq-status',
        contenido: { rfq_id: rfqId, estado: 'procesando_imagen' },
        created_at: new Date().toISOString(),
      }]);
      pushLog('Job imagen creado - procesando imagen con IA');
      startImagenPolling(rfqId);
    } else if (!approved && activeStreamId) {
      setMessages((prev) => [...prev, {
        id: crypto.randomUUID(),
        stream_id: activeStreamId,
        rol: 'assistant',
        tipo: 'rfq-log',
        contenido: { text: 'Rechazado. Buscando alternativas...', status: 'searching' },
        created_at: new Date().toISOString(),
      }]);
      pushLog('Buscando alternativas...');
    }
  }, [activeStreamId, messages]);

  const handleImagenRetry = useCallback(async (rfqId: string) => {
    const { error: updateErr } = await supabase
      .from('rfqs')
      .update({ estado: 'foto_pendiente' })
      .eq('id', rfqId);
    if (updateErr) {
      console.error('Error actualizando rfq estado (retry):', updateErr);
      return;
    }
    const { error: jobErr } = await supabase
      .from('jobs')
      .insert({ rfq_id: rfqId, agente: 'imagen', estado: 'pendiente' });
    if (jobErr) {
      console.error('Error creando job imagen (retry):', jobErr);
      return;
    }
    setMessages((prev) => [...prev, {
      id: crypto.randomUUID(),
      stream_id: activeStreamId || '',
      rol: 'assistant',
      tipo: 'rfq-status',
      contenido: { rfq_id: rfqId, estado: 'procesando_imagen' },
      created_at: new Date().toISOString(),
    }]);
    pushLog('Reintentando imagen con IA');
    startImagenPolling(rfqId);
  }, [activeStreamId]);

  const handleManualImageUpload = useCallback(async (rfqId: string, file: File) => {
    const path = `manual/${rfqId}/${Date.now()}-${file.name}`;
    const { data, error } = await supabase.storage
      .from('product-images')
      .upload(path, file);

    if (error || !data) {
      console.error('Error subiendo imagen manual:', error);
      pushLog('Error subiendo imagen', 'error');
      return;
    }

    const { data: urlData } = supabase.storage
      .from('product-images')
      .getPublicUrl(data.path);

    const publicUrl = urlData.publicUrl;
    await supabase.from('rfqs').update({ foto_url: publicUrl, estado: 'foto_lista' }).eq('id', rfqId);

    const { data: rfq } = await supabase
      .from('rfqs')
      .select('marca, modelo')
      .eq('id', rfqId)
      .maybeSingle();

    const { data: topOp } = await supabase
      .from('opciones')
      .select('proveedor, precio_orig, moneda, disponibilidad')
      .eq('rfq_id', rfqId)
      .order('score_ranking', { ascending: false })
      .limit(1)
      .maybeSingle();

    setMessages((prev) => [...prev, {
      id: crypto.randomUUID(),
      stream_id: activeStreamId || '',
      rol: 'assistant',
      tipo: 'imagen_lista',
      contenido: {
        rfq_id: rfqId,
        producto: rfq ? `${rfq.marca} ${rfq.modelo}` : '',
        foto_url: publicUrl,
        proveedor_top: topOp?.proveedor || '',
        precio_top: topOp?.precio_orig != null ? `$${topOp.precio_orig} ${topOp.moneda || 'USD'}` : '',
        disponibilidad_top: topOp?.disponibilidad || '',
      },
      created_at: new Date().toISOString(),
    }]);
    pushLog('Imagen subida manualmente - revision requerida');
  }, [activeStreamId]);

  const handlePublicar = useCallback(async (rfqId: string, proveedorRank: number) => {
    await supabase.from('rfqs').update({ opcion_seleccionada: proveedorRank }).eq('id', rfqId);

    const { error: jobErr } = await supabase
      .from('jobs')
      .insert({
        rfq_id: rfqId,
        agente: 'imagen',
        estado: 'pendiente',
      });
    if (jobErr) {
      console.error('Error creando job imagen desde Publicar:', jobErr);
      return;
    }

    await supabase.from('rfqs').update({ estado: 'procesando_imagen' }).eq('id', rfqId);

    setMessages((prev) => [...prev, {
      id: crypto.randomUUID(),
      stream_id: activeStreamId || '',
      rol: 'assistant',
      tipo: 'rfq-status',
      contenido: { rfq_id: rfqId, estado: 'procesando_imagen' },
      created_at: new Date().toISOString(),
    }]);
    pushLog('Proveedor seleccionado - procesando imagen con IA');
    startImagenPolling(rfqId);
  }, [activeStreamId]);

  const handleClearStream = useCallback(async () => {
    if (!activeStreamId) return;

    // Detener polls activos del stream para que no re-inyecten mensajes
    rfqPollsRef.current.forEach((interval) => clearInterval(interval));
    rfqPollsRef.current.clear();
    if (imagenPollingRef.current) { clearInterval(imagenPollingRef.current); imagenPollingRef.current = null; }
    if (publicadorPollingRef.current) { clearInterval(publicadorPollingRef.current); publicadorPollingRef.current = null; }

    // Quitar mensajes del stream de la vista
    setMessagesRaw((prev) => prev.filter((m) => m.stream_id !== activeStreamId));

    // Limpiar cache de sesión y borrar de la DB (RFQs/jobs/notificaciones intactos)
    clearMessagesCache(activeStreamId);
    await deleteStreamMessages(activeStreamId);
    pushLog('Stream limpiado - la actividad queda registrada en los logs');
  }, [activeStreamId]);

  // Seleccionar un stream desde el TopBar: cambiar de stream Y volver a la
  // vista de chat (si estabas en dashboard/logs/config, el stream no se veía).
  function handleSelectStream(id: string) {
    setActiveStreamId(id);
    setActiveNav('chat');
  }

  function handleCreateStream() {
    const newStream: Stream = {
      id: crypto.randomUUID(),
      nombre: `Stream ${streams.length + 1}`,
      tipo: 'general',
      created_at: new Date().toISOString(),
      user_id: 'demo',
    };
    setStreams((prev) => [...prev, newStream]);
    setActiveStreamId(newStream.id);
    setActiveNav('chat');
  }

  async function handleRenameStream(id: string, nombre: string) {
    await supabase.from('streams').update({ nombre }).eq('id', id);
    setStreams((prev) => prev.map((s) => s.id === id ? { ...s, nombre } : s));
  }

  async function handleDeleteStream(id: string) {
    if (streams.length <= 1) return; // siempre al menos un stream
    await supabase.from('streams').delete().eq('id', id);
    setStreams((prev) => {
      const next = prev.filter((s) => s.id !== id);
      if (activeStreamId === id) {
        setActiveStreamId(next[next.length - 1]?.id ?? null);
      }
      return next;
    });
  }

  return (
    <div className="h-screen w-screen flex flex-col overflow-hidden">
      <TopBar
        streams={streams}
        activeStreamId={activeStreamId}
        onSelectStream={handleSelectStream}
        onCreateStream={handleCreateStream}
        onDeleteStream={handleDeleteStream}
        onRenameStream={handleRenameStream}
      />
      <div className="flex flex-1 min-h-0">
        <Sidebar activeNav={activeNav} onNavSelect={handleNavSelect} />
        {activeNav === 'dashboard' ? (
          <DashboardPanel />
        ) : activeNav === 'activity' ? (
          <ActivityLogPanel />
        ) : activeNav === 'connectors' ? (
          <ConnectorsPanel />
        ) : activeNav === 'agentes' ? (
          <AgentsPanel />
        ) : activeNav === 'infra' ? (
          <InfraPanel />
        ) : (
          <StreamArea
            stream={activeStream}
            messages={streamMessages}
            bulkRfqIds={bulkRfqIds}
            onActiveBulkIdChange={handleActiveBulkIdChange}
            onSendMessage={handleSendMessage}
            onFileUploaded={handleFileUploaded}
            onDecision={handleDecision}
            onImagenDecision={handleImagenDecision}
            onImagenRetry={handleImagenRetry}
            onManualImageUpload={handleManualImageUpload}
            onParseConfirm={handleParseConfirm}
            onDocsConfirm={handleDocsConfirm}
            onPublicar={handlePublicar}
            onClearStream={handleClearStream}
          />
        )}
        {!['dashboard', 'activity', 'connectors', 'agentes', 'infra'].includes(activeNav) && (
          <RightPanel visible={true} streamId={activeStreamId} />
        )}
      </div>
    </div>
  );
}
