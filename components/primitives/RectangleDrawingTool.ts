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
		const series = this._source.series; // Now this will be defined
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
	private _toolbarButton?: HTMLDivElement;
    private _ticker: string;

	constructor(chart: IChartApi, series: ISeriesApi<SeriesType>, toolbarContainer: HTMLDivElement, ticker: string, options: Partial<RectangleDrawingToolOptions>) {
		this._chart = chart;
		this._series = series;
		this._toolbarContainer = toolbarContainer;
        this._ticker = ticker;
		this._options = options;
		this._addToolbarButton();
		this._chart.subscribeClick(this._clickHandler);
		this._chart.subscribeCrosshairMove(this._moveHandler);
        this._loadDrawings();
	}

	private _clickHandler = (param: MouseEventParams) => this._onClick(param);
	private _moveHandler = (param: MouseEventParams) => this._onMouseMove(param);

	public destroy() {
        this.stopDrawing();
		this._chart.unsubscribeClick(this._clickHandler);
		this._chart.unsubscribeCrosshairMove(this._moveHandler);
		this._rectangles.forEach(r => this._removeRectangle(r));
		this._rectangles = [];
	}

	public startDrawing(): void {
		this._drawing = true;
		this._points = [];
		if (this._toolbarButton) this._toolbarButton.querySelector('path')?.setAttribute('fill', 'rgb(0, 120, 255)');
	}

	public stopDrawing(): void {
		this._drawing = false;
		this._points = [];
        this._removePreviewRectangle();
		if (this._toolbarButton) this._toolbarButton.querySelector('path')?.setAttribute('fill', 'currentColor');
	}

    public isDrawing(): boolean {
        return this._drawing;
    }

	private _onClick(param: MouseEventParams) {
		if (!this.isDrawing() || !param.point || !param.time) return;
		const price = this._series.coordinateToPrice(param.point.y);
		if (price === null) return;
		this._addPoint({ time: param.time, price });
	}

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

	private _addToolbarButton() {
		const button = document.createElement('div');
		button.style.width = '24px';
		button.style.height = '24px';
        button.style.cursor = 'pointer';
		button.style.color = '#d0d0d0';
		button.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M2 2h20v20H2z" fill-opacity="0"/><path d="M3 7v10h18V7H3zm2 2h14v6H5V9z"/></svg>`;
		button.addEventListener('click', () => {
			this.isDrawing() ? this.stopDrawing() : this.startDrawing();
		});
		this._toolbarContainer.appendChild(button);
		this._toolbarButton = button;
	}
}