import { IChartApi, ISeriesApi, SeriesType } from 'lightweight-charts';

export abstract class PluginBase {
    _chart: IChartApi;
    _series: ISeriesApi<SeriesType>;
    private _requestUpdate: () => void = () => {};

    public attached({ chart, series, requestUpdate }: { chart: IChartApi, series: ISeriesApi<SeriesType>, requestUpdate: () => void }) {
        this._chart = chart;
        this._series = series;
        this._requestUpdate = requestUpdate;
    }

    public detached() {}

    protected requestUpdate() {
        this._requestUpdate();
    }

    get chart(): IChartApi {
        return this._chart;
    }

    get series(): ISeriesApi<SeriesType> {
        return this._series;
    }
}