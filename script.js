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
let layers = { default: true };

const gridSize = 20;

function getVal(id, fallback) {
  const el = document.getElementById(id);
  return el ? el.value : fallback;
}
function getScale() { return parseFloat(getVal("scaleInput", "1")); }
function getUnitMode() { return getVal("unitSelect", "feet-inches"); }
function getColor() { return getVal("colorInput", "#000000"); }
function getThickness() { return parseInt(getVal("thicknessInput", "2")); }

function snap(val) { return Math.round(val / (gridSize / 2)) * (gridSize / 2); }
function toCanvasCoords(e) {
  const rect = canvas.getBoundingClientRect();
  return { x: (e.clientX - rect.left) / zoomLevel, y: (e.clientY - rect.top) / zoomLevel };
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
function zoom(amount) {
  zoomLevel *= amount;
  zoomLevel = Math.max(0.1, Math.min(zoomLevel, 5));
  redraw();
}

canvas.addEventListener("mousedown", (e) => {
  const { x, y } = toCanvasCoords(e);
  const snappedX = snap(x);
  const snappedY = snap(y);

  if (currentMode === "curve") {
    curvePoints.push({ x: snappedX, y: snappedY });
    if (curvePoints.length === 3) {
      saveState();
      shapes.push({ type: "curve", points: [...curvePoints], color: getColor(), thickness: getThickness(), label: getVal("labelInput", "") });
      curvePoints = [];
      redraw();
    }
    return;
  }

  if (currentMode === "erase") {
    const hit = shapes.findLastIndex(s => ctx.isPointInPath(buildPath(s), snappedX, snappedY));
    if (hit !== -1) {
      saveState();
      shapes.splice(hit, 1);
      redraw();
    }
    return;
  }

  isDrawing = true;
  startX = snappedX;
  startY = snappedY;
});

canvas.addEventListener("mousemove", (e) => {
  if (!isDrawing) return;
  const { x, y } = toCanvasCoords(e);
  const endX = snap(x);
  const endY = snap(y);
  preview = {
    type: currentMode,
    x: Math.min(startX, endX),
    y: Math.min(startY, endY),
    width: Math.abs(endX - startX),
    height: Math.abs(endY - startY),
    x2: endX,
    y2: endY,
    color: getColor(),
    thickness: getThickness(),
    label: getVal("labelInput", "")
  };
  redraw();
});

canvas.addEventListener("mouseup", () => {
  if (preview && currentMode !== "curve" && currentMode !== "erase") {
    saveState();
    shapes.push({ ...preview });
  }
  isDrawing = false;
  preview = null;
  redraw();
});

function buildPath(shape) {
  const path = new Path2D();
  if (shape.type === "room" || shape.type === "window") {
    path.rect(shape.x, shape.y, shape.width, shape.height);
  } else if (shape.type === "line") {
    path.moveTo(shape.x, shape.y);
    path.lineTo(shape.x2, shape.y2);
  } else if (shape.type === "curve" && shape.points.length === 3) {
    const [p1, cp, p2] = shape.points;
    path.moveTo(p1.x, p1.y);
    path.quadraticCurveTo(cp.x, cp.y, p2.x, p2.y);
  } else if (shape.type === "door") {
    path.arc(shape.x, shape.y, shape.width, 0, Math.PI / 2);
  }
  return path;
}

function drawGrid() {
  ctx.strokeStyle = "#eee";
  ctx.lineWidth = 1;
  for (let x = 0; x < canvas.width / zoomLevel; x += gridSize) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, canvas.height / zoomLevel);
    ctx.stroke();
  }
  for (let y = 0; y < canvas.height / zoomLevel; y += gridSize) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(canvas.width / zoomLevel, y);
    ctx.stroke();
  }
}

function drawLabel(text, x, y) {
  if (!text) return;
  ctx.fillStyle = "#000";
  ctx.font = "12px Arial";
  ctx.fillText(text, x, y);
}

function drawShape(shape) {
  ctx.strokeStyle = shape.color;
  ctx.lineWidth = shape.thickness;
  if (shape.type === "room" || shape.type === "window") {
    ctx.strokeRect(shape.x, shape.y, shape.width, shape.height);
    drawLabel(shape.label, shape.x + 5, shape.y + 15);
  }
  if (shape.type === "line") {
    ctx.beginPath();
    ctx.moveTo(shape.x, shape.y);
    ctx.lineTo(shape.x2, shape.y2);
    ctx.stroke();
    drawLabel(formatDistance(Math.abs(shape.x2 - shape.x)), (shape.x + shape.x2) / 2, (shape.y + shape.y2) / 2);
  }
  if (shape.type === "curve" && shape.points?.length === 3) {
    const [p1, cp, p2] = shape.points;
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.quadraticCurveTo(cp.x, cp.y, p2.x, p2.y);
    ctx.stroke();
  }
  if (shape.type === "door") {
    ctx.beginPath();
    ctx.arc(shape.x, shape.y, shape.width, 0, Math.PI / 2);
    ctx.stroke();
  }
  if (shape.type === "label") {
    drawLabel(shape.label, shape.x, shape.y);
  }
}

function formatDistance(pixels) {
  const real = (pixels / gridSize) * getScale();
  const mode = getUnitMode();
  if (mode === "decimal-feet") return `${real.toFixed(2)} ft`;
  if (mode === "meters") return `${(real * 0.3048).toFixed(2)} m`;
  const ft = Math.floor(real);
  const inches = Math.round((real - ft) * 12);
  return `${ft}′ ${inches}″`;
}

function redraw() {
  ctx.setTransform(zoomLevel, 0, 0, zoomLevel, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawGrid();
  shapes.forEach(drawShape);
  if (preview) drawShape(preview);
}

function clearCanvas() {
  saveState();
  shapes = [];
  redraw();
}

function downloadImage() {
  const tempCanvas = document.createElement("canvas");
  tempCanvas.width = canvas.width;
  tempCanvas.height = canvas.height;
  const tempCtx = tempCanvas.getContext("2d");
  tempCtx.fillStyle = "white";
  tempCtx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);
  shapes.forEach(shape => {
    ctx.save();
    drawShape.call({ ctx: tempCtx }, shape);
    ctx.restore();
  });
  const link = document.createElement("a");
  link.download = "blueprint.png";
  link.href = tempCanvas.toDataURL();
  link.click();
}

function saveLayout() {
  const blob = new Blob([JSON.stringify(shapes)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "blueprint.json";
  a.click();
}

function loadLayout() {
  document.getElementById("loadInput").click();
}

document.getElementById("loadInput").addEventListener("change", function (e) {
  const file = e.target.files[0];
  const reader = new FileReader();
  reader.onload = function (event) {
    shapes = JSON.parse(event.target.result);
    redraw();
  };
  reader.readAsText(file);
});
