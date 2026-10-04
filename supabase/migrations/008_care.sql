-- Phase 06 — care tasks → today's task logs (6.2). Later tasks (6.4 complete_task_log,
-- 6.8–6.9 care_checkins) add to this file.

-- Today's task_logs for a pet, created on demand when the sitter opens the screen (D8: "today" is
-- the app-timezone day). Idempotent: unique (task_id, due_at) + on conflict do nothing.
--   · only the sitter on duty can call it (owners read task_logs through RLS);
--   · only active tasks, and only when the task's time falls inside the sitter's care window;
--   · a task with repeat_daily = false gets one log in its lifetime;
--   · returns every log of today for the pet, so the screen needs no second query.
create or replace function public.ensure_today_task_logs(p_pet uuid)
returns setof public.task_logs
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today date := public.app_today();
begin
  if not public.is_on_duty_for(p_pet) then
    raise exception 'not_on_duty';
  end if;

  insert into public.task_logs (task_id, pet_id, due_at)
  select t.id, t.pet_id, public.local_ts(v_today, t.scheduled_time)
  from public.care_tasks t
  where t.pet_id = p_pet
    and t.active
    and public.in_care_window(p_pet, public.local_ts(v_today, t.scheduled_time))
    and (t.repeat_daily or not exists (select 1 from public.task_logs l where l.task_id = t.id))
  on conflict (task_id, due_at) do nothing;

  return query
    select l.*
    from public.task_logs l
    where l.pet_id = p_pet
      and l.due_at >= public.local_ts(v_today, '00:00')
      and l.due_at < public.local_ts(v_today + 1, '00:00')
    order by l.due_at, l.created_at;
end;
$$;

revoke execute on function public.ensure_today_task_logs(uuid) from public, anon;
grant execute on function public.ensure_today_task_logs(uuid) to authenticated, service_role;
