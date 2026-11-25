import sharp from "sharp";
const { dropBgSpecks } = await import("../../../../src/lib/pixel/frames");
const { data, info } = await sharp(process.argv[2]).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
console.log("지운 칸", dropBgSpecks(data, info.width, info.height));
