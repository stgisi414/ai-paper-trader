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
	_fillColor: string;

	constructor(p1: ViewPoint, p2: ViewPoint, fillColor: string) {
		this._p1 = p1;
		this._p2 = p2;
		this._fillColor = fillColor;
	}

	draw(target: CanvasRenderingTarget2D) {
		target.useBitmapCoordinateSpace(scope => {
			if (this._p1.x === null || this._p1.y === null || this._p2.x === null || this._p2.y === null) return;
			const ctx = scope.context;
			const hPos = positionsBox(this._p1.x, this._p2.x, scope.horizontalPixelRatio);
			const vPos = positionsBox(this._p1.y, this._p2.y, scope.verticalPixelRatio);
			ctx.fillStyle = this._fillColor;
			ctx.fillRect(hPos.position, vPos.position, hPos.length, vPos.length);
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
		// FIX: Add a guard clause to prevent crash if points are not yet defined.
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
		return new RectanglePaneRenderer(this._p1, this._p2, this._source._options.fillColor);
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
	_paneViews: RectanglePaneView[];
    private _requestUpdate: () => void = () => {};

	constructor(chart: IChartApi, series: ISeriesApi<SeriesType>, p1: Point, p2: Point, options: Partial<RectangleDrawingToolOptions> = {}) {
        this._chart = chart;
        this._series = series;
		this._p1 = p1;
		this._p2 = p2;
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

    protected requestUpdate() {
        this._requestUpdate();
    }

    get chart(): IChartApi { return this._chart; }
    get series(): ISeriesApi<SeriesType> { return this._series; }
}

class PreviewRectangle extends Rectangle {
	constructor(chart: IChartApi, series: ISeriesApi<SeriesType>, p1: Point, p2: Point, options: Partial<RectangleDrawingToolOptions> = {}) {
		super(chart, series, p1, p2, options);
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
	private _deleting: boolean = false; // ADD: State for delete mode
	private _toolbarButton?: HTMLDivElement;
	private _deleteButton?: HTMLDivElement; // ADD: Button for deleting
    private _clearButton?: HTMLDivElement; // ADD: Button for clearing all
    private _ticker: string;

	constructor(chart: IChartApi, series: ISeriesApi<SeriesType>, toolbarContainer: HTMLDivElement, ticker: string, options: Partial<RectangleDrawingToolOptions>) {
		this._chart = chart;
		this._series = series;
		this._toolbarContainer = toolbarContainer;
        this._ticker = ticker;
		this._options = options;
		this._addToolbar(); // FIX: Call new toolbar creation method
		this._chart.subscribeClick(this._clickHandler);
		this._chart.subscribeCrosshairMove(this._moveHandler);
        this._loadDrawings();
	}

	private _clickHandler = (param: MouseEventParams) => {
		// FIX: Prioritize delete clicks, then draw clicks
		if (!param.point || !param.time) return;
		if (this.isDeleting()) {
			this._handleDeleteClick(param);
			return;
		}
		if (!this.isDrawing()) return;
		
		const price = this._series.coordinateToPrice(param.point.y);
		if (price === null) return;
		this._addPoint({ time: param.time, price });
	};
	private _moveHandler = (param: MouseEventParams) => this._onMouseMove(param);

	public destroy() {
        this.stopDrawing();
		this.stopDeleting(); // ADD: Cleanup delete mode
		this._chart.unsubscribeClick(this._clickHandler);
		this._chart.unsubscribeCrosshairMove(this._moveHandler);
		this._rectangles.forEach(r => this._removeRectangle(r));
		this._rectangles = [];
		// FIX: Ensure all toolbar buttons are removed
		if (this._toolbarButton) this._toolbarContainer.removeChild(this._toolbarButton);
        if (this._deleteButton) this._toolbarContainer.removeChild(this._deleteButton);
        if (this._clearButton) this._toolbarContainer.removeChild(this._clearButton);
	}

	public startDrawing(): void {
		this.stopDeleting(); // ADD: Ensure only one mode is active
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

    public isDrawing(): boolean {
        return this._drawing;
    }

	// --- ADD: All new logic for deleting shapes ---
	public isDeleting(): boolean {
        return this._deleting;
    }

	public startDeleting(): void {
        this.stopDrawing();
        this._deleting = true;
        if (this._deleteButton) this._deleteButton.style.color = 'rgb(217, 48, 37)'; // Red
		// Hide the crosshair to make it clear you're in delete mode
        this._chart.applyOptions({
            crosshair: { horzLine: { visible: false }, vertLine: { visible: false } },
        });
    }

	public stopDeleting(): void {
        this._deleting = false;
        if (this._deleteButton) this._deleteButton.style.color = '#d0d0d0';
		// Restore crosshair
        this._chart.applyOptions({
            crosshair: { horzLine: { visible: true }, vertLine: { visible: true } },
        });
    }

	private _handleDeleteClick(param: MouseEventParams) {
        if (!param.point) return;
        const clickX = param.point.x;
        const clickY = param.point.y;

        const rectangleToDelete = this._rectangles.find(rect => {
            const view = rect.paneViews()[0] as RectanglePaneView;
            if (view._p1.x === null || view._p1.y === null || view._p2.x === null || view._p2.y === null) {
                return false;
            }
            // Check if the click is within the rectangle's pixel bounds
            const minX = Math.min(view._p1.x, view._p2.x);
            const maxX = Math.max(view._p1.x, view._p2.x);
            const minY = Math.min(view._p1.y, view._p2.y);
            const maxY = Math.max(view._p1.y, view._p2.y);
            return clickX >= minX && clickX <= maxX && clickY >= minY && clickY <= maxY;
        });

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
	// --- End of new logic ---

	private _onMouseMove(param: MouseEventParams) {
		if (!this.isDrawing() || this._points.length === 0 || !param.point || !param.time) return;
		const price = this._series.coordinateToPrice(param.point.y);
		if (price === null) return;
		if (this._previewRectangle) {
			this._previewRectangle.updateEndPoint({ time: param.time, price });
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

	private _addNewRectangle(p1: Point, p2: Point) {
		const rectangle = new Rectangle(this._chart, this._series, p1, p2, { ...this._options });
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
        const savedData = this._rectangles.map(rect => ({ p1: rect._p1, p2: rect._p2 }));
        localStorage.setItem(`drawings_${this._ticker}`, JSON.stringify(savedData));
    }

    private _loadDrawings() {
        const savedJSON = localStorage.getItem(`drawings_${this._ticker}`);
        if (savedJSON) {
            const savedData = JSON.parse(savedJSON);
            savedData.forEach((data: { p1: Point, p2: Point }) => {
                this._addNewRectangle(data.p1, data.p2);
            });
        }
    }

	private _addToolbar() { // FIX: Renamed and expanded method
		// Draw Rectangle Button
		const button = document.createElement('div');
		button.style.width = '24px';
		button.style.height = '24px';
        button.style.cursor = 'pointer';
		button.style.color = '#d0d0d0';
		button.title = 'Draw Rectangle';
		button.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M2 2h20v20H2z" fill-opacity="0"/><path d="M3 7v10h18V7H3zm2 2h14v6H5V9z"/></svg>`;
		button.addEventListener('click', () => {
			this.isDrawing() ? this.stopDrawing() : this.startDrawing();
		});
		this._toolbarContainer.appendChild(button);
		this._toolbarButton = button;

		// ADD: Delete Shape Button
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

		// ADD: Clear All Shapes Button
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
	}
}