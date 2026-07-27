import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getLatestStablePrintNodeState,
  isTerminalPrintNodeState,
} from "@/lib/print-job-state";
import { getPrintNodeJobStates } from "@/lib/printnode";

type SubmittedPrintJob = {
  id: string;
  printnode_job_id: number;
};

export type ServicePrintReconciliationSummary = {
  checked: number;
  reconciled: number;
  updateErrors: number;
};

export async function reconcileServicePrintJobs(
  supabase: SupabaseClient,
  serviceId: string,
  actorId: string,
): Promise<ServicePrintReconciliationSummary> {
  const jobs = await loadSubmittedServicePrintJobs(supabase, serviceId);
  if (!jobs.length) {
    return { checked: 0, reconciled: 0, updateErrors: 0 };
  }

  const states = await getPrintNodeJobStates(
    jobs.map((job) => Number(job.printnode_job_id)),
  );
  const statesById = new Map<number, typeof states>();
  for (const state of states) {
    const current = statesById.get(state.printJobId);
    if (current) current.push(state);
    else statesById.set(state.printJobId, [state]);
  }

  let reconciled = 0;
  let updateErrors = 0;
  for (const job of jobs) {
    const latest = getLatestStablePrintNodeState(
      statesById.get(Number(job.printnode_job_id)) ?? [],
    );
    if (!latest || !isTerminalPrintNodeState(latest.state)) continue;

    const { error } = await supabase.rpc("record_printnode_state", {
      p_job_id: job.id,
      p_state: latest.state,
      p_message: latest.message,
      p_actor_id: actorId,
    });
    if (error) updateErrors += 1;
    else reconciled += 1;
  }

  return { checked: jobs.length, reconciled, updateErrors };
}

async function loadSubmittedServicePrintJobs(
  supabase: SupabaseClient,
  serviceId: string,
) {
  const pageSize = 500;
  const jobs: SubmittedPrintJob[] = [];

  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await supabase
      .from("print_jobs")
      .select("id, printnode_job_id, orders!inner(service_id)")
      .eq("status", "printing")
      .not("printnode_job_id", "is", null)
      .eq("orders.service_id", serviceId)
      .order("created_at")
      .range(offset, offset + pageSize - 1);

    if (error) {
      throw new Error(`Lettura job da riconciliare fallita: ${error.message}`);
    }

    const page = (data ?? []) as unknown as SubmittedPrintJob[];
    jobs.push(...page);
    if (page.length < pageSize) return jobs;
  }
}
