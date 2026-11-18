import type { NleCanvas, NlePictureFrame } from "@hypit/nle";
import { AlignCenterHorizontal, AlignCenterVertical, AlignEndHorizontal, AlignEndVertical, AlignStartHorizontal, AlignStartVertical } from "lucide-react";
import { IconButton } from "./common.js";
import { Row, Section } from "./controls.js";

export function PictureAlignment({ canvas, frame, disabled, onTranslate }: {
  readonly canvas: NleCanvas;
  readonly frame: NlePictureFrame;
  readonly disabled: boolean;
  readonly onTranslate: (x: number, y: number) => void;
}) {
  const horizontal = [
    { label: "左对齐", Icon: AlignStartVertical, x: 0 },
    { label: "水平居中", Icon: AlignCenterVertical, x: (canvas.width - frame.width) / 2 },
    { label: "右对齐", Icon: AlignEndVertical, x: canvas.width - frame.width },
  ];
  const vertical = [
    { label: "顶部对齐", Icon: AlignStartHorizontal, y: 0 },
    { label: "垂直居中", Icon: AlignCenterHorizontal, y: (canvas.height - frame.height) / 2 },
    { label: "底部对齐", Icon: AlignEndHorizontal, y: canvas.height - frame.height },
  ];
  return <Section title="画面对齐">
    <Row label="水平"><div className="nle-button-bar">{horizontal.map(({ label, Icon, x }) =>
      <IconButton key={label} label={label} disabled={disabled || x === frame.x} onClick={() => onTranslate(x - frame.x, 0)}>
        <Icon size={16}/>
      </IconButton>)}</div></Row>
    <Row label="垂直"><div className="nle-button-bar">{vertical.map(({ label, Icon, y }) =>
      <IconButton key={label} label={label} disabled={disabled || y === frame.y} onClick={() => onTranslate(0, y - frame.y)}>
        <Icon size={16}/>
      </IconButton>)}</div></Row>
  </Section>;
}
