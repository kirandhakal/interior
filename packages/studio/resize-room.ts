import {
  OPENING_EDGE_CLEARANCE, OPENING_GAP, WALLS, clamp, dimensionError, fitCeilingDecor, fitFurniture, fitLight, fitOpening,
  furnitureFitsRoom, isWallMount, openingFits, openingsShareHeight, pointAlongWall, roomPlan, wallOffset, wallSpan, wallThickness,
  type Dimensions, type Opening, type Room,
} from './model';

export function resizeRoom(room: Room, name: string, dimensions: Dimensions): Room | undefined {
  if (dimensionError(dimensions)) return;
  const sameInterior = dimensions.height === room.dimensions.height &&
    WALLS.every(wall => wallSpan(dimensions, wall) === wallSpan(room.dimensions, wall));
  if (sameInterior) {
    const sameThickness = WALLS.every(wall => wallThickness(dimensions, wall) === wallThickness(room.dimensions, wall));
    if (sameThickness) return name === room.name ? room : { ...room, name };
    return { ...room, name, dimensions };
  }

  const updated = { ...room, name, dimensions };
  if (!updated.openings.every(opening => openingFits(updated, opening))) {
    const openings = refitOpenings(updated);
    if (!openings) return;
    updated.openings = openings;
  }
  const furniture = room.furniture.map(item => fitFurniture(dimensions, item));
  if (furniture.some(item => !furnitureFitsRoom(dimensions, item))) return;
  const lights = room.lights.map(light => {
    const { mount } = light;
    if (!isWallMount(mount)) return fitLight(dimensions, light);
    const previous = roomPlan(room.dimensions).walls[mount];
    const next = roomPlan(dimensions).walls[mount];
    return fitLight(dimensions, { ...light, ...pointAlongWall(next, wallOffset(previous, light)) });
  });
  return { ...updated, furniture, lights,
    ceilingDecor: room.ceilingDecor?.map(item => fitCeilingDecor(dimensions, item)) };
}

function refitOpenings(room: Room) {
  const originalOffsets = new Map(room.openings.map(opening => [opening.id, opening.offset]));
  const fitted = room.openings.map(opening => fitOpening(room.dimensions, opening));
  if (fitted.some((opening, index) => opening.width !== room.openings[index].width || opening.height !== room.openings[index].height)) return;
  const updated = { ...room, openings: fitted };
  if (fitted.every(opening => openingFits(updated, opening))) return fitted;

  for (const wall of WALLS) {
    const openings = fitted.filter(opening => opening.wall === wall).sort((a, b) => originalOffsets.get(a.id)! - originalOffsets.get(b.id)!);
    const edge = wallSpan(room.dimensions, wall) / 2 - OPENING_EDGE_CLEARANCE;
    const gap = (a: Opening, b: Opening) => (a.width + b.width) / 2 + OPENING_GAP;
    const latest = openings.map(opening => edge - opening.width / 2);

    // Reserve space from the right before moving openings as little as possible from the left.
    for (let i = openings.length - 1; i >= 0; i--) {
      for (let j = i + 1; j < openings.length; j++) {
        if (openingsShareHeight(openings[i], openings[j])) latest[i] = Math.min(latest[i], latest[j] - gap(openings[i], openings[j]));
      }
    }
    for (const [i, opening] of openings.entries()) {
      let earliest = -edge + opening.width / 2;
      for (let j = 0; j < i; j++) {
        if (openingsShareHeight(opening, openings[j])) earliest = Math.max(earliest, openings[j].offset + gap(opening, openings[j]));
      }
      if (earliest > latest[i] + 1e-10) return;
      opening.offset = clamp(opening.offset, earliest, latest[i]);
    }
  }
  return fitted.every(opening => openingFits(updated, opening)) ? fitted : undefined;
}
