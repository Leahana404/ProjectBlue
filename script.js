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
let offsetX = window.innerWidth / 2;
let offsetY = window.innerHeight / 2;
let curveClicks = 0;
let curveTemp = {};
let isDraggingCanvas = false;
let dragStart = null;
let showLabels = true;

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
  const spacing = baseGridSize / 2;
  return Math.round(val / spacing) * spacing;
}

function toggleLabels() {
  showLabels = !showLabels;
  const button = document.querySelector("button[onclick='toggleLabels()']");
  if (button) {
    button.textContent = showLabels ? "Hide Labels" : "Show Labels";
  }
  redraw();
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
  ctx.strokeStyle = '#c0d8ee';
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
    if (showLabels) {
      ctx.fillStyle = shape.color;
      ctx.font = `${20 / zoomLevel}px Arial`;
      ctx.fillText(shape.label, shape.x, shape.y);
    }
  } else if (shape.type === "erase") {
    ctx.setLineDash([5, 3]);
    ctx.strokeStyle = "red";
    ctx.strokeRect(shape.x, shape.y, shape.width, shape.height);
  }

  ctx.restore();
}function drawLineLabel(x1, y1, x2, y2, color) {
  if (!showLabels) return;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const distance = Math.sqrt(dx * dx + dy * dy);
  const label = formatLength(distance, getScale(), getUnitMode());
  const midX = (x1 + x2) / 2;
  const midY = (y1 + y2) / 2;
  ctx.fillStyle = color;
  ctx.font = `${20 / zoomLevel}px Arial`;
  ctx.fillText(label, midX + 5, midY - 5);
}

function drawRoomLabels(shape) {
  if (!showLabels) return;
  const { x, y, width, height } = shape;
  const scale = getScale();
  const unitMode = getUnitMode();

  const labelTop = formatLength(width, scale, unitMode);
  const labelRight = formatLength(height, scale, unitMode);

  ctx.fillStyle = shape.color || "#000";
  ctx.font = `${20 / zoomLevel}px Arial`;

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

function shapeContains(shape, x, y) {
  if (shape.type === "room") {
    return x >= shape.x && x <= shape.x + shape.width &&
           y >= shape.y && y <= shape.y + shape.height;
  } else if (shape.type === "line") {
    const buffer = 10;
    const dist = pointToSegmentDistance(x, y, shape.x1, shape.y1, shape.x2, shape.y2);
    return dist < buffer;
  }
  return false;
}

function pointToSegmentDistance(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  let t = ((px - x1) * dx + (py - y1) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  const projX = x1 + t * dx;
  const projY = y1 + t * dy;
  return Math.hypot(px - projX, py - projY);
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

function saveDrawing() {
  const name = document.getElementById("saveNameInput").value.trim();
  if (!name) return alert("Please enter a name.");
  const key = "drawing_" + name;
  localStorage.setItem(key, JSON.stringify(shapes));
  updateLoadSelect();
  alert(`Saved drawing "${name}" successfully.`);
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

canvas.addEventListener("contextmenu", (e) => e.preventDefault());
canvas.addEventListener("mousedown", (e) => {
  if (e.button === 1) {
    isDraggingCanvas = true;
    dragStart = { x: e.clientX, y: e.clientY };
    e.preventDefault();
    return;
  }

  const { x, y } = toCanvasCoords(e);

  if (currentMode === "select") {
    selectedShape = null;
    for (let i = shapes.length - 1; i >= 0; i--) {
      const shape = shapes[i];
      if (shapeContains(shape, x, y)) {
        selectedShape = shape;
        if (shape.type === "room") {
          dragOffset.x = x - shape.x;
          dragOffset.y = y - shape.y;
        } else if (shape.type === "line") {
          dragOffset.x = x - shape.x1;
          dragOffset.y = y - shape.y1;
        }
        isDraggingShape = true;
        break;
      }
    }
    redraw();
    return;
  }

  if (e.button !== 0) return;

  isDrawing = true;
  startX = snap(x);
  startY = snap(y);

  if (currentMode === "curve") {
    curveClicks++;
    if (curveClicks === 1) {
      curveTemp.p1 = { x: startX, y: startY };
    } else if (curveClicks === 2) {
      curveTemp.cp = { x: startX, y: startY };
    } else if (curveClicks === 3) {
      curveTemp.p2 = { x: startX, y: startY };
      shapes.push({
        type: "curve",
        p1: curveTemp.p1,
        cp: curveTemp.cp,
        p2: curveTemp.p2,
        color: getColor(),
        thickness: getThickness()
      });
      curveClicks = 0;
      curveTemp = {};
      saveState();
      preview = null;
      isDrawing = false;
      redraw();
    }
  }
});

canvas.addEventListener("mousemove", (e) => {
  if (isDraggingCanvas) {
    const dx = e.clientX - dragStart.x;
    const dy = e.clientY - dragStart.y;
    offsetX += dx;
    offsetY += dy;
    dragStart = { x: e.clientX, y: e.clientY };
    redraw();
    return;
  }

  const { x, y } = toCanvasCoords(e);

  if (isDraggingShape && selectedShape && currentMode === "select") {
    if (selectedShape.type === "room") {
      selectedShape.x = x - dragOffset.x;
      selectedShape.y = y - dragOffset.y;
    } else if (selectedShape.type === "line") {
      const dx = x - dragOffset.x - selectedShape.x1;
      const dy = y - dragOffset.y - selectedShape.y1;
      selectedShape.x1 += dx;
      selectedShape.y1 += dy;
      selectedShape.x2 += dx;
      selectedShape.y2 += dy;
      dragOffset.x = x - selectedShape.x1;
      dragOffset.y = y - selectedShape.y1;
    }
    redraw();
    return;
  }

  if (!isDrawing) return;

  const snappedX = snap(x), snappedY = snap(y);

  if (currentMode === "room") {
    preview = {
      type: "room",
      x: startX,
      y: startY,
      width: snappedX - startX,
      height: snappedY - startY,
      color: getColor(),
      thickness: getThickness()
    };
  } else if (currentMode === "line") {
    preview = {
      type: "line",
      x1: startX,
      y1: startY,
      x2: snappedX,
      y2: snappedY,
      color: getColor(),
      thickness: getThickness()
    };
  } else if (currentMode === "curve" && curveClicks === 2) {
    preview = {
      type: "curve",
      p1: curveTemp.p1,
      cp: curveTemp.cp,
      p2: { x: snappedX, y: snappedY },
      color: getColor(),
      thickness: getThickness()
    };
  } else if (currentMode === "erase") {
    preview = {
      type: "erase",
      x: Math.min(startX, snappedX),
      y: Math.min(startY, snappedY),
      width: Math.abs(snappedX - startX),
      height: Math.abs(snappedY - startY)
    };
  }

  redraw();
});

canvas.addEventListener("mouseup", (e) => {
  if (e.button === 1) {
    isDraggingCanvas = false;
    e.preventDefault();
    return;
  }

  if (isDraggingShape) {
    isDraggingShape = false;
    saveState();
    return;
  }

  if (!isDrawing) return;
  isDrawing = false;

  if (preview && currentMode !== "curve") {
    if (currentMode === "erase") {
      shapes = shapes.filter(s => {
        const px = preview.x, py = preview.y, pw = preview.width, ph = preview.height;
        if (s.type === "room") {
          return !(s.x > px && s.x < px + pw && s.y > py && s.y < py + ph);
        } else if (s.type === "line") {
          return !(s.x1 > px && s.x1 < px + pw && s.y1 > py && s.y1 < py + ph &&
                   s.x2 > px && s.x2 < px + pw && s.y2 > py && s.y2 < py + ph);
        } else if (s.type === "curve") {
          return !(s.p1.x > px && s.p1.x < px + pw && s.p1.y > py && s.p1.y < py + ph &&
                   s.p2.x > px && s.p2.x < px + pw && s.p2.y > py && s.p2.y < py + ph);
        } else if (s.type === "label") {
          return !(s.x > px && s.x < px + pw && s.y > py && s.y < py + ph);
        }
        return true;
      });
    } else {
      shapes.push(preview);
    }
    preview = null;
    saveState();
    redraw();
  }
});
canvas.addEventListener("wheel", (e) => {
  e.preventDefault();
  const zoomFactor = 1.1;
  const mouse = toCanvasCoords(e);
  const prevZoom = zoomLevel;

  if (e.deltaY < 0 && zoomLevel < maxZoom) {
    zoomLevel *= zoomFactor;
  } else if (e.deltaY > 0 && zoomLevel > minZoom) {
    zoomLevel /= zoomFactor;
  }

  const newMouse = toCanvasCoords(e);
  offsetX += (mouse.x - newMouse.x) * zoomLevel;
  offsetY += (mouse.y - newMouse.y) * zoomLevel;

  redraw();
}, { passive: false });

// Disable default right-click menu
canvas.addEventListener("contextmenu", (e) => e.preventDefault());

// Initial load and setup
resizeCanvas();
saveState();
redraw();
updateLoadSelect();

// Redraw on window resize
window.addEventListener("resize", () => {
  resizeCanvas();
  redraw();
});
