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

type RowStatus = 'searching' | 'no_results' | 'has_options' | 'processing_image' | 'image_pending' | 'image_ready' | 'publishing' | 'published' | 'publish_failed';

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
  if (opciones.length > 0) return 'has_options';
  return 'searching';
}

function getStatusBadge(status: RowStatus): { label: string; classes: string } {
  switch (status) {
    case 'searching': return { label: 'Buscando...', classes: 'bg-sky-50 text-sky-600' };
    case 'no_results': return { label: 'Sin resultados', classes: 'bg-gray-100 text-gray-500' };
    case 'has_options': return { label: 'Listo', classes: 'bg-emerald-50 text-emerald-600' };
    case 'processing_image': return { label: 'Imagen...', classes: 'bg-amber-50 text-amber-600' };
    case 'image_pending': return { label: 'Imagen fallida', classes: 'bg-amber-50 text-amber-700' };
    case 'image_ready': return { label: 'Foto lista', classes: 'bg-teal-50 text-teal-600' };
    case 'publishing': return { label: 'Publicando...', classes: 'bg-sky-50 text-sky-600' };
    case 'published': return { label: 'Publicado', classes: 'bg-emerald-50 text-emerald-700' };
    case 'publish_failed': return { label: 'Error al publicar', classes: 'bg-red-50 text-red-600' };
  }
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
      <div className="bg-white border border-brain-border rounded-xl p-6 flex items-center justify-center gap-2">
        <Loader2 className="w-4 h-4 text-sky-500 animate-spin" />
        <span className="text-[12px] text-[#888]">Cargando resultados del lote...</span>
      </div>
    );
  }

  if (rfqs.length === 0) {
    return (
      <div className="bg-white border border-brain-border rounded-xl p-6 flex items-center justify-center">
        <span className="text-[12px] text-[#888]">Procesando lote...</span>
        <Loader2 className="w-3.5 h-3.5 text-sky-400 animate-spin ml-2" />
      </div>
    );
  }

  const progressPercent = stats.total > 0 ? (stats.completed / stats.total) * 100 : 0;

  return (
    <div className="bg-white border border-brain-border rounded-xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-brain-border bg-brain-surface/50">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-sky-100 flex items-center justify-center">
            <Package className="w-3.5 h-3.5 text-sky-600" />
          </div>
          <div>
            <h3 className="text-[13px] font-semibold text-gray-900">Lote de busqueda</h3>
            <p className="text-[10px] text-[#888]">
              {stats.total} producto{stats.total !== 1 ? 's' : ''}
              {stats.published > 0 && ` · ${stats.published} publicado${stats.published !== 1 ? 's' : ''}`}
              {stats.searching > 0 && ` · ${stats.searching} buscando`}
            </p>
          </div>
        </div>
        {!allFinished && stats.searching > 0 && (
          <Loader2 className="w-3.5 h-3.5 text-sky-400 animate-spin" />
        )}
        {allFinished && (
          <CheckCircle2 className="w-4 h-4 text-emerald-500" />
        )}
      </div>

      {/* Product preview: image left, info right */}
      {rfqs.length > 0 && (
        <div className="flex gap-3 px-4 py-3 border-b border-brain-border bg-white">
          <div className="flex-shrink-0 w-[108px] h-[108px] rounded-lg border border-brain-border bg-brain-surface flex items-center justify-center overflow-hidden">
            {(() => {
              const imgSrc = rfqs[0].foto_url
                || rfqs[0].opciones?.find(o => o.imagen_url)?.imagen_url
                || null;
              return imgSrc
                ? <img src={imgSrc} alt={rfqs[0].modelo} className="w-full h-full object-contain p-1" />
                : <Package className="w-9 h-9 text-brain-border" />;
            })()}
          </div>
          <div className="flex-1 min-w-0 flex flex-col justify-center gap-1">
            <p className="text-[13px] font-semibold text-gray-900 truncate">{rfqs[0].marca} {rfqs[0].modelo}</p>
            <div className="flex items-center gap-3">
              <span className="text-[10px] text-[#aaa]">Parte <span className="font-mono text-gray-700">{rfqs[0].modelo}</span></span>
              {rfqs[0].marca && <span className="text-[10px] text-[#aaa]">Marca <span className="text-gray-700">{rfqs[0].marca}</span></span>}
            </div>
            {rfqs.length > 1 && <p className="text-[10px] text-[#aaa]">+{rfqs.length - 1} producto{rfqs.length - 1 !== 1 ? 's' : ''} más</p>}
          </div>
        </div>
      )}

      {/* Progress bar */}
      <div className="px-4 py-2 border-b border-brain-border">
        <div className="flex items-center gap-3">
          <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-sky-400 to-emerald-400 rounded-full transition-all duration-500"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
          <span className="text-[10px] font-medium text-[#888] whitespace-nowrap">
            {stats.completed}/{stats.total}
          </span>
        </div>
      </div>

      {/* Toolbar - shown when there are actionable items */}
      {(stats.withOptions > 0 || stats.imageReady > 0) && (
        <div className="flex items-center justify-between px-4 py-2 border-b border-brain-border flex-wrap gap-2">
          <div className="flex items-center gap-2">
            {stats.withOptions > 0 && (
              <>
                <button
                  onClick={selectAllBest}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-md border border-brain-border text-[10px] font-medium text-gray-700 hover:bg-brain-surface transition-colors"
                >
                  <Zap className="w-3 h-3" />
                  Mejor opcion ({stats.withOptions})
                </button>
                {selected.size > 0 && (
                  <button
                    onClick={deselectAll}
                    className="px-2.5 py-1 rounded-md text-[10px] font-medium text-[#888] hover:text-gray-700 hover:bg-gray-50 transition-colors"
                  >
                    Limpiar
                  </button>
                )}
              </>
            )}
            {stats.imageReady > 0 && (
              <button
                onClick={handlePublishCRMBulk}
                disabled={actionInProgress}
                className="flex items-center gap-1 px-2.5 py-1 rounded-md border border-emerald-200 bg-emerald-50 text-[10px] font-medium text-emerald-700 hover:bg-emerald-100 disabled:opacity-50 transition-colors"
              >
                <Send className="w-3 h-3" />
                Publicar en CRM ({stats.imageReady})
              </button>
            )}
          </div>
          <span className="text-[10px] text-[#888]">
            {selected.size > 0 ? `${selected.size} seleccionado${selected.size !== 1 ? 's' : ''}` : ''}
          </span>
        </div>
      )}

      {/* RFQ list */}
      <div className="max-h-[400px] overflow-y-auto divide-y divide-brain-border">
        {rfqs.map((rfq) => {
          const status = getRowStatus(rfq);
          const isExpanded = expandedRow === rfq.id;
          const selectedOpcion = selected.get(rfq.id);
          const opciones = [...(rfq.opciones || [])].sort((a, b) => (b.score_ranking || 0) - (a.score_ranking || 0));
          const bestOption = opciones[0];
          const badge = getStatusBadge(status);
          const isTerminal = status === 'published' || status === 'no_results' || status === 'publish_failed';
          const canExpand = status === 'has_options' || status === 'image_ready' || status === 'image_pending';
          const selectedOpData = opciones.find(o => o.id === selectedOpcion);

          return (
            <div key={rfq.id} className={isTerminal ? 'opacity-60' : ''}>
              {/* Row header */}
              <button
                onClick={() => {
                  if (!canExpand) return;
                  setExpandedRow(isExpanded ? null : rfq.id);
                }}
                disabled={!canExpand}
                className={`w-full flex items-center gap-2.5 px-4 py-2.5 text-left transition-colors ${
                  canExpand ? 'hover:bg-brain-surface/60 cursor-pointer' : 'cursor-default'
                } ${isExpanded ? 'bg-brain-surface/40' : ''}`}
              >
                <div className="flex-shrink-0 w-4 flex items-center justify-center">
                  {canExpand ? (
                    <ChevronRight className={`w-3 h-3 text-gray-400 transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''}`} />
                  ) : (
                    getStatusIcon(status)
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <span className="text-[11px] font-medium text-gray-900 truncate block">
                    {rfq.marca} {rfq.modelo}
                  </span>
                </div>

                <span className={`flex-shrink-0 inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-semibold ${badge.classes}`}>
                  {badge.label}
                </span>

                {status === 'published' && rfq.crm_url && (
                  <a
                    href={rfq.crm_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="flex-shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded text-[9px] font-medium text-brain-accent border border-brain-accent/30 bg-brain-accent-soft hover:bg-brain-accent hover:text-white transition-colors"
                  >
                    Ver en CRM ↗
                  </a>
                )}

                <div className="flex-shrink-0 w-28 text-right">
                  {status === 'searching' && (
                    <Loader2 className="w-3 h-3 text-sky-400 animate-spin ml-auto" />
                  )}
                  {status === 'has_options' && !selectedOpData && bestOption && (
                    <span className="text-[10px] font-semibold text-gray-800">
                      ${bestOption.precio_orig} {bestOption.moneda || 'USD'}
                    </span>
                  )}
                  {status === 'has_options' && selectedOpData && (
                    <span className="text-[10px] font-medium text-emerald-700 truncate block">
                      {selectedOpData.proveedor}
                    </span>
                  )}
                  {status === 'image_ready' && rfq.foto_url && (
                    <span className="text-[10px] font-medium text-teal-600">Foto lista</span>
                  )}
                </div>
              </button>

              {/* Expanded content */}
              {isExpanded && status === 'has_options' && (
                <div className="bg-brain-surface/30 border-t border-brain-border">
                  <div className="px-4 py-2 pl-10">
                    <div className="space-y-1">
                      {opciones.map((op) => {
                        const isSelected = selectedOpcion === op.id;
                        return (
                          <div
                            key={op.id}
                            onClick={() => selectOpcion(rfq.id, op.id)}
                            className={`flex items-center py-2 px-2.5 rounded-lg cursor-pointer transition-all duration-150 border ${
                              isSelected
                                ? 'bg-sky-50 border-sky-200 shadow-sm'
                                : 'border-transparent hover:bg-white hover:border-brain-border'
                            }`}
                          >
                            <div className={`w-3 h-3 rounded-full border-2 mr-2 flex items-center justify-center flex-shrink-0 ${
                              isSelected ? 'border-sky-500' : 'border-gray-300'
                            }`}>
                              {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-sky-500" />}
                            </div>

                            <span className={`flex-1 text-[10px] ${isSelected ? 'font-semibold text-gray-900' : 'text-gray-700'} truncate`}>
                              {op.proveedor || 'Sin nombre'}
                            </span>
                            <span className="w-20 text-right text-[10px] font-semibold text-gray-900">
                              {op.precio_orig != null ? `$${op.precio_orig}` : '--'}
                            </span>
                            <span className="w-16 text-right text-[9px] text-emerald-600 truncate">
                              {op.disponibilidad || 'N/A'}
                            </span>
                            <div className="w-16 flex justify-end">
                              {isSelected && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handlePublishIndividual(rfq.id, op.id);
                                  }}
                                  disabled={publishingIndividual === rfq.id}
                                  className="px-2 py-0.5 rounded text-[9px] font-semibold text-white bg-[#3B82F6] hover:bg-[#2563EB] disabled:opacity-50 transition-colors"
                                >
                                  {publishingIndividual === rfq.id ? (
                                    <Loader2 className="w-2.5 h-2.5 animate-spin" />
                                  ) : (
                                    'Aprobar'
                                  )}
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              {/* Expanded: image pending (failed) */}
              {isExpanded && status === 'image_pending' && (
                <div className="bg-amber-50/50 border-t border-brain-border">
                  <div className="px-4 py-3 pl-10 flex items-center gap-3">
                    <AlertCircle className="w-4 h-4 text-amber-500 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] font-medium text-amber-800">No se pudo obtener la imagen automaticamente.</p>
                      <p className="text-[10px] text-amber-600 mt-0.5">Puedes reintentar la busqueda de imagen para este producto.</p>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRetryImage(rfq.id);
                      }}
                      className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] font-semibold text-amber-700 bg-amber-100 border border-amber-200 hover:bg-amber-200 transition-colors"
                    >
                      <RotateCcw className="w-3 h-3" />
                      Reintentar
                    </button>
                  </div>
                </div>
              )}

              {/* Expanded: image ready */}
              {isExpanded && status === 'image_ready' && (
                <div className="bg-brain-surface/30 border-t border-brain-border">
                  <div className="px-4 py-3 pl-10 flex items-center gap-3">
                    {rfq.foto_url && (
                      <img
                        src={rfq.foto_url}
                        alt={`${rfq.marca} ${rfq.modelo}`}
                        className="w-20 h-20 object-contain rounded-lg border border-brain-border bg-white p-1"
                      />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] text-gray-700">Imagen procesada y lista para publicar en CRM.</p>
                      <p className="text-[10px] text-[#888] mt-0.5">
                        Proveedor: {opciones.find(o => o.id === rfq.opcion_seleccionada)?.proveedor || opciones[0]?.proveedor || '--'}
                      </p>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handlePublishCRMIndividual(rfq.id);
                      }}
                      disabled={publishingIndividual === rfq.id}
                      className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] font-semibold text-white bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 transition-colors"
                    >
                      {publishingIndividual === rfq.id ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <>
                          <Send className="w-3 h-3" />
                          Publicar
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Footer with bulk action */}
      {selected.size > 0 && (
        <div className="flex items-center justify-between px-4 py-2.5 border-t border-brain-border bg-brain-surface/50">
          <span className="text-[10px] text-[#888]">
            {selected.size} seleccionado{selected.size !== 1 ? 's' : ''} — se procesara imagen y publicara en CRM
          </span>
          <button
            onClick={handlePublishBulk}
            disabled={actionInProgress}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#3B82F6] text-white text-[11px] font-semibold hover:bg-[#2563EB] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {actionInProgress && <Loader2 className="w-3 h-3 animate-spin" />}
            Aprobar y publicar ({selected.size})
          </button>
        </div>
      )}
    </div>
  );
}
