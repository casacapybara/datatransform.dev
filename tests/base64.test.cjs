const {test} = require('node:test');
const assert = require('node:assert/strict');
const m = require('../base64-decoder-encoder/model.js');
test('Base64 text round trips preserve Unicode, whitespace and HTML-like data', () => {
  for (const text of ['Hello','\ufeffHello','💚 London café 東京','<img src=x onerror=alert(1)>','line 1\n\tline 2','a'.repeat(199999)+'💚']) {
    assert.equal(m.decode(m.encodeText(text).raw).text,text);
  }
});
test('Base64 binary and every output format preserve all byte values', () => {
  const bytes = Uint8Array.from({length:256}, (_,i)=>i), raw = m.bytesToBase64(bytes);
  for (const mode of ['raw','urlsafe','dataurl']) {
    const output = m.output(raw,'application/octet-stream',mode);
    assert.deepEqual(m.decode(output).bytes,bytes);
    if (mode==='urlsafe') assert.doesNotMatch(output,/[+/=]/);
  }
});
test('Base64 accepts missing padding and whitespace but rejects malformed input', () => {
  assert.equal(m.decode(' SGV s\nbG8 ').text,'Hello');
  for (const input of ['', 'A','AA=','A===','SGVsbG8===','AA==AA','data:text/plain,Hello','data:text/html;evil:foo;base64,%%%']) assert.throws(()=>m.decode(input));
});
test('Base64 detects signatures and never substitutes invalid UTF-8 bytes', () => {
  for(const [bytes,mime] of [[[137,80,78,71,13,10,26,10],'image/png'],[[255,216,255],'image/jpeg'],[[37,80,68,70,45],'application/pdf']]) assert.equal(m.decode(m.bytesToBase64(Uint8Array.from(bytes))).mime,mime);
  const invalid = m.decode('data:text/plain;base64,/w==');
  assert.equal(invalid.text,null); assert.equal(invalid.bytes[0],255);
  assert.equal(m.decode('data:text/html;base64,PGI+SGk8L2I+').text,'<b>Hi</b>');
});
test('Base64 resource limits apply before large allocations and include UTF-8 size', () => {
  assert.doesNotThrow(()=>m.bounded(m.MAX_BYTES));
  assert.throws(()=>m.bounded(m.MAX_BYTES+1));
  assert.throws(()=>m.decode('A'.repeat(m.MAX_INPUT+1)));
  assert.throws(()=>m.encodeText('💚'.repeat(m.MAX_BYTES/4+1)));
  assert.equal(m.filename('../private/data.txt'),'data.txt');
});
