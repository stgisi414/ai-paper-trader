// components/helpers/dimensions/positions.ts
import { Coordinate } from 'lightweight-charts';

export function positionsBox(
	p1: Coordinate,
	p2: Coordinate,
	pixelRatio: number
): { position: number; length: number } {
	const min = Math.min(p1, p2);
	const max = Math.max(p1, p2);
	const size = Math.round((max - min) * pixelRatio);
	return { position: Math.round(min * pixelRatio), length: size };
}