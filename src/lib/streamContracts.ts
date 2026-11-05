// CONTRATO ESPEJO de los streams (backend: brain.mromasterpro/stream_contracts.py).
// Lo que el frontend puede crear o dibujar en un stream depende de SU tipo. El backend prueba que este archivo
// coincida con los contratos (test_tools_por_tipo.py); si se cambia uno, hay que cambiar el otro.

// Tipos que ejecutan el pipeline de búsqueda de producto/proveedores (proceso "pipeline_rfq").
export const TIPOS_PIPELINE_RFQ = ['busquedas', 'catalogo', 'generico'] as const;

// Widgets del pipeline de búsqueda de catálogo: SOLO se dibujan en los streams de arriba.
const WIDGETS_PIPELINE_RFQ = [
  'widget', 'decision', 'imagen_lista', 'imagen_fallida', 'parse_confirm', 'docs_parsed', 'rfq-status', 'rfq-log',
];
// El widget de lotes también lo usa la publicación masiva desde links (stream Productos).
const WIDGETS_LOTE = ['bulk-widget'];

export function puedeCrearRFQCatalogo(tipo?: string | null): boolean {
  return (TIPOS_PIPELINE_RFQ as readonly string[]).includes(tipo || '');
}

export function widgetPermitido(tipoStream: string | null | undefined, tipoMensaje: string): boolean {
  if (WIDGETS_PIPELINE_RFQ.includes(tipoMensaje)) return puedeCrearRFQCatalogo(tipoStream);
  if (WIDGETS_LOTE.includes(tipoMensaje)) return puedeCrearRFQCatalogo(tipoStream) || tipoStream === 'publicacion';
  return true;
}
