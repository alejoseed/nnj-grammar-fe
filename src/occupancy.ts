export interface Point {
  x: number;
  y: number;
}

export interface Rect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

const SHARED = -1;
const ROW_STRIDE = 2 ** 21;

export class OccupancyGrid {
  readonly #cellPx: number;
  readonly #cells = new Map<number, number>();

  constructor(cellPx: number) {
    this.#cellPx = cellPx;
  }

  paintRect(rect: Rect, padding: number, owner: number): void {
    for (const key of this.#cellsUnder(rect, padding)) {
      this.#paint(key, owner);
    }
  }

  paintDisc(center: Point, radius: number, owner: number): void {
    const size = this.#cellPx;
    const lastColumn = Math.floor((center.x + radius) / size);
    const lastRow = Math.floor((center.y + radius) / size);
    for (let column = Math.floor((center.x - radius) / size); column <= lastColumn; column += 1) {
      const nearestX = Math.min(Math.max(center.x, column * size), (column + 1) * size);
      for (let row = Math.floor((center.y - radius) / size); row <= lastRow; row += 1) {
        const nearestY = Math.min(Math.max(center.y, row * size), (row + 1) * size);
        if (Math.hypot(nearestX - center.x, nearestY - center.y) < radius) {
          this.#paint(cellKey(column, row), owner);
        }
      }
    }
  }

  /** Paints a disc every half cell along each segment, so sparse samples still leave no gap. */
  paintPolyline(points: readonly Point[], radius: number, owner: number): void {
    points.forEach((point, index) => {
      const previous = points[index - 1] ?? point;
      const steps = Math.max(
        1,
        Math.ceil(Math.hypot(point.x - previous.x, point.y - previous.y) / (this.#cellPx / 2)),
      );
      for (let step = 1; step <= steps; step += 1) {
        const along = step / steps;
        this.paintDisc(
          {
            x: previous.x + (point.x - previous.x) * along,
            y: previous.y + (point.y - previous.y) * along,
          },
          radius,
          owner,
        );
      }
    });
  }

  isFree(rect: Rect, padding: number, owner: number): boolean {
    for (const key of this.#cellsUnder(rect, padding)) {
      if (this.#blocks(key, owner)) {
        return false;
      }
    }
    return true;
  }

  occupiedCells(rect: Rect, padding: number, owner: number): number {
    let count = 0;
    for (const key of this.#cellsUnder(rect, padding)) {
      if (this.#blocks(key, owner)) {
        count += 1;
      }
    }
    return count;
  }

  #blocks(key: number, owner: number): boolean {
    const painter = this.#cells.get(key);
    return painter !== undefined && painter !== owner;
  }

  #paint(key: number, owner: number): void {
    const painter = this.#cells.get(key);
    this.#cells.set(key, painter === undefined || painter === owner ? owner : SHARED);
  }

  /** A rect covers [left, right) by [top, bottom). */
  *#cellsUnder(rect: Rect, padding: number): Generator<number> {
    const size = this.#cellPx;
    const firstColumn = Math.floor((rect.left - padding) / size);
    const lastColumn = Math.ceil((rect.right + padding) / size) - 1;
    const firstRow = Math.floor((rect.top - padding) / size);
    const lastRow = Math.ceil((rect.bottom + padding) / size) - 1;
    for (let column = firstColumn; column <= lastColumn; column += 1) {
      for (let row = firstRow; row <= lastRow; row += 1) {
        yield cellKey(column, row);
      }
    }
  }
}

function cellKey(column: number, row: number): number {
  return column * ROW_STRIDE + row;
}
