// Validación comercial sin convertir entradas inválidas en ceros.
function invalid(message) { const error = new Error(message); error.statusCode = 400; throw error; }
function object(value, label = 'Datos') {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid(`${label}: estructura inválida.`);
  return value;
}
function number(value, label, { min = 0, decimals = 2, nullable = false, integer = false } = {}) {
  if (nullable && value === null) return null;
  if (!['number', 'string'].includes(typeof value) || (typeof value === 'string' && !value.trim())) invalid(`${label}: captura un número válido.`);
  if (typeof value === 'string' && !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(value.trim())) invalid(`${label}: formato numérico inválido.`);
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < min || (integer && !Number.isInteger(parsed))) invalid(`${label}: número fuera de rango.`);
  const scaled = Math.round(parsed * 10 ** decimals);
  if (!Number.isSafeInteger(scaled)) invalid(`${label}: importe o cantidad demasiado grande.`);
  return scaled / 10 ** decimals;
}
function text(value, label, max, { optional = false } = {}) {
  if (value === undefined && optional) return '';
  if (typeof value !== 'string' || value.length > max || /[\u0000-\u001f\u007f]/.test(value)) invalid(`${label}: texto inválido.`);
  const result = value.trim();
  if (!result && !optional) invalid(`${label}: campo obligatorio.`);
  return result;
}
function date(value, label = 'Fecha') {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) invalid(`${label}: fecha inválida.`);
  const [year, month, day] = value.split('-').map(Number), parsed = new Date(0);
  parsed.setUTCFullYear(year, month - 1, day);
  if (year < 1 || parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== day) invalid(`${label}: fecha inexistente.`);
  return value;
}
function boolean(value, label) { if (typeof value !== 'boolean') invalid(`${label}: estado inválido.`); return value; }
module.exports = { invalid, object, number, text, date, boolean };
