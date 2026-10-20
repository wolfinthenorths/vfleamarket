/* Purchased items only; backpack state will come from character sheets later. */
((root) => {
  function collect(orders, characterId) {
    if (!characterId || !Array.isArray(orders)) return [];
    const items = new Map(), seenOrders = new Set();
    for (const order of orders) {
      if (order.character?.id !== characterId || !order.id || seenOrders.has(order.id)) continue;
      seenOrders.add(order.id);
      for (const line of order.lines || []) {
        if (!line.id || !Number.isSafeInteger(line.quantity) || line.quantity <= 0) continue;
        const key = `${order.shopId}/${line.id}`;
        const item = items.get(key) || {...line, quantity: 0, shopId: order.shopId, shopName: order.shopName};
        item.quantity += line.quantity;
        items.set(key, item);
      }
    }
    return [...items.values()];
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = {collect};
  else root.MarketInventory = {collect};
})(globalThis);
