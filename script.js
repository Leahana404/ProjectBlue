const canvas = document.getElementById("blueprintCanvas");
const ctx = canvas.getContext("2d");

const devicePixelRatio = window.devicePixelRatio || 1;
const baseGridSize = 20;
const minZoom = 0.2;
const maxZoom = 4;

let zoomLevel = 1;
let offsetX = canvas.width / 2;
let offsetY = canvas.height / 2;

let isDrawing = false;
let startX, startY;
let currentMode = "room";
let preview = null;
let isDraggingCanvas = false;
let dragStart = null;

let curveClicks = 0;
let curveTemp = {};
let shapes = [];
let history = [], future = [];

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

function resizeCanvas() {
  const width = window.innerWidth;
  const height = window.innerHeight;

  canvas.width = width * devicePixelRatio;
  canvas.height = height * devicePixelRatio;
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
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

function setMode(mode) {
  currentMode = mode;
  curveClicks = 0;
  curveTemp = {};
  preview = null;
}

function drawGrid() {
  const spacing = baseGridSize * zoomLevel;
  const width = canvas.width / devicePixelRatio;
  const height = canvas.height / devicePixelRatio;

  ctx.save();
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.scale(devicePixelRatio, devicePixelRatio);
  ctx.translate(offsetX % spacing, offsetY % spacing);
  ctx.beginPath();
  ctx.strokeStyle = '#d0d0ff';
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
  }
  return `${scaled.toFixed(1)}`;
}

function drawShape(shape, isPreview = false) {
  ctx.save();
  ctx.scale(devicePixelRatio, devicePixelRatio);
  ctx.translate(offsetX, offsetY);
  ctx.scale(zoomLevel, zoomLevel);
  ctx.strokeStyle = shape.color || "#000";
  ctx.lineWidth = (shape.thickness || 2) / zoomLevel;

  if (shape.type === "line") {
    ctx.beginPath();
    ctx.moveTo(shape.x1, shape.y1);
    ctx.lineTo(shape.x2, shape.y2);
    ctx.stroke();
    drawLineLabel(shape);

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

function drawLineLabel(shape) {
  const { x1, y1, x2, y2, color } = shape;
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

  const midX = x + width;
  const midY = y + height / 2;

  ctx.save();
  ctx.translate(midX, midY);
  ctx.rotate(Math.PI / 2);
  ctx.fillText(labelRight, 5, -5);
  ctx.restore();
}

function redraw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawGrid();
  shapes.forEach(s => drawShape(s));
  if (preview) drawShape(preview, true);
}

// MOUSE EVENTS
canvas.addEventListener("mousedown", (e) => {
  const pos = toCanvasCoords(e);
  const x = snap(pos.x);
  const y = snap(pos.y);

  if (e.button === 1 || e.button === 2) {
    isDraggingCanvas = true;
    dragStart = { x: e.clientX, y: e.clientY };
    return;
  }

  if (currentMode === "erase") {
    isDrawing = true;
    startX = x;
    startY = y;
    preview = { type: "erase", x, y, width: 0, height: 0 };
    redraw();
    return;
  }

  if (currentMode === "curve") {
    if (curveClicks === 0) {
      curveTemp.p1 = { x, y };
      curveClicks = 1;
    } else if (curveClicks === 1) {
      curveTemp.cp = { x, y };
      curveClicks = 2;
    } else if (curveClicks === 2) {
      curveTemp.p2 = { x, y };
      shapes.push({ type: "curve", ...curveTemp, color: getColor(), thickness: getThickness() });
      saveState();
      curveClicks = 0;
      curveTemp = {};
      preview = null;
      redraw();
    }
    return;
  }

  isDrawing = true;
  startX = x;
  startY = y;
});

canvas.addEventListener("mousemove", (e) => {
  if (isDraggingCanvas) {
    offsetX += e.clientX - dragStart.x;
    offsetY += e.clientY - dragStart.y;
    dragStart = { x: e.clientX, y: e.clientY };
    redraw();
    return;
  }

  if (!isDrawing && currentMode !== "curve") return;

  const pos = toCanvasCoords(e);
  const x = snap(pos.x);
  const y = snap(pos.y);
  const color = getColor();
  const thickness = getThickness();

  if (currentMode === "erase" && isDrawing) {
    const w = x - startX;
    const h = y - startY;
    preview = { type: "erase", x: startX, y: startY, width: w, height: h };
  } else if (currentMode === "line") {
    preview = { type: "line", x1: startX, y1: startY, x2: x, y2: y, color, thickness };
  } else if (currentMode === "room") {
    preview = {
      type: "room",
      x: Math.min(startX, x),
      y: Math.min(startY, y),
      width: Math.abs(x - startX),
      height: Math.abs(y - startY),
      color, thickness
    };
  } else if (currentMode === "curve") {
    if (curveClicks === 1) {
      preview = { type: "curve", p1: curveTemp.p1, cp: { x, y }, p2: { x, y }, color, thickness };
    } else if (curveClicks === 2) {
      preview = { type: "curve", ...curveTemp, p2: { x, y }, color, thickness };
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
      if (s.type === "curve") return true; // adjust if you want to erase curves
      const sx = s.x ?? 0;
      const sy = s.y ?? 0;
      const sw = s.width ?? 0;
      const sh = s.height ?? 0;
      return !(sx >= x && sy >= y && sx <= x + width && sy <= y + height);
    });
    saveState();
  } else if (currentMode !== "curve") {
    shapes.push(preview);
    saveState();
  }

  isDrawing = false;
  preview = null;
  redraw();
});

canvas.addEventListener("dblclick", (e) => {
  const pos = toCanvasCoords(e);
  const text = prompt("Label:");
  if (text) {
    shapes.push({ type: "label", x: pos.x, y: pos.y, label: text, color: getColor(), thickness: 1 });
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

window.addEventListener("load", () => {
  resizeCanvas();
  saveState();
  redraw();
});
