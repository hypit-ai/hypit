# Ranking debate components

Project-owned visual behavior for the ranking debate example.

- `ranking-board` owns persistent tier rows and locally timed entry reveals.
- `verdict-burst` owns the final verdict's fixed visual treatment and entrance.

Both consume direct NLE Item parameters. They have no Script, transcript, semantic-anchor, Provider,
Build or media-origin dependency.
