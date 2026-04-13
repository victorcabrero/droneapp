import React, { useEffect, useMemo, useState } from "react";

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
  mantenimiento: string;
  autonomia: string;
  camara: string;
  base: string;
  numeroBaterias: number;
  foto: string;
  horasUsoMinutos: number;
  observaciones: string;
};

type PilotItem = {
  id: string;
  nombre: string;
  licencia: string;
  telefono: string;
  email: string;
  estado: PilotStatus;
  certificaciones: string;
  experiencia: number;
  tiempoVueloMinutos: number;
  permisos: string[];
};

type PermitItem = {
  tipo: string;
  estado: PermitStatus;
  observacion: string;
};

type CommentItem = {
  autor: string;
  texto: string;
  fecha: string;
};

type FlightItem = {
  id: string;
  fecha: string;
  zona: string;
  droneIds: string[];
  pilotoId: string;
  estado: FlightStatus;
  objetivo: string;
  altitud: string;
  duracionMinutos: number;
  riesgo: RiskLevel;
  permisoEstado: PermitStatus;
  comentarios: CommentItem[];
  permisos: PermitItem[];
};

type ReportFilters = {
  from: string;
  to: string;
  droneId: string;
  pilotId: string;
};

type SystemCustomization = {
  appTitle: string;
  appSubtitle: string;
  logoUrl: string;
  categorias: string[];
  modelosDrone: string[];
};

type DroneDraft = DroneItem;
type PilotDraft = Omit<PilotItem, "permisos"> & { permisos: string };
type FlightDraft = Omit<FlightItem, "comentarios" | "permisos" | "duracionMinutos"> & { duracion: string };

const STORAGE_KEYS = {
  drones: "ghp_gestion_drones_v1",
  pilots: "ghp_gestion_pilots_v1",
  flights: "ghp_gestion_flights_v1",
  reportFilters: "ghp_gestion_report_filters_v1",
  customization: "ghp_gestion_customization_v1",
};

const initialDrones: DroneItem[] = [
  {
    id: "DR-001",
    modelo: "DJI Matrice 300",
    serie: "M300-AX93",
    estado: "Operativo",
    bateria: 92,
    mantenimiento: "2026-05-10",
    autonomia: "42 min",
    camara: "Térmica + Zoom",
    base: "Madrid Central",
    numeroBaterias: 6,
    foto: "",
    horasUsoMinutos: 4380,
    observaciones: "Asignado a inspecciones industriales y vuelos BVLOS.",
  },
  {
    id: "DR-002",
    modelo: "Autel EVO Max 4T",
    serie: "AEM4T-551",
    estado: "En mantenimiento",
    bateria: 0,
    mantenimiento: "2026-04-18",
    autonomia: "38 min",
    camara: "4K + Térmica",
    base: "Toledo Norte",
    numeroBaterias: 4,
    foto: "",
    horasUsoMinutos: 2215,
    observaciones: "Revisión preventiva de hélices y gimbal.",
  },
  {
    id: "DR-003",
    modelo: "DJI Mavic 3 Enterprise",
    serie: "M3E-7781",
    estado: "Operativo",
    bateria: 76,
    mantenimiento: "2026-06-03",
    autonomia: "45 min",
    camara: "Gran angular",
    base: "Segovia Solar",
    numeroBaterias: 5,
    foto: "",
    horasUsoMinutos: 3190,
    observaciones: "Uso recurrente en topografía ligera.",
  },
];

const initialPilots: PilotItem[] = [
  {
    id: "PI-001",
    nombre: "Laura Gómez",
    licencia: "AESA-UAS-ADV-1221",
    telefono: "+34 600 111 222",
    email: "laura@empresa.com",
    estado: "Activo",
    certificaciones: "STS-01, Radiofonista",
    experiencia: 168,
    tiempoVueloMinutos: 10080,
    permisos: ["BVLOS", "Entorno urbano", "Operaciones industriales"],
  },
  {
    id: "PI-002",
    nombre: "Carlos Martín",
    licencia: "AESA-UAS-OPEN-7611",
    telefono: "+34 600 333 444",
    email: "carlos@empresa.com",
    estado: "Pendiente de renovación",
    certificaciones: "A1/A3, A2",
    experiencia: 61,
    tiempoVueloMinutos: 3660,
    permisos: ["Operaciones estándar"],
  },
  {
    id: "PI-003",
    nombre: "Andrea Ruiz",
    licencia: "AESA-UAS-STS-8762",
    telefono: "+34 600 777 888",
    email: "andrea@empresa.com",
    estado: "Activo",
    certificaciones: "STS-01, STS-02",
    experiencia: 214,
    tiempoVueloMinutos: 12840,
    permisos: ["BVLOS", "Fotogrametría", "Operaciones rurales"],
  },
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
    altitud: "90 m",
    duracionMinutos: 35,
    riesgo: "Medio",
    permisoEstado: "En revisión",
    comentarios: [
      { autor: "Operaciones", texto: "Pendiente validar NOTAM y coordinación con seguridad privada.", fecha: "2026-04-10" },
    ],
    permisos: [
      { tipo: "NOTAM", estado: "Pendiente", observacion: "A la espera de confirmación." },
      { tipo: "Autorización zona urbana", estado: "En revisión", observacion: "Documentación enviada." },
      { tipo: "Seguro operativo", estado: "Aprobado", observacion: "Cobertura vigente." },
    ],
  },
  {
    id: "VU-1002",
    fecha: "2026-04-17",
    zona: "Toledo - Finca Norte",
    droneIds: ["DR-002"],
    pilotoId: "PI-002",
    estado: "Bloqueado",
    objetivo: "Levantamiento fotogramétrico",
    altitud: "120 m",
    duracionMinutos: 48,
    riesgo: "Alto",
    permisoEstado: "Pendiente",
    comentarios: [
      { autor: "Coordinación", texto: "No programar hasta cerrar renovación de habilitación del piloto.", fecha: "2026-04-11" },
    ],
    permisos: [
      { tipo: "Permiso propietario terreno", estado: "Aprobado", observacion: "Recibido por correo." },
      { tipo: "Validación piloto", estado: "Pendiente", observacion: "Licencia próxima a caducar." },
    ],
  },
  {
    id: "VU-1003",
    fecha: "2026-04-19",
    zona: "Segovia - Parque Solar",
    droneIds: ["DR-003", "DR-001"],
    pilotoId: "PI-003",
    estado: "Planificado",
    objetivo: "Inspección visual de paneles fotovoltaicos",
    altitud: "75 m",
    duracionMinutos: 28,
    riesgo: "Bajo",
    permisoEstado: "Aprobado",
    comentarios: [
      { autor: "Supervisor", texto: "Operación autorizada. Confirmar parte meteorológico 2 horas antes.", fecha: "2026-04-11" },
    ],
    permisos: [
      { tipo: "Plan de vuelo", estado: "Aprobado", observacion: "Validado por operaciones." },
      { tipo: "Seguro operativo", estado: "Aprobado", observacion: "Cobertura activa." },
    ],
  },
];

const defaultCustomization: SystemCustomization = {
  appTitle: "Gestión de flotas de drones",
  appSubtitle: "Frontend preparado para GitHub Pages con almacenamiento local en el navegador.",
  logoUrl: "",
  categorias: ["Inspección", "Fotogrametría", "Seguridad", "Mantenimiento"],
  modelosDrone: ["DJI Matrice 300", "Autel EVO Max 4T", "DJI Mavic 3 Enterprise"],
};

const defaultReportFilters: ReportFilters = { from: "", to: "", droneId: "all", pilotId: "all" };
const defaultDroneDraft: DroneDraft = {
  id: "",
  modelo: "",
  serie: "",
  estado: "Operativo",
  bateria: 100,
  mantenimiento: "",
  autonomia: "",
  camara: "",
  base: "",
  numeroBaterias: 0,
  foto: "",
  horasUsoMinutos: 0,
  observaciones: "",
};
const defaultPilotDraft: PilotDraft = {
  id: "",
  nombre: "",
  licencia: "",
  telefono: "",
  email: "",
  estado: "Activo",
  certificaciones: "",
  experiencia: 0,
  tiempoVueloMinutos: 0,
  permisos: "",
};
const defaultFlightDraft: FlightDraft = {
  id: "",
  fecha: "",
  zona: "",
  droneIds: [],
  pilotoId: "",
  estado: "Planificado",
  objetivo: "",
  altitud: "",
  duracion: "00:00",
  riesgo: "Medio",
  permisoEstado: "Pendiente",
};

function loadState<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function saveState<T>(key: string, value: T) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, JSON.stringify(value));
}

function resetSystemData() {
  Object.values(STORAGE_KEYS).forEach((key) => window.localStorage.removeItem(key));
  window.location.reload();
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
  parseDurationToMinutes: [parseDurationToMinutes("01:25") === 85, parseDurationToMinutes("45") === 45],
  formatMinutes: [formatMinutes(125) === "2 h 05 min"],
  derivePermitState: [
    derivePermitState([]) === "Aprobado",
    derivePermitState([{ tipo: "A", estado: "Pendiente", observacion: "" }]) === "En revisión",
    derivePermitState([{ tipo: "A", estado: "Rechazado", observacion: "" }]) === "Rechazado",
  ],
};
void tests;

function badgeStyle(status: string) {
  const map: Record<string, React.CSSProperties> = {
    Operativo: { background: "#dcfce7", color: "#166534" },
    "En mantenimiento": { background: "#fef3c7", color: "#92400e" },
    Activo: { background: "#dcfce7", color: "#166534" },
    "Pendiente de renovación": { background: "#fef3c7", color: "#92400e" },
    Planificado: { background: "#dbeafe", color: "#1d4ed8" },
    Ejecutado: { background: "#dcfce7", color: "#166534" },
    Bloqueado: { background: "#fee2e2", color: "#991b1b" },
    Pendiente: { background: "#fef3c7", color: "#92400e" },
    "En revisión": { background: "#fde68a", color: "#92400e" },
    Aprobado: { background: "#dcfce7", color: "#166534" },
    Rechazado: { background: "#fee2e2", color: "#991b1b" },
    Bajo: { background: "#e0f2fe", color: "#075985" },
    Medio: { background: "#fef3c7", color: "#92400e" },
    Alto: { background: "#fee2e2", color: "#991b1b" },
  };
  return {
    display: "inline-block",
    padding: "4px 10px",
    borderRadius: 999,
    fontSize: 12,
    fontWeight: 600,
    ...map[status],
  } as React.CSSProperties;
}

function cardStyle(): React.CSSProperties {
  return {
    background: "white",
    borderRadius: 24,
    padding: 20,
    boxShadow: "0 8px 24px rgba(15,23,42,0.06)",
    border: "1px solid #e5e7eb",
  };
}

function inputStyle(): React.CSSProperties {
  return {
    width: "100%",
    padding: "10px 12px",
    borderRadius: 12,
    border: "1px solid #d1d5db",
    fontSize: 14,
    boxSizing: "border-box",
  };
}

function buttonStyle(primary = true): React.CSSProperties {
  return {
    padding: "10px 14px",
    borderRadius: 12,
    border: primary ? "1px solid #0f172a" : "1px solid #cbd5e1",
    background: primary ? "#0f172a" : "white",
    color: primary ? "white" : "#0f172a",
    fontWeight: 600,
    cursor: "pointer",
  };
}

function sectionTitle(title: string, subtitle?: string) {
  return (
    <div style={{ marginBottom: 16 }}>
      <h2 style={{ margin: 0, fontSize: 28 }}>{title}</h2>
      {subtitle ? <p style={{ margin: "6px 0 0", color: "#64748b" }}>{subtitle}</p> : null}
    </div>
  );
}

export default function GestionFlotasDronesApp() {
  const [view, setView] = useState<ViewId>("dashboard");
  const [drones, setDrones] = useState<DroneItem[]>(() => loadState(STORAGE_KEYS.drones, initialDrones));
  const [pilots, setPilots] = useState<PilotItem[]>(() => loadState(STORAGE_KEYS.pilots, initialPilots));
  const [flights, setFlights] = useState<FlightItem[]>(() => loadState(STORAGE_KEYS.flights, initialFlights));
  const [reportFilters, setReportFilters] = useState<ReportFilters>(() => loadState(STORAGE_KEYS.reportFilters, defaultReportFilters));
  const [customization, setCustomization] = useState<SystemCustomization>(() => loadState(STORAGE_KEYS.customization, defaultCustomization));
  const [search, setSearch] = useState("");
  const [selectedFlightId, setSelectedFlightId] = useState(initialFlights[0]?.id ?? "");
  const [commentDraft, setCommentDraft] = useState("");
  const [newDrone, setNewDrone] = useState<DroneDraft>(defaultDroneDraft);
  const [newPilot, setNewPilot] = useState<PilotDraft>(defaultPilotDraft);
  const [newFlight, setNewFlight] = useState<FlightDraft>(defaultFlightDraft);
  const [categoriaDraft, setCategoriaDraft] = useState("");
  const [modeloDraft, setModeloDraft] = useState("");

  useEffect(() => saveState(STORAGE_KEYS.drones, drones), [drones]);
  useEffect(() => saveState(STORAGE_KEYS.pilots, pilots), [pilots]);
  useEffect(() => saveState(STORAGE_KEYS.flights, flights), [flights]);
  useEffect(() => saveState(STORAGE_KEYS.reportFilters, reportFilters), [reportFilters]);
  useEffect(() => saveState(STORAGE_KEYS.customization, customization), [customization]);

  const selectedFlight = flights.find((f) => f.id === selectedFlightId) ?? flights[0];

  const filteredFlights = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return flights;
    return flights.filter((flight) =>
      [flight.id, flight.zona, flight.objetivo, flight.estado, flight.pilotoId, flight.droneIds.join(" ")]
        .join(" ")
        .toLowerCase()
        .includes(term),
    );
  }, [flights, search]);

  const reportFlights = useMemo(() => {
    return flights.filter((flight) => {
      if (reportFilters.from && flight.fecha < reportFilters.from) return false;
      if (reportFilters.to && flight.fecha > reportFilters.to) return false;
      if (reportFilters.droneId !== "all" && !flight.droneIds.includes(reportFilters.droneId)) return false;
      if (reportFilters.pilotId !== "all" && flight.pilotoId !== reportFilters.pilotId) return false;
      return true;
    });
  }, [flights, reportFilters]);

  const metrics = useMemo(() => {
    return {
      dronesOperativos: drones.filter((d) => d.estado === "Operativo").length,
      pilotosActivos: pilots.filter((p) => p.estado === "Activo").length,
      vuelosPlanificados: flights.filter((f) => f.estado === "Planificado").length,
      permisosPendientes: flights.reduce((acc, f) => acc + f.permisos.filter((p) => p.estado !== "Aprobado").length, 0),
    };
  }, [drones, pilots, flights]);

  const droneRanking = useMemo(() => [...drones].sort((a, b) => b.horasUsoMinutos - a.horasUsoMinutos), [drones]);
  const pilotRanking = useMemo(() => [...pilots].sort((a, b) => b.tiempoVueloMinutos - a.tiempoVueloMinutos), [pilots]);

  const reportSummary = useMemo(() => {
    const totalMinutes = reportFlights.reduce((acc, flight) => acc + flight.duracionMinutos, 0);
    const avgMinutes = reportFlights.length ? Math.round(totalMinutes / reportFlights.length) : 0;
    return {
      totalMinutes,
      avgMinutes,
      count: reportFlights.length,
      blockedCount: reportFlights.filter((f) => f.estado === "Bloqueado").length,
      plannedCount: reportFlights.filter((f) => f.estado === "Planificado").length,
      executedCount: reportFlights.filter((f) => f.estado === "Ejecutado").length,
    };
  }, [reportFlights]);

  const addDrone = () => {
    if (!newDrone.id.trim() || !newDrone.modelo.trim()) return;
    setDrones((prev) => [{ ...newDrone, id: newDrone.id.trim(), modelo: newDrone.modelo.trim() }, ...prev]);
    setNewDrone(defaultDroneDraft);
  };

  const addPilot = () => {
    if (!newPilot.id.trim() || !newPilot.nombre.trim()) return;
    setPilots((prev) => [
      {
        ...newPilot,
        id: newPilot.id.trim(),
        nombre: newPilot.nombre.trim(),
        permisos: newPilot.permisos.split(",").map((p) => p.trim()).filter(Boolean),
      },
      ...prev,
    ]);
    setNewPilot(defaultPilotDraft);
  };

  const addFlight = () => {
    const durationMinutes = parseDurationToMinutes(newFlight.duracion);
    if (!newFlight.id.trim() || !newFlight.fecha || !newFlight.droneIds.length || !newFlight.pilotoId || durationMinutes <= 0) return;

    const flight: FlightItem = {
      id: newFlight.id.trim(),
      fecha: newFlight.fecha,
      zona: newFlight.zona.trim(),
      droneIds: newFlight.droneIds,
      pilotoId: newFlight.pilotoId,
      estado: newFlight.estado,
      objetivo: newFlight.objetivo.trim(),
      altitud: newFlight.altitud,
      duracionMinutos: durationMinutes,
      riesgo: newFlight.riesgo,
      permisoEstado: newFlight.permisoEstado,
      comentarios: [],
      permisos: [],
    };

    setFlights((prev) => [flight, ...prev]);
    setDrones((prev) => prev.map((drone) => (flight.droneIds.includes(drone.id) ? { ...drone, horasUsoMinutos: drone.horasUsoMinutos + durationMinutes } : drone)));
    setPilots((prev) => prev.map((pilot) => (pilot.id === flight.pilotoId ? { ...pilot, tiempoVueloMinutos: pilot.tiempoVueloMinutos + durationMinutes } : pilot)));
    setSelectedFlightId(flight.id);
    setNewFlight(defaultFlightDraft);
  };

  const addComment = () => {
    if (!selectedFlight || !commentDraft.trim()) return;
    setFlights((prev) =>
      prev.map((flight) =>
        flight.id === selectedFlight.id
          ? {
              ...flight,
              comentarios: [...flight.comentarios, { autor: "Operador", texto: commentDraft.trim(), fecha: new Date().toISOString().slice(0, 10) }],
            }
          : flight,
      ),
    );
    setCommentDraft("");
  };

  const addCategoria = () => {
    const value = categoriaDraft.trim();
    if (!value || customization.categorias.includes(value)) return;
    setCustomization((prev) => ({ ...prev, categorias: [...prev.categorias, value] }));
    setCategoriaDraft("");
  };

  const addModelo = () => {
    const value = modeloDraft.trim();
    if (!value || customization.modelosDrone.includes(value)) return;
    setCustomization((prev) => ({ ...prev, modelosDrone: [...prev.modelosDrone, value] }));
    setModeloDraft("");
  };

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
        <aside style={{ ...cardStyle(), alignSelf: "start", position: "sticky", top: 16 }}>
          <div style={{ background: "#0f172a", color: "white", borderRadius: 24, padding: 20 }}>
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
              <button
                key={item.id}
                onClick={() => setView(item.id)}
                style={{
                  ...buttonStyle(view === item.id),
                  textAlign: "left",
                  width: "100%",
                  background: view === item.id ? "#0f172a" : "white",
                  color: view === item.id ? "white" : "#0f172a",
                }}
              >
                {item.label}
              </button>
            ))}
          </div>
        </aside>

        <main style={{ display: "grid", gap: 24 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
            <div>
              <div style={{ fontSize: 14, color: "#64748b", fontWeight: 600 }}>Panel operativo</div>
              <h1 style={{ margin: "6px 0 0", fontSize: 34 }}>{customization.appTitle}</h1>
            </div>
            <input style={{ ...inputStyle(), maxWidth: 420 }} value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar vuelos, zonas, pilotos o drones" />
          </div>

          <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(4, minmax(0, 1fr))" }}>
            {[
              ["Drones operativos", String(metrics.dronesOperativos)],
              ["Pilotos activos", String(metrics.pilotosActivos)],
              ["Vuelos planificados", String(metrics.vuelosPlanificados)],
              ["Permisos abiertos", String(metrics.permisosPendientes)],
            ].map(([label, value]) => (
              <div key={label} style={cardStyle()}>
                <div style={{ fontSize: 14, color: "#64748b" }}>{label}</div>
                <div style={{ fontSize: 32, fontWeight: 800, marginTop: 8 }}>{value}</div>
              </div>
            ))}
          </div>

          {view === "dashboard" && (
            <div style={{ display: "grid", gap: 24 }}>
              <div style={cardStyle()}>
                {sectionTitle("Próximas operaciones", "Resumen ejecutivo de operaciones, bloqueos y próximos trabajos.")}
                <div style={{ display: "grid", gap: 12 }}>
                  {filteredFlights.map((flight) => (
                    <button
                      key={flight.id}
                      onClick={() => {
                        setSelectedFlightId(flight.id);
                        setView("vuelos");
                      }}
                      style={{ ...cardStyle(), textAlign: "left", padding: 16, cursor: "pointer" }}
                    >
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                        <strong>{flight.id}</strong>
                        <span style={badgeStyle(flight.estado)}>{flight.estado}</span>
                        <span style={badgeStyle(flight.riesgo)}>{flight.riesgo}</span>
                        <span style={badgeStyle(flight.permisoEstado)}>{flight.permisoEstado}</span>
                      </div>
                      <div style={{ marginTop: 10 }}>{flight.objetivo}</div>
                      <div style={{ marginTop: 8, fontSize: 14, color: "#64748b" }}>{flight.fecha} · {flight.zona}</div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {view === "flota" && (
            <div style={{ display: "grid", gap: 24 }}>
              <div style={cardStyle()}>
                {sectionTitle("Flota de drones", "Frontend simplificado para GitHub Pages, sin librerías de UI externas.")}
                <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(2, minmax(0,1fr))" }}>
                  <input style={inputStyle()} placeholder="ID" value={newDrone.id} onChange={(e) => setNewDrone({ ...newDrone, id: e.target.value })} />
                  <input style={inputStyle()} placeholder="Modelo" value={newDrone.modelo} onChange={(e) => setNewDrone({ ...newDrone, modelo: e.target.value })} />
                  <input style={inputStyle()} placeholder="Serie" value={newDrone.serie} onChange={(e) => setNewDrone({ ...newDrone, serie: e.target.value })} />
                  <input style={inputStyle()} placeholder="Base" value={newDrone.base} onChange={(e) => setNewDrone({ ...newDrone, base: e.target.value })} />
                  <input style={inputStyle()} placeholder="Autonomía" value={newDrone.autonomia} onChange={(e) => setNewDrone({ ...newDrone, autonomia: e.target.value })} />
                  <input style={inputStyle()} placeholder="Cámara" value={newDrone.camara} onChange={(e) => setNewDrone({ ...newDrone, camara: e.target.value })} />
                  <input style={inputStyle()} type="number" placeholder="Batería %" value={newDrone.bateria} onChange={(e) => setNewDrone({ ...newDrone, bateria: Number(e.target.value) || 0 })} />
                  <input style={inputStyle()} type="number" placeholder="Nº baterías" value={newDrone.numeroBaterias} onChange={(e) => setNewDrone({ ...newDrone, numeroBaterias: Number(e.target.value) || 0 })} />
                </div>
                <div style={{ marginTop: 12 }}><button style={buttonStyle()} onClick={addDrone}>Guardar dron</button></div>
              </div>

              <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(2, minmax(0,1fr))" }}>
                {drones.map((drone) => (
                  <div key={drone.id} style={cardStyle()}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
                      <div>
                        <h3 style={{ margin: 0 }}>{drone.modelo}</h3>
                        <div style={{ color: "#64748b", fontSize: 14 }}>{drone.id} · Serie {drone.serie}</div>
                      </div>
                      <span style={badgeStyle(drone.estado)}>{drone.estado}</span>
                    </div>
                    <div style={{ marginTop: 16, display: "grid", gap: 8, fontSize: 14 }}>
                      <div><strong>Batería principal:</strong> {drone.bateria}%</div>
                      <div><strong>Horas de uso:</strong> {formatMinutes(drone.horasUsoMinutos)}</div>
                      <div><strong>Base:</strong> {drone.base || "Sin asignar"}</div>
                      <div><strong>Nº baterías:</strong> {drone.numeroBaterias}</div>
                      <div><strong>Autonomía:</strong> {drone.autonomia}</div>
                      <div><strong>Cámara:</strong> {drone.camara}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {view === "pilotos" && (
            <div style={{ display: "grid", gap: 24 }}>
              <div style={cardStyle()}>
                {sectionTitle("Pilotos", "Gestión simple y portable para despliegue estático.")}
                <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(2, minmax(0,1fr))" }}>
                  <input style={inputStyle()} placeholder="ID" value={newPilot.id} onChange={(e) => setNewPilot({ ...newPilot, id: e.target.value })} />
                  <input style={inputStyle()} placeholder="Nombre" value={newPilot.nombre} onChange={(e) => setNewPilot({ ...newPilot, nombre: e.target.value })} />
                  <input style={inputStyle()} placeholder="Licencia" value={newPilot.licencia} onChange={(e) => setNewPilot({ ...newPilot, licencia: e.target.value })} />
                  <input style={inputStyle()} placeholder="Email" value={newPilot.email} onChange={(e) => setNewPilot({ ...newPilot, email: e.target.value })} />
                  <input style={inputStyle()} placeholder="Teléfono" value={newPilot.telefono} onChange={(e) => setNewPilot({ ...newPilot, telefono: e.target.value })} />
                  <input style={inputStyle()} placeholder="Certificaciones" value={newPilot.certificaciones} onChange={(e) => setNewPilot({ ...newPilot, certificaciones: e.target.value })} />
                  <input style={inputStyle()} type="number" placeholder="Experiencia (h)" value={newPilot.experiencia} onChange={(e) => setNewPilot({ ...newPilot, experiencia: Number(e.target.value) || 0 })} />
                  <input style={inputStyle()} placeholder="Permisos separados por coma" value={newPilot.permisos} onChange={(e) => setNewPilot({ ...newPilot, permisos: e.target.value })} />
                </div>
                <div style={{ marginTop: 12 }}><button style={buttonStyle()} onClick={addPilot}>Guardar piloto</button></div>
              </div>

              <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(2, minmax(0,1fr))" }}>
                {pilots.map((pilot) => (
                  <div key={pilot.id} style={cardStyle()}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
                      <div>
                        <h3 style={{ margin: 0 }}>{pilot.nombre}</h3>
                        <div style={{ color: "#64748b", fontSize: 14 }}>{pilot.id} · {pilot.licencia}</div>
                      </div>
                      <span style={badgeStyle(pilot.estado)}>{pilot.estado}</span>
                    </div>
                    <div style={{ marginTop: 16, display: "grid", gap: 8, fontSize: 14 }}>
                      <div><strong>Experiencia:</strong> {pilot.experiencia} h</div>
                      <div><strong>Tiempo volado:</strong> {formatMinutes(pilot.tiempoVueloMinutos)}</div>
                      <div><strong>Email:</strong> {pilot.email}</div>
                      <div><strong>Teléfono:</strong> {pilot.telefono}</div>
                      <div><strong>Permisos:</strong> {pilot.permisos.join(", ")}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {view === "vuelos" && (
            <div style={{ display: "grid", gap: 24 }}>
              <div style={cardStyle()}>
                {sectionTitle("Vuelos", "Creación y detalle operativo con acumulación automática de horas.")}
                <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(2, minmax(0,1fr))" }}>
                  <input style={inputStyle()} placeholder="ID" value={newFlight.id} onChange={(e) => setNewFlight({ ...newFlight, id: e.target.value })} />
                  <input style={inputStyle()} type="date" value={newFlight.fecha} onChange={(e) => setNewFlight({ ...newFlight, fecha: e.target.value })} />
                  <input style={{ ...inputStyle(), gridColumn: "1 / -1" }} placeholder="Zona" value={newFlight.zona} onChange={(e) => setNewFlight({ ...newFlight, zona: e.target.value })} />
                  <select style={inputStyle()} value={newFlight.pilotoId} onChange={(e) => setNewFlight({ ...newFlight, pilotoId: e.target.value })}>
                    <option value="">Selecciona piloto</option>
                    {pilots.map((pilot) => <option key={pilot.id} value={pilot.id}>{pilot.id} · {pilot.nombre}</option>)}
                  </select>
                  <input style={inputStyle()} placeholder="Duración hh:mm" value={newFlight.duracion} onChange={(e) => setNewFlight({ ...newFlight, duracion: e.target.value })} />
                  <input style={inputStyle()} placeholder="Altitud" value={newFlight.altitud} onChange={(e) => setNewFlight({ ...newFlight, altitud: e.target.value })} />
                  <select style={inputStyle()} value={newFlight.estado} onChange={(e) => setNewFlight({ ...newFlight, estado: e.target.value as FlightStatus })}>
                    <option value="Planificado">Planificado</option>
                    <option value="Bloqueado">Bloqueado</option>
                    <option value="Ejecutado">Ejecutado</option>
                  </select>
                  <select style={inputStyle()} value={newFlight.riesgo} onChange={(e) => setNewFlight({ ...newFlight, riesgo: e.target.value as RiskLevel })}>
                    <option value="Bajo">Bajo</option>
                    <option value="Medio">Medio</option>
                    <option value="Alto">Alto</option>
                  </select>
                  <textarea style={{ ...inputStyle(), gridColumn: "1 / -1", minHeight: 90 }} placeholder="Objetivo" value={newFlight.objetivo} onChange={(e) => setNewFlight({ ...newFlight, objetivo: e.target.value })} />
                  <div style={{ gridColumn: "1 / -1" }}>
                    <div style={{ marginBottom: 8, fontWeight: 600 }}>Drones usados</div>
                    <div style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(2, minmax(0,1fr))" }}>
                      {drones.map((drone) => {
                        const checked = newFlight.droneIds.includes(drone.id);
                        return (
                          <label key={drone.id} style={{ border: "1px solid #d1d5db", borderRadius: 12, padding: 10, background: "#f8fafc", display: "flex", gap: 10, alignItems: "center" }}>
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={(e) =>
                                setNewFlight((prev) => ({
                                  ...prev,
                                  droneIds: e.target.checked ? [...prev.droneIds, drone.id] : prev.droneIds.filter((id) => id !== drone.id),
                                }))
                              }
                            />
                            <span>{drone.id} · {drone.modelo}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                </div>
                <div style={{ marginTop: 12 }}><button style={buttonStyle()} onClick={addFlight}>Guardar vuelo</button></div>
              </div>

              <div style={{ display: "grid", gap: 24, gridTemplateColumns: "1fr 1fr" }}>
                <div style={cardStyle()}>
                  {sectionTitle("Listado operativo")}
                  <div style={{ display: "grid", gap: 12 }}>
                    {filteredFlights.map((flight) => (
                      <button
                        key={flight.id}
                        onClick={() => setSelectedFlightId(flight.id)}
                        style={{
                          ...cardStyle(),
                          textAlign: "left",
                          padding: 16,
                          cursor: "pointer",
                          border: selectedFlightId === flight.id ? "2px solid #0f172a" : "1px solid #e5e7eb",
                        }}
                      >
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                          <strong>{flight.id}</strong>
                          <span style={badgeStyle(flight.estado)}>{flight.estado}</span>
                          <span style={badgeStyle(flight.permisoEstado)}>{flight.permisoEstado}</span>
                        </div>
                        <div style={{ marginTop: 8 }}>{flight.objetivo}</div>
                        <div style={{ marginTop: 8, fontSize: 14, color: "#64748b" }}>{flight.fecha} · {flight.zona}</div>
                      </button>
                    ))}
                  </div>
                </div>

                <div style={cardStyle()}>
                  {sectionTitle("Detalle del vuelo")}
                  {selectedFlight ? (
                    <>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                        <strong>{selectedFlight.id}</strong>
                        <span style={badgeStyle(selectedFlight.estado)}>{selectedFlight.estado}</span>
                        <span style={badgeStyle(selectedFlight.riesgo)}>{selectedFlight.riesgo}</span>
                        <span style={badgeStyle(selectedFlight.permisoEstado)}>{selectedFlight.permisoEstado}</span>
                      </div>
                      <p style={{ marginTop: 12 }}>{selectedFlight.objetivo}</p>
                      <div style={{ display: "grid", gap: 8, fontSize: 14 }}>
                        <div><strong>Fecha:</strong> {selectedFlight.fecha}</div>
                        <div><strong>Zona:</strong> {selectedFlight.zona}</div>
                        <div><strong>Duración:</strong> {formatMinutes(selectedFlight.duracionMinutos)}</div>
                        <div><strong>Piloto:</strong> {pilots.find((p) => p.id === selectedFlight.pilotoId)?.nombre ?? selectedFlight.pilotoId}</div>
                      </div>
                      <div style={{ marginTop: 16 }}>
                        <textarea style={{ ...inputStyle(), minHeight: 90 }} placeholder="Añadir comentario operativo" value={commentDraft} onChange={(e) => setCommentDraft(e.target.value)} />
                        <div style={{ marginTop: 8 }}><button style={buttonStyle()} onClick={addComment}>Añadir comentario</button></div>
                      </div>
                      <div style={{ marginTop: 16, display: "grid", gap: 8 }}>
                        {selectedFlight.comentarios.map((comment, idx) => (
                          <div key={`${selectedFlight.id}-${idx}`} style={{ border: "1px solid #e5e7eb", borderRadius: 14, padding: 12, background: "#f8fafc" }}>
                            <div style={{ fontSize: 13, color: "#64748b" }}>{comment.autor} · {comment.fecha}</div>
                            <div style={{ marginTop: 6 }}>{comment.texto}</div>
                          </div>
                        ))}
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
            <div style={cardStyle()}>
              {sectionTitle("Permisos", "Vista simple para despliegue estático.")}
              {selectedFlight ? (
                <div style={{ display: "grid", gap: 12 }}>
                  <div><strong>Vuelo seleccionado:</strong> {selectedFlight.id}</div>
                  {selectedFlight.permisos.map((permiso, idx) => (
                    <div key={`${selectedFlight.id}-perm-${idx}`} style={{ border: "1px solid #e5e7eb", borderRadius: 14, padding: 12, background: "#f8fafc" }}>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                        <strong>{permiso.tipo}</strong>
                        <span style={badgeStyle(permiso.estado)}>{permiso.estado}</span>
                      </div>
                      <div style={{ marginTop: 8, color: "#475569" }}>{permiso.observacion}</div>
                    </div>
                  ))}
                </div>
              ) : (
                <p>No hay vuelo seleccionado.</p>
              )}
            </div>
          )}

          {view === "reportes" && (
            <div style={{ display: "grid", gap: 24 }}>
              <div style={cardStyle()}>
                {sectionTitle("Reportes", "Sin librerías de gráficas, con resumen y rankings en modo GitHub Pages.")}
                <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(4, minmax(0,1fr))" }}>
                  <input style={inputStyle()} type="date" value={reportFilters.from} onChange={(e) => setReportFilters((prev) => ({ ...prev, from: e.target.value }))} />
                  <input style={inputStyle()} type="date" value={reportFilters.to} onChange={(e) => setReportFilters((prev) => ({ ...prev, to: e.target.value }))} />
                  <select style={inputStyle()} value={reportFilters.droneId} onChange={(e) => setReportFilters((prev) => ({ ...prev, droneId: e.target.value }))}>
                    <option value="all">Todos los drones</option>
                    {drones.map((drone) => <option key={drone.id} value={drone.id}>{drone.modelo}</option>)}
                  </select>
                  <select style={inputStyle()} value={reportFilters.pilotId} onChange={(e) => setReportFilters((prev) => ({ ...prev, pilotId: e.target.value }))}>
                    <option value="all">Todos los pilotos</option>
                    {pilots.map((pilot) => <option key={pilot.id} value={pilot.id}>{pilot.nombre}</option>)}
                  </select>
                </div>
              </div>

              <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(4, minmax(0,1fr))" }}>
                {[
                  ["Horas de vuelo", formatMinutes(reportSummary.totalMinutes)],
                  ["Vuelos filtrados", String(reportSummary.count)],
                  ["Duración media", formatMinutes(reportSummary.avgMinutes)],
                  ["Bloqueados", String(reportSummary.blockedCount)],
                ].map(([label, value]) => (
                  <div key={label} style={cardStyle()}>
                    <div style={{ fontSize: 14, color: "#64748b" }}>{label}</div>
                    <div style={{ fontSize: 28, fontWeight: 800, marginTop: 8 }}>{value}</div>
                  </div>
                ))}
              </div>

              <div style={{ display: "grid", gap: 24, gridTemplateColumns: "1fr 1fr" }}>
                <div style={cardStyle()}>
                  {sectionTitle("Ranking por uso de drones")}
                  <div style={{ display: "grid", gap: 10 }}>
                    {droneRanking.map((drone, index) => (
                      <div key={drone.id} style={{ border: "1px solid #e5e7eb", borderRadius: 14, padding: 12, background: "#f8fafc" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                          <div><strong>#{index + 1} · {drone.modelo}</strong></div>
                          <div>{formatMinutes(drone.horasUsoMinutos)}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div style={cardStyle()}>
                  {sectionTitle("Ranking por pilotos")}
                  <div style={{ display: "grid", gap: 10 }}>
                    {pilotRanking.map((pilot, index) => (
                      <div key={pilot.id} style={{ border: "1px solid #e5e7eb", borderRadius: 14, padding: 12, background: "#f8fafc" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                          <div><strong>#{index + 1} · {pilot.nombre}</strong></div>
                          <div>{formatMinutes(pilot.tiempoVueloMinutos)}</div>
                        </div>
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
                <div style={cardStyle()}>
                  {sectionTitle("Configuración del sistema")}
                  <div style={{ display: "grid", gap: 8, fontSize: 14 }}>
                    <div><strong>Persistencia:</strong> localStorage</div>
                    <div><strong>Frontend:</strong> compatible con Vite + GitHub Pages</div>
                    <div><strong>Base de datos:</strong> no requiere servidor</div>
                    <div><strong>Exportación:</strong> eliminada para facilitar despliegue</div>
                  </div>
                </div>

                <div style={cardStyle()}>
                  {sectionTitle("Personalización")}
                  <div style={{ display: "grid", gap: 12 }}>
                    <input style={inputStyle()} placeholder="Título de la aplicación" value={customization.appTitle} onChange={(e) => setCustomization((prev) => ({ ...prev, appTitle: e.target.value }))} />
                    <textarea style={{ ...inputStyle(), minHeight: 90 }} placeholder="Descripción corta" value={customization.appSubtitle} onChange={(e) => setCustomization((prev) => ({ ...prev, appSubtitle: e.target.value }))} />
                    <input style={inputStyle()} placeholder="Logo por URL" value={customization.logoUrl} onChange={(e) => setCustomization((prev) => ({ ...prev, logoUrl: e.target.value }))} />
                  </div>
                </div>
              </div>

              <div style={{ display: "grid", gap: 24, gridTemplateColumns: "1fr 1fr" }}>
                <div style={cardStyle()}>
                  {sectionTitle("Categorías")}
                  <div style={{ display: "flex", gap: 8 }}>
                    <input style={inputStyle()} placeholder="Nueva categoría" value={categoriaDraft} onChange={(e) => setCategoriaDraft(e.target.value)} />
                    <button style={buttonStyle()} onClick={addCategoria}>Añadir</button>
                  </div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
                    {customization.categorias.map((categoria) => (
                      <button key={categoria} onClick={() => setCustomization((prev) => ({ ...prev, categorias: prev.categorias.filter((item) => item !== categoria) }))} style={{ ...buttonStyle(false), padding: "6px 10px", fontSize: 12 }}>
                        {categoria} ×
                      </button>
                    ))}
                  </div>
                </div>

                <div style={cardStyle()}>
                  {sectionTitle("Modelos de dron")}
                  <div style={{ display: "flex", gap: 8 }}>
                    <input style={inputStyle()} placeholder="Nuevo modelo" value={modeloDraft} onChange={(e) => setModeloDraft(e.target.value)} />
                    <button style={buttonStyle()} onClick={addModelo}>Añadir</button>
                  </div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
                    {customization.modelosDrone.map((modelo) => (
                      <button key={modelo} onClick={() => setCustomization((prev) => ({ ...prev, modelosDrone: prev.modelosDrone.filter((item) => item !== modelo) }))} style={{ ...buttonStyle(false), padding: "6px 10px", fontSize: 12 }}>
                        {modelo} ×
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div style={{ display: "grid", gap: 24, gridTemplateColumns: "1fr 1fr" }}>
                <div style={cardStyle()}>
                  {sectionTitle("Mantenimiento")}
                  <p style={{ color: "#475569", fontSize: 14 }}>Esta acción borra drones, pilotos, vuelos, filtros y personalización guardados en este navegador.</p>
                  <button style={{ ...buttonStyle(), background: "#991b1b", borderColor: "#991b1b" }} onClick={resetSystemData}>Restablecer datos del sistema</button>
                </div>

                <div style={cardStyle()}>
                  {sectionTitle("Vista previa")}
                  <div style={{ background: "#0f172a", color: "white", borderRadius: 24, padding: 20 }}>
                    <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                      {customization.logoUrl ? (
                        <img src={customization.logoUrl} alt="Logo" style={{ width: 48, height: 48, borderRadius: 16, objectFit: "cover" }} />
                      ) : (
                        <div style={{ width: 48, height: 48, borderRadius: 16, background: "rgba(255,255,255,0.1)", display: "grid", placeItems: "center" }}>🚁</div>
                      )}
                      <div>
                        <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.24em", color: "#cbd5e1" }}>Studio UAS</div>
                        <div style={{ fontSize: 18, fontWeight: 700 }}>{customization.appTitle}</div>
                      </div>
                    </div>
                    <p style={{ marginTop: 14, color: "#cbd5e1", fontSize: 14 }}>{customization.appSubtitle}</p>
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
