// components/primitives/RectangleDrawingTool.ts
import { CanvasRenderingTarget2D } from 'fancy-canvas';
import {
	Coordinate,
	IChartApi,
	ISeriesApi,
	IPrimitivePaneRenderer,
	IPrimitivePaneView,
	MouseEventParams,
	SeriesType,
	Time,
} from 'lightweight-charts';
import { ensureDefined } from '../helpers/assertions';
import { positionsBox } from '../helpers/dimensions/positions';

// --- Helper Interfaces and Classes ---

interface ViewPoint {
	x: Coordinate | null;
	y: Coordinate | null;
}

class RectanglePaneRenderer implements IPrimitivePaneRenderer {
	_p1: ViewPoint;
	_p2: ViewPoint;
    _angle: number; // ADD: Angle for rotation
	_fillColor: string;
    _selected: boolean; // ADD: To know when to draw handles

	constructor(p1: ViewPoint, p2: ViewPoint, angle: number, fillColor: string, selected: boolean) {
		this._p1 = p1;
		this._p2 = p2;
        this._angle = angle;
		this._fillColor = fillColor;
        this._selected = selected;
	}

	draw(target: CanvasRenderingTarget2D) {
		target.useBitmapCoordinateSpace(scope => {
			if (this._p1.x === null || this._p1.y === null || this._p2.x === null || this._p2.y === null) return;
			const ctx = scope.context;
			const hPos = positionsBox(this._p1.x, this._p2.x, scope.horizontalPixelRatio);
			const vPos = positionsBox(this._p1.y, this._p2.y, scope.verticalPixelRatio);
            
            // --- ADD: Rotation Logic ---
            const centerX = hPos.position + hPos.length / 2;
            const centerY = vPos.position + vPos.length / 2;
            ctx.save(); // Save the current state
            ctx.translate(centerX, centerY); // Move the origin to the center of the rectangle
            ctx.rotate(this._angle); // Rotate the canvas
            ctx.translate(-centerX, -centerY); // Move the origin back
            // --- End Rotation Logic ---

			ctx.fillStyle = this._fillColor;
			ctx.fillRect(hPos.position, vPos.position, hPos.length, vPos.length);

            // ADD: Draw selection handles if the rectangle is selected
            if (this._selected) {
                ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
                const handleSize = 6;
                // Top-left
                ctx.fillRect(hPos.position - handleSize / 2, vPos.position - handleSize / 2, handleSize, handleSize);
                // Top-right
                ctx.fillRect(hPos.position + hPos.length - handleSize / 2, vPos.position - handleSize / 2, handleSize, handleSize);
                // Bottom-left
                ctx.fillRect(hPos.position - handleSize / 2, vPos.position + vPos.length - handleSize / 2, handleSize, handleSize);
                // Bottom-right
                ctx.fillRect(hPos.position + hPos.length - handleSize / 2, vPos.position + vPos.length - handleSize / 2, handleSize, handleSize);
            }

            ctx.restore(); // Restore to the saved state
		});
	}
}

class RectanglePaneView implements IPrimitivePaneView {
	_source: Rectangle;
	_p1: ViewPoint = { x: null, y: null };
	_p2: ViewPoint = { x: null, y: null };

	constructor(source: Rectangle) {
		this._source = source;
	}

	update() {
		if (!this._source._p1 || !this._source._p2) {
			return;
		}
		const series = this._source.series;
		const y1 = series.priceToCoordinate(this._source._p1.price);
		const y2 = series.priceToCoordinate(this._source._p2.price);
		const timeScale = this._source.chart.timeScale();
		const x1 = timeScale.timeToCoordinate(this._source._p1.time);
		const x2 = timeScale.timeToCoordinate(this._source._p2.time);
		this._p1 = { x: x1, y: y1 };
		this._p2 = { x: x2, y: y2 };
	}

	renderer() {
		// FIX: Pass angle and selected state to the renderer
		return new RectanglePaneRenderer(this._p1, this._p2, this._source._angle, this._source._options.fillColor, this._source._selected);
	}
}

interface Point {
	time: Time;
	price: number;
}

export interface RectangleDrawingToolOptions {
	fillColor: string;
	previewFillColor: string;
}

const defaultOptions: RectangleDrawingToolOptions = {
	fillColor: 'rgba(0, 120, 255, 0.25)',
	previewFillColor: 'rgba(0, 120, 255, 0.25)',
};

class Rectangle {
    _chart: IChartApi;
    _series: ISeriesApi<SeriesType>;
	_options: RectangleDrawingToolOptions;
	_p1: Point;
	_p2: Point;
    _angle: number; // ADD: Angle property for each rectangle
    _selected: boolean = false; // ADD: Selected state
	_paneViews: RectanglePaneView[];
    private _requestUpdate: () => void = () => {};

	constructor(chart: IChartApi, series: ISeriesApi<SeriesType>, p1: Point, p2: Point, angle: number = 0, options: Partial<RectangleDrawingToolOptions> = {}) {
        this._chart = chart;
        this._series = series;
		this._p1 = p1;
		this._p2 = p2;
        this._angle = angle;
		this._options = { ...defaultOptions, ...options };
		this._paneViews = [new RectanglePaneView(this)];
	}

    public attached({ requestUpdate }: { requestUpdate: () => void }) {
        this._requestUpdate = requestUpdate;
    }

	public updateAllViews() {
		this._paneViews.forEach(pw => pw.update());
	}

	public paneViews() {
		return this._paneViews;
	}

    public select() {
        this._selected = true;
        this.updateAllViews();
        this.requestUpdate();
    }

    public deselect() {
        this._selected = false;
        this.updateAllViews();
        this.requestUpdate();
    }

    public setAngle(angle: number) {
        this._angle = angle;
        this.updateAllViews();
        this.requestUpdate();
    }
    
     public setPosition(p1: Point, p2: Point) {
        this._p1 = p1;
        this._p2 = p2;
        this.updateAllViews();
        this.requestUpdate();
    }

    protected requestUpdate() {
        this._requestUpdate();
    }

    get chart(): IChartApi { return this._chart; }
    get series(): ISeriesApi<SeriesType> { return this._series; }
}

class PreviewRectangle extends Rectangle {
	constructor(chart: IChartApi, series: ISeriesApi<SeriesType>, p1: Point, p2: Point, options: Partial<RectangleDrawingToolOptions> = {}) {
		super(chart, series, p1, p2, 0, options);
		this._options.fillColor = this._options.previewFillColor;
	}

	public updateEndPoint(p: Point) {
		this._p2 = p;
		this.updateAllViews();
		this.requestUpdate();
	}
}

// --- Main Tool Class ---

export class RectangleDrawingTool {
	private _chart: IChartApi;
    private _series: ISeriesApi<SeriesType>;
	private _toolbarContainer: HTMLDivElement;
	private _options: Partial<RectangleDrawingToolOptions>;
	private _rectangles: Rectangle[] = [];
	private _previewRectangle?: PreviewRectangle;
	private _points: Point[] = [];
	private _drawing: boolean = false;
	private _deleting: boolean = false;
    private _rotating: boolean = false;
    private _moving: boolean = false;
    private _selectedRectangle: Rectangle | null = null;
    private _dragStartPoint: { x: Coordinate, y: Coordinate } | null = null;
    private _isDragging: boolean = false; // ADD: State to track active drag
    private _toolbarButton?: HTMLDivElement;
	private _deleteButton?: HTMLDivElement;
    private _clearButton?: HTMLDivElement;
    private _rotateButton?: HTMLDivElement;
    private _moveButton?: HTMLDivElement;
    private _ticker: string;

	constructor(chart: IChartApi, series: ISeriesApi<SeriesType>, toolbarContainer: HTMLDivElement, ticker: string, options: Partial<RectangleDrawingToolOptions>) {
		this._chart = chart;
		this._series = series;
		this._toolbarContainer = toolbarContainer;
        this._ticker = ticker;
		this._options = options;
		this._addToolbar();
        
        const chartContainer = this._chart.options().layout?.container;
        if (chartContainer) {
            (chartContainer as HTMLDivElement).addEventListener('mousedown', this._mouseDownHandler);
            (chartContainer as HTMLDivElement).addEventListener('contextmenu', this._contextMenuHandler);
        }
        
        this._chart.subscribeClick(this._chartClickHandler);
		this._chart.subscribeCrosshairMove(this._moveHandler);
        
		document.addEventListener('mouseup', this._mouseUpHandler);
        document.addEventListener('mousemove', this._dragMoveHandler);
		document.addEventListener('keydown', this._keyDownHandler);
        
        this._loadDrawings();
	}

    private _chartClickHandler = (param: MouseEventParams) => {
        if (this.isDrawing()) {
            this._handleDrawClick(param);
        } else if (this.isDeleting()) {
            this._handleDeleteClick(param);
        } else if (this.isRotating()) {
            this._handleRotateClick(param);
        } else if (this.isMoving()) {
            this._handleMoveClick(param);
        }
    };
    private _contextMenuHandler = (e: MouseEvent) => {
        if (this.isMoving() && this._selectedRectangle) {
            e.preventDefault();
            this.stopMoving();
        }
    }
    private _dragMoveHandler = (e: MouseEvent) => {
        if (!this._isDragging || !this._selectedRectangle || !this._dragStartPoint) return;
        
        e.preventDefault();

        const xDelta = (e.clientX as Coordinate) - this._dragStartPoint.x;
        const yDelta = (e.clientY as Coordinate) - this._dragStartPoint.y;

        this._applyDeltaToSelectedRectangle(xDelta, yDelta);

        this._dragStartPoint.x = e.clientX as Coordinate;
        this._dragStartPoint.y = e.clientY as Coordinate;
    }

	private _mouseUpHandler = () => {
        if (this._isDragging && this._selectedRectangle) {
            this._isDragging = false;
            this._dragStartPoint = null;
            this._saveDrawings();
            
            this._selectedRectangle.deselect();
            this._selectedRectangle = null;
        } else if (this._isDragging) {
            this._isDragging = false;
        }
    }

	private _mouseDownHandler = (e: MouseEvent) => {
        if (e.button !== 0 || this.isDrawing()) return; 

        e.preventDefault();
        
        const pointX = e.offsetX as Coordinate;
        const pointY = e.offsetY as Coordinate;

        const timeScale = this._chart.timeScale();
        const time = timeScale.coordinateToTime(pointX);

        if (!time) return;
        
        const clickedRect = this._getRectangleAtPoint(pointX, pointY);

        if (this.isMoving()) {
            if (this._selectedRectangle) {
                if (clickedRect === this._selectedRectangle) {
                    this._isDragging = true;
                    this._dragStartPoint = { x: e.clientX as Coordinate, y: e.clientY as Coordinate };
                } else {
                    this._selectedRectangle.deselect();
                    this._selectedRectangle = null;
                    if (clickedRect) {
                        this._selectedRectangle = clickedRect;
                        this._selectedRectangle.select();
                        this._isDragging = true;
                        this._dragStartPoint = { x: e.clientX as Coordinate, y: e.clientY as Coordinate };
                    } else {
                        this.stopMoving();
                    }
                }
            } else if (clickedRect) {
                this._selectedRectangle = clickedRect;
                this._selectedRectangle.select();
                this._isDragging = true;
                this._dragStartPoint = { x: e.clientX as Coordinate, y: e.clientY as Coordinate };
            } else {
                this.stopMoving();
            }
        }
    }

	private _moveHandler = (param: MouseEventParams) => {
        if (this.isRotating() && this._selectedRectangle) {
            this._onRotationMouseMove(param);
        } else {
            this._onDrawMouseMove(param);
        }
    };

	public destroy() {
        this.stopDrawing();
		this.stopDeleting();
        this.stopRotating();
        this.stopMoving();
        const chartContainer = this._chart.options().layout?.container;
        if (chartContainer) {
            (chartContainer as HTMLDivElement).removeEventListener('mousedown', this._mouseDownHandler);
            (chartContainer as HTMLDivElement).removeEventListener('contextmenu', this._contextMenuHandler);
        }
		this._chart.unsubscribeClick(this._chartClickHandler);
		this._chart.unsubscribeCrosshairMove(this._moveHandler);
		document.removeEventListener('mouseup', this._mouseUpHandler);
        document.removeEventListener('mousemove', this._dragMoveHandler);
		document.removeEventListener('keydown', this._keyDownHandler);
		this._rectangles.forEach(r => this._removeRectangle(r));
		this._rectangles = [];
		if (this._toolbarButton) this._toolbarContainer.removeChild(this._toolbarButton);
        if (this._deleteButton) this._toolbarContainer.removeChild(this._deleteButton);
        if (this._clearButton) this._toolbarContainer.removeChild(this._clearButton);
        if (this._rotateButton) this._toolbarContainer.removeChild(this._rotateButton);
        if (this._moveButton) this._toolbarContainer.removeChild(this._moveButton);
	}


    private _applyDeltaToSelectedRectangle(xDelta: number, yDelta: number) {
        if (!this._selectedRectangle) return;

        const timeScale = this._chart.timeScale();
        const series = this._selectedRectangle.series;

        const p1 = this._selectedRectangle._p1;
        const p2 = this._selectedRectangle._p2;

        const p1CoordX = timeScale.timeToCoordinate(p1.time);
        const p2CoordX = timeScale.timeToCoordinate(p2.time);
        const p1CoordY = series.priceToCoordinate(p1.price);
        const p2CoordY = series.priceToCoordinate(p2.price);
        
        if (p1CoordX === null || p2CoordX === null || p1CoordY === null || p2CoordY === null) return;

        const newP1CoordX = p1CoordX + xDelta as Coordinate;
        const newP2CoordX = p2CoordX + xDelta as Coordinate;
        const newP1CoordY = p1CoordY + yDelta as Coordinate;
        const newP2CoordY = p2CoordY + yDelta as Coordinate;

        const newP1Time = timeScale.coordinateToTime(newP1CoordX);
        const newP2Time = timeScale.coordinateToTime(newP2CoordX);
        const newP1Price = series.coordinateToPrice(newP1CoordY);
        const newP2Price = series.coordinateToPrice(newP2CoordY);

        if (newP1Time === null || newP2Time === null || newP1Price === null || newP2Price === null) return;

        this._selectedRectangle.setPosition(
            { time: newP1Time, price: newP1Price },
            { time: newP2Time, price: newP2Price }
        );
    }

    private _keyDownHandler = (e: KeyboardEvent) => {
        if (!this.isMoving() || !this._selectedRectangle) return;
        
        let xDelta = 0;
        let yDelta = 0;
        const MOVE_STEP = 5;

        if (!e.key.startsWith('Arrow')) {
            return;
        }
        e.preventDefault();

        switch (e.key) {
            case 'ArrowUp':
                yDelta = -MOVE_STEP;
                break;
            case 'ArrowDown':
                yDelta = MOVE_STEP;
                break;
            case 'ArrowLeft':
                xDelta = -MOVE_STEP;
                break;
            case 'ArrowRight':
                xDelta = MOVE_STEP;
                break;
        }

        if (xDelta !== 0 || yDelta !== 0) {
            this._applyDeltaToSelectedRectangle(xDelta, yDelta);
            this._saveDrawings();
        }
    }
	public startDrawing(): void {
		this.stopDeleting();
        this.stopRotating();
		this._drawing = true;
		this._points = [];
		if (this._toolbarButton) this._toolbarButton.style.color = 'rgb(0, 120, 255)';
	}

	public stopDrawing(): void {
		this._drawing = false;
		this._points = [];
        this._removePreviewRectangle();
		if (this._toolbarButton) this._toolbarButton.style.color = '#d0d0d0';
	}

	public isMoving(): boolean {
        return this._moving;
    }

    public isDrawing(): boolean {
        return this._drawing;
    }

	public isDeleting(): boolean {
        return this._deleting;
    }

    public startMoving(): void {
        this.stopDrawing();
        this.stopDeleting();
        this.stopRotating();
        this._moving = true;
        
        if (this._moveButton) this._moveButton.style.color = 'rgb(0, 120, 255)';
    }

    public stopMoving(): void {
        this._moving = false;
        
        if (this._selectedRectangle) {
            this._selectedRectangle.deselect();
            this._selectedRectangle = null;
        }
        this._dragStartPoint = null;
        this._isDragging = false;
        if (this._moveButton) this._moveButton.style.color = '#d0d0d0';
    }

	public startDeleting(): void {
        this.stopDrawing();
        this.stopRotating();
        this._deleting = true;
        if (this._deleteButton) this._deleteButton.style.color = 'rgb(217, 48, 37)';
        this._chart.applyOptions({
            crosshair: { horzLine: { visible: false }, vertLine: { visible: false } },
        });
    }

	public stopDeleting(): void {
        this._deleting = false;
        if (this._deleteButton) this._deleteButton.style.color = '#d0d0d0';
        this._chart.applyOptions({
            crosshair: { horzLine: { visible: true }, vertLine: { visible: true } },
        });
    }

    public isRotating(): boolean {
        return this._rotating;
    }

    public startRotating(): void {
        this.stopDrawing();
        this.stopDeleting();
        this._rotating = true;
        if (this._rotateButton) this._rotateButton.style.color = 'rgb(0, 120, 255)';
    }

    public stopRotating(): void {
        this._rotating = false;
        if (this._selectedRectangle) {
            this._selectedRectangle.deselect();
            this._selectedRectangle = null;
        }
        if (this._rotateButton) this._rotateButton.style.color = '#d0d0d0';
    }
    
    private _handleDrawClick(param: MouseEventParams) {
        if (!param.point || !param.time) return;
        const price = this._series.coordinateToPrice(param.point.y);
        if (price === null) return;
        this._addPoint({ time: param.time, price });
    }
    private _handleMoveClick(param: MouseEventParams) {
        if (!param.point) return;

        if (this._selectedRectangle) {
            const clickedRect = this._getRectangleAtPoint(param.point.x, param.point.y);
            if (clickedRect === this._selectedRectangle) {
                this._dragStartPoint = { x: param.point.x, y: param.point.y };
            } else {
                this.stopMoving();
            }
            return;
        }
        
        const clickedRect = this._getRectangleAtPoint(param.point.x, param.point.y);
        if (clickedRect) {
            this._selectedRectangle = clickedRect;
            this._selectedRectangle.select();
        } else {
            this.stopMoving();
        }
    }
    private _handleRotateClick(param: MouseEventParams) {
        if (!param.point) return;
        if (this._selectedRectangle) {
            this.stopRotating();
            this._saveDrawings();
            return;
        }
        const clickedRect = this._getRectangleAtPoint(param.point.x, param.point.y);
        if (clickedRect) {
            this._selectedRectangle = clickedRect;
            this._selectedRectangle.select();
        } else {
            this.stopRotating();
        }
    }

    private _onRotationMouseMove(param: MouseEventParams) {
        if (!this._selectedRectangle || !param.point) return;
        const view = this._selectedRectangle.paneViews()[0] as RectanglePaneView;
        if (view._p1.x === null || view._p1.y === null || view._p2.x === null || view._p2.y === null) return;
        
        const centerX = (view._p1.x + view._p2.x) / 2;
        const centerY = (view._p1.y + view._p2.y) / 2;

        const angle = Math.atan2(param.point.y - centerY, param.point.x - centerX);
        this._selectedRectangle.setAngle(angle);
    }
    
    private _getRectangleAtPoint(x: Coordinate, y: Coordinate): Rectangle | undefined {
        return this._rectangles.find(rect => {
            const view = rect.paneViews()[0] as RectanglePaneView;
            if (view._p1.x === null || view._p1.y === null || view._p2.x === null || view._p2.y === null) return false;
            const minX = Math.min(view._p1.x, view._p2.x);
            const maxX = Math.max(view._p1.x, view._p2.x);
            const minY = Math.min(view._p1.y, view._p2.y);
            const maxY = Math.max(view._p1.y, view._p2.y);
            return x >= minX && x <= maxX && y >= minY && y <= maxY;
        });
    }


	private _handleDeleteClick(param: MouseEventParams) {
        if (!param.point) return;
		const rectangleToDelete = this._getRectangleAtPoint(param.point.x, param.point.y);
        if (rectangleToDelete) {
            this._removeRectangle(rectangleToDelete);
            this._rectangles = this._rectangles.filter(r => r !== rectangleToDelete);
            this._saveDrawings();
        }
        this.stopDeleting();
    }

	private _clearAllDrawings = () => {
        this._rectangles.forEach(r => this._removeRectangle(r));
        this._rectangles = [];
        this._saveDrawings();
    }

	private _onDrawMouseMove(param: MouseEventParams) {
		if (!this.isDrawing() || this._points.length === 0 || !param.point) return;
	
		const timeScale = this._chart.timeScale();
		// FIX: Manually get the time from the coordinate if the event param doesn't have it.
		let time = param.time;
		if (!time) {
			time = timeScale.coordinateToTime(param.point.x);
		}
	
		// If time is still null, we cannot proceed.
		if (!time) return;
	
		const price = this._series.coordinateToPrice(param.point.y);
		if (price === null) return;
	
		if (this._previewRectangle) {
			this._previewRectangle.updateEndPoint({ time: time, price });
		}
	}

	private _addPoint(p: Point) {
		this._points.push(p);
		if (this._points.length >= 2) {
			this._addNewRectangle(this._points[0], this._points[1]);
			this._saveDrawings();
			this.stopDrawing();
		} else {
			this._addPreviewRectangle(this._points[0]);
		}
	}

	private _addNewRectangle(p1: Point, p2: Point, angle: number = 0) {
		const rectangle = new Rectangle(this._chart, this._series, p1, p2, angle, { ...this._options });
		this._rectangles.push(rectangle);
		this._series.attachPrimitive(rectangle);
	}

	private _removeRectangle(rectangle: Rectangle) {
		this._series.detachPrimitive(rectangle);
	}

	private _addPreviewRectangle(p: Point) {
		this._previewRectangle = new PreviewRectangle(this._chart, this._series, p, p, { ...this._options });
		this._series.attachPrimitive(this._previewRectangle);
	}

	private _removePreviewRectangle() {
		if (this._previewRectangle) {
			this._series.detachPrimitive(this._previewRectangle);
			this._previewRectangle = undefined;
		}
	}

    private _saveDrawings() {
        const savedData = this._rectangles.map(rect => ({ p1: rect._p1, p2: rect._p2, angle: rect._angle }));
        localStorage.setItem(`drawings_${this._ticker}`, JSON.stringify(savedData));
    }

    private _loadDrawings() {
        const savedJSON = localStorage.getItem(`drawings_${this._ticker}`);
        if (savedJSON) {
            const savedData = JSON.parse(savedJSON);
            savedData.forEach((data: { p1: Point, p2: Point, angle: number }) => {
                this._addNewRectangle(data.p1, data.p2, data.angle);
            });
        }
    }

	private _addToolbar() {
		const button = document.createElement('div');
		button.style.width = '24px';
		button.style.height = '24px';
        button.style.cursor = 'pointer';
		button.style.color = '#d0d0d0';
		button.title = 'Draw Rectangle';
		button.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M2 2h20v20H2z" fill-opacity="0"/><path transform="rotate(15 12 12)" d="M3 7v10h18V7H3zm2 2h14v6H5V9z"/></svg>`;
		button.addEventListener('click', () => {
			this.isDrawing() ? this.stopDrawing() : this.startDrawing();
		});
		this._toolbarContainer.appendChild(button);
		this._toolbarButton = button;

		const deleteButton = document.createElement('div');
        deleteButton.style.width = '24px';
		deleteButton.style.height = '24px';
        deleteButton.style.cursor = 'pointer';
		deleteButton.style.color = '#d0d0d0';
        deleteButton.title = 'Delete Shape';
        deleteButton.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>`;
        deleteButton.addEventListener('click', () => {
            this.isDeleting() ? this.stopDeleting() : this.startDeleting();
        });
        this._toolbarContainer.appendChild(deleteButton);
        this._deleteButton = deleteButton;

        const rotateButton = document.createElement('div');
        rotateButton.style.width = '24px';
        rotateButton.style.height = '24px';
        rotateButton.style.cursor = 'pointer';
        rotateButton.style.color = '#d0d0d0';
        rotateButton.title = 'Rotate Shape';
        rotateButton.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" fill="currentColor" viewBox="0 0 16 16"><path d="M8 3a5 5 0 1 0 4.546 2.914.5.5 0 0 1 .908-.417A6 6 0 1 1 8 2v1z"/><path d="M8 4.466V.534a.25.25 0 0 1 .41-.192l2.36 1.966c.12.1.12.284 0 .384L8.41 4.658A.25.25 0 0 1 8 4.466z"/></svg>`;
        rotateButton.addEventListener('click', () => {
            this.isRotating() ? this.stopRotating() : this.startRotating();
        });
        this._toolbarContainer.appendChild(rotateButton);
        this._rotateButton = rotateButton;


        const clearButton = document.createElement('div');
        clearButton.style.width = '24px';
		clearButton.style.height = '24px';
        clearButton.style.cursor = 'pointer';
		clearButton.style.color = '#d0d0d0';
        clearButton.title = 'Clear All Drawings';
        clearButton.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" fill="currentColor" viewBox="0 0 16 16"><path d="M5.5 5.5A.5.5 0 0 1 6 6v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm2.5 0a.5.5 0 0 1 .5.5v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm3 .5a.5.5 0 0 0-1 0v6a.5.5 0 0 0 1 0V6z"/><path fill-rule="evenodd" d="M14.5 3a1 1 0 0 1-1 1H13v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4h-.5a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1H6a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1h3.5a1 1 0 0 1 1 1v1zM4.118 4 4 4.059V13a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V4.059L11.882 4H4.118zM2.5 3V2h11v1h-11z"/></svg>`;
        clearButton.addEventListener('click', this._clearAllDrawings);
        this._toolbarContainer.appendChild(clearButton);
        this._clearButton = clearButton;

        const moveButton = document.createElement('div');
        moveButton.style.width = '24px';
        moveButton.style.height = '24px';
        moveButton.style.cursor = 'pointer';
        moveButton.style.color = '#d0d0d0';
        moveButton.title = 'Move Shape (Click a shape to select and drag)';
        moveButton.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-move-icon lucide-move"><path d="M12 2v20"/><path d="m15 19-3 3-3-3"/><path d="m19 9 3 3-3 3"/><path d="M2 12h20"/><path d="m5 9-3 3 3 3"/><path d="m9 5 3-3 3 3"/></svg>`;
        moveButton.addEventListener('click', () => {
            this.isMoving() ? this.stopMoving() : this.startMoving();
        });
        this._toolbarContainer.appendChild(moveButton);
        this._moveButton = moveButton;
	}
}