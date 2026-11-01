const money = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS" });
export const formatMoney = (n: number) => money.format(n);
