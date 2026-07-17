import { supabase } from './supabase';

/**
 * REACTIVACIÓN AUTOMÁTICA DEL SISTEMA
 * ===================================
 * Railway duerme el servicio de workers cuando no se usa (días sin actividad). Dormido, los jobs
 * se encolan y nadie los procesa: el usuario ve "no pasa nada" sin saber por qué.
 *
 * El cliente NUNCA debe entrar a Railway. Así que al iniciar sesión la app:
 *   1) mira el latido que escriben los workers (resource_status: workers/heartbeat),
 *   2) si está frío, le pega al endpoint de salud → ese tráfico HTTP despierta el servicio,
 *   3) espera a que el latido vuelva, y recién entonces deja trabajar.
 *
 * Para que el paso 2 funcione, el servicio de workers necesita un dominio público en Railway.
 * Esa URL va aquí abajo (setup de una sola vez; si está vacía, la app no rompe: solo no despierta).
 */
const WORKERS_URL = 'https://bubbly-wholeness-production-f13d.up.railway.app';

const HEARTBEAT_MAX_MIN = 3;   // los workers laten cada 60s
const ESPERA_MAX_S = 90;       // cuánto esperamos a que revivan tras el ping

export interface EstadoWorkers {
  dormidos: boolean;
  detalle: string;   // "7 días", "3 h", "10 min"
}

/** Lee el latido. Si NUNCA ha latido, NO reporta dormidos (evita falsas alarmas). */
export async function estadoWorkers(): Promise<EstadoWorkers> {
  try {
    const { data } = await supabase
      .from('resource_status')
      .select('actualizado_en')
      .eq('servicio', 'workers')
      .eq('metrica', 'heartbeat')
      .maybeSingle();

    if (!data?.actualizado_en) return { dormidos: false, detalle: '' };

    const mins = (Date.now() - new Date(data.actualizado_en).getTime()) / 60000;
    if (mins < HEARTBEAT_MAX_MIN) return { dormidos: false, detalle: '' };

    let detalle: string;
    if (mins < 120) detalle = `${Math.floor(mins)} min`;
    else if (mins < 48 * 60) detalle = `${Math.floor(mins / 60)} h`;
    else detalle = `${Math.floor(mins / 1440)} días`;
    return { dormidos: true, detalle };
  } catch {
    return { dormidos: false, detalle: '' }; // ante la duda, no estorbar
  }
}

const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Despierta el servicio: el GET al endpoint de salud es el tráfico que Railway necesita para
 * revivirlo. Luego espera a que el latido vuelva a estar fresco. Devuelve true si revivió.
 */
export async function despertarWorkers(): Promise<boolean> {
  if (!WORKERS_URL) return false;

  try {
    await fetch(`${WORKERS_URL}/health`, { mode: 'cors', cache: 'no-store' });
  } catch {
    // El primer ping suele fallar/tardar justo porque el contenedor está arrancando: no importa,
    // ya sirvió para despertarlo. Lo que manda es el latido de abajo.
  }

  const hasta = Date.now() + ESPERA_MAX_S * 1000;
  while (Date.now() < hasta) {
    await dormir(3000);
    const { dormidos } = await estadoWorkers();
    if (!dormidos) return true;
    try { await fetch(`${WORKERS_URL}/health`, { mode: 'cors', cache: 'no-store' }); } catch { /* reintento silencioso */ }
  }
  return false;
}
