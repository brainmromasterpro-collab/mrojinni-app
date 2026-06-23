import { useState, useEffect } from 'react';
import { TrendingUp, Zap, DollarSign, Package, Clock, Users, Search, Image as ImageIcon } from 'lucide-react';
import { supabase } from '../lib/supabase';

function DonutChart({ value, max, color, label }: { value: number; max: number; color: string; label: string }) {
  const pct = max > 0 ? Math.min(value / max, 1) : 0;
  const r = 28;
  const circ = 2 * Math.PI * r;
  const dash = pct * circ;

  return (
    <div className="flex flex-col items-center gap-1">
      <svg width="68" height="68" viewBox="0 0 68 68">
        <circle cx="34" cy="34" r={r} fill="none" stroke="#2a2a2a" strokeWidth="5" />
        <circle
          cx="34" cy="34" r={r}
          fill="none"
          stroke={color}
          strokeWidth="5"
          strokeDasharray={`${dash} ${circ}`}
          strokeLinecap="round"
          transform="rotate(-90 34 34)"
        />
        <text x="34" y="36" textAnchor="middle" fill="white" fontSize="11" fontWeight="600">
          {Math.round(pct * 100)}%
        </text>
      </svg>
      <span className="text-[9px] text-[#888]">{label}</span>
    </div>
  );
}

interface ResourceRow {
  servicio: string;
  metrica: string;
  valor: number | null;
  valor_texto: string | null;
  limite: number | null;
  estado: string | null;
  actualizado_en?: string | null;
}

interface Notification {
  titulo: string;
  tipo: string;
  created_at: string;
}

interface LogEntry {
  agente: string;
  estado: string;
  created_at: string;
  finished_at: string | null;
  error: string | null;
}

interface Falla {
  servicio: string;
  metrica: string;
  estado: string;
  mensaje: string;
  actualizado_en: string | null;
}

const SERVICIO_LABEL: Record<string, string> = {
  serpapi: 'SerpAPI',
  removebg: 'Remove.bg',
  anthropic: 'Anthropic (Claude)',
  google_cse: 'Google CSE',
  supabase: 'Supabase',
  railway: 'Railway',
  github: 'GitHub',
  '1crm': '1CRM',
};

const AGENTE_LABEL: Record<string, string> = {
  lector: 'Lector',
  buscador: 'Buscador',
  imagen: 'Imagen',
  ficha: 'Ficha',
  publicador: 'Publicador',
  chat: 'Chat',
  notificador: 'Notificador',
  monitor: 'Monitor',
};

function formatError(err: unknown): string | null {
  if (err == null) return null;
  if (typeof err === 'string') return err;
  if (typeof err === 'object') {
    const o = err as Record<string, unknown>;
    if (typeof o.message === 'string') return o.message;
    try { return JSON.stringify(err); } catch { return String(err); }
  }
  return String(err);
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Ahora';
  if (mins < 60) return `Hace ${mins} min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `Hace ${hrs} hrs`;
  return `Hace ${Math.floor(hrs / 24)} dias`;
}

export default function DashboardPanel() {
  const [resources, setResources] = useState<ResourceRow[]>([]);
  const [rfqsActivos, setRfqsActivos] = useState<number | null>(null);
  const [rfqsUrgentes, setRfqsUrgentes] = useState<number | null>(null);
  const [rfqsMes, setRfqsMes] = useState<number | null>(null);
  const [rfqsSemana, setRfqsSemana] = useState<number | null>(null);
  const [rfqsTotal, setRfqsTotal] = useState<number | null>(null);
  const [rfqsPublicados, setRfqsPublicados] = useState<number | null>(null);
  const [globalLog, setGlobalLog] = useState<LogEntry[]>([]);
  const [logFilter, setLogFilter] = useState<string>('todos');
  const [completadosHoy, setCompletadosHoy] = useState<number | null>(null);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [mxnRate, setMxnRate] = useState<string | null>(null);

  useEffect(() => {
    fetchAll();
    const interval = setInterval(fetchAll, 30000);
    return () => clearInterval(interval);
  }, []);

  async function fetchAll() {
    await Promise.all([
      fetchResources(),
      fetchRfqs(),
      fetchJobs(),
      fetchNotifications(),
      fetchExchangeRate(),
      fetchGlobalLog(),
    ]);
  }

  async function fetchResources() {
    const { data } = await supabase.from('resource_status').select('servicio, metrica, valor, valor_texto, limite, estado, actualizado_en');
    if (data) setResources(data);
  }

  async function fetchRfqs() {
    const { count: activos } = await supabase
      .from('rfqs')
      .select('id', { count: 'exact', head: true })
      .neq('estado', 'publicado');
    setRfqsActivos(activos ?? 0);

    const { count: urgentes } = await supabase
      .from('rfqs')
      .select('id', { count: 'exact', head: true })
      .eq('urgente', true)
      .neq('estado', 'publicado');
    setRfqsUrgentes(urgentes ?? 0);

    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);
    const { count: mes } = await supabase
      .from('rfqs')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', startOfMonth.toISOString());
    setRfqsMes(mes ?? 0);

    const startOfWeek = new Date();
    startOfWeek.setDate(startOfWeek.getDate() - 7);
    const { count: semana } = await supabase
      .from('rfqs')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', startOfWeek.toISOString());
    setRfqsSemana(semana ?? 0);

    const { count: total } = await supabase
      .from('rfqs')
      .select('id', { count: 'exact', head: true });
    setRfqsTotal(total ?? 0);

    // Productos publicados POR NOSOTROS (no el total del catálogo 1CRM)
    const { count: publicados } = await supabase
      .from('rfqs')
      .select('id', { count: 'exact', head: true })
      .eq('estado', 'publicado');
    setRfqsPublicados(publicados ?? 0);
  }

  async function fetchGlobalLog() {
    const { data } = await supabase
      .from('jobs')
      .select('agente, estado, created_at, finished_at, error')
      .order('created_at', { ascending: false })
      .limit(120);
    if (data) {
      setGlobalLog(data.map((j: { agente: string; estado: string; created_at: string; finished_at: string | null; error: unknown }) => ({
        agente: j.agente,
        estado: j.estado,
        created_at: j.created_at,
        finished_at: j.finished_at,
        error: formatError(j.error),
      })));
    }
  }

  async function fetchJobs() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayIso = today.toISOString();

    const { count } = await supabase
      .from('jobs')
      .select('id', { count: 'exact', head: true })
      .eq('estado', 'completado')
      .gte('finished_at', todayIso);
    setCompletadosHoy(count ?? 0);
  }

  async function fetchNotifications() {
    const { data } = await supabase
      .from('notificaciones')
      .select('titulo, tipo, created_at')
      .order('created_at', { ascending: false })
      .limit(6);
    if (data) setNotifications(data);
  }

  async function fetchExchangeRate() {
    try {
      const res = await fetch('https://api.frankfurter.dev/v1/latest?from=USD&to=MXN');
      const json = await res.json();
      setMxnRate(json?.rates?.MXN ? `$${Number(json.rates.MXN).toFixed(2)}` : '--');
    } catch {
      setMxnRate('--');
    }
  }

  function getResource(servicio: string, metrica: string): ResourceRow | undefined {
    return resources.find(r => r.servicio === servicio && r.metrica === metrica);
  }

  const tokensHoy = getResource('anthropic', 'tokens_hoy');
  const storageGb = getResource('supabase', 'storage_gb');
  const agentesActivos = getResource('railway', 'servicios_activos');
  const serpApiRestantes = getResource('serpapi', 'busquedas_restantes');
  const serpApiUsadas = getResource('serpapi', 'busquedas_usadas_mes');
  const removeBg = getResource('removebg', 'creditos_restantes');
  const googleCse = getResource('google_cse', 'llamadas_hoy');

  const crmProductos = getResource('1crm', 'productos_total');
  const crmProveedores = getResource('1crm', 'proveedores_total');

  const tokensVal = tokensHoy?.valor != null ? Math.round(tokensHoy.valor).toLocaleString() : '--';

  // SerpAPI: usar valores reales del monitor (antes calculaba "-640" con límite mal)
  const serpRestantes = serpApiRestantes?.valor;
  const serpUsadasReal = serpApiUsadas?.valor;
  const serpPlan = serpApiRestantes?.limite ?? serpApiUsadas?.limite ?? null;
  const serpColor = serpApiRestantes?.estado === 'critical' ? '#ef4444' : serpApiRestantes?.estado === 'warning' ? '#f59e0b' : '#10b981';

  const removeBgColor = removeBg?.estado === 'critical' ? '#ef4444' : removeBg?.estado === 'warning' ? '#f59e0b' : '#06b6d4';
  const googleCseVal = googleCse?.valor ?? 0;

  const agenteLimite = agentesActivos?.limite ?? 5;
  const agenteValor = agentesActivos?.valor ?? 0;

  // Heartbeat del backend: si el último latido es < 2h, está vivo
  const heartbeat = getResource('sistema', 'backend_activo');
  const lastBeat = heartbeat?.valor_texto ? new Date(heartbeat.valor_texto).getTime() : null;
  const backendVivo = lastBeat != null && (Date.now() - lastBeat) < 2 * 3600 * 1000;

  // Fallas: cualquier recurso en estado critical/warning, o con un texto de error.
  // El monitor escribe valor_texto="Error: ..." y estado="critical" cuando un check falla.
  const fallas: Falla[] = resources
    .filter(r => r.estado === 'critical' || r.estado === 'warning')
    .map(r => {
      const esError = (r.valor_texto || '').toLowerCase().startsWith('error');
      const mensaje = esError
        ? (r.valor_texto || 'Error')
        : r.estado === 'critical'
          ? 'Cuota casi agotada'
          : 'Cuota baja';
      return {
        servicio: r.servicio,
        metrica: r.metrica,
        estado: r.estado || 'warning',
        mensaje,
        actualizado_en: r.actualizado_en ?? null,
      };
    })
    // priorizar critical primero
    .sort((a, b) => (a.estado === 'critical' ? -1 : 1) - (b.estado === 'critical' ? -1 : 1));

  // Agentes presentes en el log (para las pestañas de filtro)
  const agentesEnLog = Array.from(new Set(globalLog.map(e => e.agente))).filter(Boolean);
  const totalErrores = globalLog.filter(e => e.estado === 'fallido').length;

  const filteredLog = globalLog.filter(e => {
    if (logFilter === 'todos') return true;
    if (logFilter === 'errores') return e.estado === 'fallido';
    return e.agente === logFilter;
  });

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-[#0d0d0d] overflow-y-auto scrollbar-light">
      {/* Header */}
      <div className="px-6 py-5 border-b border-[#1f1f1f] flex items-center justify-between">
        <div>
          <h2 className="text-[15px] font-semibold text-white">Dashboard</h2>
          <p className="text-[11px] text-[#666] mt-0.5">Brain - MRO Master Pro - Vista general</p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${backendVivo ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}`} />
          <span className="text-[10px] text-[#888]">
            {backendVivo ? 'Backend activo' : 'Backend sin señal'}
            {lastBeat && <span className="text-[#555] ml-1">· {timeAgo(heartbeat!.valor_texto!)}</span>}
          </span>
        </div>
      </div>

      <div className="p-6 space-y-6">
        {/* Section: Business KPIs (primera jerarquía) */}
        <section>
          <p className="text-[9px] font-semibold text-[#555] uppercase tracking-widest mb-3">Negocio - KPIs Clave</p>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
            <StatCard
              icon={Package}
              label="RFQs activos"
              value={rfqsActivos != null ? String(rfqsActivos) : '--'}
              sub={rfqsUrgentes != null ? `${rfqsUrgentes} urgentes` : '—'}
              color="#10b981"
            />
            <StatCard
              icon={Clock}
              label="Completados hoy"
              value={completadosHoy != null ? String(completadosHoy) : '--'}
              sub="Jobs finalizados hoy"
              color="#06b6d4"
            />
            <StatCard
              icon={TrendingUp}
              label="Publicados por nosotros"
              value={rfqsPublicados != null ? String(rfqsPublicados) : '--'}
              sub={crmProductos?.valor != null ? `Catálogo 1CRM: ${Math.round(crmProductos.valor).toLocaleString()}` : 'RFQs publicados'}
              color="#f59e0b"
            />
            <StatCard
              icon={Users}
              label="Proveedores activos"
              value={crmProveedores?.valor != null ? String(Math.round(crmProveedores.valor)) : '--'}
              sub="1CRM"
              color="#ec4899"
            />
          </div>
        </section>

        {/* Section: Resource Consumption (números, no gráficas) */}
        <section>
          <p className="text-[9px] font-semibold text-[#555] uppercase tracking-widest mb-3">Consumo de Recursos</p>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
            <StatCard
              icon={Zap}
              label="Tokens Claude (hoy)"
              value={tokensVal}
              sub="Cerebro · Anthropic"
              color="#10b981"
            />
            <StatCard
              icon={ImageIcon}
              label="Remove.bg"
              value={removeBg?.valor != null ? Math.round(removeBg.valor).toLocaleString() : '--'}
              sub="créditos restantes"
              color={removeBgColor}
            />
            <StatCard
              icon={Search}
              label="SerpAPI"
              value={serpRestantes != null ? Math.round(serpRestantes).toLocaleString() : '--'}
              sub={serpUsadasReal != null && serpPlan != null ? `${Math.round(serpUsadasReal)} usadas · ${Math.round(serpPlan)}/mes` : 'búsquedas restantes'}
              color={serpColor}
            />
            <StatCard
              icon={DollarSign}
              label="Tipo de cambio"
              value={mxnRate || '--'}
              sub="USD / MXN"
              color="#06b6d4"
            />
          </div>
        </section>

        {/* Section: RFQs creados */}
        <section>
          <p className="text-[9px] font-semibold text-[#555] uppercase tracking-widest mb-3">RFQs Creados</p>
          <div className="grid grid-cols-3 gap-3">
            <RfqCountCard label="Esta semana" value={rfqsSemana} sub="Últimos 7 días" color="#10b981" />
            <RfqCountCard label="Este mes" value={rfqsMes} sub="Desde el día 1" color="#06b6d4" />
            <RfqCountCard label="Histórico" value={rfqsTotal} sub="Todos los tiempos" color="#8b5cf6" />
          </div>
        </section>

        {/* Section: Capacity */}
        <section>
          <p className="text-[9px] font-semibold text-[#555] uppercase tracking-widest mb-3">Capacidad</p>
          <div className="bg-[#141414] border border-[#1f1f1f] rounded-xl p-5 flex items-center justify-around flex-wrap gap-3">
            <DonutChart value={storageGb?.valor ?? 0} max={1} color="#f59e0b" label="Storage (1 GB)" />
            <DonutChart value={tokensHoy?.valor ?? 0} max={100000} color="#10b981" label="Tokens (100k)" />
            <DonutChart value={rfqsMes ?? 0} max={50} color="#06b6d4" label="RFQs / mes (50)" />
            <DonutChart value={serpUsadasReal ?? 0} max={serpPlan ?? 1000} color={serpColor} label={`SerpAPI (${serpPlan ? Math.round(serpPlan) : 1000}/mes)`} />
            <DonutChart value={googleCseVal} max={100} color="#f59e0b" label="Google CSE (100/dia)" />
            <DonutChart value={agenteValor} max={agenteLimite} color="#3b82f6" label={`Agentes (${agenteLimite})`} />
          </div>
        </section>

        {/* Section: Fallas */}
        <section>
          <p className="text-[9px] font-semibold text-[#555] uppercase tracking-widest mb-3">
            Fallas de Proveedores {fallas.length > 0 && <span className="text-[#ef4444]">({fallas.length})</span>}
          </p>
          <div className="bg-[#141414] border border-[#1f1f1f] rounded-xl divide-y divide-[#1f1f1f]">
            {fallas.length > 0 ? fallas.map((f, i) => (
              <div key={i} className="px-4 py-2.5 flex items-center gap-3">
                <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${f.estado === 'critical' ? 'bg-red-500' : 'bg-amber-500'}`} />
                <span className="text-[11px] font-medium flex-shrink-0 w-32" style={{ color: f.estado === 'critical' ? '#f87171' : '#fbbf24' }}>
                  {SERVICIO_LABEL[f.servicio] || f.servicio}
                </span>
                <span className="text-[11px] text-[#999] flex-1 truncate">{f.mensaje}</span>
                {f.actualizado_en && <span className="text-[9px] text-[#555] flex-shrink-0">{timeAgo(f.actualizado_en)}</span>}
              </div>
            )) : (
              <div className="px-4 py-2.5 flex items-center gap-2 text-[11px] text-[#10b981]">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                Todos los proveedores operando normalmente
              </div>
            )}
          </div>
        </section>

        {/* Section: Recent Activity */}
        <section>
          <p className="text-[9px] font-semibold text-[#555] uppercase tracking-widest mb-3">Actividad reciente</p>
          <div className="bg-[#141414] border border-[#1f1f1f] rounded-xl divide-y divide-[#1f1f1f]">
            {notifications.length > 0 ? notifications.map((item, i) => {
              const status = item.tipo === 'error' ? 'error'
                : (item.tipo === 'foto_pendiente' || item.tipo === 'imagen_fallida') ? 'warn'
                : 'ok';
              return (
                <div key={i} className="px-4 py-2.5 flex items-center gap-3">
                  <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                    status === 'ok' ? 'bg-emerald-500'
                    : status === 'warn' ? 'bg-amber-500'
                    : 'bg-red-400'
                  }`} />
                  <span className="text-[11px] text-[#ccc] flex-1">{item.titulo}</span>
                  <span className="text-[9px] text-[#555] flex-shrink-0">{timeAgo(item.created_at)}</span>
                </div>
              );
            }) : (
              <div className="px-4 py-2.5 text-[11px] text-[#555]">Sin actividad reciente</div>
            )}
          </div>
        </section>

        {/* Section: Log global */}
        <section className="pb-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-[9px] font-semibold text-[#555] uppercase tracking-widest">Log Global</p>
            <div className="flex items-center gap-1 flex-wrap">
              <LogFilterTab label="Todos" count={globalLog.length} active={logFilter === 'todos'} onClick={() => setLogFilter('todos')} />
              <LogFilterTab label="Errores" count={totalErrores} active={logFilter === 'errores'} onClick={() => setLogFilter('errores')} danger />
              {agentesEnLog.map(ag => (
                <LogFilterTab
                  key={ag}
                  label={AGENTE_LABEL[ag] || ag}
                  count={globalLog.filter(e => e.agente === ag).length}
                  active={logFilter === ag}
                  onClick={() => setLogFilter(ag)}
                />
              ))}
            </div>
          </div>
          <div className="bg-[#141414] border border-[#1f1f1f] rounded-xl divide-y divide-[#1f1f1f] max-h-80 overflow-y-auto scrollbar-light">
            {filteredLog.length > 0 ? filteredLog.map((entry, i) => {
              const dotColor = entry.estado === 'fallido' || entry.estado === 'error' ? 'bg-red-500'
                : entry.estado === 'corriendo' ? 'bg-cyan-500'
                : entry.estado === 'pendiente' ? 'bg-amber-500'
                : 'bg-emerald-500';
              return (
                <div key={i} className="px-4 py-2 flex items-center gap-3 font-mono">
                  <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${dotColor}`} />
                  <span className="text-[10px] text-[#666] flex-shrink-0 w-[70px]">{timeAgo(entry.created_at)}</span>
                  <span className="text-[10px] text-[#ccc] flex-shrink-0 w-24">{AGENTE_LABEL[entry.agente] || entry.agente}</span>
                  <span className={`text-[10px] flex-shrink-0 w-20 ${
                    entry.estado === 'fallido' ? 'text-red-400'
                    : entry.estado === 'completado' ? 'text-emerald-400'
                    : 'text-[#888]'
                  }`}>{entry.estado}</span>
                  <span className="text-[10px] text-[#777] flex-1 truncate">{entry.error || ''}</span>
                </div>
              );
            }) : (
              <div className="px-4 py-2.5 text-[11px] text-[#555]">
                {logFilter === 'errores' ? 'Sin errores en el registro reciente 🎉' : 'Sin registros'}
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

function LogFilterTab({ label, count, active, onClick, danger }: { label: string; count: number; active: boolean; onClick: () => void; danger?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={`px-2 py-0.5 rounded text-[9px] font-medium transition-colors ${
        active
          ? danger ? 'bg-red-500/20 text-red-300' : 'bg-[#2a2a2a] text-white'
          : danger && count > 0 ? 'text-red-400/70 hover:text-red-300' : 'text-[#666] hover:text-[#999]'
      }`}
    >
      {label} <span className="opacity-60">{count}</span>
    </button>
  );
}

function RfqCountCard({ label, value, sub, color }: { label: string; value: number | null; sub: string; color: string }) {
  return (
    <div className="bg-[#141414] border border-[#1f1f1f] rounded-xl p-4">
      <div className="flex items-center gap-2 mb-2">
        <Package className="w-3.5 h-3.5" style={{ color }} />
        <span className="text-[10px] text-[#888]">{label}</span>
      </div>
      <div className="text-[24px] font-bold text-white leading-none">{value != null ? value : '--'}</div>
      <p className="text-[9px] text-[#555] mt-1.5">{sub}</p>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  color,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  sub: string;
  color: string;
}) {
  return (
    <div className="bg-[#141414] border border-[#1f1f1f] rounded-xl p-4">
      <div className="flex items-center gap-2 mb-2">
        <Icon className="w-3.5 h-3.5" style={{ color }} />
        <span className="text-[10px] text-[#888]">{label}</span>
      </div>
      <div className="text-[24px] font-bold text-white leading-none" style={{ color }}>{value}</div>
      <p className="text-[9px] text-[#555] mt-1.5">{sub}</p>
    </div>
  );
}
