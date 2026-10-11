(() => {
  'use strict';
  const MAX_BYTES = 5 * 1024 * 1024;
  const MAX_INPUT = 8 * 1024 * 1024;
  function bounded(size, limit = MAX_BYTES) {
    if (size > limit) throw new Error('The input exceeds the 5 MiB data limit (8 MiB of Base64 input including whitespace).');
  }
  function bytesToBase64(bytes) {
    bounded(bytes.length);
    let binary = '';
    for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(binary);
  }
  function normalise(input) {
    bounded(input.length, MAX_INPUT);
    let value = input.trim(), mime = '';
    if (/^data:/i.test(value)) {
      const match = value.match(/^data:([^,]*);base64,([\s\S]*)$/i);
      if (!match) throw new Error('Use a Base64 data URL with a ;base64, separator.');
      mime = match[1].split(';')[0].toLowerCase();
      if (mime && (!/^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/.test(mime) || mime.length > 128)) throw new Error('The data URL media type is invalid.');
      value = match[2];
    }
    value = value.replace(/\s/g, '').replace(/-/g, '+').replace(/_/g, '/');
    if (!value) throw new Error('Enter some Base64 data first.');
    if (!/^[A-Za-z0-9+/]*={0,2}$/.test(value)) throw new Error('The input contains invalid Base64 characters or padding.');
    if (value.includes('=')) {
      if (value.length % 4 !== 0) throw new Error('The Base64 padding is invalid.');
    } else {
      const remainder = value.length % 4;
      if (remainder === 1) throw new Error('The Base64 length is invalid.');
      if (remainder) value += '='.repeat(4 - remainder);
    }
    bounded(value.length / 4 * 3 - (value.endsWith('==') ? 2 : value.endsWith('=') ? 1 : 0));
    return { value, mime };
  }
  function utf8(bytes) {
    try { return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes); } catch { return null; }
  }
  function detectMime(bytes, declared = '') {
    const starts = signature => signature.every((byte, i) => bytes[i] === byte);
    if (starts([137,80,78,71,13,10,26,10])) return 'image/png';
    if (starts([255,216,255])) return 'image/jpeg';
    if (starts([37,80,68,70,45])) return 'application/pdf';
    if (declared) return declared;
    const text = utf8(bytes);
    if (text !== null && !bytes.includes(0)) {
      let controls = 0;
      for (let i = 0; i < text.length; i++) if (text.charCodeAt(i) < 32 && ![9,10,13].includes(text.charCodeAt(i))) controls++;
      if (!text.length || controls / text.length < .01) return 'text/plain';
    }
    return 'application/octet-stream';
  }
  function decode(input) {
    const parsed = normalise(input);
    let binary;
    try { binary = atob(parsed.value); } catch { throw new Error('The Base64 padding or length is invalid.'); }
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const mime = detectMime(bytes, parsed.mime);
    return { bytes, mime, text: mime.startsWith('text/') ? utf8(bytes) : null };
  }
  function encodeText(text) {
    bounded(text.length);
    const bytes = new TextEncoder().encode(text);
    bounded(bytes.length);
    return { raw: bytesToBase64(bytes), mime: 'text/plain;charset=utf-8' };
  }
  function output(raw, mime, mode) {
    if (mode === 'dataurl') return `data:${mime};base64,${raw}`;
    if (mode === 'urlsafe') return raw.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    return raw;
  }
  function filename(value, fallback = 'decoded.bin') {
    return String(value).split(/[\\/]/).pop().replace(/[\x00-\x1f\x7f<>:"|?*]/g, '_').slice(0, 180).trim() || fallback;
  }
  const api = Object.freeze({ MAX_BYTES, MAX_INPUT, bounded, bytesToBase64, decode, encodeText, output, filename, detectMime });
  globalThis.Base64Model = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
