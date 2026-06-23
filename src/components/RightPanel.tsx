import { useState, useRef, useEffect } from 'react';
import { Plus, Upload, Link, FileText, X } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface RightPanelProps {
  visible: boolean;
  streamId: string | null;
}

interface LogEntry {
  id: string;
  msg: string;
  type: 'ok' | 'warn' | 'error';
  created_at: string;
}

interface Source {
  icon: string;
  name: string;
  type: 'link' | 'file' | 'text';
  url?: string;
  content?: string;
}

type AgentStatus = 'ok' | 'running' | 'waiting';

interface AgentInfo {
  name: string;
  key: string;
  status: AgentStatus;
}

// Nombre legible por clave de agente. Se amplía solo: agentes nuevos que no
// estén aquí se muestran con su clave capitalizada.
const AGENT_LABEL: Record<string, string> = {
  lector: 'Lector',
  buscador: 'Buscador',
  imagen: 'Imagen',
  ficha: 'Ficha',
  publicador: 'Publicador',
  notificador: 'Notificador',
  chat: 'Chat',
  monitor: 'Monitor',
};

// Orden de presentación (pipeline). Agentes desconocidos van al final.
const AGENT_ORDER = ['lector', 'buscador', 'imagen', 'ficha', 'publicador'];

// Agentes internos de plumbing que no se muestran como "trabajando" en el stream.
const AGENT_HIDDEN = new Set(['notificador']);

function agentLabel(key: string): string {
  return AGENT_LABEL[key] || (key.charAt(0).toUpperCase() + key.slice(1));
}


const defaultFuentes: Source[] = [
  { icon: '\u{1F517}', name: '1CRM Product Catalog', type: 'link' },
  { icon: '\u{1F517}', name: '1CRM Proveedores', type: 'link' },
  { icon: '\u{1F310}', name: 'Google Search', type: 'link' },
];

const infra = [
  { name: 'Railway', status: 'online' },
  { name: 'Supabase', status: 'online' },
  { name: 'Remove.bg', status: 'ok' },
];

const statusColors = {
  ok: 'text-brain-success',
  running: 'text-brain-warning',
  waiting: 'text-[#555]',
};

const statusLabels = {
  ok: 'ok',
  running: 'corriendo',
  waiting: 'espera',
};

export default function RightPanel({ visible, streamId }: RightPanelProps) {
  if (!visible) return null;

  return (
    <aside className="hidden md:flex w-sidebar-r h-full bg-brain-dark border-l border-brain-card flex-col overflow-y-auto scrollbar-thin flex-shrink-0">
      {/* Agents */}
      <AgentsSection streamId={streamId} />

      {/* Live logs */}
      <LiveLogsSection streamId={streamId} />

      {/* Sources */}
      <SourcesSection />

      {/* Infra */}
      <Section title="Infraestructura">
        <div className="px-3 space-y-1">
          {infra.map((item) => (
            <div key={item.name} className="flex items-center justify-between px-2 py-1.5 bg-brain-card rounded-md">
              <span className="flex items-center gap-1.5 text-[10px] text-[#ccc]">
                <span className="status-dot ok" />
                {item.name}
              </span>
              <span className="text-[9px] text-brain-success font-medium">{item.status}</span>
            </div>
          ))}
        </div>
      </Section>
    </aside>
  );
}

function AgentsSection({ streamId }: { streamId: string | null }) {
  const [agents, setAgents] = useState<AgentInfo[]>([]);

  useEffect(() => {
    if (!streamId) { setAgents([]); return; }
    let cancelled = false;

    async function fetchStreamAgents() {
      // 1. Roster configurado: agentes asignados a este stream (AgentsPanel)
      const { data: streamRow } = await supabase
        .from('streams')
        .select('*')
        .eq('id', streamId)
        .maybeSingle();
      const asignados: string[] = Array.isArray(streamRow?.agentes) ? streamRow!.agentes : [];

      // 2. Jobs del stream para el estado (vinculados vía rfq_id -> rfqs.stream_id)
      const { data: rfqs } = await supabase
        .from('rfqs')
        .select('id')
        .eq('stream_id', streamId)
        .order('created_at', { ascending: false })
        .limit(100);

      const rfqIds = (rfqs || []).map((r) => r.id);
      let jobs: { agente: string; estado: string; finished_at: string | null; started_at: string | null; created_at: string }[] = [];
      if (rfqIds.length > 0) {
        const { data } = await supabase
          .from('jobs')
          .select('agente, estado, finished_at, started_at, created_at')
          .in('rfq_id', rfqIds)
          .order('created_at', { ascending: false })
          .limit(200);
        jobs = data || [];
      }

      if (cancelled) return;

      // 3. Roster: el asignado en config; si no hay, derivar de los jobs del stream
      const base = asignados.length > 0
        ? asignados
        : Array.from(new Set(jobs.map((j) => j.agente)));
      const keys = base
        .filter((k) => k && !AGENT_HIDDEN.has(k))
        .sort((a, b) => {
          const ia = AGENT_ORDER.indexOf(a); const ib = AGENT_ORDER.indexOf(b);
          return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
        });

      // Un agente se enciende SOLO mientras está corriendo ahora mismo.
      // Un job pendiente/corriendo solo cuenta si es RECIENTE (< 15 min): hay
      // jobs zombie que quedaron en "corriendo" tras un crash y no son uso real.
      // Nota: NO encendemos por "recién terminó" — eso hacía que buscador y
      // publicador salieran verdes al mismo tiempo que corría imagen.
      const now = Date.now();
      const RUNNING_FRESH_MS = 15 * 60 * 1000;
      const list: AgentInfo[] = keys.map((key) => {
        const aj = jobs.filter((j) => j.agente === key);
        const hasRunning = aj.some((j) => {
          if (j.estado !== 'pendiente' && j.estado !== 'corriendo') return false;
          const ts = j.started_at || j.created_at;
          return ts != null && (now - new Date(ts).getTime()) < RUNNING_FRESH_MS;
        });
        return { name: agentLabel(key), key, status: hasRunning ? 'running' : 'waiting' };
      });

      if (!cancelled) setAgents(list);
    }

    fetchStreamAgents();
    const interval = setInterval(fetchStreamAgents, 5000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [streamId]);

  return (
    <Section title="Stream config">
      <div className="px-3 pb-1">
        <p className="text-[10px] text-[#888] flex items-center gap-1.5 px-1 py-1">
          Agentes del stream
        </p>
        <div className="space-y-1">
          {agents.length === 0 ? (
            <p className="px-2 py-1.5 text-[10px] text-[#555]">Sin actividad de agentes en este stream</p>
          ) : agents.map((a) => (
            <div
              key={a.key}
              className={`flex items-center justify-between px-2 py-1.5 bg-brain-card rounded-md ${
                a.status === 'waiting' ? 'opacity-40' : ''
              }`}
            >
              <span className="flex items-center gap-1.5 text-[10px] text-[#ccc]">
                <span className={`status-dot ${a.status === 'ok' ? 'ok' : a.status === 'running' ? 'running' : 'waiting'}`} />
                {a.name}
              </span>
              <span className={`text-[9px] font-medium ${statusColors[a.status]}`}>
                {statusLabels[a.status]}
              </span>
            </div>
          ))}
        </div>
      </div>
    </Section>
  );
}

function LiveLogsSection({ streamId }: { streamId: string | null }) {
  const [logs, setLogs] = useState<LogEntry[]>([]);

  useEffect(() => {
    if (!streamId) {
      setLogs([]);
      return;
    }

    // Fetch existing logs
    supabase
      .from('stream_logs')
      .select('id, msg, type, created_at')
      .eq('stream_id', streamId)
      .order('created_at', { ascending: false })
      .limit(30)
      .then(({ data }) => {
        if (data) setLogs(data.reverse() as LogEntry[]);
      });

    // Subscribe to new logs
    const channel = supabase
      .channel(`logs-${streamId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'stream_logs',
          filter: `stream_id=eq.${streamId}`,
        },
        (payload) => {
          const entry = payload.new as LogEntry;
          setLogs((prev) => [...prev.slice(-29), entry]);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [streamId]);

  function formatTime(iso: string) {
    const d = new Date(iso);
    return d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
  }

  const typeIcon = { ok: '\u2713', warn: '\u26A1', error: '\u2717' };
  const typeColor = { ok: 'text-brain-success', warn: 'text-brain-warning', error: 'text-red-400' };

  return (
    <Section title="Logs en vivo">
      <div className="px-3 space-y-1.5 max-h-48 overflow-y-auto scrollbar-thin">
        {logs.length === 0 && (
          <p className="text-[10px] text-[#555] px-1 py-2">Sin actividad reciente</p>
        )}
        {logs.map((log) => (
          <div key={log.id} className="px-1 animate-fade-in">
            <div className="text-[9px] text-[#555] font-mono">{formatTime(log.created_at)}</div>
            <div className={`text-[10px] mt-0.5 ${typeColor[log.type] || 'text-[#888]'}`}>
              {typeIcon[log.type] || ''} {log.msg}
            </div>
          </div>
        ))}
      </div>
    </Section>
  );
}

type AddMode = 'idle' | 'file' | 'link' | 'text';

function SourcesSection() {
  const [sources, setSources] = useState<Source[]>(defaultFuentes);
  const [addMode, setAddMode] = useState<AddMode>('idle');
  const [linkValue, setLinkValue] = useState('');
  const [textValue, setTextValue] = useState('');
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleFileUpload(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true);
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const path = `sources/${Date.now()}-${file.name}`;
      const { data, error } = await supabase.storage
        .from('rfq-files')
        .upload(path, file);

      let url = '';
      if (!error && data) {
        const { data: urlData } = supabase.storage
          .from('rfq-files')
          .getPublicUrl(data.path);
        url = urlData.publicUrl;
      }

      setSources((prev) => [...prev, {
        icon: '\u{1F4CE}',
        name: file.name,
        type: 'file',
        url: url || '',
      }]);
    }
    setUploading(false);
    setAddMode('idle');
  }

  function handleAddLink() {
    const trimmed = linkValue.trim();
    if (!trimmed) return;
    setSources((prev) => [...prev, {
      icon: '\u{1F517}',
      name: trimmed.length > 30 ? trimmed.slice(0, 30) + '...' : trimmed,
      type: 'link',
      url: trimmed,
    }]);
    setLinkValue('');
    setAddMode('idle');
  }

  function handleAddText() {
    const trimmed = textValue.trim();
    if (!trimmed) return;
    setSources((prev) => [...prev, {
      icon: '\u{1F4DD}',
      name: trimmed.length > 30 ? trimmed.slice(0, 30) + '...' : trimmed,
      type: 'text',
      content: trimmed,
    }]);
    setTextValue('');
    setAddMode('idle');
  }

  function removeSource(index: number) {
    setSources((prev) => prev.filter((_, i) => i !== index));
  }

  return (
    <div className="py-2">
      <div className="flex items-center justify-between px-4 py-1.5">
        <p className="text-[9px] font-semibold text-[#555] uppercase tracking-widest">Fuentes</p>
        <button
          onClick={() => setAddMode(addMode === 'idle' ? 'file' : 'idle')}
          className="w-5 h-5 flex items-center justify-center rounded text-[#555] hover:text-[#ccc] hover:bg-brain-card transition-colors"
          title="Agregar fuente"
        >
          {addMode !== 'idle' ? <X className="w-3 h-3" /> : <Plus className="w-3 h-3" />}
        </button>
      </div>

      {/* Add mode selector */}
      {addMode !== 'idle' && (
        <div className="px-3 mb-2 animate-fade-in">
          {/* Tabs */}
          <div className="flex gap-1 mb-2">
            <button
              onClick={() => setAddMode('file')}
              className={`flex items-center gap-1 px-2 py-1 rounded text-[9px] font-medium transition-colors ${
                addMode === 'file' ? 'bg-[#3B82F6]/20 text-[#3B82F6]' : 'text-[#888] hover:text-[#ccc]'
              }`}
            >
              <Upload className="w-3 h-3" />
              Archivo
            </button>
            <button
              onClick={() => setAddMode('link')}
              className={`flex items-center gap-1 px-2 py-1 rounded text-[9px] font-medium transition-colors ${
                addMode === 'link' ? 'bg-[#3B82F6]/20 text-[#3B82F6]' : 'text-[#888] hover:text-[#ccc]'
              }`}
            >
              <Link className="w-3 h-3" />
              Link
            </button>
            <button
              onClick={() => setAddMode('text')}
              className={`flex items-center gap-1 px-2 py-1 rounded text-[9px] font-medium transition-colors ${
                addMode === 'text' ? 'bg-[#3B82F6]/20 text-[#3B82F6]' : 'text-[#888] hover:text-[#ccc]'
              }`}
            >
              <FileText className="w-3 h-3" />
              Texto
            </button>
          </div>

          {/* File upload */}
          {addMode === 'file' && (
            <div>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                className="hidden"
                onChange={(e) => { handleFileUpload(e.target.files); e.target.value = ''; }}
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="w-full py-3 border border-dashed border-[#444] rounded-lg text-[10px] text-[#888] hover:border-[#3B82F6]/50 hover:text-[#ccc] transition-colors flex flex-col items-center gap-1"
              >
                <Upload className="w-4 h-4" />
                {uploading ? 'Subiendo...' : 'Seleccionar archivos'}
              </button>
            </div>
          )}

          {/* Link input */}
          {addMode === 'link' && (
            <div className="flex gap-1.5">
              <input
                value={linkValue}
                onChange={(e) => setLinkValue(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleAddLink(); }}
                placeholder="https://..."
                autoFocus
                className="flex-1 bg-brain-card border border-[#333] rounded-md px-2 py-1.5 text-[10px] text-[#ccc] placeholder-[#555] focus:outline-none focus:border-[#3B82F6]/50"
              />
              <button
                onClick={handleAddLink}
                className="px-2.5 py-1.5 rounded-md bg-[#3B82F6] text-white text-[9px] font-medium hover:bg-[#2563EB] transition-colors"
              >
                Agregar
              </button>
            </div>
          )}

          {/* Text input */}
          {addMode === 'text' && (
            <div className="space-y-1.5">
              <textarea
                value={textValue}
                onChange={(e) => setTextValue(e.target.value)}
                placeholder="Pega o escribe texto..."
                autoFocus
                rows={3}
                className="w-full bg-brain-card border border-[#333] rounded-md px-2 py-1.5 text-[10px] text-[#ccc] placeholder-[#555] focus:outline-none focus:border-[#3B82F6]/50 resize-none"
              />
              <button
                onClick={handleAddText}
                className="w-full py-1.5 rounded-md bg-[#3B82F6] text-white text-[9px] font-medium hover:bg-[#2563EB] transition-colors"
              >
                Agregar bloque
              </button>
            </div>
          )}
        </div>
      )}

      {/* Sources list */}
      <div className="px-3 space-y-0.5">
        {sources.map((f, i) => (
          <div key={`${f.name}-${i}`} className="group flex items-center gap-2 px-1 py-1.5 text-[10px] text-[#888] hover:text-[#ccc] rounded hover:bg-brain-card/50 transition-colors">
            <span className="flex-shrink-0">{f.icon}</span>
            <span className="flex-1 min-w-0 truncate">{f.name}</span>
            {i >= defaultFuentes.length && (
              <button
                onClick={() => removeSource(i)}
                className="opacity-0 group-hover:opacity-100 w-4 h-4 flex items-center justify-center rounded text-[#555] hover:text-[#EF4444] transition-all"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="py-2">
      <p className="px-4 py-1.5 text-[9px] font-semibold text-[#555] uppercase tracking-widest">{title}</p>
      {children}
    </div>
  );
}
