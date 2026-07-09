begin;

alter function public.record_printnode_state(uuid, text, text)
  security invoker;

alter function public.record_printnode_state(uuid, text, text)
  set search_path = '';

revoke all on function private.apply_printnode_state(uuid, text, text)
from public, anon;

grant execute on function private.apply_printnode_state(uuid, text, text)
to authenticated;

revoke all on function public.record_printnode_state(uuid, text, text)
from public, anon;

grant execute on function public.record_printnode_state(uuid, text, text)
to authenticated;

commit;
