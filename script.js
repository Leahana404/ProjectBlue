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

canvas.addEventListener("mousedown", (e) => {
  const { x, y } = toCanvasCoords(e);
  const snappedX = snap(x);
  const snappedY = snap(y);

  if (e.button === 1) { // Middle mouse for pan
    isDraggingCanvas = true;
    dragStart = { x: e.clientX - offsetX, y: e.clientY - offsetY };
    return;
  }

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
    isDrawing = true;
    startX = snappedX;
    startY = snappedY;
    return;
  }

  isDrawing = true;
  startX = snappedX;
  startY = snappedY;
});

canvas.addEventListener("mousemove", (e) => {
  if (isDraggingCanvas) {
    offsetX = e.clientX - dragStart.x;
    offsetY = e.clientY - dragStart.y;
    redraw();
    return;
  }
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

canvas.addEventListener("mouseup", (e) => {
  if (isDraggingCanvas) {
    isDraggingCanvas = false;
    return;
  }

  if (preview && currentMode === "erase") {
    saveState();
    const eraseBox = preview;
    shapes = shapes.filter(s => {
      const path = buildPath(s);
      return !ctx.isPointInPath(path, eraseBox.x, eraseBox.y) &&
             !ctx.isPointInPath(path, eraseBox.x + eraseBox.width, eraseBox.y + eraseBox.height);
    });
    preview = null;
    redraw();
    return;
  }

  if (preview && currentMode !== "curve") {
    saveState();
    shapes.push({ ...preview });
  }
  isDrawing = false;
  preview = null;
  redraw();
});

canvas.addEventListener("wheel", (e) => {
  e.preventDefault();
  const delta = e.deltaY < 0 ? 1.1 : 0.9;
  zoomLevel *= delta;
  zoomLevel = Math.max(0.1, Math.min(zoomLevel, 10));
  redraw();
});
  };
  reader.readAsText(file);
});
