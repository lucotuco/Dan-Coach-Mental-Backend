export function getWeekStart(date = new Date()) {
  const d = new Date(date);
  // Lunes como inicio
  const day = (d.getDay() + 6) % 7; // lunes=0 ... domingo=6
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - day);
  return d;
}