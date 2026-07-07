import { formatCurrency, formatDateTime, formatTime } from "@/lib/format";
import { getOrderLocationLabel } from "@/lib/order-display";
import { aggregateIdenticalOrderItems } from "@/lib/order-items";
import type { Order } from "@/types/domain";

export function PrintReceipt({ order }: { order: Order }) {
  return (
    <article className="ticket receipt-ticket">
      <header>
        <h2>LA SAGRETTA</h2>
        <strong>SCONTRINO</strong>
        <strong>ORDINE #{order.order_number}</strong>
      </header>
      <div className="ticket-meta">
        <p>{getOrderLocationLabel(order)}</p>
        {order.order_type === "takeaway" && order.takeaway_pickup_at && (
          <p>RITIRO {formatTime(order.takeaway_pickup_at)}</p>
        )}
        <p>DATA/ORA {formatDateTime(new Date().toISOString())}</p>
        <p>CAMERIERE: {order.waiter?.full_name ?? "—"}</p>
      </div>
      <div className="ticket-lines receipt-lines">
        {aggregateIdenticalOrderItems(order.items ?? []).map((item) => (
          <div key={item.id}>
            <p>{item.item_name_snapshot}</p>
            <p>
              {item.quantity} × {formatCurrency(item.item_price_snapshot)}
              <strong>{formatCurrency(item.line_total)}</strong>
            </p>
            {item.extras.map((extra) => (
              <p key={extra.id}>
                + {extra.quantity} × {extra.extra_name_snapshot}
                <strong>{formatCurrency(extra.total)}</strong>
              </p>
            ))}
          </div>
        ))}
      </div>
      <dl className="receipt-totals">
        <div><dt>SUBTOTALE</dt><dd>{formatCurrency(order.subtotal)}</dd></div>
        {order.order_type === "dine_in" && (
          <div>
            <dt>COPERTO {order.cover_count} × {formatCurrency(order.cover_price_snapshot)}</dt>
            <dd>{formatCurrency(order.cover_total)}</dd>
          </div>
        )}
        <div className="receipt-grand-total">
          <dt>TOTALE</dt><dd>{formatCurrency(order.total)}</dd>
        </div>
      </dl>
      <footer>GRAZIE</footer>
    </article>
  );
}
