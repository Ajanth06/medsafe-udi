declare module "bwip-js" {
  type BwipCanvasOptions = {
    bcid: string;
    text: string;
    scale?: number;
    parse?: boolean;
    parsefnc?: boolean;
  };

  const bwipjs: {
    toCanvas(canvas: HTMLCanvasElement, options: BwipCanvasOptions): Promise<void>;
  };

  export default bwipjs;
}
