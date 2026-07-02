begin;

create policy print_jobs_waiter_automatic_update
on public.print_jobs
for update
to authenticated
using (
  private.current_role() = 'waiter'
  and job_type in ('new_order', 'order_update')
  and status in ('pending', 'printing')
  and exists (
    select 1
    from public.orders as target_order
    where target_order.id = print_jobs.order_id
      and target_order.created_by = (select auth.uid())
      and target_order.status in (
        'pending_cashier',
        'confirmed',
        'in_preparation',
        'bill_requested'
      )
  )
)
with check (
  private.current_role() = 'waiter'
  and job_type in ('new_order', 'order_update')
  and status in ('printing', 'failed')
  and exists (
    select 1
    from public.orders as target_order
    where target_order.id = print_jobs.order_id
      and target_order.created_by = (select auth.uid())
      and target_order.status in (
        'pending_cashier',
        'confirmed',
        'in_preparation',
        'bill_requested'
      )
  )
);

commit;
