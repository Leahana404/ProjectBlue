const canvas = document.getElementById("blueprintCanvas");
const ctx = canvas.getContext("2d");

const devicePixelRatio = window.devicePixelRatio || 1;

let isDrawing = false;
let startX, startY;
let currentMode = "room";
let shapes = [];
let history = [], future = [];
let preview = null;
let zoomLevel = 1;
let offsetX = canvas.width / 2;
let offsetY = canvas.height / 2;
let curveClicks = 0;
let curveTemp = {};
let isDraggingCanvas = false;
let dragStart = null;

const baseGridSize = 20;
const minZoom = 0.2;
const maxZoom = 4;

function getVal(id, fallback) {
  const el = document.getElementById(id);
  return el ? el.value : fallback;
}
function getScale() { return parseFloat(getVal("scaleInput", "1")); }
function getUnitMode() { return getVal("unitSelect", "feet-inches"); }
function getColor() { return getVal("colorInput", "#000000"); }
function getThickness() { return parseInt(getVal("thicknessInput", "2")); }

function snap(val) {
  const spacing = baseGridSize / 2;
  return Math.round(val / spacing) * spacing;
}

function toCanvasCoords(e) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: (e.clientX - rect.left - offsetX) / zoomLevel,
    y: (e.clientY - rect.top - offsetY) / zoomLevel
  };
}

function setMode(mode) {
  currentMode = mode;
  curveClicks = 0;
  curveTemp = {};
  preview = null;
}

function saveState() {
  history.push(JSON.stringify(shapes));
  if (history.length > 100) history.shift();
  future = [];
}

function undo() {
  if (history.length === 0) return;
  future.push(JSON.stringify(shapes));
  shapes = JSON.parse(history.pop());
  redraw();
}

function redo() {
  if (future.length === 0) return;
  history.push(JSON.stringify(shapes));
  shapes = JSON.parse(future.pop());
  redraw();
}

function resizeCanvas() {
  const width = window.innerWidth;
  const height = window.innerHeight;
  canvas.width = width * devicePixelRatio;
  canvas.height = height * devicePixelRatio;
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  ctx.scale(devicePixelRatio, devicePixelRatio);
}

function drawGrid() {
  const spacing = baseGridSize * zoomLevel;
  const width = canvas.width;
  const height = canvas.height;
  const startX = -offsetX % spacing;
  const startY = -offsetY % spacing;

  ctx.save();
  ctx.clearRect(0, 0, width, height);
  ctx.translate(offsetX % spacing, offsetY % spacing);
  ctx.beginPath();
  ctx.strokeStyle = '#e0e0e0';
  ctx.lineWidth = 1;

  for (let x = -spacing; x <= width + spacing; x += spacing) {
    ctx.moveTo(x, -spacing);
    ctx.lineTo(x, height + spacing);
  }
  for (let y = -spacing; y <= height + spacing; y += spacing) {
    ctx.moveTo(-spacing, y);
    ctx.lineTo(width + spacing, y);
  }

  ctx.stroke();
  ctx.restore();
}

function redraw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawGrid();
  shapes.forEach(s => drawShape(s));
  if (preview) drawShape(preview, true);
}

function drawShape(shape, isPreview = false) {
  ctx.save();
  ctx.translate(offsetX, offsetY);
  ctx.scale(zoomLevel, zoomLevel);
  ctx.strokeStyle = shape.color || "#000";
  ctx.lineWidth = (shape.thickness || 2) / zoomLevel;

  if (shape.type === "line") {
    ctx.beginPath();
    ctx.moveTo(shape.x1, shape.y1);
    ctx.lineTo(shape.x2, shape.y2);
    ctx.stroke();
    drawLineLabel(shape.x1, shape.y1, shape.x2, shape.y2, shape.color);

  } else if (shape.type === "room") {
    ctx.strokeRect(shape.x, shape.y, shape.width, shape.height);
    drawRoomLabels(shape);

  } else if (shape.type === "curve") {
    ctx.beginPath();
    ctx.moveTo(shape.p1.x, shape.p1.y);
    ctx.quadraticCurveTo(shape.cp.x, shape.cp.y, shape.p2.x, shape.p2.y);
    ctx.stroke();

  } else if (shape.type === "label") {
    ctx.fillStyle = shape.color;
    ctx.font = `${14 / zoomLevel}px Arial`;
    ctx.fillText(shape.label, shape.x, shape.y);

  } else if (shape.type === "erase") {
    ctx.setLineDash([5, 3]);
    ctx.strokeStyle = "red";
    ctx.strokeRect(shape.x, shape.y, shape.width, shape.height);
  }

  ctx.restore();
}

function drawLineLabel(x1, y1, x2, y2, color) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const distance = Math.sqrt(dx * dx + dy * dy);
  const label = formatLength(distance, getScale(), getUnitMode());
  const midX = (x1 + x2) / 2;
  const midY = (y1 + y2) / 2;
  ctx.fillStyle = color;
  ctx.font = `${12 / zoomLevel}px Arial`;
  ctx.fillText(label, midX + 5, midY - 5);
}

function drawRoomLabels(shape) {
  const { x, y, width, height } = shape;
  const scale = getScale();
  const unitMode = getUnitMode();

  const labelTop = formatLength(width, scale, unitMode);
  const labelRight = formatLength(height, scale, unitMode);

  ctx.fillStyle = shape.color || "#000";
  ctx.font = `${12 / zoomLevel}px Arial`;

  ctx.fillText(labelTop, x + width / 2 - ctx.measureText(labelTop).width / 2, y - 5);

  const x1 = x + width;
  const y1 = y;
  const x2 = x + width;
  const y2 = y + height;
  const midX = (x1 + x2) / 2;
  const midY = (y1 + y2) / 2;

  ctx.save();
  ctx.translate(midX, midY);
  ctx.rotate(Math.PI / 2);
  ctx.fillText(labelRight, 5, -5);
  ctx.restore();
}

function formatLength(length, scale, unitMode) {
  const scaled = (length / baseGridSize) * scale;
  if (unitMode === "feet-inches") {
    const feet = Math.floor(scaled);
    const inches = Math.round((scaled - feet) * 12);
    return `${feet}'${inches}"`;
  } else if (unitMode === "decimal-feet") {
    return `${scaled.toFixed(2)} ft`;
  } else if (unitMode === "metric") {
    return `${(scaled * 0.3048).toFixed(2)} m`;
  } else {
    return `${scaled.toFixed(1)}`;
  }
}

// --- Mouse Events ---
canvas.addEventListener("mousedown", (e) => {
  const pos = toCanvasCoords(e);
  const snappedX = snap(pos.x);
  const snappedY = snap(pos.y);

  if (e.button === 2 || e.button === 1) {
    isDraggingCanvas = true;
    dragStart = { x: e.clientX, y: e.clientY };
    return;
  }

  if (currentMode === "erase") {
    isDrawing = true;
    startX = snappedX;
    startY = snappedY;
    preview = { type: "erase", x: startX, y: startY, width: 0, height: 0 };
    redraw();
    return;
  }

  if (currentMode === "curve") {
    if (curveClicks === 0) {
      curveTemp.p1 = { x: snappedX, y: snappedY };
      curveClicks = 1;
    } else if (curveClicks === 1) {
      curveTemp.cp = { x: snappedX, y: snappedY };
      curveClicks = 2;
    } else if (curveClicks === 2) {
      curveTemp.p2 = { x: snappedX, y: snappedY };
      shapes.push({
        type: "curve",
        p1: curveTemp.p1,
        cp: curveTemp.cp,
        p2: curveTemp.p2,
        color: getColor(),
        thickness: getThickness()
      });
      saveState();
      curveClicks = 0;
      curveTemp = {};
      preview = null;
      redraw();
    }
    return;
  }

  isDrawing = true;
  startX = snappedX;
  startY = snappedY;
});

canvas.addEventListener("mousemove", (e) => {
  if (isDraggingCanvas && dragStart) {
    offsetX += e.clientX - dragStart.x;
    offsetY += e.clientY - dragStart.y;
    dragStart = { x: e.clientX, y: e.clientY };
    redraw();
    return;
  }

  if (!isDrawing && currentMode !== "curve") return;

  const pos = toCanvasCoords(e);
  const endX = snap(pos.x);
  const endY = snap(pos.y);
  const color = getColor();
  const thickness = getThickness();

  if (currentMode === "erase" && isDrawing) {
    const x = Math.min(startX, endX);
    const y = Math.min(startY, endY);
    const w = Math.abs(endX - startX);
    const h = Math.abs(endY - startY);
    preview = { type: "erase", x, y, width: w, height: h };

  } else if (currentMode === "line") {
    preview = { type: "line", x1: startX, y1: startY, x2: endX, y2: endY, color, thickness };

  } else if (currentMode === "room") {
    preview = {
      type: "room",
      x: Math.min(startX, endX),
      y: Math.min(startY, endY),
      width: Math.abs(endX - startX),
      height: Math.abs(endY - startY),
      color, thickness
    };

  } else if (currentMode === "curve") {
    if (curveClicks === 1) {
      preview = {
        type: "curve",
        p1: curveTemp.p1,
        cp: { x: endX, y: endY },
        p2: { x: endX, y: endY },
        color, thickness
      };
    } else if (curveClicks === 2) {
      preview = {
        type: "curve",
        p1: curveTemp.p1,
        cp: curveTemp.cp,
        p2: { x: endX, y: endY },
        color, thickness
      };
    }
  }

  redraw();
});

canvas.addEventListener("mouseup", () => {
  if (isDraggingCanvas) {
    isDraggingCanvas = false;
    return;
  }

  if (!isDrawing || !preview) return;

  if (currentMode === "erase") {
    const { x, y, width, height } = preview;
    shapes = shapes.filter(s => {
      if (s.type === "curve") return true; // can expand later
      const sx = s.x ?? 0;
      const sy = s.y ?? 0;
      const sw = s.width ?? 0;
      const sh = s.height ?? 0;
      return !(sx >= x && sy >= y && sx + sw <= x + width && sy + sh <= y + height);
    });
    saveState();
  } else if (currentMode !== "curve") {
    shapes.push(preview);
    saveState();
  }

  preview = null;
  isDrawing = false;
  redraw();
});

canvas.addEventListener("dblclick", (e) => {
  const pos = toCanvasCoords(e);
  const text = prompt("Enter label text:");
  if (text) {
    shapes.push({
      type: "label",
      x: pos.x,
      y: pos.y,
      label: text,
      color: getColor(),
      thickness: 1
    });
    saveState();
    redraw();
  }
});

canvas.addEventListener("wheel", (e) => {
  e.preventDefault();
  const zoomFactor = 1.1;
  const mouse = toCanvasCoords(e);

  const delta = e.deltaY < 0 ? zoomFactor : 1 / zoomFactor;
  const newZoom = Math.min(maxZoom, Math.max(minZoom, zoomLevel * delta));

  const wx = (mouse.x * zoomLevel + offsetX);
  const wy = (mouse.y * zoomLevel + offsetY);

  zoomLevel = newZoom;

  offsetX = wx - mouse.x * zoomLevel;
  offsetY = wy - mouse.y * zoomLevel;

  redraw();
});

canvas.addEventListener("contextmenu", (e) => e.preventDefault());

resizeCanvas();
saveState();
redraw();

// === SAVE/LOAD/DOWNLOAD FEATURES ===

function downloadPNG() {
  const exportCanvas = document.createElement("canvas");
  exportCanvas.width = canvas.width;
  exportCanvas.height = canvas.height;
  const exportCtx = exportCanvas.getContext("2d");

  exportCtx.fillStyle = "#ffffff";
  exportCtx.fillRect(0, 0, exportCanvas.width, exportCanvas.height);
  exportCtx.drawImage(canvas, 0, 0);

  const link = document.createElement("a");
  link.download = "blueprint.png";
  link.href = exportCanvas.toDataURL();
  link.click();
}

function saveToLocal() {
  localStorage.setItem("blueprint_shapes", JSON.stringify(shapes));
  alert("Blueprint saved locally!");
}

function loadFromLocal() {
  const data = localStorage.getItem("blueprint_shapes");
  if (data) {
    shapes = JSON.parse(data);
    saveState();
    redraw();
    alert("Loaded from local storage.");
  } else {
    alert("No saved drawing found.");
  }
}

function downloadJSON() {
  const dataStr = JSON.stringify(shapes, null, 2);
  const blob = new Blob([dataStr], { type: "application/json" });
  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");
  link.download = "blueprint.json";
  link.href = url;
  link.click();

  URL.revokeObjectURL(url);
}

function loadFromFile(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      shapes = JSON.parse(e.target.result);
      saveState();
      redraw();
      alert("Drawing loaded.");
    } catch (err) {
      alert("Invalid JSON file.");
    }
  };
  reader.readAsText(file);
}
