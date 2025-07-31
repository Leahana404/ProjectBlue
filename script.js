const canvas = document.getElementById("blueprintCanvas");
const ctx = canvas.getContext("2d");

const devicePixelRatio = window.devicePixelRatio || 1;

let isDrawing = false;
let startX, startY;
let currentMode = "room";
let shapes = [];
let history = [], future = [];
let preview = null;
let selectionBox = null;
let zoomLevel = 1;
let offsetX = window.innerWidth / 2;
let offsetY = window.innerHeight / 2;
let curveClicks = 0;
let curveTemp = {};
let isDraggingCanvas = false;
let dragStart = null;
let showLabels = true;

let selectedShape = null;
let selectedShapes = [];
let isDraggingShape = false;
let dragOffset = { x: 0, y: 0 };
let currentGroup = [];
let groupedShapes = []; // Array of { id: string, shapes: array of shape refs, locked: bool }

function generateGroupId() {
  return 'group_' + Math.random().toString(36).substr(2, 9);
}
function groupSelectedShapes() {
  if (currentGroup.length < 2) return alert("Select at least two shapes to group.");
  const id = generateGroupId();
  groupedShapes.push({
    id,
    shapes: [...currentGroup],
    locked: false
  });
  selectedShape = null;
  currentGroup = [];
  saveState();
  redraw();
}

function ungroupSelectedShapes() {
  if (currentGroup.length === 0) return;

  groupedShapes = groupedShapes.filter(group => {
    const shared = group.shapes.some(shape => currentGroup.includes(shape));
    return !shared;
  });

  selectedShape = null;
  currentGroup = [];
  saveState();
  redraw();
}

function toggleLockGroup() {
  if (currentGroup.length === 0) return;
  const group = getGroupForShape(currentGroup[0]);
  if (!group) return alert("No group found.");

  group.locked = !group.locked;
  alert(group.locked ? "Group locked." : "Group unlocked.");
  saveState();
  redraw();
}
function isShapeInGroup(shape) {
  return groupedShapes.some(group => group.shapes.includes(shape));
}

function getGroupForShape(shape) {
  return groupedShapes.find(group => group.shapes.includes(shape));
}

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
function toggleLabels() {
  showLabels = !showLabels;
  const button = document.querySelector("button[onclick='toggleLabels()']");
  if (button) button.textContent = showLabels ? "Hide Labels" : "Show Labels";
  redraw();
}

function toCanvasCoords(e) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: (e.clientX - rect.left - offsetX) / zoomLevel,
    y: (e.clientY - rect.top - offsetY) / zoomLevel
  };
}

function groupSelectedShapes() {
  if (currentGroup.length < 2) return alert("Select at least 2 shapes to group.");
  const groupId = generateGroupId();
  groupedShapes.push({ id: groupId, shapes: [...currentGroup], locked: false });
  currentGroup = [];
  redraw();
}

function toggleGroupLock(shape) {
  const group = getGroupForShape(shape);
  if (!group) return alert("Shape is not in a group.");
  group.locked = !group.locked;
  alert(group.locked ? "Group locked." : "Group unlocked.");
  redraw();
}

function setMode(mode) {
  currentMode = mode;
  curveClicks = 0;
  curveTemp = {};
  preview = null;
  selectedShape = null;
  selectedShapes = [];
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
  const spacing = baseGridSize; // Grid spacing stays constant in world space
  const width = canvas.width / zoomLevel;
  const height = canvas.height / zoomLevel;

  ctx.save();
  ctx.beginPath();
  ctx.strokeStyle = "#c0d8ee";
  ctx.lineWidth = 1 / zoomLevel; // thinner lines when zoomed in

  // Calculate starting grid lines using pan offset
  const startX = -offsetX / zoomLevel;
  const startY = -offsetY / zoomLevel;

  const endX = startX + width;
  const endY = startY + height;

  // Draw vertical lines
  for (let x = Math.floor(startX / spacing) * spacing; x < endX; x += spacing) {
    ctx.moveTo(x, startY);
    ctx.lineTo(x, endY);
  }

  // Draw horizontal lines
  for (let y = Math.floor(startY / spacing) * spacing; y < endY; y += spacing) {
    ctx.moveTo(startX, y);
    ctx.lineTo(endX, y);
  }

  ctx.stroke();
  ctx.restore();
}
function redraw() {
  // Reset transform before starting fresh draw
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Translate and scale for pan and zoom
  ctx.translate(offsetX, offsetY);
  ctx.scale(zoomLevel, zoomLevel);

  // Draw grid (grid is in world units, zoom and pan already applied)
  drawGrid();

  // Draw all shapes
  for (let shape of shapes) {
    drawShape(shape);
  }

  // Draw preview shape (if any)
  if (preview) {
    drawShape(preview, true);
  }
}

function drawShape(shape, isPreview = false) {
  ctx.save();
  ctx.translate(offsetX, offsetY);
  ctx.scale(zoomLevel, zoomLevel);
  ctx.strokeStyle = shape.color || "#000";
  ctx.lineWidth = (shape.thickness || 2) / zoomLevel;

  const highlight = (shape === selectedShape || currentGroup.includes(shape)) && currentMode === "select";

  if (highlight) {
    ctx.save();
    ctx.strokeStyle = "#00f";
    ctx.lineWidth = 2 / zoomLevel;
    ctx.setLineDash([4, 2]);

    if (shape.type === "room") {
      ctx.strokeRect(shape.x - 4, shape.y - 4, shape.width + 8, shape.height + 8);
    } else if (shape.type === "line") {
      ctx.beginPath();
      ctx.moveTo(shape.x1 - 4, shape.y1 - 4);
      ctx.lineTo(shape.x2 + 4, shape.y2 + 4);
      ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.restore();
  }

  // Main drawing logic
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
      ctx.font = `${18 / zoomLevel}px Arial`;
      ctx.fillText(shape.label, shape.x, shape.y);
    }
  } else if (shape.type === "erase") {
    ctx.setLineDash([5, 3]);
    ctx.strokeStyle = "red";
    ctx.strokeRect(shape.x, shape.y, shape.width, shape.height);
  }

  ctx.restore();
}
function groupSelected() {
  if (currentGroup.length < 2) return alert("Select at least two shapes to group.");

  const groupId = generateGroupId();
  groupedShapes.push({
    id: groupId,
    shapes: [...currentGroup],
    locked: false
  });
  currentGroup = [];
  selectedShape = null;
  redraw();
  saveState();
}

function ungroupSelected() {
  let changed = false;
  for (let i = groupedShapes.length - 1; i >= 0; i--) {
    const group = groupedShapes[i];
    if (group.shapes.some(s => currentGroup.includes(s))) {
      groupedShapes.splice(i, 1);
      changed = true;
    }
  }
  if (changed) {
    currentGroup = [];
    selectedShape = null;
    redraw();
    saveState();
  } else {
    alert("No group found to ungroup.");
  }
}

function toggleGroupLock() {
  const group = currentGroup.length ? getGroupForShape(currentGroup[0]) : null;
  if (!group) return alert("No group selected.");
  group.locked = !group.locked;
  redraw();
  saveState();
}

function drawLineLabel(x1, y1, x2, y2, color) {
  if (!showLabels) return;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const distance = Math.sqrt(dx * dx + dy * dy);
  const label = formatLength(distance, getScale(), getUnitMode());
  const midX = (x1 + x2) / 2;
  const midY = (y1 + y2) / 2;
  ctx.fillStyle = color;
  ctx.font = `${18 / zoomLevel}px Arial`;
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
  ctx.font = `${18 / zoomLevel}px Arial`;

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

  // Fill background with white
  tempCtx.fillStyle = "#ffffff";
  tempCtx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);

  // Copy drawing to export canvas
  tempCtx.drawImage(canvas, 0, 0);

  const link = document.createElement("a");
  link.download = "blueprint.png";
  link.href = tempCanvas.toDataURL("image/png");
  link.click();
}
canvas.addEventListener("mousedown", (e) => {
  if (e.button === 1) {
    isDraggingCanvas = true;
    dragStart = { x: e.clientX, y: e.clientY };
    e.preventDefault();
    return;
  }

  const { x, y } = toCanvasCoords(e);

  // ✅ Select Mode (with group logic)
  if (currentMode === "select") {
   const { x, y } = toCanvasCoords(e);
  startX = snap(x);
  startY = snap(y);
  selectionBox = {
    x: startX,
    y: startY,
    width: 0,
    height: 0
  };
  isDrawing = true;
  currentGroup = [];
  redraw();
  return;
}


    if (clickedShape) {
      const group = getGroupForShape(clickedShape);
      if (group && group.locked) {
        alert("This group is locked.");
        return;
      }

      selectedShape = clickedShape;

      if (!currentGroup.includes(clickedShape)) {
        currentGroup.push(clickedShape);
      } else {
        currentGroup = currentGroup.filter(s => s !== clickedShape);
      }

      if (clickedShape.type === "room") {
        dragOffset.x = x - clickedShape.x;
        dragOffset.y = y - clickedShape.y;
      } else if (clickedShape.type === "line") {
        dragOffset.x = x - clickedShape.x1;
        dragOffset.y = y - clickedShape.y1;
      }

      isDraggingShape = true;
    } else {
      currentGroup = [];
    }

    redraw();
    return;
  }

  // 🛑 Don't draw if not left-click
  if (e.button !== 0) return;

  isDrawing = true;
  startX = snap(x);
  startY = snap(y);

  // 🎯 Curve drawing phase tracker
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
 if (isDrawing && currentMode === "select") {
  const { x, y } = toCanvasCoords(e);
  const snappedX = snap(x), snappedY = snap(y);

  selectionBox = {
    x: Math.min(startX, snappedX),
    y: Math.min(startY, snappedY),
    width: Math.abs(snappedX - startX),
    height: Math.abs(snappedY - startY)
  };

  redraw();
  return;
}
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

  // ✅ Dragging multiple selected shapes
  if (isDraggingShape && currentGroup.length > 0 && currentMode === "select") {
    for (let shape of currentGroup) {
      if (shape.type === "room") {
        shape.x = x - dragOffset.x;
        shape.y = y - dragOffset.y;
      } else if (shape.type === "line") {
        const dx = x - dragOffset.x - shape.x1;
        const dy = y - dragOffset.y - shape.y1;
        shape.x1 += dx;
        shape.y1 += dy;
        shape.x2 += dx;
        shape.y2 += dy;
        dragOffset.x = x - shape.x1;
        dragOffset.y = y - shape.y1;
      }
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
if (currentMode === "select" && selectionBox) {
  const { x, y, width, height } = selectionBox;
  currentGroup = shapes.filter(s => {
    if (s.type === "room") {
      return s.x >= x && s.x + s.width <= x + width &&
             s.y >= y && s.y + s.height <= y + height;
    } else if (s.type === "line") {
      return s.x1 >= x && s.x1 <= x + width &&
             s.y1 >= y && s.y1 <= y + height &&
             s.x2 >= x && s.x2 <= x + width &&
             s.y2 >= y && s.y2 <= y + height;
    } else if (s.type === "curve") {
      return s.p1.x >= x && s.p1.x <= x + width &&
             s.p1.y >= y && s.p1.y <= y + height &&
             s.p2.x >= x && s.p2.x <= x + width &&
             s.p2.y >= y && s.p2.y <= y + height;
    } else if (s.type === "label") {
      return s.x >= x && s.x <= x + width &&
             s.y >= y && s.y <= y + height;
    }
    return false;
  });

  selectedShape = currentGroup.length === 1 ? currentGroup[0] : null;
  selectionBox = null;
  isDrawing = false;
  redraw();
  return;
}
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

// Disable right-click menu
canvas.addEventListener("contextmenu", (e) => e.preventDefault());

resizeCanvas();
saveState();
redraw();

window.addEventListener("resize", () => {
  resizeCanvas();
  redraw();
});
