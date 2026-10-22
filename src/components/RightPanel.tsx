import { useState, useRef, useEffect } from 'react';
import { Plus, Upload, Link, FileText, X, HelpCircle, ChevronDown } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface RightPanelProps {
  visible: boolean;
  streamId: string | null;
  tipo?: string;
}

// Config del panel por tipo de stream: qué hace el stream, qué agentes tiene (con descripción de
// cada uno), fuentes y conexiones a mostrar. 'queHago' y 'agentes[].desc' alimentan el botón
// "¿Qué hago?" (documentación auto-explicativa del stream) — pensado tanto para el usuario humano
// como para otras IAs que en el futuro coordinen/orquesten varios streams y necesiten saber, sin
// adivinar, qué hace cada uno. Un tipo no listado (generico/compras/general) usa el panel legacy
// (agentes derivados de jobs) más una explicación genérica del stream libre.
interface AgenteConfig { key: string; label: string; desc: string; }
interface InventarioEtapa { titulo: string; items: string[]; undo?: boolean; }
interface TipoConfig {
  label: string;
  queHago: string;
  agentes: AgenteConfig[];
  fuentes: { icon: string; name: string }[];
  conectado: string[];
  inventario?: { entradas: { icon: string; label: string }[]; etapas: InventarioEtapa[]; };
}
const _LINK = '\u{1F517}', _GLOBE = '\u{1F310}', _MAIL = '✉', _CHAT = '\u{1F4AC}', _DB = '\u{1F5C4}';
const TIPO_CONFIG: Record<string, TipoConfig> = {
  correo: {
    label: 'Correo',
    queHago: 'Lee los correos entrantes de Gmail buscando solicitudes de cotización (RFQ). Cuando detecta una, busca los productos pedidos, cotiza contra proveedores y crea la oportunidad en 1CRM — o te avisa qué falta si el correo viene incompleto.',
    agentes: [
      { key: 'lector', label: 'Lector de correo', desc: 'Lee el contenido de los correos que llegan a la bandeja.' },
      { key: 'detector', label: 'Detector de oportunidad', desc: 'Decide si un correo es una oportunidad de venta real (RFQ) o no.' },
      { key: 'buscador', label: 'Buscador RFQ (interno + web)', desc: 'Busca los productos solicitados en el catálogo propio y en proveedores externos.' },
      { key: 'alta', label: 'Alta en CRM (cuenta + oportunidad)', desc: 'Crea la cuenta, el contacto y la oportunidad en 1CRM cuando ya hay datos suficientes.' },
      { key: 'seguimiento', label: 'Seguimiento', desc: 'Da seguimiento a oportunidades que quedaron incompletas o sin respuesta.' },
    ],
    fuentes: [{ icon: _MAIL, name: 'Gmail · bandeja' }, { icon: _DB, name: '1CRM · cuentas / contactos / oport.' }],
    conectado: ['Gmail', '1CRM'],
  },
  rfq: {
    label: 'RFQ',
    queHago: 'Para cuando TÚ le compartes un RFQ directamente (texto o captura de pantalla), sin que venga de un correo. Valida que estén los datos obligatorios y crea la oportunidad en 1CRM.',
    agentes: [
      { key: 'lector', label: 'Lector de RFQ (texto / screenshot)', desc: 'Lee el RFQ que subes como texto o imagen.' },
      { key: 'detector', label: 'Cotejo de datos (5 obligatorios)', desc: 'Revisa que estén los 5 datos obligatorios (producto, cantidad, cliente, etc.) antes de crear la oportunidad.' },
      { key: 'alta', label: 'Alta en CRM (cuenta + contacto + oportunidad)', desc: 'Crea cuenta, contacto y oportunidad en 1CRM con los datos ya validados.' },
    ],
    fuentes: [{ icon: _DB, name: '1CRM · cuentas / contactos / oport.' }],
    conectado: ['1CRM'],
  },
  compras: {
    label: 'Compras',
    queHago: 'Ciclo completo de compra a proveedor en 4 etapas:\n\n1. COTEJO + PO: lee links o capturas de tiendas (eBay, Amazon, ML…), coteja contra Sales Orders abiertas, crea el PurchaseOrder y la Bill en 1CRM vinculados a la venta. Detecta automáticamente la moneda, busca/crea el proveedor y agrupa por SO.\n\n2. PAGO: lee el comprobante (imagen o PDF), extrae monto/fecha/referencia y lo registra en la Bill abierta — soporta pagos parciales.\n\n3. RECEPCIÓN: acepta fotos de paquete, packing lists, order confirmations o número de tracking. Confirma recepción completa o parcial (acumula entrega a entrega) y suma stock al catálogo automáticamente.\n\n4. CIERRE: marca la SO como entregada y/o facturada y la cierra en 1CRM.\n\nCada etapa tiene opción de deshacer.',
    agentes: [
      { key: 'match',      label: 'Match venta ↔ proveedor (PO + cuenta por pagar)', desc: 'Crea la orden de compra (PO) y la cuenta por pagar (Bill) a partir del link del proveedor, vinculados a la Sales Order correspondiente.' },
      { key: 'pago',       label: 'Conciliación de pagos', desc: 'Lee comprobantes de pago y los concilia contra las cuentas por pagar abiertas (Bills).' },
      { key: 'recepcion',  label: 'Recepción y stock', desc: 'Registra la recepción física de la mercancía (completa o parcial) y actualiza el stock en el catálogo.' },
    ],
    fuentes: [
      { icon: _DB,    name: '1CRM · PurchaseOrders / Bills / Payments' },
      { icon: _DB,    name: '1CRM · Sales Orders (cotejo de compra)' },
      { icon: _DB,    name: '1CRM · Productos / Catálogo (stock)' },
      { icon: _GLOBE, name: 'eBay / Amazon / ML · links (SerpAPI)' },
    ],
    conectado: ['1CRM'],
    inventario: {
      entradas: [
        { icon: '🔗', label: 'Links de producto (eBay, Amazon, ML, AliExpress…)' },
        { icon: '📷', label: 'Screenshot de tienda online' },
        { icon: '📄', label: 'PDF / captura de order confirmation' },
        { icon: '🧾', label: 'Comprobante de pago (imagen o PDF)' },
        { icon: '📦', label: 'Foto de paquete recibido' },
        { icon: '📋', label: 'Packing list (imagen o PDF)' },
        { icon: '🚚', label: 'Número de tracking (texto o captura)' },
      ],
      etapas: [
        {
          titulo: 'Etapa 1 · Cotejo y Purchase Order',
          items: [
            'Lee cada link/captura: nombre, número de parte, precio, tienda, moneda',
            'Coteja contra Sales Orders abiertas y agrupa por SO',
            'Reporta productos sin match ("gasto general") sin forzar asignación',
            'Busca o crea el proveedor en 1CRM automáticamente',
            'Crea el PurchaseOrder con líneas y número de parte, vinculado a la SO',
            'Crea la Bill (cuenta por pagar) vinculada al PO con términos del proveedor',
            'Detecta moneda (USD / MXN) en ambos registros',
            'Soporta compras que cubren productos de varias Sales Orders a la vez',
          ],
          undo: true,
        },
        {
          titulo: 'Etapa 2 · Pago',
          items: [
            'Recibe comprobante de pago (imagen o PDF)',
            'Extrae con visión: monto, fecha, referencia, banco / tienda',
            'Asocia el pago a la Bill correspondiente en 1CRM',
            'Lleva saldo de la cuenta por pagar (soporta pagos parciales)',
          ],
        },
        {
          titulo: 'Etapa 3 · Recepción',
          items: [
            'Registra número de tracking / guía de envío en el PO',
            'Clasifica el documento: packing list / order confirmation / foto de paquete / tracking / otro',
            'Packing list: extrae productos y cantidades estructuradas por línea',
            'Foto de paquete: describe con visión para que confirmes',
            'Recepción completa: cierra el PO y suma stock al catálogo',
            'Recepción parcial: acumula entrega a entrega, cierra el PO solo cuando llega todo',
            'Con muchos POs abiertos, filtra candidatos por número de parte o tracking',
          ],
          undo: true,
        },
        {
          titulo: 'Etapa 4 · Cierre de venta',
          items: [
            'Lista las Sales Orders pendientes de cierre',
            'Marca la SO como entregada (Shipped)',
            'Marca la SO como facturada (Invoiced)',
            'Con ambas: cierra la SO (Closed — Shipped and Invoiced)',
          ],
          undo: true,
        },
        {
          titulo: 'Siempre disponible',
          items: [
            'Estado operativo: muestra en qué etapa está cada SO / PO y qué falta para cerrar',
            'Ajuste automático de stock en catálogo al confirmar cada recepción',
            'Marca si una SO ya fue comprada (evita doble-compra)',
            'Lee capturas de tiendas online con visión (order confirmations, checkout)',
          ],
        },
      ],
    },
  },
  pagos: {
    label: 'Pagos',
    queHago: 'Sube un comprobante de pago (screenshot o PDF) y lo coteja contra las Bills (pagos a proveedor) e Invoices (cobros a cliente) abiertas en 1CRM, para dejarlo registrado como pagado — completo o parcial.',
    agentes: [
      { key: 'cotejo',  label: 'Cotejo de comprobante (Bills + Invoices)', desc: 'Lee el comprobante y lo compara contra los montos pendientes de Bills e Invoices.' },
      { key: 'sinmatch', label: 'Alta guiada de PO/SO sin match', desc: 'Si el comprobante no coincide con nada existente, te guía para crear el PO o SO correspondiente.' },
    ],
    fuentes: [{ icon: _DB, name: '1CRM · Bills / Invoices / Payments' }],
    conectado: ['1CRM'],
    inventario: {
      entradas: [
        { icon: '📷', label: 'Foto o captura de comprobante de pago' },
        { icon: '📄', label: 'PDF de comprobante o transferencia' },
        { icon: '💬', label: 'Texto: "registra pago de $X a proveedor Y"' },
      ],
      etapas: [
        {
          titulo: 'Leer el comprobante',
          items: [
            'Lee el comprobante con visión (foto o PDF)',
            'Extrae monto, moneda, fecha y referencia / folio',
            'Si algo no es legible, lo reporta — nunca inventa cifras',
          ],
        },
        {
          titulo: 'Cotejar contra cuentas abiertas',
          items: [
            'Consulta Bills (cuentas por pagar a proveedores) e Invoices (cuentas por cobrar de clientes) abiertas en 1CRM',
            'Cruza el monto del comprobante con las cuentas pendientes (tolerancia 1%)',
            'Si hay match te muestra la candidata; si no, te muestra todas las abiertas para que elijas',
            'Detecta pagos parciales: si el monto no cubre el total lo dice y lleva el saldo acumulado',
            'Funciona para ambas direcciones: tú pagas a proveedor (Bill) o cliente te paga a ti (Invoice)',
          ],
        },
        {
          titulo: 'Registrar el pago',
          items: [
            'Crea el Payment en 1CRM ligado al Bill o Invoice seleccionado',
            'Guarda fecha, referencia, monto y dirección (outgoing / incoming)',
            'El saldo restante lo lleva este sistema desde el historial (1CRM no lo actualiza solo)',
          ],
          undo: true,
        },
        {
          titulo: 'Siempre disponible',
          items: [
            'Consulta qué cuentas están abiertas y cuánto falta pagar o cobrar',
            'Muestra el historial de pagos registrados en el stream',
          ],
        },
      ],
    },
  },
  whatsapp: {
    label: 'WhatsApp',
    queHago: 'Igual que el stream de Correo pero para conversaciones de WhatsApp: detecta oportunidades de venta, busca los productos y da de alta la oportunidad en 1CRM.',
    agentes: [
      { key: 'lector', label: 'Lector de mensajes', desc: 'Lee los mensajes de WhatsApp entrantes.' },
      { key: 'detector', label: 'Detector de oportunidad', desc: 'Decide si el mensaje es una oportunidad de venta real.' },
      { key: 'buscador', label: 'Buscador RFQ (interno + web)', desc: 'Busca los productos solicitados en catálogo propio y proveedores externos.' },
      { key: 'alta', label: 'Alta en CRM (cuenta + oportunidad)', desc: 'Crea cuenta y oportunidad en 1CRM.' },
      { key: 'seguimiento', label: 'Seguimiento', desc: 'Da seguimiento a conversaciones que quedaron pendientes.' },
    ],
    fuentes: [{ icon: _CHAT, name: 'WhatsApp · chats' }, { icon: _DB, name: '1CRM · cuentas / contactos / oport.' }],
    conectado: ['WhatsApp', '1CRM'],
  },
  busquedas: {
    label: 'Búsquedas',
    queHago: 'Para identificar y cotizar un producto: dale un número de parte, una foto, o una ficha técnica en PDF/Excel/Word, y busca el producto en el catálogo propio y con proveedores, además de conseguirle una foto limpia.',
    agentes: [
      { key: 'buscador', label: 'Buscador', desc: 'Busca el producto en el catálogo propio (1CRM) y en proveedores / Google.' },
      { key: 'imagen', label: 'Imagen', desc: 'Consigue una foto del producto y le quita el fondo/la deja en 500x500.' },
    ],
    fuentes: [{ icon: _LINK, name: '1CRM Product Catalog' }, { icon: _LINK, name: '1CRM Proveedores' }, { icon: _GLOBE, name: 'Google Search' }],
    conectado: ['1CRM'],
  },
  publicacion: {
    label: 'Publicación',
    queHago: 'Para publicar productos nuevos en el catálogo de 1CRM: comparte el link de la página de un producto, o una ficha técnica en PDF/Excel/Word, y extrae nombre, marca, precio y características técnicas — te muestra la ficha y pide tu confirmación antes de crear el producto.',
    agentes: [
      { key: 'publicador', label: 'Publicador', desc: 'Extrae los datos del producto del link/PDF y lo publica en 1CRM tras tu aprobación.' },
      { key: 'imagen', label: 'Imagen', desc: 'Procesa la foto del producto: le quita el fondo y la ajusta a 500x500px.' },
    ],
    fuentes: [{ icon: _LINK, name: '1CRM Product Catalog' }],
    conectado: ['1CRM'],
  },
  cotizacion: {
    label: 'Cotización',
    queHago: 'Arma cotizaciones formales para el cliente a partir de productos que ya están en el catálogo de 1CRM.',
    agentes: [{ key: 'ficha', label: 'Cotizador', desc: 'Arma la ficha de cotización con los productos y precios elegidos.' }],
    fuentes: [{ icon: _DB, name: '1CRM · productos / precios' }],
    conectado: ['1CRM'],
  },
  ordenes: {
    label: 'Sales Order',
    queHago: 'Sube la orden de compra que te mandó un cliente (PDF/Excel/Word/imagen) y la coteja contra las cotizaciones existentes, crea la Sales Order en 1CRM, y da seguimiento hasta el envío y la facturación.',
    agentes: [
      { key: 'detector',   label: 'Lector de orden del cliente', desc: 'Lee la orden de compra del cliente en el formato que la haya mandado.' },
      { key: 'creador_so', label: 'Creador de SO en 1CRM', desc: 'Crea la Sales Order en 1CRM, ligada a la cotización que corresponde.' },
      { key: 'envio',      label: 'Envío (shipping) y stock', desc: 'Registra el envío y actualiza el stock disponible.' },
      { key: 'facturacion', label: 'Facturación / cierre de venta', desc: 'Cierra la venta generando la facturación correspondiente.' },
      { key: 'seguimiento', label: 'Seguimiento / estatus', desc: 'Da seguimiento al estatus de la orden hasta que se cierra.' },
    ],
    fuentes: [
      { icon: _DB,   name: '1CRM · Órdenes / Cuentas / Cotizaciones' },
      { icon: _MAIL, name: 'Gmail · ventas@mromasterpro.com' },
    ],
    conectado: ['1CRM', 'Gmail'],
    inventario: {
      entradas: [
        { icon: '📄', label: 'PDF de orden de compra del cliente' },
        { icon: '📊', label: 'Excel / Word con la orden del cliente' },
        { icon: '📷', label: 'Imagen / escaneado del PO (visión)' },
        { icon: '🔗', label: 'Link o texto con los datos del pedido' },
      ],
      etapas: [
        {
          titulo: 'Leer el PO del cliente',
          items: [
            'Lee el PO en cualquier formato: PDF digital, Excel, Word o imagen escaneada',
            'Extrae: número de orden, cliente, productos, cantidades, precios y condiciones',
            'Detecta si el PDF tiene texto o es escaneado y aplica visión automáticamente',
            'Si el PDF tiene varias páginas (PO + cotización adjunta), toma solo las líneas del PO',
          ],
        },
        {
          titulo: 'Cotejo vs cotizaciones',
          items: [
            'Busca en 1CRM las cotizaciones abiertas del cliente',
            'Cruza cada línea del PO contra las cotizaciones: precio, cantidad y número de parte',
            'Marca coincidencias exactas, discrepancias de precio y productos sin match',
            'Identifica la cotización de referencia; si abarca varias, tú eliges cuál usar',
            'Reporta cotizaciones vencidas o cerradas sin forzar un match',
          ],
        },
        {
          titulo: 'Crear la Sales Order',
          items: [
            'Muestra un preview de la SO con precios, términos y totales antes de crear',
            'Lee los términos de pago de la cuenta del cliente (payment_terms en 1CRM)',
            'Crea la Sales Order en 1CRM ligada a la cotización correcta',
            'Copia automáticamente las líneas y condiciones de la cotización a la SO',
            'Guarda el PDF del PO como Documento en 1CRM, vinculado a la SO, con el número de orden como nombre',
          ],
          undo: true,
        },
        {
          titulo: 'Envío y stock',
          items: [
            'Registra el envío (shipping) y actualiza el stock disponible',
            'Maneja tracking y estados de envío',
          ],
        },
        {
          titulo: 'Cierre de venta',
          items: [
            'Marca la SO como entregada y/o facturada',
            'Cierra la SO en 1CRM (Closed — Shipped and Invoiced)',
          ],
          undo: true,
        },
        {
          titulo: 'Siempre disponible',
          items: [
            'Da seguimiento al estatus de cualquier orden abierta',
            'Responde preguntas sobre el estado de envío o facturación',
          ],
        },
      ],
    },
  },
};
TIPO_CONFIG.mensajeria = TIPO_CONFIG.correo;
TIPO_CONFIG.catalogo = {
  label: 'Catálogo',
  queHago: 'Combina búsqueda y publicación de productos: identifica un producto (link, foto o ficha técnica), le consigue una imagen limpia, y lo publica en el catálogo de 1CRM tras tu aprobación.',
  agentes: [
    { key: 'buscador', label: 'Buscador', desc: 'Busca el producto en el catálogo propio y en proveedores/Google.' },
    { key: 'imagen', label: 'Imagen', desc: 'Consigue y limpia la foto del producto (quita fondo, ajusta a 500x500).' },
    { key: 'publicador', label: 'Publicador', desc: 'Publica el producto en 1CRM tras tu aprobación.' },
  ],
  fuentes: [{ icon: _LINK, name: '1CRM Product Catalog' }, { icon: _LINK, name: '1CRM Proveedores' }, { icon: _GLOBE, name: 'Google Search' }],
  conectado: ['1CRM'],
};

const QUE_HAGO_GENERICO = 'Stream genérico de conversación libre con Genie — sin un flujo automatizado específico asignado. Puedes preguntar sobre el CRM, pedir reportes o métricas, o platicar; Genie usa sus herramientas de consulta según lo que le pidas.';

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

export default function RightPanel({ visible, streamId, tipo }: RightPanelProps) {
  if (!visible) return null;
  const cfg = tipo ? TIPO_CONFIG[tipo] : undefined;

  return (
    <aside className="hidden md:flex w-sidebar-r h-full bg-brain-dark border-l border-brain-card flex-col overflow-y-auto scrollbar-thin flex-shrink-0">
      {cfg ? (
        <>
          <QueHagoSection label={cfg.label} queHago={cfg.queHago} agentes={cfg.agentes} />
          {['correo', 'whatsapp', 'mensajeria'].includes(tipo || '') && <AutoDetectToggle streamId={streamId} />}
          <TypedAgentsSection streamId={streamId} cfg={cfg} />
          <LiveLogsSection streamId={streamId} />
          <SourcesSection
            defaultSources={cfg.fuentes.map((f) => ({ ...f, type: 'link' as const }))}
            inventario={cfg.inventario}
          />
          <Section title="Conectado">
            <div className="px-3 space-y-1">
              {cfg.conectado.map((name) => (
                <div key={name} className="flex items-center gap-1.5 px-2 py-1.5 text-[10px] text-[#ccc]">
                  <span className="status-dot ok" />
                  {name}
                </div>
              ))}
            </div>
          </Section>
        </>
      ) : (
        <>
          {/* Stream genérico → panel legacy (agentes derivados de jobs + fuentes/infra globales) */}
          <QueHagoSection label="Genérico" queHago={QUE_HAGO_GENERICO} agentes={[]} />
          <AgentsSection streamId={streamId} />
          <LiveLogsSection streamId={streamId} />
          <SourcesSection />
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
        </>
      )}
    </aside>
  );
}

// Botón expandible "¿Qué hago?" — documentación auto-explicativa del stream: para qué sirve y qué
// hace cada agente. Pensado tanto para el usuario (humano) como para otras IAs que en el futuro
// coordinen/orquesten varios streams y necesiten saber, sin adivinar ni leer código, qué hace cada
// uno. Colapsado por defecto para no ocupar espacio de forma permanente.
function InventarioSection({ inventario }: { inventario: NonNullable<TipoConfig['inventario']> }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-1 border-t border-brain-card">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-3 py-1.5 hover:bg-brain-card/40 transition-colors"
      >
        <span className="text-[9px] font-semibold text-[#555] uppercase tracking-widest">Qué puede hacer</span>
        <ChevronDown className={`w-3 h-3 text-[#555] transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="px-3 pb-3 space-y-3 animate-fade-in">
          <div>
            <p className="text-[9px] font-semibold text-[#555] uppercase tracking-widest mb-1.5">Entradas que acepta</p>
            <div className="space-y-0.5">
              {inventario.entradas.map((e, i) => (
                <div key={i} className="flex items-start gap-1.5 text-[10px] text-[#777]">
                  <span className="flex-shrink-0 leading-tight">{e.icon}</span>
                  <span className="leading-snug">{e.label}</span>
                </div>
              ))}
            </div>
          </div>
          {inventario.etapas.map((etapa, i) => (
            <div key={i}>
              <div className="flex items-center gap-1.5 mb-1">
                <p className="text-[9px] font-semibold text-[#555] uppercase tracking-widest">{etapa.titulo}</p>
                {etapa.undo && <span className="text-[8px] text-[#444] border border-[#333] rounded px-1 py-px">↩ deshacer</span>}
              </div>
              <ul className="space-y-0.5">
                {etapa.items.map((item, j) => (
                  <li key={j} className="flex items-start gap-1.5 text-[10px] text-[#777]">
                    <span className="flex-shrink-0 mt-[3px] w-1 h-1 rounded-full bg-[#444]" />
                    <span className="leading-snug">{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function QueHagoSection({ label, queHago, agentes }: { label: string; queHago: string; agentes: AgenteConfig[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-brain-card">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-brain-card/50 transition-colors"
      >
        <span className="flex items-center gap-1.5 text-[11px] font-semibold text-[#ccc]">
          <HelpCircle className="w-3.5 h-3.5 text-[#3B82F6]" />
          ¿Qué hago?
        </span>
        <ChevronDown className={`w-3.5 h-3.5 text-[#888] transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="px-4 pb-3 animate-fade-in">
          <p className="text-[9px] font-semibold text-[#555] uppercase tracking-widest mb-1">Stream · {label}</p>
          <p className="text-[11px] text-[#aaa] leading-relaxed mb-3">{queHago}</p>
          {agentes.length > 0 && (
            <>
              <p className="text-[9px] font-semibold text-[#555] uppercase tracking-widest mb-1.5">Agentes</p>
              <div className="space-y-2">
                {agentes.map((a) => (
                  <div key={a.key}>
                    <p className="text-[10px] font-medium text-[#ccc]">{a.label}</p>
                    <p className="text-[10px] text-[#888] leading-snug">{a.desc}</p>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// Panel de agentes por TIPO: muestra los agentes del tipo con un dot; si hay un job de ese
// agente corriendo ahora, lo marca "corriendo".
function TypedAgentsSection({ streamId, cfg }: { streamId: string | null; cfg: TipoConfig }) {
  const [running, setRunning] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!streamId) { setRunning(new Set()); return; }
    let cancelled = false;
    async function poll() {
      const { data: rfqs } = await supabase.from('rfqs').select('id').eq('stream_id', streamId).order('created_at', { ascending: false }).limit(100);
      const rfqIds = (rfqs || []).map((r) => r.id);
      if (rfqIds.length === 0) { if (!cancelled) setRunning(new Set()); return; }
      const { data: jobs } = await supabase.from('jobs').select('agente, estado, started_at, created_at').in('rfq_id', rfqIds).in('estado', ['pendiente', 'corriendo']).order('created_at', { ascending: false }).limit(100);
      const now = Date.now();
      const fresh = new Set<string>();
      (jobs || []).forEach((j) => {
        const ts = j.started_at || j.created_at;
        if (ts && (now - new Date(ts).getTime()) < 15 * 60 * 1000) fresh.add(j.agente);
      });
      if (!cancelled) setRunning(fresh);
    }
    poll();
    const t = setInterval(poll, 5000);
    return () => { cancelled = true; clearInterval(t); };
  }, [streamId]);

  return (
    <Section title={`Stream · ${cfg.label}`}>
      <div className="px-3 pb-1">
        <p className="text-[10px] text-[#888] px-1 py-1">Agentes</p>
        <div className="space-y-1">
          {cfg.agentes.map((a) => {
            const isRunning = running.has(a.key);
            const estado = isRunning ? 'corriendo' : (a.key === 'lector' ? 'vigilando' : 'listo');
            return (
              <div key={a.key} className="flex items-center justify-between px-2 py-1.5 bg-brain-card rounded-md">
                <span className="flex items-center gap-1.5 text-[10px] text-[#ccc]">
                  <span className={`status-dot ${isRunning ? 'running' : 'ok'}`} />
                  {a.label}
                </span>
                <span className={`text-[9px] font-medium ${isRunning ? 'text-brain-warning' : 'text-brain-success'}`}>
                  {estado}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </Section>
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

// Toggle "auto-detectar oportunidades": guarda streams.auto_detectar. El watcher (backend) lo lee
// para disparar la detección al llegar un correo nuevo. Tolerante si la columna aún no existe.
function AutoDetectToggle({ streamId }: { streamId: string | null }) {
  const [on, setOn] = useState(false);
  useEffect(() => {
    if (!streamId) return;
    supabase.from('streams').select('*').eq('id', streamId).maybeSingle().then(({ data }) => {
      setOn(!!(data as { auto_detectar?: boolean } | null)?.auto_detectar);
    });
  }, [streamId]);
  async function toggle() {
    if (!streamId) return;
    const next = !on;
    setOn(next);
    const { error } = await supabase.from('streams').update({ auto_detectar: next }).eq('id', streamId);
    if (error) { console.error('[auto_detectar] update falló (¿falta la columna?):', error.message); setOn(!next); }
  }
  return (
    <div className="flex items-center justify-between px-4 py-2.5 border-b border-brain-card">
      <span className="text-[10px] text-[#ccc]">Auto-detectar oportunidades</span>
      <button
        onClick={toggle}
        aria-label="Auto-detectar oportunidades"
        className={`relative w-8 h-[18px] rounded-full transition-colors flex-shrink-0 ${on ? 'bg-[#4ade80]' : 'bg-[#444]'}`}
      >
        <span className={`absolute top-[3px] w-3 h-3 rounded-full bg-white transition-all ${on ? 'left-[17px]' : 'left-[3px]'}`} />
      </button>
    </div>
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
  const typeColor = { ok: 'text-[#ADFF2F]', warn: 'text-brain-warning', error: 'text-red-400' };

  return (
    <Section title="Logs en vivo">
      <div className="px-3 space-y-1.5 max-h-48 overflow-y-auto scrollbar-thin">
        {logs.length === 0 && (
          <p className="text-[10px] text-[#555] px-1 py-2">Sin actividad reciente</p>
        )}
        {logs.map((log) => (
          <div key={log.id} className="px-1 animate-fade-in">
            <div className="text-[9px] text-[#555] font-mono">{formatTime(log.created_at)}</div>
            <div className={`text-[10px] mt-0.5 font-mono ${typeColor[log.type] || 'text-[#ADFF2F]'}`}>
              {typeIcon[log.type] || ''} {log.msg}
            </div>
          </div>
        ))}
      </div>
    </Section>
  );
}

type AddMode = 'idle' | 'file' | 'link' | 'text';

function SourcesSection({ defaultSources, inventario }: { defaultSources?: Source[]; inventario?: TipoConfig['inventario'] }) {
  const baseDefaults = defaultSources ?? defaultFuentes;
  const [sources, setSources] = useState<Source[]>(baseDefaults);
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
            {i >= baseDefaults.length && (
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
      {inventario && <InventarioSection inventario={inventario} />}
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
