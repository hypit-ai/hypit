import { canonicalize } from "@hypit/hypit/protocol";
import type { Value } from "@hypit/hypit/protocol";
import type { ProducerPackage } from "@hypit/hypit/producer";
import type { RefinementPackage } from "@hypit/hypit/refinement";

import { titleCardProducers, titleCardTypes } from "./manifest.js";
import { titleCardHtmlSource } from "./picture.js";
import { assertTitleCardSpec, titleCardProgramSource } from "./source.js";
import type { TitleCardSpec } from "./source.js";

function valueOf<T>(value: Value | undefined, label: string): T {
  if (value === undefined) throw new Error(`${label} is missing.`);
  return value as unknown as T;
}

export const titleCardComponent = {
  producers: [{
    producer: titleCardProducers.source,
    handler: ({ inputs }) => ({
      kind: "output",
      value: canonicalize(titleCardProgramSource(
        valueOf<TitleCardSpec>(inputs.spec?.value, "TitleCardSpec"),
      )),
    }),
  }, {
    producer: titleCardProducers.htmlSource,
    handler: ({ inputs }) => ({
      kind: "output",
      value: canonicalize(titleCardHtmlSource(
        valueOf<TitleCardSpec>(inputs.spec?.value, "TitleCardSpec"),
      )),
    }),
  }],
  refinements: [{
    type: titleCardTypes.spec,
    handler: ({ value }) => assertTitleCardSpec(valueOf<TitleCardSpec>(value, "TitleCardSpec")),
  }],
} satisfies { producers: ProducerPackage; refinements: RefinementPackage };
