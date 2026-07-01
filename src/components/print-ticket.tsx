import { formatDateTime } from "@/lib/format";
import type { Order } from "@/types/domain";

export function PrintTicket({ order, label }: { order: Order; label: string }) {
  return (
    <article className="ticket">
      <header>
        <h2>LA SAGRETTA</h2>
        <strong>{label}</strong>
        <strong>COMANDA #{order.order_number}</strong>
      </header>
      <div className="ticket-meta">
        <p>
          TAVOLO {order.table?.table_number ?? "—"}
          {order.table?.display_name ? ` · ${order.table.display_name}` : ""}
        </p>
        <p>DATA/ORA {formatDateTime(order.sent_to_cashier_at ?? order.created_at)}</p>
        <p>CAMERIERE: {order.waiter?.full_name ?? "—"}</p>
      </div>
      <div className="ticket-lines">
        {order.items?.map((item) => (
          <div key={item.id}>
            <p><strong>{item.quantity}×</strong> {item.item_name_snapshot}</p>
            {item.notes && <small>— {item.notes}</small>}
            {item.extras.map((extra) => (
              <small key={extra.id}>+ {extra.quantity}× {extra.extra_name_snapshot}</small>
            ))}
          </div>
        ))}
      </div>
      {order.general_notes && (
        <div className="ticket-notes"><strong>NOTE TAVOLO:</strong><p>{order.general_notes}</p></div>
      )}
      <div className="ticket-summary">
        <p>COPERTI: {order.cover_count}</p>
      </div>
      <footer>{label}</footer>
    </article>
  );
}
