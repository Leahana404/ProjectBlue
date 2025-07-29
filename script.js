const canvas = document.getElementById("blueprintCanvas");
const ctx = canvas.getContext("2d");

let shapes = [], preview = null;
let history = [], future = [];
let isDrawing = false;
let startX, startY;
let currentMode = "room";
let curveClicks = 0, curveTemp = {};
let isDraggingCanvas = false, dragStart = null;

const baseGridSize = 20;
let zoomLevel = 1;
let offsetX = canvas.width / 2;
let offsetY = canvas.height / 2;
const minZoom = 0.2;
const maxZoom = 4;

const DPR = window.devicePixelRatio || 1;

// ----- INIT -----
function resizeCanvas() {
  const w = window.innerWidth;
  const h = window.innerHeight - 40;
  canvas.width = w * DPR;
  canvas.height = h * DPR;
  canvas.style.width = w + "px";
  canvas.style.height = h + "px";
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.scale(DPR, DPR);
  redraw();
}

window.addEventListener("resize", resizeCanvas);
resizeCanvas();

// ----- UTILITIES -----
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

// ----- MODES -----
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

// ----- DRAWING -----
function drawGrid() {
  const spacing = baseGridSize * zoomLevel;
  const w = canvas.width / DPR;
  const h = canvas.height / DPR;

  ctx.save();
  ctx.clearRect(0, 0, w, h);
  ctx.translate(offsetX % spacing, offsetY % spacing);
  ctx.beginPath();
  ctx.strokeStyle = '#e0e0e0';
  ctx.lineWidth = 1;

  for (let x = -spacing; x <= w + spacing; x += spacing) {
    ctx.moveTo(x, -spacing);
    ctx.lineTo(x, h + spacing);
  }

  for (let y = -spacing; y <= h + spacing; y += spacing) {
    ctx.moveTo(-spacing, y);
    ctx.lineTo(w + spacing, y);
  }

  ctx.stroke();
  ctx.restore();
}

function redraw() {
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
  }

  else if (shape.type === "room") {
    ctx.strokeRect(shape.x, shape.y, shape.width, shape.height);
    drawRoomLabels(shape);
  }

  else if (shape.type === "curve") {
    ctx.beginPath();
    ctx.moveTo(shape.p1.x, shape.p1.y);
    ctx.quadraticCurveTo(shape.cp.x, shape.cp.y, shape.p2.x, shape.p2.y);
    ctx.stroke();
  }

  else if (shape.type === "label") {
    ctx.fillStyle = shape.color;
    ctx.font = `${14 / zoomLevel}px Arial`;
    ctx.fillText(shape.label, shape.x, shape.y);
  }

  else if (shape.type === "erase") {
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

  const midX = x + width + 5;
  const midY = y + height / 2;
  ctx.save();
  ctx.translate(midX, midY);
  ctx.rotate(Math.PI / 2);
  ctx.fillText(labelRight, 0, 0);
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

// ----- EVENTS -----
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
      preview = { type: "curve", p1: curveTemp.p1, cp: { x: endX, y: endY }, p2: { x: endX, y: endY }, color, thickness };
    } else if (curveClicks === 2) {
      preview = { type: "curve", p1: curveTemp.p1, cp: curveTemp.cp, p2: { x: endX, y: endY }, color, thickness };
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
      if (s.type === "curve") {
        const inside = (p) => p.x >= x && p.x <= x + width && p.y >= y && p.y <= y + height;
        return !(inside(s.p1) && inside(s.cp) && inside(s.p2));
      } else {
        const sx = s.x ?? 0, sy = s.y ?? 0, sw = s.width ?? 0, sh = s.height ?? 0;
        return !(sx >= x && sx + sw <= x + width && sy >= y && sy + sh <= y + height);
      }
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

function downloadImage() {
  const tempCanvas = document.createElement("canvas");
  tempCanvas.width = canvas.width;
  tempCanvas.height = canvas.height;
  const tempCtx = tempCanvas.getContext("2d");
  tempCtx.fillStyle = "#ffffff";
  tempCtx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);
  tempCtx.drawImage(canvas, 0, 0);
  const link = document.createElement("a");
  link.download = "blueprint.png";
  link.href = tempCanvas.toDataURL("image/png");
  link.click();
}

// Initialize
saveState();
redraw();
