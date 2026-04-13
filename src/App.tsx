import React, { useEffect, useMemo, useRef, useState } from "react";

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

type AppsScriptPayload = {
  drones?: DroneItem[];
  pilots?: PilotItem[];
  flights?: FlightItem[];
  customization?: Partial<SystemCustomization>;
};

type JsonpResponse = {
  ok?: boolean;
  message?: string;
  error?: string;
  data?: AppsScriptPayload;
  result?: AppsScriptPayload;
};

const DEFAULT_APPS_SCRIPT_URL =
  "https://script.google.com/macros/s/AKfycbzdPpCfaAyXBOMArit8ilKKTmKqTWh3SLGuN_-XWx-86bK9punTKsYgFIXdbNg-O-gA/exec";

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
  appSubtitle: "Aplicación conectada a Google Apps Script.",
  logoUrl: "",
  appsScriptUrl: DEFAULT_APPS_SCRIPT_URL,
};

const defaultReportFilters: ReportFilters = { from: "", to: "", droneId: "all", pilotId: "all" };

function buildJsonpUrl(url: string, action: string, callbackName: string) {
  const endpoint = new URL(url);
  endpoint.searchParams.set("action", action);
  endpoint.searchParams.set("callback", callbackName);
  return endpoint.toString();
}

function loadFromAppsScriptJsonp(url: string, action: string): Promise<JsonpResponse> {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined" || typeof document === "undefined") {
      reject(new Error("JSONP no disponible fuera del navegador"));
      return;
    }
    const callbackName = `gas_jsonp_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const script = document.createElement("script");
    let completed = false;

    const cleanup = () => {
      completed = true;
      script.remove();
      try {
        delete (window as Window & Record<string, unknown>)[callbackName];
      } catch {
        (window as Window & Record<string, unknown>)[callbackName] = undefined;
      }
    };

    const timer = window.setTimeout(() => {
      if (completed) return;
      cleanup();
      reject(new Error("Tiempo de espera agotado al cargar datos"));
    }, 15000);

    (window as Window & Record<string, unknown>)[callbackName] = (response: JsonpResponse) => {
      window.clearTimeout(timer);
      cleanup();
      resolve(response);
    };

    script.onerror = () => {
      window.clearTimeout(timer);
      cleanup();
      reject(new Error("No se pudo cargar el script remoto"));
    };

    script.src = buildJsonpUrl(url, action, callbackName);
    document.body.appendChild(script);
  });
}

function submitToAppsScriptByForm(url: string, action: string, payload: unknown): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined" || typeof document === "undefined") {
      reject(new Error("Envío no disponible fuera del navegador"));
      return;
    }

    const iframeName = `gas_iframe_${Date.now()}_${Math.random().toString(36).slice(2)}`;
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
    input.value = JSON.stringify({ action, payload });
    form.appendChild(input);

    let settled = false;
    const timer = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      iframe.remove();
      form.remove();
      resolve();
    }, 2500);

    iframe.onload = () => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      iframe.remove();
      form.remove();
      resolve();
    };

    document.body.appendChild(iframe);
    document.body.appendChild(form);
    form.submit();
  });
}

function formatMinutes(totalMinutes: number) {
  const safeMinutes = Math.max(0, Math.round(totalMinutes));
  const hours = Math.floor(safeMinutes / 60);
  const minutes = safeMinutes % 60;
  return `${hours} h ${String(minutes).padStart(2, "0")} min`;
}

function parseDurationToMinutes(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return 0;
  const parts = trimmed.split(":");
  if (parts.length === 2) {
    const hours = Number(parts[0]);
    const minutes = Number(parts[1]);
    if (!Number.isNaN(hours) && !Number.isNaN(minutes)) return hours * 60 + minutes;
  }
  const raw = Number(trimmed);
  return Number.isNaN(raw) ? 0 : raw;
}

function derivePermitState(permisos: PermitItem[]): PermitStatus {
  if (permisos.some((p) => p.estado === "Rechazado")) return "Rechazado";
  if (permisos.some((p) => p.estado === "Pendiente" || p.estado === "En revisión")) return "En revisión";
  return "Aprobado";
}

const tests = {
  parseDurationToMinutes: [parseDurationToMinutes("01:25") === 85, parseDurationToMinutes("45") === 45, parseDurationToMinutes("") === 0],
  formatMinutes: [formatMinutes(125) === "2 h 05 min", formatMinutes(0) === "0 h 00 min"],
  derivePermitState: [
    derivePermitState([]) === "Aprobado",
    derivePermitState([{ tipo: "A", estado: "Pendiente", observacion: "" }]) === "En revisión",
    derivePermitState([{ tipo: "A", estado: "Rechazado", observacion: "" }]) === "Rechazado",
  ],
  buildJsonpUrl: [buildJsonpUrl("https://example.com", "getInitialData", "cb").includes("callback=cb")],
};
void tests;

const styles = {
  card: { background: "white", borderRadius: 20, padding: 20, border: "1px solid #e5e7eb", boxShadow: "0 8px 24px rgba(15,23,42,0.06)" } as React.CSSProperties,
  input: { width: "100%", padding: "10px 12px", borderRadius: 12, border: "1px solid #d1d5db", fontSize: 14, boxSizing: "border-box" } as React.CSSProperties,
};

function badgeStyle(status: string): React.CSSProperties {
  const map: Record<string, React.CSSProperties> = {
    Operativo: { background: "#dcfce7", color: "#166534" },
    "En mantenimiento": { background: "#fef3c7", color: "#92400e" },
    Activo: { background: "#dcfce7", color: "#166534" },
    "Pendiente de renovación": { background: "#fef3c7", color: "#92400e" },
    Planificado: { background: "#dbeafe", color: "#1d4ed8" },
    Bloqueado: { background: "#fee2e2", color: "#991b1b" },
    Ejecutado: { background: "#dcfce7", color: "#166534" },
    Pendiente: { background: "#fef3c7", color: "#92400e" },
    "En revisión": { background: "#fde68a", color: "#92400e" },
    Aprobado: { background: "#dcfce7", color: "#166534" },
    Rechazado: { background: "#fee2e2", color: "#991b1b" },
    Bajo: { background: "#e0f2fe", color: "#075985" },
    Medio: { background: "#fef3c7", color: "#92400e" },
    Alto: { background: "#fee2e2", color: "#991b1b" },
  };
  return { display: "inline-block", padding: "4px 10px", borderRadius: 999, fontSize: 12, fontWeight: 600, ...(map[status] || { background: "#e5e7eb", color: "#334155" }) };
}

function Button({ children, onClick, primary = true, disabled = false }: { children: React.ReactNode; onClick?: () => void; primary?: boolean; disabled?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: "10px 14px",
        borderRadius: 12,
        border: primary ? "1px solid #0f172a" : "1px solid #cbd5e1",
        background: primary ? "#0f172a" : "white",
        color: primary ? "white" : "#0f172a",
        fontWeight: 600,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.7 : 1,
      }}
    >
      {children}
    </button>
  );
}

function SectionTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <h2 style={{ margin: 0, fontSize: 28 }}>{title}</h2>
      {subtitle ? <p style={{ margin: "6px 0 0", color: "#64748b" }}>{subtitle}</p> : null}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div style={styles.card}>
      <div style={{ fontSize: 14, color: "#64748b" }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 800, marginTop: 8 }}>{value}</div>
    </div>
  );
}

export default function GestionFlotasDronesApp() {
  const [view, setView] = useState<ViewId>("dashboard");
  const [drones, setDrones] = useState<DroneItem[]>(initialDrones);
  const [pilots, setPilots] = useState<PilotItem[]>(initialPilots);
  const [flights, setFlights] = useState<FlightItem[]>(initialFlights);
  const [reportFilters, setReportFilters] = useState<ReportFilters>(defaultReportFilters);
  const [customization, setCustomization] = useState<SystemCustomization>(defaultCustomization);
  const [search, setSearch] = useState("");
  const [selectedFlightId, setSelectedFlightId] = useState(initialFlights[0]?.id ?? "");
  const [commentDraft, setCommentDraft] = useState("");
  const [newDroneId, setNewDroneId] = useState("");
  const [newDroneModel, setNewDroneModel] = useState("");
  const [newPilotId, setNewPilotId] = useState("");
  const [newPilotName, setNewPilotName] = useState("");
  const [newFlightId, setNewFlightId] = useState("");
  const [newFlightDate, setNewFlightDate] = useState("");
  const [newFlightZone, setNewFlightZone] = useState("");
  const [newFlightPilotId, setNewFlightPilotId] = useState("");
  const [newFlightDuration, setNewFlightDuration] = useState("00:00");
  const [newFlightDroneIds, setNewFlightDroneIds] = useState<string[]>([]);
  const [categoriaDraft, setCategoriaDraft] = useState("");
  const [modeloDraft, setModeloDraft] = useState("");
  const [syncStatus, setSyncStatus] = useState("Conectando con Google Apps Script...");
  const [isSyncing, setIsSyncing] = useState(false);
  const [hasLoadedCloud, setHasLoadedCloud] = useState(false);
  const autoLoadAttemptedRef = useRef(false);
  const autosaveTimerRef = useRef<number | null>(null);

  const loadFromCloud = async () => {
    if (!customization.appsScriptUrl.trim()) {
      setSyncStatus("Configura primero la URL de Google Apps Script");
      return;
    }
    try {
      setIsSyncing(true);
      setSyncStatus("Cargando datos de Google...");
      const result = await loadFromAppsScriptJsonp(customization.appsScriptUrl.trim(), "getInitialData");
      if (result.ok === false) throw new Error(result.error || "Google Apps Script devolvió un error");
      const data = result.data ?? result.result;
      if (data?.drones) setDrones(data.drones);
      if (data?.pilots) setPilots(data.pilots);
      if (data?.flights) setFlights(data.flights);
      if (data?.customization) setCustomization((prev) => ({ ...prev, ...data.customization }));
      setHasLoadedCloud(true);
      setSyncStatus(result.message || "Datos cargados directamente desde Google Apps Script");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Error al cargar desde Google Apps Script";
      setSyncStatus(`Error al cargar nube: ${message}`);
    } finally {
      setIsSyncing(false);
    }
  };

  const saveToCloud = async (statusMessage = "Guardando cambios en Google...") => {
    if (!customization.appsScriptUrl.trim()) {
      setSyncStatus("Configura primero la URL de Google Apps Script");
      return;
    }
    try {
      setIsSyncing(true);
      setSyncStatus(statusMessage);
      await submitToAppsScriptByForm(customization.appsScriptUrl.trim(), "saveAllData", { drones, pilots, flights, customization });
      setSyncStatus("Cambios guardados directamente en Google Apps Script");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Error al guardar en Google Apps Script";
      setSyncStatus(`Error al guardar nube: ${message}`);
    } finally {
      setIsSyncing(false);
    }
  };

  useEffect(() => {
    if (autoLoadAttemptedRef.current || !customization.appsScriptUrl.trim()) return;
    autoLoadAttemptedRef.current = true;
    void loadFromCloud();
  }, [customization.appsScriptUrl]);

  useEffect(() => {
    if (!hasLoadedCloud || !customization.appsScriptUrl.trim()) return;
    if (autosaveTimerRef.current) window.clearTimeout(autosaveTimerRef.current);
    autosaveTimerRef.current = window.setTimeout(() => {
      void saveToCloud("Guardando cambios automáticamente en Google...");
    }, 1200);
    return () => {
      if (autosaveTimerRef.current) window.clearTimeout(autosaveTimerRef.current);
    };
  }, [drones, pilots, flights, customization, hasLoadedCloud]);

  const selectedFlight = flights.find((f) => f.id === selectedFlightId) ?? flights[0];

  const filteredFlights = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return flights;
    return flights.filter((flight) => [flight.id, flight.zona, flight.objetivo, flight.estado].join(" ").toLowerCase().includes(term));
  }, [flights, search]);

  const reportFlights = useMemo(
    () => flights.filter((flight) => {
      if (reportFilters.from && flight.fecha < reportFilters.from) return false;
      if (reportFilters.to && flight.fecha > reportFilters.to) return false;
      if (reportFilters.droneId !== "all" && !flight.droneIds.includes(reportFilters.droneId)) return false;
      if (reportFilters.pilotId !== "all" && flight.pilotoId !== reportFilters.pilotId) return false;
      return true;
    }),
    [flights, reportFilters],
  );

  const metrics = useMemo(
    () => ({
      dronesOperativos: drones.filter((d) => d.estado === "Operativo").length,
      pilotosActivos: pilots.filter((p) => p.estado === "Activo").length,
      vuelosPlanificados: flights.filter((f) => f.estado === "Planificado").length,
      permisosPendientes: flights.reduce((acc, f) => acc + f.permisos.filter((p) => p.estado !== "Aprobado").length, 0),
    }),
    [drones, pilots, flights],
  );

  const droneRanking = useMemo(() => [...drones].sort((a, b) => b.horasUsoMinutos - a.horasUsoMinutos), [drones]);
  const pilotRanking = useMemo(() => [...pilots].sort((a, b) => b.tiempoVueloMinutos - a.tiempoVueloMinutos), [pilots]);
  const reportSummary = useMemo(() => {
    const totalMinutes = reportFlights.reduce((acc, flight) => acc + flight.duracionMinutos, 0);
    const avgMinutes = reportFlights.length ? Math.round(totalMinutes / reportFlights.length) : 0;
    return { totalMinutes, avgMinutes, count: reportFlights.length };
  }, [reportFlights]);

  const addDrone = () => {
    if (!newDroneId.trim() || !newDroneModel.trim()) return;
    setDrones((prev) => [{ id: newDroneId.trim(), modelo: newDroneModel.trim(), serie: "", estado: "Operativo", bateria: 100, base: "", horasUsoMinutos: 0 }, ...prev]);
    setNewDroneId("");
    setNewDroneModel("");
  };

  const addPilot = () => {
    if (!newPilotId.trim() || !newPilotName.trim()) return;
    setPilots((prev) => [{ id: newPilotId.trim(), nombre: newPilotName.trim(), licencia: "", estado: "Activo", tiempoVueloMinutos: 0 }, ...prev]);
    setNewPilotId("");
    setNewPilotName("");
  };

  const addFlight = () => {
    const durationMinutes = parseDurationToMinutes(newFlightDuration);
    if (!newFlightId.trim() || !newFlightDate || !newFlightZone.trim() || !newFlightPilotId || !newFlightDroneIds.length || durationMinutes <= 0) return;
    const flight: FlightItem = {
      id: newFlightId.trim(),
      fecha: newFlightDate,
      zona: newFlightZone.trim(),
      droneIds: newFlightDroneIds,
      pilotoId: newFlightPilotId,
      estado: "Planificado",
      objetivo: "Nuevo vuelo",
      duracionMinutos: durationMinutes,
      riesgo: "Medio",
      permisoEstado: "Pendiente",
      comentarios: [],
      permisos: [],
    };
    setFlights((prev) => [flight, ...prev]);
    setDrones((prev) => prev.map((drone) => (newFlightDroneIds.includes(drone.id) ? { ...drone, horasUsoMinutos: drone.horasUsoMinutos + durationMinutes } : drone)));
    setPilots((prev) => prev.map((pilot) => (pilot.id === newFlightPilotId ? { ...pilot, tiempoVueloMinutos: pilot.tiempoVueloMinutos + durationMinutes } : pilot)));
    setSelectedFlightId(flight.id);
    setNewFlightId("");
    setNewFlightDate("");
    setNewFlightZone("");
    setNewFlightPilotId("");
    setNewFlightDuration("00:00");
    setNewFlightDroneIds([]);
  };

  const addComment = () => {
    if (!selectedFlight || !commentDraft.trim()) return;
    setFlights((prev) => prev.map((flight) => (flight.id === selectedFlight.id ? { ...flight, comentarios: [...flight.comentarios, { autor: "Operador", texto: commentDraft.trim(), fecha: new Date().toISOString().slice(0, 10) }] } : flight)));
    setCommentDraft("");
  };

  const addCategoria = () => setCategoriaDraft("");
  const addModelo = () => setModeloDraft("");

  const navItems: Array<{ id: ViewId; label: string }> = [
    { id: "dashboard", label: "Dashboard" },
    { id: "flota", label: "Flota" },
    { id: "pilotos", label: "Pilotos" },
    { id: "vuelos", label: "Vuelos" },
    { id: "permisos", label: "Permisos" },
    { id: "reportes", label: "Reportes" },
    { id: "administracion", label: "Administración" },
  ];

  return (
    <div style={{ minHeight: "100vh", background: "#f1f5f9", padding: 16, fontFamily: "Inter, Arial, sans-serif", color: "#0f172a" }}>
      <div style={{ maxWidth: 1400, margin: "0 auto", display: "grid", gap: 24, gridTemplateColumns: "260px minmax(0,1fr)" }}>
        <aside style={{ ...styles.card, alignSelf: "start", position: "sticky", top: 16 }}>
          <div style={{ background: "#0f172a", color: "white", borderRadius: 20, padding: 20 }}>
            <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
              {customization.logoUrl ? (
                <img src={customization.logoUrl} alt="Logo" style={{ width: 48, height: 48, borderRadius: 16, objectFit: "cover" }} />
              ) : (
                <div style={{ width: 48, height: 48, borderRadius: 16, background: "rgba(255,255,255,0.1)", display: "grid", placeItems: "center" }}>🚁</div>
              )}
              <div>
                <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.24em", color: "#cbd5e1" }}>Studio UAS</div>
                <div style={{ fontSize: 18, fontWeight: 700 }}>Centro de operaciones</div>
              </div>
            </div>
            <p style={{ marginTop: 14, color: "#cbd5e1", fontSize: 14 }}>{customization.appSubtitle}</p>
          </div>
          <div style={{ marginTop: 16, display: "grid", gap: 8 }}>
            {navItems.map((item) => (
              <Button key={item.id} onClick={() => setView(item.id)} primary={view === item.id}>
                {item.label}
              </Button>
            ))}
          </div>
        </aside>

        <main style={{ display: "grid", gap: 24 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
            <div>
              <div style={{ fontSize: 14, color: "#64748b", fontWeight: 600 }}>Panel operativo</div>
              <h1 style={{ margin: "6px 0 0", fontSize: 34 }}>{customization.appTitle}</h1>
              <div style={{ marginTop: 8, fontSize: 13, color: "#64748b" }}>{syncStatus}</div>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              <Button primary={false} onClick={loadFromCloud} disabled={isSyncing}>{isSyncing ? "Sincronizando..." : "Recargar"}</Button>
              <Button onClick={() => void saveToCloud()} disabled={isSyncing}>{isSyncing ? "Sincronizando..." : "Guardar"}</Button>
              <input style={{ ...styles.input, maxWidth: 320 }} value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar vuelos" />
            </div>
          </div>

          <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(4, minmax(0,1fr))" }}>
            <StatCard label="Drones operativos" value={String(metrics.dronesOperativos)} />
            <StatCard label="Pilotos activos" value={String(metrics.pilotosActivos)} />
            <StatCard label="Vuelos planificados" value={String(metrics.vuelosPlanificados)} />
            <StatCard label="Permisos abiertos" value={String(metrics.permisosPendientes)} />
          </div>

          {view === "dashboard" && (
            <div style={styles.card}>
              <SectionTitle title="Próximas operaciones" subtitle="Resumen ejecutivo." />
              <div style={{ display: "grid", gap: 12 }}>
                {filteredFlights.map((flight) => (
                  <button key={flight.id} onClick={() => { setSelectedFlightId(flight.id); setView("vuelos"); }} style={{ ...styles.card, textAlign: "left", padding: 16, cursor: "pointer" }}>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                      <strong>{flight.id}</strong>
                      <span style={badgeStyle(flight.estado)}>{flight.estado}</span>
                      <span style={badgeStyle(flight.riesgo)}>{flight.riesgo}</span>
                    </div>
                    <div style={{ marginTop: 10 }}>{flight.objetivo}</div>
                    <div style={{ marginTop: 8, fontSize: 14, color: "#64748b" }}>{flight.fecha} · {flight.zona}</div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {view === "flota" && (
            <div style={{ display: "grid", gap: 24 }}>
              <div style={styles.card}>
                <SectionTitle title="Flota de drones" />
                <div style={{ display: "grid", gap: 12, gridTemplateColumns: "1fr 1fr" }}>
                  <input style={styles.input} placeholder="ID" value={newDroneId} onChange={(e) => setNewDroneId(e.target.value)} />
                  <input style={styles.input} placeholder="Modelo" value={newDroneModel} onChange={(e) => setNewDroneModel(e.target.value)} />
                </div>
                <div style={{ marginTop: 12 }}><Button onClick={addDrone}>Guardar dron</Button></div>
              </div>
              <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(2, minmax(0,1fr))" }}>
                {drones.map((drone) => (
                  <div key={drone.id} style={styles.card}>
                    <h3 style={{ margin: 0 }}>{drone.modelo}</h3>
                    <div style={{ color: "#64748b", fontSize: 14 }}>{drone.id} · Serie {drone.serie}</div>
                    <div style={{ marginTop: 12, display: "grid", gap: 8, fontSize: 14 }}>
                      <div><strong>Estado:</strong> <span style={badgeStyle(drone.estado)}>{drone.estado}</span></div>
                      <div><strong>Horas de uso:</strong> {formatMinutes(drone.horasUsoMinutos)}</div>
                      <div><strong>Base:</strong> {drone.base || "Sin asignar"}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {view === "pilotos" && (
            <div style={{ display: "grid", gap: 24 }}>
              <div style={styles.card}>
                <SectionTitle title="Pilotos" />
                <div style={{ display: "grid", gap: 12, gridTemplateColumns: "1fr 1fr" }}>
                  <input style={styles.input} placeholder="ID" value={newPilotId} onChange={(e) => setNewPilotId(e.target.value)} />
                  <input style={styles.input} placeholder="Nombre" value={newPilotName} onChange={(e) => setNewPilotName(e.target.value)} />
                </div>
                <div style={{ marginTop: 12 }}><Button onClick={addPilot}>Guardar piloto</Button></div>
              </div>
              <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(2, minmax(0,1fr))" }}>
                {pilots.map((pilot) => (
                  <div key={pilot.id} style={styles.card}>
                    <h3 style={{ margin: 0 }}>{pilot.nombre}</h3>
                    <div style={{ color: "#64748b", fontSize: 14 }}>{pilot.id} · {pilot.licencia}</div>
                    <div style={{ marginTop: 12, display: "grid", gap: 8, fontSize: 14 }}>
                      <div><strong>Estado:</strong> <span style={badgeStyle(pilot.estado)}>{pilot.estado}</span></div>
                      <div><strong>Tiempo volado:</strong> {formatMinutes(pilot.tiempoVueloMinutos)}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {view === "vuelos" && (
            <div style={{ display: "grid", gap: 24 }}>
              <div style={styles.card}>
                <SectionTitle title="Vuelos" />
                <div style={{ display: "grid", gap: 12, gridTemplateColumns: "1fr 1fr" }}>
                  <input style={styles.input} placeholder="ID" value={newFlightId} onChange={(e) => setNewFlightId(e.target.value)} />
                  <input style={styles.input} type="date" value={newFlightDate} onChange={(e) => setNewFlightDate(e.target.value)} />
                  <input style={{ ...styles.input, gridColumn: "1 / -1" }} placeholder="Zona" value={newFlightZone} onChange={(e) => setNewFlightZone(e.target.value)} />
                  <select style={styles.input} value={newFlightPilotId} onChange={(e) => setNewFlightPilotId(e.target.value)}>
                    <option value="">Selecciona piloto</option>
                    {pilots.map((pilot) => <option key={pilot.id} value={pilot.id}>{pilot.id} · {pilot.nombre}</option>)}
                  </select>
                  <input style={styles.input} placeholder="Duración hh:mm" value={newFlightDuration} onChange={(e) => setNewFlightDuration(e.target.value)} />
                  <div style={{ gridColumn: "1 / -1" }}>
                    <div style={{ marginBottom: 8, fontWeight: 600 }}>Drones usados</div>
                    <div style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(2, minmax(0,1fr))" }}>
                      {drones.map((drone) => {
                        const checked = newFlightDroneIds.includes(drone.id);
                        return (
                          <label key={drone.id} style={{ border: "1px solid #d1d5db", borderRadius: 12, padding: 10, background: "#f8fafc", display: "flex", gap: 10, alignItems: "center" }}>
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={(e) => setNewFlightDroneIds((prev) => e.target.checked ? [...prev, drone.id] : prev.filter((id) => id !== drone.id))}
                            />
                            <span>{drone.id} · {drone.modelo}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                </div>
                <div style={{ marginTop: 12 }}><Button onClick={addFlight}>Guardar vuelo</Button></div>
              </div>

              <div style={{ display: "grid", gap: 24, gridTemplateColumns: "1fr 1fr" }}>
                <div style={styles.card}>
                  <SectionTitle title="Listado operativo" />
                  <div style={{ display: "grid", gap: 12 }}>
                    {filteredFlights.map((flight) => (
                      <button key={flight.id} onClick={() => setSelectedFlightId(flight.id)} style={{ ...styles.card, textAlign: "left", padding: 16, cursor: "pointer" }}>
                        <strong>{flight.id}</strong>
                        <div style={{ marginTop: 8 }}>{flight.objetivo}</div>
                        <div style={{ marginTop: 8, fontSize: 14, color: "#64748b" }}>{flight.fecha} · {flight.zona}</div>
                      </button>
                    ))}
                  </div>
                </div>

                <div style={styles.card}>
                  <SectionTitle title="Detalle del vuelo" />
                  {selectedFlight ? (
                    <>
                      <strong>{selectedFlight.id}</strong>
                      <p style={{ marginTop: 12 }}>{selectedFlight.objetivo}</p>
                      <div style={{ display: "grid", gap: 8, fontSize: 14 }}>
                        <div><strong>Fecha:</strong> {selectedFlight.fecha}</div>
                        <div><strong>Zona:</strong> {selectedFlight.zona}</div>
                        <div><strong>Duración:</strong> {formatMinutes(selectedFlight.duracionMinutos)}</div>
                      </div>
                      <div style={{ marginTop: 16 }}>
                        <textarea style={{ ...styles.input, minHeight: 90 }} placeholder="Añadir comentario operativo" value={commentDraft} onChange={(e) => setCommentDraft(e.target.value)} />
                        <div style={{ marginTop: 8 }}><Button onClick={addComment}>Añadir comentario</Button></div>
                      </div>
                    </>
                  ) : (
                    <p>Selecciona un vuelo.</p>
                  )}
                </div>
              </div>
            </div>
          )}

          {view === "permisos" && (
            <div style={styles.card}>
              <SectionTitle title="Permisos" />
              {selectedFlight ? (
                <div style={{ display: "grid", gap: 12 }}>
                  {selectedFlight.permisos.map((permiso, idx) => (
                    <div key={`${selectedFlight.id}-${idx}`} style={{ border: "1px solid #e5e7eb", borderRadius: 14, padding: 12, background: "#f8fafc" }}>
                      <strong>{permiso.tipo}</strong>
                      <div style={{ marginTop: 8 }}><span style={badgeStyle(permiso.estado)}>{permiso.estado}</span></div>
                      <div style={{ marginTop: 8, color: "#475569" }}>{permiso.observacion}</div>
                    </div>
                  ))}
                </div>
              ) : <p>No hay vuelo seleccionado.</p>}
            </div>
          )}

          {view === "reportes" && (
            <div style={{ display: "grid", gap: 24 }}>
              <div style={styles.card}>
                <SectionTitle title="Reportes" />
                <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(4, minmax(0,1fr))" }}>
                  <input style={styles.input} type="date" value={reportFilters.from} onChange={(e) => setReportFilters((prev) => ({ ...prev, from: e.target.value }))} />
                  <input style={styles.input} type="date" value={reportFilters.to} onChange={(e) => setReportFilters((prev) => ({ ...prev, to: e.target.value }))} />
                  <select style={styles.input} value={reportFilters.droneId} onChange={(e) => setReportFilters((prev) => ({ ...prev, droneId: e.target.value }))}>
                    <option value="all">Todos los drones</option>
                    {drones.map((drone) => <option key={drone.id} value={drone.id}>{drone.modelo}</option>)}
                  </select>
                  <select style={styles.input} value={reportFilters.pilotId} onChange={(e) => setReportFilters((prev) => ({ ...prev, pilotId: e.target.value }))}>
                    <option value="all">Todos los pilotos</option>
                    {pilots.map((pilot) => <option key={pilot.id} value={pilot.id}>{pilot.nombre}</option>)}
                  </select>
                </div>
              </div>

              <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(3, minmax(0,1fr))" }}>
                <StatCard label="Horas de vuelo" value={formatMinutes(reportSummary.totalMinutes)} />
                <StatCard label="Vuelos filtrados" value={String(reportSummary.count)} />
                <StatCard label="Duración media" value={formatMinutes(reportSummary.avgMinutes)} />
              </div>

              <div style={{ display: "grid", gap: 24, gridTemplateColumns: "1fr 1fr" }}>
                <div style={styles.card}>
                  <SectionTitle title="Ranking por uso de drones" />
                  <div style={{ display: "grid", gap: 10 }}>
                    {droneRanking.map((drone, index) => (
                      <div key={drone.id} style={{ border: "1px solid #e5e7eb", borderRadius: 14, padding: 12, background: "#f8fafc" }}>
                        <strong>#{index + 1} · {drone.modelo}</strong>
                        <div>{formatMinutes(drone.horasUsoMinutos)}</div>
                      </div>
                    ))}
                  </div>
                </div>
                <div style={styles.card}>
                  <SectionTitle title="Ranking por pilotos" />
                  <div style={{ display: "grid", gap: 10 }}>
                    {pilotRanking.map((pilot, index) => (
                      <div key={pilot.id} style={{ border: "1px solid #e5e7eb", borderRadius: 14, padding: 12, background: "#f8fafc" }}>
                        <strong>#{index + 1} · {pilot.nombre}</strong>
                        <div>{formatMinutes(pilot.tiempoVueloMinutos)}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {view === "administracion" && (
            <div style={{ display: "grid", gap: 24 }}>
              <div style={{ display: "grid", gap: 24, gridTemplateColumns: "1fr 1fr" }}>
                <div style={styles.card}>
                  <SectionTitle title="Configuración del sistema" />
                  <div style={{ display: "grid", gap: 8, fontSize: 14 }}>
                    <div><strong>Persistencia:</strong> solo Google Apps Script</div>
                    <div><strong>Frontend:</strong> optimizado para canvas</div>
                    <div><strong>Base de datos:</strong> Google Apps Script + Google Sheets</div>
                  </div>
                </div>
                <div style={styles.card}>
                  <SectionTitle title="Personalización" />
                  <div style={{ display: "grid", gap: 12 }}>
                    <input style={styles.input} placeholder="Título de la aplicación" value={customization.appTitle} onChange={(e) => setCustomization((prev) => ({ ...prev, appTitle: e.target.value }))} />
                    <textarea style={{ ...styles.input, minHeight: 90 }} placeholder="Descripción corta" value={customization.appSubtitle} onChange={(e) => setCustomization((prev) => ({ ...prev, appSubtitle: e.target.value }))} />
                    <input style={styles.input} placeholder="Logo por URL" value={customization.logoUrl} onChange={(e) => setCustomization((prev) => ({ ...prev, logoUrl: e.target.value }))} />
                    <input
                      style={styles.input}
                      placeholder="URL Web App de Google Apps Script"
                      value={customization.appsScriptUrl}
                      onChange={(e) => {
                        autoLoadAttemptedRef.current = false;
                        setHasLoadedCloud(false);
                        setCustomization((prev) => ({ ...prev, appsScriptUrl: e.target.value }));
                      }}
                    />
                  </div>
                </div>
              </div>

              <div style={{ display: "grid", gap: 24, gridTemplateColumns: "1fr 1fr" }}>
                <div style={styles.card}>
                  <SectionTitle title="Categorías" />
                  <div style={{ display: "flex", gap: 8 }}>
                    <input style={styles.input} placeholder="Nueva categoría" value={categoriaDraft} onChange={(e) => setCategoriaDraft(e.target.value)} />
                    <Button onClick={addCategoria}>Añadir</Button>
                  </div>
                </div>
                <div style={styles.card}>
                  <SectionTitle title="Modelos de dron" />
                  <div style={{ display: "flex", gap: 8 }}>
                    <input style={styles.input} placeholder="Nuevo modelo" value={modeloDraft} onChange={(e) => setModeloDraft(e.target.value)} />
                    <Button onClick={addModelo}>Añadir</Button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
