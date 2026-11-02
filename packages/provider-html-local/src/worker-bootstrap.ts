import { installOwningDistributionPackageResolution } from "@hypit/hypit/loader/node/distribution-resolution";

const pending: Parameters<NodeJS.MessageListener>[] = [];
const queue: NodeJS.MessageListener = (...message) => { pending.push(message); };
process.on("message", queue);
installOwningDistributionPackageResolution();
await import("./capture-worker.js");
process.off("message", queue);
for (const message of pending) process.emit("message", ...message);
