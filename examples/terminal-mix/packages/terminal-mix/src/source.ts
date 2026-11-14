import { assertProgramSource, pictureType } from "@hypit/audiovisual";
import type { ProgramSource } from "@hypit/audiovisual";
import { sealLocalSpatialDomain } from "@hypit/spatial/algebra";
import { sealLocalTemporalDomain } from "@hypit/temporal/algebra";
import type { ExactTemporalValue } from "@hypit/temporal/algebra";

export function terminalMixPictureSource(
  id: string,
  duration: ExactTemporalValue,
  width: number,
  height: number,
): ProgramSource {
  const value: ProgramSource = {
    id,
    outputs: {
      picture: {
        kind: "signal",
        type: pictureType,
        domain: sealLocalTemporalDomain({ id: `${id}:time`, duration }),
        spatialDomain: sealLocalSpatialDomain({
          id: `${id}:space`,
          region: { x: 0, y: 0, width, height },
        }),
      },
    },
  };
  assertProgramSource(value);
  return value;
}
