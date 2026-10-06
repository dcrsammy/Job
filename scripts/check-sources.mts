import { CONNECTORS } from "../src/lib/jobs/connectors";
import { normalizeJob } from "../src/lib/jobs/normalize";
const runs: [string, string, Record<string, unknown>, boolean][] = [
  ["greenhouse","GitLab",{board:"gitlab"},true],["lever","Spotify",{company:"spotify"},true],["ashby","Linear",{board:"linear"},true],
  ["remoteok","Remote OK",{},false],["arbeitnow","Arbeitnow",{maxPages:1},false]];
for (const [kind,name,config,off] of runs) {
  const t=Date.now();
  const raw = await CONNECTORS[kind as "lever"].fetchJobs({config,name});
  const norm = raw.map(r=>normalizeJob(r,{sourceIsOfficial:off}));
  const st = (k:string)=>norm.filter(n=>n.verificationStatus===k).length;
  console.log(`\n== ${kind} ${name}: ${raw.length} jobs in ${Date.now()-t}ms; official=${st("official")} third=${st("third_party")} flagged=${st("flagged")}; remote=${norm.filter(n=>n.remoteType==="remote").length}`);
  for (const n of norm.slice(0,3)) {
    console.log(`- ${n.title} | ${n.employerName} | ${n.locationRaw} -> ${n.remoteType} regions=${n.remoteRegions} countries=${n.countries} sen=${n.seniority} sal=${n.salaryMin}-${n.salaryMax}${n.salaryCurrency??""} flags=${n.verificationFlags}`);
    console.log("   reqs:", n.requirements.map(r=>`${r.kind}:${r.normalized}${r.importance==="required"?"*":""}`).join(" "));
  }
}
