import { describe, expect, it } from "vitest";
import { OccupancyGrid } from "../src/occupancy";

const LABEL = 1;
const OTHER = 2;
const square = (left: number, top: number, size: number) => ({
  left,
  top,
  right: left + size,
  bottom: top + size,
});

describe("OccupancyGrid", () => {
  it("blocks a query that overlaps a painted rect and frees one that touches it on a cell edge", () => {
    const grid = new OccupancyGrid(4);
    grid.paintRect(square(0, 0, 8), 0, OTHER);

    expect(grid.isFree(square(6, 0, 8), 0, LABEL)).toBe(false);
    expect(grid.isFree(square(8, 0, 8), 0, LABEL)).toBe(true);
    expect(grid.isFree(square(0, 8, 8), 0, LABEL)).toBe(true);
  });

  it("may block a rect less than a cell away and never blocks one a cell away", () => {
    const grid = new OccupancyGrid(2);
    grid.paintRect({ left: 0, top: 0, right: 6, bottom: 10.5 }, 0, OTHER);

    expect(grid.isFree({ left: 0, top: 11.5, right: 6, bottom: 20 }, 0, LABEL)).toBe(false);
    expect(grid.isFree({ left: 0, top: 12.5, right: 6, bottom: 20 }, 0, LABEL)).toBe(true);
    expect(grid.isFree({ left: 0, top: 12.5, right: 6, bottom: 20 }, 1, LABEL)).toBe(false);
  });

  it("grows the painted rect by its padding", () => {
    const grid = new OccupancyGrid(4);
    grid.paintRect(square(0, 0, 8), 2, OTHER);

    expect(grid.isFree(square(9, 0, 4), 0, LABEL)).toBe(false);
    expect(grid.isFree(square(12, 0, 4), 0, LABEL)).toBe(true);
  });

  it("grows the query by its padding", () => {
    const grid = new OccupancyGrid(4);
    grid.paintRect(square(0, 0, 8), 0, OTHER);

    expect(grid.isFree(square(10, 0, 4), 0, LABEL)).toBe(true);
    expect(grid.isFree(square(10, 0, 4), 3, LABEL)).toBe(false);
  });

  it("blocks a query that touches any sample of a polyline, or the stretch between two", () => {
    const grid = new OccupancyGrid(4);
    grid.paintPolyline(
      [
        { x: 0, y: 0 },
        { x: 40, y: 0 },
        { x: 40, y: 40 },
      ],
      1,
      OTHER,
    );

    expect(grid.isFree(square(-2, -2, 1), 0, LABEL)).toBe(false);
    expect(grid.isFree(square(39, 39, 1), 0, LABEL)).toBe(false);
    expect(grid.isFree(square(21, 1, 1), 0, LABEL)).toBe(false);
    expect(grid.isFree(square(21, 9, 1), 0, LABEL)).toBe(true);
    expect(grid.isFree(square(20, 20, 8), 0, LABEL)).toBe(true);
  });

  it("paints a disc on the cells it reaches, not the corners of its bounding box", () => {
    const grid = new OccupancyGrid(4);
    grid.paintDisc({ x: 0, y: 0 }, 5, OTHER);

    expect(grid.isFree(square(4.5, -0.5, 1), 0, LABEL)).toBe(false);
    expect(grid.isFree(square(4.5, 4.5, 1), 0, LABEL)).toBe(true);
    expect(grid.isFree(square(8.5, -0.5, 1), 0, LABEL)).toBe(true);
  });

  it("works left of and above the origin", () => {
    const grid = new OccupancyGrid(4);
    grid.paintRect({ left: -70, top: -45, right: -10, bottom: -3 }, 0, OTHER);

    expect(grid.isFree(square(-12, -6, 2), 0, LABEL)).toBe(false);
    expect(grid.isFree(square(-8, -6, 2), 0, LABEL)).toBe(true);
    expect(grid.isFree(square(-30, 0, 2), 0, LABEL)).toBe(true);
    expect(grid.occupiedCells({ left: -12, top: -8, right: -4, bottom: 0 }, 0, LABEL)).toBe(2);
  });

  it("lets an owner ignore its own cells until another owner paints them too", () => {
    const grid = new OccupancyGrid(4);
    grid.paintDisc({ x: 0, y: 0 }, 10, LABEL);
    grid.paintRect(square(8, 8, 4), 0, OTHER);

    expect(grid.isFree(square(-8, -8, 4), 0, LABEL)).toBe(true);
    expect(grid.isFree(square(-8, -8, 4), 0, OTHER)).toBe(false);
    expect(grid.isFree(square(8, 8, 4), 0, LABEL)).toBe(false);
    expect(grid.occupiedCells(square(-12, -12, 24), 0, LABEL)).toBe(1);
    expect(grid.occupiedCells(square(-12, -12, 24), 0, OTHER)).toBe(32);

    grid.paintRect(square(-8, -8, 4), 0, OTHER);
    expect(grid.isFree(square(-8, -8, 4), 0, LABEL)).toBe(false);
    expect(grid.isFree(square(-4, -4, 4), 0, LABEL)).toBe(true);
  });
});
