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
function getLabel() { return getVal("labelInput", ""); }

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

function redraw() {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.setTransform(zoomLevel, 0, 0, zoomLevel, offsetX, offsetY);
  ctx.fillStyle = "#9fc3e9";
  ctx.fillRect(0, 0, canvas.width / zoomLevel, canvas.height / zoomLevel);

  for (const shape of shapes) {
    drawShape(shape);
  }
  if (preview) {
    drawShape(preview, true);
  }
}

function drawShape(shape, isPreview = false) {
  ctx.save();
  ctx.strokeStyle = shape.color;
  ctx.lineWidth = shape.thickness / zoomLevel;
  ctx.setLineDash(isPreview ? [4 / zoomLevel, 4 / zoomLevel] : []);
  if (shape.type === "room" || shape.type === "line") {
    ctx.strokeRect(shape.x, shape.y, shape.width, shape.height);
    if (shape.label) {
      ctx.fillStyle = shape.color;
      ctx.font = `${12 / zoomLevel}px Arial`;
      ctx.fillText(`${shape.label} (${shape.width} x ${shape.height})`, shape.x + 5, shape.y - 5);
    }
  } else if (shape.type === "curve") {
    ctx.beginPath();
    ctx.moveTo(shape.points[0].x, shape.points[0].y);
    ctx.quadraticCurveTo(shape.points[1].x, shape.points[1].y, shape.points[2].x, shape.points[2].y);
    ctx.stroke();
  } else if (shape.type === "label") {
    ctx.fillStyle = shape.color;
    ctx.font = `${14 / zoomLevel}px Arial`;
    ctx.fillText(shape.label, shape.x, shape.y);
  }
  ctx.restore();
  ctx.setLineDash([]);
}

canvas.addEventListener("mousedown", (e) => {
  if (e.button === 1) {
    isDraggingCanvas = true;
    dragStart = { x: e.clientX, y: e.clientY };
    return;
  }
  const { x, y } = toCanvasCoords(e);
  const snappedX = snap(x);
  const snappedY = snap(y);

  if (currentMode === "curve") {
    curvePoints.push({ x: snappedX, y: snappedY });
    if (curvePoints.length === 3) {
      saveState();
      shapes.push({
        type: "curve",
        points: [...curvePoints],
        color: getColor(),
        thickness: getThickness(),
        label: getLabel()
      });
      curvePoints = [];
      redraw();
    }
    return;
  }

  if (currentMode === "label") {
    saveState();
    shapes.push({
      type: "label",
      x: snappedX,
      y: snappedY,
      label: getLabel(),
      color: getColor()
    });
    redraw();
    return;
  }

  isDrawing = true;
  startX = snappedX;
  startY = snappedY;
});

canvas.addEventListener("mousemove", (e) => {
  if (isDraggingCanvas) {
    offsetX += e.clientX - dragStart.x;
    offsetY += e.clientY - dragStart.y;
    dragStart = { x: e.clientX, y: e.clientY };
    redraw();
    return;
  }

  if (!isDrawing) return;
  const { x, y } = toCanvasCoords(e);
  const endX = snap(x);
  const endY = snap(y);
  const width = endX - startX;
  const height = endY - startY;

  preview = {
    type: currentMode,
    x: startX,
    y: startY,
    width,
    height,
    color: getColor(),
    thickness: getThickness(),
    label: getLabel()
  };
  redraw();
});

canvas.addEventListener("mouseup", (e) => {
  if (isDraggingCanvas) {
    isDraggingCanvas = false;
    return;
  }

  if (!isDrawing || !preview) return;
  saveState();
  shapes.push({ ...preview });
  preview = null;
  isDrawing = false;
  redraw();
});

canvas.addEventListener("wheel", (e) => {
  e.preventDefault();
  const scaleAmount = 1.1;
  const { x, y } = toCanvasCoords(e);
  if (e.deltaY < 0) {
    zoomLevel *= scaleAmount;
    offsetX -= x * (scaleAmount - 1) * zoomLevel;
    offsetY -= y * (scaleAmount - 1) * zoomLevel;
  } else {
    zoomLevel /= scaleAmount;
    offsetX += x * (1 - 1 / scaleAmount) * zoomLevel;
    offsetY += y * (1 - 1 / scaleAmount) * zoomLevel;
  }
  redraw();
});
