import fs from "node:fs";

export default {
  abiVersion: "1",
  project() {
    fs.readFileSync("/etc/passwd");
    return { outputs: {} };
  },
};
