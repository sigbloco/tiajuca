import { formatCurrency, formatDateTime } from '@/core/format'
import { fromCents } from '../catalog'
import { KIND_LABEL, ORDER_STATUS_LABEL } from '../orders/transitions'
import type { AdminOrder } from './ordersService'

/** Pedido ainda com algo a entregar: não cancelado, não arquivado e com pelo menos um grupo não retirado. */
export function isToDeliver(o: AdminOrder): boolean {
  if (o.status === 'cancelled' || o.archived_at) return false
  if (o.status !== 'paid') return true // ainda sem pagamento confirmado: entra na lista à parte
  return o.shop_fulfillments.length === 0 || o.shop_fulfillments.some((f) => f.status !== 'picked_up' && f.status !== 'cancelled')
}

const itemsText = (o: AdminOrder) => o.shop_order_items.map((i) => `${i.quantity}× ${i.product_name}${i.variant_label ? ` (${i.variant_label})` : ''}`).join('\n')
const kindsText = (o: AdminOrder) => [...new Set(o.shop_order_items.map((i) => KIND_LABEL[i.kind]))].join(' / ')

/** Soma de itens (produto + variação) de uma lista de pedidos. */
export function summarizeItems(orders: AdminOrder[]): { label: string; qty: number }[] {
  const m = new Map<string, number>()
  for (const o of orders) for (const i of o.shop_order_items) {
    const k = `${i.product_name}${i.variant_label ? ` (${i.variant_label})` : ''}`
    m.set(k, (m.get(k) ?? 0) + i.quantity)
  }
  return [...m].map(([label, qty]) => ({ label, qty })).sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'))
}

/**
 * PDF dos pedidos a entregar (A4 paisagem). Uma seção por ponto de retirada: primeiro os pedidos pagos (com coluna "Entregue" em branco
 * para marcar à mão e o total de itens para separar), depois, numa lista à parte, os que ainda não têm pagamento confirmado.
 */
export async function exportDeliveryPdf(orders: AdminOrder[], pointName: (id: string) => string, title: string) {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')])
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
  const generated = formatDateTime(new Date().toISOString())
  const todo = orders.filter(isToDeliver)

  const byPoint = new Map<string, AdminOrder[]>()
  for (const o of todo) byPoint.set(o.pickup_point_id, [...(byPoint.get(o.pickup_point_id) ?? []), o])
  const points = [...byPoint.keys()].sort((a, b) => pointName(a).localeCompare(pointName(b), 'pt-BR'))

  const byName = (a: AdminOrder, b: AdminOrder) => a.customer_name.localeCompare(b.customer_name, 'pt-BR')
  let first = true
  const startPage = () => { if (!first) doc.addPage(); first = false }
  const head = (text: string) => { doc.setFontSize(14); doc.setFont('helvetica', 'bold'); doc.text(text, 14, 16); doc.setFontSize(9); doc.setFont('helvetica', 'normal'); doc.text(`${title} · gerado em ${generated}`, 14, 22) }
  const styles = { fontSize: 9, cellPadding: 2, valign: 'top' as const }
  const last = () => (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY

  if (points.length === 0) {
    startPage(); head('Pedidos a entregar'); doc.setFontSize(11); doc.text('Nenhum pedido a entregar.', 14, 34)
  }
  for (const p of points) {
    const list = byPoint.get(p)!
    const paid = list.filter((o) => o.status === 'paid').sort(byName)
    const unpaid = list.filter((o) => o.status !== 'paid').sort(byName)
    startPage(); head(`Pedidos a entregar · ${pointName(p)}`)
    let y = 28
    if (paid.length > 0) {
      autoTable(doc, {
        startY: y, styles, headStyles: { fillColor: [60, 60, 60] },
        head: [['Pedido', 'Cliente', 'Telefone', 'Itens', 'Tipo', 'Valor', 'Entregue']],
        body: paid.map((o) => [o.code, o.customer_name, o.customer_phone, itemsText(o), kindsText(o), formatCurrency(fromCents(o.total_cents)), '']),
        columnStyles: { 0: { cellWidth: 22 }, 2: { cellWidth: 30 }, 5: { cellWidth: 24, halign: 'right' }, 6: { cellWidth: 20 } },
      })
      y = last() + 6
      const sum = summarizeItems(paid)
      autoTable(doc, {
        startY: y, styles, headStyles: { fillColor: [120, 120, 120] }, tableWidth: 110,
        head: [['Total a separar neste ponto', 'Qtd']], body: sum.map((s) => [s.label, String(s.qty)]),
        columnStyles: { 1: { halign: 'right', cellWidth: 16 } },
      })
      y = last() + 8
    } else {
      doc.setFontSize(10); doc.text('Nenhum pedido pago a entregar neste ponto.', 14, y); y += 8
    }
    if (unpaid.length > 0) {
      if (y > 170) { doc.addPage(); y = 16 }
      doc.setFontSize(11); doc.setFont('helvetica', 'bold'); doc.text('Ainda sem pagamento confirmado (não entregar até confirmar)', 14, y); doc.setFont('helvetica', 'normal')
      autoTable(doc, {
        startY: y + 3, styles, headStyles: { fillColor: [180, 120, 30] },
        head: [['Pedido', 'Cliente', 'Telefone', 'Itens', 'Situação', 'Valor']],
        body: unpaid.map((o) => [o.code, o.customer_name, o.customer_phone, itemsText(o), ORDER_STATUS_LABEL[o.status], formatCurrency(fromCents(o.total_cents))]),
        columnStyles: { 0: { cellWidth: 22 }, 2: { cellWidth: 30 }, 4: { cellWidth: 40 }, 5: { cellWidth: 24, halign: 'right' } },
      })
    }
  }

  const pages = doc.getNumberOfPages()
  for (let i = 1; i <= pages; i++) { doc.setPage(i); doc.setFontSize(8); doc.text(`Página ${i} de ${pages}`, 283, 203, { align: 'right' }) }
  doc.save(`pedidos-a-entregar-${new Date().toISOString().slice(0, 10)}.pdf`)
}
