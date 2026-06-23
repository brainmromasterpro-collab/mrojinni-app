import { useState, useEffect, useMemo, useRef } from 'react';
import { ChevronRight, Package, Loader2, CheckCircle2, AlertCircle, Search, Zap, Image as ImageIcon, Send, RotateCcw } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface Opcion {
  id: string;
  rfq_id: string;
  rank: number;
  proveedor: string | null;
  precio_orig: number | null;
  moneda: string | null;
  disponibilidad: string | null;
  score_ranking: number | null;
  fuente: string | null;
  imagen_url: string | null;
  url: string | null;
  nombre_producto: string | null;
  notas: string | null;
}

interface RFQRow {
  id: string;
  rfq_id: string;
  marca: string;
  modelo: string;
  estado: string | null;
  foto_url: string | null;
  opcion_seleccionada: string | null;
  crm_url: string | null;
  opciones: Opcion[];
}

type RowStatus = 'searching' | 'no_results' | 'in_crm' | 'has_options' | 'processing_image' | 'image_pending' | 'image_ready' | 'publishing' | 'published' | 'publish_failed';

function normalizeCrmUrl(url: string | null): string | null {
  if (!url) return null;
  const match = url.match(/[?&]record=([a-f0-9-]{20,})/i);
  if (!match) return url;
  const base = url.split('/index.php')[0];
  return `${base}/index.php?module=ProductCatalog&action=DetailView&record=${match[1]}`;
}

function getRowStatus(rfq: RFQRow): RowStatus {
  if (rfq.estado === 'publicado') return 'published';
  if (rfq.estado === 'publicando') return 'publishing';
  if (rfq.estado === 'foto_lista') return 'image_ready';
  if (rfq.estado === 'procesando_imagen') return 'processing_image';
  if (rfq.estado === 'foto_pendiente') return 'image_pending';
  if (rfq.estado === 'publicacion_fallida') return 'publish_failed';
  if (rfq.estado === 'imagen_fallida') return 'image_pending';
  const searchingStates = ['recibido', 'buscando'];
  if (searchingStates.includes(rfq.estado || '')) return 'searching';
  const opciones = rfq.opciones || [];
  if (rfq.estado === 'busqueda_completa' && opciones.length === 0) return 'no_results';
  if (opciones.some(o => o.fuente === '1crm_productos')) return 'in_crm';
  if (opciones.length > 0) return 'has_options';
  return 'searching';
}

function getStatusCell(status: RowStatus): { icon: string; label: string; color: string } {
  switch (status) {
    case 'searching':        return { icon: '⏳', label: 'Buscando...',      color: 'text-[#888]' };
    case 'no_results':       return { icon: '—',  label: 'Sin resultados',   color: 'text-[#666]' };
    case 'in_crm':           return { icon: '✦',  label: 'En catálogo',      color: 'text-[#a78bfa]' };
    case 'has_options':      return { icon: '◉',  label: 'Cotizaciones',     color: 'text-[#4ade80]' };
    case 'processing_image': return { icon: '⏳', label: 'Buscando imagen',  color: 'text-[#888]' };
    case 'image_pending':    return { icon: '⚠',  label: 'Imagen fallida',   color: 'text-[#fb923c]' };
    case 'image_ready':      return { icon: '🖼',  label: 'Foto lista',       color: 'text-[#4ade80]' };
    case 'publishing':       return { icon: '⏳', label: 'Publicando...',    color: 'text-[#888]' };
    case 'published':        return { icon: '✅', label: 'Publicado',        color: 'text-[#4ade80]' };
    case 'publish_failed':   return { icon: '❌', label: 'Error al publicar', color: 'text-[#f87171]' };
  }
}

function PreviewPanel({ rfq, total }: { rfq: RFQRow; total: number }) {
  const imgSrc = rfq.foto_url || rfq.opciones?.find(o => o.imagen_url)?.imagen_url || null;
  return (
    <div className="flex gap-3 px-4 py-4 border-b border-[#2a2a2a]">
      <div className="flex-shrink-0 w-[120px] h-[120px] rounded-lg border border-[#3a3a3a] bg-[#161616] flex items-center justify-center overflow-hidden">
        {imgSrc
          ? <img src={imgSrc} alt={rfq.modelo} className="w-full h-full object-contain p-2" />
          : <Package className="w-10 h-10 text-[#3a3a3a]" />}
      </div>
      <div className="flex-1 min-w-0 rounded-lg border border-[#3a3a3a] bg-[#161616] px-3 py-3 flex flex-col justify-center gap-2">
        <p className="text-[13px] font-semibold text-[#e0e0e0] truncate">{rfq.marca} {rfq.modelo}</p>
        <div className="space-y-1">
          <p className="text-[11px]">
            <span className="text-[#444]">Parte </span>
            <span className="font-mono text-[#aaa]">{rfq.modelo}</span>
          </p>
          {rfq.marca && (
            <p className="text-[11px]">
              <span className="text-[#444]">Marca </span>
              <span className="text-[#aaa]">{rfq.marca}</span>
            </p>
          )}
        </div>
        {total > 1 && (
          <p className="text-[10px] text-[#444]">+{total - 1} producto{total - 1 !== 1 ? 's' : ''} más en este lote</p>
        )}
      </div>
    </div>
  );
}

interface BulkWidgetProps {
  bulkId: string;
}

export default function BulkWidget({ bulkId }: BulkWidgetProps) {
  const [rfqs, setRfqs] = useState<RFQRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionInProgress, setActionInProgress] = useState(false);
  const [publishingIndividual, setPublishingIndividual] = useState<string | null>(null);
  const [selected, setSelected] = useState<Map<string, string>>(new Map());
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const busyRef = useRef(false);

  const stats = useMemo(() => {
    const total = rfqs.length;
    const searching = rfqs.filter(r => getRowStatus(r) === 'searching').length;
    const withOptions = rfqs.filter(r => getRowStatus(r) === 'has_options').length;
    const processingImage = rfqs.filter(r => getRowStatus(r) === 'processing_image').length;
    const imagePending = rfqs.filter(r => getRowStatus(r) === 'image_pending').length;
    const imageReady = rfqs.filter(r => getRowStatus(r) === 'image_ready').length;
    const publishing = rfqs.filter(r => getRowStatus(r) === 'publishing').length;
    const published = rfqs.filter(r => getRowStatus(r) === 'published').length;
    const noResults = rfqs.filter(r => getRowStatus(r) === 'no_results').length;
    const completed = total - searching;
    return { total, searching, withOptions, processingImage, imagePending, imageReady, publishing, published, noResults, completed };
  }, [rfqs]);

  const allFinished = stats.total > 0 && stats.searching === 0 && stats.withOptions === 0 && stats.processingImage === 0 && stats.imageReady === 0 && stats.publishing === 0;

  useEffect(() => {
    fetchRfqs();
    const retryTimeout = setTimeout(fetchRfqs, 2000);
    const pollInterval = setInterval(fetchRfqs, 4000);
    return () => {
      clearTimeout(retryTimeout);
      clearInterval(pollInterval);
    };
  }, [bulkId]);

  async function fetchRfqs() {
    if (busyRef.current) return;

    const { data, error } = await supabase
      .from('rfqs')
      .select('*, opciones(*)')
      .eq('bulk_id', bulkId)
      .order('created_at', { ascending: true });

    if (!error && data) {
      setRfqs(data as RFQRow[]);
    }
    setLoading(false);
  }

  function selectOpcion(rfqId: string, opcionId: string) {
    setSelected((prev) => {
      const next = new Map(prev);
      if (next.get(rfqId) === opcionId) {
        next.delete(rfqId);
      } else {
        next.set(rfqId, opcionId);
      }
      return next;
    });
  }

  function selectAllBest() {
    const next = new Map<string, string>();
    for (const rfq of rfqs) {
      if (getRowStatus(rfq) !== 'has_options') continue;
      const sorted = [...(rfq.opciones || [])].sort((a, b) => (b.score_ranking || 0) - (a.score_ranking || 0));
      if (sorted.length > 0) next.set(rfq.id, sorted[0].id);
    }
    setSelected(next);
  }

  function deselectAll() {
    setSelected(new Map());
  }

  async function handlePublishBulk() {
    if (selected.size === 0) return;
    busyRef.current = true;
    setActionInProgress(true);

    // Optimistic update: immediately show procesando_imagen for selected rfqs
    const selectedIds = new Set(selected.keys());
    setRfqs(prev => prev.map(r =>
      selectedIds.has(r.id) ? { ...r, estado: 'procesando_imagen', opcion_seleccionada: selected.get(r.id) || r.opcion_seleccionada } : r
    ));

    try {
      for (const [rfqId, opcionId] of selected.entries()) {
        const rfq = rfqs.find(r => r.id === rfqId);
        if (!rfq) continue;

        await supabase
          .from('rfqs')
          .update({ opcion_seleccionada: opcionId, estado: 'procesando_imagen' })
          .eq('id', rfqId);

        await supabase.from('jobs').insert({
          rfq_id: rfqId,
          agente: 'imagen',
          estado: 'pendiente',
        });
      }

      setSelected(new Map());
      await fetchRfqs();
    } finally {
      busyRef.current = false;
      setActionInProgress(false);
    }
  }

  async function handlePublishCRMBulk() {
    setActionInProgress(true);
    const readyRfqs = rfqs.filter(r => getRowStatus(r) === 'image_ready');

    for (const rfq of readyRfqs) {
      await supabase
        .from('rfqs')
        .update({ estado: 'publicando' })
        .eq('id', rfq.id);

      await supabase.from('jobs').insert({
        rfq_id: rfq.id,
        agente: 'publicador',
        estado: 'pendiente',
      });
    }

    await fetchRfqs();
    setActionInProgress(false);
  }

  async function handlePublishIndividual(rfqId: string, opcionId: string) {
    busyRef.current = true;
    setPublishingIndividual(rfqId);

    // Optimistic update
    setRfqs(prev => prev.map(r =>
      r.id === rfqId ? { ...r, estado: 'procesando_imagen', opcion_seleccionada: opcionId } : r
    ));

    try {
      await supabase
        .from('rfqs')
        .update({ opcion_seleccionada: opcionId, estado: 'procesando_imagen' })
        .eq('id', rfqId);

      await supabase.from('jobs').insert({
        rfq_id: rfqId,
        agente: 'imagen',
        estado: 'pendiente',
      });

      setSelected((prev) => {
        const next = new Map(prev);
        next.delete(rfqId);
        return next;
      });
      await fetchRfqs();
    } finally {
      busyRef.current = false;
      setPublishingIndividual(null);
    }
  }

  async function handlePublishCRMIndividual(rfqId: string) {
    setPublishingIndividual(rfqId);

    await supabase
      .from('rfqs')
      .update({ estado: 'publicando' })
      .eq('id', rfqId);

    await supabase.from('jobs').insert({
      rfq_id: rfqId,
      agente: 'publicador',
      estado: 'pendiente',
    });

    await fetchRfqs();
    setPublishingIndividual(null);
  }

  async function handleRetryImage(rfqId: string) {
    busyRef.current = true;
    setRfqs(prev => prev.map(r =>
      r.id === rfqId ? { ...r, estado: 'procesando_imagen' } : r
    ));

    try {
      await supabase
        .from('rfqs')
        .update({ estado: 'procesando_imagen' })
        .eq('id', rfqId);

      await supabase.from('jobs').insert({
        rfq_id: rfqId,
        agente: 'imagen',
        estado: 'pendiente',
      });

      await fetchRfqs();
    } finally {
      busyRef.current = false;
    }
  }

  function getStatusIcon(status: RowStatus) {
    switch (status) {
      case 'searching': return <Loader2 className="w-3.5 h-3.5 text-sky-500 animate-spin" />;
      case 'no_results': return <AlertCircle className="w-3.5 h-3.5 text-gray-400" />;
      case 'has_options': return <Search className="w-3.5 h-3.5 text-emerald-500" />;
      case 'processing_image': return <Loader2 className="w-3.5 h-3.5 text-amber-500 animate-spin" />;
      case 'image_pending': return <AlertCircle className="w-3.5 h-3.5 text-amber-500" />;
      case 'image_ready': return <ImageIcon className="w-3.5 h-3.5 text-teal-500" />;
      case 'publishing': return <Loader2 className="w-3.5 h-3.5 text-sky-500 animate-spin" />;
      case 'published': return <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />;
      case 'publish_failed': return <AlertCircle className="w-3.5 h-3.5 text-red-500" />;
    }
  }

  if (loading) {
    return (
      <div className="bg-[#1e1e1e] border border-[#333] rounded-xl p-6 flex items-center justify-center gap-2">
        <Loader2 className="w-4 h-4 text-[#60a5fa] animate-spin" />
        <span className="text-[12px] text-[#888]">Cargando lote...</span>
      </div>
    );
  }

  if (rfqs.length === 0) {
    return (
      <div className="bg-[#1e1e1e] border border-[#333] rounded-xl p-6 flex items-center justify-center gap-2">
        <Loader2 className="w-3.5 h-3.5 text-[#555] animate-spin" />
        <span className="text-[12px] text-[#666]">Procesando lote...</span>
      </div>
    );
  }

  const progressPercent = stats.total > 0 ? (stats.completed / stats.total) * 100 : 0;

  return (
    <div className="bg-[#1e1e1e] border border-[#333] rounded-xl overflow-hidden font-sans text-[12px]">

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-[#2e2e2e] bg-[#252525]">
        <div className="flex items-center gap-2">
          <Package className="w-3.5 h-3.5 text-[#555]" />
          <span className="text-[#ccc] font-sans font-semibold text-[12px]">Lote de búsqueda</span>
          <span className="text-[#555] text-[11px]">·</span>
          <span className="text-[#666] text-[11px]">
            {stats.total} productos
            {stats.published > 0 && ` · ${stats.published} publicados`}
          </span>
        </div>
        {!allFinished && stats.searching > 0
          ? <Loader2 className="w-3 h-3 text-[#555] animate-spin" />
          : allFinished && <span className="text-[11px] text-[#4ade80]">✓ Completo</span>
        }
      </div>

      {/* Product preview: two columns */}
      {rfqs.length > 0 && (
        <PreviewPanel rfq={rfqs[0]} total={rfqs.length} />
      )}

      {/* Progress bar */}
      {!allFinished && (
        <div className="px-4 py-2 border-b border-[#2a2a2a]">
          <div className="flex items-center gap-3">
            <div className="flex-1 h-[3px] bg-[#2a2a2a] rounded-full overflow-hidden">
              <div
                className="h-full bg-[#3b82f6] rounded-full transition-all duration-500"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
            <span className="text-[10px] text-[#555] tabular-nums">{stats.completed}/{stats.total}</span>
          </div>
        </div>
      )}

      {/* Toolbar */}
      {(stats.withOptions > 0 || stats.imageReady > 0) && (
        <div className="flex items-center gap-3 px-4 py-2 border-b border-[#2a2a2a] bg-[#222]">
          {stats.withOptions > 0 && (
            <button
              onClick={selectAllBest}
              className="flex items-center gap-1 text-[11px] text-[#60a5fa] hover:text-[#93c5fd] transition-colors"
            >
              <Zap className="w-3 h-3" />
              Seleccionar mejor opción ({stats.withOptions})
            </button>
          )}
          {selected.size > 0 && (
            <button onClick={deselectAll} className="text-[11px] text-[#555] hover:text-[#888] transition-colors">
              Limpiar
            </button>
          )}
          {stats.imageReady > 0 && (
            <button
              onClick={handlePublishCRMBulk}
              disabled={actionInProgress}
              className="flex items-center gap-1 text-[11px] text-[#4ade80] hover:text-[#86efac] disabled:opacity-40 transition-colors ml-auto"
            >
              <Send className="w-3 h-3" />
              Publicar en CRM ({stats.imageReady})
            </button>
          )}
        </div>
      )}

      {/* Table header */}
      <div className="grid grid-cols-[1fr_140px_100px_80px] gap-0 border-b border-[#2e2e2e] bg-[#252525] px-4 py-2">
        <span className="text-[10px] text-[#555] uppercase tracking-wider">Modelo</span>
        <span className="text-[10px] text-[#555] uppercase tracking-wider">Estado</span>
        <span className="text-[10px] text-[#555] uppercase tracking-wider">Precio</span>
        <span className="text-[10px] text-[#555] uppercase tracking-wider text-right">Link</span>
      </div>

      {/* RFQ rows */}
      <div className="max-h-[360px] overflow-y-auto divide-y divide-[#252525]">
        {rfqs.map((rfq) => {
          const status = getRowStatus(rfq);
          const isExpanded = expandedRow === rfq.id;
          const selectedOpcion = selected.get(rfq.id);
          const opciones = [...(rfq.opciones || [])].sort((a, b) => (b.score_ranking || 0) - (a.score_ranking || 0));
          const bestOption = opciones[0];
          const statusCell = getStatusCell(status);
          const crmOpcion = opciones.find(o => o.fuente === '1crm_productos') || null;
          const canExpand = status === 'has_options' || status === 'image_ready' || status === 'image_pending' || status === 'in_crm';
          const selectedOpData = opciones.find(o => o.id === selectedOpcion);
          const isTerminal = status === 'published' || status === 'no_results' || status === 'publish_failed';

          return (
            <div key={rfq.id} className={isTerminal ? 'opacity-50' : ''}>
              <button
                onClick={() => { if (canExpand) setExpandedRow(isExpanded ? null : rfq.id); }}
                disabled={!canExpand}
                className={`w-full grid grid-cols-[1fr_140px_100px_80px] gap-0 px-4 py-2.5 text-left transition-colors ${
                  canExpand ? 'hover:bg-[#252525] cursor-pointer' : 'cursor-default'
                } ${isExpanded ? 'bg-[#252525]' : ''}`}
              >
                {/* Modelo */}
                <div className="flex items-center gap-1.5 min-w-0 pr-3">
                  {canExpand && (
                    <ChevronRight className={`w-3 h-3 text-[#444] flex-shrink-0 transition-transform duration-150 ${isExpanded ? 'rotate-90' : ''}`} />
                  )}
                  <span className="text-[#d4d4d4] truncate font-mono text-[11px]">
                    {rfq.modelo}
                    {rfq.marca && <span className="text-[#666] ml-1 font-sans">· {rfq.marca}</span>}
                  </span>
                </div>

                {/* Estado */}
                <div className={`flex items-center gap-1 ${statusCell.color}`}>
                  {status === 'searching' || status === 'processing_image' || status === 'publishing'
                    ? <Loader2 className="w-3 h-3 animate-spin text-[#555]" />
                    : <span>{statusCell.icon}</span>
                  }
                  <span className="text-[11px] font-sans">{statusCell.label}</span>
                </div>

                {/* Precio */}
                <div className="flex items-center">
                  {status === 'in_crm' && crmOpcion?.precio_orig != null && (
                    <span className="text-[#a78bfa] text-[11px]">${crmOpcion.precio_orig} <span className="text-[#555]">{crmOpcion.moneda || 'USD'}</span></span>
                  )}
                  {status === 'has_options' && !selectedOpData && bestOption?.precio_orig != null && (
                    <span className="text-[#d4d4d4] text-[11px]">${bestOption.precio_orig} <span className="text-[#555]">{bestOption.moneda || 'USD'}</span></span>
                  )}
                  {status === 'has_options' && selectedOpData && (
                    <span className="text-[#60a5fa] text-[11px] truncate">{selectedOpData.proveedor}</span>
                  )}
                  {(status === 'searching' || isTerminal) && (
                    <span className="text-[#444]">—</span>
                  )}
                </div>

                {/* Link */}
                <div className="flex items-center justify-end">
                  {status === 'in_crm' && normalizeCrmUrl(crmOpcion?.url ?? null) ? (
                    <a
                      href={normalizeCrmUrl(crmOpcion!.url)!}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="text-[#a78bfa] hover:text-[#c4b5fd] text-[11px] font-sans transition-colors"
                    >
                      Ver CRM ↗
                    </a>
                  ) : status === 'has_options' && bestOption?.url ? (
                    <a
                      href={bestOption.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="text-[#4ade80] hover:text-[#86efac] text-[11px] font-sans transition-colors"
                    >
                      Ver ↗
                    </a>
                  ) : status === 'published' && rfq.crm_url ? (
                    <a
                      href={rfq.crm_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="text-[#60a5fa] hover:text-[#93c5fd] text-[11px] font-sans transition-colors"
                    >
                      Ver CRM ↗
                    </a>
                  ) : (
                    <span className="text-[#444]">—</span>
                  )}
                </div>
              </button>

              {/* Expanded: already in CRM catalog */}
              {isExpanded && status === 'in_crm' && crmOpcion && (
                <div className="bg-[#1a1a1a] border-t border-[#2a2a2a] px-4 py-3 pl-8">
                  <div className="flex items-start gap-3">
                    {crmOpcion.imagen_url && (
                      <img
                        src={crmOpcion.imagen_url}
                        alt={rfq.modelo}
                        className="w-14 h-14 object-contain rounded border border-[#333] bg-[#111] flex-shrink-0"
                      />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] text-[#a78bfa] font-semibold mb-0.5">Ya existe en el catálogo 1CRM</p>
                      {crmOpcion.notas && (
                        <p className="text-[11px] text-[#888] truncate mb-1">{crmOpcion.notas}</p>
                      )}
                      <div className="flex items-center gap-3">
                        {crmOpcion.precio_orig != null && (
                          <span className="text-[11px] text-[#d4d4d4]">${crmOpcion.precio_orig} {crmOpcion.moneda || 'USD'}</span>
                        )}
                        <span className="text-[10px] text-[#4ade80]">{crmOpcion.disponibilidad || 'en_stock'}</span>
                      </div>
                    </div>
                    {normalizeCrmUrl(crmOpcion.url) && (
                      <a
                        href={normalizeCrmUrl(crmOpcion.url)!}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="text-[11px] text-[#a78bfa] hover:text-[#c4b5fd] transition-colors flex-shrink-0"
                      >
                        Abrir en CRM ↗
                      </a>
                    )}
                  </div>
                </div>
              )}

              {/* Expanded: provider selection */}
              {isExpanded && status === 'has_options' && (
                <div className="bg-[#1a1a1a] border-t border-[#2a2a2a] px-4 py-2">
                  <div className="space-y-0.5 pl-4">
                    {opciones.map((op) => {
                      const isSelected = selectedOpcion === op.id;
                      return (
                        <div
                          key={op.id}
                          onClick={() => selectOpcion(rfq.id, op.id)}
                          className={`flex items-center gap-3 py-1.5 px-2 rounded cursor-pointer transition-colors ${
                            isSelected ? 'bg-[#1e3a5f]' : 'hover:bg-[#252525]'
                          }`}
                        >
                          <div className={`w-2 h-2 rounded-full flex-shrink-0 ${isSelected ? 'bg-[#60a5fa]' : 'bg-[#333]'}`} />
                          <span className={`flex-1 text-[11px] truncate ${isSelected ? 'text-[#d4d4d4]' : 'text-[#888]'}`}>
                            {op.proveedor || 'Sin nombre'}
                          </span>
                          <span className="text-[11px] text-[#d4d4d4] tabular-nums">
                            {op.precio_orig != null ? `$${op.precio_orig}` : '—'}
                          </span>
                          <span className="text-[10px] text-[#555] w-16 text-right">{op.disponibilidad || ''}</span>
                          {isSelected && (
                            <button
                              onClick={(e) => { e.stopPropagation(); handlePublishIndividual(rfq.id, op.id); }}
                              disabled={publishingIndividual === rfq.id}
                              className="text-[11px] text-[#4ade80] hover:text-[#86efac] disabled:opacity-40 transition-colors ml-1"
                            >
                              {publishingIndividual === rfq.id ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Aprobar →'}
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Expanded: image pending */}
              {isExpanded && status === 'image_pending' && (
                <div className="bg-[#1a1a1a] border-t border-[#2a2a2a] px-4 py-2.5 flex items-center gap-3 pl-8">
                  <span className="text-[#fb923c] text-[11px] flex-1 font-sans">No se pudo obtener imagen automáticamente.</span>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleRetryImage(rfq.id); }}
                    className="flex items-center gap-1 text-[11px] text-[#888] hover:text-[#ccc] transition-colors"
                  >
                    <RotateCcw className="w-3 h-3" />
                    Reintentar
                  </button>
                </div>
              )}

              {/* Expanded: image ready */}
              {isExpanded && status === 'image_ready' && (
                <div className="bg-[#1a1a1a] border-t border-[#2a2a2a] px-4 py-2.5 flex items-center gap-3 pl-8">
                  {rfq.foto_url && (
                    <img src={rfq.foto_url} alt="" className="w-[78px] h-[78px] object-contain rounded border border-[#333] bg-[#111] p-1" />
                  )}
                  <span className="text-[#888] text-[11px] flex-1 font-sans">
                    Imagen lista · {opciones.find(o => o.id === rfq.opcion_seleccionada)?.proveedor || opciones[0]?.proveedor || '—'}
                  </span>
                  <button
                    onClick={(e) => { e.stopPropagation(); handlePublishCRMIndividual(rfq.id); }}
                    disabled={publishingIndividual === rfq.id}
                    className="flex items-center gap-1 text-[11px] text-[#4ade80] hover:text-[#86efac] disabled:opacity-40 transition-colors"
                  >
                    {publishingIndividual === rfq.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <><Send className="w-3 h-3" /> Publicar</>}
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Footer bulk action */}
      {selected.size > 0 && (
        <div className="flex items-center justify-between px-4 py-2.5 border-t border-[#2a2a2a] bg-[#1a1a1a]">
          <span className="text-[11px] text-[#555] font-sans">
            {selected.size} seleccionado{selected.size !== 1 ? 's' : ''} — imagen + publicar en CRM
          </span>
          <button
            onClick={handlePublishBulk}
            disabled={actionInProgress}
            className="flex items-center gap-1.5 text-[11px] text-[#4ade80] hover:text-[#86efac] disabled:opacity-40 transition-colors"
          >
            {actionInProgress && <Loader2 className="w-3 h-3 animate-spin" />}
            Aprobar y publicar ({selected.size}) →
          </button>
        </div>
      )}
    </div>
  );
}
