declare module "ffprobe-static" {
  const ffprobe: { path: string; version: string; url: string };
  export default ffprobe;
}
