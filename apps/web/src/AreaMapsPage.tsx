import { useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent, type PointerEvent } from 'react';
import { AlertTriangle, ArrowUpRight, Check, FileImage, FileUp, Layers3, MapPin, Plus, Ruler, ShieldCheck, Trash2, X } from 'lucide-react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './lib/supabase';
import './map-zones.css';

type AreaMap = {
  id: string;
  name: string;
  version: number;
  status: 'draft' | 'published' | 'archived';
  asset_path: string | null;
  external_map_reference: string | null;
  coordinate_system: Record<string, unknown>;
  created_at: string;
  published_at: string | null;
  previewUrl?: string;
};
type MapZone = { id: string; map_id: string; name: string; zone_type: 'operational' | 'restricted' | 'safety' | 'staff_only'; x_min_m: number; y_min_m: number; x_max_m: number; y_max_m: number; alert_on_entry: boolean; alert_on_exit: boolean; occupancy_limit: number | null; created_at: string };
type DrawRect = { left: number; top: number; width: number; height: number };
type Props = { isAdmin: boolean; session: Session | null; notify: (message: string) => void };
const MAP_BUCKET = 'area-maps';
const SAMPLE_MAP = { name: 'Sample terminal', version: 1, status: 'demo' as const, previewUrl: '/maps/sample-terminal.svg' };

function withTimeout<T>(request: PromiseLike<T>, label: string): Promise<T> {
  let timer = 0;
  return Promise.race([
    Promise.resolve(request),
    new Promise<never>((_, reject) => { timer = window.setTimeout(() => reject(new Error(`${label} timed out. Check your connection and Supabase Storage/table policies, then retry.`)), 20000); }),
  ]).finally(() => window.clearTimeout(timer));
}

export default function AreaMapsPage({ isAdmin, session, notify }: Props) {
  const [maps, setMaps] = useState<AreaMap[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saveStage, setSaveStage] = useState('');
  const [name, setName] = useState('');
  const [mapReference, setMapReference] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [xMin, setXMin] = useState('');
  const [xMax, setXMax] = useState('');
  const [yMin, setYMin] = useState('');
  const [yMax, setYMax] = useState('');
  const [zoneMapId, setZoneMapId] = useState('');
  const [zones, setZones] = useState<MapZone[]>([]);
  const [editingZoneId, setEditingZoneId] = useState('');
  const [zoneLoading, setZoneLoading] = useState(false);
  const [zoneBusy, setZoneBusy] = useState(false);
  const [zoneName, setZoneName] = useState('');
  const [zoneType, setZoneType] = useState<MapZone['zone_type']>('operational');
  const [zoneEntryAlert, setZoneEntryAlert] = useState(false);
  const [zoneExitAlert, setZoneExitAlert] = useState(false);
  const [zoneCapacity, setZoneCapacity] = useState('');
  const [zoneAspectRatio, setZoneAspectRatio] = useState(1200 / 760);
  const [zoneRect, setZoneRect] = useState<DrawRect | null>(null);
  const drawStartRef = useRef<{ x: number; y: number } | null>(null);
  const filePreview = useMemo(() => file ? URL.createObjectURL(file) : '', [file]);

  async function loadMaps() {
    if (!supabase || !session) { setMaps([]); setLoading(false); return; }
    setLoading(true); setError('');
    try {
      const { data, error: queryError } = await withTimeout(supabase.from('area_maps').select('id,name,version,status,asset_path,external_map_reference,coordinate_system,created_at,published_at').order('created_at', { ascending: false }), 'Map list load');
      if (queryError) throw new Error(queryError.message);
      const rows = await Promise.all((data ?? []).map(async (row: any) => {
        if (!row.asset_path) return { ...row, previewUrl: '' };
        const { data: signed, error: signedError } = await withTimeout(supabase!.storage.from(MAP_BUCKET).createSignedUrl(row.asset_path, 3600), 'Map preview load');
        if (signedError) throw new Error(signedError.message);
        return { ...row, previewUrl: signed?.signedUrl ?? '' };
      }));
      setMaps(rows as AreaMap[]);
    } catch (cause) {
      setError(cause instanceof Error ? `Could not load map drafts: ${cause.message}` : 'Could not load map drafts.');
    } finally { setLoading(false); }
  }

  useEffect(() => { void loadMaps(); }, [session?.user.id]);
  useEffect(() => () => { if (filePreview) URL.revokeObjectURL(filePreview); }, [filePreview]);
  useEffect(() => {
    if (!zoneMapId || !supabase) { setZones([]); return; }
    let cancelled = false;
    setZoneLoading(true);
    void Promise.resolve(supabase.from('map_zones').select('id,map_id,name,zone_type,x_min_m,y_min_m,x_max_m,y_max_m,alert_on_entry,alert_on_exit,occupancy_limit,created_at').eq('map_id', zoneMapId).order('created_at', { ascending: true }))
      .then(({ data, error: zoneError }) => {
        if (cancelled) return;
        if (zoneError) {
          const missingTable = zoneError.message.includes('map_zones') || zoneError.code === '42P01';
          setError(missingTable ? 'Zone configuration needs a database update. Apply supabase/migrations/20261016120000_map_zone_configuration.sql in the Supabase SQL Editor, then reload this page.' : `Could not load zones: ${zoneError.message}`);
          setZones([]);
        } else { setError(''); setZones((data ?? []) as MapZone[]); }
      }).catch(cause => { if (!cancelled) setError(`Could not load zones: ${cause instanceof Error ? cause.message : 'request failed'}`); })
      .finally(() => { if (!cancelled) setZoneLoading(false); });
    return () => { cancelled = true; };
  }, [zoneMapId, session?.user.id]);

  function resetForm() {
    setShowForm(false); setName(''); setMapReference(''); setFile(null);
    setXMin(''); setXMax(''); setYMin(''); setYMax(''); setError('');
  }

  const zoneMap = maps.find(map => map.id === zoneMapId) ?? null;
  const mapBounds = zoneMap ? {
    xMin: Number(zoneMap.coordinate_system?.xMin), xMax: Number(zoneMap.coordinate_system?.xMax),
    yMin: Number(zoneMap.coordinate_system?.yMin), yMax: Number(zoneMap.coordinate_system?.yMax),
  } : null;
  const validMapBounds = Boolean(zoneMap?.coordinate_system?.units === 'm' && mapBounds && [mapBounds.xMin, mapBounds.xMax, mapBounds.yMin, mapBounds.yMax].every(Number.isFinite) && mapBounds.xMax > mapBounds.xMin && mapBounds.yMax > mapBounds.yMin);

  function zoneDrawPoint(event: PointerEvent<HTMLDivElement>) {
    const bounds = event.currentTarget.getBoundingClientRect();
    return { x: Math.max(0, Math.min(100, (event.clientX - bounds.left) / bounds.width * 100)), y: Math.max(0, Math.min(100, (event.clientY - bounds.top) / bounds.height * 100)) };
  }
  function startZoneDraw(event: PointerEvent<HTMLDivElement>) {
    if (!isAdmin || !validMapBounds) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const point = zoneDrawPoint(event);
    drawStartRef.current = point;
    setZoneRect({ left: point.x, top: point.y, width: 0, height: 0 });
  }
  function moveZoneDraw(event: PointerEvent<HTMLDivElement>) {
    if (!drawStartRef.current) return;
    const point = zoneDrawPoint(event); const start = drawStartRef.current;
    setZoneRect({ left: Math.min(start.x, point.x), top: Math.min(start.y, point.y), width: Math.abs(point.x - start.x), height: Math.abs(point.y - start.y) });
  }
  function finishZoneDraw(event: PointerEvent<HTMLDivElement>) {
    if (!drawStartRef.current) return;
    moveZoneDraw(event); drawStartRef.current = null;
  }
  function zonePercentStyle(zone: MapZone): CSSProperties | undefined {
    if (!mapBounds || !validMapBounds) return undefined;
    const xSpan = mapBounds.xMax - mapBounds.xMin; const ySpan = mapBounds.yMax - mapBounds.yMin;
    return { left: `${(zone.x_min_m - mapBounds.xMin) / xSpan * 100}%`, top: `${(zone.y_min_m - mapBounds.yMin) / ySpan * 100}%`, width: `${(zone.x_max_m - zone.x_min_m) / xSpan * 100}%`, height: `${(zone.y_max_m - zone.y_min_m) / ySpan * 100}%` };
  }
  function editZone(zone: MapZone) {
    if (!mapBounds || !validMapBounds) return;
    const xSpan = mapBounds.xMax - mapBounds.xMin; const ySpan = mapBounds.yMax - mapBounds.yMin;
    setEditingZoneId(zone.id); setZoneName(zone.name); setZoneType(zone.zone_type);
    setZoneEntryAlert(zone.alert_on_entry); setZoneExitAlert(zone.alert_on_exit);
    setZoneCapacity(zone.occupancy_limit?.toString() ?? '');
    setZoneRect({ left: (zone.x_min_m - mapBounds.xMin) / xSpan * 100, top: (zone.y_min_m - mapBounds.yMin) / ySpan * 100, width: (zone.x_max_m - zone.x_min_m) / xSpan * 100, height: (zone.y_max_m - zone.y_min_m) / ySpan * 100 });
    setError('');
  }
  function resetZoneEditor() {
    setEditingZoneId(''); setZoneName(''); setZoneType('operational'); setZoneEntryAlert(false);
    setZoneExitAlert(false); setZoneCapacity(''); setZoneRect(null);
  }
  async function saveZone() {
    if (!supabase || !session || !zoneMap || !mapBounds || !zoneRect) { setError('Choose a map and draw a zone first.'); return; }
    if (zoneRect.width < 1 || zoneRect.height < 1) { setError('Draw a zone at least 1% wide and high on the floor plan.'); return; }
    if (!zoneName.trim()) { setError('Enter a name for this zone.'); return; }
    const capacity = zoneCapacity.trim() ? Number(zoneCapacity) : null;
    if (capacity !== null && (!Number.isInteger(capacity) || capacity < 1)) { setError('Occupancy limit must be a positive whole number.'); return; }
    const xMin = mapBounds.xMin + zoneRect.left / 100 * (mapBounds.xMax - mapBounds.xMin);
    const xMax = mapBounds.xMin + (zoneRect.left + zoneRect.width) / 100 * (mapBounds.xMax - mapBounds.xMin);
    const yMin = mapBounds.yMin + zoneRect.top / 100 * (mapBounds.yMax - mapBounds.yMin);
    const yMax = mapBounds.yMin + (zoneRect.top + zoneRect.height) / 100 * (mapBounds.yMax - mapBounds.yMin);
    setZoneBusy(true); setError('');
    const zoneValues = { map_id: zoneMap.id, name: zoneName.trim(), zone_type: zoneType, x_min_m: xMin, y_min_m: yMin, x_max_m: xMax, y_max_m: yMax, alert_on_entry: zoneEntryAlert, alert_on_exit: zoneExitAlert, occupancy_limit: capacity };
    const result = editingZoneId
      ? await supabase.from('map_zones').update(zoneValues).eq('id', editingZoneId).select('id,map_id,name,zone_type,x_min_m,y_min_m,x_max_m,y_max_m,alert_on_entry,alert_on_exit,occupancy_limit,created_at').single()
      : await supabase.from('map_zones').insert({ ...zoneValues, created_by: session.user.id }).select('id,map_id,name,zone_type,x_min_m,y_min_m,x_max_m,y_max_m,alert_on_entry,alert_on_exit,occupancy_limit,created_at').single();
    const { data, error: insertError } = result;
    if (insertError) {
      const missingTable = insertError.message.includes('map_zones') || insertError.code === '42P01';
      setError(missingTable ? 'Zone storage is not set up. Apply supabase/migrations/20261016120000_map_zone_configuration.sql in the Supabase SQL Editor.' : `Could not save zone: ${insertError.message}`);
    } else {
      setZones(previous => editingZoneId ? previous.map(item => item.id === editingZoneId ? data as MapZone : item) : [...previous, data as MapZone]);
      const savedName = zoneName.trim(); resetZoneEditor();
      notify(`${savedName} zone ${editingZoneId ? 'updated' : 'saved'} · monitoring remains off until commissioning`);
    }
    setZoneBusy(false);
  }
  async function deleteZone(zone: MapZone) {
    if (!supabase || !isAdmin || !window.confirm(`Delete the “${zone.name}” zone definition?`)) return;
    setZoneBusy(true); setError('');
    const { error: deleteError } = await supabase.from('map_zones').delete().eq('id', zone.id);
    if (deleteError) setError(`Could not delete zone: ${deleteError.message}`);
    else { setZones(previous => previous.filter(item => item.id !== zone.id)); if (editingZoneId === zone.id) resetZoneEditor(); notify(`${zone.name} zone definition deleted`); }
    setZoneBusy(false);
  }

  async function createDraft(event: FormEvent) {
    event.preventDefault();
    if (!supabase || !session) { setError('Sign in before creating a map.'); return; }
    if (!isAdmin) { setError('Only an administrator can create map drafts.'); return; }
    if (!name.trim()) { setError('Enter an area name.'); return; }
    if (!file) { setError('Choose an SVG, PNG, or JPG floor plan.'); return; }
    const ext = file.name.split('.').pop()?.toLowerCase();
    const mime = ext === 'svg' ? 'image/svg+xml' : ext === 'png' ? 'image/png' : ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : '';
    if (!mime) { setError('Supported files are SVG, PNG, and JPG.'); return; }
    if (file.size > 10 * 1024 * 1024) { setError('The map file must be 10 MB or smaller.'); return; }
    if ([xMin, xMax, yMin, yMax].some(value => value.trim() === '')) { setError('Enter all four coordinate bounds in metres.'); return; }
    const bounds = { xMin: Number(xMin), xMax: Number(xMax), yMin: Number(yMin), yMax: Number(yMax) };
    if (!Object.values(bounds).every(Number.isFinite) || bounds.xMax <= bounds.xMin || bounds.yMax <= bounds.yMin) { setError('Enter valid coordinate bounds: each maximum must be greater than its minimum.'); return; }
    setBusy(true); setError(''); setSaveStage('Preparing upload…');
    let path = '';
    let uploaded = false;
    try {
      const safeName = file.name.normalize('NFKD').replace(/[^a-zA-Z0-9._-]+/g, '-');
      const uniqueId = typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
      path = `${uniqueId}-${safeName}`;
      setSaveStage('Uploading floor plan…');
      const { error: uploadError } = await withTimeout(supabase.storage.from(MAP_BUCKET).upload(path, file, { contentType: mime, upsert: false }), 'Floor-plan upload');
      if (uploadError) throw new Error(`Upload failed: ${uploadError.message}`);
      uploaded = true;
      setSaveStage('Checking map version…');
      const { data: existing, error: listError } = await withTimeout(supabase.from('area_maps').select('version').eq('name', name.trim()).order('version', { ascending: false }).limit(1), 'Map version lookup');
      if (listError) throw new Error(`Could not determine the next map version: ${listError.message}`);
      const nextVersion = (existing?.[0]?.version ?? 0) + 1;
      setSaveStage('Saving map details…');
      const { error: insertError } = await withTimeout(supabase.from('area_maps').insert({
        name: name.trim(), version: nextVersion, status: 'draft', asset_path: path,
        external_map_reference: mapReference.trim() || null, coordinate_system: { ...bounds, units: 'm', calibration: 'operator-provided; confirm against the Blueiot positioning frame before live use' }, created_by: session.user.id,
      }), 'Map record save');
      if (insertError) throw new Error(`Could not save the map draft: ${insertError.message}`);
      setSaveStage('Draft saved. Refreshing map list…');
      resetForm();
      notify(`${name.trim()} draft v${nextVersion} saved`);
      void loadMaps();
    } catch (cause) {
      if (uploaded && path) void supabase.storage.from(MAP_BUCKET).remove([path]);
      setError(cause instanceof Error ? cause.message : 'Could not save the map draft. Check the browser console for details.');
    } finally {
      setBusy(false);
      setSaveStage('');
    }
  }

  async function publish(map: AreaMap) {
    if (!supabase || !isAdmin) return;
    setBusy(true); setError('');
    const { error: publishError } = await supabase.rpc('publish_area_map', { p_map_id: map.id });
    if (publishError) { setError(`Publish failed: ${publishError.message}`); setBusy(false); return; }
    await loadMaps(); setBusy(false); notify(`${map.name} v${map.version} published`);
  }

  const allMaps = maps.length ? maps : [];
  return <section className="area-maps-page">
    <div className="area-maps-intro"><div><span className="eyebrow"><span className="eyebrow-line"/> MAP VERSION CONTROL</span><h2>Area maps</h2><p>Manage private floor-plan files and coordinate references for each tracking area.</p></div>{isAdmin && <button className="button button-primary" onClick={() => { setError(''); setShowForm(v => !v); }}><Plus size={15}/>{showForm ? 'Close draft form' : 'Create map draft'}</button>}</div>
    <div className="map-safety-note"><ShieldCheck size={17}/><span><b>Map labels are not geofences.</b> Zone definitions can be prepared against metric map bounds; alert monitoring remains off until those bounds are calibrated and the positioning pipeline is commissioned.</span></div>
    {error && <div className="map-error" role="alert">{error}</div>}
    {showForm && <form className="map-draft-form" noValidate onSubmit={createDraft}>
      <div className="draft-form-heading"><div><h3>New map draft</h3><p>Upload a floor plan and enter its coordinate bounds in metres.</p></div><button className="icon-button" type="button" onClick={resetForm} aria-label="Close"><X size={16}/></button></div>
      <div className="map-form-grid"><label>Area name<input required value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Office test area"/></label><label>External map reference <small>Optional</small><input value={mapReference} onChange={e => setMapReference(e.target.value)} placeholder="Blueiot map or project reference"/></label></div>
      <label className="map-file-input"><FileUp size={19}/><span><b>{file ? file.name : 'Choose a floor-plan file'}</b><small>SVG, PNG, or JPG · up to 10 MB · kept in private storage</small></span><input type="file" accept=".svg,.png,.jpg,.jpeg,image/svg+xml,image/png,image/jpeg" onChange={e => setFile(e.target.files?.[0] ?? null)}/></label>
      {filePreview && <div className="map-file-preview"><img src={filePreview} alt="Preview of uploaded floor plan"/></div>}
      <div className="coordinate-section"><div className="coordinate-title"><Ruler size={15}/><span><b>Coordinate bounds</b><small>Set these from a measured plan; do not use invented values for live tracking.</small></span></div><div className="coordinate-inputs"><label>X minimum (m)<input required type="number" step="any" value={xMin} onChange={e => setXMin(e.target.value)} placeholder="0"/></label><label>X maximum (m)<input required type="number" step="any" value={xMax} onChange={e => setXMax(e.target.value)} placeholder="e.g. 42.5"/></label><label>Y minimum (m)<input required type="number" step="any" value={yMin} onChange={e => setYMin(e.target.value)} placeholder="0"/></label><label>Y maximum (m)<input required type="number" step="any" value={yMax} onChange={e => setYMax(e.target.value)} placeholder="e.g. 28"/></label></div></div>
      <div className="draft-form-actions"><button type="button" className="button button-secondary" onClick={resetForm} disabled={busy}>Cancel</button><button className="button button-primary" disabled={busy}>{busy ? saveStage || 'Saving draft…' : 'Save draft'}</button></div>
    </form>}
    {zoneMap && <section className="zone-editor-card">
      <div className="zone-editor-heading"><div><span className="eyebrow"><span className="eyebrow-line"/> ZONE CONFIGURATION</span><h3>{zoneMap.name} · v{zoneMap.version}</h3><p>Drag over the floor plan to draw a rectangular zone. Coordinates are stored in map metres.</p></div><button type="button" className="icon-button" onClick={() => { setZoneMapId(''); resetZoneEditor(); }} aria-label="Close zone editor"><X size={16}/></button></div>
      <div className="zone-config-notice"><AlertTriangle size={16}/><span><b>Configuration only · live monitoring is not active.</b><small>Zone rules will not generate operational alerts until map calibration, position-event ingestion, and the zone evaluator are commissioned.</small></span></div>
      {!validMapBounds && <div className="map-error">This map needs valid metric coordinate bounds before zones can be defined.</div>}
      <div className="zone-editor-layout">
        <div className="zone-drawing-column"><div className={`zone-draw-canvas ${validMapBounds && isAdmin ? 'zone-draw-enabled' : ''}`} style={{ aspectRatio: `${zoneAspectRatio}` }} onPointerDown={startZoneDraw} onPointerMove={moveZoneDraw} onPointerUp={finishZoneDraw} onPointerCancel={() => { drawStartRef.current = null; }}>
          {zoneMap.previewUrl && <img src={zoneMap.previewUrl} alt={`Floor plan for ${zoneMap.name}`} onLoad={event => { const image = event.currentTarget; if (image.naturalWidth && image.naturalHeight) setZoneAspectRatio(image.naturalWidth / image.naturalHeight); }}/>}
          {zones.map(zone => <div key={zone.id} className={`zone-drawn-rect zone-type-${zone.zone_type}`} style={zonePercentStyle(zone)}><span>{zone.name}</span></div>)}
          {zoneRect && <div className="zone-drawn-rect zone-drawing-preview" style={{ left: `${zoneRect.left}%`, top: `${zoneRect.top}%`, width: `${zoneRect.width}%`, height: `${zoneRect.height}%` }}><span>New zone</span></div>}
          {!zoneMap.previewUrl && <div className="zone-map-missing"><FileImage size={20}/><span>Map preview unavailable</span></div>}
        </div><small className="zone-draw-hint">{isAdmin ? 'Click and drag to draw · existing zones are outlined on the plan' : 'Administrator access is required to edit zone configuration.'}</small></div>
        <div className="zone-form-column">
          <div className="zone-form-title"><Layers3 size={16}/><span><b>Zone definition</b><small>{zones.length} saved zone{zones.length === 1 ? '' : 's'} on this map version</small></span></div>
          <label>Zone name<input value={zoneName} onChange={event => setZoneName(event.target.value)} placeholder="e.g. Staff-only service corridor" disabled={!isAdmin}/></label>
          <label>Zone purpose<select value={zoneType} onChange={event => setZoneType(event.target.value as MapZone['zone_type'])} disabled={!isAdmin}><option value="operational">Operational area</option><option value="restricted">Restricted area</option><option value="safety">Safety zone</option><option value="staff_only">Staff only</option></select></label>
          <label>Occupancy limit <small>Optional</small><input type="number" min="1" step="1" value={zoneCapacity} onChange={event => setZoneCapacity(event.target.value)} placeholder="No limit set" disabled={!isAdmin}/></label>
          <div className="zone-rule-options"><b>Rules to activate after commissioning</b><label><input type="checkbox" checked={zoneEntryAlert} onChange={event => setZoneEntryAlert(event.target.checked)} disabled={!isAdmin}/> Alert on entry</label><label><input type="checkbox" checked={zoneExitAlert} onChange={event => setZoneExitAlert(event.target.checked)} disabled={!isAdmin}/> Alert on exit</label></div>
          <div className="zone-form-actions"><button className="button button-primary zone-save-button" disabled={!isAdmin || zoneBusy || !validMapBounds || !zoneRect} onClick={() => void saveZone()}><Plus size={14}/>{zoneBusy ? 'Saving…' : editingZoneId ? 'Update zone definition' : 'Save zone definition'}</button>{editingZoneId && <button className="button button-secondary" disabled={zoneBusy} onClick={resetZoneEditor}>Cancel edit</button>}</div>
        </div>
      </div>
      <div className="zone-saved-list"><div className="zone-saved-heading"><div><b>Configured zones</b><small>Rules are saved per map version; alert processing remains pending commissioning.</small></div>{zoneLoading && <span>Loading…</span>}</div>
        {zones.length ? zones.map(zone => <div className={`zone-saved-row ${editingZoneId === zone.id ? 'zone-row-editing' : ''}`} key={zone.id}><span className={`zone-type-dot zone-dot-${zone.zone_type}`}/><div><b>{zone.name}</b><small>{zone.zone_type.replace('_',' ')} · X {zone.x_min_m.toFixed(1)}–{zone.x_max_m.toFixed(1)} m · Y {zone.y_min_m.toFixed(1)}–{zone.y_max_m.toFixed(1)} m</small><small>{[zone.alert_on_entry && 'Entry alert', zone.alert_on_exit && 'Exit alert', zone.occupancy_limit && `Capacity ${zone.occupancy_limit}`].filter(Boolean).join(' · ') || 'No rule selected'}</small></div>{isAdmin && <><button className="button button-secondary zone-edit-button" disabled={zoneBusy} onClick={() => editZone(zone)}>Edit</button><button className="icon-button zone-delete-button" disabled={zoneBusy} onClick={() => void deleteZone(zone)} title={`Delete ${zone.name}`} aria-label={`Delete ${zone.name}`}><Trash2 size={14}/></button></>}</div>) : !zoneLoading && <div className="zone-empty-state"><Layers3 size={17}/><span>No zones configured for this map version yet.</span></div>}
      </div>
    </section>}
    <div className="map-version-list">
      <article className="map-version-card sample-map-card"><div className="map-card-preview"><img src={SAMPLE_MAP.previewUrl} alt="Illustrative sample terminal map"/></div><div className="map-card-details"><div className="map-card-title"><div><span className="map-status demo">DEMO</span><h3>{SAMPLE_MAP.name}</h3></div><span className="map-version-number">v{SAMPLE_MAP.version}</span></div><p>Illustrative layout · not surveyed · not calibrated for live positioning.</p><div className="map-card-meta"><span><FileImage size={13}/> Built-in sample</span><span><MapPin size={13}/> No positioning reference</span></div></div><button className="button button-secondary" onClick={() => notify('The built-in sample map is for layout preview only.')}>Preview <ArrowUpRight size={13}/></button></article>
      {loading ? <div className="maps-loading">Loading saved map versions…</div> : allMaps.length === 0 ? <div className="maps-empty"><Layers3 size={22}/><b>No uploaded map versions yet</b><span>Create a draft when you have a measured SVG or image floor plan.</span></div> : allMaps.map(map => <article className="map-version-card" key={map.id}><div className="map-card-preview">{map.previewUrl ? <img src={map.previewUrl} alt={`${map.name} map preview`}/> : <div className="map-preview-empty"><FileImage size={24}/></div>}</div><div className="map-card-details"><div className="map-card-title"><div><span className={`map-status ${map.status}`}>{map.status}</span><h3>{map.name}</h3></div><span className="map-version-number">v{map.version}</span></div><p>{map.external_map_reference ? `Map reference: ${map.external_map_reference}` : 'No external map reference set'} · Created {new Date(map.created_at).toLocaleDateString()}</p><div className="map-card-meta"><span><Ruler size={13}/> {String(map.coordinate_system?.units ?? 'units')} · bounds {String(map.coordinate_system?.xMin ?? '?')}–{String(map.coordinate_system?.xMax ?? '?')} × {String(map.coordinate_system?.yMin ?? '?')}–{String(map.coordinate_system?.yMax ?? '?')}</span></div>{isAdmin && map.status !== 'archived' && <button type="button" className="button button-secondary zone-config-open" onClick={() => { setError(''); resetZoneEditor(); setZoneMapId(map.id); }}><Layers3 size={14}/> Configure zones</button>}</div>{map.status === 'draft' && isAdmin && <button className="button button-primary" disabled={busy} onClick={() => void publish(map)}><Check size={14}/> Publish</button>}</article>)}
    </div>
  </section>;
}

