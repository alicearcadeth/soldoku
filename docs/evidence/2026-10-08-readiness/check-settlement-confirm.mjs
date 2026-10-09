import { readFileSync } from "node:fs";

const chain = readFileSync(new URL("../../../src/competition/chain.ts", import.meta.url), "utf8");
const settlement = readFileSync(new URL("../../../src/competition/settlement.ts", import.meta.url), "utf8");
const prepareStart = chain.indexOf("async function prepareSettlement");
const prepareEnd = chain.indexOf("async function broadcastSettlement");
const prepare = chain.slice(prepareStart, prepareEnd);
if (prepare.includes("sendRawTransaction")) {
  console.error("FAIL: prepareSettlement broadcasts before the signed transaction can be stored");
  process.exit(1);
}
const firstPersist = settlement.indexOf("await persist()");
const firstBroadcast = settlement.indexOf("broadcastSettlement(");
if (firstPersist < 0 || firstBroadcast < 0 || firstPersist > firstBroadcast) {
  console.error("FAIL: a settlement broadcast is reachable before its record is persisted");
  process.exit(1);
}
if (!settlement.includes('status === "confirmed"')) {
  console.error("FAIL: settlement can complete without a confirmed observation");
  process.exit(1);
}
console.log("PASS: settlement is stored before send and completes only after a confirmed observation");
