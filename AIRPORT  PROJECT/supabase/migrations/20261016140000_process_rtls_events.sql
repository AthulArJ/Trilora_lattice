-- Project canonical telemetry events into operational records transactionally.
create or replace function public.process_rtls_event(p_event_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event public.rtls_events;
  v_tag_id uuid;
  v_worker_id uuid;
  v_map_id uuid;
  v_position_id bigint;
  v_x double precision;
  v_y double precision;
  v_z double precision;
  v_confidence double precision;
  v_anchors_used smallint;
  v_battery smallint;
  v_x_min double precision;
  v_x_max double precision;
  v_y_min double precision;
  v_y_max double precision;
  v_bounds jsonb;
  v_source text;
  v_error text;
  v_map_matches integer;
begin
  select * into v_event from public.rtls_events where id = p_event_id for update;
  if not found then return jsonb_build_object('status', 'not_found', 'event_id', p_event_id); end if;
  if v_event.processing_status = 'processed' then return jsonb_build_object('status', 'duplicate', 'event_id', p_event_id); end if;
  if v_event.processing_status = 'failed' then return jsonb_build_object('status', 'failed', 'event_id', p_event_id, 'error', v_event.processing_error); end if;

  select id into v_tag_id from public.tags
    where provider = v_event.provider and provider_device_id = v_event.provider_device_id;
  if v_tag_id is null then
    update public.rtls_events set processing_status = 'failed', processing_error = 'No registered tag matches this provider and device_id', processed_at = now() where id = p_event_id;
    return jsonb_build_object('status', 'failed', 'event_id', p_event_id, 'error', 'device_not_registered');
  end if;
  v_source := case v_event.provider when 'blueiot' then 'blueiot_ble_aoa' else 'sewio_uwb' end;
  v_battery := case when v_event.payload ? 'battery_percent' then (v_event.payload->>'battery_percent')::smallint else null end;

  if v_event.event_type = 'position' then
    if v_event.payload->>'map_reference' is null or length(trim(v_event.payload->>'map_reference')) = 0 then
      update public.rtls_events set processing_status = 'failed', processing_error = 'Position event has no map_reference', processed_at = now() where id = p_event_id;
      return jsonb_build_object('status', 'failed', 'event_id', p_event_id, 'error', 'map_reference_required');
    end if;
    select count(*) into v_map_matches from public.area_maps
      where external_map_reference = v_event.payload->>'map_reference' and status = 'published';
    if v_map_matches = 0 then
      update public.rtls_events set processing_status = 'failed', processing_error = 'No published map matches map_reference', processed_at = now() where id = p_event_id;
      return jsonb_build_object('status', 'failed', 'event_id', p_event_id, 'error', 'published_map_not_found');
    end if;
    if v_map_matches > 1 then
      update public.rtls_events set processing_status = 'failed', processing_error = 'map_reference matches more than one published map', processed_at = now() where id = p_event_id;
      return jsonb_build_object('status', 'failed', 'event_id', p_event_id, 'error', 'ambiguous_published_map');
    end if;
    select id, coordinate_system into v_map_id, v_bounds from public.area_maps
      where external_map_reference = v_event.payload->>'map_reference' and status = 'published';
    v_x := (v_event.payload->>'x')::double precision;
    v_y := (v_event.payload->>'y')::double precision;
    v_z := case when v_event.payload ? 'z' then (v_event.payload->>'z')::double precision else null end;
    v_confidence := case when v_event.payload ? 'confidence' then (v_event.payload->>'confidence')::double precision else null end;
    v_anchors_used := case when v_event.payload ? 'anchors_used' then (v_event.payload->>'anchors_used')::smallint else null end;
    if v_bounds->>'units' is distinct from 'm' then
      update public.rtls_events set processing_status = 'failed', processing_error = 'Published map coordinate units are not metres', processed_at = now() where id = p_event_id;
      return jsonb_build_object('status', 'failed', 'event_id', p_event_id, 'error', 'map_units_not_metres');
    end if;
    v_x_min := (v_bounds->>'xMin')::double precision; v_x_max := (v_bounds->>'xMax')::double precision;
    v_y_min := (v_bounds->>'yMin')::double precision; v_y_max := (v_bounds->>'yMax')::double precision;
    if v_x_min is null or v_x_max is null or v_y_min is null or v_y_max is null or v_x_max <= v_x_min or v_y_max <= v_y_min
      or v_x < v_x_min or v_x > v_x_max or v_y < v_y_min or v_y > v_y_max then
      update public.rtls_events set processing_status = 'failed', processing_error = 'Coordinates are invalid or outside the published map bounds', processed_at = now() where id = p_event_id;
      return jsonb_build_object('status', 'failed', 'event_id', p_event_id, 'error', 'coordinates_outside_map');
    end if;
    insert into public.positions(tag_id, map_id, observed_at, x, y, z, confidence, anchors_used, source)
      values (v_tag_id, v_map_id, v_event.observed_at, v_x, v_y, v_z, v_confidence, v_anchors_used, v_source)
      on conflict (tag_id, observed_at, source) do nothing returning id into v_position_id;
    if v_position_id is null then
      select id into v_position_id from public.positions where tag_id = v_tag_id and observed_at = v_event.observed_at and source = v_source;
    end if;
    update public.tags set last_seen_at = v_event.observed_at, device_state = 'online',
      battery_percent = coalesce(v_battery, battery_percent),
      telemetry = telemetry || jsonb_build_object('last_event_type', 'position', 'last_provider', v_event.provider), updated_at = now()
      where id = v_tag_id and (last_seen_at is null or last_seen_at <= v_event.observed_at);
  elsif v_event.event_type = 'sos' then
    select ta.worker_id into v_worker_id from public.tag_assignments ta
      where ta.tag_id = v_tag_id and ta.assigned_at <= v_event.observed_at and (ta.unassigned_at is null or ta.unassigned_at > v_event.observed_at)
      order by ta.assigned_at desc limit 1;
    select p.id, p.map_id into v_position_id, v_map_id from public.positions p
      where p.tag_id = v_tag_id and p.observed_at <= v_event.observed_at order by p.observed_at desc limit 1;
    insert into public.incidents(tag_id, worker_id, map_id, position_id, triggered_at, source_event)
      values (v_tag_id, v_worker_id, v_map_id, v_position_id, v_event.observed_at,
        jsonb_build_object('provider', v_event.provider, 'event_id', v_event.event_id, 'event_type', 'sos', 'ingest', 'rtls_gateway'));
    update public.tags set last_seen_at = greatest(coalesce(last_seen_at, v_event.observed_at), v_event.observed_at),
      device_state = 'online', battery_percent = coalesce(v_battery, battery_percent), updated_at = now()
      where id = v_tag_id;
  elsif v_event.event_type = 'battery' then
    update public.tags set battery_percent = v_battery, last_seen_at = greatest(coalesce(last_seen_at, v_event.observed_at), v_event.observed_at),
      device_state = case when device_state in ('unknown','offline') then 'online' else device_state end,
      telemetry = telemetry || jsonb_build_object('last_event_type', 'battery', 'last_provider', v_event.provider), updated_at = now()
      where id = v_tag_id;
  elsif v_event.event_type = 'device_status' then
    update public.tags set device_state = v_event.payload->>'device_state',
      battery_percent = coalesce(v_battery, battery_percent),
      last_seen_at = greatest(coalesce(last_seen_at, v_event.observed_at), v_event.observed_at),
      telemetry = telemetry || jsonb_build_object('last_event_type', 'device_status', 'last_provider', v_event.provider), updated_at = now()
      where id = v_tag_id;
  end if;

  update public.rtls_events set processing_status = 'processed', processing_error = null, processed_at = now() where id = p_event_id;
  return jsonb_build_object('status', 'processed', 'event_id', p_event_id, 'event_type', v_event.event_type, 'tag_id', v_tag_id, 'map_id', v_map_id, 'position_id', v_position_id);
exception when others then
  get stacked diagnostics v_error = message_text;
  update public.rtls_events set processing_status = 'failed', processing_error = left(v_error, 500), processed_at = now() where id = p_event_id;
  return jsonb_build_object('status', 'failed', 'event_id', p_event_id, 'error', left(v_error, 500));
end;
$$;

create or replace function public.process_pending_rtls_events(p_limit integer default 25)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id bigint;
  v_result jsonb;
  v_results jsonb := '[]'::jsonb;
begin
  for v_id in
    select id from public.rtls_events where processing_status = 'pending'
    order by received_at, id limit greatest(1, least(coalesce(p_limit, 25), 100)) for update skip locked
  loop
    v_result := public.process_rtls_event(v_id);
    v_results := v_results || jsonb_build_array(v_result);
  end loop;
  return jsonb_build_object('count', jsonb_array_length(v_results), 'events', v_results);
end;
$$;

revoke all on function public.process_rtls_event(bigint) from public, anon, authenticated;
revoke all on function public.process_pending_rtls_events(integer) from public, anon, authenticated;
grant execute on function public.process_rtls_event(bigint) to service_role;
grant execute on function public.process_pending_rtls_events(integer) to service_role;
