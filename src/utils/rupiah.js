export function rupiah(value) {
  return new Intl.NumberFormat("id-ID").format(Number(value || 0));
}