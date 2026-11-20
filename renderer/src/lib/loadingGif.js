// The loading animation tiles play while their preview or media loads
// (public/tilesimg/Loading preview 1.gif ... 13.gif). Each loading element picks one of
// the variants at random when it mounts; TilePolish.css maps the
// data-loading-gif value to the file.
export const LOADING_GIF_COUNT = 13;

export function pickLoadingGif() {
  return 1 + Math.floor(Math.random() * LOADING_GIF_COUNT);
}
