---
layout: home

# The headline lives in HeroMasthead.vue, which replaces the default hero info
# block; only `actions` is read from here.
hero:
  actions:
    - theme: brand
      text: Quickstart
      link: /quickstart
    - theme: alt
      text: Develop
      link: /guide/develop
---

<ClientOnly>
  <SvmlDemoCarousel />
</ClientOnly>
