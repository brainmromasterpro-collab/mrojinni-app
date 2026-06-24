import { useState, useEffect } from 'react';
import { Package, FolderOpen, Link2, Plug, Bot, Cloud, BarChart3 } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface SidebarProps {
  activeNav: string;
  onNavSelect: (id: string) => void;
}

interface KpiTile {
  value: string;
  label: string;
  highlight: boolean;
  color?: string;
}

const PLACEHOLDER_KPIS: KpiTile[] = [
  { value: '--', label: 'RFQs / mes', highlight: true },
  { value: '--', label: 'RFQs / semana', highlight: false },
  { value: '--', label: 'Tokens / mes', highlight: false },
  { value: '--', label: 'Por expirar', highlight: false },
];

const SERVICIO_LABEL: Record<string, string> = {
  serpapi: 'SerpAPI',
  removebg: 'Remove.bg',
  google_cse: 'Google CSE',
  supabase: 'Storage',
};

// Abreviación compacta para números grandes (73042 -> 73k)
function compact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(Math.round(n));
}

export default function Sidebar({ activeNav, onNavSelect }: SidebarProps) {
  const [kpis, setKpis] = useState<KpiTile[]>(PLACEHOLDER_KPIS);

  useEffect(() => {
    async function fetchKpis() {
      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);
      const startOfWeek = new Date();
      startOfWeek.setDate(startOfWeek.getDate() - 7);

      // RFQs del mes y de la semana
      const { count: mes } = await supabase
        .from('rfqs')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', startOfMonth.toISOString());
      const { count: semana } = await supabase
        .from('rfqs')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', startOfWeek.toISOString());

      // Tokens del mes: sumar output de los jobs completados del mes
      const { data: jobs } = await supabase
        .from('jobs')
        .select('output')
        .eq('estado', 'completado')
        .gte('created_at', startOfMonth.toISOString());
      let tokensMes = 0;
      for (const j of (jobs || [])) {
        const o = (j.output || {}) as Record<string, number>;
        tokensMes += Number(o.tokens_total ?? (Number(o.tokens_input || 0) + Number(o.tokens_output || 0)));
      }

      // Recurso más cercano a expirar: menor % de cuota restante
      const { data: res } = await supabase
        .from('resource_status')
        .select('servicio, metrica, valor, limite, estado');

      const candidatos: { servicio: string; pct: number; restante: number }[] = [];
      const find = (s: string, m: string) => res?.find(r => r.servicio === s && r.metrica === m);

      const serp = find('serpapi', 'busquedas_restantes');
      if (serp?.valor != null && serp.limite) candidatos.push({ servicio: 'serpapi', pct: serp.valor / serp.limite, restante: serp.valor });

      const rb = find('removebg', 'creditos_restantes');
      if (rb?.valor != null) {
        // Cuenta de pago sin límite mensual: estimar urgencia por estado
        const pct = rb.estado === 'critical' ? 0.02 : rb.estado === 'warning' ? 0.15 : 1;
        candidatos.push({ servicio: 'removebg', pct, restante: rb.valor });
      }

      const gcse = find('google_cse', 'llamadas_hoy');
      if (gcse?.valor != null && gcse.limite) candidatos.push({ servicio: 'google_cse', pct: (gcse.limite - gcse.valor) / gcse.limite, restante: gcse.limite - gcse.valor });

      const stg = find('supabase', 'storage_gb');
      if (stg?.valor != null && stg.limite) candidatos.push({ servicio: 'supabase', pct: (stg.limite - stg.valor) / stg.limite, restante: stg.limite - stg.valor });

      const peor = candidatos.sort((a, b) => a.pct - b.pct)[0];
      const expirarValue = peor ? compact(peor.restante) : '--';
      const expirarLabel = peor ? SERVICIO_LABEL[peor.servicio] || peor.servicio : 'Por expirar';
      const expirarColor = !peor ? undefined : peor.pct <= 0.05 ? '#f87171' : peor.pct <= 0.2 ? '#fbbf24' : '#10b981';

      setKpis([
        { value: mes != null ? String(mes) : '--', label: 'RFQs / mes', highlight: true },
        { value: semana != null ? String(semana) : '--', label: 'RFQs / semana', highlight: false },
        { value: tokensMes > 0 ? compact(tokensMes) : '--', label: 'Tokens / mes', highlight: false },
        { value: expirarValue, label: expirarLabel, highlight: false, color: expirarColor },
      ]);
    }
    fetchKpis();
    const interval = setInterval(fetchKpis, 30000);
    return () => clearInterval(interval);
  }, []);

  return (
    <aside className="hidden md:flex w-sidebar-l h-full bg-brain-dark border-r border-brain-card flex-col overflow-y-auto scrollbar-thin flex-shrink-0">
      {/* Dashboard KPIs */}
      <div className="px-3 pt-3 pb-1">
        <div className="flex items-center justify-between px-1 pb-2">
          <p className="text-[9px] font-semibold text-[#555] uppercase tracking-widest">Dashboard</p>
          <button
            onClick={() => onNavSelect('dashboard')}
            className={`p-1 rounded transition-colors ${
              activeNav === 'dashboard' ? 'bg-brain-accent/20 text-brain-accent' : 'text-[#555] hover:text-[#aaa] hover:bg-brain-card'
            }`}
            title="Ver dashboard completo"
          >
            <BarChart3 className="w-3 h-3" />
          </button>
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          {kpis.map((kpi, i) => (
            <div key={i} className="bg-brain-card rounded-md px-2 py-2">
              <div
                className={`text-[14px] font-semibold ${kpi.color ? '' : kpi.highlight ? 'text-brain-accent' : 'text-white'}`}
                style={kpi.color ? { color: kpi.color } : undefined}
              >
                {kpi.value}
              </div>
              <div className="text-[9px] text-[#666] mt-0.5">{kpi.label}</div>
            </div>
          ))}
        </div>
      </div>

      <Divider />

      {/* Use case */}
      <NavSection title="Use case - MRO">
        <NavItem icon={Package} label="Ordenes" id="ordenes" active={activeNav === 'ordenes'} onClick={onNavSelect} />
        <NavItem icon={FolderOpen} label="Catalogo" id="catalogo" active={activeNav === 'catalogo'} onClick={onNavSelect} />
      </NavSection>

      <Divider />

      {/* Logs */}
      <NavSection title="Logs">
        <NavItem icon={Link2} label="Activity log" id="activity" active={activeNav === 'activity'} onClick={onNavSelect} />
        <NavSub>Que paso - quien hizo que</NavSub>
        <NavSub>Pendientes por persona</NavSub>
      </NavSection>

      <Divider />

      {/* Config */}
      <NavSection title="Config">
        <NavItem icon={Plug} label="Connectors" id="connectors" active={activeNav === 'connectors'} onClick={onNavSelect} />
        <NavItem icon={Bot} label="Agentes" id="agentes" active={activeNav === 'agentes'} onClick={onNavSelect} />
        <NavItem icon={Cloud} label="Infraestructura" id="infra" active={activeNav === 'infra'} onClick={onNavSelect} />
      </NavSection>
    </aside>
  );
}

function NavSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="px-2 py-1">
      <p className="px-2 py-1.5 text-[9px] font-semibold text-[#555] uppercase tracking-widest">{title}</p>
      {children}
    </div>
  );
}

function NavItem({ icon: Icon, label, id, active, onClick }: {
  icon: React.ElementType;
  label: string;
  id: string;
  active: boolean;
  onClick: (id: string) => void;
}) {
  return (
    <button
      onClick={() => onClick(id)}
      className={`w-full flex items-center gap-2 px-3 py-1.5 rounded-md text-[11px] transition-all ${
        active ? 'bg-brain-card text-white' : 'text-[#999] hover:bg-brain-card hover:text-[#ddd]'
      }`}
    >
      <Icon className="w-3.5 h-3.5 flex-shrink-0" />
      {label}
    </button>
  );
}

function NavSub({ children }: { children: React.ReactNode }) {
  return (
    <p className="pl-9 py-0.5 text-[10px] text-[#666] cursor-pointer hover:text-[#aaa] transition-colors">
      {children}
    </p>
  );
}

function Divider() {
  return <div className="h-px bg-brain-card mx-3 my-2" />;
}
