import { useState, useEffect } from 'react';
import { Activity, Bot, Bell, Package, ArrowRight, Clock, CheckCircle2, AlertCircle, XCircle, Loader2, Search, Image as ImageIcon, Send, Eye, RefreshCw } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface LogEntry {
  id: string;
  timestamp: string;
  type: 'job' | 'notification' | 'rfq';
  actor: string;
  actorColor: string;
  action: string;
  target: string;
  targetSub?: string;
  status: 'success' | 'running' | 'pending' | 'error' | 'warn';
  category: 'agentes' | 'infra' | 'negocio' | 'sistema';
  meta?: Record<string, string>;
}

const AGENT_COLORS: Record<string, string> = {
  lector: '#10b981',
  buscador: '#06b6d4',
  imagen: '#f59e0b',
  ficha: '#8b5cf6',
  publicador: '#ec4899',
  monitor: '#6366f1',
  sistema: '#64748b',
};

function getAgentColor(agente: string): string {
  return AGENT_COLORS[agente] || '#64748b';
}

function getJobAction(agente: string, estado: string): string {
  const actions: Record<string, Record<string, string>> = {
    lector: { pendiente: 'Lectura en cola', corriendo: 'Leyendo documento', completado: 'Documento procesado', fallido: 'Lectura fallida' },
    buscador: { pendiente: 'Busqueda en cola', corriendo: 'Buscando proveedores', completado: 'Busqueda completada', fallido: 'Busqueda fallida' },
    imagen: { pendiente: 'Imagen en cola', corriendo: 'Procesando imagen', completado: 'Imagen procesada', fallido: 'Imagen fallida' },
    ficha: { pendiente: 'Ficha en cola', corriendo: 'Generando ficha', completado: 'Ficha generada', fallido: 'Ficha fallida' },
    publicador: { pendiente: 'Publicacion en cola', corriendo: 'Publicando en CRM', completado: 'Publicado en CRM', fallido: 'Publicacion fallida' },
  };
  return actions[agente]?.[estado] || `${agente} → ${estado}`;
}

function getJobStatus(estado: string): LogEntry['status'] {
  switch (estado) {
    case 'completado': return 'success';
    case 'corriendo': return 'running';
    case 'pendiente': return 'pending';
    case 'fallido': return 'error';
    default: return 'pending';
  }
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const secs = Math.floor(diff / 1000);
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  return `${Math.floor(hrs / 24)}d`;
}

function formatTimestamp(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
}

const CATEGORY_LABELS: Record<string, { label: string; color: string }> = {
  agentes: { label: 'Agentes', color: '#06b6d4' },
  infra: { label: 'Infra', color: '#f59e0b' },
  negocio: { label: 'Negocio', color: '#10b981' },
  sistema: { label: 'Sistema', color: '#64748b' },
};

export default function ActivityLogPanel() {
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>('all');

  useEffect(() => {
    fetchAll();
    const interval = setInterval(fetchAll, 15000);
    return () => clearInterval(interval);
  }, []);

  async function fetchAll() {
    const [jobsRes, notifsRes, rfqsRes] = await Promise.all([
      supabase
        .from('jobs')
        .select('id, agente, estado, rfq_id, created_at, started_at, finished_at, error')
        .order('created_at', { ascending: false })
        .limit(80),
      supabase
        .from('notificaciones')
        .select('id, titulo, tipo, created_at, rfq_id')
        .order('created_at', { ascending: false })
        .limit(40),
      supabase
        .from('rfqs')
        .select('id, rfq_id, marca, modelo, estado, updated_at, created_at')
        .order('updated_at', { ascending: false })
        .limit(30),
    ]);

    const logEntries: LogEntry[] = [];

    if (jobsRes.data) {
      for (const job of jobsRes.data) {
        const ts = job.finished_at || job.started_at || job.created_at;
        logEntries.push({
          id: `job-${job.id}`,
          timestamp: ts,
          type: 'job',
          actor: job.agente,
          actorColor: getAgentColor(job.agente),
          action: getJobAction(job.agente, job.estado),
          target: job.rfq_id ? job.rfq_id.slice(0, 8) : '--',
          targetSub: job.error ? job.error.slice(0, 60) : undefined,
          status: getJobStatus(job.estado),
          category: 'agentes',
          meta: {
            agente: job.agente,
            estado: job.estado,
          },
        });
      }
    }

    if (notifsRes.data) {
      for (const n of notifsRes.data) {
        const status: LogEntry['status'] = n.tipo === 'error' ? 'error'
          : (n.tipo === 'foto_pendiente' || n.tipo === 'imagen_fallida') ? 'warn'
          : 'success';
        logEntries.push({
          id: `notif-${n.id}`,
          timestamp: n.created_at,
          type: 'notification',
          actor: 'sistema',
          actorColor: AGENT_COLORS.sistema,
          action: n.titulo,
          target: n.rfq_id ? n.rfq_id.slice(0, 8) : '',
          status,
          category: 'sistema',
          meta: { tipo: n.tipo },
        });
      }
    }

    if (rfqsRes.data) {
      for (const rfq of rfqsRes.data) {
        const estadoLabel: Record<string, string> = {
          recibido: 'RFQ creado',
          buscando: 'Buscando proveedores',
          busqueda_completa: 'Busqueda completada',
          procesando_imagen: 'Procesando imagen',
          foto_lista: 'Foto lista',
          foto_pendiente: 'Foto pendiente',
          publicando: 'Publicando',
          publicado: 'Publicado en CRM',
        };
        logEntries.push({
          id: `rfq-${rfq.id}`,
          timestamp: rfq.updated_at || rfq.created_at,
          type: 'rfq',
          actor: 'pipeline',
          actorColor: '#10b981',
          action: estadoLabel[rfq.estado] || rfq.estado || 'Actualizado',
          target: rfq.rfq_id || rfq.id.slice(0, 8),
          targetSub: `${rfq.marca} ${rfq.modelo}`,
          status: rfq.estado === 'publicado' ? 'success' : rfq.estado === 'foto_pendiente' ? 'warn' : 'running',
          category: 'negocio',
          meta: { estado: rfq.estado || '' },
        });
      }
    }

    logEntries.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    setEntries(logEntries);
    setLoading(false);
  }

  const filtered = filter === 'all' ? entries : entries.filter(e => e.category === filter);

  function StatusIcon({ status }: { status: LogEntry['status'] }) {
    switch (status) {
      case 'success': return <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />;
      case 'running': return <Loader2 className="w-3.5 h-3.5 text-sky-500 animate-spin" />;
      case 'pending': return <Clock className="w-3.5 h-3.5 text-gray-400" />;
      case 'error': return <XCircle className="w-3.5 h-3.5 text-red-400" />;
      case 'warn': return <AlertCircle className="w-3.5 h-3.5 text-amber-500" />;
    }
  }

  function TypeIcon({ type }: { type: LogEntry['type'] }) {
    switch (type) {
      case 'job': return <Bot className="w-3 h-3" />;
      case 'notification': return <Bell className="w-3 h-3" />;
      case 'rfq': return <Package className="w-3 h-3" />;
    }
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-[#0d0d0d] overflow-hidden">
      {/* Header */}
      <div className="px-6 py-5 border-b border-[#1f1f1f] flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2.5">
            <Activity className="w-4 h-4 text-[#06b6d4]" />
            <h2 className="text-[15px] font-semibold text-white">Activity Log</h2>
          </div>
          <p className="text-[11px] text-[#666] mt-0.5 ml-6.5">Explorer global de eventos - quien hizo que y cuando</p>
        </div>
        <button
          onClick={() => { setLoading(true); fetchAll(); }}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#2a2a2a] text-[11px] text-[#888] hover:text-white hover:border-[#444] transition-colors"
        >
          <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Filter tabs */}
      <div className="px-6 py-3 border-b border-[#1f1f1f] flex items-center gap-2">
        {[
          { key: 'all', label: 'Todos', count: entries.length },
          { key: 'agentes', label: 'Agentes', count: entries.filter(e => e.category === 'agentes').length },
          { key: 'negocio', label: 'Negocio', count: entries.filter(e => e.category === 'negocio').length },
          { key: 'sistema', label: 'Sistema', count: entries.filter(e => e.category === 'sistema').length },
        ].map(tab => (
          <button
            key={tab.key}
            onClick={() => setFilter(tab.key)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium transition-colors ${
              filter === tab.key
                ? 'bg-[#1f1f1f] text-white border border-[#333]'
                : 'text-[#666] hover:text-[#aaa] border border-transparent'
            }`}
          >
            {tab.label}
            <span className={`text-[9px] px-1.5 py-0.5 rounded-full ${
              filter === tab.key ? 'bg-[#333] text-[#ccc]' : 'bg-[#1a1a1a] text-[#555]'
            }`}>
              {tab.count}
            </span>
          </button>
        ))}
      </div>

      {/* Entries list - etherscan-style */}
      <div className="flex-1 overflow-y-auto scrollbar-light">
        {loading && entries.length === 0 ? (
          <div className="flex items-center justify-center py-20 gap-2">
            <Loader2 className="w-4 h-4 text-[#555] animate-spin" />
            <span className="text-[12px] text-[#555]">Cargando eventos...</span>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex items-center justify-center py-20">
            <span className="text-[12px] text-[#555]">Sin eventos en esta categoria</span>
          </div>
        ) : (
          <div className="divide-y divide-[#1a1a1a]">
            {filtered.map((entry) => (
              <div
                key={entry.id}
                className="group flex items-center gap-3 px-6 py-3 hover:bg-[#141414] transition-colors"
              >
                {/* Status indicator */}
                <div className="flex-shrink-0 w-5 flex items-center justify-center">
                  <StatusIcon status={entry.status} />
                </div>

                {/* Timestamp block - etherscan style */}
                <div className="flex-shrink-0 w-[72px]">
                  <span className="text-[10px] font-mono text-[#666] block">{formatTimestamp(entry.timestamp)}</span>
                  <span className="text-[9px] text-[#444] block">{timeAgo(entry.timestamp)} ago</span>
                </div>

                {/* Actor badge */}
                <div
                  className="flex-shrink-0 flex items-center gap-1 px-2 py-1 rounded-md border"
                  style={{
                    borderColor: `${entry.actorColor}40`,
                    backgroundColor: `${entry.actorColor}10`,
                  }}
                >
                  <TypeIcon type={entry.type} />
                  <span className="text-[10px] font-semibold capitalize" style={{ color: entry.actorColor }}>
                    {entry.actor}
                  </span>
                </div>

                {/* Arrow */}
                <ArrowRight className="w-3 h-3 text-[#333] flex-shrink-0" />

                {/* Action */}
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] text-[#ccc] truncate">{entry.action}</p>
                  {entry.targetSub && (
                    <p className="text-[10px] text-[#555] truncate mt-0.5">{entry.targetSub}</p>
                  )}
                </div>

                {/* Target hash - blockchain style */}
                {entry.target && (
                  <div className="flex-shrink-0 flex items-center gap-1">
                    <span className="text-[10px] font-mono text-[#444] bg-[#1a1a1a] px-2 py-0.5 rounded border border-[#222]">
                      {entry.target}
                    </span>
                  </div>
                )}

                {/* Category tag */}
                <div className="flex-shrink-0 hidden group-hover:flex">
                  <span
                    className="text-[9px] font-medium px-1.5 py-0.5 rounded"
                    style={{
                      color: CATEGORY_LABELS[entry.category]?.color || '#666',
                      backgroundColor: `${CATEGORY_LABELS[entry.category]?.color || '#666'}15`,
                    }}
                  >
                    {CATEGORY_LABELS[entry.category]?.label || entry.category}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer stats */}
      <div className="px-6 py-2.5 border-t border-[#1f1f1f] flex items-center justify-between bg-[#0a0a0a]">
        <div className="flex items-center gap-4">
          <span className="text-[9px] text-[#444]">
            {filtered.length} eventos
          </span>
          <span className="text-[9px] text-[#444]">
            Auto-refresh: 15s
          </span>
        </div>
        <div className="flex items-center gap-3">
          {Object.entries(CATEGORY_LABELS).map(([key, { label, color }]) => {
            const count = entries.filter(e => e.category === key).length;
            if (count === 0) return null;
            return (
              <span key={key} className="text-[9px] flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: color }} />
                <span className="text-[#555]">{label}: {count}</span>
              </span>
            );
          })}
        </div>
      </div>
    </div>
  );
}
