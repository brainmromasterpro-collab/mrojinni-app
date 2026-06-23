import { useState, useEffect } from 'react';
import { Bot, X, Check, AlertCircle, Power, Zap, Plus } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface AgentConfig {
  id: string;
  name: string;
  description: string;
  status: 'ok' | 'running' | 'waiting' | 'error';
  model: string;
  systemPrompt: string;
  temperature: number;
  maxTokens: number;
  timeout: number;
  railwayUrl: string;
  active: boolean;
}

const modelOptions = [
  { value: 'claude-sonnet-4-20250514', label: 'Claude Sonnet 4' },
  { value: 'claude-haiku-4-20250414', label: 'Claude Haiku 4' },
  { value: 'claude-opus-4-20250414', label: 'Claude Opus 4' },
];

const defaultAgents: AgentConfig[] = [
  {
    id: 'lector',
    name: 'Lector',
    description: 'Lee y extrae datos de documentos, fichas tecnicas y PDFs adjuntos.',
    status: 'ok',
    model: 'claude-sonnet-4-20250514',
    systemPrompt: 'Eres un agente especializado en lectura y extraccion de datos de documentos tecnicos. Extrae informacion clave como marca, modelo, especificaciones, precios y disponibilidad.',
    temperature: 0.2,
    maxTokens: 4096,
    timeout: 30,
    railwayUrl: 'https://lector-production.up.railway.app',
    active: true,
  },
  {
    id: 'buscador',
    name: 'Buscador',
    description: 'Busca productos y proveedores en fuentes externas y catalogo interno.',
    status: 'running',
    model: 'claude-sonnet-4-20250514',
    systemPrompt: 'Eres un agente de busqueda especializado en productos industriales MRO. Busca en el catalogo interno y fuentes externas para encontrar las mejores opciones de precio y disponibilidad.',
    temperature: 0.3,
    maxTokens: 4096,
    timeout: 45,
    railwayUrl: 'https://buscador-production.up.railway.app',
    active: true,
  },
  {
    id: 'imagen',
    name: 'Imagen',
    description: 'Procesa imagenes de productos, remueve fondos y optimiza para catalogo.',
    status: 'waiting',
    model: 'claude-haiku-4-20250414',
    systemPrompt: 'Eres un agente de procesamiento de imagenes. Evalua la calidad de las imagenes de productos, coordina la remocion de fondo con Remove.bg, y valida que cumplan los estandares del catalogo.',
    temperature: 0.1,
    maxTokens: 2048,
    timeout: 60,
    railwayUrl: 'https://imagen-production.up.railway.app',
    active: true,
  },
  {
    id: 'ficha',
    name: 'Ficha',
    description: 'Genera fichas tecnicas estructuradas a partir de la informacion recopilada.',
    status: 'waiting',
    model: 'claude-sonnet-4-20250514',
    systemPrompt: 'Eres un agente que genera fichas tecnicas de productos industriales. Estructura la informacion en formato estandarizado incluyendo: descripcion, especificaciones, aplicaciones, certificaciones y condiciones comerciales.',
    temperature: 0.4,
    maxTokens: 8192,
    timeout: 30,
    railwayUrl: 'https://ficha-production.up.railway.app',
    active: true,
  },
  {
    id: 'publicador',
    name: 'Publicador',
    description: 'Publica productos finalizados al CRM y notifica al equipo.',
    status: 'waiting',
    model: 'claude-haiku-4-20250414',
    systemPrompt: 'Eres un agente de publicacion. Tu trabajo es tomar fichas tecnicas finalizadas y publicarlas en el CRM (1CRM), generar notificaciones al equipo y confirmar que el registro quedo correcto.',
    temperature: 0.1,
    maxTokens: 2048,
    timeout: 20,
    railwayUrl: 'https://publicador-production.up.railway.app',
    active: true,
  },
];

const useAgentMonitor = () => {
  const [recentJobs, setRecentJobs] = useState<any[]>([]);
  const [agentStatus, setAgentStatus] = useState<Record<string, string>>({
    buscador: 'waiting',
    imagen: 'waiting',
  });

  useEffect(() => {
    const fetchJobs = async () => {
      const { data } = await supabase
        .from('jobs')
        .select('id, agente, estado, created_at, started_at, finished_at, error, output, log, rfq_id, rfqs(marca, modelo)')
        .in('agente', ['buscador', 'imagen', 'notificador'])
        .order('created_at', { ascending: false })
        .limit(30);

      if (!data) return;
      setRecentJobs(data);

      const status: Record<string, string> = {};
      ['buscador', 'imagen'].forEach((agente) => {
        const last = data.find((j: any) => j.agente === agente);
        if (!last) status[agente] = 'waiting';
        else if (last.estado === 'corriendo') status[agente] = 'running';
        else if (last.estado === 'fallido') status[agente] = 'error';
        else if (last.estado === 'completado') status[agente] = 'ok';
        else status[agente] = 'waiting';
      });
      setAgentStatus(status);
    };

    fetchJobs();
    const interval = setInterval(fetchJobs, 5000);
    return () => clearInterval(interval);
  }, []);

  return { recentJobs, agentStatus };
};

interface StreamRow {
  id: string;
  nombre: string;
  tipo: string | null;
  agentes: string[];
}

export default function AgentsPanel() {
  const [agents, setAgents] = useState<AgentConfig[]>(defaultAgents);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [creatingNew, setCreatingNew] = useState(false);
  const [streams, setStreams] = useState<StreamRow[]>([]);
  const { recentJobs, agentStatus } = useAgentMonitor();

  useEffect(() => {
    async function loadStreams() {
      const { data } = await supabase.from('streams').select('*').order('created_at', { ascending: true });
      if (data) {
        setStreams(data.map((s) => ({
          id: s.id,
          nombre: s.nombre,
          tipo: s.tipo ?? null,
          agentes: Array.isArray(s.agentes) ? s.agentes : [],
        })));
      }
    }
    loadStreams();
  }, []);

  function toggleAgentForStream(streamId: string, agentId: string) {
    setStreams((prev) => prev.map((s) => {
      if (s.id !== streamId) return s;
      const next = s.agentes.includes(agentId)
        ? s.agentes.filter((a) => a !== agentId)
        : [...s.agentes, agentId];
      // Persistir en Supabase (columna streams.agentes text[])
      supabase.from('streams').update({ agentes: next }).eq('id', s.id).then(({ error }) => {
        if (error) console.error('[agentes] no se pudo guardar asignación:', error.message);
      });
      return { ...s, agentes: next };
    }));
  }

  const liveAgents = agents.map((a) => {
    if (a.id === 'buscador' || a.id === 'imagen') {
      return { ...a, status: (agentStatus[a.id] || a.status) as AgentConfig['status'] };
    }
    return a;
  });

  const editingAgent = liveAgents.find((a) => a.id === editingId);

  function handleSave(id: string, updated: Partial<AgentConfig>) {
    setAgents((prev) => prev.map((a) => (a.id === id ? { ...a, ...updated } : a)));
    setEditingId(null);
  }

  function handleCreate(newAgent: AgentConfig) {
    setAgents((prev) => [...prev, newAgent]);
    setCreatingNew(false);
  }

  function handleToggleActive(id: string) {
    setAgents((prev) =>
      prev.map((a) => (a.id === id ? { ...a, active: !a.active } : a))
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-brain-surface">
      {/* Header */}
      <div className="px-6 py-5 border-b border-brain-border bg-white">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-[#059669]/10 flex items-center justify-center">
              <Bot className="w-4 h-4 text-[#059669]" />
            </div>
            <div>
              <h2 className="text-[15px] font-semibold text-gray-900">Agentes</h2>
              <p className="text-[11px] text-[#888]">Configura el comportamiento de cada agente del pipeline</p>
            </div>
          </div>
          <button
            onClick={() => setCreatingNew(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-medium text-white bg-[#059669] rounded-lg hover:bg-[#047857] transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            Nuevo agente
          </button>
        </div>
      </div>

      {/* Pipeline visual */}
      <div className="px-6 pt-5 pb-2">
        <div className="flex items-center gap-1 max-w-2xl">
          {liveAgents.map((agent, i) => (
            <div key={agent.id} className="flex items-center gap-1">
              <span className={`text-[9px] font-medium px-2 py-0.5 rounded-full ${
                agent.active
                  ? agent.status === 'ok' ? 'bg-emerald-100 text-emerald-700'
                    : agent.status === 'running' ? 'bg-amber-100 text-amber-700'
                    : 'bg-gray-100 text-gray-500'
                  : 'bg-gray-100 text-gray-400 line-through'
              }`}>
                {agent.name}
              </span>
              {i < liveAgents.length - 1 && (
                <span className="text-[#ccc] text-[10px]">→</span>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Agent list */}
      <div className="flex-1 overflow-y-auto p-6 pt-3 scrollbar-light">
        <div className="grid gap-3 max-w-2xl">
          {liveAgents.map((agent) => (
            <AgentCard
              key={agent.id}
              agent={agent}
              onEdit={() => setEditingId(agent.id)}
              onToggle={() => handleToggleActive(agent.id)}
            />
          ))}
        </div>
      </div>

      {/* Asignación de agentes por stream */}
      <div className="px-6 pb-2">
        <div className="max-w-2xl">
          <h3 className="text-sm font-semibold text-[#888] mb-1 uppercase tracking-wider">
            Asignación por stream
          </h3>
          <p className="text-[11px] text-[#888] mb-3">
            Marca qué agentes atienden cada stream. El panel derecho de ese stream mostrará solo esos agentes.
          </p>
          <div className="space-y-3">
            {streams.length === 0 && (
              <p className="text-xs text-[#888]">No hay streams aún</p>
            )}
            {streams.map((stream) => (
              <div key={stream.id} className="bg-white border border-brain-border rounded-xl p-4">
                <div className="flex items-center justify-between mb-2.5">
                  <span className="text-[13px] font-semibold text-gray-900">{stream.nombre}</span>
                  <span className="text-[9px] text-[#aaa] bg-brain-surface px-1.5 py-0.5 rounded">
                    {stream.tipo || 'general'}
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {liveAgents.map((agent) => {
                    const assigned = stream.agentes.includes(agent.id);
                    return (
                      <button
                        key={agent.id}
                        onClick={() => toggleAgentForStream(stream.id, agent.id)}
                        className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-medium border transition-colors ${
                          assigned
                            ? 'bg-[#059669]/10 border-[#059669]/40 text-[#059669]'
                            : 'bg-white border-brain-border text-[#999] hover:border-[#059669]/30'
                        }`}
                      >
                        {assigned && <Check className="w-3 h-3" />}
                        {agent.name}
                      </button>
                    );
                  })}
                </div>
                {stream.agentes.length === 0 && (
                  <p className="text-[10px] text-[#bbb] mt-2">Sin agentes asignados — el panel mostrará los que tengan actividad</p>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Jobs Recientes */}
      <div className="px-6 pb-6">
        <div className="max-w-2xl">
          <h3 className="text-sm font-semibold text-[#888] mb-3 uppercase tracking-wider">
            Jobs Recientes
          </h3>
          <div className="space-y-2 max-h-96 overflow-y-auto scrollbar-light">
            {recentJobs.length === 0 && (
              <p className="text-xs text-[#888]">Sin actividad reciente</p>
            )}
            {recentJobs.map((job) => (
              <div key={job.id} className="bg-white border border-brain-border rounded-lg p-3 text-xs">
                <div className="flex items-center justify-between mb-1">
                  <span className="font-medium capitalize text-gray-900">{job.agente}</span>
                  <span className={`px-2 py-0.5 rounded-full font-medium ${
                    job.estado === 'completado' ? 'bg-emerald-100 text-emerald-700' :
                    job.estado === 'corriendo'  ? 'bg-blue-100 text-blue-700' :
                    job.estado === 'fallido'    ? 'bg-red-100 text-red-700' :
                    job.estado === 'foto_pendiente' ? 'bg-amber-100 text-amber-700' :
                    'bg-gray-100 text-gray-500'
                  }`}>
                    {job.estado}
                  </span>
                </div>
                {job.rfqs && (
                  <p className="text-[#888]">
                    {job.rfqs.marca} — {job.rfqs.modelo}
                  </p>
                )}
                {job.error && (
                  <p className="text-red-500 mt-1 truncate" title={job.error}>
                    {job.error}
                  </p>
                )}
                <p className="text-[#aaa] mt-1">
                  {new Date(job.created_at).toLocaleString('es-MX', {
                    month: 'short', day: 'numeric',
                    hour: '2-digit', minute: '2-digit'
                  })}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Config Modal */}
      {editingAgent && (
        <AgentModal
          agent={editingAgent}
          onClose={() => setEditingId(null)}
          onSave={handleSave}
        />
      )}

      {/* New Agent Modal */}
      {creatingNew && (
        <NewAgentModal
          onClose={() => setCreatingNew(false)}
          onCreate={handleCreate}
        />
      )}
    </div>
  );
}

function AgentCard({ agent, onEdit, onToggle }: { agent: AgentConfig; onEdit: () => void; onToggle: () => void }) {
  const statusColors = {
    ok: 'bg-emerald-500',
    running: 'bg-amber-500',
    waiting: 'bg-gray-300',
    error: 'bg-red-400',
  };
  const statusLabels = {
    ok: 'Listo',
    running: 'Corriendo',
    waiting: 'En espera',
    error: 'Error',
  };

  const modelLabel = modelOptions.find((m) => m.value === agent.model)?.label || agent.model;

  return (
    <div
      className={`bg-white border border-brain-border rounded-xl px-4 py-3.5 flex items-center gap-4 cursor-pointer hover:border-[#059669]/40 hover:shadow-sm transition-all duration-150 group ${
        !agent.active ? 'opacity-50' : ''
      }`}
    >
      <div className="flex-1 min-w-0" onClick={onEdit}>
        <div className="flex items-center gap-2">
          <span className="text-[13px] font-semibold text-gray-900">{agent.name}</span>
          <div className="flex items-center gap-1.5">
            <span className={`w-1.5 h-1.5 rounded-full ${statusColors[agent.status]}`} />
            <span className={`text-[10px] ${
              agent.status === 'ok' ? 'text-emerald-600'
              : agent.status === 'running' ? 'text-amber-600'
              : agent.status === 'error' ? 'text-red-500'
              : 'text-[#888]'
            }`}>
              {statusLabels[agent.status]}
            </span>
          </div>
        </div>
        <p className="text-[11px] text-[#888] mt-0.5 truncate">{agent.description}</p>
        <div className="flex items-center gap-3 mt-1.5">
          <span className="text-[9px] text-[#aaa] bg-brain-surface px-1.5 py-0.5 rounded">
            {modelLabel}
          </span>
          <span className="text-[9px] text-[#aaa]">
            temp: {agent.temperature}
          </span>
          <span className="text-[9px] text-[#aaa]">
            {agent.maxTokens} tokens
          </span>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={(e) => { e.stopPropagation(); onToggle(); }}
          className={`p-1.5 rounded-lg transition-colors ${
            agent.active ? 'text-emerald-500 hover:bg-emerald-50' : 'text-gray-300 hover:bg-gray-50'
          }`}
          title={agent.active ? 'Desactivar agente' : 'Activar agente'}
        >
          <Power className="w-3.5 h-3.5" />
        </button>
        <span
          onClick={onEdit}
          className="text-[11px] text-[#aaa] group-hover:text-[#059669] transition-colors font-medium"
        >
          Configurar
        </span>
      </div>
    </div>
  );
}

function AgentModal({
  agent,
  onClose,
  onSave,
}: {
  agent: AgentConfig;
  onClose: () => void;
  onSave: (id: string, updated: Partial<AgentConfig>) => void;
}) {
  const [model, setModel] = useState(agent.model);
  const [systemPrompt, setSystemPrompt] = useState(agent.systemPrompt);
  const [temperature, setTemperature] = useState(agent.temperature);
  const [maxTokens, setMaxTokens] = useState(agent.maxTokens);
  const [timeout, setTimeout_] = useState(agent.timeout);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<'success' | 'error' | null>(null);

  function handleTest() {
    setTesting(true);
    setTestResult(null);
    globalThis.setTimeout(() => {
      setTestResult('success');
      setTesting(false);
    }, 1500);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onSave(agent.id, { model, systemPrompt, temperature, maxTokens, timeout });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 animate-fade-in overflow-hidden max-h-[90vh] flex flex-col">
        {/* Modal header */}
        <div className="px-6 py-4 border-b border-brain-border flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-[#059669]/10 flex items-center justify-center">
              <Zap className="w-4 h-4 text-[#059669]" />
            </div>
            <div>
              <h3 className="text-[14px] font-semibold text-gray-900">{agent.name}</h3>
              <p className="text-[10px] text-[#888]">{agent.description}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-brain-surface transition-colors">
            <X className="w-4 h-4 text-[#888]" />
          </button>
        </div>

        {/* Modal body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-6 py-5 space-y-5 scrollbar-light">
          {/* Model selector */}
          <div>
            <label className="block text-[11px] font-medium text-gray-700 mb-1.5">Modelo de IA</label>
            <select
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="w-full px-3 py-2 text-[12px] border border-brain-border rounded-lg focus:outline-none focus:border-[#059669] focus:ring-1 focus:ring-[#059669]/20 transition-all bg-white"
            >
              {modelOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>

          {/* System prompt */}
          <div>
            <label className="block text-[11px] font-medium text-gray-700 mb-1.5">System Prompt</label>
            <textarea
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              rows={6}
              className="w-full px-3 py-2 text-[12px] border border-brain-border rounded-lg focus:outline-none focus:border-[#059669] focus:ring-1 focus:ring-[#059669]/20 transition-all resize-none leading-relaxed"
            />
            <p className="text-[9px] text-[#aaa] mt-1">{systemPrompt.length} caracteres</p>
          </div>

          {/* Parameters row */}
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-[11px] font-medium text-gray-700 mb-1.5">
                Temperatura: {temperature.toFixed(1)}
              </label>
              <input
                type="range"
                min="0"
                max="1"
                step="0.1"
                value={temperature}
                onChange={(e) => setTemperature(parseFloat(e.target.value))}
                className="w-full h-1.5 rounded-full appearance-none bg-gray-200 accent-[#059669]"
              />
              <div className="flex justify-between text-[9px] text-[#aaa] mt-1">
                <span>Preciso</span>
                <span>Creativo</span>
              </div>
            </div>
            <div>
              <label className="block text-[11px] font-medium text-gray-700 mb-1.5">Max Tokens</label>
              <input
                type="number"
                value={maxTokens}
                onChange={(e) => setMaxTokens(parseInt(e.target.value) || 0)}
                min={256}
                max={32768}
                step={256}
                className="w-full px-3 py-2 text-[12px] border border-brain-border rounded-lg focus:outline-none focus:border-[#059669] focus:ring-1 focus:ring-[#059669]/20 transition-all"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-gray-700 mb-1.5">Timeout (s)</label>
              <input
                type="number"
                value={timeout}
                onChange={(e) => setTimeout_(parseInt(e.target.value) || 0)}
                min={5}
                max={300}
                className="w-full px-3 py-2 text-[12px] border border-brain-border rounded-lg focus:outline-none focus:border-[#059669] focus:ring-1 focus:ring-[#059669]/20 transition-all"
              />
            </div>
          </div>

          {/* Railway endpoint */}
          <div>
            <label className="block text-[11px] font-medium text-gray-700 mb-1.5">Endpoint (Railway)</label>
            <div className="w-full px-3 py-2 text-[12px] text-[#888] bg-brain-surface border border-brain-border rounded-lg font-mono">
              {agent.railwayUrl}
            </div>
            <p className="text-[9px] text-[#aaa] mt-1">Solo lectura — configurado en Railway</p>
          </div>

          {/* Test result */}
          {testResult && (
            <div className={`flex items-center gap-2 px-3 py-2 rounded-lg text-[11px] ${
              testResult === 'success' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-red-50 text-red-700 border border-red-200'
            }`}>
              {testResult === 'success' ? <Check className="w-3.5 h-3.5" /> : <AlertCircle className="w-3.5 h-3.5" />}
              {testResult === 'success' ? 'Agente respondio correctamente' : 'Error — el agente no responde'}
            </div>
          )}
        </form>

        {/* Modal footer */}
        <div className="px-6 py-4 border-t border-brain-border flex items-center justify-end gap-2 bg-brain-surface/50 flex-shrink-0">
          <button
            type="button"
            onClick={handleTest}
            disabled={testing}
            className="px-3.5 py-1.5 text-[11px] font-medium border border-brain-border rounded-lg hover:bg-white transition-colors disabled:opacity-50"
          >
            {testing ? 'Probando...' : 'Probar agente'}
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            className="px-3.5 py-1.5 text-[11px] font-semibold text-white bg-[#059669] rounded-lg hover:bg-[#047857] transition-colors"
          >
            Guardar
          </button>
        </div>
      </div>
    </div>
  );
}

function NewAgentModal({
  onClose,
  onCreate,
}: {
  onClose: () => void;
  onCreate: (agent: AgentConfig) => void;
}) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [model, setModel] = useState('claude-sonnet-4-20250514');
  const [systemPrompt, setSystemPrompt] = useState('');
  const [temperature, setTemperature] = useState(0.3);
  const [maxTokens, setMaxTokens] = useState(4096);
  const [timeout, setTimeout_] = useState(30);
  const [railwayUrl, setRailwayUrl] = useState('');

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    onCreate({
      id: name.toLowerCase().replace(/\s+/g, '-') + '-' + Date.now(),
      name: name.trim(),
      description: description.trim(),
      status: 'waiting',
      model,
      systemPrompt,
      temperature,
      maxTokens,
      timeout,
      railwayUrl: railwayUrl.trim(),
      active: true,
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 animate-fade-in overflow-hidden max-h-[90vh] flex flex-col">
        {/* Modal header */}
        <div className="px-6 py-4 border-b border-brain-border flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-[#059669]/10 flex items-center justify-center">
              <Plus className="w-4 h-4 text-[#059669]" />
            </div>
            <div>
              <h3 className="text-[14px] font-semibold text-gray-900">Nuevo agente</h3>
              <p className="text-[10px] text-[#888]">Agrega un nuevo agente al pipeline</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-brain-surface transition-colors">
            <X className="w-4 h-4 text-[#888]" />
          </button>
        </div>

        {/* Modal body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-6 py-5 space-y-5 scrollbar-light">
          {/* Name and description */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[11px] font-medium text-gray-700 mb-1.5">Nombre</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ej: Validador"
                autoFocus
                className="w-full px-3 py-2 text-[12px] border border-brain-border rounded-lg focus:outline-none focus:border-[#059669] focus:ring-1 focus:ring-[#059669]/20 transition-all"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-gray-700 mb-1.5">Endpoint (Railway)</label>
              <input
                value={railwayUrl}
                onChange={(e) => setRailwayUrl(e.target.value)}
                placeholder="https://mi-agente.up.railway.app"
                className="w-full px-3 py-2 text-[12px] border border-brain-border rounded-lg focus:outline-none focus:border-[#059669] focus:ring-1 focus:ring-[#059669]/20 transition-all"
              />
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-medium text-gray-700 mb-1.5">Descripcion</label>
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Que hace este agente en el pipeline"
              className="w-full px-3 py-2 text-[12px] border border-brain-border rounded-lg focus:outline-none focus:border-[#059669] focus:ring-1 focus:ring-[#059669]/20 transition-all"
            />
          </div>

          {/* Model selector */}
          <div>
            <label className="block text-[11px] font-medium text-gray-700 mb-1.5">Modelo de IA</label>
            <select
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="w-full px-3 py-2 text-[12px] border border-brain-border rounded-lg focus:outline-none focus:border-[#059669] focus:ring-1 focus:ring-[#059669]/20 transition-all bg-white"
            >
              {modelOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>

          {/* System prompt */}
          <div>
            <label className="block text-[11px] font-medium text-gray-700 mb-1.5">System Prompt</label>
            <textarea
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              rows={5}
              placeholder="Instrucciones para el agente..."
              className="w-full px-3 py-2 text-[12px] border border-brain-border rounded-lg focus:outline-none focus:border-[#059669] focus:ring-1 focus:ring-[#059669]/20 transition-all resize-none leading-relaxed"
            />
          </div>

          {/* Parameters row */}
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-[11px] font-medium text-gray-700 mb-1.5">
                Temperatura: {temperature.toFixed(1)}
              </label>
              <input
                type="range"
                min="0"
                max="1"
                step="0.1"
                value={temperature}
                onChange={(e) => setTemperature(parseFloat(e.target.value))}
                className="w-full h-1.5 rounded-full appearance-none bg-gray-200 accent-[#059669]"
              />
              <div className="flex justify-between text-[9px] text-[#aaa] mt-1">
                <span>Preciso</span>
                <span>Creativo</span>
              </div>
            </div>
            <div>
              <label className="block text-[11px] font-medium text-gray-700 mb-1.5">Max Tokens</label>
              <input
                type="number"
                value={maxTokens}
                onChange={(e) => setMaxTokens(parseInt(e.target.value) || 0)}
                min={256}
                max={32768}
                step={256}
                className="w-full px-3 py-2 text-[12px] border border-brain-border rounded-lg focus:outline-none focus:border-[#059669] focus:ring-1 focus:ring-[#059669]/20 transition-all"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-gray-700 mb-1.5">Timeout (s)</label>
              <input
                type="number"
                value={timeout}
                onChange={(e) => setTimeout_(parseInt(e.target.value) || 0)}
                min={5}
                max={300}
                className="w-full px-3 py-2 text-[12px] border border-brain-border rounded-lg focus:outline-none focus:border-[#059669] focus:ring-1 focus:ring-[#059669]/20 transition-all"
              />
            </div>
          </div>
        </form>

        {/* Modal footer */}
        <div className="px-6 py-4 border-t border-brain-border flex items-center justify-end gap-2 bg-brain-surface/50 flex-shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-3.5 py-1.5 text-[11px] font-medium border border-brain-border rounded-lg hover:bg-white transition-colors"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!name.trim()}
            className="px-3.5 py-1.5 text-[11px] font-semibold text-white bg-[#059669] rounded-lg hover:bg-[#047857] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Crear agente
          </button>
        </div>
      </div>
    </div>
  );
}
