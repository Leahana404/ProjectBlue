const canvas = document.getElementById("blueprintCanvas");
const ctx = canvas.getContext("2d");

let isDrawing = false;
let startX, startY;
let currentMode = "room";
let shapes = [];
let preview = null;
let curvePoints = [];

const gridSize = 20;

function getVal(id, fallback) {
  const el = document.getElementById(id);
  return el ? el.value : fallback;
}

function getScale() {
  return parseFloat(getVal("scaleInput", "1"));
}
function getUnitMode() {
  return getVal("unitSelect", "feet-inches");
}
function getColor() {
  return getVal("colorInput", "#000000");
}
function getThickness() {
  return parseInt(getVal("thicknessInput", "2"));
}
function getWindowType() {
  return getVal("windowType", "fixed");
}
function getDoorType() {
  return getVal("doorType", "single");
}

function toCanvasCoords(e) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: (e.clientX - rect.left),
    y: (e.clientY - rect.top),
  };
}

function snap(val) {
  return Math.round(val / gridSize) * gridSize;
}

function setMode(mode) {
  currentMode = mode;
  curvePoints = [];
  preview = null;
}

canvas.addEventListener("mousedown", (e) => {
  const { x, y } = toCanvasCoords(e);
  if (currentMode === "curve") {
    curvePoints.push({ x: snap(x), y: snap(y) });
    if (curvePoints.length === 3) {
      shapes.push({
        type: "curve",
        points: [...curvePoints],
        color: getColor(),
        thickness: getThickness(),
        label: getVal("labelInput", ""),
      });
      curvePoints = [];
      redraw();
    }
    return;
  }

  isDrawing = true;
  startX = snap(x);
  startY = snap(y);
});

canvas.addEventListener("mousemove", (e) => {
  if (!isDrawing) return;
  const { x, y } = toCanvasCoords(e);
  const endX = snap(x);
  const endY = snap(y);
  const width = Math.abs(endX - startX);
  const height = Math.abs(endY - startY);
  const xStart = Math.min(startX, endX);
  const yStart = Math.min(startY, endY);

  preview = {
    type: currentMode,
    x: xStart,
    y: yStart,
    x2: endX,
    y2: endY,
    width,
    height,
    color: getColor(),
    thickness: getThickness(),
    label: getVal("labelInput", ""),
    doorType: getDoorType(),
    windowType: getWindowType(),
  };

  redraw();
});

canvas.addEventListener("mouseup", () => {
  if (!preview) return;
  if (currentMode !== "curve") shapes.push({ ...preview });
  isDrawing = false;
  preview = null;
  redraw();
});

function clearCanvas() {
  shapes = [];
  redraw();
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

function drawGrid() {
  ctx.strokeStyle = "#eee";
  for (let x = 0; x < canvas.width; x += gridSize) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, canvas.height);
    ctx.stroke();
  }
  for (let y = 0; y < canvas.height; y += gridSize) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(canvas.width, y);
    ctx.stroke();
  }
}

function drawSymbol(shape) {
  const { x, y, width, height, doorType, windowType } = shape;
  ctx.strokeStyle = shape.color;
  ctx.lineWidth = shape.thickness;

  if (shape.type === "door") {
    ctx.beginPath();
    if (doorType === "single") {
      ctx.moveTo(x, y);
      ctx.arc(x, y, width, 0, Math.PI / 2);
    } else if (doorType === "double") {
      ctx.moveTo(x, y);
      ctx.arc(x, y, width / 2, 0, Math.PI / 2);
      ctx.moveTo(x + width, y);
      ctx.arc(x + width, y, width / 2, Math.PI, Math.PI * 1.5);
    }
    ctx.stroke();
  }

  if (shape.type === "window") {
    ctx.beginPath();
    if (windowType === "fixed") {
      ctx.moveTo(x + width * 0.3, y);
      ctx.lineTo(x + width * 0.3, y + height);
      ctx.moveTo(x + width * 0.7, y);
      ctx.lineTo(x + width * 0.7, y + height);
    } else if (windowType === "sliding") {
      ctx.moveTo(x + width * 0.2, y);
      ctx.lineTo(x + width * 0.8, y + height);
      ctx.moveTo(x + width * 0.8, y);
      ctx.lineTo(x + width * 0.2, y + height);
    }
    ctx.stroke();
  }
}

function drawShape(shape) {
  ctx.strokeStyle = shape.color;
  ctx.lineWidth = shape.thickness;

  if (shape.type === "room") {
    ctx.strokeRect(shape.x, shape.y, shape.width, shape.height);
    ctx.fillStyle = "#000";
    ctx.fillText(shape.label || formatDistance(shape.width), shape.x + 5, shape.y + 15);
  }

  if (shape.type === "line") {
    ctx.beginPath();
    ctx.moveTo(shape.x, shape.y);
    ctx.lineTo(shape.x2, shape.y2);
    ctx.stroke();
  }

  if (shape.type === "curve" && shape.points?.length === 3) {
    ctx.beginPath();
    const [p1, cp, p2] = shape.points;
    ctx.moveTo(p1.x, p1.y);
    ctx.quadraticCurveTo(cp.x, cp.y, p2.x, p2.y);
    ctx.stroke();
  }

  if (shape.type === "door" || shape.type === "window") {
    drawSymbol(shape);
  }
}

function redraw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawGrid();
  shapes.forEach(drawShape);
  if (preview) drawShape(preview);
}

function downloadImage() {
  const link = document.createElement("a");
  link.download = "blueprint.png";
  link.href = canvas.toDataURL();
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
  zoom = Math.max(0.4, Math.min(3, zoom));
  redraw();
});
