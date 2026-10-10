import { verifyDshInstallation } from "../src/lib/hermit/dsh-installation";
verifyDshInstallation().then(runtime => console.log(JSON.stringify({ ready: true, bundled: runtime.bundled, root: runtime.root }))).catch(error => { console.error(error.message); process.exitCode = 1; });
