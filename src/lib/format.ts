export function formatEUR(value: number) {
  const n = Number(value);
  return `${Number.isFinite(n) ? n.toFixed(2) : "0.00"}€`;
}
