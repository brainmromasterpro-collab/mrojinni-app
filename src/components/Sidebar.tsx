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
}

const PLACEHOLDER_KPIS: KpiTile[] = [
  { value: '--', label: 'RFQs activos', highlight: true },
  { value: '--', label: 'RFQs / mes', highlight: false },
  { value: '--', label: 'Tokens hoy', highlight: false },
  { value: '--', label: 'Storage', highlight: false },
];

// Misma abreviación compacta para números grandes (73042 -> 73k)
function compact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(Math.round(n));
}

export default function Sidebar({ activeNav, onNavSelect }: SidebarProps) {
  const [kpis, setKpis] = useState<KpiTile[]>(PLACEHOLDER_KPIS);

  useEffect(() => {
    async function fetchKpis() {
      // Mismas fuentes que el DashboardPanel
      const { count: activos } = await supabase
        .from('rfqs')
        .select('id', { count: 'exact', head: true })
        .neq('estado', 'publicado');

      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);
      const { count: mes } = await supabase
        .from('rfqs')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', startOfMonth.toISOString());

      const { data: res } = await supabase
        .from('resource_status')
        .select('servicio, metrica, valor')
        .in('servicio', ['anthropic', 'supabase']);

      const tokens = res?.find(r => r.servicio === 'anthropic' && r.metrica === 'tokens_hoy')?.valor;
      const storage = res?.find(r => r.servicio === 'supabase' && r.metrica === 'storage_gb')?.valor;

      setKpis([
        { value: activos != null ? String(activos) : '--', label: 'RFQs activos', highlight: true },
        { value: mes != null ? String(mes) : '--', label: 'RFQs / mes', highlight: false },
        { value: tokens != null ? compact(tokens) : '--', label: 'Tokens hoy', highlight: false },
        { value: storage != null ? `${storage.toFixed(2)} GB` : '--', label: 'Storage', highlight: false },
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
          {kpis.map((kpi) => (
            <div key={kpi.label} className="bg-brain-card rounded-md px-2 py-2">
              <div className={`text-[14px] font-semibold ${kpi.highlight ? 'text-brain-accent' : 'text-white'}`}>
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
        <NavSub>1CRM - Gmail - Drive</NavSub>
        <NavSub>Remove.bg - Supabase</NavSub>
        <NavItem icon={Bot} label="Agentes" id="agentes" active={activeNav === 'agentes'} onClick={onNavSelect} />
        <NavSub>Lector - Buscador</NavSub>
        <NavSub>Imagen - Ficha - Publicador</NavSub>
        <NavItem icon={Cloud} label="Infraestructura" id="infra" active={activeNav === 'infra'} onClick={onNavSelect} />
        <NavSub>Railway - Hostinger</NavSub>
        <NavSub>Modelos IA</NavSub>
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
