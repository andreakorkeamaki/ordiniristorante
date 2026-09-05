import { describe, expect, it } from "vitest";
import { OrderEditQueue, type QueuedOrderEdit } from "@/lib/order-edit-queue";

type Snapshot = { count: number; note: string };
type Edit = { countDelta?: number; note?: string };

function command(id: string, edit: Edit): QueuedOrderEdit<Edit> {
  return { id, edit, label: id };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

async function letQueueRun() {
  // The queue deliberately starts work in a microtask so a synchronous enqueue
  // can render its optimistic projection before transport work begins.
  await Promise.resolve();
  await Promise.resolve();
}

function makeQueue(
  initial: Snapshot,
  send: (edit: QueuedOrderEdit<Edit>) => Promise<Snapshot>,
) {
  return new OrderEditQueue(
    initial,
    (snapshot, edit) => ({
      count: snapshot.count + (edit.countDelta ?? 0),
      note: edit.note ?? snapshot.note,
    }),
    send,
    (error) => (error instanceof Error ? error.message : String(error)),
  );
}

describe("OrderEditQueue", () => {
  it("projects an enqueue immediately before transport starts", () => {
    const initial = { count: 0, note: "" };
    const queue = makeQueue(initial, async () => initial);

    expect(queue.enqueue(command("op-1", { countDelta: 2 }))).toBe(true);
    expect(queue.getSnapshot()).toMatchObject({
      base: initial,
      visible: { count: 2, note: "" },
      pending: [command("op-1", { countDelta: 2 })],
      running: false,
    });

    expect(queue.discardAndAccept(initial)).toBe(true);
  });

  it("sends pending commands strictly in FIFO order", async () => {
    const calls: QueuedOrderEdit<Edit>[] = [];
    const replies = [deferred<Snapshot>(), deferred<Snapshot>()];
    const queue = makeQueue({ count: 0, note: "" }, (edit) => {
      calls.push(edit);
      return replies[calls.length - 1].promise;
    });

    queue.enqueue(command("op-1", { countDelta: 1 }));
    queue.enqueue(command("op-2", { countDelta: 2 }));
    const flush = queue.flush();
    await letQueueRun();

    expect(calls.map((entry) => entry.id)).toEqual(["op-1"]);
    replies[0].resolve({ count: 1, note: "" });
    await letQueueRun();
    expect(calls.map((entry) => entry.id)).toEqual(["op-1", "op-2"]);

    replies[1].resolve({ count: 3, note: "" });
    expect(await flush).toBe(true);
    expect(queue.getSnapshot()).toMatchObject({
      base: { count: 3, note: "" },
      visible: { count: 3, note: "" },
      pending: [],
      running: false,
      error: null,
    });
  });

  it("removes only the acknowledged overlay when the server returns its new base", async () => {
    const firstReply = deferred<Snapshot>();
    const secondReply = deferred<Snapshot>();
    let callCount = 0;
    const queue = makeQueue({ count: 0, note: "" }, () => {
      callCount += 1;
      return callCount === 1 ? firstReply.promise : secondReply.promise;
    });

    queue.enqueue(command("op-1", { countDelta: 1 }));
    queue.enqueue(command("op-2", { countDelta: 2 }));
    const flush = queue.flush();
    await letQueueRun();
    firstReply.resolve({ count: 1, note: "" });
    await letQueueRun();

    expect(queue.getSnapshot()).toMatchObject({
      base: { count: 1 },
      visible: { count: 3 },
      pending: [command("op-2", { countDelta: 2 })],
      running: true,
    });

    secondReply.resolve({ count: 3, note: "" });
    await flush;
  });

  it("rejects realtime snapshots while pending and rejects stale revision reads", async () => {
    const reply = deferred<Snapshot>();
    const queue = makeQueue({ count: 0, note: "" }, () => reply.promise);
    const beforeEnqueue = queue.getRevision();

    queue.enqueue(command("op-1", { countDelta: 1 }));
    expect(queue.acceptSnapshot({ count: 99, note: "remote" })).toBe(false);
    expect(queue.acceptSnapshot({ count: 99, note: "remote" }, beforeEnqueue)).toBe(false);

    const flush = queue.flush();
    await letQueueRun();
    reply.resolve({ count: 1, note: "" });
    await flush;

    const currentRevision = queue.getRevision();
    expect(queue.acceptSnapshot({ count: 4, note: "authoritative" }, currentRevision - 1)).toBe(false);
    expect(queue.acceptSnapshot({ count: 4, note: "authoritative" }, currentRevision)).toBe(true);
    expect(queue.getSnapshot().visible).toEqual({ count: 4, note: "authoritative" });
  });

  it("keeps the same operation id for an explicit retry and blocks new work after failure", async () => {
    const retryReply = deferred<Snapshot>();
    const calls: QueuedOrderEdit<Edit>[] = [];
    const queue = makeQueue({ count: 0, note: "" }, (edit) => {
      calls.push(edit);
      return calls.length === 1
        ? Promise.reject(new Error("timeout"))
        : retryReply.promise;
    });

    queue.enqueue(command("stable-op", { countDelta: 1 }));
    expect(await queue.flush()).toBe(false);
    expect(queue.getSnapshot()).toMatchObject({
      error: "timeout",
      pending: [command("stable-op", { countDelta: 1 })],
      running: false,
    });
    expect(queue.enqueue(command("blocked-op", { countDelta: 9 }))).toBe(false);

    const retry = queue.retry();
    await letQueueRun();
    expect(calls.map((entry) => entry.id)).toEqual(["stable-op", "stable-op"]);
    retryReply.resolve({ count: 1, note: "" });
    expect(await retry).toBe(true);
    expect(queue.getSnapshot().pending).toEqual([]);
  });

  it("makes a submit barrier wait for all queued writes", async () => {
    const reply = deferred<Snapshot>();
    const queue = makeQueue({ count: 0, note: "" }, () => reply.promise);
    const events: string[] = [];
    queue.enqueue(command("before-submit", { countDelta: 1 }));

    const submit = (async () => {
      const saved = await queue.flush();
      events.push(saved ? "submit" : "blocked");
    })();
    await letQueueRun();
    expect(events).toEqual([]);
    reply.resolve({ count: 1, note: "" });
    await submit;
    expect(events).toEqual(["submit"]);
  });

  it("allows explicit discard only when no command is running", async () => {
    const reply = deferred<Snapshot>();
    const queue = makeQueue({ count: 0, note: "" }, () => reply.promise);
    queue.enqueue(command("running-op", { countDelta: 1 }));
    const flush = queue.flush();
    await letQueueRun();

    expect(queue.discardAndAccept({ count: 0, note: "authoritative" })).toBe(false);
    expect(queue.getSnapshot().pending).toHaveLength(1);
    reply.resolve({ count: 1, note: "" });
    await flush;

    expect(queue.discardAndAccept({ count: 7, note: "authoritative" })).toBe(true);
    expect(queue.getSnapshot()).toMatchObject({
      base: { count: 7, note: "authoritative" },
      visible: { count: 7, note: "authoritative" },
      pending: [],
      running: false,
    });
  });

  it("coalesces an unsent tail while preserving the in-flight command", async () => {
    const firstReply = deferred<Snapshot>();
    const secondReply = deferred<Snapshot>();
    const calls: QueuedOrderEdit<Edit>[] = [];
    const queue = new OrderEditQueue<Snapshot, Edit>(
      { count: 0, note: "" },
      (snapshot, edit) => ({
        count: snapshot.count + (edit.countDelta ?? 0),
        note: edit.note ?? snapshot.note,
      }),
      (edit) => {
        calls.push(edit);
        return calls.length === 1 ? firstReply.promise : secondReply.promise;
      },
      (error) => String(error),
      (last, next) =>
        last.edit.countDelta !== undefined && next.edit.countDelta !== undefined
          ? {
              ...last,
              edit: { countDelta: last.edit.countDelta + next.edit.countDelta },
              id: "must-be-ignored",
            }
          : null,
    );

    queue.enqueue(command("sent", { countDelta: 1 }));
    const flush = queue.flush();
    await letQueueRun();
    queue.enqueue(command("tail-1", { countDelta: 1 }));
    queue.enqueue(command("tail-2", { countDelta: 1 }));
    queue.enqueue(command("tail-3", { countDelta: 1 }));
    queue.enqueue(command("tail-4", { countDelta: 1 }));
    queue.enqueue(command("tail-5", { countDelta: 1 }));
    queue.enqueue(command("inverse", { countDelta: -1 }));

    expect(calls).toEqual([command("sent", { countDelta: 1 })]);
    expect(queue.getSnapshot().pending).toEqual([
      command("sent", { countDelta: 1 }),
      {
        ...command("tail-1", { countDelta: 1 }),
        edit: { countDelta: 4 },
      },
    ]);

    firstReply.resolve({ count: 1, note: "" });
    await letQueueRun();
    expect(calls).toHaveLength(2);
    expect(calls[1]).toEqual({
      ...command("tail-1", { countDelta: 1 }),
      edit: { countDelta: 4 },
    });

    secondReply.resolve({ count: 5, note: "" });
    expect(await flush).toBe(true);
  });

  it("does not coalesce onto the only command while it is in flight", async () => {
    const reply = deferred<Snapshot>();
    const calls: QueuedOrderEdit<Edit>[] = [];
    const queue = new OrderEditQueue<Snapshot, Edit>(
      { count: 0, note: "" },
      (snapshot, edit) => ({
        count: snapshot.count + (edit.countDelta ?? 0),
        note: edit.note ?? snapshot.note,
      }),
      (edit) => {
        calls.push(edit);
        return reply.promise;
      },
      String,
      (last, next) => ({
        ...last,
        edit: {
          countDelta: (last.edit.countDelta ?? 0) + (next.edit.countDelta ?? 0),
        },
      }),
    );

    queue.enqueue(command("sent", { countDelta: 1 }));
    const flush = queue.flush();
    await letQueueRun();
    queue.enqueue(command("next", { countDelta: 2 }));

    expect(queue.getSnapshot().pending).toEqual([
      command("sent", { countDelta: 1 }),
      command("next", { countDelta: 2 }),
    ]);
    reply.resolve({ count: 1, note: "" });
    await letQueueRun();
    // The second command is queued separately, retaining its own payload/id.
    expect(calls).toEqual([
      command("sent", { countDelta: 1 }),
      command("next", { countDelta: 2 }),
    ]);
    // Leave the second transport deterministic and finish the queue.
    // `send` returns the same deferred only for this test, so resolve it now.
    reply.resolve({ count: 3, note: "" });
    await flush;
  });
});
