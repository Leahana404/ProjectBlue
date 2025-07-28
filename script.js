const canvas = document.getElementById("blueprintCanvas");
const ctx = canvas.getContext("2d");

let isDrawing = false;
let startX, startY;
let currentMode = "room";
let shapes = [];
let zoom = 1;
let panX = 0, panY = 0;
let curvePoints = [];
let preview = null;

const gridSize = 20;

function getScale() {
  return parseFloat(document.getElementById("scaleInput").value) || 1;
}

function getUnitMode() {
  return document.getElementById("unitSelect").value;
}

function getColor() {
  return document.getElementById("colorInput").value;
}

function getThickness() {
  return parseInt(document.getElementById("thicknessInput").value) || 2;
}

function getWindowType() {
  return document.getElementById("windowType")?.value || "fixed";
}

function getDoorType() {
  return document.getElementById("doorType")?.value || "single";
}

function toCanvasCoords(e) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: (e.clientX - rect.left - panX) / zoom,
    y: (e.clientY - rect.top - panY) / zoom,
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
        label: document.getElementById("labelInput").value.trim(),
        color: getColor(),
        thickness: getThickness(),
      });
      curvePoints = [];
      preview = null;
      redraw();
    }
    return;
  }

  isDrawing = true;
  startX = snap(x);
  startY = snap(y);
});

canvas.addEventListener("mousemove", (e) => {
  if (!isDrawing && currentMode !== "curve") return;

  const { x, y } = toCanvasCoords(e);
  const endX = snap(x);
  const endY = snap(y);

  if (currentMode === "curve" && curvePoints.length === 2) {
    preview = {
      type: "curve",
      points: [curvePoints[0], { x: snap(x), y: snap(y) }, curvePoints[1]],
      color: getColor(),
      thickness: getThickness(),
    };
  } else if (isDrawing) {
    preview = {
      type: currentMode,
      x: Math.min(startX, endX),
      y: Math.min(startY, endY),
      width: Math.abs(endX - startX),
      height: Math.abs(endY - startY),
      x2: endX,
      y2: endY,
      label: document.getElementById("labelInput").value.trim(),
      color: getColor(),
      thickness: getThickness(),
      doorType: getDoorType(),
      windowType: getWindowType(),
    };
  }

  redraw();
});

canvas.addEventListener("mouseup", (e) => {
  if (!isDrawing) return;
  const { x, y } = toCanvasCoords(e);
  const endX = snap(x);
  const endY = snap(y);
  const dx = endX - startX;
  const dy = endY - startY;

  if (currentMode === "line") {
    const angle = Math.atan2(dy, dx);
    const snapAngles = [0, Math.PI / 4, Math.PI / 2, (3 * Math.PI) / 4, Math.PI, -(Math.PI / 4), -(Math.PI / 2)];
    const snappedAngle = snapAngles.reduce((a, b) =>
      Math.abs(b - angle) < Math.abs(a - angle) ? b : a
    );
    const length = Math.sqrt(dx * dx + dy * dy);
    const snappedDX = Math.cos(snappedAngle) * length;
    const snappedDY = Math.sin(snappedAngle) * length;

    shapes.push({
      type: "line",
      x: startX,
      y: startY,
      x2: startX + snappedDX,
      y2: startY + snappedDY,
      label: document.getElementById("labelInput").value.trim(),
      color: getColor(),
      thickness: getThickness(),
    });
  } else {
    shapes.push({
      type: currentMode,
      x: Math.min(startX, endX),
      y: Math.min(startY, endY),
      width: Math.abs(endX - startX),
      height: Math.abs(endY - startY),
      label: document.getElementById("labelInput").value.trim(),
      color: getColor(),
      thickness: getThickness(),
      doorType: getDoorType(),
      windowType: getWindowType(),
    });
  }

  isDrawing = false;
  preview = null;
  redraw();
});

function clearCanvas() {
  shapes = [];
  preview = null;
  redraw();
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

function formatDistance(pxLength) {
  const scale = getScale();
  const units = getUnitMode();
  const realLength = pxLength / gridSize * scale;

  if (units === "decimal-feet") return `${realLength.toFixed(2)} ft`;
  if (units === "meters") return `${(realLength * 0.3048).toFixed(2)} m`;

  const feet = Math.floor(realLength);
  const inches = Math.round((realLength - feet) * 12);
  return `${feet}′ ${inches}″`;
}

function drawRotatedLabel(x1, y1, x2, y2, text) {
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const midX = (x1 + x2) / 2;
  const midY = (y1 + y2) / 2;

  ctx.save();
  ctx.translate(midX, midY);
  ctx.rotate(angle);
  ctx.fillStyle = "#333";
  ctx.font = "12px Arial";
  ctx.textAlign = "center";
  ctx.fillText(text, 0, -5);
  ctx.restore();
}

function drawSymbol(shape) {
  ctx.strokeStyle = shape.color;
  ctx.lineWidth = shape.thickness;

  const { x, y, width, height, doorType, windowType } = shape;

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
      ctx.moveTo(x + width * 0.3, y);
      ctx.lineTo(x + width * 0.7, y + height);
      ctx.moveTo(x + width * 0.7, y);
      ctx.lineTo(x + width * 0.3, y + height);
    }
    ctx.stroke();
  }
}

function drawShape(shape) {
  ctx.strokeStyle = shape.color || "#000";
  ctx.lineWidth = shape.thickness || 2;

  if (shape.type === "room") {
    ctx.strokeRect(shape.x, shape.y, shape.width, shape.height);
    const label = shape.label || formatDistance(shape.width);
    ctx.fillStyle = "black";
    ctx.fillText(label, shape.x + 5, shape.y + 15);
  }

  if (shape.type === "line") {
    ctx.beginPath();
    ctx.moveTo(shape.x, shape.y);
    ctx.lineTo(shape.x2, shape.y2);
    ctx.stroke();
    const label = shape.label || formatDistance(
      Math.sqrt((shape.x2 - shape.x) ** 2 + (shape.y2 - shape.y) ** 2)
    );
    drawRotatedLabel(shape.x, shape.y, shape.x2, shape.y2, label);
  }

  if (shape.type === "curve" && shape.points.length === 3) {
    ctx.beginPath();
    const [p1, cp, p2] = shape.points;
    ctx.moveTo(p1.x, p1.y);
    ctx.quadraticCurveTo(cp.x, cp.y, p2.x, p2.y);
    ctx.stroke();
    const label = shape.label || "Curve";
    drawRotatedLabel(p1.x, p1.y, p2.x, p2.y, label);
  }

  if (shape.type === "door" || shape.type === "window") {
    drawSymbol(shape);
  }
}

function redraw() {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.setTransform(zoom, 0, 0, zoom, panX, panY);
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

canvas.addEventListener("wheel", (e) => {
  e.preventDefault();
  const delta = e.deltaY > 0 ? 0.9 : 1.1;
  zoom *= delta;
  zoom = Math.max(0.4, Math.min(3, zoom));
  redraw();
});
  zoom = Math.max(0.4, Math.min(3, zoom));
  redraw();
});
