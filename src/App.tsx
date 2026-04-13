import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";

// ─── Tipos ─────────────────────────────────────────────────────────────────────
type DroneStatus = "Operativo" | "En mantenimiento";
type PilotStatus = "Activo" | "Pendiente de renovación";
type FlightStatus = "Planificado" | "Bloqueado" | "Ejecutado";
type PermitStatus = "Pendiente" | "En revisión" | "Aprobado" | "Rechazado";
type RiskLevel = "Bajo" | "Medio" | "Alto";
type ViewId = "dashboard" | "flota" | "pilotos" | "vuelos" | "permisos" | "reportes" | "administracion";

type DroneItem = {
  id: string;
  modelo: string;
  serie: string;
  estado: DroneStatus;
  bateria: number;
  base: string;
  horasUsoMinutos: number;
};

type PilotItem = {
  id: string;
  nombre: string;
  licencia: string;
  estado: PilotStatus;
  tiempoVueloMinutos: number;
};

type PermitItem = { tipo: string; estado: PermitStatus; observacion: string };
type CommentItem = { autor: string; texto: string; fecha: string };

type FlightItem = {
  id: string;
  fecha: string;
  zona: string;
  droneIds: string[];
  pilotoId: string;
  estado: FlightStatus;
  objetivo: string;
  duracionMinutos: number;
  riesgo: RiskLevel;
  permisoEstado: PermitStatus;
  comentarios: CommentItem[];
  permisos: PermitItem[];
};

type ReportFilters = { from: string; to: string; droneId: string; pilotId: string };

type SystemCustomization = {
  appTitle: string;
  appSubtitle: string;
  logoUrl: string;
  appsScriptUrl: string;
};

type AppPayload = {
  drones?: DroneItem[];
  pilots?: PilotItem[];
  flights?: FlightItem[];
  customization?: Partial<SystemCustomization>;
  categorias?: string[];
  modelosDron?: string[];
};

type GasResponse = {
  ok?: boolean;
  message?: string;
  error?: string;
  data?: AppPayload;
  result?: AppPayload;
};

// ─── Datos iniciales (demo) ────────────────────────────────────────────────────
const initialDrones: DroneItem[] = [
  { id: "DR-001", modelo: "DJI Matrice 300", serie: "M300-AX93", estado: "Operativo", bateria: 92, base: "Madrid Central", horasUsoMinutos: 4380 },
  { id: "DR-002", modelo: "Autel EVO Max 4T", serie: "AEM4T-551", estado: "En mantenimiento", bateria: 0, base: "Toledo Norte", horasUsoMinutos: 2215 },
];

const initialPilots: PilotItem[] = [
  { id: "PI-001", nombre: "Laura Gómez", licencia: "AESA-UAS-ADV-1221", estado: "Activo", tiempoVueloMinutos: 10080 },
  { id: "PI-002", nombre: "Carlos Martín", licencia: "AESA-UAS-OPEN-7611", estado: "Pendiente de renovación", tiempoVueloMinutos: 3660 },
];

const initialFlights: FlightItem[] = [
  {
    id: "VU-1001",
    fecha: "2026-04-15",
    zona: "Madrid - Polígono Sur",
    droneIds: ["DR-001"],
    pilotoId: "PI-001",
    estado: "Planificado",
    objetivo: "Inspección térmica de cubierta industrial",
    duracionMinutos: 35,
    riesgo: "Medio",
    permisoEstado: "En revisión",
    comentarios: [{ autor: "Operaciones", texto: "Pendiente validar NOTAM.", fecha: "2026-04-10" }],
    permisos: [
      { tipo: "NOTAM", estado: "Pendiente", observacion: "A la espera de confirmación." },
      { tipo: "Seguro operativo", estado: "Aprobado", observacion: "Cobertura vigente." },
    ],
  },
];

const defaultCustomization: SystemCustomization = {
  appTitle: "Gestión de flotas de drones",
  appSubtitle: "Conectado a Google Apps Script.",
  logoUrl: "",
  // ⚠️ Reemplaza esta URL con la de tu propio Apps Script desplegado
  appsScriptUrl: "",
};

// ─── Utilidades ────────────────────────────────────────────────────────────────
function formatMinutes(totalMinutes: number): string {
  const safe = Math.max(0, Math.round(totalMinutes));
  return `${Math.floor(safe / 60)} h ${String(safe % 60).padStart(2, "0")} min`;
}

function parseDurationToMinutes(value: string): number {
  const t = value.trim();
  if (!t) return 0;
  const parts = t.split(":");
  if (parts.length === 2) {
    const h = Number(parts[0]);
    const m = Number(parts[1]);
    if (!isNaN(h) && !isNaN(m)) return h * 60 + m;
  }
  const raw = Number(t);
  return isNaN(raw) ? 0 : raw;
}

function generateId(prefix: string, existing: string[]): string {
  let n = existing.length + 1;
  while (existing.includes(`${prefix}-${String(n).padStart(3, "0")}`)) n++;
  return `${prefix}-${String(n).padStart(3, "0")}`;
}

// ─── Comunicación con Google Apps Script ───────────────────────────────────────
function loadFromGasJsonp(url: string): Promise<GasResponse> {
  return new Promise((resolve, reject) => {
    const cbName = `gas_cb_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const script = document.createElement("script");
    let done = false;

    const cleanup = () => {
      done = true;
      script.remove();
      try { delete (window as Record<string, unknown>)[cbName]; } catch { /* ignore */ }
    };

    const timer = window.setTimeout(() => {
      if (done) return;
      cleanup();
      reject(new Error("Tiempo de espera agotado (15 s). Comprueba la URL de Apps Script."));
    }, 15000);

    (window as Record<string, unknown>)[cbName] = (res: GasResponse) => {
      window.clearTimeout(timer);
      cleanup();
      resolve(res);
    };

    script.onerror = () => {
      window.clearTimeout(timer);
      cleanup();
      reject(new Error("No se pudo cargar el script de Apps Script. Comprueba que está desplegado como Web App pública."));
    };

    const endpoint = new URL(url);
    endpoint.searchParams.set("action", "getInitialData");
    endpoint.searchParams.set("callback", cbName);
    script.src = endpoint.toString();
    document.body.appendChild(script);
  });
}

function saveToGasForm(url: string, payload: AppPayload): Promise<void> {
  return new Promise((resolve) => {
    const iframeName = `gas_frame_${Date.now()}`;
    const iframe = document.createElement("iframe");
    iframe.name = iframeName;
    iframe.style.display = "none";

    const form = document.createElement("form");
    form.method = "POST";
    form.action = url;
    form.target = iframeName;
    form.style.display = "none";

    const input = document.createElement("input");
    input.type = "hidden";
    input.name = "request";
    input.value = JSON.stringify({ action: "saveAllData", payload });
    form.appendChild(input);

    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      iframe.remove();
      form.remove();
      resolve();
    };

    // Resolvemos de todas formas tras 3 s (el iframe de Apps Script no siempre dispara onload)
    const timer = window.setTimeout(finish, 3000);
    iframe.onload = () => { window.clearTimeout(timer); finish(); };

    document.body.appendChild(iframe);
    document.body.appendChild(form);
    form.submit();
  });
}

// ─── Estilos base ──────────────────────────────────────────────────────────────
const S = {
  card: {
    background: "white",
    borderRadius: 20,
    padding: 20,
    border: "1px solid #e5e7eb",
    boxShadow: "0 4px 16px rgba(15,23,42,0.05)",
  } as React.CSSProperties,
  input: {
    width: "100%",
    padding: "10px 12px",
    borderRadius: 12,
    border: "1px solid #d1d5db",
    fontSize: 14,
    boxSizing: "border-box",
    background: "white",
  } as React.CSSProperties,
};

const BADGE: Record<string, React.CSSProperties> = {
  Operativo:               { background: "#dcfce7", color: "#166534" },
  "En mantenimiento":      { background: "#fef3c7", color: "#92400e" },
  Activo:                  { background: "#dcfce7", color: "#166534" },
  "Pendiente de renovación":{ background: "#fef3c7", color: "#92400e" },
  Planificado:             { background: "#dbeafe", color: "#1d4ed8" },
  Bloqueado:               { background: "#fee2e2", color: "#991b1b" },
  Ejecutado:               { background: "#dcfce7", color: "#166534" },
  Pendiente:               { background: "#fef3c7", color: "#92400e" },
  "En revisión":           { background: "#fde68a", color: "#92400e" },
  Aprobado:                { background: "#dcfce7", color: "#166534" },
  Rechazado:               { background: "#fee2e2", color: "#991b1b" },
  Bajo:                    { background: "#e0f2fe", color: "#075985" },
  Medio:                   { background: "#fef3c7", color: "#92400e" },
  Alto:                    { background: "#fee2e2", color: "#991b1b" },
};

function badge(status: string): React.CSSProperties {
  return {
    display: "inline-block",
    padding: "3px 10px",
    borderRadius: 999,
    fontSize: 12,
    fontWeight: 600,
    ...(BADGE[status] ?? { background: "#e5e7eb", color: "#334155" }),
  };
}

// ─── Componentes pequeños ──────────────────────────────────────────────────────
function Btn({
  children, onClick, variant = "primary", disabled = false, style = {},
}: {
  children: React.ReactNode;
  onClick?: () => void;
  variant?: "primary" | "secondary" | "danger";
  disabled?: boolean;
  style?: React.CSSProperties;
}) {
  const base: React.CSSProperties = {
    padding: "9px 16px",
    borderRadius: 12,
    fontWeight: 600,
    fontSize: 14,
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.6 : 1,
    transition: "opacity 0.15s",
    whiteSpace: "nowrap",
  };
  const variants: Record<string, React.CSSProperties> = {
    primary: { background: "#0f172a", color: "white", border: "1px solid #0f172a" },
    secondary: { background: "white", color: "#0f172a", border: "1px solid #cbd5e1" },
    danger: { background: "#fee2e2", color: "#991b1b", border: "1px solid #fca5a5" },
  };
  return <button onClick={onClick} disabled={disabled} style={{ ...base, ...variants[variant], ...style }}>{children}</button>;
}

function Label({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 12, fontWeight: 600, color: "#64748b", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.05em" }}>{children}</div>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function SectionTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>{title}</h2>
      {subtitle && <p style={{ margin: "5px 0 0", color: "#64748b", fontSize: 14 }}>{subtitle}</p>}
    </div>
  );
}

function StatCard({ label, value, color = "#0f172a" }: { label: string; value: string; color?: string }) {
  return (
    <div style={S.card}>
      <div style={{ fontSize: 13, color: "#64748b", fontWeight: 500 }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 800, marginTop: 6, color }}>{value}</div>
    </div>
  );
}

function Alert({ type, children }: { type: "error" | "warning" | "success"; children: React.ReactNode }) {
  const styles: Record<string, React.CSSProperties> = {
    error:   { background: "#fee2e2", border: "1px solid #fca5a5", color: "#991b1b" },
    warning: { background: "#fef3c7", border: "1px solid #fcd34d", color: "#92400e" },
    success: { background: "#dcfce7", border: "1px solid #86efac", color: "#166534" },
  };
  return (
    <div style={{ ...styles[type], borderRadius: 12, padding: "10px 14px", fontSize: 13, fontWeight: 500 }}>
      {children}
    </div>
  );
}

// ─── App principal ─────────────────────────────────────────────────────────────
export default function App() {
  const [view, setView] = useState<ViewId>("dashboard");
  const [drones, setDrones] = useState<DroneItem[]>(initialDrones);
  const [pilots, setPilots] = useState<PilotItem[]>(initialPilots);
  const [flights, setFlights] = useState<FlightItem[]>(initialFlights);
  const [customization, setCustomization] = useState<SystemCustomization>(defaultCustomization);
  const [categorias, setCategorias] = useState<string[]>(["Inspección", "Topografía", "Seguridad", "Cinematografía"]);
  const [modelosDron, setModelosDron] = useState<string[]>(["DJI Matrice 300", "Autel EVO Max 4T", "DJI Mavic 3E"]);

  // Estado de sincronización
  const [syncStatus, setSyncStatus] = useState<string>("");
  const [syncType, setSyncType] = useState<"idle" | "loading" | "saving" | "ok" | "error">("idle");
  const [hasLoadedCloud, setHasLoadedCloud] = useState(false);
  const autoLoadDoneRef = useRef(false);
  const autosaveTimer = useRef<number | null>(null);

  // Formularios
  const [search, setSearch] = useState("");
  const [selectedFlightId, setSelectedFlightId] = useState(initialFlights[0]?.id ?? "");
  const [commentDraft, setCommentDraft] = useState("");

  // Dron form
  const [fDroneId, setFDroneId] = useState("");
  const [fDroneModel, setFDroneModel] = useState("");
  const [fDroneSerie, setFDroneSerie] = useState("");
  const [fDroneBase, setFDroneBase] = useState("");

  // Piloto form
  const [fPilotId, setFPilotId] = useState("");
  const [fPilotName, setFPilotName] = useState("");
  const [fPilotLicencia, setFPilotLicencia] = useState("");

  // Vuelo form
  const [fFlightDate, setFFlightDate] = useState("");
  const [fFlightZone, setFFlightZone] = useState("");
  const [fFlightPilotId, setFFlightPilotId] = useState("");
  const [fFlightDuration, setFFlightDuration] = useState("00:30");
  const [fFlightDroneIds, setFFlightDroneIds] = useState<string[]>([]);
  const [fFlightObjetivo, setFFlightObjetivo] = useState("");
  const [fFlightRiesgo, setFFlightRiesgo] = useState<RiskLevel>("Bajo");

  // Admin
  const [fCategoria, setFCategoria] = useState("");
  const [fModelo, setFModelo] = useState("");

  // Permiso form
  const [fPermisoTipo, setFPermisoTipo] = useState("");
  const [fPermisoObs, setFPermisoObs] = useState("");

  // ── Cloud sync ──────────────────────────────────────────────────────────────
  const loadFromCloud = useCallback(async () => {
    const url = customization.appsScriptUrl.trim();
    if (!url) {
      setSyncStatus("Sin URL de Apps Script configurada. Los datos son locales.");
      setSyncType("idle");
      return;
    }
    setSyncType("loading");
    setSyncStatus("Cargando datos desde Google Apps Script…");
    try {
      const res = await loadFromGasJsonp(url);
      if (res.ok === false) throw new Error(res.error ?? "Apps Script devolvió un error");
      const data = res.data ?? res.result;
      if (data?.drones && data.drones.length) setDrones(data.drones);
      if (data?.pilots && data.pilots.length) setPilots(data.pilots);
      if (data?.flights && data.flights.length) {
        setFlights(data.flights);
        setSelectedFlightId(data.flights[0]?.id ?? "");
      }
      if (data?.customization) setCustomization((p) => ({ ...p, ...data.customization }));
      if (data?.categorias?.length) setCategorias(data.categorias);
      if (data?.modelosDron?.length) setModelosDron(data.modelosDron);
      setHasLoadedCloud(true);
      setSyncType("ok");
      setSyncStatus(res.message ?? "Datos sincronizados correctamente");
    } catch (err) {
      setSyncType("error");
      setSyncStatus(err instanceof Error ? err.message : "Error desconocido al cargar");
    }
  }, [customization.appsScriptUrl]);

  const saveToCloud = useCallback(async (msg = "Guardando en Google Apps Script…") => {
    const url = customization.appsScriptUrl.trim();
    if (!url) return;
    setSyncType("saving");
    setSyncStatus(msg);
    try {
      await saveToGasForm(url, { drones, pilots, flights, customization, categorias, modelosDron });
      setSyncType("ok");
      setSyncStatus("Guardado correctamente en Google Apps Script");
    } catch (err) {
      setSyncType("error");
      setSyncStatus(err instanceof Error ? err.message : "Error al guardar");
    }
  }, [customization, drones, pilots, flights, categorias, modelosDron]);

  // Auto-carga inicial
  useEffect(() => {
    if (autoLoadDoneRef.current || !customization.appsScriptUrl.trim()) return;
    autoLoadDoneRef.current = true;
    void loadFromCloud();
  }, [customization.appsScriptUrl, loadFromCloud]);

  // Guardado automático (solo después de la carga inicial)
  useEffect(() => {
    if (!hasLoadedCloud || !customization.appsScriptUrl.trim()) return;
    if (autosaveTimer.current) window.clearTimeout(autosaveTimer.current);
    autosaveTimer.current = window.setTimeout(() => {
      void saveToCloud("Autoguardado en Google Apps Script…");
    }, 2000); // 2 s de debounce (más seguro que 1.2 s)
    return () => { if (autosaveTimer.current) window.clearTimeout(autosaveTimer.current); };
  }, [drones, pilots, flights, customization, categorias, modelosDron, hasLoadedCloud, saveToCloud]);

  // ── Derivados ───────────────────────────────────────────────────────────────
  const selectedFlight = flights.find((f) => f.id === selectedFlightId) ?? flights[0] ?? null;

  const filteredFlights = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return flights;
    return flights.filter((f) =>
      [f.id, f.zona, f.objetivo, f.estado, f.riesgo].join(" ").toLowerCase().includes(term)
    );
  }, [flights, search]);

  const [reportFilters, setReportFilters] = useState<ReportFilters>({ from: "", to: "", droneId: "all", pilotId: "all" });
  const reportFlights = useMemo(() =>
    flights.filter((f) => {
      if (reportFilters.from && f.fecha < reportFilters.from) return false;
      if (reportFilters.to && f.fecha > reportFilters.to) return false;
      if (reportFilters.droneId !== "all" && !f.droneIds.includes(reportFilters.droneId)) return false;
      if (reportFilters.pilotId !== "all" && f.pilotoId !== reportFilters.pilotId) return false;
      return true;
    }),
    [flights, reportFilters]
  );

  const metrics = useMemo(() => ({
    dronesOperativos: drones.filter((d) => d.estado === "Operativo").length,
    pilotosActivos: pilots.filter((p) => p.estado === "Activo").length,
    vuelosPlanificados: flights.filter((f) => f.estado === "Planificado").length,
    permisosPendientes: flights.reduce((a, f) => a + f.permisos.filter((p) => p.estado !== "Aprobado").length, 0),
  }), [drones, pilots, flights]);

  const droneRanking = useMemo(() => [...drones].sort((a, b) => b.horasUsoMinutos - a.horasUsoMinutos), [drones]);
  const pilotRanking = useMemo(() => [...pilots].sort((a, b) => b.tiempoVueloMinutos - a.tiempoVueloMinutos), [pilots]);
  const reportSummary = useMemo(() => {
    const total = reportFlights.reduce((a, f) => a + f.duracionMinutos, 0);
    return { total, avg: reportFlights.length ? Math.round(total / reportFlights.length) : 0, count: reportFlights.length };
  }, [reportFlights]);

  // ── Acciones ─────────────────────────────────────────────────────────────────
  const addDrone = () => {
    if (!fDroneModel.trim()) return;
    const id = fDroneId.trim() || generateId("DR", drones.map((d) => d.id));
    if (drones.find((d) => d.id === id)) { alert(`El ID ${id} ya existe`); return; }
    setDrones((p) => [{ id, modelo: fDroneModel.trim(), serie: fDroneSerie.trim(), estado: "Operativo", bateria: 100, base: fDroneBase.trim(), horasUsoMinutos: 0 }, ...p]);
    setFDroneId(""); setFDroneModel(""); setFDroneSerie(""); setFDroneBase("");
  };

  const removeDrone = (id: string) => {
    if (!confirm(`¿Eliminar el dron ${id}?`)) return;
    setDrones((p) => p.filter((d) => d.id !== id));
  };

  const addPilot = () => {
    if (!fPilotName.trim()) return;
    const id = fPilotId.trim() || generateId("PI", pilots.map((p) => p.id));
    if (pilots.find((p) => p.id === id)) { alert(`El ID ${id} ya existe`); return; }
    setPilots((p) => [{ id, nombre: fPilotName.trim(), licencia: fPilotLicencia.trim(), estado: "Activo", tiempoVueloMinutos: 0 }, ...p]);
    setFPilotId(""); setFPilotName(""); setFPilotLicencia("");
  };

  const removePilot = (id: string) => {
    if (!confirm(`¿Eliminar al piloto ${id}?`)) return;
    setPilots((p) => p.filter((pilot) => pilot.id !== id));
  };

  const addFlight = () => {
    const dur = parseDurationToMinutes(fFlightDuration);
    if (!fFlightDate || !fFlightZone.trim() || !fFlightPilotId || !fFlightDroneIds.length || dur <= 0) {
      alert("Rellena todos los campos del vuelo (fecha, zona, piloto, drones y duración > 0)");
      return;
    }
    const id = generateId("VU", flights.map((f) => f.id));
    const flight: FlightItem = {
      id,
      fecha: fFlightDate,
      zona: fFlightZone.trim(),
      droneIds: fFlightDroneIds,
      pilotoId: fFlightPilotId,
      estado: "Planificado",
      objetivo: fFlightObjetivo.trim() || "Nuevo vuelo",
      duracionMinutos: dur,
      riesgo: fFlightRiesgo,
      permisoEstado: "Pendiente",
      comentarios: [],
      permisos: [],
    };
    setFlights((p) => [flight, ...p]);
    setDrones((p) => p.map((d) => fFlightDroneIds.includes(d.id) ? { ...d, horasUsoMinutos: d.horasUsoMinutos + dur } : d));
    setPilots((p) => p.map((pilot) => pilot.id === fFlightPilotId ? { ...pilot, tiempoVueloMinutos: pilot.tiempoVueloMinutos + dur } : pilot));
    setSelectedFlightId(id);
    setFFlightDate(""); setFFlightZone(""); setFFlightPilotId(""); setFFlightDuration("00:30");
    setFFlightDroneIds([]); setFFlightObjetivo(""); setFFlightRiesgo("Bajo");
    setView("vuelos");
  };

  const updateFlightStatus = (flightId: string, estado: FlightStatus) => {
    setFlights((p) => p.map((f) => f.id === flightId ? { ...f, estado } : f));
  };

  const addComment = () => {
    if (!selectedFlight || !commentDraft.trim()) return;
    setFlights((p) => p.map((f) => f.id === selectedFlight.id
      ? { ...f, comentarios: [...f.comentarios, { autor: "Operador", texto: commentDraft.trim(), fecha: new Date().toISOString().slice(0, 10) }] }
      : f
    ));
    setCommentDraft("");
  };

  const addPermiso = () => {
    if (!selectedFlight || !fPermisoTipo.trim()) return;
    setFlights((p) => p.map((f) => {
      if (f.id !== selectedFlight.id) return f;
      const permisos = [...f.permisos, { tipo: fPermisoTipo.trim(), estado: "Pendiente" as PermitStatus, observacion: fPermisoObs.trim() }];
      const permisoEstado = permisos.some((pp) => pp.estado === "Rechazado") ? "Rechazado"
        : permisos.some((pp) => pp.estado === "Pendiente" || pp.estado === "En revisión") ? "En revisión"
        : "Aprobado";
      return { ...f, permisos, permisoEstado };
    }));
    setFPermisoTipo(""); setFPermisoObs("");
  };

  const updatePermiso = (flightId: string, idx: number, estado: PermitStatus) => {
    setFlights((p) => p.map((f) => {
      if (f.id !== flightId) return f;
      const permisos = f.permisos.map((pp, i) => i === idx ? { ...pp, estado } : pp);
      const permisoEstado = permisos.some((pp) => pp.estado === "Rechazado") ? "Rechazado"
        : permisos.some((pp) => pp.estado === "Pendiente" || pp.estado === "En revisión") ? "En revisión"
        : "Aprobado";
      return { ...f, permisos, permisoEstado };
    }));
  };

  const addCategoria = () => {
    if (!fCategoria.trim() || categorias.includes(fCategoria.trim())) return;
    setCategorias((p) => [...p, fCategoria.trim()]);
    setFCategoria("");
  };

  const addModelo = () => {
    if (!fModelo.trim() || modelosDron.includes(fModelo.trim())) return;
    setModelosDron((p) => [...p, fModelo.trim()]);
    setFModelo("");
  };

  // ── Nav ──────────────────────────────────────────────────────────────────────
  const navItems: Array<{ id: ViewId; icon: string; label: string }> = [
    { id: "dashboard",      icon: "◉", label: "Dashboard" },
    { id: "flota",          icon: "✦", label: "Flota" },
    { id: "pilotos",        icon: "◈", label: "Pilotos" },
    { id: "vuelos",         icon: "◆", label: "Vuelos" },
    { id: "permisos",       icon: "◇", label: "Permisos" },
    { id: "reportes",       icon: "▤", label: "Reportes" },
    { id: "administracion", icon: "◎", label: "Administración" },
  ];

  const syncColor = syncType === "error" ? "#991b1b" : syncType === "ok" ? "#166534" : "#64748b";

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: "100vh", background: "#f1f5f9", padding: 16, fontFamily: "Inter, system-ui, Arial, sans-serif", color: "#0f172a" }}>
      <div style={{ maxWidth: 1400, margin: "0 auto", display: "grid", gap: 20, gridTemplateColumns: "240px minmax(0,1fr)" }}>

        {/* ── Sidebar ──────────────────────────────────────────────────────── */}
        <aside style={{ ...S.card, alignSelf: "start", position: "sticky", top: 16, padding: 0, overflow: "hidden" }}>
          <div style={{ background: "#0f172a", color: "white", padding: "20px 20px 16px" }}>
            <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
              {customization.logoUrl ? (
                <img src={customization.logoUrl} alt="Logo" style={{ width: 44, height: 44, borderRadius: 14, objectFit: "cover" }} />
              ) : (
                <div style={{ width: 44, height: 44, borderRadius: 14, background: "rgba(255,255,255,0.12)", display: "grid", placeItems: "center", fontSize: 22 }}>🚁</div>
              )}
              <div>
                <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.2em", color: "#94a3b8" }}>Studio UAS</div>
                <div style={{ fontSize: 16, fontWeight: 700 }}>Centro de Ops</div>
              </div>
            </div>
            {customization.appSubtitle && (
              <p style={{ margin: "12px 0 0", color: "#94a3b8", fontSize: 12, lineHeight: 1.5 }}>{customization.appSubtitle}</p>
            )}
          </div>
          <div style={{ padding: "12px 12px" }}>
            {navItems.map((item) => {
              const active = view === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setView(item.id)}
                  style={{
                    display: "flex", alignItems: "center", gap: 10, width: "100%",
                    padding: "10px 12px", marginBottom: 4, borderRadius: 12, border: "none",
                    background: active ? "#0f172a" : "transparent",
                    color: active ? "white" : "#475569",
                    fontWeight: active ? 700 : 500, fontSize: 14, cursor: "pointer",
                    textAlign: "left",
                  }}
                >
                  <span style={{ fontSize: 12 }}>{item.icon}</span>
                  {item.label}
                </button>
              );
            })}
          </div>
        </aside>

        {/* ── Main ─────────────────────────────────────────────────────────── */}
        <main style={{ display: "grid", gap: 20 }}>

          {/* Header */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, flexWrap: "wrap" }}>
            <div>
              <div style={{ fontSize: 12, color: "#94a3b8", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.1em" }}>Panel operativo</div>
              <h1 style={{ margin: "4px 0 0", fontSize: 28, fontWeight: 800 }}>{customization.appTitle}</h1>
              {syncStatus && (
                <div style={{ marginTop: 6, fontSize: 12, color: syncColor, fontWeight: 500 }}>
                  {syncType === "loading" || syncType === "saving" ? "⟳ " : syncType === "ok" ? "✓ " : syncType === "error" ? "✗ " : ""}
                  {syncStatus}
                </div>
              )}
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <input
                style={{ ...S.input, maxWidth: 220 }}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="🔍  Buscar vuelos…"
              />
              <Btn variant="secondary" onClick={() => void loadFromCloud()} disabled={syncType === "loading" || syncType === "saving"}>
                {syncType === "loading" ? "Cargando…" : "Recargar"}
              </Btn>
              <Btn onClick={() => void saveToCloud()} disabled={syncType === "loading" || syncType === "saving"}>
                {syncType === "saving" ? "Guardando…" : "Guardar"}
              </Btn>
            </div>
          </div>

          {/* Stats */}
          <div style={{ display: "grid", gap: 14, gridTemplateColumns: "repeat(4, minmax(0,1fr))" }}>
            <StatCard label="Drones operativos"  value={String(metrics.dronesOperativos)} color="#0f172a" />
            <StatCard label="Pilotos activos"    value={String(metrics.pilotosActivos)} color="#1d4ed8" />
            <StatCard label="Vuelos planificados" value={String(metrics.vuelosPlanificados)} color="#0369a1" />
            <StatCard label="Permisos abiertos"  value={String(metrics.permisosPendientes)} color={metrics.permisosPendientes > 0 ? "#b45309" : "#166534"} />
          </div>

          {/* Error banner si no hay URL configurada */}
          {!customization.appsScriptUrl.trim() && (
            <Alert type="warning">
              ⚠️ No hay URL de Google Apps Script configurada. Los datos no se guardarán en la nube. Ve a <strong>Administración</strong> para configurarla.
            </Alert>
          )}

          {/* ── Vistas ─────────────────────────────────────────────────────── */}

          {/* DASHBOARD */}
          {view === "dashboard" && (
            <div style={S.card}>
              <SectionTitle title="Próximas operaciones" subtitle="Resumen ejecutivo de vuelos activos." />
              {filteredFlights.length === 0 && <p style={{ color: "#64748b" }}>No hay vuelos que coincidan con la búsqueda.</p>}
              <div style={{ display: "grid", gap: 12 }}>
                {filteredFlights.map((flight) => (
                  <button
                    key={flight.id}
                    onClick={() => { setSelectedFlightId(flight.id); setView("vuelos"); }}
                    style={{ ...S.card, textAlign: "left", padding: 14, cursor: "pointer", border: selectedFlightId === flight.id ? "2px solid #0f172a" : "1px solid #e5e7eb" }}
                  >
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                      <strong style={{ fontSize: 15 }}>{flight.id}</strong>
                      <span style={badge(flight.estado)}>{flight.estado}</span>
                      <span style={badge(flight.riesgo)}>{flight.riesgo}</span>
                      <span style={badge(flight.permisoEstado)}>{flight.permisoEstado}</span>
                    </div>
                    <div style={{ marginTop: 8, fontWeight: 500 }}>{flight.objetivo}</div>
                    <div style={{ marginTop: 6, fontSize: 13, color: "#64748b" }}>
                      {flight.fecha} · {flight.zona} · {formatMinutes(flight.duracionMinutos)}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* FLOTA */}
          {view === "flota" && (
            <div style={{ display: "grid", gap: 20 }}>
              <div style={S.card}>
                <SectionTitle title="Añadir dron" />
                <div style={{ display: "grid", gap: 12, gridTemplateColumns: "1fr 1fr" }}>
                  <Field label="ID (opcional, se genera solo)">
                    <input style={S.input} placeholder="DR-003" value={fDroneId} onChange={(e) => setFDroneId(e.target.value)} />
                  </Field>
                  <Field label="Modelo *">
                    <input style={S.input} placeholder="DJI Matrice 350" value={fDroneModel} onChange={(e) => setFDroneModel(e.target.value)} list="modelos-list" />
                    <datalist id="modelos-list">{modelosDron.map((m) => <option key={m} value={m} />)}</datalist>
                  </Field>
                  <Field label="Número de serie">
                    <input style={S.input} placeholder="M350-XX000" value={fDroneSerie} onChange={(e) => setFDroneSerie(e.target.value)} />
                  </Field>
                  <Field label="Base de operaciones">
                    <input style={S.input} placeholder="Madrid Central" value={fDroneBase} onChange={(e) => setFDroneBase(e.target.value)} />
                  </Field>
                </div>
                <div style={{ marginTop: 14 }}>
                  <Btn onClick={addDrone}>Añadir dron</Btn>
                </div>
              </div>

              <div style={{ display: "grid", gap: 14, gridTemplateColumns: "repeat(2, minmax(0,1fr))" }}>
                {drones.map((drone) => (
                  <div key={drone.id} style={S.card}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                      <div>
                        <h3 style={{ margin: 0, fontSize: 16 }}>{drone.modelo}</h3>
                        <div style={{ color: "#64748b", fontSize: 13, marginTop: 2 }}>{drone.id} · {drone.serie || "Sin serie"}</div>
                      </div>
                      <span style={badge(drone.estado)}>{drone.estado}</span>
                    </div>
                    <div style={{ marginTop: 12, display: "grid", gap: 6, fontSize: 14 }}>
                      <div><strong>Horas de uso:</strong> {formatMinutes(drone.horasUsoMinutos)}</div>
                      <div><strong>Base:</strong> {drone.base || "Sin asignar"}</div>
                      <div><strong>Batería:</strong> {drone.bateria}%</div>
                    </div>
                    <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
                      <Btn variant="secondary" onClick={() => setDrones((p) => p.map((d) => d.id === drone.id ? { ...d, estado: d.estado === "Operativo" ? "En mantenimiento" : "Operativo" } : d))}>
                        {drone.estado === "Operativo" ? "Poner en mantenimiento" : "Marcar operativo"}
                      </Btn>
                      <Btn variant="danger" onClick={() => removeDrone(drone.id)}>Eliminar</Btn>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* PILOTOS */}
          {view === "pilotos" && (
            <div style={{ display: "grid", gap: 20 }}>
              <div style={S.card}>
                <SectionTitle title="Añadir piloto" />
                <div style={{ display: "grid", gap: 12, gridTemplateColumns: "1fr 1fr" }}>
                  <Field label="ID (opcional)">
                    <input style={S.input} placeholder="PI-003" value={fPilotId} onChange={(e) => setFPilotId(e.target.value)} />
                  </Field>
                  <Field label="Nombre completo *">
                    <input style={S.input} placeholder="Ana García" value={fPilotName} onChange={(e) => setFPilotName(e.target.value)} />
                  </Field>
                  <Field label="Número de licencia AESA" style={{ gridColumn: "1 / -1" }}>
                    <input style={S.input} placeholder="AESA-UAS-ADV-XXXX" value={fPilotLicencia} onChange={(e) => setFPilotLicencia(e.target.value)} />
                  </Field>
                </div>
                <div style={{ marginTop: 14 }}><Btn onClick={addPilot}>Añadir piloto</Btn></div>
              </div>

              <div style={{ display: "grid", gap: 14, gridTemplateColumns: "repeat(2, minmax(0,1fr))" }}>
                {pilots.map((pilot) => (
                  <div key={pilot.id} style={S.card}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                      <div>
                        <h3 style={{ margin: 0, fontSize: 16 }}>{pilot.nombre}</h3>
                        <div style={{ color: "#64748b", fontSize: 13, marginTop: 2 }}>{pilot.id} · {pilot.licencia || "Sin licencia"}</div>
                      </div>
                      <span style={badge(pilot.estado)}>{pilot.estado}</span>
                    </div>
                    <div style={{ marginTop: 12, fontSize: 14 }}>
                      <strong>Tiempo volado:</strong> {formatMinutes(pilot.tiempoVueloMinutos)}
                    </div>
                    <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
                      <Btn variant="secondary" onClick={() => setPilots((p) => p.map((pl) => pl.id === pilot.id ? { ...pl, estado: pl.estado === "Activo" ? "Pendiente de renovación" : "Activo" } : pl))}>
                        {pilot.estado === "Activo" ? "Marcar renovación" : "Marcar activo"}
                      </Btn>
                      <Btn variant="danger" onClick={() => removePilot(pilot.id)}>Eliminar</Btn>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* VUELOS */}
          {view === "vuelos" && (
            <div style={{ display: "grid", gap: 20 }}>
              <div style={S.card}>
                <SectionTitle title="Planificar vuelo" />
                <div style={{ display: "grid", gap: 12, gridTemplateColumns: "1fr 1fr" }}>
                  <Field label="Fecha *">
                    <input style={S.input} type="date" value={fFlightDate} onChange={(e) => setFFlightDate(e.target.value)} />
                  </Field>
                  <Field label="Duración (hh:mm) *">
                    <input style={S.input} placeholder="00:30" value={fFlightDuration} onChange={(e) => setFFlightDuration(e.target.value)} />
                  </Field>
                  <Field label="Zona de operación *" style={{ gridColumn: "1 / -1" }}>
                    <input style={S.input} placeholder="Madrid – Polígono Norte" value={fFlightZone} onChange={(e) => setFFlightZone(e.target.value)} />
                  </Field>
                  <Field label="Objetivo">
                    <input style={S.input} placeholder="Inspección de cubierta" value={fFlightObjetivo} onChange={(e) => setFFlightObjetivo(e.target.value)} list="cat-list" />
                    <datalist id="cat-list">{categorias.map((c) => <option key={c} value={c} />)}</datalist>
                  </Field>
                  <Field label="Nivel de riesgo">
                    <select style={S.input} value={fFlightRiesgo} onChange={(e) => setFFlightRiesgo(e.target.value as RiskLevel)}>
                      <option value="Bajo">Bajo</option>
                      <option value="Medio">Medio</option>
                      <option value="Alto">Alto</option>
                    </select>
                  </Field>
                  <Field label="Piloto *" style={{ gridColumn: "1 / -1" }}>
                    <select style={S.input} value={fFlightPilotId} onChange={(e) => setFFlightPilotId(e.target.value)}>
                      <option value="">Selecciona piloto</option>
                      {pilots.map((p) => <option key={p.id} value={p.id}>{p.id} · {p.nombre}</option>)}
                    </select>
                  </Field>
                  <div style={{ gridColumn: "1 / -1" }}>
                    <Label>Drones *</Label>
                    <div style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(2, minmax(0,1fr))" }}>
                      {drones.map((drone) => (
                        <label key={drone.id} style={{ border: "1px solid #d1d5db", borderRadius: 12, padding: "10px 12px", background: "#f8fafc", display: "flex", gap: 10, alignItems: "center", cursor: "pointer" }}>
                          <input type="checkbox" checked={fFlightDroneIds.includes(drone.id)} onChange={(e) => setFFlightDroneIds((p) => e.target.checked ? [...p, drone.id] : p.filter((id) => id !== drone.id))} />
                          <div>
                            <div style={{ fontWeight: 600, fontSize: 13 }}>{drone.id}</div>
                            <div style={{ fontSize: 12, color: "#64748b" }}>{drone.modelo}</div>
                          </div>
                          <span style={{ ...badge(drone.estado), marginLeft: "auto" }}>{drone.estado}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
                <div style={{ marginTop: 14 }}><Btn onClick={addFlight}>Planificar vuelo</Btn></div>
              </div>

              <div style={{ display: "grid", gap: 20, gridTemplateColumns: "1fr 1fr" }}>
                {/* Lista */}
                <div style={S.card}>
                  <SectionTitle title="Listado de vuelos" />
                  {filteredFlights.length === 0 && <p style={{ color: "#64748b" }}>Sin vuelos.</p>}
                  <div style={{ display: "grid", gap: 10 }}>
                    {filteredFlights.map((flight) => (
                      <button
                        key={flight.id}
                        onClick={() => setSelectedFlightId(flight.id)}
                        style={{
                          ...S.card, textAlign: "left", padding: 12, cursor: "pointer",
                          border: selectedFlightId === flight.id ? "2px solid #0f172a" : "1px solid #e5e7eb",
                        }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <strong>{flight.id}</strong>
                          <span style={badge(flight.estado)}>{flight.estado}</span>
                        </div>
                        <div style={{ marginTop: 6, fontSize: 13, color: "#475569" }}>{flight.objetivo}</div>
                        <div style={{ marginTop: 4, fontSize: 12, color: "#94a3b8" }}>{flight.fecha} · {flight.zona}</div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Detalle */}
                <div style={S.card}>
                  <SectionTitle title="Detalle del vuelo" />
                  {selectedFlight ? (
                    <>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                        <strong style={{ fontSize: 16 }}>{selectedFlight.id}</strong>
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                          <span style={badge(selectedFlight.estado)}>{selectedFlight.estado}</span>
                          <span style={badge(selectedFlight.riesgo)}>{selectedFlight.riesgo}</span>
                        </div>
                      </div>
                      <p style={{ margin: "10px 0", fontWeight: 500 }}>{selectedFlight.objetivo}</p>
                      <div style={{ display: "grid", gap: 6, fontSize: 14, color: "#475569" }}>
                        <div><strong>Fecha:</strong> {selectedFlight.fecha}</div>
                        <div><strong>Zona:</strong> {selectedFlight.zona}</div>
                        <div><strong>Duración:</strong> {formatMinutes(selectedFlight.duracionMinutos)}</div>
                        <div><strong>Piloto:</strong> {pilots.find((p) => p.id === selectedFlight.pilotoId)?.nombre ?? selectedFlight.pilotoId}</div>
                        <div><strong>Drones:</strong> {selectedFlight.droneIds.join(", ")}</div>
                        <div><strong>Permisos:</strong> <span style={badge(selectedFlight.permisoEstado)}>{selectedFlight.permisoEstado}</span></div>
                      </div>
                      {/* Cambio de estado */}
                      <div style={{ marginTop: 14, display: "flex", gap: 8, flexWrap: "wrap" }}>
                        {(["Planificado", "Bloqueado", "Ejecutado"] as FlightStatus[]).map((s) => (
                          <Btn key={s} variant={selectedFlight.estado === s ? "primary" : "secondary"} onClick={() => updateFlightStatus(selectedFlight.id, s)} style={{ fontSize: 12, padding: "6px 12px" }}>
                            {s}
                          </Btn>
                        ))}
                      </div>
                      {/* Comentarios */}
                      <div style={{ marginTop: 16, borderTop: "1px solid #e5e7eb", paddingTop: 14 }}>
                        <Label>Comentarios operativos</Label>
                        {selectedFlight.comentarios.map((c, i) => (
                          <div key={i} style={{ marginBottom: 8, padding: "8px 10px", background: "#f8fafc", borderRadius: 10, fontSize: 13 }}>
                            <div style={{ fontWeight: 600 }}>{c.autor} <span style={{ color: "#94a3b8", fontWeight: 400 }}>{c.fecha}</span></div>
                            <div style={{ marginTop: 2, color: "#475569" }}>{c.texto}</div>
                          </div>
                        ))}
                        <textarea style={{ ...S.input, minHeight: 80, marginTop: 8 }} placeholder="Añadir comentario…" value={commentDraft} onChange={(e) => setCommentDraft(e.target.value)} />
                        <div style={{ marginTop: 8 }}><Btn onClick={addComment}>Añadir comentario</Btn></div>
                      </div>
                    </>
                  ) : (
                    <p style={{ color: "#64748b" }}>Selecciona un vuelo de la lista.</p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* PERMISOS */}
          {view === "permisos" && (
            <div style={{ display: "grid", gap: 20 }}>
              {/* Selector de vuelo */}
              <div style={S.card}>
                <SectionTitle title="Gestión de permisos" subtitle="Selecciona el vuelo y gestiona sus permisos regulatorios." />
                <Field label="Vuelo">
                  <select style={S.input} value={selectedFlightId} onChange={(e) => setSelectedFlightId(e.target.value)}>
                    {flights.map((f) => <option key={f.id} value={f.id}>{f.id} – {f.zona} ({f.fecha})</option>)}
                  </select>
                </Field>
              </div>

              {selectedFlight && (
                <div style={{ display: "grid", gap: 20, gridTemplateColumns: "1fr 1fr" }}>
                  <div style={S.card}>
                    <SectionTitle title="Permisos del vuelo" />
                    {selectedFlight.permisos.length === 0 && <p style={{ color: "#64748b" }}>Sin permisos registrados.</p>}
                    {selectedFlight.permisos.map((p, idx) => (
                      <div key={idx} style={{ border: "1px solid #e5e7eb", borderRadius: 14, padding: 12, background: "#f8fafc", marginBottom: 10 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <strong>{p.tipo}</strong>
                          <span style={badge(p.estado)}>{p.estado}</span>
                        </div>
                        {p.observacion && <div style={{ marginTop: 6, fontSize: 13, color: "#475569" }}>{p.observacion}</div>}
                        <div style={{ marginTop: 10, display: "flex", gap: 6, flexWrap: "wrap" }}>
                          {(["Pendiente", "En revisión", "Aprobado", "Rechazado"] as PermitStatus[]).map((s) => (
                            <Btn key={s} variant={p.estado === s ? "primary" : "secondary"} onClick={() => updatePermiso(selectedFlight.id, idx, s)} style={{ fontSize: 11, padding: "4px 10px" }}>
                              {s}
                            </Btn>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>

                  <div style={S.card}>
                    <SectionTitle title="Añadir permiso" />
                    <div style={{ display: "grid", gap: 12 }}>
                      <Field label="Tipo de permiso *">
                        <input style={S.input} placeholder="NOTAM, Seguro, Autorización DGT…" value={fPermisoTipo} onChange={(e) => setFPermisoTipo(e.target.value)} />
                      </Field>
                      <Field label="Observaciones">
                        <textarea style={{ ...S.input, minHeight: 80 }} placeholder="Detalles del permiso…" value={fPermisoObs} onChange={(e) => setFPermisoObs(e.target.value)} />
                      </Field>
                    </div>
                    <div style={{ marginTop: 14 }}><Btn onClick={addPermiso}>Añadir permiso</Btn></div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* REPORTES */}
          {view === "reportes" && (
            <div style={{ display: "grid", gap: 20 }}>
              <div style={S.card}>
                <SectionTitle title="Filtros" />
                <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(4, minmax(0,1fr))" }}>
                  <Field label="Desde"><input style={S.input} type="date" value={reportFilters.from} onChange={(e) => setReportFilters((p) => ({ ...p, from: e.target.value }))} /></Field>
                  <Field label="Hasta"><input style={S.input} type="date" value={reportFilters.to} onChange={(e) => setReportFilters((p) => ({ ...p, to: e.target.value }))} /></Field>
                  <Field label="Dron">
                    <select style={S.input} value={reportFilters.droneId} onChange={(e) => setReportFilters((p) => ({ ...p, droneId: e.target.value }))}>
                      <option value="all">Todos los drones</option>
                      {drones.map((d) => <option key={d.id} value={d.id}>{d.modelo}</option>)}
                    </select>
                  </Field>
                  <Field label="Piloto">
                    <select style={S.input} value={reportFilters.pilotId} onChange={(e) => setReportFilters((p) => ({ ...p, pilotId: e.target.value }))}>
                      <option value="all">Todos los pilotos</option>
                      {pilots.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                    </select>
                  </Field>
                </div>
              </div>

              <div style={{ display: "grid", gap: 14, gridTemplateColumns: "repeat(3, minmax(0,1fr))" }}>
                <StatCard label="Horas de vuelo filtradas" value={formatMinutes(reportSummary.total)} />
                <StatCard label="Vuelos filtrados" value={String(reportSummary.count)} />
                <StatCard label="Duración media" value={formatMinutes(reportSummary.avg)} />
              </div>

              <div style={{ display: "grid", gap: 20, gridTemplateColumns: "1fr 1fr" }}>
                <div style={S.card}>
                  <SectionTitle title="Ranking de drones por uso" />
                  {droneRanking.map((d, i) => (
                    <div key={d.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: "1px solid #f1f5f9" }}>
                      <div>
                        <span style={{ fontWeight: 700, color: "#94a3b8", marginRight: 8 }}>#{i + 1}</span>
                        <strong>{d.modelo}</strong>
                        <div style={{ fontSize: 12, color: "#64748b" }}>{d.id}</div>
                      </div>
                      <div style={{ fontWeight: 600 }}>{formatMinutes(d.horasUsoMinutos)}</div>
                    </div>
                  ))}
                </div>
                <div style={S.card}>
                  <SectionTitle title="Ranking de pilotos por horas" />
                  {pilotRanking.map((p, i) => (
                    <div key={p.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: "1px solid #f1f5f9" }}>
                      <div>
                        <span style={{ fontWeight: 700, color: "#94a3b8", marginRight: 8 }}>#{i + 1}</span>
                        <strong>{p.nombre}</strong>
                        <div style={{ fontSize: 12, color: "#64748b" }}>{p.id}</div>
                      </div>
                      <div style={{ fontWeight: 600 }}>{formatMinutes(p.tiempoVueloMinutos)}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Tabla de vuelos filtrados */}
              <div style={S.card}>
                <SectionTitle title="Detalle de vuelos filtrados" />
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
                    <thead>
                      <tr style={{ borderBottom: "2px solid #e5e7eb" }}>
                        {["ID", "Fecha", "Zona", "Piloto", "Duración", "Estado", "Riesgo"].map((h) => (
                          <th key={h} style={{ textAlign: "left", padding: "8px 10px", color: "#64748b", fontWeight: 600 }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {reportFlights.map((f) => (
                        <tr key={f.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                          <td style={{ padding: "8px 10px", fontWeight: 600 }}>{f.id}</td>
                          <td style={{ padding: "8px 10px" }}>{f.fecha}</td>
                          <td style={{ padding: "8px 10px" }}>{f.zona}</td>
                          <td style={{ padding: "8px 10px" }}>{pilots.find((p) => p.id === f.pilotoId)?.nombre ?? f.pilotoId}</td>
                          <td style={{ padding: "8px 10px" }}>{formatMinutes(f.duracionMinutos)}</td>
                          <td style={{ padding: "8px 10px" }}><span style={badge(f.estado)}>{f.estado}</span></td>
                          <td style={{ padding: "8px 10px" }}><span style={badge(f.riesgo)}>{f.riesgo}</span></td>
                        </tr>
                      ))}
                      {reportFlights.length === 0 && (
                        <tr><td colSpan={7} style={{ padding: 20, color: "#64748b", textAlign: "center" }}>Sin resultados para los filtros seleccionados</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ADMINISTRACIÓN */}
          {view === "administracion" && (
            <div style={{ display: "grid", gap: 20 }}>
              {/* Personalización */}
              <div style={S.card}>
                <SectionTitle title="Personalización" subtitle="Configura el título, logo y conexión con Google Apps Script." />
                <div style={{ display: "grid", gap: 12, gridTemplateColumns: "1fr 1fr" }}>
                  <Field label="Título de la aplicación">
                    <input style={S.input} value={customization.appTitle} onChange={(e) => setCustomization((p) => ({ ...p, appTitle: e.target.value }))} />
                  </Field>
                  <Field label="URL del logo (opcional)">
                    <input style={S.input} placeholder="https://…/logo.png" value={customization.logoUrl} onChange={(e) => setCustomization((p) => ({ ...p, logoUrl: e.target.value }))} />
                  </Field>
                  <Field label="Subtítulo / descripción" style={{ gridColumn: "1 / -1" }}>
                    <textarea style={{ ...S.input, minHeight: 70 }} value={customization.appSubtitle} onChange={(e) => setCustomization((p) => ({ ...p, appSubtitle: e.target.value }))} />
                  </Field>
                  <Field label="URL Google Apps Script Web App" style={{ gridColumn: "1 / -1" }}>
                    <input
                      style={S.input}
                      placeholder="https://script.google.com/macros/s/…/exec"
                      value={customization.appsScriptUrl}
                      onChange={(e) => {
                        autoLoadDoneRef.current = false;
                        setHasLoadedCloud(false);
                        setCustomization((p) => ({ ...p, appsScriptUrl: e.target.value }));
                      }}
                    />
                  </Field>
                </div>
                <div style={{ marginTop: 14, display: "flex", gap: 8 }}>
                  <Btn onClick={() => void loadFromCloud()}>Probar conexión</Btn>
                </div>
                {syncStatus && (
                  <div style={{ marginTop: 12 }}>
                    <Alert type={syncType === "error" ? "error" : syncType === "ok" ? "success" : "warning"}>
                      {syncStatus}
                    </Alert>
                  </div>
                )}
              </div>

              {/* Sistema */}
              <div style={{ display: "grid", gap: 20, gridTemplateColumns: "1fr 1fr" }}>
                <div style={S.card}>
                  <SectionTitle title="Categorías de vuelo" subtitle="Usadas como sugerencias en el formulario de vuelos." />
                  <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
                    <input style={{ ...S.input }} placeholder="Nueva categoría" value={fCategoria} onChange={(e) => setFCategoria(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addCategoria()} />
                    <Btn onClick={addCategoria}>Añadir</Btn>
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                    {categorias.map((c) => (
                      <div key={c} style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 10px 4px 12px", background: "#f1f5f9", borderRadius: 999, fontSize: 13, fontWeight: 500 }}>
                        {c}
                        <button onClick={() => setCategorias((p) => p.filter((x) => x !== c))} style={{ background: "none", border: "none", cursor: "pointer", color: "#94a3b8", fontSize: 16, lineHeight: 1, padding: 0 }}>×</button>
                      </div>
                    ))}
                  </div>
                </div>

                <div style={S.card}>
                  <SectionTitle title="Modelos de dron" subtitle="Usados como sugerencias en el formulario de flota." />
                  <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
                    <input style={{ ...S.input }} placeholder="Nuevo modelo" value={fModelo} onChange={(e) => setFModelo(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addModelo()} />
                    <Btn onClick={addModelo}>Añadir</Btn>
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                    {modelosDron.map((m) => (
                      <div key={m} style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 10px 4px 12px", background: "#f1f5f9", borderRadius: 999, fontSize: 13, fontWeight: 500 }}>
                        {m}
                        <button onClick={() => setModelosDron((p) => p.filter((x) => x !== m))} style={{ background: "none", border: "none", cursor: "pointer", color: "#94a3b8", fontSize: 16, lineHeight: 1, padding: 0 }}>×</button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Info técnica */}
              <div style={S.card}>
                <SectionTitle title="Información del sistema" />
                <div style={{ display: "grid", gap: 6, fontSize: 14, color: "#475569" }}>
                  <div><strong>Persistencia:</strong> Google Apps Script + Google Sheets</div>
                  <div><strong>Frontend:</strong> React 18 + TypeScript + Vite → GitHub Pages</div>
                  <div><strong>Comunicación:</strong> JSONP (lectura) + Form POST (escritura) — sin CORS</div>
                  <div><strong>Drones registrados:</strong> {drones.length}</div>
                  <div><strong>Pilotos registrados:</strong> {pilots.length}</div>
                  <div><strong>Vuelos registrados:</strong> {flights.length}</div>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
