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
let currentLayer = 0;
let rotation = 0; // Degrees

const gridSize = 20;

function getVal(id, fallback) {
  const el = document.getElementById(id);
  return el ? el.value : fallback;
}
function getScale() { return parseFloat(getVal("scaleInput", "1")); }
function getUnitMode() { return getVal("unitSelect", "feet-inches"); }
function getColor() { return getVal("colorInput", "#000000"); }
function getThickness() { return parseInt(getVal("thicknessInput", "2")); }
function getRotation() { return parseInt(getVal("rotationInput", "0")); }
function getLayer() { return parseInt(getVal("layerInput", "0")); }

function snap(val) { return Math.round(val / (gridSize / 2)) * (gridSize / 2); }
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

function redraw() {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.setTransform(zoomLevel, 0, 0, zoomLevel, offsetX, offsetY);
  ctx.fillStyle = "#9fc3e9";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  shapes.filter(s => s.layer === currentLayer).forEach(shape => drawShape(shape));
  if (preview && preview.layer === currentLayer) drawShape(preview, true);
}

function drawShape(shape, isPreview = false) {
  ctx.save();
  ctx.translate(shape.x + shape.width / 2, shape.y + shape.height / 2);
  ctx.rotate((shape.rotation || 0) * Math.PI / 180);
  ctx.strokeStyle = shape.color;
  ctx.lineWidth = shape.thickness;
  ctx.setLineDash(isPreview && shape.type === "erase" ? [5, 5] : []);

  if (["line", "room", "door", "window"].includes(shape.type)) {
    if (shape.type === "door") {
      ctx.beginPath();
      ctx.moveTo(-shape.width / 2, -shape.height / 2);
      ctx.arc(-shape.width / 2, shape.height / 2, shape.width, -Math.PI / 2, 0);
      ctx.stroke();
    } else if (shape.type === "window") {
      ctx.beginPath();
      ctx.moveTo(-shape.width / 2, 0);
      ctx.lineTo(shape.width / 2, 0);
      ctx.moveTo(0, -shape.height / 2);
      ctx.lineTo(0, shape.height / 2);
      ctx.stroke();
    } else {
      ctx.strokeRect(-shape.width / 2, -shape.height / 2, shape.width, shape.height);
    }

    if (shape.label) {
      ctx.fillStyle = shape.color;
      ctx.font = "12px Arial";
      ctx.fillText(`${shape.label} (${shape.width} x ${shape.height})`, -shape.width / 2 + 5, -shape.height / 2 - 5);
    }
  } else if (shape.type === "curve" && shape.points) {
    ctx.beginPath();
    ctx.moveTo(shape.points[0].x - shape.x, shape.points[0].y - shape.y);
    ctx.quadraticCurveTo(shape.points[1].x - shape.x, shape.points[1].y - shape.y, shape.points[2].x - shape.x, shape.points[2].y - shape.y);
    ctx.stroke();
  } else if (shape.type === "label") {
    ctx.fillStyle = shape.color;
    ctx.font = "14px Arial";
    ctx.fillText(shape.label, 0, 0);
  }

  ctx.restore();
  ctx.setLineDash([]);
}

