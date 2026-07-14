import { formatDateTime, formatTime } from "@/lib/format";
import { getOrderLocationLabel } from "@/lib/order-display";
import type { PreparationAreaGroup } from "@/lib/order-items";
import { formatPrintItemName } from "@/lib/print-ticket-format";
import type { Order } from "@/types/domain";

export function PrintTicket({
  department,
  order,
  label,
}: {
  department: PreparationAreaGroup;
  order: Order;
  label: string;
}) {
  return (
    <article className="ticket">
      <header>
        <h2>LA SAGRETTA</h2>
        <strong>{label}</strong>
        <strong>{department.label}</strong>
        <strong>COMANDA #{order.order_number}</strong>
      </header>
      <div className="ticket-meta">
        <p>{getOrderLocationLabel(order)}</p>
        {order.order_type === "takeaway" && order.takeaway_pickup_at && (
          <p>RITIRO {formatTime(order.takeaway_pickup_at)}</p>
        )}
        <p>DATA/ORA {formatDateTime(order.sent_to_cashier_at ?? order.created_at)}</p>
      </div>
      <div className="ticket-lines">
        {department.items.map((item) => (
          <div key={item.id}>
            <p><strong>{item.quantity}×</strong> {formatPrintItemName(item)}</p>
            {item.notes && <small>— {item.notes}</small>}
            {item.extras.map((extra) => (
              <strong className="ticket-extra" key={extra.id}>
                + {extra.quantity}× {extra.extra_name_snapshot}
              </strong>
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
      <footer>{department.label} · {label}</footer>
    </article>
  );
}
