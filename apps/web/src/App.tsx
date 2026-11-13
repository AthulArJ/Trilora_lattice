import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import './zone-demo.css';
import './map-response.css';
import { Activity, AlertTriangle, ArrowUpRight, BarChart3, Bell, Battery, CalendarDays, Check, ChevronDown, ClipboardCheck, Clock3, Download, Filter, HelpCircle, Layers3, LogOut, MapPin, Maximize2, Menu, Minimize2, Moon, MoreHorizontal, Navigation, Plus, Radio, RefreshCw, Search, Settings2, ShieldCheck, Siren, Sun, Users, Volume2, VolumeX, X } from 'lucide-react';
import { useAuth } from './auth/AuthProvider';
import { supabase } from './lib/supabase';
import './brand.css';
import BrandLogo from './components/BrandLogo';
import ProductAttribution from './components/ProductAttribution';

const AreaMapsPage = lazy(() => import('./AreaMapsPage'));
const PeopleTagsPage = lazy(() => import('./PeopleTagsPage'));
const TrackHistoryPage = lazy(() => import('./TrackHistoryPage'));
const IncidentCenterPage = lazy(() => import('./IncidentCenterPage'));
const InsightsPage = lazy(() => import('./InsightsPage'));
const ShiftHandoverPage = lazy(() => import('./ShiftHandoverPage'));
const DevicesPage = lazy(() => import('./DevicesPage'));
const AuditLogPage = lazy(() => import('./AuditLogPage'));
const UsersAccessPage = lazy(() => import('./UsersAccessPage'));
const OperationsHubPage = lazy(() => import('./OperationsHubPage'));

type Worker = { id: string; name: string; role: string; workforceCategory?: string; employerName?: string | null; tagId: string; status: string; battery: number | null; lastSeen: string; positionLastSeen?: string | null; positionStatus?: string; positionConfidence?: number | null; anchorsUsed?: number | null; positionSource?: string | null; positionMapId?: string | null; x: number | null; y: number | null };
type DemoZone = { id: string; name: string; x: number; y: number; width: number; height: number };
type DemoZoneEvent = { id: string; worker: string; zone: string; action: 'Entered' | 'Exited'; time: string };
const DEMO_ZONES: DemoZone[] = [
  { id: 'security', name: 'North Zone', x: 18, y: 24, width: 22, height: 19 },
  { id: 'north-operations', name: 'Operations Zone', x: 64, y: 24, width: 24, height: 19 },
  { id: 'staff', name: 'Maintenance Zone', x: 39, y: 56, width: 21, height: 19 },
  { id: 'logistics', name: 'Logistics Zone', x: 13, y: 70, width: 21, height: 17 },
];
function getDemoZone(worker: Worker) {
  if (worker.x == null || worker.y == null) return null;
  return DEMO_ZONES.find(zone => worker.x! >= zone.x && worker.x! <= zone.x + zone.width && worker.y! >= zone.y && worker.y! <= zone.y + zone.height) ?? null;
}
type Incident = { id: string; incidentCode?: string; workerId: string; worker: string; tagId: string; status: string; createdAt: string; acknowledgedAt?: string; acknowledgedBy?: string | null; assignedAt?: string; assignedBy?: string; resolvedAt?: string; resolvedBy?: string | null; resolutionNote?: string | null; assignedTo?: string | null; area: string; simulated?: boolean };
type TrackPoint = { map_id: string | null; xPercent: number | null; yPercent: number | null; observed_at: string };
type PublishedMap = { id: string; name: string; version: number; asset_path: string; previewUrl: string };
type AnchorSummary = { id: string; label: string; model: string; mapId: string | null; state: string; lastSeen: string | null; xPercent: number | null; yPercent: number | null };
type BadgeSummary = { id: string; label: string; battery: number | null; status: string; lastSeen: string | null; worker: string | null };
const DEMO_SOS_TARGET_MS = 2 * 60 * 1000;
const API = import.meta.env.VITE_API_URL ?? 'http://localhost:4000';
const THEME_STORAGE_KEY = 'lattice-theme';
type AppTheme = 'dark' | 'light';
function makeDemoWorkers(now = new Date().toISOString()): Worker[] {
  return [
    { id: 'demo-worker-101', name: 'Amara Patel', role: 'Operations Team', tagId: 'Badge 001', status: 'online', battery: 84, lastSeen: now, positionLastSeen: now, positionStatus: 'online', positionSource: 'simulated', positionConfidence: 0.94, anchorsUsed: 4, positionMapId: null, x: 31, y: 47 },
    { id: 'demo-worker-102', name: 'Ravi Menon', role: 'Facilities', tagId: 'Badge 002', status: 'online', battery: 67, lastSeen: now, positionLastSeen: now, positionStatus: 'online', positionSource: 'simulated', positionConfidence: 0.89, anchorsUsed: 4, positionMapId: null, x: 68, y: 35 },
    { id: 'demo-worker-103', name: 'Leah Thomas', role: 'Security', tagId: 'Badge 003', status: 'stale', battery: 19, lastSeen: now, positionLastSeen: now, positionStatus: 'stale', positionSource: 'simulated', positionConfidence: 0.76, anchorsUsed: 3, positionMapId: null, x: 52, y: 69 },
  ];
}
function makeDemoBadges(now = new Date().toISOString()): BadgeSummary[] {
  return [
    { id: 'demo-badge-001', label: 'Badge 001', battery: 84, status: 'online', lastSeen: now, worker: 'Amara Patel' },
    { id: 'demo-badge-002', label: 'Badge 002', battery: 67, status: 'online', lastSeen: now, worker: 'Ravi Menon' },
    { id: 'demo-badge-003', label: 'Badge 003', battery: 19, status: 'stale', lastSeen: now, worker: 'Leah Thomas' },
  ];
}
function ago(value: string) { if (!value) return 'No updates'; const time = new Date(value).getTime(); if (!Number.isFinite(time)) return 'No updates'; const seconds = Math.max(0, Math.floor((Date.now() - time) / 1000)); return seconds < 60 ? `${seconds}s ago` : `${Math.floor(seconds / 60)}m ago`; }
function csvValue(value: unknown) {
  const text = value == null ? '' : String(value);
  const safe = /^[\s]*[=+@\-]/.test(text) ? `'${text}` : text;
  return `"${safe.replace(/"/g, '""')}"`;
}
function App() {
  const { configured, role, session, signOut } = useAuth();
  const isAdmin = !configured || role === 'admin';
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [anchors, setAnchors] = useState<AnchorSummary[]>([]);
  const [badges, setBadges] = useState<BadgeSummary[]>([]);
  const [dataSource, setDataSource] = useState('sample');
  const [theme, setTheme] = useState<AppTheme>(() => {
    try { return window.localStorage.getItem(THEME_STORAGE_KEY) === 'dark' ? 'dark' : 'light'; }
    catch { return 'light'; }
  });
  const [active, setActive] = useState('Operations Hub');
  const [selected, setSelected] = useState<Worker | null>(null);
  const [trackPositions, setTrackPositions] = useState<TrackPoint[]>([]);
  const [publishedMaps, setPublishedMaps] = useState<PublishedMap[]>([]);
  const [selectedMapId, setSelectedMapId] = useState('sample');
  const [mapMenu, setMapMenu] = useState(false);
  const [mapLayersOpen, setMapLayersOpen] = useState(false);
  const [showPeopleLayer, setShowPeopleLayer] = useState(true);
  const [showAnchorLayer, setShowAnchorLayer] = useState(true);
  const [showZoneLayer, setShowZoneLayer] = useState(true);
  const [demoZoneEvents, setDemoZoneEvents] = useState<DemoZoneEvent[]>([]);
  const demoZonePresenceRef = useRef<Record<string, string | null>>({});
  const [mapExpanded, setMapExpanded] = useState(false);
  const [mapAspectRatio, setMapAspectRatio] = useState(1200 / 760);
  const [mapCanvasSize, setMapCanvasSize] = useState({ width: 0, height: 0 });
  const mapCanvasRef = useRef<HTMLDivElement>(null);
  const demoModeRef = useRef(false);
  const overviewRequestRef = useRef(0);
  const [toast, setToast] = useState('');
  const [apiState, setApiState] = useState('Connecting');
  const [overviewUpdatedAt, setOverviewUpdatedAt] = useState('');
  const [demoModeActive, setDemoModeActive] = useState(false);
  const [demoRunning, setDemoRunning] = useState(false);
  const [guidedDemoRunning, setGuidedDemoRunning] = useState(false);
  const [guidedDemoStep, setGuidedDemoStep] = useState(0);
  const [presentationMode, setPresentationMode] = useState(false);
  const guidedDemoTimersRef = useRef<number[]>([]);
  const [sosSoundEnabled, setSosSoundEnabled] = useState(true);
  const [sosAudioUnlocked, setSosAudioUnlocked] = useState(false);
  const sosAudioContextRef = useRef<AudioContext | null>(null);
  const sosAlarmIntervalRef = useRef<number | null>(null);
  const sosSoundEnabledRef = useRef(true);
  const [query, setQuery] = useState('');
  const [quickFindOpen, setQuickFindOpen] = useState(false);
  const [clockNow, setClockNow] = useState(Date.now());
  useEffect(() => { const timer = window.setInterval(() => setClockNow(Date.now()), 10_000); return () => window.clearInterval(timer); }, []);
  useEffect(() => {
    const onFullscreenChange = () => { if (!document.fullscreenElement) setPresentationMode(false); };
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape' && presentationMode) exitPresentationMode(); };
    document.addEventListener('fullscreenchange', onFullscreenChange);
    document.addEventListener('keydown', onKeyDown);
    return () => { document.removeEventListener('fullscreenchange', onFullscreenChange); document.removeEventListener('keydown', onKeyDown); };
  }, [presentationMode]);
  const [quickFindQuery, setQuickFindQuery] = useState('');
  const [showAdmin, setShowAdmin] = useState(false);
  const [drawer, setDrawer] = useState(false);
  useEffect(() => {
    try { window.localStorage.setItem(THEME_STORAGE_KEY, theme); } catch { /* Theme still works for this session if storage is unavailable. */ }
  }, [theme]);
  const themeToggle = <button className="theme-toggle-button" type="button" onClick={() => setTheme(value => value === 'dark' ? 'light' : 'dark')} aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`} title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}><span aria-hidden="true">{theme === 'dark' ? <Sun size={16}/> : <Moon size={16}/>}</span><span>{theme === 'dark' ? 'Light' : 'Dark'} mode</span></button>;

  const refreshOverview = useCallback(async () => {
    if (demoModeRef.current) return;
    const requestId = ++overviewRequestRef.current;
    const headers = session ? { Authorization: `Bearer ${session.access_token}` } : undefined;
    const response = await fetch(`${API}/api/v1/overview`, { headers });
    if (!response.ok) throw new Error('Dashboard API unavailable');
    const data = await response.json();
    if (demoModeRef.current || requestId !== overviewRequestRef.current) return;
    setWorkers(data.staff ?? []); setIncidents(data.incidents ?? []);
    setAnchors(data.anchors ?? []); setBadges(data.badges ?? []); setDataSource(data.source ?? 'unknown');
    setApiState(data.source === 'supabase' ? 'Database connected' : 'Sample feed');
    setOverviewUpdatedAt(data.updatedAt ?? new Date().toISOString());
  }, [session]);
  useEffect(() => {
    if (demoModeActive) return;
    const refresh = () => { void refreshOverview().catch(() => { if (!demoModeRef.current) setApiState('API unavailable'); }); };
    refresh();
    const timer = window.setInterval(refresh, 15_000);
    return () => window.clearInterval(timer);
  }, [refreshOverview, demoModeActive]);
  useEffect(() => {
    if (!demoModeActive || !demoRunning) return;
    let phase = 0;
    const timer = window.setInterval(() => {
      phase += 0.12;
      const now = new Date().toISOString();
      setWorkers(current => current.map((worker, index) => worker.id.startsWith('demo-worker-') ? { ...worker, x: 50 + 28 * Math.sin(phase + index * 2.1), y: 50 + 24 * Math.cos(phase * 0.8 + index * 1.7), lastSeen: now, positionLastSeen: now } : worker));
      setBadges(current => current.map(badge => badge.id.startsWith('demo-badge-') ? { ...badge, lastSeen: now } : badge));
    }, 1200);
    return () => window.clearInterval(timer);
  }, [demoModeActive, demoRunning]);
  useEffect(() => {
    if (!demoModeActive) {
      demoZonePresenceRef.current = {};
      return;
    }
    const nextPresence: Record<string, string | null> = {};
    const changes: DemoZoneEvent[] = [];
    const now = new Date().toISOString();
    workers.filter(worker => worker.id.startsWith('demo-worker-')).forEach(worker => {
      const currentZone = getDemoZone(worker)?.id ?? null;
      const previousZone = demoZonePresenceRef.current[worker.id];
      nextPresence[worker.id] = currentZone;
      if (previousZone === undefined || previousZone === currentZone) return;
      if (previousZone) changes.push({ id: `${worker.id}-${now}-exit`, worker: worker.name, zone: DEMO_ZONES.find(zone => zone.id === previousZone)?.name ?? previousZone, action: 'Exited', time: now });
      if (currentZone) changes.push({ id: `${worker.id}-${now}-enter`, worker: worker.name, zone: DEMO_ZONES.find(zone => zone.id === currentZone)?.name ?? currentZone, action: 'Entered', time: now });
    });
    demoZonePresenceRef.current = nextPresence;
    if (changes.length) setDemoZoneEvents(previous => [...changes.reverse(), ...previous].slice(0, 8));
  }, [demoModeActive, workers]);
  useEffect(() => {
    if (demoModeActive) return;
    if (!supabase || !session) { setPublishedMaps([]); setSelectedMapId('sample'); return; }
    let alive = true;
    void (async () => {
      const { data, error } = await supabase!.from('area_maps').select('id,name,version,asset_path').eq('status', 'published').order('published_at', { ascending: false });
      if (!alive || error) return;
      const maps = await Promise.all((data ?? []).filter((map: any) => map.asset_path).map(async (map: any) => {
        const { data: signed } = await supabase!.storage.from('area-maps').createSignedUrl(map.asset_path, 3600);
        return { ...map, previewUrl: signed?.signedUrl ?? '' };
      }));
      if (!alive) return;
      setPublishedMaps(maps as PublishedMap[]);
      setSelectedMapId(current => current === 'sample' && maps.length ? maps[0].id : current);
    })();
    return () => { alive = false; };
  }, [session, active, demoModeActive]);
  useEffect(() => {
    const canvas = mapCanvasRef.current;
    if (!canvas) return;
    const observer = new ResizeObserver(([entry]) => setMapCanvasSize({ width: entry.contentRect.width, height: entry.contentRect.height }));
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [active]);
  useEffect(() => {
    const handleQuickFindKeys = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault(); setQuickFindOpen(true); setQuickFindQuery('');
      } else if (event.key === 'Escape') setQuickFindOpen(false);
    };
    window.addEventListener('keydown', handleQuickFindKeys);
    return () => window.removeEventListener('keydown', handleQuickFindKeys);
  }, []);
  useEffect(() => {
    if (!mapExpanded) return;
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') setMapExpanded(false); };
    document.body.classList.add('map-expanded-open');
    window.addEventListener('keydown', closeOnEscape);
    return () => { document.body.classList.remove('map-expanded-open'); window.removeEventListener('keydown', closeOnEscape); };
  }, [mapExpanded]);
  useEffect(() => {
    if (!selected || !session || demoModeActive || selected.id.startsWith('demo-worker-')) { setTrackPositions([]); return; }
    const controller = new AbortController();
    const from = new Date(Date.now() - 8 * 60 * 60 * 1000).toISOString();
    fetch(`${API}/api/v1/workers/${encodeURIComponent(selected.id)}/positions?from=${encodeURIComponent(from)}`, { headers: { Authorization: `Bearer ${session.access_token}` }, signal: controller.signal })
      .then(async response => { if (!response.ok) throw new Error('Track history unavailable'); return response.json(); })
      .then(result => setTrackPositions(result.data ?? []))
      .catch(error => { if (error.name !== 'AbortError') setTrackPositions([]); });
    return () => controller.abort();
  }, [selected?.id, session, demoModeActive]);
  function notify(message: string) { setToast(message); window.setTimeout(() => setToast(''), 2600); }
  function exitPresentationMode() {
    setPresentationMode(false);
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
  }
  function togglePresentationMode() {
    if (presentationMode) { exitPresentationMode(); return; }
    setPresentationMode(true);
    if (document.documentElement.requestFullscreen) void document.documentElement.requestFullscreen().catch(() => {});
  }
  function playSosChime() {
    const context = sosAudioContextRef.current;
    if (!context || context.state !== 'running') return;
    const now = context.currentTime;
    [880, 660].forEach((frequency, index) => {
      const start = now + index * 0.22;
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(frequency, start);
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.12, start + 0.025);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.19);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start(start);
      oscillator.stop(start + 0.2);
    });
  }
  function startSosAlarm() {
    if (!sosSoundEnabledRef.current || sosAlarmIntervalRef.current !== null) return;
    playSosChime();
    sosAlarmIntervalRef.current = window.setInterval(playSosChime, 3200);
  }
  function stopSosAlarm() {
    if (sosAlarmIntervalRef.current !== null) window.clearInterval(sosAlarmIntervalRef.current);
    sosAlarmIntervalRef.current = null;
  }
  async function unlockSosAudio() {
    if (typeof window === 'undefined' || !('AudioContext' in window)) {
      notify('This browser does not support SOS alert audio');
      return false;
    }
    try {
      const context = sosAudioContextRef.current ?? new AudioContext();
      sosAudioContextRef.current = context;
      await context.resume();
      setSosAudioUnlocked(true);
      return true;
    } catch {
      notify('Could not enable SOS audio · check browser sound settings');
      return false;
    }
  }
  useEffect(() => () => {
    guidedDemoTimersRef.current.forEach(timer => window.clearTimeout(timer));
    guidedDemoTimersRef.current = [];
    stopSosAlarm();
    void sosAudioContextRef.current?.close();
  }, []);
  async function toggleSosSound() {
    if (!sosAudioUnlocked) {
      const unlocked = await unlockSosAudio();
      if (unlocked) {
        if (unacknowledgedSos > 0) { playSosChime(); startSosAlarm(); }
        notify('SOS warning sound enabled');
      }
      return;
    }
    const enabled = !sosSoundEnabledRef.current;
    sosSoundEnabledRef.current = enabled;
    setSosSoundEnabled(enabled);
    if (enabled) {
      if (unacknowledgedSos > 0) { playSosChime(); startSosAlarm(); }
      notify('SOS warning sound enabled');
    } else {
      stopSosAlarm();
      notify('SOS warning sound muted');
    }
  }
  function exportReport() {
    const generatedAt = new Date().toISOString();
    const columns = ['report_generated_at', 'record_type', 'record_id', 'worker', 'team', 'tag', 'status', 'battery_percent', 'last_seen_at', 'incident_triggered_at', 'acknowledged_at', 'resolved_at', 'area', 'resolution_note', 'data_source'];
    const workforceRows = workers.map(worker => [generatedAt, 'workforce', worker.id, worker.name, worker.role, worker.tagId, worker.status, worker.battery, worker.lastSeen, '', '', '', '', '', apiState]);
    const incidentRows = incidents.map(incident => [generatedAt, 'incident', incident.incidentCode ?? incident.id, incident.worker, '', incident.tagId, incident.status, '', '', incident.createdAt, incident.acknowledgedAt, incident.resolvedAt, incident.area, incident.resolutionNote, incident.simulated ? 'simulated demo event' : apiState]);
    const csv = `\uFEFF${[columns, ...workforceRows, ...incidentRows].map(row => row.map(csvValue).join(',')).join('\r\n')}`;
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `lattice-operations-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    notify(`Operations report exported · ${workers.length} workers, ${incidents.length} incidents`);
  }
  async function incidentAction(item: Incident, action: 'acknowledge' | 'resolve') {
    if (item.simulated && demoModeRef.current) {
      const now = new Date().toISOString();
      setIncidents(previous => previous.map(incident => incident.id !== item.id ? incident : action === 'acknowledge'
        ? { ...incident, status: 'acknowledged', acknowledgedAt: now, acknowledgedBy: 'Demo operator' }
        : { ...incident, status: 'resolved', resolvedAt: now, resolvedBy: 'Demo operator', resolutionNote: 'Resolved in local demo' }));
      notify(action === 'acknowledge' ? 'Demo SOS acknowledged · local only' : 'Demo SOS resolved · local only');
      return;
    }
    try {
      const response = await fetch(`${API}/api/v1/incidents/${item.id}/action`, { method: 'POST', headers: { 'content-type': 'application/json', ...(session ? { Authorization: `Bearer ${session.access_token}` } : {}) }, body: JSON.stringify({ action }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? 'Could not update incident');
      setIncidents(prev => prev.map(i => i.id === item.id ? { ...i, status: result.data?.status ?? (action === 'acknowledge' ? 'acknowledged' : 'resolved') } : i));
    } catch (error) { notify(error instanceof Error ? error.message : 'Could not update incident'); return; }
    notify(action === 'acknowledge' ? 'SOS acknowledged · response owner recorded' : 'Incident resolved and logged');
  }
  function activateDemoMode(startMovement = false) {
    if (!demoModeRef.current) {
      overviewRequestRef.current += 1;
      demoModeRef.current = true;
      const now = new Date().toISOString();
      setWorkers(makeDemoWorkers(now)); setIncidents([]); setBadges(makeDemoBadges(now)); setAnchors([]);
      demoZonePresenceRef.current = {}; setDemoZoneEvents([]);
      setDataSource('demo'); setApiState('Demo presentation · local only'); setOverviewUpdatedAt(now);
    }
    setDemoModeActive(true);
    if (startMovement) setDemoRunning(true);
  }
  function toggleDemo() {
    if (!demoRunning) {
      activateDemoMode(true);
      notify('Local demo movement started · nothing is sent to or saved in the database');
    } else {
      setDemoRunning(false);
      notify('Demo movement paused · local demo alerts remain available');
    }
  }
  function cancelGuidedDemo() {
    guidedDemoTimersRef.current.forEach(timer => window.clearTimeout(timer));
    guidedDemoTimersRef.current = [];
    setGuidedDemoRunning(false);
  }
  function runGuidedDemo() {
    cancelGuidedDemo();
    void unlockSosAudio();
    const now = new Date().toISOString();
    const sampleWorkers = makeDemoWorkers(now);
    demoZonePresenceRef.current = {}; setDemoZoneEvents([]);
    activateDemoMode(true);
    setWorkers(sampleWorkers); setBadges(makeDemoBadges(now)); setAnchors([]); setIncidents([]);
    setGuidedDemoStep(1); setGuidedDemoRunning(true);
    const guidedIncidentId = `demo-guided-${Date.now()}`;
    const schedule = (delay: number, callback: () => void) => {
      const timer = window.setTimeout(() => {
        guidedDemoTimersRef.current = guidedDemoTimersRef.current.filter(value => value !== timer);
        callback();
      }, delay);
      guidedDemoTimersRef.current.push(timer);
    };
    schedule(1800, () => {
      setGuidedDemoStep(2);
      const createdAt = new Date().toISOString();
      setIncidents([{ id: guidedIncidentId, incidentCode: `DEMO-${String(Date.now()).slice(-6)}`, workerId: sampleWorkers[0].id, worker: sampleWorkers[0].name, tagId: sampleWorkers[0].tagId, status: 'active', createdAt, area: 'North Zone · Area A', simulated: true }]);
      if (sosSoundEnabledRef.current) void unlockSosAudio().then(unlocked => { if (unlocked) { playSosChime(); startSosAlarm(); } });
    });
    schedule(5200, () => {
      setGuidedDemoStep(3);
      const acknowledgedAt = new Date().toISOString();
      setIncidents(previous => previous.map(item => item.id === guidedIncidentId ? { ...item, status: 'acknowledged', acknowledgedAt, acknowledgedBy: 'Guided demo operator' } : item));
    });
    schedule(8200, () => {
      setGuidedDemoStep(4);
      const assignedAt = new Date().toISOString();
      setIncidents(previous => previous.map(item => item.id === guidedIncidentId ? { ...item, assignedTo: 'Ravi Menon', assignedAt, assignedBy: 'Guided demo operator' } : item));
    });
    schedule(12_000, () => {
      setGuidedDemoStep(5); setDemoRunning(false);
      const resolvedAt = new Date().toISOString();
      setIncidents(previous => previous.map(item => item.id === guidedIncidentId ? { ...item, status: 'resolved', resolvedAt, resolvedBy: 'Guided demo operator', resolutionNote: 'Guided demo response completed' } : item));
    });
    schedule(15_000, () => setGuidedDemoRunning(false));
    notify('Guided walkthrough started · the sequence runs locally and will not be saved');
  }
  function runDemoScenario(scenario: 'safety' | 'device' | 'activity' | 'overdue' | 'reset') {
    cancelGuidedDemo(); setGuidedDemoStep(0);
    const now = new Date().toISOString();
    const sampleWorkers = makeDemoWorkers(now);
    const sampleBadges = makeDemoBadges(now);
    demoZonePresenceRef.current = {}; setDemoZoneEvents([]);
    activateDemoMode(scenario === 'activity');
    if (scenario === 'safety') {
      setDemoRunning(false); setWorkers(sampleWorkers); setBadges(sampleBadges); setAnchors([]); setIncidents([]);
      triggerDemoSos();
      return;
    }
    if (scenario === 'device') {
      const healthWorkers = sampleWorkers.map(worker => worker.id === 'demo-worker-103' ? { ...worker, battery: 9, status: 'stale', positionStatus: 'stale' } : worker);
      const healthBadges = sampleBadges.map(badge => badge.id === 'demo-badge-003' ? { ...badge, battery: 9, status: 'stale' } : badge);
      setDemoRunning(false); setWorkers(healthWorkers); setBadges(healthBadges); setIncidents([]);
      setAnchors([
        { id: 'demo-anchor-a01', label: 'A01 · demo', model: 'BLE AoA anchor', mapId: null, state: 'offline', lastSeen: now, xPercent: null, yPercent: null },
        { id: 'demo-anchor-a02', label: 'A02 · demo', model: 'BLE AoA anchor', mapId: null, state: 'online', lastSeen: now, xPercent: null, yPercent: null },
      ]);
      notify('Device health drill loaded · simulated low battery and anchor state, local only');
      return;
    }
    if (scenario === 'overdue') {
      setDemoRunning(false); setWorkers(sampleWorkers); setBadges(sampleBadges); setAnchors([]);
      const createdAt = new Date(Date.now() - DEMO_SOS_TARGET_MS - 45_000).toISOString();
      const incidentId = `demo-overdue-${Date.now()}`;
      setIncidents([{ id: incidentId, incidentCode: `DEMO-${String(Date.now()).slice(-6)}`, workerId: sampleWorkers[0].id, worker: sampleWorkers[0].name, tagId: sampleWorkers[0].tagId, status: 'active', createdAt, area: 'North Zone · Area A', simulated: true }]);
      if (sosSoundEnabledRef.current) void unlockSosAudio().then(unlocked => { if (unlocked) { playSosChime(); startSosAlarm(); } });
      notify('SLA drill loaded · demo 2-minute acknowledgement target exceeded; local only');
      return;
    }
    setWorkers(sampleWorkers); setBadges(sampleBadges); setAnchors([]); setIncidents([]);
    if (scenario === 'activity') {
      notify('Busy workspace scenario started · sample badges moving locally');
      return;
    }
    setDemoRunning(false);
    notify('Demo reset · sample roster restored and alerts cleared locally');
  }
  function triggerDemoSos() {
    cancelGuidedDemo(); setGuidedDemoStep(0);
    const now = new Date().toISOString();
    activateDemoMode(false);
    const worker = makeDemoWorkers(now)[0];
    const id = `demo-${Date.now()}-${Math.random().toString(16).slice(2, 7)}`;
    setIncidents(previous => [{ id, incidentCode: `DEMO-${String(Date.now()).slice(-6)}`, workerId: worker.id, worker: worker.name, tagId: worker.tagId, status: 'active', createdAt: now, area: 'North Zone · Area A', simulated: true }, ...previous]);
    if (sosSoundEnabledRef.current) {
      void unlockSosAudio().then(unlocked => { if (unlocked) { playSosChime(); startSosAlarm(); } });
    }
    notify('Demo SOS triggered · acknowledge and resolve locally; it is not saved');
  }
  function exitDemoMode() {
    cancelGuidedDemo(); setGuidedDemoStep(0);
    demoModeRef.current = false;
    overviewRequestRef.current += 1;
    setDemoModeActive(false); setDemoRunning(false); setWorkers([]); setIncidents([]); setBadges([]); setAnchors([]);
    demoZonePresenceRef.current = {}; setDemoZoneEvents([]);
    setDataSource('unknown'); setApiState('Connecting'); setOverviewUpdatedAt('');
    notify('Local demo ended · reconnecting to live data');
  }
  const selectedMap = publishedMaps.find(map => map.id === selectedMapId);
  const activeSos = incidents.filter(i => i.status !== 'resolved').length;
  const unacknowledgedSos = incidents.filter(i => i.status === 'active').length;
  const demoSos = incidents.filter(incident => incident.simulated);
  const activeDemoSos = demoSos.find(incident => incident.status === 'active');
  const acknowledgedDemoSos = demoSos.find(incident => incident.status === 'acknowledged');
  const resolvedDemoSos = demoSos.find(incident => incident.status === 'resolved');
  const demoJourneyIncidentId = (activeDemoSos ?? acknowledgedDemoSos ?? resolvedDemoSos)?.id;
  const assignedDemoSos = demoSos.find(incident => incident.id === demoJourneyIncidentId && Boolean(incident.assignedTo));
  useEffect(() => {
    if (unacknowledgedSos > 0 && sosSoundEnabled) startSosAlarm();
    else stopSosAlarm();
  }, [unacknowledgedSos, sosSoundEnabled]);
  const assignedWorkers = workers.filter(worker => worker.tagId && worker.tagId !== 'Unassigned');
  const attentionWorkers = assignedWorkers.filter(worker => worker.status !== 'online');
  const badgesNeedingAttention = badges.filter(badge => badge.status !== 'online' || (badge.battery !== null && badge.battery < 20));
  const lowBatteryBadges = badges.filter(badge => badge.battery !== null && badge.battery < 20);
  const openIncidents = incidents.filter(i => i.status !== 'resolved');
  const unassignedWorkers = workers.filter(worker => !worker.tagId || worker.tagId === 'Unassigned');
  const livePositionWorkers = selectedMap && dataSource === 'supabase' ? workers.filter(worker => worker.positionMapId === selectedMap.id && worker.positionSource !== 'simulated' && worker.positionStatus !== 'unknown' && worker.positionStatus !== 'offline' && worker.x !== null && worker.y !== null) : [];
  const reportingPositionWorkers = assignedWorkers.filter(worker => worker.positionStatus === 'online' && worker.positionSource !== 'simulated');
  const currentMapPositionCount = livePositionWorkers.filter(worker => worker.positionStatus === 'online').length;
  const onlineAnchors = anchors.filter(anchor => anchor.state === 'online').length;
  const pendingAnchors = anchors.filter(anchor => anchor.state !== 'online' || !anchor.mapId || anchor.xPercent === null || anchor.yPercent === null).length;
  const orderedPositionTimes = workers.filter(worker => worker.positionSource !== 'simulated').map(worker => worker.positionLastSeen).filter((value): value is string => Boolean(value)).sort();
  const latestPositionTime = orderedPositionTimes[orderedPositionTimes.length - 1] ?? '';
  const positionFreshness = latestPositionTime ? ago(latestPositionTime) : 'No position events';
  const positionStreamStale = !latestPositionTime || (Date.now() - new Date(latestPositionTime).getTime()) > 90_000;
  const averageConfidence = reportingPositionWorkers.filter(worker => worker.positionConfidence != null).map(worker => worker.positionConfidence as number);
  const meanConfidence = averageConfidence.length ? Math.round(averageConfidence.reduce((sum, value) => sum + value, 0) / averageConfidence.length * 100) : null;
  const actionItems: Array<{ key: string; level: 'urgent' | 'attention' | 'info'; title: string; detail: string; action: string; onClick: () => void }> = [];
  if (dataSource === 'supabase' && positionStreamStale) actionItems.push({ key: 'rtls-stream', level: 'attention', title: latestPositionTime ? 'Position events are stale' : 'No position events received', detail: latestPositionTime ? `Last event ${positionFreshness} · check the event connection and anchor state` : 'Check the RTLS event connection and anchor commissioning', action: 'Check devices', onClick: () => setActive('Devices') });
  openIncidents.forEach(item => {
    const demoOverdue = demoModeActive && item.simulated && item.status === 'active' && clockNow - new Date(item.createdAt).getTime() >= DEMO_SOS_TARGET_MS;
    actionItems.push({ key: `incident-${item.id}`, level: item.status === 'active' ? 'urgent' : 'attention', title: `${demoOverdue ? 'DEMO TARGET EXCEEDED · ' : ''}${item.simulated ? 'Simulated SOS' : 'SOS'} · ${item.worker}`, detail: `${demoOverdue ? '2-minute demo acknowledgement target exceeded' : item.status === 'active' ? 'Awaiting acknowledgement' : 'Response in progress'} · ${item.area} · ${ago(item.createdAt)}`, action: item.status === 'active' && isAdmin ? 'Acknowledge' : 'Open incident', onClick: () => item.status === 'active' && isAdmin ? void incidentAction(item, 'acknowledge') : setActive('Incident center') });
  });
  badgesNeedingAttention.forEach(badge => actionItems.push({ key: `badge-health-${badge.id}`, level: badge.status === 'offline' || (badge.battery !== null && badge.battery < 20) ? 'attention' : 'info', title: `${badge.battery !== null && badge.battery < 20 ? 'Low battery' : `Badge ${badge.status}`} · ${badge.label}`, detail: `${badge.worker ?? 'Unassigned'} · ${badge.battery == null ? 'battery unknown' : `${badge.battery}% battery`} · ${badge.lastSeen ? `last seen ${ago(badge.lastSeen)}` : 'no device signal received'}`, action: 'View badge', onClick: () => setActive('People & badges') }));
  unassignedWorkers.forEach(worker => actionItems.push({ key: `unassigned-${worker.id}`, level: 'info', title: `Badge not assigned · ${worker.name}`, detail: `${worker.role} · active worker without an assigned badge`, action: 'Assign badge', onClick: () => setActive('People & badges') }));
  anchors.filter(anchor => anchor.state !== 'online' || !anchor.mapId || anchor.xPercent === null || anchor.yPercent === null).forEach(anchor => { const placementPending = anchor.state === 'online' && (!anchor.mapId || anchor.xPercent === null || anchor.yPercent === null); actionItems.push({ key: `anchor-${anchor.id}`, level: anchor.state === 'offline' ? 'attention' : 'info', title: `${placementPending ? 'Anchor placement pending' : `Anchor ${anchor.state}`} · ${anchor.label}`, detail: placementPending ? `${anchor.model} · assign a published map position` : `${anchor.model} · ${anchor.lastSeen ? `last signal ${ago(anchor.lastSeen)}` : 'no telemetry received'}`, action: placementPending ? 'Place anchor' : 'View devices', onClick: () => setActive('Devices') }); });
  const orderedActionItems = [...actionItems].sort((a, b) => ({ urgent: 0, attention: 1, info: 2 }[a.level] - ({ urgent: 0, attention: 1, info: 2 }[b.level])));
  const latestTrackMap = trackPositions[trackPositions.length - 1]?.map_id;
  const mappedTrack = trackPositions.filter(p => p.map_id === latestTrackMap && p.xPercent !== null && p.yPercent !== null);
  const filtered = workers.filter(w => `${w.name} ${w.role} ${w.tagId}`.toLowerCase().includes(query.toLowerCase()));
  const quickFindPages = ['Operations Hub', 'Operations overview', 'Live map', 'People & badges', 'Incident center', 'Track history', 'Insights', 'Shift handover', 'Devices', 'Area maps'].filter(page => !quickFindQuery.trim() || page.toLowerCase().includes(quickFindQuery.trim().toLowerCase())).slice(0, 5);
  const quickFindWorkers = workers.filter(worker => `${worker.name} ${worker.role} ${worker.tagId}`.toLowerCase().includes(quickFindQuery.trim().toLowerCase())).slice(0, 6);
  const quickFindIncidents = openIncidents.filter(incident => `${incident.incidentCode ?? incident.id} ${incident.worker} ${incident.tagId} ${incident.area}`.toLowerCase().includes(quickFindQuery.trim().toLowerCase())).slice(0, 4);
  const selectedMapImage = selectedMap?.previewUrl || '/maps/sample-workspace.svg';
  const selectedMapLabel = selectedMap ? `${selectedMap.name} · v${selectedMap.version}` : 'Sample workspace · v1';
  const mapFrame = (() => {
    const { width, height } = mapCanvasSize;
    if (!width || !height) return { left: '0px', top: '0px', width: '100%', height: '100%' };
    const canvasAspect = width / height;
    if (canvasAspect > mapAspectRatio) {
      const frameWidth = height * mapAspectRatio;
      return { left: `${(width - frameWidth) / 2}px`, top: '0px', width: `${frameWidth}px`, height: `${height}px` };
    }
    const frameHeight = width / mapAspectRatio;
    return { left: '0px', top: `${(height - frameHeight) / 2}px`, width: `${width}px`, height: `${frameHeight}px` };
  })();
  const mapWorkers = showPeopleLayer ? (demoModeActive ? workers.filter(worker => worker.id.startsWith('demo-worker-') && worker.x !== null && worker.y !== null) : livePositionWorkers) : [];
  const mapAnchors = selectedMap && showAnchorLayer ? anchors.filter(anchor => anchor.mapId === selectedMap.id && anchor.xPercent !== null && anchor.yPercent !== null) : [];
  const primaryOpenIncident = openIncidents[0];
  const sosPositionWorker = primaryOpenIncident ? workers.find(worker => worker.id === primaryOpenIncident.workerId || worker.tagId === primaryOpenIncident.tagId) : undefined;
  const nearestDemoResponder = demoModeActive && primaryOpenIncident && sosPositionWorker?.x !== null && sosPositionWorker?.x !== undefined && sosPositionWorker?.y !== null && sosPositionWorker?.y !== undefined
    ? workers.filter(worker => worker.id !== sosPositionWorker.id && worker.id.startsWith('demo-worker-') && worker.status === 'online' && worker.x !== null && worker.y !== null)
      .map(worker => ({ worker, distance: Math.hypot(worker.x! - sosPositionWorker.x!, worker.y! - sosPositionWorker.y!) }))
      .sort((a, b) => a.distance - b.distance)[0]
    : undefined;
  const demoResponseEtaMinutes = nearestDemoResponder ? Math.max(1, Math.ceil(nearestDemoResponder.distance / 22)) : null;
  const demoZoneOccupancy = DEMO_ZONES.map(zone => ({ ...zone, workers: workers.filter(worker => worker.id.startsWith('demo-worker-') && getDemoZone(worker)?.id === zone.id) }));
  const incidentActivity = incidents.flatMap(incident => {
    const reference = `${incident.incidentCode ?? incident.id} · ${incident.worker} · ${incident.area}`;
    return [
      { id: `${incident.id}-triggered`, time: incident.createdAt, title: `${incident.simulated ? 'Demo · simulated SOS' : 'SOS'} raised`, detail: reference, tone: 'red' },
      ...(incident.acknowledgedAt ? [{ id: `${incident.id}-acknowledged`, time: incident.acknowledgedAt, title: `SOS acknowledged${incident.acknowledgedBy ? ` · ${incident.acknowledgedBy}` : ''}`, detail: reference, tone: 'amber' }] : []),
      ...(incident.assignedAt ? [{ id: `${incident.id}-assigned`, time: incident.assignedAt, title: `Responder assigned${incident.assignedTo ? ` · ${incident.assignedTo}` : ''}`, detail: reference, tone: 'blue' }] : []),
      ...(incident.resolvedAt ? [{ id: `${incident.id}-resolved`, time: incident.resolvedAt, title: 'Incident resolved', detail: incident.resolutionNote ? `${reference} · ${incident.resolutionNote}` : reference, tone: 'green' }] : []),
    ];
  }).sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime()).slice(0, 6);

  const zoneActivityPanel = <article className="panel zone-activity-panel"><div className="panel-heading"><div><h2>Zone activity</h2><p>Presence and restricted-area events</p></div><button className="text-button" onClick={() => setActive('Area maps')}>Area maps <ArrowUpRight size={13}/></button></div>{demoModeActive ? <div className="zone-demo-content"><div className="zone-demo-status"><span><Layers3 size={15}/></span><div><b>LOCAL SIMULATION · NOT A GEOFENCE</b><small>Illustrative zones and events are generated in this browser for the demo only.</small></div></div><div className="zone-demo-grid">{demoZoneOccupancy.map(zone => <div className="zone-demo-stat" key={zone.id}><span>{zone.name}</span><b>{zone.workers.length}</b><small>{zone.workers.length === 1 ? 'person present' : 'people present'}</small></div>)}</div><div className="zone-demo-feed"><b>Recent zone activity</b>{demoZoneEvents.length ? demoZoneEvents.slice(0, 4).map(event => <div className="zone-demo-event" key={event.id}><span className={event.action === 'Entered' ? 'zone-enter' : 'zone-exit'}>{event.action}</span><span><b>{event.worker}</b><small>{event.zone}</small></span><time>{ago(event.time)}</time></div>) : <small className="zone-demo-empty">Start demo movement to generate simulated zone entries and exits.</small>}</div></div> : <div className="zone-unavailable"><span><Layers3 size={18}/></span><b>Zone events not available</b><small>Zone boundaries are not configured yet. Occupancy and restricted-area alerts need surveyed zone definitions and live position events.</small><div className="zone-capabilities"><span>Occupancy <i>Pending</i></span><span>Restricted-area events <i>Pending</i></span></div></div>}</article>;
  const operationsHubPage = <OperationsHubPage workers={workers} badges={badges} anchors={anchors} incidents={incidents} apiState={apiState} dataSource={dataSource} demoModeActive={demoModeActive} latestPositionTime={latestPositionTime} email={session?.user.email ?? ''} accessToken={session?.access_token} isConfigured={configured} isAdmin={isAdmin} peopleReporting={reportingPositionWorkers.length} positionStreamStale={positionStreamStale} onExportReport={exportReport} onSignOut={() => void signOut()} onNotify={notify} onNavigate={page => { setActive(page); setDrawer(false); }} themeToggle={themeToggle}/>;
  if (active === 'Operations Hub') return <div className="operations-hub-standalone" data-theme={theme}>{operationsHubPage}{toast && <div className="toast"><Check size={16}/>{toast}<button onClick={() => setToast('')}><X size={14}/></button></div>}</div>;

  return <div className={`app-shell ${presentationMode ? 'presentation-mode' : ''}`} data-theme={theme}>
    <aside className={`sidebar ${drawer ? 'sidebar-open' : ''}`}>
      <div className="brand"><BrandLogo/><button className="mobile-close icon-button" onClick={() => setDrawer(false)}><X size={18}/></button></div>
      <div className="workspace"><div className="workspace-icon">W</div><div className="workspace-copy"><b>Operations Workspace</b><span>BLE AoA · Test environment</span></div><ChevronDown size={15} className="muted"/></div>
      <div className="nav-caption">WORKSPACE</div>
      <nav>{[['Operations Hub', Activity], ['Operations overview', BarChart3], ['Live map', MapPin], ['People & badges', Users], ['Incident center', Siren], ['Track history', Clock3], ['Insights', Activity], ['Shift handover', ClipboardCheck], ['Devices', Radio]].map(([label, Icon]: any) => <button key={label} className={`nav-item ${active === label ? 'nav-active' : ''} ${label === 'Incident center' && unacknowledgedSos > 0 ? 'nav-sos-alert' : ''}`} onClick={() => { setActive(label); setDrawer(false); }}><Icon size={17}/><span>{label}</span>{label === 'Incident center' && activeSos > 0 && <i className={`nav-badge ${unacknowledgedSos > 0 ? 'nav-badge-alert' : ''}`}>{activeSos}</i>}</button>)}</nav>
      <div className="nav-caption manage-caption">MANAGE</div>
      <button className={`nav-item ${active === 'Area maps' ? 'nav-active' : ''}`} onClick={() => { setActive('Area maps'); setDrawer(false); }}><Layers3 size={17}/><span>Area maps</span></button>
      {isAdmin && <><button className="nav-item" onClick={() => setShowAdmin(v => !v)}><Settings2 size={17}/><span>Admin settings</span><ChevronDown size={14} className="nav-chevron"/></button>
      {showAdmin && <div className="admin-sub"><button className={active === 'Users & access' ? 'admin-sub-active' : ''} onClick={() => { setActive('Users & access'); setDrawer(false); }}>Users & access</button><button onClick={() => { setActive('Area maps'); notify('Map versions are managed from the map menu'); }}>Map versions</button><button className={active === 'Audit log' ? 'admin-sub-active' : ''} onClick={() => { setActive('Audit log'); setDrawer(false); }}>Audit log</button></div>}</>}
      <div className="sidebar-bottom"><div className="connection-card"><div className="connection-top"><span className="live-dot"/>System status</div><b>{demoModeActive ? 'Local demo active' : configured ? 'Auth configured' : apiState}</b><small>{demoModeActive ? 'Demo events are not saved' : configured ? latestPositionTime ? positionStreamStale ? 'RTLS events stale' : 'RTLS events active' : 'RTLS telemetry pending' : 'Demo data · no live devices'}</small></div><button className="profile" onClick={() => configured ? void signOut() : notify('Demo mode is active')} title={configured ? 'Sign out' : 'Demo account'}><div className="avatar avatar-admin">{session?.user.email?.slice(0, 2).toUpperCase() ?? 'AK'}</div><div className="profile-copy"><b>{session?.user.email ?? 'Workspace Admin'}</b><span>{configured ? role === 'admin' ? 'Administrator' : 'Viewer · read only' : 'Demo administrator'}</span></div>{configured ? <LogOut size={15} className="muted"/> : <MoreHorizontal size={18} className="muted"/>}</button></div>
    </aside>
    {drawer && <button className="scrim" onClick={() => setDrawer(false)} aria-label="Close navigation"/>}
    <main className="main-content">
      <header className="topbar"><div className="crumbs"><button className="mobile-menu icon-button" onClick={() => setDrawer(true)}><Menu size={19}/></button><span>Operations Workspace</span><span className="crumb-slash">/</span><b>{active}</b></div><div className="top-actions"><button className="quick-find-trigger" onClick={() => { setQuickFindOpen(true); setQuickFindQuery(''); }} aria-label="Search people, badges, incidents and pages"><Search size={14}/><span>Find people, badges, incidents…</span><kbd>Ctrl K</kbd></button><div className="env-pill"><span/> PILOT ENVIRONMENT</div>{themeToggle}<button className="icon-button sos-sound-button" aria-label={!sosAudioUnlocked ? 'Enable SOS warning sound' : sosSoundEnabled ? 'Mute SOS warning sound' : 'Enable SOS warning sound'} title={!sosAudioUnlocked ? 'Enable SOS warning sound' : sosSoundEnabled ? 'Mute SOS warning sound' : 'Enable SOS warning sound'} aria-pressed={sosSoundEnabled} onClick={() => void toggleSosSound()}>{sosSoundEnabled ? <Volume2 size={18}/> : <VolumeX size={18}/>}</button><button className={`icon-button notification-button ${unacknowledgedSos > 0 ? 'notification-sos-alert' : ''}`} aria-label={unacknowledgedSos > 0 ? `${unacknowledgedSos} unacknowledged SOS alerts` : 'Notifications'} onClick={() => setActive('Incident center')}><Bell size={18}/>{activeSos > 0 && <i/>}</button>{presentationMode && <button className="presentation-exit" onClick={exitPresentationMode}><Minimize2 size={14}/> Exit presentation <kbd>Esc</kbd></button>}<div className="avatar avatar-top">AK</div></div></header>
      <div className={`page-wrap ${active === 'Live map' ? 'live-map-mode' : ''}`}>
        {active !== 'Operations Hub' && <div className="page-heading"><div><div className="eyebrow"><span className="eyebrow-line"/> {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }).toUpperCase()}</div><h1>{active === 'Operations overview' ? 'Operations overview' : active}</h1><p>{active === 'Operations overview' ? 'Readiness, device health and safety response at a glance.' : 'Workforce, location and safety signals.'}</p></div>{active !== 'Area maps' && active !== 'Track history' && active !== 'Incident center' && active !== 'Audit log' && active !== 'Users & access' && active !== 'Shift handover' && <div className="heading-actions"><button className="button button-secondary" onClick={exportReport}><Download size={15}/> Export report</button>{isAdmin && <button className="button button-primary" onClick={() => { setActive('People & badges'); notify('Badge assignment is managed from People & badges'); }}><Plus size={16}/> Assign a badge</button>}</div>}</div>}
        {active === 'Operations overview' && <>
          <section className={`pilot-mode-banner ${demoModeActive ? 'pilot-demo-running' : ''}`}><div className="pilot-mode-icon"><Radio size={17}/></div><div><b>{demoModeActive ? demoRunning ? 'Local demo movement active' : 'Local demo presentation' : latestPositionTime && !positionStreamStale ? 'BLE AoA positioning · events received' : latestPositionTime ? 'BLE AoA positioning · data delayed' : 'BLE AoA positioning · awaiting commissioning'}</b><span>{demoModeActive ? 'Sample workers, movement, and SOS alerts exist only in this browser. No API or database writes.' : latestPositionTime ? `${positionFreshness} since the last non-simulated position event. ${reportingPositionWorkers.length} assigned badges currently reporting.` : 'Anchor and badge inventory is ready. Position and SOS telemetry will appear after RTLS event ingestion is configured.'}</span></div><button className="button button-small" onClick={() => { setActive(demoModeActive ? 'People & badges' : 'Devices'); setDrawer(false); }}>{demoModeActive ? 'Demo controls' : 'View devices'}<ArrowUpRight size={13}/></button></section>
          <section className="ops-status-rail" aria-label="Operations system status">
            <div><span className="ops-status-icon"><Activity size={15}/></span><span><small>DATA CONNECTION</small><b>{apiState === 'Database connected' ? 'Supabase connected' : apiState === 'Sample feed' ? 'Sample data' : apiState}</b></span></div>
            <div><span className="ops-status-icon"><ShieldCheck size={15}/></span><span><small>ACCESS CONTROL</small><b>{configured ? 'Authentication configured' : 'Demo access'}</b></span></div>
            <div><span className="ops-status-icon ops-status-pending"><Radio size={15}/></span><span><small>POSITIONING</small><b>{demoModeActive ? 'Local simulated telemetry' : latestPositionTime ? positionStreamStale ? 'Events delayed' : 'RTLS events active' : 'Awaiting commissioning'}</b></span></div>
            <div><span className="ops-status-icon"><Clock3 size={15}/></span><span><small>OVERVIEW REFRESH</small><b>{overviewUpdatedAt ? ago(overviewUpdatedAt) : 'Waiting for first update'}</b></span></div>
          </section>
          {(dataSource !== 'supabase' || demoModeActive) && <section className="demo-journey-panel" aria-labelledby="demo-journey-title">
            <div className="demo-journey-intro">
              <span className="demo-journey-kicker"><Radio size={13}/> INTERACTIVE PILOT WALKTHROUGH <i>LOCAL ONLY</i></span>
              <h2 id="demo-journey-title">Show how an SOS response works</h2>
              <p>Move sample badges, raise an SOS, then walk through acknowledgement and resolution. Nothing here is sent to the API or saved.</p>
              <div className="demo-journey-actions">
                <button className="button button-primary" onClick={toggleDemo}>{demoRunning ? 'Pause movement' : 'Start badge movement'}{demoRunning ? <Check size={14}/> : <Navigation size={14}/>}</button>
                <button className="button button-secondary" onClick={triggerDemoSos}><Siren size={14}/> Trigger sample SOS</button><div className="demo-scenario-actions" aria-label="Load a demo scenario"><span>QUICK SCENARIOS</span><button onClick={() => runDemoScenario('safety')}>Safety response</button><button onClick={() => runDemoScenario('device')}>Device health</button><button onClick={() => runDemoScenario('activity')}>Busy workspace</button><button onClick={() => runDemoScenario('overdue')}>SLA overdue</button><button onClick={() => runDemoScenario('reset')}>Reset</button></div>
              </div>
              <button className="presentation-launch" onClick={togglePresentationMode}><Maximize2 size={13}/> {presentationMode ? 'Exit presentation mode' : 'Present this overview'}</button>
              <div className={`guided-demo-progress ${guidedDemoStep === 5 && !guidedDemoRunning ? 'guided-demo-complete' : ''}`}><div><b>{guidedDemoRunning ? `Guided walkthrough · step ${guidedDemoStep} of 5` : guidedDemoStep === 5 ? 'Walkthrough complete' : 'Client presentation mode'}</b><small>{guidedDemoRunning ? ['','Sample badges are moving','SOS raised at Checkpoint A','Operator acknowledged the SOS','Responder assigned','Response resolved'][guidedDemoStep] : guidedDemoStep === 5 ? 'The local SOS lifecycle is complete and ready to discuss.' : 'Run a timed, local-only walkthrough of the complete SOS response lifecycle.'}</small></div>{guidedDemoRunning ? <button onClick={() => { cancelGuidedDemo(); setGuidedDemoStep(0); setDemoRunning(false); notify('Guided walkthrough stopped · any active demo SOS remains available to handle'); }}>Stop walkthrough</button> : <button onClick={runGuidedDemo}>Play guided walkthrough <ArrowUpRight size={12}/></button>}</div>
            </div>
            <div className="demo-journey-steps" aria-label="Walkthrough progress">
              {[
                { title: 'Badge movement', detail: demoRunning ? 'Sample badges are moving on the map' : 'Start the local movement simulation', done: demoRunning, action: !demoRunning ? <button onClick={toggleDemo}>Start <ArrowUpRight size={12}/></button> : null },
                { title: 'SOS raised', detail: activeDemoSos ? `${activeDemoSos.worker} · ${ago(activeDemoSos.createdAt)}` : acknowledgedDemoSos ? `${acknowledgedDemoSos.worker} · acknowledged` : resolvedDemoSos ? `${resolvedDemoSos.worker} · resolved` : 'Trigger a sample badge alert', done: demoSos.length > 0, action: !demoSos.length ? <button onClick={triggerDemoSos}>Trigger <ArrowUpRight size={12}/></button> : null },
                { title: 'Operator acknowledgement', detail: acknowledgedDemoSos || resolvedDemoSos ? `Acknowledged${(acknowledgedDemoSos ?? resolvedDemoSos)?.acknowledgedBy ? ` by ${(acknowledgedDemoSos ?? resolvedDemoSos)?.acknowledgedBy}` : ''}` : activeDemoSos ? 'Assign an operator and acknowledge the alert' : 'Appears when an SOS is raised', done: Boolean(acknowledgedDemoSos || resolvedDemoSos), action: activeDemoSos ? <button onClick={() => void incidentAction(activeDemoSos, 'acknowledge')}>Acknowledge <ArrowUpRight size={12}/></button> : null },
                { title: 'Responder assigned', detail: assignedDemoSos ? `${assignedDemoSos.assignedTo} · local dispatch` : acknowledgedDemoSos ? 'Choose a responder in Incident center' : 'Follows acknowledgement', done: Boolean(assignedDemoSos), action: acknowledgedDemoSos && !assignedDemoSos ? <button onClick={() => setActive('Incident center')}>Assign <ArrowUpRight size={12}/></button> : null },
                { title: 'Resolution recorded', detail: resolvedDemoSos ? `Resolved${resolvedDemoSos.resolutionNote ? ` · ${resolvedDemoSos.resolutionNote}` : ''}` : acknowledgedDemoSos && assignedDemoSos ? 'Complete the response in Incident center' : 'Follows responder assignment', done: Boolean(resolvedDemoSos), action: acknowledgedDemoSos && assignedDemoSos ? <button onClick={() => setActive('Incident center')}>Resolve <ArrowUpRight size={12}/></button> : null },
              ].map((step, index) => <div className={`demo-journey-step ${step.done ? 'step-done' : ''}`} key={step.title}>
                <span className="demo-step-index">{step.done ? <Check size={13}/> : `0${index + 1}`}</span><span className="demo-step-copy"><b>{step.title}</b><small>{step.detail}</small></span>{step.action}
              </div>)}
            </div>
          </section>}
          <section className="overview-insights-grid">
            <article className={`panel action-queue-panel ${unacknowledgedSos > 0 ? 'action-queue-sos-alert' : ''}`}><div className="panel-heading"><div><div className="panel-title-row"><h2>Needs attention</h2><span className={`queue-count ${orderedActionItems.some(item => item.level === 'urgent') ? 'queue-count-urgent' : ''}`}>{orderedActionItems.length}</span></div><p>{orderedActionItems.length > 6 ? `Prioritized follow-up · showing 6 of ${orderedActionItems.length}` : 'Prioritized follow-up from incidents, badges and anchors'}</p></div><button className="text-button" onClick={() => setActive('Incident center')}>Incident center <ArrowUpRight size={13}/></button></div>
              {orderedActionItems.length ? <div className="action-queue-list">{orderedActionItems.slice(0, 6).map(item => <div className={`action-queue-item action-${item.level}`} key={item.key}><span className="action-indicator">{item.level === 'urgent' ? <Siren size={15}/> : item.title.startsWith('Low battery') ? <Battery size={15}/> : item.title.startsWith('Anchor') ? <Radio size={15}/> : <AlertTriangle size={15}/>}</span><span className="action-copy"><b>{item.title}</b><small>{item.detail}</small></span><button className="button button-secondary action-button" onClick={item.onClick}>{item.action}</button></div>)}</div> : apiState === 'API unavailable' ? <div className="action-queue-unavailable"><AlertTriangle size={18}/><div><b>Incident status unavailable</b><small>Live incident data could not be loaded. Check the local API and database connection before treating the workspace as clear.</small></div></div> : <div className="action-queue-clear"><span><Check size={17}/></span><div><b>No follow-up items</b><small>No open incidents, badge warnings or unassigned workers in this workspace.</small></div></div>}
            </article>
            <article className="panel rtls-health-panel"><div className="panel-heading"><div><div className="panel-title-row"><h2>RTLS data health</h2><span className={`health-status ${dataSource === 'supabase' && latestPositionTime ? 'health-status-live' : ''}`}><i/>{demoModeActive ? 'LOCAL DEMO' : dataSource === 'sample' ? 'SAMPLE DATA' : latestPositionTime ? 'EVENTS RECEIVED' : 'AWAITING EVENTS'}</span></div><p>Freshness and infrastructure state from received telemetry</p></div><button className="icon-button" onClick={() => void refreshOverview().catch(() => notify('Could not refresh overview'))} title="Refresh data health"><RefreshCw size={15}/></button></div>
              <div className="health-primary"><div className="health-primary-icon"><Radio size={18}/></div><span><small>LAST POSITION EVENT</small><b>{demoModeActive ? demoRunning ? 'Browser simulation' : 'Sample position' : dataSource === 'sample' ? 'Sample positions only' : positionFreshness}</b></span><span className="health-age">{demoModeActive ? 'Not live data' : dataSource === 'supabase' && latestPositionTime ? ago(latestPositionTime) : 'No live stream'}</span></div>
              <div className="health-facts"><div><small>Position reporting</small><b>{dataSource === 'supabase' ? `${reportingPositionWorkers.length} / ${assignedWorkers.length} badges` : 'Live stream pending'}</b></div><div><small>Anchors online</small><b>{dataSource === 'supabase' ? `${onlineAnchors} / ${anchors.length}` : 'Not connected'}</b></div><div><small>Mean location confidence</small><b>{meanConfidence == null ? 'No live samples' : `${meanConfidence}%`}</b></div><div><small>Anchors used in latest fixes</small><b>{dataSource === 'supabase' ? `${Math.max(0, ...livePositionWorkers.map(worker => worker.anchorsUsed ?? 0))} max` : 'No live samples'}</b></div></div>
              <div className="health-foot"><span><span className={`health-dot ${apiState === 'Database connected' ? 'health-dot-ok' : ''}`}/>{apiState}</span><span>{pendingAnchors ? `${pendingAnchors} anchor${pendingAnchors === 1 ? '' : 's'} need attention` : anchors.length ? 'Anchors online and placed' : 'No anchors registered'}</span><button className="text-button" onClick={() => setActive('Devices')}>Device health <ArrowUpRight size={13}/></button></div>
            </article>
            <article className="panel shift-readiness-panel"><div className="panel-heading"><div><h2>Shift readiness</h2><p>Personnel and badge assignment coverage</p></div><button className="text-button" onClick={() => setActive('People & badges')}>Directory <ArrowUpRight size={13}/></button></div><div className="readiness-summary"><div><b>{workers.length}</b><span>active worker records</span></div><div><b>{assignedWorkers.length}<small> / {workers.length}</small></b><span>badges assigned</span></div><div><b>{attentionWorkers.length}</b><span>badges not reporting</span></div></div><div className="readiness-note"><CalendarDays size={15}/><span><b>Shift roster not configured</b><small>Current totals use active worker records; add shift schedules before treating them as on-duty headcount.</small></span></div></article>
            {zoneActivityPanel}
          </section>
        </>}
        <Suspense fallback={<div className="page-loading" role="status">Loading section…</div>}>
        {active === 'Users & access' ? <UsersAccessPage session={session}/> : active === 'Audit log' ? <AuditLogPage session={session}/> : active === 'Area maps' ? <AreaMapsPage isAdmin={isAdmin} session={session} notify={notify}/> : active === 'People & badges' ? <PeopleTagsPage isAdmin={isAdmin} session={session} notify={notify} onUpdated={refreshOverview} demoModeActive={demoModeActive} demoRunning={demoRunning} demoWorkers={workers.filter(worker => worker.id.startsWith('demo-worker-'))} demoBadges={badges.filter(badge => badge.id.startsWith('demo-badge-'))} onToggleDemo={toggleDemo} onTriggerDemoSos={triggerDemoSos} onExitDemo={exitDemoMode}/> : active === 'Track history' ? <TrackHistoryPage session={session} maps={publishedMaps}/> : active === 'Insights' ? <InsightsPage session={session} demoModeActive={demoModeActive} demoIncidents={incidents} workers={workers} dataSource={dataSource}/> : active === 'Shift handover' ? <ShiftHandoverPage workers={workers} incidents={openIncidents} anchors={anchors} actions={orderedActionItems} apiState={apiState} demoModeActive={demoModeActive} latestPositionTime={latestPositionTime} positionStreamStale={positionStreamStale} onNotify={notify}/> : active === 'Incident center' ? <IncidentCenterPage isAdmin={isAdmin} session={session} onUpdated={refreshOverview} notify={notify} demoModeActive={demoModeActive} demoIncidents={incidents} demoResponders={workers.filter(worker => worker.id.startsWith('demo-worker-')).map(({id,name,role,status}) => ({id,name,role,status}))} onDemoAction={(item, action, note) => { if (item.simulated && demoModeRef.current) { const now = new Date().toISOString(); setIncidents(previous => previous.map(incident => incident.id !== item.id ? incident : action === 'assign' ? { ...incident, assignedTo: note ?? null, assignedAt: now, assignedBy: 'Demo operator' } : action === 'acknowledge' ? { ...incident, status: 'acknowledged', acknowledgedAt: now, acknowledgedBy: 'Demo operator' } : { ...incident, status: 'resolved', resolvedAt: now, resolvedBy: 'Demo operator', resolutionNote: note || 'Resolved in local demo' })); } }} /> : active === 'Devices' ? <DevicesPage session={session} isAdmin={isAdmin}/> : (active === 'Operations overview' || active === 'Live map') ? <>
        <section className="metric-grid">
          <Metric icon={<Users size={17}/>} title="Assigned badges" value={String(assignedWorkers.length)} sub={`${assignedWorkers.length} of ${workers.length} workers assigned`} tone="blue"/>
          <Metric icon={<Radio size={17}/>} title="Position reporting" value={dataSource === 'supabase' ? `${reportingPositionWorkers.length} / ${assignedWorkers.length}` : '—'} sub={dataSource === 'sample' ? 'Live RTLS event stream pending' : 'Current fixes across assigned badges'} tone="green"/>
          <Metric icon={<Siren size={17}/>} title="Open SOS incidents" value={String(activeSos)} sub={activeSos ? 'Requires operator response' : 'No open response required'} tone="red"/>
          <Metric icon={<AlertTriangle size={17}/>} title="Badges needing attention" value={String(badgesNeedingAttention.length)} sub={`${lowBatteryBadges.length} low battery · ${badges.filter(badge => badge.status !== 'online').length} not reporting`} tone="amber"/>
        </section>
        <div className="content-grid">
          <section className={`panel map-panel ${mapExpanded ? 'map-expanded' : ''}`}><div className="panel-heading"><div><div className="panel-title-row"><h2>Operations map</h2><span className={`live-label ${demoModeActive ? 'map-demo-label' : currentMapPositionCount ? 'map-live-label' : mapWorkers.length ? 'map-demo-label' : 'map-pilot-label'}`}><i/> {demoModeActive ? (demoRunning ? 'SIMULATION' : 'LOCAL DEMO') : currentMapPositionCount ? 'CURRENT POSITIONS' : mapWorkers.length ? 'STALE POSITIONS' : selectedMap ? 'MAP READY' : 'SCHEMATIC'}</span></div><p>{demoModeActive ? 'Local demo positions · not operational location data' : mapWorkers.length ? `${mapWorkers.length} position${mapWorkers.length === 1 ? '' : 's'} · ${currentMapPositionCount} current · latest fix ${positionFreshness}` : selectedMap ? 'Surveyed map ready · waiting for current position fixes' : 'Illustrative layout · select a surveyed map for position display'}</p></div><div className="map-actions"><div className="map-layer-control"><button className="button button-small button-secondary" aria-expanded={mapLayersOpen} onClick={() => setMapLayersOpen(open => !open)}><Layers3 size={14}/> Layers</button>{mapLayersOpen && <div className="map-layer-menu"><b>Map layers</b><label><input type="checkbox" checked={showPeopleLayer} onChange={event => setShowPeopleLayer(event.target.checked)}/> People <small>{demoModeActive ? (demoRunning ? 'moving locally' : 'local demo') : `${livePositionWorkers.length} with positions`}</small></label><label><input type="checkbox" checked={showAnchorLayer} onChange={event => setShowAnchorLayer(event.target.checked)}/> Anchors <small>{mapAnchors.length} placed</small></label><label><input type="checkbox" checked={showZoneLayer} disabled={!demoModeActive} onChange={event => setShowZoneLayer(event.target.checked)}/> Demo zones <small>{demoModeActive ? 'illustrative only' : 'demo mode only'}</small></label></div>}</div><button className="icon-button expand-button" title={mapExpanded ? 'Restore map size' : 'Maximize map'} aria-label={mapExpanded ? 'Restore map size' : 'Maximize map'} aria-pressed={mapExpanded} onClick={() => setMapExpanded(value => !value)}>{mapExpanded ? <Minimize2 size={16}/> : <Maximize2 size={16}/>}</button></div></div>
            <div className={`map-canvas ${!selectedMap && !demoModeActive ? 'map-canvas-schematic' : ''}`} ref={mapCanvasRef}><div className="map-image-scene" style={mapFrame}><img src={selectedMapImage} alt="Illustrative workspace floor plan" onLoad={event => { const image = event.currentTarget; if (image.naturalWidth && image.naturalHeight) setMapAspectRatio(image.naturalWidth / image.naturalHeight); }}/>{demoModeActive && showZoneLayer && DEMO_ZONES.map(zone => <div key={zone.id} className="map-demo-zone" style={{left:`${zone.x}%`,top:`${zone.y}%`,width:`${zone.width}%`,height:`${zone.height}%`}}><span>{zone.name}</span><small>DEMO ZONE</small></div>)}{nearestDemoResponder && sosPositionWorker && showPeopleLayer && <svg className="map-response-route" viewBox="0 0 100 100" preserveAspectRatio="none" aria-label={`Illustrative responder route from ${nearestDemoResponder.worker.name} to ${sosPositionWorker.name}`}><defs><marker id="demo-route-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#9bd7b8"/></marker></defs><line x1={nearestDemoResponder.worker.x!} y1={nearestDemoResponder.worker.y!} x2={sosPositionWorker.x!} y2={sosPositionWorker.y!} markerEnd="url(#demo-route-arrow)"/></svg>}{mapWorkers.map((worker, index) => { const initials = worker.name.split(' ').map(s => s[0]).join(''); const dotTone = worker.positionStatus === 'stale' || worker.status === 'stale' ? 'pulse-amber' : worker.status === 'offline' ? 'pulse-offline' : index === 1 ? 'pulse-green' : ''; const sosIncident = incidents.find(item => item.status !== 'resolved' && (item.workerId === worker.id || item.tagId === worker.tagId)); return <div key={worker.id} className={`map-tag ${sosIncident ? 'map-tag-sos' : ''} ${sosIncident ? 'map-tag-sos-' + sosIncident.status : ''} ${nearestDemoResponder?.worker.id === worker.id ? 'map-tag-responder' : ''}`} style={{left:`${worker.x}%`,top:`${worker.y}%`}} onClick={() => setSelected(worker)} title={sosIncident ? `SOS active · ${worker.name} · ${sosIncident.area}` : worker.name}><span className={`tag-pulse ${sosIncident ? (sosIncident.status === 'active' ? 'pulse-sos' : 'pulse-sos-ack') : dotTone}`}/><span className={`map-tag-card ${sosIncident ? 'map-tag-card-sos' : ''}`}><b>{initials}</b><span>{worker.name}{nearestDemoResponder?.worker.id === worker.id && <em className="map-responder-pill">NEAREST RESPONDER</em>}{sosIncident && <em className={sosIncident.status === 'active' ? '' : 'acknowledged'}><Siren size={9}/> {sosIncident.status === 'active' ? 'SOS ACTIVE' : 'SOS ACKNOWLEDGED'}</em>}<small>{worker.positionLastSeen ? ago(worker.positionLastSeen) : 'Simulated'} · {worker.positionConfidence == null ? worker.battery === null ? 'No battery data' : `${worker.battery}%` : `${Math.round(worker.positionConfidence * 100)}% confidence`}</small></span></span></div>; })}{mapAnchors.map(anchor => <div key={anchor.id} className={`map-anchor map-anchor-${anchor.state}`} style={{left:`${anchor.xPercent}%`,top:`${anchor.yPercent}%`}} title={`${anchor.label} · ${anchor.state}`}><Radio size={12}/><span>{anchor.label}</span></div>)}</div>{openIncidents.length > 0 && <button className="map-sos-alert" onClick={() => setActive('Incident center')} aria-label="Open active SOS incidents"><span className="map-sos-alert-icon"><Siren size={15}/></span><span><b>{unacknowledgedSos > 0 ? `${unacknowledgedSos} SOS ${unacknowledgedSos === 1 ? 'ALERT' : 'ALERTS'} ACTIVE` : `${activeSos} OPEN SOS ${activeSos === 1 ? 'INCIDENT' : 'INCIDENTS'}`}</b><small>{mapWorkers.some(worker => openIncidents.some(item => item.status !== 'resolved' && (item.workerId === worker.id || item.tagId === worker.tagId))) ? `${openIncidents[0].worker} · ${openIncidents[0].area}` : `Map position unavailable · ${openIncidents[0].area}`}</small>{nearestDemoResponder && <small className="map-sos-responder">Nearest responder · {nearestDemoResponder.worker.name} · ~{demoResponseEtaMinutes} min (demo estimate)</small>}</span><ArrowUpRight size={14}/></button>}{!demoModeActive && !livePositionWorkers.length && <div className="map-calibration-state"><span>{selectedMap ? <Radio size={20}/> : <MapPin size={20}/>}</span><b>{selectedMap ? 'Waiting for current position fixes' : 'Position view is not calibrated'}</b><small>{selectedMap ? 'The surveyed map is ready. Position markers appear when fresh RTLS events arrive for this map.' : 'Upload a surveyed floor plan, set its coordinate bounds, and publish it before showing live positions.'}</small>{isAdmin && <button className="button button-secondary" onClick={() => setActive(selectedMap ? 'Devices' : 'Area maps')}>{selectedMap ? 'View device readiness' : 'Set up area map'} <ArrowUpRight size={13}/></button>}</div>}{mapMenu && <div className="map-menu"><b>Area map versions</b><p>Published maps are retained for historical track replay.</p><button onClick={() => { setSelectedMapId('sample'); setMapMenu(false); }}>Illustrative schematic {selectedMapId === 'sample' && <Check size={13}/>}</button>{publishedMaps.map(map => <button key={map.id} onClick={() => { setSelectedMapId(map.id); setMapMenu(false); }}>{map.name} · v{map.version}{selectedMapId === map.id && <Check size={13}/>}</button>)}{isAdmin && <button className="upload-map" onClick={() => { setMapMenu(false); setActive('Area maps'); }}><Plus size={13}/> Manage area maps</button>}</div>}<button className="map-version" onClick={() => setMapMenu(value => !value)}><Layers3 size={14}/>{selectedMapLabel}<ChevronDown size={13}/></button></div>
            <div className="map-legend"><span><i className="legend-blue"/> Personnel</span><span><i className="legend-anchor"/> Anchors</span><span><i className="legend-green"/> Reporting</span><span><i className="legend-amber"/> Attention required</span>{openIncidents.length > 0 && <span className="legend-sos"><i/> SOS active</span>}<span className="map-zones-note"><ShieldCheck size={13}/> Schematic zones are not geofences</span></div>
          </section>
          <section className={`panel incident-panel ${apiState === 'API unavailable' ? 'incident-api-fault' : ''}`}><div className="panel-heading"><div><div className="panel-title-row"><h2>Incident center</h2>{activeSos > 0 && <span className="count-pill">{activeSos} active</span>}</div><p>SOS alerts requiring a response</p></div><button className="text-button" onClick={() => setActive('Incident center')}>View all <ArrowUpRight size={14}/></button></div>
            {openIncidents.length === 0 ? apiState === 'API unavailable' ? <div className="empty-state"><div className="empty-icon"><AlertTriangle size={21}/></div><b>Incident status unavailable</b><span>Could not load live incidents. Check the API and database connection.</span></div> : <div className="empty-state"><div className="empty-icon"><ShieldCheck size={21}/></div><b>All clear</b><span>No open SOS alerts</span><button className="text-button" onClick={() => setActive('Incident center')}>View incident history <ArrowUpRight size={13}/></button></div> : openIncidents.slice(0, 3).map(item => <div className={`incident-card incident-${item.status}`} key={item.id}><div className="incident-top"><span className="sos-icon"><Siren size={17}/></span><div className="incident-label"><b>{item.simulated ? 'DEMO · Simulated SOS' : 'SOS button pressed'}</b><span>{item.incidentCode ?? item.id} · {ago(item.createdAt)}</span>{demoModeActive && item.simulated && item.status === 'active' && clockNow - new Date(item.createdAt).getTime() >= DEMO_SOS_TARGET_MS && <b className="overview-sla-alert">DEMO TARGET EXCEEDED · 2M</b>}</div><span className={`status-pill ${item.status}`}>{item.status}</span></div><div className="incident-worker"><div className="avatar avatar-small">{item.worker.split(' ').map(s=>s[0]).join('')}</div><div><b>{item.worker}</b><span>{item.tagId} · {item.area}{item.assignedTo ? ` · Assigned to ${item.assignedTo}` : ''}</span></div><button className="icon-button incident-more" onClick={() => setSelected(workers.find(w => w.id === item.workerId) ?? null)}><MoreHorizontal size={17}/></button></div>{nearestDemoResponder && primaryOpenIncident?.id === item.id && <div className="incident-response-route"><span className="route-dash"><i/></span><div><b>Nearest responder · {nearestDemoResponder.worker.name}</b><small>Illustrative demo ETA · about {demoResponseEtaMinutes} min · distance is not calibrated</small></div><span className="route-chip">ROUTE PREVIEW</span></div>}<div className="incident-actions">{isAdmin && item.status === 'active' && <button className="button button-primary acknowledge" onClick={() => incidentAction(item, 'acknowledge')}><Check size={14}/> Acknowledge</button>}{isAdmin && item.status === 'acknowledged' && <button className="button button-primary acknowledge" onClick={() => incidentAction(item, 'resolve')}><ShieldCheck size={14}/> Resolve incident</button>}<button className="button button-secondary" onClick={() => { setSelected(workers.find(w => w.id === item.workerId) ?? null); setActive('Live map'); }}><MapPin size={14}/> View location</button></div></div>)}
            <div className="response-note"><div className="response-note-icon"><Clock3 size={14}/></div><span><b>Response workflow</b><small>Acknowledge to take ownership, then resolve with an incident note.</small></span><HelpCircle size={15} className="muted"/></div>
          </section>
          {active === 'Operations overview' && <section className="panel people-panel"><div className="panel-heading"><div><h2>People & device health</h2><p>Assigned tags and latest device status</p></div><button className="text-button" onClick={() => setActive('People & badges')}>View directory <ArrowUpRight size={14}/></button></div><div className="people-toolbar"><label className="search-box"><Search size={15}/><input placeholder="Search workers or tags" value={query} onChange={e => setQuery(e.target.value)}/><kbd>⌘ K</kbd></label><button className="filter-button" onClick={() => notify('Showing all tag statuses')}><Filter size={14}/> Filter</button></div><div className="people-table"><div className="table-head"><span>WORKER</span><span>ASSIGNED TAG</span><span>BATTERY</span><span>STATUS</span><span>LAST UPDATE</span><span/></div>{filtered.map(w => <div className="person-row" key={w.id} onClick={() => setSelected(w)}><div className="person-name"><div className={`avatar avatar-${w.id}`}>{w.name.split(' ').map(s=>s[0]).join('')}</div><span><b>{w.name}</b><small>{w.role}</small></span></div><span className="tag-code"><Radio size={13}/>{w.tagId}</span><span className={`battery-value ${w.battery !== null && w.battery < 25 ? 'low-battery' : ''}`}><Battery size={15}/>{w.battery === null ? '—' : `${w.battery}%`}</span><span><i className={`status-dot ${w.status}`}/><span className="status-copy">{w.status === 'online' ? 'Online' : w.status === 'stale' ? 'Stale' : w.status === 'unknown' ? 'No telemetry' : 'Offline'}</span></span><span className="last-update">{ago(w.lastSeen)}</span><MoreHorizontal size={17} className="row-more"/></div> )}{filtered.length === 0 && <div className="people-empty-state"><Users size={17}/><b>No workforce records yet</b><span>Add people and assign badges to populate this panel.</span><button onClick={() => setActive('People & badges')}>Open directory <ArrowUpRight size={12}/></button></div>}</div><button className="table-footer" onClick={() => setActive('People & badges')}>View all workers and assignments <ArrowUpRight size={14}/></button></section>}
          {active === 'Operations overview' && <section className="panel activity-panel"><div className="panel-heading"><div><h2>Incident response timeline</h2><p>SOS raised, acknowledged and resolved events</p></div><button className="icon-button" onClick={() => void refreshOverview().catch(() => notify('Could not refresh activity'))} title="Refresh activity"><RefreshCw size={15}/></button></div>{incidentActivity.length ? <div className="timeline">{incidentActivity.map(item => <ActivityItem key={item.id} icon={<Siren size={14}/>} tone={item.tone} title={item.title} detail={item.detail} time={ago(item.time)}/>)}</div> : <div className="activity-empty"><Check size={19}/><b>No incident activity yet</b><span>New SOS events will appear here.</span></div>}<button className="table-footer" onClick={() => setActive('Incident center')}>Open incident history <ArrowUpRight size={14}/></button></section>}
        </div>
        {active === 'Live map' && <div className="live-map-support-grid">{zoneActivityPanel}</div>}
        <footer className="footer"><span><span className="footer-dot"/> Data source: {apiState === 'Database connected' ? 'Supabase database' : apiState === 'Sample feed' ? 'sample data' : apiState}</span><span>API status <b>·</b> {apiState} <b>·</b> <button onClick={() => notify(configured ? 'Supabase authentication is configured; RTLS event ingestion is pending' : 'System is using demo data; configure Supabase to connect persistent records')}>System status</button></span><ProductAttribution/></footer>
        </> : null}
        </Suspense>
      </div>
    </main>
    {quickFindOpen && <div className="quick-find-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) setQuickFindOpen(false); }}><section className="quick-find-dialog" role="dialog" aria-modal="true" aria-label="Quick find"><div className="quick-find-input"><Search size={18}/><input autoFocus value={quickFindQuery} onChange={event => setQuickFindQuery(event.target.value)} placeholder="Search a person, badge, incident, or page…"/><kbd>ESC</kbd></div><div className="quick-find-results">{quickFindQuery.trim() && quickFindIncidents.length > 0 && <div className="quick-find-group"><small>OPEN INCIDENTS</small>{quickFindIncidents.map(incident => <button key={incident.id} onClick={() => { setActive('Incident center'); setQuickFindOpen(false); setDrawer(false); }}><span className="quick-find-result-icon incident"><Siren size={15}/></span><span><b>{incident.worker} · {incident.incidentCode ?? incident.id}</b><small>{incident.area} · {incident.status}</small></span><ArrowUpRight size={14}/></button>)}</div>}{quickFindQuery.trim() && quickFindWorkers.length > 0 && <div className="quick-find-group"><small>PEOPLE & BADGES</small>{quickFindWorkers.map(worker => <button key={worker.id} onClick={() => { setSelected(worker); setActive('Live map'); setQuickFindOpen(false); setDrawer(false); }}><span className="quick-find-result-icon person"><Users size={15}/></span><span><b>{worker.name}</b><small>{worker.tagId} · {worker.role}</small></span><ArrowUpRight size={14}/></button>)}</div>}<div className="quick-find-group"><small>{quickFindQuery.trim() ? 'WORKSPACE' : 'QUICK LINKS'}</small>{quickFindPages.map(page => <button key={page} onClick={() => { setActive(page); setQuickFindOpen(false); setDrawer(false); }}><span className="quick-find-result-icon page"><Search size={14}/></span><span><b>{page}</b><small>{page === 'Incident center' ? `${activeSos} open · ${unacknowledgedSos} awaiting acknowledgement` : page === 'Insights' ? 'Incident response and workforce readiness' : page === 'Live map' ? 'Find a person or review position status' : 'Open workspace'}</small></span><ArrowUpRight size={14}/></button>)}</div>{quickFindQuery.trim() && quickFindIncidents.length === 0 && quickFindWorkers.length === 0 && quickFindPages.length === 0 && <div className="quick-find-empty">No people, incidents, or pages match “{quickFindQuery}”.</div>}</div><div className="quick-find-footer"><span>Search people, badge IDs, incidents, and workspace pages</span><span><kbd>Ctrl</kbd> + <kbd>K</kbd> to open · <kbd>Esc</kbd> to close</span></div></section></div>}
{selected && <div className="drawer-scrim" onClick={() => setSelected(null)}><aside className="detail-drawer" onClick={e => e.stopPropagation()}><div className="drawer-head"><div><span className="eyebrow">WORKER PROFILE</span><h2>{selected.name}</h2></div><button className="icon-button" onClick={() => setSelected(null)}><X size={18}/></button></div><div className="drawer-profile"><div className="avatar avatar-large">{selected.name.split(' ').map(s=>s[0]).join('')}</div><div><b>{selected.role}</b><span>{selected.tagId} · {selected.tagId === 'Unassigned' ? 'No badge assigned' : 'Assigned badge'}</span></div></div><div className="drawer-stat"><span>Current status</span><b><i className={`status-dot ${selected.status}`}/>{selected.status === 'online' ? 'Online · BLE AoA' : selected.status === 'stale' ? 'Stale · check coverage' : selected.status === 'unknown' ? 'Waiting for telemetry' : 'Offline · no recent signal'}</b></div><div className="drawer-stat"><span>Battery</span><b className={selected.battery !== null && selected.battery < 25 ? 'low-battery' : ''}><Battery size={15}/>{selected.battery === null ? 'No telemetry' : `${selected.battery}%`}</b></div><div className="drawer-stat"><span>Last position update</span><b>{ago(selected.lastSeen)}</b></div><div className="drawer-map"><img src={selectedMapImage} alt="Worker location on sample map"/>{mappedTrack.length > 1 && <svg className="drawer-track" viewBox="0 0 100 100" preserveAspectRatio="none"><polyline points={mappedTrack.map(p => `${p.xPercent},${p.yPercent}`).join(' ')}/></svg>}{selected.x !== null && selected.y !== null ? <span style={{left:`${selected.x}%`,top:`${selected.y}%`}}><i/></span> : <b className="no-map-position">No calibrated position</b>}</div><h3>Recent travel path · last 8 hours</h3>{mappedTrack.length > 0 ? <div className="path-placeholder"><Navigation size={16}/><span>{mappedTrack.length} recorded points on the latest floor plan.</span></div> : <div className="path-placeholder"><Navigation size={16}/><span>{trackPositions.length ? 'Position history exists, but no published map calibration matches those coordinates yet.' : session ? 'No position history was recorded for this worker in the last 8 hours.' : 'Track replay appears after RTLS position ingestion is configured.'}</span></div>}<button className="button button-secondary drawer-full" onClick={() => { setActive('Track history'); setSelected(null); }}>View full history <ArrowUpRight size={14}/></button></aside></div>}
    {toast && <div className="toast"><Check size={16}/>{toast}<button onClick={() => setToast('')}><X size={14}/></button></div>}
  </div>;
}

function Metric({icon,title,value,sub,tone}:any){return <div className="metric-card"><div className="metric-head"><span>{title}</span><i className={`metric-icon ${tone}`}>{icon}</i></div><div className="metric-value">{value}</div><div className="metric-sub">{sub}</div></div>}
function ActivityItem({icon,tone,title,detail,time}:any){return <div className="activity-item"><i className={`activity-icon ${tone}`}>{icon}</i><div className="activity-copy"><b>{title}</b><span>{detail}</span></div><time>{time}</time></div>}

export default App;
