const canvas = document.getElementById("blueprintCanvas");
const ctx = canvas.getContext("2d");

let isDrawing = false;
let startX, startY;
let currentMode = "room";
let shapes = [];
let history = [], future = [];
let preview = null;
let curvePoints = [];
let zoomLevel = 1;
let offsetX = 0, offsetY = 0;
let dragStart = null;
let isDraggingCanvas = false;

const gridSize = 20;

function getVal(id, fallback) {
  const el = document.getElementById(id);
  return el ? el.value : fallback;
}
function getScale() { return parseFloat(getVal("scaleInput", "1")); }
function getUnitMode() { return getVal("unitSelect", "feet-inches"); }
function getColor() { return getVal("colorInput", "#000000"); }
function getThickness() { return parseInt(getVal("thicknessInput", "2")); }
function getRotation() { return parseFloat(getVal("rotationInput", "0")); }

function snap(val) {
  return Math.round(val / (gridSize / 2)) * (gridSize / 2);
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
  curvePoints = [];
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

function formatDimensions(w, h, scale, unitMode) {
  const sw = w * scale;
  const sh = h * scale;
  if (unitMode === "feet-inches") {
    const fw = Math.floor(sw);
    const iw = Math.round((sw - fw) * 12);
    const fh = Math.floor(sh);
    const ih = Math.round((sh - fh) * 12);
    return `${fw}'${iw}\" x ${fh}'${ih}\"`;
  } else if (unitMode === "decimal-feet") {
    return `${sw.toFixed(2)}ft x ${sh.toFixed(2)}ft`;
  } else if (unitMode === "metric") {
    return `${(sw * 0.3048).toFixed(2)}m x ${(sh * 0.3048).toFixed(2)}m`;
  } else {
    return `${sw.toFixed(1)} x ${sh.toFixed(1)}`;
  }
}

function drawLineLabel(x1, y1, x2, y2, color) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const distance = Math.sqrt(dx * dx + dy * dy);
  const label = formatDimensions(distance, 0, getScale(), getUnitMode());
  const midX = (x1 + x2) / 2;
  const midY = (y1 + y2) / 2;
  ctx.fillStyle = color;
  ctx.font = `${12 / zoomLevel}px Arial`;
  ctx.fillText(label, midX + 5, midY - 5);
}

function drawDoor(x, y, width, height, rotation, color) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate((rotation * Math.PI) / 180);
  ctx.strokeStyle = color;
  ctx.lineWidth = 2 / zoomLevel;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(width, 0);
  ctx.arc(0, 0, width, 0, Math.PI / 2);
  ctx.stroke();
  ctx.restore();
  saveState();
}

function drawWindow(x, y, width, height, rotation, color) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate((rotation * Math.PI) / 180);
  ctx.strokeStyle = color;
  ctx.lineWidth = 2 / zoomLevel;
  ctx.beginPath();
  ctx.arc(0, 0, width, Math.PI, 0);
  ctx.stroke();
  ctx.restore();
  saveState();
}

canvas.addEventListener("mousedown", (e) => {
  const pos = toCanvasCoords(e);
  if (currentMode === "erase") {
    isDrawing = true;
    startX = pos.x;
    startY = pos.y;
    preview = { type: "erase", x: startX, y: startY, width: 0, height: 0 };
    redraw();
  }
});

canvas.addEventListener("mousemove", (e) => {
  if (!isDrawing || currentMode !== "erase") return;
  const pos = toCanvasCoords(e);
  const x = Math.min(startX, pos.x);
  const y = Math.min(startY, pos.y);
  const w = Math.abs(pos.x - startX);
  const h = Math.abs(pos.y - startY);
  preview = { type: "erase", x, y, width: w, height: h };
  redraw();
});

canvas.addEventListener("mouseup", () => {
  if (currentMode === "erase" && isDrawing && preview) {
    const { x, y, width, height } = preview;
    shapes = shapes.filter(s => {
      if (s.type === "curve") return true;
      const sx = s.x ?? 0;
      const sy = s.y ?? 0;
      const sw = s.width ?? 0;
      const sh = s.height ?? 0;
      return !(sx >= x && sy >= y && sx <= x + width && sy <= y + height);
    });
    saveState();
    preview = null;
    isDrawing = false;
    redraw();
  }
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
