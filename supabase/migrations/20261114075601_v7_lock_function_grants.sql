-- Postgres grants EXECUTE on new functions to PUBLIC by default; lock them down.
-- trigger-only functions: nobody calls these over the API
revoke execute on function public.anchor_data_backup(), public.anchor_data_stamp(), public.profiles_guard(),
  public.handle_new_user(), public.handle_user_email() from public, anon, authenticated;
-- signed-in only (each checks permissions internally / via RLS)
revoke execute on function public.is_admin(), public.is_tutor(), public.can_manage(uuid), public.can_access(uuid),
  public.my_tutor_id(), public.update_my_profile(text), public.save_anchor(uuid, jsonb, bigint),
  public.take_backup(uuid, text), public.restore_backup(bigint), public.complete_assignment(uuid, boolean),
  public.mark_note_read(uuid), public.roster(), public.doc_streak(jsonb) from public, anon;
grant execute on function public.is_admin(), public.is_tutor(), public.can_manage(uuid), public.can_access(uuid),
  public.my_tutor_id(), public.update_my_profile(text), public.save_anchor(uuid, jsonb, bigint),
  public.take_backup(uuid, text), public.restore_backup(bigint), public.complete_assignment(uuid, boolean),
  public.mark_note_read(uuid), public.roster(), public.doc_streak(jsonb) to authenticated;
