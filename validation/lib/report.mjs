// Shared plumbing for instance graders. A grader collects named checks and prints one JSON
// document, so the runner can record a verdict without parsing prose.
//
//   fail_to_pass  the defect itself. Must FAIL on the as-shipped repository and PASS after a fix.
//   pass_to_pass  behaviour that must survive the fix. Must PASS on both, catching a repair that
//                 removes the feature instead of correcting it.

export function grader(instance) {
  const checks = [];
  const add = (kind) => (name, passed, detail) => { checks.push({ name, kind, passed: !!passed, detail }); };
  return {
    failToPass: add("fail_to_pass"),
    passToPass: add("pass_to_pass"),
    guard(name, kind, body) {
      try { body(); }
      catch (error) { checks.push({ name, kind, passed: false, detail: `threw: ${error instanceof Error ? error.message : String(error)}` }); }
    },
    finish() {
      const passed = checks.length > 0 && checks.every(check => check.passed);
      process.stdout.write(`${JSON.stringify({ instance, passed, checks }, null, 2)}\n`);
      process.exit(passed ? 0 : 1);
    },
    fatal(message) {
      process.stdout.write(`${JSON.stringify({ instance, passed: false, error: message, checks }, null, 2)}\n`);
      process.exit(1);
    },
  };
}
