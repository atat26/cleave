// A tool call that was cut off (it was longer than a call may be, or the reply reached its length
// limit while the call was being written) has arguments that are not whole, so it must never run.
// The model is told plainly what happened and what to do, because without that it sent the same long
// document again and was refused again (the "request was not usable" of issue #142).
// Pure code, so it is tested.
import type { Plan } from './agentActions.ts';
import { DOCUMENT_CHARS_PER_CALL, isArtifactTool } from './artifactTools.ts';
import type { ToolCall } from './openrouter.ts';

export function cutOffPlan(call: ToolCall): Plan {
  const forDocuments = isArtifactTool(call.name)
    ? ` For a long document: make it with the first part now (end it with a line that says "(more to come)"), then add each next part with edit_artifact (find that line, and replace it with the next part followed by the same line again; the last part has no such line). One call may hold about ${DOCUMENT_CHARS_PER_CALL.toLocaleString('en-US')} characters of text.`
    : '';
  return {
    kind: 'refuse',
    label: `Couldn't run ${call.name} (too long)`,
    note: 'The call was too long and was cut off, so nothing was done.',
    result: `This call was cut off before it ended (it was longer than one call may be), so nothing was done. Do not send it again as it was.${forDocuments} Tell the user if you leave anything out.`,
  };
}
