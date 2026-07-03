import { formatDateTime, formatTime } from "@/lib/format";
import { getOrderLocationLabel } from "@/lib/order-display";
import { aggregateIdenticalOrderItems } from "@/lib/order-items";
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
        <p>{getOrderLocationLabel(order)}</p>
        {order.order_type === "takeaway" && order.takeaway_pickup_at && (
          <p>RITIRO {formatTime(order.takeaway_pickup_at)}</p>
        )}
        <p>DATA/ORA {formatDateTime(order.sent_to_cashier_at ?? order.created_at)}</p>
        <p>CAMERIERE: {order.waiter?.full_name ?? "—"}</p>
      </div>
      <div className="ticket-lines">
        {aggregateIdenticalOrderItems(order.items ?? []).map((item) => (
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
        <div className="ticket-notes">
          <strong>{order.order_type === "takeaway" ? "NOTE ORDINE:" : "NOTE TAVOLO:"}</strong>
          <p>{order.general_notes}</p>
        </div>
      )}
      {order.order_type === "dine_in" && (
        <div className="ticket-summary">
          <p>COPERTI: {order.cover_count}</p>
        </div>
      )}
      <footer>{label}</footer>
    </article>
  );
}
