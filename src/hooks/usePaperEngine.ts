// @ts-nocheck
import { useEffect, useRef } from 'react';
import paper from 'paper';
import { useEditor } from '../context/EditorContext';

export function usePaperEngine(canvasRef: React.RefObject<HTMLCanvasElement | null>) {
  const { activeTool, currentColor, isAnimating, brushSize, projectRef, setCurrentColor, saveHistory, initHistory } = useEditor();

  const stateRef = useRef({ activeTool, currentColor, isAnimating, brushSize });
  
  useEffect(() => {
    stateRef.current = { activeTool, currentColor, isAnimating, brushSize };
  }, [activeTool, currentColor, isAnimating, brushSize]);

  useEffect(() => {
    if (!canvasRef.current) return;
    
    paper.setup(canvasRef.current);
    projectRef.current = paper.project;
    initHistory();

    const tool = new paper.Tool();
    let transformBox: paper.Group | null = null;
    let transformAction: string | null = null;
    let scalePivot: paper.Point | null = null;
    const currentGroupRef = { current: null as paper.Group | null };
    const activeSelectionRef = { current: null as paper.Group | null };

    // Hover Indicator
    let hoverIndicator = new paper.Path.Circle({
        center: [-1000, -1000], 
        radius: 6, 
        strokeColor: '#3b82f6', 
        strokeWidth: 2,
        unselectable: true,
        opacity: 0
    });
    hoverIndicator.data = { isHoverNode: true };

    // Drag tracking state
    let draggedSegment: paper.Segment | null = null;
    let dragStartPressure = 1;
    let dragStartX = 0;
    /** Only used for draw-mode “double-click to finish stroke” — must not share timing with edit/select/pressure. */
    let lastDrawClickTime = 0;
    /** Edit mode: remove node only when the same skeleton segment is clicked twice in a row (not after a draw click). */
    let lastEditClick = { time: 0, segment: null as paper.Segment | null };

    let editsMade = false;

    const updateRibbon = (group: paper.Group) => {
        const skeleton = group.children['skeleton'] as paper.Path;
        const ribbon = group.children['ribbon'] as paper.Path;
        const capStart = group.children['capStart'] as paper.Path;
        const capEnd = group.children['capEnd'] as paper.Path;

        if (!skeleton || skeleton.segments.length < 2) return;
        const length = skeleton.length;
        if (length === 0) return;

        const steps = Math.ceil(length / 3);
        const baseWidth = skeleton.data.baseWidth || 4;

        let left = [];
        let right = [];

        for (let i = 0; i <= steps; i++) {
            const offset = Math.min((i / steps) * length, length);
            const loc = skeleton.getLocationAt(offset);
            if (!loc) continue;

            let p1 = loc.curve.segment1.data?.pressure ?? 1;
            let p2 = loc.curve.segment2.data?.pressure ?? 1;
            let pressure = p1 + (p2 - p1) * loc.parameter;

            const width = baseWidth * pressure;
            const normal = loc.normal;

            left.push(loc.point.add(normal.multiply(width)));
            right.push(loc.point.subtract(normal.multiply(width)));
        }

        ribbon.segments = [...left, ...right.reverse()];

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
            paper.project.getItems({ name: 'skeleton' }).forEach(item => item.selected = false);
        }
        activeSelectionRef.current = null;
    };
    (window as any).clearPaperSelection = clearPaperSelection;
    /** Stroke group currently shown with the transform box in Select mode (skeleton may not be `selected`). */
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
                point: [point.x - 4, point.y - 4], size: [8, 8],
                fillColor: '#ffffff', strokeColor: boxColor, strokeWidth: 1.5
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
        rotHandle.fillColor = '#ffffff'; rotHandle.strokeColor = boxColor;
        rotHandle.data = { isHandle: true, type: 'rotate' };

        transformBox.addChild(rotLine);
        transformBox.addChild(rotHandle);
    };

    tool.onMouseDown = (event: paper.ToolEvent) => {
        if (stateRef.current.isAnimating) return;

        const mode = stateRef.current.activeTool;
        const color = stateRef.current.currentColor;
        const brushSize = stateRef.current.brushSize;

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

            if (!currentGroupRef.current || !currentGroupRef.current.parent) {
                const group = new paper.Group({ data: { isStroke: true } });
                const skeleton = new paper.Path({ name: 'skeleton', strokeColor: '#000000', opacity: 0.01, selected: true });
                skeleton.data = { baseWidth: brushSize }; // Adopt slider's base size

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

            skel.smooth({ type: 'catmull-rom', factor: 0.5 });
            updateRibbon(currentGroupRef.current);
            editsMade = true;
        }

        if (mode === 'edit' || mode === 'pressure' || mode === 'select') {
            const hitOptions = {
                segments: true,
                stroke: true,
                fill: true,
                tolerance: 10,
                // Hover ring sits on top of nodes; without this, clicks “on the node” hit the ring and deselect.
                match: (result: paper.HitResult) => result.item !== hoverIndicator,
            };
            const hitResult = paper.project.hitTest(event.point, hitOptions);

            if (mode === 'select' && hitResult) {
                if (hitResult.item.data && hitResult.item.data.isHandle) {
                    transformAction = hitResult.item.data.type;
                    const bounds = activeSelectionRef.current!.bounds;
                    if (transformAction === 'tl') scalePivot = bounds.bottomRight;
                    if (transformAction === 'tr') scalePivot = bounds.bottomLeft;
                    if (transformAction === 'bl') scalePivot = bounds.topRight;
                    if (transformAction === 'br') scalePivot = bounds.topLeft;
                    return;
                }
                if (hitResult.item.parent && hitResult.item.parent.data?.isTransformBox) {
                    transformAction = 'move'; return;
                }
            }

            if (hitResult && hitResult.item !== hoverIndicator) {
                let group = hitResult.item.parent as paper.Group;
                if (!group || !group.data?.isStroke) group = hitResult.item as paper.Group;

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
                            if (mode === 'edit' && removeNodeOnEditDoubleClick) {
                                const skel = hitResult.item as paper.Path;
                                hitResult.segment.remove();
                                skel.smooth({ type: 'catmull-rom', factor: 0.5 });
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
                                skel.smooth({ type: 'catmull-rom', factor: 0.5 });
                                updateRibbon(group);
                                draggedSegment = newSeg;
                                dragStartPressure = newSeg.data.pressure;
                                dragStartX = event.point.x;
                                editsMade = true;
                            }
                        }
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

        if (mode === 'edit' || mode === 'pressure' || mode === 'select') {
            const hitOptions = {
                segments: true,
                stroke: true,
                fill: true,
                tolerance: 6,
                match: (result: paper.HitResult) => result.item !== hoverIndicator,
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
                    // Show hover ring enlargement on the specific segment node
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

        if (mode === 'edit' && draggedSegment) {
            draggedSegment.point = draggedSegment.point.add(event.delta);
            (draggedSegment.path as paper.Path).smooth({ type: 'catmull-rom', factor: 0.5 });
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
                let dx = 0, dy = 0;
                if (transformAction === 'tl') { dx = -event.delta.x; dy = -event.delta.y; }
                if (transformAction === 'tr') { dx = event.delta.x; dy = -event.delta.y; }
                if (transformAction === 'bl') { dx = -event.delta.x; dy = event.delta.y; }
                if (transformAction === 'br') { dx = event.delta.x; dy = event.delta.y; }

                if (bounds.width + dx > 2 && bounds.height + dy > 2) {
                    let sx = (bounds.width + dx) / bounds.width;
                    let sy = (bounds.height + dy) / bounds.height;
                    if (event.modifiers.shift) {
                        const uniform = Math.max(sx, sy); sx = uniform; sy = uniform;
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

    tool.onMouseUp = () => {
        draggedSegment = null;
        transformAction = null;
        
        // Push to History stack if edits occurred before lifting the tool
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
        let newZoom = Math.max(0.1, Math.min(oldZoom * zoomDelta, 10));

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

    return () => {
        delete (window as any).getActiveStrokeGroup;
        if (canvasRef.current) {
            canvasRef.current.removeEventListener('wheel', handleWheel);
        }
        tool.remove();
        if (paper.project) {
            paper.project.clear();
        }
    };
  }, []); // Note that initHistory + saveHistory use empty deps strictly.
}
