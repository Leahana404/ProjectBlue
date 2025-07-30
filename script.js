const canvas = document.getElementById("blueprintCanvas");
const ctx = canvas.getContext("2d");

const devicePixelRatio = window.devicePixelRatio || 1;

let isDrawing = false;
let startX, startY;
let currentMode = "room";
let shapes = [];
let history = [], future = [];
let preview = null;
let zoomLevel = 0.5;
let offsetX = window.innerWidth / 2;
let offsetY = window.innerHeight / 2;
let curveClicks = 0;
let curveTemp = {};
let isDraggingCanvas = false;
let dragStart = null;
let selectedShape = null;

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
  ctx.setTransform(1, 0, 0, 1, 0, 0);
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
  if (preview) drawShape(preview, true);
}

function drawShape(shape, isPreview = false) {
  ctx.save();
  ctx.translate(offsetX, offsetY);
  ctx.scale(zoomLevel, zoomLevel);
  ctx.strokeStyle = shape.color || "#000";
  ctx.lineWidth = (shape.thickness || 2) / zoomLevel;

  if (shape === selectedShape) {
    ctx.save();
    ctx.strokeStyle = "#00f";
    ctx.lineWidth = 2 / zoomLevel;
    if (shape.type === "room") {
      ctx.strokeRect(shape.x - 4, shape.y - 4, shape.width + 8, shape.height + 8);
    } else if (shape.type === "line") {
      ctx.beginPath();
      ctx.moveTo(shape.x1 - 4, shape.y1 - 4);
      ctx.lineTo(shape.x2 + 4, shape.y2 + 4);
      ctx.stroke();
    }
    ctx.restore();
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
// Mouse event handling
function onMouseDown(e) {
  if (e.button !== 0) return;

  const pos = toCanvasCoords(e);
  isDrawing = true;
  startX = snap(pos.x);
  startY = snap(pos.y);

  if (currentMode === "eraser") {
    preview = {
      type: "erase",
      x: startX,
      y: startY,
      width: 0,
      height: 0,
    };
  } else if (currentMode === "label") {
    const text = prompt("Enter label text:");
    if (!text) return;
    const shape = {
      type: "label",
      x: startX,
      y: startY,
      label: text,
      color: getColor(),
    };
    shapes.push(shape);
    saveState();
    redraw();
  } else if (currentMode === "curve") {
    if (curveClicks === 0) {
      curveTemp.p1 = { x: startX, y: startY };
      curveClicks = 1;
    } else if (curveClicks === 1) {
      curveTemp.cp = { x: startX, y: startY };
      curveClicks = 2;
    } else if (curveClicks === 2) {
      curveTemp.p2 = { x: startX, y: startY };
      const shape = {
        type: "curve",
        p1: curveTemp.p1,
        cp: curveTemp.cp,
        p2: curveTemp.p2,
        color: getColor(),
        thickness: getThickness(),
      };
      shapes.push(shape);
      curveClicks = 0;
      curveTemp = {};
      saveState();
      redraw();
    }
  }
}

function onMouseMove(e) {
  const pos = toCanvasCoords(e);
  const x = snap(pos.x);
  const y = snap(pos.y);

  if (!isDrawing) return;

  if (currentMode === "line") {
    preview = {
      type: "line",
      x1: startX,
      y1: startY,
      x2: x,
      y2: y,
      color: getColor(),
      thickness: getThickness(),
    };
  } else if (currentMode === "room") {
    preview = {
      type: "room",
      x: Math.min(x, startX),
      y: Math.min(y, startY),
      width: Math.abs(x - startX),
      height: Math.abs(y - startY),
      color: getColor(),
      thickness: getThickness(),
    };
  } else if (currentMode === "eraser") {
    preview.width = x - preview.x;
    preview.height = y - preview.y;
  }

  redraw();
}

function onMouseUp(e) {
  if (!isDrawing) return;
  isDrawing = false;

  if (preview && (currentMode === "line" || currentMode === "room")) {
    shapes.push(preview);
    saveState();
  } else if (currentMode === "eraser" && preview) {
    const { x, y, width, height } = preview;
    shapes = shapes.filter((s) => {
      if (s.type === "label") return true;
      const sx = s.x || s.x1 || 0;
      const sy = s.y || s.y1 || 0;
      return (
        sx < x || sx > x + width || sy < y || sy > y + height
      );
    });
    saveState();
  }

  preview = null;
  redraw();
}
