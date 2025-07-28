const canvas = document.getElementById("blueprintCanvas");
const ctx = canvas.getContext("2d");

let isDrawing = false;
let startX, startY;
let currentMode = "room";
let shapes = [];
let preview = null;
let curvePoints = [];

const gridSize = 20;

// Utility Functions
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
function snap(val) {
  return Math.round(val / gridSize) * gridSize;
}
function toCanvasCoords(e) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: (e.clientX - rect.left),
    y: (e.clientY - rect.top),
  };
}
function setMode(mode) {
  currentMode = mode;
  curvePoints = [];
  preview = null;
}

// Drawing Logic
canvas.addEventListener("mousedown", (e) => {
  const { x, y } = toCanvasCoords(e);
  const snappedX = snap(x);
  const snappedY = snap(y);

  if (currentMode === "curve") {
    curvePoints.push({ x: snappedX, y: snappedY });
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
  startX = snappedX;
  startY = snappedY;
});

canvas.addEventListener("mousemove", (e) => {
  if (!isDrawing) return;
  const { x, y } = toCanvasCoords(e);
  const snappedX = snap(x);
  const snappedY = snap(y);

  preview = {
    type: currentMode,
    x: Math.min(startX, snappedX),
    y: Math.min(startY, snappedY),
    width: Math.abs(snappedX - startX),
    height: Math.abs(snappedY - startY),
    color: getColor(),
    thickness: getThickness(),
    label: getVal("labelInput", "")
  };

  if (currentMode === "line") {
    preview.x2 = snappedX;
    preview.y2 = snappedY;
  }

  redraw();
});

canvas.addEventListener("mouseup", () => {
  if (preview && currentMode !== "curve") {
    shapes.push({ ...preview });
  }
  isDrawing = false;
  preview = null;
  redraw();
});

// Redraw Everything
function redraw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawGrid();
  shapes.forEach(drawShape);
  if (preview) drawShape(preview);
}

function drawGrid() {
  ctx.strokeStyle = "#eee";
  ctx.lineWidth = 1;
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

function formatDistance(pixels) {
  const real = (pixels / gridSize) * getScale();
  const mode = getUnitMode();
  if (mode === "decimal-feet") return `${real.toFixed(2)} ft`;
  if (mode === "meters") return `${(real * 0.3048).toFixed(2)} m`;
  const ft = Math.floor(real);
  const inches = Math.round((real - ft) * 12);
  return `${ft}′ ${inches}″`;
}

// Draw Individual Shapes
function drawShape(shape) {
  ctx.strokeStyle = shape.color;
  ctx.lineWidth = shape.thickness;

  if (shape.type === "room") {
    ctx.strokeRect(shape.x, shape.y, shape.width, shape.height);
    drawLabel(shape.label, shape.x + 5, shape.y + 15);
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

  if (shape.type === "door") {
    ctx.beginPath();
    ctx.arc(shape.x, shape.y, shape.width, 0, Math.PI / 2);
    ctx.stroke();
  }

  if (shape.type === "window") {
    ctx.beginPath();
    ctx.moveTo(shape.x + shape.width * 0.3, shape.y);
    ctx.lineTo(shape.x + shape.width * 0.3, shape.y + shape.height);
    ctx.moveTo(shape.x + shape.width * 0.7, shape.y);
    ctx.lineTo(shape.x + shape.width * 0.7, shape.y + shape.height);
    ctx.stroke();
  }
}

function drawLabel(text, x, y) {
  if (!text) return;
  ctx.fillStyle = "#000";
  ctx.font = "12px Arial";
  ctx.fillText(text, x, y);
}

// Utility Buttons
function clearCanvas() {
  shapes = [];
  preview = null;
  redraw();
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
