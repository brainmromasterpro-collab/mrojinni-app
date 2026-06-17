import { useState, useEffect, useRef } from 'react';
import { Bell, ArrowLeft } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface Notification {
  id: string;
  created_at: string;
  tipo: string;
  titulo: string;
  mensaje: string | null;
  rfq_id: string | null;
  leida: boolean;
  destinatario: string | null;
}

interface RFQDetail {
  rfq_id: string;
  marca: string;
  modelo: string;
  qty: number;
  urgente: boolean;
  estado: string | null;
  foto_url: string | null;
  fx_usd_mxn: number | null;
  fx_fecha: string | null;
  crm_producto_id: string | null;
}

interface Opcion {
  rank: number;
  proveedor: string | null;
  precio_orig: number | null;
  moneda: string | null;
  precio_mxn: number | null;
  disponibilidad: string | null;
  tiempo_entrega: string | null;
  score_ranking: number | null;
  dist_autorizado: boolean;
  condicion: string | null;
}

const typeColors: Record<string, string> = {
  urgente: 'bg-red-500/20 text-red-400',
  error: 'bg-red-500/20 text-red-400',
  exito: 'bg-emerald-500/20 text-emerald-400',
  publicado: 'bg-emerald-500/20 text-emerald-400',
  info: 'bg-blue-500/20 text-blue-400',
  warning: 'bg-amber-500/20 text-amber-400',
  pendiente: 'bg-amber-500/20 text-amber-400',
};

const typeIcons: Record<string, string> = {
  urgente: '!',
  error: '\u2717',
  exito: '\u2713',
  publicado: '\u2713',
  info: 'i',
  warning: '\u26A1',
  pendiente: '\u23F3',
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'ahora';
  if (mins < 60) return `hace ${mins} min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `hace ${hrs}h`;
  return `hace ${Math.floor(hrs / 24)}d`;
}

export default function NotificationBell() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [open, setOpen] = useState(false);
  const [bounce, setBounce] = useState(false);
  const [selectedNotification, setSelectedNotification] = useState<Notification | null>(null);
  const [rfqDetail, setRfqDetail] = useState<RFQDetail | null>(null);
  const [opciones, setOpciones] = useState<Opcion[]>([]);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const unreadCount = notifications.filter((n) => !n.leida).length;

  useEffect(() => {
    supabase
      .from('notificaciones')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(20)
      .then(({ data }) => {
        if (data) setNotifications(data as Notification[]);
      });

    const channel = supabase
      .channel('notificaciones-realtime')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notificaciones' },
        (payload) => {
          const entry = payload.new as Notification;
          setNotifications((prev) => [entry, ...prev].slice(0, 30));
          setBounce(true);
          setTimeout(() => setBounce(false), 600);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setSelectedNotification(null);
        setRfqDetail(null);
        setOpciones([]);
      }
    }
    if (open) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  function handleOpen() {
    setOpen((prev) => !prev);
    if (!open && unreadCount > 0) {
      supabase
        .from('notificaciones')
        .update({ leida: true })
        .eq('leida', false)
        .then(() => {
          setNotifications((prev) => prev.map((n) => ({ ...n, leida: true })));
        });
    }
    if (open) {
      setSelectedNotification(null);
      setRfqDetail(null);
      setOpciones([]);
    }
  }

  async function handleNotificationClick(n: Notification) {
    setSelectedNotification(n);
    if (!n.rfq_id) return;

    setLoadingDetail(true);
    console.log('[Notification Detail] Querying opciones with rfq_id UUID:', n.rfq_id);
    const [rfqRes, opcionesRes] = await Promise.all([
      supabase.from('rfqs').select('rfq_id, marca, modelo, qty, urgente, estado, foto_url, fx_usd_mxn, fx_fecha, crm_producto_id').eq('id', n.rfq_id).maybeSingle(),
      supabase.from('opciones').select('rank, proveedor, precio_orig, moneda, precio_mxn, disponibilidad, tiempo_entrega, score_ranking, dist_autorizado, condicion').eq('rfq_id', n.rfq_id).order('rank', { ascending: true }),
    ]);
    console.log('[Notification Detail] Result:', { rowCount: opcionesRes.data?.length ?? 0, opciones: opcionesRes.data, error: opcionesRes.error });

    if (rfqRes.data) setRfqDetail(rfqRes.data as RFQDetail);
    if (opcionesRes.data) setOpciones(opcionesRes.data as Opcion[]);
    setLoadingDetail(false);
  }

  function handleBack() {
    setSelectedNotification(null);
    setRfqDetail(null);
    setOpciones([]);
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        onClick={handleOpen}
        className={`relative p-1.5 rounded-md text-[#888] hover:text-white hover:bg-brain-card transition-colors ${bounce ? 'animate-bounce-short' : ''}`}
      >
        <Bell className="w-4 h-4" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[14px] h-[14px] flex items-center justify-center rounded-full bg-red-500 text-white text-[8px] font-bold px-0.5 animate-pulse-subtle">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-96 bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl shadow-2xl z-50 animate-fade-in overflow-hidden">
          {selectedNotification ? (
            <DetailView
              notification={selectedNotification}
              rfqDetail={rfqDetail}
              opciones={opciones}
              loading={loadingDetail}
              onBack={handleBack}
            />
          ) : (
            <ListView notifications={notifications} onNotificationClick={handleNotificationClick} />
          )}
        </div>
      )}
    </div>
  );
}

function ListView({ notifications, onNotificationClick }: { notifications: Notification[]; onNotificationClick: (n: Notification) => void }) {
  return (
    <>
      <div className="px-4 py-3 border-b border-[#2a2a2a] flex items-center justify-between">
        <span className="text-[12px] font-semibold text-white">Notificaciones</span>
        {notifications.length > 0 && (
          <span className="text-[9px] text-[#555]">{notifications.length} recientes</span>
        )}
      </div>
      <div className="max-h-80 overflow-y-auto scrollbar-thin">
        {notifications.length === 0 ? (
          <div className="px-4 py-8 text-center">
            <Bell className="w-5 h-5 text-[#333] mx-auto mb-2" />
            <p className="text-[11px] text-[#555]">Sin notificaciones</p>
          </div>
        ) : (
          notifications.map((n) => (
            <div
              key={n.id}
              onClick={() => onNotificationClick(n)}
              className={`px-4 py-3 border-b border-[#222] hover:bg-[#222] transition-colors cursor-pointer ${
                !n.leida ? 'bg-[#1f1f2a]' : ''
              }`}
            >
              <div className="flex items-start gap-2.5">
                <span
                  className={`mt-0.5 w-5 h-5 flex items-center justify-center rounded text-[10px] font-bold flex-shrink-0 ${
                    typeColors[n.tipo] || 'bg-[#333] text-[#888]'
                  }`}
                >
                  {typeIcons[n.tipo] || 'i'}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-medium text-[#eee] truncate">{n.titulo}</span>
                    <span className="text-[9px] text-[#555] flex-shrink-0">{timeAgo(n.created_at)}</span>
                  </div>
                  {n.mensaje && (
                    <p className="text-[10px] text-[#888] mt-0.5 line-clamp-2">{n.mensaje}</p>
                  )}
                </div>
                {!n.leida && (
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-500 flex-shrink-0 mt-1.5" />
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </>
  );
}

function DetailView({
  notification,
  rfqDetail,
  opciones,
  loading,
  onBack,
}: {
  notification: Notification;
  rfqDetail: RFQDetail | null;
  opciones: Opcion[];
  loading: boolean;
  onBack: () => void;
}) {
  return (
    <div className="animate-fade-in">
      {/* Header */}
      <div className="px-4 py-3 border-b border-[#2a2a2a] flex items-center gap-2">
        <button onClick={onBack} className="p-1 rounded hover:bg-[#333] transition-colors text-[#888] hover:text-white">
          <ArrowLeft className="w-3.5 h-3.5" />
        </button>
        <span className="text-[12px] font-semibold text-white truncate">{notification.titulo}</span>
      </div>

      {/* Content */}
      <div className="max-h-[420px] overflow-y-auto scrollbar-thin">
        {/* Notification info */}
        <div className="px-4 py-3 border-b border-[#222]">
          <div className="flex items-center gap-2 mb-1.5">
            <span
              className={`w-5 h-5 flex items-center justify-center rounded text-[10px] font-bold flex-shrink-0 ${
                typeColors[notification.tipo] || 'bg-[#333] text-[#888]'
              }`}
            >
              {typeIcons[notification.tipo] || 'i'}
            </span>
            <span className="text-[9px] text-[#555]">{timeAgo(notification.created_at)}</span>
          </div>
          {notification.mensaje && (
            <p className="text-[11px] text-[#aaa] leading-relaxed">{notification.mensaje}</p>
          )}
        </div>

        {/* RFQ Results */}
        {loading ? (
          <div className="px-4 py-8 text-center">
            <div className="w-5 h-5 border-2 border-[#333] border-t-[#3B82F6] rounded-full animate-spin mx-auto mb-2" />
            <p className="text-[10px] text-[#555]">Cargando resultados...</p>
          </div>
        ) : rfqDetail ? (
          <RFQResultsView rfq={rfqDetail} opciones={opciones} />
        ) : (
          <div className="px-4 py-6 text-center">
            <p className="text-[10px] text-[#555]">Sin datos de resultado asociados</p>
          </div>
        )}
      </div>
    </div>
  );
}

function RFQResultsView({ rfq, opciones }: { rfq: RFQDetail; opciones: Opcion[] }) {
  const producto = `${rfq.marca} ${rfq.modelo}`;
  const crmStatus = rfq.crm_producto_id ? `Existe (${rfq.crm_producto_id})` : 'No existe \u2014 requiere publicaci\u00F3n';
  const fxStr = rfq.fx_usd_mxn && rfq.fx_fecha ? `${rfq.fx_usd_mxn} \u00B7 ${rfq.fx_fecha}` : '\u2014';

  return (
    <div className="px-4 py-3">
      {/* Results header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-[13px]">&#x1F4CA;</span>
          <span className="text-[11px] font-semibold text-white">
            Resultado b&uacute;squeda &mdash; {rfq.rfq_id}
          </span>
        </div>
        {rfq.urgente && (
          <span className="text-[9px] font-bold text-red-400 border border-red-400/30 px-2 py-0.5 rounded-full">
            URGENTE
          </span>
        )}
      </div>

      {/* Info rows */}
      <div className="space-y-1.5 mb-4">
        <InfoRow label="Producto" value={producto} />
        <InfoRow label="Cantidad" value={String(rfq.qty)} />
        <InfoRow label="En 1CRM" value={crmStatus} valueColor={rfq.crm_producto_id ? 'text-emerald-400' : 'text-red-400'} />
        <InfoRow label="FX USD/MXN" value={fxStr} />
        {rfq.estado && <InfoRow label="Estado" value={rfq.estado} />}
      </div>

      {/* Suppliers table */}
      {opciones.length > 0 ? (
        <div>
          <div className="flex items-center py-2 border-b border-[#333] text-[9px] text-[#666] font-medium uppercase">
            <span className="w-5">#</span>
            <span className="flex-1">Proveedor</span>
            <span className="w-16 text-right">Precio</span>
            <span className="w-16 text-right">Disp.</span>
            <span className="w-12 text-right">Score</span>
          </div>
          {opciones.map((op) => (
            <div
              key={op.rank}
              className="flex items-center py-2 border-b border-[#222] hover:bg-[#222] transition-colors rounded"
            >
              <span className="w-5 text-[11px] font-bold text-[#3B82F6]">{op.rank}</span>
              <span className="flex-1 text-[11px] text-[#ddd] truncate">
                {op.proveedor || '\u2014'}
                {op.dist_autorizado && <span className="ml-1 text-[9px] text-amber-400">\u2605</span>}
              </span>
              <span className="w-16 text-right text-[11px] font-semibold text-white">
                {op.precio_mxn ? `$${Number(op.precio_mxn).toLocaleString()}` : op.precio_orig ? `${op.moneda || '$'}${Number(op.precio_orig).toLocaleString()}` : '\u2014'}
              </span>
              <span className="w-16 text-right text-[10px] text-emerald-400">
                {op.disponibilidad || op.tiempo_entrega || '\u2014'}
              </span>
              <span className="w-12 text-right text-[10px] text-[#888]">
                {op.score_ranking ? `${op.score_ranking}pts` : '\u2014'}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <div className="py-4 text-center border border-dashed border-[#333] rounded-lg">
          <p className="text-[10px] text-[#555]">Sin opciones de proveedores disponibles</p>
        </div>
      )}
    </div>
  );
}

function InfoRow({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[10px] text-[#666]">{label}</span>
      <span className={`text-[10px] font-medium ${valueColor || 'text-[#ccc]'}`}>{value}</span>
    </div>
  );
}
