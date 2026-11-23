import {
  Composition,
  Media,
  Track,
  defineComposition,
  jsx,
  seconds,
} from "@hypit/nle/authoring";

export default defineComposition((input: { opening: { path: string } }) => (
  <Composition id="main" name="Main" width={1920} height={1080}>
    <Track id="picture" name="Picture" kind="picture" role="picture">
      <Media
        id="opening"
        name="Opening Shot"
        asset={input.opening}
        at={seconds("0")}
        duration={seconds("6")}
        picture={{
          layout: { x: 0, y: 0, width: 1920, height: 1080, fit: "cover", contentX: 0.5, contentY: 0.5 },
        }}
      />
    </Track>
  </Composition>
));
