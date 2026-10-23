// Minimal PNG reader for the build step: 8-bit, non-interlaced, any color type.
// Kept dependency-free so `npm run build` needs nothing beyond Node's zlib.
import { inflateSync } from "node:zlib";

/** @returns {{ width: number, height: number, rgb: (x: number, y: number) => [number, number, number] }} */
export function decodePng(buffer) {
	if (buffer.toString("hex", 0, 8) !== "89504e470d0a1a0a") throw new Error("Not a PNG file");
	let offset = 8, header, palette;
	const idat = [];
	while (offset < buffer.length) {
		const length = buffer.readUInt32BE(offset), type = buffer.toString("ascii", offset + 4, offset + 8);
		const data = buffer.subarray(offset + 8, offset + 8 + length);
		if (type === "IHDR") header = { width: data.readUInt32BE(0), height: data.readUInt32BE(4), depth: data[8], colorType: data[9], interlace: data[12] };
		else if (type === "PLTE") palette = data;
		else if (type === "IDAT") idat.push(data);
		offset += 12 + length;
	}
	if (!header) throw new Error("PNG has no IHDR chunk");
	const { width, height, depth, colorType, interlace } = header;
	const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[colorType];
	if (depth !== 8 || !channels || interlace) throw new Error(`Unsupported PNG: depth ${depth}, color type ${colorType}, interlace ${interlace}`);
	if (colorType === 3 && !palette) throw new Error("Indexed PNG has no PLTE chunk");
	const stride = width * channels, raw = inflateSync(Buffer.concat(idat));
	const pixels = new Uint8Array(width * height * channels);
	let previous = new Uint8Array(stride);
	for (let y = 0; y < height; y++) {
		const filter = raw[y * (stride + 1)], line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
		const current = pixels.subarray(y * stride, (y + 1) * stride);
		for (let i = 0; i < stride; i++) {
			const a = i >= channels ? current[i - channels] : 0, b = previous[i], c = i >= channels ? previous[i - channels] : 0;
			let value = line[i];
			if (filter === 1) value += a;
			else if (filter === 2) value += b;
			else if (filter === 3) value += (a + b) >> 1;
			else if (filter === 4) {
				const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
				value += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
			}
			current[i] = value & 255;
		}
		previous = current;
	}
	const rgb = (x, y) => {
		const i = (y * width + x) * channels;
		if (colorType === 3) return [palette[pixels[i] * 3], palette[pixels[i] * 3 + 1], palette[pixels[i] * 3 + 2]];
		if (channels < 3) return [pixels[i], pixels[i], pixels[i]];
		return [pixels[i], pixels[i + 1], pixels[i + 2]];
	};
	return { width, height, rgb };
}
