const canvas = document.getElementById("blueprintCanvas");
const ctx = canvas.getContext("2d");

let isDrawing = false;
let startX = 0, startY = 0;
let currentMode = "room";
let shapes = [];
let preview = null;

const gridSize = 20;

function getVal(id, fallback) {
  const el = document.getElementById(id);
  return el ? el.value : fallback;
}

function snap(val) {
  return Math.round(val / gridSize) * gridSize;
}

function setMode(mode) {
  currentMode = mode;
  preview = null;
}

canvas.addEventListener("mousedown", (e) => {
  const rect = canvas.getBoundingClientRect();
  startX = snap(e.clientX - rect.left);
  startY = snap(e.clientY - rect.top);
  isDrawing = true;
});

canvas.addEventListener("mousemove", (e) => {
  if (!isDrawing) return;
  const rect = canvas.getBoundingClientRect();
  const endX = snap(e.clientX - rect.left);
  const endY = snap(e.clientY - rect.top);
  preview = {
    type: currentMode,
    x: Math.min(startX, endX),
    y: Math.min(startY, endY),
    width: Math.abs(endX - startX),
    height: Math.abs(endY - startY)
  };
  redraw();
});

canvas.addEventListener("mouseup", () => {
  if (preview) shapes.push(preview);
  isDrawing = false;
  preview = null;
  redraw();
});

function drawSymbol(shape) {
  const { x, y, width, height } = shape;
  ctx.beginPath();
  if (shape.type === "door") {
    ctx.arc(x, y, width, 0, Math.PI / 2);
  } else if (shape.type === "window") {
    ctx.moveTo(x + width * 0.3, y);
    ctx.lineTo(x + width * 0.3, y + height);
    ctx.moveTo(x + width * 0.7, y);
    ctx.lineTo(x + width * 0.7, y + height);
  }
  ctx.stroke();
}

function drawShape(shape) {
  ctx.strokeStyle = "#000";
  ctx.lineWidth = 2;

  if (shape.type === "room" || shape.type === "line") {
    ctx.strokeRect(shape.x, shape.y, shape.width, shape.height);
  } else if (shape.type === "door" || shape.type === "window") {
    drawSymbol(shape);
  }
}

function redraw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  for (let shape of shapes) drawShape(shape);
  if (preview) drawShape(preview);
}
