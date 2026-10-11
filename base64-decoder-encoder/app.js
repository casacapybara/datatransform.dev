(() => {
  'use strict';
  const $ = id => document.getElementById(id), model = globalThis.Base64Model;
  const emit = (name, metadata = {}) => globalThis.DataTransformEvents?.emit(name, metadata, 'base64-decoder-encoder');
  let decoded = null, imageUrl = null, encoded = null, selectedFile = null;
  let sourceMode = 'file', outputMode = 'raw', decodeVersion = 0, encodeVersion = 0;
  const bytesLabel = bytes => bytes < 1024 ? `${bytes} B` : bytes < 1024 ** 2 ? `${(bytes / 1024).toFixed(2)} KiB` : `${(bytes / 1024 ** 2).toFixed(2)} MiB`;
  function status(id, text, error = false) { $(id).textContent = text; $(id).classList.toggle('error', error); }
  function resetDecoded() {
    decodeVersion++; decoded = null;
    if (imageUrl) URL.revokeObjectURL(imageUrl);
    imageUrl = null;
    $('decodedPreview').replaceChildren(); $('decodedPreview').textContent = 'Decoded text or an image preview will appear here. PDFs and other files can be downloaded.';
    $('copyDecodedText').hidden = true; $('downloadDecoded').disabled = true;
    $('decodedType').textContent = '—'; $('decodedSize').textContent = '—'; $('decodedFilename').value = 'decoded.bin';
    status('decodeStatus', 'Enter Base64 and select Decode.');
  }
  function resetEncoded() {
    encodeVersion++; encoded = null;
    $('base64Output').value = ''; $('encodedType').textContent = '—'; $('encodedLength').textContent = '—';
    $('copyEncoded').disabled = true; $('downloadEncoded').disabled = true;
    status('encodeStatus', 'Choose a file or enter text, then select Encode.');
  }
  function updateOutput() {
    $('base64Output').value = encoded ? model.output(encoded.raw, encoded.mime, outputMode) : '';
    $('encodedLength').textContent = encoded ? $('base64Output').value.length.toLocaleString() : '—';
  }
  function selectMode(group, selected) {
    document.querySelectorAll(`[data-group="${group}"]`).forEach(button => button.setAttribute('aria-pressed', String(button === selected)));
  }
  document.querySelectorAll('[data-panel]').forEach(button => button.addEventListener('click', () => {
    selectMode('mode', button);
    ['decode', 'encode'].forEach(id => $(id).hidden = id !== button.dataset.panel);
  }));
  document.querySelectorAll('[data-source]').forEach(button => button.addEventListener('click', () => {
    sourceMode = button.dataset.source; selectMode('source', button);
    $('fileSource').hidden = sourceMode !== 'file'; $('textSource').hidden = sourceMode !== 'text'; resetEncoded();
  }));
  document.querySelectorAll('[data-output]').forEach(button => button.addEventListener('click', () => {
    outputMode = button.dataset.output; selectMode('output', button); updateOutput();
  }));
  $('base64Input').addEventListener('input', resetDecoded);
  $('plainTextInput').addEventListener('input', resetEncoded);
  $('clearDecode').addEventListener('click', () => { $('base64Input').value = ''; resetDecoded(); $('base64Input').focus(); emit('input_cleared', {side:'decode'}); });
  $('clearEncode').addEventListener('click', () => {
    $('plainTextInput').value = ''; $('fileInput').value = ''; selectedFile = null; $('fileInfo').textContent = 'No file selected.'; resetEncoded(); emit('input_cleared', {side:'encode'});
  });
  $('decodeBtn').addEventListener('click', () => {
    resetDecoded();
    const version = decodeVersion, input = $('base64Input').value;
    status('decodeStatus', 'Decoding…');
    setTimeout(() => {
      if (version !== decodeVersion) return;
      try {
        decoded = model.decode(input);
        $('decodedPreview').replaceChildren();
        const {bytes,mime,text} = decoded;
        if (text !== null) {
          const pre = document.createElement('pre'); pre.textContent = text.slice(0, 200000); $('decodedPreview').append(pre);
          $('copyDecodedText').hidden = false;
        } else if (['image/png','image/jpeg'].includes(mime)) {
          imageUrl = URL.createObjectURL(new Blob([bytes], {type:mime}));
          const img = document.createElement('img'); img.alt = 'Decoded image'; img.src = imageUrl;
          img.addEventListener('error', () => { if (version === decodeVersion) $('decodedPreview').textContent = 'This image could not be previewed. You can still download the decoded bytes.'; });
          $('decodedPreview').append(img);
        } else $('decodedPreview').textContent = mime === 'application/pdf' ? 'PDF decoded. Select Download file to save it; PDFs are not embedded in this page.' : 'Decoded bytes are available to download. No preview is available for this file type or text encoding.';
        $('decodedType').textContent = mime; $('decodedSize').textContent = bytesLabel(bytes.length);
        $('decodedFilename').value = 'decoded' + ({'image/png':'.png','image/jpeg':'.jpg','application/pdf':'.pdf','text/plain':'.txt'}[mime] || (mime.startsWith('text/') ? '.txt' : '.bin'));
        $('downloadDecoded').disabled = false;
        status('decodeStatus', text?.length > 200000 ? 'Decoded successfully. The preview shows the first 200,000 characters; Copy and Download include the full result.' : 'Decoded successfully.');
        emit('base64_decoded', {result: text !== null ? 'text' : mime.startsWith('image/') ? 'image' : mime === 'application/pdf' ? 'pdf' : 'binary'});
      } catch (error) { resetDecoded(); status('decodeStatus', error.message, true); emit('base64_failed', {operation:'decode'}); }
    }, 0);
  });
  function chooseFile(file) {
    resetEncoded(); selectedFile = null;
    if (!file) { $('fileInfo').textContent = 'No file selected.'; return; }
    try { model.bounded(file.size); selectedFile = file; $('fileInfo').textContent = `${file.name} · ${bytesLabel(file.size)}`; }
    catch (error) { $('fileInput').value = ''; $('fileInfo').textContent = 'No file selected.'; status('encodeStatus', error.message, true); }
  }
  $('fileInput').addEventListener('change', () => chooseFile($('fileInput').files[0]));
  ['dragenter','dragover'].forEach(name => $('dropzone').addEventListener(name, event => { event.preventDefault(); $('dropzone').classList.add('drag'); }));
  ['dragleave','drop'].forEach(name => $('dropzone').addEventListener(name, event => { event.preventDefault(); $('dropzone').classList.remove('drag'); }));
  $('dropzone').addEventListener('drop', event => { $('fileInput').value = ''; chooseFile(event.dataTransfer.files[0]); });
  $('encodeBtn').addEventListener('click', async () => {
    resetEncoded(); const version = encodeVersion, mode = sourceMode, file = selectedFile, text = $('plainTextInput').value;
    status('encodeStatus', 'Encoding…');
    try {
      await new Promise(resolve => setTimeout(resolve,0));
      if (version !== encodeVersion) return;
      let result;
      if (mode === 'file') {
        if (!file) throw new Error('Choose a file first.');
        model.bounded(file.size);
        const bytes = new Uint8Array(await file.arrayBuffer());
        if (version !== encodeVersion) return;
        result = {raw:model.bytesToBase64(bytes), mime:file.type || model.detectMime(bytes), name:file.name};
      } else {
        if (!text.length) throw new Error('Enter some text first.');
        result = {...model.encodeText(text), name:'text'};
      }
      if (version !== encodeVersion) return;
      encoded = result; updateOutput(); $('encodedType').textContent = result.mime;
      $('copyEncoded').disabled = false; $('downloadEncoded').disabled = false; status('encodeStatus', 'Encoded successfully.'); emit('base64_encoded', {source:mode});
    } catch (error) { if (version !== encodeVersion) return; resetEncoded(); status('encodeStatus', error.message, true); emit('base64_failed', {operation:'encode'}); }
  });
  function download(blob, name) {
    const url = URL.createObjectURL(blob), link = document.createElement('a');
    link.href = url; link.download = model.filename(name); document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url),1000);
  }
  $('downloadDecoded').addEventListener('click', () => { if (decoded) { download(new Blob([decoded.bytes], {type:decoded.mime}), $('decodedFilename').value); emit('base64_downloaded', {operation:'decode'}); } });
  $('downloadEncoded').addEventListener('click', () => { if (encoded) { download(new Blob([$('base64Output').value], {type:'text/plain;charset=utf-8'}), `${encoded.name.replace(/\.[^.]+$/, '')}-base64.txt`); emit('base64_downloaded', {operation:'encode'}); } });
  async function copy(value, id, operation) {
    try { await navigator.clipboard.writeText(value); status(id, 'Copied to the clipboard.'); emit('base64_copied', {operation}); }
    catch { status(id, 'Clipboard access was blocked. Select the text and copy it manually.', true); }
  }
  $('copyDecodedText').addEventListener('click', () => { if (decoded?.text !== null && decoded) copy(decoded.text,'decodeStatus','decode'); });
  $('copyEncoded').addEventListener('click', () => { if (encoded) copy($('base64Output').value,'encodeStatus','encode'); });
  if (navigator.clipboard?.readText) {
    $('pasteDecode').hidden = false;
    $('pasteDecode').addEventListener('click', async () => {
      const version = decodeVersion;
      try { const text = await navigator.clipboard.readText(); if (version !== decodeVersion) return; $('base64Input').value = text; resetDecoded(); status('decodeStatus','Clipboard contents pasted. Select Decode.'); emit('clipboard_pasted',{side:'decode'}); }
      catch { if (version === decodeVersion) status('decodeStatus','Clipboard access was blocked. Paste directly into the input.',true); }
    });
  }
  window.addEventListener('pagehide', () => { if (imageUrl) URL.revokeObjectURL(imageUrl); });
  emit('tool_opened');
})();
