import { useState, useEffect } from 'react';
import { TrendingUp, Zap, HardDrive, Cpu, DollarSign, Package, Clock, Users, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { supabase } from '../lib/supabase';

function MiniChart({ data, color, height = 40 }: { data: number[]; color: string; height?: number }) {
  if (data.length < 2) return <div style={{ height }} />;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const w = 100;
  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * w;
    const y = height - ((v - min) / range) * (height - 4) - 2;
    return `${x},${y}`;
  }).join(' ');

  const areaPoints = `0,${height} ${points} ${w},${height}`;

  return (
    <svg viewBox={`0 0 ${w} ${height}`} className="w-full" style={{ height }} preserveAspectRatio="none">
      <defs>
        <linearGradient id={`grad-${color}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.3" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={areaPoints} fill={`url(#grad-${color})`} />
      <polyline points={points} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function BarChart({ data, color, height = 60 }: { data: number[]; color: string; height?: number }) {
  if (data.length === 0) return <div style={{ height }} />;
  const max = Math.max(...data) || 1;
  const barWidth = 100 / data.length;

  return (
    <svg viewBox="0 0 100 60" className="w-full" style={{ height }} preserveAspectRatio="none">
      {data.map((v, i) => {
        const barH = (v / max) * 52;
        return (
          <rect
            key={i}
            x={i * barWidth + barWidth * 0.15}
            y={60 - barH}
            width={barWidth * 0.7}
            height={barH}
            rx="1"
            fill={color}
            opacity={i === data.length - 1 ? 1 : 0.5}
          />
        );
      })}
    </svg>
  );
}

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
}

interface AgentStats {
  name: string;
  active: number;
  queue: number;
  color: string;
}

interface Notification {
  titulo: string;
  tipo: string;
  created_at: string;
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
  const [agentStats, setAgentStats] = useState<AgentStats[]>([]);
  const [completadosHoy, setCompletadosHoy] = useState<number | null>(null);
  const [totalCorriendo, setTotalCorriendo] = useState<number | null>(null);
  const [totalPendiente, setTotalPendiente] = useState<number | null>(null);
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
    ]);
  }

  async function fetchResources() {
    const { data } = await supabase.from('resource_status').select('servicio, metrica, valor, valor_texto, limite, estado');
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
  }

  async function fetchJobs() {
    const agentes = ['lector', 'buscador', 'imagen', 'ficha', 'publicador'];
    const colors = ['#10b981', '#06b6d4', '#f59e0b', '#8b5cf6', '#ec4899'];
    const names = ['Lector', 'Buscador', 'Imagen', 'Ficha', 'Publicador'];

    const { data: jobs } = await supabase
      .from('jobs')
      .select('agente, estado, finished_at');

    if (!jobs) return;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayIso = today.toISOString();

    const stats: AgentStats[] = agentes.map((ag, i) => {
      const agJobs = jobs.filter(j => j.agente === ag);
      return {
        name: names[i],
        active: agJobs.filter(j => j.estado === 'corriendo').length,
        queue: agJobs.filter(j => j.estado === 'pendiente').length,
        color: colors[i],
      };
    });
    setAgentStats(stats);

    setCompletadosHoy(jobs.filter(j => j.estado === 'completado' && j.finished_at && j.finished_at >= todayIso).length);
    setTotalCorriendo(jobs.filter(j => j.estado === 'corriendo').length);
    setTotalPendiente(jobs.filter(j => j.estado === 'pendiente').length);
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
  const storageVal = storageGb?.valor != null ? `${storageGb.valor.toFixed(1)} GB` : '--';
  const agentesVal = agentesActivos ? `${Math.round(agentesActivos.valor || 0)} / ${Math.round(agentesActivos.limite || 0)}` : '--';

  const serpLimite = serpApiUsadas?.limite || 100;
  const serpUsado = serpLimite - (serpApiRestantes?.valor ?? serpLimite);
  const serpColor = serpApiRestantes?.estado === 'critical' ? '#ef4444' : serpApiRestantes?.estado === 'warning' ? '#f59e0b' : '#10b981';

  const removeBgUsado = 50 - (removeBg?.valor ?? 50);
  const googleCseVal = googleCse?.valor ?? 0;

  const agenteLimite = agentesActivos?.limite ?? 5;
  const agenteValor = agentesActivos?.valor ?? 0;

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-[#0d0d0d] overflow-y-auto scrollbar-light">
      {/* Header */}
      <div className="px-6 py-5 border-b border-[#1f1f1f]">
        <h2 className="text-[15px] font-semibold text-white">Dashboard</h2>
        <p className="text-[11px] text-[#666] mt-0.5">Brain - MRO Master Pro - Vista general</p>
      </div>

      <div className="p-6 space-y-6">
        {/* Section: Resource Consumption */}
        <section>
          <p className="text-[9px] font-semibold text-[#555] uppercase tracking-widest mb-3">Consumo de Recursos</p>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
            <MetricCard
              icon={Zap}
              label="Tokens hoy"
              value={tokensVal}
              change=""
              trend="up"
              color="#10b981"
              chart={<MiniChart data={tokensHoy?.valor != null ? [0, tokensHoy.valor] : [0, 0]} color="#10b981" />}
            />
            <MetricCard
              icon={DollarSign}
              label="Tipo de cambio"
              value={mxnRate || '--'}
              change="USD/MXN"
              trend="down"
              color="#06b6d4"
              chart={<div className="h-[40px]" />}
            />
            <MetricCard
              icon={HardDrive}
              label="Storage usado"
              value={storageVal}
              change=""
              trend="up"
              color="#f59e0b"
              chart={<MiniChart data={storageGb?.valor != null ? [0, storageGb.valor] : [0, 0]} color="#f59e0b" />}
            />
            <MetricCard
              icon={Cpu}
              label="Agentes activos"
              value={agentesVal}
              change=""
              trend="up"
              color="#3b82f6"
              chart={
                <div className="flex items-end gap-1 h-[40px] pt-2">
                  {agentStats.length > 0 ? agentStats.map((agent, i) => (
                    <div key={agent.name} className="flex-1 flex flex-col items-center gap-0.5">
                      <div
                        className="w-full rounded-sm"
                        style={{
                          height: `${Math.max((agent.active / Math.max(agent.active + agent.queue, 1)) * 100, 10)}%`,
                          backgroundColor: agent.color,
                          opacity: 0.4 + (i * 0.12),
                        }}
                      />
                      <span className="text-[7px] text-[#555]">{agent.name[0]}</span>
                    </div>
                  )) : ['L', 'B', 'I', 'F', 'P'].map((l) => (
                    <div key={l} className="flex-1 flex flex-col items-center gap-0.5">
                      <div className="w-full rounded-sm h-[10%] bg-[#3b82f6] opacity-30" />
                      <span className="text-[7px] text-[#555]">{l}</span>
                    </div>
                  ))}
                </div>
              }
            />
          </div>
        </section>

        {/* Section: API Usage Breakdown */}
        <section>
          <p className="text-[9px] font-semibold text-[#555] uppercase tracking-widest mb-3">Uso de APIs - Ultimos 14 dias</p>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
            <div className="bg-[#141414] border border-[#1f1f1f] rounded-xl p-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-[11px] text-[#888]">Anthropic (Claude)</span>
                <span className="text-[11px] font-semibold text-[#10b981]">{tokensVal} tokens</span>
              </div>
              <BarChart data={tokensHoy?.valor != null ? [tokensHoy.valor * 0.6, tokensHoy.valor * 0.8, tokensHoy.valor] : []} color="#10b981" />
              <div className="flex justify-between mt-2 text-[9px] text-[#555]">
                <span>Hoy</span>
                <span>{tokensHoy?.estado || '--'}</span>
              </div>
            </div>
            <div className="bg-[#141414] border border-[#1f1f1f] rounded-xl p-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-[11px] text-[#888]">Remove.bg</span>
                <span className="text-[11px] font-semibold text-[#06b6d4]">{removeBg?.valor ?? '--'} restantes</span>
              </div>
              <BarChart data={removeBg?.valor != null ? [removeBgUsado * 0.5, removeBgUsado * 0.7, removeBgUsado] : []} color="#06b6d4" />
              <div className="flex justify-between mt-2 text-[9px] text-[#555]">
                <span>{removeBgUsado} usados</span>
                <span>50/mes</span>
              </div>
            </div>
            <div className="bg-[#141414] border border-[#1f1f1f] rounded-xl p-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-[11px] text-[#888]">SerpAPI</span>
                <span className="text-[11px] font-semibold" style={{ color: serpColor }}>{serpApiRestantes?.valor ?? '--'} restantes</span>
              </div>
              <BarChart data={serpUsado > 0 ? [serpUsado * 0.4, serpUsado * 0.7, serpUsado] : []} color={serpColor} />
              <div className="flex justify-between mt-2 text-[9px] text-[#555]">
                <span>{serpUsado} usadas</span>
                <span>{serpLimite}/mes</span>
              </div>
            </div>
          </div>
        </section>

        {/* Section: Capacity */}
        <section>
          <p className="text-[9px] font-semibold text-[#555] uppercase tracking-widest mb-3">Capacidad</p>
          <div className="bg-[#141414] border border-[#1f1f1f] rounded-xl p-5 flex items-center justify-around flex-wrap gap-3">
            <DonutChart value={storageGb?.valor ?? 0} max={1} color="#f59e0b" label="Storage (1 GB)" />
            <DonutChart value={tokensHoy?.valor ?? 0} max={100000} color="#10b981" label="Tokens (100k)" />
            <DonutChart value={rfqsMes ?? 0} max={50} color="#06b6d4" label="RFQs / mes (50)" />
            <DonutChart value={serpUsado} max={serpLimite} color={serpColor} label={`SerpAPI (${serpLimite}/mes)`} />
            <DonutChart value={removeBgUsado} max={50} color="#06b6d4" label="Remove.bg (50/mes)" />
            <DonutChart value={googleCseVal} max={100} color="#f59e0b" label="Google CSE (100/dia)" />
            <DonutChart value={agenteValor} max={agenteLimite} color="#3b82f6" label={`Agentes (${agenteLimite})`} />
          </div>
        </section>

        {/* Section: Business KPIs */}
        <section>
          <p className="text-[9px] font-semibold text-[#555] uppercase tracking-widest mb-3">Negocio - KPIs Clave</p>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
            <BusinessCard
              icon={Package}
              label="RFQs activos"
              value={rfqsActivos != null ? String(rfqsActivos) : '--'}
              subtitle={rfqsUrgentes != null ? `${rfqsUrgentes} urgentes` : '--'}
              color="#10b981"
              chart={<BarChart data={rfqsActivos != null ? [rfqsActivos * 0.5, rfqsActivos * 0.7, rfqsActivos] : []} color="#10b981" height={36} />}
            />
            <BusinessCard
              icon={Clock}
              label="Completados hoy"
              value={completadosHoy != null ? String(completadosHoy) : '--'}
              subtitle="Jobs finalizados hoy"
              color="#06b6d4"
              chart={<MiniChart data={completadosHoy != null ? [0, completadosHoy] : [0, 0]} color="#06b6d4" height={36} />}
            />
            <BusinessCard
              icon={TrendingUp}
              label="Productos publicados"
              value={crmProductos?.valor != null ? String(Math.round(crmProductos.valor)) : '--'}
              subtitle="Catalogo 1CRM"
              color="#f59e0b"
              chart={<MiniChart data={crmProductos?.valor != null ? [0, crmProductos.valor] : [0, 0]} color="#f59e0b" height={36} />}
            />
            <BusinessCard
              icon={Users}
              label="Proveedores activos"
              value={crmProveedores?.valor != null ? String(Math.round(crmProveedores.valor)) : '--'}
              subtitle="1CRM"
              color="#ec4899"
              chart={<BarChart data={crmProveedores?.valor != null ? [crmProveedores.valor * 0.5, crmProveedores.valor * 0.8, crmProveedores.valor] : []} color="#ec4899" height={36} />}
            />
          </div>
        </section>

        {/* Section: Pipeline Status */}
        <section>
          <p className="text-[9px] font-semibold text-[#555] uppercase tracking-widest mb-3">Pipeline - Estado actual</p>
          <div className="bg-[#141414] border border-[#1f1f1f] rounded-xl p-5">
            <div className="grid grid-cols-5 gap-2">
              {(agentStats.length > 0 ? agentStats : [
                { name: 'Lector', active: 0, queue: 0, color: '#10b981' },
                { name: 'Buscador', active: 0, queue: 0, color: '#06b6d4' },
                { name: 'Imagen', active: 0, queue: 0, color: '#f59e0b' },
                { name: 'Ficha', active: 0, queue: 0, color: '#8b5cf6' },
                { name: 'Publicador', active: 0, queue: 0, color: '#ec4899' },
              ]).map((agent) => (
                <div key={agent.name} className="flex flex-col items-center">
                  <div
                    className="w-full h-16 rounded-lg flex items-end justify-center pb-1 relative overflow-hidden"
                    style={{ backgroundColor: `${agent.color}10`, border: `1px solid ${agent.color}30` }}
                  >
                    <div
                      className="absolute bottom-0 left-0 right-0 transition-all"
                      style={{
                        height: `${agent.active + agent.queue > 0 ? (agent.active / (agent.active + agent.queue)) * 100 : 0}%`,
                        backgroundColor: `${agent.color}30`,
                      }}
                    />
                    <span className="relative text-[14px] font-bold" style={{ color: agent.color }}>
                      {agent.active}
                    </span>
                  </div>
                  <span className="text-[10px] text-[#888] mt-1.5 font-medium">{agent.name}</span>
                  <span className="text-[9px] text-[#555]">{agent.queue} en cola</span>
                </div>
              ))}
            </div>
            <div className="flex items-center justify-center gap-4 mt-4 pt-3 border-t border-[#1f1f1f]">
              <span className="text-[9px] text-[#555]">Total en proceso: <span className="text-white font-medium">{totalCorriendo ?? '--'}</span></span>
              <span className="text-[9px] text-[#555]">En cola: <span className="text-white font-medium">{totalPendiente ?? '--'}</span></span>
              <span className="text-[9px] text-[#555]">Completados hoy: <span className="text-[#10b981] font-medium">{completadosHoy ?? '--'}</span></span>
            </div>
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

        {/* Tipo de cambio */}
        <section className="pb-4">
          <div className="bg-[#141414] border border-[#1f1f1f] rounded-xl p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <DollarSign className="w-4 h-4 text-[#f59e0b]" />
              <div>
                <span className="text-[11px] text-[#888]">Tipo de cambio USD/MXN</span>
                <span className="text-[14px] font-semibold text-white ml-3">{mxnRate || '--'}</span>
              </div>
            </div>
            <div className="flex items-center gap-1 text-[10px] text-[#888]">
              <ArrowDownRight className="w-3 h-3" />
              Hoy
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
  change,
  trend,
  color,
  chart,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  change: string;
  trend: 'up' | 'down';
  color: string;
  chart: React.ReactNode;
}) {
  return (
    <div className="bg-[#141414] border border-[#1f1f1f] rounded-xl p-4">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Icon className="w-3.5 h-3.5" style={{ color }} />
          <span className="text-[10px] text-[#888]">{label}</span>
        </div>
        {change && (
          <div className={`flex items-center gap-0.5 text-[9px] ${
            trend === 'up' ? 'text-[#10b981]' : 'text-[#06b6d4]'
          }`}>
            {trend === 'up' ? <ArrowUpRight className="w-2.5 h-2.5" /> : <ArrowDownRight className="w-2.5 h-2.5" />}
            {change}
          </div>
        )}
      </div>
      <div className="text-[18px] font-bold text-white mb-2">{value}</div>
      {chart}
    </div>
  );
}

function BusinessCard({
  icon: Icon,
  label,
  value,
  subtitle,
  color,
  chart,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  subtitle: string;
  color: string;
  chart: React.ReactNode;
}) {
  return (
    <div className="bg-[#141414] border border-[#1f1f1f] rounded-xl p-4">
      <div className="flex items-center gap-2 mb-2">
        <Icon className="w-3.5 h-3.5" style={{ color }} />
        <span className="text-[10px] text-[#888]">{label}</span>
      </div>
      <div className="text-[18px] font-bold text-white">{value}</div>
      <p className="text-[9px] text-[#555] mt-0.5 mb-2">{subtitle}</p>
      {chart}
    </div>
  );
}
