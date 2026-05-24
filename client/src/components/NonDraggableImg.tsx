import { ImgHTMLAttributes } from "preact";

export const NonDraggableImg = (props: ImgHTMLAttributes<HTMLImageElement>) => (
  <img {...props} draggable={false} />
);