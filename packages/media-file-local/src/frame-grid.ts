import { extname } from "node:path";

import sharp from "sharp";

/** Arrange already captured evidence. Decoding and time selection belong to the caller. */
export async function writeFrameGrid(
  frames: readonly { readonly path: string; readonly annotation?: Buffer }[],
  target: string, cellWidth: number, columns: number,
  options: { readonly header?: Buffer; readonly tracks?: readonly Buffer[] } = {},
): Promise<void> {
  if (frames.length === 0) throw new Error("A frame grid needs at least one image");
  const cells: { readonly picture: Buffer; readonly height: number; readonly annotation?: Buffer; readonly annotationHeight: number }[] = [];
  for (const frame of frames) {
    const picture = await sharp(frame.path).resize({ width: cellWidth }).png().toBuffer({ resolveWithObject: true });
    const annotationHeight = frame.annotation === undefined ? 0 : (await sharp(frame.annotation).metadata()).height!;
    cells.push({ picture: picture.data, height: picture.info.height,
      ...(frame.annotation === undefined ? {} : { annotation: frame.annotation }), annotationHeight });
  }
  const width = columns * (cellWidth + 8) + 8;
  const contentWidth = width - 16;
  const header = options.header === undefined ? undefined : await sharp(options.header).metadata();
  if (header?.width !== undefined && header.width !== contentWidth) {
    throw new Error(`Grid header width ${header.width} does not match the ${contentWidth} px content width`);
  }
  const tracks = await Promise.all((options.tracks ?? []).map(async (track) => ({ bytes: track, info: await sharp(track).metadata() })));
  for (const track of tracks) if (track.info.width !== undefined && track.info.width !== contentWidth) {
    throw new Error(`Grid track width ${track.info.width} does not match the ${contentWidth} px content width`);
  }
  const rows = Math.ceil(cells.length / columns);
  const rowMetrics = Array.from({ length: rows }, (_, row) => {
    const members = cells.slice(row * columns, (row + 1) * columns);
    const pictureHeight = Math.max(...members.map((cell) => cell.height));
    const annotationHeight = Math.max(...members.map((cell) => cell.annotationHeight));
    return { pictureHeight, height: pictureHeight + annotationHeight };
  });
  const rowsTop = 8 + (header?.height === undefined ? 0 : header.height + 8);
  const rowTops = rowMetrics.map((_, row) => rowsTop + rowMetrics.slice(0, row).reduce((sum, item) => sum + item.height + 8, 0));
  const gridHeight = rowsTop + rowMetrics.reduce((sum, item) => sum + item.height + 8, 0);
  const trackTops = tracks.map((_, index) => gridHeight
    + tracks.slice(0, index).reduce((sum, track) => sum + (track.info.height ?? 0) + 8, 0));
  const height = gridHeight + tracks.reduce((sum, track) => sum + (track.info.height ?? 0) + 8, 0);
  const image = sharp({ create: {
    width,
    height,
    channels: 3, background: "#0c0c0c",
  } }).composite([
    ...(options.header === undefined ? [] : [{ input: options.header, left: 8, top: 8 }]),
    ...cells.flatMap((cell, index) => {
      const row = Math.floor(index / columns);
      const left = 8 + index % columns * (cellWidth + 8);
      const top = rowTops[row]!;
      return [{ input: cell.picture, left, top }, ...(cell.annotation === undefined ? []
        : [{ input: cell.annotation, left, top: top + rowMetrics[row]!.pictureHeight }])];
    }),
    ...tracks.map((track, index) => ({ input: track.bytes, left: 8, top: trackTops[index]! })),
  ]);
  const extension = extname(target).toLowerCase();
  if (extension === ".png") await image.png().toFile(target);
  else if (extension === ".jpg" || extension === ".jpeg") {
    await image.jpeg({ quality: 92, chromaSubsampling: "4:4:4" }).toFile(target);
  } else throw new Error("frame grid target must end in .png, .jpg or .jpeg");
}

export async function snapshotFrameAnnotation(frame: number, seconds: number, width: number): Promise<Buffer> {
  const text = await sharp({ text: { text: `<span foreground="#f5f5f5">Frame ${frame} · ${seconds.toFixed(6)} s</span>`,
    font: `sans ${Math.max(12, Math.round(width / 28))}`, width: width - 16, rgba: true,
  } }).png().toBuffer({ resolveWithObject: true });
  return sharp({ create: { width, height: text.info.height + 16, channels: 3, background: "#0c0c0c" } })
    .composite([{ input: text.data, left: 8, top: 8 }]).png().toBuffer();
}
