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

let selectedShape = null;
let isDraggingShape = false;
let dragOffset = { x: 0, y: 0 };

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
  selectedShape = null;
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
  ctx.setTransform(1, 0, 0, 1, 0, 0); // Reset
  ctx.scale(devicePixelRatio, devicePixelRatio);
}

function drawGrid() {
  const spacing = baseGridSize * zoomLevel;
  const width = canvas.width / devicePixelRatio;
  const height = canvas.height / devicePixelRatio;

  ctx.save();
  ctx.translate(offsetX % spacing, offsetY % spacing);
  ctx.beginPath();
  ctx.strokeStyle = '#e0e0e0';
  ctx.lineWidth = 1;

  for (let x = -spacing; x < width + spacing; x += spacing) {
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
  }

  for (let y = -spacing; y < height + spacing; y += spacing) {
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
  }

  ctx.stroke();
  ctx.restore();
}

function redraw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawGrid();
  shapes.forEach(s => drawShape(s));
  if (selectedShape) drawShape(selectedShape, true);
  if (preview) drawShape(preview, true);
}

function drawShape(shape, isPreview = false) {
  ctx.save();
  ctx.translate(offsetX, offsetY);
  ctx.scale(zoomLevel, zoomLevel);
  ctx.strokeStyle = shape.color || "#000";
  ctx.lineWidth = (shape.thickness || 2) / zoomLevel;

  if (shape === selectedShape) {
    ctx.setLineDash([5, 3]);
    ctx.strokeStyle = "blue";
  }

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

function downloadImage() {
  const tempCanvas = document.createElement("canvas");
  const tempCtx = tempCanvas.getContext("2d");

  tempCanvas.width = canvas.width;
  tempCanvas.height = canvas.height;

  tempCtx.fillStyle = "#ffffff";
  tempCtx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);
  tempCtx.drawImage(canvas, 0, 0);

  const link = document.createElement("a");
  link.download = "blueprint.png";
  link.href = tempCanvas.toDataURL("image/png");
  link.click();
}

function updateLoadSelect() {
  const loadSelect = document.getElementById("loadSelect");
  const keys = Object.keys(localStorage).filter(k => k.startsWith("drawing_"));
  loadSelect.innerHTML = `<option value="">Select a saved drawing</option>`;
  keys.forEach(key => {
    const name = key.replace("drawing_", "");
    const option = document.createElement("option");
    option.value = name;
    option.textContent = name;
    loadSelect.appendChild(option);
  });
}

function saveDrawing() {
  const name = document.getElementById("saveNameInput").value.trim();
  if (!name) return alert("Please enter a name.");

  const key = "drawing_" + name;
  localStorage.setItem(key, JSON.stringify(shapes));

  updateLoadSelect();
  alert(`Saved drawing "${name}" successfully.`);
}

function loadDrawing() {
  const name = document.getElementById("loadSelect").value;
  if (!name) return alert("Select a drawing to load.");
  const data = localStorage.getItem("drawing_" + name);
  if (!data) return alert("Not found.");
  shapes = JSON.parse(data);
  document.getElementById("saveNameInput").value = name;
  saveState();
  redraw();
}

canvas.addEventListener("contextmenu", (e) => e.preventDefault());
resizeCanvas();
saveState();
redraw();
updateLoadSelect();
