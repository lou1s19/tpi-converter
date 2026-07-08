const dropzone = document.getElementById('drop-zone');
const dropZoneTitle = document.getElementById('drop-zone-title');
const dropZoneCopy = document.getElementById('drop-zone-copy');
const dropZoneState = document.getElementById('drop-zone-state');
const browseFilesBtn = document.getElementById('browse-files-btn');
const fileInput = document.getElementById('file-input');
const gallery = document.getElementById('gallery');
const modeToggle = document.getElementById('mode-toggle');
const modeLabel = document.getElementById('mode-label');
const webpToggle = document.getElementById('webp-toggle');
const bulkScale = document.getElementById('bulk-scale');
const keepAspect = document.getElementById('keep-aspect');
const downloadBtn = document.getElementById('download-btn');
const selectModeBtn = document.getElementById('select-mode-btn');
const duplicateSelectedBtn = document.getElementById('duplicate-selected-btn');
const deleteSelectedBtn = document.getElementById('delete-selected-btn');
const spinnerOverlay = document.getElementById('spinner-overlay');
const loadBar = document.getElementById('load-bar');
const cropModal = document.getElementById('crop-modal');
const cropImageElem = document.getElementById('crop-image');
const btnRotateL = document.getElementById('rotate-left');
const btnRotateR = document.getElementById('rotate-right');
const btnApplyCrop = document.getElementById('crop-apply');
const btnApplyCropAll = document.getElementById('crop-apply-all');
const btnCancelCrop = document.getElementById('crop-cancel');
const appendMode = document.getElementById('append-mode');
const qualitySlider = document.getElementById('quality-slider');
const qualityValueLabel = document.getElementById('quality-value');
const isPercentMode = () => !!modeToggle?.checked;

let images = [];
let selectionMode = false;
let currentCropIndex = null;
let cropper = null;
const MAX_IMAGES = 50;
let webpQuality = 82;

// === Undo-History ===
let undoHistory = [];
const MAX_UNDO_STEPS = 20;

function saveUndoState(description = 'Änderung') {
  // Deep-Clone der Images (ohne img-Objekte - nur Metadaten)
  const state = images.map(item => ({
    ...item,
    imgSrc: item.img.src // Bild als Data-URL speichern
  }));
  undoHistory.push({ state, description });
  if (undoHistory.length > MAX_UNDO_STEPS) undoHistory.shift();
}

function undo() {
  if (undoHistory.length === 0) return;
  const lastState = undoHistory.pop();

  // Restore images
  const restoredImages = [];
  let loadedCount = 0;

  if (lastState.state.length === 0) {
    images = [];
    updateUI();
    return;
  }

  lastState.state.forEach((saved, idx) => {
    const newImg = new Image();
    newImg.onload = () => {
      restoredImages[idx] = {
        ...saved,
        img: newImg
      };
      delete restoredImages[idx].imgSrc;
      loadedCount++;
      if (loadedCount === lastState.state.length) {
        images = restoredImages;
        updateUI();
      }
    };
    newImg.src = saved.imgSrc;
  });
}

// Keyboard Shortcut für Undo
document.addEventListener('keydown', (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key === 'z') {
    e.preventDefault();
    undo();
  }
});

const MIME_BY_FMT = {
  webp: 'image/webp',
  jpeg: 'image/jpeg',
  png: 'image/png',
  avif: 'image/avif',
  ico: 'image/x-icon',
  icns: 'image/icns',
  bmp: 'image/bmp',
  svg: 'image/svg+xml'
};

const isPortrait = (item) => item.img.height >= item.img.width;

function formatBytes(bytes) {
  if (!bytes) return '–';
  if (bytes >= 1048576) return (bytes / 1048576).toFixed(1) + ' MB';
  if (bytes >= 1024) return Math.round(bytes / 1024) + ' KB';
  return bytes + ' B';
}

function showDownloadResult(origBytes, outBytes, count, webpUnsupported = false) {
  const el = document.getElementById('download-result');
  if (!el) return;
  const isSmaller = outBytes < origBytes;
  const pct = origBytes ? Math.round(((origBytes - outBytes) / origBytes) * 100) : 0;
  const countStr = count > 1 ? `${count} Bilder · ` : '';

  if (webpUnsupported) {
    el.className = 'download-result warning';
    el.innerHTML = `⚠ Dein Browser (Safari/iOS) unterstützt keine WebP-Erstellung – ${countStr}als PNG gespeichert · ${formatBytes(origBytes)} → ${formatBytes(outBytes)}`;
    return;
  }

  if (isSmaller) {
    el.className = 'download-result success';
    el.innerHTML = `✓ ${countStr}${formatBytes(origBytes)} → ${formatBytes(outBytes)} · <strong>${pct}% kleiner</strong>`;
  } else {
    el.className = 'download-result warning';
    el.innerHTML = `⚠ ${countStr}${formatBytes(origBytes)} → ${formatBytes(outBytes)} · Bereits optimal komprimiert`;
  }
}
const MAX_PIXEL_SIZE = 20000;
const blockNonNumericKeys = (event) => {
  const allowedKeys = [
    'Backspace',
    'Delete',
    'Tab',
    'Enter',
    'Escape',
    'ArrowLeft',
    'ArrowRight',
    'ArrowUp',
    'ArrowDown',
    'Home',
    'End'
  ];

  if (event.metaKey || event.ctrlKey || allowedKeys.includes(event.key)) return;
  if (!/^\d$/.test(event.key)) {
    event.preventDefault();
  }
};

function sanitizeNumberInput(input) {
  input.value = input.value.replace(/\D/g, '');
}

function clampPixelSize(value) {
  return Math.min(MAX_PIXEL_SIZE, Math.max(1, Math.round(Number(value) || 1)));
}

const DROPZONE_DEFAULT_TITLE = 'Bild hier ablegen';
const DROPZONE_DEFAULT_COPY = 'Unterstützt JPG, PNG, TIFF und HEIC bis 50 MB. Das Bild wird automatisch in optimiertes WebP umgewandelt.';
const DROPZONE_APPEND_COPY = 'Neue Bilder werden angehängt und die aktuelle Auswahl bleibt erhalten.';
const DROPZONE_REPLACE_TITLE = 'Vorhandene Bilder ersetzen';
const DROPZONE_REPLACE_COPY = 'Wenn du jetzt weitere Bilder einfügst, werden die vorhandenen Dateien ersetzt.';
const DROPZONE_REPLACE_HINT = 'Aktiviere „Anhängen statt Ersetzen“, wenn du neue Bilder zur aktuellen Auswahl hinzufügen möchtest.';


console.log('[init]', { dropzone, fileInput, gallery });

// ==== Full-page Drag & Drop (robust) ====
let dragDepth = 0;
const hasFiles = (e) => Array.from(e.dataTransfer?.types || []).includes('Files');

['dragenter', 'dragover'].forEach(type => {
  document.addEventListener(type, e => {
    if (!hasFiles(e)) return;               // nur echte Dateien
    e.preventDefault(); e.stopPropagation();
    if (type === 'dragenter') dragDepth++;
    document.body.classList.add('dragover');   // ganze Seite highlighten
    dropzone?.classList.add('dragover');       // zusätzlich deine Zone
    e.dataTransfer.dropEffect = 'copy';
  });
});

['dragleave', 'drop'].forEach(type => {
  document.addEventListener(type, e => {
    if (!hasFiles(e)) return;
    e.preventDefault(); e.stopPropagation();

    if (type === 'dragleave') {
      dragDepth = Math.max(0, dragDepth - 1);
      if (dragDepth === 0) {
        document.body.classList.remove('dragover');
        dropzone?.classList.remove('dragover');
      }
      return;
    }

    // DROP
    dragDepth = 0;
    document.body.classList.remove('dragover');
    dropzone?.classList.remove('dragover');

    const files = e.dataTransfer?.files;
    if (files && files.length) {
      // Append, wenn Checkbox aktiv ODER beim Drop eine Modifier-Taste gehalten wurde
      const useAppend = (appendMode?.checked === true) || e.shiftKey || e.altKey || e.ctrlKey || e.metaKey;
      handleFiles(files, { append: useAppend });
    }
  });
});



// Klick in Drop-Zone öffnet Dateidialog
function openFileDialog() {
  if (!fileInput) return;
  fileInput.value = '';
  fileInput.click();
}

dropzone?.addEventListener('click', () => openFileDialog());
browseFilesBtn?.addEventListener('click', (e) => {
  e.preventDefault();
  e.stopPropagation();
  openFileDialog();
});
fileInput?.addEventListener('change', () => {
  handleFiles(fileInput.files, { append: appendMode?.checked === true });
});

keepAspect?.addEventListener('change', () => updateUI());
appendMode?.addEventListener('change', () => updateUI());

qualitySlider?.addEventListener('input', () => {
  webpQuality = +qualitySlider.value;
  if (qualityValueLabel) qualityValueLabel.textContent = webpQuality + '%';
});



// === Zwischenablage: Bilder per Ctrl/Cmd+V einfügen ===
document.addEventListener('paste', async (e) => {
  const cd = e.clipboardData;
  if (!cd) return;

  // a) echte Bilddaten aus der Zwischenablage (Shottr, macOS Screenshot etc.)
  const files = [];
  for (const item of cd.items) {
    if (item.kind === 'file' && item.type.startsWith('image/')) {
      const f = item.getAsFile();
      if (f) files.push(f);
    }
  }
  if (files.length) {
    e.preventDefault();
    handleFiles(files, { append: (appendMode?.checked === true) || e.shiftKey || e.altKey || e.ctrlKey || e.metaKey });
    return;
  }

  // b) Fallback: Text als Bild-URL (wenn die Domain CORS zulässt)
  const text = cd.getData('text')?.trim();
  const isImgUrl = /^https?:\/\/\S+\.(png|jpe?g|webp|gif|avif|bmp)(\?\S*)?$/i.test(text || '');
  if (isImgUrl) {
    e.preventDefault();
    try {
      showSpinner(true);
      const res = await fetch(text);
      const blob = await res.blob();
      const name = (text.split('/').pop() || 'pasted-image').split('?')[0];
      const file = new File([blob], name, { type: blob.type || 'image/png' });
      handleFiles([file], { append: (appendMode?.checked === true) || e.shiftKey || e.altKey || e.ctrlKey || e.metaKey });
    } catch (err) {
      console.error('Paste-URL fehlgeschlagen:', err);
    } finally {
      showSpinner(false);
    }
  }
});



// UI aktualisieren
function updateUI() {
  renderGallery();
  const anySelected = images.some(i => i.selected);
  const selectedCount = images.filter(i => i.selected).length;
  downloadBtn.disabled = images.length === 0 || (selectionMode && !anySelected);
  duplicateSelectedBtn.disabled = !selectionMode || !anySelected || images.length >= MAX_IMAGES;
  deleteSelectedBtn.disabled = !selectionMode || !anySelected;
  if (selectModeBtn) {
    selectModeBtn.textContent = selectionMode
      ? (selectedCount > 0 ? `${selectedCount} ausgewählt` : 'Auswahl beenden')
      : 'Auswählen';
  }
  document.querySelectorAll('.selection-action').forEach(button => {
    button.classList.toggle('hidden', !selectionMode || !anySelected);
  });
  document.querySelectorAll('.preset-btn').forEach(button => {
    button.disabled = images.length === 0;
  });
  document.body.classList.toggle('has-images', images.length > 0);
  document.body.classList.toggle('selection-mode', selectionMode);
  document.body.classList.toggle('replace-mode', images.length > 0 && appendMode?.checked !== true);
  document.body.classList.toggle('append-mode', appendMode?.checked === true);
  syncDropzoneState();
}

function syncDropzoneState() {
  const hasImages = images.length > 0;
  const append = appendMode?.checked === true;
  const replaceMode = hasImages && !append;

  if (dropZoneTitle) {
    dropZoneTitle.textContent = replaceMode ? DROPZONE_REPLACE_TITLE : DROPZONE_DEFAULT_TITLE;
  }

  if (dropZoneCopy) {
    dropZoneCopy.textContent = replaceMode ? DROPZONE_REPLACE_COPY : (hasImages && append ? DROPZONE_APPEND_COPY : DROPZONE_DEFAULT_COPY);
  }

  if (dropZoneState) {
    dropZoneState.textContent = replaceMode
      ? DROPZONE_REPLACE_HINT
      : (hasImages && append
        ? 'Anhängen ist aktiv. Neue Dateien werden zur aktuellen Auswahl hinzugefügt.'
        : 'Ziehe Dateien hierher oder klicke auf „Dateien auswählen“.');
  }
}


// Galerie rendern
function renderGallery() {
  gallery.innerHTML = '';
  images.forEach((item, idx) => {
    const card = document.createElement('div');
    card.className = 'image-card';
    card.classList.toggle('selected', item.selected);
    card.tabIndex = 0;
    card.setAttribute('role', 'option');
    card.setAttribute('aria-selected', item.selected ? 'true' : 'false');

    if (selectionMode || item.selected) {
      const check = document.createElement('span');
      check.className = 'selection-check';
      check.setAttribute('aria-hidden', 'true');
      check.textContent = '✓';
      card.appendChild(check);
    }

    const toggleSelection = () => {
      if (!selectionMode) {
        selectionMode = true;
        selectModeBtn.classList.add('active');
      }
      item.selected = !item.selected;
      updateUI();
    };

    card.addEventListener('click', (event) => {
      if (event.target.closest('input, button, select, textarea, a, label')) return;
      toggleSelection();
    });

    card.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      toggleSelection();
    });


    // Canvas-Vorschau
    const canvas = document.createElement('canvas');
    drawCanvas(canvas, item);
    card.appendChild(canvas);

    // nach `card.appendChild(canvas);`:
    const meta = document.createElement('div');
    meta.className = 'meta';
    const fullName = (item.customName ?? item.filename);

    // Anzeige-Name inline kürzen (max 10 Zeichen – gern anpassen)
    const dot = fullName.lastIndexOf('.');
    const ext = dot > -1 ? fullName.slice(dot) : '';
    const base = dot > -1 ? fullName.slice(0, dot) : fullName;
    const max = 19; // <- deine gewünschte Gesamtlänge inkl. Endung
    const displayName = (base.length + ext.length) <= max
      ? (base + ext)
      : (base.slice(0, Math.max(3, max - ext.length - 3)) + '...' + ext);

    // Safe DOM construction – no innerHTML with user data
    const nameDiv = document.createElement('div');
    nameDiv.textContent = 'Name: ';
    const nameSpan = document.createElement('span');
    nameSpan.className = 'filename';
    nameSpan.setAttribute('title', fullName);
    nameSpan.textContent = displayName;
    nameDiv.appendChild(nameSpan);
    meta.appendChild(nameDiv);

    const dimsDiv = document.createElement('div');
    dimsDiv.textContent = `Original: ${item.origWidth} × ${item.origHeight} px`;
    meta.appendChild(dimsDiv);

    if (item.filesize) {
      const sizeDiv = document.createElement('div');
      sizeDiv.className = 'file-size-row';
      const sizeSpan = document.createElement('span');
      sizeSpan.className = 'size-tag size-orig';
      sizeSpan.textContent = formatBytes(item.filesize);
      sizeDiv.appendChild(sizeSpan);
      meta.appendChild(sizeDiv);
    }

    card.appendChild(meta);


    // Name-Editor (unterhalb der Meta-Daten)
    const nameWrap = document.createElement('div');
    nameWrap.className = 'name-edit';

    // Safe DOM construction – no innerHTML with user data
    const nameLabel = document.createElement('label');
    nameLabel.textContent = 'Bildname:';
    nameWrap.appendChild(nameLabel);
    const nameInput = document.createElement('input');
    nameInput.className = 'name-input';
    nameInput.type = 'text';
    nameInput.value = (item.customName ?? item.filename).replace(/\.[^.]+$/, '');
    nameInput.style.cssText = 'width:100%; box-sizing:border-box; margin-top:2px;';
    nameWrap.appendChild(nameInput);
    card.appendChild(nameWrap);

    // Listener: geänderten Namen in item.customName speichern (ohne Extension)
    const nameInp = nameInput;
    nameInp.addEventListener('change', () => {
      const base = nameInp.value.trim();
      if (!base) return;            // leere Eingaben ignorieren
      item.customName = base;       // Extension hängen wir beim Download an
    });



    // Skalierungs-Kontrollen
    const controls = document.createElement('div');
    controls.className = 'card-controls';

      if (isPercentMode()) {
      // Prozent-Modus
      controls.innerHTML = `
        <label>
          <input type="range" min="1" max="200" value="${item.scalePercent}" class="scale-slider" />
          <span>${item.scalePercent}%</span>
        </label>`;
      const slider = controls.querySelector('.scale-slider');
      const span = controls.querySelector('span');
      slider.addEventListener('input', () => {
        item.scalePercent = +slider.value;
        span.textContent = item.scalePercent + '%';
        if (bulkScale.checked) {
          images.forEach(i => i.scalePercent = item.scalePercent);
        }
        renderGallery();
      });
    } else {
      // Pixel-Modus: erst bei Change die Vorschau anpassen
      const portrait = isPortrait(item); // ⟵ Orientierung ermitteln

      const wLabel = document.createElement('label');
      wLabel.textContent = 'Breite: ';
      const wInput = document.createElement('input');
      wInput.type = 'number'; wInput.min = '1'; wInput.value = item.width;
      wInput.max = String(MAX_PIXEL_SIZE);
      wInput.inputMode = 'numeric';
      wInput.pattern = '[0-9]*';
      wLabel.appendChild(wInput);

      const hLabel = document.createElement('label');
      hLabel.textContent = 'Höhe: ';
      const hInput = document.createElement('input');
      hInput.type = 'number'; hInput.min = '1'; hInput.value = item.height;
      hInput.max = String(MAX_PIXEL_SIZE);
      hInput.inputMode = 'numeric';
      hInput.pattern = '[0-9]*';
      hLabel.appendChild(hInput);

      const applyWidthChange = () => {
        item.width = clampPixelSize(wInput.value);
        wInput.value = item.width;

        if (keepAspect.checked) {
          item.height = clampPixelSize(item.img.height / item.img.width * item.width);
          hInput.value = item.height;
        }

        if (bulkScale.checked) {
          const targetValue = item.width; // Der Wert, den wir synchronisieren wollen
          images.forEach(i => {
            const iPortrait = isPortrait(i);
            if (!keepAspect.checked) {
              i.width = targetValue;
            } else {
              if (iPortrait) {
                // Hochformat: setze HÖHE auf targetValue
                i.height = targetValue;
                i.width = clampPixelSize(i.img.width / i.img.height * i.height);
              } else {
                // Querformat: setze BREITE auf targetValue
                i.width = targetValue;
                i.height = clampPixelSize(i.img.height / i.img.width * i.width);
              }
            }
          });
        }
        renderGallery();
      };

      const applyHeightChange = () => {
        item.height = clampPixelSize(hInput.value);
        hInput.value = item.height;

        if (keepAspect.checked) {
          item.width = clampPixelSize(item.img.width / item.img.height * item.height);
          wInput.value = item.width;
        }

        if (bulkScale.checked) {
          const targetValue = item.height; // Der Wert, den wir synchronisieren wollen
          images.forEach(i => {
            const iPortrait = isPortrait(i);
            if (!keepAspect.checked) {
              i.height = targetValue;
            } else {
              if (iPortrait) {
                // Hochformat: setze HÖHE auf targetValue
                i.height = targetValue;
                i.width = clampPixelSize(i.img.width / i.img.height * i.height);
              } else {
                // Querformat: setze BREITE auf targetValue
                i.width = targetValue;
                i.height = clampPixelSize(i.img.height / i.img.width * i.width);
              }
            }
          });
        }
        renderGallery();
      };

      wInput.addEventListener('input', () => {
        sanitizeNumberInput(wInput);
        if (+wInput.value > MAX_PIXEL_SIZE) wInput.value = String(MAX_PIXEL_SIZE);
        item.width = clampPixelSize(wInput.value);
        if (keepAspect.checked) {
          item.height = clampPixelSize(item.img.height / item.img.width * item.width);
          hInput.value = item.height;
        }
      });

      hInput.addEventListener('input', () => {
        sanitizeNumberInput(hInput);
        if (+hInput.value > MAX_PIXEL_SIZE) hInput.value = String(MAX_PIXEL_SIZE);
        item.height = clampPixelSize(hInput.value);
        if (keepAspect.checked) {
          item.width = clampPixelSize(item.img.width / item.img.height * item.height);
          wInput.value = item.width;
        }
      });

      wInput.addEventListener('keydown', blockNonNumericKeys);
      hInput.addEventListener('keydown', blockNonNumericKeys);

      wInput.addEventListener('paste', (event) => {
        event.preventDefault();
        wInput.value = event.clipboardData.getData('text').replace(/\D/g, '');
        wInput.dispatchEvent(new Event('input', { bubbles: true }));
      });

      hInput.addEventListener('paste', (event) => {
        event.preventDefault();
        hInput.value = event.clipboardData.getData('text').replace(/\D/g, '');
        hInput.dispatchEvent(new Event('input', { bubbles: true }));
      });

      wInput.addEventListener('change', applyWidthChange);
      hInput.addEventListener('change', applyHeightChange);

      wInput.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          applyWidthChange();
        }
      });

      hInput.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          applyHeightChange();
        }
      });

      controls.appendChild(wLabel);
      controls.appendChild(hLabel);
    }

    card.appendChild(controls);
    gallery.appendChild(card);
  });
}

// Berechnet proportionale Zeichenkoordinaten (object-fit: cover)
function calcContain(srcW, srcH, dstW, dstH) {
  const scale = Math.max(dstW / srcW, dstH / srcH);
  const drawW = srcW * scale;
  const drawH = srcH * scale;
  const offsetX = (dstW - drawW) / 2;
  const offsetY = (dstH - drawH) / 2;
  return { drawW, drawH, offsetX, offsetY };
}

// Canvas zeichnen
function drawCanvas(canvas, item) {
  const ctx = canvas.getContext('2d');

  // 1) Retina / High-DPI Support
  const dpr = window.devicePixelRatio || 1;
  const w = isPercentMode()
    ? clampPixelSize(item.img.width * (item.scalePercent / 100))
    : clampPixelSize(item.width);
  const h = isPercentMode()
    ? clampPixelSize(item.img.height * (item.scalePercent / 100))
    : clampPixelSize(item.height);

  // Setze das interne Pixelmaß auf w*h multipliziert mit devicePixelRatio
  canvas.width = w * dpr;
  canvas.height = h * dpr;

  // Skaliere das Koordinatensystem zurück auf logical pixels
  ctx.scale(dpr, dpr);

  // 2) Aktivere glatte Skalierung
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';  // möglich: 'low', 'medium', 'high'

  // 3) Proportional zeichnen (contain – kein Verzerren)
  ctx.clearRect(0, 0, w, h);
  const { drawW, drawH, offsetX, offsetY } = calcContain(
    item.img.width, item.img.height, w, h
  );
  ctx.drawImage(item.img, offsetX, offsetY, drawW, drawH);
}


// Einzelfoto ersetzen
function replaceImage(index) {
  const inp = document.createElement('input');
  inp.type = 'file'; inp.accept = 'image/*';
  inp.onchange = () => {
    const file = inp.files[0];
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const keep = images[index];
        images[index] = {
          ...keep,                 // alles Alte behalten (inkl. customName/selected)
          img,                     // neues Bild übernehmen
          fileType: file.type,
          filename: file.name,
          filesize: file.size,
          origWidth: img.width,
          origHeight: img.height,
          width: img.width,    // oder keep.width, falls du Größe beibehalten willst
          height: img.height
        };
        updateUI();
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  };
  inp.click();
}

// Auswahlmodus umschalten
selectModeBtn.addEventListener('click', () => {
  selectionMode = !selectionMode;
  selectModeBtn.classList.toggle('active', selectionMode);
  images.forEach(i => i.selected = false);
  updateUI();
});

duplicateSelectedBtn?.addEventListener('click', () => {
  duplicateSelectedImages();
});

// Löschen ausgewählter (ohne Popup)
deleteSelectedBtn.addEventListener('click', () => {
  saveUndoState('Ausgewählte Bilder gelöscht');
  images = images.filter(i => !i.selected);
  selectionMode = false;
  selectModeBtn.classList.remove('active');
  updateUI();
});

document.querySelectorAll('.preset-btn').forEach(button => {
  button.addEventListener('click', () => {
    applyImagePreset(button.dataset.preset);
  });
});

function scaleToLongEdge(item, longEdge) {
  const isWide = item.img.width >= item.img.height;
  if (isWide) {
    item.width = clampPixelSize(longEdge);
    item.height = clampPixelSize(item.img.height / item.img.width * longEdge);
  } else {
    item.height = clampPixelSize(longEdge);
    item.width = clampPixelSize(item.img.width / item.img.height * longEdge);
  }
  item.scalePercent = Math.round((longEdge / Math.max(item.img.width, item.img.height)) * 100);
}

function applyImagePreset(preset) {
  if (!images.length) return;
  saveUndoState('Preset angewendet');

  images.forEach(item => {
    if (preset === 'original') {
      item.width = clampPixelSize(item.img.width);
      item.height = clampPixelSize(item.img.height);
      item.scalePercent = 100;
      return;
    }

    const sizes = {
      'banner-fullhd': 1920,
      banner: 1200,
      large: 800,
      small: 500
    };
    scaleToLongEdge(item, sizes[preset] || 1200);
  });

  updateUI();
}

function makeOutName(item, outExt, allItems) {
  const base = (item.customName ?? item.filename).replace(/\.[^.]+$/, '');

  // Prüfen, ob dieser Name mehrfach vorkommt
  const namesCount = allItems.reduce((acc, img) => {
    const imgBase = (img.customName ?? img.filename).replace(/\.[^.]+$/, '');
    acc[imgBase] = (acc[imgBase] || 0) + 1;
    return acc;
  }, {});

  // Wenn Name mehrfach vorkommt, Nummer anhängen
  if (namesCount[base] > 1) {
    const sameNameItems = allItems.filter(img => {
      const imgBase = (img.customName ?? img.filename).replace(/\.[^.]+$/, '');
      return imgBase === base;
    });
    const itemIndex = sameNameItems.indexOf(item) + 1;
    return `${base}-${itemIndex}.${outExt}`;
  }

  return `${base}.${outExt}`;
}

// === Export-Helfer: sorgt dafür, dass der Download NICHT mit devicePixelRatio* skaliert ===
function getTargetSize(item) {
  // Gleiche Logik wie deine Vorschau
  if (isPercentMode()) {
    // Prozent-Modus
    const w = clampPixelSize(item.img.width * (item.scalePercent / 100));
    const h = clampPixelSize(item.img.height * (item.scalePercent / 100));
    return { w, h };
  } else {
    // Pixel-Modus
    return { w: clampPixelSize(item.width), h: clampPixelSize(item.height) };
  }
}

function makeExportCanvas(item) {
  const { w, h } = getTargetSize(item);
  const c = document.createElement('canvas');
  // Wichtig: KEIN dpr-Multiplikator hier – echte Zielgröße in px!
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  // Canvas explizit löschen, um transparenten Hintergrund sicherzustellen
  ctx.clearRect(0, 0, w, h);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  const { drawW, drawH, offsetX, offsetY } = calcContain(
    item.img.width, item.img.height, w, h
  );
  ctx.drawImage(item.img, offsetX, offsetY, drawW, drawH);
  return c;
}

// Konvertierungsfunktion für spezielle Formate
async function convertToFormat(canvas, format) {
  switch (format) {
    case 'ico':
      return await canvasToIco(canvas);
    case 'icns':
      return await canvasToIcns(canvas);
    case 'bmp':
      return await canvasToBmp(canvas);
    case 'svg':
      return await canvasToSvg(canvas);
    default:
      // Fallback zu PNG
      return new Promise(resolve => {
        canvas.toBlob(resolve, 'image/png');
      });
  }
}

// ICO-Konvertierung (einfaches Format mit einer Größe)
async function canvasToIco(canvas) {
  // ICO-Format: Header + Icon Directory + Bitmap Data
  const width = canvas.width;
  const height = canvas.height;

  // Für ICO: Max 256x256, quadratisch empfohlen
  const size = Math.min(Math.max(width, height), 256);
  const resizedCanvas = document.createElement('canvas');
  resizedCanvas.width = size;
  resizedCanvas.height = size;
  const ctx = resizedCanvas.getContext('2d');
  ctx.drawImage(canvas, 0, 0, size, size);

  // PNG-Daten holen
  const pngBlob = await new Promise(resolve => {
    resizedCanvas.toBlob(resolve, 'image/png');
  });
  const pngArrayBuffer = await pngBlob.arrayBuffer();
  const pngData = new Uint8Array(pngArrayBuffer);

  // ICO Header (6 bytes)
  const header = new ArrayBuffer(6);
  const headerView = new DataView(header);
  headerView.setUint16(0, 0, true); // Reserved (must be 0)
  headerView.setUint16(2, 1, true); // Type (1 = ICO)
  headerView.setUint16(4, 1, true); // Number of images

  // Icon Directory Entry (16 bytes)
  const entry = new ArrayBuffer(16);
  const entryView = new DataView(entry);
  entryView.setUint8(0, size === 256 ? 0 : size); // Width (0 = 256)
  entryView.setUint8(1, size === 256 ? 0 : size); // Height (0 = 256)
  entryView.setUint8(2, 0); // Color palette (0 = no palette)
  entryView.setUint8(3, 0); // Reserved
  entryView.setUint16(4, 1, true); // Color planes (1)
  entryView.setUint16(6, 32, true); // Bits per pixel (32 = RGBA)
  entryView.setUint32(8, pngData.length, true); // Size of image data
  entryView.setUint32(12, 22, true); // Offset (header + entry = 22)

  // ICO-Datei zusammenfügen
  const icoBlob = new Blob([header, entry, pngData], { type: 'image/x-icon' });
  return icoBlob;
}

// ICNS-Konvertierung (macOS Icon - vereinfacht als PNG-basiert)
async function canvasToIcns(canvas) {
  // ICNS ist komplex, wir erstellen eine vereinfachte Version
  // Für echte ICNS würde man mehrere Größen benötigen
  // Hier: PNG-Daten mit ICNS-MIME-Type (wird als PNG erkannt, aber mit .icns Extension)
  return new Promise(resolve => {
    canvas.toBlob(resolve, 'image/png');
  });
}

// BMP-Konvertierung
async function canvasToBmp(canvas) {
  const width = canvas.width;
  const height = canvas.height;
  const ctx = canvas.getContext('2d');
  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;

  // BMP Header (14 bytes)
  const fileHeaderSize = 14;
  const infoHeaderSize = 40;
  const rowSize = Math.floor((width * 3 + 3) / 4) * 4; // Padding auf 4 Bytes
  const pixelDataSize = rowSize * height;
  const fileSize = fileHeaderSize + infoHeaderSize + pixelDataSize;

  const bmp = new ArrayBuffer(fileSize);
  const view = new DataView(bmp);

  // File Header
  view.setUint8(0, 0x42); // 'B'
  view.setUint8(1, 0x4D); // 'M'
  view.setUint32(2, fileSize, true);
  view.setUint32(6, 0, true); // Reserved
  view.setUint32(10, fileHeaderSize + infoHeaderSize, true); // Offset

  // Info Header
  view.setUint32(14, infoHeaderSize, true);
  view.setInt32(18, width, true);
  view.setInt32(22, -height, true); // Negativ = top-down
  view.setUint16(26, 1, true); // Planes
  view.setUint16(28, 24, true); // Bits per pixel
  view.setUint32(30, 0, true); // Compression (0 = none)
  view.setUint32(34, pixelDataSize, true);
  view.setInt32(38, 0, true); // X pixels per meter
  view.setInt32(42, 0, true); // Y pixels per meter
  view.setUint32(46, 0, true); // Colors used
  view.setUint32(50, 0, true); // Important colors

  // Pixel Data (BGR, bottom-up)
  let offset = fileHeaderSize + infoHeaderSize;
  for (let y = height - 1; y >= 0; y--) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      view.setUint8(offset++, data[idx + 2]); // B
      view.setUint8(offset++, data[idx + 1]); // G
      view.setUint8(offset++, data[idx]);     // R
    }
    // Padding
    for (let p = 0; p < (rowSize - width * 3); p++) {
      view.setUint8(offset++, 0);
    }
  }

  return new Blob([bmp], { type: 'image/bmp' });
}

// SVG-Konvertierung (Canvas als Base64 eingebettet)
async function canvasToSvg(canvas) {
  const width = canvas.width;
  const height = canvas.height;
  const dataUrl = canvas.toDataURL('image/png');

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
  <image width="${width}" height="${height}" xlink:href="${dataUrl}"/>
</svg>`;

  return new Blob([svg], { type: 'image/svg+xml' });
}


// === WebP EXIF: 72 DPI injection ===
function buildExif72dpi() {
  // WebP EXIF chunk payload = raw TIFF data, NO "Exif\0\0" prefix (that's JPEG-only)
  // 66 bytes: TIFF header + IFD with 3 entries + rational values
  const d = new Uint8Array(66);
  // TIFF header: "II" (little-endian), magic 42, IFD at offset 8
  d.set([0x49, 0x49, 0x2A, 0x00, 0x08, 0x00, 0x00, 0x00], 0);
  // IFD entry count = 3
  d.set([0x03, 0x00], 8);
  // Entry 1: XResolution (tag 0x011A, RATIONAL, count 1, value at TIFF offset 50)
  d.set([0x1A, 0x01, 0x05, 0x00, 0x01, 0x00, 0x00, 0x00, 0x32, 0x00, 0x00, 0x00], 10);
  // Entry 2: YResolution (tag 0x011B, RATIONAL, count 1, value at TIFF offset 58)
  d.set([0x1B, 0x01, 0x05, 0x00, 0x01, 0x00, 0x00, 0x00, 0x3A, 0x00, 0x00, 0x00], 22);
  // Entry 3: ResolutionUnit (tag 0x0128, SHORT, count 1, value 2 = inch)
  d.set([0x28, 0x01, 0x03, 0x00, 0x01, 0x00, 0x00, 0x00, 0x02, 0x00, 0x00, 0x00], 34);
  // Next IFD offset = 0
  d.set([0x00, 0x00, 0x00, 0x00], 46);
  // XResolution = 72/1 at offset 50
  d.set([0x48, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00], 50);
  // YResolution = 72/1 at offset 58
  d.set([0x48, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00], 58);
  return d;
}

function _readStr4(arr, off) {
  return String.fromCharCode(arr[off], arr[off + 1], arr[off + 2], arr[off + 3]);
}
function _read32le(arr, off) {
  return (arr[off] | (arr[off + 1] << 8) | (arr[off + 2] << 16) | (arr[off + 3] << 24)) >>> 0;
}
function _write32le(arr, off, val) {
  arr[off] = val & 0xFF;
  arr[off + 1] = (val >>> 8) & 0xFF;
  arr[off + 2] = (val >>> 16) & 0xFF;
  arr[off + 3] = (val >>> 24) & 0xFF;
}
function _write24le(arr, off, val) {
  arr[off] = val & 0xFF;
  arr[off + 1] = (val >>> 8) & 0xFF;
  arr[off + 2] = (val >>> 16) & 0xFF;
}

async function addExifDpiToWebP(blob, canvasWidth, canvasHeight) {
  if (!blob) return blob;
  const origBuf = await blob.arrayBuffer();
  const orig = new Uint8Array(origBuf);
  if (orig.length < 12 || _readStr4(orig, 0) !== 'RIFF' || _readStr4(orig, 8) !== 'WEBP') return blob;

  const exifData = buildExif72dpi(); // 66 bytes raw TIFF (even – no padding needed)
  // EXIF RIFF chunk = "EXIF" + size(4) + data(66) = 74 bytes
  const exifChunk = new Uint8Array(74);
  exifChunk.set([0x45, 0x58, 0x49, 0x46], 0);
  _write32le(exifChunk, 4, 66);
  exifChunk.set(exifData, 8);

  const firstChunk = _readStr4(orig, 12);

  if (firstChunk === 'VP8 ' || firstChunk === 'VP8L') {
    // Simple → Extended: prepend VP8X chunk, append EXIF chunk
    const vp8x = new Uint8Array(18);
    vp8x.set([0x56, 0x50, 0x38, 0x58], 0); // "VP8X"
    _write32le(vp8x, 4, 10);
    _write32le(vp8x, 8, 0x00000008); // EXIF flag
    _write24le(vp8x, 12, canvasWidth - 1);
    _write24le(vp8x, 15, canvasHeight - 1);

    const origChunks = orig.slice(12);
    const payloadSize = 4 + vp8x.length + origChunks.length + exifChunk.length;
    const out = new Uint8Array(8 + payloadSize);
    let p = 0;
    out.set([0x52, 0x49, 0x46, 0x46], p); p += 4;
    _write32le(out, p, payloadSize); p += 4;
    out.set([0x57, 0x45, 0x42, 0x50], p); p += 4;
    out.set(vp8x, p); p += vp8x.length;
    out.set(origChunks, p); p += origChunks.length;
    out.set(exifChunk, p);
    return new Blob([out], { type: 'image/webp' });
  }

  if (firstChunk === 'VP8X') {
    // Extended: set EXIF flag, append EXIF chunk
    const out = new Uint8Array(orig.length + exifChunk.length);
    out.set(orig);
    _write32le(out, 20, _read32le(out, 20) | 0x00000008);
    out.set(exifChunk, orig.length);
    _write32le(out, 4, out.length - 8);
    return new Blob([out], { type: 'image/webp' });
  }

  return blob;
}

// Manche Browser (v.a. Safari/WebKit auf macOS und iOS) können über Canvas
// kein WebP *kodieren* - nur anzeigen. canvas.toBlob(...,'image/webp',...) liefert
// dort laut Spec still einen PNG-Blob zurück (blob.type === 'image/png'), ohne Fehler.
// Deshalb NIE den angeforderten Mime-Type annehmen, sondern immer den tatsächlichen
// blob.type prüfen und Dateiendung/Weiterverarbeitung danach richten.
const EXT_BY_MIME = {
  'image/webp': 'webp',
  'image/png': 'png',
  'image/jpeg': 'jpg'
};

// Download-Logik: WebP, mit Fallback auf PNG falls der Browser kein WebP-Encoding kann
downloadBtn.addEventListener('click', async () => {
  const targets = selectionMode ? images.filter(i => i.selected) : images.slice();
  if (!targets.length) return;

  const outMime = 'image/webp';
  let webpUnsupported = false;

  async function exportToWebpBlob(canvas, originalFileSize) {
    let quality = webpQuality;
    let blob = await new Promise(resolve => canvas.toBlob(resolve, outMime, quality / 100));
    if (!blob) return null;

    if (blob.type !== outMime) {
      // Browser hat still auf ein anderes Format zurückgefallen (z.B. Safari -> PNG)
      webpUnsupported = true;
      return blob;
    }

    blob = await addExifDpiToWebP(blob, canvas.width, canvas.height);

    // Automatisch Qualität reduzieren falls WebP größer als Original
    while (originalFileSize && blob.size > originalFileSize && quality > 50) {
      quality = Math.max(50, quality - 10);
      blob = await new Promise(resolve => canvas.toBlob(resolve, outMime, quality / 100));
      if (!blob || blob.type !== outMime) {
        if (blob) webpUnsupported = true;
        break;
      }
      blob = await addExifDpiToWebP(blob, canvas.width, canvas.height);
    }

    return blob;
  }

  if (targets.length === 1) {
    const item = targets[0];
    const canvas = makeExportCanvas(item);
    const blob = await exportToWebpBlob(canvas, item.filesize);
    if (!blob) {
      alert('❌ Fehler beim Erstellen des Bildes.');
      return;
    }
    const outExt = EXT_BY_MIME[blob.type] || 'webp';
    showDownloadResult(item.filesize, blob.size, 1, webpUnsupported);
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = makeOutName(item, outExt, targets);
    link.click();
    URL.revokeObjectURL(link.href);
    return;
  }

  showSpinner(true);
  const zip = new JSZip();
  let processed = 0;
  let totalOrig = 0;
  let totalOut = 0;

  for (const item of targets) {
    const canvas = makeExportCanvas(item);
    const blob = await exportToWebpBlob(canvas, item.filesize);
    if (blob) {
      const outExt = EXT_BY_MIME[blob.type] || 'webp';
      zip.file(makeOutName(item, outExt, targets), blob);
      totalOrig += item.filesize || 0;
      totalOut += blob.size;
    }
    processed++;
    loadBar.value = (processed / targets.length) * 100;
  }

  const content = await zip.generateAsync({ type: 'blob' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(content);
  a.download = webpUnsupported ? 'bilder-png.zip' : 'bilder-webp.zip';
  a.click();
  URL.revokeObjectURL(a.href);
  showDownloadResult(totalOrig, totalOut, targets.length, webpUnsupported);
  showSpinner(false);
});


if (modeToggle && modeLabel) {
  modeToggle.addEventListener('change', () => {
    modeLabel.textContent = modeToggle.checked ? 'Prozent' : 'Pixel';
    updateUI();
  });
}

// === NEU: Spinner-Steuerung ===
function showSpinner(on) {
  spinnerOverlay.classList.toggle('hidden', !on);
  loadBar.classList.toggle('hidden', !on);
  if (on) loadBar.value = 0;
}

// === Neuer Image-Loader mit Promise ===
function loadImageFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => resolve({ file, img });
      img.onerror = () => reject(new Error('Bild konnte nicht geladen werden.'));
      img.src = reader.result;
    };
    reader.onerror = () => reject(new Error('Datei konnte nicht gelesen werden.'));
    reader.readAsDataURL(file);
  });
}

// Hilfsfunktion: Promise mit hartem Timeout koppeln
function withTimeout(promise, ms, msg) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(msg || 'Timeout')), ms))
  ]);
}

// === HEIC-Konvertierung: createImageBitmap → nativ → Worker → Hauptthread ===
async function convertHeicFile(file) {
  const outputName = file.name.replace(/\.(heic|heif)$/i, '.jpg');
  const QUALITY_STEPS = [0.85, 0.65, 0.45];

  // Hilfsfunktion: ImageBitmap → JPEG Blob via Canvas
  async function bitmapToJpeg(bitmap, quality = 0.88) {
    // Bei sehr großen Bildern downscaling, damit Canvas-Limit (16384px) nicht überschritten wird
    const MAX_DIM = 8192;
    let w = bitmap.width;
    let h = bitmap.height;
    if (w > MAX_DIM || h > MAX_DIM) {
      const ratio = Math.min(MAX_DIM / w, MAX_DIM / h);
      w = Math.round(w * ratio);
      h = Math.round(h * ratio);
      console.log(`HEIC: Downscaling zu ${w}×${h} (Original zu groß für Canvas)`);
    }
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close();
    return new Promise((resolve, reject) => {
      canvas.toBlob(b => b ? resolve(b) : reject(new Error('toBlob fehlgeschlagen')), 'image/jpeg', quality);
    });
  }

  // ── Strategie 1: createImageBitmap (nativ, speichereffizient, Chrome 94+ / Safari 17+) ──
  if (typeof createImageBitmap === 'function') {
    // Erst normal probieren
    try {
      const bitmap = await withTimeout(
        createImageBitmap(file),
        15_000, 'createImageBitmap Timeout'
      );
      const blob = await bitmapToJpeg(bitmap, 0.88);
      console.log('HEIC: createImageBitmap ✓');
      return new File([blob], outputName, { type: 'image/jpeg' });
    } catch (e1) {
      console.warn('HEIC: createImageBitmap normal →', e1.message);
      // Falls zu groß: versuche mit vorherigem Resize
      const MAX_PX = 4096;
      try {
        const bitmap = await withTimeout(
          createImageBitmap(file, { resizeWidth: MAX_PX, resizeQuality: 'pixelated' }),
          15_000, 'createImageBitmap resized Timeout'
        );
        const blob = await bitmapToJpeg(bitmap, 0.80);
        console.log('HEIC: createImageBitmap (resized) ✓');
        return new File([blob], outputName, { type: 'image/jpeg' });
      } catch (e2) {
        console.warn('HEIC: createImageBitmap resized →', e2.message);
      }
    }
  }

  // ── Strategie 2: Natives <img> (Safari kann HEIC ohne Konvertierung) ───────
  try {
    const nativeUrl = URL.createObjectURL(file);
    const nativeOk = await withTimeout(
      new Promise(res => {
        const img = new Image();
        img.onload = () => { URL.revokeObjectURL(nativeUrl); res(true); };
        img.onerror = () => { URL.revokeObjectURL(nativeUrl); res(false); };
        img.src = nativeUrl;
      }),
      8_000, 'Native-img Timeout'
    );
    if (nativeOk) {
      console.log('HEIC: nativer <img>-Support ✓');
      return new File([file], outputName, { type: 'image/heic' });
    }
  } catch (_) { /* weiter */ }

  // ── Strategie 3: Web Worker mit heic2any (kein Browser-Freeze) ───────────
  let worker = null;
  try {
    const workerUrl = new URL('./heic-worker.js', import.meta.url);
    worker = new Worker(workerUrl);
  } catch (_) {
    console.warn('HEIC: Worker nicht verfügbar.');
  }

  if (worker) {
    const arrayBuffer = await file.arrayBuffer();
    for (const quality of QUALITY_STEPS) {
      try {
        const blob = await withTimeout(
          new Promise((resolve, reject) => {
            const id = Math.random().toString(36).slice(2);
            worker.onmessage = (e) => {
              if (e.data.id !== id) return;
              if (e.data.success) resolve(new Blob([e.data.buffer], { type: 'image/jpeg' }));
              else reject(new Error(e.data.error));
            };
            worker.onerror = (e) => reject(new Error(e.message || 'Worker error'));
            const copy = arrayBuffer.slice(0);
            worker.postMessage({ id, arrayBuffer: copy, quality }, [copy]);
          }),
          40_000, `Worker-Timeout (q=${quality})`
        );
        worker.terminate();
        console.log(`HEIC: Worker ✓ (q=${quality})`);
        return new File([blob], outputName, { type: 'image/jpeg' });
      } catch (err) {
        console.warn(`HEIC Worker (q=${quality}) →`, err.message);
      }
    }
    worker.terminate();
  }

  // ── Strategie 4: Hauptthread heic2any mit Timeout (letzter Versuch) ───────
  if (typeof heic2any === 'function') {
    for (const quality of QUALITY_STEPS) {
      try {
        const converted = await withTimeout(
          heic2any({ blob: file, toType: 'image/jpeg', quality }),
          40_000, `heic2any-Timeout (q=${quality})`
        );
        const blob = Array.isArray(converted) ? converted[0] : converted;
        console.log(`HEIC: Hauptthread ✓ (q=${quality})`);
        return new File([blob], outputName, { type: 'image/jpeg' });
      } catch (err) {
        console.warn(`HEIC Hauptthread (q=${quality}) →`, err.message);
      }
    }
  }

  throw new Error('Alle HEIC-Strategien fehlgeschlagen.');
}

// Dateien einlesen – jetzt mit { append } Option
async function handleFiles(fileList, opts = {}) {
  const append = opts.append ?? (appendMode?.checked === true);

  const files = Array.from(fileList).filter(f => {
    const type = f.type.toLowerCase();
    const name = f.name.toLowerCase();
    return type.startsWith('image/') || name.endsWith('.heic') || name.endsWith('.heif');
  });
  if (files.length === 0) {
    if (fileInput) fileInput.value = '';
    return;
  }

  // 1) Spinner an
  showSpinner(true);

  // 2) Parallel laden mit Fortschritt
  let loaded = 0;
  const results = await Promise.all(files.map(async (file) => {
    let fileToLoad = file;

    // HEIC/HEIF Konvertierung
    const isHEIC = file.name.toLowerCase().endsWith('.heic') || file.name.toLowerCase().endsWith('.heif');
    if (isHEIC) {
      try {
        fileToLoad = await convertHeicFile(file);
      } catch (err) {
        console.error('HEIC-Konvertierung fehlgeschlagen:', err);
        alert(`Das HEIC-Bild "${file.name}" konnte leider nicht geladen werden.\n\nTipp: Konvertiere es zuerst mit der macOS Vorschau-App (Exportieren → JPEG).`);
        loaded++;
        loadBar.value = (loaded / files.length) * 100;
        return null;
      }
    }

    try {
      const data = await loadImageFile(fileToLoad);
      loaded++;
      loadBar.value = (loaded / files.length) * 100;
      return data;
    } catch (err) {
      console.error('Fehler beim Laden von:', file.name, err);
      alert(`Das Bild "${file.name}" konnte nicht geladen werden.`);
      loaded++;
      loadBar.value = (loaded / files.length) * 100;
      return null;
    }
  }));

  // 3) Bilder einfügen (Append- oder Replace-Logik)
  if (!append) {
    images = [];
  }

  // Platz nach MAX_IMAGES beachten (falls schon Bilder da sind)
  const remainingSlots = Math.max(0, MAX_IMAGES - images.length);
  const validResults = results.filter(Boolean);
  validResults.slice(0, remainingSlots).forEach(({ file, img }) => {
    images.push({
      img,
      fileType: file.type,
      filename: file.name,
      filesize: file.size,
      origWidth: img.width,
      origHeight: img.height,
      scalePercent: 100,
      width: img.width,
      height: img.height,
      selected: false,
      customName: null
    });
  });

  // 4) Spinner aus & UI updaten
  showSpinner(false);
  updateUI();
  if (fileInput) fileInput.value = '';
}


// === Aspect-Ratio Toolbar im Crop-Modal (mit Reset) ==========================
// === Aspect-Ratio Toolbar im Crop-Modal (mit Reset + Custom) ==========================
function setupCropAspectControls() {
  // Vorherige Toolbar entfernen, falls vorhanden
  const old = document.getElementById('crop-toolbar');
  if (old) old.remove();

  // Toolbar-Container
  const bar = document.createElement('div');
  bar.id = 'crop-toolbar';
  bar.className = 'crop-toolbar';

  // Presets definieren (label, w, h)
  const presets = [
    { label: 'Frei (keine Sperre)', w: null, h: null },
    { label: '1:1 Quadrat', w: 1, h: 1 },
    { label: '3:2', w: 3, h: 2 },
    { label: '2:3', w: 2, h: 3 },
    { label: '4:3', w: 4, h: 3 },
    { label: '3:4', w: 3, h: 4 },
    { label: '4:5', w: 4, h: 5 },
    { label: '5:4', w: 5, h: 4 },
    { label: '16:9 Quer', w: 16, h: 9 },
    { label: '9:16 Hoch', w: 9, h: 16 },
    { label: 'A4 Hoch (~0.707)', w: 210, h: 297 },
    { label: 'A4 Quer (~1.414)', w: 297, h: 210 },
    { label: 'Custom (eigenes Format)', w: 'custom', h: 'custom' }
  ];

  // Select (Preset-Auswahl)
  const select = document.createElement('select');
  select.id = 'crop-aspect-select';
  select.className = 'crop-aspect-select';
  presets.forEach((p, idx) => {
    const opt = document.createElement('option');
    opt.value = String(idx);
    opt.textContent = p.label;
    if (p.w && p.h && p.w !== 'custom') {
      opt.dataset.w = String(p.w);
      opt.dataset.h = String(p.h);
    } else if (p.w === 'custom') {
      opt.dataset.custom = 'true';
    }
    select.appendChild(opt);
  });

  // Custom Input Container
  const customContainer = document.createElement('div');
  customContainer.className = 'custom-ratio-input';
  customContainer.style.display = 'none';
  customContainer.innerHTML = `
    <input type="number" id="custom-w" min="1" value="16" placeholder="B" />
    <span>:</span>
    <input type="number" id="custom-h" min="1" value="9" placeholder="H" />
    <button type="button" id="apply-custom" class="btn">Anwenden</button>
  `;

  // Buttons
  const flipBtn = document.createElement('button');
  flipBtn.type = 'button';
  flipBtn.id = 'crop-flip';
  flipBtn.className = 'btn btn-ghost';
  flipBtn.textContent = 'Orientierung wechseln ↔️';

  const freeBtn = document.createElement('button');
  freeBtn.type = 'button';
  freeBtn.id = 'crop-free';
  freeBtn.className = 'btn btn-ghost';
  freeBtn.textContent = 'Frei';

  const resetBtn = document.createElement('button');
  resetBtn.type = 'button';
  resetBtn.id = 'crop-reset';
  resetBtn.className = 'btn btn-reset';
  resetBtn.textContent = 'Alles zurücksetzen';

  // Aktuelle Ratio-Anzeige
  const ratioLabel = document.createElement('span');
  ratioLabel.id = 'crop-aspect-current';
  ratioLabel.className = 'ratio-label';
  ratioLabel.textContent = 'Aktuell: frei';

  // Zusammenbauen
  bar.appendChild(select);
  bar.appendChild(customContainer);
  bar.appendChild(flipBtn);
  bar.appendChild(freeBtn);
  bar.appendChild(resetBtn);
  bar.appendChild(ratioLabel);

  const host = cropModal.querySelector('.modal-content') || cropModal;
  host.appendChild(bar);

  // === Logik ===
  function setAspectFromOption() {
    const opt = select.selectedOptions[0];

    // Check if custom
    if (opt?.dataset?.custom === 'true') {
      customContainer.style.display = 'flex';
      ratioLabel.textContent = 'Aktuell: Custom eingeben';
      return;
    } else {
      customContainer.style.display = 'none';
    }

    const w = opt?.dataset?.w ? Number(opt.dataset.w) : null;
    const h = opt?.dataset?.h ? Number(opt.dataset.h) : null;
    if (!window.cropper) return;

    if (w && h) {
      const r = w / h;
      window.cropper.setAspectRatio(r);
      ratioLabel.textContent = `Aktuell: ${w}:${h}`;
    } else {
      window.cropper.setAspectRatio(NaN);
      ratioLabel.textContent = 'Aktuell: frei';
    }
  }

  // Startauswahl: Standard auf „Frei" (Index 0)
  select.value = '0';
  setAspectFromOption();

  // Events
  select.addEventListener('change', setAspectFromOption);

  // Custom Apply Button
  const applyCustomBtn = customContainer.querySelector('#apply-custom');
  applyCustomBtn.addEventListener('click', () => {
    const w = Number(document.getElementById('custom-w').value);
    const h = Number(document.getElementById('custom-h').value);
    if (!window.cropper || !w || !h || w <= 0 || h <= 0) return;

    const r = w / h;
    window.cropper.setAspectRatio(r);
    ratioLabel.textContent = `Aktuell: ${w}:${h}`;
  });

  // Orientierung wechseln (nur sinnvoll bei fester Ratio)
  flipBtn.addEventListener('click', () => {
    const opt = select.selectedOptions[0];

    // Handle custom ratio flip
    if (opt?.dataset?.custom === 'true') {
      const wInput = document.getElementById('custom-w');
      const hInput = document.getElementById('custom-h');
      const tempW = wInput.value;
      wInput.value = hInput.value;
      hInput.value = tempW;

      const w = Number(wInput.value);
      const h = Number(hInput.value);
      if (w && h) {
        window.cropper.setAspectRatio(w / h);
        ratioLabel.textContent = `Aktuell: ${w}:${h}`;
      }
      return;
    }

    const w = opt?.dataset?.w ? Number(opt.dataset.w) : null;
    const h = opt?.dataset?.h ? Number(opt.dataset.h) : null;
    if (!window.cropper) return;
    if (w && h) {
      const r = h / w; // invertiert
      window.cropper.setAspectRatio(r);
      ratioLabel.textContent = `Aktuell: ${h}:${w}`;
    } else {
      ratioLabel.textContent = 'Aktuell: frei';
    }
  });

  // Frei (Ratio entsperren)
  freeBtn.addEventListener('click', () => {
    if (!window.cropper) return;
    window.cropper.setAspectRatio(NaN);
    ratioLabel.textContent = 'Aktuell: frei';
    select.value = '0'; // „Frei"
    customContainer.style.display = 'none';
  });

  // **Alles zurücksetzen**: Bild auf Ursprungszustand + freie Ratio + volle Box
  resetBtn.addEventListener('click', () => {
    if (!window.cropper) return;
    // Cropper auf initialen Zustand: Position, Zoom, Rotation, Crop-Box, etc.
    window.cropper.reset();
    // Ratio freigeben & UI synchronisieren
    window.cropper.setAspectRatio(NaN);
    ratioLabel.textContent = 'Aktuell: frei';
    select.value = '0';
    customContainer.style.display = 'none';
  });
}



function openCropper(i) {
  console.log('➡️ openCropper called for index', i);
  currentCropIndex = i;
  const item = images[i];

  cropImageElem.src = item.img.src;

  if (cropper) {
    cropper.destroy();
    cropper = null;
  }

  const CropperCtor = window.Cropper?.Cropper
    || window.Cropper?.default
    || window.Cropper;

  console.log('Using CropperCtor =', CropperCtor);

  // Jetzt sicher eine Instanz bauen
  cropper = new CropperCtor(cropImageElem, {
    viewMode: 1,
    autoCropArea: 0.8,
    responsive: true,
    guides: false,
    ready: function () {
      // Automatische Randerkennung nach dem Laden
      const borderInfo = detectAndRemoveBorders(item);
      if (borderInfo.detected) {
        // Hinweis anzeigen und Crop-Box auf erkannten Bereich setzen
        const scale = cropImageElem.naturalWidth / item.img.width;
        cropper.setData({
          x: borderInfo.left * scale,
          y: borderInfo.top * scale,
          width: borderInfo.width * scale,
          height: borderInfo.height * scale
        });
        // Kurzen Hinweis anzeigen
        showBorderHint();
      }
    }
  });

  // Aspect-Ratio-Presets einblenden
  window.cropper = cropper; // global zugreifbar für die Toolbar-Handler
  setupCropAspectControls();

  // Modal anzeigen
  cropModal.classList.add('open');
}

// Hinweis für erkannte Ränder anzeigen
function showBorderHint() {
  const existing = document.getElementById('border-hint');
  if (existing) existing.remove();

  const hint = document.createElement('div');
  hint.id = 'border-hint';
  hint.className = 'border-hint';
  hint.innerHTML = '🔍 Rand erkannt – Schnittbereich automatisch angepasst';

  const host = cropModal.querySelector('.modal-content') || cropModal;
  host.insertBefore(hint, host.firstChild);

  // Nach 4 Sekunden ausblenden
  setTimeout(() => {
    hint.classList.add('fade-out');
    setTimeout(() => hint.remove(), 500);
  }, 4000);
}


function closeCropper() {
  if (cropper) {
    cropper.destroy();
    cropper = null;
  }
  cropModal.classList.remove('open');
  currentCropIndex = null;
}




function cloneImageItem(srcItem) {
  const baseName = (srcItem.customName ?? srcItem.filename).replace(/\.[^.]+$/, '');

  return {
    ...srcItem,
    img: srcItem.img,
    origWidth: srcItem.origWidth,
    origHeight: srcItem.origHeight,
    width: srcItem.width,
    height: srcItem.height,
    scalePercent: srcItem.scalePercent,
    selected: false,
    customName: baseName + '_copy'
  };
}

function duplicateSelectedImages() {
  const selectedIndexes = images
    .map((item, index) => item.selected ? index : -1)
    .filter(index => index !== -1);

  if (!selectedIndexes.length) return;
  saveUndoState('Ausgewählte Bilder dupliziert');

  let inserted = 0;
  selectedIndexes.forEach(index => {
    if (images.length >= MAX_IMAGES) return;
    images.splice(index + 1 + inserted, 0, cloneImageItem(images[index + inserted]));
    inserted++;
  });

  selectionMode = false;
  images.forEach(item => item.selected = false);
  selectModeBtn.classList.remove('active');
  updateUI();
}

// === Schnitt auf alle anwenden ===
if (btnApplyCropAll) {
  btnApplyCropAll.addEventListener('click', async () => {
    if (!cropper || currentCropIndex === null) return;
    if (images.length <= 1) {
      // Nur ein Bild, normaler Apply
      btnApplyCrop.click();
      return;
    }

    saveUndoState('Schnitt auf alle angewendet');

    // Crop-Daten holen
    const cropData = cropper.getData();
    const aspectRatio = cropper.options.aspectRatio || NaN;

    showSpinner(true);
    let processed = 0;

    for (let i = 0; i < images.length; i++) {
      const item = images[i];

      // Temporäres Canvas für das Croppen erstellen
      const tempCanvas = document.createElement('canvas');
      const tempCtx = tempCanvas.getContext('2d');

      // Proportionales Cropping basierend auf dem originalen Crop
      const scaleX = item.img.width / images[currentCropIndex].img.width;
      const scaleY = item.img.height / images[currentCropIndex].img.height;

      let cropX, cropY, cropW, cropH;

      if (!isNaN(aspectRatio)) {
        // Mit festem Seitenverhältnis: zentrierter Crop
        const imgAspect = item.img.width / item.img.height;
        if (imgAspect > aspectRatio) {
          // Bild ist breiter als Ziel-Verhältnis
          cropH = item.img.height;
          cropW = cropH * aspectRatio;
          cropX = (item.img.width - cropW) / 2;
          cropY = 0;
        } else {
          // Bild ist höher als Ziel-Verhältnis
          cropW = item.img.width;
          cropH = cropW / aspectRatio;
          cropX = 0;
          cropY = (item.img.height - cropH) / 2;
        }
      } else {
        // Freier Crop: proportional skalieren
        cropX = Math.max(0, Math.min(cropData.x * scaleX, item.img.width - 1));
        cropY = Math.max(0, Math.min(cropData.y * scaleY, item.img.height - 1));
        cropW = Math.min(cropData.width * scaleX, item.img.width - cropX);
        cropH = Math.min(cropData.height * scaleY, item.img.height - cropY);
      }

      // Sicherstellen, dass Werte gültig sind
      cropW = Math.max(1, cropW);
      cropH = Math.max(1, cropH);

      tempCanvas.width = cropW;
      tempCanvas.height = cropH;

      tempCtx.drawImage(
        item.img,
        cropX, cropY, cropW, cropH,
        0, 0, cropW, cropH
      );

      // Neues Bild erstellen
      await new Promise((resolve) => {
        const newImg = new Image();
        newImg.onload = () => {
          images[i] = {
            ...item,
            img: newImg,
            origWidth: cropW,
            origHeight: cropH,
            width: cropW,
            height: cropH
          };
          processed++;
          loadBar.value = (processed / images.length) * 100;
          resolve();
        };
        newImg.src = tempCanvas.toDataURL(item.fileType || 'image/png');
      });
    }

    showSpinner(false);
    updateUI();
    closeCropper();
  });
}

// === Automatische Randerkennung (beim Öffnen des Croppers) ===
function detectAndRemoveBorders(item) {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  canvas.width = item.img.width;
  canvas.height = item.img.height;
  ctx.drawImage(item.img, 0, 0);

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;

  // Randfarbe vom ersten Pixel nehmen (oben-links)
  const borderR = data[0];
  const borderG = data[1];
  const borderB = data[2];
  const borderA = data[3];

  // Toleranz für Farbvergleich
  const tolerance = 30;

  function isBorderColor(r, g, b, a) {
    return Math.abs(r - borderR) <= tolerance &&
      Math.abs(g - borderG) <= tolerance &&
      Math.abs(b - borderB) <= tolerance &&
      Math.abs(a - borderA) <= tolerance;
  }

  // Oberen Rand finden
  let top = 0;
  outer: for (let y = 0; y < canvas.height; y++) {
    for (let x = 0; x < canvas.width; x++) {
      const idx = (y * canvas.width + x) * 4;
      if (!isBorderColor(data[idx], data[idx + 1], data[idx + 2], data[idx + 3])) {
        top = y;
        break outer;
      }
    }
  }

  // Unteren Rand finden
  let bottom = canvas.height;
  outer: for (let y = canvas.height - 1; y >= top; y--) {
    for (let x = 0; x < canvas.width; x++) {
      const idx = (y * canvas.width + x) * 4;
      if (!isBorderColor(data[idx], data[idx + 1], data[idx + 2], data[idx + 3])) {
        bottom = y + 1;
        break outer;
      }
    }
  }

  // Linken Rand finden
  let left = 0;
  outer: for (let x = 0; x < canvas.width; x++) {
    for (let y = top; y < bottom; y++) {
      const idx = (y * canvas.width + x) * 4;
      if (!isBorderColor(data[idx], data[idx + 1], data[idx + 2], data[idx + 3])) {
        left = x;
        break outer;
      }
    }
  }

  // Rechten Rand finden
  let right = canvas.width;
  outer: for (let x = canvas.width - 1; x >= left; x--) {
    for (let y = top; y < bottom; y++) {
      const idx = (y * canvas.width + x) * 4;
      if (!isBorderColor(data[idx], data[idx + 1], data[idx + 2], data[idx + 3])) {
        right = x + 1;
        break outer;
      }
    }
  }

  // Prüfen, ob überhaupt ein Rand erkannt wurde
  const hasBorder = (top > 0 || left > 0 || right < canvas.width || bottom < canvas.height);

  if (hasBorder) {
    return {
      detected: true,
      top,
      left,
      width: right - left,
      height: bottom - top
    };
  }

  return { detected: false };
}

// Mobile menu toggle
function setupMobileMenu() {
  const menuToggles = document.querySelectorAll('.menu-toggle');
  const sidebarOverlay = document.getElementById('sidebar-overlay');

  const toggleMenu = () => {
    document.body.classList.toggle('menu-open');
  };

  menuToggles.forEach(btn => {
    btn.addEventListener('click', toggleMenu);
  });

  if (sidebarOverlay) {
    sidebarOverlay.addEventListener('click', toggleMenu);
  }
}

setupMobileMenu();

updateUI();
