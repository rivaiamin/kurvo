// @ts-nocheck
import paper from 'paper';
import { useEffect, useRef } from 'react';
import { useEditor } from '../context/EditorContext';

const CATMULL_FACTOR = 0.5;

/**
 * Paper.js `smooth()` recalculates curves and can reset or replace `segment.data`.
 * Snapshot `data` (cusp, pressure, etc.) before smoothing, merge back after, then apply cusp corners.
 */
function smoothSkeleton(skel: paper.Path) {
  const preservedData = skel.segments.map((s) => (s.data && typeof s.data === 'object' ? { ...s.data } : {}));
  skel.smooth({ type: 'catmull-rom', factor: CATMULL_FACTOR });
  for (let i = 0; i < skel.segments.length; i++) {
    const seg = skel.segments[i];
    const saved = preservedData[i];
    if (saved && Object.keys(saved).length > 0) {
      seg.data = seg.data || {};
      Object.assign(seg.data, saved);
    }
    if (seg.data?.cusp) {
      seg.smooth = false;
      seg.handleIn = new paper.Point(0, 0);
      seg.handleOut = new paper.Point(0, 0);
    }
  }
  // Force curve / length rebuild so getCurves() and sampling match edited handles (cusps).
  skel._curves = undefined;
  skel._length = undefined;
}

function dedupePolyline(points: paper.Point[], eps: number, closed: boolean) {
  const out: paper.Point[] = [];
  for (const p of points) {
    if (out.length === 0 || p.getDistance(out[out.length - 1]) > eps) out.push(p);
  }
  if (closed && out.length > 2 && out[0].getDistance(out[out.length - 1]) < eps) {
    out.pop();
  }
  return out;
}

/** Merge skeleton anchors into flattened samples so every edit node lies on the ribbon centerline. */
function offsetAlongSkeleton(skel: paper.Path, pt: paper.Point) {
  let o = skel.getOffsetOf(pt);
  if (o != null) return o;
  const loc = skel.getNearestLocation(pt);
  return loc ? loc.getOffset() : 0;
}

function mergeAnchorsIntoPolyline(poly: paper.Point[], skel: paper.Path, eps: number, closed: boolean) {
  const merged = poly.map((p) => p.clone());
  for (let i = 0; i < skel.segments.length; i++) {
    const p = skel.segments[i].point;
    if (!merged.some((q) => q.getDistance(p) < eps * 2)) merged.push(p.clone());
  }
  merged.sort((a, b) => offsetAlongSkeleton(skel, a) - offsetAlongSkeleton(skel, b));
  return dedupePolyline(merged, eps * 0.5, closed);
}

function polylineVertexNormal(i: number, poly: paper.Point[], closed: boolean) {
  const n = poly.length;
  const prev = closed ? poly[(i - 1 + n) % n] : i > 0 ? poly[i - 1] : null;
  const curr = poly[i];
  const next = closed ? poly[(i + 1) % n] : i < n - 1 ? poly[i + 1] : null;
  if (prev && next) {
    const eIn = curr.subtract(prev);
    const eOut = next.subtract(curr);
    let bis = eIn.normalize().add(eOut.normalize());
    if (bis.getLength() < 1e-10) bis = eOut.clone();
    else bis = bis.normalize();
    return new paper.Point(-bis.y, bis.x).normalize();
  }
  if (next && !prev) {
    const e = next.subtract(curr);
    return e.getLength() < 1e-10 ? null : new paper.Point(-e.y, e.x).normalize();
  }
  if (prev && !next) {
    const e = curr.subtract(prev);
    return e.getLength() < 1e-10 ? null : new paper.Point(-e.y, e.x).normalize();
  }
  return null;
}

function replaceRibbonWithBooleanResult(group: paper.Group, result: paper.Item | null, oldRibbon: paper.Path) {
  const fill = oldRibbon.fillColor;
  oldRibbon.remove();
  if (!result || result.isEmpty()) {
    group.remove();
    return;
  }
  result.name = 'ribbon';
  result.fillColor = fill;
  if (result instanceof paper.Path) {
    result.closed = true;
  } else if (result instanceof paper.CompoundPath) {
    result.fillColor = fill;
  }
  group.insertChild(0, result);
}

export function usePaperEngine(canvasRef: React.RefObject<HTMLCanvasElement | null>) {
  const { activeTool, currentColor, isAnimating, brushSize, projectRef, setCurrentColor, saveHistory, initHistory, bumpProjectRevision, bumpSelectionRevision } = useEditor();

  const stateRef = useRef({ activeTool, currentColor, isAnimating, brushSize });

  useEffect(() => {
    stateRef.current = { activeTool, currentColor, isAnimating, brushSize };
  }, [activeTool, currentColor, isAnimating, brushSize]);

  useEffect(() => {
    if (!canvasRef.current) return;

    paper.setup(canvasRef.current);
    projectRef.current = paper.project;

    const syncViewSize = () => {
      const canvas = canvasRef.current;
      if (!canvas || !paper.view) return;
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (w > 0 && h > 0) {
        paper.view.viewSize = new paper.Size(w, h);
      }
    };
    syncViewSize();
    const resizeObserver = new ResizeObserver(() => {
      syncViewSize();
    });
    resizeObserver.observe(canvasRef.current);
    const drawLayer = paper.project.activeLayer;
    const referenceLayer = new paper.Layer({ name: '__reference' });
    referenceLayer.sendToBack();
    const uiLayer = new paper.Layer({ name: '__ui' });
    drawLayer.activate();

    const bringUiToFront = () => {
      const ui = paper.project.layers.find((l) => l.name === '__ui');
      if (ui) ui.bringToFront();
    };

    const addReferenceImageFromUrl = (url: string) => {
      const prevActive = paper.project.activeLayer;
      referenceLayer.activate();
      const raster = new paper.Raster(url);
      const revokeIfBlob = () => {
        if (typeof url === 'string' && url.startsWith('blob:')) URL.revokeObjectURL(url);
      };
      raster.onLoad = () => {
        const view = paper.view;
        const maxDim = Math.max(view.viewSize.width, view.viewSize.height) * 0.85;
        const rw = raster.width;
        const rh = raster.height;
        const scale = rw > 0 && rh > 0 ? Math.min(1, maxDim / Math.max(rw, rh)) : 1;
        const g = new paper.Group({ data: { isReference: true } });
        g.addChild(raster);
        raster.position = new paper.Point(0, 0);
        if (scale !== 1) raster.scale(scale);
        g.position = view.center;
        g.opacity = 0.65;
        if (prevActive && prevActive !== referenceLayer) prevActive.activate();
        else drawLayer.activate();
        revokeIfBlob();
        saveHistory();
        bumpProjectRevision();
        bumpSelectionRevision();
        bringUiToFront();
      };
      raster.onError = () => {
        revokeIfBlob();
      };
    };
    (window as any).addReferenceImageFromUrl = addReferenceImageFromUrl;

    initHistory();
    bumpProjectRevision();

    const tool = new paper.Tool();
    let transformBox: paper.Group | null = null;
    let transformAction: string | null = null;
    let scalePivot: paper.Point | null = null;
    const currentGroupRef = { current: null as paper.Group | null };
    const activeSelectionRef = { current: null as paper.Group | null };

    const freestyleGroupRef = { current: null as paper.Group | null };
    let lastFreestylePoint: paper.Point | null = null;
    let freestyleLen = 0;
    let freestyleWave = {
      base: 1,
      amp1: 0.25,
      amp2: 0.06,
      w1: 0.06,
      w2: 0.02,
      p1: 0,
      p2: 0
    };

    let hoverIndicator = new paper.Path.Circle({
      center: [-1000, -1000],
      radius: 6,
      strokeColor: '#3b82f6',
      strokeWidth: 2,
      unselectable: true,
      opacity: 0
    });
    hoverIndicator.data = { isHoverNode: true };
    uiLayer.addChild(hoverIndicator);
    uiLayer.locked = true;

    let draggedSegment: paper.Segment | null = null;
    let dragStartPressure = 1;
    let dragStartX = 0;
    let lastDrawClickTime = 0;
    let lastEditClick = { time: 0, segment: null as paper.Segment | null };

    let editsMade = false;

    let eraserDragStart: paper.Point | null = null;
    let eraserPreview: paper.Path | null = null;

    const updateRibbon = (group: paper.Group) => {
      const skeleton = group.children['skeleton'] as paper.Path;
      const ribbon = group.children['ribbon'] as paper.Path;
      const capStart = group.children['capStart'] as paper.Path;
      const capEnd = group.children['capEnd'] as paper.Path;

      if (!skeleton || skeleton.segments.length < 2) return;

      skeleton._curves = undefined;
      skeleton._length = undefined;

      const pathLen = skeleton.length;
      if (pathLen === 0) return;

      const closed = !!skeleton.closed;
      const baseWidth = skeleton.data.baseWidth || 4;

      /**
       * Build centerline from Paper's flattener (matches rendered curve geometry, including cusps).
       * Curve-by-curve getLocationAt sampling can desync from handles; flatten follows the true outline.
       * Anchor merge guarantees every skeleton node lies on the ribbon centerline.
       */
      const work = skeleton.clone({ insert: false });
      work.flatten(0.16);
      let poly = work.segments.map((s: paper.Segment) => s.point.clone());
      work.remove();

      poly = mergeAnchorsIntoPolyline(poly, skeleton, 0.35, closed);
      if (poly.length < 2) return;

      const left: paper.Point[] = [];
      const right: paper.Point[] = [];

      for (let i = 0; i < poly.length; i++) {
        const pt = poly[i];
        const nl = skeleton.getNearestLocation(pt);
        if (!nl) continue;

        const crv = nl.getCurve();
        let pressure = 1;
        if (crv) {
          const p1 = crv.getSegment1().data?.pressure ?? 1;
          const p2 = crv.getSegment2().data?.pressure ?? 1;
          pressure = p1 + (p2 - p1) * nl.getParameter();
        }
        const width = baseWidth * pressure;

        let normal = nl.getNormal();
        let usedPaperNormal = !!(normal && !normal.isZero());
        if (!usedPaperNormal) {
          const t = nl.getTangent();
          if (t && !t.isZero()) normal = t.rotate(90);
        }
        if (!normal || normal.isZero()) {
          normal = polylineVertexNormal(i, poly, closed);
          usedPaperNormal = false;
        }
        if (!normal || normal.isZero()) continue;

        if (!usedPaperNormal) {
          const refTan = nl.getTangent();
          if (refTan && !refTan.isZero()) {
            const leftOf = refTan.rotate(90);
            if (normal.dot(leftOf) < 0) normal = normal.negate();
          }
        }

        left.push(pt.add(normal.multiply(width)));
        right.push(pt.subtract(normal.multiply(width)));
      }

      if (left.length < 2) return;

      ribbon.segments = [...left, ...right.reverse()];

      const hideCaps = closed;
      capStart.opacity = hideCaps ? 0 : 1;
      capEnd.opacity = hideCaps ? 0 : 1;

      const pFirst = skeleton.firstSegment.point;
      const rFirst = baseWidth * (skeleton.firstSegment.data?.pressure ?? 1);
      capStart.position = pFirst;
      capStart.scaling = new paper.Point(rFirst, rFirst);

      const pLast = skeleton.lastSegment.point;
      const rLast = baseWidth * (skeleton.lastSegment.data?.pressure ?? 1);
      capEnd.position = pLast;
      capEnd.scaling = new paper.Point(rLast, rLast);
    };

    const clearPaperSelection = () => {
      if (transformBox) {
        transformBox.remove();
        transformBox = null;
      }
      if (paper.project) {
        paper.project.getItems({ name: 'skeleton' }).forEach((item) => (item.selected = false));
      }
      activeSelectionRef.current = null;
      bumpSelectionRevision();
    };
    (window as any).clearPaperSelection = clearPaperSelection;
    (window as any).getActiveStrokeGroup = () => activeSelectionRef.current;

    const drawTransformBox = (group: paper.Group) => {
      if (transformBox) transformBox.remove();
      if (!group) return;

      const bounds = group.bounds;
      const boxColor = '#3b82f6';

      const box = new paper.Path.Rectangle(bounds);
      box.strokeColor = boxColor;
      box.strokeWidth = 1.5;
      box.dashArray = [4, 4];

      transformBox = new paper.Group([box]);
      transformBox.data = { isTransformBox: true };

      const createHandle = (point: paper.Point, name: string) => {
        const handle = new paper.Path.Rectangle({
          point: [point.x - 4, point.y - 4],
          size: [8, 8],
          fillColor: '#ffffff',
          strokeColor: boxColor,
          strokeWidth: 1.5
        });
        handle.data = { isHandle: true, type: name };
        transformBox!.addChild(handle);
      };

      createHandle(bounds.topLeft, 'tl');
      createHandle(bounds.topRight, 'tr');
      createHandle(bounds.bottomLeft, 'bl');
      createHandle(bounds.bottomRight, 'br');

      const topCenter = bounds.topCenter;
      const rotLine = new paper.Path.Line(topCenter, new paper.Point(topCenter.x, topCenter.y - 25));
      rotLine.strokeColor = boxColor;
      const rotHandle = new paper.Path.Circle(new paper.Point(topCenter.x, topCenter.y - 25), 5);
      rotHandle.fillColor = '#ffffff';
      rotHandle.strokeColor = boxColor;
      rotHandle.data = { isHandle: true, type: 'rotate' };

      transformBox.addChild(rotLine);
      transformBox.addChild(rotHandle);
    };

    const selectReferenceGroupById = (id: number) => {
      const item = paper.project.getItem({ id });
      let group: paper.Group | null = null;
      if (item instanceof paper.Group && item.data?.isReference) group = item;
      else if (item?.parent instanceof paper.Group && item.parent.data?.isReference) group = item.parent;
      if (!group || group.layer !== referenceLayer) return;
      clearPaperSelection();
      activeSelectionRef.current = group;
      drawTransformBox(group);
      transformAction = 'move';
      bumpSelectionRevision();
      bringUiToFront();
    };
    (window as any).selectReferenceGroupById = selectReferenceGroupById;

    tool.onMouseDown = (event: paper.ToolEvent) => {
      if (stateRef.current.isAnimating) return;

      const mode = stateRef.current.activeTool;
      const color = stateRef.current.currentColor;
      const brushSize = stateRef.current.brushSize;

      if (mode === 'eraser') {
        eraserDragStart = event.point.clone();
        return;
      }

      if (mode === 'freestyle') {
        // Freestyle uses the SAME stroke tech as `draw` (skeleton+ribbon), just sampled continuously.
        clearPaperSelection();
        currentGroupRef.current = null; // don't accidentally continue a click-to-add draw stroke

        const group = new paper.Group({ data: { isStroke: true } });
        const skeleton = new paper.Path({ name: 'skeleton', strokeColor: '#000000', opacity: 0.01, selected: true });
        skeleton.data = { baseWidth: brushSize };

        const ribbon = new paper.Path({ name: 'ribbon', fillColor: color, closed: true });
        const capStart = new paper.Path.Circle({ center: [0, 0], radius: 1, fillColor: color, name: 'capStart', applyMatrix: false });
        const capEnd = new paper.Path.Circle({ center: [0, 0], radius: 1, fillColor: color, name: 'capEnd', applyMatrix: false });

        group.addChildren([ribbon, capStart, capEnd, skeleton]);
        activeSelectionRef.current = group;
        freestyleGroupRef.current = group;

        skeleton.add(event.point);
        if (skeleton.lastSegment) {
          skeleton.lastSegment.data = skeleton.lastSegment.data || {};
          // Emulated pressure: smooth long-wave so nearby nodes stay similar.
          skeleton.lastSegment.data.pressure = 1;
        }
        lastFreestylePoint = event.point.clone();
        freestyleLen = 0;
        // Randomize the "feel" per stroke, but keep it smooth within the stroke.
        freestyleWave = {
          base: 1,
          amp1: 0.22 + Math.random() * 0.18,
          amp2: 0.06 + Math.random() * 0.14,
          // angular frequency per project-unit distance (scaled by zoom sampling later)
          w1: 0.055 + Math.random() * 0.04,
          w2: 0.032 + Math.random() * 0.02,
          p1: Math.random() * Math.PI * 2,
          p2: Math.random() * Math.PI * 2
        };
        smoothSkeleton(skeleton);
        updateRibbon(group);
        editsMade = true;
        bringUiToFront();
        return;
      }

      let isDrawDoubleClick = false;
      if (mode === 'draw') {
        const now = Date.now();
        isDrawDoubleClick = now - lastDrawClickTime < 300;
        lastDrawClickTime = now;
      }

      if (mode === 'draw') {
        if (isDrawDoubleClick) {
          currentGroupRef.current = null;
          clearPaperSelection();
          return;
        }

        if (currentGroupRef.current && currentGroupRef.current.parent) {
          const skel = currentGroupRef.current.children['skeleton'] as paper.Path;
          if (!skel.closed && skel.segments.length >= 3) {
            const first = skel.firstSegment.point;
            const threshold = 12 / paper.view.zoom;
            if (event.point.getDistance(first) < threshold) {
              skel.closed = true;
              currentGroupRef.current.data.closed = true;
              smoothSkeleton(skel);
              updateRibbon(currentGroupRef.current);
              currentGroupRef.current = null;
              clearPaperSelection();
              editsMade = true;
              return;
            }
          }
        }

        if (!currentGroupRef.current || !currentGroupRef.current.parent) {
          const group = new paper.Group({ data: { isStroke: true } });
          const skeleton = new paper.Path({ name: 'skeleton', strokeColor: '#000000', opacity: 0.01, selected: true });
          skeleton.data = { baseWidth: brushSize };

          const ribbon = new paper.Path({ name: 'ribbon', fillColor: color, closed: true });
          const capStart = new paper.Path.Circle({ center: [0, 0], radius: 1, fillColor: color, name: 'capStart', applyMatrix: false });
          const capEnd = new paper.Path.Circle({ center: [0, 0], radius: 1, fillColor: color, name: 'capEnd', applyMatrix: false });

          group.addChildren([ribbon, capStart, capEnd, skeleton]);
          currentGroupRef.current = group;
          activeSelectionRef.current = group;
        }

        const skel = currentGroupRef.current.children['skeleton'] as paper.Path;
        skel.add(event.point);
        const seg = skel.lastSegment;

        if (seg) {
          seg.data = seg.data || {};
          seg.data.pressure = 1;
        }

        smoothSkeleton(skel);
        updateRibbon(currentGroupRef.current);
        editsMade = true;
      }

      if (mode === 'edit' || mode === 'pressure' || mode === 'select') {
        const hitOptions = {
          segments: true,
          stroke: true,
          fill: true,
          tolerance: 10,
          match: (result: paper.HitResult) => result.item !== hoverIndicator
        };
        const hitFull = paper.project.hitTest(event.point, hitOptions);

        if (mode === 'select' && hitFull) {
          if (hitFull.item.data && hitFull.item.data.isHandle) {
            transformAction = hitFull.item.data.type;
            const bounds = activeSelectionRef.current!.bounds;
            if (transformAction === 'tl') scalePivot = bounds.bottomRight;
            if (transformAction === 'tr') scalePivot = bounds.bottomLeft;
            if (transformAction === 'bl') scalePivot = bounds.topRight;
            if (transformAction === 'br') scalePivot = bounds.topLeft;
            return;
          }
          if (hitFull.item.parent && hitFull.item.parent.data?.isTransformBox) {
            transformAction = 'move';
            return;
          }
        }

        const hitResult =
          mode === 'select' && event.modifiers.alt ? referenceLayer.hitTest(event.point, hitOptions) : hitFull;

        if (hitResult && hitResult.item !== hoverIndicator) {
          const item = hitResult.item;
          let group: paper.Group | null = null;
          if (item instanceof paper.Group && (item.data?.isStroke || item.data?.isReference || item.data?.isFreestyle)) {
            group = item;
          } else if (item.parent instanceof paper.Group && (item.parent.data?.isStroke || item.parent.data?.isReference || item.parent.data?.isFreestyle)) {
            group = item.parent as paper.Group;
          }

          if (group && group.data && group.data.isStroke) {
            let removeNodeOnEditDoubleClick = false;
            if (mode === 'edit' && hitResult.type === 'segment' && hitResult.item.name === 'skeleton') {
              const now = Date.now();
              const seg = hitResult.segment;
              if (lastEditClick.segment === seg && now - lastEditClick.time < 300) {
                removeNodeOnEditDoubleClick = true;
              }
              lastEditClick = { time: now, segment: seg };
            } else if (mode === 'edit') {
              lastEditClick = { time: 0, segment: null };
            }

            if (activeSelectionRef.current !== group) {
              clearPaperSelection();
              activeSelectionRef.current = group;
              setCurrentColor((group.children['ribbon'].fillColor as paper.Color).toCSS(true));
            }

            if (mode === 'select') {
              drawTransformBox(group);
              transformAction = 'move';
            } else {
              group.children['skeleton'].selected = true;

              if (hitResult.type === 'segment' && hitResult.item.name === 'skeleton') {
                if (mode === 'edit' && event.modifiers.alt) {
                  const skel = hitResult.item as paper.Path;
                  const seg = hitResult.segment;
                  seg.data = seg.data || {};
                  seg.data.cusp = !seg.data.cusp;
                  smoothSkeleton(skel);
                  updateRibbon(group);
                  draggedSegment = null;
                  editsMade = true;
                } else if (mode === 'edit' && removeNodeOnEditDoubleClick) {
                  const skel = hitResult.item as paper.Path;
                  hitResult.segment.remove();
                  smoothSkeleton(skel);
                  updateRibbon(group);
                  draggedSegment = null;
                  lastEditClick = { time: 0, segment: null };
                  editsMade = true;
                } else {
                  draggedSegment = hitResult.segment;
                  dragStartPressure = hitResult.segment.data?.pressure ?? 1;
                  dragStartX = event.point.x;
                }
              } else if (mode === 'edit' && ['fill', 'stroke', 'curve'].includes(hitResult.type)) {
                const skel = group.children['skeleton'] as paper.Path;
                const loc = skel.getNearestLocation(event.point);
                if (loc) {
                  const newSeg = skel.insert(loc.index + 1, loc.point);
                  const p1 = loc.curve.segment1.data?.pressure ?? 1;
                  const p2 = loc.curve.segment2.data?.pressure ?? 1;
                  newSeg.data = { pressure: p1 + (p2 - p1) * loc.parameter };
                  smoothSkeleton(skel);
                  updateRibbon(group);
                  draggedSegment = newSeg;
                  dragStartPressure = newSeg.data.pressure;
                  dragStartX = event.point.x;
                  editsMade = true;
                }
              }
            }
          } else if (group && group.data?.isReference) {
            if (mode === 'select') {
              if (activeSelectionRef.current !== group) {
                clearPaperSelection();
                activeSelectionRef.current = group;
              }
              drawTransformBox(group);
              transformAction = 'move';
              bumpSelectionRevision();
            } else {
              clearPaperSelection();
            }
          }
        } else {
          clearPaperSelection();
        }
      }
    };

    tool.onMouseMove = (event: paper.ToolEvent) => {
      if (stateRef.current.isAnimating) return;
      const mode = stateRef.current.activeTool;

      if (mode === 'eraser' && !eraserDragStart) {
        canvasRef.current!.style.cursor = 'crosshair';
        hoverIndicator.opacity = 0;
        return;
      }

      if (mode === 'eraser' && eraserDragStart) {
        if (eraserPreview) eraserPreview.remove();
        eraserPreview = new paper.Path.Rectangle(eraserDragStart, event.point);
        eraserPreview.strokeColor = '#ef4444';
        eraserPreview.strokeWidth = 1;
        eraserPreview.fillColor = new paper.Color(1, 0.2, 0.2, 0.15);
        canvasRef.current!.style.cursor = 'crosshair';
        return;
      }

      if (mode === 'edit' || mode === 'pressure' || mode === 'select') {
        const hitOptions = {
          segments: true,
          stroke: true,
          fill: true,
          tolerance: 6,
          match: (result: paper.HitResult) => result.item !== hoverIndicator
        };
        const hitResult = paper.project.hitTest(event.point, hitOptions);

        if (hitResult && hitResult.item !== hoverIndicator) {
          if (mode === 'select' && hitResult.item.data && hitResult.item.data.isHandle) {
            canvasRef.current!.style.cursor = 'crosshair';
            hoverIndicator.opacity = 0;
          } else if (mode === 'select' && hitResult.item.parent?.data?.isTransformBox) {
            canvasRef.current!.style.cursor = 'grab';
            hoverIndicator.opacity = 0;
          } else if ((mode === 'edit' || mode === 'pressure') && hitResult.type === 'segment' && hitResult.item.name === 'skeleton') {
            canvasRef.current!.style.cursor = 'crosshair';
            if (paper.project.layers.length > 0) hoverIndicator.bringToFront();
            hoverIndicator.position = hitResult.segment.point;
            hoverIndicator.opacity = 1;
          } else {
            canvasRef.current!.style.cursor = 'pointer';
            hoverIndicator.opacity = 0;
          }
        } else {
          canvasRef.current!.style.cursor = 'default';
          hoverIndicator.opacity = 0;
        }
      } else {
        canvasRef.current!.style.cursor = 'crosshair';
        hoverIndicator.opacity = 0;
      }
    };

    tool.onMouseDrag = (event: paper.ToolEvent) => {
      if (stateRef.current.isAnimating) return;

      if (event.modifiers.space || (event.event as any).buttons === 4) {
        paper.view.center = paper.view.center.subtract(event.delta);
        return;
      }

      const mode = stateRef.current.activeTool;

      if (mode === 'eraser' && eraserDragStart) {
        if (eraserPreview) eraserPreview.remove();
        eraserPreview = new paper.Path.Rectangle(eraserDragStart, event.point);
        eraserPreview.strokeColor = '#ef4444';
        eraserPreview.strokeWidth = 1;
        eraserPreview.fillColor = new paper.Color(1, 0.2, 0.2, 0.15);
        return;
      }

      if (mode === 'freestyle' && freestyleGroupRef.current) {
        const group = freestyleGroupRef.current;
        const skel = group.children['skeleton'] as paper.Path;
        if (!skel) return;

        // Sample at a small screen-constant spacing so strokes feel smooth at any zoom level.
        const spacing = 2.2 / paper.view.zoom;
        const segDist = lastFreestylePoint ? event.point.getDistance(lastFreestylePoint) : 0;
        if (lastFreestylePoint && segDist < spacing) return;
        if (segDist > 0) freestyleLen += segDist;
        lastFreestylePoint = event.point.clone();

        skel.add(event.point);
        if (skel.lastSegment) {
          skel.lastSegment.data = skel.lastSegment.data || {};
          const wave =
            freestyleWave.base +
            Math.sin(freestyleWave.p1 + freestyleLen * freestyleWave.w1) * freestyleWave.amp1 +
            Math.sin(freestyleWave.p2 + freestyleLen * freestyleWave.w2) * freestyleWave.amp2;
          // Keep pressure in a reasonable band for editing; avoid going to ~0.
          skel.lastSegment.data.pressure = Math.max(0.15, Math.min(1.85, wave));
        }
        smoothSkeleton(skel);
        updateRibbon(group);
        editsMade = true;
        return;
      }

      if (mode === 'edit' && draggedSegment) {
        draggedSegment.point = draggedSegment.point.add(event.delta);
        smoothSkeleton(draggedSegment.path as paper.Path);
        updateRibbon(draggedSegment.path.parent as paper.Group);
        editsMade = true;
        if (hoverIndicator.opacity === 1) hoverIndicator.position = draggedSegment.point;
      }

      if (mode === 'pressure' && draggedSegment) {
        const dx = event.point.x - dragStartX;
        if (!draggedSegment.data) draggedSegment.data = {};
        draggedSegment.data.pressure = Math.max(0.05, dragStartPressure + dx * 0.015);
        updateRibbon(draggedSegment.path.parent as paper.Group);
        editsMade = true;
      }

      if (mode === 'select' && activeSelectionRef.current && transformAction) {
        const group = activeSelectionRef.current;
        if (transformAction === 'move') {
          group.position = group.position.add(event.delta);
        } else if (['tl', 'tr', 'bl', 'br'].includes(transformAction)) {
          const bounds = group.bounds;
          let dx = 0,
            dy = 0;
          if (transformAction === 'tl') {
            dx = -event.delta.x;
            dy = -event.delta.y;
          }
          if (transformAction === 'tr') {
            dx = event.delta.x;
            dy = -event.delta.y;
          }
          if (transformAction === 'bl') {
            dx = -event.delta.x;
            dy = event.delta.y;
          }
          if (transformAction === 'br') {
            dx = event.delta.x;
            dy = event.delta.y;
          }

          if (bounds.width + dx > 2 && bounds.height + dy > 2) {
            let sx = (bounds.width + dx) / bounds.width;
            let sy = (bounds.height + dy) / bounds.height;
            if (event.modifiers.shift) {
              const uniform = Math.max(sx, sy);
              sx = uniform;
              sy = uniform;
            }
            group.scale(sx, sy, scalePivot!);
          }
        } else if (transformAction === 'rotate') {
          const center = group.bounds.center;
          const startVec = event.point.subtract(event.delta).subtract(center);
          const endVec = event.point.subtract(center);
          group.rotate(endVec.angle - startVec.angle, center);
        }
        drawTransformBox(group);
        editsMade = true;
      }
    };

    tool.onMouseUp = (event: paper.ToolEvent) => {
      const mode = stateRef.current.activeTool;

      if (mode === 'eraser' && eraserDragStart) {
        if (eraserPreview) {
          eraserPreview.remove();
          eraserPreview = null;
        }
        const rect = new paper.Rectangle(eraserDragStart, event.point);
        eraserDragStart = null;
        if (rect.width > 2 && rect.height > 2) {
          const eraserPath = new paper.Path.Rectangle(rect);
          eraserPath.fillColor = '#ffffff';
          eraserPath.closed = true;

          const layer = paper.project.activeLayer;
          const strokeGroups = [...layer.children].filter((c) => c instanceof paper.Group && c.data?.isStroke) as paper.Group[];

          for (const group of strokeGroups) {
            const ribbon = group.children['ribbon'] as paper.Path;
            if (!ribbon || !eraserPath.bounds.intersects(ribbon.bounds)) continue;

            const eraserClone = eraserPath.clone({ insert: false });
            const result = ribbon.subtract(eraserClone, { insert: false });
            eraserClone.remove();
            replaceRibbonWithBooleanResult(group, result, ribbon);
            editsMade = true;
          }
          eraserPath.remove();
        }
      }

      draggedSegment = null;
      transformAction = null;

      if (mode === 'freestyle') {
        freestyleGroupRef.current = null;
        lastFreestylePoint = null;
        freestyleLen = 0;
      }

      if (editsMade) {
        saveHistory();
        editsMade = false;
      }
    };

    tool.onKeyUp = (event: paper.KeyEvent) => {
      if (stateRef.current.isAnimating) return;
      const mode = stateRef.current.activeTool;

      if (event.key === 'enter' || (!event.modifiers.control && !event.modifiers.command && (event.key === 'z' || event.key === 'Z'))) {
        currentGroupRef.current = null;
        clearPaperSelection();
      }

      if ((event.key === 'backspace' || event.key === 'delete') && mode === 'select') {
        if (activeSelectionRef.current) {
          activeSelectionRef.current.remove();
          clearPaperSelection();
          saveHistory();
        }
      }
    };

    const handleWheel = (e: WheelEvent) => {
      if (!paper.view) return;
      e.preventDefault();

      const view = paper.view;
      const oldZoom = view.zoom;
      const zoomDelta = e.deltaY > 0 ? 0.9 : 1.1;
      const newZoom = Math.max(0.1, Math.min(oldZoom * zoomDelta, 10));

      const mouseRect = canvasRef.current!.getBoundingClientRect();
      const mouseX = e.clientX - mouseRect.left;
      const mouseY = e.clientY - mouseRect.top;
      const mousePoint = view.viewToProject(new paper.Point(mouseX, mouseY));

      const zoomRatio = oldZoom / newZoom;
      const newCenter = mousePoint.add(view.center.subtract(mousePoint).multiply(zoomRatio));

      view.zoom = newZoom;
      view.center = newCenter;
    };

    canvasRef.current.addEventListener('wheel', handleWheel, { passive: false });

    // Mobile: two-finger pan + pinch-to-zoom (single finger remains for drawing/editing).
    const activePointers = new Map<number, { clientX: number; clientY: number }>();
    let gestureActive = false;
    let gestureStartZoom = 1;
    let gestureStartCenter: paper.Point | null = null;
    let gestureStartDist = 1;
    let gestureAnchorProject: paper.Point | null = null;

    const getCanvasPoint = (clientX: number, clientY: number) => {
      const rect = canvasRef.current!.getBoundingClientRect();
      return new paper.Point(clientX - rect.left, clientY - rect.top);
    };

    const startTwoFingerGestureIfReady = () => {
      if (!paper.view) return;
      if (gestureActive) return;
      if (activePointers.size !== 2) return;

      const pts = Array.from(activePointers.values());
      const dx = pts[0].clientX - pts[1].clientX;
      const dy = pts[0].clientY - pts[1].clientY;
      const dist = Math.hypot(dx, dy);
      if (!Number.isFinite(dist) || dist < 4) return;

      const midClientX = (pts[0].clientX + pts[1].clientX) / 2;
      const midClientY = (pts[0].clientY + pts[1].clientY) / 2;

      const view = paper.view;
      gestureActive = true;
      gestureStartZoom = view.zoom;
      gestureStartCenter = view.center.clone();
      gestureStartDist = dist;
      gestureAnchorProject = view.viewToProject(getCanvasPoint(midClientX, midClientY));

      // Prevent creating strokes while panning/zooming with two fingers.
      tool.enabled = false;
    };

    const updateTwoFingerGesture = () => {
      if (!paper.view) return;
      if (!gestureActive) return;
      if (activePointers.size !== 2) return;
      if (!gestureStartCenter || !gestureAnchorProject) return;

      const pts = Array.from(activePointers.values());
      const dx = pts[0].clientX - pts[1].clientX;
      const dy = pts[0].clientY - pts[1].clientY;
      const dist = Math.hypot(dx, dy);
      if (!Number.isFinite(dist) || dist < 1) return;

      const midClientX = (pts[0].clientX + pts[1].clientX) / 2;
      const midClientY = (pts[0].clientY + pts[1].clientY) / 2;
      const midCanvasPt = getCanvasPoint(midClientX, midClientY);

      const view = paper.view;
      const zoomFactor = dist / gestureStartDist;
      const targetZoom = Math.max(0.1, Math.min(gestureStartZoom * zoomFactor, 10));

      // Pin the original anchor point under the moving midpoint (supports pan + zoom).
      view.zoom = targetZoom;
      view.center = gestureStartCenter.clone();
      const midProjectWithNewZoom = view.viewToProject(midCanvasPt);
      view.center = view.center.add(gestureAnchorProject.subtract(midProjectWithNewZoom));
    };

    const endTwoFingerGestureIfNeeded = () => {
      if (activePointers.size >= 2) return;
      if (!gestureActive) return;
      gestureActive = false;
      gestureStartCenter = null;
      gestureAnchorProject = null;
      tool.enabled = true;
    };

    const onPointerDown = (e: PointerEvent) => {
      if (!canvasRef.current || !paper.view) return;
      // Only treat touch pointers as gesture candidates.
      if (e.pointerType !== 'touch') return;
      activePointers.set(e.pointerId, { clientX: e.clientX, clientY: e.clientY });
      try {
        canvasRef.current.setPointerCapture(e.pointerId);
      } catch {
        // ignore
      }
      if (activePointers.size >= 2) {
        e.preventDefault();
        startTwoFingerGestureIfReady();
      }
    };

    const onPointerMove = (e: PointerEvent) => {
      if (e.pointerType !== 'touch') return;
      if (!activePointers.has(e.pointerId)) return;
      activePointers.set(e.pointerId, { clientX: e.clientX, clientY: e.clientY });
      if (activePointers.size >= 2) {
        e.preventDefault();
        startTwoFingerGestureIfReady();
        updateTwoFingerGesture();
      }
    };

    const onPointerUpOrCancel = (e: PointerEvent) => {
      if (e.pointerType !== 'touch') return;
      activePointers.delete(e.pointerId);
      if (gestureActive) e.preventDefault();
      endTwoFingerGestureIfNeeded();
    };

    canvasRef.current.addEventListener('pointerdown', onPointerDown, { passive: false });
    canvasRef.current.addEventListener('pointermove', onPointerMove, { passive: false });
    canvasRef.current.addEventListener('pointerup', onPointerUpOrCancel, { passive: false });
    canvasRef.current.addEventListener('pointercancel', onPointerUpOrCancel, { passive: false });

    return () => {
      resizeObserver.disconnect();
      delete (window as any).getActiveStrokeGroup;
      delete (window as any).addReferenceImageFromUrl;
      delete (window as any).selectReferenceGroupById;
      if (canvasRef.current) {
        canvasRef.current.removeEventListener('wheel', handleWheel);
        canvasRef.current.removeEventListener('pointerdown', onPointerDown);
        canvasRef.current.removeEventListener('pointermove', onPointerMove);
        canvasRef.current.removeEventListener('pointerup', onPointerUpOrCancel);
        canvasRef.current.removeEventListener('pointercancel', onPointerUpOrCancel);
      }
      tool.remove();
      if (paper.project) {
        paper.project.clear();
      }
    };
  }, []);
}
